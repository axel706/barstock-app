#!/usr/bin/env node
/*
 * ── "Sold in Toast" en la ficha del producto ─────────────────────────
 *
 * Axel, 2026-11-12, opción A sobre lámina, SÓLO BOTELLAS: el dinero de
 * un producto no se puede sacar de sus cócteles (ni de los mixers que no
 * se cuentan), así que la ficha no tiene vista $.
 *
 *   1. Los siete días cerrados hasta ayer, el de ayer marcado.
 *   2. La raya de "un día normal" sale de las medianas de run-out (las
 *      mismas con que se calcula cuándo se acaba), no de otro cálculo.
 *   3. "Since the count" es lo vendido que resta el LIVE.
 *   4. Lo que Toast no vende y no tuvo ventas no lleva el bloque.
 *   5. Ni rastro de dinero.
 *
 *   node tools/test-ficha-ventas.js
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

const HOY = '2026-11-11';   // miércoles
const sumar = (d, k) => new Date(new Date(d + 'T12:00:00Z').getTime() + k * 864e5).toISOString().slice(0, 10);
// Medianas por día de la semana (domingo = 0): los martes, 2.
const MED = [1, 0, 2, 1, 1, 1.5, 1.5];

async function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  new Function(leer('src/bottle-profiles.js'))();
  const filaLive = (producto, contado, vendido, med) => ({ producto, contado, llego: 0, vendido,
    live: contado - vendido, movimiento: vendido !== 0, de: [], llegadas: [], viene: [], med, agota: null, enDias: null });
  w.BarStockRunOut = { mediana: (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)],
    ahora: async () => (o.contando ? { estado: 'contando' } : { estado: 'listo', hoy: HOY,
      filas: [filaLive("Tito's Vodka 1L", 8, 0.9, MED), filaLive('Guinness Keg', 1, 0, null)] }) };
  new Function(leer('src/live-cache.js'))();
  const porDia = {};
  for (let k = 1; k <= 7; k++) porDia[sumar(HOY, -k)] = k === 1 ? 3 : 1;
  const dias = [];
  for (let k = 1; k <= 30; k++) dias.push({ business_date: sumar(HOY, -k), complete: true, closed: true });
  w.BarStockToastUsage = { diaDeNegocio: () => HOY,
    ventasDesde: async () => ({ dias, productos: [{ producto: "Tito's Vodka 1L", porDia }],
      ventas: [{ business_date: sumar(HOY, -1), toast_item_name: "Tito's", sales_category: 'Liquor', net: 300, quantity: 20 }] }) };
  new Function(leer('src/toast-sales.js'))();
  new Function(leer('src/product-hero.js'))();
  const m = (item) => ({ item, vendor: 'LOOP', code: '', category: 'Liquor', onHand: 8, suggested: 10, value: 22, bottleShape: 'vodka', bottleSizeMl: 1000 });
  w.state = { master: [m("Tito's Vodka 1L"), m('Guinness Keg')] };
  w.normalizeName = (s) => String(s || '').toLowerCase();
  w.parAdjustments = new Map();
  w.BarStockZones = { lista: () => [], cargar: async () => {}, activas: () => false, donde: async () => null };
  w.BarStockProductWeeks = { semanas: async () => [], rumbo: () => null };
  await w.BarStockLiveCache.cargar();
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {} };
  new Function(leer('src/mobile-search.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'search';
  w.document.body.appendChild(host);
  def.mount(host);
  return { w, host };
}
async function ficha(e, q, nombre) {
  const i = e.host.querySelector('#msInput'); i.value = q; i.oninput();
  await esperar(10);
  [...e.host.querySelectorAll('#msList .m-res')].find(t => t.textContent.includes(nombre)).click();
  await esperar(40);
  return e.w.document.querySelector('#mSheet #msVentas');
}

(async () => {

grupo('la semana del producto, en botellas');
{
  const e = await entorno();
  const v = await ficha(e, 'tito', "Tito's");
  const barras = v ? v.querySelectorAll('.m-ts-b') : [];
  prueba('siete barras', barras.length === 7, String(barras.length));
  prueba('la de ayer (martes) marcada', barras.length && barras[6].classList.contains('on') &&
    v.querySelectorAll('.m-ts-d span')[6].textContent === 'Tue');
  prueba('con la raya de lo normal en cada día', v.querySelectorAll('.m-ts-b u').length === 7);
  const t = v.querySelector('.m-vt-s').textContent.replace(/\s+/g, ' ').trim();
  prueba('desde el conteo: lo vendido del LIVE', /Since the count 0\.9 btl/.test(t), t);
  prueba('ayer contra un martes normal (la mediana de run-out)', /yesterday 3 \(usual Tue 2\)/.test(t), t);
  prueba('sin dinero', !/\$/.test(v.textContent) && !v.querySelector('[data-v]'), v.textContent.replace(/\s+/g, ' '));
}

grupo('lo que Toast no vende');
{
  const e = await entorno();
  const v = await ficha(e, 'guinness', 'Guinness');
  prueba('sin ventas ni Toast: sin bloque', !!v && v.innerHTML.trim() === '', v && v.innerHTML);
}

grupo('con un conteo activo');
{
  const e = await entorno({ contando: true });
  const v = await ficha(e, 'tito', "Tito's");
  const t = v && v.querySelector('.m-vt-s') ? v.querySelector('.m-vt-s').textContent.replace(/\s+/g, ' ').trim() : '';
  prueba('las ventas siguen, sin "since the count"', /^yesterday 3/.test(t), t);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
