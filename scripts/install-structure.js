'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');

function normalize(s){return s.replace(/\r\n/g,'\n').trimEnd();}
try{
 const ref=process.argv[2]||'FETCH_HEAD',get=(f,rev=ref)=>cp.execFileSync('git',['show',rev+':'+f],{encoding:'utf8'});
 const previous='f70c505635564168f96a48c661ddc09f5f0d3d28';
 const files={};
 // Index has local changes on the VPS. Apply only the exact routing anchors, never overwrite it.
 let index=fs.readFileSync('index.js','utf8');
 const pairs=[["const {createAnnouncementHandler} = require('./announcement-handler');","const {createAnnouncementHandler} = require('./announcement-handler');\nconst {createRouter} = require('./command-router');"],["const ayuda = createHelpHandler({store: tiendaDB, owners: SÚPER_ADMINS_NATOS, loadConfig: cargarConfig});","const ayuda = createHelpHandler({store: tiendaDB, owners: SÚPER_ADMINS_NATOS, loadConfig: cargarConfig, isHelper: moderacion.isHelper, allowed: rentas.allowed});"],["let colaMensajes = Promise.resolve();","const router = createRouter({store: tiendaDB, owners: SÚPER_ADMINS_NATOS, loadConfig: cargarConfig, rentas, moderacion, ayuda, stickers, tiktok, bienvenida, anuncios, nombres, tiendas});\nlet colaMensajes = Promise.resolve();"],["        if (!msg.key.remoteJid.endsWith('@g.us') && await ayuda.handle(sock, msg)) return;\n        if (await rentas.handle(sock, msg)) return;\n        if (await moderacion.handle(sock, msg)) return;\n        if (await ayuda.handle(sock, msg)) return;\n        if (await stickers.handle(sock, msg)) return;\n        if (await bienvenida.handle(sock, msg)) return;\n        if (await tiktok.handle(sock, msg)) return;\n        if (await anuncios.handle(sock, msg)) return;\n        if (await nombres.handle(sock, msg)) return;\n        if (await tiendas.handle(sock, msg)) return;","        if (await router.handle(sock, msg)) return;"],["Consulta .jinni para ver el modo, los permisos y ejemplos.","Consulta .ayuda para ver el modo, los permisos y ejemplos."]];

 for(const [old,next] of pairs){if(index.split(old).length!==2)throw Error('El index local tiene diferencias en '+old.slice(0,70));index=index.replace(old,()=>next);}
 const estadoAntes="if (update.announce) await sock.sendMessage(update.id, { text: '🔒 *LA TIENDA HA CERRADO* 🔒\\nPor el momento los administradores han pausado los pedidos.' });\n                        else await sock.sendMessage(update.id, { text: '🔓 *¡LA TIENDA ESTÁ ABIERTA!* 🔓\\nEl grupo está disponible nuevamente.' });",estadoDespues="if (!cargarConfig().gruposAutorizados.includes(update.id) || ayuda.paused() || !rentas.allowed(update.id)) return;\n                        const modoActual = tiendaDB.shop(update.id)?.mode;\n                        const ventas = modoActual === 'tienda' || modoActual === 'tramites';\n                        const textoEstado = update.announce ? (ventas ? '🔒 *PEDIDOS PAUSADOS*\\nSolo los administradores pueden enviar mensajes.' : '🔒 *GRUPO CERRADO*\\nSolo los administradores pueden enviar mensajes.') : (ventas ? '🔓 *PEDIDOS ABIERTOS*\\nEl grupo está disponible nuevamente.' : '🔓 *GRUPO ABIERTO*\\nTodos los miembros pueden participar.');\n                        await sock.sendMessage(update.id, { text: textoEstado });";
 if(index.split(estadoAntes).length!==2)throw Error('El aviso de apertura local tiene diferencias; revisar antes de instalar.');
 index=index.replace(estadoAntes,()=>estadoDespues);
 const retiredPairs=[[" nacimiento_nf: 15,",""],[" o \\`CURP NF\\`",""],["                configSistema.precios[chatId].nacimiento_nf = nuevoPrecio;\n",""],["                    else if (codigo === 'NF') { costoActa = p.nacimiento_nf; nombreServicio = \"Acta de Nacimiento (NF)\"; }\n",""],[" matrimonio_mf: 15,",""],[" o \\`CURP MF\\`",""],["                configSistema.precios[chatId].matrimonio_mf = nuevoPrecio;\n",""],["                    else if (codigo === 'MF') { costoActa = p.matrimonio_mf; nombreServicio = \"Acta de Matrimonio Foliada (MF)\"; }\n",""],[" defuncion_df: 15,",""],[" o \\`CURP DF\\`",""],["                configSistema.precios[chatId].defuncion_df = nuevoPrecio;\n",""],["                    else if (codigo === 'DF') { costoActa = p.defuncion_df; nombreServicio = \"Acta de Defunción (DF)\"; }\n",""],[" divorcio_d0: 15,",""],[" o \\`CURP D0\\`",""],["                configSistema.precios[chatId].divorcio_d0 = nuevoPrecio;\n",""],["                    else if (codigo === 'D0') { costoActa = p.divorcio_d0; nombreServicio = \"Acta de Divorcio (D0)\"; }\n",""],["([5-8]|NF|MF|DF|D0)","([5-8])"]];
 for(const [old,next] of retiredPairs){if(index.split(old).length!==2)throw Error('El index local difiere en códigos de actas: '+old.slice(0,70));index=index.replace(old,()=>next);}
 files['index.js']=index;
 // Help and rent modules are checked against the known deployed version before replacement.
 for(const f of ['help-handler.js','rental-handler.js']){
  const before=fs.readFileSync(f,'utf8'),expected=get(f,previous);
  const accepted=[expected];
  if(f==='help-handler.js'){
   let variant=expected;
   for(const [old,next] of [[".n Texto — anuncio con menciones en ventas (dueño/admin, no ayudantes); admite imagen o video.\\n.comprar codigo",".comprar codigo"],["*OWNER DEL BOT — PRIVADO*\\n/stickeraudio ajustar o recortar — responde a un video con sonido; también disponible en privado para la owner.\\n/avisos — recupera los avisos pendientes de /nombre en tu privado SIN volver a cobrar.\nEscribe .jinni al privado desde tu número principal para registrar el chat donde recibirás los avisos.\\n/r ID","*OWNER DEL BOT — PRIVADO*\n/r ID"]]){if(variant.split(old).length!==2)throw Error('No coincide la variante de ayuda prevista.');variant=variant.replace(old,()=>next);}
   accepted.push(variant);
  }
  if(!accepted.some(v=>normalize(before)===normalize(v)))throw Error('El archivo '+f+' tiene cambios locales adicionales; revisar antes de reemplazar.');
  files[f]=get(f);
 }
 for(const f of ['command-router.js','command-menus.js']){if(fs.existsSync(f))throw Error('Ya existe '+f+'; no se sobrescribe.');files[f]=get(f);}
 for(const code of Object.values(files))cp.execFileSync(process.execPath,['--check','-'],{input:code,stdio:['pipe','pipe','pipe']});
 if(process.env.NAEVIS_CHECK==='1'){console.log('ESTRUCTURA COMPATIBLE: sin cambios');process.exit(0);}
 const backup=fs.mkdtempSync('/root/naevis-estructura-');fs.chmodSync(backup,0o700);
 const oldFiles=['index.js','help-handler.js','rental-handler.js'];
 for(const f of oldFiles)fs.copyFileSync(f,path.join(backup,f));
 const created=[];
 try{for(const [f,code] of Object.entries(files)){if(!fs.existsSync(f))created.push(f);fs.writeFileSync(f,code);}}
 catch(e){for(const f of oldFiles)fs.copyFileSync(path.join(backup,f),f);for(const f of created)fs.rmSync(f,{force:true});throw e;}
 console.log('ESTRUCTURA INSTALADA. Respaldo: '+backup);
}catch(e){console.error(e.message);process.exitCode=1;}
