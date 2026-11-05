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
 *  12. Los campos personalizados (del evento y de su reserva) se ven
 *      por nombre, con sus valores sólo si son pocos y cortos, y nunca
 *      los de un campo que por su nombre es de una persona.
 *  13. El detalle de UN evento busca dentro las listas de productos
 *      cobrados (el "Silver Open Bar" de la hoja de cocina) y dice dónde
 *      están y cómo se llaman, sin sacar al cliente.
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
  for (const a of ['ping', 'locations', 'events', 'bookings', 'search', 'menu', 'detalle']) {
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

grupo('los campos personalizados, del evento y de la reserva');
{
  entorno();
  const cf = (n, v) => ({ custom_field_id: 1, custom_field_name: n, custom_field_slug: 'x', id: 9, value: v });
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/events/search.json': { status: 200, body: { results: [
    { event: { id: 1, custom_fields: [cf('Deposit Due Date', ''), cf('Bar Package', 'Open Bar 3 hrs')],
      booking: { custom_fields: [cf('Market', 'Corporate'), cf('On-site Contact Name', 'Maria Lopez')] },
      category_totals: [{ name: 'Food', total: '100.0' }, { name: 'Beverage', total: '50.0' }] } },
    { event: { id: 2, custom_fields: [cf('Deposit Due Date', ''), cf('Bar Package', 'Beer & Wine')],
      booking: { custom_fields: [cf('Market', 'Social'), cf('Notes for bar', 'Please call Jim at 555-0199 before the event, he will bring his own wine')] },
      category_totals: [{ name: 'Food', total: '80.0' }] } },
    { event: { id: 3, custom_fields: [], booking: {} } }
  ] } } };
  const r = await llamar({ accion: 'search' });
  const p = r.body.personalizados || {};
  const ev = p.evento || {}, re = p.reserva || {};
  prueba('los del evento, por nombre y cuantas veces', ev['Bar Package'] && ev['Bar Package'].veces === 2, JSON.stringify(ev));
  prueba('con sus valores si son pocos y cortos', ev['Bar Package'] && ev['Bar Package'].valores &&
    ev['Bar Package'].valores['Open Bar 3 hrs'] === 1 && ev['Bar Package'].valores['Beer & Wine'] === 1, JSON.stringify(ev['Bar Package']));
  prueba('un valor vacio se cuenta como vacio', ev['Deposit Due Date'] && ev['Deposit Due Date'].valores['(vacio)'] === 2,
    JSON.stringify(ev['Deposit Due Date']));
  prueba('los de la reserva, aparte', re.Market && re.Market.valores.Corporate === 1, JSON.stringify(re));
  const txt = JSON.stringify(p);
  prueba('un campo de una persona nunca dice sus valores', !/Maria Lopez/.test(txt) && re['On-site Contact Name'] &&
    /texto libre/.test(re['On-site Contact Name'].valores), txt);
  prueba('ni un valor largo', !/Jim|555-0199/.test(txt), txt);
  prueba('y las categorias de dinero, por nombre', p.categorias && p.categorias.Food === 2 && p.categorias.Beverage === 1,
    JSON.stringify(p.categorias));
}

grupo('los eventos con bebida, para probar su menu');
{
  entorno();
  const bev = (t) => [{ name: 'Food', total: '100.0' }, { name: 'Beverage', total: t }];
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/events/search.json': { status: 200, body: { results: [
    { event: { id: 11, status: 'DEFINITE', category_totals: [{ name: 'Food', total: '90.0' }] } },
    { event: { id: 12, status: 'LOST', category_totals: bev('300.0') } },
    { event: { id: 13, status: 'DEFINITE', category_totals: bev('0.0') } },
    { event: { id: 14, status: 'DEFINITE', category_totals: bev('450.0') } },
    { event: { id: 15, status: 'PROSPECT', category_totals: bev('120.0') } }
  ] } } };
  const r = await llamar({ accion: 'search' });
  const ids = r.body.eventosConBebida || [];
  prueba('solo los que tienen Beverage por encima de cero', ids.length === 3 && !ids.includes(11) && !ids.includes(13), JSON.stringify(ids));
  prueba('los confirmados primero', ids[0] === 14, JSON.stringify(ids));
}

