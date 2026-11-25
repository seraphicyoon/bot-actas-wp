'use strict';
const {canonical}=require('./message-utils');
const DEFAULT='👋 ¡Bienvenido/a al grupo! 🌸\n\n{usuario}, nos da gusto tenerte aquí.\n\n¡Disfruta tu estancia! 💗';
function render(template,participant){return template.split('{usuario}').join('@'+participant.split('@')[0]);}
function createWelcomeHandler({store,owners,loadConfig,allowed,paused}){
 const db=store.db;
 db.exec('CREATE TABLE IF NOT EXISTS naevis_welcome(group_id TEXT PRIMARY KEY, template TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1)');
 const get=id=>db.prepare('SELECT template,enabled FROM naevis_welcome WHERE group_id=?').get(id)||{template:DEFAULT,enabled:1};
 function eligible(id){const c=loadConfig(),s=store.shop(id);return id?.endsWith('@g.us')&&(!s||s.id===id)&&(s?.id===id||c.gruposAutorizados?.includes(id))&&allowed(id);}
 function canEdit(id,sender){return eligible(id)&&(owners.includes(sender)||!!sender&&sender===canonical(store.shop(id)?.owner||loadConfig().propietariosGrupos?.[id]));}
 function resolve(alias){const c=loadConfig();const a=store.alias(alias)?.id;const b=Object.prototype.hasOwnProperty.call(c.gruposDestino||{},alias)?c.gruposDestino[alias]:null;if(a&&b&&a!==b)return null;return a||b||(alias.endsWith('@g.us')?alias:null);}
 function list(sender){const c=loadConfig(),ids=new Set([...(c.gruposAutorizados||[]),...db.prepare('SELECT id FROM shops').all().map(r=>r.id)]);
 return [...ids].filter(id=>canEdit(id,sender)).map(id=>{const alias=store.shop(id)?.alias||Object.entries(c.gruposDestino||{}).find(([a,g])=>g===id)?.[0]||id;return alias+' — '+(get(id).enabled?'ACTIVA':'DESACTIVADA');}).join('\n');}
 const usage='🌸 *BIENVENIDAS PERSONALIZADAS*\n\n.bienvenida — lista de tus grupos\n.bienvenida alias ver — vista previa\n.bienvenida alias texto Tu mensaje — guardar y activar\n.bienvenida alias off — desactivar\n.bienvenida alias on — activar\n.bienvenida alias reset — restaurar mensaje neutro\n\nUsa {usuario} para mencionar a quien entre. Puedes usar saltos de línea y formato de WhatsApp.';
 async function handle(sock,msg){
  const id=msg.key.remoteJid,text=(msg.message?.conversation||msg.message?.extendedTextMessage?.text||'').trim();
  const match=text.match(/^\.bienvenida(?:\s+([\w.@-]+)(?:\s+([\s\S]+))?)?$/i);
  if(!match||msg.key.fromMe)return false;
  const reply=t=>sock.sendMessage(id,{text:t},{quoted:msg});
  if(id.endsWith('@g.us')){await reply('Configura la bienvenida en el chat privado con el bot.');return true;}
  if(!/@(s\.whatsapp\.net|lid)$/.test(id))return false;
  if(paused())return true;
  const sender=canonical(id);
  if(!match[1]){const groups=list(sender);await reply(groups?usage+'\n\n*Tus grupos:*\n'+groups:'No tienes grupos autorizados con renta activa para configurar.');return true;}
  const gid=resolve(match[1].toLowerCase());
  if(!gid||!canEdit(gid,sender)){await reply('Grupo no disponible o sin permiso. Escribe .bienvenida para ver tus grupos.');return true;}
  const action=(match[2]||'ver').trim(),lower=action.toLowerCase(),current=get(gid);
  if(lower==='ver'){await reply('Estado: '+(current.enabled?'ACTIVA':'DESACTIVADA')+'\n\n'+current.template.split('{usuario}').join('@NuevoMiembro'));return true;}
  let next=current;
  if(lower==='on'||lower==='off')next={...current,enabled:lower==='on'?1:0};
  else if(lower==='reset')next={template:DEFAULT,enabled:1};
  else if(/^texto\s+/i.test(action)){const template=action.replace(/^texto\s+/i,'').trim();if(!template||template.length>1500){await reply('El texto debe contener entre 1 y 1500 caracteres.');return true;}next={template,enabled:1};}
  else {await reply(usage);return true;}
  db.prepare('INSERT INTO naevis_welcome(group_id,template,enabled) VALUES(?,?,?) ON CONFLICT(group_id) DO UPDATE SET template=excluded.template,enabled=excluded.enabled').run(gid,next.template,next.enabled);
  await reply('✅ Bienvenida '+(next.enabled?'activada':'desactivada')+'.\n\n'+next.template.split('{usuario}').join('@NuevoMiembro'));return true;
 }
 async function onJoin(sock,event){
  if(event.action!=='add'||paused()||!eligible(event.id))return;
  for(const entry of event.participants||[]){
   if(paused()||!eligible(event.id))return;
   const current=get(event.id);if(!current.enabled)return;
   const p=typeof entry==='string'?entry:entry?.id;
   if(typeof p!=='string'||!/@(s\.whatsapp\.net|lid)$/.test(p))continue;
   if([sock.user?.id,sock.user?.lid].some(x=>x&&canonical(x)===canonical(p)))continue;
   try{await sock.sendMessage(event.id,{text:render(current.template,p),mentions:current.template.includes('{usuario}')?[p]:[]});}catch(e){console.error('[BIENVENIDA]',e.code||e.name);}
  }
 }
 return {handle,onJoin};
}
module.exports={createWelcomeHandler,DEFAULT,render};
