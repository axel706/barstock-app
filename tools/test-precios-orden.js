#!/usr/bin/env node
/*
 * ── "N prices are different on this invoice" ───────────────────────
 *
 * La tarjeta del detalle de una orden que propone actualizar precios.
 * Su botón cambia el precio del CATÁLOGO (inventory_items.value), no el
 * de la orden. Así que la pregunta que hace la tarjeta es "¿tu catálogo
 * dice lo mismo que esta factura?", y tiene que contestarla contra el
 * catálogo.
 *
 * Lo que se protege:
 *   1. Se compara con el precio de tu catálogo AHORA, no con el que tenía
 *      la botella cuando se hizo la orden. Comparándolo con el de la
 *      orden, la tarjeta no se iba nunca: actualizabas, salías, volvías,
 *      y seguía pidiendo lo mismo.
 *   2. Si el catálogo ya dice lo de la factura, no hay tarjeta.
 *   3. Se actualiza el artículo del catálogo por SU nombre exacto.
 *   4. Al terminar se relee el catálogo y la tarjeta desaparece.
 *
 *   node tools/test-precios-orden.js
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
const esperar = ms => new Promise(r => setTimeout(r, ms || 0));

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

  new Function(fs.readFileSync(path.join(RAIZ, 'src/order-receipts.js'), 'utf8'))();
  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-history.js'), 'utf8'))();
  return w;
}

// Devuelve { 'CT-0207': 'waiting' | 'all in' | ... } leido del DOM,
// que es lo que de verdad ve él en la tarjeta.

// La orden CT-0204 se pidió con Tito's a 29.99. La factura (enlazada a
// mano a esa orden) dice 27.50.
async function detalle(o) {
  o = o || {};
  const w = entorno({ link: 4 });
  w.state.master = o.master || [];
  w.__aplicados = [];
  w.__relecturas = 0;
  w.BarStockMarginEdgePurchases = {
    aplicarPrecios: async (cambios) => {
      w.__aplicados.push(cambios);
      return { ok: cambios.length, problemas: [] };
    }
  };
  w.BarStockInventoryRealtime = {
    // Como el de verdad: vuelve a leer el catálogo. Aquí, el que ya
    // tiene el precio nuevo.
    recargar: async () => { w.__relecturas++; if (o.despues) w.state.master = o.despues; }
  };
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'history';
  w.document.body.appendChild(host);
  await w.BarStockMobileHistory.montar(host);
  const card = Array.from(host.querySelectorAll('.m-hcard'))
    .find(c => /CT-0204/.test(c.textContent));
  card.click();
  return { w, host };
}
const tarjeta = (host) => host.querySelector('.m-hprec');

(async () => {

grupo('se compara con tu catalogo, no con el precio de la orden');
{
  const { host } = await detalle({ master: [{ item: 'Tito’s Vodka', value: 29.99 }] });
  prueba('con el catalogo a 29.99, la tarjeta sale', !!tarjeta(host));
  prueba('y dice de donde a donde', tarjeta(host) && /\$29\.99 → \$27\.5/.test(tarjeta(host).textContent),
    tarjeta(host) && tarjeta(host).textContent.replace(/\s+/g, ' '));
}
{
  // Lo que pasaba: actualizabas, salías y volvías, y la tarjeta seguía.
  // El catálogo ya dice 27.50; la orden sigue diciendo 29.99, y debe.
  const { host } = await detalle({ master: [{ item: 'Tito’s Vodka', value: 27.5 }] });
  prueba('con el catalogo ya al precio de la factura, no hay tarjeta', !tarjeta(host),
    tarjeta(host) && tarjeta(host).textContent.replace(/\s+/g, ' '));
}
{
  const { host } = await detalle({ master: [{ item: 'Tito’s Vodka', value: 31 }] });
  prueba('lo que se enseña es tu precio de ahora', tarjeta(host) && /\$31 → \$27\.5/.test(tarjeta(host).textContent),
    tarjeta(host) && tarjeta(host).textContent.replace(/\s+/g, ' '));
}
{
  // Un artículo que ya no está en el catálogo no tiene precio que
  // actualizar: proponerlo sería un botón que no hace nada.
  const { host } = await detalle({ master: [] });
  prueba('sin el articulo en el catalogo, no se propone', !tarjeta(host));
}

grupo('se actualiza el articulo del catalogo, por su nombre');
{
  // El catálogo lo escribe con apóstrofo recto y la orden con el curvo.
  // Son el mismo artículo; el PATCH tiene que ir con el nombre que hay
  // en el catálogo o no encuentra la fila.
  const { w, host } = await detalle({
    master: [{ item: "Tito's Vodka", value: 29.99 }],
    despues: [{ item: "Tito's Vodka", value: 27.5 }]
  });
  host.querySelector('#mhPrec').click();
  await esperar(20);
  const c = (w.__aplicados[0] || [])[0] || {};
  prueba('con el nombre del catalogo', c.item === "Tito's Vodka", JSON.stringify(c));
  prueba('al precio de la factura', c.precio === 27.5, String(c.precio));
  prueba('y apuntando el de antes del catalogo', c.antes === 29.99, String(c.antes));
  prueba('relee el catalogo al terminar', w.__relecturas === 1, String(w.__relecturas));
  prueba('y la tarjeta se va sin salir de la orden', !tarjeta(host),
    tarjeta(host) && tarjeta(host).textContent.replace(/\s+/g, ' '));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
