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
  const r = typeof r0 === 'function' ? r0(url) : r0;
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
  for (const a of ['ping', 'restaurant', 'menu', 'orders', 'drinks']) {
    await llamar({ accion: a });
    for (const p of peticiones) metodos.push(p.metodo + ' ' + p.url.replace(/https:\/\/[^/]+/, ''));
    prueba(a + ': a Supabase solo le valida la sesion', sbLlamadas.length === 0, sbLlamadas.join(','));
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

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
