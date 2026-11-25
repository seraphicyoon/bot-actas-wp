'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {extractLink,createPilot}=require('./tiktok-handler');
test('solo enlaces válidos de video TikTok',()=>{
 assert.equal(extractLink('mira https://vm.tiktok.com/ZAb123/?x=1'),'https://vm.tiktok.com/ZAb123/');
 assert.equal(extractLink('https://www.tiktok.com/@abc/video/123456'),'https://www.tiktok.com/@abc/video/123456');
 for(const u of ['https://tiktok.com.evil.test/@abc/video/123','https://evil.test/','https://www.tiktok.com/@abc','https://www.tiktok.com@evil.test/','http://vm.tiktok.com/X/'])assert.equal(extractLink(u),null);
});
test('chat aislado, activación, video y permisos',async()=>{
 const sent=[];let count=0,clock=0;
 const h=createPilot({pin:'abc',fetchVideo:async()=>{count++;return Buffer.from('video')},now:()=>clock});
 const sock={sendMessage:async(j,m)=>sent.push({j,...m})};
 const send=(j,t,p='a@lid')=>h(sock,{key:{remoteJid:j,participant:p},message:{conversation:t}});
 const url='https://vm.tiktok.com/X/';
 await send('a@g.us',url);assert.equal(count,0);
 await send('a@g.us','.tiktok on abc');await send('b@g.us',url);assert.equal(count,0);
 await send('a@g.us',url,'b@lid');assert.equal(count,1);assert.ok(sent.at(-1).video);
 await send('a@g.us',url);assert.equal(count,1);
 await send('a@g.us','.tiktok off','b@lid');clock+=16000;await send('a@g.us',url);assert.equal(count,2);
 await send('a@g.us','.tiktok off');clock+=16000;await send('a@g.us',url);assert.equal(count,2);
});