grupo('el detalle de un evento, con sus productos cobrados');
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK };
  const r = await llamar({ accion: 'detalle' });
  prueba('sin evento, lo dice y no llama a nadie', r.body.ok === false && /event_id/.test(r.body.error) && peticiones.length === 0,
    JSON.stringify(r.body));
}
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/events/58038602.json': { status: 200, body: { event: {
    id: 58038602, status: 'DEFINITE', guest_count: 31, description: 'Call Janice at 484-000-0000',
    contact: { first_name: 'Janice', email_addresses: [{ address: 'jan@cliente.test' }] },
    financial: { categories: [
      { name: 'Food', items: [{ name: 'Passed Hors d Oeuvres', quantity: 31, price: '12.0' }] },
      { name: 'Beverage', items: [
        { name: 'Silver Open Bar', quantity: 31, price: '30.0', unit: 'per person' },
        { name: 'CONSUMPTION BAR ( after 8pm)', quantity: 1, price: '0.0' }] }
    ] },
    secondary_contacts: [{ first_name: 'Otro', last_name: 'Cliente', phone: '555' }]
  } } } };
  const r = await llamar({ accion: 'detalle', params: { event_id: 58038602 } });
  const u = (peticiones[1] || {}).url || '';
  prueba('pide el evento con su parte financiera', /\/v1\/events\/58038602\.json\?show_financial=true/.test(u), u);
  const l = r.body.lineas || [];
  const nombres = l.flatMap(x => x.nombres ? Object.keys(x.nombres) : []);
  prueba('encuentra los productos, en el sitio que esten', nombres.includes('Silver Open Bar') && nombres.includes('Passed Hors d Oeuvres'),
    JSON.stringify(l));
  prueba('y dice donde', l.some(x => /financial\.categories\[\]\.items/.test(x.ruta)), JSON.stringify(l.map(x => x.ruta)));
  prueba('con la categoria de encima', l.some(x => x.categoria === 'Beverage' && x.nombres && x.nombres['Silver Open Bar'] === 1),
    JSON.stringify(l));
  const txt = JSON.stringify(Object.assign({}, r.body, { crudo: undefined, muestra: undefined }));
  prueba('sin el cliente', !/Janice|jan@cliente|484-000|Otro|Cliente"/.test(txt), txt.slice(0, 400));
  prueba('y con la forma del evento entero', r.body.forma && r.body.forma.financial, JSON.stringify(r.body.forma));
}

grupo('las lineas de un documento, se llamen como se llamen sus campos');
{
  entorno();
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/events/58038602.json': { status: 200, body: { event: {
    id: 58038602, category_totals: [{ name: 'Food', total: '310.0' }],
    documents: [{ id: 37734321, title: 'Contract & Event Order', line_items: [
      { description: 'Silver Open Bar', category_name: 'Beverage', qty: 31, unit: 'per person' },
      { description: 'CONSUMPTION BAR ( after 8pm)', category_name: 'Beverage' },
      { item_name: 'Passed Hor D Oeuvres', category: 'Food', amount: '0.0' },
      { description: 'hand crafted brews | house wine | house liquor highballs & Up Drinks | soft drinks | coffee', category_name: 'Beverage' }
    ] }]
  } } } };
  const r = await llamar({ accion: 'detalle', params: { event_id: 58038602 } });
  const l = r.body.lineas || [];
  const de = l.filter(x => /documents\[\]\.line_items/.test(x.ruta));
  const bev = de.find(x => x.categoria === 'Beverage') || {};
  prueba('encuentra las lineas del documento', de.length > 0, JSON.stringify(l));
  prueba('con su categoria, aunque se llame category_name', bev.nombres && bev.nombres['Silver Open Bar'] === 1 &&
    bev.nombres['CONSUMPTION BAR ( after 8pm)'] === 1, JSON.stringify(bev));
  prueba('o category a secas', de.some(x => x.categoria === 'Food' && x.nombres && x.nombres['Passed Hor D Oeuvres'] === 1),
    JSON.stringify(de));
  prueba('una descripcion larga se cuenta sin enseñarse', bev.nombres && bev.nombres['(texto largo)'] === 1 &&
    !/hand crafted/.test(JSON.stringify(l)), JSON.stringify(bev));
  prueba('y dice como se llaman los campos de las lineas', bev.claves && ['category_name', 'description', 'qty', 'unit'].every(k => bev.claves.includes(k)),
    JSON.stringify(bev.claves));
}

grupo('las lineas de verdad: display_name, y sus cifras');
{
  entorno();
  const li = (o) => Object.assign({ billing_ids: [], discount: null, grand_total: null, id: 1, long_description: 'x',
    menu_item_id: 9, position: 1, section: 'Beverage', section_position: 1 }, o);
  respuestas = { '/oauth2/token': LOGIN_OK, '/v1/events/58038602.json': { status: 200, body: { event: {
    id: 58038602, documents: [{ id: 37734321, title: 'Contract & Event Order', line_items: [
      li({ display_name: 'Silver Open Bar', description: 'Silver Open Barhand crafted brews | house wine | house liquor highballs & Up Drinks',
           category: 'Beverage', quantity: 31, price: '30.0', total_price: '930.0' }),
      li({ display_name: 'CONSUMPTION BAR ( after 8pm)', description: 'CONSUMPTION BAR ( after 8pm)Charges are based on precise guest consumption',
           category: 'Beverage', quantity: 1, price: '0.0', total_price: '0.0' })
    ] }]
  } } } };
  const r = await llamar({ accion: 'detalle', params: { event_id: 58038602 } });
  const bev = (r.body.lineas || []).find(x => x.categoria === 'Beverage') || {};
  prueba('el nombre sale de display_name', bev.nombres && bev.nombres['Silver Open Bar'] === 1 &&
    bev.nombres['CONSUMPTION BAR ( after 8pm)'] === 1, JSON.stringify(bev.nombres));
  const silver = (bev.items || []).find(x => x.nombre === 'Silver Open Bar') || {};
  prueba('con cuantos, a cuanto y el total', silver.cantidad === 31 && silver.precio === '30.0' && silver.total === '930.0',
    JSON.stringify(bev.items));
  prueba('y su seccion', silver.seccion === 'Beverage', JSON.stringify(silver));
  prueba('sin la descripcion larga', !/hand crafted|precise guest/.test(JSON.stringify(r.body.lineas)));
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
