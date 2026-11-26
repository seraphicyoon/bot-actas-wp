'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
try{
 const ref=process.argv[2]||'FETCH_HEAD',old='ff1e90437bbaa4db60a4cd2ad90f9e791f784722',get=(rev,f)=>cp.execFileSync('git',['show',rev+':'+f],{encoding:'utf8'});
 const files=['command-router.js','command-menus.js'],next={},norm=s=>s.replace(/\r\n/g,'\n').trimEnd();
 for(const f of files){next[f]=get(ref,f);if(![get(old,f),get('e7a9ba8c8556fddb03756379c1eea72fc72f8688',f),next[f]].some(v=>norm(v)===norm(fs.readFileSync(f,'utf8'))))throw Error('Cambios locales no previstos en '+f);}
 let index=fs.readFileSync('index.js','utf8');
 for(const [before,after] of [["const {createProviderHandler} = require('./provider-handler');","const {createProviderHandler} = require('./provider-handler');\nconst {createPriceHandler} = require('./service-price-handler');"],["const router = createRouter({store: tiendaDB, owners: SÚPER_ADMINS_NATOS, loadConfig: cargarConfig, rentas, moderacion, ayuda, stickers, tiktok, bienvenida, anuncios, nombres, tiendas, proveedores});","const preciosExtra = createPriceHandler({store: tiendaDB, owners: SÚPER_ADMINS_NATOS, loadConfig: cargarConfig, saveConfig: guardarConfig, allowed: rentas.allowed});\nconst router = createRouter({store: tiendaDB, owners: SÚPER_ADMINS_NATOS, loadConfig: cargarConfig, rentas, moderacion, ayuda, stickers, tiktok, bienvenida, anuncios, nombres, tiendas, proveedores, preciosExtra});"]]){if(index.includes(after))continue;if(index.split(before).length!==2)throw Error('El index local tiene diferencias: '+before.slice(0,70));index=index.replace(before,()=>after);}
 next['index.js']=index;files.push('index.js');
 const moduleName='service-price-handler.js';next[moduleName]=get(ref,moduleName);
 if(fs.existsSync(moduleName)){if(![get('e7a9ba8c8556fddb03756379c1eea72fc72f8688',moduleName),next[moduleName]].some(v=>norm(v)===norm(fs.readFileSync(moduleName,'utf8'))))throw Error('Módulo local distinto');files.push(moduleName);}
 for(const code of Object.values(next))cp.execFileSync(process.execPath,['--check','-'],{input:code,stdio:['pipe','pipe','pipe']});
 if(process.env.NAEVIS_CHECK==='1'){console.log('PRECIOS COMPATIBLE: sin cambios');process.exit(0);}
 const backup=fs.mkdtempSync('/root/naevis-precios-');fs.chmodSync(backup,0o700);for(const f of files)fs.copyFileSync(f,path.join(backup,f));
 const created=[];try{for(const [f,code] of Object.entries(next)){if(!fs.existsSync(f))created.push(f);fs.writeFileSync(f,code);}}catch(e){for(const f of files)fs.copyFileSync(path.join(backup,f),f);for(const f of created)fs.rmSync(f,{force:true});throw e;}
 console.log('PRECIOS INSTALADO. Respaldo: '+backup);
}catch(e){console.error(e.message);process.exitCode=1;}
