'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {StoreDB,cents}=require('../store-db');
const {createShopHandler}=require('../shop-handler');

function fixture(filename=':memory:') {
 const store=new StoreDB(filename);
 store.activate('sales@g.us','demo','owner@c.us','tienda');
 store.link('sales@g.us','private@g.us');
 store.product('sales@g.us','gift',10,'Gift');
 store.adjust('sales@g.us','buyer@c.us',5000,'owner','credit');
 const unit=store.add('sales@g.us','gift',{kind:'text',text:'CODE-123'},null,'fp','source');
 return {store,unit};
}
test('amount validation and cents precision',()=>{
 assert.equal(cents('12.34'),1234); assert.equal(cents('12,34'),1234);
 for(const v of ['-1','0','1.001','1e3','NaN','Infinity','10garbage']) assert.throws(()=>cents(v));
});
test('stock, duplicate purchases and saldo are atomic',()=>{
 const {store,unit}=fixture();
 const o=store.reserve('sales@g.us','buyer@c.us','gift','request');
 assert.equal(store.balance('sales@g.us','buyer@c.us'),4000);
 assert.equal(store.inventory('sales@g.us')[0].quantity,0);
 assert.throws(()=>store.reserve('sales@g.us','buyer@c.us','gift','request'));
 assert.throws(()=>store.reserve('sales@g.us','buyer@c.us','gift','other'));
 assert.throws(()=>store.remove('sales@g.us',unit));
 store.settle(o.id,'sent'); assert.throws(()=>store.settle(o.id,'cancelled'));
 assert.equal(store.balance('sales@g.us','buyer@c.us'),4000);store.close();
});
test('review cancellation refunds exactly once and returns unit',()=>{
 const {store}=fixture();const o=store.reserve('sales@g.us','buyer@c.us','gift','request');
 store.settle(o.id,'review');store.settle(o.id,'cancelled');
 assert.equal(store.balance('sales@g.us','buyer@c.us'),5000);assert.equal(store.inventory('sales@g.us')[0].quantity,1);
 assert.throws(()=>store.settle(o.id,'cancelled'));store.close();
});
test('tenants cannot share balances, stock, aliases or groups',()=>{
 const {store}=fixture();store.activate('other@g.us','other','other@c.us','tienda');
 assert.equal(store.balance('other@g.us','buyer@c.us'),0);assert.equal(store.inventory('other@g.us').length,0);
 assert.throws(()=>store.activate('other@g.us','demo','other@c.us','tienda'));
 assert.throws(()=>store.link('other@g.us','private@g.us'));
 assert.throws(()=>store.link('other@g.us','sales@g.us'));store.close();
});
test('duplicate stock and adjustments are rejected without changing money',()=>{
 const {store}=fixture();assert.throws(()=>store.add('sales@g.us','gift',{kind:'text',text:'CODE-123'},null,'fp','source2'));
 assert.throws(()=>store.adjust('sales@g.us','buyer@c.us',100,'owner','credit'));
 assert.throws(()=>store.adjust('sales@g.us','buyer@c.us',-6000,'owner','overdraw'));
 assert.equal(store.balance('sales@g.us','buyer@c.us'),5000);store.close();
});
test('restart persists files, balances and marks in-flight sends for review',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naevis-test-')),file=path.join(dir,'db.sqlite');
 let {store}=fixture(file);const o=store.reserve('sales@g.us','buyer@c.us','gift','request');store.close();
 store=new StoreDB(file);assert.equal(store.order(o.id).state,'review');assert.equal(store.balance('sales@g.us','buyer@c.us'),4000);
 assert.equal(store.inventory('sales@g.us')[0].quantity,0);store.close();fs.rmSync(dir,{recursive:true});
});
function handlerFixture(failPrivate=false,failAudit=false) {
 const {store}=fixture(),sent=[];
 const config={gruposAutorizados:['sales@g.us'],superAdmins:[],propietariosGrupos:{'sales@g.us':'owner@c.us'},gruposDestino:{},pagosGrupos:{}};
 const handler=createShopHandler({store,loadConfig:()=>config,saveConfig:()=>{},loadBalances:()=>({}),superAdmins:[],download:async()=>[]});
 const sock={groupMetadata:async()=>({participants:[{id:'owner@s.whatsapp.net',admin:'admin'},{id:'buyer@s.whatsapp.net'},{id:'bot@s.whatsapp.net',admin:'admin'}]}),sendMessage:async(to,payload,options)=>{if(failPrivate&&to==='buyer@s.whatsapp.net')throw Error('Disconnected');if(failAudit&&to==='private@g.us')throw Error('Disconnected');sent.push({to,payload,options});return {key:{id:'sent'}};}};
 const msg=(text,who='buyer',group='sales@g.us',id=text)=>({key:{id,remoteJid:group,participant:who+'@s.whatsapp.net'},message:{conversation:text}});
 return {store,sent,handler,sock,msg};
}
test('private delivery includes exact unit and matching copy to owner group',async()=>{
 const {store,sent,handler,sock,msg}=handlerFixture();
 assert.equal(await handler.handle(sock,msg('.comprar gift')),true);
 assert.match(sent.find(s=>s.to==='buyer@s.whatsapp.net').payload.text,/CODE-123/);
 assert.match(sent.find(s=>s.to==='private@g.us').payload.text,/CODE-123/);
 assert.equal(store.db.prepare('SELECT state FROM orders').get().state,'sent');
 await handler.handle(sock,msg('.comprar gift'));assert.equal(sent.filter(s=>s.to==='buyer@s.whatsapp.net').length,1);store.close();
});
test('uncertain delivery is not resold or refunded automatically',async()=>{
 const {store,handler,sock,msg}=handlerFixture(true);await handler.handle(sock,msg('.comprar gift'));
 assert.equal(store.db.prepare('SELECT state FROM orders').get().state,'review');assert.equal(store.balance('sales@g.us','buyer@c.us'),4000);
 assert.equal(store.inventory('sales@g.us')[0].quantity,0);store.close();
});
test('failed audit never refunds an already sent unit and can be retried',async()=>{
 const {store,handler,sock,msg,sent}=handlerFixture(false,true);await handler.handle(sock,msg('.comprar gift'));
 assert.equal(store.db.prepare('SELECT state,audit FROM orders').get().state,'sent');assert.equal(store.balance('sales@g.us','buyer@c.us'),4000);
 sock.sendMessage=async(to,payload)=>{sent.push({to,payload});};await handler.flushAudit(sock);
 assert.equal(store.db.prepare('SELECT audit FROM orders').get().audit,1);store.close();
});
test('bot admin role cannot authorize a customer to change prices or mode',async()=>{
 const {store,handler,sock,msg,sent}=handlerFixture();await handler.handle(sock,msg('/producto gift 1 hacked','buyer','private@g.us'));
 assert.equal(store.inventory('sales@g.us')[0].price,1000);
 await handler.handle(sock,msg('.actram'));assert.equal(store.shop('sales@g.us').mode,'tienda');
 assert(sent.some(s=>s.payload.text.includes('Solo el')));store.close();
});
test('owner loads complete text and document units only in private group',async()=>{
 const {store,handler,sock,msg}=handlerFixture();const m=msg('/addstock gift','owner','private@g.us','add');
 m.message={extendedTextMessage:{text:'/addstock gift',contextInfo:{stanzaId:'unit2',quotedMessage:{conversation:'COMPLETE\nINSTRUCTIONS'}}}};
 await handler.handle(sock,m);assert.equal(store.inventory('sales@g.us')[0].quantity,2);
 const fileHandler=createShopHandler({store,loadConfig:()=>({gruposAutorizados:['sales@g.us'],superAdmins:[]}),saveConfig:()=>{},loadBalances:()=>({}),superAdmins:[],download:async()=> (async function*(){yield Buffer.from('file-content');})()});
 m.key.id='add-file';m.message.extendedTextMessage.contextInfo={stanzaId:'file1',quotedMessage:{documentMessage:{fileName:'file.txt',mimetype:'text/plain',caption:'Read me',fileLength:12}}};
 await fileHandler.handle(sock,m);
 const u=store.db.prepare("SELECT media,payload FROM units WHERE source='private@g.us:file1'").get();assert.equal(u.media.toString(),'file-content');assert.equal(JSON.parse(u.payload).text,'Read me');store.close();
});
test('private commands and saldo changes cannot leak into legacy handler',async()=>{
 const {store,handler,sock,msg}=handlerFixture();assert.equal(await handler.handle(sock,msg('CURP 5')),true);
 const m=msg('/s 10','owner');m.message={extendedTextMessage:{text:'/s 10',contextInfo:{participant:'buyer@s.whatsapp.net'}}};
 await handler.handle(sock,m);assert.equal(store.balance('sales@g.us','buyer@c.us'),6000);
 await handler.handle(sock,m);assert.equal(store.balance('sales@g.us','buyer@c.us'),6000);store.close();
});

