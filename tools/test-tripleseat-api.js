#!/usr/bin/env node
/*
 * ── TripleSeat: api/integrations.js?provider=tripleseat → lib/tripleseat.js
 *
 * La función lleva la credencial de TripleSeat y devuelve eventos de los
 * restaurantes. Lo que se protege aquí:
 *
 *   1. Sin sesión de la app no se llega a TripleSeat. Ni una petición.
 *   2. El secret y el token NUNCA salen en la respuesta.
 *   3. El login va como lo pide TripleSeat: client_credentials, en un
 *      formulario.
 *   4. Prueba las rutas candidatas en orden y dice qué contestó cada
 *      una, en vez de fallar con un 404 sin explicación.
 *   5. Lo que llega del navegador no se pega a la URL sin mirarlo.
 *   6. Sólo lee: un POST para el token y lo demás son GET.
 *   7. Lo que viene alrededor de la lista (cuántas páginas hay) no se
 *      pierde: la primera página de eventos resultó ser de 2021, y sin
 *      saber cuántas hay no se llega a las de ahora.
 *   8. Lo anidado se enseña por sus NOMBRES, nunca por sus valores: ahí
 *      dentro van el contacto del cliente y, si existe, el menú.
 *   9. La búsqueda por fechas sólo deja pasar fechas, y el menú de un
 *      evento sólo un id de cifras: van dentro de la URL.
 *  10. El texto libre no sale en el resumen. `resumir` enseña cada valor
 *      si hay 40 o menos distintos, y con 50 eventos la descripción
 *      tenía ~35: salió entera, con nombres de clientes y lo que
 *      escribieron, en algo que se dijo que se podía mandar tal cual.
 *  11. El tipo de bar sale de la línea `Drinks:` que escribe el
 *      planificador online, y SÓLO de ésa: un cliente que escribe
 *      "Drinks:" en su mensaje no cuenta como paquete.
 *
 *   node tools/test-tripleseat-api.js
 */

const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const rutaSb = require.resolve('@supabase/supabase-js', { paths: [RAIZ] });
require.cache[rutaSb] = {
  id: rutaSb, filename: rutaSb, loaded: true,
  exports: {
    createClient: () => ({
      auth: {
        getUser: async (t) => (t === 'sesion-buena'
          ? { data: { user: { id: 'u1' } }, error: null }
          : { data: {}, error: { message: 'bad' } })
      }
    })
  }
};

const handler = require(path.join(RAIZ, 'api/integrations.js'));

const SECRETO = 'ts-secreto-no-se-dice-77aa';
const TOKEN_TS = 'ut5-token-de-prueba-xyz';

function entorno(cambios) {
  for (const k of Object.keys(process.env)) if (/^TRIPLESEAT_|^SUPABASE_/.test(k)) delete process.env[k];
  Object.assign(process.env, {
    SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'srv',
    TRIPLESEAT_CLIENT_ID: 'uid-1', TRIPLESEAT_CLIENT_SECRET: SECRETO
  }, cambios || {});
  for (const [k, v] of Object.entries(cambios || {})) if (v === undefined) delete process.env[k];
}

let peticiones = [];
let respuestas = {};
global.fetch = async (u, op) => {
  peticiones.push({ url: u, metodo: (op && op.method) || 'GET', cabeceras: (op && op.headers) || {}, cuerpo: op && op.body });
  const clave = Object.keys(respuestas).find(k => u.includes(k));
  const r = clave ? respuestas[clave] : { status: 404, body: { error: 'not found' } };
  const h = r.headers || {};
  return { ok: r.status < 400, status: r.status, text: async () => JSON.stringify(r.body),
    headers: { get: (k) => (Object.prototype.hasOwnProperty.call(h, k.toLowerCase()) ? h[k.toLowerCase()] : null) } };
};

const LOGIN_OK = { status: 200, body: { access_token: TOKEN_TS, token_type: 'Bearer', expires_in: 7200,
  scope: 'bookings:read events:read locations:read' } };

