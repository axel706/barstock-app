#!/usr/bin/env node
/*
 * ── Orders → Sent: la llegada de cada pedido ─────────────────────────
 *
 * Axel, 2026-11-11, opción A de la lámina. Lo que se protege:
 *   1. Antes de su hora de llegada, la tarjeta dice "Arrives …" y la
 *      etiqueta "coming", no "waiting": todavía no se espera factura.
 *   2. Ya llegado y sin factura: "waiting", con "Arrived …".
 *   3. Con factura, el estado de siempre y nada de llegada.
 *   4. Colocado en el ciclo anterior y llega en éste: la nota morada
 *      "Placed … · last cycle", y sale en "This cycle" (cada pedido es
 *      del ciclo en el que LLEGA).
 *   5. Sin la migración 033, Sent no se queda vacío: se pide sin la
 *      columna.
 *
 *   node tools/test-sent-llegada.js
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

const AHORA = Date.now();
const H = 3600e3;
const iso = (t) => new Date(t).toISOString();
// El ciclo abrió hace 2 días.
const CICLO = AHORA - 48 * H;

const ORDENES = [
  // Viene: llega mañana.
  { id: 1, app_order_id: 'a1', vendor: 'SOUTHERN', po_number: 'CT-0230', created_at: iso(AHORA - 24 * H), subtotal: 100, arrives_at: iso(AHORA + 24 * H) },
  // Llegó hace una hora, sin factura.
  { id: 2, app_order_id: 'a2', vendor: 'LOOP', po_number: 'CT-0229', created_at: iso(AHORA - 40 * H), subtotal: 100, arrives_at: iso(AHORA - H) },
  // Colocado ANTES del ciclo y llega en éste (pasado mañana).
  { id: 3, app_order_id: 'a3', vendor: 'WINE MERCHANT', po_number: 'CT-0231', created_at: iso(CICLO - 72 * H), subtotal: 100, arrives_at: iso(AHORA + 48 * H) },
  // Con factura: todo llegó.
  { id: 4, app_order_id: 'a4', vendor: 'BREAKTHRU', po_number: 'CT-0228', created_at: iso(AHORA - 30 * H), subtotal: 100, arrives_at: iso(AHORA - 20 * H) },
  // De antes de la 033: sin llegada.
  { id: 5, app_order_id: 'a5', vendor: 'LOOP', po_number: 'CT-0200', created_at: iso(AHORA - 36 * H), subtotal: 50, arrives_at: null }
];
const LINEAS = [1, 2, 3, 4, 5].map(id => ({ vendor_order_id: id, item_name: id === 4 ? 'Grey Goose' : 'Item ' + id, quantity: 2, unit_price: 25 }));
const FACTURAS = [{ order_id: 'F-1', product_id: 'p1', quantity: 2, unit_price: 25, invoice_date: iso(AHORA - 20 * H).slice(0, 10), invoice_number: '1', vendor_name: 'BREAKTHRU' }];
const ENLACES = [{ product_id: 'p1', item_name: 'Grey Goose' }];

function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.state = { master: [], orderHistory: [] };
  w.normalizeName = (s) => String(s || '').trim().toLowerCase();
  w.scrollTo = () => {};
  w.BarStockToast = { show() {} };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };
  w.BarStockCycle = { startedAt: () => new Date(CICLO), load: async () => {} };
  w.BarStockMobile = { register() {}, ir() {}, refrescarBadges() {}, cabecera: () => '', alVolver: () => {} };
  w.__urls = [];
  w.fetch = async (url) => {
    const u = String(url);
    w.__urls.push(u);
    const r = (filas) => ({ ok: true, status: 200, headers: { get: () => '0-0/' + filas.length }, json: async () => filas, text: async () => JSON.stringify(filas) });
    if (/vendor_orders/.test(u)) {
      if (o.sin033 && /arrives_at/.test(u)) return { ok: false, status: 400, json: async () => ({}), text: async () => '{"code":"42703","message":"column vendor_orders.arrives_at does not exist"}' };
      return r(o.sin033 ? ORDENES.map(x => { const y = Object.assign({}, x); delete y.arrives_at; return y; }) : ORDENES);
    }
    if (/vendor_order_items/.test(u)) return r(LINEAS);
    if (/marginedge_invoice_lines/.test(u)) return r(FACTURAS);
    if (/marginedge_links/.test(u)) return r(ENLACES);
    return r([]);
  };
  // La que reconoce "falta la columna" la deja orders-cloud.js; aquí la
  // misma regla, sin cargar todo ese módulo.
  w.BarStockOrdersFaltaColumna = (t) => /arrives_at|is_quick/.test(String(t)) && /column|42703|PGRST204/i.test(String(t));
  w.eval(leer('src/vendor-delivery.js'));
  w.eval(leer('src/order-receipts.js'));
  w.eval(leer('src/mobile-history.js'));
  return w;
}

async function tarjetas(o) {
  const w = entorno(o);
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'history';
  w.document.body.appendChild(host);
  await w.BarStockMobileHistory.montar(host);
  const m = {};
  for (const c of host.querySelectorAll('.m-hcard')) {
    const t = c.textContent;
    const k = (t.match(/CT-\d+/) || ['?'])[0];
    m[k] = { txt: t, tag: ((c.querySelector('[class*="m-hs-"]') || {}).textContent || '').trim(),
      arr: !!c.querySelector('.m-hcard-arr'), leg: (c.querySelector('.m-hcard-leg') || {}).textContent || '' };
  }
  return { w, host, m };
}

(async () => {

grupo('la llegada en cada tarjeta');
{
  const { m, host } = await tarjetas();
  prueba('antes de llegar: "coming", no "waiting"', m['CT-0230'] && /coming/i.test(m['CT-0230'].tag), m['CT-0230'] && m['CT-0230'].tag);
  prueba('con su línea "Arrives …" en hora de Nueva York', m['CT-0230'] && m['CT-0230'].arr && /Arrives \w{3} \w{3} \d+ · \d+:\d{2} (AM|PM)/.test(m['CT-0230'].txt));
  prueba('mientras viene, la fecha de colocación no estorba', m['CT-0230'] && !/CT-0230 · [A-Za-z]{3} \d+ ·/.test(m['CT-0230'].txt) && /CT-0230 · \d+ item/.test(m['CT-0230'].txt), m['CT-0230'] && m['CT-0230'].txt);
  prueba('ya llegado y sin factura: "waiting" con "Arrived …"', m['CT-0229'] && /waiting/i.test(m['CT-0229'].tag) && /Arrived /.test(m['CT-0229'].txt) && !m['CT-0229'].arr);
  prueba('con factura: su estado, sin línea de llegada', m['CT-0228'] && /all in/i.test(m['CT-0228'].tag) && !/Arriv/.test(m['CT-0228'].txt), m['CT-0228'] && m['CT-0228'].tag);
  prueba('un pedido de antes de esto: como siempre', m['CT-0200'] && /waiting/i.test(m['CT-0200'].tag) && !/Arriv/.test(m['CT-0200'].txt));
  prueba('colocado en el ciclo anterior: la nota morada', m['CT-0231'] && /Placed .* · last cycle/.test(m['CT-0231'].leg), m['CT-0231'] && m['CT-0231'].leg);
  prueba('y sólo él la lleva', ['CT-0230', 'CT-0229', 'CT-0228', 'CT-0200'].every(k => m[k] && !m[k].leg));
  prueba('sale en el ciclo de su llegada, "This cycle"', !!m['CT-0231']);
  // El filtro "Waiting" cuenta sólo lo que ya llegó y espera factura.
  const fuente = leer('src/mobile-history.js');
  prueba('"Waiting" no cuenta lo que todavía viene', /waiting: enBusca\.filter\(o => o\.estado === 'waiting' && !viene\(o\)\)/.test(fuente) &&
    /_filtro === 'waiting' && viene\(o\)/.test(fuente));
}

grupo('sin la migración 033');
{
  const { m, w } = await tarjetas({ sin033: true });
  prueba('Sent no se queda vacío', Object.keys(m).length === 5, Object.keys(m).join(','));
  prueba('se pidió otra vez sin la columna', w.__urls.some(u => /vendor_orders/.test(u) && !/arrives_at/.test(u)));
  prueba('y no inventa llegadas', Object.values(m).every(x => !/Arriv/.test(x.txt)));
}

grupo('el reparto vive en un solo sitio');
{
  // Sent y el LIVE tienen que decir lo mismo sobre cuánto llegó: el
  // reparto factura ↔ pedido está en order-receipts.js y Sent lo usa.
  const h = leer('src/mobile-history.js');
  prueba('Sent no tiene su propio reparto', !/const suelo =/.test(h) && !/r\.usado = true/.test(h) && /RC\.repartir\(/.test(h));
  const html = leer('index.html');
  const p = f => html.indexOf('src/' + f + '?v=');
  prueba('el módulo carga antes que Sent', p('order-receipts.js') > 0 && p('order-receipts.js') < p('mobile-history.js'));
}

grupo('la CSS');
{
  const css = leer('styles/mobile-app.css');
  prueba('"coming" tiene su color', /\.m-hs-viene\s*\{/.test(css));
  prueba('la línea de llegada y la nota', /\.m-hcard-arr\s*\{/.test(css) && /\.m-hcard-leg\s*\{/.test(css));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
