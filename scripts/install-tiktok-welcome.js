'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
function patchIndex(s){
 const once=(old,n)=>{if(s.split(old).length!==2)throw Error('No coincide index.js: '+old);s=s.replace(old,()=>n);};
 once("const {createStickerHandler} = require('./sticker-handler');","const {createStickerHandler} = require('./sticker-handler');\nconst {createTikTokHandler} = require('./tiktok-handler');\nconst {createWelcomeHandler} = require('./welcome-handler');");
 once("let colaMensajes = Promise.resolve();","const tiktok = createTikTokHandler({store: tiendaDB, owners: SÚPER_ADMINS_NATOS, loadConfig: cargarConfig, allowed: rentas.allowed, paused: ayuda.paused, isHelper: moderacion.isHelper});\nconst bienvenida = createWelcomeHandler({store: tiendaDB, owners: SÚPER_ADMINS_NATOS, loadConfig: cargarConfig, allowed: rentas.allowed, paused: ayuda.paused});\nlet colaMensajes = Promise.resolve();");
 const start="    sock.ev.on('group-participants.update', async (evento) => {",end="    sock.ev.on('groups.update', async (updates) => {";
 const i=s.indexOf(start),j=s.indexOf(end,i);
 if(i<0||j<0||s.indexOf(start,i+1)!==-1||!s.slice(i,j).includes('textoBienvenida'))throw Error('No coincide el evento de bienvenida local.');
 if(s.slice(i,j).replace(/\r\n/g,'\n').trim()!=="sock.ev.on('group-participants.update', async (evento) => {\n        let config = cargarConfig();\n        const chatId = evento.id;\n        if (!config.gruposAutorizados.includes(chatId) || ayuda.paused() || !rentas.allowed(chatId)) return;\n        \n        if (evento.action === 'add') {\n            for (const participante of evento.participants) {\n                try {\n                    const textoBienvenida = `👋 ¡Bienvenido/a al grupo! 🌸\\n\\n@${participante.split('@')[0]}, nos da gusto tenerte aquí.\\n\\n📖 Para aprender a pedir escribe: *.comandos*\\n📋 Para ver lo que vendemos: *.tramites*\\n💳 Para ver nuestras cuentas: *.pago*\\n\\n¡Cualquier duda, etiqueta a un administrador! ✨`;\n                    await sock.sendMessage(chatId, { text: textoBienvenida, mentions: [participante] });\n                } catch(e) {}\n            }\n        }\n    });")throw Error('La bienvenida local tiene modificaciones adicionales; se requiere revisar antes de instalar.');
 s=s.slice(0,i)+"    sock.ev.on('group-participants.update', evento => { void bienvenida.onJoin(sock,evento).catch(e=>console.error('[BIENVENIDA]',e.code||e.name)); });\n\n"+s.slice(j);
 once("        if (await stickers.handle(sock, msg)) return;","        if (await stickers.handle(sock, msg)) return;\n        if (await bienvenida.handle(sock, msg)) return;\n        if (await tiktok.handle(sock, msg)) return;");
 return s;
}
function patchHelp(s){
 const a="*Saldo y pago*\n";
 if(s.split(a).length!==2)throw Error("No coincide menú local.");
 return s.replace(a,()=>"*TikTok y bienvenidas*\n.tiktok / .ayudatiktok — guía y estado en el grupo.\n.tiktok on/off — dueño o admin activa/desactiva descargas.\n.bienvenida — por privado, dueño registrado del grupo u owner: lista, vista previa y personalización por alias.\n.bienvenida alias texto Tu mensaje con {usuario} — guarda y activa.\n.bienvenida alias ver/on/off/reset — consulta o cambia bienvenida.\n\n"+a);
}

try{
 const ref=process.argv[2]||'FETCH_HEAD',read=f=>fs.readFileSync(f,'utf8');
 const files={'index.js':patchIndex(read('index.js')),'help-handler.js':patchHelp(read('help-handler.js'))};
 for(const f of ['tiktok-handler.js','welcome-handler.js']){if(fs.existsSync(f))throw Error('El archivo '+f+' ya existe. No se sobrescribe.');files[f]=cp.execFileSync('git',['show',ref+':'+f],{encoding:'utf8'});}
 for(const s of Object.values(files))cp.execFileSync(process.execPath,['--check','-'],{input:s,stdio:['pipe','pipe','pipe']});
 if(process.env.NAEVIS_CHECK==='1'){console.log('COMPATIBLE: sin cambios');process.exit(0);}
 const backup=fs.mkdtempSync('/root/naevis-tiktok-welcome-');fs.chmodSync(backup,0o700);
 for(const f of ['index.js','help-handler.js'])fs.copyFileSync(f,path.join(backup,f));
 const created=[];
 try{for(const [f,s] of Object.entries(files)){if(!fs.existsSync(f))created.push(f);fs.writeFileSync(f,s);}}
 catch(e){for(const f of ['index.js','help-handler.js'])fs.copyFileSync(path.join(backup,f),f);for(const f of created)fs.rmSync(f,{force:true});throw e;}
 console.log('INSTALADO. Respaldo: '+backup);
}catch(e){console.error(e.message);process.exitCode=1;}
