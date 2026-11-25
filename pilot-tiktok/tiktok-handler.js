'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile), MAX=15*1024*1024;
function extractLink(text){
 for(const match of text.matchAll(/https:\/\/[^\s<>"']+/gi)){
  const raw=match[0].replace(/[),.!;]+$/,'').split(/[?#]/)[0];
  if(/^https:\/\/(?:www\.|m\.)?tiktok\.com\/(?:@[\w.-]+\/video\/\d+|t\/[\w-]+)\/?$/i.test(raw)||/^https:\/\/(?:vm|vt)\.tiktok\.com\/[\w-]+\/?$/i.test(raw))return raw;
 }
 return null;
}
async function download(url){
 if(extractLink(url)!==url)throw Error('URL inválida');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'naevis-tiktok-'));
 try{
  const out=path.join(dir,'video.mp4');
  await run(process.env.NAEVIS_YTDLP||'yt-dlp',['--ignore-config','--no-cache-dir','--no-playlist','--use-extractors','TikTok,vm.tiktok','--socket-timeout','10','--retries','1','--extractor-retries','1','--max-filesize','15M','--match-filters','duration <= 90','-f','best[ext=mp4][format_note!*=watermarked]/best[ext=mp4]','--no-progress','-o',out,'--',url],{timeout:65000,maxBuffer:128*1024,windowsHide:true});
  const stat=await fs.stat(out);
  if(!stat.isFile()||!stat.size||stat.size>MAX)throw Error('Tamaño inválido');
  return await fs.readFile(out);
 }finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
}
function createPilot({pin,fetchVideo=download,now=Date.now}){
 let chat=null,owner=null,enabled=false,busy=false,last=-Infinity;
 return async function handle(sock,msg){
  const jid=msg.key?.remoteJid;
  if(!jid||msg.key.fromMe||!(/@(g\.us|s\.whatsapp\.net|lid)$/.test(jid)))return false;
  const m=msg.message?.ephemeralMessage?.message||msg.message;
  const text=(m?.conversation||m?.extendedTextMessage?.text||'').trim();
  const sender=msg.key.participant||jid;
  const reply=t=>sock.sendMessage(jid,{text:t},{quoted:msg});
  if(!chat&&text==='.tiktok on '+pin){chat=jid;owner=sender;enabled=true;await reply('🌸 Naevis TikTok • PRUEBAS\nActivado solo en este chat. Envía un enlace de un video propio o autorizado.');return true;}
  if(jid!==chat)return false;
  if(text==='.tiktok'||text==='.ayudatiktok'){await reply('🌸 NAEVIS • TIKTOK\nEstado: '+(enabled?'ACTIVADO':'DESACTIVADO')+'\nPega un enlace de TikTok. Máximo 90 segundos y 15 MB. Se prefiere una versión sin marca si está disponible.\n.tiktok off / .tiktok on — solo quien activó la prueba.');return true;}
  if(text==='.tiktok on'||text==='.tiktok off'){if(sender!==owner){await reply('Solo quien activó la prueba puede cambiarla.');return true;}enabled=text.endsWith('on');await reply(enabled?'Activado':'Desactivado');return true;}
  const url=extractLink(text);
  if(!enabled||!url)return false;
  if(busy||now()-last<15000){await reply('Hay una descarga en curso o reciente. Intenta en unos segundos.');return true;}
  busy=true;last=now();
  try{
   const video=await fetchVideo(url);
   if(!Buffer.isBuffer(video)||!video.length||video.length>MAX)throw Error('Tamaño inválido');
   if(enabled)await sock.sendMessage(jid,{video,mimetype:'video/mp4',caption:'🌸 Naevis Downloader • TikTok\nVersión disponible del video.'},{quoted:msg});
  }catch(e){console.error('[TIKTOK]',e.code||e.name);if(enabled)await reply('No pude descargar ese video. Puede estar restringido, superar los límites o TikTok no permite obtenerlo ahora.');}
  finally{busy=false;}
  return true;
 };
}
module.exports={extractLink,download,createPilot};
