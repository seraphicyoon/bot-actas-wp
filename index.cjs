const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

process.on('unhandledRejection', (reason, promise) => {
    console.log('⚠️ Error de red bloqueado:', reason);
});

// --- TUS CREDENCIALES DE SÚPER ADMINISTRADORA ---
const SÚPER_ADMINS_NATOS = [
    '525658405318@c.us',
    '5215658405318@c.us',
    '91440457773103@lid'
];

// 📱 NÚMERO DEL BOT ACTUALIZADO PARA EL CÓDIGO DE VINCULACIÓN EN LA NUBE
const NUMERO_TELEFONO = '5219811718463'; 

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

// --- BASES DE DATOS ---
const PATH_SALDOS = path.join(__dirname, 'saldos.json');
const PATH_CONFIG = path.join(__dirname, 'config.json');

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
            return config;
        }
    } catch (e) {}
    
    const configInicial = { gruposAutorizados: [], vendedores: [], superAdmins: [], gruposDestino: {}, precios: {}, propietariosGrupos: {}, notificadoresGrupos: {} };
    fs.writeFileSync(PATH_CONFIG, JSON.stringify(configInicial, null, 4), 'utf8');
    return configInicial;
}

function guardarConfig(config) {
    try { fs.writeFileSync(PATH_CONFIG, JSON.stringify(config, null, 4), 'utf8'); } catch (error) {}
}

// 🛡️ FUNCIÓN BLINDADA PARA EXTRAER EL ID DE UN MENSAJE CITADO
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
    
    if (msg._data && msg._data.quotedStanzaID) {
        try {
            const chatActual = await msg.getChat().catch(() => null);
            if (chatActual) {
                const mensajesMemoria = await chatActual.fetchMessages({ limit: 50 }).catch(() => []);
                const mensajeCitado = mensajesMemoria.find(m => m.id.id === msg._data.quotedStanzaID);
                if (mensajeCitado) {
                    return mensajeCitado.author || mensajeCitado.from || mensajeCitado._data?.participant;
                }
            }
        } catch (e) {}
    }
    return "";
}

let saldosUsuarios = cargarSaldos();
let configSistema = cargarConfig();