async function llamar(o) {
  o = o || {};
  peticiones = [];
  const res = {
    code: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; }
  };
  await handler({
    query: { provider: 'tripleseat' },
    method: o.metodo || 'POST',
    headers: { authorization: o.token === undefined ? 'Bearer sesion-buena' : o.token },
    body: { action: o.accion, params: o.params }
  }, res);
  return res;
}

(async () => {

grupo('sin sesion de la app, no se llega a TripleSeat');
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK };
  let r = await llamar({ accion: 'ping', token: '' });
  prueba('sin token, 401', r.code === 401, String(r.code));
  prueba('y ninguna peticion', peticiones.length === 0, String(peticiones.length));
  r = await llamar({ accion: 'ping', token: 'Bearer sesion-mala' });
  prueba('con una sesion que no vale, 401', r.code === 401 && peticiones.length === 0);
  r = await llamar({ metodo: 'GET', accion: 'ping' });
  prueba('un GET no entra', r.code === 405, String(r.code));
}

grupo('si falta una variable, dice cual, y nunca un valor');
{
  entorno({ TRIPLESEAT_CLIENT_ID: undefined });
  const r = await llamar({ accion: 'ping' });
  const txt = JSON.stringify(r.body);
  prueba('no sigue', r.body.ok === false && /TRIPLESEAT_CLIENT_ID/.test(r.body.error), r.body.error);
  prueba('sin el secret', !txt.includes(SECRETO));
  prueba('y sin llamar a TripleSeat', peticiones.length === 0);
}

grupo('el login va como lo pide TripleSeat');
{
  entorno({ TRIPLESEAT_CLIENT_ID: ' uid-1\n' });
  respuestas = { '/oauth2/token': LOGIN_OK };
  const r = await llamar({ accion: 'ping' });
  const p = peticiones[0] || {};
  prueba('a la ruta del token', p.url === 'https://api.tripleseat.com/oauth2/token', p.url);
  prueba('por POST, en formulario', p.metodo === 'POST' &&
    /x-www-form-urlencoded/.test(p.cabeceras['Content-Type'] || ''));
  const f = new URLSearchParams(p.cuerpo || '');
  prueba('sin pagina: client_credentials', f.get('grant_type') === 'client_credentials');
  prueba('con el id limpio de espacios', f.get('client_id') === 'uid-1', JSON.stringify(f.get('client_id')));
  prueba('dice que funciono y con que permisos', r.body.ok === true && /events:read/.test(r.body.permisos));
  const txt = JSON.stringify(r.body);
  prueba('el token NO sale de la funcion', !txt.includes(TOKEN_TS));
  prueba('ni el secret', !txt.includes(SECRETO));
}
{
  entorno();
  respuestas = { '/oauth2/token': { status: 400, body: { error: 'invalid_scope', error_description: 'Your submitted scope(s) do not match' } } };
  const r = await llamar({ accion: 'ping' });
  const txt = JSON.stringify(r.body);
  prueba('si TripleSeat dice que no, se dice tal cual', r.body.ok === false && /invalid_scope/.test(txt));
  prueba('con como es la credencial, sin ensenarla', r.body.tripleseat.revision.TRIPLESEAT_CLIENT_SECRET.largo === SECRETO.length);
  prueba('sin el secret', !txt.includes(SECRETO));
}

