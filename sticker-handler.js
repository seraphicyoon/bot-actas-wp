'use strict';
// Experimental, opt-in, owner-only private chat. No changes to installed dependencies.
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
// Only this exact message object is intercepted; regular message encoding delegates unchanged.
function installOneMessageEncoder(proto, marker, sticker, audio) {
  const M=proto.Message, S=M.StickerMessage, A=M.AudioMessage;
  const original=M.encode;
  if(typeof original!=='function'||typeof S?.encode!=='function'||typeof A?.encode!=='function') throw Error('Protocolo incompatible.');
  const s=S.encode(sticker);
  s.uint32(26*8+2).bytes(A.encode(audio).finish());
  const inner=original.call(M,{}).uint32(26*8+2).bytes(s.finish()).finish();
  const wrapper=original.call(M,{}).uint32(10).bytes(inner).finish();
  function special(message, writer) {
    if(message!==marker) return original.call(this,message,writer);
    return original.call(this,{},writer).uint32(134*8+2).bytes(wrapper);
  }
  M.encode=special;
  if(M.encode!==special) throw Error('No se pudo habilitar el codificador experimental.');
  return ()=>{if(M.encode===special)M.encode=original;};
}

async function convert(dir, video) {
  const src=path.join(dir,'input'), ogg=path.join(dir,'audio.ogg'), out=path.join(dir,'sticker.webp');
  await fs.writeFile(src,video);
  const opts={timeout:30_000,maxBuffer:128*1024,windowsHide:true};
  const ff=async args=>run(process.env.NAEVIS_FFMPEG||'ffmpeg',['-nostdin','-v','error','-y',...args],opts);
  await ff(['-i',src,'-t',String(CLIP),'-map','0:a:0','-vn','-ac','1','-ar','48000','-c:a','libopus','-b:a','32k','-f','ogg',ogg]);
  const audio=await fs.readFile(ogg);
  if(!audio.length||audio.length>LIMIT)throw Error('Audio vacío o demasiado grande.');
  const probe=await run(process.env.NAEVIS_FFPROBE||'ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',ogg],opts);
  const duration=Number(probe.stdout.trim());
  if(!Number.isFinite(duration)||duration<=0)throw Error('Audio sin duración válida.');
  for(const [side,fps,quality] of [[320,15,60],[256,12,45],[192,10,30]]) {
    await ff(['-i',src,'-t',String(CLIP),'-map','0:v:0','-an','-vf',
      'fps='+fps+',scale='+side+':'+side+':force_original_aspect_ratio=decrease,pad='+side+':'+side+':(ow-iw)/2:(oh-ih)/2:color=black@0,format=yuva420p',
      '-c:v','libwebp_anim','-quality',String(quality),'-loop','0',out]);
    const webp=addSoundExif(await fs.readFile(out),audio,side);
    // Only animated WebP is included in this first experiment.
    if(webp.length<=LIMIT && webp.includes(Buffer.from('ANIM')) && webp.includes(Buffer.from('ANMF')))
      return {webp,audio,side,seconds:Math.ceil(duration)};
  }
  throw Error('No se logró generar un sticker animado de hasta 1 MB.');
}
async function sendPilot(sock, jid, media, api) {
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
  const marker={stickerMessage}; // Baileys detects mediatype=sticker from this object.
  const restore=installOneMessageEncoder(proto,marker,stickerMessage,audioMessage);
  try { return await sock.relayMessage(jid,marker,{additionalAttributes:{type:'media'}}); }
  finally { restore(); }
}

let busy=false;
async function handlePilot(sock,msg,{owners,download}) {
  const jid=msg.key.remoteJid,m=msg.message;
  const text=(m?.conversation||m?.extendedTextMessage?.text||m?.videoMessage?.caption||'').trim().toLowerCase();
  if(text!=='/stickeraudio')return false;
  if(!jid?.endsWith('@s.whatsapp.net')||!owners.includes(canonical(jid)))return false;
  const reply=text=>sock.sendMessage(jid,{text},{quoted:msg});
  const video=m.videoMessage||m.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;
  if(!video){await reply('🧪 Responde a un video normal con /stickeraudio o envíalo con ese texto. Máximo 16 MB, primeros 8 segundos.');return true;}
  if(busy){await reply('Ya hay una prueba en curso.');return true;}
  busy=true;
  let dir;
  try {
    const api=require('@whiskeysockets/baileys');
    const version=require('@whiskeysockets/baileys/package.json').version;
    if(version!=='6.7.7')throw Error('Piloto validado contra el esquema 6.7.7; versión instalada '+version+'. No se enviará nada.');
    if(Number(video.fileLength||0)>INPUT_LIMIT)throw Error('El video supera 16 MB.');
    const stream=await download(video,'video');
    const parts=[];let size=0;
    for await(const part of stream){size+=part.length;if(size>INPUT_LIMIT)throw Error('El video supera 16 MB.');parts.push(part);}
    dir=await fs.mkdtemp(path.join(os.tmpdir(),'naevis-sticker-'));
    const media=await convert(dir,Buffer.concat(parts));
    const id=await sendPilot(sock,jid,media,api);
    await reply('🧪 Envío experimental solicitado. Comprueba en tu celular si se reproduce el audio. ID: '+id);
  }catch(e){
    console.error('Piloto sticker:',e.code||e.name);
    await reply('⚠️ No se completó la prueba de sticker. Comprueba versión de Baileys, FFmpeg y que el video tenga audio. No se reintentará automáticamente.');
  }finally{
    if(dir)await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});
    busy=false;
  }
  return true;
}
module.exports={handlePilot,addSoundExif,installOneMessageEncoder,convert,sendPilot};
