'use strict';
const {randomUUID}=require('crypto');
const {canonical}=require('./message-utils');
function createNameHandler({store,owners,loadConfig,loadBalances,saveBalances,allowed}){
 const db=store.db;
 db.exec('CREATE TABLE IF NOT EXISTS name_owner_chat(owner TEXT PRIMARY KEY, chat TEXT NOT NULL)');
 const primary=canonical(owners[0]);
 const primaryNumbers=new Set([primary, ...(primary.startsWith('52') && primary.split('@')[0].length===12 ? ['521'+primary.slice(2)] : primary.startsWith('521') && primary.split('@')[0].length===13 ? ['52'+primary.slice(3)] : [])]);
 function observePrivate(msg){const chat=msg.key.remoteJid;if(!chat.endsWith('@g.us')&&!msg.key.fromMe&&primaryNumbers.has(canonical(chat)))db.prepare('INSERT INTO name_owner_chat(owner,chat) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET chat=excluded.chat').run(primary,chat);}
 async function destination(sock){const saved=db.prepare('SELECT chat FROM name_owner_chat WHERE owner=?').get(primary);if(saved)return saved.chat;
  if(typeof sock.onWhatsApp==='function'){for(const candidate of primaryNumbers){const matches=await sock.onWhatsApp(candidate.replace('@c.us','@s.whatsapp.net'));const registered=matches?.find(x=>x.exists&&x.jid);if(registered)return registered.jid;}throw Error('No se pudo verificar el WhatsApp de la owner; escribe .jinni en el privado del bot.');}
  return owners[0].replace('@c.us','@s.whatsapp.net');
 }
 async function notify(sock,row){const sent=await sock.sendMessage(await destination(sock),{text:`🔎 *BÚSQUEDA MANUAL POR NOMBRE*\n\nNombre: ${row.name}\nCliente: ${row.customer.split('@')[0]}\nGrupo: ${row.chat}\nCobrado: $10 MXN\nSolicitud: ${row.id}\n\nPara entregar: responde al resultado con /r ${row.id}\nPara rechazar: /rechazar ${row.id}, o responde a este aviso con /rechazar.`});db.prepare('UPDATE name_requests SET notice=? WHERE id=?').run(sent?.key?.id||null,row.id);}

 db.exec(`CREATE TABLE IF NOT EXISTS name_requests(id TEXT PRIMARY KEY, chat TEXT NOT NULL, customer TEXT NOT NULL, name TEXT NOT NULL, source TEXT NOT NULL, state TEXT NOT NULL, notice TEXT, UNIQUE(chat,source));
 CREATE TABLE IF NOT EXISTS name_balance_journal(id TEXT PRIMARY KEY,chat TEXT NOT NULL,customer TEXT NOT NULL,balance REAL NOT NULL,applied INTEGER NOT NULL DEFAULT 0);`);
 function recover(){for(const row of db.prepare('SELECT * FROM name_balance_journal WHERE applied=0 ORDER BY rowid').all()){
  const balances=loadBalances();balances[row.chat]=balances[row.chat]||{};balances[row.chat][row.customer]=row.balance;saveBalances(balances);db.prepare('UPDATE name_balance_journal SET applied=1 WHERE id=?').run(row.id);
 }}
 recover();
 function moneyChange(row,delta,state){const balances=loadBalances(),current=Number(balances[row.chat]?.[row.customer]||0);const next=Math.round((current+delta)*100)/100;if(!Number.isFinite(next)||next<0)throw Error('Saldo insuficiente. Necesitas $10 MXN.');
  db.transaction(()=>{db.prepare('UPDATE name_requests SET state=? WHERE id=?').run(state,row.id);db.prepare('INSERT INTO name_balance_journal(id,chat,customer,balance) VALUES(?,?,?,?)').run(row.id+':'+state,row.chat,row.customer,next);})();recover();
 }
 const pending=chat=>!!db.prepare("SELECT 1 FROM name_requests WHERE chat=? AND state IN ('pending','sending','review')").get(chat);
 async function handle(sock,msg){recover();const chat=msg.key.remoteJid,group=chat.endsWith('@g.us'),sender=canonical(msg.key.participant||chat),ctx=msg.message.extendedTextMessage?.contextInfo||{},text=(msg.message.conversation||msg.message.extendedTextMessage?.text||msg.message.documentMessage?.caption||msg.message.imageMessage?.caption||'').trim(),parts=text.split(/\s+/),cmd=parts[0].toLowerCase();
 const reply=text=>sock.sendMessage(chat,{text},{quoted:msg});
 if(cmd==='.actienda'&&pending(chat)){await reply('⚠️ Resuelve las búsquedas por nombre pendientes antes de cambiar a tienda.');return true;}
 if(cmd==='/avisos'){
  if(group||!owners.map(canonical).includes(sender)){await reply('⚠️ Solo la owner puede recuperar avisos desde su privado.');return true;}
  observePrivate(msg);
  const rows=db.prepare("SELECT * FROM name_requests WHERE state='pending' ORDER BY rowid").all();
  let count=0;for(const row of rows){try{await notify(sock,row);count++;}catch(e){await reply('⚠️ No pude recuperar todos los avisos. No hubo cobros adicionales.');return true;}}
  await reply(`✅ Avisos recuperados: ${count}. No se cobró saldo adicional.`);return true;
 }
 if(cmd==='/nombre'){
  const config=loadConfig();if(!group||!config.gruposAutorizados?.includes(chat)||!allowed(chat)||store.shop(chat)?.mode==='tienda'){await reply('⚠️ /nombre se usa en un grupo activo de trámites.');return true;}
  const name=text.slice(parts[0].length).trim();if(name.length<3||name.length>160||/[\r\n]/.test(name)){await reply('⚠️ Usa /nombre Nombre completo (máximo 160 caracteres).');return true;}
  let row=db.prepare('SELECT * FROM name_requests WHERE chat=? AND source=?').get(chat,msg.key.id);
  if(row){await reply('ℹ️ Esta solicitud ya fue registrada. No se vuelve a cobrar.');return true;}
  if(Number(loadBalances()[chat]?.[sender]||0)<10){await reply('⚠️ Saldo insuficiente. Necesitas $10 MXN.');return true;}
  row={id:randomUUID(),chat,customer:sender,name,source:msg.key.id};
  db.prepare("INSERT INTO name_requests(id,chat,customer,name,source,state) VALUES(?,?,?,?,?,'created')").run(row.id,chat,sender,name,msg.key.id);
  moneyChange(row,-10,'pending');
  try{await notify(sock,row);
  }catch(e){moneyChange(row,10,'rejected');await reply('⚠️ No pude avisar a la owner. Se devolvieron los $10 MXN; vuelve a intentarlo.');return true;}
  await reply('Comenzando la busqueda... Espera un momento por favor...');return true;
 }
 if(cmd!=='/rechazar'&&cmd!=='/r')return false;
 let row=parts[1]?db.prepare('SELECT * FROM name_requests WHERE id=?').get(parts[1]):ctx.stanzaId?db.prepare('SELECT * FROM name_requests WHERE notice=?').get(ctx.stanzaId):null;
 if(cmd==='/r'&&!row)return false;
 if(group||!owners.map(canonical).includes(sender)){await reply('⚠️ Solo la owner puede resolver búsquedas desde su privado.');return true;}
 if(!row){await reply('⚠️ Responde al aviso con /rechazar o usa /rechazar ID.');return true;}
 if(row.state!=='pending'){await reply('ℹ️ Esta solicitud ya fue resuelta o requiere revisar la entrega. No se vuelve a cobrar ni devolver saldo.');return true;}
 if(cmd==='/rechazar'){
  moneyChange(row,10,'rejected');
  try{await sock.sendMessage(row.customer.replace('@c.us','@s.whatsapp.net'),{text:'Este usuario no esta permitido o aun no aparece en la database'});await sock.sendMessage(row.chat,{text:'Este usuario no esta permitido o aun no aparece en la database'},{quoted:{key:{remoteJid:row.chat,id:row.source,participant:row.customer.replace('@c.us','@s.whatsapp.net')},message:{conversation:'/nombre '+row.name}}});await reply('✅ Solicitud rechazada. Se devolvieron $10 MXN.');}catch(e){await reply('⚠️ Se devolvieron $10 MXN, pero no pude enviar todos los avisos. No vuelvas a cobrar al cliente.');}return true;
 }
 if(!allowed(row.chat)||store.shop(row.chat)?.mode==='tienda'){await reply('⚠️ El grupo de esta solicitud no está activo en trámites.');return true;}
 if(!ctx.quotedMessage||!ctx.stanzaId){await reply(`⚠️ Responde al texto, imagen o documento del resultado con /r ${row.id}`);return true;}
 db.prepare("UPDATE name_requests SET state='sending' WHERE id=?").run(row.id);
 try{await sock.sendMessage(row.customer.replace('@c.us','@s.whatsapp.net'),{forward:{key:{remoteJid:chat,id:ctx.stanzaId,participant:ctx.participant,fromMe:false},message:ctx.quotedMessage}});db.prepare("UPDATE name_requests SET state='delivered' WHERE id=?").run(row.id);await reply('✅ Resultado entregado al privado del cliente.');}
 catch(e){db.prepare("UPDATE name_requests SET state='review' WHERE id=? AND state='sending'").run(row.id);await reply('⚠️ Revisa el privado del cliente: no pude confirmar la entrega. No se reenvía ni devuelve saldo automáticamente.');}return true;
 }
 db.prepare("UPDATE name_requests SET state='review' WHERE state='sending'").run();
 return {handle,pending,observePrivate};
}
module.exports={createNameHandler};