grupo('prueba las rutas candidatas y dice cual contesto');
{
  entorno();
  respuestas = {
    '/oauth2/token': LOGIN_OK,
    '/v1/locations.json': { status: 404, body: { error: 'nope' } },
    '/v1/sites.json': { status: 200, body: [{ site: { id: 7, name: 'Crown' } }, { site: { id: 8, name: 'Jockey' } }] }
  };
  const r = await llamar({ accion: 'locations' });
  prueba('salta la que da 404', r.body.intentos[0].status === 404, JSON.stringify(r.body.intentos));
  prueba('y se queda con la que contesta', r.body.ok === true && r.body.ruta === '/v1/sites.json', r.body.ruta);
  prueba('desenvuelve cada registro', r.body.registros === 2 && /"name":"Crown"/.test(r.body.muestra), r.body.muestra);
  const p = peticiones[1] || { cabeceras: {} };
  prueba('con el token como Bearer', p.cabeceras.Authorization === 'Bearer ' + TOKEN_TS);
  prueba('sin devolver el token', !JSON.stringify(r.body).includes(TOKEN_TS));
}
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK };
  const r = await llamar({ accion: 'events' });
  prueba('si ninguna contesta, lo dice con lo que contesto cada una',
    r.body.ok === false && r.body.intentos.length === 1 && r.body.intentos[0].status === 404, JSON.stringify(r.body));
}
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/events.json': { status: 200, body: { events: [
    { event: { id: 1, name: 'Holiday party', guest_count: 33, status: 'DEFINITE' } },
    { event: { id: 2, name: 'Rehearsal', guest_count: 20, status: 'TENTATIVE' } }
  ] } } };
  const r = await llamar({ accion: 'events', params: { site_id: 7 } });
  prueba('saca la lista aunque venga envuelta', r.body.registros === 2, String(r.body.registros));
  prueba('y dice que valores toma cada campo', r.body.campos.status && r.body.campos.status.DEFINITE === 1,
    JSON.stringify(r.body.campos));
  prueba('pasa el sitio que se le pide', /site_id=7/.test((peticiones[1] || {}).url || ''));
}

grupo('lo que llega del navegador no se pega a la URL sin mirarlo');
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/events.json': { status: 200, body: [] } };
  await llamar({ accion: 'events', params: { site_id: '7&delete=1', otra: 'x', page: '2' } });
  const u = (peticiones[1] || {}).url || '';
  prueba('un parametro raro no entra', !/delete|otra/.test(u), u);
  prueba('pero uno bueno si', /page=2/.test(u), u);
}

grupo('solo lee');
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/': { status: 200, body: [] } };
  const metodos = [];
  for (const a of ['ping', 'locations', 'events', 'bookings', 'search', 'menu']) {
    await llamar({ accion: a, params: { event_id: 5, event_start_date: '2026-11-05' } });
    for (const p of peticiones) metodos.push(p.metodo + ' ' + p.url.replace('https://api.tripleseat.com', ''));
  }
  const escribe = metodos.filter(m => !m.startsWith('GET ') && m !== 'POST /oauth2/token');
  prueba('nada que no sea leer o el token', escribe.length === 0, escribe.join(' | '));
  const r = await llamar({ accion: 'borrar' });
  prueba('una accion que no existe no hace nada', r.code === 400 && peticiones.length === 0);
}

grupo('buscar eventos por fecha');
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/events/search.json': { status: 200, body: { results: [{ event: { id: 9 } }] } } };
  const r = await llamar({ accion: 'search', params: {
    event_start_date: '2026-11-05', event_end_date: '11/19/2026', sort_direction: 'asc', order: 'event_start', location_id: 15361 } });
  const u = (peticiones[1] || {}).url || '';
  prueba('va a la ruta de busqueda', /\/v1\/events\/search\.json\?/.test(u), u);
  prueba('con las fechas', /event_start_date=2026-11-05/.test(u) && /event_end_date=11%2F19%2F2026/.test(u), u);
  prueba('con el orden', /sort_direction=asc/.test(u) && /order=event_start/.test(u), u);
  prueba('y el restaurante', /location_id=15361/.test(u), u);
  prueba('y saca la lista', r.body.ok === true && r.body.registros === 1, JSON.stringify(r.body));
}
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/events/search.json': { status: 200, body: [] } };
  await llamar({ accion: 'search', params: {
    event_start_date: '2026-11-05&delete=1', event_end_date: 'mañana', sort_direction: 'asc;drop', order: 'x&y=1' } });
  const u = (peticiones[1] || {}).url || '';
  prueba('una fecha que no es fecha no pasa', !/event_start_date|event_end_date|delete/.test(u), u);
  prueba('ni un orden raro', !/sort_direction|order=/.test(u), u);
}

