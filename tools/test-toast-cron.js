#!/usr/bin/env node
/*
 * ── Toast · la carga diaria (lib/toast-cron.js) ──────────────────────
 *
 * Axel, 2026-11-11, opción A: cada madrugada Vercel llama a la función
 * de integraciones y se cargan solas las ventas de Toast. Lo que se
 * protege:
 *   1. Sin CRON_SECRET en Vercel no se abre, y sin la cabecera correcta
 *      tampoco: es la única puerta de la función sin sesión de la app.
 *   2. Cualquier otro GET sigue en 405, y un POST sigue pidiendo sesión.
 *   3. Carga UN día por llamada (Hobby corta a los 10 s): el más
 *      reciente de la última semana que no esté completo y cerrado.
 *      Hoy no, que sigue abierto.
 *   4. Lo hace con la acción sync de siempre: no hay otra forma de
 *      guardar un día.
 *   5. Un fallo de Toast sale como fallo (502), con lo que dijo.
 *   6. La locación es la de ESTE restaurante de Toast; con cero o dos no
 *      adivina y no carga nada.
 *   7. vercel.json la programa dos veces de madrugada.
 *
 *   node tools/test-toast-cron.js
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const rutaSb = require.resolve('@supabase/supabase-js', { paths: [RAIZ] });
require.cache[rutaSb] = { id: rutaSb, filename: rutaSb, loaded: true, exports: {
  createClient: () => ({ auth: { getUser: async (t) => (t === 'sesion-buena'
    ? { data: { user: { id: 'u1' } }, error: null } : { data: {}, error: { message: 'bad' } }) } })
} };
const handler = require(path.join(RAIZ, 'api/integrations.js'));
const { fechaNY } = require(path.join(RAIZ, 'lib/toast-cron.js'));
require(path.join(RAIZ, 'lib/toast.js'))._olvidarCatalogo && require(path.join(RAIZ, 'lib/toast.js'))._olvidarCatalogo();

const GUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const LOC = '11111111-2222-3333-4444-555555555555';
const SECRETO = 'cron-secreto-123';

function entorno(cambios) {
  for (const k of Object.keys(process.env)) if (/^TOAST_|^SUPABASE_|^CRON_/.test(k)) delete process.env[k];
  Object.assign(process.env, {
    SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'srv',
    TOAST_CLIENT_ID: 'c', TOAST_CLIENT_SECRET: 's', TOAST_API_HOST: 'ws-api.toasttab.com', TOAST_RESTAURANT_GUID: GUID,
    CRON_SECRET: SECRETO
  }, cambios || {});
  for (const [k, v] of Object.entries(cambios || {})) if (v === undefined) delete process.env[k];
}

const dia = (n) => fechaNY(Date.now() - n * 864e5);
let peticiones = [];
let estado = {};
global.fetch = async (url, op) => {
  const metodo = (op && op.method) || 'GET';
  peticiones.push({ url, metodo });
  const r = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
  if (url.includes('/authentication/')) return r(200, { status: 'SUCCESS', token: { accessToken: 't', expiresIn: 86400 } });
  if (url.includes('/salesCategories')) return r(200, [{ guid: 'cat-l', name: 'Liquor' }]);
  if (url.includes('/menus/v2/menus')) return r(200, { menus: [] });
  if (url.includes('/ordersBulk')) {
    if (estado.toast500) return r(500, { status: 500, message: 'Unexpected error' });
    return r(200, [{ checks: [{ selections: [{ item: { guid: 'it-1' }, displayName: 'Titos', quantity: 2, salesCategory: { guid: 'cat-l' } }] }] }]);
  }
  if (url.includes('sb.test/rest/v1/locations?toast_restaurant_guid')) return r(200, estado.locs || [{ id: LOC }]);
  if (url.includes('sb.test/rest/v1/locations?id=')) return r(200, [{ toast_restaurant_guid: GUID }]);
  if (url.includes('sb.test/rest/v1/toast_sales_days') && metodo === 'GET') return r(200, estado.dias || []);
  if (url.includes('sb.test/rest/v1/')) return r(201, {});
  return r(404, {});
};

async function llamar(o) {
  o = o || {};
  peticiones = [];
  const res = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ method: o.metodo || 'GET', query: o.query || { provider: 'toast', cron: 'sync' },
    headers: { authorization: o.auth === undefined ? 'Bearer ' + SECRETO : o.auth }, body: o.body || {} }, res);
  return res;
}
const syncs = () => peticiones.filter(p => p.url.includes('/ordersBulk')).map(p => (/businessDate=(\d{8})/.exec(p.url) || [])[1]);
const escrituras = () => peticiones.filter(p => p.url.includes('sb.test') && p.metodo !== 'GET');
const comp = (d) => d.replace(/-/g, '');

(async () => {

grupo('quién puede llamarla');
{
  entorno({ CRON_SECRET: undefined }); estado = {};
  let r = await llamar();
  prueba('sin CRON_SECRET no se abre, y lo dice', r.code === 500 && /CRON_SECRET/.test(r.body.error) && !peticiones.length, JSON.stringify(r.body));
  entorno(); estado = {};
  r = await llamar({ auth: 'Bearer otro' });
  prueba('con otro secreto, 401 y nada', r.code === 401 && !peticiones.length);
  r = await llamar({ auth: '' });
  prueba('sin cabecera, 401', r.code === 401 && !peticiones.length);
  r = await llamar({ query: { provider: 'toast' } });
  prueba('otro GET sigue en 405', r.code === 405 && !peticiones.length);
  r = await llamar({ query: { provider: 'tripleseat', cron: 'sync' } });
  prueba('la puerta es sólo de Toast', r.code === 405 && !peticiones.length);
  r = await llamar({ metodo: 'POST', query: { provider: 'toast', cron: 'sync' }, auth: 'Bearer ' + SECRETO, body: { action: 'ping' } });
  prueba('un POST con el secreto no pasa: pide sesión', r.code === 401 && !peticiones.some(p => p.url.includes('toasttab')));
}

grupo('qué día carga');
{
  entorno(); estado = {};
  let r = await llamar();
  prueba('nada cargado: carga ayer', r.code === 200 && r.body.cargado === dia(1) && syncs().join() === comp(dia(1)), JSON.stringify(r.body).slice(0, 200));
  prueba('un solo día por llamada', new Set(syncs()).size === 1);
  prueba('con la acción sync de siempre: marca, borra, escribe y marca', escrituras().map(p => p.metodo).join(',') === 'POST,DELETE,POST,POST', escrituras().map(p => p.metodo).join(','));
  prueba('en la locación del restaurante', escrituras().some(p => p.url.includes('location_id=eq.' + LOC)));

  estado = { dias: [{ business_date: dia(1), complete: true, closed: true }, { business_date: dia(2), complete: true, closed: true },
    { business_date: dia(3), complete: false, closed: true }] };
  r = await llamar();
  prueba('ayer ya está: recupera el más reciente que falte', r.body.cargado === dia(3) && syncs().join() === comp(dia(3)), r.body.cargado);

  estado = { dias: [1, 2, 3, 4, 5, 6, 7].map(n => ({ business_date: dia(n), complete: true, closed: true })) };
  r = await llamar();
  prueba('la semana entera cargada: no pide nada a Toast', r.code === 200 && r.body.cargado === null && !syncs().length);

  estado = { dias: [{ business_date: dia(1), complete: true, closed: false }] };
  r = await llamar();
  prueba('un día cargado a medio día (abierto) se vuelve a cargar', r.body.cargado === dia(1));
  prueba('hoy nunca', !syncs().includes(comp(dia(0))));
}

grupo('cuando algo falla');
{
  entorno(); estado = { toast500: true };
  let r = await llamar();
  prueba('Toast 500: sale como fallo, con lo que dijo', r.code === 502 && r.body.ok === false && r.body.resultado.status === 500, JSON.stringify(r.body).slice(0, 200));
  prueba('y no escribe ventas', !escrituras().length);
  estado = { locs: [] };
  r = await llamar();
  prueba('sin locación de este restaurante: no adivina', r.code === 500 && /found 0/.test(r.body.error) && !syncs().length);
  estado = { locs: [{ id: LOC }, { id: 'otra' }] };
  r = await llamar();
  prueba('con dos, tampoco', r.code === 500 && /found 2/.test(r.body.error) && !syncs().length);
}

grupo('programada en Vercel');
{
  const v = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
  const c = (v.crons || []).filter(x => /^\/api\/integrations\?provider=toast&cron=sync/.test(x.path));
  prueba('dos llamadas al día', c.length === 2);
  prueba('de madrugada en Nueva York (10:00 y 12:00 UTC), una vez al día cada una',
    c.every(x => /^0 (10|12) \* \* \*$/.test(x.schedule)) && new Set(c.map(x => x.schedule)).size === 2, c.map(x => x.schedule).join(' | '));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
