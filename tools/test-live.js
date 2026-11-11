#!/usr/bin/env node
/*
 * ── El LIVE (src/live-stock.js) ──────────────────────────────────────
 *
 * Axel, 2026-11-11: LIVE = contado + lo que llegó − lo vendido en Toast
 * desde el conteo. Lo ordenado no cambia nunca; cambia cuánto llegó al
 * casar contra la factura. Lo que se protege:
 *   1. Su ejemplo, paso a paso: contó 3 Tito's el domingo, ordenó 5 →
 *      martes 7 AM, 8 → con las ventas del martes, 7 → la factura dice
 *      que no llegó, 2.
 *   2. Antes de la hora de llegada, el pedido no suma.
 *   3. Llegó corto o de más: manda la factura.
 *   4. Un pedido que llegó antes del conteo no suma (estaba en la
 *      estantería al contar).
 *   5. Sin horario (opción a): sólo lo de la factura, y sólo si se colocó
 *      después del conteo.
 *   6. Lo facturado sin pedido suma si es de después del día del conteo.
 *   7. "Live" sólo con movimiento detrás.
 *   8. Cuánto llegó lo decide el MISMO reparto que Sent.
 *
 *   node tools/test-live.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const w = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
w.eval(leer('src/order-receipts.js'));
w.eval(leer('src/live-stock.js'));
const RC = w.BarStockOrderReceipts, L = w.BarStockLive;

const T = (s) => new Date(s).getTime();
// El conteo: domingo 15 a las 9 PM de Nueva York.
const CONTEO = T('2026-11-16T02:00:00Z');
const DIA = '2026-11-15';
const MASTER = [{ item: "Tito's Vodka 1L", onHand: 3 }, { item: 'Grey Goose 1L', onHand: 2 }, { item: 'Baileys 1L', onHand: 1 }];

// El pedido de LOOP: colocado el domingo después del conteo, llega el
// martes 17 a las 7 AM.
const ORD = { id: 'v1', po_number: 'CT-0230', vendor: 'LOOP', created_at: '2026-11-16T02:30:00Z', arrives_at: '2026-11-17T12:00:00Z' };
const LIN = [{ vendor_order_id: 'v1', item_name: "Tito's Vodka 1L", quantity: 5, unit_price: 20 }];

function live(o) {
  const recibos = RC.recibosDe(o.facturas || [], o.enlaces || [], new Map(o.manuales || []));
  const repartido = RC.repartir({ recortadas: o.ordenes || [ORD], lineas: o.lineas || LIN, recibos, inicioCiclo: CONTEO });
  const filas = L.calcular({ master: MASTER, ordenes: o.ordenes || [ORD], repartido, recibos,
    conteo: CONTEO, diaConteo: DIA, ahora: T(o.ahora), vendido: o.vendido || [] });
  const f = (p) => filas.find(x => x.producto === p) || { live: undefined };
  return { filas, f };
}
const titos = (r) => r.f("Tito's Vodka 1L");

grupo('el ejemplo de Axel, paso a paso');
{
  let r = live({ ahora: '2026-11-16T15:00:00Z' });
  prueba('lunes: 3, lo contado (el pedido aún no llega)', titos(r).live === 3 && !titos(r).movimiento, JSON.stringify(titos(r)));
  r = live({ ahora: '2026-11-17T12:30:00Z' });
  prueba('martes 7 AM: 8 (3 + los 5 ordenados)', titos(r).live === 8 && titos(r).movimiento);
  r = live({ ahora: '2026-11-18T12:00:00Z', vendido: [{ producto: "Tito's Vodka 1L", botellas: 1 }] });
  prueba('miércoles con las ventas del martes: 7', titos(r).live === 7);
  // La factura de LOOP entra y NO trae Tito's (trae otra cosa).
  const facturas = [{ order_id: 'F1', product_id: 'gg', quantity: 1, unit_price: 30, invoice_date: '2026-11-18', invoice_number: '9' }];
  const enlaces = [{ product_id: 'gg', item_name: 'Grey Goose 1L' }];
  const ord2 = Object.assign({}, ORD);
  const lin2 = LIN.concat([{ vendor_order_id: 'v1', item_name: 'Grey Goose 1L', quantity: 1, unit_price: 30 }]);
  r = live({ ahora: '2026-11-18T22:00:00Z', ordenes: [ord2], lineas: lin2, facturas, enlaces, vendido: [{ producto: "Tito's Vodka 1L", botellas: 1 }] });
  prueba('miércoles tarde, la factura dice que no llegó: 2', titos(r).live === 2, JSON.stringify(titos(r)));
  prueba('y lo que sí llegó, suma', r.f('Grey Goose 1L').live === 3);
}

grupo('corto o de más: manda la factura');
{
  const enlaces = [{ product_id: 't', item_name: "Tito's Vodka 1L" }];
  let r = live({ ahora: '2026-11-18T22:00:00Z', enlaces, facturas: [{ order_id: 'F1', product_id: 't', quantity: 3, unit_price: 20, invoice_date: '2026-11-17' }] });
  prueba('pidió 5, llegaron 3: 6', titos(r).live === 6, JSON.stringify(titos(r)));
  r = live({ ahora: '2026-11-18T22:00:00Z', enlaces, facturas: [{ order_id: 'F1', product_id: 't', quantity: 7, unit_price: 20, invoice_date: '2026-11-17' }] });
  prueba('pidió 5, llegaron 7: 10', titos(r).live === 10, JSON.stringify(titos(r)));
}

grupo('lo que no suma');
{
  const antes = Object.assign({}, ORD, { created_at: '2026-11-12T20:00:00Z', arrives_at: '2026-11-13T21:00:00Z' });
  let r = live({ ahora: '2026-11-18T22:00:00Z', ordenes: [antes] });
  prueba('un pedido que llegó antes del conteo (ya estaba en la estantería)', titos(r).live === 3);
  const sinHorario = Object.assign({}, ORD, { arrives_at: null });
  r = live({ ahora: '2026-11-18T22:00:00Z', ordenes: [sinHorario] });
  prueba('sin horario y sin factura: no suma (opción a)', titos(r).live === 3);
  r = live({ ahora: '2026-11-18T22:00:00Z', ordenes: [sinHorario], enlaces: [{ product_id: 't', item_name: "Tito's Vodka 1L" }],
    facturas: [{ order_id: 'F1', product_id: 't', quantity: 5, unit_price: 20, invoice_date: '2026-11-18' }] });
  prueba('sin horario, con su factura: suma lo facturado', titos(r).live === 8);
  const viejoSin = Object.assign({}, sinHorario, { created_at: '2026-11-10T20:00:00Z' });
  r = live({ ahora: '2026-11-18T22:00:00Z', ordenes: [viejoSin], enlaces: [{ product_id: 't', item_name: "Tito's Vodka 1L" }],
    facturas: [{ order_id: 'F1', product_id: 't', quantity: 5, unit_price: 20, invoice_date: '2026-11-11' }] });
  prueba('sin horario y colocado antes del conteo: no suma', titos(r).live === 3);
}

grupo('lo facturado sin pedido');
{
  const enlaces = [{ product_id: 'b', item_name: 'Baileys 1L' }];
  let r = live({ ahora: '2026-11-18T22:00:00Z', enlaces, facturas: [{ order_id: 'F9', product_id: 'b', quantity: 2, unit_price: 25, invoice_date: '2026-11-17' }] });
  prueba('suma si la factura es de después del día del conteo', r.f('Baileys 1L').live === 3 && r.f('Baileys 1L').movimiento);
  r = live({ ahora: '2026-11-18T22:00:00Z', enlaces, facturas: [{ order_id: 'F9', product_id: 'b', quantity: 2, unit_price: 25, invoice_date: '2026-11-15' }] });
  prueba('del mismo día del conteo, no (ya estaba al contar)', r.f('Baileys 1L').live === 1 && !r.f('Baileys 1L').movimiento);
}

grupo('la marca "Live" y el reparto');
{
  const r = live({ ahora: '2026-11-16T15:00:00Z' });
  prueba('sin nada sumado ni restado, no hay movimiento', r.filas.every(f => !f.movimiento));
  const src = leer('src/live-stock.js').replace(/\/\/.*$/gm, '');
  prueba('cuánto llegó sale del reparto de Sent, no de una copia', /RC\(\)\.repartir\(/.test(src) && !/const suelo|r\.usado = true/.test(src));
  prueba('no escribe nada', !/method:\s*'(POST|PATCH|DELETE|PUT)'/.test(src) && !/onHand\s*=[^=]/.test(src));
  const html = leer('index.html');
  const p = f => html.indexOf('src/' + f + '?v=');
  prueba('carga después de lo que usa', p('live-stock.js') > p('order-receipts.js') && p('live-stock.js') > p('toast-usage.js') && p('order-receipts.js') > 0);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
