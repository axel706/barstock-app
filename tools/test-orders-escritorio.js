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
  // La cabecera del armazón del teléfono (mobile-shell.cabecera), con su
  // total a la derecha: sin ella, la revisión no tendría .m-cab-d.
  w.BarStockMobile = { register() {}, cabecera: (o) => '<div class="m-cab"><button type="button" class="m-atras" id="mAtras"></button><div class="m-cab-t"><div class="m-inv-t">' + (o.titulo || '') + '</div></div>' + (o.der ? '<div class="m-cab-d">' + o.der + '</div>' : '') + '</div>' };
  w.requestAnimationFrame = w.requestAnimationFrame || ((f) => setTimeout(f, 0));
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
  prueba('vistas Open · Sent · Invoices (To buy, con su lámina)', [...cab.querySelectorAll('.dkc-seg [data-vista]')].map(b => b.dataset.vista).join(',') === 'open,sent,inv');
  prueba('   con su nombre corto también (con poco ancho el header enseña ése)', [...cab.querySelectorAll('.dkc-seg [data-vista]')].every(b => b.querySelector('.c') && b.querySelector('.c').textContent.trim()));
  // Sent es ya una vista de Orders (desk-sent.js): lo prueba
  // test-sent-escritorio. Aquí, que no manda a la sección de antes.
  prueba('Sent ya no lleva a la sección History de antes', !/ir\('history'\)/.test(DO));
  prueba('la lupa en afinar, los otros dos huecos vacíos', !!cab.querySelector('.dkc-afinar #dkoQ') && cab.querySelectorAll('.dkc-afinar .dkc-vacio').length === 2);
  prueba('Export azul y Quick order verde', !!cab.querySelector('.dkc-acciones .dkc-pl.azul[data-dkc="exportar"]') && !!cab.querySelector('.dkc-acciones .dkc-pl.verde[data-dkc="quick"]'));
  w.__clics.length = 0;
  cab.querySelector('.dkc-hueco[data-dkc="quick"]').click();
  prueba('Quick order sin desk-quick (no cargó): el diálogo de siempre (con él, la pantalla Q-O: test-quick-escritorio)', w.__clics.includes('quickOrderBtn'));
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

  grupo('4b. El proveedor en el header (Axel, en la Mac: "< Orders - SOUTHERN")');
  prueba('el título dice Orders › el proveedor', /^Orders › SOUTHERN$/.test(txt(cab.querySelector('.dkc-titulo span'))), txt(cab.querySelector('.dkc-titulo span')));
  prueba('la cabecera de dentro (nombre y total) se va: el total, sólo abajo', /#dkOrd:not\(\.dko-revisando\) #dkoDet \.m-cab \{ display: none; \}/.test(CSS));
  prueba('"no price" donde va el precio, no junto al nombre', /#dkoDet \.m-ord-l \.m-ord-l-top \.m-ord-sin \{ display: none; \}/.test(CSS) && /\.m-ord-l\.sinprecio \.m-ord-l-t::before \{[^}]*content: 'No price'/.test(CSS));
  prueba('el título del header puede cambiar con la sección (función)', /typeof sp\.titulo === 'function'/.test(DHJ));

  grupo('5. El pie: el total y Review and send');
  const pie = D.getElementById('dkoPie');
  prueba('con el total del proveedor', !pie.hidden && /\$\d/.test(txt(pie)) && /2 lines/.test(txt(pie)), txt(pie));
  prueba('el "Review and send" del teléfono se esconde (lo lleva el pie)', /#dkOrd #dkoDet \.m-ord-enviar \{ display: none; \}/.test(CSS));
  pie.querySelector('[data-acc="enviar"]').click(); await esperar(20);
  prueba('el pie abre la revisión del teléfono', /Review the order/.test(txt(det)) && caja.classList.contains('dko-revisando'));
  prueba('   a todo el ancho, sin la columna de proveedores', /body\.dk #dkOrd:is\(\.dko-revisando[^{]*\{ grid-template-columns: minmax\(0, 1fr\); \}/.test(CSS) && /dko-revisando[^{]*\.dko-lista \{ display: none; \}/.test(CSS) && !/grid-area: vuelta/.test(CSS));

  grupo('5a. Review and send: la orden a la izquierda, el envío a la derecha (lámina A invertida)');
  prueba('el título dice Orders › el proveedor › Review', /^Orders › SOUTHERN › Review$/.test(txt(cab.querySelector('.dkc-titulo span'))), txt(cab.querySelector('.dkc-titulo span')));
  // El total y el envío, UNA columna pegada (Axel, en la Mac: en filas
  // separadas de la rejilla, la lista larga las estiraba y quedaba un hueco
  // entre los dos; y al bajar sólo debe rodar la lista).
  {
    const der = det.querySelector(':scope > .dko-rev-der');
    prueba('dos columnas: total y envío juntos en la derecha', !!der && !!der.querySelector('.m-cab-d') && !!der.querySelector('.m-rev-enviar') && der.firstElementChild.classList.contains('m-cab-d'), der ? der.innerHTML.slice(0, 80) : 'sin columna');
    prueba('   quietos al bajar: la columna entera va pegada, la lista rueda', /#dkOrd\.dko-revisando #dkoDet \{[^}]*grid-template-areas: "lab der" "lista der"/.test(CSS) && /\.dko-rev-der \{[^}]*position: sticky/.test(CSS));
  }
  // Sin "Back to the lines" (Axel, en la Mac: dejaba mucho aire encima de
  // la lista): se vuelve desde el header, como el ‹ vuelve al Home.
  prueba('sin "Back to the lines": la vuelta de dentro se esconde siempre', /#dkOrd #dkoDet \.m-cab \.m-atras \{ display: none; \}/.test(CSS) && !/content: 'Back to the lines'/.test(CSS));
  {
    const migas = [...cab.querySelectorAll('.dkc-titulo [data-dkc="miga"]')].map(txt);
    prueba('   en el header, "Orders" y el proveedor son enlaces; "Review" no', migas.join('|') === 'Orders|SOUTHERN', migas.join('|'));
    cab.querySelector('.dkc-titulo [data-dkc="miga"][data-miga="vendor"]').click(); await esperar(20);
    prueba('   el proveedor vuelve a sus líneas (no al Home)', !caja.classList.contains('dko-revisando') && !/Review the order/.test(txt(det)) && /^Orders › SOUTHERN$/.test(txt(cab.querySelector('.dkc-titulo span'))) && w.__ir !== 'home', txt(cab.querySelector('.dkc-titulo span')));
    // Fuera de la revisión, "Orders" sigue siendo un enlace (sólo el ‹ va al
    // Home: Axel, 2026-11-26) y el proveedor, que es donde estás, no.
    prueba('   fuera de la revisión, sólo "Orders" es enlace (el proveedor es donde estás)', [...cab.querySelectorAll('.dkc-titulo [data-dkc="miga"]')].map(m => m.textContent).join('|') === 'Orders');
    pie.querySelector('[data-acc="enviar"]').click(); await esperar(20);
    cab.querySelector('.dkc-titulo [data-dkc="miga"][data-miga="orders"]').click(); await esperar(20);
    prueba('   "Orders" también vuelve a las líneas', !caja.classList.contains('dko-revisando') && w.__ir !== 'home');
    pie.querySelector('[data-acc="enviar"]').click(); await esperar(20);
    cab.querySelector('.dkc-hueco[data-dkc="mas"]').click(); await esperar(5);
    const mh = D.querySelector('.dkc-mh');
    prueba('   el menú ⋯ titula con el texto, no con el código de la función', !!mh && /^Orders › SOUTHERN › Review$/.test(txt(mh)), mh && txt(mh).slice(0, 60));
    cab.querySelector('.dkc-hueco[data-dkc="mas"]').click(); await esperar(5);
  }
  {
    // LOOP en el escritorio: se guarda y se descarga su CSV, sin correo
    // (Axel: "al enviar en la versión de escritorio se descarga el csv").
    const w3 = entorno();
    w3.state.master.push({ item: 'Aperol', code: 'APE', vendor: 'LOOP', onHand: 0, suggested: 3, value: 21, toOrder: 3, orderOverride: '' });
    w3.getActiveVendors = () => ['SOUTHERN', 'BREAKTHRU', 'LOOP'];
    let guardada = null, csv = null, correo = 0;
    w3.persistOrderToSupabase = async (o) => { guardada = o; };
    w3.loadOrdersFromCloud = async () => {};
    w3.uniqueOrderId = () => 'ord_1';
    w3.exportLoopCsvFromRows = (rows, nombre) => { csv = { rows: rows.length, nombre }; };
    w3.fetch = async () => { correo++; return { ok: true, json: async () => ({}) }; };
    const D3 = w3.document;
    w3.BarStockDeskHeader.marcar('vendor');
    const s3 = D3.getElementById('vendorSection');
    s3.classList.remove('bs-active-section'); await esperar(5); s3.classList.add('bs-active-section'); await esperar(30);
    D3.querySelector('#dkoLista .dko-v[data-v="LOOP"]').click(); await esperar(10);
    D3.querySelector('#dkoPie [data-acc="enviar"]').click(); await esperar(10);
    const det3 = D3.getElementById('dkoDet');
    prueba('LOOP: sin direcciones ni nota (no sale por correo)', !det3.querySelector('#mrTo, #mrNotaAdd, #mrRec') && /CSV/.test(txt(det3)), txt(det3).slice(0, 160));
    const go = det3.querySelector('#mrGo');
    prueba('   el botón dice que descarga el CSV y está listo', !!go && !go.disabled && /download CSV/i.test(txt(go)));
    go.click(); await esperar(2500);
    prueba('   guarda la orden (la misma de siempre, loop_csv)', !!guardada && guardada.vendor === 'LOOP' && guardada.exportType === 'loop_csv');
    prueba('   descarga su CSV, el de siempre', !!csv && csv.rows === 1 && csv.nombre === 'loop_upload.csv', JSON.stringify(csv));
    prueba('   y no manda correo', correo === 0);
    prueba('   lo dice al terminar', /CSV/.test(txt(det3)) && !/email is on its way/.test(txt(det3)), txt(det3).slice(0, 200));
    prueba('en el teléfono LOOP sigue igual (sólo el escritorio descarga)', /const csv = !!_esc && esLoop\(/.test(MO));
  }

  grupo('5d. El −/+ de las líneas: redondo y de cristal, como en Q-O');
  {
    const CSSO = leer('styles/desk-orders.css'), CSSH2 = leer('styles/desk-header.css');
    prueba('redondo (le gana al radio generado del teléfono)', /#dkOrd #dkoDet \.m-ord-q button \{[^}]*border-radius: 50% !important;/.test(CSSO));
    prueba('   con el cristal del header', /#dkOrd #dkoDet \.m-ord-q button,\n/.test(CSSH2) && /#dkOrd #dkoDet \.m-ord-q button::before,/.test(CSSH2));
  }

  grupo('5c. Resend desde Sent: la misma revisión, sin guardar nada');
  {
    // Axel, 2026-11-26: "el botón Resend debería abrir un panel similar a
    // review and send, o el mismo, para poder enviar a cualquier
    // destinatario".
    const w4 = entorno();
    let guardada = 0, correos = [];
    w4.persistOrderToSupabase = async () => { guardada++; };
    w4.loadOrdersFromCloud = async () => {};
    w4.BarStockEmailOrder = { generarPdf: async () => 'PDF' };
    w4.BarStockVendorDefaults = { getDefaults: async () => ({ vendor_email: 'rep@southern.test' }) };
    w4.fetch = async (u, o) => { correos.push(JSON.parse(o && o.body || '{}')); return { ok: true, status: 200, json: async () => ({ ok: true, sent: (JSON.parse(o.body).to || []) }), text: async () => '{}' }; };
    const D4 = w4.document;
    const det4 = D4.getElementById('dkoDet');
    // Una orden YA enviada: sus cantidades son las pedidas (finalOrder),
    // no lo que pediría hoy el automático (toOrder de la fila es otro).
    const orden = { id: 'a11', vendor: 'SOUTHERN', poNumber: 'CT-0224', exportType: 'vendor_jpg', subtotal: 120, totalUnits: 7,
      items: [{ item: "Tito's Vodka", code: 'TIT', finalOrder: 4, value: 20, toOrder: 99 }, { item: 'Kamora', code: 'KAM', finalOrder: 3, value: 13.33, toOrder: 99 }] };
    w4.BarStockMobileOrders.reenviarEscritorio(det4, orden, {});
    await esperar(20);
    prueba('la revisión de Open con la orden: "Send this order again" y Resend', /Send this order again/.test(txt(det4)) && /Resend/.test(txt(det4.querySelector('#mrGo'))), txt(det4).slice(0, 160));
    prueba('   las cantidades son las pedidas (4× y 3×), no las de hoy', /4×\s*Tito's Vodka/.test(txt(det4)) && /3×\s*Kamora/.test(txt(det4)) && !/99×/.test(txt(det4)));
    prueba('   con el correo guardado del proveedor puesto, y se pueden añadir otros', /rep@southern\.test/.test(txt(det4)) && !!det4.querySelector('#mrAdd'));
    prueba('   sin "Remember these" (reenviar no cambia los guardados)', !det4.querySelector('#mrRec'));
    det4.querySelector('#mrAdd').click();
    det4.querySelector('#mrMail').value = 'axel@crown.test';
    det4.querySelector('#mrOk').click(); await esperar(10);
    prueba('   un destinatario cualquiera se añade', /axel@crown\.test/.test(txt(det4.querySelector('#mrTo'))));
    det4.querySelector('#mrGo').click(); await esperar(1600);
    prueba('Resend NO guarda otra orden', guardada === 0);
    prueba('   manda el correo a los dos', correos.length === 1 && (correos[0].to || []).join(',') === 'rep@southern.test,axel@crown.test', JSON.stringify(correos.map(c => c.to)));
    prueba('   y dice que salió otra vez, sin "placed"', /Sent to SOUTHERN/.test(txt(det4)) && /on its way again/.test(txt(det4)) && !/order is placed/.test(txt(det4)), txt(det4).slice(0, 200));
  }

  grupo('5b. El tiempo real: lo cambiado en el teléfono se ve aquí');
  {
    // Axel, 2026-11-26: "los que hago en el móvil no los ve la pc en
    // tiempo real". inventory-realtime recarga el maestro y avisa
    // inventoryUpdated; el Orders del escritorio no lo escuchaba (sólo se
    // repintaba con lo cambiado en el propio escritorio).
    const w2 = entorno();
    const oyentes = {};
    w2.BarStockEvents = { on: (n, f) => { (oyentes[n] = oyentes[n] || []).push(f); return () => {}; } };
    // Se vuelve a montar con los eventos puestos.
    w2.eval(DO.replace('if (window.BarStockDeskOrders) return;', ''));
    const D2 = w2.document;
    w2.BarStockDeskHeader.marcar('vendor');
    const sec2 = D2.getElementById('vendorSection');
    sec2.classList.remove('bs-active-section'); await esperar(5); sec2.classList.add('bs-active-section'); await esperar(30);
    const cant = () => { const l = [...D2.querySelectorAll('#dkoDet .m-ord-l')].find(x => /Kamora/.test(txt(x))); return l && l.querySelector('input') ? l.querySelector('input').value : null; };
    const antes = cant();
    // Llega del teléfono: Kamora a 9, el maestro reemplazado (objetos nuevos).
    w2.state.master = w2.state.master.map(r => Object.assign({}, r, r.item === 'Kamora' ? { toOrder: 9 } : {}));
    (oyentes.inventoryUpdated || []).forEach(f => f({ source: 'inventory-realtime' }));
    await esperar(60);
    prueba('escucha inventoryUpdated, ordersUpdated y Pour·IQ', ['inventoryUpdated', 'ordersUpdated', 'parAdjustmentsUpdated'].every(n => (oyentes[n] || []).length));
    prueba('y repinta la orden con lo que llegó', antes === '5' && cant() === '9', antes + ' → ' + cant());
  }

  prueba('los − / + centrados (sin el relleno de app.css)', /#dkOrd #dkoDet \.m-ord-q button \{ display: inline-flex; align-items: center; justify-content: center; width: 38px; padding: 0;/.test(CSS));

  grupo('6. Carga y estilos');
  const pos = (f) => INDEX.indexOf(f);
  prueba('después de mobile-orders y antes de desk-shell', pos('src/mobile-orders.js') > 0 && pos('src/desk-orders.js') > pos('src/mobile-orders.js') && pos('src/desk-orders.js') < pos('src/desk-shell.js'));
  prueba('su hoja enlazada', /styles\/desk-orders\.css\?v=/.test(INDEX));
  prueba('los estilos de Open generados bajo #dkoDet', /#dkoDet \.m-ord-l \{/.test(GEN) && /#dkoDet \.m-rev/.test(GEN));
  prueba('lo de antes se esconde, no se quita', /body\.dk #vendorSection > :not\(#dkOrd\) \{ display: none !important; \}/.test(CSS) && /id="vendorSectionBody"/.test(INDEX));

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
