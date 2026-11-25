'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
try{
 const ref=process.argv[2]||'FETCH_HEAD';
 const previous=['f1e71688eedb1330c3b1cb02ff5da5e6acca5f5a','7b168ffa677009b993db3fbe32e20e57fa6280b5'];
 const get=(rev,f)=>cp.execFileSync('git',['show',rev+':'+f],{encoding:'utf8'});
 const norm=s=>s.replace(/\r\n/g,'\n').trimEnd();
 const files=['command-menus.js','help-handler.js'],next={};
 for(const f of files){
  const current=fs.readFileSync(f,'utf8');next[f]=get(ref,f);
  if(![...previous.map(rev=>get(rev,f)),next[f]].some(s=>norm(s)===norm(current)))throw Error('Cambios locales no previstos en '+f);
  cp.execFileSync(process.execPath,['--check','-'],{input:next[f],stdio:['pipe','pipe','pipe']});
 }
 let index=fs.readFileSync('index.js','utf8');
 if(!index.includes('router.handle(sock, msg)'))throw Error('La estructura nueva no está instalada.');
 const retiredPairs=[[" nacimiento_nf: 15,",""],[" o \\`CURP NF\\`",""],["                configSistema.precios[chatId].nacimiento_nf = nuevoPrecio;\n",""],["                    else if (codigo === 'NF') { costoActa = p.nacimiento_nf; nombreServicio = \"Acta de Nacimiento (NF)\"; }\n",""],[" matrimonio_mf: 15,",""],[" o \\`CURP MF\\`",""],["                configSistema.precios[chatId].matrimonio_mf = nuevoPrecio;\n",""],["                    else if (codigo === 'MF') { costoActa = p.matrimonio_mf; nombreServicio = \"Acta de Matrimonio Foliada (MF)\"; }\n",""],[" defuncion_df: 15,",""],[" o \\`CURP DF\\`",""],["                configSistema.precios[chatId].defuncion_df = nuevoPrecio;\n",""],["                    else if (codigo === 'DF') { costoActa = p.defuncion_df; nombreServicio = \"Acta de Defunción (DF)\"; }\n",""],[" divorcio_d0: 15,",""],[" o \\`CURP D0\\`",""],["                configSistema.precios[chatId].divorcio_d0 = nuevoPrecio;\n",""],["                    else if (codigo === 'D0') { costoActa = p.divorcio_d0; nombreServicio = \"Acta de Divorcio (D0)\"; }\n",""],["([5-8]|NF|MF|DF|D0)","([5-8])"]];
 for(const [old,next] of retiredPairs){if(index.split(old).length!==2)throw Error('El index local difiere en códigos de actas: '+old.slice(0,70));index=index.replace(old,()=>next);}
 next['index.js']=index;files.push('index.js');
 cp.execFileSync(process.execPath,['--check','-'],{input:index,stdio:['pipe','pipe','pipe']});
 if(process.env.NAEVIS_CHECK==='1'){console.log('MENU COMPATIBLE: sin cambios');process.exit(0);}
 const backup=fs.mkdtempSync('/root/naevis-menu-');fs.chmodSync(backup,0o700);
 for(const f of files)fs.copyFileSync(f,path.join(backup,f));
 try{for(const f of files)fs.writeFileSync(f,next[f]);}catch(e){for(const f of files)fs.copyFileSync(path.join(backup,f),f);throw e;}
 console.log('MENU INSTALADO. Respaldo: '+backup);
}catch(e){console.error(e.message);process.exitCode=1;}