grupo('lo elegido del menu de un evento');
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK };
  const r = await llamar({ accion: 'menu' });
  prueba('sin evento, lo dice y no llama a nadie', r.body.ok === false && /event_id/.test(r.body.error) && peticiones.length === 0,
    JSON.stringify(r.body));
  await llamar({ accion: 'menu', params: { event_id: '5/../../users' } });
  prueba('un id que no es de cifras tampoco pasa', peticiones.length === 0, String(peticiones.length));
}
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK,
    '/v1/events/77/menu_item_selections.json': { status: 404, body: { error: 'nope' } },
    '/v1/menu_item_selections.json': { status: 200, body: [{ menu_item_selection: { id: 1, name: 'Open Bar 3 hrs', quantity: 40 } }] } };
  const r = await llamar({ accion: 'menu', params: { event_id: 77 } });
  prueba('el id va dentro de la primera ruta', /\/v1\/events\/77\/menu_item_selections\.json/.test((peticiones[1] || {}).url || ''),
    (peticiones[1] || {}).url);
  prueba('y como parametro en la segunda', /menu_item_selections\.json\?event_id=77/.test((peticiones[2] || {}).url || ''),
    (peticiones[2] || {}).url);
  prueba('y se queda con la que contesta', r.body.ok === true && r.body.registros === 1 && /Open Bar/.test(r.body.muestra),
    JSON.stringify(r.body));
}

grupo('el texto libre no sale en el resumen');
{
  entorno();
  const largo = 'Date: 2026-11-07\r\nDrinks: Consumption bar\r\nGuest notes: Hi, thanks. Colleen, call me at 555-0101 please';
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/events/search.json': { status: 200, body: { results: [
    { event: { id: 1, name: 'Ortega Birthday Party', post_as: 'Ortega Birthday Party', description: 'Nut allergies',
               lost_reason_details: 'never got back to me', status: 'DEFINITE', event_type: 'Dinner', notas: largo } },
    { event: { id: 2, name: 'Bridal Shower', post_as: 'Bridal Shower', description: '', status: 'LOST', event_type: 'Dinner', notas: 'corto' } }
  ] } } };
  const r = await llamar({ accion: 'search', params: {} });
  const c = r.body.campos || {};
  const txt = JSON.stringify(c);
  prueba('ni el nombre del evento', !/Ortega|Bridal/.test(txt), txt);
  prueba('ni la descripcion', !/Nut allergies/.test(txt), txt);
  prueba('ni el motivo de perdida', !/never got back/.test(txt), txt);
  prueba('ni un texto largo de un campo cualquiera', !/Colleen|555-0101/.test(txt), txt);
  prueba('dice cuantos valores tiene, como el resto del texto libre',
    c.description === '2 valores distintos (texto libre)' && c.name === '2 valores distintos (texto libre)', JSON.stringify(c.description));
  prueba('lo demas sigue saliendo con sus valores', c.status && c.status.DEFINITE === 1 && c.event_type && c.event_type.Dinner === 2,
    JSON.stringify(c.status));
}
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/locations.json': { status: 200, body: [
    { location: { id: 15361, name: ' The Crown Tavern - Concord' } }] } };
  const r = await llamar({ accion: 'locations' });
  prueba('el nombre de un restaurante si sale: no es de un cliente',
    r.body.campos && r.body.campos.name && r.body.campos.name[' The Crown Tavern - Concord'] === 1, JSON.stringify(r.body.campos));
}

