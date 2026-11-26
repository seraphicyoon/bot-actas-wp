'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
try{
 const ref=process.argv[2]||'FETCH_HEAD',old='ce108bdb6d9dff99eefb31f58b0056bd2b96383c',get=(rev,f)=>cp.execFileSync('git',['show',rev+':'+f],{encoding:'utf8'});
 const files=['command-router.js','command-menus.js','service-price-handler.js'],next={},norm=s=>s.replace(/\r\n/g,'\n').trimEnd();
 for(const f of files){next[f]=get(ref,f);if(![get(old,f),get('29d4e0acea3a8ec69bac87b07178c83db48839e9',f),next[f]].some(v=>norm(v)===norm(fs.readFileSync(f,'utf8'))))throw Error('Cambios locales no previstos en '+f);}
 let index=fs.readFileSync('index.js','utf8');
 const before="const preciosExtra = createPriceHandler({store: tiendaDB, owners: SÚPER_ADMINS_NATOS, loadConfig: cargarConfig, saveConfig: guardarConfig, allowed: rentas.allowed});",after="const preciosExtra = createPriceHandler({store: tiendaDB, owners: SÚPER_ADMINS_NATOS, loadConfig: cargarConfig, saveConfig: guardarConfig, allowed: rentas.allowed, basePrices: PRECIOS_BASE});",legacy="        if (textoMensaje.toLowerCase().startsWith('/precio ') && tienePermisoOperativo && esGrupo) {\n            const args = textoMensaje.split(/\\s+/); if (args.length !== 3) return await responder(\"⚠️ Usa /precio servicio cantidad (número entero positivo).\");\n            let tipoServicio = args[1].toLowerCase(); const nuevoPrecio = Number(args[2]); if (!Number.isSafeInteger(nuevoPrecio) || nuevoPrecio < 1) return await responder(\"⚠️ El precio debe ser un número entero positivo.\");\n            if (![\"actas\", \"acta\", ...Object.keys(PRECIOS_BASE)].includes(tipoServicio)) return await responder(\"⚠️ Servicio desconocido. Consulta .jinni.\");\n            if (!configSistema.precios[chatId]) configSistema.precios[chatId] = { ...PRECIOS_BASE };\n            \n            if (tipoServicio === 'actas' || tipoServicio === 'acta') {\n                configSistema.precios[chatId].nacimiento = nuevoPrecio; \n                configSistema.precios[chatId].matrimonio = nuevoPrecio; \n                configSistema.precios[chatId].defuncion = nuevoPrecio; \n                configSistema.precios[chatId].divorcio = nuevoPrecio; \n            } else {\n                configSistema.precios[chatId][tipoServicio] = nuevoPrecio; \n            }\n\n            guardarConfig(configSistema); \n            await responder(`✅ *Nuevo precio* actualizado correctamente: $${nuevoPrecio}.00`); \n            return;\n        }\n\n";
 if(!index.includes(after)){if(index.split(before).length!==2)throw Error('El index local difiere en el módulo de precios.');index=index.replace(before,()=>after);}
 if(index.includes(legacy)){if(index.split(legacy).length!==2)throw Error('Bloque de precios duplicado.');index=index.replace(legacy,'');}
 else if(index.includes("textoMensaje.toLowerCase().startsWith('/precio ')"))throw Error('El bloque local de precios difiere.');
 index=index.replace("• \\`/precio [servicio] [$$]\\` : Cambia precios.","• Consulta la configuración de precios en el privado del bot.");
 next['index.js']=index;files.push('index.js');
 for(const code of Object.values(next))cp.execFileSync(process.execPath,['--check','-'],{input:code,stdio:['pipe','pipe','pipe']});
 if(process.env.NAEVIS_CHECK==='1'){console.log('PRECIOS PRIVADOS COMPATIBLE: sin cambios');process.exit(0);}
 const backup=fs.mkdtempSync('/root/naevis-precios-privados-');fs.chmodSync(backup,0o700);for(const f of files)fs.copyFileSync(f,path.join(backup,f));
 try{for(const f of files)fs.writeFileSync(f,next[f]);}catch(e){for(const f of files)fs.copyFileSync(path.join(backup,f),f);throw e;}
 console.log('PRECIOS PRIVADOS INSTALADO. Respaldo: '+backup);
}catch(e){console.error(e.message);process.exitCode=1;}
