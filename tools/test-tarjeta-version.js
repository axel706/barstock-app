#!/usr/bin/env node
/*
 * ── La tarjeta de versión nueva, en el Home ─────────────────────────
 *
 * Axel, 2026-11-09: en lugar del aviso de 8 segundos de arriba, que se
 * perdía fácil, una tarjeta en el carrusel del Home. Sale sólo si hay una
 * versión para actualizar y se va al actualizar. Diseño que eligió sobre
 * lámina: "como en la App Store" con el brillo del ícono (la C): el
 * ícono de la app, "BarStock", "New version · <fecha>", UPDATE en
 * píldora, y lo que trae con palomitas.
 *
 * Lo que se protege:
 *   1. Sin versión nueva, no hay tarjeta.
 *   2. Con versión nueva, la tarjeta con su ícono, su fecha y lo que trae
 *      (tres notas como mucho; si hay más, "+ N more").
 *   3. UPDATE actualiza por el camino de siempre (la animación).
 *   4. Va primera, salvo que haya un conteo a medias: ése manda.
 *
 *   node tools/test-tarjeta-version.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const SRC = fs.readFileSync(path.join(RAIZ, 'src/mobile-home.js'), 'utf8');
const MIN = 60000;

// o: { nueva, notas, contando }
function entorno(o) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.state = { master: [{ item: 'A', vendor: 'ACME', onHand: 4, bottleSizeMl: 750, toOrder: 1 }] };
  w.BarStockWeeklyCycle = {
    estado: () => (o.contando ? 'counting' : 'done'),
    resetAt: () => '2026-11-02T08:00:00Z', fmtDate: () => 'Nov 2',
    edadCiclo: () => 2 * 86400000, cicloViejo: () => false, diasDeCalendario: () => 2,
    pausado: () => true, abandonado: () => false, hace: (ms) => Math.round(ms / MIN) + ' min'
  };
  w.BarStockCountSession = {
    progress: () => ({ counted: 1, total: 1 }), size: () => 1, activeMs: () => 5 * MIN,
    fmtDur: () => '5 min', updatedAt: () => new Date().toISOString(),
    cronoDesde: () => new Date().toISOString(), zonesUsed: () => [], missingRows: () => [],
    bottleProgress: () => ({ contadas: 3, faltan: 1, antes: 4 })
  };
  w.BarStockZones = { lista: () => [], activas: () => false, paraPasada: () => '' };
  w.getActiveVendors = () => []; w.getOrderRowsForVendor = () => [];
  w.computeOrderSubtotal = () => 0; w.isRowPlaced = () => false;
  w.BARSTOCK_CONFIG = {}; w.BarStockToast = { show() {} };
  w.__recargas = 0;
  w.BarStockVersion = {
    nueva: () => o.nueva || null, actual: () => o.actual || '20261109-100000',
    pendiente: () => o.nueva || o.pendiente || null,
    _recargar: () => { w.__recargas++; }
  };
  w.BarStockVersionCenter = {
    fecha: (b) => 'Nov 9 · 2:10 PM',
    visto: () => o.visto || null,
    notasDe: async (b, desde) => { w.__desde = desde; return o.notas || []; }
  };
  new Function(SRC)();
  return w;
}
function pintar(w) {
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.setAttribute('data-screen', 'home');
  w.document.body.appendChild(host);
  w.BarStockMobileHome.render(host);
  return host;
}
const tarjetas = (host) => [...host.querySelectorAll('.m-hero')];
const laDeVersion = (host) => host.querySelector('.m-hero-app');

(async () => {

grupo('1 · sin versión nueva, no hay tarjeta');
{
  const host = pintar(entorno({}));
  prueba('ninguna', !laDeVersion(host));
}

grupo('2 · con versión nueva');
{
  const w = entorno({ nueva: '20261109-141000', notas: ['Add a note for the vendor', 'What’s new shows when you open', 'You stay signed in all day'] });
  let host = pintar(w);
  await esperar(20);                       // las notas llegan después
  host = pintar(w);
  const c = laDeVersion(host);
  prueba('sale la tarjeta', !!c);
  prueba('con el ícono de la app', !!c && !!c.querySelector('img.m-app-ico') && /assets\/icons\//.test(c.querySelector('img.m-app-ico').getAttribute('src')));
  // Axel, 2026-11-09, sobre la primera de verdad: "BarStock Pro", sin
  // la fecha, y el build en una píldora.
  prueba('"BarStock Pro"', !!c && /BarStock Pro/.test((c.querySelector('.m-app-nm b') || {}).textContent || ''), c && c.textContent.replace(/\s+/g, ' '));
  prueba('sin la fecha', !!c && !/Nov 9/.test(c.textContent), c && c.textContent.replace(/\s+/g, ' '));
  prueba('el build en una píldora', !!c && (c.querySelector('.m-app-build') || {}).textContent === 'BUILD-20261109-141000', c && (c.querySelector('.m-app-build') || {}).textContent);
  const li = c ? [...c.querySelectorAll('.m-app-l li')].map(x => x.textContent.trim()) : [];
  prueba('con lo que trae', JSON.stringify(li) === JSON.stringify(['Add a note for the vendor', 'What’s new shows when you open', 'You stay signed in all day']), JSON.stringify(li));
  const b = c && c.querySelector('[data-go]');
  prueba('con UPDATE', !!b && /UPDATE/.test(b.textContent));
  if (b) b.click();
  prueba('UPDATE actualiza por el camino de siempre', w.__recargas === 1, String(w.__recargas));
}
{
  const w = entorno({ nueva: '20261109-141000', notas: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'] });
  pintar(w); await esperar(20);
  const li = [...laDeVersion(pintar(w)).querySelectorAll('.m-app-l li')].map(x => x.textContent.trim());
  prueba('con más de tres: dos y "+ 3 more"', JSON.stringify(li) === JSON.stringify(['Uno', 'Dos', '+ 3 more']), JSON.stringify(li));
}
{
  // Mientras llegan las notas (o si no se pudieron leer), una línea
  // honesta en vez de una lista vacía.
  const w = entorno({ nueva: '20261109-141000', notas: [] });
  const c = laDeVersion(pintar(w));
  prueba('sin notas todavía: una línea, no un hueco', !!c && /latest fixes and features/i.test(c.textContent), c && c.textContent.replace(/\s+/g, ' '));
}

grupo('2b · se queda aunque cierres y abras, hasta pulsar UPDATE');
{
  // Axel, 2026-11-09: la app ya cargó la nueva al abrir en frío, pero
  // quien la usa no pulsó UPDATE: la tarjeta sigue, con esa build y lo
  // que trae desde la última que vio.
  const w = entorno({ pendiente: '20261109-141000', actual: '20261109-141000', visto: '20261109-090000', notas: ['Uno'] });
  pintar(w); await esperar(20);
  const c = laDeVersion(pintar(w));
  prueba('sale la tarjeta sin versión en el servidor', !!c);
  prueba('con la build cargada en la píldora', !!c && (c.querySelector('.m-app-build') || {}).textContent === 'BUILD-20261109-141000');
  prueba('y lo que trae desde la última vista', w.__desde === '20261109-090000', String(w.__desde));
}

grupo('3 · dónde va');
{
  const host = pintar(entorno({ nueva: '20261109-141000' }));
  prueba('sin conteo a medias, la primera', tarjetas(host)[0] === laDeVersion(host));
}
{
  const host = pintar(entorno({ nueva: '20261109-141000', contando: true }));
  const t = tarjetas(host);
  prueba('con un conteo a medias, la segunda: el conteo manda', /Count/.test(t[0].textContent) && t[1] === laDeVersion(host), t.map(x => x.className).join(' | '));
}

grupo('4 · se lee del mismo tamaño que sus vecinas');
{
  // Axel, 2026-11-10: "la tarjeta de update es ligeramente más chica que
  // las otras". Medía lo mismo (318 × 198 px). Lo que pasaba es que su
  // borde iba a .3 de opacidad sobre un fondo casi negro, y las demás lo
  // llevan a .5 sobre color: la orilla se perdía y se leía más pequeña.
  // Eligió la A sobre lámina: el borde con la fuerza de las demás.
  const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const m = /\.m-hero-app\s*\{([^}]*)\}/.exec(css);
  const a = m && /border\s*:[^;]*rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(m[1]);
  prueba('el borde se ve tanto como el de las demás (.5 o más)', !!a && Number(a[1]) >= 0.5, a ? a[1] : 'sin borde');
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
