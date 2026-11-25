'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
try{
 const ref=process.argv[2]||'FETCH_HEAD';
 const previous=['f1e71688eedb1330c3b1cb02ff5da5e6acca5f5a','7b168ffa677009b993db3fbe32e20e57fa6280b5','3c37b6002f8d5b8a38a1c96493d7491d75ebbaec'];
 const get=(rev,f)=>cp.execFileSync('git',['show',rev+':'+f],{encoding:'utf8'});
 const norm=s=>s.replace(/\r\n/g,'\n').trimEnd();
 const files=['command-menus.js','help-handler.js','command-router.js'],next={};
 for(const f of files){
  const current=fs.readFileSync(f,'utf8');next[f]=get(ref,f);
  if(![...previous.map(rev=>get(rev,f)),next[f]].some(s=>norm(s)===norm(current)))throw Error('Cambios locales no previstos en '+f);
  cp.execFileSync(process.execPath,['--check','-'],{input:next[f],stdio:['pipe','pipe','pipe']});
 }
 let index=fs.readFileSync('index.js','utf8');
 if(!index.includes('router.handle(sock, msg)'))throw Error('La estructura nueva no está instalada.');
 if(index.includes('([5-8]|NF|MF|DF|D0)')){
 const retiredPairs=[[" nacimiento_nf: 15,",""],[" o \\`CURP NF\\`",""],["                configSistema.precios[chatId].nacimiento_nf = nuevoPrecio;\n",""],["                    else if (codigo === 'NF') { costoActa = p.nacimiento_nf; nombreServicio = \"Acta de Nacimiento (NF)\"; }\n",""],[" matrimonio_mf: 15,",""],[" o \\`CURP MF\\`",""],["                configSistema.precios[chatId].matrimonio_mf = nuevoPrecio;\n",""],["                    else if (codigo === 'MF') { costoActa = p.matrimonio_mf; nombreServicio = \"Acta de Matrimonio Foliada (MF)\"; }\n",""],[" defuncion_df: 15,",""],[" o \\`CURP DF\\`",""],["                configSistema.precios[chatId].defuncion_df = nuevoPrecio;\n",""],["                    else if (codigo === 'DF') { costoActa = p.defuncion_df; nombreServicio = \"Acta de Defunción (DF)\"; }\n",""],[" divorcio_d0: 15,",""],[" o \\`CURP D0\\`",""],["                configSistema.precios[chatId].divorcio_d0 = nuevoPrecio;\n",""],["                    else if (codigo === 'D0') { costoActa = p.divorcio_d0; nombreServicio = \"Acta de Divorcio (D0)\"; }\n",""],["([5-8]|NF|MF|DF|D0)","([5-8])"]];
 for(const [old,next] of retiredPairs){if(index.split(old).length!==2)throw Error('El index local difiere en códigos de actas: '+old.slice(0,70));index=index.replace(old,()=>next);}
 }
 if(!index.includes('([5-8])'))throw Error('Falta comprobar los códigos de actas.');
 if(!index.includes("const proveedores = createProviderHandler(")){
 for(const [old,replacement] of [["const {createRouter} = require('./command-router');","const {createRouter} = require('./command-router');\nconst {createProviderHandler} = require('./provider-handler');"],["const router = createRouter({store: tiendaDB, owners: SÚPER_ADMINS_NATOS, loadConfig: cargarConfig, rentas, moderacion, ayuda, stickers, tiktok, bienvenida, anuncios, nombres, tiendas});","const proveedores = createProviderHandler({store: tiendaDB, owners: SÚPER_ADMINS_NATOS, loadConfig: cargarConfig, saveConfig: guardarConfig, allowed: rentas.allowed});\nconst router = createRouter({store: tiendaDB, owners: SÚPER_ADMINS_NATOS, loadConfig: cargarConfig, rentas, moderacion, ayuda, stickers, tiktok, bienvenida, anuncios, nombres, tiendas, proveedores});"],["        if (textoMensaje.toLowerCase().startsWith('/setproveedor ') && tienePermisoOperativo && esGrupo) {\n            const alias = textoMensaje.split(' ')[1]?.toLowerCase();\n            if (!alias) return await responder('⚠️ Escribe el alias de tu grupo de ventas.');\n            const idVentas = configSistema.gruposDestino[alias];\n            if (!idVentas) return await responder(`⚠️ El alias *${alias}* no existe.`);\n            if (!deMiNumero && configSistema.propietariosGrupos[idVentas] !== senderViejo) return await responder('⚠️ Solo el dueño de esas ventas puede vincular el proveedor.');\n            configSistema.gruposProveedores = configSistema.gruposProveedores || {};\n            configSistema.gruposProveedores[idVentas] = chatId;\n            guardarConfig(configSistema);\n            await responder(`✅ *Proveedor Vinculado Exitósamente*`);\n            return;\n        }\n\n",""]]){if(index.split(old).length!==2)throw Error('El index local difiere en '+old.slice(0,70));index=index.replace(old,()=>replacement);}
 const old="if (configSistema.gruposProveedores && configSistema.gruposProveedores[chatId] && (tramite.nombreServicio.startsWith('Acta') || tramite.nombreServicio.includes('Clon'))) {",replacement="if (configSistema.proveedorModo?.[chatId] !== 'manual' && configSistema.gruposProveedores && configSistema.gruposProveedores[chatId] && (tramite.nombreServicio.startsWith('Acta') || tramite.nombreServicio.includes('Clon'))) {";
 if(index.split(old).length!==3)throw Error('El envío local al proveedor difiere.');index=index.replaceAll(old,replacement);
 }
 next['index.js']=index;files.push('index.js');
 next['provider-handler.js']=get(ref,'provider-handler.js');
 if(fs.existsSync('provider-handler.js')){if(norm(fs.readFileSync('provider-handler.js','utf8'))!==norm(next['provider-handler.js']))throw Error('provider-handler.js tiene cambios locales.');files.push('provider-handler.js');}
 cp.execFileSync(process.execPath,['--check','-'],{input:next['provider-handler.js'],stdio:['pipe','pipe','pipe']});
 cp.execFileSync(process.execPath,['--check','-'],{input:index,stdio:['pipe','pipe','pipe']});
 if(process.env.NAEVIS_CHECK==='1'){console.log('PROVEEDORES COMPATIBLE: sin cambios');process.exit(0);}
 const backup=fs.mkdtempSync('/root/naevis-proveedores-');fs.chmodSync(backup,0o700);
 for(const f of files)fs.copyFileSync(f,path.join(backup,f));
 const created=[];
 try{for(const [f,code] of Object.entries(next)){if(!fs.existsSync(f))created.push(f);fs.writeFileSync(f,code);}}catch(e){for(const f of files)fs.copyFileSync(path.join(backup,f),f);for(const f of created)fs.rmSync(f,{force:true});throw e;}
 console.log('PROVEEDORES INSTALADO. Respaldo: '+backup);
}catch(e){console.error(e.message);process.exitCode=1;}
