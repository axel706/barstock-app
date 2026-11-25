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
 *   3. Las reglas de las filas son las del teléfono (filtrar / faltas).
 *   4. La barra C y el panel A; el estándar de las secciones.
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
const MI = leer('src/mobile-inventory.js');
const CSS = leer('styles/desk-inventory.css');
const RT = leer('src/inventory-realtime.js');

const w = new JSDOM(`<!doctype html><body class="dk"><div class="wrap">
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
w.eval(MI);
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
  prueba('el conteo en curso, en la cabeza', !!caja.querySelector('#dkiConteo #countResumeHost'));
  prueba('cuatro cifras: dinero, items, needs fixing, running out', /Money on the shelf/.test(txt(caja.querySelector('.dki-cifras'))) && /Items/.test(txt(caja.querySelector('.dki-cifras'))) && /Needs fixing\s*2/.test(txt(caja.querySelector('.dki-cifras'))) && /Running out\s*1/.test(txt(caja.querySelector('.dki-cifras'))));
  prueba('una fila por producto, en el orden del teléfono (dinero en el estante)', filas().join('|') === "Aperol|Tito's Vodka|Hennessy VS", filas().join('|'));
  const tito = caja.querySelector('.dki-fila[data-item="Tito\'s Vodka"]');
  prueba('el número es el LIVE con ≈ y su par', /≈2\.4\s*\/6/.test(txt(tito.querySelector('.dki-hay'))));
  prueba('● Live, Out Sat y el chip de Pour·IQ', /Live/.test(txt(tito)) && /Out Sat/.test(txt(tito)) && !!tito.querySelector('.par-chip'));
  prueba('lo que le falta a cada uno (no price, no par)', /no price/.test(txt(caja.querySelector('.dki-fila[data-item="Hennessy VS"]'))) && /no par/.test(txt(caja.querySelector('.dki-fila[data-item="Hennessy VS"]'))));

  grupo('2. La barra C');
  prueba('segmentado: Everything, Needs fixing, Running out', caja.querySelectorAll('.dki-seg [data-vista]').length === 3);
  caja.querySelector('[data-vista="fix"]').click(); await esperar(10);
  prueba('Needs fixing: sólo lo incompleto (regla del teléfono)', filas().join('|') === 'Hennessy VS|Aperol' || filas().join('|') === 'Aperol|Hennessy VS', filas().join('|'));
  caja.querySelector('[data-vista="agota"]').click(); await esperar(10);
  prueba('Running out: la lista de Running out', filas().join('|') === "Tito's Vodka");
  caja.querySelector('[data-vista="todo"]').click(); await esperar(10);
  const sel = caja.querySelector('#dkiVendor'); sel.value = 'SOUTHERN'; sel.dispatchEvent(new w.Event('change', { bubbles: true })); await esperar(10);
  prueba('menú de proveedor', filas().join('|') === 'Hennessy VS');
  const sel2 = caja.querySelector('#dkiVendor'); sel2.value = 'ALL'; sel2.dispatchEvent(new w.Event('change', { bubbles: true })); await esperar(10);
  const ord = caja.querySelector('#dkiOrden'); ord.value = 'nombre'; ord.dispatchEvent(new w.Event('change', { bubbles: true })); await esperar(10);
  prueba('menú de orden (Name)', filas().join('|') === "Aperol|Hennessy VS|Tito's Vodka");
  caja.querySelector('[data-col="precio"]').click(); await esperar(10);
  prueba('tocar una columna ordena por ella', filas()[0] === "Tito's Vodka", filas().join('|'));
  const q = caja.querySelector('#dkiQ'); q.value = 'hen'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await esperar(10);
  prueba('buscador', filas().join('|') === 'Hennessy VS');
  const q2 = caja.querySelector('#dkiQ'); q2.value = ''; q2.dispatchEvent(new w.Event('input', { bubbles: true })); await esperar(10);
  prueba('la barra se pega bajo la barra de arriba', /\.dki-pega \{[^}]*position: sticky; top: var\(--dk-alto\)/.test(CSS));
  prueba('las reglas de filas son las del teléfono (filtrar / faltas exportadas)', /BarStockMobileInventory = \{[^}]*filtrar, faltas \}/.test(MI) && /M\.filtrar\(/.test(DI) && /M\.faltas\(/.test(DI));

  grupo('3. Las herramientas de la cabeza');
  llamadas.length = 0;
  let contado = 0; D.getElementById('takeInventoryBtn').addEventListener('click', () => contado++);
  caja.querySelector('[data-acc="contar"]').click();
  caja.querySelector('[data-acc="nuevo"]').click();
  caja.querySelector('[data-acc="categorias"]').click();
  caja.querySelector('[data-acc="botellas"]').click();
  prueba('Count = Take inventory (con su comprobación del ciclo)', contado === 1);
  prueba('Add item, categorías y botellas, lo de siempre', llamadas.includes('nuevo') && llamadas.includes('autocat') && llamadas.includes('autobot'), llamadas.join(','));
  prueba('sin Scan Price Invoice (los precios vienen de MarginEdge)', !/Scan|invoice/i.test(txt(caja.querySelector('.dki-herr'))) && !/openInvoiceScanModal/.test(DI));
  prueba('al crear, sin On Hand a mano (empieza en 0)', /#newItemModalBg label:has\(#newItemOnHand\) \{ display: none; \}/.test(CSS));

  grupo('4. El producto (panel A)');
  llamadas.length = 0;
  caja.querySelector('.dki-fila[data-item="Tito\'s Vodka"]').click(); await esperar(10);
  const pan = () => caja.querySelector('#dkiPanel');
  prueba('abre su panel con la ficha de Do we have', /Tito's Vodka/.test(txt(pan().querySelector('.dki-ph'))) && llamadas.some(x => /^ficha:/.test(x)));
  prueba('sin On Hand editable', !pan().querySelector('input[id*="Hand"], input[id*="hand"]') && !/onHand:/.test(DI.slice(DI.indexOf('bsSaveItemFields(i2'), DI.indexOf('bsSaveItemFields(i2') + 200)));
  ['categoria', 'botella', 'info', 'cero', 'recibido'].forEach(a => pan().querySelector(`[data-acc="${a}"]`).click());
  prueba('categoría, botella, Pour·IQ history (Item Info), Zero par y Received', llamadas.includes('categoria:0') && llamadas.includes('botella') && llamadas.includes('info:0') && llamadas.includes('cero:0') && llamadas.includes('recibido:0'), llamadas.join(','));
  prueba('Save empieza apagado', pan().querySelector('.dki-guardar').disabled);
  pan().querySelector('[data-par="1"]').click();
  prueba('tocar el par lo cambia y enciende Save', pan().querySelector('#dkiPar').value === '7' && !pan().querySelector('.dki-guardar').disabled);

  grupo('5. EL TIEMPO REAL');
  // Llega un cambio de otro dispositivo: inventory-realtime REEMPLAZA la
  // lista (objetos nuevos) y avisa. El precio de Aperol cambió fuera.
  w.state.master = w.state.master.map(r => Object.assign({}, r, r.item === 'Aperol' ? { value: 99 } : {}));
  w.BarStockEvents.emit('inventoryUpdated', { source: 'inventory-realtime' });
  await esperar(40);
  prueba('la lista se repinta con lo que cambió fuera', /\$99\.00/.test(txt(caja.querySelector('.dki-fila[data-item="Aperol"]'))));
  prueba('el producto abierto sigue abierto (por su nombre)', /Tito's Vodka/.test(txt(pan().querySelector('.dki-ph'))) && caja.querySelector('.dki-fila.sel').dataset.item === "Tito's Vodka");
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
  prueba('y el panel se cierra', !caja.querySelector('#dkiPanel .dki-ph'));
  prueba('Rename por BarStockItemEdit.renombrar', /E\.renombrar\(r, \{ nombre:/.test(DI));

  grupo('7. Carga y versiones');
  const pos = (f) => INDEX.indexOf(f);
  prueba('se carga antes que desk-shell y después de mobile-inventory y mobile-search', pos('src/desk-inventory.js') > pos('src/mobile-inventory.js') && pos('src/desk-inventory.js') > pos('src/mobile-search.js') && pos('src/desk-inventory.js') < pos('src/desk-shell.js'));
  prueba('su hoja, con versión', /styles\/desk-inventory\.css\?v=/.test(INDEX));
  prueba('la ficha del panel con los estilos del teléfono (#dkiPanel en desk-ficha.css)', /#dkiPanel \.m-fic \{/.test(leer('styles/desk-ficha.css')));

  console.log('\n' + ok + ' ok · ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
})();
