'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {addSoundExif,installOneMessageEncoder,createStickerHandler,parseCommand,buildVideoFilter}=require('../sticker-handler');
function chunk(tag,data){const h=Buffer.alloc(8);h.write(tag);h.writeUInt32LE(data.length,4);return Buffer.concat([h,data,Buffer.alloc(data.length%2)]);}
function riff(...chunks){const body=Buffer.concat([Buffer.from('WEBP'),...chunks]);const h=Buffer.alloc(8);h.write('RIFF');h.writeUInt32LE(body.length,4);return Buffer.concat([h,body]);}
test('EXIF includes digest and correct RIFF length',()=>{
 const audio=Buffer.from('audio'), x=Buffer.alloc(10), out=addSoundExif(riff(chunk('VP8X',x),chunk('ANIM',Buffer.alloc(6))),audio,320);
 assert.equal(out.readUInt32LE(4),out.length-8);
 assert.equal(out[20]&8,8);
 assert.ok(out.includes(Buffer.from(createHash('sha256').update(audio).digest('base64'))));
 assert.throws(()=>addSoundExif(Buffer.from('invalid'),audio,320));
});
test('exact commands and both frame modes',()=>{
 assert.equal(parseCommand('/stickeraudio').mode,'pad');
 for(const arg of ['recortar','rellenar','cuadrado'])assert.equal(parseCommand('/stickeraudio '+arg).mode,'crop');
 assert.equal(parseCommand('/stickeraudio ajustar').mode,'pad');
 assert.equal(parseCommand('/stickeraudio basura').kind,'invalid');
 assert.equal(parseCommand('/stickeraudioextra'),null);
 assert.match(buildVideoFilter(320,15,'crop'),/increase,crop=320:320/);
 assert.match(buildVideoFilter(320,15,'pad'),/decrease,pad=320:320/);
});
test('owner LID, opt-in group, admin permissions, suspended and maintenance',async()=>{
 const group='sales@g.us',owner='222@lid',sent=[];
 let config={gruposAutorizados:[group],propietariosGrupos:{[group]:owner}},active=true,maintenance=false;
 const h=createStickerHandler({owners:[owner],download:async()=>{throw Error('not expected');},loadConfig:()=>config,saveConfig:c=>{config=c},store:{shop:()=>null},allowed:()=>active,paused:()=>maintenance,isHelper:()=>false,getVersion:()=> '6.7.24'});
 const sock={sendMessage:async(j,m)=>{sent.push(m.text)},groupMetadata:async()=>({participants:[]})};
 const send=async(jid,cmd,participant)=>{sent.length=0;return h.handle(sock,{key:{remoteJid:jid,participant},message:{conversation:cmd}})};
 assert.equal(await send('111@s.whatsapp.net','/stickeraudio'),false);
 assert.equal(await send(owner,'/stickeraudio'),true);assert.match(sent[0],/Responde/);
 await send(group,'.stickers','111@s.whatsapp.net');assert.match(sent[0],/DESACTIVADOS/);assert.match(sent[0],/\/stickeraudio recortar/);
 await send(group,'/stickeraudio','111@s.whatsapp.net');assert.match(sent[0],/desactivados/);
 await send(group,'.stickers on','111@s.whatsapp.net');assert.match(sent[0],/Solo/);
 await send(group,'.stickers on',owner);assert.equal(config.stickersGrupos[group],true);
 await send(group,'.ayudastickers','111@s.whatsapp.net');assert.match(sent[0],/ACTIVADOS/);
 await send(group,'/stickeraudio recortar','111@s.whatsapp.net');assert.match(sent[0],/Responde/);
 active=false;await send(group,'/stickeraudio',owner);assert.match(sent[0],/renta activa/);
 active=true;maintenance=true;await send(group,'/stickeraudio',owner);assert.match(sent[0],/mantenimiento/);
 maintenance=false;await send(group,'.stickers off',owner);assert.equal(config.stickersGrupos[group],false);
});
test('encoder wraps documented wire fields and restores original',()=>{
 const {proto}=require('@whiskeysockets/baileys');
 const M=proto.Message, old=M.encode, marker={stickerMessage:{mimetype:'image/webp'}};
 const normal={conversation:'normal'};
 const before=Buffer.from(old(normal).finish());
 const restore=installOneMessageEncoder(proto,marker,marker.stickerMessage,{mimetype:'audio/ogg; codecs=opus'});
 try{
   assert.deepEqual(Buffer.from(M.encode(normal).finish()),before);
   const raw=Buffer.from(M.encode(marker).finish());
   assert.deepEqual([...raw.subarray(0,2)],[0xb2,0x08]);
   assert.ok(raw.includes(Buffer.from('audio/ogg; codecs=opus')));
   assert.ok(raw.includes(Buffer.from('image/webp')));
   // 6.7.24 copies the outer message before encoding each recipient.
   assert.deepEqual(Buffer.from(M.encode({...marker}).finish()),raw);
   const independent={stickerMessage:{...marker.stickerMessage}};
   assert.deepEqual(Buffer.from(M.encode(independent).finish()),Buffer.from(old(independent).finish()));
   const nested=Buffer.from(M.encode({deviceSentMessage:{destinationJid:'123@s.whatsapp.net',message:marker}}).finish());
   assert.ok(nested.includes(raw));
 }finally{restore();}
 assert.equal(M.encode,old);
});

 test('Opus pre-skip never inflates a clipped sticker to nine seconds',()=>{
 const {audioSeconds}=require('../sticker-handler');
 const head=Buffer.alloc(19);head.write('OpusHead');head.writeUInt16LE(312,10);
 assert.equal(audioSeconds(head,8.0065),8);
 assert.equal(audioSeconds(head,7.923063),8);
 assert.equal(audioSeconds(head,4.0065),4);
 assert.equal(audioSeconds(head,4.5065),5);
 });
