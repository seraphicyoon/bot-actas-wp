'use strict';
const {canonical}=require('./message-utils');
// Suggested selling prices only. Not an order processor and never charges a customer.
const SERVICES=Object.freeze({
 semanas:Object.freeze({name:'Semanas cotizadas detalladas',suggested:30,apiCode:"semanas_cotizadas_detalladas",plannedMode:'api'}),
 nss:Object.freeze({name:'NSS',suggested:10,apiCode:"nss",plannedMode:'api'}),
 vigencia:Object.freeze({name:'Vigencia de derechos',suggested:15,apiCode:"vigencia_derechos",plannedMode:'api'}),
 cfe:Object.freeze({name:'Recibo de luz CFE',suggested:15,apiCode:"recibo_luz",plannedMode:'api'}),
 permiso:Object.freeze({name:'Permiso sin placas 30 días',suggested:65,apiCode:null,plannedMode:'manual'}),
 rfctexto:Object.freeze({name:'RFC desde CURP (texto)',suggested:5,apiCode:"rfc_curp_texto",plannedMode:'api'})
});
// API is not connected. Every new service stays manual until an authorized integration is enabled.
const effectiveMode=()=> 'manual';
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj||{},key);
const ACTAS=['nacimiento','matrimonio','defuncion','divorcio'];
const LEGACY_NAMES={nacimiento:'Acta de nacimiento',matrimonio:'Acta de matrimonio',defuncion:'Acta de defunción',divorcio:'Acta de divorcio',sat:'RFC + IDCIF',rfcclon:'RFC CLON'};
function createPriceHandler({store,owners,loadConfig,saveConfig,allowed,basePrices={nacimiento:12,matrimonio:12,defuncion:12,divorcio:12,sat:40,rfcclon:15}}){
 async function handle(sock,msg){
  const chat=msg.key.remoteJid,m=msg.message||{},[raw,...args]=(m.conversation||m.extendedTextMessage?.text||m.imageMessage?.caption||m.videoMessage?.caption||m.documentMessage?.caption||'').trim().split(/\s+/);
  const cmd=raw.toLowerCase();if(!['/precios','/precioextra','/precio'].includes(cmd))return false;
  const reply=text=>sock.sendMessage(chat,{text});
  if(!/@(s\.whatsapp\.net|lid)$/.test(chat||'')||msg.key.fromMe){await reply('Configura los precios en el privado del bot.');return true;}
  const sender=canonical(chat),cfg=loadConfig(),alias=args[0]?.toLowerCase();
  const group=own(cfg.gruposDestino,alias)?cfg.gruposDestino[alias]:null,shop=group?store.shop(group):null;
  if(!group||!cfg.gruposAutorizados?.includes(group)||!allowed(group)||shop&&(shop.id!==group||shop.mode==='tienda')||!(owners.includes(sender)||sender===canonical(shop?.owner||cfg.propietariosGrupos?.[group]))){
   await reply('Alias no disponible o sin permiso.');return true;
  }
  const prices=cfg.preciosServiciosExtra?.[group]||{};
  if(cmd==='/precios'&&args.length===1){
   const current={...basePrices,...cfg.precios?.[group]};
   const legacy=Object.entries(LEGACY_NAMES).map(([code,name])=>'• '+name+' — *$'+current[code]+'* ('+code+')').join('\n');
   const format=([code,v])=>'• '+v.name+' — *$'+(prices[code]??v.suggested)+'*\n  Código: '+code+(own(prices,code)?'':' · sugerido');
   const entries=Object.entries(SERVICES);
   const api=entries.filter(([,v])=>v.plannedMode==='api').map(format).join('\n\n');
   const manual=entries.filter(([,v])=>v.plannedMode==='manual').map(format).join('\n\n');
   await reply('🌸 *NAEVIS | PRECIOS*\nGrupo: '+alias+'\nMoneda: MXN\n\n*📄 TRÁMITES ACTUALES*\n'+legacy+'\n\n*🔗 API PENDIENTE*\n\n'+api+'\n\n*👤 MANUAL*\n\n'+manual+'\n\n*✏️ CAMBIAR PRECIO*\n/precio '+alias+' servicio cantidad\nEjemplos:\n/precio '+alias+' actas 15\n/precio '+alias+' nss 12\n\nℹ️ Precios de venta. Los nuevos pedidos todavía no están habilitados.');return true;
  }
  const code=args[1]?.toLowerCase(),amount=Number(args[2]);
  const isActas=code==='actas'||code==='acta',isLegacy=isActas||own(LEGACY_NAMES,code),isExtra=own(SERVICES,code);
  if(!['/precio','/precioextra'].includes(cmd)||args.length!==3||(!isLegacy&&!isExtra)||!/^\d{1,6}$/.test(args[2]||'')||!Number.isSafeInteger(amount)||amount<1){
   await reply('Usa /precios alias o /precio alias servicio cantidad (entero positivo).');return true;
  }
  let label;
  if(isLegacy){
   const updated={...basePrices,...cfg.precios?.[group]};
   for(const key of isActas?ACTAS:[code])updated[key]=amount;
   cfg.precios={...cfg.precios,[group]:updated};label=isActas?'Las cuatro actas':LEGACY_NAMES[code];
  }else{
   cfg.preciosServiciosExtra={...cfg.preciosServiciosExtra,[group]:{...prices,[code]:amount}};label=SERVICES[code].name;
  }
  saveConfig(cfg);await reply('✅ '+label+': precio de venta guardado en $'+amount+' MXN.\nGrupo: '+alias);return true;
 }
 return {handle};
}
module.exports={createPriceHandler,SERVICES,effectiveMode};
