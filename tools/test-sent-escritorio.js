#!/usr/bin/env node
/*
 * ── Orders › Sent en el escritorio (lámina "Sent · desktop", A con el
 *    gasto en la columna, opción 1; Axel 2026-11-26) ──
 *
 * Lo que no puede volver a pasar:
 *
 *   1. Sent es una vista de Orders: History de la barra lateral la abre
 *      (y se marca), Open y Sent se cambian sin salir de la sección, y
 *      volver a Open suelta Sent.
 *   2. Es Sent del TELÉFONO (mobile-history en modo escritorio): la lista
 *      en la columna y la orden a la derecha a la vez, la primera elegida
 *      sola, sin la barra de búsqueda del teléfono (va en el header).
 *   3. La columna empieza con Spent this cycle (BarStockSpend.compute, la
 *      cuenta de History de antes), y "This cycle" dice cuántas órdenes:
 *      dos cifras de dinero distintas con el mismo nombre confundían.
 *   4. La orden: Resend y Reopen del teléfono, el JPG (o el CSV de LOOP)
 *      A LA VISTA —el Re-export de antes, que Axel pidió no perder— y ⋯
 *      con Compare to previous, Select to compare y Delete. Sin "Edit
 *      date": sólo cambiaba la copia del navegador.
 *   5. El header: la lupa busca por proveedor o producto, Show (All ·
 *      Short · Waiting) y el proveedor filtran, Export ofrece la orden y
 *      todas (JSON); en ⋯, Import y Reset.
 *   6. El teléfono no cambia: su lista sigue con su buscador y "This
 *      cycle · $".
 *   7. Carga y estilos: desk-sent antes de desk-orders; los del teléfono
 *      GENERADOS bajo #dkOrd[data-vista="sent"].
 *
 *   node tools/test-sent-escritorio.js
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
const esperar = (ms) => new Promise(r => setTimeout(r, ms || 0));
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

const INDEX = leer('index.html');
const CSS = leer('styles/desk-orders.css');
const GEN = leer('styles/desk-ficha.css');
const DS = leer('src/desk-sent.js');

const AHORA = Date.now(), H = 3600e3;
const iso = (t) => new Date(t).toISOString();
const ORDENES = [
  { id: 11, app_order_id: 'a11', vendor: 'SOUTHERN', po_number: 'CT-0224', created_at: iso(AHORA - 30 * H), arrives_at: iso(AHORA - 20 * H) },
  { id: 12, app_order_id: 'a12', vendor: 'LOOP', po_number: 'CT-0226', created_at: iso(AHORA - 10 * H), arrives_at: iso(AHORA - 8 * H) },
  { id: 5, app_order_id: 'a5', vendor: 'BREAKTHRU', po_number: 'CT-0200', created_at: iso(AHORA - 900 * H), arrives_at: null }
];
const LINEAS = [
  { vendor_order_id: 11, item_name: "Tito's Vodka", quantity: 6, unit_price: 25 },
  { vendor_order_id: 11, item_name: 'Kamora', quantity: 4, unit_price: 14 },
  { vendor_order_id: 12, item_name: 'Aperol', quantity: 2, unit_price: 21 },
  { vendor_order_id: 5, item_name: 'Bulleit', quantity: 3, unit_price: 33 }
];

function entorno() {
  const w = new JSDOM(`<!doctype html><body class="dk"><div class="wrap">
    <header class="bs-header card"><button id="dkMenu"></button><span id="dkSaludo"></span><span id="dkBusca"></span></header>
    <div class="card section-card" id="vendorSection"><div class="section-header-row">Orders</div><div id="vendorSectionBody"><button id="quickOrderBtn"></button></div></div>
    <div class="card section-card" id="historySection"><button id="ohExportBtn"></button><button id="ohImportBtn"></button><button id="ohResetBtn"></button></div>
  </div></body>`, { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  w.requestAnimationFrame = (f) => setTimeout(f, 0);
  w.__clics = [];
  w.document.querySelectorAll('button[id]').forEach(b => b.addEventListener('click', () => w.__clics.push(b.id)));
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.state = {
    master: [], placedOrders: [],
    orderHistory: [
      { id: 'a11', vendor: 'SOUTHERN', poNumber: 'CT-0224', exportType: 'jpg', items: [] },
      { id: 'a12', vendor: 'LOOP', poNumber: 'CT-0226', exportType: 'loop_csv', items: [] }
    ]
  };
  w.normalizeName = (s) => String(s || '').trim().toLowerCase();
  w.scrollTo = () => {};
  w.BarStockToast = { show() {} };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };
  w.BarStockCycle = { startedAt: () => new Date(AHORA - 48 * H), load: async () => {} };
  w.BarStockOrdersFaltaColumna = () => false;
  w.BarStockSpend = {
    compute: () => ({ now: { total: 1234, lines: 3 }, prev: { total: 1000, lines: 2 }, totalDelta: 234, totalPct: 23.4,
      cats: [{ name: 'Vodka', now: 800, prev: 600 }, { name: 'Liqueur', now: 434, prev: 400 }] }),
    color: (n) => (n === 'Vodka' ? '#38bdf8' : '#e879f9')
  };
  w.fetch = async (url) => {
    const u = String(url);
    const r = (filas) => ({ ok: true, status: 200, headers: { get: () => '0-0/' + filas.length }, json: async () => filas, text: async () => JSON.stringify(filas) });
    if (/vendor_order_items/.test(u)) return r(LINEAS);
    if (/vendor_orders/.test(u)) return r(ORDENES);
    return r([]);
  };
  // Lo de History de antes que la orden llama (order-history-ui e index.html).
  w.__llamadas = [];
  ['reExportHistoryOrder', 'compareWithPrevious', 'toggleCompareSelection', 'deleteHistoryOrder', 'openHistoryDateEdit']
    .forEach(n => { w[n] = (...a) => w.__llamadas.push(n + ':' + a[0]); });
  w.BarStockMobileOrders = { abrirEscritorio() {}, cerrarEscritorio() {}, listaResumen: () => [], cuentas: () => ({}), refresh() {} };
  w.eval(leer('src/vendor-delivery.js'));
  w.eval(leer('src/order-receipts.js'));
  w.eval(leer('src/mobile-history.js'));
  w.eval(leer('src/desk-header.js'));
  w.eval(DS);
  w.eval(leer('src/desk-orders.js'));
  // El armazón: lo que hace desk-shell.ir con History y Orders.
  w.BarStockDeskShell = {
    activa: () => (w.document.querySelector('.bs-active-section') || { id: 'homeSection' }).id.replace(/Section$/, ''),
    marcarLado() { w.__lado = w.BarStockDeskOrders.vista() === 'sent' ? 'history' : 'vendor'; },
    ir: (s) => { w.__ir = s; }
  };
  return w;
}

(async () => {
  const w = entorno();
  const D = w.document;
  const sec = D.getElementById('vendorSection');

  grupo('1. Sent es una vista de Orders: History la abre');
  prueba('desk-shell: History abre Orders en Sent (verSent), no la sección de antes',
    /id === 'history' && window\.BarStockDeskOrders && window\.BarStockDeskOrders\.verSent/.test(leer('src/desk-shell.js')) &&
    /BarStockDeskOrders\.verSent\(\);\s*\n\s*if \(typeof window\.bsOpenSection === 'function'\) window\.bsOpenSection\('vendor'\)/.test(leer('src/desk-shell.js')));
  prueba('   y la barra lateral marca History en Sent', /DO\.vista\(\) === 'sent'\) a = 'history'/.test(leer('src/desk-shell.js')));
  w.BarStockDeskOrders.verSent();
  w.BarStockDeskHeader.marcar('vendor');
  sec.classList.add('bs-active-section'); await esperar(60);
  const caja = D.getElementById('dkOrd');
  prueba('entra ya en Sent', caja.dataset.vista === 'sent' && w.BarStockDeskSent.abierto());
  const cab = D.getElementById('dkCab');
  const seg = cab.querySelector('.dkc-seg [data-vista="sent"]');
  prueba('   con Sent elegida en las vistas', !!seg && seg.classList.contains('on'));

  grupo('2. Es Sent del teléfono, lista y orden a la vez');
  const lista = D.getElementById('dksLista'), det = D.getElementById('dksDet');
  const filas = [...lista.querySelectorAll('.m-hcard')];
  prueba('las órdenes en la columna (este ciclo y los meses)', filas.length >= 2 && /SOUTHERN/.test(txt(lista)) && !!lista.querySelector('.m-hmes'), txt(lista).slice(0, 120));
  prueba('la primera elegida sola, a la derecha', filas[0].classList.contains('sel') && /SOUTHERN/.test(txt(det.querySelector('.m-hdk-cab'))), txt(det).slice(0, 80));
  {
    // Axel, 2026-11-26: "cambia items por products, me refiero a la
    // cantidad de botellas en lugar de la cantidad de códigos".
    const cel = [...det.querySelectorAll('.m-itot > div')].pop();
    prueba('   la tercera cifra son las BOTELLAS pedidas (6 + 4), "products", no los códigos', /^10\s*products$/.test(txt(cel)), txt(cel));
    prueba('   y la tarjeta de la lista dice lo mismo: "10 products", sin "items"', /10 products/.test(txt(filas[0])) && !/items?\b/.test(txt(lista)), txt(filas[0]));
  }
  prueba('cada columna rueda por su cuenta y la página no (alto de la pantalla, overflow propio)',
    /body\.dk #dkOrd\[data-vista="sent"\] \{[^}]*height: calc\(100dvh - var\(--dk-alto\) - 18px\)/.test(CSS) &&
    /#dkOrd :is\(\.dks-col, \.dks-det\) \{[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain/.test(CSS) &&
    /\.wrap:has\(> #vendorSection\.bs-active-section #dkOrd:is\(\[data-vista="sent"\][^)]*\)\) \{ padding-bottom: 0 !important; \}/.test(CSS));
  prueba('   las tres cifras se pegan arriba al rodar la orden, opacas', /\.dks-det > \.m-itot \{[^}]*position: sticky; top: 0;[^}]*background: #0e1628/.test(CSS));
  prueba('   los bloques de la orden no se aplastan (la lista con overflow se quedaba en una línea)', /#dkOrd \.dks-det > \* \{ flex: none; \}/.test(CSS));
  prueba('los meses son un rótulo (sin el fondo de botón de app.css) con aire arriba', /#dkOrd\[data-vista="sent"\] \.m-hmes \{[^}]*background: none !important;[^}]*margin: 22px 0 0/.test(CSS));
  prueba('   con sus tres cifras y cada línea pedida → recibida, con su dinero', !!det.querySelector('.m-itot') && det.querySelectorAll('.m-hln').length === 2 && !!det.querySelector('.m-hln-d') && !!det.querySelector('.m-hln-cols'));
  prueba('sin el buscador del teléfono (va en el header)', !lista.querySelector('#mhQ, .m-inv-bar2'));
  filas[1].click(); await esperar(10);
  prueba('tocar otra la abre a la derecha, y se marca', /LOOP/.test(txt(det.querySelector('.m-hdk-cab'))) && lista.querySelectorAll('.m-hcard.sel').length === 1 && /LOOP/.test(txt(lista.querySelector('.m-hcard.sel'))));

  grupo('3. Spent this cycle arriba de la columna; "This cycle" cuenta órdenes');
  const g = D.getElementById('dksGasto');
  prueba('el total, la tendencia y una barra por categoría', /Spent this cycle/i.test(txt(g)) && /\$1,234/.test(txt(g)) && /\+\$234 vs before/.test(txt(g)) && g.querySelectorAll('.dks-gb span').length === 2, txt(g));
  prueba('   lo de antes de cada categoría, al pasar el ratón', g.querySelector('.dks-gk span[data-antes="before $600"]') !== null);
  prueba('"This cycle · 2 orders", sin un segundo dinero', /This cycle · 2 orders/.test(txt(lista)) && !/This cycle · \$/.test(txt(lista)), txt(lista.querySelector('.m-lab')));

  grupo('4. La orden: Resend, JPG (o CSV), Reopen y ⋯');
  prueba('LOOP lleva CSV, no JPG', /CSV/.test(txt(det.querySelector('[data-dks="jpg"]'))));
  filas[0].click(); await esperar(10);
  const jpg = det.querySelector('[data-dks="jpg"]');
  prueba('SOUTHERN lleva JPG a la vista, junto a Resend y Reopen', !!jpg && /JPG/.test(txt(jpg)) && !!det.querySelector('#mhRe') && !!det.querySelector('#mhAbrir'));
  const pie = det.querySelector(':scope > .dks-pie');
  prueba('   los cuatro, abajo en el pie fijo (como Review and send de Open), no en la cabecera',
    !!pie && pie === det.lastElementChild && !!pie.querySelector('#mhRe') && !!pie.querySelector('#mhAbrir') && !!pie.querySelector('[data-dks="jpg"]') && !!pie.querySelector('[data-dks="mas"]') &&
    !det.querySelector('.m-hdk-cab button') && /#dkOrd \.dks-pie \{[^}]*position: sticky; bottom: 0;/.test(CSS) &&
    // Abajo del todo: media zona segura, no entera más relleno (Axel).
    /\.dks-pie \{[^}]*padding: 12px 0 max\(6px, calc\(env\(safe-area-inset-bottom\) \/ 2\)\);/.test(CSS));
  {
    // Resend abre la revisión de Open con esta orden (desk-orders), no
    // manda el correo directo al guardado.
    const antes = w.BarStockDeskOrders.reenviar;
    let pedido = null;
    w.BarStockDeskOrders.reenviar = (h, o) => { pedido = { h, o }; };
    det.querySelector('#mhRe').click();
    w.BarStockDeskOrders.reenviar = antes;
    prueba('   Resend abre la revisión con la orden del escritorio (no manda el correo directo)', !!pedido && pedido.h && pedido.h.id === 'a11' && pedido.o.vendor === 'SOUTHERN');
  }
  det.querySelector('#mhAbrir').click(); await esperar(10);
  prueba('   Reopen pide confirmar en el mismo pie', !!det.querySelector('.dks-pie .m-hacc-conf #mhSi') && !det.querySelector('.m-hdk-cab .m-hacc-conf'));
  det.querySelector('#mhNo').click(); await esperar(10);
  prueba('   y Cancel deja los botones donde estaban', !!det.querySelector('.dks-pie #mhRe'));
  // Tras Reopen / Cancel la orden se repintó: el botón es otro.
  det.querySelector('[data-dks="jpg"]').click();
  prueba('   y es el Re-export de antes, con la orden del escritorio', w.__llamadas.includes('reExportHistoryOrder:a11'), w.__llamadas.join(','));
  let menu = null;
  w.BarStockDeskHeader.menu = (a, items) => { menu = items; };
  det.querySelector('[data-dks="mas"]').click();
  const nombres = (menu || []).filter(i => i.label).map(i => i.label);
  prueba('⋯: Compare to previous, Select to compare y Delete order', nombres.join('|') === 'Compare to previous|Select to compare|Delete order', nombres.join('|'));
  prueba('   sin Edit date (sólo cambiaba la copia del navegador)', !nombres.some(n => /date/i.test(n)) && /saveHistoryDateEdit no escribe en la\s+\/\/ nube/.test(DS));
  menu.find(i => i.label === 'Compare to previous').fn();
  prueba('   Compare to previous es el de siempre', w.__llamadas.includes('compareWithPrevious:a11'));
  w.BarStockDialog = { confirmar: async () => false };
  await menu.find(i => i.label === 'Delete order').fn();
  prueba('   Delete pregunta antes (sin confirmar no borra)', !w.__llamadas.some(l => /^deleteHistoryOrder/.test(l)));
  w.BarStockDialog = { confirmar: async () => true };
  await menu.find(i => i.label === 'Delete order').fn();
  prueba('   y confirmado, borra la de siempre', w.__llamadas.includes('deleteHistoryOrder:a11'));
  prueba('Resend y Reopen, de cristal (no el color sólido del teléfono)', /#dkOrd\[data-vista="sent"\] \.dks-pie \.m-hacc button,/.test(leer('styles/desk-header.css')) && /#dkOrd\[data-vista="sent"\] \.dks-pie \.m-hacc button\.mal \{/.test(leer('styles/desk-header.css')));
  prueba('   en el orden de la lámina: Resend · JPG · Reopen · ⋯', /\.dks-pie #mhRe \{ order: 1; \}/.test(CSS) && /\.dks-pie \[data-dks="jpg"\] \{ order: 2; \}/.test(CSS) && /\.dks-pie #mhAbrir \{ order: 3; \}/.test(CSS) && /\.dks-pie \.dks-mas \{ order: 4; \}/.test(CSS));

  grupo('5. El header de Sent');
  prueba('la lupa (proveedor o producto), Show y proveedor', !!cab.querySelector('.dkc-afinar #dksQ') && !!cab.querySelector('.dkc-afinar [data-dkc="estado"]') && !!cab.querySelector('.dkc-afinar [data-dkc="prov"]'));
  const q = cab.querySelector('#dksQ');
  q.value = 'aperol'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await esperar(200);
  prueba('buscar un PRODUCTO deja sólo sus órdenes', [...lista.querySelectorAll('.m-hcard')].length === 1 && /LOOP/.test(txt(lista)), txt(lista).slice(0, 100));
  const q2 = cab.querySelector('#dksQ');
  q2.value = ''; q2.dispatchEvent(new w.Event('input', { bubbles: true })); await esperar(200);
  cab.querySelector('.dkc-hueco[data-dkc="estado"]').click();
  const shows = (menu || []).filter(i => i.label).map(i => i.label.split(' · ')[0]);
  prueba('Show: All · Short · Waiting, con sus cuentas', shows.join(',') === 'All,Short,Waiting' && /· \d/.test(menu[1].label), JSON.stringify(shows));
  menu.find(i => /^Waiting/.test(i.label)).fn(); await esperar(10);
  prueba('   Waiting filtra la lista', [...lista.querySelectorAll('.m-hcard')].length >= 1 && !!cab.querySelector('.dkc-hueco[data-dkc="estado"] .dkc-pl.en, [data-dkc="estado"].en, .dkc-afinar .en'));
  w.BarStockMobileHistory.verEscritorio({ filtro: 'all' });
  cab.querySelector('.dkc-hueco[data-dkc="prov"]').click();
  const provs = (menu || []).filter(i => i.label).map(i => i.label);
  prueba('el proveedor: All vendors y los que tienen órdenes', provs[0] === 'All vendors' && provs.includes('LOOP') && provs.includes('SOUTHERN'), provs.join(','));
  menu.find(i => i.label === 'LOOP').fn(); await esperar(10);
  prueba('   y filtra por él', [...lista.querySelectorAll('.m-hcard')].every(c => /LOOP/.test(txt(c))));
  w.BarStockMobileHistory.verEscritorio({ prov: '' });
  w.__clics.length = 0;
  cab.querySelector('.dkc-hueco[data-dkc="exportar"]').click();
  const exps = (menu || []).filter(i => i.label).map(i => i.label);
  prueba('Export: la orden elegida (JPG o CSV) y todas (JSON)', exps.length === 2 && /order · (JPG|CSV)/.test(exps[0]) && exps[1] === 'All orders (JSON)', exps.join('|'));
  menu.find(i => i.label === 'All orders (JSON)').fn();
  prueba('   todas es el Export orders de antes', w.__clics.includes('ohExportBtn'));
  const ex = w.BarStockDeskSent.CAB.extras().map(i => i.label);
  prueba('en ⋯ del header: Import y Reset orders', ex.join('|') === 'Import orders|Reset orders');

  grupo('Volver a Open suelta Sent');
  cab.querySelector('.dkc-seg [data-vista="open"]').click(); await esperar(10);
  prueba('la vista es Open y Sent está cerrado', caja.dataset.vista === 'open' && !w.BarStockDeskSent.abierto() && w.__lado === 'vendor');
  prueba('   y lo de Sent se esconde (CSS)', /#dkOrd:not\(\[data-vista="sent"\]\) :is\(\.dks-col, \.dks-det\) \{ display: none; \}/.test(CSS) && /#dkOrd\[data-vista="sent"\] :is\(\.dko-lista, \.dko-der\) \{ display: none; \}/.test(CSS));

  grupo('6. El teléfono no cambia');
  {
    const w2 = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
    Object.assign(w2, { BARSTOCK_CONFIG: w.BARSTOCK_CONFIG, state: { master: [], orderHistory: [] }, normalizeName: w.normalizeName, scrollTo() {},
      BarStockParIntelligence: w.BarStockParIntelligence, BarStockCycle: w.BarStockCycle, BarStockOrdersFaltaColumna: () => false, fetch: w.fetch });
    w2.console = { log() {}, warn() {}, error() {} };
    w2.eval(leer('src/vendor-delivery.js'));
    w2.eval(leer('src/order-receipts.js'));
    w2.eval(leer('src/mobile-history.js'));
    const host = w2.document.createElement('div');
    w2.document.body.appendChild(host);
    await w2.BarStockMobileHistory.montar(host);
    prueba('su lista sigue con su buscador y "This cycle · $"', !!host.querySelector('#mhQ') && /This cycle · \$/.test(txt(host)), txt(host).slice(0, 100));
    prueba('   y sus tarjetas dicen las botellas como "products", no "items"', /10 products/.test(txt(host)) && !/\bitems?\b/.test(txt(host)), txt(host).slice(0, 160));
  }

  grupo('7. Carga y estilos');
  const iS = INDEX.indexOf('src/desk-sent.js'), iO = INDEX.indexOf('src/desk-orders.js'), iH = INDEX.indexOf('src/mobile-history.js');
  prueba('desk-sent después de mobile-history y antes de desk-orders', iS > iH && iS < iO && iH > 0);
  prueba('los estilos de Sent del teléfono, generados bajo la vista', /#dkOrd\[data-vista="sent"\] \.m-hcard \{/.test(GEN) && /#dkOrd\[data-vista="sent"\] \.m-hs-corto \{/.test(GEN) && /#dkOrd\[data-vista="sent"\] \.m-itot \{/.test(GEN));
  {
    const { generar } = require('./compartir-ficha.js');
    prueba('   y al día (node tools/compartir-ficha.js)', generar() === GEN);
  }

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