test('mode switches transfer balance and payment without exposing private stock',async()=>{
 const {store,sock,msg,sent}=handlerFixture();
 const config={gruposAutorizados:['sales@g.us'],superAdmins:[],propietariosGrupos:{'sales@g.us':'owner@c.us'},gruposDestino:{},pagosGrupos:{}};
 let balances={};
 store.db.prepare('UPDATE shops SET payment=? WHERE id=?').run('BANK','sales@g.us');
 const handler=createShopHandler({store,loadConfig:()=>config,saveConfig:()=>{},loadBalances:()=>balances,saveBalances:b=>{balances=b;},superAdmins:[],download:async()=>[]});
 await handler.handle(sock,msg('.actram demo','owner'));
 assert.equal(store.shop('sales@g.us').mode,'tramites');assert.equal(balances['sales@g.us']['buyer@c.us'],50);assert.equal(config.pagosGrupos['sales@g.us'],'BANK');
 const credit=msg('/s 12.34','owner');credit.message={extendedTextMessage:{text:'/s 12.34',contextInfo:{participant:'buyer@s.whatsapp.net'}}};
 await handler.handle(sock,credit);assert.equal(balances['sales@g.us']['buyer@c.us'],62.34);
 assert.equal(await handler.handle(sock,msg('/inventario','owner','private@g.us')),true);
 await handler.handle(sock,msg('.actienda demo','owner'));
 assert.equal(store.balance('sales@g.us','buyer@c.us'),6234);assert.equal(store.shop('sales@g.us').payment,'BANK');assert.equal(store.inventory('sales@g.us')[0].quantity,1);store.close();
});
