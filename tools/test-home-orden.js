#!/usr/bin/env node
/*
 * ── El carrusel del Home sigue la semana ─────────────────────────────
 *
 * Axel, 2026-11-13: "domingo por la tarde, después de las 4 pm, tarjeta
 * de ciclo; se cierra el ciclo y tarjeta de órdenes se muestra primero;
 * órdenes colocadas y se muestra running out primero por el resto de la
 * semana". Y la de update, primero siempre. Lo que se protege:
 *
 *   1. El corte es el último domingo a las 4:00 PM de NUEVA YORK, con
 *      horario de verano o sin él.
 *   2. Antes de cerrar un conteo después del corte: el ciclo. Cerrado:
 *      las órdenes; sin órdenes: Running out; sin nada que se acabe: el
 *      ciclo.
 *   3. Un conteo hecho el lunes cuenta igual (el ciclo sigue primero
 *      hasta cerrarlo).
 *   4. En el Home de verdad: la primera tarjeta es la que dice la regla,
 *      y la de update va delante de todo.
 *
 *   node tools/test-home-orden.js
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

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
global.window = dom.window; global.document = dom.window.document;
new Function(leer('src/home-orden.js'))();
const HO = window.BarStockHomeOrden;
const T = (iso) => Date.parse(iso);

grupo('el corte: el domingo a las 4 PM de Nueva York');
{
  // Nov 2026 (sin horario de verano): 4 PM NY = 21:00 UTC.
  prueba('viernes 13 → domingo 8 a las 4 PM', HO.corte(T('2026-11-13T17:00:00Z')) === T('2026-11-08T21:00:00Z'),
    new Date(HO.corte(T('2026-11-13T17:00:00Z'))).toISOString());
  prueba('domingo 15 a las 3:59 PM → todavía el domingo 8', HO.corte(T('2026-11-15T20:59:00Z')) === T('2026-11-08T21:00:00Z'));
  prueba('domingo 15 a las 4:00 PM → el domingo 15', HO.corte(T('2026-11-15T21:00:00Z')) === T('2026-11-15T21:00:00Z'));
  // Un sábado a las 10 PM de NY ya es domingo en UTC: no puede saltar.
  prueba('sábado 14 a las 10 PM de NY (domingo en UTC) → el domingo 8', HO.corte(T('2026-11-15T03:00:00Z')) === T('2026-11-08T21:00:00Z'));
  // Julio (horario de verano): 4 PM NY = 20:00 UTC.
  prueba('en verano, a las 20:00 UTC', HO.corte(T('2026-07-15T12:00:00Z')) === T('2026-07-12T20:00:00Z'),
    new Date(HO.corte(T('2026-07-15T12:00:00Z'))).toISOString());
}

grupo('qué va primera');
{
  const AHORA = T('2026-11-15T23:00:00Z');       // domingo 15, 6 PM NY
  const viejo = '2026-11-09T03:00:00Z';           // cerrado el domingo 8
  const nuevo = '2026-11-16T00:30:00Z';           // cerrado el domingo 15, 7:30 PM
  const p = (o) => HO.primera(Object.assign({ ahora: AHORA, hayOrdenes: true, hayAgota: true }, o));
  prueba('domingo 6 PM, sin cerrar el conteo: el ciclo', p({ resetAt: viejo }) === 'ciclo');
  prueba('el domingo a las 3 PM, la semana sigue: Running out',
    HO.primera({ ahora: T('2026-11-15T20:00:00Z'), resetAt: viejo, hayOrdenes: false, hayAgota: true }) === 'agota');
  prueba('cerrado, con órdenes: las órdenes', HO.primera({ ahora: T('2026-11-16T15:00:00Z'), resetAt: nuevo, hayOrdenes: true, hayAgota: true }) === 'ordenes');
  prueba('colocadas: Running out', HO.primera({ ahora: T('2026-11-18T15:00:00Z'), resetAt: nuevo, hayOrdenes: false, hayAgota: true }) === 'agota');
  prueba('el conteo no dejó órdenes: Running out directo', HO.primera({ ahora: T('2026-11-16T01:00:00Z'), resetAt: nuevo, hayOrdenes: false, hayAgota: true }) === 'agota');
  prueba('sin nada que se acabe: el ciclo', HO.primera({ ahora: T('2026-11-18T15:00:00Z'), resetAt: nuevo, hayOrdenes: false, hayAgota: false }) === 'ciclo');
  prueba('el domingo no se contó: el lunes sigue el ciclo', HO.primera({ ahora: T('2026-11-16T18:00:00Z'), resetAt: viejo, hayOrdenes: true, hayAgota: true }) === 'ciclo');
  prueba('contado el lunes: las órdenes', HO.primera({ ahora: T('2026-11-16T22:00:00Z'), resetAt: '2026-11-16T21:00:00Z', hayOrdenes: true, hayAgota: true }) === 'ordenes');
  prueba('sin ciclo abierto nunca: el ciclo', HO.primera({ ahora: AHORA, resetAt: null, hayOrdenes: true, hayAgota: true }) === 'ciclo');
}

// ── En el Home de verdad ──────────────────────────────────────────────
function home(o) {
  const d = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = d.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.state = { master: [{ item: 'A', vendor: 'ACME', onHand: 1, suggested: 4, bottleSizeMl: 750, toOrder: 3, value: 10 }] };
  w.BarStockWeeklyCycle = {
    estado: () => (o.contando ? 'counting' : 'done'), resetAt: () => o.resetAt, fmtDate: () => 'Nov 8',
    edadCiclo: () => 2 * 864e5, cicloViejo: () => false, diasDeCalendario: () => 2,
    pausado: () => true, abandonado: () => false, hace: () => '5 min'
  };
  w.BarStockCountSession = {
    progress: () => ({ counted: 1, total: 1 }), size: () => 1, activeMs: () => 3e5,
    fmtDur: () => '5 min', updatedAt: () => new Date().toISOString(),
    cronoDesde: () => new Date().toISOString(), zonesUsed: () => [], missingRows: () => [],
    bottleProgress: () => ({ contadas: 3, faltan: 1, antes: 4 })
  };
  w.BarStockZones = { lista: () => [], activas: () => false, paraPasada: () => '' };
  const filas = o.ordenes ? [w.state.master[0]] : [];
  w.getActiveVendors = () => ['ACME']; w.getOrderRowsForVendor = () => filas;
  w.computeOrderSubtotal = () => 30; w.isRowPlaced = () => false;
  w.BARSTOCK_CONFIG = {}; w.BarStockToast = { show() {} };
  w.BarStockVersion = { nueva: () => o.nueva || null, pendiente: () => o.nueva || null, actual: () => '20261109-100000' };
  w.BarStockVersionCenter = { fecha: () => '', visto: () => null, notasDe: async () => [] };
  new Function(leer('src/home-orden.js'))();
  new Function(leer('src/mobile-home.js'))();
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.setAttribute('data-screen', 'home');
  w.document.body.appendChild(host);
  const real = Date.now;
  Date.now = () => o.ahora;
  try { w.BarStockMobileHome.render(host); } finally { Date.now = real; }
  return [...host.querySelectorAll('.m-hero')];
}
const ciclo = (c) => c && c.getAttribute('data-kind') === 'cycle';

grupo('en el Home');
{
  const t = home({ ahora: T('2026-11-15T23:00:00Z'), resetAt: '2026-11-09T03:00:00Z', ordenes: true });
  prueba('domingo 6 PM sin cerrar: el ciclo primero', ciclo(t[0]), t.map(x => x.className).join(' | '));
}
{
  const t = home({ ahora: T('2026-11-16T15:00:00Z'), resetAt: '2026-11-16T00:30:00Z', ordenes: true });
  prueba('cerrado el conteo: las órdenes primero, el ciclo detrás', !ciclo(t[0]) && /order/i.test(t[0].textContent) && ciclo(t[1]),
    t.map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 30)).join(' | '));
}
{
  const t = home({ ahora: T('2026-11-16T15:00:00Z'), resetAt: '2026-11-16T00:30:00Z', ordenes: true, nueva: '20261116-100000' });
  // Axel, 2026-11-17: la tarjeta de update sale del carrusel; la versión
  // vive en More. Con una nueva, el orden es el de siempre.
  prueba('con una versión nueva, no hay tarjeta de update y el orden no cambia', !t.some(x => x.classList.contains('m-hero-app')) &&
    /order/i.test(t[0].textContent), t.map(x => x.className).join(' | '));
}
{
  const t = home({ ahora: T('2026-11-16T15:00:00Z'), resetAt: '2026-11-16T00:30:00Z', ordenes: true, contando: true, nueva: '20261116-100000' });
  prueba('con un conteo a medias, el conteo primero', /Count/.test(t[0].textContent) && !t.some(x => x.classList.contains('m-hero-app')),
    t.map(x => x.className).join(' | '));
}
{
  const html = leer('index.html');
  prueba('home-orden carga antes que el Home', html.indexOf('src/home-orden.js?v=') > 0 && html.indexOf('src/home-orden.js?v=') < html.indexOf('src/mobile-home.js?v='));
}

grupo('hasta cuándo es "esta semana": el domingo del ciclo (Axel, 2026-11-19)');
{
  // Running out decía "10 run out this week" un jueves y todos se
  // acababan el martes o miércoles SIGUIENTE: contaba 7 días desde hoy.
  const f = (ahora, resetAt) => HO.finCiclo ? HO.finCiclo({ ahora: T(ahora), resetAt }) : null;
  const cerradoDom15 = '2026-11-16T03:00:00Z';     // domingo 15, 10 PM NY
  prueba('jueves 19 con el conteo del 15 cerrado → domingo 22', f('2026-11-19T13:15:00Z', cerradoDom15) === '2026-11-22', f('2026-11-19T13:15:00Z', cerradoDom15));
  prueba('sábado 21 a las 10 PM → domingo 22', f('2026-11-22T03:00:00Z', cerradoDom15) === '2026-11-22');
  prueba('domingo 22 a las 6 PM, sin contar → ese domingo', f('2026-11-22T23:00:00Z', cerradoDom15) === '2026-11-22');
  prueba('domingo 22, contado a las 9 PM → el domingo siguiente (29)', f('2026-11-23T02:30:00Z', '2026-11-23T02:00:00Z') === '2026-11-29');
  prueba('lunes 23 sin contar todavía → el domingo 29, no una lista vacía', f('2026-11-23T15:00:00Z', cerradoDom15) === '2026-11-29');
  prueba('el domingo por la mañana, antes del corte → ese domingo', f('2026-11-22T15:00:00Z', cerradoDom15) === '2026-11-22');
}
{
  const html = leer('index.html');
  const i = (f) => html.indexOf('src/' + f + '?v=');
  prueba('home-orden carga antes que running-out y live-cache, que la usan', i('home-orden.js') > 0 &&
    i('home-orden.js') < i('running-out.js') && i('home-orden.js') < i('live-cache.js'));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
