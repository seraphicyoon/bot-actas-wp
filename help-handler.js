'use strict';
const {canonical} = require('./message-utils');
const common=`📚 *GUÍA DE NAEVIS*

*Antes de empezar*
Cada grupo usa tienda O trámites. Para ambos necesitas dos grupos y una key por grupo. La renta debe estar activa. Los comandos se escriben tal como aparecen.

*Qué significa responder*
Abre el menú del mensaje de la persona y selecciona Responder; entonces escribe el comando. No basta escribirlo debajo del mensaje.

*Ayudantes y moderación (grupo de ventas)*
El dueño responde al miembro con .ayudante para darle permisos; .quitarayudante los retira y .ayudantes muestra la lista.
El ayudante puede /s 100, .kick, .mute 10m y .unmute respondiendo al miembro. No puede restar saldo, cambiar stock/pagos ni nombrar ayudantes.
El dueño y administradores también pueden moderar. No se puede expulsar o silenciar al dueño ni administradores.
.mute 10m / .mute 2h / .mute 1d — elimina mensajes nuevos por ese tiempo (1 minuto a 30 días).
.unmute — retira el silencio.
.kick — expulsa al miembro citado.
El bot debe ser administrador. El silencio funciona mientras esté conectado.

*Saldo y pago*
.saldo o .versaldo — tu saldo en este grupo.
/s 100 — suma saldo al cliente citado (dueño, admin o ayudante).
-s 20 — resta saldo al cliente citado (dueño o admin; no ayudantes).
/setpago Banco, cuenta y titular — guarda datos de pago (dueño/admin).
.pago — muestra esos datos. Las recargas se registran manualmente.

*Si no responde*
Verifica que el bot esté en el grupo, la renta esté vigente y estés usando el modo correcto. Un usuario silenciado verá sus mensajes eliminados. Comandos enviados desde la propia cuenta del bot se ignoran. Consulta al dueño si faltan permisos.`;
const shopGuide=`🛍️ *MODO TIENDA*

*Clientes, en ventas*
.stock — catálogo con precios y unidades.
.n Texto — anuncio con menciones en ventas (dueño/admin, no ayudantes); admite imagen o video.\n.comprar codigo — compra UNA unidad con tu saldo; llega al privado y se manda copia al grupo del dueño.
Ejemplo: .comprar monedero

*Configuración (dueño)*
.actienda mitienda — activa tienda en ventas. Alias único, sin espacios.
.actram mitienda — cambia a trámites conservando stock; primero resuelve pedidos en revisión.
En un grupo privado distinto, añade al bot y al dueño como administrador y escribe /vincular mitienda.

*Stock: solo en el privado, dueño/owner del bot*
/producto monedero 50 Monedero de regalo — código, precio y nombre.
Envía el contenido COMPLETO de una unidad en otro mensaje. Responde a ESE mensaje con /addstock monedero. Repite por cada unidad; no añadas cantidad ni contenido después del comando.
Texto, imagen o documento; máximo 16 MB. No admite una sola visualización. Se guarda en el VPS, aunque el dueño esté desconectado.
/inventario — existencias.
/verstock monedero — IDs y vista de hasta 20 unidades.
/precio monedero 60 — cambia precio.
/retirar ID — retira una unidad disponible.

*Pedidos: solo en el privado, dueño/owner*
/pedidos — últimos 20 pedidos.
/reavisar — reintenta copias pendientes al grupo privado.
/resolver ID entregado — confirma una entrega en revisión tras comprobar el privado.
/resolver ID cancelar — devuelve saldo y stock SOLO tras comprobar que NO llegó.
Si falla el envío, no se revende ni reembolsa automáticamente: queda en revisión. “Enviado” no significa leído.
.ayudatienda, .comandos y .jinni — ayuda.
Los comandos VIP, /priv, /auto y corte de trámites no se usan en tienda.`;
const procedures=`📄 *MODO TRÁMITES*

.actram mialias — activa trámites en ventas (dueño).
.comandos — formatos de pedidos. .tramites — catálogo configurado.
Actas: CURP 5 (nacimiento), CURP 6 (matrimonio), CURP 7 (defunción), CURP 8 (divorcio). Variantes NF, MF, DF y D0.
Constancia fiscal: RFC IDCIF 9.
RFC/CURP clon: DATO CLON.
Los pedidos requieren proveedor y precios configurados. La entrega depende de ese proveedor.

/nombre Nombre completo — solicitud de búsqueda MANUAL, cuesta $10 MXN de tu saldo. La owner recibe el aviso por privado; si rechaza se devuelve el cobro.

*Administración de trámites: dueño/admin, no ayudantes*
/setgrupo alias — registra alias del grupo.
/setproveedor alias — desde el grupo proveedor vincula las ventas; solo el dueño de esas ventas/owner del bot.
/precio nacimiento 12 — precio entero del servicio; /precio actas 12 cambia todas las actas.
/auto y /offauto — activa/desactiva el reenvío automático del proveedor.
/r alias — responde al archivo para reenviarlo manualmente a ventas (solo dueño de esas ventas/owner).
/corte y /clearcorte — muestra/reinicia caja. La owner puede usar /corte alias por privado.
/renapo off y /renapo on — pausa/reanuda actas de ESTE grupo.
/lealtad on y /lealtad off — programa de lealtad.
/vip y /delvip — cita/etiqueta al cliente para dar/quitar crédito VIP.
.vips — lista VIP. .deudores — deudas. /liquidado — cita al cliente para liquidar deuda.
.deuda — tu deuda. .compras — tu contador de compras.
.saldos o /saldos — lista de saldos (admin).
/priv 50 — cita al cliente para descontar saldo o registrar deuda según el sistema de trámites.
/saldo — comando antiguo para importes ENTEROS. Para recargas usa /s 100 respondiendo al cliente.
.abrir y .cerrar — permite mensajes a todos o solo administradores; el bot debe ser admin.
.n Texto — anuncio con menciones.
.grupos — aliases del dueño/owner.
/activargrupo y /desactivargrupo — activa/desactiva el grupo autorizado. No sustituyen la key de renta.
Los comandos .receta, .cescolar y .cmedico no están implementados; no se anuncian como disponibles.`;
const ownerGuide=`👑 *OWNER DEL BOT — PRIVADO*\n/avisos — recupera los avisos pendientes de /nombre en tu privado SIN volver a cobrar.
Escribe .jinni al privado desde tu número principal para registrar el chat donde recibirás los avisos.\n/r ID — responde al resultado para entregarlo al privado del cliente de una búsqueda /nombre.
/rechazar — responde al aviso de búsqueda, o usa /rechazar ID; devuelve $10 una sola vez y avisa al cliente.
/genkey 1 dia / /genkey 7 dias / /genkey 12 horas — key de un uso; de 1 minuto a 366 días.
El cliente administrador escribe /activar KEY en ventas. El tiempo comienza ahí; luego .actienda alias o .actram alias.
/rentas — grupos, clientes, estado y vencimiento UTC.
/suspender alias — suspende ese cliente y su privado aunque te haya expulsado.
/revocarkey KEY — revoca una key SIN usar.
Una key nueva renueva al mismo cliente. Al vencer bloquea funciones y avisa; conserva stock y saldos. Tus grupos están exentos si eres su propietaria registrada.
/addvendedor ya no activa rentas.
/mantenimiento o /apagado — pausa funciones, sin matar el proceso.
/prendido — reanuda funciones.
Para arrancar un proceso detenido necesitas PM2 en el VPS; no puede recibir comandos si está apagado.`;
function createHelpHandler({store,owners,loadConfig}){
 store.db.exec("CREATE TABLE IF NOT EXISTS bot_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
 const paused=()=>store.db.prepare("SELECT value FROM bot_settings WHERE key='paused'").get()?.value==='1';
 async function handle(sock,msg){const chat=msg.key.remoteJid,m=msg.message?.ephemeralMessage?.message||msg.message;const text=(m?.conversation||m?.extendedTextMessage?.text||m?.imageMessage?.caption||m?.documentMessage?.caption||'').trim().toLowerCase();const sender=canonical(msg.key.participant||chat),owner=owners.includes(sender);const reply=t=>sock.sendMessage(chat,{text:t},{quoted:msg});
 if(['/mantenimiento','/apagado','/prendido'].includes(text)){
  if(!owner){await reply('⚠️ Solo la owner del bot puede cambiar el mantenimiento.');return true;}
  store.db.prepare("INSERT INTO bot_settings VALUES('paused',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(text==='/prendido'?'0':'1');await reply(text==='/prendido'?'✅ Bot reanudado.':'⚙️ Bot en mantenimiento. Para reanudar usa /prendido.');return true;
 }
 if(text==='.jinni'||text==='.ayudatienda'){
  await reply(common);const shop=store.shop(chat);await reply(shop?.mode==='tienda'?shopGuide:procedures);
  if(owner)await reply(ownerGuide);else if(!chat.endsWith('@g.us'))await reply('Para usar el bot, añade al bot a tu grupo de ventas y activa la key que te entregue la owner con /activar KEY.');return true;
 }
 if(paused()) {if(text.startsWith('.')||text.startsWith('/')||text.startsWith('-s'))await reply('⚙️ Bot en mantenimiento. La owner debe usar /prendido.');return true;}
 return false;
 }
 return {handle,paused};
}
module.exports={createHelpHandler,common,shopGuide,procedures,ownerGuide};
