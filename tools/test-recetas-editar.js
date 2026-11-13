#!/usr/bin/env node
/*
 * ── Recetas: escribirlas, editarlas y casarlas con Toast ─────────────
 *
 * Axel, 2026-11-12, opción A sobre lámina: una pestaña "From Toast" con
 * cada trago que Toast vende sin receta (Write recipe / Same as… / Not a
 * drink), un editor para escribir una receta de cero o cambiarla, y
 * emparejar con Toast una receta cuyo nombre no casa. Aquí, los datos
 * (src/toast-recipes.js); la pantalla tiene su prueba aparte.
 *
 *   1. Lo que Toast vende sin receta: sólo cócteles (categoría Liquor,
 *      fuera del grupo "Liquor", que es el licor solo de Liquor from
 *      Toast), sin lo ignorado, sin lo que ya tiene receta o "also", y
 *      el más vendido primero.
 *   2. Crear una receta guarda la receta y sus líneas; un nombre que ya
 *      existe se dice, no se pisa.
 *   3. Editar cambia lo que cambió y conserva lo que el editor no toca
 *      (las condiciones "not with Dark"); lo quitado se borra al final.
 *   4. Emparejar cambia el nombre de Toast y conserva el tuyo.
 *   5. "Same as…" añade el nombre a `also`, y el cálculo de botellas lo
 *      usa (toast-usage.js).
 *   6. "Not a drink" lo marca como ignorado en toast_item_links, que el
 *      cálculo ya se salta.
 *   7. Un fallo de Supabase se dice tal cual y no cambia la pantalla.
 *
 *   node tools/test-recetas-editar.js
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

// ── Un PostgREST de mentira, con estado ───────────────────────────────
function base() {
  return {
    toast_recipes: [
      { id: 1, location_id: 'loc', tipo: 'cocktail', toast_name: 'House Cosmo', name: null, also: [], happy_hour: false, price: null, note: null, pending: null },
      { id: 2, location_id: 'loc', tipo: 'cocktail', toast_name: 'Espresso Martini', name: null, also: [], happy_hour: false, price: null, note: null, pending: null }
    ],
    toast_recipe_lines: [
      { id: 10, recipe_id: 1, position: 0, label: 'Triage vodka', item_name: 'Triage Vodka', oz: 2, chosen: false, only_with: null, not_with: [] },
      { id: 11, recipe_id: 1, position: 1, label: 'Triple sec', item_name: null, oz: 0.75, chosen: false, only_with: null, not_with: [] },
      { id: 20, recipe_id: 2, position: 0, label: 'Kamora', item_name: 'Kamora', oz: 1, chosen: false, only_with: null, not_with: [] },
      { id: 21, recipe_id: 2, position: 1, label: 'Baileys', item_name: 'Baileys', oz: 0.75, chosen: false, only_with: null, not_with: ['Dark'] }
    ],
    toast_item_links: [{ location_id: 'loc', toast_item_guid: 'g-ign', status: 'ignored' }],
    toast_sales: [
      // Cócteles sin receta: Paloma (3 días, 30), Fall OF (12).
      { toast_item_guid: 'g-pal', toast_item_name: 'Spicy Paloma', toast_group: 'DRINKS › Cocktails', quantity: 10, sales_category: 'Liquor' },
      { toast_item_guid: 'g-pal', toast_item_name: 'Spicy Paloma', toast_group: 'DRINKS › Cocktails', quantity: 20, sales_category: 'Liquor' },
      { toast_item_guid: 'g-fof', toast_item_name: 'Fall Old Fashioned', toast_group: 'DRINKS › Seasonal', quantity: 12, sales_category: 'Liquor' },
      // Con receta: no sale.
      { toast_item_guid: 'g-cos', toast_item_name: 'House Cosmo', toast_group: 'DRINKS › Cocktails', quantity: 50, sales_category: 'Liquor' },
      // El licor solo: lo hace Liquor from Toast.
      { toast_item_guid: 'g-tit', toast_item_name: "Tito's", toast_group: 'DRINKS › Liquor › Vodka › UP/RX', quantity: 40, sales_category: 'Liquor' },
      // Ignorado ("Not a drink").
      { toast_item_guid: 'g-ign', toast_item_name: 'Bar Snack Bitters', toast_group: 'DRINKS › Cocktails', quantity: 5, sales_category: 'Liquor' },
      // Vino y cerveza: no son cócteles.
      { toast_item_guid: 'g-vin', toast_item_name: 'Sangria', toast_group: 'DRINKS › Wine', quantity: 9, sales_category: 'Wine' },
      { toast_item_guid: 'g-ipa', toast_item_name: 'IPA', toast_group: 'DRINKS › Beer', quantity: 30, sales_category: 'Beer' }
    ],
    sigId: 100
  };
}
function conLoc(db) { db.toast_sales.forEach(v => { v.location_id = 'loc'; }); return db; }

function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k' };
  w.state = { master: ['Triage Vodka', 'Triple Sec', 'Kamora', 'Baileys', 'Casamigos Blanco', 'Ancho Reyes'].map(item => ({ item })) };
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc' };
  const db = conLoc(base());
  w.__db = db; w.__pet = [];
  const resp = (status, body) => ({ ok: status < 400, status, headers: { get: () => null },
    text: async () => JSON.stringify(body), json: async () => body });
  const filtros = (q) => {
    const f = [];
    for (const [k, v] of q) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k) || k.includes('.')) continue;
      f.push([k, v]);
    }
    return (x) => f.every(([k, v]) => {
      if (v.startsWith('eq.')) return String(x[k]) === v.slice(3);
      if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(x[k]));
      if (v.startsWith('gte.')) return true;
      if (v.startsWith('ilike.')) return new RegExp(v.slice(6).replace(/\*/g, '.*'), 'i').test(String(x[k] || ''));
      return true;
    });
  };
  w.fetch = async (url, op) => {
    op = op || {};
    const u = new URL(String(url));
    const tabla = u.pathname.split('/').pop();
    const metodo = op.method || 'GET';
    const cuerpo = op.body ? JSON.parse(op.body) : null;
    w.__pet.push({ tabla, metodo, url: String(url), cuerpo });
    if (o.falla && metodo !== 'GET' && (o.falla === true || o.falla === tabla)) return resp(403, { message: 'permission denied for table ' + tabla });
    const t = db[tabla];
    if (!t) return resp(404, { message: 'no table' });
    const pasa = filtros(u.searchParams);
    if (metodo === 'GET') {
      let filas = t.filter(pasa);
      if (tabla === 'toast_recipes') filas = filas.map(r => Object.assign({}, r, { toast_recipe_lines: db.toast_recipe_lines.filter(l => l.recipe_id === r.id).sort((a, b) => a.position - b.position) }));
      return resp(200, filas);
    }
    if (metodo === 'POST') {
      const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
      if (tabla === 'toast_item_links') {
        for (const f of filas) {
          const i = t.findIndex(x => x.location_id === f.location_id && x.toast_item_guid === f.toast_item_guid);
          if (i >= 0) t[i] = Object.assign({}, t[i], f); else t.push(Object.assign({}, f));
        }
        return resp(201, filas);
      }
      if (tabla === 'toast_recipes' && filas.some(f => t.some(x => x.location_id === f.location_id && x.tipo === f.tipo && x.toast_name === f.toast_name))) {
        return resp(409, { code: '23505', message: 'duplicate key value violates unique constraint "toast_recipes_location_id_tipo_toast_name_key"' });
      }
      const hechas = filas.map(f => Object.assign({ id: db.sigId++ }, f));
      t.push(...hechas);
      return resp(201, hechas);
    }
    if (metodo === 'PATCH') {
      if (tabla === 'toast_recipes' && cuerpo.toast_name && t.some(x => x.toast_name === cuerpo.toast_name && !pasa(x))) {
        return resp(409, { code: '23505', message: 'duplicate key value violates unique constraint' });
      }
      t.filter(pasa).forEach(x => Object.assign(x, cuerpo));
      return resp(204, null);
    }
    if (metodo === 'DELETE') {
      const quedan = t.filter(x => !pasa(x));
      if (tabla === 'toast_recipes') {
        const borradas = new Set(t.filter(pasa).map(x => x.id));
        db.toast_recipe_lines = db.toast_recipe_lines.filter(l => !borradas.has(l.recipe_id));
      }
      db[tabla] = quedan;
      return resp(204, null);
    }
    return resp(405, {});
  };
  for (const f of ['src/rest-paginado.js', 'src/toast-links.js', 'src/toast-recipes.js', 'src/toast-usage.js']) w.eval(leer(f));
  return w;
}
const R = (w) => w.BarStockToastRecipes;
const receta = (w, n) => R(w).recetas().find(x => x.nombre === n || x.titulo === n);

