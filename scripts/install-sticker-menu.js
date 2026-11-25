'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
function patchHelp(s){
 const guard=" if(text==='.jinni'&&!owner){await reply('🔒 Menú exclusivo de la administración de Naevis. Para stickers escribe .stickers; para ayuda de tienda, .ayudatienda.');return true;}";
 const anchor=" if(text==='.jinni'||text==='.ayudatienda'){";
 if(!s.includes(guard)){if(s.split(anchor).length!==2)throw Error('No coincide la entrada del menú local; no se modificó nada.');s=s.replace(anchor,guard+'\n'+anchor);}
 const old="if(owner)await reply(ownerGuide);",newer="if(owner&&text==='.jinni')await reply(ownerGuide);";
 if(!s.includes(newer)){if(s.split(old).length!==2)throw Error('No coincide la salida de la guía owner.');s=s.replace(old,newer);}
 const menu="*Stickers con sonido — Naevis*\n.stickers — menú de stickers para clientes y estado del grupo.\n/stickeraudio o /stickeraudio ajustar — conserva todo el video.\n/stickeraudio recortar (o rellenar/cuadrado) — llena el cuadro.\n.stickers on / .stickers off — activar/desactivar en grupos autorizados con renta activa (dueño/admin, no ayudantes).\nMáximo 16 MB; primeros 8 segundos. En privado solo owners.";
 if(!s.includes(menu)){
  const existing=/\*Stickers con sonido\*\n[^\n]*\n[^\n]*\n\n/;
  if(existing.test(s))s=s.replace(existing,()=>menu+'\n\n');
  else {const p="*Saldo y pago*\n";if(s.split(p).length!==2)throw Error('No coincide la sección de ayuda local.');s=s.replace(p,()=>menu+'\n\n'+p);}
 }
 s=s.replace(".ayudatienda, .comandos y .jinni — ayuda.",".ayudatienda y .comandos — ayuda; .stickers — guía de stickers.");
 return s;
}

function main(){
 const root=process.cwd(),ref=process.argv[2]||'FETCH_HEAD';
 if(!fs.readFileSync('index.js','utf8').includes('stickers.handle(sock, msg)'))throw Error('El bot local aún no tiene stickers integrados.');
 const read=f=>fs.readFileSync(f,'utf8');
 const help=read('help-handler.js'),oldSticker=read('sticker-handler.js');
 const nextHelp=patchHelp(help);
 const nextSticker=cp.execFileSync('git',['show',ref+':sticker-handler.js'],{encoding:'utf8'});
 if(!nextSticker.includes('function stickerGuide(')||!nextSticker.includes("Symbol.for('naevis.soundSticker')"))throw Error('Versión de stickers no válida.');
 if(!oldSticker.includes("Symbol.for('naevis.soundSticker')"))throw Error('El módulo local no contiene el parche de grupo comprobado.');
 const dep='node_modules/@whiskeysockets/baileys/lib/Socket/messages-send.js';
 if(!read(dep).includes("message[Symbol.for('naevis.soundSticker')] ? { mediatype: 'sticker' }"))throw Error('No se encuentra el parche de grupos instalado. No se cambió nada.');
 for(const code of [nextHelp,nextSticker])cp.execFileSync(process.execPath,['--check','-'],{input:code,stdio:['pipe','pipe','pipe']});
 if(process.env.NAEVIS_MENU_CHECK==='1'){console.log('MENU COMPATIBLE: sin cambios');return;}
 const backup=fs.mkdtempSync('/root/naevis-menu-backup-');fs.chmodSync(backup,0o700);
 for(const f of ['help-handler.js','sticker-handler.js'])fs.copyFileSync(f,path.join(backup,f));
 try{fs.writeFileSync('help-handler.js',nextHelp);fs.writeFileSync('sticker-handler.js',nextSticker);}
 catch(e){for(const f of ['help-handler.js','sticker-handler.js'])fs.copyFileSync(path.join(backup,f),f);throw e;}
 console.log('MENU INSTALADO. Respaldo: '+backup);
}
try{main()}catch(e){console.error(e.message);process.exitCode=1;}
