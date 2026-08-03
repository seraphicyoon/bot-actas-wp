const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

process.on('unhandledRejection', (reason, promise) => {
    console.log('⚠️ Error de red bloqueado:', reason);
});

// 🌐 SERVIDOR FANTASMA PARA RAILWAY
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Naevis Bot Activo');
}).listen(port);

// --- TUS CREDENCIALES DE SÚPER ADMINISTRADORA ---
const SÚPER_ADMINS_NATOS = [
    '525658405318@c.us',
    '5215658405318@c.us',
    '91440457773103@lid'
];

// --- PRECIOS BASE GENERALES ---
const PRECIO_NACIMIENTO = 12;
const PRECIO_NACIMIENTO_NF = 15;
const PRECIO_MATRIMONIO = 12;
const PRECIO_MATRIMONIO_MF = 15;
const PRECIO_DEFUNCION = 12;
const PRECIO_DEFUNCION_DF = 15;
const PRECIO_DIVORCIO = 12;
const PRECIO_DIVORCIO_D0 = 15;
const PRECIO_SAT = 40;
const PRECIO_RFCCLON = 15; 
const PRECIO_RECETA = 15;
const PRECIO_CESCOLAR = 15;
const PRECIO_CMEDICO = 15;

// --- BASES DE DATOS ---
const CARPETA_DATOS = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;

const PATH_SALDOS = path.join(CARPETA_DATOS, 'saldos.json');
const PATH_CONFIG = path.join(CARPETA_DATOS, 'config.json');

function cargarSaldos() {
    try {
        if (fs.existsSync(PATH_SALDOS)) {
            const data = fs.readFileSync(PATH_SALDOS, 'utf8').trim();
            if (data === "" || data === "{}") return {};
            return JSON.parse(data);
        }
    } catch (error) {
        fs.writeFileSync(PATH_SALDOS, '{}', 'utf8');
    }
    return {};
}

function guardarSaldos(saldos) {
    try { fs.writeFileSync(PATH_SALDOS, JSON.stringify(saldos, null, 4), 'utf8'); } catch (error) {}
}

function cargarConfig() {
    try {
        if (fs.existsSync(PATH_CONFIG)) {
            let config = JSON.parse(fs.readFileSync(PATH_CONFIG, 'utf8'));
            if (!config.gruposDestino) config.gruposDestino = {};
            if (!config.precios) config.precios = {};
            if (!config.propietariosGrupos) config.propietariosGrupos = {};
            if (!config.notificadoresGrupos) config.notificadoresGrupos = {};
            if (!config.stockGrupos) config.stockGrupos = {}; 
            if (!config.pagosGrupos) config.pagosGrupos = {}; 
            if (!config.tramitesGrupos) config.tramitesGrupos = {}; 
            return config;
        }
    } catch (e) {}
    
    const configInicial = { gruposAutorizados: [], vendedores: [], superAdmins: [], gruposDestino: {}, precios: {}, propietariosGrupos: {}, notificadoresGrupos: {}, stockGrupos: {}, pagosGrupos: {}, tramitesGrupos: {} };
    fs.writeFileSync(PATH_CONFIG, JSON.stringify(configInicial, null, 4), 'utf8');
    return configInicial;
}

function guardarConfig(config) {
    try { fs.writeFileSync(PATH_CONFIG, JSON.stringify(config, null, 4), 'utf8'); } catch (error) {}
}

async function responder(msg, texto) {
    try {
        if (msg.fromMe) await bot.sendMessage(msg.from, texto);
        else await msg.reply(texto);
    } catch (e) {
        try { await bot.sendMessage(msg.from, texto); } catch (err) {}
    }
}

async function extraerIdUsuarioCitado(msg) {
    if (!msg.hasQuotedMsg) return "";
    if (msg._data) {
        if (msg._data.quotedParticipant) return msg._data.quotedParticipant;
        if (msg._data.quotedMsg) {
            if (msg._data.quotedMsg.author) return msg._data.quotedMsg.author;
            if (msg._data.quotedMsg.participant) return msg._data.quotedMsg.participant;
            if (msg._data.quotedMsg.from) return msg._data.quotedMsg.from;
        }
    }
    try {
        const citado = await msg.getQuotedMessage().catch(() => null);
        if (citado) {
            if (citado.author) return citado.author;
            if (citado.from) return citado.from;
        }
    } catch (e) {}
    return "";
}

