#!/usr/bin/env node
/*
 * ── Una línea de factura en cajas suma botellas (order-receipts) ──────
 *
 * Axel, 2026-11-22, Will's & Bill's: Thistle Finch facturó "Triage
 * Vodka [case/12]", 45 a $66. El LIVE sumaba 45 BOTELLAS: llegaron 540.
 * Las cajas se reparten luego a las otras locaciones con transfers, que
 * ya restan del LIVE; lo que faltaba es que la entrada sume lo que
 * entró: "que sí sumen tanto en cantidad de botellas como en dinero".
 *
 * MarginEdge factura el mismo producto en cajas y en botellas (la misma
 * Triage, a $5.50, en el transfer interno del 16), así que la caja se
 * reconoce por la LÍNEA, no por el producto: el nombre que trae
 * ("[case/12]", "CASE/12", "12/case", "cs/6").
 *
 * Lo que se protege:
 *   1. "case/12" → la cantidad × 12 y el precio ÷ 12: 540 a $5.50, el
 *      mismo dinero que la factura ($2,970).
 *   2. Una línea por botella no cambia.
 *   3. Un número que no dice caja ("1.75L", "750ml", "2022") no se toma
 *      por una caja.
 *   4. El LIVE suma las 540 y el transfer de 12 las resta.
 *   5. order-receipts lee el nombre de la línea.
 *
 *   node tools/test-factura-cajas.js
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d !== undefined ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const w = { console: { log() {}, warn() {} } }; w.window = w;
for (const f of ['order-receipts', 'live-stock']) new Function('window', leer('src/' + f + '.js'))(w);
const RC = w.BarStockOrderReceipts, L = w.BarStockLive;
const enlaces = [{ product_id: 'p1', item_name: 'Triage House Vodka' }];
const linea = (o) => Object.assign({ order_id: 'f1', product_id: 'p1', invoice_date: '2026-11-18', invoice_number: '53975' }, o);

grupo('la caja se reconoce en la línea');
{
  const [r] = RC.recibosDe([linea({ vendor_item_name: 'Triage Vodka [case/12]', quantity: 45, unit_price: 66 })], enlaces, new Map());
  prueba('45 cajas de 12 son 540 botellas', r && r.qty === 540, r && r.qty);
  prueba('a $5.50 cada una', r && Math.abs(r.precio - 5.5) < 1e-9, r && r.precio);
  prueba('el mismo dinero que la factura', r && Math.round(r.qty * r.precio) === 2970);
  for (const [nombre, n] of [['Triage Vanilla Vodka [CASE/12]', 12], ['Prosecco 12/case', 12], ['Tito\'s cs/6', 6], ['House Red - Case of 12', 12]]) {
    const [x] = RC.recibosDe([linea({ vendor_item_name: nombre, quantity: 2, unit_price: 60 })], enlaces, new Map());
    prueba('"' + nombre + '" → ' + (2 * n), x && x.qty === 2 * n, x && x.qty);
  }
}
{
  const [r] = RC.recibosDe([linea({ vendor_item_name: 'Triage Vodka', quantity: -12, unit_price: 5.5 })], enlaces, new Map());
  prueba('la línea por botella no cambia', r && r.qty === -12 && r.precio === 5.5);
  for (const nombre of ['Grey Goose 1.75L', 'Canyon Road 750ml', 'Pinot Noir 2022', 'Smirnoff No. 21', '']) {
    const [x] = RC.recibosDe([linea({ vendor_item_name: nombre, quantity: 3, unit_price: 20 })], enlaces, new Map());
    prueba('"' + nombre + '" no es una caja', x && x.qty === 3, x && x.qty);
  }
}

grupo('sin "case" en el nombre: el precio dice la caja');
{
  // Blood Orange llegó como "Triage Blood Orange Vodka", 10 a $72, sin
  // decir caja; la botella vale $6.50 en el inventario: 72 / 6.5 = 11.1,
  // una caja de 12. Sólo si cae a un 10 % de 6, 12 o 24 botellas.
  const enl = [{ product_id: 'p2', item_name: 'Triage Blood Orange Vodka' }];
  const master = [{ item: 'Triage Blood Orange Vodka', value: 6.5 }];
  const de = (precio, valor) => RC.recibosDe([linea({ product_id: 'p2', vendor_item_name: 'Triage Blood Orange Vodka', quantity: 10, unit_price: precio })],
    enl, new Map(), [{ item: 'Triage Blood Orange Vodka', value: valor }])[0];
  const r = de(72, 6.5);
  prueba('10 a $72 con la botella a $6.50: 120 botellas', r && r.qty === 120, r && r.qty);
  prueba('y el dinero es el de la factura ($720)', r && Math.round(r.qty * r.precio) === 720);
  prueba('una línea a 1× es una botella', de(6.5, 6.5).qty === 10);
  prueba('a 3.5× no adivina: suma tal cual', de(22.75, 6.5).qty === 10, de(22.75, 6.5).qty);
  prueba('a 6× es una caja de 6', de(39, 6.5).qty === 60, de(39, 6.5).qty);
  prueba('sin precio de la botella no adivina', de(72, 0).qty === 10);
  const [m] = RC.recibosDe([linea({ vendor_item_name: 'Triage Vodka [case/12]', quantity: 45, unit_price: 66 })], enlaces, new Map(),
    [{ item: 'Triage House Vodka', value: 66 }]);
  prueba('lo que dice el nombre gana al precio', m && m.qty === 540, m && m.qty);
  prueba('el LIVE y Sent le pasan el inventario', /recibosDe\([^)]*master/.test(leer('src/live-stock.js')) &&
    /recibosDe\([^)]*state/.test(leer('src/mobile-history.js')));
}

grupo('el LIVE suma las 540 y el transfer las resta');
{
  const recibos = RC.recibosDe([linea({ vendor_item_name: 'Triage Vodka [case/12]', quantity: 45, unit_price: 66 })], enlaces, new Map());
  const conteo = Date.parse('2026-11-16T04:15:13Z');
  const f = L.calcular({ master: [{ item: 'Triage House Vodka', onHand: 55.5 }], ordenes: [], repartido: new Map(), recibos,
    salidas: [{ item: 'Triage House Vodka', n: 120, cuando: '2026-11-21T18:00:00Z', a: 'The Crown Tavern' }],
    conteo, diaConteo: '2026-11-15', vendido: [], ahora: Date.parse('2026-11-23T03:00:00Z') });
  const t = f.find(x => x.producto === 'Triage House Vodka');
  prueba('55.5 + 540 − 120 = 475.5', t && Math.abs(t.live - 475.5) < 1e-9, t && t.live);
}

grupo('order-receipts lee el nombre de la línea');
{
  prueba('pide vendor_item_name a marginedge_invoice_lines', /select=order_id,product_id,[^`]*vendor_item_name/.test(leer('src/order-receipts.js')));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
