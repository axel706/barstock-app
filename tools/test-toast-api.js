#!/usr/bin/env node
/*
 * ── Toast: api/integrations.js?provider=toast → lib/toast.js ────────
 *
 * La función que habla con Toast lleva una credencial y devuelve las
 * ventas de un restaurante. Lo que se protege aquí:
 *
 *   1. Sin sesión de la app no se llega a Toast. Ni una petición.
 *   2. El secreto y el token NUNCA salen en la respuesta, tampoco en el
 *      diagnóstico de "falta una variable".
 *   3. Sólo lee: a Toast le hace un POST (el login) y lo demás son GET;
 *      a Supabase no le escribe nada.
 *   4. El login va como lo pide Toast (TOAST_MACHINE_CLIENT) y el
 *      restaurante va en su cabecera.
 *   5. Lo que llega se resume, no se reenvía entero.
 *
 *   node tools/test-toast-api.js
 */

const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

// Supabase de mentira: sólo sabe validar una sesión. Si la función
// intentara escribir algo, no tendría con qué.
const rutaSb = require.resolve('@supabase/supabase-js', { paths: [RAIZ] });
let sbLlamadas = [];
require.cache[rutaSb] = {
  id: rutaSb, filename: rutaSb, loaded: true,
  exports: {
    createClient: () => new Proxy({
      auth: {
        getUser: async (t) => (t === 'sesion-buena'
          ? { data: { user: { id: 'u1' } }, error: null }
          : { data: {}, error: { message: 'bad' } })
      }
    }, {
      get(obj, k) {
        if (k !== 'auth') sbLlamadas.push(String(k));
        return obj[k];
      }
    })
  }
};

// Se entra por la función de verdad, la que reparte, no por lib/: así
// se prueba también que Toast está enchufado.
const handler = require(path.join(RAIZ, 'api/integrations.js'));

const SECRETO = 'shh-no-lo-digas-9f8e7d';
const TOKEN_TOAST = 'tok-toast-123abc';
const GUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function entorno(cambios) {
  const base = {
    SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'srv',
    TOAST_CLIENT_ID: 'cliente-1', TOAST_CLIENT_SECRET: SECRETO,
    TOAST_API_HOST: 'ws-api.toasttab.com', TOAST_RESTAURANT_GUID: GUID
  };
  for (const k of Object.keys(process.env)) if (/^TOAST_|^SUPABASE_/.test(k)) delete process.env[k];
  Object.assign(process.env, base, cambios || {});
  for (const [k, v] of Object.entries(cambios || {})) if (v === undefined) delete process.env[k];
}

let peticiones = [];
let respuestas = {};
global.fetch = async (url, op) => {
  peticiones.push({ url, metodo: (op && op.method) || 'GET', cabeceras: (op && op.headers) || {},
                    cuerpo: op && op.body });
  const clave = Object.keys(respuestas).find(k => url.includes(k));
  // Una respuesta puede ser una función de la URL: las páginas de un día.
  const r0 = clave ? respuestas[clave] : { status: 404, body: { message: 'no route' } };
  const r = typeof r0 === 'function' ? r0(url, op) : r0;
  return { ok: r.status < 400, status: r.status, text: async () => JSON.stringify(r.body) };
};

const LOGIN_OK = { status: 200, body: { status: 'SUCCESS',
  token: { tokenType: 'Bearer', accessToken: TOKEN_TOAST, expiresIn: 86400, scope: 'orders:read menus:read' } } };

async function llamar(o) {
  o = o || {};
  peticiones = []; sbLlamadas = [];
  const res = {
    code: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; }
  };
  await handler({
    query: { provider: o.proveedor === undefined ? 'toast' : o.proveedor },
    method: o.metodo || 'POST',
    headers: { authorization: o.token === undefined ? 'Bearer sesion-buena' : o.token },
    body: { action: o.accion, params: o.params }
  }, res);
  return res;
}

