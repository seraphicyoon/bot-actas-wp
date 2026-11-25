'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
try{
 const ref=process.argv[2]||'FETCH_HEAD';
 const previous='f1e71688eedb1330c3b1cb02ff5da5e6acca5f5a';
 const get=(rev,f)=>cp.execFileSync('git',['show',rev+':'+f],{encoding:'utf8'});
 const norm=s=>s.replace(/\r\n/g,'\n').trimEnd();
 const files=['command-menus.js','help-handler.js'],next={};
 for(const f of files){
  const current=fs.readFileSync(f,'utf8');next[f]=get(ref,f);
  if(![get(previous,f),next[f]].some(s=>norm(s)===norm(current)))throw Error('Cambios locales no previstos en '+f);
  cp.execFileSync(process.execPath,['--check','-'],{input:next[f],stdio:['pipe','pipe','pipe']});
 }
 if(process.env.NAEVIS_CHECK==='1'){console.log('MENU COMPATIBLE: sin cambios');process.exit(0);}
 const backup=fs.mkdtempSync('/root/naevis-menu-');fs.chmodSync(backup,0o700);
 for(const f of files)fs.copyFileSync(f,path.join(backup,f));
 try{for(const f of files)fs.writeFileSync(f,next[f]);}catch(e){for(const f of files)fs.copyFileSync(path.join(backup,f),f);throw e;}
 console.log('MENU INSTALADO. Respaldo: '+backup);
}catch(e){console.error(e.message);process.exitCode=1;}
