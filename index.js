const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');

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
            return c;
        }
    } catch (e) {}
    const init = { gruposAutorizados: [], vendedores: [], superAdmins: [], gruposDestino: {}, precios: {}, propietariosGrupos: {}, notificadoresGrupos: {}, stockGrupos: {}, pagosGrupos: {}, tramitesGrupos: {} };
    fs.writeFileSync(PATH_CONFIG, JSON.stringify(init, null, 4), 'utf8'); return init;
}
function guardarConfig(config) { try { fs.writeFileSync(PATH_CONFIG, JSON.stringify(config, null, 4), 'utf8'); } catch (e) {} }

const toBaileys = (id) => id ? id.replace('@c.us', '@s.whatsapp.net') : '';
const toViejo = (id) => id ? id.replace('@s.whatsapp.net', '@c.us') : '';

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(CARPETA_DATOS, 'auth_baileys'));
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), 
        browser: ["NaevisPro", "Chrome", "3.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
            console.log('\n======================================================');
            console.log('🔗 ABRE ESTE ENLACE EN TU NAVEGADOR PARA ESCANEAR EL QR:');
            console.log(qrUrl);
            console.log('======================================================\n');
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
        if (!textoMensaje) return;

        const responder = async (texto) => { await sock.sendMessage(chatId, { text: texto }, { quoted: msg }); };

        const extraerIdCitado = () => {
            const p = msg.message.extendedTextMessage?.contextInfo?.participant;
            return p ? toViejo(p) : null;
        };

        let configSistema = cargarConfig();
        let saldosUsuarios = cargarSaldos();

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
        // COMANDOS GLOBALES (PRIVADOS Y GRUPOS)
        // ==========================================

        if (textoMensaje.toLowerCase() === '.jinni' && tienePermisoOperativo) {
            const menu = `🌸 *LISTA MAESTRA DE COMANDOS* 🌸\n\n👑 *Súper Admins:*\n• /mantenimiento, /prendido\n• /addvendedor, /delvendedor\n\n⚙️ *Gestión:*\n• /activargrupo, /setgrupo\n• .abrir / .cerrar\n\n🧹 *Memoria:*\n• .grupos, .eliminar [alias o ID]\n\n💰 *Operaciones:*\n• /precio, /saldo, /r\n• .setpago, /setstock, /settramites\n\n👢 *Moderación:*\n• .kick, .n, .ver\n\n🗣️ *Públicos (Clientes):*\n• .pago, .tramites, .stock, .versaldo\n\n\n│ 𝑁𝑎𝑒𝑣𝑖𝑠 𝐵𝑜𝑡\n│ ${new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' })} (MX)`;
            const fakeQuote = { key: { fromMe: false, participant: '0@s.whatsapp.net', id: '1234567890123456' }, message: { locationMessage: { name: 'WhatsApp ✅', address: '🤖 MENÚ DEL SISTEMA' } } };
            await sock.sendMessage(chatId, { text: menu }, { quoted: fakeQuote });
            return;
        }

        if (textoMensaje.toLowerCase() === '.grupos' && tienePermisoOperativo) {
            let list = "📂 *Grupos en Memoria:*\n\n"; let aliases = configSistema.gruposDestino || {};
            for (const [alias, id] of Object.entries(aliases)) list += `🏷️ *Alias:* ${alias}\n🆔 *ID:* ${id}\n\n`;
            for (const id of (configSistema.gruposAutorizados || [])) if (!Object.values(aliases).includes(id)) list += `🏷️ *Sin alias*\n🆔 *ID:* ${id}\n\n`;
            await responder(list || "📂 No hay grupos guardados."); return;
        }

        if (textoMensaje.toLowerCase().startsWith('.eliminar ') && tienePermisoOperativo) {
            const target = textoMensaje.slice(10).trim(); let targetId = target; let targetAlias = null;
            for (const [alias, id] of Object.entries(configSistema.gruposDestino || {})) { if (alias === target.toLowerCase() || id === target) { targetId = id; targetAlias = alias; break; } }
            configSistema.gruposAutorizados = configSistema.gruposAutorizados.filter(id => id !== targetId);
            delete configSistema.precios[targetId]; delete configSistema.propietariosGrupos[targetId]; delete configSistema.notificadoresGrupos[targetId]; delete configSistema.stockGrupos[targetId]; delete configSistema.pagosGrupos[targetId]; delete configSistema.tramitesGrupos[targetId];
            if (targetAlias) delete configSistema.gruposDestino[targetAlias];
            guardarConfig(configSistema);
            if (saldosUsuarios[targetId]) { delete saldosUsuarios[targetId]; guardarSaldos(saldosUsuarios); }
            await responder(`🗑️ *Memoria liberada exitosamente.*`); return;
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

        if (textoMensaje.toLowerCase() === '/mantenimiento' || textoMensaje.toLowerCase() === '/apagado') {
            if (!deMiNumero) return; 
            for (let grupoId of configSistema.gruposAutorizados) await sock.sendMessage(grupoId, { text: `⚠️ *BOT EN MANTENIMIENTO* ⚠️` }).catch(()=>null);
            await responder('⚙️ Apagado.'); process.exit(0);
        }

        if (textoMensaje.toLowerCase() === '/prendido') {
            if (!deMiNumero) return;
            for (let grupoId of configSistema.gruposAutorizados) await sock.sendMessage(grupoId, { text: `🚀 *¡SISTEMA EN LÍNEA!* 🚀` }).catch(()=>null);
            await responder('✅ Encendido.'); return;
        }

        if (textoMensaje.toLowerCase().startsWith('/addvendedor')) {
            if (!deMiNumero) return;
            let nuevo = extraerIdCitado();
            if (!nuevo) { const args = textoMensaje.split(' '); if (args[1]) nuevo = args[1].includes('@') ? args[1] : `${args[1]}@c.us`; }
            if (!nuevo) return await responder('⚠️ Cita al usuario.');
            if (!configSistema.vendedores.includes(nuevo)) { configSistema.vendedores.push(nuevo); guardarConfig(configSistema); await responder(`✅ *Vendedor Registrado!*`); } return;
        }

        if (textoMensaje.toLowerCase().startsWith('/delvendedor')) {
            if (!deMiNumero) return;
            let bye = extraerIdCitado();
            if (!bye) { const args = textoMensaje.split(' '); if (args[1]) bye = args[1].includes('@') ? args[1] : `${args[1]}@c.us`; }
            if (!bye) return;
            configSistema.vendedores = configSistema.vendedores.filter(id => id !== bye); guardarConfig(configSistema); await responder(`❌ *Vendedor Eliminado!*`); return;
        }

        // ==========================================
        // COMANDOS EXCLUSIVOS DE GRUPOS
        // ==========================================

        if (textoMensaje.toLowerCase().startsWith('.n ') && tienePermisoOperativo && esGrupo) {
            const anuncio = textoMensaje.slice(3).trim();
            if (!anuncio) return await responder('⚠️ Escribe el mensaje.');
            try {
                const mentions = participantesGrupo.map(p => p.id);
                const footer = `\n\n│ 𝑁𝑎𝑒𝑣𝑖𝑠 𝐵𝑜𝑡\n│ ${new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' })} (MX)`;
                const fakeQuote = { key: { fromMe: false, participant: '0@s.whatsapp.net', id: '1234567890123456' }, message: { locationMessage: { name: 'WhatsApp ✅', address: '📢 NOTIFICACIÓN' } } };
                await sock.sendMessage(chatId, { text: anuncio + footer, mentions }, { quoted: fakeQuote });
            } catch (e) { await responder(`⚠️ Error: ${e.message}`); } return;
        }

        if (textoMensaje.toLowerCase().startsWith('.kick') && tienePermisoOperativo && esGrupo) {
            let target = extraerIdCitado();
            if (!target) { const args = textoMensaje.split(' '); if (args[1]) target = args[1].includes('@') ? args[1] : `${args[1]}@c.us`; }
            if (!target) return await responder('⚠️ Etiqueta o cita.');
            try { await sock.groupParticipantsUpdate(chatId, [toBaileys(target)], "remove"); await responder('👢 *¡Usuario expulsado!*'); } catch (e) { await responder(`⚠️ Error: ${e.message}`); } return;
        }

        if (textoMensaje.toLowerCase() === '.cerrar' && tienePermisoOperativo && esGrupo) {
            try { await sock.groupSettingUpdate(chatId, 'announcement'); await responder('✅ *Grupo cerrado.*'); } catch (e) {} return;
        }

        if (textoMensaje.toLowerCase() === '.abrir' && tienePermisoOperativo && esGrupo) {
            try { await sock.groupSettingUpdate(chatId, 'not_announcement'); await responder('🔓 *Grupo abierto.*'); } catch (e) {} return;
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
            guardarConfig(configSistema); await responder('❌ *Grupo Desactivado y limpio.*'); return;
        }

        if (textoMensaje.toLowerCase().startsWith('/setgrupo ')) {
            if (!esGrupo || (!deMiNumero && !esAdminDelGrupo)) return;
            const args = textoMensaje.split(' ').filter(a => a.trim() !== ""); if (args.length < 2) return;
            configSistema.gruposDestino[args[1].toLowerCase()] = chatId; guardarConfig(configSistema); await responder(`✅ *Enlace Exitoso!* Alias: *${args[1].toLowerCase()}*`); return;
        }

        if (textoMensaje.toLowerCase() === '/addnotis') {
            if (!esGrupo || (!deMiNumero && !esDuenioDelGrupo && !esAdminDelGrupo)) return;
            let targetNoti = extraerIdCitado() || senderViejo;
            if (!configSistema.notificadoresGrupos[chatId]) configSistema.notificadoresGrupos[chatId] = [];
            if (!configSistema.notificadoresGrupos[chatId].includes(targetNoti)) { configSistema.notificadoresGrupos[chatId].push(targetNoti); guardarConfig(configSistema); await responder(`✅ *Notificador Agregado*`); } return;
        }

        if (textoMensaje.toLowerCase() === '/delnotis') {
            if (!esGrupo || (!deMiNumero && !esDuenioDelGrupo && !esAdminDelGrupo)) return;
            let targetNoti = extraerIdCitado() || senderViejo;
            if (configSistema.notificadoresGrupos[chatId]) { configSistema.notificadoresGrupos[chatId] = configSistema.notificadoresGrupos[chatId].filter(id => id !== targetNoti); guardarConfig(configSistema); await responder(`❌ *Notificador Removido*`); } return;
        }

        if (textoMensaje.toLowerCase() === '/vernotis') {
            if (!esGrupo) return;
            let lista = configSistema.notificadoresGrupos[chatId] || []; if (lista.length === 0) return await responder('ℹ️ No hay notificadores.');
            let textoLista = "🔔 *Notificadores:*\n\n"; lista.forEach(id => textoLista += `• \`${id}\`\n`); await responder(textoLista); return;
        }

        if (textoMensaje.toLowerCase().startsWith('/setstock ') && tienePermisoOperativo && esGrupo) {
            configSistema.stockGrupos[chatId] = textoMensaje.slice(10).trim(); guardarConfig(configSistema); await responder('✅ *Inventario actualizado.*'); return;
        }

        if (textoMensaje.toLowerCase().startsWith('/settramites ') && tienePermisoOperativo && esGrupo) {
            configSistema.tramitesGrupos[chatId] = textoMensaje.slice(13).trim(); guardarConfig(configSistema); await responder('✅ *Lista de trámites actualizada.*'); return;
        }
        
        if ((textoMensaje.toLowerCase().startsWith('.setpago ') || textoMensaje.toLowerCase().startsWith('/setpago ')) && tienePermisoOperativo && esGrupo) {
            configSistema.pagosGrupos[chatId] = textoMensaje.substring(textoMensaje.indexOf(' ') + 1).trim(); guardarConfig(configSistema); await responder('✅ *Datos de pago guardados.*'); return;
        }

        if (textoMensaje.toLowerCase().startsWith('/precio ') && tienePermisoOperativo && esGrupo) {
            const args = textoMensaje.split(' ').filter(a => a.trim() !== ""); if (args.length < 3) return;
            let tipoServicio = args[1].toLowerCase(); const nuevoPrecio = parseInt(args[2], 10); if (isNaN(nuevoPrecio) || nuevoPrecio < 1) return;
            if (!configSistema.precios[chatId]) configSistema.precios[chatId] = { nacimiento: PRECIO_NACIMIENTO, nacimiento_nf: PRECIO_NACIMIENTO_NF, matrimonio: PRECIO_MATRIMONIO, matrimonio_mf: PRECIO_MATRIMONIO_MF, defuncion: PRECIO_DEFUNCION, defuncion_df: PRECIO_DEFUNCION_DF, divorcio: PRECIO_DIVORCIO, divorcio_d0: PRECIO_DIVORCIO_D0, sat: PRECIO_SAT, rfcclon: PRECIO_RFCCLON, receta: PRECIO_RECETA, cescolar: PRECIO_CESCOLAR, cmedico: PRECIO_CMEDICO };
            if (tipoServicio === 'acta') {
                configSistema.precios[chatId].nacimiento = nuevoPrecio; configSistema.precios[chatId].nacimiento_nf = nuevoPrecio;
                configSistema.precios[chatId].matrimonio = nuevoPrecio; configSistema.precios[chatId].matrimonio_mf = nuevoPrecio;
                configSistema.precios[chatId].defuncion = nuevoPrecio; configSistema.precios[chatId].defuncion_df = nuevoPrecio;
                configSistema.precios[chatId].divorcio = nuevoPrecio; configSistema.precios[chatId].divorcio_d0 = nuevoPrecio;
                guardarConfig(configSistema); await responder(`✅ *Precios actualizados*\n📋 Todas las Actas ahora cuestan: $${nuevoPrecio}.00`);
            } else { configSistema.precios[chatId][tipoServicio] = nuevoPrecio; guardarConfig(configSistema); await responder(`✅ *Nuevo precio*\n📋 ${tipoServicio.toUpperCase()}\n💵 $${nuevoPrecio}.00`); } return;
        }

        if (textoMensaje.toLowerCase().startsWith('/saldo') && esGrupo && tienePermisoOperativo) {
            const args = textoMensaje.split(' ').filter(a => a.trim() !== "");
            let targetUser = extraerIdCitado(); let montoPesos = 0;
            
            if (targetUser) montoPesos = parseInt(args[1] ? args[1].replace('+', '') : "0", 10) || 0;
            else if (args.length === 3) { targetUser = (args[1].includes('@') ? args[1] : `${args[1]}@c.us`); montoPesos = parseInt(args[2], 10) || 0; }

            if (targetUser && !isNaN(montoPesos)) {
                if (!saldosUsuarios[chatId]) saldosUsuarios[chatId] = {};
                if (!saldosUsuarios[chatId][targetUser]) saldosUsuarios[chatId][targetUser] = 0;
                
                saldosUsuarios[chatId][targetUser] += montoPesos;
                if (saldosUsuarios[chatId][targetUser] < 0) saldosUsuarios[chatId][targetUser] = 0;

                if (targetUser.includes('@c.us')) {
                    const numPuro = targetUser.split('@')[0]; let base = numPuro;
                    if (numPuro.startsWith('521')) base = numPuro.substring(3); else if (numPuro.startsWith('52')) base = numPuro.substring(2);
                    saldosUsuarios[chatId][`521${base}@c.us`] = saldosUsuarios[chatId][targetUser];
                    saldosUsuarios[chatId][`52${base}@c.us`] = saldosUsuarios[chatId][targetUser];
                }
                guardarSaldos(saldosUsuarios);
                await responder(`✅ *Saldo Asignado*\n👤 *Usuario:* ${targetUser.split('@')[0]}\n💰 *Abonado:* +$${montoPesos}.00\n🔋 *Disponible:* $${saldosUsuarios[chatId][targetUser]}.00`);
            } return;
        }

        if (textoMensaje.toLowerCase() === '.versaldo') {
            if (esGrupo && !esGrupoAutorizado) return;
            await responder(`🔋 *Tu saldo actual es:* $${saldosUsuarios[chatId]?.[senderViejo] || 0}.00 MXN`); return;
        }

        if (textoMensaje.toLowerCase() === '.pago') { if (esGrupo && !esGrupoAutorizado) return; await responder(configSistema.pagosGrupos[chatId] || 'ℹ️ Sin datos de pago.'); return; }
        if (textoMensaje.toLowerCase() === '.tramites') { if (esGrupo && !esGrupoAutorizado) return; await responder(configSistema.tramitesGrupos[chatId] || 'ℹ️ Sin trámites configurados.'); return; }
        if (textoMensaje.toLowerCase() === '.stock') { if (esGrupo && !esGrupoAutorizado) return; await responder(configSistema.stockGrupos[chatId] || 'ℹ️ Sin stock configurado.'); return; }

        if (esGrupo && !esGrupoAutorizado) return;

        // ==========================================
        // SISTEMA DE GESTORÍA (ACTAS Y TRÁMITES)
        // ==========================================
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
                const lineaLow = linea.toLowerCase();

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
                    tramitesAProcesar.push({ identificador: matchActa[1].toUpperCase(), codigo, costo: costoActa, nombreServicio });
                } else if (matchSat) {
                    tramitesAProcesar.push({ identificador: `RFC: ${matchSat[1].toUpperCase()} | IDCIF: ${matchSat[2].toUpperCase()}`, codigo: matchSat[3], costo: p.sat, nombreServicio: "Constancia Fiscal" });
                } else if (matchRfcClon) {
                    tramitesAProcesar.push({ identificador: `RFC CLON: ${matchRfcClon[1].toUpperCase()}`, codigo: matchRfcClon[2], costo: p.rfcclon, nombreServicio: "RFC Clon" });
                } else if (lineaLow.startsWith('.receta')) {
                    tramitesAProcesar.push({ identificador: `📝 Datos: ${linea.slice(7).trim() || "Sin datos extras"}`, codigo: "REC", costo: p.receta, nombreServicio: "Receta Médica" });
                } else if (lineaLow.startsWith('.cescolar')) {
                    tramitesAProcesar.push({ identificador: `🎓 Datos: ${linea.slice(9).trim() || "Sin datos extras"}`, codigo: "ESC", costo: p.cescolar, nombreServicio: "Certificado Escolar" });
                } else if (lineaLow.startsWith('.cmedico')) {
                    tramitesAProcesar.push({ identificador: `🏥 Datos: ${linea.slice(8).trim() || "Sin datos extras"}`, codigo: "MED", costo: p.cmedico, nombreServicio: "Certificado Médico" });
                }
            }

            if (tramitesAProcesar.length > 0) {
                let saldoDisponible = saldosUsuarios[chatId]?.[senderViejo] || 0;
                if (saldoDisponible <= 0) return await responder(`⚠️ *AVISO* ⚠️\nNo cuentas con saldo suficiente.`);

                let aliasDelGrupo = "SIN ALIAS";
                for (const [alias, id] of Object.entries(configSistema.gruposDestino || {})) { if (id === chatId) { aliasDelGrupo = alias; break; } }

                let textoConfirmacion = ""; let exitosos = []; let rechazados = [];

                for (const tramite of tramitesAProcesar) {
                    if (saldoDisponible >= tramite.costo) {
                        saldoDisponible -= tramite.costo; exitosos.push(tramite);
                        const alerta = `🔔 *TRÁMITE SOLICITADO*\n👤 *ID:* \`${senderViejo}\`\n🏷️ *Grupo:* \`${aliasDelGrupo}\`\n🔑 *Trámite:* ${tramite.identificador} ${tramite.nombreServicio.toUpperCase()}\n🔋 *Saldo restante:* $${saldoDisponible}.00`;
                        
                        let destinatarios = new Set([...SÚPER_ADMINS_NATOS]);
                        if (configSistema.notificadoresGrupos[chatId]) configSistema.notificadoresGrupos[chatId].forEach(id => destinatarios.add(id));
                        for (const destId of destinatarios) { try { await sock.sendMessage(toBaileys(destId), { text: alerta }); } catch (err) {} }
                    } else rechazados.push(tramite);
                }

                if (exitosos.length > 0) { textoConfirmacion += `✅ *Trámite(s) registrado(s)*\n`; for (const ex of exitosos) textoConfirmacion += `📄 ${ex.identificador} (${ex.codigo}) (-$${ex.costo})\n`; }
                if (rechazados.length > 0) { textoConfirmacion += `\n❌ *Rechazados (Sin Saldo):*\n`; for (const rch of rechazados) textoConfirmacion += `⚠️ [${rch.identificador} (${rch.codigo})]\n`; }

                saldosUsuarios[chatId][senderViejo] = saldoDisponible; guardarSaldos(saldosUsuarios);
                textoConfirmacion += `\n🔋 *Saldo disponible:* $${saldoDisponible}.00 MXN\nProcesando solicitud... ⌛`;
                await responder(textoConfirmacion);
            }
        }
    });
}

iniciarBot();