#!/usr/bin/env node
/*
 * ── Enlazar una factura con su orden, a mano ────────────────────────
 *
 * Las órdenes y las facturas casan solas por PRODUCTO dentro del
 * ciclo. Funciona casi siempre, y eso no se toca.
 *
 * Casi: en Crown se pide en el portal de LOOP, se va a la tienda, y la
 * factura llega a nombre de Fine Wine & Good Spirits. Son el mismo
 * pedido y la app no tiene cómo saberlo — la orden decía "waiting" con
 * la factura delante.
 *
 * Él lo pidió así hace días —"una opción de linkear un invoice con una
 * orden, para no alterar cómo hacen match ahora"— y lo dejé para
 * después. Van dos veces que le muerde.
 *
 * Lo que se protege:
 *
 *   1. Un enlace a mano GANA sobre todas las reglas: ni el suelo de
 *      fecha ni otra orden más nueva se lo pueden quitar.
 *   2. Reservado no es de nadie más. Sin esto el enlace serviría de
 *      poco: la orden más nueva pasa primero y se lo lleva.
 *   3. Lo que NO está enlazado sigue casando exactamente igual.
 *   4. Sin la tabla —su SQL se corre a mano— nada se rompe.
 *
 *   node tools/test-enlace-orden.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const CICLO = '2026-10-26T04:00:00.000Z';

// Dos órdenes de LOOP en la misma semana, la pequeña más nueva.
const ORDENES = [
  { id: 7, app_order_id: 'a7', vendor: 'LOOP', po_number: 'CT-0207',
    created_at: '2026-10-26T18:00:00.000Z', subtotal: 47.97, status: 'sent' },
  { id: 4, app_order_id: 'a4', vendor: 'LOOP', po_number: 'CT-0204',
    created_at: '2026-10-26T15:00:00.000Z', subtotal: 1981.49, status: 'sent' }
];
const LINEAS = [
  { vendor_order_id: 7, item_name: 'Tito’s Vodka', quantity: 1, unit_price: 47.97 },
  { vendor_order_id: 4, item_name: 'Tito’s Vodka', quantity: 6, unit_price: 29.99 }
];
// La factura es de Fine Wine, no de LOOP, y es del 25 — ANTES del
// ciclo: los dos motivos por los que el automático la deja fuera.
const FACTURAS = [
  { order_id: 'F-1', product_id: 'p1', quantity: 6, unit_price: 27.5,
    invoice_date: '2026-10-25', invoice_number: '189652844',
    vendor_name: 'FINE WINE & GOOD SPIRITS' }
];
const ENLACES = [{ product_id: 'p1', item_name: 'Tito’s Vodka' }];

// o: { link: 'F-1'->4, sinTabla }
function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.state = { master: [], orderHistory: [] };
  w.normalizeName = (s) => String(s || '').trim().toLowerCase()
    .replace(/[‘’']/g, '');
  w.scrollTo = () => {};
  w.BarStockToast = { show() {} };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };
  w.BarStockCycle = { startedAt: () => new Date(CICLO), load: async () => {} };
  w.BarStockMobile = { register() {}, ir() {}, refrescarBadges() {},
    cabecera: () => '', alVolver: () => {} };

  global.fetch = w.fetch = async (url) => {
    const u = String(url);
    const ok = (filas) => ({ ok: true, headers: { get: () => '0-0/' + filas.length },
      json: async () => filas });
    if (/invoice_order_links/.test(u)) {
      if (o.sinTabla) return { ok: false, json: async () => ({ message: 'relation does not exist' }) };
      return ok(o.link ? [{ order_id: 'F-1', vendor_order_id: o.link }] : []);
    }
    if (/vendor_orders/.test(u)) return ok(ORDENES);
    if (/vendor_order_items/.test(u)) return ok(LINEAS);
    if (/marginedge_invoice_lines/.test(u)) return ok(FACTURAS);
    if (/marginedge_links/.test(u)) return ok(ENLACES);
    return ok([]);
  };

  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-history.js'), 'utf8'))();
  return w;
}

// Devuelve { 'CT-0207': 'waiting' | 'all in' | ... } leido del DOM,
// que es lo que de verdad ve él en la tarjeta.
async function estados(o) {
  const w = entorno(o);
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'history';
  w.document.body.appendChild(host);
  await w.BarStockMobileHistory.montar(host);

  const m = {};
  for (const c of host.querySelectorAll('.m-hcard')) {
    const po = (c.querySelector('.m-hcard-m') || {}).textContent || '';
    const et = c.querySelector('[class*="m-hs-"]');
    const k = (po.match(/CT-\d+/) || [po])[0];
    m[k] = et ? et.textContent.trim() : '';
  }
  return m;
}

(async () => {

grupo('sin enlace, la factura de Fine Wine no cuenta para nadie');
{
  // Es de otro proveedor Y de antes del ciclo. El automático la deja
  // fuera, que es exactamente lo que él veía.
  const e = await estados();
  prueba('la grande dice waiting', e['CT-0204'] === 'waiting', JSON.stringify(e));
  prueba('y la pequeña también', e['CT-0207'] === 'waiting', JSON.stringify(e));
}

grupo('enlazada a mano, la grande la cuenta');
{
  const e = await estados({ link: 4 });
  prueba('CT-0204 ya no está esperando', e['CT-0204'] !== 'waiting', JSON.stringify(e));
  // Seis pedidas, seis llegadas.
  prueba('y cuadra', e['CT-0204'] === 'all in', JSON.stringify(e));
}

grupo('reservado es de esa orden y de nadie más');
{
  // CT-0207 es MÁS NUEVA y pasa primero. Sin la reserva se llevaría el
  // recibo y la grande seguiría esperando — el enlace no serviría.
  const e = await estados({ link: 4 });
  prueba('la más nueva no se lo lleva', e['CT-0207'] === 'waiting', JSON.stringify(e));
}

grupo('y al revés, enlazada a la pequeña');
{
  const e = await estados({ link: 7 });
  prueba('CT-0207 la cuenta', e['CT-0207'] !== 'waiting', JSON.stringify(e));
  prueba('y la grande se queda esperando', e['CT-0204'] === 'waiting', JSON.stringify(e));
}

grupo('sin la tabla no se rompe nada');
{
  const e = await estados({ sinTabla: true });
  prueba('las dos siguen contestando', !!e['CT-0204'] && !!e['CT-0207'], JSON.stringify(e));
  prueba('con el automático de siempre', e['CT-0204'] === 'waiting', JSON.stringify(e));
}

grupo('el enlace gana sobre el suelo de fecha, no lo borra');
{
  const src = fs.readFileSync(path.join(RAIZ, 'src/mobile-history.js'), 'utf8');
  // La forma importa: si el suelo se comprueba IGUAL para los
  // reservados, el enlace no sirve para una factura anterior al
  // ciclo — que es justo el caso.
  prueba('reservado salta el suelo',
    /if \(r\.reservado\) \{[\s\S]{0,200}\} else if \(r\.fecha && r\.fecha < suelo\)/.test(src));
  prueba('y un reservado ajeno se descarta',
    /r\.reservado !== String\(o\.id\)/.test(src));
  // Lo que NO puede pasar: que se haya tocado el criterio de los que
  // no llevan enlace.
  prueba('sin enlace, el criterio de siempre',
    /continue;\s*\/\/ sin enlace, el criterio de siempre/.test(src));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