grupo('el tipo de bar, de la linea Drinks del planificador');
{
  entorno();
  const plan = (drinks) => 'Date: 2026-11-07, 12:00 to 14:00\r\nGuests: 30\r\nRoom: The Saratoga Room\r\n' +
    (drinks ? 'Drinks: ' + drinks + '\r\n' : '') + 'Guest\'s notes: Colleen here, call me\r\n\r\nOnline planner ref: abc-123';
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/events/search.json': { status: 200, body: { results: [
    { event: { id: 1, status: 'DEFINITE', description: plan('Consumption bar; Non-Alcoholic Beverage Package') } },
    { event: { id: 2, status: 'DEFINITE', description: plan('Open bar 3 hours') } },
    { event: { id: 3, status: 'LOST', description: plan('Consumption bar') } },
    { event: { id: 4, status: 'DEFINITE', description: plan(null) } },
    { event: { id: 5, status: 'DEFINITE', description: 'Hi! Drinks: we want an open bar for my sister Maria' } },
    { event: { id: 6, status: 'DEFINITE', description: '' } },
    { event: { id: 7, status: 'DEFINITE', description: plan('A package name that a person could have typed by hand and is way too long to be a package') } }
  ] } } };
  const r = await llamar({ accion: 'search' });
  const b = r.body.bebidas || {};
  prueba('cuenta cada paquete', b.paquetes && b.paquetes['Consumption bar'] === 2 &&
    b.paquetes['Non-Alcoholic Beverage Package'] === 1 && b.paquetes['Open bar 3 hours'] === 1, JSON.stringify(b));
  prueba('y tambien solo los confirmados', b.confirmados && b.confirmados['Consumption bar'] === 1 &&
    !('Consumption bar' in b) , JSON.stringify(b.confirmados));
  prueba('cuantos eventos traen la linea y cuantos no', b.conLinea === 4 && b.delPlanificadorSinLinea === 1 && b.sinPlanificador === 2,
    JSON.stringify(b));
  const txt = JSON.stringify(b);
  prueba('lo que escribe un cliente no cuenta', !/Maria|sister/.test(txt), txt);
  prueba('ni el resto de la descripcion', !/Colleen|Saratoga|abc-123/.test(txt), txt);
  prueba('un paquete demasiado largo no se enseña', !/typed by hand/.test(txt) && (b.paquetes || {})['(texto largo)'] === 1, txt);
}
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/locations.json': { status: 200, body: [{ location: { id: 1, name: 'X' } }] } };
  const r = await llamar({ accion: 'locations' });
  prueba('en locations no hay resumen de bar', r.body.bebidas === undefined, JSON.stringify(r.body.bebidas));
}

grupo('lo que viene alrededor de la lista no se pierde');
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/events.json': { status: 200,
    headers: { 'x-total-pages': '12', 'link': '<https://api.tripleseat.com/v1/events.json?page=12>; rel="last"', 'set-cookie': 'sesion=ojo' },
    body: { events: [{ event: { id: 1 } }], total_pages: 12, current_page: 1, filtro: { desde: 'x' } } } };
  const r = await llamar({ accion: 'events' });
  prueba('los datos sueltos del envoltorio', r.body.envoltorio && r.body.envoltorio.total_pages === 12 &&
    r.body.envoltorio.current_page === 1, JSON.stringify(r.body.envoltorio));
  prueba('un objeto del envoltorio, sólo por sus nombres', r.body.envoltorio &&
    JSON.stringify(r.body.envoltorio.filtro) === '["desde"]', JSON.stringify(r.body.envoltorio));
  prueba('las cabeceras de paginacion', r.body.cabeceras && r.body.cabeceras['x-total-pages'] === '12' &&
    /rel="last"/.test(r.body.cabeceras.link || ''), JSON.stringify(r.body.cabeceras));
  prueba('y ninguna otra cabecera', !JSON.stringify(r.body).includes('sesion=ojo'));
}

grupo('lo anidado, por sus nombres y nunca por sus valores');
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/events.json': { status: 200, body: { events: [
    { event: { id: 1, contact: { first_name: 'Anabela', email: 'ana@cliente.test' },
               rooms: [{ id: 3, name: 'Wine Cellar' }], menu: { items: [{ name: 'Bud' }] } } },
    { event: { id: 2, contact: { first_name: 'Rober', phone: '555' }, rooms: [] } }
  ] } } };
  const r = await llamar({ accion: 'events' });
  const f = r.body.forma || {};
  prueba('cada campo anidado, con cuantas veces viene', f.contact && f.contact.veces === 2 && f.contact.tipo === 'objeto',
    JSON.stringify(f));
  prueba('con la union de sus nombres', f.contact && ['email', 'first_name', 'phone'].every(k => f.contact.claves.includes(k)),
    JSON.stringify(f.contact));
  prueba('una lista dice los nombres de lo que lleva dentro', f.rooms && f.rooms.tipo === 'lista' &&
    f.rooms.claves.includes('name'), JSON.stringify(f.rooms));
  prueba('y marca lo que vuelve a anidar', f.menu && f.menu.claves.includes('items[]'), JSON.stringify(f.menu));
  const txt = JSON.stringify(f);
  prueba('sin un solo valor', !/Anabela|ana@cliente|Rober|555|Wine Cellar|Bud/.test(txt), txt);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
