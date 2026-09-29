'use strict';
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

function cents(value, allowZero = false) {
    const text = String(value);
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) throw Error('Usa una cantidad positiva con máximo dos decimales.');
    const n = Math.round(Number(text.replace(',', '.')) * 100);
    if (!Number.isSafeInteger(n) || n > 100000000 || n < (allowZero ? 0 : 1)) throw Error('Cantidad fuera de rango.');
    return n;
}
const money = n => '$' + (n / 100).toFixed(2) + ' MXN';

class StoreDB {
    constructor(filename) {
        if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
        this.db = new Database(filename);
        if (filename !== ':memory:') fs.chmodSync(filename, 0o600);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = FULL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('busy_timeout = 5000');
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS shops (id TEXT PRIMARY KEY, alias TEXT UNIQUE NOT NULL, owner TEXT NOT NULL, mode TEXT NOT NULL, admin_group TEXT UNIQUE, payment TEXT NOT NULL DEFAULT '');
          CREATE TABLE IF NOT EXISTS products (shop TEXT NOT NULL REFERENCES shops(id), code TEXT NOT NULL, name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>0), PRIMARY KEY(shop,code));
          CREATE TABLE IF NOT EXISTS units (id TEXT PRIMARY KEY, shop TEXT NOT NULL, code TEXT NOT NULL, payload TEXT NOT NULL, media BLOB, fingerprint TEXT NOT NULL, source TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'available', UNIQUE(shop,source), UNIQUE(shop,code,fingerprint), FOREIGN KEY(shop,code) REFERENCES products(shop,code));
          CREATE TABLE IF NOT EXISTS balances (shop TEXT NOT NULL REFERENCES shops(id), customer TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>=0), PRIMARY KEY(shop,customer));
          CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, shop TEXT NOT NULL REFERENCES shops(id), customer TEXT NOT NULL, unit TEXT NOT NULL REFERENCES units(id), price INTEGER NOT NULL, request TEXT NOT NULL, state TEXT NOT NULL, message_id TEXT NOT NULL, created TEXT NOT NULL, audit INTEGER NOT NULL DEFAULT 0, UNIQUE(shop,request));
          CREATE TABLE IF NOT EXISTS movements (id INTEGER PRIMARY KEY, shop TEXT NOT NULL, customer TEXT NOT NULL, amount INTEGER NOT NULL, actor TEXT NOT NULL, source TEXT NOT NULL, created TEXT NOT NULL, UNIQUE(shop,source));
        `);
        // A restart during a send must never put the unit back on sale automatically.
        this.db.prepare("UPDATE orders SET state='review' WHERE state='sending'").run();
    }
    shop(id) { return this.db.prepare('SELECT * FROM shops WHERE id=? OR admin_group=?').get(id,id); }
    alias(alias) { return this.db.prepare('SELECT * FROM shops WHERE alias=?').get(alias); }
    activate(id, alias, owner, mode, initialBalances = {}) {
        return this.db.transaction(() => {
            const old = this.shop(id);
            if (old && old.id !== id) throw Error('Este grupo está vinculado como administración de otra tienda.');
            const used = this.alias(alias);
            if (used && used.id !== id) throw Error('Ese alias ya pertenece a otro grupo.');
            if (mode === 'tramites' && this.db.prepare("SELECT 1 FROM orders WHERE shop=? AND state IN ('sending','review')").get(id)) throw Error('Resuelve los pedidos en revisión antes de cambiar de modo.');
            this.db.prepare('INSERT INTO shops(id,alias,owner,mode) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET alias=excluded.alias,mode=excluded.mode').run(id,alias,owner,mode);
            if (!old) for (const [customer,amount] of Object.entries(initialBalances)) this.db.prepare('INSERT INTO balances VALUES(?,?,?)').run(id,customer,cents(amount,true));
            return this.shop(id);
        })();
    }
    link(shop, group) {
        if (group === shop) throw Error('Usa un grupo privado distinto al grupo de ventas.');
        const existing = this.shop(group);
        if (existing && existing.id !== shop) throw Error('El grupo ya pertenece a otra tienda.');
        if (this.db.prepare('SELECT 1 FROM shops WHERE id=?').get(group)) throw Error('Un grupo de ventas no puede usarse como grupo privado.');
        if (this.db.prepare("SELECT 1 FROM orders WHERE shop=? AND state IN ('sending','review')").get(shop)) throw Error('Resuelve los pedidos pendientes antes de cambiar el grupo privado.');
        this.db.prepare('UPDATE shops SET admin_group=? WHERE id=?').run(group,shop);
    }
    product(shop, code, price, name) {
        if (!/^[a-z0-9_-]{1,32}$/.test(code)) throw Error('El código debe usar letras, números, guion o guion bajo (máximo 32).');
        this.db.prepare('INSERT INTO products VALUES(?,?,?,?) ON CONFLICT(shop,code) DO UPDATE SET name=excluded.name,price=excluded.price').run(shop,code,name || code,cents(price));
    }
    inventory(shop) { return this.db.prepare("SELECT p.*,COUNT(u.id) AS quantity FROM products p LEFT JOIN units u ON u.shop=p.shop AND u.code=p.code AND u.state='available' WHERE p.shop=? GROUP BY p.code ORDER BY p.code").all(shop); }
    add(shop, code, payload, media, fingerprint, source) {
        if (!this.db.prepare('SELECT 1 FROM products WHERE shop=? AND code=?').get(shop,code)) throw Error('Primero crea el producto con /producto código precio nombre.');
        const id = randomUUID();
        try { this.db.prepare('INSERT INTO units(id,shop,code,payload,media,fingerprint,source) VALUES(?,?,?,?,?,?,?)').run(id,shop,code,JSON.stringify(payload),media || null,fingerprint,source); }
        catch(e) { if (e.code?.startsWith('SQLITE_CONSTRAINT_UNIQUE')) throw Error('Esta unidad ya está guardada; no se duplicó.'); throw e; }
        return id;
    }
    balance(shop, customer) { return this.db.prepare('SELECT amount FROM balances WHERE shop=? AND customer=?').get(shop,customer)?.amount || 0; }
    adjust(shop, customer, amount, actor, source) {
        return this.db.transaction(() => {
            if (this.db.prepare('SELECT 1 FROM movements WHERE shop=? AND source=?').get(shop,source)) throw Error('Ese ajuste ya fue procesado.');
            const next = this.balance(shop,customer) + amount;
            if (!Number.isSafeInteger(next) || next < 0) throw Error('El descuento supera el saldo disponible.');
            this.db.prepare('INSERT INTO balances VALUES(?,?,?) ON CONFLICT(shop,customer) DO UPDATE SET amount=excluded.amount').run(shop,customer,next);
            this.db.prepare('INSERT INTO movements(shop,customer,amount,actor,source,created) VALUES(?,?,?,?,?,?)').run(shop,customer,amount,actor,source,new Date().toISOString());
            return next;
        })();
    }
    reserve(shop, customer, code, request) {
        return this.db.transaction(() => {
            if (this.db.prepare('SELECT 1 FROM orders WHERE shop=? AND request=?').get(shop,request)) throw Error('Este pedido ya fue procesado.');
            if (!this.shop(shop)?.admin_group) throw Error('La tienda aún no tiene un grupo privado vinculado.');
            const p = this.db.prepare('SELECT * FROM products WHERE shop=? AND code=?').get(shop,code);
            if (!p) throw Error('Producto inexistente. Consulta .stock.');
            const unit = this.db.prepare("SELECT * FROM units WHERE shop=? AND code=? AND state='available' ORDER BY rowid LIMIT 1").get(shop,code);
            if (!unit) throw Error('Producto agotado.');
            if (this.balance(shop,customer) < p.price) throw Error('Saldo insuficiente. Consulta .pago para recargar.');
            const id = randomUUID(), messageId = randomUUID().replace(/-/g,'').toUpperCase();
            this.adjust(shop,customer,-p.price,'bot','order:'+id);
            this.db.prepare("UPDATE units SET state='reserved' WHERE id=?").run(unit.id);
            this.db.prepare("INSERT INTO orders(id,shop,customer,unit,price,request,state,message_id,created) VALUES(?,?,?,?,?,?,'sending',?,?)").run(id,shop,customer,unit.id,p.price,request,messageId,new Date().toISOString());
            return this.order(id);
        })();
    }
    order(id) { return this.db.prepare('SELECT o.*,u.payload,u.media,u.code,s.alias,s.admin_group FROM orders o JOIN units u ON u.id=o.unit JOIN shops s ON s.id=o.shop WHERE o.id=?').get(id); }
    settle(id, state) {
        return this.db.transaction(() => {
            const o = this.order(id);
            if (!o || !['sending','review'].includes(o.state)) throw Error('El pedido ya está resuelto o no existe.');
            if (!['sent','cancelled','review'].includes(state)) throw Error('Estado inválido.');
            if (state === 'cancelled') {
                this.adjust(o.shop,o.customer,o.price,'bot','refund:'+id);
                this.db.prepare("UPDATE units SET state='available' WHERE id=?").run(o.unit);
            } else if (state === 'sent') this.db.prepare("UPDATE units SET state='sold' WHERE id=?").run(o.unit);
            this.db.prepare('UPDATE orders SET state=?,audit=0 WHERE id=?').run(state,id);
        })();
    }
    remove(shop,id) {
        const r = this.db.prepare("UPDATE units SET state='removed' WHERE shop=? AND id=? AND state='available'").run(shop,id);
        if (!r.changes) throw Error('La unidad no existe o está reservada/vendida.');
    }
    close() { this.db.close(); }
}
module.exports = { StoreDB, cents, money };
