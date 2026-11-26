'use strict';
const MANUAL_NOTICE='El owner te entregará manualmente.';
// Only inspect message text/metadata, never scan or alter the contents of files.
function hasProviderLink(value){
 const seen=new Set();
 function visit(v,depth){
  if(typeof v==='string')return /(?:^|[^a-z0-9.-])(?:[a-z0-9-]+\.)*miapp\.sbs(?=$|[^a-z0-9.-])/i.test(v);
  if(!v||typeof v!=='object'||depth>16||seen.has(v)||ArrayBuffer.isView(v))return false;
  seen.add(v);
  return Object.values(v).some(x=>visit(x,depth+1));
 }
 return visit(value,0);
}
module.exports={hasProviderLink,MANUAL_NOTICE};
