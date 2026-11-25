'use strict';
const {canonical}=require('./message-utils');
const categories={
 rent:['/activar','/genkey','/suspender','/rentas','/revocarkey','/addvendedor'],
 maintenance:['/mantenimiento','/apagado','/prendido'],
 menu:['.ayuda','.comandos','.ayudatienda','.jinni','.modo'],
 moderation:['.ayudante','.quitarayudante','.ayudantes','.kick','.mute','.unmute'],
 stickers:['.stickers','.ayudastickers','/stickeraudio'],
 videos:['.videos','.ayudavideos','.tiktok','.ayudatiktok'],
 welcome:['.bienvenida'],
 general:['.n','.abrir','.cerrar','.grupos'],
 activation:['.actienda','.actram','/vincular'],
 shared:['.saldo','.versaldo','.pago','/s','-s','/setpago'],
 shopSales:['.comprar'],
 shopPrivate:['/producto','/addstock','/inventario','/verstock','/retirar','/pedidos','/resolver','/reavisar'],
 procedures:['/nombre','.tramites','/corte','/clearcorte','/renapo','/vip','/delvip','.vips','/liquidado','.deudores','.deuda','/auto','/offauto','/lealtad','.compras','/saldo','/priv','.saldos','/saldos'],
 provider:['/r','/setproveedor'],
 ownerPrivate:['/avisos','/rechazar'],
 legacy:['/setgrupo','/activargrupo','/desactivargrupo','/precio','.stock','/delvendedor','.ver']
};
const byCommand=new Map(Object.entries(categories).flatMap(([name,commands])=>commands.map(c=>[c,name])));
function commandOf(msg){
 const m=msg.message||{},text=(m.conversation||m.extendedTextMessage?.text||m.imageMessage?.caption||m.videoMessage?.caption||m.documentMessage?.caption||'').trim();
 const command=text.split(/\s+/,1)[0].toLowerCase();
 return {command,text,category:byCommand.get(command)||'other'};
}
function contextOf(store,chat,config){
 if(!chat?.endsWith('@g.us'))return {mode:'private',group:false,shop:null};
 const shop=store.shop(chat),authorized=!!config.gruposAutorizados?.includes(chat);
 const mode=shop?.admin_group===chat&&shop.id!==chat?'stock':shop?.mode==='tienda'?'tienda':shop?.mode==='tramites'?'tramites':authorized?'legacy':'external';
 return {mode,group:true,shop,authorized};
}
async function roleOf({sock,msg,ctx,owners,config,isHelper}){
 const id=canonical(msg.key.participant||msg.key.remoteJid),chat=msg.key.remoteJid;
 if(!id)return 'member';
 if(owners.includes(id))return 'owner';
 if(!ctx.group)return 'member';
 if(id===canonical(ctx.shop?.owner||config.propietariosGrupos?.[chat]))return 'groupOwner';
 if(isHelper(chat,id))return 'helper';
 try{const members=(await sock.groupMetadata(chat)).participants;
 const p=members.find(p=>[p.id,p.phoneNumber,p.lid].some(x=>x&&canonical(x)===id));
 if(['admin','superadmin'].includes(p?.admin))return 'admin';
 }catch{}
 return 'member';
}
const managers=['owner','groupOwner','admin'];
function createRouter({store,owners,loadConfig,rentas,moderacion,ayuda,stickers,tiktok,bienvenida,anuncios,nombres,tiendas}){
 async function handle(sock,msg){
  const chat=msg.key.remoteJid;if(!chat)return true;
  const {command,text,category}=commandOf(msg);
  const cfg=loadConfig(),ctx=contextOf(store,chat,cfg);
  const reply=t=>sock.sendMessage(chat,{text:t},{quoted:msg});
  // Preserve rent activation, mute enforcement, maintenance and private owner registration.
  if(!ctx.group&&await ayuda.handle(sock,msg))return true;
  if(await rentas.handle(sock,msg))return true;
  if(await moderacion.handle(sock,msg))return true;
  if(ctx.group&&await ayuda.handle(sock,msg))return true;
  if(category==='stickers'&&await stickers.handle(sock,msg))return true;
  if(category==='welcome'&&await bienvenida.handle(sock,msg))return true;
  if((category==='videos'||category==='other')&&await tiktok.handle(sock,msg))return true;
  if(command==='.n'&&await anuncios.handle(sock,msg))return true;
  if(category==='general'&&['.abrir','.cerrar'].includes(command)&&ctx.group){
   if(!ctx.authorized||ctx.mode==='stock'||!rentas.allowed(chat)){await reply('⚠️ Este comando requiere un grupo autorizado y activo.');return true;}
   const role=await roleOf({sock,msg,ctx,owners,config:cfg,isHelper:moderacion.isHelper});
   if(!managers.includes(role)&&!cfg.superAdmins?.includes(canonical(msg.key.participant))){await reply('⚠️ Solo el dueño o administrador puede abrir o cerrar el grupo.');return true;}
   if(text.toLowerCase()!==command){await reply('Usa '+command+' sin argumentos.');return true;}
   try{await sock.groupSettingUpdate(chat,command==='.cerrar'?'announcement':'not_announcement');await reply(command==='.cerrar'?'🔒 Grupo cerrado.':'🔓 Grupo abierto.');}
   catch{await reply('⚠️ No pude cambiar el grupo. Verifica que el bot sea administrador.');}
   return true;
  }
  if(command==='.grupos'){
   const sender=canonical(msg.key.participant||chat),global=owners.includes(sender)||cfg.superAdmins?.includes(sender);
   const entries=Object.entries(cfg.gruposDestino||{}).filter(([,id])=>global||!!sender&&sender===canonical(store.shop(id)?.owner||cfg.propietariosGrupos?.[id]));
   await reply(entries.length?'📂 *TUS GRUPOS*\n\n'+entries.map(([alias,id])=>alias+' — '+contextOf(store,id,cfg).mode).join('\n'):'No tienes grupos registrados con alias.');return true;
  }
  if(ctx.mode==='tienda'||ctx.mode==='stock'){
   if(category==='procedures'||category==='provider'){
    await reply('⚠️ Este comando corresponde a trámites, no a '+(ctx.mode==='stock'?'stock privado':'tienda')+'. Escribe .ayuda.');return true;
   }
   if(ctx.mode==='stock'&&category==='shopSales'){await reply('⚠️ Usa este comando en el grupo de ventas.');return true;}
   if(ctx.mode==='tienda'&&(category==='shopPrivate'||command==='/precio')){await reply('⚠️ Usa este comando en el grupo privado de stock vinculado.');return true;}
  }else if(ctx.mode==='tramites'||ctx.mode==='legacy'){
   if(category==='shopSales'||category==='shopPrivate'){await reply('⚠️ Este comando es exclusivo del modo tienda. Escribe .ayuda.');return true;}
  }
  // Name handling must precede mode changes and manual /r; shop handler still owns all inventory and balance operations.
  if(await nombres.handle(sock,msg))return true;
  if(await tiendas.handle(sock,msg))return true;
  // Legacy business/provider messages and commands continue through the existing handler.
  return false;
 }
 return {handle};
}
module.exports={createRouter,commandOf,contextOf,roleOf,categories};
