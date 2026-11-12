#!/usr/bin/env node
/*
 * ── Home: las tres cifras ────────────────────────────────────────────
 *
 * Axel, 2026-11-12, sobre lámina. Sustituyen al par "Spent this cycle /
 * On the shelf". Lo que se protege:
 *
 *   1. Tres cifras, en este orden: On the shelf, Sold yesterday, Spent
 *      this cycle. Cada una con título, número, una línea y su botón.
 *   2. Sold yesterday es el Net sales de ayer (toast-sales), y vender
 *      más se pinta en VERDE (las clases .m-up/.m-down son del gasto y
 *      van al revés). Report abre el Full report.
 *   3. Sin Toast, no hay Sold yesterday: quedan dos.
 *   4. Spent this cycle dice desde cuándo; su botón Sync sincroniza
 *      MarginEdge y abre la hoja con lo que decía la tarjeta.
 *   5. Con algo que arreglar se pone ámbar, dice cuántos y el botón es
 *      Review, que abre la hoja SIN sincronizar.
 *   6. Las cifras van fuera del bloque que acopla band-dock (el saludo
 *      y la búsqueda): el header no cambia.
 *
 *   node tools/test-home-cifras.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = ms => new Promise(r => setTimeout(r, ms));

const HOY = '2026-11-11';
const sumar = (d, k) => new Date(new Date(d + 'T12:00:00Z').getTime() + k * 864e5).toISOString().slice(0, 10);

async function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  global.CustomEvent = w.CustomEvent;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  new Function(leer('src/events.js'))();
  new Function(leer('src/dialog.js'))();
  w.state = { master: [{ item: "Tito's", vendor: 'LOOP', onHand: 4, suggested: 8, value: 25 }] };
  global.state = w.state;
  w.parAdjustments = new Map();
  w.normalizeName = (s) => String(s || '').toLowerCase();
  new Function(leer('src/inventory-value.js'))();
  w.BarStockSpend = { compute: () => ({ now: { total: 3644 }, prev: { total: 4530 }, totalDelta: -886 }) };
  w.BarStockWeeklyCycle = { estado: () => 'done', resetAt: () => '2026-11-08T05:00:00Z', fmtDate: () => 'Nov 8',
    edadCiclo: () => 3 * 864e5, cicloViejo: () => false };
  w.BarStockMobileInvoices = { resumen: async () => ({ n: 6, unidades: 142, dinero: 3644,
    sueltas: o.sueltas || 0, ultima: '' }) };
  w.__syncs = 0;
  w.BarStockMarginEdgeConnect = { buscarFacturas: async () => { w.__syncs++; return { lineas: 0 }; } };
  // Toast: una semana con ayer (martes) a $3,500 y los martes de antes a $2,500.
  const dias = [], ventas = [];
  for (let k = 1; k <= 40; k++) {
    const f = sumar(HOY, -k);
    dias.push({ business_date: f, complete: true, closed: true });
    ventas.push({ business_date: f, toast_item_name: "Tito's", sales_category: 'Liquor', net: k === 1 ? 3500 : 2500, quantity: 10 });
  }
  w.BarStockToastUsage = { diaDeNegocio: () => HOY,
    ventasDesde: async () => (o.sinToast ? { dias: [], ventas: [], productos: [] } : { dias, ventas, productos: [] }) };
  new Function(leer('src/run-out.js'))();
  new Function(leer('src/toast-sales.js'))();
  w.__abrir = null;
  w.BarStockMobileSales = { abrir: (x) => { w.__abrir = x; } };
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {} };
  new Function(leer('src/mobile-home.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'home';
  w.document.body.appendChild(host);
  def.mount(host);
  await esperar(60);
  return { w, host };
}
const cifras = (h) => [...h.querySelectorAll('#mhCifras .m-cf-c')];
const cifra = (h, t) => cifras(h).find(c => new RegExp(t, 'i').test(c.querySelector('.m-cf-k').textContent));
const txt = (el) => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';

(async () => {

grupo('las tres cifras');
{
  const { w, host } = await entorno();
  const ks = cifras(host).map(c => txt(c.querySelector('.m-cf-k')));
  prueba('tres, en su orden', JSON.stringify(ks) === JSON.stringify(['On the shelf', 'Sold yesterday', 'Spent this cycle']), JSON.stringify(ks));
  prueba('ninguna sobra: el par viejo ya no está', !host.querySelector('.m-pair') && !host.querySelector('.m-stat'));
  prueba('cada una con su botón', cifras(host).every(c => !!c.querySelector('.m-cf-b')));

  const a = cifra(host, 'Sold yesterday');
  prueba('Sold yesterday: el Net sales de ayer', txt(a.querySelector('.m-cf-v')) === '$3,500', txt(a));
  const sube = a.querySelector('.m-cf-d span');
  prueba('vender más, en verde (+40% vs un martes normal)', !!sube && sube.classList.contains('m-cf-sube') && /↗ 40%/.test(sube.textContent),
    sube && sube.outerHTML);
  a.querySelector('.m-cf-b').click();
  prueba('Report abre el Full report', w.__abrir && w.__abrir.vista === 'dinero', JSON.stringify(w.__abrir));

  const g = cifra(host, 'Spent this cycle');
  prueba('Spent this cycle: el gasto y desde cuándo', txt(g.querySelector('.m-cf-v')) === '$3,644' && /since Nov 8/.test(txt(g)), txt(g));
  prueba('su botón es Sync', /Sync/.test(txt(g.querySelector('.m-cf-b'))));
  g.querySelector('.m-cf-b').click();
  await esperar(1300);
  const hoja = w.document.querySelector('#mSheet .m-cfh');
  prueba('Sync sincroniza MarginEdge', w.__syncs === 1, String(w.__syncs));
  prueba('y abre la hoja con lo que decía la tarjeta', !!hoja && /6 invoices · 142 units/.test(txt(hoja)) && /\$3,644/.test(txt(hoja)),
    txt(hoja));
  prueba('con Sync now y See invoices', !!hoja && /Sync now/.test(txt(hoja)) && /See invoices/.test(txt(hoja)));
}

grupo('con algo que arreglar');
{
  const { w, host } = await entorno({ sueltas: 2 });
  const g = cifra(host, 'Spent this cycle');
  prueba('ámbar', g.classList.contains('m-cf-am'));
  prueba('dice cuántos', /2 to fix/.test(txt(g)), txt(g));
  prueba('y el botón es Review', /^Review$/.test(txt(g.querySelector('.m-cf-b'))));
  g.querySelector('.m-cf-b').click();
  await esperar(20);
  prueba('Review abre la hoja sin sincronizar', !!w.document.querySelector('#mSheet .m-cfh') && w.__syncs === 0, String(w.__syncs));
  prueba('y la hoja dice qué', /2 lines have no bottle/.test(txt(w.document.querySelector('#mSheet .m-cfh'))));
}

grupo('sin Toast');
{
  const { host } = await entorno({ sinToast: true });
  prueba('dos cifras, sin Sold yesterday', cifras(host).length === 2 && !cifra(host, 'Sold yesterday') &&
    host.querySelector('#mhCifras').classList.contains('dos'));
}

grupo('el header no cambia');
{
  const { host } = await entorno();
  const bloque = host.querySelector('#mhSearch').closest('.m-body');
  prueba('las cifras van fuera del bloque del saludo y la búsqueda', !bloque.querySelector('#mhCifras'));
  prueba('y justo después de él', bloque.nextElementSibling && !!bloque.nextElementSibling.querySelector('#mhCifras'));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
