'use strict';
const {canonical}=require('./message-utils');
const LIMIT=16*1024*1024;
function createAnnouncementHandler({store,owners,loadConfig,allowed,paused,isHelper,download}){
 function eligible(id){const c=loadConfig(),s=store.shop(id);return id.endsWith('@g.us')&&(!s||s.id===id)&&!!c.gruposAutorizados?.includes(id)&&allowed(id)&&!paused();}
 async function handle(sock,msg){
  const id=msg.key.remoteJid,m=msg.message;
  if(!id||msg.key.fromMe||!id.endsWith('@g.us'))return false;
  const text=(m?.conversation||m?.extendedTextMessage?.text||m?.imageMessage?.caption||m?.videoMessage?.caption||'').trim();
  if(!/^\.n(?:\s|$)/i.test(text))return false;
  const reply=text=>sock.sendMessage(id,{text},{quoted:msg});
  if(!eligible(id)){await reply('⚠️ .n requiere un grupo autorizado con renta activa y sin mantenimiento.');return true;}
  const sender=canonical(msg.key.participant),c=loadConfig(),shop=store.shop(id);
  const owner=!!sender&&(owners.includes(sender)||c.superAdmins?.includes(sender)||sender===canonical(shop?.owner||c.propietariosGrupos?.[id]));
  let participants;
  try{participants=(await sock.groupMetadata(id)).participants;}catch{await reply('⚠️ No pude consultar los miembros del grupo. Intenta de nuevo.');return true;}
  const author=participants.find(p=>[p.id,p.phoneNumber,p.lid].some(x=>!!sender&&canonical(x)===sender));
  if(!owner&&(isHelper(id,sender)||!['admin','superadmin'].includes(author?.admin))){await reply('⚠️ Solo el dueño o administrador del grupo puede usar .n.');return true;}
  const anuncio=text.slice(2).trim();
  if(!anuncio){await reply('Usa .n Texto del anuncio. También puedes responder a una imagen o video.');return true;}
  const mentions=[...new Set(participants.map(p=>p.id).filter(x=>typeof x==='string'))];
  const footer='\n\n│ 𝑁𝑎𝑒𝑣𝑖𝑠 𝐵𝑜𝑡\n│ '+new Date().toLocaleString('es-MX',{timeZone:'America/Monterrey'})+' (MX)\n│ 👤 Enviado por: @'+msg.key.participant.split('@')[0];
  const quoted=m.extendedTextMessage?.contextInfo?.quotedMessage;
  const media=m.imageMessage||m.videoMessage||quoted?.imageMessage||quoted?.videoMessage;
  const type=(m.imageMessage||!m.videoMessage&&quoted?.imageMessage)?'image':'video';
  try{
   let payload={text:anuncio+footer,mentions};
   if(media){
    if(media.viewOnce||Number(media.fileLength||0)>LIMIT)throw Error('Usa una imagen o video normal de hasta 16 MB.');
    let size=0;const chunks=[];
    for await(const chunk of await download(media,type)){size+=chunk.length;if(size>LIMIT)throw Error('Archivo supera 16 MB.');chunks.push(chunk);}
    if(!size)throw Error('Archivo vacío.');
    payload={[type]:Buffer.concat(chunks),caption:anuncio+footer,mentions};
   }
   if(eligible(id))await sock.sendMessage(id,payload,{quoted:msg});
  }catch(e){await reply('⚠️ No pude enviar el anuncio. Verifica el archivo o vuelve a intentar.');}
  return true;
 }
 return {handle};
}
module.exports={createAnnouncementHandler};