let saldosUsuarios = cargarSaldos();
let configSistema = cargarConfig();

const bot = new Client({
    authStrategy: new LocalAuth({ 
        clientId: "sesion-actas-v2", 
        dataPath: CARPETA_DATOS 
    }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-extensions',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

bot.on('qr', (qr) => {
    const qrWebUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    console.log('\n======================================================');
    console.log('🔗 ABRE ESTE ENLACE EN TU NAVEGADOR PARA ESCANEAR EL QR:');
    console.log(qrWebUrl);
    console.log('======================================================\n');
});

bot.on('ready', () => {
    console.log('🚀 ¡Bot en línea, conectado y respondiendo al 100%!');
});

bot.on('group_update', async (notification) => {
    try {
        const chatId = notification.chatId || (notification.id && notification.id.remote);
        if (!chatId) return;

        let configActual = cargarConfig();
        if (!configActual.gruposAutorizados.includes(chatId)) return;

        if (notification.type === 'announce') {
            setTimeout(async () => {
                try {
                    const chat = await bot.getChatById(chatId);
                    if (chat.announce) await bot.sendMessage(chatId, '🔒 *LA TIENDA HA CERRADO* 🔒\nPor el momento los administradores han pausado los pedidos. ¡Regresamos pronto!');
                    else await bot.sendMessage(chatId, '🔓 *¡LA TIENDA ESTÁ ABIERTA!* 🔓\nEl grupo está disponible nuevamente. Ya pueden solicitar sus trámites con normalidad.');
                } catch (err) {}
            }, 2000);
        }
    } catch (error) {}
});

bot.on('message_create', async (msg) => {
    try {
        const textoMensaje = msg.body ? msg.body.trim() : ""; 
        const senderId = msg.author || msg.from;
        const chatId = msg.from; 
        const esGrupo = chatId.includes('@g.us');

        let esAdminDelGrupo = false;
        if (esGrupo) {
            try {
                const chat = await msg.getChat().catch(()=>null);
                if (chat && chat.isGroup && chat.participants) {
                    const participanteConductor = chat.participants.find(p => p.id._serialized === senderId);
                    if (participanteConductor && (participanteConductor.isAdmin || participanteConductor.isSuperAdmin)) esAdminDelGrupo = true;
                }
            } catch (e) {}
        }

        const deMiNumero = msg.fromMe || SÚPER_ADMINS_NATOS.includes(senderId) || configSistema.superAdmins.includes(senderId);
        const esDuenioDelGrupo = esGrupo && configSistema.propietariosGrupos && configSistema.propietariosGrupos[chatId] === senderId;
        const tienePermisoOperativo = deMiNumero || esDuenioDelGrupo || configSistema.vendedores.includes(senderId) || esAdminDelGrupo;
        const esGrupoAutorizado = configSistema.gruposAutorizados.includes(chatId);

        if (textoMensaje.toLowerCase().startsWith('/')) {
            if (textoMensaje.toLowerCase() === '/mantenimiento' || textoMensaje.toLowerCase() === '/apagado') {
                if (!deMiNumero) return; 
                for (let grupoId of configSistema.gruposAutorizados) await bot.sendMessage(grupoId, `⚠️ *BOT EN MANTENIMIENTO* ⚠️`).catch(()=>null);
                await responder(msg, '⚙️ Apagado.'); process.exit(0);
            }

            if (textoMensaje.toLowerCase() === '/prendido') {
                if (!deMiNumero) return;
                for (let grupoId of configSistema.gruposAutorizados) await bot.sendMessage(grupoId, `🚀 *¡SISTEMA EN LÍNEA!* 🚀`).catch(()=>null);
                await responder(msg, '✅ Encendido.'); return;
            }

            if (textoMensaje.toLowerCase().startsWith('/addvendedor')) {
                if (!deMiNumero) return;
                let nuevoVendedor = await extraerIdUsuarioCitado(msg);
                if (!nuevoVendedor) { const args = textoMensaje.split(' '); if (args.length > 1) nuevoVendedor = args[1].includes('@') ? args[1] : `${args[1]}@c.us`; }
                if (!nuevoVendedor) return await responder(msg, '⚠️ Debes responder al mensaje del usuario.');
                if (!configSistema.vendedores.includes(nuevoVendedor)) { configSistema.vendedores.push(nuevoVendedor); guardarConfig(configSistema); await responder(msg, `✅ *Vendedor Registrado!*`); }
                return;
            }

            if (textoMensaje.toLowerCase().startsWith('/delvendedor')) {
                if (!deMiNumero) return;
                let vendedorBye = await extraerIdUsuarioCitado(msg);
                if (!vendedorBye) { const args = textoMensaje.split(' '); if (args.length > 1) vendedorBye = args[1].includes('@') ? args[1] : `${args[1]}@c.us`; }
                if (!vendedorBye) return;
                configSistema.vendedores = configSistema.vendedores.filter(id => id !== vendedorBye); guardarConfig(configSistema);
                await responder(msg, `❌ *Vendedor Eliminado!*`); return;
            }

            if (textoMensaje.toLowerCase() === '/activargrupo') {
                if (!esGrupo || (!deMiNumero && !esAdminDelGrupo)) return;
                if (!configSistema.gruposAutorizados.includes(chatId)) {
                    configSistema.gruposAutorizados.push(chatId);
                    try { let duenioGrupo = await extraerIdUsuarioCitado(msg); if (duenioGrupo) configSistema.propietariosGrupos[chatId] = duenioGrupo; } catch (e) {}
                    guardarConfig(configSistema); await responder(msg, '✅ *¡Grupo Activado con éxito!*');
                } return;
            }

            if (textoMensaje.toLowerCase() === '/desactivargrupo') {
                if (!esGrupo || (!deMiNumero && !esAdminDelGrupo)) return;
                configSistema.gruposAutorizados = configSistema.gruposAutorizados.filter(id => id !== chatId);
                delete configSistema.propietariosGrupos[chatId]; delete configSistema.notificadoresGrupos[chatId];
                guardarConfig(configSistema); await responder(msg, '❌ *Grupo Desactivado y limpio.*'); return;
            }

            if (textoMensaje.toLowerCase().startsWith('/setgrupo ')) {
                if (!esGrupo || (!deMiNumero && !esAdminDelGrupo)) return;
                const argumentos = textoMensaje.split(' ').filter(arg => arg.trim() !== ""); if (argumentos.length < 2) return;
                configSistema.gruposDestino[argumentos[1].toLowerCase()] = chatId; guardarConfig(configSistema);
                await responder(msg, `✅ *Enlace Exitoso!* Alias: *${argumentos[1].toLowerCase()}*`); return;
            }

            if (textoMensaje.toLowerCase() === '/addnotis') {
                if (!esGrupo || (!deMiNumero && !esDuenioDelGrupo && !esAdminDelGrupo)) return;
                let targetNoti = await extraerIdUsuarioCitado(msg) || senderId;
                if (!configSistema.notificadoresGrupos[chatId]) configSistema.notificadoresGrupos[chatId] = [];
                if (!configSistema.notificadoresGrupos[chatId].includes(targetNoti)) { configSistema.notificadoresGrupos[chatId].push(targetNoti); guardarConfig(configSistema); await responder(msg, `✅ *Notificador Agregado*`); }
                return;
            }

            if (textoMensaje.toLowerCase() === '/delnotis') {
                if (!esGrupo || (!deMiNumero && !esDuenioDelGrupo && !esAdminDelGrupo)) return;
                let targetNoti = await extraerIdUsuarioCitado(msg) || senderId;
                if (configSistema.notificadoresGrupos[chatId]) { configSistema.notificadoresGrupos[chatId] = configSistema.notificadoresGrupos[chatId].filter(id => id !== targetNoti); guardarConfig(configSistema); await responder(msg, `❌ *Notificador Removido*`); }
                return;
            }

            if (textoMensaje.toLowerCase() === '/vernotis') {
                if (!esGrupo) return;
                let lista = configSistema.notificadoresGrupos[chatId] || [];
                if (lista.length === 0) return await responder(msg, 'ℹ️ No hay notificadores.');
                let textoLista = "🔔 *Notificadores:*\n\n"; lista.forEach(id => textoLista += `• \`${id}\`\n`); await responder(msg, textoLista); return;
            }

            if (textoMensaje.toLowerCase().startsWith('/setstock ') && tienePermisoOperativo && esGrupo) {
                configSistema.stockGrupos[chatId] = textoMensaje.slice(10).trim(); guardarConfig(configSistema);
                await responder(msg, '✅ *Inventario actualizado.*'); return;
            }

            if (textoMensaje.toLowerCase().startsWith('/settramites ') && tienePermisoOperativo && esGrupo) {
                configSistema.tramitesGrupos[chatId] = textoMensaje.slice(13).trim(); guardarConfig(configSistema);
                await responder(msg, '✅ *Lista de trámites actualizada.*'); return;
            }

            if (textoMensaje.toLowerCase().startsWith('/precio ') && tienePermisoOperativo && esGrupo) {
                const argumentos = textoMensaje.split(' ').filter(arg => arg.trim() !== ""); if (argumentos.length < 3) return;
                let tipoServicio = argumentos[1].toLowerCase(); const nuevoPrecio = parseInt(argumentos[2], 10);
                if (isNaN(nuevoPrecio) || nuevoPrecio < 1) return;
                
                if (!configSistema.precios[chatId]) configSistema.precios[chatId] = { nacimiento: PRECIO_NACIMIENTO, nacimiento_nf: PRECIO_NACIMIENTO_NF, matrimonio: PRECIO_MATRIMONIO, matrimonio_mf: PRECIO_MATRIMONIO_MF, defuncion: PRECIO_DEFUNCION, defuncion_df: PRECIO_DEFUNCION_DF, divorcio: PRECIO_DIVORCIO, divorcio_d0: PRECIO_DIVORCIO_D0, sat: PRECIO_SAT, rfcclon: PRECIO_RFCCLON, receta: PRECIO_RECETA, cescolar: PRECIO_CESCOLAR, cmedico: PRECIO_CMEDICO };
                
                if (tipoServicio === 'acta') {
                    configSistema.precios[chatId].nacimiento = nuevoPrecio; configSistema.precios[chatId].nacimiento_nf = nuevoPrecio;
                    configSistema.precios[chatId].matrimonio = nuevoPrecio; configSistema.precios[chatId].matrimonio_mf = nuevoPrecio;
                    configSistema.precios[chatId].defuncion = nuevoPrecio; configSistema.precios[chatId].defuncion_df = nuevoPrecio;
                    configSistema.precios[chatId].divorcio = nuevoPrecio; configSistema.precios[chatId].divorcio_d0 = nuevoPrecio;
                    guardarConfig(configSistema); await responder(msg, `✅ *Precios actualizados*\n📋 Todas las Actas ahora cuestan: $${nuevoPrecio}.00`);
                } else {
                    configSistema.precios[chatId][tipoServicio] = nuevoPrecio; guardarConfig(configSistema);
                    await responder(msg, `✅ *Nuevo precio*\n📋 ${tipoServicio.toUpperCase()}\n💵 $${nuevoPrecio}.00`);
                } return;
            }

            if (textoMensaje.toLowerCase().startsWith('/saldo') && esGrupo) {
                const argumentos = textoMensaje.split(' ').filter(arg => arg.trim() !== "");
                let targetUser = await extraerIdUsuarioCitado(msg); let montoPesos = 0;

                if (targetUser) montoPesos = parseInt(argumentos[1] ? argumentos[1].replace('+', '') : "0", 10) || 0;
                else if (argumentos.length === 3) { targetUser = (argumentos[1].includes('@') ? argumentos[1] : `${argumentos[1]}@c.us`); montoPesos = parseInt(argumentos[2], 10) || 0; }

                if (targetUser && !isNaN(montoPesos)) {
                    if (!saldosUsuarios[chatId]) saldosUsuarios[chatId] = {};
                    if (!saldosUsuarios[chatId][targetUser]) saldosUsuarios[chatId][targetUser] = 0;
                    saldosUsuarios[chatId][targetUser] += montoPesos;
                    if (saldosUsuarios[chatId][targetUser] < 0) saldosUsuarios[chatId][targetUser] = 0;

                    if (targetUser.includes('@c.us')) {
                        const numeroPuro = targetUser.split('@')[0]; let baseCelular = numeroPuro;
                        if (numeroPuro.startsWith('521')) baseCelular = numeroPuro.substring(3); else if (numeroPuro.startsWith('52')) baseCelular = numeroPuro.substring(2);
                        saldosUsuarios[chatId][`521${baseCelular}@c.us`] = saldosUsuarios[chatId][targetUser];
                        saldosUsuarios[chatId][`52${baseCelular}@c.us`] = saldosUsuarios[chatId][targetUser];
                    }
                    guardarSaldos(saldosUsuarios);
                    await responder(msg, `✅ *Saldo Asignado*\n👤 *Usuario:* ${targetUser.split('@')[0]}\n💰 *Abonado:* +$${montoPesos}.00\n🔋 *Disponible:* $${saldosUsuarios[chatId][targetUser]}.00`);
                } return;
            }

            if (textoMensaje.toLowerCase().startsWith('/r ')) {
                try {
                    const argumentos = textoMensaje.split(' ').filter(arg => arg.trim() !== ""); if (argumentos.length < 2) return;
                    const aliasDestino = argumentos[1].toLowerCase(); const idDelChatDestino = configSistema.gruposDestino[aliasDestino];
                    if (!idDelChatDestino) return await responder(msg, `⚠️ El alias *${aliasDestino}* no existe.`);

                    let targetUser = "";
                    if (argumentos.length > 2) { const posibleNum = argumentos[2]; targetUser = (posibleNum.includes('@') ? posibleNum : `${posibleNum}@c.us`); }

                    let mensajeObjetivo = null;
                    if (msg.hasMedia) mensajeObjetivo = msg; else if (msg.hasQuotedMsg) mensajeObjetivo = await msg.getQuotedMessage().catch(() => null);

                    if (mensajeObjetivo) {
                        let contactToMention = null;
                        if (targetUser && !targetUser.includes('@g.us')) {
                            try { contactToMention = await bot.getContactById(targetUser); } catch(e){}
                            await bot.sendMessage(idDelChatDestino, `✅ ¡Tu trámite está listo! @${targetUser.split('@')[0]}`, { mentions: contactToMention ? [contactToMention] : [] });
                        }
                        await mensajeObjetivo.forward(idDelChatDestino); await responder(msg, `✅ Documento reenviado.`);
                    } else await responder(msg, '⚠️ No detecté el archivo.');
                } catch (error) {} return;
            }
        }

        if (textoMensaje.toLowerCase() === '.jinni' && tienePermisoOperativo) {
            await responder(msg, `🌸 *LISTA MAESTRA DE COMANDOS - JINNI* 🌸\n\n👑 *Súper Admins:*\n• /mantenimiento, /prendido\n• /addvendedor, /delvendedor\n\n⚙️ *Gestión:*\n• /activargrupo, /setgrupo\n• .abrir / .cerrar\n\n🧹 *Memoria:*\n• .grupos, .eliminar [alias o ID]\n\n💰 *Operaciones:*\n• /precio, /saldo, /r\n• .setpago, /setstock, /settramites\n\n👢 *Moderación:*\n• .kick, .n`);
            return;
        }

        if (textoMensaje.toLowerCase() === '.grupos' && tienePermisoOperativo) {
            let list = "📂 *Grupos en Memoria:*\n\n"; let aliases = configSistema.gruposDestino || {};
            for (const [alias, id] of Object.entries(aliases)) list += `🏷️ *Alias:* ${alias}\n🆔 *ID:* ${id}\n\n`;
            for (const id of (configSistema.gruposAutorizados || [])) if (!Object.values(aliases).includes(id)) list += `🏷️ *Sin alias*\n🆔 *ID:* ${id}\n\n`;
            await responder(msg, list || "📂 No hay grupos guardados."); return;
        }

        if (textoMensaje.toLowerCase().startsWith('.eliminar ') && tienePermisoOperativo) {
            const target = textoMensaje.slice(10).trim(); let targetId = target; let targetAlias = null;
            for (const [alias, id] of Object.entries(configSistema.gruposDestino || {})) { if (alias === target.toLowerCase() || id === target) { targetId = id; targetAlias = alias; break; } }
            configSistema.gruposAutorizados = configSistema.gruposAutorizados.filter(id => id !== targetId);
            delete configSistema.precios[targetId]; delete configSistema.propietariosGrupos[targetId]; delete configSistema.notificadoresGrupos[targetId]; delete configSistema.stockGrupos[targetId]; delete configSistema.pagosGrupos[targetId]; delete configSistema.tramitesGrupos[targetId];
            if (targetAlias) delete configSistema.gruposDestino[targetAlias];
            guardarConfig(configSistema);
            if (saldosUsuarios[targetId]) { delete saldosUsuarios[targetId]; guardarSaldos(saldosUsuarios); }
            await responder(msg, `🗑️ *Memoria liberada exitosamente.*`); return;
        }

        if (textoMensaje.toLowerCase() === '.cerrar' && tienePermisoOperativo && esGrupo) {
            try { const chat = await msg.getChat(); await chat.setMessagesAdminsOnly(true); await responder(msg, '✅ *Grupo cerrado.*'); } catch (e) { await responder(msg, `⚠️ Error: ${e.message || "r"}`); } return;
        }

        if (textoMensaje.toLowerCase() === '.abrir' && tienePermisoOperativo && esGrupo) {
            try { const chat = await msg.getChat(); await chat.setMessagesAdminsOnly(false); await responder(msg, '🔓 *Grupo abierto.*'); } catch (e) { await responder(msg, `⚠️ Error: ${e.message || "r"}`); } return;
        }

        if ((textoMensaje.toLowerCase().startsWith('.setpago ') || textoMensaje.toLowerCase().startsWith('/setpago ')) && tienePermisoOperativo && esGrupo) {
            configSistema.pagosGrupos[chatId] = textoMensaje.substring(textoMensaje.indexOf(' ') + 1).trim(); guardarConfig(configSistema); await responder(msg, '✅ *Datos de pago guardados.*'); return;
        }

        if (textoMensaje.toLowerCase().startsWith('.settramites ') && tienePermisoOperativo && esGrupo) {
            configSistema.tramitesGrupos[chatId] = textoMensaje.substring(textoMensaje.indexOf(' ') + 1).trim(); guardarConfig(configSistema); await responder(msg, '✅ *Lista de trámites guardada.*'); return;
        }

        if (textoMensaje.toLowerCase() === '.pago') { if (esGrupo && !esGrupoAutorizado) return; await responder(msg, configSistema.pagosGrupos[chatId] || 'ℹ️ Sin datos de pago.'); return; }
        if (textoMensaje.toLowerCase() === '.tramites') { if (esGrupo && !esGrupoAutorizado) return; await responder(msg, configSistema.tramitesGrupos[chatId] || 'ℹ️ Sin trámites configurados.'); return; }
        if (textoMensaje.toLowerCase() === '.stock') { if (esGrupo && !esGrupoAutorizado) return; await responder(msg, configSistema.stockGrupos[chatId] || 'ℹ️ Sin stock configurado.'); return; }
        if (textoMensaje.toLowerCase() === '.versaldo') { if (esGrupo && !esGrupoAutorizado) return; await responder(msg, `🔋 *Tu saldo actual es:* $${saldosUsuarios[chatId]?.[senderId] || 0}.00 MXN`); return; }

        if (textoMensaje.toLowerCase().startsWith('.kick') && tienePermisoOperativo && esGrupo) {
            let targetKick = await extraerIdUsuarioCitado(msg);
            if (!targetKick) { const args = textoMensaje.split(' '); if (args.length > 1) targetKick = args[1].includes('@') ? args[1] : `${args[1]}@c.us`; }
            if (!targetKick) return await responder(msg, '⚠️ Etiqueta o cita.');
            try { const chat = await msg.getChat(); await chat.removeParticipants([targetKick]); await responder(msg, '👢 *¡Usuario expulsado!*'); } catch (error) { await responder(msg, `⚠️ Fallo: ${error.message || "r"}`); } return;
        }

        if (textoMensaje.toLowerCase().startsWith('.n ') && tienePermisoOperativo && esGrupo) {
            const anuncio = textoMensaje.slice(3).trim(); if (!anuncio) return await responder(msg, '⚠️ Escribe el mensaje.');
            try {
                const chat = await msg.getChat();
                let mentions = [];
                for(let participant of chat.participants) { mentions.push(participant.id._serialized); }
                await chat.sendMessage(`📢 *ANUNCIO IMPORTANTE:*\n\n${anuncio}`, { mentions });
            } catch (e) { await responder(msg, `⚠️ Fallo: ${e.message || "r"}`); } return;
        }

        if (esGrupo && !esGrupoAutorizado) return;

        // --- SISTEMA DE GESTORÍA INTACTO ---
        if (!textoMensaje.startsWith('/') && !textoMensaje.startsWith('.') && textoMensaje.toLowerCase() !== '.versaldo') {
            const lineas = textoMensaje.split('\n').map(l => l.trim()).filter(l => l !== "");
            const regexActas = /^([A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d)\s([5-8]|NF|MF|DF|D0)$/i;
            const regexSat = /^([A-Z&Ññ]{3,4}\d{6}[A-Z0-9]{3})\s([A-Z0-9]+)\s(9)$/i;
            const regexRfcClon = /^([A-Z&Ññ]{3,4}\d{6}[A-Z0-9]{3})\s(1)$/i;
            
            let tramitesAProcesar = [];
            let pNac = configSistema.precios?.[chatId]?.nacimiento ?? PRECIO_NACIMIENTO;
            let pNacNf = configSistema.precios?.[chatId]?.nacimiento_nf ?? PRECIO_NACIMIENTO_NF;
            let pMat = configSistema.precios?.[chatId]?.matrimonio ?? PRECIO_MATRIMONIO;
            let pMatMf = configSistema.precios?.[chatId]?.matrimonio_mf ?? PRECIO_MATRIMONIO_MF;
            let pDef = configSistema.precios?.[chatId]?.defuncion ?? PRECIO_DEFUNCION;
            let pDefDf = configSistema.precios?.[chatId]?.defuncion_df ?? PRECIO_DEFUNCION_DF;
            let pDiv = configSistema.precios?.[chatId]?.divorcio ?? PRECIO_DIVORCIO;
            let pDivD0 = configSistema.precios?.[chatId]?.divorcio_d0 ?? PRECIO_DIVORCIO_D0;
            let pSat = configSistema.precios?.[chatId]?.sat ?? PRECIO_SAT;
            let pRfc = configSistema.precios?.[chatId]?.rfcclon ?? PRECIO_RFCCLON;
            let pReceta = configSistema.precios?.[chatId]?.receta ?? PRECIO_RECETA;
            let pCEscolar = configSistema.precios?.[chatId]?.cescolar ?? PRECIO_CESCOLAR;
            let pCMedico = configSistema.precios?.[chatId]?.cmedico ?? PRECIO_CMEDICO;

            for (const linea of lineas) {
                const matchActa = linea.match(regexActas);
                const matchSat = linea.match(regexSat);
                const matchRfcClon = linea.match(regexRfcClon);
                const lineaLow = linea.toLowerCase();

                if (matchActa) {
                    const codigo = matchActa[2].toUpperCase();
                    let costoActa = pNac; let nombreServicio = "Acta de Nacimiento";
                    if (codigo === '6') { costoActa = pMat; nombreServicio = "Acta de Matrimonio"; }
                    else if (codigo === '7') { costoActa = pDef; nombreServicio = "Acta de Defunción"; }
                    else if (codigo === '8') { costoActa = pDiv; nombreServicio = "Acta de Divorcio"; }
                    else if (codigo === 'NF') { costoActa = pNacNf; nombreServicio = "Acta de Nacimiento (NF)"; }
                    else if (codigo === 'MF') { costoActa = pMatMf; nombreServicio = "Acta de Matrimonio Foliada (MF)"; }
                    else if (codigo === 'DF') { costoActa = pDefDf; nombreServicio = "Acta de Defunción (DF)"; }
                    else if (codigo === 'D0') { costoActa = pDivD0; nombreServicio = "Acta de Divorcio (D0)"; }
                    tramitesAProcesar.push({ tipo: 'acta', identificador: matchActa[1].toUpperCase(), codigo, costo: costoActa, nombreServicio });
                } else if (matchSat) {
                    tramitesAProcesar.push({ tipo: 'sat', identificador: `RFC: ${matchSat[1].toUpperCase()} | IDCIF: ${matchSat[2].toUpperCase()}`, codigo: matchSat[3], costo: pSat, nombreServicio: "Constancia Fiscal" });
                } else if (matchRfcClon) {
                    tramitesAProcesar.push({ tipo: 'rfcclon', identificador: `RFC CLON: ${matchRfcClon[1].toUpperCase()}`, codigo: matchRfcClon[2], costo: pRfc, nombreServicio: "RFC Clon" });
                } else if (lineaLow.startsWith('.receta')) {
                    tramitesAProcesar.push({ tipo: 'receta', identificador: `📝 Datos: ${linea.slice(7).trim() || "Sin datos extras"}`, codigo: "REC", costo: pReceta, nombreServicio: "Receta Médica" });
                } else if (lineaLow.startsWith('.cescolar')) {
                    tramitesAProcesar.push({ tipo: 'cescolar', identificador: `🎓 Datos: ${linea.slice(9).trim() || "Sin datos extras"}`, codigo: "ESC", costo: pCEscolar, nombreServicio: "Certificado Escolar" });
                } else if (lineaLow.startsWith('.cmedico')) {
                    tramitesAProcesar.push({ tipo: 'cmedico', identificador: `🏥 Datos: ${linea.slice(8).trim() || "Sin datos extras"}`, codigo: "MED", costo: pCMedico, nombreServicio: "Certificado Médico" });
                }
            }

            if (tramitesAProcesar.length > 0) {
                const cliente = msg.author || msg.from;
                let saldoDisponible = saldosUsuarios[chatId]?.[cliente] || 0;

                if (saldoDisponible <= 0) return await responder(msg, `⚠️ *AVISO* ⚠️\nNo cuentas con saldo suficiente.`);

                let aliasDelGrupo = "SIN ALIAS";
                for (const [alias, id] of Object.entries(configSistema.gruposDestino || {})) { if (id === chatId) { aliasDelGrupo = alias; break; } }

                let textoConfirmacion = ""; let exitosos = []; let rechazados = [];

                for (const tramite of tramitesAProcesar) {
                    if (saldoDisponible >= tramite.costo) {
                        saldoDisponible -= tramite.costo; exitosos.push(tramite);
                        const alerta = `🔔 *TRÁMITE SOLICITADO*\n👤 *ID:* \`${cliente}\`\n🏷️ *Grupo:* \`${aliasDelGrupo}\`\n🔑 *Trámite:* ${tramite.identificador}\n🔋 *Saldo restante:* $${saldoDisponible}.00`;
                        let destinatarios = new Set([...SÚPER_ADMINS_NATOS]);
                        if (configSistema.notificadoresGrupos[chatId]) configSistema.notificadoresGrupos[chatId].forEach(id => destinatarios.add(id));
                        for (const destId of destinatarios) { try { await bot.sendMessage(destId, alerta); } catch (err) {} }
                    } else rechazados.push(tramite);
                }

                if (exitosos.length > 0) { textoConfirmacion += `✅ *Trámite(s) registrado(s)*\n`; for (const ex of exitosos) textoConfirmacion += `📄 ${ex.identificador} (${ex.codigo}) (-$${ex.costo})\n`; }
                if (rechazados.length > 0) { textoConfirmacion += `\n❌ *Rechazados (Sin Saldo):*\n`; for (const rch of rechazados) textoConfirmacion += `⚠️ [${rch.identificador} (${rch.codigo})]\n`; }

                saldosUsuarios[chatId][cliente] = saldoDisponible; guardarSaldos(saldosUsuarios);
                textoConfirmacion += `\n🔋 *Saldo disponible:* $${saldoDisponible}.00 MXN\nProcesando solicitud... ⌛`;
                await responder(msg, textoConfirmacion);
            }
        }
    } catch (errorFatal) {}
});

bot.initialize();
