'use strict';
const { createHash } = require('crypto');
const { cents, money } = require('./store-db');
const canonical = id => id?.replace('@s.whatsapp.net','@c.us');
const jid = id => id?.replace('@c.us','@s.whatsapp.net');
const textOf = m => m?.conversation || m?.extendedTextMessage?.text || m?.documentMessage?.caption || m?.imageMessage?.caption || '';
const unwrap = m => m?.ephemeralMessage?.message || m;

function createShopHandler({ store, loadConfig, saveConfig, loadBalances, saveBalances, superAdmins, download }) {
    let flushing = false;
    async function flushAudit(sock) {
        if (flushing) return;
        flushing = true;
        try {
            const pending = store.db.prepare("SELECT id FROM orders WHERE audit=0 AND state IN ('sent','review','cancelled') ORDER BY created LIMIT 20").all();
            for (const {id} of pending) {
                const o = store.order(id);
                if (!o.admin_group) continue;
                try {
                    const label = {sent:'ENVIADO',review:'REVISAR ENTREGA',cancelled:'CANCELADO / REEMBOLSADO'}[o.state];
                    const payload = JSON.parse(o.payload);
                    const summary = `📦 ${label}\nPedido: ${id}\nTienda: ${o.alias}\nCliente: ${o.customer}\nProducto: ${o.code}\nImporte: ${money(o.price)}\nID del mensaje privado: ${o.message_id}\nFecha: ${o.created}`;
                    // One message includes both the exact unit and its order information.
                    await sock.sendMessage(o.admin_group, content(payload,o.media,summary));
                    store.db.prepare('UPDATE orders SET audit=1 WHERE id=? AND state=?').run(id,o.state);
                } catch(e) { console.error('Aviso de tienda pendiente:',id,e.message); }
            }
        } finally { flushing = false; }
    }
    function content(payload,media,summary) {
        const body = summary + '\n\nContenido de la unidad:\n' + (payload.text || '');
        if (payload.kind === 'image') return {image:media,caption:body};
        if (payload.kind === 'document') return {document:media,mimetype:payload.mimetype,fileName:payload.fileName,caption:body};
        return {text:body};
    }
    async function payloadFrom(message) {
        const m = unwrap(message);
        if (!m || m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension || m.imageMessage?.viewOnce || m.documentMessage?.viewOnce) throw Error('Usa un mensaje normal, no de una sola visualización.');
        const text = textOf(m);
        if (text.length > 8000) throw Error('Divide el contenido: máximo 8000 caracteres por unidad.');
        let media = null, payload = {kind:'text',text};
        const kind = m.documentMessage ? 'document' : m.imageMessage ? 'image' : null;
        if (kind) {
            if (text.length > 500) throw Error('Para imágenes y archivos usa una descripción de máximo 500 caracteres.');
            const item = m[kind+'Message'];
            if (Number(item.fileLength || 0) > 16*1024*1024) throw Error('El archivo supera 16 MB.');
            const chunks = []; let size = 0;
            for await (const chunk of await download(item,kind)) {
                size += chunk.length;
                if (size > 16*1024*1024) throw Error('El archivo supera 16 MB.');
                chunks.push(chunk);
            }
            media = Buffer.concat(chunks);
            if (!media.length) throw Error('Archivo vacío.');
            payload = {kind,text,mimetype:item.mimetype || 'application/octet-stream',fileName:(item.fileName || 'entrega').replace(/[\\/\r\n]/g,'_')};
        } else if (!text || m.videoMessage || m.audioMessage) throw Error('Carga una unidad de texto, imagen o documento.');
        return {payload,media,fingerprint:createHash('sha256').update(JSON.stringify(payload)).update(media || '').digest('hex')};
    }
    async function handle(sock,msg) {
        const group = msg.key.remoteJid;
        if (!group?.endsWith('@g.us')) return false;
        const sender = canonical(msg.key.participant);
        const message = unwrap(msg.message);
        const text = textOf(message).trim(), lower = text.toLowerCase(), args = text.split(/\s+/);
        const config = loadConfig();
        let shop = store.shop(group);
        const activation = /^\.act(?:ienda|ram)(?:\s|$)/i.test(text);
        const balanceAlias = lower === '.saldo' || /^(?:\/s|-s)(?:\s|$)/i.test(text);
        const paymentAlias = /^\/setpago(?:\s|$)/i.test(text);
        if (!shop && !activation && !balanceAlias && !paymentAlias) return false;
        const reply = t => sock.sendMessage(group,{text:t},{quoted:msg});
        try {
            const globalAdmin = superAdmins.includes(sender) || config.superAdmins?.includes(sender);
            let members = [];
            // Read the sender's role, never the bot's role.
            if (activation || shop?.mode === 'tienda' || balanceAlias || paymentAlias) members = (await sock.groupMetadata(group)).participants;
            const member = members.find(p => canonical(p.id) === sender || canonical(p.phoneNumber) === sender || canonical(p.lid) === sender);
            const groupAdmin = ['admin','superadmin'].includes(member?.admin);
            if (activation) {
                const owner = shop?.owner || config.propietariosGrupos?.[group] || sender;
                if (!(globalAdmin || (groupAdmin && config.gruposAutorizados.includes(group) && (!shop || owner===sender)))) throw Error('Solo el propietario autorizado o el superadministrador puede activar/cambiar este modo.');
                const alias = (args[1] || shop?.alias || Object.keys(config.gruposDestino || {}).find(a=>config.gruposDestino[a]===group) || 'tienda-'+group.split('@')[0]).toLowerCase();
                if (!/^[a-z0-9_-]{1,64}$/.test(alias)) throw Error('Usa un alias sin espacios, con letras, números o guiones.');
                const mode = lower.startsWith('.actienda') ? 'tienda' : 'tramites';
                const previous = shop;
                // Honor pre-existing aliases and ownership instead of overwriting another client.
                if (config.gruposDestino?.[alias] && config.gruposDestino[alias]!==group) throw Error('Ese alias ya pertenece a otro grupo.');
                shop = store.activate(group,alias,owner,mode,loadBalances()[group] || {});
                if (previous?.mode === 'tienda' && mode === 'tramites' && saveBalances) {
                    const balances = loadBalances();
                    balances[group] = Object.fromEntries(store.db.prepare('SELECT customer,amount FROM balances WHERE shop=?').all(group).map(b=>[b.customer,b.amount/100]));
                    saveBalances(balances);
                    config.pagosGrupos[group] = shop.payment;
                } else if (previous?.mode === 'tramites' && mode === 'tienda') {
                    const balances = loadBalances()[group] || {};
                    const customers = new Set([...Object.keys(balances),...store.db.prepare('SELECT customer FROM balances WHERE shop=?').all(group).map(b=>b.customer)]);
                    store.db.transaction(()=>{
                        for (const customer of customers) {
                            const amount = cents(balances[customer] || 0,true);
                            store.db.prepare('INSERT INTO balances VALUES(?,?,?) ON CONFLICT(shop,customer) DO UPDATE SET amount=excluded.amount').run(group,customer,amount);
                        }
                    })();
                    store.db.prepare('UPDATE shops SET payment=? WHERE id=?').run(config.pagosGrupos[group] || '',group);
                }
                if (!config.gruposAutorizados.includes(group)) config.gruposAutorizados.push(group);
                config.propietariosGrupos[group]=owner;
                config.gruposDestino[alias]=group;
                if (!shop.payment && config.pagosGrupos?.[group]) store.db.prepare('UPDATE shops SET payment=? WHERE id=?').run(config.pagosGrupos[group],group);
                saveConfig(config);
                await reply(mode==='tienda' ? `✅ Tienda ${alias} activada.\nEn el grupo privado escribe /vincular ${alias}.\nConsulta .ayudatienda para configurar productos y stock.` : '✅ Modo trámites activado. Usa .comandos.');
                return true;
            }
            // A private administration group can link itself only to its owner's shop.
            if (shop?.mode !== 'tienda') {
                if (shop && group !== shop.id) return true;
                if (lower==='.saldo') { if(config.gruposAutorizados.includes(group)) await reply('🔋 Saldo: '+money(cents(loadBalances()[group]?.[sender] || 0,true))); return true; }
                if (balanceAlias || paymentAlias) {
                    if (!config.gruposAutorizados.includes(group) || !(globalAdmin || groupAdmin || config.propietariosGrupos?.[group]===sender)) throw Error('No tienes permiso para administrar este grupo.');
                    if (paymentAlias) { const payment=text.slice(args[0].length).trim(); if(!payment) throw Error('Usa /setpago datos de pago.'); config.pagosGrupos[group]=payment; saveConfig(config); await reply('✅ Datos de pago guardados.'); return true; }
                    if (args.length!==2 || !message.extendedTextMessage?.contextInfo?.participant) throw Error('Usa /s 100 o -s 100 respondiendo al cliente.');
                    const customer=canonical(message.extendedTextMessage.contextInfo.participant);
                    if (!members.some(p=>[p.id,p.phoneNumber,p.lid].some(id=>canonical(id)===customer))) throw Error('Responde al mensaje de un cliente del grupo.');
                    const balances=loadBalances();
                    const amount=cents(balances[group]?.[customer] || 0,true)+cents(args[1])*(args[0].toLowerCase()==='-s'?-1:1);
                    if (amount<0) throw Error('El cliente no tiene saldo suficiente para descontar esa cantidad.');
                    if (!saveBalances) throw Error('No se puede guardar el saldo.');
                    if (!balances[group]) balances[group]={};
                    balances[group][customer]=amount/100;saveBalances(balances);
                    await reply('✅ Saldo actualizado: '+money(amount));return true;
                }
                return false;
            }
            const admin = globalAdmin || (sender===shop.owner) || (group===shop.id && groupAdmin);
            const privateGroup = group===shop.admin_group;
            const requireAdmin = () => {if (!admin) throw Error('Solo el dueño o un administrador autorizado puede usar este comando.');};
            const requirePrivate = () => {requireAdmin(); if(!privateGroup) throw Error('Usa este comando en el grupo privado de stock.');};
            if (!config.gruposAutorizados.includes(shop.id)) return true;
            if (lower==='.ayudatienda' || lower==='.comandos' || lower==='.jinni') {
                await reply('🛍️ TIENDA\n.stock — catálogo\n.comprar código — compra una unidad y recibe por privado\n.saldo — tu saldo\n.pago — datos para recargar\n\nADMINISTRACIÓN\n.actienda alias / .actram alias (grupo de ventas)\n/vincular alias (grupo privado del dueño)\n/producto código precio nombre\n/addstock código (respondiendo a una unidad)\n/inventario /verstock código /retirar ID\n/precio código precio\n/setpago datos\n/s cantidad y -s cantidad (respondiendo al cliente en ventas)\n/pedidos /resolver ID entregado|cancelar\n/reavisar (reintenta avisos al grupo privado)'); return true;
            }
            if (lower==='.saldo' || lower==='.versaldo') {await reply('🔋 Saldo en '+shop.alias+': '+money(store.balance(shop.id,sender))); return true;}
            if (lower==='.pago') {await reply(shop.payment || 'Sin datos de pago configurados.'); return true;}
            if (args[0].toLowerCase()==='/setpago') {requireAdmin();const payment=text.slice(args[0].length).trim();if(!payment || payment.length>8000) throw Error('Usa /setpago datos (máximo 8000 caracteres).'); store.db.prepare('UPDATE shops SET payment=? WHERE id=?').run(payment,shop.id); await reply('✅ Datos de pago guardados.');return true;}
            if (['/s','-s'].includes(args[0].toLowerCase())) {
                requireAdmin(); if(privateGroup) throw Error('Responde al cliente en el grupo de ventas para ajustar su saldo.');
                if(args.length!==2) throw Error('Usa /s 100 o -s 100 respondiendo al cliente.');
                const customer=canonical(message.extendedTextMessage?.contextInfo?.participant);
                if(!customer || !members.some(p=>[p.id,p.phoneNumber,p.lid].some(id=>canonical(id)===customer))) throw Error('Responde al mensaje de un cliente del grupo.');
                const amount=cents(args[1])*(args[0].toLowerCase()==='-s'?-1:1);
                await reply('✅ Saldo actualizado: '+money(store.adjust(shop.id,customer,amount,sender,msg.key.id)));return true;
            }
            if(lower==='.stock' || lower==='/inventario') {
                if(lower==='/inventario') requirePrivate();
                const products=store.inventory(shop.id);
                await reply(products.length ? '🛍️ '+shop.alias+'\n\n'+products.map(p=>`${p.code} — ${p.name}\n${money(p.price)} · ${p.quantity} disponibles`).join('\n\n')+'\n\nCompra con .comprar código.' : 'Todavía no hay productos.');return true;
            }
            if(args[0].toLowerCase()==='/producto') {requirePrivate();store.product(shop.id,(args[1]||'').toLowerCase(),args[2],args.slice(3).join(' '));await reply('✅ Producto guardado. Añade unidades con /addstock '+args[1]+' respondiendo al contenido.');return true;}
            if(args[0].toLowerCase()==='/precio') {requirePrivate();const p=store.inventory(shop.id).find(p=>p.code===args[1]?.toLowerCase());if(!p) throw Error('Producto inexistente.');store.product(shop.id,p.code,args[2],p.name);await reply('✅ Precio actualizado.');return true;}
            if(args[0].toLowerCase()==='/addstock') {
                requirePrivate();if(args.length!==2) throw Error('Usa /addstock código respondiendo a una unidad completa.');
                const ctx=message.extendedTextMessage?.contextInfo;
                if(!ctx?.quotedMessage || !ctx.stanzaId) throw Error('Responde al mensaje con el texto, imagen o archivo que recibirá el cliente.');
                const {payload,media,fingerprint}=await payloadFrom(ctx.quotedMessage);
                const id=store.add(shop.id,args[1].toLowerCase(),payload,media,fingerprint,group+':'+ctx.stanzaId);
                await reply('✅ Unidad guardada en el VPS. ID: '+id+'\nUna unidad equivale a una entrega completa.');return true;
            }
            if(args[0].toLowerCase()==='/verstock') {requirePrivate(); const units=store.db.prepare("SELECT id,payload FROM units WHERE shop=? AND code=? AND state='available' LIMIT 20").all(shop.id,args[1]?.toLowerCase() || '');await reply(units.length ? units.map(u=>u.id+'\n'+(JSON.parse(u.payload).text || '[Archivo guardado]').slice(0,500)).join('\n\n') : 'Sin unidades disponibles.');return true;}
            if(args[0].toLowerCase()==='/retirar') {requirePrivate();store.remove(shop.id,args[1]);await reply('✅ Unidad retirada.');return true;}
            if(lower==='/pedidos') {requirePrivate();const orders=store.db.prepare('SELECT orders.id,units.code,orders.customer,orders.state FROM orders JOIN units ON orders.unit=units.id WHERE orders.shop=? ORDER BY created DESC LIMIT 20').all(shop.id);await reply(orders.length ? orders.map(o=>`${o.id}\n${o.code} · ${o.customer} · ${o.state}`).join('\n\n') : 'Sin pedidos.');return true;}
            if(args[0].toLowerCase()==='/resolver') {
                requirePrivate();const o=store.order(args[1]);if(!o || o.shop!==shop.id || o.state!=='review') throw Error('Solo puedes resolver pedidos en revisión de tu tienda.');
                if(!['entregado','cancelar'].includes(args[2]?.toLowerCase())) throw Error('Usa /resolver ID entregado|cancelar tras comprobar el privado. Cancelar devuelve saldo y stock.');
                store.settle(o.id,args[2].toLowerCase()==='entregado'?'sent':'cancelled');await reply('✅ Pedido resuelto.');await flushAudit(sock);return true;
            }
            if(lower==='/reavisar') {requirePrivate();await flushAudit(sock);await reply('✅ Avisos pendientes reintentados.');return true;}
            if(args[0].toLowerCase()==='.comprar') {
                if(privateGroup) throw Error('Compra desde el grupo de ventas.');
                if(args.length!==2) throw Error('Usa .comprar código para comprar una unidad.');
                const o=store.reserve(shop.id,sender,args[1].toLowerCase(),msg.key.id);
                try {
                    await sock.sendMessage(jid(sender),content(JSON.parse(o.payload),o.media,`📦 Pedido ${o.id}\nTienda: ${shop.alias}\nProducto: ${o.code}\nImporte: ${money(o.price)}`),{messageId:o.message_id});
                } catch(e) {
                    // A thrown send can still have reached WhatsApp. Never refund/resell blindly.
                    store.settle(o.id,'review');await flushAudit(sock);
                    await reply('⚠️ No pudimos confirmar la entrega. Pedido '+o.id+' en revisión; la unidad y el importe quedan reservados. El dueño debe comprobar el privado antes de resolverlo.');return true;
                }
                store.settle(o.id,'sent');await flushAudit(sock);
                await reply('✅ Pedido '+o.id+' enviado por privado. Saldo: '+money(store.balance(shop.id,sender)));return true;
            }
            if(text.startsWith('.') || text.startsWith('/') || text.startsWith('-s')) await reply('Comando no disponible en modo tienda. Consulta .ayudatienda.');
            return true; // Do not route shop messages through the trámite handler.
        } catch(e) {await reply('⚠️ '+e.message);return true;}
    }
    // /vincular must also work in a not-yet-linked group.
    async function route(sock,msg) {
        const group=msg.key.remoteJid, text=textOf(unwrap(msg.message)).trim();
        if(group?.endsWith('@g.us') && /^\/vincular(?:\s|$)/i.test(text)) {
            const reply=t=>sock.sendMessage(group,{text:t},{quoted:msg});
            try {
                const args=text.split(/\s+/), shop=store.alias(args[1]?.toLowerCase() || '');
                if(args.length!==2 || !shop || shop.mode!=='tienda') throw Error('Usa /vincular alias de una tienda activa.');
                const config=loadConfig(),sender=canonical(msg.key.participant);
                const globalAdmin=superAdmins.includes(sender) || config.superAdmins?.includes(sender);
                if(sender!==shop.owner && !globalAdmin) throw Error('Solo el dueño de esa tienda puede vincular su grupo privado.');
                const members=(await sock.groupMetadata(group)).participants;
                const member=members.find(p=>[p.id,p.phoneNumber,p.lid].some(id=>canonical(id)===sender));
                if(!globalAdmin && !['admin','superadmin'].includes(member?.admin)) throw Error('Debes ser administrador del grupo privado.');
                store.link(shop.id,group);await reply('✅ Grupo privado vinculado a '+shop.alias+'. Aquí se carga stock y se reciben las copias de las entregas.');
            } catch(e) {await reply('⚠️ '+e.message);}return true;
        }
        return handle(sock,msg);
    }
    return {handle:route,flushAudit};
}
module.exports={createShopHandler};
