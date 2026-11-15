#!/usr/bin/env node
/*
 * ── "Running low" desde "Do we have" ──────────────────────────────────
 *
 * Axel, 2026-11-15, lámina 1, y "el número del bartender sí corrige".
 * Lo que se protege, con el buscador DE VERDAD (mobile-search.js) y las
 * tarjetas de verdad (product-hero.js):
 *   1. Cada tarjeta lleva "Running low", dentro de la tarjeta, y tocarlo
 *      NO abre la ficha.
 *   2. Pide cuántas quedan (teclado, sin <input>) y guarda DOS filas: la
 *      verificación (corrige el LIVE) y la línea de persona en To buy,
 *      con el "Order N" calculado con ese número y "only N left".
 *   3. Si la verificación falla, no se añade nada; si falla la lista, se
 *      dice que la verificación sí se guardó.
 *   4. Ya en la lista, la tarjeta lo dice con quién; "Remove" sólo para
 *      quien compra, y quita la línea (no la verificación).
 *   5. Sin "Report running low", no hay botón.
 *
 *   node tools/test-running-low.js
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
const txt = (el) => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';

function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document; global.CustomEvent = w.CustomEvent;
  w.console = { log() {}, warn() {}, error() {} };
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.state = { master: [
    { item: 'White Haven Sauvignon Blanc', vendor: 'BREAKTHRU', onHand: 6, suggested: 5, value: 12, bottleSizeMl: 750 },
    { item: 'White Claw Mango', vendor: 'LOOP', onHand: 3, suggested: 6, value: 2, bottleSizeMl: 355 }
  ] };
  w.normalizeName = (s) => String(s || '').toLowerCase();
  w.parAdjustments = new Map();
  w.BarStockZones = { lista: () => [], cargar: async () => {}, activas: () => false, donde: async () => null };
  w.BarStockProductWeeks = { semanas: async () => [], rumbo: () => null };
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-1' };
  w.BarStockGuest = { puede: (k) => (o.sin || []).indexOf(k) < 0, nombre: () => 'Ana' };
  w.__caducado = 0;
  w.BarStockLiveCache = {
    cargar() {}, alCambiar() {}, caducar: () => { w.__caducado++; },
    vivo: (r) => r.item.startsWith('White Haven') ? { live: 4.2 } : null,
    cuanto: (r) => r.item.startsWith('White Haven') ? 4.2 : r.onHand,
    toastLoVende: () => false, etiquetaAgota: () => '', semana: () => '',
    // El "Order N" con lo que se le diga que queda: 5 − quedan.
    pedir: (r, quedan) => (quedan != null ? Math.max(0, 5 - quedan) : 1)
  };
  w.__filas = (o.lista || []).map(f => Object.assign({}, f));
  w.__pet = [];
  w.BarStockRest = { leerTodo: async () => w.__filas.filter(f => f.status === 'to_buy' || f.status === 'ordered').map(f => Object.assign({}, f)) };
  const red = async (url, op) => {
    const u = String(url), cuerpo = op && op.body ? JSON.parse(op.body) : null, m = op && op.method;
    w.__pet.push({ url: u, metodo: m, cuerpo });
    if (o.falla && u.indexOf(o.falla) >= 0) return { ok: false, status: 500, text: async () => 'boom' };
    if (/shopping_list$/.test(u) && m === 'POST') w.__filas.push(Object.assign({ id: 90 + w.__filas.length, status: 'to_buy', added_at: new Date().toISOString() }, cuerpo));
    const id = /id=eq\.(\d+)/.exec(u);
    if (id && m === 'PATCH') { const f = w.__filas.find(x => String(x.id) === id[1]); if (f) Object.assign(f, cuerpo); }
    return { ok: true, status: 201, text: async () => '', json: async () => [] };
  };
  w.fetch = red; global.fetch = red;
  for (const f of ['src/events.js', 'src/bottle-profiles.js', 'src/product-hero.js', 'src/stock-checks.js', 'src/shopping-list.js',
    'src/num-pad.js', 'src/mobile-to-buy.js']) new Function(leer(f))();
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {} };
  new Function(leer('src/mobile-search.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'search';
  w.document.body.appendChild(host);
  def.mount(host);
  def.show(host);
  const inp = host.querySelector('#msInput');
  inp.value = 'white'; inp.oninput();
  return { w, host };
}
const tarjeta = (host, nombre) => Array.from(host.querySelectorAll('.m-res')).find(c => txt(c.querySelector('.m-fic-n')) === nombre);

(async () => {

grupo('1 · el botón, dentro de la tarjeta');
{
  const { w, host } = entorno();
  await esperar(30);
  const c = tarjeta(host, 'White Haven Sauvignon Blanc');
  const b = c && c.querySelector('[data-low]');
  prueba('cada tarjeta lleva "Running low"', !!b && txt(b) === 'Running low' && host.querySelectorAll('[data-low]').length === 2);
  prueba('dentro de la tarjeta, no debajo', !!(b && b.closest('.m-fic')));
  b.click(); await esperar(10);
  prueba('tocarlo abre el teclado, no la ficha', !!w.document.querySelector('#mSheet .m-kp') && !w.document.querySelector('#mSheet .m-ficha'));
  prueba('pregunta cuántas quedan, con lo que dice el LIVE', /How many are left\? Live says ≈4\.2/.test(txt(w.document.querySelector('#mSheet .m-kp-s'))), txt(w.document.querySelector('#mSheet .m-kp-s')));
  prueba('sin <input> (sin zoom de iOS), con ".5"', !w.document.querySelector('#mSheet input') && !!w.document.querySelector('#mSheet [data-k=".5"]'));
}

grupo('2 · guarda la verificación y la línea');
{
  const { w, host } = entorno();
  await esperar(30);
  tarjeta(host, 'White Haven Sauvignon Blanc').querySelector('[data-low]').click(); await esperar(10);
  const kp = w.document.getElementById('mSheet');
  kp.querySelector('[data-k="1"]').click();
  prueba('el botón dice lo que va a hacer', txt(kp.querySelector('#mKpSave')) === 'Add to the list · 1 left', txt(kp.querySelector('#mKpSave')));
  kp.querySelector('#mKpSave').click(); await esperar(40);
  const posts = w.__pet.filter(p => p.metodo === 'POST');
  const sc = posts.find(p => /stock_checks/.test(p.url)), sl = posts.find(p => /shopping_list/.test(p.url));
  prueba('la verificación: 1, con lo que decía el LIVE y quién', sc && sc.cuerpo.counted === 1 && sc.cuerpo.live_said === 4.2 && sc.cuerpo.checked_by === 'Ana', JSON.stringify(sc && sc.cuerpo));
  prueba('primero la verificación, después la lista', posts.indexOf(sc) < posts.indexOf(sl));
  prueba('la línea: de persona, "only 1 left", con quién', sl && sl.cuerpo.reason === 'person' && sl.cuerpo.note === 'only 1 left' && sl.cuerpo.added_by === 'Ana', JSON.stringify(sl && sl.cuerpo));
  prueba('cuánto: el "Order N" calculado con ESE número (no con el LIVE)', sl && sl.cuerpo.qty === 4, JSON.stringify(sl && sl.cuerpo));
  prueba('el LIVE se rehace', w.__caducado >= 1);
  prueba('el teclado se cierra', !w.document.getElementById('mSheet'));
  const c = tarjeta(host, 'White Haven Sauvignon Blanc');
  prueba('la tarjeta lo dice: en la lista, con quién', /On the list · Ana: only 1 left/.test(txt(c)) && !c.querySelector('[data-low]'), txt(c.querySelector('.m-fic-pie')));
  prueba('on_hand no se toca', w.state.master[0].onHand === 6);
}

grupo('3 · cuando algo falla');
{
  let { w, host } = entorno({ falla: 'stock_checks' });
  await esperar(30);
  tarjeta(host, 'White Haven Sauvignon Blanc').querySelector('[data-low]').click(); await esperar(10);
  let kp = w.document.getElementById('mSheet');
  kp.querySelector('[data-k="2"]').click(); kp.querySelector('#mKpSave').click(); await esperar(40);
  prueba('sin verificación, no se añade nada', !w.__pet.some(p => /shopping_list/.test(p.url) && p.metodo === 'POST'));
  prueba('y dice lo que contestó el servidor', /Not saved: HTTP 500/.test(txt(kp.querySelector('.m-kp-err'))), txt(kp.querySelector('.m-kp-err')));
  ({ w, host } = entorno({ falla: 'shopping_list' }));
  await esperar(30);
  tarjeta(host, 'White Haven Sauvignon Blanc').querySelector('[data-low]').click(); await esperar(10);
  kp = w.document.getElementById('mSheet');
  kp.querySelector('[data-k="2"]').click(); kp.querySelector('#mKpSave').click(); await esperar(40);
  prueba('si falla la lista, dice que el número sí se guardó', /the count of 2 was saved, but it was not added to the list/.test(txt(kp.querySelector('.m-kp-err'))), txt(kp.querySelector('.m-kp-err')));
}

grupo('4 · ya en la lista');
{
  const lista = [{ id: 7, item_name: 'White Haven Sauvignon Blanc', qty: 3, reason: 'person', note: 'only 1 left', added_by: 'Leo', status: 'to_buy' },
    { id: 8, item_name: 'White Claw Mango', qty: 2, reason: 'app', added_by: 'Mia', status: 'ordered', order_ref: 'CT-0215' }];
  let { w, host } = entorno({ lista });
  await esperar(30);
  let c = tarjeta(host, 'White Haven Sauvignon Blanc');
  prueba('lo que otro puso, con quién', /On the list · Leo: only 1 left/.test(txt(c)) && !c.querySelector('[data-low]'));
  prueba('lo pedido dice "Ordered", sin botones', /Ordered · CT-0215/.test(txt(tarjeta(host, 'White Claw Mango'))) && !tarjeta(host, 'White Claw Mango').querySelector('.m-fic-pie button'));
  c.querySelector('[data-low-x]').click(); await esperar(40);
  const p = w.__pet.filter(x => x.metodo === 'PATCH').pop();
  prueba('"Remove" quita la línea (pasa a removed), no la verificación', p && /shopping_list\?id=eq\.7/.test(p.url) && p.cuerpo.status === 'removed' && !w.__pet.some(x => /stock_checks/.test(x.url)), JSON.stringify(p));
  prueba('y la tarjeta vuelve a ofrecer "Running low"', !!tarjeta(host, 'White Haven Sauvignon Blanc').querySelector('[data-low]'));
  ({ w, host } = entorno({ lista, sin: ['ordenes'] }));
  await esperar(30);
  prueba('sin "Make and send orders", sin Remove', !host.querySelector('[data-low-x]') && /On the list/.test(txt(tarjeta(host, 'White Haven Sauvignon Blanc'))), txt(tarjeta(host, 'White Haven Sauvignon Blanc')).slice(-80) + ' / x=' + !!host.querySelector('[data-low-x]'));
}

grupo('5 · sin el permiso');
{
  const { host } = entorno({ sin: ['avisar_bajo'] });
  await esperar(30);
  prueba('sin "Report running low", no hay botón', !host.querySelector('[data-low]') && !!tarjeta(host, 'White Haven Sauvignon Blanc'));
}

grupo('6 · el permiso y la carga');
{
  const P = require(path.join(RAIZ, 'src/permisos.js'));
  prueba('"Report running low" en el catálogo', !!P.CATALOGO.find(p => p.k === 'avisar_bajo' && p.n === 'Report running low'));
  prueba('el bartender de fábrica lo tiene; el manager también', P.FABRICA.bartender.perms.indexOf('avisar_bajo') >= 0 && P.efectivos('manager', [], []).indexOf('avisar_bajo') >= 0);
  const html = leer('index.html');
  const pos = f => html.indexOf('src/' + f + '?v=');
  prueba('lo que usa el buscador se carga antes', ['stock-checks.js', 'shopping-list.js', 'num-pad.js', 'mobile-to-buy.js'].every(f => pos(f) > 0 && pos(f) < pos('mobile-search.js')));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
