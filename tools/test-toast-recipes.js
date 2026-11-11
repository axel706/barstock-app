#!/usr/bin/env node
/*
 * ── Recipes: cada ingrediente de un cóctel con su botella ────────────
 *
 * Axel eligió la opción B (2026-11-11): una tarjeta por cóctel y la
 * botella se elige en cada línea. Lo que se protege:
 *   1. Elegir guarda SÓLO esa línea, en la nube y luego en la pantalla.
 *      No se copia a las otras recetas del mismo ingrediente (eso era la
 *      opción A, y no la eligió).
 *   2. Pero se SUGIERE: si "St. Elder" ya tiene botella en otra receta,
 *      ésa es la sugerida.
 *   3. El licor que elige el cliente no se ofrece: no tiene botella fija.
 *   4. Una receta que no se sabe dice "Recipe missing"; nunca parece un
 *      trago que no gasta nada.
 *   5. Un fallo de Supabase se dice tal cual y no deja la botella puesta.
 *   6. Tres pestañas: Cocktails, Happy Hour, Mods.
 *   7. Está en Settings → Toast y carga en orden.
 *
 *   node tools/test-toast-recipes.js
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
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const INVENTARIO = ['St. Elder Elderflower Liqueur', 'Elderflower Liqueur (house)', "Tito's Handmade Vodka 1L", 'Prosecco Nino Ardevi', 'Empress 1908 Indigo Gin', 'Cinzano Dry Vermouth', 'Baileys Irish Cream 1L'];

const linea = (id, label, oz, x) => Object.assign({ id, label, oz, item_name: null, chosen: false, only_with: null, not_with: [], position: id }, x || {});
const RECETAS = () => [
  { id: 1, tipo: 'cocktail', toast_name: 'Her Majesty', happy_hour: false, price: 15, note: null, pending: null,
    toast_recipe_lines: [linea(11, "Tito's vodka", 2), linea(12, 'St. Elder', 0.75, { item_name: 'Elderflower Liqueur (house)' })] },
  { id: 2, tipo: 'cocktail', toast_name: 'Hugo 75', happy_hour: false, price: 14, note: null, pending: null,
    toast_recipe_lines: [linea(21, 'Empress Indigo gin', 1), linea(22, 'St. Elder', 0.75), linea(23, 'Prosecco Nino Ardevi', 4.5)] },
  { id: 3, tipo: 'cocktail', toast_name: 'Bloody Mary', happy_hour: false, price: null, note: null, pending: 'Not on the sheet.', toast_recipe_lines: [] },
  { id: 4, tipo: 'cocktail', toast_name: 'HH Espresso Martini', happy_hour: true, price: null, note: null, pending: null,
    toast_recipe_lines: [linea(41, 'Baileys', 0.75, { not_with: ['Dark'] })] },
  { id: 5, tipo: 'modifier', toast_name: 'Martini', happy_hour: false, price: null, note: 'Dirty = no vermouth.', pending: null,
    toast_recipe_lines: [linea(51, 'Liquor the guest picks', 2.5, { chosen: true }), linea(52, 'Dry vermouth Cinzano', 0.5, { not_with: ['Dirty'] })] }
];

function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>',
    { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k' };
  w.state = { master: INVENTARIO.map(item => ({ item })) };
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-crown' };
  w.__avisos = [];
  w.BarStockToast = { show: (t) => w.__avisos.push(String(t)) };
  w.BarStockSheet = { enganchar: () => {} };
  w.__peticiones = [];
  w.fetch = async (url, op) => {
    op = op || {};
    const u = String(url);
    w.__peticiones.push({ url: u, metodo: op.method || 'GET', cuerpo: op.body ? JSON.parse(op.body) : null });
    const resp = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body });
    if (u.includes('/rest/v1/toast_recipes')) return resp(200, o.recetas || RECETAS());
    if (u.includes('/rest/v1/toast_recipe_lines')) return o.fallo ? resp(403, { message: 'permission denied' }) : resp(204, {});
    return resp(404, {});
  };
  for (const f of ['src/toast-links.js', 'src/toast-recipes.js', 'src/bottle-search.js', 'src/mobile-toast-recipes.js']) w.eval(leer(f));
  return w;
}
const parches = (w) => w.__peticiones.filter(p => p.metodo === 'PATCH');
async function montar(w) {
  const host = w.document.getElementById('host');
  w.BarStockMobileToastRecipes.montar(host, () => '<div class="cab">Recipes</div>', () => {});
  await esperar(30);
  return host;
}
const tarjeta = (host, n) => [...host.querySelectorAll('.m-rc-card')].find(c => c.querySelector('.m-tl-sec-h b').textContent === n);

(async () => {

grupo('las recetas, por pestaña');
{
  const w = entorno();
  const host = await montar(w);
  const tabs = [...host.querySelectorAll('[data-tab]')].map(b => b.textContent);
  prueba('tres pestañas con su cuenta', tabs.join('|') === 'Cocktails · 3|Happy Hour · 1|Mods · 1', tabs.join('|'));
  prueba('empieza en Cocktails, una tarjeta por cóctel', host.querySelectorAll('.m-rc-card').length === 3);
  const hm = tarjeta(host, 'Her Majesty');
  prueba('la tarjeta lleva su precio', !!hm && /\$15/.test(hm.textContent));
  prueba('cada línea: ingrediente y oz', !!hm && /Tito's vodka · 2 oz/.test(hm.textContent) && /St\. Elder · 0\.75 oz/.test(hm.textContent));
  prueba('la botella elegida y la que falta', /Elderflower Liqueur \(house\)/.test(hm.textContent) && !!hm.querySelector('.m-tl-dest.vacio'));
  const bm = tarjeta(host, 'Bloody Mary');
  prueba('una receta que no se sabe lo dice', !!bm && /Recipe missing/.test(bm.textContent) && !bm.querySelector('[data-l]'));
  prueba('cuántas faltan por elegir', /6 to choose/.test(host.textContent), (host.querySelector('.m-rc-cuenta') || {}).textContent);
}

grupo('elegir la botella de una línea');
{
  const w = entorno();
  const host = await montar(w);
  tarjeta(host, 'Hugo 75').querySelector('[data-l="22"]').click();
  await esperar(10);
  const h = w.document.getElementById('mSheet');
  const sug = h && h.querySelector('[data-sug]');
  // Por el nombre saldría "St. Elder Elderflower Liqueur"; la de la otra
  // receta manda.
  prueba('se sugiere la botella que ese ingrediente ya tiene en otra receta', !!sug && sug.dataset.p === 'Elderflower Liqueur (house)', sug && sug.dataset.p);
  sug.click(); await esperar(30);
  const p = parches(w);
  prueba('guarda sólo esa línea', p.length === 1 && /toast_recipe_lines\?id=eq\.22$/.test(p[0].url) && p[0].cuerpo.item_name === 'Elderflower Liqueur (house)', JSON.stringify(p));
  prueba('y la pantalla la enseña', /Elderflower Liqueur \(house\)/.test(tarjeta(host, 'Hugo 75').textContent));
  prueba('dice lo guardado', w.__avisos.some(a => /Saved: St\. Elder/.test(a)), w.__avisos.join(' | '));
  prueba('la hoja se cierra', !w.document.getElementById('mSheet'));

  // La sugerida va arriba y no se repite en la lista: para probar la
  // lista se escribe otra botella.
  tarjeta(host, 'Hugo 75').querySelector('[data-l="23"]').click(); await esperar(10);
  const busca = w.document.querySelector('#mSheet input[type="search"]');
  busca.value = 'irish cream'; busca.dispatchEvent(new w.Event('input'));
  const r = [...w.document.querySelectorAll('#mSheet .m-tl-lista [data-p]')].map(b => b.dataset.p);
  prueba('el buscador encuentra la botella escribiendo', r.length === 1 && r[0] === 'Baileys Irish Cream 1L', r.join(','));
  w.document.querySelector('#mSheet .m-tl-lista [data-p]').click(); await esperar(30);
  prueba('elegir de la lista también guarda', parches(w).length === 2 && parches(w)[1].cuerpo.item_name === 'Baileys Irish Cream 1L');
  prueba('no toca las otras recetas', parches(w).every(x => /id=eq\.(22|23)$/.test(x.url)));
}

grupo('quitar una botella');
{
  const w = entorno();
  const host = await montar(w);
  tarjeta(host, 'Her Majesty').querySelector('[data-l="12"]').click(); await esperar(10);
  const q = w.document.querySelector('#mSheet [data-pie="quitar"]');
  prueba('"Clear bottle" sólo si ya tiene', !!q);
  q.click(); await esperar(30);
  prueba('guarda vacío', parches(w).length === 1 && parches(w)[0].cuerpo.item_name === null);
  prueba('y vuelve a "Choose a bottle"', tarjeta(host, 'Her Majesty').querySelectorAll('.m-tl-dest.vacio').length === 2);
}

grupo('lo que no se elige');
{
  const w = entorno();
  const host = await montar(w);
  host.querySelector('[data-tab="mods"]').click(); await esperar(10);
  const mt = tarjeta(host, 'Martini');
  prueba('el licor del cliente no se ofrece', !!mt && /Guest's choice/.test(mt.textContent) && !mt.querySelector('[data-l="51"]'));
  prueba('la condición de la línea se dice', /not with Dirty/.test(mt.textContent));
  prueba('la nota de la receta', /Dirty = no vermouth/.test(mt.textContent));
  host.querySelector('[data-tab="hh"]').click(); await esperar(10);
  prueba('Happy Hour en su pestaña', !!tarjeta(host, 'HH Espresso Martini') && /not with Dark/.test(host.textContent));
}

grupo('un fallo no deja la botella puesta');
{
  const w = entorno({ fallo: true });
  const host = await montar(w);
  tarjeta(host, 'Hugo 75').querySelector('[data-l="21"]').click(); await esperar(10);
  w.document.querySelector('#mSheet [data-sug]').click(); await esperar(30);
  prueba('lo que dijo Supabase, tal cual', /Not saved: Supabase answered 403/.test(host.textContent));
  prueba('la línea sigue sin botella', !!tarjeta(host, 'Hugo 75').querySelector('[data-l="21"] .m-tl-dest.vacio'));
}

grupo('PostgREST corta en 1000');
{
  const muchas = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, tipo: 'cocktail', toast_name: 'R' + i, toast_recipe_lines: [] }));
  const w = entorno({ recetas: muchas });
  const host = await montar(w);
  prueba('una lista que pudo cortarse se dice, no se enseña', /Couldn't load the recipes/.test(host.textContent) && !host.querySelector('.m-rc-card'));
}

grupo('está en la app');
{
  const html = leer('index.html');
  const p = f => html.indexOf('src/' + f + '?v=');
  prueba('motor, datos, hoja y pantalla, en orden', p('toast-links.js') > 0 && p('toast-links.js') < p('toast-recipes.js') &&
    p('toast-recipes.js') < p('mobile-toast-recipes.js') && p('bottle-search.js') < p('mobile-toast-recipes.js'));
  const ms = leer('src/mobile-settings.js');
  prueba('en Settings → Toast', /id:\s*'toastrecipes'/.test(ms) && /BarStockMobileToastRecipes\.montar/.test(ms));
  const pt = leer('src/mobile-toast-recipes.js');
  prueba('usa la hoja compartida, no otra copia', /BarStockBottleSearch/.test(pt) && !/m-tl-busca/.test(pt));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
