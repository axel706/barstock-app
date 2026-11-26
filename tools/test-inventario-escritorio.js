#!/usr/bin/env node
/*
 * ── Inventory en el escritorio (Axel, 2026-11-25) ──────────────────────
 *
 * Lo que se protege:
 *
 *   1. EL TIEMPO REAL ("debes estar seguro de que no se va a dañar"):
 *      inventory-realtime.js no se toca; el Inventory nuevo se repinta con
 *      su aviso (inventoryUpdated), recuerda el producto abierto por su
 *      NOMBRE (cada recarga reemplaza state.master) y no pisa lo que estás
 *      editando.
 *   2. Ninguna función del Inventory de antes se pierde (Count, Add item,
 *      categorías, botellas, Pour·IQ chip e Item Info, categoría, Rename,
 *      proveedor, par, precio, override, botella, Received, Zero, Delete),
 *      salvo lo que Axel quitó: el On Hand a mano y Scan Price Invoice.
 *      Ni del header: Import, Export, los datos, el tema, Settings y
 *      Logout siguen en ⋯ (cada renglón es el botón de siempre).
 *   3. Las reglas de las filas son las del teléfono (filtrar / faltas).
 *   4. El header de sitios fijos (2026-11-26, desk-header.js): el título,
 *      las vistas con sus cuentas, afinar (filtro, proveedor, orden) y las
 *      acciones; lo que está en uso, azul. Y Money on the shelf, el MISMO
 *      número del Home (antes, con el mismo nombre, decía lo contado), en
 *      la primera de las cuatro cifras (Items, Needs fixing, Running out).
 *
 *   node tools/test-inventario-escritorio.js
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
const DI = leer('src/desk-inventory.js');
const DH = leer('src/desk-header.js');
const CSSH = leer('styles/desk-header.css');
const MI = leer('src/mobile-inventory.js');
const CSS = leer('styles/desk-inventory.css');
const RT = leer('src/inventory-realtime.js');

const w = new JSDOM(`<!doctype html><body class="dk"><div class="wrap">
  <div class="bs-header card"><button id="dkMenu"></button><div id="dkSaludo" class="dk-saludo">Hi</div>
    <label id="dkBusca"><i class="ti ti-search"></i><input id="dkBuscaIn"></label>
    <div class="bs-loc-wrap">Crown</div>
    <div class="bs-toolbar-group dk-imp"><button id="importMenuBtn">Import</button><div id="importMenu"><label class="bs-dd-item"><i class="ti ti-archive"></i>Import backup<input type="file" id="backupFile"></label></div></div>
    <div class="bs-toolbar-group dk-exp"><button id="exportMenuBtn">Export</button><div id="exportMenu"><button id="exportMasterBtn" class="bs-dd-item"><i class="ti ti-table-export"></i>Export master CSV</button></div></div>
    <div class="dk-mas"><div id="bsMoreMenu"><button id="restoreBackupBtn" class="bs-dd-item" style="display:none">Restore backup</button><button id="resetBtn" class="bs-dd-item bs-dd-danger">Reset master</button></div></div>
    <button id="themeToggle">t</button><button id="authLogoutBtn">Logout</button></div>
  <div class="card section-card" id="inventorySection">
    <div class="section-header-row">old</div>
    <div class="section-body" id="inventorySectionBody"><div id="countResumeHost"><b>In progress</b></div>
      <button id="takeInventoryBtn" type="button">Take inventory</button><button id="scanInvoiceBtn">Scan Price Invoice</button></div>
  </div></div></body>`, { url: 'https://app.barstockpro.com/', runScripts: 'outside-only', pretendToBeVisual: true }).window;
w.console = { log() {}, warn() {}, error() {} };
const llamadas = [];
const mk = (item, vendor, onHand, suggested, value, extra) => Object.assign({ item, code: item.slice(0, 3).toUpperCase(), vendor, onHand, suggested, value, toOrder: Math.max(0, suggested - onHand), orderOverride: '', category: 'Vodka' }, extra || {});
w.state = { master: [mk("Tito's Vodka", 'LOOP', 3, 6, 25), mk('Hennessy VS', 'SOUTHERN', 2, 0, 0), mk('Aperol', 'UNKNOWN', 3, 4, 21)] };
// Lo que vive en index.html y en otros módulos, de mentira, para ver que se llama.
w.normalizeName = (s) => String(s || '').toUpperCase();
w.getVendorsForFilter = () => ['ALL', 'LOOP', 'SOUTHERN', 'UNKNOWN'];
w.getVendorsWithUnknown = () => ['LOOP', 'SOUTHERN', 'UNKNOWN'];
w.badge = (v) => `<span class="badge">${v}</span>`;
w.getParChipHtml = (r) => r.item === "Tito's Vodka" ? '<span class="par-chip">Pour·IQ™ +1</span>' : '';
w.supportsManualFinalOrder = (v) => !!v && v !== 'UNKNOWN';
w.openNewItemModal = () => llamadas.push('nuevo');
w.openCategoryModal = (i) => llamadas.push('categoria:' + i);
w.openItemInfoModal = (i) => llamadas.push('info:' + i);
w.quickZeroSuggested = (i) => llamadas.push('cero:' + i);
w.openStockIn = (i) => llamadas.push('recibido:' + i);
w.updateFinalOrder = (i, v) => llamadas.push('override:' + i + ':' + v);
w.bsSaveItemFields = async (i, c) => { llamadas.push('guardar:' + i + ':' + JSON.stringify(c)); return true; };
w.render = () => llamadas.push('render');
w.setStatus = () => {};
w.BarStockAutoCategory = { run: () => llamadas.push('autocat') };
w.BarStockBottleAssign = { run: () => llamadas.push('autobot') };
w.BarStockBottlePicker = { open: () => llamadas.push('botella') };
w.BarStockItemEdit = { renombrar: async (r, o) => { llamadas.push('renombrar:' + o.nombre); return { ok: true }; }, borrar: async (r) => { llamadas.push('borrar:' + r.item); w.state.master = w.state.master.filter(x => x !== r); return { ok: true }; } };
w.BarStockInventoryValue = { compute: () => ({ total: 141, items: 3, uncategorized: 0, noPrice: 1, cats: [{ name: 'Vodka', value: 141, pct: 100 }], llegado: 0 }) };
w.BarStockRunningOut = { lista: () => [{ r: w.state.master[0], item: "Tito's Vodka" }] };
const oyentes = {};
w.BarStockEvents = { on: (n, f) => { (oyentes[n] = oyentes[n] || []).push(f); }, emit: (n, d) => (oyentes[n] || []).forEach(f => f(d)) };
let oyenteLive = null;
w.BarStockLiveCache = { cuanto: (r) => r.item === "Tito's Vodka" ? 2.4 : Number(r.onHand), vivo: (r) => r.item === "Tito's Vodka", agota: (r) => r.item === "Tito's Vodka" ? { txt: 'Out Sat', tono: 'a' } : null, alCambiar: (f) => { oyenteLive = f; } };
w.BarStockMobileSearch = { llenarFicha: (caja, idx) => { llamadas.push('ficha:' + idx); caja.innerHTML = '<div class="m-fic">ficha</div>'; } };
w.BarStockGuest = { puede: () => true };
w.BarStockMobile = { register: () => {} };
// El Home: su "On the shelf" (LIVE × precio) es el número de Inventory.
w.BarStockMobileHome = { estante: () => ({ live: true, total: 138, contado: 141, llego: 0, vendido: 3, n: 3, sin: 1 }) };
w.BarStockLiveCache.botellas = () => ({ total: 7.4, live: true });
w.BarStockDeskShell = { activa: () => 'inventory', ir: (id) => llamadas.push('ir:' + id) };
w.openSettingsModal = () => llamadas.push('ajustes');
w.eval(MI);
w.eval(DH);
w.eval(DI);

(async () => {
  const D = w.document;
  const sec = D.getElementById('inventorySection');
  sec.classList.add('bs-active-section');
  await esperar(30);
  const caja = D.getElementById('dkInv');
  const filas = () => [...D.querySelectorAll('#dkInv .dki-fila')].map(f => f.dataset.item);

  grupo('1. El estándar y la pantalla');
  prueba('la sección es una pantalla del estándar (.dk-pantalla)', sec.classList.contains('dk-pantalla'));
  prueba('lo de antes se esconde en el escritorio (sigue en el DOM para render())', /#inventorySection > \.section-header-row,\s*body\.dk #inventorySection > #inventorySectionBody \{ display: none !important; \}/.test(CSS) && !!D.getElementById('inventorySectionBody'));
  prueba('el conteo en curso, bajo el dinero', !!caja.querySelector('#dkiConteo #countResumeHost'));
  const din = txt(caja.querySelector('.dki-cifras .dki-k1'));
  const cif = txt(caja.querySelector('.dki-cifras'));
  prueba('Money on the shelf es el número del Home (LIVE), no lo contado', /Money on the shelf\s*≈\$138/.test(din) && /Live/.test(din) && !/\$141/.test(din), din);
  prueba('con sus botellas y lo que no tiene precio', /≈7 bottles/.test(din) && /1 in stock with no price/.test(din), din);
  prueba('el reparto suma el total: contado + llegó − vendido de cada fila', /Vodka \$138/.test(din), din);
  prueba('las cuatro cifras (Axel, en el iPad: "me gusta más partido en 4")', caja.querySelectorAll('.dki-cifras > .dki-k').length === 4 && /Items\s*3/.test(cif) && /Needs fixing\s*2/.test(cif) && /Running out\s*1/.test(cif), cif);
  prueba('una fila por producto, en el orden del teléfono (dinero en el estante)', filas().join('|') === "Aperol|Tito's Vodka|Hennessy VS", filas().join('|'));
  const tito = caja.querySelector('.dki-fila[data-item="Tito\'s Vodka"]');
  prueba('el número es el LIVE con ≈ y su par', /≈2\.4\s*\/6/.test(txt(tito.querySelector('.dki-hay'))));
  prueba('● Live, Out Sat y el chip de Pour·IQ', /Live/.test(txt(tito)) && /Out Sat/.test(txt(tito)) && !!tito.querySelector('.par-chip'));
  // Axel, 2026-11-26 (lámina "Inventory rows"): Price donde estaba On hand
  // y On hand al final, en los títulos y en cada fila (la misma rejilla).
  const cols = [...caja.querySelectorAll('.dki-cols .dki-th')].map(b => b.dataset.col);
  prueba('columnas: Product, Vendor, Price, Avg, Par, To order, On hand', cols.join(',') === 'nombre,vendor,precio,avg,par,pedir,onhand');
  prueba('   y en la fila, el número al final', tito.lastElementChild.classList.contains('dki-hay') && /\$/.test(txt(tito.children[3])));
  const CSSI = fs.readFileSync(path.join(__dirname, '..', 'styles', 'desk-inventory.css'), 'utf8');
  prueba('filas la mitad más grandes (nombre 19, On hand 26, botella 38)', /\.dki-n b \{[^}]*font-size: 19px/.test(CSSI) && /\.dki-hay \{[^}]*font-size: 26px/.test(CSSI) && /\.dki-silc svg \{[^}]*height: 38px/.test(CSSI));
  prueba('lo que le falta a cada uno (no price, no par)', /no price/.test(txt(caja.querySelector('.dki-fila[data-item="Hennessy VS"]'))) && /no par/.test(txt(caja.querySelector('.dki-fila[data-item="Hennessy VS"]'))));

  grupo('2. El header de sitios fijos');
  const cab = D.getElementById('dkCab');
  prueba('Inventory usa el header de las secciones', !!cab && D.body.classList.contains('dk-cab'));
  prueba('2 · el título, grande, y vuelve al Home', txt(cab.querySelector('.dkc-titulo')) === 'Inventory');
  cab.querySelector('.dkc-titulo').click();
  prueba('   (clic en el título → Home)', llamadas.includes('ir:home'));
  const vistas = () => txt(cab.querySelector('.dkc-centro'));
  prueba('3 · las vistas, al centro, con sus cuentas', /All\s*All\s*3/.test(vistas()) && /Needs fixing\s*Fix\s*2/.test(vistas()) && /Running out\s*Out\s*1/.test(vistas()), vistas());
  prueba('4 · afinar: tres huecos (filtro, proveedor, orden)', cab.querySelectorAll('.dkc-afinar > .dkc-hueco').length === 3 && !!cab.querySelector('.dkc-afinar #dkiQ') && !!cab.querySelector('.dkc-afinar [data-dkc="vendor"]') && !!cab.querySelector('.dkc-afinar [data-dkc="orden"]'));
  prueba('5 · acciones: Count (azul) y Add item (verde), en dos huecos', cab.querySelectorAll('.dkc-acciones > .dkc-hueco').length === 2 && !!cab.querySelector('.dkc-acciones .dkc-pl.azul[data-dkc="contar"]') && !!cab.querySelector('.dkc-acciones .dkc-pl.verde[data-dkc="nuevo"]'));
  prueba('5 · Do we have (el mismo campo, movido) y ⋯, al final', cab.querySelector('.dkc-busca #dkBusca') === D.getElementById('dkBusca') && !!cab.querySelector('[data-dkc="mas"]'));
  prueba('fuera en una sección: saludo, locación, Import, Export, tema, Logout', ['#dkMiga', '.dk-saludo', '.bs-loc-wrap', '.dk-imp', '.dk-exp', '.dk-mas', '#themeToggle', '#authLogoutBtn'].every(x => CSSH.includes('body.dk.dk-cab .bs-header ' + x)));
  // Lámina "Header buttons · no overlapping", A (2026-11-26): abiertos
  // encima se encimaban con el vecino (capturas de Axel).
  prueba('un botón abierto ya no se dibuja encima: crece y aparta a los de al lado', /\.dkc-pl \{\s*position: relative;/.test(CSSH) && !/\.dkc-pl \{\s*position: absolute/.test(CSSH));
  prueba('   abierto mide su nombre (--w), con tope en el sitio que hay', /max-width: var\(--w, 200px\)/.test(CSSH) && /const tope = 38 \+ _holgura\.der \+ _holgura\.izq;/.test(DH));
  prueba('   si no cabe, las vistas se apartan lo que falta y vuelven (--dkc-empuje)', /\.dkc-seg \{[^}]*transform: translateX\(calc\(-1 \* var\(--dkc-empuje, 0px\)\)\)/.test(CSSH) && /w - 38 - _holgura\.der/.test(DH));
  prueba('   medir no es animar: se mide con todo cerrado y tras la animación', /setTimeout\(medir, 260\)/.test(DH) && /if \(_cab\.querySelector\('\.dkc-pl\.abierto, \.dkc-pl\.toque, \.dkc-hueco:hover'\)/.test(DH));
  prueba('   Do we have sí se abre ancho por encima (va a escribirse)', /#dkCab #dkBusca \{\s*position: absolute;/.test(CSSH));
  prueba('sin la etiqueta gris del navegador (title) en los botones del header', !/title=/.test(txt(cab) + cab.innerHTML.replace(/<input[^>]*>/g, '')) && !cab.querySelector('[title]'), [...cab.querySelectorAll('[title]')].map(e => e.outerHTML.slice(0, 60)).join(' | '));
  prueba('liquid glass: el cristal del teléfono en todos (desenfoque, filo de luz, reflejo)', /#dkCab :is\(\.dkc-pl, \.dkc-seg\),[\s\S]{0,120}#dkMenu,[\s\S]{0,120}#dkBusca \{\s*-webkit-backdrop-filter: blur\(10px\) saturate\(180%\) brightness\(1\.08\);/.test(CSSH) && /inset 0 1\.5px 0 rgba\(255, 255, 255, \.5\)/.test(CSSH) && /radial-gradient\(120% 70% at 30% 0%/.test(CSSH));

  grupo('3. Las vistas y afinar, con las reglas del teléfono');
  cab.querySelector('[data-vista="fix"]').click(); await esperar(10);
  prueba('Needs fixing: sólo lo incompleto', filas().join('|') === 'Hennessy VS|Aperol' || filas().join('|') === 'Aperol|Hennessy VS', filas().join('|'));
  prueba('   y la vista elegida se marca', cab.querySelector('[data-vista="fix"]').classList.contains('on'));
  cab.querySelector('[data-vista="agota"]').click(); await esperar(10);
  prueba('Running out: la lista de Running out', filas().join('|') === "Tito's Vodka");
  prueba('   ahí el proveedor y el orden no aplican (apagados, en su sitio)', cab.querySelector('.dkc-hueco[data-dkc="vendor"]').getAttribute('aria-disabled') === 'true' && cab.querySelectorAll('.dkc-afinar > .dkc-hueco').length === 3);
  cab.querySelector('[data-vista="todo"]').click(); await esperar(10);
  cab.querySelector('.dkc-hueco[data-dkc="vendor"]').click(); await esperar(10);
  const pop = () => D.getElementById('dkcPop');
  prueba('el proveedor abre su menú', !!pop() && /All vendors/.test(txt(pop())) && /Southern/.test(txt(pop())));
  [...pop().querySelectorAll('.dkc-mi')].find(b => /Southern/.test(b.textContent)).click(); await esperar(10);
  prueba('elegir un proveedor filtra', filas().join('|') === 'Hennessy VS');
  prueba('   y queda azul "en uso", con su nombre, y las cuentas bajan', cab.querySelector('.dkc-pl[data-dkc="vendor"]').classList.contains('en') && /Vendor: Southern/.test(cab.querySelector('.dkc-pl[data-dkc="vendor"]').getAttribute('aria-label')) && /All\s*All\s*1/.test(vistas()), vistas());
  cab.querySelector('.dkc-hueco[data-dkc="vendor"]').click(); await esperar(10);
  [...pop().querySelectorAll('.dkc-mi')].find(b => /All vendors/.test(b.textContent)).click(); await esperar(10);
  cab.querySelector('.dkc-hueco[data-dkc="orden"]').click(); await esperar(10);
  [...pop().querySelectorAll('.dkc-mi')].find(b => /Name/.test(b.textContent)).click(); await esperar(10);
  prueba('el orden (Name)', filas().join('|') === "Aperol|Hennessy VS|Tito's Vodka");
  caja.querySelector('[data-col="precio"]').click(); await esperar(10);
  prueba('tocar una columna ordena por ella', filas()[0] === "Tito's Vodka", filas().join('|'));
  prueba('   y el botón de orden lo dice', /Sort: Price/.test(cab.querySelector('.dkc-pl[data-dkc="orden"]').getAttribute('aria-label')));
  let q = D.getElementById('dkiQ'); q.focus(); q.value = 'hen'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await esperar(10);
  prueba('el filtro', filas().join('|') === 'Hennessy VS');
  prueba('   al repintar conserva el foco (se escribe seguido)', D.activeElement && D.activeElement.id === 'dkiQ' && D.activeElement.value === 'hen');
  prueba('   el texto en uso se esconde con opacity, no visibility (si no, no recibe el foco)', /:is\(b, input\) \{ opacity: 0; \}/.test(CSSH) && !/input \{ visibility: hidden/.test(CSSH));
  q = D.getElementById('dkiQ'); q.value = ''; q.dispatchEvent(new w.Event('input', { bubbles: true })); await esperar(10);
  prueba('los nombres de las columnas se pegan bajo el header', /\.dki-pega \{[^}]*position: sticky; top: var\(--dk-alto\)/.test(CSS));
  prueba('las reglas de filas son las del teléfono (filtrar / faltas exportadas)', /BarStockMobileInventory = \{[^}]*filtrar, faltas \}/.test(MI) && /M\.filtrar\(/.test(DI) && /M\.faltas\(/.test(DI));

  grupo('3b. Las acciones y ⋯');
  llamadas.length = 0;
  let contado = 0; D.getElementById('takeInventoryBtn').addEventListener('click', () => contado++);
  cab.querySelector('.dkc-hueco[data-dkc="contar"]').click();
  cab.querySelector('.dkc-hueco[data-dkc="nuevo"]').click();
  prueba('Count = Take inventory (con su comprobación del ciclo)', contado === 1);
  prueba('Add item, el de siempre', llamadas.includes('nuevo'), llamadas.join(','));
  cab.querySelector('.dkc-hueco[data-dkc="mas"]').click(); await esperar(10);
  const mas = txt(pop());
  prueba('⋯: categorías y botellas de Inventory, arriba', /^Inventory\s*Assign categories automatically\s*Assign bottle shapes and sizes/.test(mas), mas);
  prueba('⋯: Import, Export, los datos, el tema, Settings y Logout', /Import backup/.test(mas) && /Export master CSV/.test(mas) && /Reset master/.test(mas) && /Light mode|Dark mode/.test(mas) && /Settings/.test(mas) && /Logout/.test(mas), mas);
  prueba('⋯: lo escondido no sale (Restore backup)', !/Restore backup/.test(mas));
  let exp = 0; D.getElementById('exportMasterBtn').addEventListener('click', () => exp++);
  let arch = 0; D.getElementById('backupFile').addEventListener('click', () => arch++);
  [...pop().querySelectorAll('.dkc-mi')].find(b => /Export master/.test(b.textContent)).click(); await esperar(10);
  cab.querySelector('.dkc-hueco[data-dkc="mas"]').click(); await esperar(10);
  [...pop().querySelectorAll('.dkc-mi')].find(b => /Import backup/.test(b.textContent)).click(); await esperar(10);
  cab.querySelector('.dkc-hueco[data-dkc="mas"]').click(); await esperar(10);
  [...pop().querySelectorAll('.dkc-mi')].find(b => /Assign categories/.test(b.textContent)).click(); await esperar(10);
  prueba('cada renglón es el botón de siempre (y el de un archivo, su <input>)', exp === 1 && arch === 1 && llamadas.includes('autocat'), [exp, arch, llamadas.join(',')].join(' '));
  prueba('sin Scan Price Invoice (los precios vienen de MarginEdge)', !/Scan|invoice/i.test(txt(cab)) && !/openInvoiceScanModal/.test(DI));
  prueba('al crear, sin On Hand a mano (empieza en 0)', /#newItemModalBg label:has\(#newItemOnHand\) \{ display: none; \}/.test(CSS));
  prueba('al volver al Home, Do we have vuelve a su sitio y el header de siempre', (() => { w.BarStockDeskHeader.marcar('home'); const ok2 = !D.body.classList.contains('dk-cab') && D.getElementById('dkBusca').previousElementSibling.id === 'dkSaludo'; w.BarStockDeskHeader.marcar('inventory'); return ok2; })());

  grupo('4. El producto (panel B: la tarjeta primero, Overview | Edit)');
  llamadas.length = 0;
  w.BarStockDeskHeader.menu = (ancla, items) => { llamadas.push('menu'); w._menuItems = items; };
  caja.querySelector('.dki-fila[data-item="Tito\'s Vodka"]').click(); await esperar(10);
  const pan = () => caja.querySelector('#dkiPanel');
  const abierto = () => !!pan().querySelector('.dki-pn');
  prueba('abre su panel con la ficha de Do we have', abierto() && llamadas.some(x => /^ficha:/.test(x)) && pan().querySelector('#dkiFicha .m-fic'));
  // Lámina "Product panel · reorganized", B (Axel, 2026-11-26).
  prueba('el nombre sale una vez: sin la cabecera de antes (lo dice la tarjeta)', !pan().querySelector('.dki-ph, h3'));
  prueba('la ✕ va en el panel, sin title', pan().querySelector('.dki-x[data-acc="cerrar"]') && !pan().querySelector('.dki-x').hasAttribute('title'));
  const CSSI4 = fs.readFileSync(path.join(__dirname, '..', 'styles', 'desk-inventory.css'), 'utf8');
  prueba('la tarjeta de la botella va primero (order), lo repetido de la ficha se esconde', /#dkiPanel #dkiFicha \{[^}]*display: contents/.test(CSSI4) && /#dkiPanel #dkiFicha > \.m-fic \{[^}]*order: 1/.test(CSSI4) && /#dkiPanel :is\(\.m-acts, \.m-sheet-grip\) \{ display: none/.test(CSSI4));
  // Esconder .m-rows entero se llevó dos renglones que no se repiten en
  // ningún otro sitio: de qué factura vino el precio (#msPrecio) y "Lasts
  // about · needs N weeks". Se esconden sólo los renglones repetidos.
  prueba('de la ficha se quitan sólo Uses / Par / Unit price: el origen del precio y "Lasts about" se quedan',
    !/:is\(\.m-rows, \.m-acts/.test(CSSI4) && /#dkiPanel \.m-rows > \.m-row:not\(:has\(\.ti-hourglass\)\) \{ display: none/.test(CSSI4)
    && /#dkiPanel \.m-rows:not\(:has\(\.m-fuente, \.ti-hourglass\)\) \{ display: none/.test(CSSI4)
    && /#dkiPanel #dkiFicha > \.m-rows \{ order: 5/.test(CSSI4));
  // Lámina "Product panel · full height", A (Axel, 2026-11-26): el panel
  // de la altura de la pantalla, desde el header, sin scroll dentro, y la
  // lista se aparta. #dkInv era el contenedor de las reglas de ancho, y un
  // contenedor hace de caja a lo fijo de dentro: el cajón del iPad rodaba
  // con la página. El contenedor es ahora #dkiMain y el panel va fuera.
  prueba('el panel va fuera del contenedor de ancho (#dkiMain)', pan().parentElement === caja && !!caja.querySelector('#dkiMain #dkiLista') && !caja.querySelector('#dkiMain #dkiPanel'));
  prueba('   el contenedor es #dkiMain, no #dkInv', /#dkiMain \{[^}]*container: dkinv \/ inline-size/.test(CSSI4) && !/#dkInv \{[^}]*container:/.test(CSSI4));
  prueba('   fijo del header hasta abajo, y la lista le deja su sitio', /#dkInv \.dki-panel \{[^}]*position: fixed;[^}]*top: var\(--dk-alto\);[^}]*bottom: 0;/.test(CSSI4) && /#dkInv\.con-panel \.dki-main \{[^}]*margin-right:/.test(CSSI4));
  prueba('   sin medir la barra pegada para colocarlo', !/medirPega|--dki-pega/.test(DI + CSSI4));
  prueba('   los huecos vacíos de la ficha no suman aire', /#dkiPanel #dkiFicha > :empty \{ display: none/.test(CSSI4));
  prueba('   cada bloque de Overview, la misma tarjeta', /#dkiPanel :is\(\.m-rows, \.m-zon, \.m-trf, \.m-vt, \.m-iqb\) \{/.test(CSSI4));
  prueba('   sin sitio, Toast se queda en su renglón (no rueda el panel)', /#dkiPanel\.apretado \.m-vt :is\(\.m-ts-g, \.m-ts-d\) \{ display: none/.test(CSSI4) && /classList\.toggle\('apretado'/.test(DI));
  prueba('tres cifras: Uses / week, Unit price, Runs out', /Uses \/ week/.test(txt(pan().querySelector('.dki-c3'))) && /Unit price/.test(txt(pan().querySelector('.dki-c3'))) && /Runs out/.test(txt(pan().querySelector('.dki-c3'))) && /\$25\.00/.test(txt(pan().querySelector('.dki-c3'))));
  prueba('un solo Received', pan().querySelectorAll('[data-acc="recibido"]').length === 1);
  prueba('Add to order es el de la ficha (#msAdd)', /msAdd/.test(DI) && pan().querySelector('[data-acc="pedir"]'));
  prueba('los botones del panel, de cristal (la MISMA regla que el header)', /#dkInv :is\(\.dki-cr, \.dki-tabs\)/.test(CSSH) && pan().querySelectorAll('.dki-cr').length >= 4 && pan().querySelector('.dki-tabs'));
  prueba('abre en Overview: los campos de Edit escondidos', pan().dataset.tab === 'ver' && /#dkiPanel\[data-tab="ver"\] :is\(\.dki-ed, \.dki-pie\) \{ display: none/.test(CSSI4));
  pan().querySelector('[data-acc="mas"]').click();
  prueba('⋯ lleva Pour·IQ history y Zero par', llamadas.includes('menu') && (w._menuItems || []).map(i => i.label).join('|') === 'Pour·IQ history|Zero par');
  (w._menuItems || []).forEach(i => i.fn());
  ['categoria', 'botella', 'recibido'].forEach(a => pan().querySelector(`[data-acc="${a}"]`).click());
  prueba('categoría, botella, Pour·IQ history (Item Info), Zero par y Received', llamadas.includes('categoria:0') && llamadas.includes('botella') && llamadas.includes('info:0') && llamadas.includes('cero:0') && llamadas.includes('recibido:0'), llamadas.join(','));
  pan().querySelector('.dki-tabs [data-tab="ed"]').click();
  prueba('Edit cambia de pestaña sin repintar la ficha', pan().dataset.tab === 'ed' && llamadas.filter(x => /^ficha:/.test(x)).length === 1);
  prueba('sin On Hand editable', !pan().querySelector('input[id*="Hand"], input[id*="hand"]') && !/onHand:/.test(DI.slice(DI.indexOf('bsSaveItemFields(i2'), DI.indexOf('bsSaveItemFields(i2') + 200)));
  prueba('Save empieza apagado', pan().querySelector('.dki-guardar').disabled);
  pan().querySelector('[data-par="1"]').click();
  prueba('tocar el par lo cambia y enciende Save', pan().querySelector('#dkiPar').value === '7' && !pan().querySelector('.dki-guardar').disabled);
  prueba('   y la pestaña Edit lo marca', pan().querySelector('.dki-tabs [data-tab="ed"]').classList.contains('sucio'));

  grupo('5. EL TIEMPO REAL');
  // Llega un cambio de otro dispositivo: inventory-realtime REEMPLAZA la
  // lista (objetos nuevos) y avisa. El precio de Aperol cambió fuera.
  w.state.master = w.state.master.map(r => Object.assign({}, r, r.item === 'Aperol' ? { value: 99 } : {}));
  w.BarStockEvents.emit('inventoryUpdated', { source: 'inventory-realtime' });
  await esperar(40);
  prueba('la lista se repinta con lo que cambió fuera', /\$99\.00/.test(txt(caja.querySelector('.dki-fila[data-item="Aperol"]'))));
  prueba('el producto abierto sigue abierto (por su nombre), en su pestaña', abierto() && pan().dataset.tab === 'ed' && caja.querySelector('.dki-fila.sel').dataset.item === "Tito's Vodka");
  prueba('lo que estabas editando no se pisa', pan().querySelector('#dkiPar').value === '7' && !pan().querySelector('.dki-guardar').disabled);
  oyenteLive && oyenteLive();
  await esperar(40);
  prueba('el LIVE también repinta, sin pisar el borrador', pan().querySelector('#dkiPar').value === '7');
  prueba('escucha inventoryUpdated y el LIVE (no abre su propio canal)', /\['inventoryUpdated', 'ordersUpdated', 'parAdjustmentsUpdated'\]\.forEach/.test(DI) && !/postgres_changes|\.channel\(/.test(DI));
  prueba('el módulo de tiempo real sigue llamando a render() y avisando', /if \(typeof render === 'function'\) render\(\);/.test(RT) && /emit\('inventoryUpdated'/.test(RT));

  grupo('6. Guardar y borrar, por lo de siempre');
  llamadas.length = 0;
  const ov = pan().querySelector('#dkiOv'); ov.value = '5'; ov.dispatchEvent(new w.Event('input', { bubbles: true }));
  pan().querySelector('[data-acc="guardar"]').click(); await esperar(30);
  prueba('Save guarda proveedor, par y precio (bsSaveItemFields)', llamadas.some(x => /^guardar:\d+:\{"vendor":"LOOP","suggested":7,"value":25\}$/.test(x)), llamadas.join(','));
  prueba('y el override por updateFinalOrder', llamadas.some(x => /^override:\d+:5$/.test(x)), llamadas.join(','));
  prueba('tras guardar, sigue abierto y sin borrador', caja.querySelector('.dki-fila.sel') && w.BarStockDeskInventory._estado().borrador === null);
  llamadas.length = 0;
  pan().querySelector('[data-acc="borrar"]').click(); await esperar(10);
  prueba('Delete pide un segundo clic', !llamadas.some(x => /^borrar:/.test(x)) && /Click again/.test(txt(pan().querySelector('[data-acc="borrar"]'))));
  pan().querySelector('[data-acc="borrar"]').click(); await esperar(30);
  prueba('el segundo borra con BarStockItemEdit.borrar (respaldo primero)', llamadas.includes("borrar:Tito's Vodka") && !filas().includes("Tito's Vodka"));
  prueba('y el panel se cierra', !caja.querySelector('#dkiPanel .dki-pn'));
  prueba('Rename por BarStockItemEdit.renombrar', /E\.renombrar\(r, \{ nombre:/.test(DI));

  grupo('7. Carga y versiones');
  const pos = (f) => INDEX.indexOf(f);
  prueba('se carga antes que desk-shell y después de mobile-inventory y mobile-search', pos('src/desk-inventory.js') > pos('src/mobile-inventory.js') && pos('src/desk-inventory.js') > pos('src/mobile-search.js') && pos('src/desk-inventory.js') < pos('src/desk-shell.js'));
  prueba('su hoja, con versión', /styles\/desk-inventory\.css\?v=/.test(INDEX));
  prueba('la ficha del panel con los estilos del teléfono (#dkiPanel en desk-ficha.css)', /#dkiPanel \.m-fic \{/.test(leer('styles/desk-ficha.css')));

  console.log('\n' + ok + ' ok · ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
})();
