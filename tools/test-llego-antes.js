#!/usr/bin/env node
/*
 * ── "It arrived before the count": enlazar la factura a una orden de un
 *    ciclo anterior (Axel, 2026-11-26) ──
 *
 * Antes ese botón creaba un TRANSFER "antes del conteo" desde otra
 * locación, y Axel lo corrigió: "ese botón debería permitirme linkear ese
 * invoice con una orden de ciclos anteriores". El caso: la mercancía llegó
 * con una orden de la semana pasada, se contó el domingo, y su factura
 * entró después. Sin enlace, el LIVE la suma otra vez.
 *
 *   1. A quién va: el reparto empieza por la orden más NUEVA, así que sin
 *      enlace la factura de la orden vieja se la queda la de este ciclo
 *      del mismo producto (que dice "llegó" sin haber llegado) y la vieja
 *      sigue "waiting". Enlazada, es de la vieja.
 *   2. El botón abre la lista de órdenes de ANTES del ciclo y enlaza con
 *      la misma tabla que "Link to an order"; ya no crea transfers.
 *
 *   node tools/test-llego-antes.js
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
const T = (s) => new Date(s).getTime();

grupo('1. A quién va la factura: sin enlace se la lleva la orden de ESTE ciclo');
{
  const w = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
  w.eval(leer('src/order-receipts.js'));
  const RC = w.BarStockOrderReceipts;
  // Conteo: domingo 15 a las 9 PM de Nueva York; el ciclo abre ahí.
  const CONTEO = T('2026-11-16T02:00:00Z');
  // La orden de la semana pasada (llegó el jueves 12 y se contó el
  // domingo) y la de este ciclo, del mismo producto, que aún no llega.
  const VIEJA = { id: 'v-old', created_at: '2026-11-11T15:00:00Z' };
  const NUEVA = { id: 'v-new', created_at: '2026-11-17T15:00:00Z' };
  const LIN = [{ vendor_order_id: 'v-old', item_name: "Tito's Vodka 1L", quantity: 4, unit_price: 20 },
               { vendor_order_id: 'v-new', item_name: "Tito's Vodka 1L", quantity: 4, unit_price: 20 }];
  // La factura de la orden vieja entró el martes 17.
  const FAC = [{ order_id: 'FW-1', product_id: 'p1', quantity: 4, unit_price: 20, invoice_date: '2026-11-17', invoice_number: '2716029' }];
  const ENL = [{ product_id: 'p1', item_name: "Tito's Vodka 1L" }];
  const reparto = (manuales) => {
    const r = RC.repartir({ recortadas: [NUEVA, VIEJA], lineas: LIN, recibos: RC.recibosDe(FAC, ENL, new Map(manuales), []), inicioCiclo: CONTEO });
    return { nueva: r.get('v-new')[0].recibido, vieja: r.get('v-old')[0].recibido };
  };
  const sin = reparto([]), con = reparto([['FW-1', 'v-old']]);
  prueba('sin enlace, la de este ciclo dice que ya le llegaron 4 (no es suya) y la vieja nada', sin.nueva === 4 && sin.vieja === 0, JSON.stringify(sin));
  prueba('enlazada a la orden de antes, es de ella: la vieja 4, la de este ciclo sigue esperando', con.vieja === 4 && con.nueva === 0, JSON.stringify(con));
}

grupo('2. El botón: órdenes de ciclos anteriores, sin transfer');
{
  const mi = leer('src/mobile-invoices.js');
  const w = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
  w.eval(mi);
  const I = w.BarStockMobileInvoices;
  prueba('hay una sola regla para qué órdenes salen', !!(I && I.ordenesPara));
  if (I && I.ordenesPara) {
    const desde = T('2026-11-16T02:00:00Z');
    const ords = [{ id: 'a', created_at: '2026-11-17T10:00:00Z' }, { id: 'b', created_at: '2026-11-11T15:00:00Z' }, { id: 'c', created_at: '2026-11-04T15:00:00Z' }];
    const antes = I.ordenesPara('antes', ords, desde).map(o => o.id).join(',');
    prueba('"It arrived before the count" ofrece sólo las de ANTES del ciclo, la más nueva primero', antes === 'b,c', antes);
    prueba('"Link to an order" sigue ofreciendo todas', I.ordenesPara('todas', ords, desde).length === 3);
  }
  prueba('el botón abre esa lista (no crea un transfer)', /#miAntes'\);\s*\n\s*if \(ant\) ant\.onclick = \(\) => \{ _eligiendoOrden = 'antes';/.test(mi) && !/TR\.crear\(/.test(mi) && !/function llegoAntes/.test(mi));
  prueba('y enlaza con la misma tabla que "Link to an order"', /guardarEnlaceOrden\(_abierta, b\.dataset\.ord\)/.test(mi));
  prueba('la lista dice qué hace: "already on the shelf when you counted"', /already on the shelf when you counted/.test(mi));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
