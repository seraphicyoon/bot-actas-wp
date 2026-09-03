const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');
const qrcode = require('qrcode-terminal');

process.on('unhandledRejection', (reason) => { console.log('⚠️ Error bloqueado:', reason); });

const port = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Naevis Bot Activo - Baileys Puro'); }).listen(port);

const SÚPER_ADMINS_NATOS = ['525658405318@c.us', '5215658405318@c.us', '91440457773103@lid'];
const PRECIOS_BASE = { nacimiento: 12, nacimiento_nf: 15, matrimonio: 12, matrimonio_mf: 15, defuncion: 12, defuncion_df: 15, divorcio: 12, divorcio_d0: 15, sat: 40, rfcclon: 15, receta: 15, cescolar: 15, cmedico: 15 };

const CARPETA_DATOS = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const PATH_SALDOS = path.join(CARPETA_DATOS, 'saldos.json');
const PATH_CONFIG = path.join(CARPETA_DATOS, 'config.json');

function cargarSaldos() { try { if (fs.existsSync(PATH_SALDOS)) { const d = fs.readFileSync(PATH_SALDOS, 'utf8').trim(); return d === "" || d === "{}" ? {} : JSON.parse(d); } } catch (e) {} return {}; }
function guardarSaldos(saldos) { try { fs.writeFileSync(PATH_SALDOS, JSON.stringify(saldos, null, 4), 'utf8'); } catch (e) {} }

function cargarConfig() {
    try {
        if (fs.existsSync(PATH_CONFIG)) {
            let c = JSON.parse(fs.readFileSync(PATH_CONFIG, 'utf8'));
            c.gruposDestino = c.gruposDestino || {}; c.precios = c.precios || {}; c.propietariosGrupos = c.propietariosGrupos || {};
            c.notificadoresGrupos = c.notificadoresGrupos || {}; c.stockGrupos = c.stockGrupos || {}; c.pagosGrupos = c.pagosGrupos || {}; c.tramitesGrupos = c.tramitesGrupos || {};
            c.gruposProveedores = c.gruposProveedores || {}; 
            c.pendientes = c.pendientes || {}; 
            c.autoMode = c.autoMode || {}; 
            c.comprasUsuarios = c.comprasUsuarios || {}; 
            c.loyaltyMode = c.loyaltyMode || {}; 
            c.vips = c.vips || {}; 
            c.deudas = c.deudas || {}; 
            return c;
        }
    } catch (e) {}
    const init = { gruposAutorizados: [], vendedores: [], superAdmins: [], gruposDestino: {}, precios: {}, propietariosGrupos: {}, notificadoresGrupos: {}, stockGrupos: {}, pagosGrupos: {}, tramitesGrupos: {}, gruposProveedores: {}, pendientes: {}, autoMode: {}, comprasUsuarios: {}, loyaltyMode: {}, vips: {}, deudas: {} };
    fs.writeFileSync(PATH_CONFIG, JSON.stringify(init, null, 4), 'utf8'); return init;
}
function guardarConfig(config) { try { fs.writeFileSync(PATH_CONFIG, JSON.stringify(config, null, 4), 'utf8'); } catch (e) {} }

