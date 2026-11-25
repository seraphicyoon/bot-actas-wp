'use strict';
const {canonical}=require('./message-utils');
const {contextOf,roleOf}=require('./command-router');
const GENERAL='🌸 *NAEVIS — COMANDOS GENERALES*\n\n.ayuda / .comandos — guía según este chat y tus permisos\n.modo — identifica el modo actual\n.ayudastickers — crear stickers con sonido\n.ayudavideos — descargar videos de enlaces compatibles\n\nLas funciones de stickers y videos deben estar activadas en el grupo.';
const ADMIN='🛠️ *ADMINISTRACIÓN GENERAL*\n.n Texto — anuncio con menciones\n.abrir / .cerrar — abrir o cerrar grupo\n.stickers on/off — activar stickers\n.videos on/off — activar descargas\n.kick / .mute 10m / .unmute — responde al miembro\n.ayudante / .quitarayudante / .ayudantes — solo dueño\n.bienvenida — configura por privado si eres dueño registrado\n.grupos — tus aliases registrados';
const SHOP='🛍️ *MODO TIENDA — VENTAS*\n.stock — catálogo\n.comprar código — compra con saldo y recibe por privado\n.saldo — saldo\n.pago — datos de pago';
const SHOP_ADMIN='🛠️ *ADMINISTRACIÓN DE TIENDA*\n/s cantidad — suma saldo respondiendo al cliente\n-s cantidad — resta saldo respondiendo al cliente\n/setpago datos — datos de pago\n.actram alias — cambiar modo (dueño, sin pedidos pendientes)\n/vincular alias — en otro grupo, vincula stock privado';
const STOCK='📦 *STOCK PRIVADO — TIENDA*\n/producto código precio nombre\n/addstock código — responde a una unidad completa\n/inventario /verstock código /retirar ID\n/precio código precio\n/pedidos /resolver ID entregado|cancelar\n/reavisar — reintenta avisos\n\nLas compras se hacen en ventas. Resuelve solo tras verificar la entrega.';
const PROC='📄 *MODO TRÁMITES*\n.tramites — catálogo\n.saldo / .versaldo — saldo\n.pago — datos de pago\n/nombre Nombre completo — búsqueda manual ($10 MXN)\n.deuda / .compras — deuda y contador\n\nFormatos de actas:\n• CURP 5 — Nacimiento\n• CURP 6 — Matrimonio\n• CURP 7 — Defunción\n• CURP 8 — Divorcio\n\nOtros formatos: RFC IDCIF 9; DATO CLON.';
const PROC_ADMIN='🛠️ *ADMINISTRACIÓN DE TRÁMITES*\n/s cantidad y -s cantidad — responde al cliente\n/setpago datos /precio servicio importe\n/corte /clearcorte /saldos\n/renapo on/off /auto /offauto\n/lealtad on/off /vip /delvip /vips /deudores /liquidado /priv\n/setgrupo alias /r alias\n.actienda alias — cambia a tienda si eres dueño y no hay búsquedas pendientes';
const PROVIDERS='🔗 *PROVEEDORES — PROPIETARIO*\n/setproveedor alias — en el grupo proveedor (como administrador)\n/proveedores — por privado\n/proveedor alias whatsapp|manual|estado — por privado';
function makeMenus({ctx,role,ownerGuide,common,shopGuide,procedures,command='.ayuda'}){
 const owner=role==='owner',manager=['owner','groupOwner','admin'].includes(role),groupOwner=['owner','groupOwner'].includes(role),helper=role==='helper';
 if(ctx.mode==='private'){
  if(owner&&command==='.jinni')return [GENERAL,ADMIN,SHOP,SHOP_ADMIN,STOCK,PROC,PROC_ADMIN,PROVIDERS,ownerGuide+'\n/proveedores global — registro de integraciones'];
  return ['🌸 *NAEVIS — CHAT PRIVADO*\n.bienvenida — configurar tus grupos como propietario\n.grupos — tus aliases\n/proveedores — tus proveedores, si eres propietario\n\nConsulta .ayuda en tu grupo para ver los comandos disponibles.'];
 }
 if(ctx.mode==='external')return [owner||manager?'🌸 *GRUPO SIN AUTORIZAR*\n/activar KEY — activa la renta como administrador.':'🌸 Este grupo no tiene un servicio de Naevis autorizado.'];
 if(ctx.mode==='stock')return [groupOwner?STOCK:'📦 Este es el grupo privado de stock. Solo el dueño administra el inventario.'];
 const out=[GENERAL];
 if(manager)out.push(ADMIN.replace('.ayudante / .quitarayudante / .ayudantes — solo dueño',groupOwner?'.ayudante / .quitarayudante / .ayudantes — gestionar ayudantes':'El dueño gestiona los ayudantes.'));
 if(helper)out.push('🛠️ *AYUDANTE*\n.kick / .mute 10m / .unmute — moderación\n/s cantidad — sumar saldo respondiendo al cliente');
 if(ctx.mode==='tienda'){out.push(SHOP);if(manager)out.push(groupOwner?SHOP_ADMIN:SHOP_ADMIN.split('\n').filter(l=>!l.startsWith('.actram')&&!l.startsWith('/vincular')).join('\n'));}
 if(ctx.mode==='tramites'){out.push(PROC);if(groupOwner)out.push(PROVIDERS);if(manager)out.push(groupOwner?PROC_ADMIN:PROC_ADMIN.split('\n').filter(l=>!l.startsWith('.actienda')).join('\n'));}
 if(ctx.mode==='legacy'){
  if(groupOwner)out.push(PROVIDERS);
  out.push('💬 *SIN MODO EXPLÍCITO*\nPuedes usar funciones generales sin activar tienda ni trámites. Para no interrumpir los grupos antiguos, los comandos de trámites anteriores conservan su funcionamiento; escribe .comandos para verlos.\n'+(manager?'.actienda alias — tienda\n.actram alias — trámites\n':''));
  if(command==='.comandos'){out.push(PROC);if(manager)out.push(PROC_ADMIN);}
 }
 return out;
}
function modeLabel(ctx){return ({private:'CHAT PRIVADO',external:'SIN AUTORIZAR',stock:'STOCK PRIVADO',tienda:'TIENDA',tramites:'TRÁMITES',legacy:'SIN MODO EXPLÍCITO (compatibilidad anterior)'})[ctx.mode];}
module.exports={makeMenus,modeLabel};
