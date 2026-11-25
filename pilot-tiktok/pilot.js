'use strict';
const path=require('node:path'),{randomBytes}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {default:makeWASocket,useMultiFileAuthState,fetchLatestBaileysVersion,DisconnectReason}=require('@whiskeysockets/baileys');
const pino=require('pino'),qr=require('qrcode-terminal');
const {createPilot}=require('./tiktok-handler');
const auth=path.join(__dirname,'sesion_tiktok_prueba');
const pin=randomBytes(5).toString('hex');
const handle=createPilot({pin});
let connecting=false,stopped=false;
async function start(){
 if(connecting||stopped)return;connecting=true;
 try{
  const {state,saveCreds}=await useMultiFileAuthState(auth);
  const {version}=await fetchLatestBaileysVersion();
  const sock=makeWASocket({version,auth:state,logger:pino({level:'silent'}),markOnlineOnConnect:false,syncFullHistory:false});
  sock.ev.on('creds.update',saveCreds);
  sock.ev.on('connection.update',u=>{
   if(u.qr){console.log('ESCANEA SOLO CON EL NUMERO SECUNDARIO DE PRUEBAS');qr.generate(u.qr,{small:true});}
   if(u.connection==='open'){console.log('PILOTO TIKTOK CONECTADO. Activa SOLO en tu chat/grupo de pruebas: .tiktok on '+pin);}
   if(u.connection==='close'){
    const code=u.lastDisconnect?.error?.output?.statusCode;
    console.log('Conexión cerrada:',code||'desconocido');
    if(code===DisconnectReason.restartRequired){connecting=false;setTimeout(()=>start().catch(()=>{}),1500);}
    else {stopped=true;console.log('Reabre el piloto manualmente. No se borra la sesión.');}
   }
  });
  sock.ev.on('messages.upsert',({type,messages})=>{
   if(type!=='notify')return;
   for(const msg of messages){const stamp=Number(msg.messageTimestamp);if(!stamp||Math.abs(Date.now()/1000-stamp)>120)continue;void handle(sock,msg).catch(e=>console.error('[PILOTO]',e.code||e.name));}
  });
 }catch(e){console.error('No se pudo iniciar:',e.code||e.name);process.exitCode=1;}
}
try{console.log('yt-dlp:',execFileSync(process.env.NAEVIS_YTDLP||'yt-dlp',['--version'],{encoding:'utf8',windowsHide:true}).trim());void start();}catch{console.error('Instala yt-dlp y abre una nueva ventana de CMD.');process.exitCode=1;}
