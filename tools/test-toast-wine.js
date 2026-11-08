#!/usr/bin/env node
/*
 * ── Wine from Toast: emparejar el vino de Toast con el inventario ────
 *
 * Toast da copas; el inventario cuenta botellas. Cada artículo de vino de
 * Toast apunta a un vino del inventario (toast_item_links, migración 027).
 * La lógica es UNA (src/toast-wine.js) y la pintan dos vistas: la tabla
 * del escritorio y las tarjetas del teléfono. Axel pidió las dos.
 *
 * Lo que se protege:
 *
 *   1. La sugerencia: segura solo con dos palabras o más ("HH Prosecco"
 *      no es seguro), y en duda cuando el nombre no dice la bodega.
 *   2. Una semana: siete días que acaban AYER, en Nueva York.
 *   3. La locación: sin restaurante de Toast, o con otro, no se deja
 *      tocar nada. Emparejar el vino de Crown con el inventario de otra
 *      locación sería peor que no emparejarlo.
 *   4. Si Supabase falla, se dice lo que dijo, sin adivinar la causa.
 *   5. Lo vendido se suma por artículo y se ordena; lo ya decidido se
 *      respeta.
 *   6. Confirmar guarda copa = 6 oz y botella = entera, PRIMERO en la nube.
 *      Si la nube falla, la pantalla no cambia.
 *   7. Varios artículos de Toast pueden ir al mismo vino (precio normal y
 *      Happy Hour).
 *   8. "Confirm all suggested" solo toma las seguras.
 *   9. Las dos vistas pintan lo mismo; en el teléfono la flecha de volver
 *      sigue funcionando después de repintar.
 *
 *   node tools/test-toast-wine.js
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d !== undefined ? '   → ' + d : '')); }
}
function grupo(t) { console.log('\n' + t); }
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const CROWN = 'b0747-crown';
const INVENTARIO = [
  { item: 'Whitehaven Sauvignon Blanc', category: 'Wine' },
  { item: 'Villa Brici Pinot Grigio', category: 'Wine' },
  { item: 'Canal Grande Pinot Grigio', category: 'Wine' },
  { item: 'Les Cadrans Bordeaux', category: 'Wine' },
  { item: 'Nino Ardevi Prosecco', category: 'Wine' },
  { item: "Tito's Vodka", category: 'Vodka' },
  // Como en Crown: casi nada tiene categoría. The Arborist es vino y no
  // la tiene; "WINE MERCHANT" es su proveedor.
  { item: 'The Arborist', vendor: 'WINE MERCHANT' }
];
const ARTICULOS = [
  { guid: 'w-sb', nombre: 'Sauv Blanc - Whitehaven', grupo: 'DRINKS › Wine › Whites By The Glass', servicio: 'glass' },
  { guid: 'w-pio', nombre: 'Pio Pinot Grigio', grupo: 'HAPPY HOUR › HH Wines', servicio: 'glass' },
  { guid: 'w-pg', nombre: 'Pinot Grigio - Canal Grando', grupo: 'DRINKS › Wine › Whites By The Glass', servicio: 'glass' },
  { guid: 'w-bdx', nombre: 'BTL Bordeaux - Les Cadrans', grupo: 'DRINKS › Wine › Red By The Bottle', servicio: 'bottle' },
  { guid: 'w-hhp', nombre: 'HH Prosecco', grupo: 'HAPPY HOUR › HH Wines', servicio: 'glass' }
];

function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://app.barstockpro.com/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k' };
  w.state = { master: INVENTARIO.map(r => Object.assign({}, r)) };
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-crown' };
  w.BarStockSupabase = { getClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'sesion' } } }) } }) };
  w.__peticiones = [];
  w.__fallaEscritura = false;
  w.fetch = async (url, op) => {
    op = op || {};
    w.__peticiones.push({ url: String(url), metodo: op.method || 'GET', cuerpo: op.body ? JSON.parse(op.body) : null });
    const resp = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body });
    if (String(url).includes('/rest/v1/locations')) {
      if (o.locError) return resp(400, { message: 'column locations.toast_restaurant_guid does not exist' });
      return resp(200, [{ toast_restaurant_guid: o.guidLoc === undefined ? CROWN : o.guidLoc }]);
    }
    if (String(url).includes('/api/integrations')) {
      const p = JSON.parse(op.body).params;
      // Cada día vende lo mismo: 1 Whitehaven, 2 Pio, 0 Canal, y el día 1 una botella.
      const vendido = { 'w-sb': 1, 'w-pio': 2 };
      if (p.businessDate === w.__dias[0]) vendido['w-bdx'] = 1;
      // Como el servidor: con `guids` no lee el menú, así que no trae
      // artículos y sólo cuenta esos.
      if (Array.isArray(p.guids)) {
        for (const g of Object.keys(vendido)) if (!p.guids.includes(g)) delete vendido[g];
        return resp(200, { ok: true, restaurante: CROWN, diaCompleto: true, articulos: [], vendido });
      }
      return resp(200, { ok: true, restaurante: CROWN, diaCompleto: true, articulos: ARTICULOS, vendido });
    }
    if (String(url).includes('/rest/v1/toast_item_links')) {
      if ((op.method || 'GET') === 'GET') return resp(200, o.enlaces || []);
      if (w.__fallaEscritura) return resp(500, { message: 'boom' });
      return resp(201, {});
    }
    return resp(404, {});
  };
  w.eval(leer('src/toast-wine.js'));
  w.__dias = w.BarStockToastWine._diasAtras(7, o.ahora);
  return w;
}

(async () => {

grupo('1 · la sugerencia');
{
  const w = entorno();
  const S = (t) => w.BarStockToastWine._sugerir(t, INVENTARIO.filter(r => r.category === 'Wine').map(r => r.item));
  prueba('con la bodega en el nombre, segura', S('Sauv Blanc - Whitehaven').nivel === 'high' && S('Sauv Blanc - Whitehaven').producto === 'Whitehaven Sauvignon Blanc');
  prueba('"Grando" casa con "Grande"', S('Pinot Grigio - Canal Grando').producto === 'Canal Grande Pinot Grigio' && S('Pinot Grigio - Canal Grando').nivel === 'high');
  prueba('"HH Prosecco" (una palabra) no es seguro', S('HH Prosecco').nivel === 'mid', S('HH Prosecco').nivel);
  prueba('"Pio Pinot Grigio" sin la bodega: en duda', S('Pio Pinot Grigio').nivel === 'mid', S('Pio Pinot Grigio').nivel);
  prueba('algo sin parecido: sin sugerencia', S('Margarita Pitcher').nivel === 'none' && S('Margarita Pitcher').producto === null);
}

grupo('2 · una semana que acaba ayer, en Nueva York');
{
  // 8 de noviembre de 2026, 03:00 UTC = 7 de noviembre, 22:00 en Nueva York.
  const w = entorno({ ahora: Date.UTC(2026, 10, 8, 3, 0) });
  const d = w.__dias;
  prueba('siete dias', d.length === 7, d.length);
  prueba('el primero es ayer en Nueva York (6 nov), no ayer en UTC', d[0] === '20261106', d[0]);
  prueba('y el ultimo una semana antes', d[6] === '20261031', d[6]);
}

grupo('3 · la locacion');
{
  const w = entorno({ guidLoc: '' });
  const d = await w.BarStockToastWine.cargar();
  prueba('sin restaurante de Toast: no se carga nada que tocar', d.estado === 'sinRestaurante' && !d.filas, d.estado);
}
{
  const w = entorno({ guidLoc: 'otro-restaurante' });
  const d = await w.BarStockToastWine.cargar();
  prueba('con otro restaurante: tampoco', d.estado === 'otroRestaurante' && !d.filas, d.estado);
  let r = 'no';
  try { r = await w.BarStockToastWine.confirmar('w-sb', 'Whitehaven Sauvignon Blanc'); } catch (e) { r = 'error'; }
  prueba('y confirmar no escribe nada', r === false && !w.__peticiones.some(p => p.metodo === 'POST' && p.url.includes('toast_item_links')), r);
}

grupo('4 · si Supabase falla, se dice lo que dijo');
{
  const w = entorno({ locError: true });
  const d = await w.BarStockToastWine.cargar();
  prueba('estado de error', d.estado === 'error');
  prueba('con el mensaje de Supabase, tal cual', /column locations.toast_restaurant_guid does not exist/.test(d.error) && /400/.test(d.error), d.error);
  prueba('sin inventarse una causa (nada de "run the migration")', !/migration|migraci/i.test(d.error));
}

grupo('5 · lo vendido y lo ya decidido');
{
  const w = entorno({ enlaces: [
    { toast_item_guid: 'w-pg', status: 'ignored', item_name: null },
    { toast_item_guid: 'w-pio', status: 'confirmed', item_name: 'Villa Brici Pinot Grigio' }
  ] });
  const d = await w.BarStockToastWine.cargar();
  prueba('listo', d.estado === 'listo', d.estado);
  const pedidos = w.__peticiones.filter(p => p.url.includes('/api/integrations'));
  prueba('pide los siete dias', pedidos.length === 7, pedidos.length);
  // Toast limita las lecturas del menú: pedirlo siete veces, tres a la
  // vez, le hizo contestar 429 la primera vez que se abrió en Crown.
  const conMenu = pedidos.filter(p => !Array.isArray(p.cuerpo.params.guids));
  prueba('el menu se pide UNA vez, no una por dia', conMenu.length === 1, conMenu.length);
  prueba('y es lo primero que se pide', pedidos[0] === conMenu[0]);
  const g1 = pedidos[1] && pedidos[1].cuerpo.params.guids;
  prueba('los otros dias llevan los vinos del menu', Array.isArray(g1) && g1.length === ARTICULOS.length && g1.includes('w-pio'), JSON.stringify(g1));
  const f = Object.fromEntries(d.filas.map(x => [x.guid, x]));
  prueba('suma la semana por articulo', f['w-pio'].vendido === 14 && f['w-sb'].vendido === 7 && f['w-bdx'].vendido === 1,
    [f['w-pio'].vendido, f['w-sb'].vendido, f['w-bdx'].vendido].join(','));
  prueba('ordenados por lo vendido', d.filas[0].guid === 'w-pio' && d.filas[1].guid === 'w-sb', d.filas.map(x => x.guid).join(','));
  prueba('lo confirmado sigue confirmado, con su vino', f['w-pio'].estado === 'confirmed' && f['w-pio'].producto === 'Villa Brici Pinot Grigio');
  prueba('lo ignorado sigue ignorado', f['w-pg'].estado === 'ignored');
  prueba('lo demas, por revisar con su sugerida', f['w-sb'].estado === 'review' && f['w-sb'].producto === 'Whitehaven Sauvignon Blanc');
  // Filtrar por categoría dejaba fuera a The Arborist: casi ningún
  // artículo tiene categoría. La lista es el inventario entero.
  prueba('un vino sin categoria esta en la lista', d.productos.includes('The Arborist'), d.productos.join(' | '));
  prueba('la lista es todo el inventario, en orden', d.productos.length === INVENTARIO.length && d.productos[0] === 'Canal Grande Pinot Grigio', d.productos.join(' | '));
  const sa = w.BarStockToastWine._sugerir('Red Blend - The Arborist', d.productos);
  prueba('y se sugiere para "Red Blend - The Arborist"', sa.producto === 'The Arborist', JSON.stringify(sa));
  prueba('pero en duda: es una sola palabra', sa.nivel === 'mid', sa.nivel);
}

grupo('6 · confirmar, ignorar, deshacer');
{
  const w = entorno();
  const W = w.BarStockToastWine;
  await W.cargar();
  w.__peticiones = [];
  await W.confirmar('w-sb', 'Whitehaven Sauvignon Blanc');
  const p = w.__peticiones.find(x => x.metodo === 'POST');
  prueba('upsert contra (location_id, toast_item_guid)', !!p && /on_conflict=location_id,toast_item_guid/.test(p.url), p && p.url);
  prueba('copa = 6 oz, confirmado, con su vino', p && p.cuerpo.pour_oz === 6 && p.cuerpo.status === 'confirmed' &&
    p.cuerpo.item_name === 'Whitehaven Sauvignon Blanc' && p.cuerpo.kind === 'wine' && p.cuerpo.location_id === 'loc-crown', JSON.stringify(p && p.cuerpo));
  await W.confirmar('w-bdx', 'Les Cadrans Bordeaux');
  const pb = w.__peticiones.filter(x => x.metodo === 'POST').pop();
  prueba('botella = entera (pour_oz null)', pb.cuerpo.pour_oz === null, pb.cuerpo.pour_oz);

  w.__fallaEscritura = true;
  let err = null;
  try { await W.confirmar('w-pg', 'Canal Grande Pinot Grigio'); } catch (e) { err = e.message; }
  const fpg = W.datos().filas.find(x => x.guid === 'w-pg');
  prueba('si la nube falla, se dice', /500/.test(err || ''), err);
  prueba('y la pantalla no cambia', fpg.estado === 'review', fpg.estado);
  w.__fallaEscritura = false;

  await W.ignorar('w-hhp');
  const pi = w.__peticiones.filter(x => x.metodo === 'POST').pop();
  prueba('ignorar guarda ignored sin vino', pi.cuerpo.status === 'ignored' && pi.cuerpo.item_name === null);

  await W.deshacer('w-sb');
  const pd = w.__peticiones.filter(x => x.metodo === 'DELETE').pop();
  prueba('deshacer borra la fila de ese articulo', !!pd && /toast_item_guid=eq.w-sb/.test(pd.url) && /location_id=eq.loc-crown/.test(pd.url), pd && pd.url);
  const fsb = W.datos().filas.find(x => x.guid === 'w-sb');
  prueba('y vuelve a por revisar con su sugerida', fsb.estado === 'review' && fsb.producto === 'Whitehaven Sauvignon Blanc');
}

grupo('7 · varios articulos al mismo vino');
{
  const w = entorno();
  const W = w.BarStockToastWine;
  await W.cargar();
  await W.confirmar('w-pio', 'Villa Brici Pinot Grigio');
  await W.confirmar('w-pg', 'Villa Brici Pinot Grigio');
  const conf = W.datos().filas.filter(x => x.producto === 'Villa Brici Pinot Grigio' && x.estado === 'confirmed');
  prueba('el de precio normal y el de HH, los dos al mismo', conf.length === 2, conf.length);
}

grupo('8 · confirmar todas las sugeridas: solo las seguras');
{
  const w = entorno();
  const W = w.BarStockToastWine;
  await W.cargar();
  const n = await W.confirmarSugeridas();
  const f = Object.fromEntries(W.datos().filas.map(x => [x.guid, x]));
  prueba('confirma las seguras', f['w-sb'].estado === 'confirmed' && f['w-bdx'].estado === 'confirmed' && f['w-pg'].estado === 'confirmed', n);
  prueba('y deja las dudosas para una persona', f['w-pio'].estado === 'review' && f['w-hhp'].estado === 'review');
}

grupo('9 · las dos vistas');
{
  const w = entorno();
  const d = w.document;
  d.body.innerHTML = '<div id="twEntrada"></div><div id="settingsPanel-toastWine"><div id="twBody"></div></div>';
  w.showSettingsPanel = () => {};
  w.CSS = { escape: (s) => s };
  w.eval(leer('src/toast-wine-panel.js'));
  // La entrada se pinta en DOMContentLoaded, como en la app (está más abajo
  // en el HTML que el script).
  await esperar(60);
  prueba('escritorio: la entrada en Connections', /Wine from Toast/.test(d.getElementById('twEntrada').textContent));
  w.__settingsHooks.toastWine();
  await esperar(80);
  const filas = d.querySelectorAll('#twBody .tw-tabla tbody tr');
  prueba('escritorio: una fila por articulo por revisar', filas.length === 5, filas.length);
  prueba('escritorio: copa y botella', /Glass · 6 oz/.test(d.getElementById('twBody').textContent) && /Bottle · 1/.test(d.getElementById('twBody').textContent));
  const sel = d.querySelector('#twBody .tw-sel[data-g="w-sb"]');
  prueba('escritorio: el selector trae la sugerida puesta', sel && sel.value === 'Whitehaven Sauvignon Blanc', sel && sel.value);
  d.querySelector('#twBody [data-ok="w-sb"]').click();
  await esperar(30);
  prueba('escritorio: confirmar lo saca de To review', d.querySelectorAll('#twBody .tw-tabla tbody tr').length === 4);
}
{
  const w = entorno();
  const d = w.document;
  d.body.innerHTML = '<div id="host"></div>';
  w.eval(leer('src/mobile-toast-wine.js'));
  const host = d.getElementById('host');
  let enganches = 0;
  const cab = () => '<button id="mAtras">‹</button><h1>Wine from Toast</h1>';
  w.BarStockMobileToastWine.montar(host, cab, () => { enganches++; host.querySelector('#mAtras').onclick = () => { w.__volvio = true; }; });
  await esperar(80);
  const tarjetas = host.querySelectorAll('.m-tw-card');
  prueba('telefono: una tarjeta por articulo por revisar', tarjetas.length === 5, tarjetas.length);
  prueba('telefono: el mismo vino sugerido que en el escritorio', host.querySelector('.m-tw-sel[data-g="w-sb"]').value === 'Whitehaven Sauvignon Blanc');
  host.querySelector('[data-ig="w-hhp"]').click();
  await esperar(30);
  host.querySelector('[data-tab="confirmed"]').click();
  prueba('telefono: Done junta confirmados e ignorados', /HH Prosecco/.test(host.textContent) && /Not an inventory wine/.test(host.textContent));
  host.querySelector('#mAtras').click();
  prueba('telefono: la flecha de volver sigue enganchada tras repintar', w.__volvio === true && enganches > 2, enganches);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
