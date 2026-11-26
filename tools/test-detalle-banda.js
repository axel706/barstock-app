#!/usr/bin/env node
/*
 * ── Orders › Sent e Invoices: el detalle con su nombre en el header ──
 *
 * Axel, 2026-11-12, con una captura del detalle de LOOP en Sent: "la
 * misma historia para Sent e Invoices". Lo que se protege:
 *
 *   1. El nombre (el proveedor de la orden, o el de la factura) va en
 *      la banda, en el sitio del logo, y el botón de la izquierda (Time
 *      Machine) pasa a ser "atrás": como Settings y sus subsecciones.
 *      La página ya no pinta ni el título grande ni su chevron.
 *   2. Sent: Resend / Reopen son lo PRIMERO y se quedan pegados bajo el
 *      header desde que entras; la línea "PO … · sent …" va debajo y se
 *      va con la lista. Una orden vieja sin botones no pega nada.
 *   3. Invoices: los tres totales son lo primero y se quedan pegados;
 *      "invoice … · fecha · estado" va debajo.
 *   4. El atrás de la banda vuelve a la lista.
 *   5. Al volver a la lista de Orders, la banda suelta el nombre: si
 *      no, "LOOP" se quedaría encima de las pestañas.
 *   6. Lo pegado entra exactamente en su sitio: sin margen arriba, que
 *      lo haría subir al primer scroll (lo que Axel vio en Inventory).
 *
 *   node tools/test-detalle-banda.js
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

// La banda de mentira: lo que el armazón hace con enBanda / alVolverBanda /
// salirBanda, apuntado para mirarlo. La cabecera y alVolver son las de
// verdad (lib-cabecera), como en el resto de pruebas de estas pantallas.
function banda(w) {
  w.__banda = { titulo: null, atras: null, salidas: 0 };
  w.__fijados = [];
  w.BarStockBandDock = { fijar: (el) => w.__fijados.push(el) };
  return Object.assign({
    register() {}, ir() {}, refrescarBadges() {},
    enBanda: (t, sub) => { w.__banda.titulo = t; w.__banda.sub = sub || ''; return true; },
    alVolverBanda: (fn) => { w.__banda.atras = fn; },
    salirBanda: () => { w.__banda.titulo = null; w.__banda.sub = ''; w.__banda.atras = null; w.__banda.salidas++; }
  }, require('./lib-cabecera'));
}

// ── Sent ───────────────────────────────────────────────────────────
const AHORA = Date.now(), H = 3600e3;
const iso = (t) => new Date(t).toISOString();
const ORDENES = [
  { id: 2, app_order_id: 'a2', vendor: 'LOOP', po_number: 'CT-0213', created_at: iso(AHORA - 40 * H), subtotal: 100, arrives_at: iso(AHORA - H) },
  { id: 5, app_order_id: 'a5', vendor: 'SOUTHERN', po_number: 'CT-0200', created_at: iso(AHORA - 36 * H), subtotal: 50, arrives_at: null }
];
const LINEAS = [2, 5].map(id => ({ vendor_order_id: id, item_name: 'Item ' + id, quantity: 2, unit_price: 25 }));

async function sent() {
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  // Sólo la de LOOP está cargada en el escritorio: es la que tiene botones.
  w.state = { master: [], orderHistory: [{ id: 'a2', vendor: 'LOOP', items: [] }] };
  w.normalizeName = (s) => String(s || '').trim().toLowerCase();
  w.scrollTo = () => {};
  w.BarStockToast = { show() {} };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };
  w.BarStockCycle = { startedAt: () => new Date(AHORA - 48 * H), load: async () => {} };
  w.BarStockMobile = banda(w);
  w.fetch = async (url) => {
    const u = String(url);
    const r = (filas) => ({ ok: true, status: 200, headers: { get: () => '0-0/' + filas.length }, json: async () => filas, text: async () => JSON.stringify(filas) });
    if (/vendor_orders/.test(u)) return r(ORDENES);
    if (/vendor_order_items/.test(u)) return r(LINEAS);
    return r([]);
  };
  w.BarStockOrdersFaltaColumna = () => false;
  w.eval(leer('src/vendor-delivery.js'));
  w.eval(leer('src/order-receipts.js'));
  w.eval(leer('src/mobile-history.js'));
  const host = w.document.createElement('div');
  w.document.body.appendChild(host);
  await w.BarStockMobileHistory.montar(host);
  const abrir = (vendor) => [...host.querySelectorAll('.m-hcard')].find(c => c.textContent.includes(vendor)).click();
  return { w, host, abrir };
}

// ── Invoices ───────────────────────────────────────────────────────
const L = (o) => Object.assign({
  order_id: 'A', line_no: 1, invoice_date: '2026-10-27', invoice_number: '2689338',
  vendor_name: 'BREAKTHRU BEVERAGE', status: 'CLOSED',
  product_id: 'p1', vendor_item_name: 'Algo', unit_price: 10, quantity: 1, line_price: 10
}, o);

async function facturas() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.BarStockMobile = banda(w);
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.state = { master: [{ item: 'Tito’s Vodka 1.75L', vendor: 'BREAKTHRU', value: 20 }] };
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };
  w.BarStockWeeklyCycle = { resetAt: () => '2026-10-25T08:00:00Z', fmtDate: () => 'Oct 25', fechaInicioLocal: () => '2026-10-25' };
  const lineas = [L({ line_no: 1 }), L({ line_no: 2, product_id: 'p2', vendor_item_name: 'Otra' })];
  const f = async (u) => {
    const pag = (x) => ({ ok: true, headers: { get: () => '0-0/0' }, json: async () => (/offset=[1-9]/.test(u) ? [] : x), text: async () => '' });
    if (/marginedge_invoice_lines/.test(u)) return pag(/invoice_date=lt\./.test(u) ? [] : lineas);
    if (/marginedge_links/.test(u)) return pag([{ product_id: 'p1', item_name: 'Tito’s Vodka 1.75L' }]);
    return pag([]);
  };
  w.fetch = f; global.fetch = f;
  new Function(leer('src/marginedge-match.js'))();
  new Function(leer('src/marginedge-unclaimed.js'))();
  new Function(leer('src/mobile-invoices.js'))();
  const host = w.document.createElement('div');
  w.document.body.appendChild(host);
  await w.BarStockMobileInvoices.montar(host);
  await esperar(30);
  return { w, host };
}

(async () => {

grupo('Sent: el nombre en el header y los dos botones pegados');
{
  const { w, host, abrir } = await sent();
  abrir('LOOP');
  prueba('"LOOP" va a la banda', w.__banda.titulo === 'LOOP', String(w.__banda.titulo));
  prueba('la página no repite el título ni su chevron', !host.querySelector('.m-inv-t') && !host.querySelector('#mAtras'));
  // Resend y Reopen bajaron a donde va Done, en cristal (Axel,
  // 2026-11-21, opción B): Resend a lo ancho, Reopen redondo con su
  // icono. Arriba ya no se pega nada: la línea del PO es lo primero.
  // Arriba, la tira de totales de Invoices (Axel, 2026-11-21, opción B):
  // lo recibido, lo pedido y los productos, pegada bajo el header. La
  // línea chica del PO sube a la banda, bajo el nombre, con el estado.
  const prim = host.firstElementChild;
  prueba('la tira de totales es lo primero', !!prim && prim.classList.contains('m-itot'), prim && prim.outerHTML.slice(0, 80));
  // La tercera son las botellas pedidas, "products" (Axel, 2026-11-26:
  // contaba códigos); la orden de prueba pide 2.
  prueba('con lo recibido, lo pedido y los productos (botellas)', !!prim && /received/.test(txt(prim)) && /ordered/.test(txt(prim)) && /2\s*products/.test(txt(prim)), txt(prim));
  prueba('y se pega, marcada para Orders', w.__fijados[w.__fijados.length - 1] === prim && prim.classList.contains('m-det-fijo'));
  prueba('la línea del PO va a la banda, bajo el nombre', /^CT-0213 · \w{3} \w{3} \d+ · /.test(w.__banda.sub || ''), w.__banda.sub);
  prueba('y no se repite en la página', !host.querySelector('.m-hsub') && !/PO CT-0213/.test(txt(host)));
  prueba('los totales de abajo se fueron (están en la tira)', !host.querySelector('.m-htot'));
  const acc = host.querySelector('#mhAcc');
  prueba('los botones van al final, tras su hueco',
    !!acc && host.lastElementChild === acc && !!acc.previousElementSibling && acc.previousElementSibling.classList.contains('m-tx-hueco'));
  prueba('Resend y Reopen dentro', !!acc && !!acc.querySelector('#mhRe') && !!acc.querySelector('#mhAbrir'));
  const ab = host.querySelector('#mhAbrir');
  prueba('Reopen es el redondo: su icono y su nombre para quien no ve',
    !!ab && !!ab.querySelector('.ti') && ab.getAttribute('aria-label') === 'Reopen' && !txt(ab), ab && ab.outerHTML);
  prueba('siguen escondidos sin permiso de órdenes (clase m-hacc)', !!acc && acc.classList.contains('m-hacc'));

  // Reopen pide confirmar EN EL MISMO SITIO: el aviso y Cancel /
  // Delete and reopen abajo.
  host.querySelector('#mhAbrir').click();
  const conf = host.querySelector('#mhAcc');
  prueba('confirmar Reopen, abajo en el mismo sitio',
    !!conf && host.lastElementChild === conf && conf.classList.contains('m-hacc-conf') &&
    !!conf.querySelector('#mhSi') && !!conf.querySelector('#mhNo') && /Reopen deletes this order/.test(txt(conf)));
  prueba('y la tira sigue pegada', w.__fijados[w.__fijados.length - 1] === host.firstElementChild);
  conf.querySelector('#mhNo').click();
  prueba('Cancel vuelve a Resend y Reopen', !!host.querySelector('#mhAcc #mhRe'));
  // Al volver, los botones entran animados; al abrir el detalle, no
  // (Axel, 2026-11-21: "la acción necesita ser animada").
  prueba('y vuelven con su animación', host.querySelector('#mhAcc').classList.contains('vuelve'));

  const css = leer('styles/mobile-app.css');
  // El aviso flota sobre la lista: con la Tinta (62 %) se leían las
  // líneas de debajo a través de él, y heredaba el 800 grande de los
  // botones (captura de Axel, 2026-11-21). Opaco como las hojas, con su
  // letra, y sube desde los botones.
  const conf2 = (/#mScreens #mhAcc\.m-hacc-conf \{([^}]*)\}/.exec(css) || [])[1] || '';
  prueba('el aviso es opaco, como las hojas', /#0b1220/.test(conf2) && !/var\(--tinta\)/.test(conf2), conf2.trim());
  prueba('con la letra de un texto, no la de los botones', /font-size: var\(--m-small\)/.test(conf2) && /font-weight: 500/.test(conf2));
  prueba('y sube animado desde los botones', /animation: mHaccSube/.test(conf2) && /@keyframes mHaccSube/.test(css));
  prueba('los botones vuelven animados', /#mScreens #mhAcc\.vuelve \{[^}]*animation: mHaccVuelve/.test(css) && /@keyframes mHaccVuelve/.test(css));
  prueba('sin animación si se pide menos movimiento', /prefers-reduced-motion: reduce\) \{[^}]*#mhAcc[^}]*animation: none/.test(css));
  prueba('fijos donde Done', /#mScreens :is\([^)]*#mhAcc[^)]*\) \{\s*position: fixed;/.test(css));
  prueba('Resend con el cristal azul de Done', /body\.m-shell #mScreens :is\(#mRoDone, [^)]*#mhRe[^)]*\),\s*body\.m-shell #mTabs \.m-tab\.on \{\s*color: #f0f9ff; background: rgba\(56, 189, 248/.test(css));
  prueba('Reopen y Delete and reopen en cristal rojo', /body\.m-shell #mScreens :is\(#mhAbrir, #mhSi\) \{\s*color: #[0-9a-f]+; background: rgba\(239, 68, 68/.test(css));

  // Un repintado cualquiera (aquí, salir y volver a entrar) ya no la lleva.
  if (w.__banda.atras) w.__banda.atras();
  abrir('LOOP');
  prueba('un repintado después ya no anima', !!host.querySelector('#mhAcc') && !host.querySelector('#mhAcc.vuelve'));
  prueba('el atrás de la banda está puesto', typeof w.__banda.atras === 'function');
  if (w.__banda.atras) w.__banda.atras();
  prueba('y vuelve a la lista', !!host.querySelector('.m-hcard'));
}
{
  const { w, host, abrir } = await sent();
  abrir('SOUTHERN');
  prueba('una orden vieja, sin botones: su nota y nada abajo', !!host.querySelector('.m-hacc-no') && !host.querySelector('#mhAcc'));
  prueba('pero su nombre sí va a la banda', w.__banda.titulo === 'SOUTHERN');
}

grupo('Invoices: el proveedor en el header y los totales pegados');
{
  const { w, host } = await facturas();
  host.querySelector('.m-hcard').click();
  prueba('el proveedor va a la banda', w.__banda.titulo === 'BREAKTHRU BEVERAGE', String(w.__banda.titulo));
  prueba('la página no repite el título ni su chevron', !host.querySelector('.m-inv-t') && !host.querySelector('#mAtras'));
  const prim = host.firstElementChild;
  prueba('los tres totales son lo primero', !!prim && prim.classList.contains('m-itot'), prim && prim.className);
  prueba('y se piden pegados', w.__fijados[w.__fijados.length - 1] === prim);
  prueba('marcados para que Orders los vuelva a pegar tras su aviso', !!prim && prim.classList.contains('m-det-fijo'));
  prueba('la línea de la factura va a la banda, bajo el nombre', /^#2689338 · /.test(w.__banda.sub || ''), w.__banda.sub);
  prueba('y no se repite en la página', !host.querySelector('.m-hsub'));
  if (w.__banda.atras) w.__banda.atras();
  prueba('el atrás de la banda vuelve a la lista', !!host.querySelector('.m-hcard') && !host.querySelector('.m-itot'));
}

grupo('dentro de Orders, de verdad: Orders y Sent juntos');
{
  // Sent pinta el detalle (nombre a la banda, botones pegados) y DESPUÉS
  // avisa a Orders, que rehace su marco. Si el marco soltara la banda o
  // volviera a enganchar la lista sin bloque, deshacería lo que Sent
  // acaba de poner. Con las secciones de mentira de test-orders-screen
  // eso no se ve: aquí van las dos de verdad.
  const { w, host: _h } = await sent();
  _h.remove();
  // band-dock de mentira que recuerda lo ÚLTIMO que se pidió: eso es lo
  // que queda en pantalla.
  w.__ultimo = null;
  w.BarStockBandDock = {
    enganchar: (o) => { w.__ultimo = { pegado: o.pegado, nombre: o.nombre, siempre: !!o.siempre }; },
    fijar: (el) => { w.__ultimo = { pegado: el, nombre: '', siempre: true }; }
  };
  let def = null;
  w.BarStockMobile.register = (d) => { def = d; };
  w.eval(leer('src/mobile-orders.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'orders';
  w.document.body.appendChild(host);
  def.mount(host);
  host.querySelectorAll('#moSeg button')[1].click();
  await esperar(40);
  const card = [...host.querySelectorAll('.m-hcard')].find(c => c.textContent.includes('LOOP'));
  prueba('Sent sale dentro de Orders', !!card);
  card.click();
  await esperar(10);
  const bloque = host.querySelector('#moCuerpo').firstElementChild;
  prueba('después del aviso, "LOOP" sigue en la banda', w.__banda.titulo === 'LOOP', String(w.__banda.titulo));
  // Sin bloque pegado: el aviso no tiene nada que volver a pegar, y los
  // botones siguen abajo.
  prueba('y los botones siguen abajo, sin pestañas encima',
    !!host.querySelector('#moCuerpo > #mhAcc #mhRe') && !host.querySelector('#moSeg') && !!bloque && !bloque.querySelector('#mhRe'));
  w.__banda.atras && w.__banda.atras();
  await esperar(10);
  prueba('al volver a la lista, la banda suelta el nombre', w.__banda.titulo === null && !!host.querySelector('#moSeg'));
  prueba('y se vuelven a pegar las pestañas con "Orders"',
    !!w.__ultimo && w.__ultimo.pegado === host.querySelector('#moPeg') && w.__ultimo.nombre === 'Orders');
}

grupo('lo pegado entra en su sitio');
{
  const css = leer('styles/mobile-app.css').replace(/\/\*[\s\S]*?\*\//g, '');
  prueba('sin margen arriba al entrar acoplado',
    /\.m-dock-siempre\s+\.m-dock-pegado\s*\{[^}]*margin-top\s*:\s*0/.test(css));
  // "SOUTHERN GLAZER'S WINE & SPIRITS" en la banda salía cortado por los
  // DOS lados y sin "…" (Chromium, 2026-11-12): era una caja flex
  // centrada, y text-overflow no corta el texto suelto de una flex.
  const sec = (/\.m-band-seccion\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
  prueba('un nombre largo en la banda acaba en "…"',
    /display\s*:\s*block/.test(sec) && /text-align\s*:\s*center/.test(sec) && /text-overflow\s*:\s*ellipsis/.test(sec) && !/display\s*:\s*flex/.test(sec), sec.replace(/\s+/g, ' '));
  const bd = leer('src/band-dock.js');
  prueba('band-dock sabe pegar un bloque de un detalle', /function fijar\(el\)/.test(bd) && /BarStockBandDock = \{[^}]*\bfijar\b/.test(bd));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
