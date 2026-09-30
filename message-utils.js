'use strict';
const canonical=id=>typeof id==='string'?id.replace(/:\d+@/,'@').replace('@s.whatsapp.net','@c.us'):undefined;
function unwrap(message){for(let i=0;i<5;i++){const next=message?.ephemeralMessage?.message||message?.documentWithCaptionMessage?.message;if(!next)break;message=next;}return message;}
async function normalizeMessage(sock,msg){
 const normalized={...msg,key:{...msg.key},message:unwrap(msg.message),originalKey:msg.originalKey||msg.key};
 if(!msg.key.remoteJid?.endsWith('@g.us'))return normalized;
 const sender=msg.key.participant,ctx=normalized.message?.extendedTextMessage?.contextInfo;
 if(![sender,ctx?.participant].some(id=>id?.includes('@lid')||/:\d+@/.test(id||'')))return normalized;
 const participants=(await sock.groupMetadata(msg.key.remoteJid)).participants;
 const resolve=id=>{const p=participants.find(p=>[p.id,p.phoneNumber,p.lid].some(x=>canonical(x)===canonical(id)));return p?.phoneNumber|| (p?.id?.endsWith('@s.whatsapp.net')?p.id:id);};
 normalized.key.participant=resolve(sender);
 if(ctx)normalized.message={...normalized.message,extendedTextMessage:{...normalized.message.extendedTextMessage,contextInfo:{...ctx,participant:resolve(ctx.participant)}}};
 return normalized;
}
module.exports={canonical,unwrap,normalizeMessage};
