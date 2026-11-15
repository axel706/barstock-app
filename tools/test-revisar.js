#!/usr/bin/env node
/*
 * ── Revisar lo que se acaba (lámina B) ───────────────────────────────
 *
 * docs/plan-lista-compras.md, fase 2. Axel, 2026-11-14, opción B: "See
 * them" de la tarjeta "Running out first" abre su propia pantalla de
 * revisión. Cada producto, con su LIVE, su "Out" y cuánto pedir, y dos
 * botones: "Add N to list" e "I have enough" (que pide cuántos hay, con
 * un teclado). Lo ya decidido se queda en su sitio con quién y cuándo,
 * para que todos los managers vean lo mismo. Lo que se protege:
 *
 *   1. La lista compartida (migración 043, src/shopping-list.js): añadir
 *      escribe sólo en shopping_list; quitar NO borra, cambia el estado.
 *   2. "I have enough" guarda una verificación con el número y con lo
 *      que decía la app; nunca toca on_hand.
 *   3. Lo verificado se cambia con "Change" (gana la última): las
 *      verificaciones son historia y no se deshacen. Lo de la lista sí
 *      tiene "Undo".
 *   4. Sin permiso, sin botón: "Add" pide "Make and send orders"; "I have
 *      enough", "Count inventory".
 *   5. "See them" del Home abre esta pantalla.
 *
 *   node tools/test-revisar.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const existe = f => fs.existsSync(path.join(RAIZ, f));

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = ms => new Promise(r => setTimeout(r, ms || 0));

(async () => {

grupo('1 · la migración 043');
{
  const F = 'database/migrations/043_shopping_list.sql';
  const c = existe(F) ? leer(F).replace(/--.*$/gm, '') : '';
  prueba('existe', !!c);
  prueba('crea shopping_list con cuánto, por qué, quién y su estado', /create table if not exists public\.shopping_list/.test(c) &&
    /qty\s+numeric/.test(c) && /reason\s+text/.test(c) && /added_by\s+text/.test(c) &&
    /check \(status in \('to_buy', 'ordered', 'arrived', 'removed'\)\)/.test(c));
  prueba('se lee, se añade y se cambia el estado; no se borra', /for select/.test(c) && /for insert/.test(c) && /for update/.test(c) && !/for delete/.test(c));
  prueba('el historial sigue al producto al renombrarlo', /update public\.shopping_list set item_name = new\.item_name/.test(c));
}

// Un teléfono de mentira con lo que la pantalla necesita.
function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body><div id="mScreens"><div id="mHome"></div></div></body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k' };
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-1' };
  w.__pet = [];
  w.__lista = (o.lista || []).slice();
  w.fetch = async (url, op) => {
    const u = String(url), m = (op && op.method) || 'GET';
    const cuerpo = op && op.body ? JSON.parse(op.body) : null;
    w.__pet.push({ url: u, metodo: m, cuerpo });
    if (/\/shopping_list/.test(u) && m === 'POST') { w.__lista.push(Object.assign({ id: 90 + w.__lista.length, status: 'to_buy' }, cuerpo)); return { ok: true, status: 201, text: async () => '' }; }
    if (/\/shopping_list/.test(u) && m === 'PATCH') { const id = Number((u.match(/id=eq\.(\d+)/) || [])[1]); w.__lista.forEach(x => { if (x.id === id) Object.assign(x, cuerpo); }); return { ok: true, status: 204, text: async () => '' }; }
    if (/\/stock_checks/.test(u) && m === 'POST') return { ok: true, status: 201, text: async () => '' };
    return { ok: true, status: 200, text: async () => '[]' };
  };
  w.BarStockRest = { leerTodo: async (ruta) => {
    w.__pet.push({ url: ruta, metodo: 'GET' });
    if (/^shopping_list/.test(ruta)) return w.__lista.filter(x => x.status === 'to_buy' || x.status === 'ordered');
    if (/^stock_checks/.test(ruta)) return o.checks || [];
    return [];
  } };
  const R = (item, live, dias, txt, pedir) => ({ item, onHand: 3, suggested: 5, vendor: 'LOOP', __live: live, __pedir: pedir, __out: { txt, tono: dias <= 2 ? 'r' : 'a', enDias: dias } });
  const filas = o.filas || [R("Dad's Hat Rye", 1, 1, 'Out Sun', 2), R('St Elder', 0.9, 3, 'Out Tue', 2), R('Baileys', 1.4, 4, 'Out Wed', 2)];
  w.state = { master: filas };
  w.BarStockRunningOut = { lista: () => filas.map(r => ({ r, item: r.item, dias: r.__out.enDias, out: r.__out, vivo: true, fuera: false })) };
  w.BarStockLiveCache = { cuanto: (r) => r.__live, pedir: (r) => r.__pedir, agota: (r) => r.__out, vivo: () => true, conteo: () => '2026-11-16T00:00:00Z',
    caducar: () => { w.__caducado = (w.__caducado || 0) + 1; }, alCambiar: () => () => {} };
  w.BarStockGuest = { puede: (k) => (o.sin || []).indexOf(k) < 0, nombre: () => 'Ana' };
  w.BarStockMobile = { enBanda: (t) => { w.__banda = t; return true; }, alVolverBanda: (f) => { w.__atras = f; }, salirBanda: () => { w.__salio = true; } };
  for (const f of ['src/shopping-list.js', 'src/stock-checks.js', 'src/num-pad.js', 'src/mobile-running-out.js']) if (existe(f)) w.eval(leer(f));
  return w;
}
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

grupo('2 · la lista compartida (src/shopping-list.js)');
{
  const w = entorno();
  const L = w.BarStockShoppingList;
  prueba('existe', !!L && typeof L.anadir === 'function' && typeof L.quitar === 'function' && typeof L.leer === 'function');
  if (L) {
    let r = await L.anadir({ item: "Dad's Hat Rye", qty: 2, motivo: 'app', por: 'Ana' });
    const p = w.__pet.find(x => x.metodo === 'POST');
    prueba('añadir escribe en shopping_list', !!p && /\/rest\/v1\/shopping_list$/.test(p.url), p && p.url);
    prueba('con la locación, el producto, cuánto, por qué y quién', p && p.cuerpo.location_id === 'loc-1' && p.cuerpo.item_name === "Dad's Hat Rye" &&
      p.cuerpo.qty === 2 && p.cuerpo.reason === 'app' && p.cuerpo.added_by === 'Ana', JSON.stringify(p && p.cuerpo));
    prueba('contesta bien', r.ok === true);
    const lista = await L.leer();
    prueba('leer trae lo que está por comprar', lista.length === 1 && lista[0].item_name === "Dad's Hat Rye", JSON.stringify(lista));
    r = await L.quitar(lista[0].id, 'Ana');
    const q = w.__pet.find(x => x.metodo === 'PATCH');
    prueba('quitar NO borra: cambia el estado a removed', !!q && q.cuerpo.status === 'removed' && !w.__pet.some(x => x.metodo === 'DELETE'), JSON.stringify(q && q.cuerpo));
    prueba('y ya no sale en la lista', (await L.leer()).length === 0);
    r = await L.anadir({ item: '', qty: 2 });
    prueba('sin producto no se añade', r.ok === false);
  }
}

grupo('3 · la pantalla: "See them" → revisar');
{
  const w = entorno();
  const P = w.BarStockRunningOutReview;
  prueba('existe', !!P && typeof P.abrir === 'function');
  if (P) {
    await P.abrir(w.document.getElementById('mHome'));
    await esperar(20);
    const s = w.document.querySelector('.m-ro');
    prueba('abre su pantalla con "Running out" en la banda', !!s && w.__banda === 'Running out');
    const cards = [...w.document.querySelectorAll('.m-ro-c')];
    prueba('una tarjeta por producto, en el orden de la lista', cards.length === 3 && cards[0].dataset.item === "Dad's Hat Rye", cards.map(c => c.dataset.item).join(','));
    prueba('con su LIVE, su Out y cuánto pedir', /≈1\.0/.test(txt(cards[0])) && /Out Sun/.test(txt(cards[0])) && /Order 2/.test(txt(cards[0])), txt(cards[0]));
    prueba('y los dos botones', !!cards[0].querySelector('[data-ro-add]') && !!cards[0].querySelector('[data-ro-ok]') && /Add 2 to list/.test(txt(cards[0])));
    prueba('arriba, el resumen', /3 run out this week/.test(txt(w.document.querySelector('.m-ro-sum'))), txt(w.document.querySelector('.m-ro-sum')));

    // Add to list
    cards[0].querySelector('[data-ro-add]').click();
    await esperar(30);
    let c0 = w.document.querySelector('.m-ro-c[data-item="Dad\'s Hat Rye"]');
    prueba('"Add" lo pone en la lista compartida', w.__lista.length === 1 && w.__lista[0].qty === 2 && w.__lista[0].added_by === 'Ana');
    prueba('y la tarjeta dice "On the list · 2 by Ana" con Undo', /On the list · 2 by Ana/.test(txt(c0)) && !!c0.querySelector('[data-ro-undo]') && !c0.querySelector('[data-ro-add]'), txt(c0));
    prueba('el resumen lo cuenta', /1 on the list/.test(txt(w.document.querySelector('.m-ro-sum'))));
    c0.querySelector('[data-ro-undo]').click();
    await esperar(30);
    c0 = w.document.querySelector('.m-ro-c[data-item="Dad\'s Hat Rye"]');
    prueba('Undo lo quita de la lista y vuelven los botones', w.__lista[0].status === 'removed' && !!c0.querySelector('[data-ro-add]'), txt(c0));

    // I have enough → el teclado
    w.document.querySelector('.m-ro-c[data-item="St Elder"] [data-ro-ok]').click();
    await esperar(10);
    const hoja = w.document.getElementById('mSheet');
    prueba('"I have enough" abre la hoja del número', !!hoja && !!hoja.querySelector('.m-kp'));
    prueba('que dice lo que cree la app', hoja && /Live says ≈0\.9/.test(txt(hoja)), txt(hoja));
    const tecla = (k) => hoja.querySelector('[data-k="' + k + '"]').click();
    const save = () => hoja.querySelector('#mKpSave');
    prueba('sin número, no se puede guardar', save().disabled === true);
    tecla('6'); tecla('.5');
    prueba('".5" para la botella abierta', /6\.5/.test(txt(hoja.querySelector('.m-kp-n'))), txt(hoja.querySelector('.m-kp-n')));
    tecla('del');
    prueba('borrar quita lo último', /^6\b/.test(txt(hoja.querySelector('.m-kp-n'))), txt(hoja.querySelector('.m-kp-n')));
    prueba('el botón dice exactamente lo que guarda', /Save · 6 on the shelf/.test(txt(save())), txt(save()));
    save().click();
    await esperar(30);
    const chk = w.__pet.find(x => /\/stock_checks/.test(x.url) && x.metodo === 'POST');
    prueba('guarda la verificación con el número y lo que decía la app', !!chk && chk.cuerpo.item_name === 'St Elder' &&
      chk.cuerpo.counted === 6 && chk.cuerpo.live_said === 0.9 && chk.cuerpo.checked_by === 'Ana', JSON.stringify(chk && chk.cuerpo));
    prueba('nunca toca el inventario', !w.__pet.some(x => /inventory_items|inventory_snapshots/.test(x.url)));
    prueba('el LIVE se rehace', w.__caducado >= 1);
    prueba('la hoja se cierra', !w.document.getElementById('mSheet'));
    const c1 = w.document.querySelector('.m-ro-c[data-item="St Elder"]');
    prueba('la tarjeta dice "Checked: 6 on the shelf" con Change, no Undo', /Checked: 6 on the shelf/.test(txt(c1)) && !!c1.querySelector('[data-ro-cambiar]') && !c1.querySelector('[data-ro-undo]'), txt(c1));

    // Volver
    w.__atras();
    prueba('atrás cierra la pantalla y devuelve la banda', !w.document.querySelector('.m-ro') && w.__salio === true);
  }
}

grupo('4 · lo de otros, al abrir');
{
  const w = entorno({ lista: [{ id: 5, item_name: 'Baileys', qty: 2, added_by: 'Luis', status: 'to_buy' }],
    checks: [{ item_name: "Dad's Hat Rye", counted: 4, checked_by: 'Mia', checked_at: '2026-11-18T20:12:00Z' }] });
  await w.BarStockRunningOutReview.abrir(w.document.getElementById('mHome'));
  await esperar(20);
  const b = w.document.querySelector('.m-ro-c[data-item="Baileys"]');
  const d = w.document.querySelector('.m-ro-c[data-item="Dad\'s Hat Rye"]');
  prueba('lo que otro puso en la lista se ve, con quién', /On the list · 2 by Luis/.test(txt(b)), txt(b));
  prueba('y lo que otro verificó, con quién', /Checked: 4 on the shelf/.test(txt(d)) && /Mia/.test(txt(d)), txt(d));
  prueba('el resumen lo cuenta todo', /1 on the list · 1 checked/.test(txt(w.document.querySelector('.m-ro-sum'))), txt(w.document.querySelector('.m-ro-sum')));
}

grupo('5 · sin permiso, sin botón');
{
  let w = entorno({ sin: ['ordenes'] });
  await w.BarStockRunningOutReview.abrir(w.document.getElementById('mHome'));
  await esperar(20);
  prueba('sin "Make and send orders": no hay "Add to list"', !w.document.querySelector('[data-ro-add]') && !!w.document.querySelector('[data-ro-ok]'));
  w = entorno({ sin: ['contar'] });
  await w.BarStockRunningOutReview.abrir(w.document.getElementById('mHome'));
  await esperar(20);
  prueba('sin "Count inventory": no hay "I have enough"', !w.document.querySelector('[data-ro-ok]') && !!w.document.querySelector('[data-ro-add]'));
}

grupo('6 · en la app');
{
  const home = leer('src/mobile-home.js');
  prueba('"See them" abre la revisión', /BarStockRunningOutReview[\s\S]{0,120}abrir/.test(home));
  const lc = leer('src/live-cache.js');
  prueba('live-cache dice cuánto pedir y desde qué conteo', /pedir\s*[,:]/.test(lc.slice(lc.indexOf('window.BarStockLiveCache = {'))) && /conteo\s*[,:]/.test(lc.slice(lc.indexOf('window.BarStockLiveCache = {'))));
  const html = leer('index.html');
  const pos = f => html.indexOf('src/' + f + '?v=');
  prueba('se cargan antes del Home', pos('shopping-list.js') > 0 && pos('mobile-running-out.js') > 0 && pos('mobile-running-out.js') < pos('mobile-home.js') && pos('shopping-list.js') < pos('mobile-running-out.js'));
  const css = leer('styles/mobile-app.css');
  prueba('los botones vencen el radio de app.css con el id', /#mScreens[^{]*\.m-ro-b/.test(css));
  prueba('el teclado no es un <input> (sin zoom de iOS)', !/<input/.test(existe('src/mobile-running-out.js') ? leer('src/mobile-running-out.js') : '<input'));
}

grupo('7 · las pestañas sacan de la revisión (Axel, 2026-11-15)');
{
  // Con el armazón DE VERDAD: la revisión va fija encima de todo, y
  // tocar una pestaña sólo quitaba la banda. Se quedaba la pantalla,
  // sin atrás, y no había forma de salir sin cerrar la app.
  const w = entorno();
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  w.scrollTo = () => {};
  w.CSS = { escape: (s) => String(s) };
  w.BarStockEvents = { on() {}, emit() {} };
  w.document.body.innerHTML = '';
  delete w.BarStockMobile;
  w.BarStockGuest.activo = () => false;
  w.eval(leer('src/mobile-shell.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const M = w.BarStockMobile;
  M.register({ id: 'home', icon: 'ti-home', label: 'Home', tab: true, orden: 1, mount(h) { h.innerHTML = '<div>Home</div>'; } });
  M.register({ id: 'inventory', icon: 'ti-box', label: 'Inventory', tab: true, orden: 2, mount(h) { h.innerHTML = '<div>Inv</div>'; } });
  const R = w.BarStockRunningOutReview;
  const abierta = () => !!w.document.querySelector('.m-ro');
  M.ir('home');
  await R.abrir(); await esperar(20);
  prueba('abre, con su atrás en la banda', abierta() && !!w.document.getElementById('mBandAtras'));
  M.ir('inventory'); await esperar(10);
  prueba('Inventory la cierra y te lleva a Inventory', !abierta() && M.activa() === 'inventory');
  await R.abrir(); await esperar(20);
  M.ir('inventory'); await esperar(10);
  prueba('la pestaña en la que ya estabas también la cierra', !abierta());
  await R.abrir(); await esperar(20);
  w.document.getElementById('mBandAtras').click(); await esperar(10);
  prueba('atrás sigue cerrándola', !abierta());
  M.ir('home'); await R.abrir(); await esperar(20);
  w.document.getElementById('mBandAtras').click(); await esperar(10);
  M.alVolverBanda(() => { w.__otro = true; });
  M.ir('inventory'); await esperar(10);
  prueba('cerrada con atrás, no deja nada enganchado que cierre otra cosa después', !abierta() && M.activa() === 'inventory');
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
