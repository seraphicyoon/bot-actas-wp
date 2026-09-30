'use strict';
const {canonical} = require('./message-utils');
function muteDuration(value='10m'){
 const m=value.toLowerCase().match(/^(\d+)(m|h|d)$/);if(!m)throw Error('Usa .mute 10m, .mute 2h o .mute 1d respondiendo al usuario.');
 const n=Number(m[1])*({m:60000,h:3600000,d:86400000}[m[2]]);if(!Number.isSafeInteger(n)||n<60000||n>30*86400000)throw Error('El tiempo debe ser de 1 minuto a 30 días.');return n;
}
function createModerationHandler({store,owners,loadConfig,now=Date.now}){
 const db=store.db;db.exec(`CREATE TABLE IF NOT EXISTS helpers(shop TEXT NOT NULL,customer TEXT NOT NULL,PRIMARY KEY(shop,customer));
 CREATE TABLE IF NOT EXISTS mutes(shop TEXT NOT NULL,customer TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(shop,customer));`);
 const isHelper=(group,user)=>!!db.prepare('SELECT 1 FROM helpers WHERE shop=? AND customer=?').get(group,canonical(user));
 async function handle(sock,msg){const group=msg.key.remoteJid;if(!group?.endsWith('@g.us'))return false;
 const sender=canonical(msg.key.participant),shop=store.shop(group),config=loadConfig();if(shop?.id!==group&&!config.gruposAutorizados?.includes(group))return false;
 const m=msg.message?.ephemeralMessage?.message||msg.message;const text=(m?.conversation||m?.extendedTextMessage?.text||'').trim();const args=text.split(/\s+/),cmd=args[0].toLowerCase();
 const global=owners.includes(sender),owner=shop?.owner||config.propietariosGrupos?.[group];
 const mute=db.prepare('SELECT expires FROM mutes WHERE shop=? AND customer=?').get(group,sender);
 const commands=['.ayudante','.quitarayudante','.ayudantes','.kick','.mute','.unmute'];
 if(!mute&&!commands.includes(cmd))return false;
 const reply=t=>sock.sendMessage(group,{text:t},{quoted:msg});
 try{
 const members=(await sock.groupMetadata(group)).participants;
 const find=id=>members.find(p=>[p.id,p.phoneNumber,p.lid].some(x=>canonical(x)===id));
 const admin=p=>['admin','superadmin'].includes(p?.admin);
 const author=find(sender),isOwner=global||sender===owner;
 const protectedUser=id=>id===owner||owners.includes(id)||admin(find(id));
 if(mute&&mute.expires>now()){
  if(protectedUser(sender)){db.prepare('DELETE FROM mutes WHERE shop=? AND customer=?').run(group,sender);}
  else{await sock.sendMessage(group,{delete:msg.originalKey||msg.key});return true;}
 }else if(mute)db.prepare('DELETE FROM mutes WHERE shop=? AND customer=?').run(group,sender);
 if(!commands.includes(cmd))return false;
 if(cmd==='.ayudantes'){if(!isOwner)throw Error('Solo el dueño puede consultar los ayudantes.');const rows=db.prepare('SELECT customer FROM helpers WHERE shop=?').all(group);await reply(rows.length?'👥 *AYUDANTES*\n'+rows.map(r=>r.customer).join('\n'):'No hay ayudantes.');return true;}
 const target=canonical(m?.extendedTextMessage?.contextInfo?.participant);if(!target||!find(target))throw Error('Responde al mensaje de una persona de este grupo.');
 if(cmd==='.ayudante'||cmd==='.quitarayudante'){
  if(!isOwner)throw Error('Solo el dueño de esta tienda puede nombrar o quitar ayudantes.');
  if(cmd==='.ayudante'){if(protectedUser(target))throw Error('El dueño y los administradores ya tienen su propio rol.');db.prepare('INSERT OR IGNORE INTO helpers VALUES(?,?)').run(group,target);await reply('✅ *AYUDANTE ASIGNADO*\nPuede sumar saldo con /s cantidad y moderar con .kick, .mute y .unmute, respondiendo al usuario. Solo en este grupo.');}
  else{db.prepare('DELETE FROM helpers WHERE shop=? AND customer=?').run(group,target);await reply('✅ Permisos de ayudante retirados.');}return true;
 }
 const helper=isHelper(group,sender);
 if(!(isOwner||(!helper&&admin(author))||(['.kick','.mute','.unmute'].includes(cmd)&&helper)))throw Error('No tienes permiso para usar este comando.');
 if(protectedUser(target)||target===sender)throw Error('No puedes moderar al dueño, administradores ni a ti mismo.');
 const botIds=[sock.user?.id,sock.user?.lid].map(canonical);
 if(!botIds.some(id=>id && admin(find(id))))throw Error('El bot debe ser administrador del grupo para expulsar o eliminar mensajes.');
 if(cmd==='.kick'){const results=await sock.groupParticipantsUpdate(group,[find(target).id],'remove');
 if(results?.some(r=>r.status && String(r.status)!=='200'))throw Error('WhatsApp rechazó la expulsión; verifica permisos y que el miembro siga en el grupo.');db.prepare('DELETE FROM helpers WHERE shop=? AND customer=?').run(group,target);db.prepare('DELETE FROM mutes WHERE shop=? AND customer=?').run(group,target);await reply('🚪 Usuario expulsado del grupo.');return true;}
 if(cmd==='.unmute'){db.prepare('DELETE FROM mutes WHERE shop=? AND customer=?').run(group,target);await reply('🔊 Silencio retirado.');return true;}
 if(args.length>2)throw Error('Usa .mute 10m respondiendo al usuario.');const time=muteDuration(args[1]);
 db.prepare('INSERT INTO mutes VALUES(?,?,?) ON CONFLICT(shop,customer) DO UPDATE SET expires=excluded.expires').run(group,target,now()+time);
 await reply(`🔇 *USUARIO SILENCIADO*\n\n👤 Usuario: ${target.split('@')[0]}\n⏳ Tiempo: ${args[1]||'10m'}\n\nSus mensajes, fotos, videos, stickers, audios y documentos se eliminarán automáticamente en este grupo mientras el bot esté conectado.`);return true;
 }catch(e){await reply('⚠️ '+e.message);return true;}}
 return {handle,isHelper};
}
module.exports={createModerationHandler,muteDuration};
