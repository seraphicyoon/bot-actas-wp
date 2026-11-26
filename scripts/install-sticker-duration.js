'use strict';
const fs=require('node:fs'),cp=require('node:child_process');
try{
 const file='sticker-handler.js',ref=process.argv[2]||'FETCH_HEAD';
 const get=rev=>cp.execFileSync('git',['show',rev+':'+file],{encoding:'utf8'});
 const old=fs.readFileSync(file,'utf8'),next=get(ref),norm=s=>s.replace(/\r\n/g,'\n').trimEnd();
 if(![get('784914b2e8a21fbf77a8819c5acbb7b5a3f01b7c'),next].some(s=>norm(s)===norm(old)))throw Error('El archivo de stickers tiene cambios locales; no se modifica.');
 cp.execFileSync(process.execPath,['--check','-'],{input:next,stdio:['pipe','pipe','pipe']});
 if(process.env.NAEVIS_CHECK==='1'){console.log('STICKERS COMPATIBLE: sin cambios');process.exit(0);}
 const backup=fs.mkdtempSync('/root/naevis-sticker-duracion-');fs.chmodSync(backup,0o700);fs.copyFileSync(file,backup+'/'+file);
 try{fs.writeFileSync(file,next);}catch(e){fs.copyFileSync(backup+'/'+file,file);throw e;}
 console.log('STICKERS INSTALADO. Respaldo: '+backup);
}catch(e){console.error(e.message);process.exitCode=1;}
