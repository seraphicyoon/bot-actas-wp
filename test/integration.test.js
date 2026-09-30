'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');const os=require('os');const vm=require('vm');const {createRequire}=require('module');
const root=path.resolve(__dirname,'..'),localRequire=createRequire(path.join(root,'index.js'));
async function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naevis-integration-'));const owner='525658405318',sales='sales@g.us',sent=[],events={},errors=[];
 const config={gruposAutorizados:[sales],propietariosGrupos:{[sales]:owner+'@c.us'},gruposDestino:{demo:sales},pagosGrupos:{},superAdmins:[],vendedores:[]};fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify(config));
 const sock={user:{id:'bot:1@s.whatsapp.net',lid:'bot@lid'},ev:{on:(name,fn)=>events[name]=fn},groupMetadata:async()=>({participants:[{id:owner+'@s.whatsapp.net',admin:'admin'},{id:'buyer@lid',phoneNumber:'buyer@s.whatsapp.net'},{id:'helper@s.whatsapp.net'},{id:'bot@lid',phoneNumber:'bot@s.whatsapp.net',admin:'admin'}]}),sendMessage:async(to,content,options)=>{sent.push({to,...content,options});return {key:{id:'sent'}};},groupSettingUpdate:async()=>{},groupParticipantsUpdate:async()=>[{status:'200'}]};
 const sandbox={require:name=>name==='@whiskeysockets/baileys'?{default:()=>sock,useMultiFileAuthState:async()=>({state:{},saveCreds:()=>{}}),DisconnectReason:{loggedOut:401},downloadContentFromMessage:async()=>[]}:name==='@hapi/boom'?{Boom:class {}}:name==='pino'?()=>({}):name==='qrcode-terminal'?{generate:()=>{}}:name==='http'?{createServer:()=>({listen:()=>{}})}:localRequire(name),process:{env:{RAILWAY_VOLUME_MOUNT_PATH:dir},on:()=>{},exit:()=>{throw Error('Process must not exit');}},__dirname:root,Buffer,console:{log:()=>{},error:(...args)=>errors.push(args.join(' '))},setTimeout,clearTimeout,setInterval,clearInterval};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(root,'index.js'),'utf8').replace(/iniciarBot\(\);\s*$/,'globalThis.ready=iniciarBot();'),sandbox);await sandbox.ready;
 let seq=0;async function send(text,who=owner,group=sales,target){sent.length=0;const message=target?{extendedTextMessage:{text,contextInfo:{participant:target}}}:{conversation:text};events['messages.upsert']({type:'notify',messages:[{key:{id:String(++seq),remoteJid:group,participant:group.endsWith('@g.us')?who+'@s.whatsapp.net':undefined},message}]});await vm.runInContext('colaMensajes',sandbox);assert.deepEqual(errors,[]);return sent;}
 const close=()=>{vm.runInContext('tiendaDB.close()',sandbox);fs.rmSync(dir,{recursive:true});};return {send,sent,close,sandbox,owner,sales};}
test('actual routing: help, legacy balances, unknown commands, maintenance and resume',async()=>{const f=await setup();try{
 let out=await f.send('.jinni');assert.ok(out.some(m=>m.text?.includes('MODO TRÁMITES')));assert.ok(out.some(m=>m.text?.includes('OWNER DEL BOT')));
 out=await f.send('/s 12.34',f.owner,f.sales,'buyer@lid');assert.match(out[0].text,/12.34/);
 out=await f.send('/nombre Nombre Completo','buyer');assert.ok(out.some(m=>m.text?.includes('Comenzando la busqueda')));
 const search=vm.runInContext('tiendaDB.db.prepare("SELECT id FROM name_requests LIMIT 1").get()',f.sandbox);
 out=await f.send('/rechazar '+search.id,f.owner,f.owner+'@s.whatsapp.net');assert.ok(out.some(m=>m.text?.includes('Se devolvieron $10')));
 out=await f.send('/saldos');assert.match(out[0].text,/SALDOS DEL GRUPO/);
 out=await f.send('.grupos');assert.match(out[0].text,/demo/);
 out=await f.send('/precio actas 12abc');assert.match(out[0].text,/entero positivo/);
 out=await f.send('/precio actas 40');assert.match(out[0].text,/actualizado/);
 out=await f.send('.desconocido');assert.match(out[0].text,/Comando no disponible/);
 await f.send('/apagado',f.owner,f.owner+'@s.whatsapp.net');out=await f.send('.pago');assert.match(out[0].text,/mantenimiento/);
 await f.send('/prendido',f.owner,f.owner+'@s.whatsapp.net');out=await f.send('.pago');assert.match(out[0].text,/Sin datos/);
 }finally{f.close();}});
test('actual routing: shop activation, roles, quoted saldo, private guide and helper restrictions',async()=>{const f=await setup();try{
 await f.send('.actienda demo');let out=await f.send('.jinni');assert.ok(out.some(m=>m.text?.includes('MODO TIENDA')));
 await f.send('.ayudante',f.owner,f.sales,'helper@s.whatsapp.net');out=await f.send('/s 10','helper',f.sales,'buyer@lid');assert.match(out[0].text,/10.00/);
 out=await f.send('-s 2','helper',f.sales,'buyer@lid');assert.match(out[0].text,/Solo el dueño/);
 out=await f.send('.mute 10m','helper',f.sales,'buyer@lid');assert.match(out[0].text,/SILENCIADO/);
 out=await f.send('.jinni','buyer');assert.ok(out[0].delete);assert.equal(out.length,1);
 await f.send('.unmute','helper',f.sales,'buyer@lid');out=await f.send('.saldo','buyer');assert.match(out[0].text,/10.00/);
 }finally{f.close();}});
