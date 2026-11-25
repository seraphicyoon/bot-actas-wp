'use strict';
const {canonical}=require('./message-utils');
function createProviderHandler({store,owners,loadConfig,saveConfig,allowed}){
 const owner=(c,id)=>canonical(store.shop(id)?.owner||c.propietariosGrupos?.[id]);
 const valid=(c,id)=>!!id&&c.gruposAutorizados?.includes(id)&&(!store.shop(id)||store.shop(id).id===id&&store.shop(id).mode!=='tienda');
 const mode=(c,id)=>c.proveedorModo?.[id]||(c.gruposProveedores?.[id]?'whatsapp':'manual');
 const pending=(c,id)=>Object.values(c.pendientes||{}).some(p=>p.grupoVentas===id);
 const may=(c,id,s)=>valid(c,id)&&allowed(id)&&(owners.includes(s)||owner(c,id)===s);
 const describe=(c,id)=>{
  const link=c.gruposProveedores?.[id],record=c.proveedorRegistro?.[id],alias=Object.entries(c.gruposDestino||{}).find(([,v])=>v===id)?.[0]||id;
  return alias+'\nModo: '+mode(c,id)+' | Renta '+(allowed(id)?'activa':'inactiva')+'\nGrupo proveedor: '+(link?(record?.group===link&&record.name?record.name+' — ':'')+link:'Sin vincular');
 };
 async function handle(sock,msg){
  const chat=msg.key.remoteJid,group=chat?.endsWith('@g.us'),direct=/@(s\.whatsapp\.net|lid)$/.test(chat||'');
  const [cmd,...args]=(msg.message?.conversation||msg.message?.extendedTextMessage?.text||'').trim().split(/\s+/);
  const command=cmd.toLowerCase();
  if(!['/proveedor','/proveedores','/setproveedor'].includes(command))return false;
  const s=canonical(group?msg.key.participant:chat),reply=text=>sock.sendMessage(chat,{text});
  try{
   if(!s||msg.key.fromMe)return true;
   let c=loadConfig();
   if(command==='/proveedores'){
    if(!direct)throw Error('Consulta tus proveedores por privado.');
    const global=args[0]?.toLowerCase()==='global';
    if(global&&!owners.includes(s))throw Error('Comando no disponible.');
    if(args.length!==(global?1:0))throw Error('Usa /proveedores.');
    const ids=[...new Set([...Object.values(c.gruposDestino||{}),...Object.keys(c.gruposProveedores||{})])].filter(id=>valid(c,id)&&(global||owner(c,id)===s));
    if(!ids.length)await reply('No hay grupos de trámites registrados.');
    for(let i=0;i<ids.length;i+=8)await reply('📋 *PROVEEDORES REGISTRADOS*\n\n'+ids.slice(i,i+8).map(id=>describe(c,id)).join('\n\n'));
    return true;
   }
   const alias=args[0]?.toLowerCase(),id=Object.prototype.hasOwnProperty.call(c.gruposDestino||{},alias||'')?c.gruposDestino[alias]:null;
   if(!may(c,id,s))throw Error('Alias no disponible o no tienes permiso sobre ese grupo.');
   if(command==='/setproveedor'){
    if(!group||args.length!==1)throw Error('Usa /setproveedor alias en el grupo proveedor.');
    if(chat===id||store.shop(chat)||c.gruposAutorizados?.includes(chat))throw Error('Usa un grupo proveedor distinto del de ventas.');
    if(pending(c,id)&&c.gruposProveedores?.[id]!==chat)throw Error('Resuelve los pedidos pendientes antes de cambiar de proveedor.');
    const meta=await sock.groupMetadata(chat);
    const member=meta.participants?.find(p=>[p.id,p.phoneNumber,p.lid].some(v=>v&&canonical(v)===s));
    if(!['admin','superadmin'].includes(member?.admin))throw Error('El dueño de ventas debe tener autorización de administrador en el grupo proveedor.');
    c=loadConfig();
    if(!may(c,id,s)||c.gruposDestino?.[alias]!==id||store.shop(chat)||c.gruposAutorizados?.includes(chat)||pending(c,id)&&c.gruposProveedores?.[id]!==chat)throw Error('La configuración cambió; inténtalo de nuevo.');
    c.gruposProveedores={...c.gruposProveedores,[id]:chat};
    c.proveedorRegistro={...c.proveedorRegistro,[id]:{group:chat,name:String(meta.subject||'').slice(0,150),linkedAt:new Date().toISOString()}};
    c.proveedorModo={...c.proveedorModo,[id]:'whatsapp'};saveConfig(c);
    await reply('✅ Proveedor vinculado. Naevis registra el nombre e ID del grupo para administrar la integración, no su lista de integrantes.');
    return true;
   }
   if(!direct||args.length!==2)throw Error('En privado usa /proveedor alias whatsapp, manual o estado.');
   const choice=args[1].toLowerCase();
   if(choice==='estado'){await reply(describe(c,id)+'\nAutomatización: '+(c.autoMode?.[id]?'activa':'inactiva'));return true;}
   if(choice==='api')throw Error('API aún no habilitada. No envíes claves por WhatsApp.');
   if(!['whatsapp','manual'].includes(choice))throw Error('Elige whatsapp, manual o estado.');
   if(choice==='whatsapp'&&!c.gruposProveedores?.[id])throw Error('Primero vincula un grupo proveedor.');
   if(pending(c,id)&&choice!==mode(c,id))throw Error('Resuelve los pedidos pendientes antes de cambiar de modo.');
   c.proveedorModo={...c.proveedorModo,[id]:choice};saveConfig(c);await reply('✅ Modo actualizado: '+choice+'. El enlace anterior se conserva.');
   return true;
  }catch(e){await reply('⚠️ '+e.message);return true;}
 }
 return {handle};
}
module.exports={createProviderHandler};