const toBaileys = (id) => id ? id.replace('@c.us', '@s.whatsapp.net') : '';
const toViejo = (id) => id ? id.replace('@s.whatsapp.net', '@c.us') : '';

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(CARPETA_DATOS, 'sesion_naevis_final'));
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'error' }), 
        browser: ["NaevisPro", "Chrome", "3.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n======================================================');
            console.log('📌 ESCANEA ESTE CÓDIGO QR DIRECTAMENTE EN TU TERMINAL:');
            console.log('======================================================\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (new Boom(lastDisconnect.error))?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) iniciarBot();
        } else if (connection === 'open') {
            console.log('🚀 ¡MOTOR DESDE CERO EN LÍNEA!');
        }
    });

    sock.ev.on('groups.update', async (updates) => {
        let config = cargarConfig();
        for (const update of updates) {
            if (!config.gruposAutorizados.includes(update.id)) continue;
            if (update.announce !== undefined) {
                setTimeout(async () => {
                    try {
                        if (update.announce) await sock.sendMessage(update.id, { text: '🔒 *LA TIENDA HA CERRADO* 🔒\nPor el momento los administradores han pausado los pedidos.' });
                        else await sock.sendMessage(update.id, { text: '🔓 *¡LA TIENDA ESTÁ ABIERTA!* 🔓\nEl grupo está disponible nuevamente.' });
                    } catch (e) {}
                }, 2000);
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const chatId = msg.key.remoteJid;
        const esGrupo = chatId.endsWith('@g.us');
        const senderBaileys = msg.key.participant || msg.key.remoteJid;
        const senderViejo = toViejo(senderBaileys);

        let textoMensaje = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.documentMessage?.caption || "";
        textoMensaje = textoMensaje.trim();

        const responder = async (texto) => { await sock.sendMessage(chatId, { text: texto }, { quoted: msg }); };

        const extraerIdCitado = () => {
            const p = msg.message.extendedTextMessage?.contextInfo?.participant;
            return p ? toViejo(p) : null;
        };

        let configSistema = cargarConfig();
        let saldosUsuarios = cargarSaldos();

        // 1. AUTO-ENTREGA DE PDFS
        const docMsg = msg.message.documentMessage;
        if (docMsg && docMsg.fileName) {
            const fileNameUpper = docMsg.fileName.toUpperCase();
            if (configSistema.pendientes) {
                for (const [idTramite, datos] of Object.entries(configSistema.pendientes)) {
                    if (fileNameUpper.includes(idTramite.toUpperCase())) {
                        const grupoVentas = datos.grupoVentas;
                        const cliente = datos.cliente;

                        if (configSistema.autoMode && configSistema.autoMode[grupoVentas]) {
                            const msgToForward = { key: msg.key, message: msg.message };
                            try {
                                await sock.sendMessage(grupoVentas, { forward: msgToForward });
                                await sock.sendMessage(grupoVentas, { text: `✅ ¡Tu trámite está listo! @${cliente.split('@')[0]}`, mentions: [toBaileys(cliente)] });
                                delete configSistema.pendientes[idTramite];
                                guardarConfig(configSistema);
                            } catch (e) { console.log('Error auto-reenviando:', e); }
                        }
                        break; 
                    }
                }
            }
        }

        // 2. AUTO-REEMBOLSOS
        if (textoMensaje) {
            const msgTextoLower = textoMensaje.toLowerCase();
            const esMensajeDeError = msgTextoLower.includes('no se encontró') || msgTextoLower.includes('no se encontro') || msgTextoLower.includes('no esta en sistema') || msgTextoLower.includes('no se encuentra');
            
            if (esMensajeDeError && configSistema.pendientes) {
                for (const [idTramite, datos] of Object.entries(configSistema.pendientes)) {
                    if (textoMensaje.toUpperCase().includes(idTramite.toUpperCase())) {
                        const grupoVentas = datos.grupoVentas;
                        const cliente = datos.cliente;
                        const costo = datos.costo;

                        if (configSistema.autoMode && configSistema.autoMode[grupoVentas]) {
                            try {
                                let fuePorDeuda = false;
                                if (configSistema.deudas && configSistema.deudas[grupoVentas] && configSistema.deudas[grupoVentas][cliente] >= costo) {
                                    configSistema.deudas[grupoVentas][cliente] -= costo;
                                    guardarConfig(configSistema);
                                    fuePorDeuda = true;
                                } else {
                                    if (!saldosUsuarios[grupoVentas]) saldosUsuarios[grupoVentas] = {};
                                    if (!saldosUsuarios[grupoVentas][cliente]) saldosUsuarios[grupoVentas][cliente] = 0;
                                    saldosUsuarios[grupoVentas][cliente] += costo;
                                    guardarSaldos(saldosUsuarios);
                                }

                                if (configSistema.loyaltyMode && configSistema.loyaltyMode[grupoVentas]) {
                                    if (configSistema.comprasUsuarios && configSistema.comprasUsuarios[grupoVentas] && configSistema.comprasUsuarios[grupoVentas][cliente] > 0) {
                                        configSistema.comprasUsuarios[grupoVentas][cliente] -= 1;
                                    }
                                }

                                let estadoFinanciero = fuePorDeuda 
                                    ? `💸 Se ha perdonado/restado *$${costo}.00* de tu deuda acumulada.\n⚠️ Deuda actual: $${configSistema.deudas[grupoVentas][cliente]}.00`
                                    : `💰 Se ha devuelto automáticamente *$${costo}.00* a tu saldo.\n🔋 Saldo actual: $${saldosUsuarios[grupoVentas][cliente]}.00`;

                                const avisoReembolso = `⚠️ *TRÁMITE NO ENCONTRADO*\n@${cliente.split('@')[0]}, el sistema nos indica que el trámite con identificador *${idTramite}* no se encontró.\n\n${estadoFinanciero}`;
                                await sock.sendMessage(grupoVentas, { text: avisoReembolso, mentions: [toBaileys(cliente)] });

                                delete configSistema.pendientes[idTramite];
                                guardarConfig(configSistema);
                            } catch (e) { console.log('Error en auto-reembolso:', e); }
                        }
                        break; 
                    }
                }
            }
        }

        if (!textoMensaje) return;

        let esAdminDelGrupo = false;
        let participantesGrupo = [];
        if (esGrupo) {
            try {
                const meta = await sock.groupMetadata(chatId);
                participantesGrupo = meta.participants;
                const yo = participantesGrupo.find(p => p.id === sock.user.id.split(':')[0] + '@s.whatsapp.net');
                if (yo && (yo.admin === 'admin' || yo.admin === 'superadmin')) esAdminDelGrupo = true;
            } catch (e) {}
        }

        const deMiNumero = SÚPER_ADMINS_NATOS.includes(senderViejo) || configSistema.superAdmins?.includes(senderViejo);
        const esDuenioDelGrupo = esGrupo && configSistema.propietariosGrupos && configSistema.propietariosGrupos[chatId] === senderViejo;
        const tienePermisoOperativo = deMiNumero || esDuenioDelGrupo || configSistema.vendedores?.includes(senderViejo) || esAdminDelGrupo;
        const esGrupoAutorizado = configSistema.gruposAutorizados.includes(chatId);

        // ==========================================
        // COMANDOS DE ADMINISTRACIÓN DE GRUPO (Restaurados)
        // ==========================================
        
        if (textoMensaje.toLowerCase().startsWith('.n ') && tienePermisoOperativo && esGrupo) {
            const anuncio = textoMensaje.slice(3).trim();
            if (!anuncio) return await responder('⚠️ Escribe el mensaje.');
            try {
                const mentions = participantesGrupo.map(p => p.id);
                const footer = `\n\n│ 𝑁𝑎𝑒𝑣𝑖𝑠 𝐵𝑜𝑡\n│ ${new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' })} (MX)\n│ 👤 Enviado por: @${senderBaileys.split('@')[0]}`;
                const textoEstetico = anuncio + footer;
                const fakeQuote = { key: { fromMe: false, participant: '0@s.whatsapp.net', id: '1234567890123456' }, message: { locationMessage: { name: 'WhatsApp ✅', address: '📢 NOTIFICACIÓN' } } };

                let isMedia = false;
                let mediaType = null;
                let mediaMsg = null;

                if (msg.message.imageMessage) { 
                    isMedia = true; mediaType = 'image'; mediaMsg = msg.message.imageMessage; 
                } else if (msg.message.videoMessage) { 
                    isMedia = true; mediaType = 'video'; mediaMsg = msg.message.videoMessage; 
                } else {
                    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (quoted?.imageMessage) { 
                        isMedia = true; mediaType = 'image'; mediaMsg = quoted.imageMessage; 
                    } else if (quoted?.videoMessage) { 
                        isMedia = true; mediaType = 'video'; mediaMsg = quoted.videoMessage; 
                    }
                }

                if (isMedia && mediaMsg) {
                    const stream = await downloadContentFromMessage(mediaMsg, mediaType);
                    let buffer = Buffer.from([]);
                    for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                    
                    if (mediaType === 'image') await sock.sendMessage(chatId, { image: buffer, caption: textoEstetico, mentions }, { quoted: fakeQuote });
                    else await sock.sendMessage(chatId, { video: buffer, caption: textoEstetico, mentions }, { quoted: fakeQuote });
                } else {
                    await sock.sendMessage(chatId, { text: textoEstetico, mentions }, { quoted: fakeQuote });
                }
            } catch (e) { await responder(`⚠️ Error: ${e.message}`); } return;
        }

        if (textoMensaje.toLowerCase().startsWith('.kick') && tienePermisoOperativo && esGrupo) {
            let target = extraerIdCitado();
            if (!target) { const args = textoMensaje.split(' '); if (args[1]) target = args[1].includes('@') ? args[1] : `${args[1]}@c.us`; }
            if (!target) return await responder('⚠️ Etiqueta o cita al usuario que deseas expulsar.');
            try { await sock.groupParticipantsUpdate(chatId, [toBaileys(target)], "remove"); await responder('👢 *¡Usuario expulsado del grupo!*'); } catch (e) { await responder(`⚠️ Error al expulsar.`); } return;
        }

        if (textoMensaje.toLowerCase() === '.cerrar' && tienePermisoOperativo && esGrupo) {
            try { await sock.groupSettingUpdate(chatId, 'announcement'); await responder('✅ *Grupo cerrado exitosamente.*'); } catch (e) {} return;
        }

        if (textoMensaje.toLowerCase() === '.abrir' && tienePermisoOperativo && esGrupo) {
            try { await sock.groupSettingUpdate(chatId, 'not_announcement'); await responder('🔓 *Grupo abierto exitosamente.*'); } catch (e) {} return;
        }

        if (textoMensaje.toLowerCase() === '/activargrupo') {
            if (!esGrupo || (!deMiNumero && !esAdminDelGrupo)) return;
            if (!configSistema.gruposAutorizados.includes(chatId)) {
                configSistema.gruposAutorizados.push(chatId);
                let duenio = extraerIdCitado(); if (duenio) configSistema.propietariosGrupos[chatId] = duenio;
                guardarConfig(configSistema); await responder('✅ *¡Grupo Activado con éxito!*');
            } return;
        }

        if (textoMensaje.toLowerCase() === '/desactivargrupo') {
            if (!esGrupo || (!deMiNumero && !esAdminDelGrupo)) return;
            configSistema.gruposAutorizados = configSistema.gruposAutorizados.filter(id => id !== chatId);
            delete configSistema.propietariosGrupos[chatId]; delete configSistema.notificadoresGrupos[chatId];
            guardarConfig(configSistema); await responder('❌ *Grupo Desactivado y registros limpios.*'); return;
        }

        if (textoMensaje.toLowerCase().startsWith('/r ') && tienePermisoOperativo) {
            try {
                const args = textoMensaje.split(' ').filter(a => a.trim() !== ""); if (args.length < 2) return;
                const aliasDestino = args[1].toLowerCase(); const idDelChatDestino = configSistema.gruposDestino[aliasDestino];
                if (!idDelChatDestino) return await responder(`⚠️ El alias *${aliasDestino}* no existe.`);

                let targetUser = "";
                if (args.length > 2) { const posibleNum = args[2]; targetUser = posibleNum.includes('@') ? posibleNum : `${posibleNum}@c.us`; }

                const quotedInfo = msg.message.extendedTextMessage?.contextInfo;
                if (quotedInfo && quotedInfo.quotedMessage) {
                    if (targetUser && !targetUser.includes('@g.us')) {
                        await sock.sendMessage(idDelChatDestino, { text: `✅ ¡Tu trámite está listo! @${targetUser.split('@')[0]}`, mentions: [toBaileys(targetUser)] });
                    }
                    const msgToForward = { key: { remoteJid: chatId, fromMe: false, id: quotedInfo.stanzaId, participant: quotedInfo.participant }, message: quotedInfo.quotedMessage };
                    await sock.sendMessage(idDelChatDestino, { forward: msgToForward });
                    await responder(`✅ Documento reenviado a *${aliasDestino}*.`);
                } else await responder('⚠️ Cita el archivo que deseas reenviar.');
            } catch (error) { await responder('⚠️ Fallo al reenviar.'); } return;
        }

        if (textoMensaje.toLowerCase() === '.ver' && tienePermisoOperativo) {
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) return await responder('⚠️ Cita la imagen de una sola vez con el comando `.ver`.');
            const viewOnceMsg = quoted.viewOnceMessage?.message || quoted.viewOnceMessageV2?.message || quoted.viewOnceMessageV2Extension?.message;
            if (viewOnceMsg) {
                try {
                    const mediaMsg = viewOnceMsg.imageMessage || viewOnceMsg.videoMessage;
                    if (!mediaMsg) return await responder('⚠️ No detecté un archivo válido.');
                    const mediaType = viewOnceMsg.imageMessage ? 'image' : 'video';
                    const stream = await downloadContentFromMessage(mediaMsg, mediaType);
                    let buffer = Buffer.from([]);
                    for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                    if (mediaType === 'image') await sock.sendMessage(chatId, { image: buffer, caption: '📸 *Recuperado*' }, { quoted: msg });
                    else await sock.sendMessage(chatId, { video: buffer, caption: '🎥 *Recuperado*' }, { quoted: msg });
                } catch (e) { await responder(`⚠️ Error: ${e.message}`); }
            } else await responder('⚠️ El mensaje citado no es de 1 sola vez.');
            return;
        }

        if (textoMensaje.toLowerCase() === '.jinni' && tienePermisoOperativo) {
            const menu = `🌸 *GUÍA MAESTRA DE NAEVIS BOT* 🌸
¡Hola! Aquí tienes la explicación de todos los comandos disponibles:

👑 *SÚPER ADMINS (Propietarios)*
• \`/mantenimiento\` ó \`/apagado\` : Apaga el bot (Avisa a los grupos).
• \`/prendido\` : Enciende el bot nuevamente.
• \`/addvendedor [@user]\` : Etiqueta a alguien para darle permisos de administrador del bot.
• \`/delvendedor [@user]\` : Quita los permisos de vendedor.

⚙️ *GESTIÓN DE GRUPOS*
• \`/activargrupo\` : Activa el bot en el grupo actual.
• \`/desactivargrupo\` : Apaga el bot en el grupo actual.
• \`/setgrupo [alias]\` : Le asigna un nombre corto a tu grupo de ventas.
• \`/setproveedor [alias]\` : Enlaza a tu proveedor con el grupo de ventas.
• \`.abrir\` / \`.cerrar\` : Abre o cierra el grupo.

🤖 *AUTOMATIZACIÓN Y LEALTAD*
• \`/auto\` / \`/offauto\` : Activa o apaga el modo automático.
• \`/lealtad on\` / \`/lealtad off\` : Activa o apaga el sistema de recompensas.

💳 *CLIENTES VIP (CRÉDITO)*
• \`/vip [@user]\` / \`/delvip [@user]\` : Gestiona usuarios VIP.
• \`.vips\` : Muestra clientes VIP.
• \`/liquidado [@user]\` : Pone la deuda en ceros.
• \`.deudores\` / \`.deuda\` : Consulta de deudas.

💰 *FINANZAS Y VENTAS*
• \`/precio [servicio] [$$]\` : Cambia precios.
• \`/saldo [@user] [$$]\` : Añade o resta saldo (ej. /saldo -15 @user).
• \`/priv [$$] [@user]\` : Registra venta por privado y descuenta saldo (si queda negativo, se vuelve deuda).
• \`.saldos\` : Muestra saldos.
• \`/r [alias] [@user]\` : Reenvía entregas manualmente.

│ 𝑁𝑎𝑒𝑣𝑖𝑠 𝐵𝑜𝑡
│ Fecha: ${new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' })} (MX)`;
            
            const fakeQuote = { key: { fromMe: false, participant: '0@s.whatsapp.net', id: '1234567890123456' }, message: { locationMessage: { name: 'WhatsApp ✅', address: '🤖 MANUAL DEL SISTEMA' } } };
            await sock.sendMessage(chatId, { text: menu }, { quoted: fakeQuote });
            return;
        }

        if (textoMensaje.toLowerCase().startsWith('/vip') && tienePermisoOperativo && esGrupo) {
            let targetUser = extraerIdCitado();
            if (!targetUser) { const args = textoMensaje.split(' '); if (args[1]) targetUser = args[1].includes('@') ? args[1] : `${args[1]}@c.us`; }
            if (!targetUser) return await responder('⚠️ Etiqueta o cita al usuario que será VIP.');

            if (!configSistema.vips) configSistema.vips = {};
            if (!configSistema.vips[chatId]) configSistema.vips[chatId] = [];

            const indice = configSistema.vips[chatId].indexOf(targetUser);
            if (indice === -1) {
                configSistema.vips[chatId].push(targetUser);
                guardarConfig(configSistema);
                await sock.sendMessage(chatId, { text: `✅ @${targetUser.split('@')[0]} ahora es VIP.`, mentions: [toBaileys(targetUser)] });
            } else {
                await sock.sendMessage(chatId, { text: `⚠️ @${targetUser.split('@')[0]} ya tenía el permiso VIP activo.`, mentions: [toBaileys(targetUser)] });
            }
            return;
        }

        if (textoMensaje.toLowerCase().startsWith('/delvip') && tienePermisoOperativo && esGrupo) {
            let targetUser = extraerIdCitado();
            if (!targetUser) { const args = textoMensaje.split(' '); if (args[1]) targetUser = args[1].includes('@') ? args[1] : `${args[1]}@c.us`; }
            if (!targetUser) return await responder('⚠️ Etiqueta o cita al usuario.');

            if (!configSistema.vips) configSistema.vips = {};
            if (!configSistema.vips[chatId]) configSistema.vips[chatId] = [];

            const indice = configSistema.vips[chatId].indexOf(targetUser);
            if (indice > -1) {
                configSistema.vips[chatId].splice(indice, 1);
                guardarConfig(configSistema);
                await sock.sendMessage(chatId, { text: `❌ @${targetUser.split('@')[0]} ya no es VIP.`, mentions: [toBaileys(targetUser)] });
            } else {
                await sock.sendMessage(chatId, { text: `⚠️ @${targetUser.split('@')[0]} no era VIP.`, mentions: [toBaileys(targetUser)] });
            }
            return;
        }

        if (textoMensaje.toLowerCase() === '.vips' && tienePermisoOperativo && esGrupo) {
            let listaVips = configSistema.vips?.[chatId] || [];
            if (listaVips.length === 0) return await responder('ℹ️ No hay clientes VIP registrados.');

            let textoVips = `🌟 *CLIENTES VIP AUTORIZADOS* 🌟\n\n`;
            let mencionesVIP = [];
            listaVips.forEach(usuario => {
                const numeroPuro = usuario.split('@')[0];
                textoVips += `👤 @${numeroPuro}\n`;
                mencionesVIP.push(toBaileys(usuario));
            });

            await sock.sendMessage(chatId, { text: textoVips, mentions: mencionesVIP });
            return;
        }

        if (textoMensaje.toLowerCase().startsWith('/liquidado') && tienePermisoOperativo && esGrupo) {
            let targetUser = extraerIdCitado();
            if (!targetUser) { const args = textoMensaje.split(' '); if (args[1]) targetUser = args[1].includes('@') ? args[1] : `${args[1]}@c.us`; }
            if (!targetUser) return await responder('⚠️ Etiqueta o cita al usuario.');

            if (!configSistema.deudas) configSistema.deudas = {};
            if (!configSistema.deudas[chatId]) configSistema.deudas[chatId] = {};
            
            const deudaActual = configSistema.deudas[chatId][targetUser] || 0;
            configSistema.deudas[chatId][targetUser] = 0;
            guardarConfig(configSistema);
            
            await sock.sendMessage(chatId, { text: `✅ *DEUDA LIQUIDADA*\nSe han perdonado *$${deudaActual}.00 MXN* a @${targetUser.split('@')[0]}.`, mentions: [toBaileys(targetUser)] });
            return;
        }

        if (textoMensaje.toLowerCase() === '.deudores' && tienePermisoOperativo && esGrupo) {
            let deudasDelGrupo = configSistema.deudas?.[chatId];
            if (!deudasDelGrupo || Object.keys(deudasDelGrupo).length === 0) return await responder('✅ ¡Felicidades! Nadie te debe dinero.');

            let listaDeudores = `💸 *LISTA DE DEUDORES VIP* 💸\n\n`; let hayDeudas = false;
            let mencionesDeudores = [];
            for (const [usuario, deuda] of Object.entries(deudasDelGrupo)) {
                if (deuda > 0) {
                    const numeroPuro = usuario.split('@')[0];
                    listaDeudores += `👤 @${numeroPuro}:\n💰 Debe: *$${deuda}.00 MXN*\n\n`; 
                    mencionesDeudores.push(toBaileys(usuario));
                    hayDeudas = true; 
                }
            }
            if (!hayDeudas) return await responder('✅ ¡Felicidades! Nadie te debe dinero.');
            
            await sock.sendMessage(chatId, { text: listaDeudores, mentions: mencionesDeudores }); return;
        }

        if (textoMensaje.toLowerCase() === '.deuda') {
            if (esGrupo && !esGrupoAutorizado) return;
            const miDeuda = configSistema.deudas?.[chatId]?.[senderViejo] || 0;
            if (miDeuda > 0) {
                await responder(`💸 *Tu Deuda VIP Actual:* $${miDeuda}.00 MXN`);
            } else {
                await responder(`✅ No tienes ninguna deuda pendiente.`);
            }
            return;
        }

        if (textoMensaje.toLowerCase() === '/auto' && tienePermisoOperativo && esGrupo) {
            configSistema.autoMode[chatId] = true;
            guardarConfig(configSistema);
            await responder('🤖 ✅ *Modo Automático ACTIVADO*');
            return;
        }

        if (textoMensaje.toLowerCase() === '/offauto' && tienePermisoOperativo && esGrupo) {
            configSistema.autoMode[chatId] = false;
            guardarConfig(configSistema);
            await responder('🤖 ❌ *Modo Automático DESACTIVADO*');
            return;
        }

        if (textoMensaje.toLowerCase() === '/lealtad on' && tienePermisoOperativo && esGrupo) {
            configSistema.loyaltyMode[chatId] = true;
            guardarConfig(configSistema);
            await responder('🌟 ✅ *Sistema de Lealtad ACTIVADO*');
            return;
        }

        if (textoMensaje.toLowerCase() === '/lealtad off' && tienePermisoOperativo && esGrupo) {
            configSistema.loyaltyMode[chatId] = false;
            guardarConfig(configSistema);
            await responder('🌟 ❌ *Sistema de Lealtad DESACTIVADO*');
            return;
        }

        if (textoMensaje.toLowerCase() === '.compras') {
            if (esGrupo && !esGrupoAutorizado) return;
            if (!configSistema.loyaltyMode || !configSistema.loyaltyMode[chatId]) {
                return await responder('ℹ️ El sistema de recompensas no está activo.');
            }
            const llevas = configSistema.comprasUsuarios?.[chatId]?.[senderViejo] || 0;
            const faltan = 10 - llevas;
            await responder(`🌟 *Tarjeta de Lealtad*\nLlevas *${llevas}* trámite(s).\nTe faltan *${faltan}* para tu regalo.`);
            return;
        }

        if (textoMensaje.toLowerCase() === '.grupos' && tienePermisoOperativo) {
            let list = "📂 *Grupos en Memoria:*\n\n"; let aliases = configSistema.gruposDestino || {};
            for (const [alias, id] of Object.entries(aliases)) list += `🏷️ *Alias:* ${alias}\n🆔 *ID:* ${id}\n\n`;
            await responder(list || "📂 No hay grupos guardados."); return;
        }

        if (textoMensaje.toLowerCase() === '/mantenimiento' || textoMensaje.toLowerCase() === '/apagado') {
            if (!deMiNumero) return; 
            for (let grupoId of configSistema.gruposAutorizados) await sock.sendMessage(grupoId, { text: `⚠️ *BOT EN MANTENIMIENTO*` }).catch(()=>null);
            await responder('⚙️ Apagado.'); process.exit(0);
        }

        if (textoMensaje.toLowerCase() === '/prendido') {
            if (!deMiNumero) return;
            for (let grupoId of configSistema.gruposAutorizados) await sock.sendMessage(grupoId, { text: `🚀 *¡SISTEMA EN LÍNEA!*` }).catch(()=>null);
            await responder('✅ Encendido.'); return;
        }

        if (textoMensaje.toLowerCase().startsWith('/setgrupo ')) {
            if (!esGrupo || (!deMiNumero && !esAdminDelGrupo)) return;
            const args = textoMensaje.split(' ').filter(a => a.trim() !== ""); if (args.length < 2) return;
            configSistema.gruposDestino[args[1].toLowerCase()] = chatId; guardarConfig(configSistema); await responder(`✅ *Enlace Exitoso!* Alias: *${args[1].toLowerCase()}*`); return;
        }

        if (textoMensaje.toLowerCase().startsWith('/setproveedor ') && tienePermisoOperativo && esGrupo) {
            const alias = textoMensaje.split(' ')[1]?.toLowerCase();
            if (!alias) return await responder('⚠️ Escribe el alias de tu grupo de ventas.');
            const idVentas = configSistema.gruposDestino[alias];
            if (!idVentas) return await responder(`⚠️ El alias *${alias}* no existe.`);
            configSistema.gruposProveedores = configSistema.gruposProveedores || {};
            configSistema.gruposProveedores[idVentas] = chatId;
            guardarConfig(configSistema);
            await responder(`✅ *Proveedor Vinculado Exitósamente*`);
            return;
        }

        if (textoMensaje.toLowerCase().startsWith('/precio ') && tienePermisoOperativo && esGrupo) {
            const args = textoMensaje.split(' ').filter(a => a.trim() !== ""); if (args.length < 3) return;
            let tipoServicio = args[1].toLowerCase(); const nuevoPrecio = parseInt(args[2], 10); if (isNaN(nuevoPrecio) || nuevoPrecio < 1) return;
            if (!configSistema.precios[chatId]) configSistema.precios[chatId] = { ...PRECIOS_BASE };
            
            if (tipoServicio === 'actas' || tipoServicio === 'acta') {
                configSistema.precios[chatId].nacimiento = nuevoPrecio; 
                configSistema.precios[chatId].nacimiento_nf = nuevoPrecio;
                configSistema.precios[chatId].matrimonio = nuevoPrecio; 
                configSistema.precios[chatId].matrimonio_mf = nuevoPrecio;
                configSistema.precios[chatId].defuncion = nuevoPrecio; 
                configSistema.precios[chatId].defuncion_df = nuevoPrecio;
                configSistema.precios[chatId].divorcio = nuevoPrecio; 
                configSistema.precios[chatId].divorcio_d0 = nuevoPrecio;
            } else {
                configSistema.precios[chatId][tipoServicio] = nuevoPrecio; 
            }

            guardarConfig(configSistema); 
            await responder(`✅ *Nuevo precio* actualizado correctamente: $${nuevoPrecio}.00`); 
            return;
        }

        // ==========================================
        // COMANDO SALDO (Suma o resta directa blindada)
        // ==========================================
        if (textoMensaje.toLowerCase().startsWith('/saldo') && esGrupo && tienePermisoOperativo) {
            let targetUser = extraerIdCitado();
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) targetUser = toViejo(mentioned[0]);
            
            let content = textoMensaje.toLowerCase().replace('/saldo', '');
            if (!targetUser) {
                let phoneMatch = content.match(/52\d{10,11}/);
                if (phoneMatch) targetUser = `${phoneMatch[0]}@c.us`;
            }
            
            let isNegative = content.includes('-');
            let montoPesos = 0;
            let numMatches = content.match(/\d+/g);
            if (numMatches) {
                for (let num of numMatches) {
                    if (num.length < 5) { 
                        montoPesos = parseInt(num, 10);
                        break;
                    }
                }
            }
            
            if (isNegative) montoPesos = -Math.abs(montoPesos);

            if (targetUser && montoPesos !== 0) {
                if (!saldosUsuarios[chatId]) saldosUsuarios[chatId] = {};
                if (!saldosUsuarios[chatId][targetUser]) saldosUsuarios[chatId][targetUser] = 0;
                
                saldosUsuarios[chatId][targetUser] += montoPesos;
                if (saldosUsuarios[chatId][targetUser] < 0) saldosUsuarios[chatId][targetUser] = 0;

                const numPuro = targetUser.split('@')[0]; let base = numPuro;
                if (numPuro.startsWith('521')) base = numPuro.substring(3); else if (numPuro.startsWith('52')) base = numPuro.substring(2);
                saldosUsuarios[chatId][`521${base}@c.us`] = saldosUsuarios[chatId][targetUser];
                saldosUsuarios[chatId][`52${base}@c.us`] = saldosUsuarios[chatId][targetUser];

                guardarSaldos(saldosUsuarios);
                await responder(`✅ *Saldo Actualizado*\n👤 *Usuario:* @${targetUser.split('@')[0]}\n💰 *Cambio:* ${montoPesos > 0 ? '+' : ''}${montoPesos}.00\n🔋 *Disponible:* $${saldosUsuarios[chatId][targetUser]}.00`);
            } else {
                await responder(`⚠️ Uso correcto: \`/saldo [monto] [@usuario]\` o \`/saldo -[monto] [@usuario]\``);
            }
            return;
        }

        // ==========================================
        // COMANDO PRIVADO (/priv) - Descuenta saldo, el sobrante se vuelve deuda VIP
        // ==========================================
        if (textoMensaje.toLowerCase().startsWith('/priv') && esGrupo && tienePermisoOperativo) {
            let targetUser = extraerIdCitado();
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) targetUser = toViejo(mentioned[0]);
            
            let content = textoMensaje.toLowerCase().replace('/priv', '');
            if (!targetUser) {
                let phoneMatch = content.match(/52\d{10,11}/);
                if (phoneMatch) targetUser = `${phoneMatch[0]}@c.us`;
            }
            
            let montoDescontar = 0;
            let numMatches = content.match(/\d+/g);
            if (numMatches) {
                for (let num of numMatches) {
                    if (num.length < 5) {
                        montoDescontar = parseInt(num, 10);
                        break;
                    }
                }
            }

            if (targetUser && montoDescontar > 0) {
                if (!saldosUsuarios[chatId]) saldosUsuarios[chatId] = {};
                if (!saldosUsuarios[chatId][targetUser]) saldosUsuarios[chatId][targetUser] = 0;
                
                saldosUsuarios[chatId][targetUser] -= montoDescontar;
                let fueADeuda = false;
                let nuevaDeuda = 0;

                // Si queda en números rojos, lo cortamos a 0 y la diferencia se clava en Deudas
                if (saldosUsuarios[chatId][targetUser] < 0) {
                    let deficit = Math.abs(saldosUsuarios[chatId][targetUser]);
                    saldosUsuarios[chatId][targetUser] = 0; 
                    
                    if (!configSistema.deudas) configSistema.deudas = {};
                    if (!configSistema.deudas[chatId]) configSistema.deudas[chatId] = {};
                    configSistema.deudas[chatId][targetUser] = (configSistema.deudas[chatId][targetUser] || 0) + deficit;
                    guardarConfig(configSistema);
                    fueADeuda = true;
                    nuevaDeuda = configSistema.deudas[chatId][targetUser];
                }

                const numPuro = targetUser.split('@')[0]; let base = numPuro;
                if (numPuro.startsWith('521')) base = numPuro.substring(3); else if (numPuro.startsWith('52')) base = numPuro.substring(2);
                saldosUsuarios[chatId][`521${base}@c.us`] = saldosUsuarios[chatId][targetUser];
                saldosUsuarios[chatId][`52${base}@c.us`] = saldosUsuarios[chatId][targetUser];

                guardarSaldos(saldosUsuarios);
                
                let msgResp = `✅ *Venta por Privado Registrada*\n👤 *Usuario:* @${targetUser.split('@')[0]}\n💸 *Cobrado:* -$${montoDescontar}.00\n🔋 *Saldo restante:* $${saldosUsuarios[chatId][targetUser]}.00`;
                
                if (fueADeuda) {
                    msgResp += `\n⚠️ El usuario se quedó sin saldo y se le añadió una deuda de *$${nuevaDeuda}.00* para la próxima.`;
                }
                
                await sock.sendMessage(chatId, { text: msgResp, mentions: [toBaileys(targetUser)] });
            } else {
                await responder(`⚠️ Usa: \`/priv [monto] [@usuario]\``);
            }
            return;
        }

        if ((textoMensaje.toLowerCase() === '.saldos' || textoMensaje.toLowerCase() === '/saldos') && tienePermisoOperativo && esGrupo) {
            let saldosDelGrupo = saldosUsuarios[chatId];
            if (!saldosDelGrupo || Object.keys(saldosDelGrupo).length === 0) return await responder('ℹ️ No hay saldos registrados.');
            let listaSaldos = `🌸 *SALDOS DEL GRUPO* 🌸\n\n`; let haySaldos = false;
            let mencionesSaldos = [];
            for (const [usuario, saldo] of Object.entries(saldosDelGrupo)) {
                if (saldo > 0) {
                    const numeroPuro = usuario.split('@')[0];
                    listaSaldos += `👤 @${numeroPuro}:\n💰 $${saldo}.00 MXN\n\n`; 
                    mencionesSaldos.push(toBaileys(usuario));
                    haySaldos = true; 
                }
            }
            if (!haySaldos) return await responder('ℹ️ Todos los usuarios están en $0.00.');
            await sock.sendMessage(chatId, { text: listaSaldos, mentions: mencionesSaldos }); return;
        }

        if (textoMensaje.toLowerCase() === '.versaldo') {
            if (esGrupo && !esGrupoAutorizado) return;
            await responder(`🔋 *Tu saldo actual es:* $${saldosUsuarios[chatId]?.[senderViejo] || 0}.00 MXN`); return;
        }

        if (textoMensaje.toLowerCase() === '.pago') { if (esGrupo && !esGrupoAutorizado) return; await responder(configSistema.pagosGrupos[chatId] || 'ℹ️ Sin datos de pago.'); return; }
        if (textoMensaje.toLowerCase() === '.tramites') { if (esGrupo && !esGrupoAutorizado) return; await responder(configSistema.tramitesGrupos[chatId] || 'ℹ️ Sin trámites configurados.'); return; }
        if (textoMensaje.toLowerCase() === '.stock') { if (esGrupo && !esGrupoAutorizado) return; await responder(configSistema.stockGrupos[chatId] || 'ℹ️ Sin stock configurado.'); return; }

        if (textoMensaje.startsWith('.') || textoMensaje.startsWith('/')) {
            // Permitir que los administradores fallen comandos sin bloquear
        } else if (esGrupo && !esGrupoAutorizado) {
            return;
        }

        if (!textoMensaje.startsWith('/') && !textoMensaje.startsWith('.')) {
            const lineas = textoMensaje.split('\n').map(l => l.trim()).filter(l => l !== "");
            const regexActas = /^([A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d)\s([5-8]|NF|MF|DF|D0)$/i;
            const regexSat = /^([A-Z&Ññ]{3,4}\d{6}[A-Z0-9]{3})\s([A-Z0-9]+)\s(9)$/i;
            const regexRfcClon = /^([A-Z&Ññ]{3,4}\d{6}[A-Z0-9]{3})\s(1)$/i;
            
            let tramitesAProcesar = [];
            let p = configSistema.precios?.[chatId] || PRECIOS_BASE;

            for (const linea of lineas) {
                const matchActa = linea.match(regexActas);
                const matchSat = linea.match(regexSat);
                const matchRfcClon = linea.match(regexRfcClon);

                if (matchActa) {
                    const codigo = matchActa[2].toUpperCase();
                    let costoActa = p.nacimiento; let nombreServicio = "Acta de Nacimiento";
                    if (codigo === '6') { costoActa = p.matrimonio; nombreServicio = "Acta de Matrimonio"; }
                    else if (codigo === '7') { costoActa = p.defuncion; nombreServicio = "Acta de Defunción"; }
                    else if (codigo === '8') { costoActa = p.divorcio; nombreServicio = "Acta de Divorcio"; }
                    else if (codigo === 'NF') { costoActa = p.nacimiento_nf; nombreServicio = "Acta de Nacimiento (NF)"; }
                    else if (codigo === 'MF') { costoActa = p.matrimonio_mf; nombreServicio = "Acta de Matrimonio Foliada (MF)"; }
                    else if (codigo === 'DF') { costoActa = p.defuncion_df; nombreServicio = "Acta de Defunción (DF)"; }
                    else if (codigo === 'D0') { costoActa = p.divorcio_d0; nombreServicio = "Acta de Divorcio (D0)"; }
                    tramitesAProcesar.push({ identificador: matchActa[1].toUpperCase(), codigo, costo: costoActa, nombreServicio, lineaOriginal: linea });
                } else if (matchSat) {
                    tramitesAProcesar.push({ identificador: `RFC: ${matchSat[1].toUpperCase()}`, codigo: matchSat[3], costo: p.sat, nombreServicio: "Constancia Fiscal", lineaOriginal: linea });
                } else if (matchRfcClon) {
                    tramitesAProcesar.push({ identificador: `RFC CLON: ${matchRfcClon[1].toUpperCase()}`, codigo: matchRfcClon[2], costo: p.rfcclon, nombreServicio: "RFC Clon", lineaOriginal: linea });
                }
            }

            if (tramitesAProcesar.length > 0) {
                let saldoDisponible = saldosUsuarios[chatId]?.[senderViejo] || 0;
                let esVip = configSistema.vips?.[chatId]?.includes(senderViejo) || false;
                let miDeuda = configSistema.deudas?.[chatId]?.[senderViejo] || 0;

                // SI TIENE CERO O MENOS, LO BLOQUEAMOS DIRECTO ANTES DE ITERAR
                if (saldoDisponible <= 0 && !esVip) return await responder(`⚠️ *AVISO* ⚠️\nNo cuentas con saldo suficiente para tramitar.`);

                let aliasDelGrupo = "SIN ALIAS";
                for (const [alias, id] of Object.entries(configSistema.gruposDestino || {})) { if (id === chatId) { aliasDelGrupo = alias; break; } }

                let textoConfirmacion = ""; let exitosos = []; let rechazados = [];
                let mensajesLealtad = ""; 

                for (const tramite of tramitesAProcesar) {
                    if (saldoDisponible >= tramite.costo) {
                        saldoDisponible -= tramite.costo; exitosos.push(tramite);
                        const alerta = `🔔 *TRÁMITE SOLICITADO*\n👤 *ID:* \`${senderViejo}\`\n🏷️ *Grupo:* \`${aliasDelGrupo}\`\n🔑 *Trámite:* ${tramite.identificador} (${tramite.nombreServicio})\n🔋 *Saldo restante:* $${saldoDisponible}.00`;
                        
                        let destinatarios = new Set([...SÚPER_ADMINS_NATOS]);
                        if (configSistema.notificadoresGrupos[chatId]) configSistema.notificadoresGrupos[chatId].forEach(id => destinatarios.add(id));
                        for (const destId of destinatarios) { try { await sock.sendMessage(toBaileys(destId), { text: alerta }); } catch (err) {} }

                        if (configSistema.autoMode && configSistema.autoMode[chatId]) {
                            if (configSistema.gruposProveedores && configSistema.gruposProveedores[chatId] && tramite.nombreServicio.startsWith('Acta')) {
                                try { 
                                    await sock.sendMessage(configSistema.gruposProveedores[chatId], { text: tramite.lineaOriginal }); 
                                    configSistema.pendientes[tramite.identificador] = { grupoVentas: chatId, cliente: senderViejo, costo: tramite.costo };
                                    guardarConfig(configSistema);
                                } catch (err) {}
                            }
                        }

                        if (configSistema.loyaltyMode && configSistema.loyaltyMode[chatId]) {
                            if (!configSistema.comprasUsuarios) configSistema.comprasUsuarios = {};
                            if (!configSistema.comprasUsuarios[chatId]) configSistema.comprasUsuarios[chatId] = {};
                            if (!configSistema.comprasUsuarios[chatId][senderViejo]) configSistema.comprasUsuarios[chatId][senderViejo] = 0;
                            
                            configSistema.comprasUsuarios[chatId][senderViejo] += 1;
                            
                            if (configSistema.comprasUsuarios[chatId][senderViejo] >= 10) {
                                saldoDisponible += 12; 
                                configSistema.comprasUsuarios[chatId][senderViejo] = 0; 
                                mensajesLealtad += `\n🎁 *¡CLIENTE ESTRELLA!* 10 trámites completados. ¡Te regalamos *$12.00* de saldo!\n`;
                            }
                            guardarConfig(configSistema);
                        }

                    } else if (esVip) {
                        miDeuda += tramite.costo;
                        tramite.fueCredito = true; 
                        exitosos.push(tramite);

                        const alerta = `🔔 *TRÁMITE A CRÉDITO (VIP)*\n👤 *ID:* \`${senderViejo}\`\n🏷️ *Grupo:* \`${aliasDelGrupo}\`\n🔑 *Trámite:* ${tramite.identificador}\n💸 *Deuda acumulada:* $${miDeuda}.00`;
                        
                        let destinatarios = new Set([...SÚPER_ADMINS_NATOS]);
                        if (configSistema.notificadoresGrupos[chatId]) configSistema.notificadoresGrupos[chatId].forEach(id => destinatarios.add(id));
                        for (const destId of destinatarios) { try { await sock.sendMessage(toBaileys(destId), { text: alerta }); } catch (err) {} }

                        if (configSistema.autoMode && configSistema.autoMode[chatId]) {
                            if (configSistema.gruposProveedores && configSistema.gruposProveedores[chatId] && tramite.nombreServicio.startsWith('Acta')) {
                                try { 
                                    await sock.sendMessage(configSistema.gruposProveedores[chatId], { text: tramite.lineaOriginal }); 
                                    configSistema.pendientes[tramite.identificador] = { grupoVentas: chatId, cliente: senderViejo, costo: tramite.costo };
                                    guardarConfig(configSistema);
                                } catch (err) {}
                            }
                        }
                    } else {
                        rechazados.push(tramite);
                    }
                }

                if (esVip) {
                    if (!configSistema.deudas) configSistema.deudas = {};
                    if (!configSistema.deudas[chatId]) configSistema.deudas[chatId] = {};
                    configSistema.deudas[chatId][senderViejo] = miDeuda;
                    guardarConfig(configSistema);
                }

                if (exitosos.length > 0) { 
                    textoConfirmacion += `✅ *Trámite(s) registrado(s)*\n`; 
                    for (const ex of exitosos) {
                        textoConfirmacion += `📄 ${ex.identificador} (${ex.codigo})\n`;
                    }
                }
                
                if (rechazados.length > 0) { textoConfirmacion += `\n❌ *Rechazados (Sin Saldo Suficiente)*\n`; }

                saldosUsuarios[chatId][senderViejo] = saldoDisponible; 
                guardarSaldos(saldosUsuarios);
                
                textoConfirmacion += mensajesLealtad; 
                textoConfirmacion += `\n🔋 *Saldo a favor:* $${saldoDisponible}.00 MXN`;
                
                if (esVip) {
                    textoConfirmacion += `\n💸 *Deuda VIP acumulada:* $${miDeuda}.00 MXN`;
                }
                
                await responder(textoConfirmacion);
            }
        }
    });
}

iniciarBot();
