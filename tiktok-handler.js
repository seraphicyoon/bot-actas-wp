'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile), MAX=15*1024*1024;
const SITES=[
 {name:'TikTok',extractors:'TikTok,vm.tiktok',patterns:[/^https:\/\/(?:www\.|m\.)?tiktok\.com\/(?:@[\w.-]+\/video\/\d+|t\/[\w-]+)\/?$/i,/^https:\/\/(?:vm|vt)\.tiktok\.com\/[\w-]+\/?$/i]},
 {name:'Instagram',extractors:'Instagram',patterns:[/^https:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/[\w-]+\/?$/i]},
 {name:'YouTube',extractors:'youtube',patterns:[/^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?v=[\w-]{11}$/i,/^https:\/\/(?:www\.|m\.)?youtube\.com\/(?:shorts|live)\/[\w-]{11}\/?$/i,/^https:\/\/youtu\.be\/[\w-]{11}\/?$/i]},
 {name:'Facebook',extractors:'facebook,facebook:reel,FacebookRedirectURL',patterns:[/^https:\/\/(?:www\.|m\.|web\.)?facebook\.com\/(?:reel\/\d+|[\w.-]+\/videos\/\d+|share\/[vr]\/[\w-]+)\/?$/i,/^https:\/\/(?:www\.|m\.|web\.)?facebook\.com\/watch\/?\?v=\d+$/i,/^https:\/\/fb\.watch\/[\w-]+\/?$/i]},
 {name:'X',extractors:'twitter',patterns:[/^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(?:[\w]+\/status\/\d+|i\/web\/status\/\d+)\/?$/i]},
 {name:'Pinterest',extractors:'Pinterest',patterns:[/^https:\/\/(?:www\.)?pinterest\.com\/pin\/\d+\/?$/i]},
 {name:'Reddit',extractors:'Reddit',patterns:[/^https:\/\/(?:www\.|old\.)?reddit\.com\/r\/[\w]+\/comments\/[\w]+(?:\/[\w%-]+)?\/?$/i]},
 {name:'Vimeo',extractors:'vimeo',patterns:[/^https:\/\/(?:www\.)?vimeo\.com\/\d+\/?$/i]}
];
function identify(text){
 for(const match of text.matchAll(/https:\/\/[^\s<>"']+/gi)){
  const raw=match[0].replace(/[),.!;]+$/,'').split('#')[0];
  let url=raw.split('?')[0];
  // Retain only the public video ID for watch URLs; discard playlist/tracking parameters.
  if(/^https:\/\/(?:www\.|m\.)?youtube\.com\/watch$/i.test(url)||/^https:\/\/(?:www\.|m\.|web\.)?facebook\.com\/watch\/?$/i.test(url)){
   const v=raw.match(/[?&]v=([\w-]+)(?:&|$)/)?.[1];if(!v)continue;url+='?v='+v;
  }
  const site=SITES.find(s=>s.patterns.some(p=>p.test(url)));
  if(site)return {url,name:site.name,extractors:site.extractors};
 }
 return null;
}
function extractLink(text){return identify(text)?.url||null;}
function downloadArgs(url,out){
 const site=identify(url);
 if(!site||site.url!==url)throw Error('URL inválida');
 const format=site.name==='TikTok'?'best[ext=mp4][format_note!*=watermarked]/best[ext=mp4]':'b[ext=mp4][height<=?720]/bv[ext=mp4][height<=?720][vcodec^=avc]+ba[ext=m4a]/bv[ext=mp4][height<=?720]+ba[ext=m4a]';
 return ['--ignore-config','--no-cache-dir','--no-playlist','--playlist-items','1','--use-extractors',site.extractors,'--socket-timeout','10','--retries','1','--extractor-retries','1','--max-filesize','15M','--match-filters','!is_live & duration <= 90','-f',format,'--merge-output-format','mp4','--no-progress','-o',out,'--',url];
}
async function download(url){
 if(extractLink(url)!==url)throw Error('URL inválida');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'naevis-video-'));
 try{
  const out=path.join(dir,'video.mp4');
  await run(process.env.NAEVIS_YTDLP||'yt-dlp',downloadArgs(url,out),{timeout:65000,maxBuffer:128*1024,windowsHide:true});
  const stat=await fs.stat(out);
  if(!stat.isFile()||!stat.size||stat.size>MAX)throw Error('Tamaño inválido');
  return await fs.readFile(out);
 }finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
}

