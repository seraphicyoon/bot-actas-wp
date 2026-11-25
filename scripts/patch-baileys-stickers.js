'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=process.cwd();
function groupPatch(s){
 const old="attrs: { v: '2', type: 'skmsg' },";
 const next="attrs: { v: '2', type: 'skmsg', ...(message[Symbol.for('naevis.soundSticker')] ? { mediatype: 'sticker' } : {}) },";
 if(s.includes(next))return s;
 if(s.split(old).length!==2)throw Error('Formato de Baileys inesperado; no se modifica.');
 return s.replace(old,next);
}
function check(code,file){cp.execFileSync(process.execPath,['--check','-'],{input:code,stdio:['pipe','pipe','pipe']});}
function main(){
 const version=require(path.join(root,'node_modules/@whiskeysockets/baileys/package.json')).version;
 if(!['6.7.7','6.7.24'].includes(version))throw Error('Baileys no compatible: '+version);
 const file=path.join(root,'node_modules/@whiskeysockets/baileys/lib/Socket/messages-send.js');
 const before=fs.readFileSync(file,'utf8'),after=groupPatch(before);check(after,file);
 if(before===after){console.log('Parche de grupos ya instalado');return;}
 const bak=fs.mkdtempSync(path.join(os.tmpdir(),'naevis-baileys-'));fs.chmodSync(bak,0o700);fs.copyFileSync(file,path.join(bak,'messages-send.js'));fs.writeFileSync(file,after);
 console.log('Parche instalado. Respaldo:',bak);
}
if(require.main===module){try{main()}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={groupPatch};
