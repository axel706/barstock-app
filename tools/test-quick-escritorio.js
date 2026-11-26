#!/usr/bin/env node
/*
 * ── Orders › Q-O: Quick order en el escritorio (lámina "Quick order ·
 *    desktop · in two steps", Axel 2026-11-26) ──
 *
 * Lo que no puede volver a pasar:
 *
 *   1. Quick order del header abre la pantalla Q-O ("Orders › Q-O"), no el
 *      diálogo de antes, y empieza por el proveedor (paso 1); UNKNOWN no
 *      es un proveedor.
 *   2. Paso 2: los productos de ESE proveedor a la vista (lo que Axel pidió
 *      conservar), en orden; + añade y vuelve a sumar; Enter en la búsqueda
 *      añade el primero; las líneas con −/+, precio y total; "added" a la
 *      izquierda.
 *   3. El borrador es el del teléfono (BarStockMobileQuick.escritorio): la
 *      misma forma de línea. Cambiar de proveedor con líneas pregunta.
 *   4. "Count in Live now?": sin contestar no se pasa a la revisión;
 *      "Next delivery" sólo con día de entrega.
 *   5. Review and send es la revisión de Open: coloca la orden con
 *      quickOrder, la llegada elegida y la HORA del borrador (un store run
 *      apuntado después), y deja el borrador vacío; "Q-O › SOUTHERN ›
 *      Review" en el título, y el proveedor vuelve a la orden sin perderla.
 *   6. Carga: desk-quick después de mobile-quick y antes de desk-orders.
 *
 *   node tools/test-quick-escritorio.js
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

function entorno() {
  const w = new JSDOM(`<!doctype html><body class="dk"><div class="wrap">
    <header class="bs-header card"><button id="dkMenu"></button><span id="dkSaludo"></span><span id="dkBusca"></span></header>
    <div class="card section-card" id="vendorSection"><div class="section-header-row">Orders</div><div id="vendorSectionBody"><button id="quickOrderBtn"></button></div></div>
  </div></body>`, { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  w.requestAnimationFrame = (f) => setTimeout(f, 0);
  w.scrollTo = () => {};
  w.__clics = [];
  w.document.getElementById('quickOrderBtn').addEventListener('click', () => w.__clics.push('quickOrderBtn'));
  const R = (item, vendor, onHand, suggested, value) => ({ item, code: item.slice(0, 3), vendor, onHand, suggested, value, toOrder: 0, orderOverride: '' });
  w.state = { master: [R('Kamora', 'SOUTHERN', 2, 6, 14.25), R("Tito's Vodka", 'SOUTHERN', 7, 18, 25.99), R('Bulleit', 'BREAKTHRU', 1, 5, 33.99), R('Aperol', 'SOUTHERN', 1, 4, 21)], orderHistory: [] };
  w.getActiveVendors = () => [];
  w.getOrderRowsForVendor = () => [];
  w.computeOrderSubtotal = (rows) => rows.reduce((s, r) => s + (Number(r.finalOrder) || 0) * (Number(r.value) || 0), 0);
  w.getEffectiveOrder = (r) => Number(r.orderOverride) || 0;
  w.autoOrder = (r) => r.toOrder;
  w.supportsManualFinalOrder = () => true;
  w.cloneOrderRow = (r) => Object.assign({}, r);
  w.uniqueOrderId = () => 'ord_q1';
  w.BarStockQuickOrder = { vendors: () => ['LOOP', 'SOUTHERN', 'BREAKTHRU', 'UNKNOWN'], porCorreo: (v) => v !== 'LOOP' };
  w.BarStockVendorLogo = { html: (v) => `<span class="logo-falso">${v}</span>`, color: () => '#888' };
  w.BarStockSugerencia = { preparar: async () => {}, para: () => null, antes: () => null, llegada: (v) => (v === 'SOUTHERN' ? 'Wed 4 PM' : null) };
  w.__sig = '2026-12-02T21:00:00.000Z';
  w.BarStockVendorDelivery = { llegadaDe: async (v) => (v === 'SOUTHERN' ? w.__sig : null), fecha: (iso) => 'Wed Dec 2 · 4 PM' };
  w.BarStockMobile = { register() {}, cabecera: (o) => '<div class="m-cab"><button type="button" class="m-atras" id="mAtras"></button><div class="m-cab-t"><div class="m-inv-t">' + (o.titulo || '') + '</div></div>' + (o.der ? '<div class="m-cab-d">' + o.der + '</div>' : '') + '</div>' };
  w.BarStockDeskShell = { activa: () => 'vendor', ir() {}, marcarLado() {} };
  w.__guardadas = []; w.__correos = [];
  w.persistOrderToSupabase = async (o) => { w.__guardadas.push(JSON.parse(JSON.stringify(o))); };
  w.loadOrdersFromCloud = async () => {};
  w.BarStockEmailOrder = { generarPdf: async () => 'PDF' };
  w.BarStockVendorDefaults = { getDefaults: async () => ({ vendor_email: 'rep@southern.test' }), setDefaults: async () => {} };
  w.fetch = async (u, o) => { const b = JSON.parse((o && o.body) || '{}'); w.__correos.push(b); return { ok: true, status: 200, json: async () => ({ ok: true, sent: b.to || [] }), text: async () => '{}' }; };
  w.eval(leer('src/mobile-orders.js'));
  w.eval(leer('src/mobile-quick.js'));
  w.eval(leer('src/desk-header.js'));
  w.eval(leer('src/desk-quick.js'));
  w.eval(leer('src/desk-orders.js'));
  return w;
}

(async () => {
  const w = entorno();
  const D = w.document;
  w.BarStockDeskHeader.marcar('vendor');
  D.getElementById('vendorSection').classList.add('bs-active-section'); await esperar(30);
  const cab = D.getElementById('dkCab');
  const caja = D.getElementById('dkOrd');
  const titulo = () => txt(cab.querySelector('.dkc-titulo span'));

  grupo('1. Quick order abre Q-O, empezando por el proveedor');
  cab.querySelector('.dkc-hueco[data-dkc="quick"]').click(); await esperar(20);
  prueba('la pantalla Q-O, no el diálogo de antes', caja.dataset.vista === 'quick' && !w.__clics.includes('quickOrderBtn'), caja.dataset.vista + ' ' + w.__clics);
  prueba('   "Orders › Q-O" en el título', titulo() === 'Orders › Q-O', titulo());
  const p1 = D.getElementById('dkqP1');
  const cartas = [...p1.querySelectorAll('[data-dkq="vendor"]')].map(b => b.dataset.v);
  prueba('paso 1: una tarjeta por proveedor, sin UNKNOWN', caja.dataset.paso === '1' && cartas.join(',') === 'LOOP,SOUTHERN,BREAKTHRU', cartas.join(','));
  prueba('   con cuántos productos y su entrega', /3 products · Wed 4 PM/.test(txt(p1.querySelector('[data-v="SOUTHERN"]'))), txt(p1.querySelector('[data-v="SOUTHERN"]')));

  grupo('2. Paso 2: los productos de ese proveedor, a la vista');
  p1.querySelector('[data-v="SOUTHERN"]').click(); await esperar(20);
  prueba('"Orders › Q-O › SOUTHERN", paso 2', caja.dataset.paso === '2' && titulo() === 'Orders › Q-O › SOUTHERN', titulo());
  const prods = () => [...D.querySelectorAll('#dkqPs .dkq-p')];
  prueba('sólo los de SOUTHERN, en orden, sin tocar nada', prods().map(b => txt(b.querySelector('.dkq-pn')).replace(/\d.*$/, '').trim()).join('|') === "Aperol|Kamora|Tito's Vodka", prods().map(b => txt(b)).join(' / '));
  prods()[1].click(); prods()[1].click(); await esperar(5);
  const lin = () => [...D.querySelectorAll('#dkqLineas .dkq-l')];
  prueba('+ añade y otra vez suma: Kamora × 2', lin().length === 1 && /Kamora/.test(txt(lin()[0])) && lin()[0].querySelector('[data-dkq="cant"]').value === '2');
  prueba('   y a la izquierda sale "added · 2"', /added · 2/.test(txt(prods()[1])));
  const q = D.getElementById('dkqQ');
  q.value = 'tito'; q.dispatchEvent(new w.Event('input', { bubbles: true }));
  prueba('la búsqueda deja los que casan', prods().length === 1 && /Tito/.test(txt(prods()[0])));
  q.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await esperar(5);
  prueba('Enter añade el primero que casa', lin().length === 2 && /Tito/.test(txt(lin()[1])));
  lin()[1].querySelector('[data-dkq="mas"]').click(); await esperar(5);
  prueba('−/+ en la línea', lin()[1].querySelector('[data-dkq="cant"]').value === '2');
  const pr = lin()[0].querySelector('[data-dkq="precio"]');
  pr.value = '15'; pr.dispatchEvent(new w.Event('change', { bubbles: true })); await esperar(5);
  prueba('el precio de la línea cambia su total', /\$30\.00/.test(txt(lin()[0])), txt(lin()[0]));
  prueba('el total abajo: botellas y dinero', /\$81\.98/.test(txt(D.getElementById('dkqPie'))) && /4 bottles/.test(txt(D.getElementById('dkqPie'))), txt(D.getElementById('dkqPie')));

  grupo('3. El borrador es el del teléfono');
  const QE = w.BarStockMobileQuick.escritorio;
  const b = QE.borrador();
  prueba('mismo proveedor y mismas líneas, con la forma de siempre (qty, toOrder, orderOverride, finalOrder)', b.vendor === 'SOUTHERN' && b.items.length === 2 && b.items.every(x => x.qty === x.toOrder && x.qty === x.orderOverride && x.qty === x.finalOrder && x.quickOrder));
  w.BarStockDialog = { confirmar: async () => false };
  caja.dataset.paso = '1'; w.BarStockDeskQuick.paso1(); await esperar(5);
  D.querySelector('#dkqP1 [data-v="BREAKTHRU"]').click(); await esperar(10);
  prueba('cambiar de proveedor con líneas pregunta, y sin confirmar no las borra', QE.borrador().vendor === 'SOUTHERN' && QE.borrador().items.length === 2);
  w.BarStockDeskQuick.paso2(); await esperar(10);

  grupo('4. "Count in Live now?" antes de revisar');
  const pie = () => D.getElementById('dkqPie');
  prueba('sin contestar, Review and send no se puede', pie().querySelector('[data-dkq="revisar"]').disabled);
  // Lámina "the footer", A: "Count in Live: Now | Wed 4 PM", en corto; la
  // fecha entera, en su aria-label.
  prueba('   la siguiente entrega, corta ("Wed 4 PM"), con la fecha entera para leerla (SOUTHERN tiene día)', !pie().querySelector('[data-v="luego"]').disabled && /Count in Live Now Wed 4 PM/.test(txt(pie())) && /Wed Dec 2/.test(pie().querySelector('[data-v="luego"]').getAttribute('aria-label') || ''), txt(pie()));
  // Un store run apuntado después: su fecha y hora.
  D.getElementById('dkqFecha').value = '2026-11-25'; D.getElementById('dkqHora').value = '15:10';
  D.getElementById('dkqFecha').dispatchEvent(new w.Event('change', { bubbles: true })); await esperar(10);
  pie().querySelector('[data-v="ya"]').click(); await esperar(5);
  prueba('"Yes, it\'s here" elegido, y ya se puede', pie().querySelector('[data-v="ya"]').classList.contains('on') && !pie().querySelector('[data-dkq="revisar"]').disabled);

  grupo('5. Review and send: la revisión de Open');
  pie().querySelector('[data-dkq="revisar"]').click(); await esperar(30);
  const det = D.getElementById('dkoDet');
  prueba('la revisión, con "Q-O › SOUTHERN › Review"', caja.dataset.vista === 'revision' && titulo() === 'Q-O › SOUTHERN › Review' && /Send this order/.test(txt(det)), titulo());
  prueba('   las cantidades del borrador (2× Kamora, 2× Tito\'s)', /2×\s*Kamora/.test(txt(det)) && /2×\s*Tito's Vodka/.test(txt(det)));
  cab.querySelector('[data-miga="qov"]').click(); await esperar(20);
  prueba('el proveedor del título vuelve a la orden, sin perderla', caja.dataset.vista === 'quick' && caja.dataset.paso === '2' && lin().length === 2);
  pie().querySelector('[data-v="ya"]').click(); pie().querySelector('[data-dkq="revisar"]').click(); await esperar(30);
  D.getElementById('mrGo').click(); await esperar(2600);
  const g = w.__guardadas[0];
  prueba('Place & send coloca UNA orden de quick order', w.__guardadas.length === 1 && g.quickOrder === true && g.vendor === 'SOUTHERN', JSON.stringify(w.__guardadas.map(x => x.vendor)));
  const cuando = new Date('2026-11-25T15:10:00').toISOString();
  prueba('   con la hora del borrador (el store run de ayer) y la llegada "ya"', g && g.createdAt === cuando && g.arrivesAt === cuando, g && (g.createdAt + ' · ' + g.arrivesAt));
  prueba('   manda el correo', w.__correos.length === 1 && (w.__correos[0].to || []).join(',') === 'rep@southern.test');
  prueba('   y el borrador queda vacío', QE.borrador().items.length === 0);
  D.getElementById('mrDone').click(); await esperar(20);
  prueba('Done: a Sent, donde acaba de aparecer', w.BarStockDeskOrders.vista() === 'sent');

  grupo('5a. "Orders" del título lleva a Orders, aunque el toque le llegue al botón');
  {
    // En el iPad, tocar "Orders" de "Orders › Q-O" llevaba al Home (Axel,
    // 2026-11-26): el trozo vive dentro del botón del Home y Safari puede
    // darle el toque al botón. Se simula así: el clic llega al botón, con
    // las coordenadas encima de "Orders".
    w.BarStockDeskOrders.abrirQuick(); await esperar(20);
    const mi = cab.querySelector('.dkc-miga[data-miga="orders"]');
    prueba('en Q-O, "Orders" es un enlace del título', !!mi && w.BarStockDeskOrders.vista() === 'quick');
    let alHome = 0;
    const S = w.BarStockDeskShell = w.BarStockDeskShell || {};
    const irAntes = S.ir; S.ir = (x) => { if (x === 'home') alHome++; else if (irAntes) irAntes(x); };
    if (mi) {
      mi.getBoundingClientRect = () => ({ left: 100, right: 170, top: 10, bottom: 40, width: 70, height: 30 });
      const bt = cab.querySelector('.dkc-titulo');
      bt.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 130, clientY: 25, detail: 1 }));
      await esperar(20);
    }
    prueba('   el toque en "Orders" lleva a Open, no al Home', w.BarStockDeskOrders.vista() === 'open' && alHome === 0, w.BarStockDeskOrders.vista() + ' · home ' + alHome);
    // Axel, 2026-11-26: "EL CHEVRON te saca, la palabra te lleva a esa
    // sección". En Open el título era texto plano ("Orders › SOUTHERN"), y
    // tocarlo entero sacaba al Home.
    const bt = cab.querySelector('.dkc-titulo');
    const chev = bt.querySelector('.ti');
    chev.getBoundingClientRect = () => ({ left: 60, right: 80, top: 12, bottom: 36, width: 20, height: 24 });
    w.BarStockDeskOrders.verSent(); await esperar(20);
    bt.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 160, clientY: 25, detail: 1 })); await esperar(20);
    prueba('   en Sent, la palabra "Orders" lleva a Orders (Open), no al Home', w.BarStockDeskOrders.vista() === 'open' && alHome === 0, w.BarStockDeskOrders.vista() + ' · home ' + alHome);
    bt.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 160, clientY: 25, detail: 1 })); await esperar(20);
    prueba('   en Open, tocar la palabra tampoco saca al Home', alHome === 0, 'home ' + alHome);
    bt.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 75, clientY: 25, detail: 1 })); await esperar(20);
    prueba('   el ‹ sí lleva al Home', alHome === 1, 'home ' + alHome);
    chev.dispatchEvent(new w.MouseEvent('click', { bubbles: true, detail: 1 })); await esperar(20);
    prueba('   también si el toque le llega al icono mismo', alHome === 2, 'home ' + alHome);
    S.ir = irAntes;
  }

  grupo('5b. Fecha, hora y nota, cada uno en su columna');
  {
    const CSSO = leer('styles/desk-orders.css');
    // Axel, en el iPad: "date time note están encimados". Safari les da a
    // date y time su estilo nativo y un ancho mínimo mayor que la columna.
    prueba('sin el estilo nativo y con min-width 0 (no se salen de su columna)',
      /#dkOrd \.dkq-meta label \{ min-width: 0; \}/.test(CSSO) && /#dkOrd \.dkq-meta input \{[^}]*min-width: 0;[^}]*-webkit-appearance: none;[^}]*appearance: none;/.test(CSSO));
    prueba('   y el valor de date y time centrado en su alto, como la nota', /#dkOrd \.dkq-meta input \{ line-height: 42px;/.test(CSSO) && /::-webkit-date-and-time-value \{[^}]*line-height: 42px;/.test(CSSO));
  }

  grupo('6. Carga');
  const iQ = INDEX.indexOf('src/desk-quick.js'), iMQ = INDEX.indexOf('src/mobile-quick.js'), iO = INDEX.indexOf('src/desk-orders.js');
  prueba('desk-quick después de mobile-quick y antes de desk-orders', iMQ > 0 && iQ > iMQ && iQ < iO);

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
