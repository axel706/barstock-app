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

grupo('1b · se acaba antes de que llegue la orden (lámina C, 2026-11-19)');
{
  // Lunes 23 a las 10 AM. Wine Merchant entrega el jueves a las 4 PM.
  const w2 = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
  w2.console = { log() {}, warn() {}, error() {} };
  for (const f of ['src/pedido.js', 'src/vendor-delivery.js', 'src/toast-usage.js', 'src/run-out.js', 'src/sugerencia.js']) w2.eval(leer(f));
  const S2 = w2.BarStockSugerencia;
  const AHORA = NY('2026-11-23 10:00');
  const d2 = { porDia: [0.5, 0, 0.5, 0.5, 0.5, 0.8, 1], semanal: 3.8, sigma: 1, tendencia: 1, reciente: 3.8, cv: 1 };
  const fila = (live) => ({ dem: d2, live, margen: 0, viene: [], ahoraMs: AHORA, hoyVendido: 0, hoyFrac: null });
  const F = { Corto: fila(1.2), Largo: fila(10), Solo: { dem: null, live: 1, viene: [] } };
  w2.BarStockVendorDefaults = { getDefaults: async () => ({ delivery_day: 4, delivery_time: '16:00' }) };
  w2.BarStockLiveCache = { cargar: () => null, fila: (r) => F[r.item] || null, cuanto: (r) => (F[r.item] || {}).live, agota: () => null };
  await S2.preparar('WINE MERCHANT');
  const c = S2.antes && S2.antes({ item: 'Corto', vendor: 'WINE MERCHANT' }, AHORA);
  prueba('se acaba antes del jueves 4 PM: lo dice, con cuánto de LOOP', !!c && c.fin && c.fin.en < NY('2026-11-26 16:00') && c.loop >= 1 && c.llegaTxt === 'Thu 4 PM' && /^Out /.test(c.outTxt), JSON.stringify(c));
  prueba('…y el porqué de la sugerencia lo dice ("short this week")', /^short this week · to last until next Thu 4 PM/.test((S2.para({ item: 'Corto', vendor: 'WINE MERCHANT' }, AHORA) || {}).texto || ''),
    (S2.para({ item: 'Corto', vendor: 'WINE MERCHANT' }, AHORA) || {}).texto);
  prueba('lo que llega a la entrega, no', S2.antes && S2.antes({ item: 'Largo', vendor: 'WINE MERCHANT' }, AHORA) === null);
  prueba('…ni su sugerencia dice "short"', !/short/.test((S2.para({ item: 'Largo', vendor: 'WINE MERCHANT' }, AHORA) || {}).texto || 'x'));
  prueba('sin la demanda día por día (lo que Toast no vende), nada', S2.antes && S2.antes({ item: 'Solo', vendor: 'WINE MERCHANT' }, AHORA) === null);
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
// Lo que se acaba antes de que llegue su orden (sugerencia.antes).
const ANTES = {
  Pedro: { fin: { dia: '2026-11-25', en: 1 }, loop: 2, outTxt: 'Out Wed', llegaTxt: 'Tue 4 PM' },
  Otro: { fin: { dia: '2026-11-24', en: 0 }, loop: 1, outTxt: 'Out Tue', llegaTxt: 'Wed 4 PM' },
  Quieto: { fin: { dia: '2026-11-26', en: 2 }, loop: 1, outTxt: 'Out Thu', llegaTxt: 'Tue 4 PM' }
};
let EN_LISTA = ['Quieto'];   // ya en To buy: no sale en ningún sitio
function pantalla(conS, conBanda) {
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
    para: (r) => (r.item in SUG ? { pedir: SUG[r.item], texto: 'to last until next Tue 4 PM: uses 1 + cushion 1, 1 left Tue' } : null),
    antes: (r) => (conS === 'antes' && ANTES[r.item]) || null };
  v.__anadidos = [];
  v.BarStockShoppingList = { anadir: async (o) => { v.__anadidos.push(o); return { ok: true }; } };
  v.BarStockMobileToBuy = { cuantos: () => 0, cargar() {}, montar() {}, deProducto: (item) => (EN_LISTA.includes(item) ? { item_name: item } : null) };
  let def = null;
  v.__banda = { titulo: null, atras: null, salidas: 0 };
  const bandaFns = conBanda ? {
    enBanda: (t, sub, aviso) => { v.__banda.titulo = t; v.__banda.sub = sub || ''; v.__banda.aviso = aviso || ''; return true; },
    alVolverBanda: (fn) => { v.__banda.atras = fn; },
    salirBanda: () => { v.__banda.titulo = null; v.__banda.atras = null; v.__banda.salidas++; }
  } : {};
  v.BarStockMobile = Object.assign({ register(d) { def = d; }, refrescarBadges() {}, ir() {} }, require('./lib-cabecera'), bandaFns);
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
  prueba('al final, "Not on this order · BarStock would add 1"', /Not on this order · BarStock would add 1/.test(txt(k)), txt(k));
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

grupo('2b · lo que no llega a su entrega: arriba del proveedor y en LOOP (lámina C)');
{
  const { v, host } = pantalla('antes');
  await esperar(20);
  const loopCard = Array.from(host.querySelectorAll('.m-ordv')).find(x => txt(x.querySelector('.m-ordv-n')) === 'LOOP');
  prueba('LOOP sale en Open aunque no tenga líneas propias', !!loopCard && /2 won't last until delivery/.test(txt(loopCard)), loopCard ? txt(loopCard) : Array.from(host.querySelectorAll('.m-ordv')).map(txt).join(' | '));
  abrir(host, 'BREAKTHRU');
  await esperar(10);
  const b = host.querySelector('.m-ord-pte');
  const num = (el) => txt(el && el.querySelector('.m-ord-pte-n'));
  const que = (el) => txt(el && el.querySelector('.m-ord-pte-t'));
  const renglones = (el) => Array.from((el && el.querySelectorAll('.m-ord-pte-i')) || []).map(txt);
  prueba('arriba del proveedor: lo suyo que se acaba antes de que llegue (opción B: el número y lo que dice)', !!b && num(b) === '1' &&
    /^runs out before this order arrivesTue 4 PM · get it from LOOP to bridge$/.test(que(b)) && renglones(b).join('|') === 'Pedro To buy Out Wed · 2 from LOOP', [num(b), que(b), renglones(b).join('|')].join(' / '));
  prueba('…no lo de otro proveedor, ni lo que ya está en To buy', !!b && !/Otro|Quieto/.test(txt(b)));
  prueba('…y va antes de las líneas', !!b && (b.compareDocumentPosition(host.querySelector('#moList')) & v.Node.DOCUMENT_POSITION_FOLLOWING) > 0);
  host.querySelector('.m-ord-volver, [data-volver-ordenes]');
}
{
  const { v, host } = pantalla('antes');
  await esperar(20);
  abrir(host, 'LOOP');
  await esperar(10);
  const b = host.querySelector('.m-ord-pte');
  const num = (el) => txt(el && el.querySelector('.m-ord-pte-n'));
  const que = (el) => txt(el && el.querySelector('.m-ord-pte-t'));
  const renglones = (el) => Array.from((el && el.querySelectorAll('.m-ord-pte-i')) || []).map(txt);
  prueba('en LOOP, lo de TODOS los proveedores, con su proveedor y su entrega', !!b && num(b) === '2' && /^won't last until their delivery/.test(que(b)) &&
    renglones(b).join('|') === 'Otro To buy Out Tue · Southern Wed 4 PM · 1 from LOOP|Pedro To buy Out Wed · Breakthru Tue 4 PM · 2 from LOOP', [num(b), que(b), renglones(b).join('|')].join(' / '));
  prueba('…cada uno separado por una línea fina', !!b && b.querySelectorAll('.m-ord-pte-sep').length === 2);
  prueba('el que se acaba antes, primero', !!b && txt(b).indexOf('Otro') < txt(b).indexOf('Pedro'));
  prueba('sin líneas propias, sin "Review and send"', !host.querySelector('#moSend'));
  if (process.env.VOLCAR2) fs.writeFileSync(process.env.VOLCAR2, host.innerHTML);
  const btn = Array.from(b.querySelectorAll('[data-tb]')).find(x => /Pedro/.test(txt(x.parentNode)));
  btn.click();
  await esperar(10);
  prueba('"To buy" lo manda a la lista de compras con lo de LOOP y el porqué', v.__anadidos.length === 1 && v.__anadidos[0].item === 'Pedro' &&
    v.__anadidos[0].qty === 2 && v.__anadidos[0].motivo === 'app' && /Out Wed · before BREAKTHRU Tue 4 PM/.test(v.__anadidos[0].nota), JSON.stringify(v.__anadidos));
  const b2 = host.querySelector('.m-ord-pte');
  prueba('y desaparece de LOOP', !!b2 && !/Pedro/.test(txt(b2)) && num(b2) === '1' && /^won't last until its delivery/.test(que(b2)), txt(b2));
  host.querySelector('.m-back, [data-back], .m-ord-back');
}
{
  // Ya en la lista (To buy lo dice): tampoco en su proveedor.
  EN_LISTA = ['Quieto', 'Pedro'];
  const { host } = pantalla('antes');
  await esperar(20);
  abrir(host, 'BREAKTHRU');
  await esperar(10);
  prueba('lo que ya está en To buy no sale en su proveedor', !host.querySelector('.m-ord-pte'));
  const daou = Array.from(host.querySelectorAll('#moList .m-ord-l')).find(l => /^Daou/.test(txt(l.querySelector('.m-ord-l-n'))));
  prueba('la sugerencia de la línea sigue', !!daou && !!daou.querySelector('.m-ord-sg'));
  EN_LISTA = ['Quieto'];
}

grupo('2c · el detalle como una subsección de Settings (Axel, 2026-11-20)');
{
  // "Vendor en el header, el chevron de atrás ocupando el botón de Time
  // Machine, y Add a product a posición fija y con el estilo de Done."
  const { v, host } = pantalla(true, true);
  abrir(host, 'BREAKTHRU');
  await esperar(10);
  prueba('el proveedor va a la banda', v.__banda.titulo === 'BREAKTHRU', String(v.__banda.titulo));
  prueba('la página no repite el título ni su chevron', !host.querySelector('.m-inv-t') && !host.querySelector('#mAtras'));
  // Axel, 2026-11-22 (lámina B ajustada): "Review and send" y "Add a
  // product" competían como dos botones principales. Los detalles van a
  // la banda bajo el proveedor; abajo, donde Done, Review and send a lo
  // ancho (sin el total) y el + verde redondo a la derecha.
  prueba('los detalles de la orden van a la banda, bajo el proveedor',
    /^\$\d.* · 2 lines$/.test(v.__banda.sub) && !host.querySelector('.m-ord-sub'), v.__banda.sub);
  const acc = host.querySelector('#moAcc');
  const env = acc && acc.querySelector('#moSend');
  const add = acc && acc.querySelector('#moAdd');
  prueba('abajo, juntos: Review and send y el +, en ese orden', !!env && !!add &&
    (env.compareDocumentPosition(add) & v.Node.DOCUMENT_POSITION_FOLLOWING) > 0);
  prueba('Review and send sólo dice eso', !!env && txt(env) === 'Review and send', env && txt(env));
  prueba('el + es sólo el icono, con su nombre para el lector', !!add && !txt(add) && add.getAttribute('aria-label') === 'Add a product');
  prueba('ya no hay botón de enviar arriba de la lista', !host.querySelector('.m-ord-enviar'));
  prueba('…al final, con su hueco para que no tape lo último', !!acc && !!host.querySelector('.m-tx-hueco') &&
    (host.querySelector('#moList').compareDocumentPosition(acc) & v.Node.DOCUMENT_POSITION_FOLLOWING) > 0);
  // El + crece en su cristal verde hasta cubrir la pantalla y DESPUÉS
  // abre: el diálogo no sale antes de la animación.
  v.__abierto = [];
  v.BarStockAddToOrder = { open(x) { v.__abierto.push(x); } };
  // Con "reducir movimiento" del teléfono, abre al momento.
  add.click();
  prueba('con reducir movimiento, abre sin animar', v.__abierto.join() === 'BREAKTHRU' && !v.document.querySelector('.m-ord-crece'));
  v.__abierto = [];
  const mmAntes = v.matchMedia;
  v.matchMedia = (q) => ({ matches: !/reduced-motion/.test(q), addEventListener() {}, removeEventListener() {} });
  add.click();
  prueba('el + no abre de golpe: primero crece', v.__abierto.length === 0 && !!v.document.querySelector('.m-ord-crece'));
  await esperar(700);
  prueba('…y luego abre para su proveedor', v.__abierto.join() === 'BREAKTHRU', v.__abierto.join());
  await esperar(400);
  prueba('…y el cristal que creció se va', !v.document.querySelector('.m-ord-crece'));
  v.matchMedia = mmAntes;
  prueba('el atrás de la banda vuelve a la lista de Orders', typeof v.__banda.atras === 'function');
  if (typeof v.__banda.atras === "function") v.__banda.atras();
  await esperar(10);
  prueba('…y la banda suelta el nombre', v.__banda.titulo === null && v.__banda.salidas > 0 && !!host.querySelector('.m-ordv'));
  const css = leer('styles/mobile-app.css');
  const fijos = (/#mScreens :is\(([^)]*)\) \{\s*position: fixed/.exec(css) || [])[1] || '';
  prueba('el bloque va fijo donde Done (y no el + suelto)', /#moAcc/.test(fijos) && !/#moAdd/.test(fijos), fijos);
  const azul = (/body\.m-shell #mScreens :is\(#mRoDone([^)]*)\),\s*body\.m-shell #mTabs \.m-tab\.on \{/.exec(css) || [])[1] || '';
  prueba('Review and send con el cristal azul de Done', /#moSend/.test(azul) && !/#moAdd/.test(azul), azul);
  prueba('el + con el cristal verde de Quick order', /body\.m-shell #mScreens :is\(#moRun, #moAdd\) \{/.test(css));
}
{
  // Sin el armazón (escritorio, pruebas viejas), la cabecera de antes.
  const { host } = pantalla(true, false);
  abrir(host, 'BREAKTHRU');
  await esperar(10);
  prueba('sin banda, la cabecera de siempre con su título', /BREAKTHRU/.test(txt(host.querySelector('.m-inv-t') || host.querySelector('h2') || host)));
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

grupo('el título de "Not on this order" no va pegado a la primera tarjeta');
prueba('aire por arriba de la primera tarjeta tras el título', /\.m-ord-k \+ \.m-ord-l \{ margin-top: 10px; \}/.test(require('fs').readFileSync(require('path').join(__dirname, '../styles/mobile-app.css'), 'utf8')));

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
