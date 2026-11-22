#!/usr/bin/env node
/*
 * ── De la lista a la compra (fase 4) ──────────────────────────────────
 *
 * Axel, 2026-11-15, opción A: "Order N items" en To buy abre Quick
 * order de LOOP ya rellena con la lista; al guardar, esas líneas pasan a
 * "Ordered". Y su pregunta: "eso no les cambia el vendor a los
 * productos que no son de LOOP, ¿cierto?". Lo que se protege, con Quick
 * order DE VERDAD (mobile-quick.js) y la lista de verdad:
 *   1. precargar: LOOP, las líneas con su cantidad, y el proveedor de
 *      cada producto en el inventario NO cambia.
 *   2. Al guardar, las líneas que siguen en el borrador pasan a ordered,
 *      con la orden y la cantidad pedida DE VERDAD; las quitadas del
 *      borrador siguen por comprar.
 *   3. Si marcar falla, se dice (la orden ya existe).
 *   4. Cambiar de proveedor suelta la lista: no se marca nada.
 *   5. To buy: el botón, y lo pedido se enseña hasta que llega su orden.
 *
 *   node tools/test-pedir-lista.js
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

function quick(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.confirm = () => true;
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.state = { master: [
    { item: 'White Haven Sauvignon Blanc', vendor: 'BREAKTHRU', code: 'WH', onHand: 1, suggested: 5, value: 12 },
    { item: "Dad's Hat Rye", vendor: 'LOOP', code: 'DH', onHand: 0, suggested: 3, value: 30 }
  ] };
  w.BarStockGuest = { puede: () => true, nombre: () => 'Axel' };
  w.BarStockVendorDelivery = { llegadaDe: async () => null, fecha: (x) => x };
  w.__guardadas = [];
  w.BarStockQuickOrder = {
    vendors: () => ['LOOP', 'SOUTHERN'], porCorreo: (v) => v !== 'LOOP',
    save: async (d) => { w.__guardadas.push(d); return { entrada: { id: 'ord-77', totalUnits: d.items.reduce((s, x) => s + x.qty, 0), subtotal: 0 } }; }
  };
  w.__pet = [];
  w.fetch = async (url, op) => {
    w.__pet.push({ url: String(url), metodo: op && op.method, cuerpo: op && op.body ? JSON.parse(op.body) : null });
    if (o.falla) return { ok: false, status: 500, text: async () => 'boom' };
    return { ok: true, status: 204, text: async () => '' };
  };
  w.__ido = [];
  let def = null;
  w.BarStockMobile = Object.assign({ register(d) { def = d; }, ir: (x) => w.__ido.push(x) }, require('./lib-cabecera'));
  w.__secc = [];
  w.BarStockMobileOrders = { abrirSeccion: (x) => w.__secc.push(x) };
  for (const f of ['src/events.js', 'src/shopping-list.js', 'src/mobile-quick.js']) w.eval(leer(f));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'quick';
  w.document.body.appendChild(host);
  return { w, host, def };
}
const LISTA = [{ id: 11, item: 'White Haven Sauvignon Blanc', qty: 3 }, { id: 12, item: "Dad's Hat Rye", qty: 2 }];
async function guardar(w, host) {
  host.querySelector('#mqMain').click(); await esperar(20);
  const ya = w.document.querySelector('#mSheet [data-ql="ya"]');
  if (ya) ya.click();
  await esperar(40);
}

(async () => {

grupo('1 · precargar');
{
  const { w, host, def } = quick();
  const r = w.BarStockMobileQuick.precargar(LISTA.concat([{ id: 13, item: 'Ghost Gin', qty: 1 }]));
  def.mount(host);
  prueba('abre Quick order', w.__ido.includes('quick'));
  prueba('dice lo que ya no está en el inventario', r.faltan.length === 1 && r.faltan[0] === 'Ghost Gin', JSON.stringify(r));
  prueba('como LOOP', !!host.querySelector('[data-qv="LOOP"].on'));
  prueba('con las líneas y su cantidad', /White Haven Sauvignon Blanc/.test(txt(host)) && /Dad's Hat Rye/.test(txt(host)), txt(host).slice(0, 200));
  prueba('el proveedor del producto NO cambia (BREAKTHRU sigue BREAKTHRU)', w.state.master[0].vendor === 'BREAKTHRU');
}

grupo('2 · guardar marca las líneas');
{
  const { w, host, def } = quick();
  w.BarStockMobileQuick.precargar(LISTA);
  def.mount(host);
  await guardar(w, host);
  const g = w.__guardadas[0];
  prueba('se guarda la orden de LOOP con las dos', g && g.vendor === 'LOOP' && g.items.length === 2, JSON.stringify(g && g.items.map(x => x.item)));
  prueba('la línea de la orden dice LOOP; el inventario no', g && g.items[0].vendor === 'LOOP' && w.state.master[0].vendor === 'BREAKTHRU');
  const p = w.__pet.filter(x => x.metodo === 'PATCH');
  prueba('las dos líneas pasan a ordered, con la orden y quién', p.length === 2 && p.every(x => x.cuerpo.status === 'ordered' && x.cuerpo.order_ref === 'ord-77' && x.cuerpo.status_by === 'Axel'), JSON.stringify(p.map(x => x.cuerpo)));
  prueba('con la cantidad pedida', p.some(x => /id=eq\.11/.test(x.url) && x.cuerpo.qty === 3) && p.some(x => /id=eq\.12/.test(x.url) && x.cuerpo.qty === 2));
  prueba('"Done" vuelve a To buy', (() => { const b = host.querySelector('#mqDone'); if (b) b.click(); return w.__secc.includes('buy'); })(), JSON.stringify(w.__secc));
}

grupo('3 · lo quitado del borrador sigue por comprar');
{
  const { w, host, def } = quick();
  w.BarStockMobileQuick.precargar(LISTA);
  def.mount(host);
  const quitar = Array.from(host.querySelectorAll('[data-qx], [data-qrm], .m-qk-x, button[aria-label^="Remove"]'))[0];
  if (quitar) { quitar.click(); await esperar(10); }
  await guardar(w, host);
  const p = w.__pet.filter(x => x.metodo === 'PATCH');
  prueba('sólo se marca lo que se pidió', !!quitar && p.length === 1, (quitar ? '' : 'sin botón de quitar · ') + p.length + ' marcadas');
}

grupo('4 · si marcar falla, se dice');
{
  const { w, host, def } = quick({ falla: true });
  w.BarStockMobileQuick.precargar(LISTA);
  def.mount(host);
  await guardar(w, host);
  prueba('la orden se guardó igual', w.__guardadas.length === 1);
  prueba('y avisa de que la lista no se actualizó', /To buy list was not updated \(HTTP 500/.test(txt(host)), txt(host).slice(0, 200));
}

grupo('5 · cambiar de proveedor suelta la lista');
{
  const { w, host, def } = quick();
  w.BarStockMobileQuick.precargar(LISTA);
  def.mount(host);
  host.querySelector('[data-qv="SOUTHERN"]').click(); await esperar(10);
  prueba('el borrador se vacía (como siempre al cambiar)', !/White Haven/.test(txt(host)));
  prueba('y no se marca nada', !w.__pet.some(x => x.metodo === 'PATCH'));
}

grupo('6 · To buy: el botón, y lo pedido hasta que llega');
{
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  const futuro = new Date(Date.now() + 2 * 864e5).toISOString(), pasado = new Date(Date.now() - 3600e3).toISOString();
  w.state = { master: [], orderHistory: [{ id: 'ord-1', vendor: 'LOOP', poNumber: 'CT-0220', arrivesAt: futuro }, { id: 'ord-2', vendor: 'LOOP', poNumber: 'CT-0219', arrivesAt: pasado }] };
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-1' };
  let perm = true;
  w.BarStockGuest = { puede: () => perm, nombre: () => 'Axel' };
  let filas = [
    { id: 1, item_name: 'A', qty: 2, reason: 'app', added_by: 'Mia', status: 'to_buy' },
    { id: 2, item_name: 'B', qty: 3, reason: 'app', status: 'ordered', order_ref: 'ord-1', status_by: 'Axel', status_at: new Date().toISOString() },
    { id: 3, item_name: 'C', qty: 1, reason: 'app', status: 'ordered', order_ref: 'ord-2', status_at: pasado }
  ];
  w.BarStockRest = { leerTodo: async () => filas.map(f => Object.assign({}, f)) };
  w.__pre = null;
  w.BarStockMobileQuick = { precargar: (x) => { w.__pre = x; return { ok: true, faltan: [] }; } };
  for (const f of ['src/events.js', 'src/shopping-list.js', 'src/num-pad.js', 'src/mobile-to-buy.js']) w.eval(leer(f));
  const TB = w.BarStockMobileToBuy;
  const host = w.document.createElement('div'); host.dataset.sec = 'buy'; w.document.body.appendChild(host);
  TB.montar(host); await esperar(30);
  const b = host.querySelector('[data-tb-go]');
  // Abajo, fijo donde Done (Axel, 2026-11-22: "debe ir abajo como
  // Done"): el último de la pestaña, tras su hueco. Antes iba arriba.
  prueba('"Order 1 item", al final, tras su hueco', !!b && txt(b) === 'Order 1 item' && host.lastElementChild === b &&
    !!b.previousElementSibling && b.previousElementSibling.classList.contains('m-tx-hueco'), b ? txt(b) : 'sin botón');
  b.click();
  prueba('abre Quick order con lo que hay por comprar', w.__pre && w.__pre.length === 1 && w.__pre[0].id === 1 && w.__pre[0].qty === 2, JSON.stringify(w.__pre));
  const pedidas = Array.from(host.querySelectorAll('.es-pedida'));
  prueba('lo pedido que no ha llegado sale, con su orden y su llegada', pedidas.length === 1 && /LOOP · CT-0220 · .* · Axel · arrives /.test(txt(pedidas[0])), pedidas.map(txt).join(' | '));
  prueba('lo que ya llegó, no', !/CT-0219/.test(txt(host)) && TB.deProducto('C') === null);
  filas = filas.filter(f => f.status !== 'to_buy');
  await TB.cargar(); await esperar(10);
  prueba('todo pedido: la pestaña sigue, con lo pedido dentro', TB.visible() && TB.cuantos() === 0 && !host.querySelector('[data-tb-go]'));
  filas = filas.filter(f => f.order_ref !== 'ord-1');
  await TB.cargar(); await esperar(10);
  prueba('y cuando llega todo, se va', !TB.visible());
  perm = false;
  filas = [{ id: 1, item_name: 'A', qty: 2, reason: 'app', status: 'to_buy' }];
  await TB.cargar(); await esperar(10);
  prueba('sin "Make and send orders", sin botón', !host.querySelector('[data-tb-go]'));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
