'use strict';
// Sound stickers, independent from business handlers. No changes to installed dependencies.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { canonical } = require('./message-utils');
const run = promisify(execFile);
const LIMIT = 1_000_000;
const INPUT_LIMIT = 16 * 1024 * 1024;
const CLIP = 8;
function supportedVersion(version) { return ['6.7.7','6.7.24'].includes(version); }

function chunk(tag, data) {
  const h = Buffer.alloc(8);
  h.write(tag, 0, 4, 'ascii');
  h.writeUInt32LE(data.length, 4);
  return Buffer.concat([h, data, Buffer.alloc(data.length % 2)]);
}
function addSoundExif(webp, audio, side) {
  if (webp.toString('ascii',0,4)!=='RIFF' || webp.toString('ascii',8,12)!=='WEBP' ||
      webp.readUInt32LE(4)!==webp.length-8) throw Error('WebP no válido.');
  const chunks=[];
  let extended=false;
  for(let p=12;p<webp.length;) {
    if(p+8>webp.length) throw Error('WebP incompleto.');
    const tag=webp.toString('ascii',p,p+4), n=webp.readUInt32LE(p+4), end=p+8+n+(n%2);
    if(end>webp.length) throw Error('WebP incompleto.');
    const data=Buffer.from(webp.subarray(p+8,p+8+n));
    if(tag==='VP8X') { if(n!==10) throw Error('VP8X inválido.'); data[0]|=8; extended=true; }
    if(tag!=='EXIF') chunks.push(chunk(tag,data));
    p=end;
  }
  if(!extended) {
    const x=Buffer.alloc(10);
    x[0]=8;
    x.writeUIntLE(side-1,4,3);x.writeUIntLE(side-1,7,3);
    chunks.unshift(chunk('VP8X',x));
  }
  const json=Buffer.from(JSON.stringify({
    'sticker-pack-id':'naevis-stickers','sticker-pack-name':'Naevis Stickers',
    'sticker-pack-publisher':'Naevis OS',emojis:['🔊'],
    'sound-sha256':createHash('sha256').update(audio).digest('base64')
  }));
  const tiff=Buffer.alloc(26);
  tiff.write('MM',0,'ascii');tiff.writeUInt16BE(42,2);tiff.writeUInt32BE(8,4);
  tiff.writeUInt16BE(1,8);tiff.writeUInt16BE(0x5741,10);tiff.writeUInt16BE(7,12);
  tiff.writeUInt32BE(json.length,14);tiff.writeUInt32BE(26,18);
  chunks.push(chunk('EXIF',Buffer.concat([tiff,json])));
  const body=Buffer.concat([Buffer.from('WEBP'),...chunks]), header=Buffer.alloc(8);
  header.write('RIFF',0,'ascii');header.writeUInt32LE(body.length,4);
  return Buffer.concat([header,body]);
}

// Encode the two documented experimental fields without editing node_modules.
// The exact sticker object identifies this operation, even when Baileys shallow-copies the message.
function installOneMessageEncoder(proto, marker, sticker, audio) {
  const M=proto.Message, S=M.StickerMessage, A=M.AudioMessage;
  const original=M.encode;
  if(typeof original!=='function'||typeof S?.encode!=='function'||typeof A?.encode!=='function') throw Error('Protocolo incompatible.');
  const s=S.encode(sticker);
  s.uint32(26*8+2).bytes(A.encode(audio).finish());
  const inner=original.call(M,{}).uint32(26*8+2).bytes(s.finish()).finish();
  const wrapper=original.call(M,{}).uint32(10).bytes(inner).finish();
  function special(message, writer) {
    if(message!==marker && message?.stickerMessage!==sticker) return original.call(this,message,writer);
    return original.call(this,{},writer).uint32(134*8+2).bytes(wrapper);
  }
  M.encode=special;
  if(M.encode!==special) throw Error('No se pudo habilitar el codificador experimental.');
  return ()=>{if(M.encode===special)M.encode=original;};
}

