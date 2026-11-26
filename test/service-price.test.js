'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPriceHandler}=require('../service-price-handler');
test('extra prices belong to the authorized sales group and never place orders',async()=>{
 let cfg={gruposAutorizados:['a@g.us','b@g.us'],gruposDestino:{a:'a@g.us',b:'b@g.us'},propietariosGrupos:{'a@g.us':'a@c.us','b@g.us':'b@c.us'}};
 const h=createPriceHandler({store:{shop:()=>null},owners:['root@c.us'],loadConfig:()=>JSON.parse(JSON.stringify(cfg)),saveConfig:c=>cfg=c,allowed:()=>true});
 let sent=[];const sock={sendMessage:async(j,m)=>sent.push(m.text)};
 async function send(text,who='a',group=false){sent=[];await h.handle(sock,{key:{remoteJid:group?'a@g.us':who+'@s.whatsapp.net'},message:{conversation:text}});return sent.join('\n');}
 const catalog=await send('/precios a');
 assert.match(catalog,/Semanas cotizadas detalladas.*30/);
 assert.match(catalog,/API PENDIENTE/);
 assert.match(catalog,/MANUAL[\s\S]*Permiso sin placas/);
 assert.match(catalog,/pedidos todavía no están habilitados/);
 assert.equal((catalog.match(/API PENDIENTE/g)||[]).length,1);
 assert.match(await send('/precioextra a semanas 35'),/guardado/);
 assert.equal(cfg.preciosServiciosExtra['a@g.us'].semanas,35);
 assert.match(await send('/precioextra a nss 80','b'),/sin permiso/);
 assert.match(await send('/precioextra b nss 80','a'),/sin permiso/);
 assert.match(await send('/precioextra a nss 0'),/positivo/);
 assert.match(await send('/precioextra a nss 80','a',true),/privado/);
 assert.match(await send('/precioextra a rfctexto 8'),/guardado/);
 assert.match(await send('/precioextra a rfcclon 8'),/guardado/);
 assert.equal(cfg.precios['a@g.us'].rfcclon,8);
 assert.match(await send('/precios b','b'),/Semanas cotizadas detalladas.*30/);
 assert.equal(cfg.preciosServiciosExtra['b@g.us'],undefined);
 assert.match(await send('/precio a actas 15'),/cuatro actas/);
 for(const code of ['nacimiento','matrimonio','defuncion','divorcio'])assert.equal(cfg.precios['a@g.us'][code],15);
 assert.equal(cfg.precios['a@g.us'].rfcclon,8);
 assert.equal(cfg.preciosServiciosExtra['a@g.us'].semanas,35);
 assert.match(await send('/precio a nacimiento 19'),/guardado/);
 assert.equal(cfg.precios['a@g.us'].nacimiento,19);
 assert.equal(cfg.precios['a@g.us'].matrimonio,15);
 assert.match(await send('/precio a actas 1','b'),/sin permiso/);
 assert.match(await send('/precio a actas 1','a',true),/privado/);
 assert.equal(cfg.precios['a@g.us'].matrimonio,15);
 assert.match(await send('/precio a actas 1.5'),/entero positivo/);
 assert.match(await send('/precios a'),/Acta de nacimiento.*19/);
 assert.equal(cfg.precios['b@g.us'],undefined);
});

test('unsupported permit stays manual; documented services do not activate API automatically',()=>{
 const {SERVICES,effectiveMode}=require('../service-price-handler');
 assert.equal(SERVICES.permiso.apiCode,null);
 assert.equal(SERVICES.permiso.plannedMode,'manual');
 for(const [key,s] of Object.entries(SERVICES)){assert.equal(effectiveMode(key),'manual');if(key!=='permiso')assert.equal(s.plannedMode,'api');}
});
