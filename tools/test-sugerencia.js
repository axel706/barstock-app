/*
 * ── La sugerencia en la orden (fase 4 de docs/plan-pedido.md) ────────
 *
 * Axel, 2026-11-18, sobre lámina (opción C): cada línea de una orden de
 * Orders › Open lleva "Suggested N" con su cuenta y "Use N"; al final,
 * lo que está en su par y la app pediría, con "Add N". Lo que no puede
 * volver a pasar:
 *
 *   1. Dos cuentas: la sugerencia ES pedido.cuantoPedir, con la demanda,
 *      el LIVE y lo que viene de la misma fila de run-out.
 *   2. Inventarse un "hasta cuándo": sin horario del proveedor, nada.
 *   3. Que la sugerencia cambie la orden sola: sólo "Use"/"Add", por el
 *      mismo camino que el −/+ (updateFinalOrder).
 *   4. Proponer lo que alguien excluyó a mano o lo ya colocado.
 *
 *   node tools/test-sugerencia.js
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
const esperar = ms => new Promise(r => setTimeout(r, ms || 0));
// Una hora de Nueva York (invierno, UTC−5) a milisegundos.
const NY = (s) => { const [d, h] = s.split(' '); return Date.parse(d + 'T' + h + ':00Z') + 5 * 3600e3; };
const DOMINGO = NY('2026-11-22 21:00');   // después del conteo

(async () => {

grupo('1 · la cuenta (src/sugerencia.js)');
const w = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
w.console = { log() {}, warn() {}, error() {} };
w.eval(leer('src/pedido.js'));
w.eval(leer('src/vendor-delivery.js'));
const existe = fs.existsSync(path.join(RAIZ, 'src/sugerencia.js'));
prueba('existe', existe);
if (existe) w.eval(leer('src/sugerencia.js'));
const S = w.BarStockSugerencia, P = w.BarStockPedido;
// Breakthru: martes 4 PM. Southern sin horario.
w.BarStockVendorDefaults = { getDefaults: async (v) => ({ BREAKTHRU: { delivery_day: 2, delivery_time: '16:00' },
  'WINE MERCHANT': { delivery_day: 4, delivery_time: '16:00' } })[v] || null };
const dem = { porDia: [1, 0, 0.5, 0.5, 0.5, 1, 1.5], semanal: 5, sigma: 1, tendencia: 1, reciente: 5 };
const filas = {
  Daou: { dem, viene: [], vino: true },
  Tito: { dem, viene: [{ cuando: new Date(NY('2026-11-24 16:00')).toISOString(), n: 2 }] },
  Kamora: { dem, viene: [] },
  Nino: { dem, viene: [], vino: true },
  Solo: { dem: null, viene: [] }
};
const stock = { Daou: 4, Tito: 4, Kamora: 3, Nino: 1, Solo: 2 };
w.BarStockLiveCache = { cargar: () => null, fila: (r) => filas[r.item] || null, cuanto: (r) => stock[r.item] };
w.parAdjustments = new Map([['Solo||', { status: 'active', avgUsed: 7, stdDev: 1, normalWeeks: 8 }]]);
if (S) {
  await S.preparar('BREAKTHRU'); await S.preparar('SOUTHERN'); await S.preparar('WINE MERCHANT');
  const r = { item: 'Daou', vendor: 'BREAKTHRU', code: '' };
  const sg = S.para(r, DOMINGO);
  const esperado = P.cuantoPedir(Object.assign({ dem, stock: 4, viene: [], ahora: DOMINGO,
    llegada: NY('2026-11-24 16:00'), siguiente: NY('2026-12-01 16:00') }, P.redondeoPara({ vendor: 'BREAKTHRU', vino: true })));
  prueba('es pedido.cuantoPedir, del martes 4 PM al siguiente martes 4 PM', sg && sg.pedir === esperado.pedir && Math.abs(sg.uso - esperado.uso) < 1e-9,
    JSON.stringify([sg, esperado.pedir]));
  prueba('y dice de dónde sale', sg && sg.texto === 'to last until next Tue 4 PM: uses ' + (Math.round(esperado.uso * 10) / 10).toFixed(1).replace(/\.0$/, '') +
    ' + cushion ' + (Math.round(esperado.colchon * 10) / 10).toFixed(1).replace(/\.0$/, '') + ', ' + (Math.round(esperado.queda * 10) / 10).toFixed(1).replace(/\.0$/, '') + ' left Tue', sg && sg.texto);
  const t = S.para({ item: 'Tito', vendor: 'BREAKTHRU', code: '' }, DOMINGO);
  const t0 = P.cuantoPedir({ dem, stock: 4, viene: [{ cuando: NY('2026-11-24 16:00'), n: 2 }], ahora: DOMINGO, llegada: NY('2026-11-24 16:00'), siguiente: NY('2026-12-01 16:00'), multiplo: 1 });
  prueba('lo que ya viene cuenta (de la fila de run-out)', t && t.pedir === t0.pedir && t0.llegaAntes === 2, JSON.stringify([t && t.pedir, t0]));
  prueba('sin horario del proveedor, no hay sugerencia', S.para({ item: 'Kamora', vendor: 'SOUTHERN', code: '' }, DOMINGO) === null);
  const n = S.para({ item: 'Nino', vendor: 'WINE MERCHANT', code: '' }, DOMINGO);
  prueba('vino de Wine Merchant: de 3 en 3', n && n.pedir > 0 && n.pedir % 3 === 0, n && n.pedir);
  const so = S.para({ item: 'Solo', vendor: 'BREAKTHRU', code: '' }, DOMINGO);
  prueba('lo que Toast no vende: con Pour·IQ solo', so && so.pedir > 0 && Math.abs(so.uso - 7) < 1e-6, JSON.stringify(so));
  w.parAdjustments = new Map();
  prueba('sin Pour·IQ ni Toast, nada', S.para({ item: 'Solo', vendor: 'BREAKTHRU', code: '' }, DOMINGO) === null);
}

grupo('2 · la pantalla de la orden (opción C)');
// item, vendor, onHand, par, toOrder, override
const FILAS = [
  ['Daou', 'BREAKTHRU', 4, 7, 3, ''],          // en la orden, sugerido distinto
  ['Pedro', 'BREAKTHRU', 6, 8, 2, ''],          // en la orden, sugerido igual
  ['Kentucky', 'BREAKTHRU', 11, 11, 0, ''],     // en su par, la app pediría
  ['Quieto', 'BREAKTHRU', 9, 3, 0, ''],         // de sobra: sugerido 0
  ['Fuera', 'BREAKTHRU', 0, 4, 4, 0],           // excluido a mano
  ['Puesto', 'BREAKTHRU', 5, 5, 0, ''],         // ya colocado este ciclo
  ['Otro', 'SOUTHERN', 5, 5, 0, '']
];
const SUG = { Daou: 9, Pedro: 2, Kentucky: 4, Quieto: 0, Fuera: 5, Puesto: 3, Otro: 6 };
function pantalla(conS) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const v = dom.window;
  global.window = v; global.document = v.document;
  v.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  v.state = { master: FILAS.map(([item, vendor, onHand, suggested, toOrder, ov]) => ({ item, vendor, onHand, suggested, toOrder, value: 10, orderOverride: ov, code: '' })) };
  v.supportsManualFinalOrder = (x) => ['SOUTHERN', 'BREAKTHRU', 'WINE MERCHANT', 'LOOP'].includes(String(x || '').toUpperCase());
  v.getEffectiveOrder = (r) => (v.supportsManualFinalOrder(r.vendor) && r.orderOverride !== '' && r.orderOverride != null)
    ? Math.max(0, Number(r.orderOverride)) : Math.max(0, Number(r.toOrder) || 0);
  v.getActiveVendors = () => ['BREAKTHRU', 'SOUTHERN'];
  v.isRowPlaced = (r) => r.item === 'Puesto';
  v.getOrderRowsForVendor = (x) => v.state.master.filter(r => v.getEffectiveOrder(r) > 0 && r.vendor === x && !v.isRowPlaced(r));
  v.computeOrderSubtotal = (rows) => rows.reduce((s, r) => s + v.getEffectiveOrder(r) * 10, 0);
  v.__guardados = [];
  v.updateFinalOrder = (i, n) => { v.__guardados.push({ i, n }); v.state.master[i].orderOverride = Math.max(0, Number(n) || 0); };
  v.resetFinalOrder = () => {};
  v.BarStockVendorDefaults = { getDefaults: async () => ({}) };
  if (conS) v.BarStockSugerencia = { preparar: async () => {},
    para: (r) => (r.item in SUG ? { pedir: SUG[r.item], texto: 'to last until next Tue 4 PM: uses 1 + cushion 1, 1 left Tue' } : null) };
  let def = null;
  v.BarStockMobile = Object.assign({ register(d) { def = d; }, refrescarBadges() {}, ir() {} }, require('./lib-cabecera'));
  new Function(leer('src/mobile-orders.js'))();
  v.document.dispatchEvent(new v.Event('DOMContentLoaded'));
  const host = v.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'orders';
  v.document.body.appendChild(host);
  def.mount(host);
  return { v, host };
}
const abrir = (host, nombre) => Array.from(host.querySelectorAll('.m-ordv'))
  .find(x => x.querySelector('.m-ordv-n').textContent.trim() === nombre).click();
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
{
  const { v, host } = pantalla(true);
  abrir(host, 'BREAKTHRU');
  await esperar(10);
  const linea = (n) => Array.from(host.querySelectorAll('#moList .m-ord-l')).find(l => /^\S+/.exec(txt(l.querySelector('.m-ord-l-n')))[0] === n);
  const daou = linea('Daou');
  const sg = daou && daou.querySelector('.m-ord-sg');
  prueba('cada línea lleva su franja con "Suggested N" y su cuenta', !!sg && /Suggested 9 · to last until next Tue 4 PM/.test(txt(sg)), txt(sg));
  prueba('…debajo de la cantidad', !!sg && !!daou.querySelector('.m-ord-q') &&
    (daou.querySelector('.m-ord-q').compareDocumentPosition(sg) & v.Node.DOCUMENT_POSITION_FOLLOWING) > 0);
  prueba('con "Use 9" si no coincide', /Use 9/.test(txt(sg && sg.querySelector('[data-use]'))));
  const pedro = linea('Pedro');
  prueba('si coincide, sin botón', !!pedro.querySelector('.m-ord-sg') && !pedro.querySelector('.m-ord-sg [data-use]'));
  prueba('mirar no cambia nada', v.__guardados.length === 0);
  sg.querySelector('[data-use]').click();
  prueba('"Use 9" pone 9 a mano, por updateFinalOrder', v.__guardados.length === 1 && v.__guardados[0].i === 0 && v.__guardados[0].n === 9, JSON.stringify(v.__guardados));

  const k = host.querySelector('.m-ord-k');
  prueba('al final, "Not on this order · the app would add 1"', /Not on this order · the app would add 1/.test(txt(k)), txt(k));
  const extra = Array.from(host.querySelectorAll('.m-ord-extra')).map(e => txt(e.querySelector('.m-ord-l-n')));
  prueba('sólo lo que está en su par y la app pediría (Kentucky)', extra.join(',') === 'Kentucky', extra.join(','));
  prueba('no lo excluido a mano, ni lo ya colocado, ni lo de otro proveedor', !extra.includes('Fuera') && !extra.includes('Puesto') && !extra.includes('Otro'));
  const ky = host.querySelector('.m-ord-extra');
  prueba('dice que está en su par y de dónde sale', /11 of 11 on hand · at par/.test(txt(ky)) && /to last until next Tue/.test(txt(ky)), txt(ky));
  if (process.env.VOLCAR) fs.writeFileSync(process.env.VOLCAR, host.innerHTML);
  ky.querySelector('[data-use]').click();
  prueba('"Add 4" lo mete en la orden con 4', v.__guardados.some(g => g.i === 2 && g.n === 4) && v.getOrderRowsForVendor('BREAKTHRU').some(r => r.item === 'Kentucky'));
}
{
  const { host } = pantalla(false);
  abrir(host, 'BREAKTHRU');
  await esperar(10);
  prueba('sin sugerencia cargada, la orden como siempre', !host.querySelector('.m-ord-sg') && !host.querySelector('.m-ord-k') && host.querySelectorAll('#moList .m-ord-l').length === 2);
}

grupo('3 · cargado y en orden');
{
  const idx = leer('index.html');
  const pos = (f) => idx.indexOf('src/' + f + '?');
  prueba('sugerencia.js después de pedido, live-cache y vendor-delivery, antes de mobile-orders',
    pos('sugerencia.js') > pos('pedido.js') && pos('sugerencia.js') > pos('live-cache.js') && pos('sugerencia.js') > pos('vendor-delivery.js') &&
    pos('sugerencia.js') < pos('mobile-orders.js') && pos('pedido.js') > 0);
  prueba('quien no puede hacer órdenes no ve "Use" ni "Add"', /html\.bs-sin-ordenes #mScreens :is\([^)]*\.m-ord-use/.test(leer('styles/mobile-app.css')));
  prueba('no escribe nada: sin fetch ni updateFinalOrder', !/fetch\(|updateFinalOrder|saveState|persist/.test(leer('src/sugerencia.js').replace(/\/\/.*$/gm, '')));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