function buildVideoFilter(side,fps,mode='pad') {
  if(mode==='crop')return 'fps='+fps+',scale='+side+':'+side+':force_original_aspect_ratio=increase,crop='+side+':'+side+',format=yuva420p';
  return 'fps='+fps+',scale='+side+':'+side+':force_original_aspect_ratio=decrease,pad='+side+':'+side+':(ow-iw)/2:(oh-ih)/2:color=black@0,format=yuva420p';
}
// FFprobe reports the Ogg granule duration, including the Opus pre-skip.
function audioSeconds(audio,duration) {
  const head=audio.indexOf(Buffer.from('OpusHead'));
  const preSkip=head>=0&&head+12<=audio.length?audio.readUInt16LE(head+10)/48000:0;
  return Math.max(1,Math.min(CLIP,Math.ceil(duration-preSkip-1/48000)));
}
async function convert(dir, video, mode='pad', normalize=false) {
  let src=path.join(dir,'input'); const ogg=path.join(dir,'audio.ogg'), out=path.join(dir,'sticker.webp');
  await fs.writeFile(src,video);
  const opts={timeout:30_000,maxBuffer:128*1024,windowsHide:true};
  const ff=async args=>run(process.env.NAEVIS_FFMPEG||'ffmpeg',['-nostdin','-v','error','-y',...args],opts);
  if(normalize){
    const normalized=path.join(dir,'normalized.mp4');
    // Mimic a conventional mobile upload: H.264 baseline, AAC-LC, even square pixels, clean timestamps.
    await ff(['-i',src,'-t',String(CLIP),'-map','0:v:0','-map','0:a:0',
      '-vf','fps=30,scale=576:576:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=576:576:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p',
      '-af','aresample=44100:async=1:first_pts=0','-c:v','libx264','-profile:v','baseline','-preset','ultrafast','-crf','23','-threads','1',
      '-c:a','aac','-profile:a','aac_low','-ar','44100','-ac','2','-b:a','96k','-movflags','+faststart',normalized]);
    src=normalized;
  }
  await ff(['-i',src,'-t',String(CLIP),'-map','0:a:0','-vn','-ac','1','-ar','48000','-c:a','libopus','-b:a','32k','-f','ogg',ogg]);
  const audio=await fs.readFile(ogg);
  if(!audio.length||audio.length>LIMIT)throw Error('Audio vacío o demasiado grande.');
  const probe=await run(process.env.NAEVIS_FFPROBE||'ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',ogg],opts);
  const duration=Number(probe.stdout.trim());
  if(!Number.isFinite(duration)||duration<=0)throw Error('Audio sin duración válida.');
  for(const [side,fps,quality] of [[320,15,60],[256,12,45],[192,10,30]]) {
    await ff(['-i',src,'-t',String(CLIP),'-map','0:v:0','-an','-vf',
      buildVideoFilter(side,fps,mode),
      '-c:v','libwebp_anim','-quality',String(quality),'-loop','0',out]);
    const webp=addSoundExif(await fs.readFile(out),audio,side);
    // Only animated WebP is included in this first experiment.
    if(webp.length<=LIMIT && webp.includes(Buffer.from('ANIM')) && webp.includes(Buffer.from('ANMF')))
      return {webp,audio,side,seconds:audioSeconds(audio,duration)};
  }
  throw Error('No se logró generar un sticker animado de hasta 1 MB.');
}
async function sendPilot(sock, jid, media, api, stillAllowed=()=>true) {
  const {proto,prepareWAMessageMedia}=api;
  if(typeof sock.waUploadToServer!=='function'||typeof prepareWAMessageMedia!=='function'||typeof sock.relayMessage!=='function')
    throw Error('La versión instalada de Baileys no permite esta prueba.');
  const options={upload:sock.waUploadToServer};
  const {audioMessage}=await prepareWAMessageMedia({audio:media.audio,mimetype:'audio/ogg; codecs=opus',seconds:media.seconds,ptt:false},options);
  const {stickerMessage}=await prepareWAMessageMedia({sticker:media.webp,isAnimated:true},options);
  if(!audioMessage||!stickerMessage) throw Error('No se pudieron preparar los dos archivos.');
  for(const m of [audioMessage,stickerMessage]) {
    if(!m.directPath||!m.url||['mediaKey','fileSha256','fileEncSha256'].some(k=>m[k]?.length!==32))
      throw Error('La subida no devolvió metadatos completos.');
  }
  stickerMessage.width=media.side;stickerMessage.height=media.side;stickerMessage.isAnimated=true;
  if(!stillAllowed())throw Error('Función desactivada antes de enviar.');
  const marker={stickerMessage,[Symbol.for('naevis.soundSticker')]:true}; // Baileys detects mediatype=sticker from this object.
  const restore=installOneMessageEncoder(proto,marker,stickerMessage,audioMessage);
  try { return await sock.relayMessage(jid,marker,{additionalAttributes:{type:'media'}}); }
  finally { restore(); }
}

