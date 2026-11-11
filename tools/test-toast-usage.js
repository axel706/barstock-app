#!/usr/bin/env node
/*
 * ── Lo vendido en Toast desde el conteo, en botellas ─────────────────
 *
 * El motor del "deberías tener" (src/toast-usage.js). Lo que se protege:
 *   1. Cada camino de una venta a botellas: vino por copa (6 oz) y por
 *      botella (una entera), licor con su pour, licor con un modificador
 *      que tiene receta (Martini: 2.5 + vermouth, no el 3 del UP/RX), y
 *      cóctel por receta con sus modificadores (Dirty sin vermouth,
 *      Creamy con Baileys).
 *   2. Lo que no se puede convertir se DICE (sinConvertir, con motivo),
 *      nunca se pierde en silencio: receta que falta, botella sin
 *      elegir, artículo que no casa. Lo ignorado ("Not in inventory")
 *      no cuenta y no se reclama.
 *   3. Las onzas pasan a botellas con el tamaño del producto; sin
 *      tamaño, 750, la misma regla que el conteo.
 *   4. El día del conteo NO se descuenta (Axel, 2026-11-11: se cuenta al
 *      final del día). Un conteo pasada la medianoche es del día que
 *      cerró.
 *   5. Durante un conteo activo no se calcula. Y NO escribe nada.
 *
 *   node tools/test-toast-usage.js
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
const cerca = (a, b) => Math.abs(a - b) < 1e-3;
const OZ = 29.5735;

function ventana(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k', LOCATION_NAME: 'The Crown Tavern' };
  w.__peticiones = [];
  w.fetch = async (url, op) => {
    const u = String(url);
    w.__peticiones.push({ url: u, metodo: (op && op.method) || 'GET' });
    const resp = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.includes('/count_sessions')) return resp(o.sesiones || []);
    if (u.includes('/toast_sales_days')) return resp([]);
    if (u.includes('/toast_sales')) return resp(o.ventas || []);
    if (u.includes('/toast_item_links')) return resp(o.enlaces || []);
    if (u.includes('/toast_recipes')) return resp([]);
    return resp([]);
  };
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc' };
  w.BarStockCycle = { load: async () => (o.ciclo ? new Date(o.ciclo) : null) };
  w.BarStockWeeklyCycle = { estado: () => o.estado || 'done' };
  w.state = { master: [{ item: 'Grey Goose 1L', bottleSizeMl: 1000 }, { item: 'Pinot Grigio', bottleSizeMl: 750 }] };
  for (const f of ['src/toast-links.js', 'src/rest-paginado.js', 'src/toast-recipes.js', 'src/toast-usage.js']) w.eval(leer(f));
  return w;
}

const linea = (etiqueta, oz, x) => Object.assign({ id: Math.random(), etiqueta, oz, producto: null, eleccion: false, soloCon: null, sinCon: [] }, x || {});
const RECETAS = [
  { tipo: 'modifier', nombre: 'Martini', pendiente: '', lineas: [linea('Liquor', 2.5, { eleccion: true }), linea('Dry vermouth', 0.5, { producto: 'Cinzano Dry', sinCon: ['Dirty'] })] },
  { tipo: 'cocktail', nombre: 'HH Gin Martini', pendiente: '', lineas: [linea('Mr Boston', 2.5, { producto: 'Mr Boston Gin' }), linea('Dry vermouth', 0.5, { producto: 'Cinzano Dry', sinCon: ['Dirty'] })] },
  { tipo: 'cocktail', nombre: 'Espresso Martini', pendiente: '', lineas: [linea('Kamora', 1, { producto: 'Kamora' }), linea('Baileys', 0.75, { producto: 'Baileys', soloCon: 'Creamy' })] },
  { tipo: 'cocktail', nombre: 'Golden Vesper', pendiente: '', lineas: [linea("Tito's", 0.75, { producto: "Tito's" }), linea('Lillet', 0.75)] },
  { tipo: 'cocktail', nombre: 'Bloody Mary', pendiente: 'Not on the sheet.', lineas: [] }
];
const ENLACES = [
  { toast_item_guid: 'gg-up', item_name: 'Grey Goose 1L', pour_oz: 3, status: 'confirmed', kind: 'liquor' },
  { toast_item_guid: 'pg-gl', item_name: 'Pinot Grigio', pour_oz: 6, status: 'confirmed', kind: 'wine' },
  { toast_item_guid: 'pg-btl', item_name: 'Pinot Grigio', pour_oz: null, status: 'confirmed', kind: 'wine' },
  { toast_item_guid: 'orchata', item_name: null, pour_oz: null, status: 'ignored', kind: 'liquor' }
];
const v = (guid, nombre, q, mods, fecha) => ({ business_date: fecha || '2026-11-10', toast_item_guid: guid, toast_item_name: nombre, mods: mods || '', quantity: q });
const de = (r, p) => (r.productos.find(x => x.producto === p) || { botellas: 0 }).botellas;

(async () => {

grupo('de una venta a botellas');
{
  const U = ventana().BarStockToastUsage;
  const tam = { 'Grey Goose 1L': 1000, 'Pinot Grigio': 750 };
  let r = U.calcular([v('gg-up', 'Grey Goose', 2)], ENLACES, RECETAS, tam);
  prueba('licor solo: su pour (2 × 3 oz en una de 1 L)', cerca(de(r, 'Grey Goose 1L'), 2 * 3 * OZ / 1000), de(r, 'Grey Goose 1L'));
  r = U.calcular([v('pg-gl', 'Pinot Grigio', 5), v('pg-btl', 'BTL Pinot Grigio', 1)], ENLACES, RECETAS, tam);
  prueba('vino: copa de 6 oz y botella entera', cerca(de(r, 'Pinot Grigio'), 5 * 6 * OZ / 750 + 1), de(r, 'Pinot Grigio'));
  r = U.calcular([v('gg-up', 'Grey Goose', 1, 'Martini')], ENLACES, RECETAS, tam);
  prueba('licor con Martini: manda la receta (2.5, no el 3 del UP/RX)', cerca(de(r, 'Grey Goose 1L'), 2.5 * OZ / 1000), de(r, 'Grey Goose 1L'));
  prueba('y suma el vermouth (sin tamaño: 750)', cerca(de(r, 'Cinzano Dry'), 0.5 * OZ / 750));
  r = U.calcular([v('gg-up', 'Grey Goose', 1, 'Dirty · Martini')], ENLACES, RECETAS, tam);
  prueba('Martini Dirty: sin vermouth', de(r, 'Cinzano Dry') === 0 && cerca(de(r, 'Grey Goose 1L'), 2.5 * OZ / 1000));
  r = U.calcular([v('x', 'HH Gin Martini', 2, 'Dirty'), v('y', 'HH Gin Martini', 1)], ENLACES, RECETAS, tam);
  prueba('cóctel por receta, con su modificador', cerca(de(r, 'Mr Boston Gin'), 3 * 2.5 * OZ / 750) && cerca(de(r, 'Cinzano Dry'), 0.5 * OZ / 750));
  r = U.calcular([v('e', 'Espresso Martini', 3), v('e', 'Espresso Martini', 1, 'Creamy')], ENLACES, RECETAS, tam);
  prueba('Espresso: Baileys sólo con Creamy', cerca(de(r, 'Baileys'), 0.75 * OZ / 750) && cerca(de(r, 'Kamora'), 4 * OZ / 750));
  r = U.calcular([v('x', 'golden vesper', 1)], ENLACES, RECETAS, tam);
  prueba('el nombre de Toast casa sin mayúsculas', de(r, "Tito's") > 0);
}

grupo('lo que no se convierte se dice');
{
  const U = ventana().BarStockToastUsage;
  const r = U.calcular([v('x', 'Bloody Mary', 4), v('x', 'Golden Vesper', 2), v('z', '16oz Guinness', 7), v('orchata', 'Orchata', 3)], ENLACES, RECETAS, {});
  const motivo = (n) => r.sinConvertir.filter(s => s.nombre === n);
  prueba('receta que falta', motivo('Bloody Mary').length === 1 && /Recipe missing/.test(motivo('Bloody Mary')[0].motivo) && motivo('Bloody Mary')[0].unidades === 4);
  prueba('botella sin elegir: dice cuál, y lo demás sí cuenta', /Lillet/.test((motivo('Golden Vesper')[0] || {}).motivo) && de(r, "Tito's") > 0);
  prueba('artículo que no casa', motivo('16oz Guinness').length === 1 && motivo('16oz Guinness')[0].unidades === 7);
  prueba('lo ignorado ni cuenta ni se reclama', !motivo('Orchata').length && !r.productos.some(p => /orchata/i.test(p.producto)));
}

grupo('el día del conteo');
{
  const U = ventana().BarStockToastUsage;
  prueba('un conteo a las 11 pm es de ese día', U.diaDeNegocio('2026-11-09T04:00:00Z') === '2026-11-08');
  prueba('a las 2 am, sigue siendo del día que cerró', U.diaDeNegocio('2026-11-09T07:00:00Z') === '2026-11-08');
  prueba('a las 5 am ya es el día siguiente', U.diaDeNegocio('2026-11-09T10:00:00Z') === '2026-11-09');

  let w = ventana({ ciclo: '2026-11-09T04:00:00Z', sesiones: [{ finished_at: '2026-11-11T03:30:00Z' }],
    ventas: [v('gg-up', 'Grey Goose', 1, '', '2026-11-11')], enlaces: ENLACES });
  let r = await w.BarStockToastUsage.desdeElConteo();
  const ventas = w.__peticiones.find(p => p.url.includes('/toast_sales?'));
  prueba('desde el último conteo (un recuento posterior al ciclo manda)', r.desde === '2026-11-10' && r.conteo === '2026-11-11T03:30:00.000Z', r.desde);
  prueba('y pide sólo los días DESPUÉS del día del conteo', !!ventas && /business_date=gt\.2026-11-10/.test(ventas.url), ventas && ventas.url);
  prueba('paginando (PostgREST corta en 1000)', /limit=1000&offset=0/.test(ventas.url));
  prueba('no escribe nada', w.__peticiones.every(p => p.metodo === 'GET'));

  w = ventana({ ciclo: '2026-11-09T04:00:00Z' });
  r = await w.BarStockToastUsage.desdeElConteo();
  prueba('sin recuento: desde la apertura del ciclo', r.desde === '2026-11-08');

  w = ventana({ estado: 'counting', ciclo: '2026-11-09T04:00:00Z' });
  r = await w.BarStockToastUsage.desdeElConteo();
  prueba('con un conteo activo no calcula ni pide ventas', r.estado === 'contando' && !w.__peticiones.some(p => p.url.includes('toast_sales')));

  w = ventana({});
  r = await w.BarStockToastUsage.desdeElConteo();
  prueba('sin conteo conocido no inventa un inicio', r.estado === 'sinConteo');
}

grupo('está en la app');
{
  const html = leer('index.html');
  const p = f => html.indexOf('src/' + f + '?v=');
  prueba('después de lo que usa', p('toast-usage.js') > p('rest-paginado.js') && p('toast-usage.js') > p('toast-recipes.js') && p('rest-paginado.js') > 0);
  const src = leer('src/toast-usage.js').replace(/\/\/.*$/gm, '');
  prueba('no escribe en on_hand ni en ninguna tabla', !/method:\s*'(POST|PATCH|DELETE)'/.test(src) && !/on_hand|onHand\s*=/.test(src));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
