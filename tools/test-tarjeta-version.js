#!/usr/bin/env node
/*
 * ── La versión nueva: en More, no en el carrusel del Home ───────────
 *
 * Axel, 2026-11-09, había pedido una tarjeta de update en el carrusel
 * (la C, "como en la App Store"). El 2026-11-17: "eliminemos la tarjeta
 * de update del carrusel, sólo conservemos los datos de la versión y
 * todo como está en More".
 *
 * Lo que se protege:
 *   1. Con una versión nueva, el Home no saca ninguna tarjeta de update.
 *   2. No queda código de la tarjeta en el Home ni sus estilos.
 *   3. More sigue ofreciendo actualizar ("Update now") y lo que trae.
 *
 *   node tools/test-tarjeta-version.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const MIN = 60000;

function entorno(o) {
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' }).window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.state = { master: [{ item: 'A', vendor: 'ACME', onHand: 4, bottleSizeMl: 750, toOrder: 1 }] };
  w.BarStockWeeklyCycle = {
    estado: () => 'done', resetAt: () => '2026-11-02T08:00:00Z', fmtDate: () => 'Nov 2',
    edadCiclo: () => 2 * 86400000, cicloViejo: () => false, diasDeCalendario: () => 2,
    pausado: () => true, abandonado: () => false, hace: (ms) => Math.round(ms / MIN) + ' min'
  };
  w.BarStockZones = { lista: () => [], activas: () => false, paraPasada: () => '' };
  w.getActiveVendors = () => []; w.getOrderRowsForVendor = () => [];
  w.computeOrderSubtotal = () => 0; w.isRowPlaced = () => false;
  w.BARSTOCK_CONFIG = {}; w.BarStockToast = { show() {} };
  w.BarStockVersion = { nueva: () => o.nueva || null, actual: () => '20261109-100000', pendiente: () => o.nueva || null, _recargar() {} };
  w.BarStockVersionCenter = { fecha: () => 'Nov 9', visto: () => null, notasDe: async () => ['Uno'] };
  new Function(leer('src/mobile-home.js'))();
  return w;
}

grupo('1 · el Home, con una versión nueva');
{
  const w = entorno({ nueva: '20261117-141000' });
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.setAttribute('data-screen', 'home');
  w.document.body.appendChild(host);
  w.BarStockMobileHome.render(host);
  prueba('sin tarjeta de update', !host.querySelector('.m-hero-app') && !/UPDATE/.test(host.textContent), host.textContent.replace(/\s+/g, ' ').slice(0, 200));
  prueba('y las demás tarjetas siguen', host.querySelectorAll('.m-hero').length > 0);
}

grupo('2 · sin restos');
{
  const src = leer('src/mobile-home.js');
  prueba('ni la tarjeta ni sus notas en el Home', !/tarjetaVersion|pintarVersion|cargarNotasVersion|m-hero-app/.test(src));
  prueba('ni sus estilos', !/\.m-hero-app|\.m-app-(halo|top|ico|nm|build|up|l)\b/.test(leer('styles/mobile-app.css')));
}

grupo('3 · More sigue actualizando');
{
  const vc = leer('src/version-center.js');
  prueba('"Update now" y su recarga', /Update now/.test(vc) && /_recargar\(\)/.test(vc));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
