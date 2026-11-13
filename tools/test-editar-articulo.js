#!/usr/bin/env node
/*
 * ── Editar un artículo: nombre, código y borrar ──────────────────────
 *
 * Axel, 2026-11-13: "no puedo creer que a estas alturas no tengamos la
 * opción de editar un artículo". Opción A: en la hoja de siempre.
 *
 *   1. La 038: renombra en TODAS las tablas que guardan el nombre (la
 *      lista de information_schema del 2026-11-13), y no toca el nombre
 *      de MarginEdge ni el respaldo viejo. (Probada además contra un
 *      Postgres 16 de verdad: todo o nada, nombre repetido, lo
 *      compartido entre locaciones.)
 *   2. renombrar(): llama a la función con el nombre normalizado por la
 *      MISMA normalizeName de la app, pone al día la copia del teléfono
 *      y los alias, y un error se dice tal cual.
 *   3. borrar(): sin respaldo no borra.
 *   4. La hoja: nombre y código arriba; renombrar va antes que el resto
 *      y si falla no se guarda nada; Delete pide dos toques.
 *   5. El escritorio usa la misma función de alias; el orden de carga.
 *
 *   node tools/test-editar-articulo.js
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

function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k' };
  w.BarStockInventoryCloud = {
    fetchLocationId: async () => 'loc-1',
    deleteInventoryItem: async (x) => { w.__borrado = x; return true; }
  };
  w.state = { master: [{ item: 'Triage House Vodka', itemNorm: 'TRIAGE HOUSE VODKA', code: 'T1', vendor: 'UNKNOWN', suggested: 12, onHand: 1, value: 5.5 },
    { item: 'Kamora', itemNorm: 'KAMORA', code: 'K1', vendor: 'LOOP', suggested: 2, onHand: 1, value: 20 }] };
  w.normalizeName = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
  w.__alias = { 'TRIAGE VODKA': 'TRIAGE HOUSE VODKA' };
  w.bsRenombrarAliases = (v, n) => { Object.keys(w.__alias).forEach(k => { if (w.__alias[k] === v) w.__alias[k] = n; }); };
  w.saveState = () => { w.__guardado = (w.__guardado || 0) + 1; };
  w.__pet = [];
  w.fetch = async (url, op) => {
    w.__pet.push({ url: String(url), cuerpo: op && op.body ? JSON.parse(op.body) : null });
    if (o.respuesta) return o.respuesta();
    return { ok: true, status: 200, json: async () => ({ renamed: true, compartidas: false, inventory_items: 1 }), text: async () => '{}' };
  };
  w.BarStockBackup = { snapshot: async (r) => { w.__respaldo = r; return o.sinRespaldo ? { ok: false, error: 'backup down' } : { ok: true, itemCount: 2 }; } };
  w.eval(leer('src/item-edit.js'));
  return w;
}

(async () => {
  grupo('1 · la migración 038');
  {
    const sql = fs.existsSync(path.join(RAIZ, 'database/migrations/038_rename_inventory_item.sql')) ? leer('database/migrations/038_rename_inventory_item.sql') : '';
    const cuerpo = sql.replace(/^\s*--.*$/gm, '');
    prueba('crea rename_inventory_item', /create or replace function public\.rename_inventory_item\(/.test(cuerpo));
    const tablas = ['inventory_items', 'inventory_snapshots', 'count_corrections', 'count_zones', 'item_activity', 'marginedge_links',
      'marginedge_price_log', 'no_match_items', 'quick_order_drafts', 'sales_aliases', 'sales_overrides', 'theoretical_exclusions',
      'theoretical_sales', 'toast_item_links', 'toast_recipe_lines', 'vendor_order_items', 'inventory_aliases', 'bottle_images',
      'item_barcodes', 'item_shapes'];
    const faltan = tablas.filter(t => !new RegExp("'" + t + "'|public\\." + t + '\\b').test(cuerpo));
    prueba('las 20 tablas que guardan el nombre', !faltan.length, faltan.join(' '));
    prueba('ni el nombre de MarginEdge ni el respaldo viejo', !/marginedge_not_mine|inventory_items_backup/.test(cuerpo));
    prueba('por locación; recetas y pedidos por su padre', /location_id::text = \$2/.test(cuerpo) &&
      /recipe_id in \(select id from public\.toast_recipes where location_id::text = p_location\)/.test(cuerpo) &&
      /vendor_order_id in \(select id from public\.vendor_orders where location_id::text = p_location\)/.test(cuerpo));
    prueba('lo compartido, sólo si nadie más usa el nombre viejo', /v_shared := exists/.test(cuerpo) && /if not v_shared then/.test(cuerpo));
    prueba('un nombre que ya existe en la locación se niega', /There is already an item called/.test(cuerpo));
  }

  grupo('2 · renombrar');
  {
    const w = entorno();
    const r = w.state.master[0];
    const res = await w.BarStockItemEdit.renombrar(r, { nombre: '  Triage  House Vodka 1L ', codigo: 'T1' });
    const p = w.__pet[0];
    prueba('llama a la función de la base', !!p && /\/rest\/v1\/rpc\/rename_inventory_item$/.test(p.url));
    prueba('con la locación, el nombre viejo y el nuevo (limpio)', p.cuerpo.p_location === 'loc-1' && p.cuerpo.p_old === 'Triage House Vodka' && p.cuerpo.p_new === 'Triage House Vodka 1L');
    prueba('normalizados con la normalizeName de la app', p.cuerpo.p_old_norm === 'TRIAGE HOUSE VODKA' && p.cuerpo.p_new_norm === 'TRIAGE HOUSE VODKA 1L');
    prueba('el código igual va como null (no se toca)', p.cuerpo.p_new_code === null);
    prueba('la copia del teléfono y sus alias, al día', r.item === 'Triage House Vodka 1L' && r.itemNorm === 'TRIAGE HOUSE VODKA 1L' &&
      w.__alias['TRIAGE VODKA'] === 'TRIAGE HOUSE VODKA 1L' && w.__guardado >= 1 && res.renamed === true);
    w.__pet.length = 0;
    prueba('sin cambios no llama', (await w.BarStockItemEdit.renombrar(r, { nombre: 'Triage House Vodka 1L', codigo: 'T1' })) === null && !w.__pet.length);
    await w.BarStockItemEdit.renombrar(r, { nombre: 'Triage House Vodka 1L', codigo: 'T9' });
    prueba('sólo el código: mismo nombre y el código nuevo', w.__pet[0].cuerpo.p_new === w.__pet[0].cuerpo.p_old && w.__pet[0].cuerpo.p_new_code === 'T9' && r.code === 'T9');
    let e0 = '';
    try { await w.BarStockItemEdit.renombrar(r, { nombre: '   ' }); } catch (e) { e0 = e.message; }
    prueba('un nombre vacío no se manda', /can.t be empty/.test(e0));

    const w2 = entorno({ respuesta: () => ({ ok: false, status: 400, text: async () => '{"code":"P0001","message":"There is already an item called \\"Kamora\\" at Crown."}' }) });
    let e1 = '';
    try { await w2.BarStockItemEdit.renombrar(w2.state.master[0], { nombre: 'Kamora' }); } catch (e) { e1 = e.message; }
    prueba('el error de la base, tal cual', e1 === 'There is already an item called "Kamora" at Crown.', e1);
    prueba('y la copia del teléfono no cambia', w2.state.master[0].item === 'Triage House Vodka');
    const w3 = entorno({ respuesta: () => ({ ok: false, status: 404, text: async () => '{"code":"PGRST202","message":"Could not find the function public.rename_inventory_item"}' }) });
    let e2 = '';
    try { await w3.BarStockItemEdit.renombrar(w3.state.master[0], { nombre: 'X' }); } catch (e) { e2 = e.message; }
    prueba('sin la función: dice que falta la 038, sólo entonces', /migration 038/.test(e2) && !/038/.test(e1));
  }

  grupo('3 · borrar');
  {
    const w = entorno({ sinRespaldo: true });
    let e = '';
    try { await w.BarStockItemEdit.borrar(w.state.master[0]); } catch (x) { e = x.message; }
    prueba('sin respaldo, no borra', /nothing was deleted/.test(e) && !w.__borrado && w.state.master.length === 2);
    const w2 = entorno();
    await w2.BarStockItemEdit.borrar(w2.state.master[0]);
    prueba('con respaldo: primero el respaldo, luego borra', /Before deleting Triage House Vodka/.test(w2.__respaldo) &&
      w2.__borrado && w2.__borrado.item === 'Triage House Vodka' && w2.__borrado.code === 'T1');
    prueba('y sale de la lista del teléfono', w2.state.master.length === 1 && w2.state.master[0].item === 'Kamora');
  }

  grupo('4 · la hoja');
  {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/', runScripts: 'outside-only' });
    const w = dom.window;
    w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    w.state = { master: [{ item: 'Triage House Vodka', itemNorm: 'TRIAGE HOUSE VODKA', code: '', vendor: 'UNKNOWN', onHand: 1, suggested: 12, value: 5.5, toOrder: 11 }] };
    w.normalizeName = (s) => String(s || '').trim().toUpperCase();
    w.getVendorsForFilter = () => ['ALL', 'UNKNOWN'];
    w.getVendorsWithUnknown = () => ['LOOP', 'UNKNOWN'];
    w.__orden = [];
    w.bsSaveItemFields = async (idx, campos) => { w.__orden.push('campos'); Object.assign(w.state.master[idx], campos); return true; };
    let fallar = false;
    w.BarStockItemEdit = {
      renombrar: async (r, c) => { w.__orden.push('renombrar:' + c.nombre + '|' + c.codigo); if (fallar) throw new Error('There is already an item called "Kamora" at Crown.'); r.item = c.nombre.trim(); r.code = c.codigo.trim(); return { renamed: true }; },
      borrar: async (r) => { w.__orden.push('borrar'); w.state.master.splice(w.state.master.indexOf(r), 1); return true; }
    };
    w.BarStockToast = { show: (t) => w.__orden.push('aviso:' + t) };
    let def = null;
    w.__banda = null; w.__atras = null;
    w.BarStockMobile = { register(d) { def = d; }, refrescarBadges() {},
      enBanda: (t) => { w.__banda = t; return true; }, alVolverBanda: (fn) => { w.__atras = fn; }, salirBanda: () => { w.__banda = null; },
      ir: (id) => { w.__ir = id; } };
    w.vendorDotColor = (v) => ({ LOOP: '#38bdf8', UNKNOWN: '#71717a' }[v] || '#123456');
    w.BarStockProductWeeks = { semanas: async (item, n) => { w.__semanasPedidas = [item, n];
      return [{ semana: '2026-10-19', usado: 3 }, { semana: '2026-10-26', usado: 6.25 }, { semana: '2026-11-02', usado: 4 }]; } };
    w.parAdjustments = new Map([['Triage House Vodka||', { avgUsed: 4.37, suggestedOptimal: 14 }]]);
    w.eval(leer('src/mobile-inventory.js'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    const host = w.document.createElement('div'); host.className = 'm-screen on'; host.dataset.screen = 'inventory'; w.document.body.appendChild(host);
    def.mount(host);
    host.querySelector('.m-inv').click();
    const hoja = () => w.document.querySelector('.m-ed');
    await esperar(10);
    {
      const g = () => hoja().querySelector('#miSem');
      prueba('las semanas, de la misma fuente que la ficha (8)', w.__semanasPedidas && w.__semanasPedidas[0] === 'Triage House Vodka' && w.__semanasPedidas[1] === 8 &&
        !g().hidden && g().querySelectorAll('[data-w]').length === 3);
      prueba('de entrada, la última semana con su número', /4 used · week of Nov 2/.test(g().textContent) && g().querySelector('[data-w="2"]').classList.contains('on'), g().textContent);
      g().querySelector('[data-w="1"]').click();
      prueba('tocar otra barra dice la suya', /6\.3 used · week of Oct 26/.test(g().textContent) && g().querySelector('[data-w="1"]').classList.contains('on'), g().textContent);
      prueba('el promedio es el de Pour·IQ, no uno nuevo', /Pour·IQ avg 4\.4/.test(g().textContent));
      prueba('la raya del par, con el par de arriba', /par 12/.test(g().textContent));
      hoja().querySelector('#miLess').click();
      prueba('y sigue al par al cambiarlo', /par 11/.test(g().textContent) && /6\.3 used/.test(g().textContent));
      prueba('lo que dice Pour·IQ, en la cabecera de la gráfica', !!g().querySelector('#miIq') && /Pour·IQ: 14 · use it/.test(g().textContent));
      g().querySelector('#miIq').click();
      prueba('y usarlo pone el par y mueve la raya', hoja().querySelector('#miPar').value === '14' && /par 14/.test(g().textContent));
      hoja().querySelector('#miPar').value = '12';
    }
    prueba('es pantalla, con "Edit item" en la banda', !!hoja() && w.__banda === 'Edit item');
    // Opción B (2026-11-13): el aire de un teléfono alto, repartido entre
    // los bloques con separadores elásticos, no todo junto antes de los
    // botones.
    prueba('un separador elástico entre cada bloque (6), y el último antes de los botones',
      hoja().querySelectorAll('.m-ed-in > .m-ed-aire').length === 6 && !!hoja().querySelector('.m-ed-in > #miHero') &&
      hoja().querySelector('.m-ed-acts').previousElementSibling.previousElementSibling.classList.contains('m-ed-aire'));
    prueba('en el CSS crecen por igual y en una pantalla justa miden 0',
      /\.m-ed-aire \{ display: block; flex: 1 1 0; min-height: 0; \}/.test(leer('styles/mobile-app.css')) &&
      !/\.m-ed-in > \.m-ed-acts \{[^}]*margin-top: auto/.test(leer('styles/mobile-app.css')));
    prueba('el atrás de la banda vuelve a la lista', typeof w.__atras === 'function' && (w.__atras(), !hoja()) && w.__banda === null &&
      !!host.querySelector('.m-inv'));
    host.querySelector('.m-inv').click();
    prueba('el gesto del borde también', def.atras(host) === true && (def.atras(host, true), !hoja()) && def.atras(host) === false);
    host.querySelector('.m-inv').click();
    // El proveedor: una fila con su color; la lista en una hoja.
    prueba('el proveedor, en una fila con su color', /UNKNOWN/.test(hoja().querySelector('#miVendBtn').textContent) &&
      /113, 113, 122|#71717a/.test(hoja().querySelector('#miVendDot').style.background));
    hoja().querySelector('#miVendBtn').click();
    const hv = w.document.querySelector('#mSheet .m-vend-hoja');
    prueba('Change abre la lista, cada uno con su color y ✓ en el actual', !!hv && hv.querySelectorAll('[data-nv]').length === 2 &&
      !!hv.querySelector('.m-vend-op.on .ti-check'));

    prueba('el nombre, una vez: en la tarjeta; Rename abre nombre y código', !hoja().querySelector('#miName') && !!hoja().querySelector('#miRen'));
    hoja().querySelector('#miRen').click();
    prueba('nombre y código, con lo de ahora, antes del proveedor', hoja().querySelector('#miName').value === 'Triage House Vodka' && hoja().querySelector('#miCode').value === '' &&
      hoja().innerHTML.indexOf('miName') < hoja().innerHTML.indexOf('miVendBtn'));
    prueba('y Delete en la línea de Save', !!hoja().querySelector('.m-ed-acts #miDel') && !!hoja().querySelector('.m-ed-acts #miSave'));

    hv.querySelector('[data-nv="LOOP"]').click();
    prueba('elegir uno lo pone en la fila y cierra la lista', /LOOP/.test(hoja().querySelector('#miVendN').textContent) && !w.document.querySelector('#mSheet'));
    fallar = true;
    hoja().querySelector('#miName').value = 'Kamora';
    hoja().querySelector('#miSave').click(); await esperar(20);
    prueba('si la base no renombra: lo dice y no guarda lo demás', /Not saved: There is already an item called/.test(hoja().querySelector('#miErr').textContent) &&
      !w.__orden.includes('campos'));
    fallar = false; w.__orden.length = 0;
    hoja().querySelector('#miName').value = 'Triage House Vodka 1L';
    hoja().querySelector('#miCode').value = 'T1';
    hoja().querySelector('#miSave').click(); await esperar(20);
    prueba('renombrar va primero, y después lo demás', w.__orden[0] === 'renombrar:Triage House Vodka 1L|T1' && w.__orden[1] === 'campos', w.__orden.join(' / '));
    prueba('tras renombrar, la recarga vuelve a ESTA pantalla', w.sessionStorage.getItem('barstock.editarTrasRecargar') === 'Triage House Vodka 1L');
    prueba('y guarda el proveedor elegido', w.state.master[0].vendor === 'LOOP');
    prueba('y avisa que recarga para que todo lea el nombre nuevo', w.__orden.some(x => /Renamed everywhere/.test(x)));

    // Tras la recarga de un renombrar, la app vuelve a esta pantalla.
    def.atras(host, true);
    w.BarStockMobileInventory.reabrirTrasRecargar(0);
    prueba('después de recargar, vuelve a editar ese producto', w.__ir === 'inventory' && !!hoja() &&
      /Triage House Vodka 1L/.test(hoja().textContent) && !w.sessionStorage.getItem('barstock.editarTrasRecargar'));
    def.atras(host, true);

    // Guardar sin renombrar: te quedas en la pantalla (Axel, 2026-11-13).
    host.querySelector('.m-inv').click();
    w.__orden.length = 0;
    hoja().querySelector('#miMore').click();
    hoja().querySelector('#miSave').click(); await esperar(20);
    prueba('Save no saca de la pantalla', !!hoja() && w.__orden.includes('campos') && w.__orden.some(x => x === 'aviso:Saved'));
    prueba('y la tarjeta de arriba dice lo guardado', /of 13/.test(hoja().querySelector('#miHero').textContent), hoja().querySelector('#miHero').textContent);
    // bsSaveItemFields deja en el maestro un objeto NUEVO: lo que se haga
    // después (borrar) tiene que ir sobre ése, no sobre la copia vieja.
    w.state.master[0] = Object.assign({}, w.state.master[0]);
    hoja().querySelector('#miSave').click(); await esperar(20);
    w.__orden.length = 0;
    hoja().querySelector('#miDel').click(); hoja().querySelector('#miDel').click(); await esperar(20);
    prueba('borrar después de guardar borra la fila de verdad', w.__orden.includes('borrar') && w.state.master.length === 0);
    w.state.master.push({ item: 'Triage House Vodka 1L', itemNorm: 'X', code: 'T1', vendor: 'LOOP', onHand: 1, suggested: 12, value: 5.5, toOrder: 11 });
    host.querySelector('[data-s="todo"]') && host.querySelector('[data-s="todo"]').click();

    host.querySelector('.m-inv').click();
    w.__orden.length = 0;
    hoja().querySelector('#miDel').click();
    prueba('Delete pide un segundo toque', /Tap again/.test(hoja().querySelector('#miDel').textContent) && !w.__orden.includes('borrar'));
    hoja().querySelector('#miDel').click(); await esperar(20);
    prueba('al segundo borra, cierra y lo dice', w.__orden.includes('borrar') && !w.document.querySelector('.m-ed') &&
      w.__orden.some(x => /backup is in Time Machine/.test(x)));
  }

  grupo('4b · el modal del escritorio renombra igual');
  {
    const idx = leer('index.html');
    const ini = idx.indexOf('async function saveEditedItem(){');
    const fin = idx.indexOf('\n}\n', ini);
    const fn = idx.slice(ini, fin + 2);
    async function modal(o) {
      const w = new JSDOM('<!doctype html><body>' +
        ['editCode', 'editName', 'editVendor', 'editOnHand', 'editSuggested', 'editValue', 'editFinalOrder'].map(i => '<input id="' + i + '">').join('') +
        '</body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
      w.__orden = [];
      w.state = { master: [{ item: 'Triage House Vodka', itemNorm: 'TRIAGE HOUSE VODKA', code: 'T1', vendor: 'LOOP', onHand: 3, suggested: 12, value: 5.5 }] };
      const v = { editCode: o.code || 'T1', editName: o.nombre || 'Triage House Vodka', editVendor: 'LOOP', editOnHand: '3', editSuggested: '14', editValue: '5.5', editFinalOrder: '' };
      for (const k in v) w.document.getElementById(k).value = v[k];
      w.BarStockItemEdit = { renombrar: async (r, c) => {
        w.__orden.push('renombrar:' + c.nombre + '|' + c.codigo);
        if (o.falla) throw new Error('There is already an item called "Kamora" at Crown.');
        r.item = c.nombre; r.itemNorm = c.nombre.toUpperCase(); r.code = c.codigo; return { renamed: c.nombre !== 'Triage House Vodka' };
      } };
      // El alert de jsdom no se deja pisar con una declaración: se asigna.
      w.alert = (t) => w.__orden.push('alert:' + t);
      w.console.error = () => {};
      w.BarStockInventoryCloud = { patchInventoryItem: async (x) => { w.__orden.push('patch:' + x.oldItem + '>' + x.item + '|' + x.oldCode); } };
      w.eval('var currentEditIndex = 0; function parseNum(v){ return Number(v) || 0; } function inferVendor(){ return "LOOP"; }' +
        'function computeToOrder(a,b){ return Math.max(0,b-a); } function supportsManualFinalOrder(){ return false; }' +
        'function normalizeName(s){ return String(s).toUpperCase(); } function saveState(){ __orden.push("saveState"); } function render(){}' +
        'function closeEditModal(){ __orden.push("cerrar"); } function setStatus(t){ __orden.push("status:" + t); }' +
        'function bsRenombrarAliases(){ __orden.push("aliasDirecto"); }' + fn);
      await w.saveEditedItem();
      return w;
    }
    let w = await modal({ nombre: 'Triage House Vodka 1L' });
    prueba('renombra por la función de la base, ANTES de lo demás', w.__orden[1] === 'renombrar:Triage House Vodka 1L|T1' && /^patch:/.test(w.__orden[2]), w.__orden.join(' / '));
    prueba('lo demás va contra el nombre que ya tiene en la base', w.__orden.includes('patch:Triage House Vodka 1L>Triage House Vodka 1L|T1'));
    prueba('y la fila de memoria queda con el nuevo', w.state.master[0].item === 'Triage House Vodka 1L' && w.state.master[0].suggested === 14);
    prueba('los alias los pone renombrar(), no una segunda vez aquí', !w.__orden.includes('aliasDirecto'));
    prueba('y recarga para que todo lea el nombre nuevo', w.__orden.some(x => /Renamed everywhere/.test(x)));
    w = await modal({ nombre: 'Kamora', falla: true });
    prueba('si la base no renombra: lo dice y no guarda nada más', w.__orden.some(x => /alert:[\s\S]*already an item called/.test(x)) && !w.__orden.some(x => /^patch:/.test(x)) && !w.__orden.includes('cerrar'));
    w = await modal({});
    prueba('sin cambiar nombre ni código, no llama a renombrar', !w.__orden.some(x => /^renombrar/.test(x)) && w.__orden.includes('patch:Triage House Vodka>Triage House Vodka|T1'));
    prueba('ya no renombra sólo inventory_items a mano', !/oldItem,\s*\n\s*code,\s*\n\s*item,/.test(fn));
  }

  grupo('4c · el Delete del escritorio, con respaldo');
  {
    const idx = leer('index.html');
    const ini = idx.indexOf('async function deleteEditedItem(){');
    const fn = idx.slice(ini, idx.indexOf('\n}\n', ini) + 2);
    async function borrarEsc(o) {
      const w = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
      w.__orden = [];
      w.state = { master: [{ item: 'Triage House Vodka', code: 'T1' }, { item: 'Kamora', code: 'K1' }] };
      w.confirm = () => true;
      w.alert = (t) => w.__orden.push('alert:' + t);
      w.console.error = () => {};
      w.BarStockItemEdit = { borrar: async (r) => {
        w.__orden.push('borrar:' + r.item);
        if (o.sinRespaldo) throw new Error('Could not take a backup first, so nothing was deleted.');
        w.state.master.splice(w.state.master.indexOf(r), 1);
        return true;
      } };
      w.BarStockInventoryCloud = { deleteInventoryItem: async () => { w.__orden.push('borradoDirecto'); } };
      w.eval('var currentEditIndex = 0; function saveState(){} function render(){ __orden.push("render"); }' +
        'function closeEditModal(){ __orden.push("cerrar"); } function setStatus(t){ __orden.push("status:" + t); }' +
        'async function loadInventoryFromSupabase(){ __orden.push("recargar"); }' + fn);
      await w.deleteEditedItem();
      return w;
    }
    let w = await borrarEsc({});
    prueba('borra por borrar(), con su respaldo; no directo a la nube', w.__orden.includes('borrar:Triage House Vodka') && !w.__orden.includes('borradoDirecto'));
    prueba('sale de la lista, se cierra y dice dónde está el respaldo', w.state.master.length === 1 && w.__orden.includes('cerrar') &&
      w.__orden.some(x => /backup from just before is in Time Machine/.test(x)));
    w = await borrarEsc({ sinRespaldo: true });
    prueba('sin respaldo: no borra, no cierra, y dice por qué', w.state.master.length === 2 && !w.__orden.includes('cerrar') &&
      w.__orden.some(x => /alert:[\s\S]*nothing was deleted/.test(x)));
    prueba('ya no llama a deleteInventoryItem por su cuenta', !/deleteInventoryItem/.test(fn));
  }

  grupo('5 · el escritorio y el orden de carga');
  {
    const idx = leer('index.html');
    prueba('la función de alias, una sola, en index.html', /function bsRenombrarAliases\(/.test(idx));
    const p = f => idx.indexOf('src="src/' + f);
    prueba('item-edit.js después del respaldo y antes de la pantalla', p('inventory-backup.js') < p('item-edit.js') && p('item-edit.js') < p('mobile-inventory.js') && p('item-edit.js') > 0);
  }

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