function parseCommand(text) {
  const [cmd,...args]=text.trim().toLowerCase().split(/\s+/);
  if(cmd==='.stickers')return {kind:'settings',arg:args.length===0?'status':args.length===1?args[0]:'invalid'};
  if(cmd==='.ayudastickers'&&!args.length)return {kind:'settings',arg:'status'};
  if(cmd!=='/stickeraudio')return null;
  if(!args.length||args.length===1&&args[0]==='ajustar')return {kind:'video',mode:'pad'};
  if(args.length===1&&args[0]==='compatible')return {kind:'video',mode:'crop',normalize:true};
  if(args.length===1&&['recortar','rellenar','cuadrado'].includes(args[0]))return {kind:'video',mode:'crop'};
  return {kind:'invalid'};
}
function stickerGuide(state,admin=false) {
 return '🌸 *NAEVIS • STICKERS CON SONIDO* 🌸\n\n'+
   '*Estado:* '+state+'\n\n'+
   '*¿Cómo crear uno?*\n1. Envía un video normal con sonido.\n2. Mantén presionado el video y elige Responder.\n3. Escribe uno de estos comandos:\n\n'+
   '🔊 */stickeraudio*\nConserva todo el video con bordes transparentes si hacen falta.\n\n'+
   '🖼️ */stickeraudio ajustar*\nIgual al modo anterior, sin recortar.\n\n'+
   '✂️ */stickeraudio recortar*\nLlena el sticker cuadrado recortando lo que sobra. También acepta rellenar o cuadrado.\n\n'+
   '📌 Máximo 16 MB; se utilizan los primeros 8 segundos. Toca el sticker para escuchar el audio.\n'+
   (admin?'\n*Administración del grupo*\n.stickers on — activar\n.stickers off — desactivar\n':'\nSi está desactivado, solicita al administrador que lo habilite.\n');
}
function createStickerHandler({owners,download,loadConfig,saveConfig,store,allowed,paused,isHelper,
  convertVideo=convert,sendSticker=sendPilot,getApi=()=>require('@whiskeysockets/baileys'),
  getVersion=()=>require('@whiskeysockets/baileys/package.json').version}) {
 let busy=false;
 function groupEligible(jid,config) {
   const shop=store.shop(jid);
   return !!(jid?.endsWith('@g.us') && (!shop||shop.id===jid) &&
      (shop?.id===jid||config.gruposAutorizados?.includes(jid)) && allowed(jid));
 }
 function groupEnabled(jid) {
   const config=loadConfig();
   return groupEligible(jid,config)&&config.stickersGrupos?.[jid]===true;
 }
 async function handle(sock,msg) {
   const jid=msg.key.remoteJid,m=msg.message;
   if(!jid||msg.key.fromMe)return false;
   const text=m?.conversation||m?.extendedTextMessage?.text||m?.videoMessage?.caption||'';
   const command=parseCommand(text);
   if(!command)return false;
   const group=jid.endsWith('@g.us'), sender=canonical(group?msg.key.participant:jid);
   const owner=owners.includes(sender);
   const reply=text=>sock.sendMessage(jid,{text},{quoted:msg});
   if(!group&&(!owner||!(jid.endsWith('@s.whatsapp.net')||jid.endsWith('@lid'))))return false;
   if(paused()){await reply('⚙️ Bot en mantenimiento.');return true;}
   const config=group?loadConfig():null;
   if(group&&!groupEligible(jid,config)){await reply('⚠️ Stickers disponibles únicamente en grupos de ventas autorizados con renta activa.');return true;}
   if(command.kind==='settings'){
     if(!group){await reply(command.arg==='status'?stickerGuide('DISPONIBLE EN PRIVADO'):'Configura .stickers on/off dentro del grupo.');return true;}
     if(command.arg==='status'){await reply(stickerGuide(groupEnabled(jid)?'ACTIVADOS':'DESACTIVADOS',true));return true;}
     if(!['on','off'].includes(command.arg)){await reply('Usa .stickers on, .stickers off o .stickers.');return true;}
     const groupOwner=canonical(store.shop(jid)?.owner||config.propietariosGrupos?.[jid]);
     let permitted=owner||!!sender&&sender===groupOwner;
     if(!permitted&&!isHelper(jid,sender)){
       try{
         const p=(await sock.groupMetadata(jid)).participants.find(p=>[p.id,p.phoneNumber,p.lid].some(x=>canonical(x)===sender&&!!sender));
         permitted=['admin','superadmin'].includes(p?.admin);
       }catch{}
     }
     if(!permitted){await reply('⚠️ Solo el dueño o administrador del grupo puede cambiar esta función.');return true;}
     if(command.arg==='on'&&!supportedVersion(getVersion())){await reply('⚠️ Stickers con sonido requieren una versión de Baileys compatible: 6.7.7 o 6.7.24. Consulta a la owner.');return true;}
     const fresh=loadConfig();
     if(paused()||!groupEligible(jid,fresh)){await reply('⚠️ Función no disponible.');return true;}
     fresh.stickersGrupos={...fresh.stickersGrupos,[jid]:command.arg==='on'};
     saveConfig(fresh);
     await reply(command.arg==='on'?'✅ Stickers con sonido activados. Escribe .stickers para ver la guía.':'🔇 Stickers con sonido desactivados.');
     return true;
   }
   if(group&&!groupEnabled(jid)){await reply('🔇 Stickers con sonido desactivados. El dueño puede usar .stickers on.');return true;}
   if(command.kind==='invalid'){await reply('Usa /stickeraudio, /stickeraudio ajustar o /stickeraudio recortar.');return true;}
   const video=m.videoMessage||m.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;
   if(!video||video.viewOnce){await reply('Responde a un video normal con sonido (máximo 16 MB). Se usan los primeros 8 segundos.');return true;}
   if(Number(video.fileLength||0)>INPUT_LIMIT){await reply('⚠️ El video supera 16 MB.');return true;}
   if(busy){await reply('⏳ Hay otro sticker en proceso. Inténtalo nuevamente en unos segundos.');return true;}
   if(!supportedVersion(getVersion())){await reply('⚠️ Stickers con sonido no compatibles con la versión instalada de Baileys. Consulta a la owner.');return true;}
   busy=true;
   const stillAllowed=()=>!paused()&&(!group||groupEnabled(jid));
   // One conversion at a time, outside the shared order/payment queue.
   async function job(){
     let dir;
     try{
       const stream=await download(video,'video'),parts=[];
       let size=0;
       for await(const part of stream){size+=part.length;if(size>INPUT_LIMIT)throw Error('El video supera 16 MB.');parts.push(part);}
       dir=await fs.mkdtemp(path.join(os.tmpdir(),'naevis-sticker-'));
       const media=await convertVideo(dir,Buffer.concat(parts),command.mode,command.normalize===true);
       if(!stillAllowed())return;
       await sendSticker(sock,jid,media,getApi(),stillAllowed);
     }catch(e){
       console.error('[STICKER]',e.code||e.name);
       if(stillAllowed())await reply('⚠️ No pude crear el sticker. Verifica que el video tenga sonido y que el servidor tenga FFmpeg y FFprobe. Intenta con un video más corto.');
     }finally{if(dir)await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});busy=false;}
   }
   void job().catch(e=>console.error('[STICKER] Error:',e.code||e.name));
   return true;
 }
 return {handle};
}
module.exports={createStickerHandler,parseCommand,buildVideoFilter,addSoundExif,installOneMessageEncoder,convert,sendPilot,stickerGuide,audioSeconds};
