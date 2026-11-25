'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),path=require('node:path');
function patchHelp(s){
 const old="*TikTok y bienvenidas*\n.tiktok / .ayudatiktok — guía y estado en el grupo.\n.tiktok on/off — dueño o admin activa/desactiva descargas.";
 const next="*Videos y bienvenidas*\n.videos / .ayudavideos — guía y estado de descargas (TikTok, Instagram, YouTube, Facebook, X, Pinterest, Reddit y Vimeo, según disponibilidad).\n.videos on/off — dueño o admin activa/desactiva todas las plataformas. Los comandos anteriores de TikTok siguen funcionando.";
 if(s.includes(next))return s;
 if(s.split(old).length!==2)throw Error('No coincide la sección de TikTok local; no se modificó nada.');
 return s.replace(old,()=>next);
}

try{
 const ref=process.argv[2]||'FETCH_HEAD';
 const get=f=>cp.execFileSync('git',['show',ref+':'+f],{encoding:'utf8'});
 const previous=cp.execFileSync('git',['show','cd7a79f94536a5c13566aa3e4feac1d12fb0dcad:tiktok-handler.js'],{encoding:'utf8'});
 const current=fs.readFileSync('tiktok-handler.js','utf8');
 const normalize=s=>s.replace(/\r\n/g,'\n').trimEnd();
 const next=get('tiktok-handler.js');
 if(normalize(current)!==normalize(previous)&&normalize(current)!==normalize(next))throw Error('El descargador local tiene cambios adicionales; revisar antes de reemplazar.');
 if(!fs.readFileSync('index.js','utf8').includes('tiktok.handle(sock, msg)'))throw Error('No se encuentra la integración local.');
 const files={'tiktok-handler.js':next,'help-handler.js':patchHelp(fs.readFileSync('help-handler.js','utf8'))};
 for(const s of Object.values(files))cp.execFileSync(process.execPath,['--check','-'],{input:s,stdio:['pipe','pipe','pipe']});
 cp.execFileSync('yt-dlp',['--version'],{stdio:'ignore'});
 if(process.env.NAEVIS_CHECK==='1'){console.log('VIDEOS COMPATIBLE: sin cambios');process.exit(0);}
 const backup=fs.mkdtempSync('/root/naevis-videos-');fs.chmodSync(backup,0o700);
 for(const f of Object.keys(files))fs.copyFileSync(f,path.join(backup,f));
 try{for(const [f,s] of Object.entries(files))fs.writeFileSync(f,s);}
 catch(e){for(const f of Object.keys(files))fs.copyFileSync(path.join(backup,f),f);throw e;}
 console.log('VIDEOS INSTALADOS. Respaldo: '+backup);
}catch(e){console.error(e.message);process.exitCode=1;}
