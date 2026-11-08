#!/usr/bin/env node
/*
 * ── tools/toast.js · bsToastHistoria ─────────────────────────────────
 *
 * La herramienta de consola que carga lo vendido en Toast día por día
 * (toast_sales). Lo que se protege:
 *
 *   1. Un día ya cargado, completo y cerrado no se vuelve a pedir: un año
 *      son cientos de llamadas a Toast, que limita la velocidad.
 *   2. Hoy y lo incompleto sí se vuelven a pedir.
 *   3. En el primer error se para: seguir escribiendo encima de un fallo
 *      lo esconde.
 *   4. Va un día por llamada y uno detrás de otro.
 *
 *   node tools/test-toast-historia.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const fmt = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {} };
  w.__llamadas = [];
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-crown' };
  const consulta = { select() { return this; }, eq() { return this; }, gte() { return this; },
    limit: async () => ({ data: o.cargados || [], error: o.errorBase || null }) };
  w.BarStockSupabase = { getClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
    from: () => consulta }) };
  w.fetch = async (url, op) => {
    const p = JSON.parse(op.body);
    w.__llamadas.push(p);
    const d = p.params.businessDate;
    const j = (o.falla === d) ? { ok: false, paso: 'orders', status: 500 }
      : { ok: true, filas: 10, ordenes: 50, diaCompleto: true, categorias: { guardadas: ['Liquor'], fuera: ['Food'] } };
    return { status: 200, json: async () => j };
  };
  w.eval(fs.readFileSync(path.join(__dirname, 'toast.js'), 'utf8'));
  return w;
}

(async () => {
const hoy = fmt(Date.now()), ayer = fmt(Date.now() - 864e5), antier = fmt(Date.now() - 2 * 864e5);

grupo('lo cargado no se vuelve a pedir');
{
  const w = entorno({ cargados: [
    { business_date: ayer, complete: true, closed: true },
    { business_date: antier, complete: false, closed: true },
    { business_date: hoy, complete: true, closed: false } ] });
  const r = await w.bsToastHistoria(3);
  const dias = w.__llamadas.map(p => p.params.businessDate);
  prueba('ayer (completo y cerrado) no se pide', !dias.includes(ayer.replace(/-/g, '')), dias.join(','));
  prueba('antier, incompleto, si', dias.includes(antier.replace(/-/g, '')));
  prueba('hoy, abierto, si', dias.includes(hoy.replace(/-/g, '')));
  prueba('del mas nuevo al mas viejo', dias[0] === hoy.replace(/-/g, ''), dias.join(','));
  prueba('todo con la accion sync y la locacion abierta', w.__llamadas.every(p => p.action === 'sync' && p.params.locationId === 'loc-crown'));
  prueba('cuenta lo cargado', r.cargados === 3 && r.filas === 30, JSON.stringify(r));
}

grupo('se para en el primer error');
{
  const w = entorno({ falla: ayer.replace(/-/g, '') });
  const r = await w.bsToastHistoria(5);
  const dias = w.__llamadas.map(p => p.params.businessDate);
  prueba('no sigue despues del dia que fallo', dias[dias.length - 1] === ayer.replace(/-/g, '') && dias.length === 2, dias.join(','));
  prueba('y dice cuantos alcanzo a cargar', r.cargados === 1, JSON.stringify(r));
}

grupo('si la base no contesta, no pide nada a Toast');
{
  const w = entorno({ errorBase: { message: 'boom' } });
  const r = await w.bsToastHistoria(5);
  prueba('sin llamadas', w.__llamadas.length === 0 && r === null);
}

grupo('bsToastParar lo detiene');
{
  const w = entorno();
  const orig = w.fetch;
  w.fetch = async (u, op) => { const x = await orig(u, op); if (w.__llamadas.length === 2) w.bsToastParar = true; return x; };
  await w.bsToastHistoria(10);
  prueba('se para despues del dia en curso', w.__llamadas.length === 2, w.__llamadas.length);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
