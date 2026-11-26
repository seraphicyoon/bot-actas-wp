'use strict';
const {canonical}=require('./message-utils');
// Suggested selling prices only. Not an order processor and never charges a customer.
const SERVICES=Object.freeze({
 semanas:Object.freeze({name:'Semanas cotizadas detalladas',suggested:30}),
 nss:Object.freeze({name:'NSS',suggested:10}),
 vigencia:Object.freeze({name:'Vigencia de derechos',suggested:15}),
 cfe:Object.freeze({name:'Recibo de luz CFE',suggested:15}),
 permiso:Object.freeze({name:'Permiso sin placas 30 días',suggested:65}),
 rfctexto:Object.freeze({name:'RFC desde CURP (texto)',suggested:5})
});
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj||{},key);
function createPriceHandler({store,owners,loadConfig,saveConfig,allowed}){
 async function handle(sock,msg){
  const chat=msg.key.remoteJid,m=msg.message||{},[raw,...args]=(m.conversation||m.extendedTextMessage?.text||'').trim().split(/\s+/);
  const cmd=raw.toLowerCase();if(!['/precios','/precioextra'].includes(cmd))return false;
  const reply=text=>sock.sendMessage(chat,{text});
  if(!/@(s\.whatsapp\.net|lid)$/.test(chat||'')||msg.key.fromMe){await reply('Configura los precios en el privado del bot.');return true;}
  const sender=canonical(chat),cfg=loadConfig(),alias=args[0]?.toLowerCase();
  const group=own(cfg.gruposDestino,alias)?cfg.gruposDestino[alias]:null,shop=group?store.shop(group):null;
  if(!group||!cfg.gruposAutorizados?.includes(group)||!allowed(group)||shop&&(shop.id!==group||shop.mode==='tienda')||!(owners.includes(sender)||sender===canonical(shop?.owner||cfg.propietariosGrupos?.[group]))){
   await reply('Alias no disponible o sin permiso.');return true;
  }
  const prices=cfg.preciosServiciosExtra?.[group]||{};
  if(cmd==='/precios'&&args.length===1){
   const lines=Object.entries(SERVICES).map(([code,v])=>code+' — '+v.name+': $'+(prices[code]??v.suggested)+' MXN'+(own(prices,code)?'':' (sugerido)'));
   await reply('💰 *PRECIOS DE SERVICIOS ADICIONALES — '+alias+'*\n\n'+lines.join('\n')+'\n\n/precioextra '+alias+' servicio cantidad\nSolo configuración de precios; pedidos API aún no habilitados.');return true;
  }
  const code=args[1]?.toLowerCase(),amount=Number(args[2]);
  if(cmd!=='/precioextra'||args.length!==3||!own(SERVICES,code)||!/^\d{1,6}$/.test(args[2]||'')||!Number.isSafeInteger(amount)||amount<1){
   await reply('Usa /precios alias o /precioextra alias servicio cantidad (entero positivo).');return true;
  }
  cfg.preciosServiciosExtra={...cfg.preciosServiciosExtra,[group]:{...prices,[code]:amount}};
  saveConfig(cfg);await reply('✅ '+SERVICES[code].name+': precio de venta guardado en $'+amount+' MXN. No cambia el costo del proveedor.');return true;
 }
 return {handle};
}
module.exports={createPriceHandler,SERVICES};
