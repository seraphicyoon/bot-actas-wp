'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {addSoundExif,installOneMessageEncoder,handlePilot}=require('../sticker-handler');
function chunk(tag,data){const h=Buffer.alloc(8);h.write(tag);h.writeUInt32LE(data.length,4);return Buffer.concat([h,data,Buffer.alloc(data.length%2)]);}
function riff(...chunks){const body=Buffer.concat([Buffer.from('WEBP'),...chunks]);const h=Buffer.alloc(8);h.write('RIFF');h.writeUInt32LE(body.length,4);return Buffer.concat([h,body]);}
test('EXIF includes digest and correct RIFF length',()=>{
 const audio=Buffer.from('audio'), x=Buffer.alloc(10), out=addSoundExif(riff(chunk('VP8X',x),chunk('ANIM',Buffer.alloc(6))),audio,320);
 assert.equal(out.readUInt32LE(4),out.length-8);
 assert.equal(out[20]&8,8);
 assert.ok(out.includes(Buffer.from(createHash('sha256').update(audio).digest('base64'))));
 assert.throws(()=>addSoundExif(Buffer.from('invalid'),audio,320));
});
test('owner pilot never replies to ordinary users or groups',async()=>{
 const sock={sendMessage(){throw Error('unexpected reply');}};
 for(const jid of ['111@s.whatsapp.net','222@g.us'])assert.equal(await handlePilot(sock,{key:{remoteJid:jid},message:{conversation:'/stickeraudio'}},{owners:['222@c.us']}),false);
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
   const nested=Buffer.from(M.encode({deviceSentMessage:{destinationJid:'123@s.whatsapp.net',message:marker}}).finish());
   assert.ok(nested.includes(raw));
 }finally{restore();}
 assert.equal(M.encode,old);
});
