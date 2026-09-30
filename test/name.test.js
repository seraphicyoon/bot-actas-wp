'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {StoreDB}=require('../store-db'),{createNameHandler}=require('../name-handler');
function setup(){const store=new StoreDB(':memory:'),sent=[],owner='owner@c.us',chat='sales@g.us',customer='buyer@c.us';let balances={[chat]:{[customer]:20}};let fail=false;
 const handler=createNameHandler({store,owners:[owner],loadConfig:()=>({gruposAutorizados:[chat]}),loadBalances:()=>structuredClone(balances),saveBalances:b=>balances=structuredClone(b),allowed:()=>true});
 const sock={sendMessage:async(to,content)=>{if(fail)throw Error('offline');sent.push({to,...content});return {key:{id:'notice'+sent.length}}}};
 let seq=0;const msg=(text,who=customer,where=chat,context)=>({key:{id:'req'+(++seq),remoteJid:where,participant:where.endsWith('@g.us')?who.replace('@c.us','@s.whatsapp.net'):undefined},message:context?{extendedTextMessage:{text,contextInfo:context}}:{conversation:text}});
 return {store,handler,sock,sent,msg,owner,chat,customer,balance:()=>balances[chat][customer],fail:()=>{fail=true;},row:()=>store.db.prepare('SELECT * FROM name_requests ORDER BY rowid DESC').get()};}
test('manual name charges once, insufficient balance and owner-only rejection refund once',async()=>{const f=setup();try{
 const message=f.msg('/nombre Claudia Sheinbaum Prado');await f.handler.handle(f.sock,message);assert.equal(f.balance(),10);assert.equal(f.sent[0].to,'owner@s.whatsapp.net');assert.match(f.sent[1].text,/Comenzando la busqueda/);
 await f.handler.handle(f.sock,message);assert.equal(f.balance(),10);
 const row=f.row();await f.handler.handle(f.sock,f.msg('/rechazar '+row.id));assert.equal(f.balance(),10);
 await f.handler.handle(f.sock,f.msg('/rechazar',f.owner,'owner@s.whatsapp.net',{stanzaId:row.notice}));assert.equal(f.balance(),20);assert.equal(f.row().state,'rejected');assert.ok(f.sent.some(x=>x.text==='Este usuario no esta permitido o aun no aparece en la database'));
 await f.handler.handle(f.sock,f.msg('/rechazar '+row.id,f.owner,'owner@s.whatsapp.net'));assert.equal(f.balance(),20);
 await f.handler.handle(f.sock,f.msg('/nombre Segundo Nombre'));await f.handler.handle(f.sock,f.msg('/nombre Tercer Nombre'));assert.equal(f.balance(),0);const count=f.store.db.prepare('SELECT count(*) n FROM name_requests').get().n;
 await f.handler.handle(f.sock,f.msg('/nombre Sin Saldo'));assert.equal(f.store.db.prepare('SELECT count(*) n FROM name_requests').get().n,count);assert.match(f.sent.at(-1).text,/Saldo insuficiente/);
 }finally{f.store.close();}});
test('quoted result is delivered privately, resolved requests cannot refund and legacy /r remains available',async()=>{const f=setup();try{
 await f.handler.handle(f.sock,f.msg('/nombre Nombre Completo'));const row=f.row();assert.ok(f.handler.pending(f.chat));
 assert.equal(await f.handler.handle(f.sock,f.msg('/r demo',f.owner,'owner@s.whatsapp.net')),false);
 await f.handler.handle(f.sock,f.msg('/r '+row.id,f.owner,'owner@s.whatsapp.net',{stanzaId:'result',quotedMessage:{conversation:'Resultado manual'}}));assert.equal(f.row().state,'delivered');assert.ok(f.sent.some(x=>x.to==='buyer@s.whatsapp.net'&&x.forward));assert.equal(f.handler.pending(f.chat),false);
 await f.handler.handle(f.sock,f.msg('/rechazar '+row.id,f.owner,'owner@s.whatsapp.net'));assert.equal(f.balance(),10);
 }finally{f.store.close();}});
test('notification failure refunds, uncertain delivery is held for review',async()=>{const f=setup();try{f.fail();await assert.rejects(f.handler.handle(f.sock,f.msg('/nombre Nombre Completo')));assert.equal(f.balance(),20);assert.equal(f.row().state,'rejected');}finally{f.store.close();}
 const g=setup();try{await g.handler.handle(g.sock,g.msg('/nombre Nombre Completo'));const row=g.row();g.fail();await assert.rejects(g.handler.handle(g.sock,g.msg('/r '+row.id,g.owner,'owner@s.whatsapp.net',{stanzaId:'result',quotedMessage:{conversation:'Result'}})));assert.equal(g.row().state,'review');assert.equal(g.balance(),10);}finally{g.store.close();}});

test('owner lookup and private chat binding recover pending notices without new charges',async()=>{const f=setup();try{
 f.sock.onWhatsApp=async()=>[{exists:true,jid:'owner@lid'}];
 await f.handler.handle(f.sock,f.msg('/nombre Nombre Completo'));assert.equal(f.sent[0].to,'owner@lid');assert.equal(f.balance(),10);
 f.handler.observePrivate(f.msg('.jinni',f.owner,'owner@s.whatsapp.net'));
 f.sock.onWhatsApp=async()=>{throw Error('Lookup should not run for verified private chat');};
 const before=f.sent.length;await f.handler.handle(f.sock,f.msg('/avisos',f.owner,'owner@s.whatsapp.net'));
 assert.equal(f.sent[before].to,'owner@s.whatsapp.net');assert.equal(f.balance(),10);assert.match(f.sent.at(-1).text,/Avisos recuperados: 1/);
 }finally{f.store.close();}});
