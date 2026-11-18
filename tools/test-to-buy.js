#!/usr/bin/env node
/*
 * ── To buy: la lista de compras en Orders ─────────────────────────────
 *
 * Axel, 2026-11-15, sobre lámina. Lo que se protege, con Orders DE
 * VERDAD (mobile-orders.js) y la lista de verdad (mobile-to-buy.js):
 *   1. La pestaña "To buy" va ANTES de Open y SÓLO con algo por
 *      comprar; vacía, las tres de siempre.
 *   2. Cada línea: cuánto, quién, cuándo y por qué. −/+ y el número que
 *      se toca (teclado, sin <input>), que guardan la cantidad; no se
 *      baja de 1 (quitar es la ✕).
 *   3. La ✕ pasa la línea a `removed` (no borra); vaciada, la pestaña
 *      se va y Orders vuelve a Open.
 *   4. Lo ya pedido no lleva ✕ ni −/+. Sin "Make and send orders", se
 *      lee igual, sin botones.
 *   5. Una lectura que llega tarde no pinta la lista encima de Open.
 *   6. La lista: cambiar la cantidad y cuánto pedir de un producto.
 *   7. El teclado: el número de partida se sustituye al primer toque; una
 *      cantidad no admite 0 ni decimales (sin la tecla del punto).
 *
 *   node tools/test-to-buy.js
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
const esperar = ms => new Promise(r => setTimeout(r, ms));
const txt = (el) => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';

const LINEAS = () => [
  { id: 11, item_name: "Dad's Hat Rye", qty: 2, reason: 'app', note: null, added_by: 'Mia', added_at: '2026-11-15T02:40:00Z', status: 'to_buy' },
  { id: 12, item_name: 'White Haven Sauvignon Blanc', qty: 3, reason: 'person', note: 'only 1 left', added_by: 'Ana', added_at: '2026-11-15T00:15:00Z', status: 'to_buy' },
  { id: 13, item_name: 'Buffalo Trace', qty: 1, reason: 'app', note: null, added_by: 'Mia', added_at: '2026-11-14T20:00:00Z', status: 'ordered', order_ref: 'ord-14' }
];

function montar(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {};
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.state = { master: [], orderHistory: [{ id: 'ord-14', vendor: 'LOOP', poNumber: 'CT-0214', arrivesAt: new Date(Date.now() + 864e5).toISOString() }] };
  w.getActiveVendors = () => [];
  w.getOrderRowsForVendor = () => [];
  w.computeOrderSubtotal = () => 0;
  w.BarStockToast = { show: (t) => { (w.__avisos = w.__avisos || []).push(t); } };
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-1' };
  w.BarStockGuest = { puede: (k) => (o.sin || []).indexOf(k) < 0, nombre: () => 'Ana', activo: () => false };
  w.__filas = (o.lista || LINEAS()).slice();
  w.__pet = [];
  w.__lento = 0;
  w.BarStockRest = { leerTodo: async () => {
    if (w.__lento) await esperar(w.__lento);
    return w.__filas.filter(f => f.status === 'to_buy' || f.status === 'ordered').map(f => Object.assign({}, f));
  } };
  w.fetch = async (url, op) => {
    const cuerpo = op && op.body ? JSON.parse(op.body) : null;
    w.__pet.push({ url: String(url), metodo: op && op.method, cuerpo });
    const m = /id=eq\.(\d+)/.exec(String(url));
    if (m && op && op.method === 'PATCH') {
      const f = w.__filas.find(x => String(x.id) === m[1]);
      if (f) Object.assign(f, cuerpo);
    }
    return { ok: true, status: 204, text: async () => '' };
  };
  let def = null;
  w.BarStockMobile = Object.assign({ register(d) { def = d; }, refrescarBadges() {}, ir() {},
    enBanda: () => true, alVolverBanda() {}, salirBanda() {} }, require('./lib-cabecera'));
  w.BarStockMobileHistory = { montar(h) { h.innerHTML = '<div class="sent">sent</div>'; }, enDetalle: () => false, reiniciar() {} };
  w.BarStockMobileInvoices = { montar(h) { h.innerHTML = '<div class="inv">inv</div>'; }, enDetalle: () => false, reiniciar() {}, resumen: () => ({ sueltas: 0 }) };
  for (const f of ['src/events.js', 'src/shopping-list.js', 'src/num-pad.js', 'src/mobile-to-buy.js', 'src/mobile-orders.js']) w.eval(leer(f));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on';
  host.dataset.screen = 'orders';
  w.document.body.appendChild(host);
  def.mount(host);
  def.show(host);
  return { w, host, def };
}
const pestanas = (host) => Array.from(host.querySelectorAll('#moSeg [data-sec]')).map(b => b.dataset.sec);
const linea = (host, nombre) => Array.from(host.querySelectorAll('.m-tb-l')).find(l => txt(l.querySelector('.m-tb-n')) === nombre);

(async () => {

grupo('1 · la pestaña, delante y sólo con algo');
{
  const { w, host } = montar({ lista: [] });
  await esperar(20);
  prueba('lista vacía: las tres de siempre', JSON.stringify(pestanas(host)) === '["open","sent","inv"]', JSON.stringify(pestanas(host)));
  const t = montar();
  await esperar(20);
  prueba('con algo: "To buy" primero', JSON.stringify(pestanas(t.host)) === '["buy","open","sent","inv"]', JSON.stringify(pestanas(t.host)));
  prueba('con su contador: lo que hay por comprar (no lo pedido)', /To buy\s*2/.test(txt(t.host.querySelector('[data-sec="buy"]'))), txt(t.host.querySelector('[data-sec="buy"]')));
  prueba('entrar por la pestaña sigue cayendo en Open', t.host.querySelector('[data-sec="open"]').classList.contains('on'));
}

grupo('2 · las líneas: cuánto, quién, por qué, y ajustar');
{
  const { w, host } = montar();
  await esperar(20);
  host.querySelector('[data-sec="buy"]').click(); await esperar(20);
  const d = linea(host, "Dad's Hat Rye"), a = linea(host, 'White Haven Sauvignon Blanc');
  prueba('una línea por producto por comprar', !!d && !!a, txt(host));
  prueba('lo de la app dice "Running out" y quién', /Running out · Mia · Sat/.test(txt(d.querySelector('.m-tb-s'))), txt(d.querySelector('.m-tb-s')));
  prueba('lo de una persona, su nota y quién', /only 1 left · Ana/.test(txt(a.querySelector('.m-tb-s'))), txt(a.querySelector('.m-tb-s')));
  prueba('el número es un botón, no un <input> (sin zoom de iOS)', !host.querySelector('.m-tb-l input') && !!d.querySelector('[data-tb-num]'));
  d.querySelector('[data-tb-q="1"]').click(); await esperar(20);
  const p = w.__pet.filter(x => x.metodo === 'PATCH').pop();
  prueba('+ guarda la cantidad nueva', p && /shopping_list\?id=eq\.11/.test(p.url) && p.cuerpo.qty === 3 && p.cuerpo.status_by === 'Ana', JSON.stringify(p));
  prueba('y la línea la enseña', txt(linea(host, "Dad's Hat Rye").querySelector('[data-tb-num]')) === '3');
  const n = w.__pet.length;
  linea(host, 'Buffalo Trace') || null;
  w.__filas.find(x => x.id === 12).qty = 1;
  await w.BarStockMobileToBuy.cargar(); await esperar(10);
  linea(host, 'White Haven Sauvignon Blanc').querySelector('[data-tb-q="-1"]').click(); await esperar(20);
  prueba('− no baja de 1: quitar es la ✕', w.__pet.length === n, w.__pet.length + ' peticiones');
  linea(host, "Dad's Hat Rye").querySelector('[data-tb-num]').click(); await esperar(10);
  const kp = w.document.getElementById('mSheet');
  prueba('tocar el número abre el teclado, sin el punto', !!kp && !kp.querySelector('[data-k="."]') && !kp.querySelector('[data-k=".5"]'));
  kp.querySelector('[data-k="6"]').click();
  prueba('el número de partida se sustituye al primer toque', txt(kp.querySelector('.m-kp-n')) === '6', txt(kp.querySelector('.m-kp-n')));
  kp.querySelector('#mKpSave').click(); await esperar(20);
  const p2 = w.__pet.filter(x => x.metodo === 'PATCH').pop();
  prueba('y guarda lo tecleado', p2 && p2.cuerpo.qty === 6 && !w.document.getElementById('mSheet'), JSON.stringify(p2));
}

grupo('3 · quitar');
{
  const { w, host } = montar({ lista: [LINEAS()[0]] });
  await esperar(20);
  host.querySelector('[data-sec="buy"]').click(); await esperar(20);
  linea(host, "Dad's Hat Rye").querySelector('[data-tb-x]').click(); await esperar(30);
  const p = w.__pet.filter(x => x.metodo === 'PATCH').pop();
  prueba('la ✕ la pasa a removed, con quién (no se borra)', p && p.cuerpo.status === 'removed' && p.cuerpo.status_by === 'Ana' && !w.__pet.some(x => x.metodo === 'DELETE'), JSON.stringify(p));
  prueba('vacía, la pestaña se va', JSON.stringify(pestanas(host)) === '["open","sent","inv"]', JSON.stringify(pestanas(host)));
  prueba('y Orders vuelve a Open', host.querySelector('[data-sec="open"]').classList.contains('on') && !host.querySelector('.m-tb-l'));
}

grupo('4 · lo pedido, y sin permiso');
{
  let { host } = montar();
  await esperar(20);
  host.querySelector('[data-sec="buy"]').click(); await esperar(20);
  const b = linea(host, 'Buffalo Trace');
  prueba('lo pedido sale aparte, con su orden', !!b && /LOOP · CT-0214/.test(txt(b)) && /Ordered · 1/.test(txt(host)), txt(b));
  prueba('sin ✕ ni −/+: sale solo cuando llega', !b.querySelector('button') && /1 ordered/.test(txt(b)), txt(b));
  ({ host } = montar({ sin: ['ordenes'] }));
  await esperar(20);
  host.querySelector('[data-sec="buy"]').click(); await esperar(20);
  prueba('sin "Make and send orders": se lee, sin botones', !!linea(host, "Dad's Hat Rye") && !host.querySelector('.m-tb-l button') && /2 to buy/.test(txt(linea(host, "Dad's Hat Rye"))));
}

grupo('5 · una lectura tardía no pinta encima de Open');
{
  const { w, host } = montar();
  await esperar(20);
  host.querySelector('[data-sec="buy"]').click(); await esperar(20);
  w.__lento = 40;
  w.BarStockMobileToBuy.cargar();
  host.querySelector('[data-sec="open"]').click(); await esperar(80);
  prueba('Open sigue siendo Open', host.querySelector('[data-sec="open"]').classList.contains('on') && !host.querySelector('.m-tb-l'), txt(host).slice(0, 120));
}

grupo('6 · la lista (shopping-list.js)');
{
  const { w } = montar({ lista: [] });
  const L = w.BarStockShoppingList;
  prueba('cambiar no acepta 0', (await L.cambiar(5, 0, 'Ana')).ok === false);
  w.BarStockLiveCache = { pedir: () => 4, cuanto: () => 1 };
  prueba('cuánto pedir: el "Order N" de la app', L.sugerido({ item: 'X', suggested: 6 }) === 4);
  w.BarStockLiveCache = { pedir: () => null, cuanto: () => 1.5 };
  prueba('sin él, hasta el par', L.sugerido({ item: 'X', suggested: 6 }) === 5);
  w.BarStockLiveCache = { pedir: () => null, cuanto: () => 9 };
  prueba('y uno como mínimo', L.sugerido({ item: 'X', suggested: 6 }) === 1);
}

grupo('7 · en la app');
{
  const html = leer('index.html');
  const pos = f => html.indexOf('src/' + f + '?v=');
  prueba('num-pad antes de quien lo usa', pos('num-pad.js') > 0 && pos('num-pad.js') < pos('mobile-running-out.js') && pos('num-pad.js') < pos('mobile-to-buy.js'));
  prueba('To buy antes de Orders', pos('mobile-to-buy.js') > 0 && pos('mobile-to-buy.js') < pos('mobile-orders.js'));
  const ro = leer('src/mobile-running-out.js');
  // Desde el 2026-11-18 "I have enough" pasa por check-shelf.js (el
  // lápiz de cualquier producto), que es quien abre num-pad.
  const cs = leer('src/check-shelf.js');
  prueba('la revisión usa el teclado compartido, sin copia propia',
    /BarStockCheckShelf\.abrir/.test(ro) && /BarStockNumPad\.abrir/.test(cs) && !/m-kp-k/.test(ro) && !/m-kp-k/.test(cs));
  prueba('y el mismo "Order N"', /BarStockShoppingList\.sugerido/.test(ro));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
