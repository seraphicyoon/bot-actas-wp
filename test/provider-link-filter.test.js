'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {hasProviderLink,MANUAL_NOTICE}=require('../provider-link-filter');
test('provider link is detected in text, captions, nested forwarded messages and link previews',()=>{
 for(const v of ['https://miapp.sbs/abc','MIAPP.SBS','https://www.miapp.sbs/x',{documentMessage:{caption:'https://miapp.sbs/x'}},{ephemeralMessage:{message:{extendedTextMessage:{text:'https://miapp.sbs/'}}}},{extendedTextMessage:{canonicalUrl:'https://miapp.sbs/'}}])assert.equal(hasProviderLink(v),true);
 for(const v of ['https://example.com/','https://notmiapp.sbs/','https://miapp.sbs.example.com/',{documentMessage:{fileName:'resultado.pdf',caption:'Listo'}},Buffer.from('https://miapp.sbs/')])assert.equal(hasProviderLink(v),false);
 assert.equal(MANUAL_NOTICE,'El owner te entregará manualmente.');
});
