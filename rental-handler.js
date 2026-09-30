'use strict';
const {randomBytes,createHash}=require('crypto');
const {canonical} = require('./message-utils');
const hash=key=>createHash('sha256').update(key).digest('hex');
const EXPIRED='🛑 TIENDA SUSPENDIDA\nEl tiempo de renta asignado por la owner ha finalizado.';
const MANUAL='🛑 TIENDA SUSPENDIDA\nLa owner ha suspendido el servicio de esta tienda.';
function duration(text) {
 const m=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/^(\d+)\s+(minutos?|horas?|dias?|semanas?)$/);
 if(!m) throw Error('Usa /genkey 1 dia, /genkey 12 horas o /genkey 7 dias.');
 const unit=m[2].startsWith('minuto')?60000:m[2].startsWith('hora')?3600000:m[2].startsWith('dia')?86400000:604800000;
 const ms=Number(m[1])*unit;if(!Number.isSafeInteger(ms)||ms<60000||ms>366*86400000)throw Error('Duración permitida: de 1 minuto a 366 días.');return ms;
}
function createRentalHandler({store,owners,loadConfig,saveConfig,now=Date.now}) {
 const db=store.db;
 db.exec(`CREATE TABLE IF NOT EXISTS rental_keys(hash TEXT PRIMARY KEY,duration INTEGER NOT NULL,created INTEGER NOT NULL,used_group TEXT,used_by TEXT);
 CREATE TABLE IF NOT EXISTS rentals(shop TEXT PRIMARY KEY,customer TEXT NOT NULL,expires INTEGER NOT NULL,suspended INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL DEFAULT '',notified INTEGER NOT NULL DEFAULT 0);`);
 const isOwner=id=>owners.includes(canonical(id));
 function issue(text){const key='NAEVIS-'+randomBytes(16).toString('hex').toUpperCase();db.prepare('INSERT INTO rental_keys(hash,duration,created) VALUES(?,?,?)').run(hash(key),duration(text),now());return key;}
 function redeem(key,group,sender){return db.transaction(()=>{
  const k=db.prepare('SELECT * FROM rental_keys WHERE hash=?').get(hash(key));if(!k||k.used_group)throw Error('Key inválida o ya utilizada.');
  const current=db.prepare('SELECT * FROM rentals WHERE shop=?').get(group);
  if(current&&current.customer!==sender)throw Error('Esta renta pertenece a otro cliente.');
  const shop=store.shop(group);if(shop&&shop.id!==group)throw Error('Activa la key en el grupo de ventas, no en el privado.');
  const config=loadConfig();if(config.propietariosGrupos?.[group]&&config.propietariosGrupos[group]!==sender&&!isOwner(sender))throw Error('Solo el propietario de este grupo puede renovar.');
  const expires=Math.max(now(),current&&!current.suspended?current.expires:0)+k.duration;
  db.prepare("INSERT INTO rentals(shop,customer,expires) VALUES(?,?,?) ON CONFLICT(shop) DO UPDATE SET expires=excluded.expires,suspended=0,reason='',notified=0").run(group,sender,expires);
  db.prepare('UPDATE rental_keys SET used_group=?,used_by=? WHERE hash=?').run(group,sender,hash(key));return expires;
 })();}
 function allowed(group){const shop=store.shop(group),id=shop?.id||group;const config=loadConfig();if(isOwner(shop?.owner||config.propietariosGrupos?.[id]))return true;
 const r=db.prepare('SELECT * FROM rentals WHERE shop=?').get(id);return !!r&&!r.suspended&&r.expires>now();}
 function expire(){db.prepare("UPDATE rentals SET suspended=1,reason='expired',notified=0 WHERE suspended=0 AND expires<=?").run(now());}
 let notifying=false;
 async function tick(sock){expire();if(notifying)return;notifying=true;try{for(const r of db.prepare('SELECT * FROM rentals WHERE suspended=1 AND notified=0').all()){
  const targets=[r.shop,store.shop(r.shop)?.admin_group].filter(Boolean);let ok=true;
  for(const target of targets)try{await sock.sendMessage(target,{text:r.reason==='expired'?EXPIRED:MANUAL});}catch(e){ok=false;console.error('Aviso de renta pendiente:',target,e.message);}
  if(ok)db.prepare('UPDATE rentals SET notified=1 WHERE shop=? AND suspended=1 AND reason=?').run(r.shop,r.reason);
 }}finally{notifying=false;}}
 async function handle(sock,msg){const chat=msg.key.remoteJid,sender=canonical(msg.key.participant||chat),group=chat?.endsWith('@g.us');
 const m=msg.message?.ephemeralMessage?.message||msg.message;const text=(m?.conversation||m?.extendedTextMessage?.text||m?.imageMessage?.caption||m?.documentMessage?.caption||'').trim();const args=text.split(/\s+/),cmd=args[0].toLowerCase();
 const reply=t=>sock.sendMessage(chat,{text:t},{quoted:msg});
 try{
  if(['/genkey','/suspender','/rentas','/revocarkey'].includes(cmd)){
   if(group||!isOwner(sender)){await reply('Solo la owner del bot puede usar este comando por privado.');return true;}
   if(cmd==='/genkey'){const key=issue(args.slice(1).join(' '));await reply(`🔑 *KEY DE RENTA*\n\n${key}\n\nDuración: ${args.slice(1).join(' ')}\nEl tiempo comienza al activarla. Un solo uso para un grupo.\n\nEl cliente, siendo administrador del grupo de ventas, debe escribir:\n/activar ${key}`);return true;}
   if(cmd==='/rentas'){const rows=db.prepare('SELECT * FROM rentals ORDER BY expires DESC').all();await reply(rows.length?rows.map(r=>`${store.shop(r.shop)?.alias||r.shop}\nCliente: ${r.customer}\nVence: ${new Date(r.expires).toISOString()} (UTC)\nEstado: ${allowed(r.shop)?'ACTIVA':'SUSPENDIDA'}`).join('\n\n'):'Sin rentas.');return true;}
   if(cmd==='/revocarkey'){const result=db.prepare('DELETE FROM rental_keys WHERE hash=? AND used_group IS NULL').run(hash(args[1]||''));await reply(result.changes?'✅ Key sin usar revocada.':'Key inexistente o utilizada; para una renta activa usa /suspender alias.');return true;}
   const id=store.alias((args[1]||'').toLowerCase())?.id||args[1];const r=db.prepare('SELECT * FROM rentals WHERE shop=?').get(id);
   if(!r){const shop=store.shop(id);if(!shop||shop.id!==id)throw Error('Usa /suspender alias o ID del grupo. Consulta /rentas.');db.prepare('INSERT INTO rentals(shop,customer,expires) VALUES(?,?,?)').run(id,shop.owner,now());}
   db.prepare("UPDATE rentals SET suspended=1,reason='manual',notified=0 WHERE shop=?").run(id);await reply('✅ Renta suspendida. Se bloquearon ventas, trámites y administración de ese cliente.');await tick(sock);return true;
  }
  if(cmd==='/activar'){
   if(!group||args.length!==2)throw Error('Usa /activar KEY en el grupo de ventas.');
   const p=(await sock.groupMetadata(chat)).participants.find(p=>[p.id,p.phoneNumber,p.lid].some(id=>canonical(id)===sender));
   if(!isOwner(sender)&&!['admin','superadmin'].includes(p?.admin))throw Error('Debes ser administrador del grupo para activar la renta.');
   const expires=redeem(args[1],chat,sender),config=loadConfig();
   config.gruposAutorizados=config.gruposAutorizados||[];if(!config.gruposAutorizados.includes(chat))config.gruposAutorizados.push(chat);
   config.propietariosGrupos=config.propietariosGrupos||{};config.propietariosGrupos[chat]=sender;saveConfig(config);
   await reply(`✅ *RENTA ACTIVADA*\nVence: ${new Date(expires).toISOString()} (UTC)\n\nElige tu función:\n.actienda alias\n.actram alias`);return true;
  }
  if(cmd==='/addvendedor'){await reply('Las rentas ahora se activan con /activar KEY. La owner genera las keys por privado con /genkey.');return true;}
  if(!group)return false;
  expire();const shop=store.shop(chat),config=loadConfig();
  if((shop||config.gruposAutorizados?.includes(chat)||/^\.act(?:ienda|ram)(?:\s|$)/i.test(text))&&!allowed(chat)){
   const r=db.prepare('SELECT * FROM rentals WHERE shop=?').get(shop?.id||chat);
   if(text.startsWith('.')||text.startsWith('/')||text.startsWith('-s'))await reply(r?(r.reason==='manual'?MANUAL:EXPIRED):'🛑 SERVICIO SIN RENTA ACTIVA\nEl propietario debe activar una key con /activar KEY.');return true;
  }
  return false;
 }catch(e){await reply('⚠️ '+e.message);return true;}}
 return {handle,tick,allowed,issue,redeem,expire};
}
module.exports={createRentalHandler,duration,EXPIRED};