const {canonical}=require('./message-utils');
function createTikTokHandler({store,owners,loadConfig,allowed,paused,isHelper,fetchVideo=download,now=Date.now}){
 const db=store.db;
 db.exec('CREATE TABLE IF NOT EXISTS naevis_tiktok(group_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0)');
 const enabled=id=>db.prepare('SELECT enabled FROM naevis_tiktok WHERE group_id=?').get(id)?.enabled===1;
 function eligible(id){const c=loadConfig(),s=store.shop(id);return id?.endsWith('@g.us')&&(!s||s.id===id)&&(s?.id===id||c.gruposAutorizados?.includes(id))&&allowed(id);}
 const active=id=>!paused()&&eligible(id)&&enabled(id);
 let busy=false,last=-Infinity;
 async function handle(sock,msg){
  const id=msg.key.remoteJid,m=msg.message;
  if(!id||msg.key.fromMe)return false;
  const text=(m?.conversation||m?.extendedTextMessage?.text||'').trim();
  const group=id.endsWith('@g.us'),sender=canonical(msg.key.participant||id),owner=owners.includes(sender);
  const cmd=text.match(/^\.(?:videos|tiktok)(?:\s+(on|off))?$/i)||(/^\.(?:ayudavideos|ayudatiktok)$/i.test(text)?['']:null);
  const url=!/^[./-]/.test(text)?extractLink(text):null;
  if(!cmd&&!url)return false;
  if(!group){if(cmd&&owner){await sock.sendMessage(id,{text:'Configura .videos on/off dentro del grupo de ventas autorizado.'},{quoted:msg});return true;}return false;}
  if(!eligible(id)||paused())return false;
  const reply=text=>sock.sendMessage(id,{text},{quoted:msg});
  if(cmd){
   const action=cmd[1]?.toLowerCase();
   if(!action){await reply('🌸 *NAEVIS • DESCARGAS DE VIDEO*\n\n*Estado:* '+(enabled(id)?'ACTIVADO':'DESACTIVADO')+'\n\nEnvía un enlace de un video propio o autorizado de TikTok, Instagram, YouTube/Shorts, Facebook, X, Pinterest, Reddit o Vimeo. Si está disponible, recibirás el MP4. Algunas plataformas restringen descargas; en TikTok se prefiere la versión sin marca.\n\nMáximo 90 segundos y 15 MB.\n\nAdministradores: .videos on / .videos off');return true;}
   let permitted=owner||sender===canonical(store.shop(id)?.owner||loadConfig().propietariosGrupos?.[id])&&!!sender;
   if(!permitted&&!isHelper(id,sender)){
    try{const p=(await sock.groupMetadata(id)).participants.find(p=>[p.id,p.phoneNumber,p.lid].some(x=>!!sender&&canonical(x)===sender));permitted=['admin','superadmin'].includes(p?.admin);}catch{}
   }
   if(!permitted){await reply('Solo el dueño o administrador puede cambiar esta función.');return true;}
   if(!eligible(id)||paused())return true;
   db.prepare('INSERT INTO naevis_tiktok(group_id,enabled) VALUES(?,?) ON CONFLICT(group_id) DO UPDATE SET enabled=excluded.enabled').run(id,action==='on'?1:0);
   await reply(action==='on'?'✅ Descargas de videos activadas. Escribe .ayudavideos.':'🔇 Descargas de videos desactivadas.');return true;
  }
  if(!active(id))return false;
  if(busy||now()-last<15000){await reply('⏳ Hay una descarga en curso o reciente. Intenta nuevamente en unos segundos.');return true;}
  busy=true;last=now();
  // Never await network downloads in the shared orders queue.
  void (async()=>{
   try{
    const video=await fetchVideo(url);
    if(!Buffer.isBuffer(video)||!video.length||video.length>MAX)throw Error('Tamaño inválido');
    if(active(id))await sock.sendMessage(id,{video,mimetype:'video/mp4',caption:'🌸 Naevis Downloader • '+identify(url).name},{quoted:msg});
   }catch(e){
    console.error('[VIDEOS]',e.code||e.name);
    if(active(id))await reply('⚠️ No pude descargar este video. Puede estar restringido, superar los límites o no estar disponible. Intenta con otro enlace.');
   }finally{busy=false;}
  })().catch(e=>console.error('[VIDEOS]',e.code||e.name));
  return true;
 }
 return {handle};
}
module.exports={createTikTokHandler,extractLink,identify,downloadArgs,download};