(async () => {

grupo('la funcion de integraciones reparte');
{
  entorno();
  respuestas = { '/authentication/': LOGIN_OK };
  let r = await llamar({ accion: 'ping' });
  prueba('provider=toast llega a Toast', r.body.ok === true, JSON.stringify(r.body));
  r = await llamar({ accion: 'ping', proveedor: 'nadie' });
  prueba('un provider que no existe, 404', r.code === 404, String(r.code));
  prueba('sin llamar a nadie', peticiones.length === 0);
  r = await llamar({ accion: 'ping', proveedor: 'constructor' });
  // `PROVEEDORES['constructor']` existe en cualquier objeto de JS.
  prueba('ni con un nombre que todo objeto tiene', r.code === 404, String(r.code));
}

grupo('sin sesion de la app, no se llega a Toast');
{
  entorno();
  respuestas = { '/authentication/': LOGIN_OK };
  let r = await llamar({ metodo: 'GET', accion: 'ping' });
  prueba('un GET no entra', r.code === 405, String(r.code));
  r = await llamar({ accion: 'ping', token: '' });
  prueba('sin token, 401', r.code === 401, String(r.code));
  prueba('y ninguna peticion a Toast', peticiones.length === 0, String(peticiones.length));
  r = await llamar({ accion: 'ping', token: 'Bearer sesion-mala' });
  prueba('con una sesion que no vale, 401', r.code === 401, String(r.code));
  prueba('y tampoco se llega a Toast', peticiones.length === 0, String(peticiones.length));
}

grupo('si falta una variable, dice cual, y nunca un valor');
{
  entorno({ TOAST_API_HOST: undefined });
  const r = await llamar({ accion: 'ping' });
  const txt = JSON.stringify(r.body);
  prueba('no sigue', r.body.ok === false);
  prueba('nombra la que falta', /TOAST_API_HOST/.test(r.body.error), r.body.error);
  prueba('enseña las que si ve, por su nombre',
    (r.body.diagnostico.variablesParecidas || []).includes('TOAST_CLIENT_SECRET'));
  prueba('sin el secreto', !txt.includes(SECRETO));
  prueba('ni el id del cliente', !txt.includes('cliente-1'));
  prueba('y sin llamar a Toast', peticiones.length === 0);
}
{
  // El GUID no hace falta para probar el login: se puede probar antes
  // de encontrarlo.
  entorno({ TOAST_RESTAURANT_GUID: undefined });
  respuestas = { '/authentication/': LOGIN_OK };
  const r = await llamar({ accion: 'ping' });
  prueba('ping funciona sin el GUID', r.body.ok === true, JSON.stringify(r.body));
  const r2 = await llamar({ accion: 'orders' });
  prueba('pero pedir ventas sin GUID, no', r2.body.ok === false && /TOAST_RESTAURANT_GUID/.test(r2.body.error),
    JSON.stringify(r2.body));
}

grupo('el login va como lo pide Toast');
{
  entorno({ TOAST_API_HOST: 'https://ws-api.toasttab.com/' });
  respuestas = { '/authentication/': LOGIN_OK };
  const r = await llamar({ accion: 'ping' });
  const p = peticiones[0] || {};
  prueba('a la ruta de login', p.url === 'https://ws-api.toasttab.com/authentication/v1/authentication/login', p.url);
  prueba('aunque el host se copiara con https:// y barra', !/https:\/\/https/.test(p.url || ''));
  prueba('por POST', p.metodo === 'POST');
  const cuerpo = JSON.parse(p.cuerpo || '{}');
  prueba('como cliente de maquina', cuerpo.userAccessType === 'TOAST_MACHINE_CLIENT', cuerpo.userAccessType);
  prueba('con su id y su secreto', cuerpo.clientId === 'cliente-1' && cuerpo.clientSecret === SECRETO);
  prueba('dice que funciono', r.body.ok === true);
  prueba('y con que permisos', r.body.permisos === 'orders:read menus:read', r.body.permisos);
  const txt = JSON.stringify(r.body);
  prueba('el token NO sale de la funcion', !txt.includes(TOKEN_TOAST));
  prueba('ni el secreto', !txt.includes(SECRETO));
}
{
  entorno();
  respuestas = { '/authentication/': { status: 401, body: { message: 'Invalid client credentials' } } };
  const r = await llamar({ accion: 'ping' });
  prueba('si Toast dice que no, se dice', r.body.ok === false && r.body.paso === 'login');
  // Lo que dijo Toast, tal cual: nada de adivinar una causa.
  prueba('con lo que dijo Toast', /Invalid client credentials/.test(JSON.stringify(r.body)));
  prueba('sin el secreto', !JSON.stringify(r.body).includes(SECRETO));
  const rev = r.body.toast && r.body.toast.revision;
  prueba('dice cuanto mide cada valor', rev && rev.TOAST_CLIENT_ID.largo === 9 &&
    rev.TOAST_CLIENT_SECRET.largo === SECRETO.length, JSON.stringify(rev));
  prueba('ni el id del cliente sale', !JSON.stringify(r.body).includes('cliente-1'));
}
{
  // Un salto de línea pegado al copiar de Toast Web. Toast lo rechaza;
  // la función lo limpia antes de mandarlo y además dice que estaba.
  entorno({ TOAST_CLIENT_ID: ' cliente-1\n', TOAST_CLIENT_SECRET: SECRETO + ' ' });
  respuestas = { '/authentication/': LOGIN_OK };
  await llamar({ accion: 'ping' });
  const cuerpo = JSON.parse((peticiones[0] || {}).cuerpo || '{}');
  prueba('limpia los espacios del id antes de mandarlo', cuerpo.clientId === 'cliente-1', JSON.stringify(cuerpo.clientId));
  prueba('y los del secreto', cuerpo.clientSecret === SECRETO);

  respuestas = { '/authentication/': { status: 401, body: { error_description: 'Unauthorized' } } };
  const r = await llamar({ accion: 'ping' });
  const rev = r.body.toast.revision;
  prueba('y si falla, dice que los habia', rev.TOAST_CLIENT_ID.espaciosAlrededor === true &&
    rev.TOAST_CLIENT_SECRET.espaciosAlrededor === true, JSON.stringify(rev));
}

grupo('el restaurante va en su cabecera');
{
  entorno();
  respuestas = {
    '/authentication/': LOGIN_OK,
    '/restaurants/v1/restaurants/': { status: 200, body: { general: { name: 'Crown', locationName: 'The Crown Tavern' } } }
  };
  const r = await llamar({ accion: 'restaurant' });
  const p = peticiones[1] || { cabeceras: {} };
  prueba('pide el restaurante del GUID', (p.url || '').endsWith('/restaurants/v1/restaurants/' + GUID), p.url);
  prueba('con el GUID en Toast-Restaurant-External-ID', p.cabeceras['Toast-Restaurant-External-ID'] === GUID);
  prueba('y el token como Bearer', p.cabeceras.Authorization === 'Bearer ' + TOKEN_TOAST);
  prueba('dice como se llama', r.body.nombre === 'The Crown Tavern', r.body.nombre);
  prueba('sin devolver el token', !JSON.stringify(r.body).includes(TOKEN_TOAST));
}

grupo('el menu se cuenta, no se reenvia');
{
  entorno();
  respuestas = {
    '/authentication/': LOGIN_OK,
    '/menus/v2/menus': { status: 200, body: { menus: [{ name: 'Bar', menuGroups: [
      { name: 'Whiskey', menuItems: [{ name: 'Glenlivet 12', guid: 'g1' }, { name: 'Jameson', guid: 'g2' }],
        menuGroups: [{ name: 'Scotch', menuItems: [{ name: 'Macallan 12', guid: 'g3' }] }] },
      { name: 'Vodka', menuItems: [{ name: "Tito's", guid: 'g4' }] }
    ] }] } }
  };
  const r = await llamar({ accion: 'menu' });
  prueba('cuenta los articulos, tambien los de subgrupos', r.body.articulos === 4, String(r.body.articulos));
  prueba('y los grupos', r.body.grupos === 3, String(r.body.grupos));
  prueba('con su GUID en la muestra', r.body.muestra.some(m => m.guid === 'g3' && m.group === 'Scotch'));
}

grupo('las ventas: un dia, aplanadas y resumidas');
{
  entorno();
  const orden = (n) => ({ guid: 'o' + n, checks: [{ selections: [
    { displayName: 'Glenlivet 12', quantity: 1, price: 14, voided: false, item: { guid: 'g1' } },
    { displayName: 'Jameson', quantity: 2, price: 20, voided: n === 0, item: { guid: 'g2' } }
  ] }] });
  respuestas = { '/authentication/': LOGIN_OK, '/orders/v2/ordersBulk': { status: 200, body: [orden(0), orden(1)] } };
  const r = await llamar({ accion: 'orders', params: { businessDate: '20261101' } });
  const u = (peticiones[1] || {}).url || '';
  prueba('pide el dia que se le dice', /businessDate=20261101/.test(u), u);
  prueba('una sola pagina, del tamaño maximo', /pageSize=100&page=1/.test(u), u);
  prueba('cuenta las ordenes', r.body.ordenes === 2, String(r.body.ordenes));
  prueba('aplana las lineas de todas', r.body.lineas === 4, String(r.body.lineas));
  prueba('dice que valores toma cada campo', r.body.campos.voided && r.body.campos.voided['true'] === 1,
    JSON.stringify(r.body.campos.voided));
  prueba('con dos ordenes, no hay mas', r.body.hayMas === false);

  const llenas = Array.from({ length: 100 }, (_, i) => orden(i));
  respuestas['/orders/v2/ordersBulk'] = { status: 200, body: llenas };
  const r2 = await llamar({ accion: 'orders' });
  // Si no lo dijera, el resumen de 100 ordenes se leeria como el dia entero.
  prueba('con la pagina llena, avisa que hay mas', r2.body.hayMas === true);
}
{
  entorno();
  respuestas = { '/authentication/': LOGIN_OK, '/orders/v2/ordersBulk': { status: 200, body: [] } };
  await llamar({ accion: 'orders', params: { businessDate: "20261101&page=9'" } });
  const u = (peticiones[1] || {}).url || '';
  // Lo que llega del navegador no se pega a la URL sin mirarlo: esta
  // función lleva una credencial.
  prueba('una fecha rara no se cuela en la URL', !/page=9/.test(u) && /businessDate=\d{8}&/.test(u), u);
}

grupo('solo lee');
{
  entorno();
  respuestas = {
    '/authentication/': LOGIN_OK,
    '/restaurants/v1/restaurants/': { status: 200, body: { general: { name: 'Crown' } } },
    '/menus/v2/menus': { status: 200, body: { menus: [] } },
    '/orders/v2/ordersBulk': { status: 200, body: [] }
  };
  const metodos = [];
  for (const a of ['ping', 'restaurant', 'menu', 'orders', 'drinks', 'wine', 'sales', 'liquor']) {
    await llamar({ accion: a });
    for (const p of peticiones) metodos.push(p.metodo + ' ' + p.url.replace(/https:\/\/[^/]+/, ''));
    prueba(a + ': a Supabase solo le valida la sesion', sbLlamadas.length === 0, sbLlamadas.join(','));
    // Ni por fetch: sync es la única que escribe, y sólo sus dos tablas.
    const aSb = peticiones.filter(p => p.url.startsWith('https://sb.test'));
    prueba(a + ': ni una peticion a la base', aSb.length === 0, aSb.map(p => p.metodo + ' ' + p.url).join(' | '));
  }
  const escribe = metodos.filter(m => !m.startsWith('GET ') && !/\/authentication\/v1\/authentication\/login$/.test(m));
  prueba('a Toast, nada que no sea leer o el login', escribe.length === 0, escribe.join(' | '));

  const r = await llamar({ accion: 'borrar' });
  prueba('una accion que no existe no hace nada', r.code === 400 && peticiones.length === 0, r.code + ' ' + peticiones.length);
}

grupo('drinks: que se vende de bebida y como lo cuenta Toast');
{
  // Para decidir como pasar de tragos a botellas hay que ver como vienen
  // los tragos. Un dia ENTERO, por categoria de venta, sin texto libre.
  entorno();
  const CAT = { liquor: 'cat-liq', food: 'cat-food' };
  const sel = (nombre, cat, q, mods, extra) => Object.assign({
    displayName: nombre, item: { guid: 'it-' + nombre }, quantity: q,
    salesCategory: { guid: cat }, modifiers: mods || []
  }, extra || {});
  const mod = (nombre, q, sub) => ({ displayName: nombre, item: { guid: 'm-' + nombre }, quantity: q || 1, modifiers: sub || [] });
  const orden = (sels, extra) => Object.assign({ checks: [{ selections: sels }] }, extra || {});
  const pagina1 = [];
  for (let i = 0; i < 100; i++) pagina1.push(orden([sel('Vodka Soda', CAT.liquor, 1, [mod("Tito's"), mod('Double')])]));
  const pagina2 = [
    orden([sel('Vodka Soda', CAT.liquor, 2, [mod('Grey Goose')])]),
    orden([sel('Burger', CAT.food, 1)]),
    // Anuladas: no cuentan.
    orden([sel('Vodka Soda', CAT.liquor, 5, [mod("Tito's")])], { voided: true }),
    orden([sel('Vodka Soda', CAT.liquor, 7, [], { voided: true })]),
    // Texto libre: un open item y una peticion especial, sin guid.
    orden([{ displayName: 'Para Juan Perez cumple', quantity: 1, salesCategory: { guid: CAT.liquor },
             modifiers: [] },
           sel('Margarita', CAT.liquor, 1, [{ displayName: 'sin hielo, es para Maria', quantity: 1 }])])
  ];
  respuestas = {
    '/authentication/': LOGIN_OK,
    '/config/v2/salesCategories': { status: 200, body: [{ guid: CAT.liquor, name: 'Liquor' }, { guid: CAT.food, name: 'Food' }] },
    '/menus/v2/menus': { status: 200, body: { menus: [{ name: 'DRINKS', menuGroups: [{ name: 'Cocktails', menuItems: [{ guid: 'it-Vodka Soda', name: 'Vodka Soda' }] }] }] } },
    '/orders/v2/ordersBulk': (url) => ({ status: 200, body: /page=1(&|$)/.test(url) ? pagina1 : (/page=2(&|$)/.test(url) ? pagina2 : []) })
  };
  const r = await llamar({ accion: 'drinks', params: { businessDate: '20261106' } });
  const b = r.body;
  const paginas = peticiones.filter(x => x.url.includes('ordersBulk')).map(x => (/page=(\d+)/.exec(x.url) || [])[1]);
  prueba('pide todas las paginas del dia, no solo la primera', paginas.join(',') === '1,2', paginas.join(','));
  prueba('y el dia queda completo', b.ok === true && b.diaCompleto === true && b.ordenes === 105, JSON.stringify({ ok: b.ok, c: b.diaCompleto, o: b.ordenes }));
  const liq = (b.porCategoria || []).find(c => c.categoria === 'Liquor') || {};
  const food = (b.porCategoria || []).find(c => c.categoria === 'Food') || {};
  prueba('agrupa por categoria de venta', !!liq.articulos && food.unidades === 1, JSON.stringify((b.porCategoria || []).map(c => c.categoria)));
  const vs = (liq.articulos || []).find(a => a.nombre === 'Vodka Soda') || {};
  prueba('suma cantidades y salta lo anulado (100 + 2, no + 5 ni + 7)', vs.unidades === 102, vs.unidades);
  prueba('con el grupo del menu', vs.grupo === 'DRINKS › Cocktails', vs.grupo);
  prueba('y sus modificadores contados', (vs.modificadores || []).includes("Tito's ×100") && (vs.modificadores || []).includes('Double ×100') &&
    (vs.modificadores || []).includes('Grey Goose ×2'), JSON.stringify(vs.modificadores));
  const todo = JSON.stringify(b);
  prueba('el texto libre se cuenta pero no se ensena', !/Juan Perez|Maria/.test(todo) && todo.includes('(free text)'));
  prueba('ni el token', !todo.includes(TOKEN_TOAST));
}
{
  // Un dia que no acaba: al tope se para, y lo dice.
  entorno();
  const llena = Array.from({ length: 100 }, () => ({ checks: [] }));
  respuestas = {
    '/authentication/': LOGIN_OK,
    '/config/v2/salesCategories': { status: 200, body: [] },
    '/menus/v2/menus': { status: 200, body: { menus: [] } },
    '/orders/v2/ordersBulk': { status: 200, body: llena }
  };
  const r = await llamar({ accion: 'drinks' });
  const n = peticiones.filter(x => x.url.includes('ordersBulk')).length;
  prueba('con tope de paginas', n === 15, n);
  prueba('y avisa que el dia no esta entero', r.body.diaCompleto === false, r.body.diaCompleto);
}
{
  // Filtrar una categoria trae mas articulos de ella.
  entorno();
  const muchos = Array.from({ length: 60 }, (_, i) => ({ checks: [{ selections: [
    { displayName: 'Cerveza ' + i, item: { guid: 'b' + i }, quantity: 1, salesCategory: { guid: 'cat-beer' } }] }] }));
  respuestas = {
    '/authentication/': LOGIN_OK,
    '/config/v2/salesCategories': { status: 200, body: [{ guid: 'cat-beer', name: 'Beer' }] },
    '/menus/v2/menus': { status: 200, body: { menus: [] } },
    '/orders/v2/ordersBulk': { status: 200, body: muchos }
  };
  const sin = await llamar({ accion: 'drinks' });
  const con = await llamar({ accion: 'drinks', params: { categoria: 'beer' } });
  const n1 = sin.body.porCategoria[0].articulos.length, n2 = con.body.porCategoria[0].articulos.length;
  prueba('sin filtro, los 30 que mas se venden', n1 === 30, n1);
  prueba('con filtro, mas de esa categoria', n2 === 60, n2);
}

grupo('wine: los vinos del menu y lo vendido de cada uno');
{
  // Para emparejar cada articulo de Toast con una botella del inventario.
  entorno();
  const menu = { menus: [
    { name: 'DRINKS', menuGroups: [
      { name: 'Wine', menuGroups: [
        { name: 'Whites By The Glass', menuItems: [{ guid: 'w-sb', name: 'Sauv Blanc - Whitehaven' }] },
        { name: 'Red By The Bottle', menuItems: [{ guid: 'w-bdx', name: 'BTL Bordeaux - Les Cadrans' }] }
      ]},
      { name: 'Liquor', menuGroups: [{ name: 'Vodka', menuItems: [{ guid: 'l-tito', name: 'Titos vodka' }] }] }
    ]},
    { name: 'HAPPY HOUR', menuGroups: [{ name: 'HH Wines', menuItems: [
      { guid: 'w-pio', name: 'Pio Pinot Grigio' }, { guid: 'w-btl', name: 'BTL House Red' } ] }] }
  ] };
  const sel = (g, q, extra) => Object.assign({ item: { guid: g }, quantity: q }, extra || {});
  const ordenes = [
    { checks: [{ selections: [sel('w-sb', 2), sel('w-pio', 1), sel('l-tito', 5)] }] },
    // El cobro malo se anula y se timbra otra con Don't Make: cuenta UNA.
    { checks: [{ selections: [sel('w-pio', 1, { voided: true }), sel('w-pio', 1, { modifiers: [{ displayName: "Don't Make" }] })] }] },
    { voided: true, checks: [{ selections: [sel('w-sb', 9)] }] },
    { checks: [{ selections: [sel('w-bdx', 1)] }] }
  ];
  respuestas = {
    '/authentication/': LOGIN_OK,
    '/menus/v2/menus': { status: 200, body: menu },
    '/orders/v2/ordersBulk': (url) => ({ status: 200, body: /page=1(&|$)/.test(url) ? ordenes : [] })
  };
  const r = await llamar({ accion: 'wine', params: { businessDate: '20261106' } });
  const b = r.body;
  const art = Object.fromEntries((b.articulos || []).map(a => [a.guid, a]));
  prueba('salen los vinos del menu, y no el vodka', !!art['w-sb'] && !!art['w-bdx'] && !!art['w-pio'] && !art['l-tito'], Object.keys(art).join(','));
  prueba('copa por defecto', art['w-sb'] && art['w-sb'].servicio === 'glass' && art['w-pio'].servicio === 'glass');
  prueba('botella por el grupo "By The Bottle"', art['w-bdx'] && art['w-bdx'].servicio === 'bottle');
  prueba('botella por el nombre "BTL"', art['w-btl'] && art['w-btl'].servicio === 'bottle');
  prueba('con la ruta del grupo', art['w-pio'] && art['w-pio'].grupo === 'HAPPY HOUR › HH Wines', art['w-pio'] && art['w-pio'].grupo);
  const v = b.vendido || {};
  prueba('vendido por articulo, sin lo anulado', v['w-sb'] === 2 && v['w-bdx'] === 1, JSON.stringify(v));
  prueba("el Don't Make cuenta, la linea anulada no (Pio: 1 + 1)", v['w-pio'] === 2, v['w-pio']);
  prueba('lo que no es vino no entra en lo vendido', v['l-tito'] === undefined);
  prueba('dice de que restaurante es', b.restaurante === GUID, b.restaurante);
  prueba('y si el dia esta entero', b.diaCompleto === true);
  prueba('sin el token', !JSON.stringify(b).includes(TOKEN_TOAST));
}

grupo('wine con guids: no vuelve a leer el menu');
{
  // La pantalla lee el menu el primer dia y los otros seis los pide con
  // los guids que ya tiene. Toast limita las lecturas del menu.
  entorno();
  const ordenes = [{ checks: [{ selections: [
    { item: { guid: 'w-sb' }, quantity: 2 }, { item: { guid: 'l-tito' }, quantity: 5 } ] }] }];
  respuestas = {
    '/authentication/': LOGIN_OK,
    '/menus/v2/menus': { status: 500, body: { message: 'no deberia pedirse' } },
    '/orders/v2/ordersBulk': (url) => ({ status: 200, body: /page=1(&|$)/.test(url) ? ordenes : [] })
  };
  peticiones = [];
  const r = await llamar({ accion: 'wine', params: { businessDate: '20261105', guids: ['w-sb', 'w-pio'] } });
  prueba('contesta bien', r.body.ok === true, JSON.stringify(r.body).slice(0, 200));
  prueba('sin pedir el menu', !peticiones.some(p => p.url.includes('/menus/')));
  prueba('cuenta solo esos guids', r.body.vendido && r.body.vendido['w-sb'] === 2 && r.body.vendido['l-tito'] === undefined, JSON.stringify(r.body.vendido));
  prueba('y dice de que restaurante es', r.body.restaurante === GUID);
}

grupo('429: se espera y se vuelve a pedir');
{
  // Toast contesta 429 cuando se le pide demasiado seguido. Es pasajero:
  // un segundo despues contesta bien.
  entorno();
  let veces = 0;
  respuestas = {
    '/authentication/': LOGIN_OK,
    '/menus/v2/menus': () => (++veces === 1 ? { status: 429, body: { message: 'Too Many Requests' } } : { status: 200, body: { menus: [] } }),
    '/orders/v2/ordersBulk': { status: 200, body: [] }
  };
  const r = await llamar({ accion: 'wine', params: { businessDate: '20261105' } });
  prueba('tras un 429, lo vuelve a pedir y sale bien', r.body.ok === true && veces === 2, veces + ' · ' + JSON.stringify(r.body).slice(0, 120));
  veces = 0;
  respuestas['/menus/v2/menus'] = () => (++veces, { status: 429, body: { message: 'Too Many Requests' } });
  const r2 = await llamar({ accion: 'wine', params: { businessDate: '20261105' } });
  prueba('pero no para siempre: al final dice el 429', r2.body.ok === false && r2.body.status === 429 && veces <= 4, veces);
}

grupo('sync: guarda lo vendido de bebida de un dia');
{
  // Lo vendido día por día, para el inventario en vivo. Es la ÚNICA
  // acción que escribe en la base, y sólo en toast_sales y
  // toast_sales_days.
  const LOC = '11111111-2222-3333-4444-555555555555';
  const menu = { menus: [{ name: 'DRINKS', menuGroups: [
    { name: 'Liquor', menuGroups: [{ name: 'Vodka', menuItems: [{ guid: 'l-tito', name: "Tito's" }] }] },
    { name: 'Wine', menuGroups: [{ name: 'Whites By The Glass', menuItems: [{ guid: 'w-sb', name: 'Sauv Blanc' }] }] } ] },
    { name: 'FOOD', menuGroups: [{ name: 'Mains', menuItems: [{ guid: 'f-burger', name: 'Burger' }] }] } ] };
  const sel = (g, cat, q, extra) => Object.assign({ item: { guid: g }, displayName: g, salesCategory: { guid: cat }, quantity: q }, extra || {});
  const martini = { item: { guid: 'm-mart' }, displayName: 'Martini' };
  const ordenes = [
    { checks: [{ selections: [
      sel('l-tito', 'c-liq', 2, { modifiers: [martini] }),
      sel('l-tito', 'c-liq', 1, { modifiers: [martini, { displayName: 'sin hielo para Juan' }] }),
      sel('l-tito', 'c-liq', 1),
      sel('f-burger', 'c-food', 4),
      sel('w-sb', 'c-wine', 2),
      // Un open bar: Toast no dice qué se sirvió, sólo el paquete y las
      // personas. Se guarda para saber qué días hubo evento.
      sel('p-silver', 'c-ban', 31),
      // Refrescos y café: no son del inventario.
      sel('b-cola', 'c-bev', 40),
      { displayName: 'shot para la mesa 4', salesCategory: { guid: 'c-liq' }, quantity: 1 },
      sel('l-tito', 'c-liq', 9, { voided: true }) ] }] },
    { voided: true, checks: [{ selections: [sel('l-tito', 'c-liq', 7)] }] }
  ];
  const rutas = (o) => {
    o = o || {};
    return {
      '/authentication/': LOGIN_OK,
      '/config/v2/salesCategories': o.cats || { status: 200, body: [
        { guid: 'c-liq', name: 'Liquor' }, { guid: 'c-wine', name: 'Wine' }, { guid: 'c-food', name: 'Food' },
        { guid: 'c-ban', name: 'Banquet Beverage' }, { guid: 'c-bev', name: 'Beverage' }] },
      '/menus/v2/menus': { status: 200, body: menu },
      '/orders/v2/ordersBulk': o.ordenes || ((url) => ({ status: 200, body: /page=1(&|$)/.test(url) ? ordenes : [] })),
      'sb.test/rest/v1/locations': { status: 200, body: [{ toast_restaurant_guid: o.guidLoc === undefined ? GUID : o.guidLoc }] },
      // toast_sales_days antes que toast_sales: la ruta se busca por
      // "contiene", y la segunda contiene a la primera.
      'sb.test/rest/v1/toast_sales_days': { status: 201, body: [] },
      'sb.test/rest/v1/toast_sales': { status: 201, body: [] }
    };
  };
  const aLaBase = () => peticiones.filter(p => p.url.startsWith('https://sb.test'));

  entorno();
  respuestas = rutas();
  const r = await llamar({ accion: 'sync', params: { businessDate: '20261105', locationId: LOC } });
  const b = r.body;
  prueba('contesta bien', b && b.ok === true, JSON.stringify(b).slice(0, 300));
  const sb = aLaBase();
  const filas = sb.filter(p => p.metodo === 'POST' && /\/toast_sales(\?|$)/.test(p.url.replace('https://sb.test/rest/v1', '')));
  const cuerpo = filas.length ? JSON.parse(filas[0].cuerpo) : [];
  const de = (g, m) => cuerpo.find(x => x.toast_item_guid === g && x.mods === m);
  prueba('una fila por articulo y modificadores', cuerpo.length === 4, JSON.stringify(cuerpo));
  prueba('el open bar se guarda (paquete y personas)', de('p-silver', '') && de('p-silver', '').quantity === 31);
  prueba('los refrescos no', !cuerpo.some(x => x.toast_item_guid === 'b-cola'));
  prueba("Tito's Martini suma sus dos lineas (2 + 1)", de('l-tito', 'Martini') && de('l-tito', 'Martini').quantity === 3, JSON.stringify(de('l-tito', 'Martini')));
  prueba("Tito's solo, aparte", de('l-tito', '') && de('l-tito', '').quantity === 1);
  prueba('el vino tambien', de('w-sb', '') && de('w-sb', '').quantity === 2);
  prueba('la comida no se guarda', !cuerpo.some(x => x.toast_item_guid === 'f-burger'));
  const tito = cuerpo.filter(x => x.toast_item_guid === 'l-tito').reduce((a, x) => a + x.quantity, 0);
  prueba('lo anulado no cuenta (Tito\'s: 3 + 1, sin el 9 ni la orden de 7)', tito === 4, tito);
  prueba('ni el texto libre: ni la linea ni el modificador', !JSON.stringify(cuerpo).includes('Juan') && !JSON.stringify(cuerpo).includes('mesa 4'));
  prueba('pero se dice cuantas lineas libres hubo', b.libres === 1, b.libres);
  prueba('con locacion, fecha y grupo del menu', de('l-tito', '') && de('l-tito', '').location_id === LOC &&
    de('l-tito', '').business_date === '2026-11-05' && de('l-tito', '').toast_group === 'DRINKS › Liquor › Vodka', JSON.stringify(de('l-tito', '')));
  prueba('dice que categorias guardo y cuales no', JSON.stringify(b.categorias) === JSON.stringify({ guardadas: ['Banquet Beverage', 'Liquor', 'Wine'], fuera: ['Beverage', 'Food'] }), JSON.stringify(b.categorias));

  // El orden: marcar el día como incompleto, borrar, escribir, y sólo al
  // final marcarlo completo. Si algo falla a medias, el día queda
  // incompleto y se vuelve a cargar, en vez de quedar a medias como si
  // estuviera entero.
  const pasos = sb.filter(p => p.metodo !== 'GET').map(p => p.metodo + ' ' + p.url.replace(/https:\/\/sb\.test\/rest\/v1\//, '').replace(/\?.*/, ''));
  prueba('marca incompleto, borra, escribe, marca completo',
    JSON.stringify(pasos) === JSON.stringify(['POST toast_sales_days', 'DELETE toast_sales', 'POST toast_sales', 'POST toast_sales_days']), JSON.stringify(pasos));
  const borra = sb.find(p => p.metodo === 'DELETE');
  prueba('borra solo ese dia de esa locacion', borra && borra.url.includes('location_id=eq.' + LOC) && borra.url.includes('business_date=eq.2026-11-05'), borra && borra.url);
  const dias = sb.filter(p => p.metodo === 'POST' && p.url.includes('toast_sales_days'));
  const fin = dias.length ? JSON.parse(dias[dias.length - 1].cuerpo) : {};
  const ini = dias.length ? JSON.parse(dias[0].cuerpo) : {};
  prueba('al empezar, el dia queda incompleto', ini.complete === false, JSON.stringify(ini));
  prueba('al final, completo, cerrado, con sus ordenes', fin.complete === true && fin.closed === true && fin.orders === 1, JSON.stringify(fin));
  prueba('el dia se escribe contra su llave', dias.every(p => p.url.includes('on_conflict=location_id,business_date') &&
    /merge-duplicates/.test(JSON.stringify(p.cabeceras))), dias.map(p => p.url).join(' | '));
  prueba('a la base con la llave de servicio', sb.every(p => JSON.stringify(p.cabeceras).includes('srv')));
  prueba('sin la llave ni el token en la respuesta', !JSON.stringify(b).includes('srv') && !JSON.stringify(b).includes(TOKEN_TOAST));
  prueba('a la base solo esas dos tablas y la locacion', sb.every(p => /\/rest\/v1\/(toast_sales_days|toast_sales|locations)(\?|$)/.test(p.url)),
    sb.map(p => p.url).join(' | '));
  prueba('la locacion solo se lee', sb.filter(p => p.url.includes('/locations')).every(p => p.metodo === 'GET'));

  // Hoy no está cerrado: se vuelve a cargar entero cada vez.
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
  await llamar({ accion: 'sync', params: { businessDate: hoy, locationId: LOC } });
  const dh = peticiones.filter(p => p.metodo === 'POST' && p.url.includes('toast_sales_days'));
  prueba('hoy queda abierto', dh.length && JSON.parse(dh[dh.length - 1].cuerpo).closed === false);
  // Cargar un año son cientos de llamadas: el menú no se pide en cada una
  // (Toast limita esas lecturas; de ahí salió el 429 de Wine from Toast).
  prueba('la segunda carga seguida no vuelve a pedir el menu', !peticiones.some(p => p.url.includes('/menus/')),
    peticiones.filter(p => p.url.includes('/menus/')).length);

  // Lo que no tiene que escribir nada.
  respuestas = rutas({ guidLoc: 'otro-restaurante' });
  const r2 = await llamar({ accion: 'sync', params: { businessDate: '20261105', locationId: LOC } });
  prueba('otra locacion: no escribe nada', r2.body.ok === false && r2.body.paso === 'location' && !aLaBase().some(p => p.metodo !== 'GET'), JSON.stringify(r2.body));
  prueba('y no llega a pedir las ordenes', !peticiones.some(p => p.url.includes('ordersBulk')));
  respuestas = rutas({ guidLoc: null });
  const r2b = await llamar({ accion: 'sync', params: { businessDate: '20261105', locationId: LOC } });
  prueba('locacion sin restaurante: tampoco', r2b.body.ok === false && r2b.body.paso === 'location' && !aLaBase().some(p => p.metodo !== 'GET'));
  respuestas = rutas();
  const r3 = await llamar({ accion: 'sync', params: { businessDate: '20261105', locationId: 'x;drop' } });
  prueba('una locacion rara no se cuela', r3.body.ok === false && aLaBase().length === 0, JSON.stringify(r3.body));
  respuestas = rutas({ ordenes: { status: 500, body: { message: 'boom' } } });
  const r4 = await llamar({ accion: 'sync', params: { businessDate: '20261105', locationId: LOC } });
  prueba('si Toast falla en las ordenes: no escribe nada', r4.body.ok === false && !aLaBase().some(p => p.metodo !== 'GET'), JSON.stringify(r4.body));
  respuestas = rutas({ cats: { status: 403, body: { message: 'no' } } });
  require(path.join(RAIZ, 'lib/toast.js'))._olvidarCatalogo();
  const r5 = await llamar({ accion: 'sync', params: { businessDate: '20261105', locationId: LOC } });
  prueba('sin categorias no se adivina que es bebida: no escribe', r5.body.ok === false && r5.body.paso === 'categorias' && !aLaBase().some(p => p.metodo !== 'GET'), JSON.stringify(r5.body));
}

grupo('sync: guarda tambien el dinero (net sales)');
{
  // Axel, 2026-11-12: la tarjeta Toast Sales del Home enseña el dinero
  // (net sales, sin cerveza). Hasta aquí sync sólo guardaba cantidades.
  // Se guarda por fila:
  //   net             Σ price: después de descuentos, sin impuesto.
  //   mods_price      Σ precio de los modificadores, APARTE: no se ha
  //                   medido si Toast ya los mete en `price`, y así se
  //                   decide al medir sin volver a cargar nada.
  //   sales_category  la categoría de venta de Toast (Liquor, Wine…).
  // Una línea sin `price` deja el neto de su fila en null: un hueco no es
  // un $0.
  const LOC = '11111111-2222-3333-4444-555555555555';
  const menu = { menus: [{ name: 'DRINKS', menuGroups: [
    { name: 'Liquor', menuGroups: [{ name: 'Vodka', menuItems: [{ guid: 'l-tito', name: "Tito's" }] }] } ] }] };
  const sel = (g, cat, q, extra) => Object.assign({ item: { guid: g }, displayName: g, salesCategory: { guid: cat }, quantity: q }, extra || {});
  const doble = { item: { guid: 'm-dbl' }, displayName: 'Double', price: 4 };
  const ordenes = [{ checks: [{ selections: [
    sel('l-tito', 'c-liq', 2, { price: 20, modifiers: [doble] }),
    sel('l-tito', 'c-liq', 1, { price: 9, modifiers: [doble] }),
    sel('l-tito', 'c-liq', 1, { price: 10 }),
    sel('w-sb', 'c-wine', 2, { price: 24.5 }),
    sel('w-x', 'c-wine', 1)
  ] }] }];
  let columnas = true;
  const rutas = () => ({
    '/authentication/': LOGIN_OK,
    '/config/v2/salesCategories': { status: 200, body: [{ guid: 'c-liq', name: 'Liquor' }, { guid: 'c-wine', name: 'Wine' }] },
    '/menus/v2/menus': { status: 200, body: menu },
    '/orders/v2/ordersBulk': (url) => ({ status: 200, body: /page=1(&|$)/.test(url) ? ordenes : [] }),
    'sb.test/rest/v1/locations': { status: 200, body: [{ toast_restaurant_guid: GUID }] },
    'sb.test/rest/v1/toast_sales_days': { status: 201, body: [] },
    // Sin la migración 034, PostgREST no conoce las columnas nuevas.
    'sb.test/rest/v1/toast_sales': (url, op) => (!columnas && op && op.method === 'POST' && /"net"/.test(op.body || '')
      ? { status: 400, body: { code: 'PGRST204', message: "Could not find the 'mods_price' column of 'toast_sales' in the schema cache" } }
      : { status: 201, body: [] })
  });
  const insertadas = () => peticiones.filter(p => p.metodo === 'POST' && /\/toast_sales(\?|$)/.test(p.url.replace('https://sb.test/rest/v1', '')));

  entorno();
  require(path.join(RAIZ, 'lib/toast.js'))._olvidarCatalogo();
  respuestas = rutas();
  const r = await llamar({ accion: 'sync', params: { businessDate: '20261105', locationId: LOC } });
  const ins = insertadas();
  const cuerpo = ins.length ? JSON.parse(ins[ins.length - 1].cuerpo) : [];
  const de = (g, m) => cuerpo.find(x => x.toast_item_guid === g && x.mods === m);
  prueba('contesta bien', r.body && r.body.ok === true, JSON.stringify(r.body).slice(0, 200));
  prueba('el neto de la fila suma sus lineas (20 + 9)', de('l-tito', 'Double') && de('l-tito', 'Double').net === 29, JSON.stringify(de('l-tito', 'Double')));
  prueba('los modificadores aparte (4 + 4)', de('l-tito', 'Double') && de('l-tito', 'Double').mods_price === 8);
  prueba('sin modificadores con precio, 0', de('l-tito', '') && de('l-tito', '').mods_price === 0 && de('l-tito', '').net === 10);
  prueba('con su categoria de venta', de('l-tito', '').sales_category === 'Liquor' && de('w-sb', '').sales_category === 'Wine');
  prueba('una linea sin precio: neto null, no 0', de('w-x', '') && de('w-x', '').net === null, JSON.stringify(de('w-x', '')));
  prueba('y dice que guardo el dinero', r.body.dinero === true, JSON.stringify(r.body).slice(0, 200));

  // Sin la migración: no puede dejar de cargar las ventas, que alimentan
  // el LIVE. Guarda lo de siempre y dice que el dinero no entró.
  columnas = false;
  respuestas = rutas();
  const r2 = await llamar({ accion: 'sync', params: { businessDate: '20261105', locationId: LOC } });
  const ins2 = insertadas();
  const ult = ins2.length ? JSON.parse(ins2[ins2.length - 1].cuerpo) : [];
  prueba('sin la migracion 034, la carga sigue', r2.body.ok === true, JSON.stringify(r2.body).slice(0, 300));
  prueba('reintenta sin las columnas nuevas', ins2.length === 2 && ult.length === cuerpo.length && !('net' in ult[0]) && !('sales_category' in ult[0]), JSON.stringify(ult[0]));
  prueba('y lo dice, sin adivinar', r2.body.dinero === false && /034/.test(r2.body.aviso || ''), JSON.stringify(r2.body).slice(0, 300));
}

grupo('la sesion se comprueba una vez, antes de repartir');
{
  // Antes lo hacía cada integración por su cuenta, y con dos una se lo
  // podía saltar. Ahora la comprueba api/integrations.js y las de lib/
  // ni siquiera tienen con qué.
  const fs2 = require('fs');
  const api = fs2.readFileSync(path.join(RAIZ, 'api/integrations.js'), 'utf8');
  const i = api.indexOf('await sesion(req)'), j = api.indexOf('return h(req, res)');
  prueba('integrations la comprueba antes de repartir', i > 0 && j > i);
  for (const f of fs2.readdirSync(path.join(RAIZ, 'lib'))) {
    if (!/\.js$/.test(f) || f === 'integracion.js') continue;
    const src = fs2.readFileSync(path.join(RAIZ, 'lib', f), 'utf8');
    if (!/require\(['"]\.\/integracion['"]\)/.test(src)) continue;
    prueba(f + ' no valida sesiones por su cuenta', !/supabase-js|auth\.getUser/.test(src));
  }
}

grupo('liquor: los licores del menu, con su tipo, su medida y su marca');
{
  // Para emparejar cada licor de Toast con su botella. En Toast el licor
  // solo es la MARCA, y la medida la dice el grupo: "Grey Goose" en
  // DRINKS › Liquor › Vodka › UP/RX, "3oz Maker's Mark" en
  // Bourbon + Rye › 3oz (lo enseñó Drinks en el panel, 2026-11-10). Los
  // cócteles y lo de Happy Hour no entran: esos van por receta.
  entorno();
  const it = (guid, name) => ({ guid, name });
  const menu = { menus: [
    { name: 'DRINKS', menuGroups: [
      { name: 'Liquor', menuGroups: [
        { name: 'Vodka', menuGroups: [
          { name: 'UP/RX', menuItems: [it('l-gg-up', 'Grey Goose')] },
          { name: 'Single', menuItems: [it('l-gg-1', 'Grey Goose'), it('l-tito', 'Titos vodka')] },
          // Toast escribe "DBL" en el nombre del doble (visto en Crown).
          { name: 'Double', menuItems: [it('l-360d', '360 Chocolate Vodka DBL')] } ] },
        { name: 'Bourbon + Rye', menuGroups: [{ name: '3oz', menuItems: [it('l-mm3', "3oz Maker's Mark")] }] },
        { name: 'Gin', menuGroups: [{ name: 'Up/Rx', menuItems: [it('l-gin', 'Gin UP/RX')] }] } ] },
      { name: 'Cocktails', menuGroups: [{ name: 'Specialty Cocktails', menuItems: [it('c-boc', 'Blood Orange Cosmo')] }] },
      { name: 'Wine', menuGroups: [{ name: 'Whites By The Glass', menuItems: [it('w-sb', 'Sauv Blanc - Whitehaven')] }] } ] },
    { name: 'HAPPY HOUR', menuGroups: [{ name: 'HH Liquor', menuItems: [it('hh-gin', 'Gin'), it('hh-cos', 'HH Cosmopolitan')] }] } ] };
  const sel = (guid, q) => ({ item: { guid }, quantity: q, displayName: 'x', modifiers: [] });
  respuestas = {
    '/authentication/': LOGIN_OK,
    '/menus/v2/menus': { status: 200, body: menu },
    '/orders/v2/ordersBulk': (url) => ({ status: 200, body: /page=1(&|$)/.test(url) ? [
      { checks: [{ selections: [sel('l-gg-up', 2), sel('l-tito', 1), sel('c-boc', 4), sel('hh-gin', 3)] }] },
      { checks: [{ selections: [sel('l-gg-up', 1)] }] } ] : [] })
  };
  const r = await llamar({ accion: 'liquor', params: { businessDate: '20261110' } });
  const b = r.body || {};
  const a = {}; for (const x of b.articulos || []) a[x.guid] = x;
  prueba('contesta, con el restaurante', b.ok === true && b.accion === 'liquor' && b.restaurante === GUID, JSON.stringify({ ok: b.ok, e: b.error }));
  prueba('sólo los licores: ni cócteles, ni vino, ni Happy Hour',
    Object.keys(a).sort().join(',') === 'l-360d,l-gg-1,l-gg-up,l-gin,l-mm3,l-tito', Object.keys(a).join(','));
  prueba('el tipo y la medida salen del grupo', a['l-gg-up'] && a['l-gg-up'].tipo === 'Vodka' && a['l-gg-up'].medida === 'UP/RX' &&
    a['l-mm3'].tipo === 'Bourbon + Rye' && a['l-mm3'].medida === '3oz', JSON.stringify(a['l-gg-up']));
  prueba('la marca, sin la medida pegada al nombre', a['l-mm3'].marca === "Maker's Mark" && a['l-gin'].marca === 'Gin' && a['l-gg-1'].marca === 'Grey Goose',
    [a['l-mm3'].marca, a['l-gin'].marca].join(' | '));
  prueba('"DBL" pegado al nombre tampoco es parte de la marca', a['l-360d'] && a['l-360d'].marca === '360 Chocolate Vodka', a['l-360d'] && a['l-360d'].marca);
  prueba('y el grupo entero, para enseñarlo', a['l-gg-up'].grupo === 'DRINKS › Liquor › Vodka › UP/RX', a['l-gg-up'].grupo);
  prueba('lo vendido, sólo de los licores', b.vendido && b.vendido['l-gg-up'] === 3 && b.vendido['l-tito'] === 1 && !b.vendido['c-boc'] && !b.vendido['hh-gin'],
    JSON.stringify(b.vendido));

  const r2 = await llamar({ accion: 'liquor', params: { businessDate: '20261109', guids: ['l-gg-up'] } });
  prueba('con guids no vuelve a leer el menú', !peticiones.some(x => x.url.includes('/menus/')) && r2.body.vendido['l-gg-up'] === 3 && !r2.body.vendido['l-tito'],
    JSON.stringify(r2.body.vendido));
}

grupo('sales: el dinero vendido en un dia, por categoria de venta');
{
  // Axel, 2026-11-10: "lo que quiero saber es si somos capaces de traer
  // las ventas de licor del dia... numeros, dinero". Hasta aqui todo lo
  // de Toast contaba tragos; ni drinks ni sync llevaban importes.
  //
  // Toast manda el precio en cada linea de la orden. Se suman tres cosas
  // por separado y no una sola cifra, porque cual es "la venta" depende
  // de contra que informe de Toast se compare: antes de descuentos
  // (preDiscountPrice), despues (price) y el impuesto (tax). Y los
  // modificadores con precio (un doble, un upcharge) aparte, sin
  // sumarlos a ciegas: si Toast ya los incluye en la linea, sumarlos
  // otra vez los doblaria.
  entorno();
  const CAT = { liquor: 'cat-liq', wine: 'cat-wine', food: 'cat-food' };
  const sel = (nombre, cat, q, plata, mods, extra) => Object.assign({
    displayName: nombre, item: { guid: 'it-' + nombre }, quantity: q,
    salesCategory: { guid: cat }, modifiers: mods || []
  }, plata || {}, extra || {});
  const mod = (nombre, precio) => ({ displayName: nombre, item: { guid: 'm-' + nombre }, quantity: 1, price: precio, modifiers: [] });
  const orden = (sels, extra) => Object.assign({ checks: [{ selections: sels }] }, extra || {});
  const dia = [
    orden([sel("Tito's", CAT.liquor, 2, { preDiscountPrice: 24, price: 24, tax: 2.13 }, [mod('Double', 6)])]),
    orden([sel('Don Julio', CAT.liquor, 1, { preDiscountPrice: 16, price: 12, tax: 1.07 })]),      // con descuento
    orden([sel('Pinot Grigio', CAT.wine, 1, { preDiscountPrice: 11, price: 11, tax: 0.98 })]),
    orden([sel('Burger', CAT.food, 1, { preDiscountPrice: 18, price: 18, tax: 1.6 })]),
    // Anuladas, a los tres niveles: no cuentan.
    orden([sel("Tito's", CAT.liquor, 9, { preDiscountPrice: 999, price: 999, tax: 99 })], { voided: true }),
    { checks: [{ voided: true, selections: [sel("Tito's", CAT.liquor, 9, { preDiscountPrice: 999, price: 999, tax: 99 })] }] },
    orden([sel("Tito's", CAT.liquor, 9, { preDiscountPrice: 999, price: 999, tax: 99 }, [], { voided: true })]),
    // Una linea sin precio: se cuenta como tal, no como cero vendido.
    orden([sel('Mystery', CAT.liquor, 1, {})]),
    // Texto libre con precio: suma, pero su texto no sale.
    orden([{ displayName: 'Botella para Juan Perez', quantity: 1, salesCategory: { guid: CAT.liquor },
             preDiscountPrice: 100, price: 100, tax: 8.88, modifiers: [] }])
  ];
  respuestas = {
    '/authentication/': LOGIN_OK,
    '/config/v2/salesCategories': { status: 200, body: [{ guid: CAT.liquor, name: 'Liquor' }, { guid: CAT.wine, name: 'Wine' }, { guid: CAT.food, name: 'Food' }] },
    '/orders/v2/ordersBulk': (url) => ({ status: 200, body: /page=1(&|$)/.test(url) ? dia : [] })
  };
  const r = await llamar({ accion: 'sales', params: { businessDate: '20261110' } });
  const b = r.body || {};
  prueba('contesta, con el dia que se pidio', b.ok === true && b.accion === 'sales' && b.businessDate === '20261110', JSON.stringify({ ok: b.ok, d: b.businessDate }));
  const liq = (b.porCategoria || []).find(c => c.categoria === 'Liquor') || {};
  prueba('licor: antes de descuentos, 24 + 16 + 100', liq.bruto === 140, liq.bruto);
  prueba('licor: despues de descuentos, 24 + 12 + 100', liq.neto === 136, liq.neto);
  prueba('y lo descontado, la diferencia', liq.descuentos === 4, liq.descuentos);
  prueba('el impuesto aparte', liq.impuesto === 12.08, liq.impuesto);
  prueba('los modificadores con precio, aparte y sin sumarlos a la venta', liq.modificadores === 6 && liq.neto === 136, liq.modificadores);
  prueba('lo anulado no cuenta, a ningun nivel', liq.neto < 900);
  prueba('las unidades tambien: 2 + 1 + 1 + 1', liq.unidades === 5, liq.unidades);
  prueba('una linea sin precio se dice, no se da por cero', liq.sinPrecio === 1, liq.sinPrecio);
  const food = (b.porCategoria || []).find(c => c.categoria === 'Food') || {};
  prueba('todas las categorias, no solo bebida: la comida tambien', food.neto === 18, food.neto);
  prueba('ordenadas por dinero, lo que mas vendio primero', (b.porCategoria || [])[0].categoria === 'Liquor', (b.porCategoria || []).map(c => c.categoria).join(','));
  prueba('y un total del dia', !!b.total && b.total.neto === 136 + 11 + 18 && b.total.bruto === 140 + 11 + 18, JSON.stringify(b.total));
  prueba('dice si el dia sigue abierto', typeof b.cerrado === 'boolean');
  const todo = JSON.stringify(b);
  prueba('sin texto libre: ni nombres de articulos ni de clientes', !/Juan Perez|Tito|Don Julio|Burger/.test(todo), todo.slice(0, 200));
  prueba('ni el token', !todo.includes(TOKEN_TOAST));

  const solo = await llamar({ accion: 'sales', params: { businessDate: '20261110', categoria: 'liquor' } });
  prueba('se puede pedir una sola categoria', (solo.body.porCategoria || []).length === 1 && solo.body.porCategoria[0].categoria === 'Liquor' &&
    solo.body.total.neto === 136, JSON.stringify((solo.body.porCategoria || []).map(c => c.categoria)));
}
{
  // Si las categorias no se pueden leer, no se inventa a que pertenece
  // cada venta: se dice, y el dinero sale junto, sin repartir.
  entorno();
  respuestas = {
    '/authentication/': LOGIN_OK,
    '/config/v2/salesCategories': { status: 500, body: { message: 'boom' } },
    '/orders/v2/ordersBulk': (url) => ({ status: 200, body: /page=1(&|$)/.test(url)
      ? [{ checks: [{ selections: [{ displayName: 'X', item: { guid: 'g' }, quantity: 1, salesCategory: { guid: 'c1' }, preDiscountPrice: 10, price: 10, tax: 1 }] }] }] : [] })
  };
  const r = await llamar({ accion: 'sales' });
  prueba('sin categorias: lo dice', /no se pudieron leer/.test(String(r.body.categoriasDeVenta)), String(r.body.categoriasDeVenta));
  prueba('y no reparte el dinero en categorias que no conoce', (r.body.porCategoria || []).length === 1 && r.body.porCategoria[0].categoria === '(no sales category)');
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
