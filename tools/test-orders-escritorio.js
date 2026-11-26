#!/usr/bin/env node
/*
 * ── Orders en el escritorio (Axel, 2026-11-26, lámina "Orders ·
 * desktop", A) ───────────────────────────────────────────────────────────
 *
 * Lo que se protege:
 *
 *   1. La orden de la derecha es Open del TELÉFONO en modo escritorio
 *      (BarStockMobileOrders.abrirEscritorio): sin su marco (banda,
 *      pestañas, lista pegada), con sus líneas y su revisión. Lo que coloca
 *      y manda una orden vive en un solo sitio.
 *   2. Una sola lista de proveedores (listaResumen) para el resumen del
 *      teléfono y la columna del escritorio.
 *   3. La columna: cada proveedor con sus líneas, su total y lo suyo que no
 *      llega a su entrega; el elegido marcado; elegir otro pinta el suyo.
 *   4. El header de sitios fijos: Open · Sent (Sent lleva a History), la
 *      lupa, Export (azul, con el proveedor elegido) y Quick order (verde),
 *      y Order analysis en ⋯.
 *   5. El pie: el total y "Review and send", que es el botón del teléfono.
 *   6. Carga y estilos: antes de desk-shell, después de mobile-orders; los
 *      estilos de Open generados bajo #dkoDet.
 *
 *   node tools/test-orders-escritorio.js
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
const MO = leer('src/mobile-orders.js');
const DO = leer('src/desk-orders.js');
const DHJ = leer('src/desk-header.js');
const CSS = leer('styles/desk-orders.css');
const GEN = leer('styles/desk-ficha.css');

function entorno() {
  const w = new JSDOM(`<!doctype html><body class="dk"><div class="wrap">
    <header class="bs-header card"><button id="dkMenu"></button><span id="dkSaludo"></span><span id="dkBusca"></span></header>
    <div class="card section-card bs-active-section" id="vendorSection"><div class="section-header-row">Orders</div><div id="vendorSectionBody">
      <button id="quickOrderBtn"></button><button id="exportVendorCsvBtn"></button><button id="exportVendorXlsxBtn"></button>
      <button id="exportVendorJpgBtn"></button><button id="exportVendorLoopBtn"></button><button id="orderAnalysisBtn"></button></div></div>
    <div class="card section-card" id="historySection"></div>
  </div></body>`, { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  w.__clics = [];
  w.document.querySelectorAll('#vendorSectionBody button').forEach(b => b.addEventListener('click', () => w.__clics.push(b.id)));
  const R = (item, vendor, onHand, suggested, value) => ({ item, code: item.slice(0, 3), vendor, onHand, suggested, value, toOrder: suggested - onHand, orderOverride: '' });
  w.state = { master: [R("Tito's Vodka", 'SOUTHERN', 2, 12, 25.99), R('Kamora', 'SOUTHERN', 1, 6, 14.25), R('Bulleit', 'BREAKTHRU', 1, 5, 33.99), R('Ketel One', 'SOUTHERN', 6, 6, 20)] };
  w.getActiveVendors = () => ['SOUTHERN', 'BREAKTHRU', 'UNKNOWN'];
  w.getOrderRowsForVendor = (v) => w.state.master.filter(r => r.vendor === v && r.toOrder > 0);
  w.computeOrderSubtotal = (rows) => rows.reduce((s, r) => s + r.toOrder * r.value, 0);
  w.getEffectiveOrder = (r) => r.toOrder;
  w.autoOrder = (r) => r.toOrder;
  w.supportsManualFinalOrder = () => true;
  w.setVendorTab = (v) => w.__clics.push('tab:' + v);
  w.BarStockVendorLogo = { html: (v) => `<span class="logo-falso">${v}</span>`, color: () => '#888' };
  w.BarStockSugerencia = { preparar: async () => {}, para: () => null, antes: () => null, llegada: (v) => (v === 'SOUTHERN' ? 'Wed 4 PM' : null) };
  w.BarStockDeskShell = { activa: () => 'vendor', ir: (s) => { w.__ir = s; } };
  w.eval(MO);
  w.eval(DHJ);
  w.eval(DO);
  return w;
}

(async () => {
  grupo('1. Open del teléfono, en el escritorio');
  const w = entorno();
  const D = w.document;
  const caja = D.getElementById('dkOrd');
  w.BarStockDeskHeader.marcar('vendor');
  // La sección ya está abierta: se monta al ver el cambio de clase.
  D.getElementById('vendorSection').classList.remove('bs-active-section');
  await esperar(5);
  D.getElementById('vendorSection').classList.add('bs-active-section');
  await esperar(30);
  const det = D.getElementById('dkoDet');
  prueba('el módulo del teléfono exporta el modo escritorio', /abrirEscritorio, cerrarEscritorio, listaResumen/.test(MO));
  prueba('sin el marco del teléfono (ni banda, ni pestañas, ni lista pegada)', !det.querySelector('#moPeg, #moScroll, .m-seg'));
  prueba('elige solo el proveedor que más pesa y pinta SUS líneas', w.BarStockDeskOrders._estado().vendor === 'SOUTHERN' && det.querySelectorAll('.m-ord-l').length === 2, w.BarStockDeskOrders._estado().vendor + ' ' + det.querySelectorAll('.m-ord-l').length);
  prueba('sin proveedor elegido, el panel no pinta el resumen del teléfono', /else if \(_esc\) cuerpo\.innerHTML = '';/.test(MO) && /if \(_esc\) \{ host\.innerHTML = ''; return; \}/.test(MO));

  grupo('2. Una sola lista de proveedores');
  prueba('el resumen del teléfono y la columna leen listaResumen', /function pintarResumen\(host\) \{\s*const vs = listaResumen\(\);/.test(MO) && /MO\(\)\.listaResumen\(\)/.test(DO));

  grupo('3. La columna de proveedores');
  const vs = [...D.querySelectorAll('#dkoLista .dko-v')];
  prueba('un renglón por proveedor con líneas (sin UNKNOWN)', vs.map(b => b.dataset.v).join(',') === 'SOUTHERN,BREAKTHRU', vs.map(b => b.dataset.v).join(','));
  prueba('con su llegada, sus líneas y su total', /Arrives Wed 4 PM · 2 lines/.test(txt(vs[0])) && /\$\d/.test(txt(vs[0].querySelector('.dko-t'))), txt(vs[0]));
  prueba('el elegido, marcado', vs[0].classList.contains('sel') && !vs[1].classList.contains('sel'));
  vs[1].click(); await esperar(10);
  prueba('elegir otro pinta el suyo', w.BarStockDeskOrders._estado().vendor === 'BREAKTHRU' && /Bulleit/.test(txt(det)) && !/Kamora/.test(txt(det)));
  prueba('   y lo marca', D.querySelector('#dkoLista .dko-v.sel').dataset.v === 'BREAKTHRU');

  grupo('4. El header de sitios fijos');
  const cab = D.getElementById('dkCab');
  prueba('título Orders', /Orders/.test(txt(cab.querySelector('.dkc-titulo'))));
  prueba('vistas Open · Sent (To buy e Invoices, con su lámina)', [...cab.querySelectorAll('.dkc-seg [data-vista]')].map(b => b.dataset.vista).join(',') === 'open,sent');
  prueba('   con su nombre corto también (con poco ancho el header enseña ése)', [...cab.querySelectorAll('.dkc-seg [data-vista]')].every(b => b.querySelector('.c') && b.querySelector('.c').textContent.trim()));
  cab.querySelector('[data-vista="sent"]').click();
  prueba('Sent lleva a History (hoy la sección de lo enviado)', w.__ir === 'history');
  prueba('la lupa en afinar, los otros dos huecos vacíos', !!cab.querySelector('.dkc-afinar #dkoQ') && cab.querySelectorAll('.dkc-afinar .dkc-vacio').length === 2);
  prueba('Export azul y Quick order verde', !!cab.querySelector('.dkc-acciones .dkc-pl.azul[data-dkc="exportar"]') && !!cab.querySelector('.dkc-acciones .dkc-pl.verde[data-dkc="quick"]'));
  w.__clics.length = 0;
  cab.querySelector('.dkc-hueco[data-dkc="quick"]').click();
  prueba('Quick order es el de siempre', w.__clics.includes('quickOrderBtn'));
  let menu = null;
  w.BarStockDeskHeader.menu = (a, items) => { menu = items; };
  cab.querySelector('.dkc-hueco[data-dkc="exportar"]').click();
  prueba('Export: CSV, XLSX, JPG y LOOP', menu && menu.filter(i => i.label).map(i => i.label).join('|') === 'CSV|XLSX|JPG|LOOP (upload ready)');
  w.__clics.length = 0;
  menu.find(i => i.label === 'CSV').fn();
  prueba('   del proveedor elegido (pone su pestaña y le hace clic al de siempre)', w.__clics.join(',') === 'tab:BREAKTHRU,exportVendorCsvBtn', w.__clics.join(','));
  prueba('Order analysis en ⋯', /Order analysis/.test(DO) && /orderAnalysisBtn/.test(DO));
  const q = D.getElementById('dkoQ');
  D.querySelector('#dkoLista .dko-v[data-v="SOUTHERN"]').click(); await esperar(10);
  D.getElementById('dkoQ').value = 'kam'; D.getElementById('dkoQ').dispatchEvent(new w.Event('input', { bubbles: true }));
  await esperar(200);
  const visibles = [...det.querySelectorAll('.m-ord-l')].filter(l => !l.hidden).map(l => txt(l.querySelector('.m-ord-l-n')));
  prueba('la lupa esconde las líneas que no casan, sin repintar', visibles.join(',') === 'Kamora', visibles.join(','));
  void q;

  grupo('5. El pie: el total y Review and send');
  const pie = D.getElementById('dkoPie');
  prueba('con el total del proveedor', !pie.hidden && /\$\d/.test(txt(pie)) && /2 lines/.test(txt(pie)), txt(pie));
  prueba('el "Review and send" del teléfono se esconde (lo lleva el pie)', /#dkOrd #dkoDet \.m-ord-enviar \{ display: none; \}/.test(CSS));
  pie.querySelector('[data-acc="enviar"]').click(); await esperar(20);
  prueba('el pie abre la revisión del teléfono', /Review the order/.test(txt(det)) && caja.classList.contains('dko-revisando'));
  prueba('   a todo el ancho, con su vuelta a las líneas', /dko-revisando[^{]*\.dko-lista \{ display: none; \}/.test(CSS) && /#dkOrd:not\(\.dko-revisando\) #dkoDet \.m-cab \.m-atras \{ display: none; \}/.test(CSS));

  grupo('6. Carga y estilos');
  const pos = (f) => INDEX.indexOf(f);
  prueba('después de mobile-orders y antes de desk-shell', pos('src/mobile-orders.js') > 0 && pos('src/desk-orders.js') > pos('src/mobile-orders.js') && pos('src/desk-orders.js') < pos('src/desk-shell.js'));
  prueba('su hoja enlazada', /styles\/desk-orders\.css\?v=/.test(INDEX));
  prueba('los estilos de Open generados bajo #dkoDet', /#dkoDet \.m-ord-l \{/.test(GEN) && /#dkoDet \.m-rev/.test(GEN));
  prueba('lo de antes se esconde, no se quita', /body\.dk #vendorSection > :not\(#dkOrd\) \{ display: none !important; \}/.test(CSS) && /id="vendorSectionBody"/.test(INDEX));

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
