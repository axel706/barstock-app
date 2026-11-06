#!/usr/bin/env node
/*
 * ── Un solo color para el estado de un producto ──────────────────────
 *
 * Tito's, 7.7 de un par de 18: la lista de Inventory lo pintaba en
 * ámbar y, al tocarlo, la ficha lo enseñaba en verde. Eran tres reglas
 * para lo mismo:
 *
 *   - la lista (`salud` en mobile-inventory.js): rojo ≤25 % del par,
 *     ámbar ≤60 %;
 *   - la ficha (`tono` en product-hero.js): rojo sólo en cero, ámbar
 *     ≤25 %;
 *   - el respaldo de la búsqueda (mobile-search.js), copia de la ficha.
 *
 * La de la lista es la buena. Ahora vive sólo en product-hero.js y las
 * pantallas la piden. Lo que se protege:
 *
 *   1. Los cortes: cero o ≤25 % rojo, ≤60 % ámbar, más verde, sin par
 *      gris.
 *   2. La lista y la ficha dicen el mismo color para el mismo producto.
 *   3. Ninguna pantalla vuelve a tener sus propios cortes.
 *
 *   node tools/test-tono-unico.js
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

const ROJO = '#f87171', AMBAR = '#fbbf24', VERDE = '#4ade80', GRIS = '#94a3b8';

const ITEMS = [
  // nombre, onHand, par, color esperado
  ['Agotado',        0,    18, ROJO],
  ['Por los suelos', 1.96, 18, ROJO],
  ['Justo un cuarto', 4.5, 18, ROJO],
  ['Titos',          7.7,  18, AMBAR],
  ['Justo 60',       10.8, 18, AMBAR],
  ['Bien',           12,   18, VERDE],
  ['Lleno',          20,   18, VERDE],
  ['Sin par',        5,    0,  GRIS],
  ['Sin par y cero', 0,    0,  ROJO]
];

function entorno() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.state = { master: ITEMS.map(([item, onHand, suggested]) => ({
    item, vendor: 'LOOP', onHand, suggested, value: 10, category: 'Vodka',
    code: '', itemNorm: item.toLowerCase(), toOrder: Math.max(0, suggested - onHand)
  })) };
  w.normalizeName = (s) => String(s || '').trim().toLowerCase();
  w.getVendorsForFilter = () => ['ALL', 'LOOP'];
  w.getVendorsWithUnknown = () => ['LOOP'];
  w.parAdjustments = new Map();
  new Function(leer('src/product-hero.js'))();
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, refrescarBadges() {} };
  new Function(leer('src/mobile-inventory.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'inventory';
  w.document.body.appendChild(host);
  def.mount(host);
  const todo = host.querySelector('[data-s="todo"]');
  if (todo) todo.click();
  return { w, host };
}

// El color con el que la lista pinta la cifra de cada producto.
function colorEnLista(w, host, nombre) {
  for (const b of host.querySelectorAll('.m-inv')) {
    if (b.querySelector('.m-inv-n').textContent.trim() === nombre) {
      const v = b.querySelector('.m-inv-v b').getAttribute('style') || '';
      const m = /color:\s*([^;]+)/.exec(v);
      return m ? m[1].trim() : null;
    }
  }
  return null;
}

grupo('los cortes, en un solo sitio');
{
  const { w } = entorno();
  const H = w.BarStockProductHero;
  for (const [n, oh, par, esp] of ITEMS) {
    const k = H.tono({ onHand: oh, suggested: par });
    prueba(n + ' (' + oh + '/' + par + ')', k.c === esp, 'dio ' + k.c + ', esperaba ' + esp);
  }
}

grupo('la lista y la ficha dicen lo mismo');
{
  const { w, host } = entorno();
  const H = w.BarStockProductHero;
  for (const r of w.state.master) {
    const enLista = colorEnLista(w, host, r.item);
    const enFicha = H.tono(r).c;
    prueba(r.item + ': lista ' + enLista + ' = ficha ' + enFicha, enLista === enFicha);
  }
}

grupo('ninguna pantalla con sus propios cortes');
{
  // Un corte de proporción (0.25, 0.6, 0.60) fuera de product-hero.js
  // es una segunda regla esperando a separarse de la primera.
  for (const f of ['src/mobile-inventory.js', 'src/mobile-search.js']) {
    const src = leer(f).replace(/\/\/[^\n]*/g, '');
    prueba(f + ' no tiene cortes propios', !/\b0?\.(25|6|60)\b/.test(src),
      (/[^\n]*\b0?\.(25|6|60)\b[^\n]*/.exec(src) || [''])[0].trim());
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
