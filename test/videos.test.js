'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {identify,extractLink,downloadArgs,validateProbe,createTikTokHandler}=require('../tiktok-handler');
test('allowlisted video links, no arbitrary URLs or playlists',()=>{
 const samples=[['https://vm.tiktok.com/Zabc/?x=1','TikTok'],['https://www.instagram.com/reel/ABC-1/?igsh=foo','Instagram'],['https://www.youtube.com/watch?v=abcdefghijk&list=123','YouTube'],['https://youtu.be/abcdefghijk?si=abc','YouTube'],['https://www.youtube.com/shorts/abcdefghijk','YouTube'],['https://www.facebook.com/watch/?v=123456','Facebook'],['https://www.facebook.com/share/r/abc/','Facebook'],['https://x.com/user/status/123456?s=20','X'],['https://www.pinterest.com/pin/123/','Pinterest'],['https://www.reddit.com/r/test/comments/abc/title/','Reddit'],['https://vimeo.com/1234','Vimeo']];
 for(const [url,name] of samples){const item=identify(url);assert.equal(item.name,name);assert.equal(identify(item.url).url,item.url);const args=downloadArgs(item.url,'test.mp4');assert.ok(args.includes('--no-playlist'));assert.ok(args.includes('--use-extractors'));assert.ok(!args.includes('generic'));}
 for(const url of ['https://youtube.com.evil.test/watch?v=abcdefghijk','https://www.youtube.com/playlist?list=123','https://example.com/video.mp4','https://127.0.0.1/x','https://instagram.com@evil.test/reel/a','https://www.facebook.com/profile.php?id=12','https://www.youtube.com/@abc','https://tiktok.com:443/@a/video/123'])assert.equal(extractLink(url),null);
 assert.equal(extractLink(samples[2][0]),'https://www.youtube.com/watch?v=abcdefghijk');
 assert.ok(downloadArgs('https://vm.tiktok.com/Zabc/','test.mp4').some(x=>x.includes('format_note!*=watermarked')));
});
test('new commands share existing group setting, preserve permissions and async dispatch',async()=>{
 const a='a@g.us',b='b@g.us',owner='owner@lid';const flags=new Map([[a,1]]),out=[];let count=0,clock=0,active=true,paused=false;
 const db={exec(){},prepare(){return {get:id=>({enabled:flags.get(id)}),run:(id,n)=>flags.set(id,n)}}};
 const sock={groupMetadata:async()=>({participants:[]}),sendMessage:async(id,m)=>out.push(m)};
 const h=createTikTokHandler({store:{db,shop:()=>null},owners:[owner],loadConfig:()=>({gruposAutorizados:[a,b]}),allowed:()=>active,paused:()=>paused,isHelper:()=>false,now:()=>clock,fetchVideo:async()=>{count++;return Buffer.from('video')}});
 const send=(id,t,who=owner)=>h.handle(sock,{key:{remoteJid:id,participant:who},message:{conversation:t}});
 await send(a,'.videos','client@lid');assert.ok(out.at(-1).text.includes('ACTIVADO'));await send(b,'.videos on','client@lid');assert.equal(flags.get(b),undefined);
 await send(a,'https://youtu.be/abcdefghijk','client@lid');assert.equal(count,1);assert.ok(out.at(-1).video);
 await send(a,'.tiktok off');assert.equal(flags.get(a),0);clock+=20000;await send(a,'https://vm.tiktok.com/Zabc/');assert.equal(count,1);
 await send(a,'.videos on');assert.equal(flags.get(a),1);await send(b,'https://youtu.be/abcdefghijk');assert.equal(count,1);
 active=false;await send(a,'https://youtu.be/abcdefghijk');assert.equal(count,1);active=true;paused=true;await send(a,'https://youtu.be/abcdefghijk');assert.equal(count,1);
});

test('no duration cap, 50 MiB size filters and lower quality',()=>{
 const url='https://x.com/Gaspar_Sparco/status/2125457974357643555';
 const args=downloadArgs(url,'test.mp4',360);
 assert.ok(args.includes('!is_live'));
 assert.ok(args.includes('50M'));
 assert.ok(!args.some(x=>x.includes('duration <=')));
 const format=args[args.indexOf('-f')+1];
 assert.ok(format.includes('[height<=?360]'));
 assert.ok(format.includes('[filesize_approx<=?50M]'));
 assert.ok(format.includes('[filesize_approx<=?40M]'));
 assert.ok(format.includes('[filesize_approx<=?10M]'));
 const probe=(duration,codec_type='video')=>JSON.stringify({format:{duration},streams:[{codec_type}]});
 for(const d of ['12.5','90','305.171','1200'])assert.doesNotThrow(()=>validateProbe(probe(d)));
 for(const d of ['N/A',null,0,-1])assert.throws(()=>validateProbe(probe(d)));
 assert.throws(()=>validateProbe(probe('12','audio')));
});
