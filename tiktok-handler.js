'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile), MAX=50*1024*1024, TIME_LIMIT=120000;
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
function downloadArgs(url,out,shortSide=null){
 const site=identify(url);
 if(!site||site.url!==url)throw Error('URL inválida');
 const size='[filesize<=?50M][filesize_approx<=?50M]';
 const videoSize='[filesize<=?40M][filesize_approx<=?40M]';
 const audio='[filesize<=?10M][filesize_approx<=?10M]';
 // First try any dimensions. Fallbacks accept either orientation by bounding the shorter side.
 const dims=shortSide===null?['']:['[height<='+shortSide+']','[width<='+shortSide+']'];
 const choices=(kind,filters)=>dims.map(d=>kind+'[ext=mp4]'+d+filters).join('/');
 const best=choices('b',size),split=choices('bv',videoSize);
 const pair='('+split+')+(ba[ext=m4a]'+audio+'/ba[ext=mp4]'+audio+')';
 const clean='[format_note!*=watermarked]';
 const format=(site.name==='TikTok'?choices('b',size+clean)+'/'+choices('b',size+clean.replace('!*=','!*=?'))+'/':'')+best+'/'+pair;
 return ['--ignore-config','--no-cache-dir','--no-playlist','--playlist-items','1','--use-extractors',site.extractors,'--socket-timeout','10','--retries','1','--extractor-retries','1','--max-filesize','50M','--match-filters','!is_live','-f',format,'-S','vcodec:h264,res','--merge-output-format','mp4','--no-progress','-o',out,'--',url];
}
function validateProbe(stdout){
 const info=JSON.parse(stdout),duration=Number(info.format?.duration);
 if(!Number.isFinite(duration)||duration<=0||!info.streams?.some(s=>s.codec_type==='video'))throw Object.assign(Error('Archivo de video inválido.'),{code:'VIDEO_FORMAT'});
}
async function download(url){
 if(extractLink(url)!==url)throw Error('URL inválida');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'naevis-video-'));
 const deadline=Date.now()+TIME_LIMIT;
 const opts=()=>{const remaining=deadline-Date.now();if(remaining<=0)throw Object.assign(Error('Tiempo de descarga agotado.'),{code:'VIDEO_TIMEOUT'});return {timeout:remaining,maxBuffer:128*1024,windowsHide:true};};
 try{
  let lastError;
  for(const height of [null,1080,720,480,360,240,144]){
   const folder=path.join(dir,String(height));await fs.mkdir(folder);
   const out=path.join(folder,'video.mp4');
   try{
    await run(process.env.NAEVIS_YTDLP||'yt-dlp',downloadArgs(url,out,height),opts());
    const stat=await fs.stat(out).catch(e=>{if(e.code==='ENOENT')throw Object.assign(Error('No se obtuvo archivo dentro del límite.'),{code:'VIDEO_NO_FILE'});throw e;});
    if(!stat.isFile()||!stat.size||stat.size>MAX)throw Object.assign(Error('El archivo supera 50 MB o está vacío.'),{code:'VIDEO_SIZE'});
    const probe=await run(process.env.NAEVIS_FFPROBE||'ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',out],opts());
    validateProbe(probe.stdout);
    return await fs.readFile(out);
   }catch(e){
    lastError=e;
    if(e.killed||Date.now()>=deadline)throw Object.assign(Error('Tiempo de descarga agotado.'),{code:'VIDEO_TIMEOUT'});
    if(!['VIDEO_NO_FILE','VIDEO_SIZE','VIDEO_FORMAT'].includes(e.code)&&!/requested format is not available|maximum file size|max.filesize/i.test(e.stderr||''))throw e;
   }finally{await fs.rm(folder,{recursive:true,force:true}).catch(()=>{});}
  }
  throw Object.assign(Error('No se obtuvo un MP4 compatible dentro de los límites.'),{code:lastError?.code==='VIDEO_SIZE'?'VIDEO_SIZE':'VIDEO_NO_FORMAT',cause:lastError});
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
   if(!action){await reply('🌸 *NAEVIS • DESCARGAS DE VIDEO*\n\n*Estado:* '+(enabled(id)?'ACTIVADO':'DESACTIVADO')+'\n\nEnvía un enlace de un video propio o autorizado de TikTok, Instagram, YouTube/Shorts, Facebook, X, Pinterest, Reddit o Vimeo. Si está disponible, recibirás el MP4. Algunas plataformas restringen descargas; en TikTok se prefiere la versión sin marca.\n\nSin límite fijo de duración. Máximo 50 MB; descarga y preparación hasta 120 segundos. Calidad automática según disponibilidad y tamaño.\n\nAdministradores: .videos on / .videos off');return true;}
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
    if(active(id))await reply(e.code==='VIDEO_SIZE'?'⚠️ No encontré una calidad disponible de hasta 50 MB.':e.code==='VIDEO_TIMEOUT'?'⚠️ La descarga tardó más de 120 segundos. Intenta con otro video.':e.code==='VIDEO_NO_FORMAT'?'⚠️ No pude obtener un formato de video compatible. Intenta con otro enlace.':'⚠️ No pude descargar este video. Puede estar restringido o no estar disponible. Intenta con otro enlace.');
   }finally{busy=false;}
  })().catch(e=>console.error('[VIDEOS]',e.code||e.name));
  return true;
 }
 return {handle};
}
module.exports={createTikTokHandler,extractLink,identify,downloadArgs,validateProbe,download};