(async () => {

grupo('1 · lo que Toast vende sin receta');
{
  const w = entorno();
  await R(w).cargar();
  const s = await R(w).sinReceta();
  prueba('sólo los cócteles sin receta, el más vendido primero',
    JSON.stringify(s.map(x => x.nombre)) === JSON.stringify(['Spicy Paloma', 'Fall Old Fashioned']), JSON.stringify(s.map(x => x.nombre)));
  const p = s[0] || {};
  prueba('con su grupo del menú, su guid y cuánto se vendió', p.grupo === 'DRINKS › Cocktails' && p.guid === 'g-pal' && p.vendidos === 30, JSON.stringify(p));
  prueba('se leen sólo las ventas de licor de los últimos 30 días', w.__pet.some(x => x.tabla === 'toast_sales' && /sales_category=ilike\.\*liquor\*/i.test(decodeURIComponent(x.url)) && /business_date=gte\./.test(x.url)));
  prueba('una receta que Toast vende: "en Toast"', R(w).enToast(receta(w, 'House Cosmo')) === true);
  prueba('una que no se vendió en 30 días: no', R(w).enToast(receta(w, 'Espresso Martini')) === false);
}

grupo('2 · escribir una receta de cero');
{
  const w = entorno();
  await R(w).cargar();
  const id = await R(w).crear({ nombre: 'Spicy Paloma', hh: false, lineas: [
    { producto: 'Casamigos Blanco', oz: 1.5 }, { producto: 'Ancho Reyes', oz: 0.5 }, { eleccion: true, oz: 2 }] });
  const r = w.__db.toast_recipes.find(x => x.id === id) || {};
  prueba('guarda la receta, como cóctel de esta locación', r.toast_name === 'Spicy Paloma' && r.tipo === 'cocktail' && r.location_id === 'loc' && r.happy_hour === false, JSON.stringify(r));
  const ls = w.__db.toast_recipe_lines.filter(l => l.recipe_id === id).sort((a, b) => a.position - b.position);
  prueba('y sus líneas, en orden, con la botella y las onzas', ls.length === 3 && ls[0].item_name === 'Casamigos Blanco' && ls[0].oz === 1.5 && ls[1].position === 1, JSON.stringify(ls));
  prueba('el licor que elige el cliente: sin botella y marcado', ls[2] && ls[2].chosen === true && ls[2].item_name === null && /choice/i.test(ls[2].label), JSON.stringify(ls[2]));
  prueba('y ya está en la pantalla', !!receta(w, 'Spicy Paloma') && receta(w, 'Spicy Paloma').lineas.length === 3);
  prueba('ya no sale entre lo que falta', !(await R(w).sinReceta()).some(x => x.nombre === 'Spicy Paloma'));

  let err = '';
  try { await R(w).crear({ nombre: 'House Cosmo', lineas: [{ producto: 'Triage Vodka', oz: 2 }] }); } catch (e) { err = e.message; }
  prueba('un nombre que ya existe: lo dice, no lo pisa', /already/.test(err) && w.__db.toast_recipes.filter(x => x.toast_name === 'House Cosmo').length === 1, err);
  err = '';
  try { await R(w).crear({ nombre: '  ', lineas: [] }); } catch (e) { err = e.message; }
  prueba('sin nombre no se guarda', /name/i.test(err) && w.__db.toast_recipes.length === 3, err);
  err = '';
  try { await R(w).crear({ nombre: 'Nada', lineas: [{ producto: 'Kamora', oz: 0 }] }); } catch (e) { err = e.message; }
  prueba('cero onzas no se guarda', /oz|ounce/i.test(err) && !w.__db.toast_recipes.some(x => x.toast_name === 'Nada'), err);
}

grupo('3 · editar');
{
  const w = entorno();
  await R(w).cargar();
  const em = receta(w, 'Espresso Martini');
  // Kamora pasa a 1.25, el Baileys se queda como estaba, y entra Triage.
  await R(w).guardarReceta(em.id, { hh: true, lineas: [
    Object.assign({}, em.lineas[0], { oz: 1.25 }), em.lineas[1], { producto: 'Triage Vodka', oz: 1 }] });
  const ls = w.__db.toast_recipe_lines.filter(l => l.recipe_id === em.id).sort((a, b) => a.position - b.position);
  prueba('cambia lo que cambió', ls[0].id === 20 && ls[0].oz === 1.25, JSON.stringify(ls[0]));
  prueba('conserva la condición que el editor no toca ("not with Dark")', ls[1].id === 21 && JSON.stringify(ls[1].not_with) === '["Dark"]', JSON.stringify(ls[1]));
  prueba('y añade lo nuevo', ls.length === 3 && ls[2].item_name === 'Triage Vodka' && ls[2].position === 2, JSON.stringify(ls));
  prueba('y la marca de Happy Hour', w.__db.toast_recipes.find(x => x.id === em.id).happy_hour === true);
  // Quitar el Baileys: se borra, y al final.
  const pet0 = w.__pet.length;
  await R(w).guardarReceta(em.id, { hh: true, lineas: [receta(w, 'Espresso Martini').lineas[0], receta(w, 'Espresso Martini').lineas[2]] });
  const nuevas = w.__pet.slice(pet0).filter(p => p.metodo !== 'GET');
  prueba('lo quitado se borra', !w.__db.toast_recipe_lines.some(l => l.id === 21));
  prueba('y se borra lo último: si algo falla antes, no se queda sin líneas', nuevas.length > 0 && nuevas[nuevas.length - 1].metodo === 'DELETE', nuevas.map(p => p.metodo + ' ' + p.tabla).join(', '));

  await R(w).borrar(em.id);
  prueba('borrar la receta se lleva sus líneas', !w.__db.toast_recipes.some(x => x.id === em.id) && !w.__db.toast_recipe_lines.some(l => l.recipe_id === em.id));
  prueba('y deja de estar en la pantalla', !receta(w, 'Espresso Martini'));
}

grupo('4 · emparejar con Toast una receta que no casa');
{
  const w = entorno();
  await R(w).cargar();
  const em = receta(w, 'Espresso Martini');
  await R(w).emparejar(em.id, 'Fall Old Fashioned');
  const r = w.__db.toast_recipes.find(x => x.id === em.id);
  prueba('el nombre de Toast pasa a ser el del artículo', r.toast_name === 'Fall Old Fashioned', JSON.stringify(r));
  prueba('y el tuyo se queda para enseñarlo', r.name === 'Espresso Martini' && receta(w, 'Espresso Martini').titulo === 'Espresso Martini');
  prueba('sin leer las ventas, no se sabe: ni sí ni no', R(w).enToast(receta(w, 'Espresso Martini')) === null);
  await R(w).sinReceta();
  prueba('ya cuenta como "en Toast"', R(w).enToast(receta(w, 'Espresso Martini')) === true);
  let err = '';
  try { await R(w).emparejar(em.id, 'House Cosmo'); } catch (e) { err = e.message; }
  prueba('con un nombre que ya tiene otra receta: lo dice', /already/.test(err), err);
}

grupo('5 · "Same as…": el mismo trago con otro nombre');
{
  const w = entorno();
  await R(w).cargar();
  await R(w).igualQue(receta(w, 'House Cosmo').id, 'Spicy Paloma');
  prueba('se apunta en "also"', JSON.stringify(w.__db.toast_recipes.find(x => x.id === 1).also) === '["Spicy Paloma"]');
  prueba('y ya no sale entre lo que falta', !(await R(w).sinReceta()).some(x => x.nombre === 'Spicy Paloma'));
  // El cálculo de botellas cuenta la Paloma con la receta del Cosmo.
  const U = w.BarStockToastUsage;
  const c = U.calcular([{ business_date: '2026-11-10', toast_item_guid: 'g-pal', toast_item_name: 'Spicy Paloma', mods: '', quantity: 2, sales_category: 'Liquor' }],
    [], R(w).recetas(), { 'Triage Vodka': 750 });
  const tv = (c.productos.find(p => p.producto === 'Triage Vodka') || {}).botellas || 0;
  prueba('el cálculo de botellas usa "also"', Math.abs(tv - 2 * 2 * 29.5735 / 750) < 0.001, String(tv) + ' ' + JSON.stringify(c.sinConvertir));
}

grupo('6 · "Not a drink"');
{
  const w = entorno();
  await R(w).cargar();
  const s = await R(w).sinReceta();
  await R(w).ignorar(s.find(x => x.nombre === 'Fall Old Fashioned'));
  const l = w.__db.toast_item_links.find(x => x.toast_item_guid === 'g-fof') || {};
  prueba('se marca ignorado en toast_item_links, por su guid', l.status === 'ignored' && l.location_id === 'loc' && l.toast_item_name === 'Fall Old Fashioned' && l.kind === 'liquor', JSON.stringify(l));
  prueba('con on_conflict a su llave (location_id, toast_item_guid)', w.__pet.some(p => p.metodo === 'POST' && p.tabla === 'toast_item_links' && /on_conflict=location_id,toast_item_guid/.test(p.url)));
  prueba('y ya no sale entre lo que falta', !(await R(w).sinReceta()).some(x => x.nombre === 'Fall Old Fashioned'));
}

grupo('6b · Not drinks: lo marcado, y Restore');
{
  const w = entorno();
  // Tres filas 'ignored': un cóctel (Recipes), una marca de licor solo
  // (el "Not in inventory" de Liquor from Toast) y un vino.
  w.__db.toast_item_links.push(
    { location_id: 'loc', toast_item_guid: 'g-lyc', toast_item_name: 'Lychee Spritz', toast_group: 'DRINKS › Seasonal', kind: 'liquor', status: 'ignored', updated_at: '2026-11-13T00:40:00Z' },
    { location_id: 'loc', toast_item_guid: 'g-smi', toast_item_name: 'Smirnoff', toast_group: 'DRINKS › Liquor › Vodka › UP/RX', kind: 'liquor', status: 'ignored', updated_at: '2026-11-13T00:41:00Z' },
    { location_id: 'loc', toast_item_guid: 'g-vin', toast_item_name: 'Sangria', toast_group: 'DRINKS › Wine', kind: 'wine', status: 'ignored', updated_at: '2026-11-13T00:42:00Z' },
    { location_id: 'otra', toast_item_guid: 'g-otr', toast_item_name: 'Otra Cosa', toast_group: 'DRINKS › Cocktails', kind: 'liquor', status: 'ignored', updated_at: '2026-11-13T00:43:00Z' });
  w.__db.toast_sales.push({ location_id: 'loc', toast_item_guid: 'g-lyc', toast_item_name: 'Lychee Spritz', toast_group: 'DRINKS › Seasonal', quantity: 7, sales_category: 'Liquor' });
  await R(w).cargar();
  const nd = await R(w).noBebidas();
  prueba('sólo los cócteles marcados de esta locación: ni la marca de licor, ni el vino, ni otra locación', nd.map(x => x.nombre).join() === 'Lychee Spritz', JSON.stringify(nd));
  prueba('con su grupo y cuándo se marcó', nd[0].grupo === 'DRINKS › Seasonal' && nd[0].cuando === '2026-11-13T00:40:00Z');
  prueba('y no sale entre lo que falta', !(await R(w).sinReceta()).some(x => x.nombre === 'Lychee Spritz'));
  await R(w).restaurar(nd[0]);
  const del = w.__pet.find(p => p.metodo === 'DELETE' && p.tabla === 'toast_item_links');
  prueba('Restore borra esa fila, filtrada por locación, guid, ignored y licor', !!del && /location_id=eq\.loc/.test(del.url) && /toast_item_guid=eq\.g-lyc/.test(del.url) &&
    /status=eq\.ignored/.test(del.url) && /kind=eq\.liquor/.test(del.url), del && del.url);
  prueba('y nada más: la marca de licor, el vino y la otra locación siguen', ['g-smi', 'g-vin', 'g-otr'].every(g => w.__db.toast_item_links.some(x => x.toast_item_guid === g)) &&
    !w.__db.toast_item_links.some(x => x.toast_item_guid === 'g-lyc'));
  prueba('el trago vuelve a lo que falta', (await R(w).sinReceta()).some(x => x.nombre === 'Lychee Spritz'));
  prueba('y la lista queda vacía', (await R(w).noBebidas()).length === 0);
}

grupo('7 · un fallo se dice y no cambia la pantalla');
{
  const w = entorno({ falla: 'toast_recipe_lines' });
  await R(w).cargar();
  const em = receta(w, 'Espresso Martini');
  let err = '';
  try { await R(w).guardarReceta(em.id, { hh: false, lineas: [Object.assign({}, em.lineas[0], { oz: 3 })] }); } catch (e) { err = e.message; }
  prueba('lo que dijo Supabase, tal cual', /403/.test(err) && /permission denied/.test(err), err);
  prueba('y la pantalla sigue con lo de antes', receta(w, 'Espresso Martini').lineas[0].oz === 1 && receta(w, 'Espresso Martini').lineas.length === 2);
}

grupo('la pantalla (Settings › Toast › Recipes)');
{
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  async function pantalla() {
    const w = entorno();
    w.BarStockSheet = { enganchar: () => {} };
    w.__avisos = [];
    w.BarStockToast = { show: (t) => w.__avisos.push(String(t)) };
    w.__atras = null;
    w.BarStockMobile = { alVolverBanda: (fn) => { w.__atras = fn; } };
    for (const f of ['src/bottle-search.js', 'src/mobile-toast-recipes.js']) w.eval(leer(f));
    const host = w.document.createElement('div'); w.document.body.appendChild(host);
    w.BarStockMobileToastRecipes.montar(host, () => '<div class="cab"></div>', () => {});
    await esperar(40);
    return { w, host };
  }
  const tab = (host, k) => host.querySelector('[data-tab="' + k + '"]');
  // Como en el teléfono: se escribe en el buscador de la hoja y se toca.
  const elegirEnHoja = async (w, texto) => {
    const q = w.document.querySelector('#mSheet .m-tl-busca');
    if (q && ![...w.document.querySelectorAll('#mSheet [data-p]')].some(x => x.dataset.p === texto)) {
      q.value = texto.split(' ')[0]; q.dispatchEvent(new w.Event('input'));
    }
    const b = [...w.document.querySelectorAll('#mSheet [data-p]')].find(x => x.dataset.p === texto);
    if (b) b.click(); await esperar(30); return !!b;
  };

  let { w, host } = await pantalla();
  prueba('cuatro pestañas; From Toast con cuántos', /From Toast · 2/.test(tab(host, 'toast').textContent), tab(host, 'toast').textContent);
  tab(host, 'toast').click();
  const cards = [...host.querySelectorAll('.m-rc-card')];
  prueba('una tarjeta por trago, con su grupo y lo vendido', cards.length === 2 && /Spicy Paloma/.test(cards[0].textContent) && /64|30 sold/.test(cards[0].textContent), cards.map(c => c.textContent.replace(/\s+/g, ' ')).join(' | '));
  prueba('y sus tres botones', !!cards[0].querySelector('[data-escribir]') && !!cards[0].querySelector('[data-igual]') && !!cards[0].querySelector('[data-ign]'));

  // Write recipe: el editor con el nombre de Toast, fijo.
  cards[0].querySelector('[data-escribir]').click();
  prueba('Write recipe abre el editor con el nombre de Toast', /New recipe/.test(host.textContent) && /Spicy Paloma/.test(host.querySelector('.m-re-nom').textContent) && !host.querySelector('#reNom'));
  prueba('el atrás de la banda cierra el editor', typeof w.__atras === 'function');
  host.querySelector('#reAdd').click(); await esperar(10);
  prueba('+ Add ingredient abre la hoja de botellas', await elegirEnHoja(w, 'Casamigos Blanco'));
  host.querySelector('[data-mas="0"]').click(); host.querySelector('[data-mas="0"]').click();
  prueba('las onzas suben de 0.25 en 0.25', /1\.5 oz/.test(host.querySelector('.m-re-fila').textContent), host.querySelector('.m-re-fila').textContent);
  host.querySelector('#reElige').checked = true; host.querySelector('#reElige').dispatchEvent(new w.Event('change'));
  prueba('"Customer picks the spirit" añade su línea', /Customer's choice/.test(host.textContent));
  host.querySelector('#reSave').click(); await esperar(60);
  const nueva = w.__db.toast_recipes.find(x => x.toast_name === 'Spicy Paloma');
  prueba('Save guarda la receta y sus líneas', !!nueva && w.__db.toast_recipe_lines.filter(l => l.recipe_id === nueva.id).length === 2);
  prueba('vuelve a la lista, y From Toast baja a 1', !host.querySelector('.m-re') && /From Toast · 1/.test(tab(host, 'toast').textContent), tab(host, 'toast') && tab(host, 'toast').textContent);

  // Not a drink
  tab(host, 'toast').click();
  host.querySelector('[data-ign="0"]').click(); await esperar(60);
  prueba('Not a drink lo quita de la lista', /From Toast · 0/.test(tab(host, 'toast').textContent) && w.__db.toast_item_links.some(l => l.toast_item_guid === 'g-fof' && l.status === 'ignored'));

  // Not drinks (opción A, 2026-11-13): al marcar, sale abajo con su
  // Restore; y Restore lo devuelve arriba.
  tab(host, 'toast').click();
  prueba('lo marcado sale al final de From Toast: "Not drinks · 1"', /Not drinks · 1/.test(host.textContent) &&
    !!host.querySelector('.m-rc-nd [data-rest="0"]') && /Fall Old Fashioned/.test(host.querySelector('.m-rc-nd').textContent), host.textContent.slice(-300));
  host.querySelector('[data-rest="0"]').click(); await esperar(60);
  prueba('Restore lo devuelve a From Toast y la lista se va', /From Toast · 1/.test(tab(host, 'toast').textContent) && !host.querySelector('.m-rc-nd') &&
    [...host.querySelectorAll('.m-rc-card')].some(c => /Fall Old Fashioned/.test(c.textContent)));

  // De cero: + New recipe, sin nombre no se guarda.
  ({ w, host } = await pantalla());
  host.querySelector('#rcNueva').click();
  prueba('+ New recipe: el editor con su campo de nombre', !!host.querySelector('#reNom'));
  host.querySelector('#reSave').click(); await esperar(40);
  prueba('sin nombre: lo dice y no guarda nada', /needs a name/.test(host.textContent) && w.__db.toast_recipes.length === 2, host.textContent.slice(0, 300));
  const nom = host.querySelector('#reNom'); nom.value = 'Golden Vesper'; nom.dispatchEvent(new w.Event('input'));
  host.querySelector('#reAdd').click(); await esperar(10); await elegirEnHoja(w, 'Kamora');
  host.querySelector('#reSave').click(); await esperar(60);
  prueba('con nombre y un ingrediente: guarda', w.__db.toast_recipes.some(x => x.toast_name === 'Golden Vesper'));
  const card = [...host.querySelectorAll('.m-rc-card')].find(c => /Golden Vesper/.test(c.textContent));
  prueba('y como Toast no la vende: "Not in Toast · Match"', !!card && /Not in Toast/.test(card.textContent) && !!card.querySelector('[data-match]'), card && card.textContent);

  // Match: la hoja de artículos de Toast, y elegir empareja.
  card.querySelector('[data-match]').click(); await esperar(10);
  prueba('Match abre la hoja con los artículos de Toast sin receta', /Which Toast item/.test(w.document.querySelector('#mSheet').textContent) &&
    !!w.document.querySelector('#mSheet [data-p="Fall Old Fashioned"]'), w.document.querySelector('#mSheet') && w.document.querySelector('#mSheet').textContent);
  await elegirEnHoja(w, 'Fall Old Fashioned'); await esperar(40);
  const gv = w.__db.toast_recipes.find(x => x.name === 'Golden Vesper');
  prueba('elegir empareja: el nombre de Toast pasa al artículo y el tuyo se queda', !!gv && gv.toast_name === 'Fall Old Fashioned');
  const card2 = [...host.querySelectorAll('.m-rc-card')].find(c => /Golden Vesper/.test(c.textContent));
  prueba('y la tarjeta deja de decir "Not in Toast"', !!card2 && !/Not in Toast/.test(card2.textContent), card2 && card2.textContent);

  // Edit y Delete (con dos toques)
  ({ w, host } = await pantalla());
  const cos = [...host.querySelectorAll('.m-rc-card')].find(c => /House Cosmo/.test(c.textContent));
  cos.querySelector('[data-ed]').click();
  prueba('Edit abre el editor con sus ingredientes', /Edit recipe/.test(host.textContent) && host.querySelectorAll('.m-re-fila').length === 2);
  host.querySelector('[data-menos="0"]').click();
  host.querySelector('#reSave').click(); await esperar(60);
  // El Cosmo tiene el Triple sec sin botella ("Choose a bottle"): eso no
  // puede impedir guardar el cambio de onzas.
  prueba('guardar cambia lo que cambió, aunque otra línea siga sin botella', w.__db.toast_recipe_lines.find(l => l.id === 10).oz === 1.75, host.textContent.slice(0, 200));
  [...host.querySelectorAll('.m-rc-card')].find(c => /House Cosmo/.test(c.textContent)).querySelector('[data-ed]').click();
  host.querySelector('#reDel').click();
  prueba('Delete pide un segundo toque', /Tap again to delete/.test(host.querySelector('#reDel').textContent) && w.__db.toast_recipes.some(x => x.id === 1));
  host.querySelector('#reDel').click(); await esperar(60);
  prueba('y al segundo, borra', !w.__db.toast_recipes.some(x => x.id === 1) && !host.querySelector('.m-re'));
}

grupo('la migración');
{
  const m = path.join(RAIZ, 'database/migrations/036_toast_recipes_editar.sql');
  const sql = fs.existsSync(m) ? fs.readFileSync(m, 'utf8') : '';
  prueba('036 añade name y also a toast_recipes', /alter table public\.toast_recipes/i.test(sql) && /add column if not exists name text/i.test(sql) &&
    /add column if not exists also text\[\] not null default '\{\}'/i.test(sql));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