const bot = new Client({
    authStrategy: new LocalAuth({ clientId: "sesion-actas" }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // <--- Con esto Railway asigna la ruta correcta en automático
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
    qrcode.generate(qr, { small: true });
    console.log('✨ Escanea el código QR ✨');
});

bot.on('ready', () => {
    console.log('🚀 ¡Bot en línea en la nube! Trámites y precios separados activos.');
});

bot.on('code', async (code) => {
    console.log(`🔢 CÓDIGO DE VINCULACIÓN: ${code}`);
});

bot.initialize().then(async () => {
    if (NUMERO_TELEFONO && NUMERO_TELEFONO.length > 8) {
        try {
            setTimeout(async () => {
                const pairingCode = await bot.requestPairingCode(NUMERO_TELEFONO);
                console.log(`🔢 CÓDIGO SOLICITADO PARA ${NUMERO_TELEFONO}: ${pairingCode}`);
            }, 6000);
        } catch (e) {}
    }
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
                    if (participanteConductor && (participanteConductor.isAdmin || participanteConductor.isSuperAdmin)) {
                        esAdminDelGrupo = true;
                    }
                }
            } catch (e) {}
        }

        const deMiNumero = msg.fromMe || SÚPER_ADMINS_NATOS.includes(senderId) || senderId.includes('525658405318') || senderId.includes('91440457773103') || configSistema.superAdmins.includes(senderId);
        const esDuenioDelGrupo = esGrupo && configSistema.propietariosGrupos && configSistema.propietariosGrupos[chatId] === senderId;
        const tienePermisoOperativo = deMiNumero || esDuenioDelGrupo || configSistema.vendedores.includes(senderId) || esAdminDelGrupo;
        const esGrupoAutorizado = configSistema.gruposAutorizados.includes(chatId);

        if (textoMensaje.toLowerCase().startsWith('/')) {
            
            if (textoMensaje.toLowerCase() === '/mantenimiento') {
                if (!deMiNumero) return; 
                for (let grupoId of configSistema.gruposAutorizados) {
                    await bot.sendMessage(grupoId, `⚠️ *BOT EN MANTENIMIENTO* ⚠️`).catch(()=>null);
                }
                await msg.reply('⚙️ Apagado.'); process.exit(0);
            }

            if (textoMensaje.toLowerCase() === '/apagado' || textoMensaje.toLowerCase() === '/descanso') {
                if (!deMiNumero) return;
                for (let grupoId of configSistema.gruposAutorizados) {
                    await bot.sendMessage(grupoId, `😴 *¡HORA DE DESCANSAR!* 😴`).catch(()=>null);
                }
                await msg.reply('💤 Apagado.'); process.exit(0);
            }

            if (textoMensaje.toLowerCase() === '/prendido') {
                if (!deMiNumero) return;
                for (let grupoId of configSistema.gruposAutorizados) {
                    await bot.sendMessage(grupoId, `🚀 *¡SISTEMA EN LÍNEA!* 🚀`).catch(()=>null);
                }
                await msg.reply('✅ Encendido.');
            }

            if (textoMensaje.toLowerCase().startsWith('/addvendedor')) {
                if (!deMiNumero) return;
                let nuevoVendedor = await extraerIdUsuarioCitado(msg);
                if (!nuevoVendedor) {
                    const args = textoMensaje.split(' ');
                    if (args.length > 1) nuevoVendedor = args[1].includes('@') ? args[1] : `${args[1]}@c.us`;
                }

                if (!nuevoVendedor) return await msg.reply('⚠️ Debes responder al mensaje del usuario o escribir su ID.');

                if (!configSistema.vendedores.includes(nuevoVendedor)) {
                    configSistema.vendedores.push(nuevoVendedor);
                    guardarConfig(configSistema);
                    await msg.reply(`✅ *Vendedor Registrado!*\nEl ID \`${nuevoVendedor}\` ahora puede dar saldo.`);
                } else {
                    await msg.reply('⚠️ Ese usuario ya es vendedor.');
                }
                return;
            }

            if (textoMensaje.toLowerCase().startsWith('/delvendedor')) {
                if (!deMiNumero) return;
                let vendedorBye = await extraerIdUsuarioCitado(msg);
                if (!vendedorBye) {
                    const args = textoMensaje.split(' ');
                    if (args.length > 1) vendedorBye = args[1].includes('@') ? args[1] : `${args[1]}@c.us`;
                }

                if (!vendedorBye) return await msg.reply('⚠️ Falta ID.');
                configSistema.vendedores = configSistema.vendedores.filter(id => id !== vendedorBye);
                guardarConfig(configSistema);
                await msg.reply(`❌ *Vendedor Eliminado!*`);
                return;
            }

            if (textoMensaje.toLowerCase() === '/activargrupo') {
                if (!esGrupo) return await msg.reply('⚠️ Solo en grupos.');
                if (!deMiNumero && !esAdminDelGrupo) return await msg.reply('⚠️ No tienes permisos de administración.');
                
                if (!configSistema.gruposAutorizados.includes(chatId)) {
                    configSistema.gruposAutorizados.push(chatId);
                    
                    try {
                        let duenioGrupo = await extraerIdUsuarioCitado(msg);
                        if (duenioGrupo) {
                            if (!configSistema.propietariosGrupos) configSistema.propietariosGrupos = {};
                            configSistema.propietariosGrupos[chatId] = duenioGrupo;
                        }
                    } catch (e) {}

                    guardarConfig(configSistema);
                    await msg.reply('✅ *¡Grupo Activado con éxito!*');
                } else {
                    await msg.reply('⚠️ Este grupo ya estaba activo.');
                }
                return;
            }

            if (textoMensaje.toLowerCase() === '/desactivargrupo') {
                if (!esGrupo) return;
                if (!deMiNumero && !esAdminDelGrupo) return;
                configSistema.gruposAutorizados = configSistema.gruposAutorizados.filter(id => id !== chatId);
                if (configSistema.propietariosGrupos) delete configSistema.propietariosGrupos[chatId];
                if (configSistema.notificadoresGrupos) delete configSistema.notificadoresGrupos[chatId];
                guardarConfig(configSistema);
                await msg.reply('❌ *Grupo Desactivado y limpio.*');
                return;
            }

            if (textoMensaje.toLowerCase().startsWith('/setgrupo ')) {
                if (!esGrupo) return await msg.reply('⚠️ Úsalo en el grupo.');
                if (!deMiNumero && !esAdminDelGrupo) return await msg.reply('⚠️ No tienes permisos.');
                
                const argumentos = textoMensaje.split(' ').filter(arg => arg.trim() !== "");
                if (argumentos.length < 2) return await msg.reply('⚠️ Uso: `/setgrupo [alias]`');
                
                const aliasNuevo = argumentos[1].toLowerCase();
                configSistema.gruposDestino[aliasNuevo] = chatId;
                guardarConfig(configSistema);
                await msg.reply(`✅ *Enlace Exitoso!* Alias: *${aliasNuevo}*`);
                return;
            }

            // GESTIÓN DE NOTIFICADORES
            if (textoMensaje.toLowerCase() === '/addnotis') {
                if (!esGrupo) return await msg.reply('⚠️ Úsalo dentro del grupo.');
                if (!deMiNumero && !esDuenioDelGrupo && !esAdminDelGrupo) return await msg.reply('⚠️ No tienes permisos.');

                let targetNoti = await extraerIdUsuarioCitado(msg);
                if (!targetNoti) targetNoti = senderId;

                if (!configSistema.notificadoresGrupos) configSistema.notificadoresGrupos = {};
                if (!configSistema.notificadoresGrupos[chatId]) configSistema.notificadoresGrupos[chatId] = [];

                if (!configSistema.notificadoresGrupos[chatId].includes(targetNoti)) {
                    configSistema.notificadoresGrupos[chatId].push(targetNoti);
                    guardarConfig(configSistema);
                    await msg.reply(`✅ *Notificador Agregado*\nEl usuario \`${targetNoti}\` ahora recibirá las alertas de este grupo.`);
                } else {
                    await msg.reply('⚠️ Este usuario ya está en la lista de notificaciones de este grupo.');
                }
                return;
            }

            if (textoMensaje.toLowerCase() === '/delnotis') {
                if (!esGrupo) return await msg.reply('⚠️ Úsalo dentro del grupo.');
                if (!deMiNumero && !esDuenioDelGrupo && !esAdminDelGrupo) return await msg.reply('⚠️ No tienes permisos.');

                let targetNoti = await extraerIdUsuarioCitado(msg);
                if (!targetNoti) targetNoti = senderId;

                if (configSistema.notificadoresGrupos && configSistema.notificadoresGrupos[chatId]) {
                    configSistema.notificadoresGrupos[chatId] = configSistema.notificadoresGrupos[chatId].filter(id => id !== targetNoti);
                    guardarConfig(configSistema);
                    await msg.reply(`❌ *Notificador Removido*\nSe eliminó a \`${targetNoti}\` de las alertas de este grupo.`);
                } else {
                    await msg.reply('⚠️ No hay notificadores registrados en este grupo.');
                }
                return;
            }

            if (textoMensaje.toLowerCase() === '/vernotis') {
                if (!esGrupo) return;
                let lista = configSistema.notificadoresGrupos && configSistema.notificadoresGrupos[chatId] ? configSistema.notificadoresGrupos[chatId] : [];
                if (lista.length === 0) {
                    return await msg.reply('ℹ️ No hay notificadores manuales en este grupo.');
                }
                let textoLista = "🔔 *Notificadores de este grupo:*\n\n";
                lista.forEach(id => textoLista += `• \`${id}\`\n`);
                await msg.reply(textoLista);
                return;
            }

            if (!tienePermisoOperativo) return; 

            if (textoMensaje.toLowerCase().startsWith('/precio ')) {
                if (!esGrupo) return await msg.reply('⚠️ Úsalo en un grupo.');
                const argumentos = textoMensaje.split(' ').filter(arg => arg.trim() !== "");
                if (argumentos.length < 3) return await msg.reply('⚠️ Uso: `/precio matrimonio 65` o `/precio acta 15`');

                let tipoServicio = argumentos[1].toLowerCase();
                const nuevoPrecio = parseInt(argumentos[2], 10);

                if (isNaN(nuevoPrecio) || nuevoPrecio < 1) return await msg.reply('⚠️ Cantidad inválida.');
                
                const serviciosValidos = ['nacimiento', 'nacimiento_nf', 'matrimonio', 'matrimonio_mf', 'defuncion', 'defuncion_df', 'divorcio', 'divorcio_d0', 'sat', 'rfcclon', 'acta'];
                if (!serviciosValidos.includes(tipoServicio)) {
                    return await msg.reply('⚠️ Servicio inválido.');
                }

                if (!configSistema.precios) configSistema.precios = {};
                if (!configSistema.precios[chatId]) {
                    configSistema.precios[chatId] = { 
                        nacimiento: PRECIO_NACIMIENTO, 
                        nacimiento_nf: PRECIO_NACIMIENTO_NF,
                        matrimonio: PRECIO_MATRIMONIO, 
                        matrimonio_mf: PRECIO_MATRIMONIO_MF,
                        defuncion: PRECIO_DEFUNCION, 
                        defuncion_df: PRECIO_DEFUNCION_DF,
                        divorcio: PRECIO_DIVORCIO, 
                        divorcio_d0: PRECIO_DIVORCIO_D0,
                        sat: PRECIO_SAT, 
                        rfcclon: PRECIO_RFCCLON 
                    };
                }

                if (tipoServicio === 'acta') {
                    configSistema.precios[chatId].nacimiento = nuevoPrecio;
                    configSistema.precios[chatId].nacimiento_nf = nuevoPrecio;
                    configSistema.precios[chatId].matrimonio = nuevoPrecio;
                    configSistema.precios[chatId].matrimonio_mf = nuevoPrecio;
                    configSistema.precios[chatId].defuncion = nuevoPrecio;
                    configSistema.precios[chatId].defuncion_df = nuevoPrecio;
                    configSistema.precios[chatId].divorcio = nuevoPrecio;
                    configSistema.precios[chatId].divorcio_d0 = nuevoPrecio;
                    guardarConfig(configSistema);
                    await msg.reply(`✅ *Precios actualizados*\n📋 Todas las Actas ahora cuestan: $${nuevoPrecio}.00`);
                } else {
                    configSistema.precios[chatId][tipoServicio] = nuevoPrecio;
                    guardarConfig(configSistema);
                    await msg.reply(`✅ *Nuevo precio*\n📋 ${tipoServicio.toUpperCase()}\n💵 $${nuevoPrecio}.00`);
                }
                return;
            }

            if (textoMensaje.toLowerCase() === '/id') {
                let idDetectado = await extraerIdUsuarioCitado(msg);
                if (idDetectado) {
                    await msg.reply(`🔑 *ID:* \`${idDetectado}\``);
                } else {
                    await msg.reply('⚠️ Cita un mensaje del usuario.');
                }
                return;
            }

            if (textoMensaje.toLowerCase().startsWith('/saldo')) {
                if (!esGrupo) return await msg.reply('⚠️ Usa esto dentro del grupo.');

                const argumentos = textoMensaje.split(' ').filter(arg => arg.trim() !== "");
                let targetUser = await extraerIdUsuarioCitado(msg);
                let montoPesos = 0;

                if (targetUser) {
                    let cantStr = argumentos[1] ? argumentos[1].replace('+', '') : "0";
                    montoPesos = parseInt(cantStr, 10) || 0;
                } else if (argumentos.length === 3) {
                    const posibleNum = argumentos[1];
                    const posibleCant = argumentos[2];
                    targetUser = (posibleNum.includes('@') ? posibleNum : `${posibleNum}@c.us`);
                    montoPesos = parseInt(posibleCant, 10) || 0;
                }

                if (targetUser && !isNaN(montoPesos)) {
                    saldosUsuarios = cargarSaldos();
                    if (!saldosUsuarios[chatId]) saldosUsuarios[chatId] = {};
                    if (!saldosUsuarios[chatId][targetUser]) saldosUsuarios[chatId][targetUser] = 0;

                    saldosUsuarios[chatId][targetUser] += montoPesos;
                    if (saldosUsuarios[chatId][targetUser] < 0) saldosUsuarios[chatId][targetUser] = 0;

                    if (targetUser.includes('@c.us')) {
                        const numeroPuro = targetUser.split('@')[0];
                        let baseCelular = numeroPuro;
                        if (numeroPuro.startsWith('521')) baseCelular = numeroPuro.substring(3);
                        else if (numeroPuro.startsWith('52')) baseCelular = numeroPuro.substring(2);
                        saldosUsuarios[chatId][`521${baseCelular}@c.us`] = saldosUsuarios[chatId][targetUser];
                        saldosUsuarios[chatId][`52${baseCelular}@c.us`] = saldosUsuarios[chatId][targetUser];
                    }

                    guardarSaldos(saldosUsuarios);
                    const nombreMostrar = targetUser.split('@')[0];
                    await msg.reply(`✅ *Saldo Asignado*\n👤 *Usuario:* ${nombreMostrar}\n💰 *Abonado:* +$${montoPesos}.00\n🔋 *Disponible:* $${saldosUsuarios[chatId][targetUser]}.00`).catch(()=>null);
                    return;
                } else {
                    await msg.reply('⚠️ Cita el mensaje del cliente con `/saldo 100`').catch(()=>null);
                    return;
                }
            }

            // COMANDO /R (REENVÍO SEGURO)
            if (textoMensaje.toLowerCase().startsWith('/r ')) {
                try {
                    const argumentos = textoMensaje.split(' ').filter(arg => arg.trim() !== "");
                    if (argumentos.length < 2) return await msg.reply('⚠️ Uso: `/r [alias] [ID]`');

                    const aliasDestino = argumentos[1].toLowerCase();
                    const idDelChatDestino = configSistema.gruposDestino[aliasDestino];

                    if (!idDelChatDestino) return await msg.reply(`⚠️ El alias *${aliasDestino}* no existe.`);

                    let targetUser = "";
                    if (argumentos.length > 2) {
                        const posibleNum = argumentos[2];
                        targetUser = (posibleNum.includes('@') ? posibleNum : `${posibleNum}@c.us`);
                    }

                    let mensajeObjetivo = null;
                    try {
                        if (msg.hasMedia) mensajeObjetivo = msg;
                        else if (msg.hasQuotedMsg) mensajeObjetivo = await msg.getQuotedMessage().catch(() => null);
                    } catch (e) {}

                    if (!mensajeObjetivo) {
                        const chatActual = await msg.getChat().catch(()=>null);
                        if (chatActual) {
                            const mensajesMemoria = await chatActual.fetchMessages({ limit: 15 }).catch(()=>[]);
                            if (msg._data && msg._data.quotedStanzaID) {
                                mensajeObjetivo = mensajesMemoria.find(m => m.id.id === msg._data.quotedStanzaID);
                            }
                            if (!mensajeObjetivo) {
                                for (let i = mensajesMemoria.length - 1; i >= 0; i--) {
                                    const m = mensajesMemoria[i];
                                    if (m.hasMedia || m.type === 'document' || m.type === 'image' || m.type === 'video') {
                                        mensajeObjetivo = m;
                                        break; 
                                    }
                                }
                            }
                        }
                    }

                    if (mensajeObjetivo) {
                        if (targetUser && !targetUser.includes('@g.us')) {
                            const baseUser = targetUser.split('@')[0];
                            await bot.sendMessage(idDelChatDestino, `✅ ¡Tu trámite está listo! @${baseUser}`, {
                                mentions: [targetUser]
                            });
                        }

                        await mensajeObjetivo.forward(idDelChatDestino);
                        await msg.reply(`✅ Documento reenviado a *${aliasDestino}*.`);
                    } else {
                        await msg.reply('⚠️ No detecté el archivo.');
                    }
                } catch (error) {
                    await msg.reply('⚠️ Fallo al reenviar.').catch(()=>null);
                }
                return;
            }
        }

        // -----------------------------------------------------------------
        // PROCESAMIENTO MÚLTIPLE DE TRÁMITES
        // -----------------------------------------------------------------
        if (esGrupo && !esGrupoAutorizado) return;

        if (!textoMensaje.startsWith('/')) {
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

            for (const linea of lineas) {
                const matchActa = linea.match(regexActas);
                const matchSat = linea.match(regexSat);
                const matchRfcClon = linea.match(regexRfcClon);

                if (matchActa) {
                    const codigo = matchActa[2].toUpperCase();
                    let costoActa = pNac;
                    let nombreServicio = "Acta de Nacimiento";

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
                }
            }

            if (tramitesAProcesar.length > 0) {
                const cliente = msg.author || msg.from;
                saldosUsuarios = cargarSaldos();
                if (!saldosUsuarios[chatId]) saldosUsuarios[chatId] = {};
                let saldoDisponible = saldosUsuarios[chatId][cliente] || 0;

                if (saldoDisponible <= 0) {
                    await msg.reply(`⚠️ *AVISO* ⚠️\nNo cuentas con saldo suficiente.`).catch(()=>null);
                    return;
                }

                let aliasDelGrupo = "SIN ALIAS";
                if (configSistema.gruposDestino) {
                    for (const [alias, id] of Object.entries(configSistema.gruposDestino)) {
                        if (id === chatId) { aliasDelGrupo = alias; break; }
                    }
                }

                let textoConfirmacion = "";
                let exitosos = [];
                let rechazados = [];

                for (const tramite of tramitesAProcesar) {
                    if (saldoDisponible >= tramite.costo) {
                        saldoDisponible -= tramite.costo;
                        exitosos.push(tramite);

                        const alertaPrivada = `🔔 *TRÁMITE SOLICITADO*\n👤 *ID:* \`${cliente}\`\n🏷️ *Grupo:* \`${aliasDelGrupo}\`\n📋 *Servicio:* ${tramite.nombreServicio}\n🔑 *Datos:* \`${tramite.identificador}\``;
                        
                        let destinatarios = new Set([...SÚPER_ADMINS_NATOS]);
                        if (configSistema.notificadoresGrupos && configSistema.notificadoresGrupos[chatId]) {
                            configSistema.notificadoresGrupos[chatId].forEach(id => destinatarios.add(id));
                        }

                        for (const destId of destinatarios) {
                            if (destId.includes('@c.us') || destId.includes('@lid')) {
                                try { await bot.sendMessage(destId, alertaPrivada); } catch (err) {}
                            }
                        }
                    } else {
                        rechazados.push(tramite);
                    }
                }

                if (exitosos.length > 0) {
                    textoConfirmacion += `✅ *Trámite(s) registrado(s)*\n`;
                    for (const ex of exitosos) textoConfirmacion += `📄 ${ex.identificador} (${ex.codigo}) (-$${ex.costo})\n`;
                }
                if (rechazados.length > 0) {
                    textoConfirmacion += `\n❌ *Rechazados (Sin Saldo):*\n`;
                    for (const rch of rechazados) textoConfirmacion += `⚠️ [${rch.identificador} (${rch.codigo})]\n`;
                }

                saldosUsuarios[chatId][cliente] = saldoDisponible;
                guardarSaldos(saldosUsuarios);
                textoConfirmacion += `\n🔋 *Saldo disponible:* $${saldoDisponible}.00 MXN\nProcesando solicitud... ⌛`;
                await msg.reply(textoConfirmacion).catch(()=>null);
            }
        }
    } catch (errorFatal) {
        console.error(errorFatal);
    }
});

bot.initialize();
