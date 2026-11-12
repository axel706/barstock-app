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
    // El primer día sólo trae licor; el evento sale otro día. La lista de
    // categorías tiene que juntar todos los días, no quedarse con el
    // primero: así se escondió "Banquet Beverage" la primera vez.
    const evento = w.__llamadas.length === 2;
    const j = (o.falla === d) ? { ok: false, paso: 'orders', status: 500 }
      : { ok: true, filas: 10, ordenes: 50, diaCompleto: true, dinero: !o.sinDinero,
          aviso: o.sinDinero ? 'Sales saved without money (migration 034).' : undefined,
          categorias: evento ? { guardadas: ['Banquet Beverage', 'Liquor'], fuera: ['Food'] } : { guardadas: ['Liquor'], fuera: ['Food'] } };
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

grupo('las categorias de todos los dias, no solo del primero');
{
  const w = entorno();
  const r = await w.bsToastHistoria(3);
  prueba('aparece la del evento, que salio el segundo dia', r.categorias.guardadas.includes('Banquet Beverage'), JSON.stringify(r.categorias));
  prueba('sin repetir', r.categorias.guardadas.length === 2 && r.categorias.fuera.length === 1, JSON.stringify(r.categorias));
}

grupo('otraVez: vuelve a cargar lo ya cargado');
{
  // Si cambia qué se guarda (entró Banquet Beverage), los días ya
  // cargados se quedarían sin eso para siempre.
  const w = entorno({ cargados: [{ business_date: ayer, complete: true, closed: true }] });
  await w.bsToastHistoria(2, { otraVez: true });
  const dias = w.__llamadas.map(p => p.params.businessDate);
  prueba('ayer se vuelve a pedir', dias.includes(ayer.replace(/-/g, '')), dias.join(','));
}

grupo('sin la migracion 034: se para y lo dice');
{
  // Rehacer la historia para tener el dinero (Axel, 2026-11-12) sin la
  // 034 corrida guardaría todo otra vez SIN dinero: se para en el primer
  // día y lo apunta, en vez de recorrer los 90 en balde.
  const w = entorno({ sinDinero: true });
  const r = await w.bsToastHistoria(5, { otraVez: true });
  prueba('se para en el primer dia', w.__llamadas.length === 1, String(w.__llamadas.length));
  prueba('y lo apunta', r.sinDinero.length === 1, JSON.stringify(r.sinDinero));
}
{
  const w = entorno();
  const r = await w.bsToastHistoria(3);
  prueba('con la 034, nada que apuntar', r.sinDinero.length === 0 && w.__llamadas.length === 4, JSON.stringify(r));
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

grupo('bsToastVentas: el dinero del dia, y por defecto HOY');
{
  // Axel, 2026-11-10: "las ventas de licor del dia... numeros, dinero".
  // Sin fecha pide HOY (en hora de Nueva York), que es lo que pregunto.
  const w = entorno();
  w.console.table = () => {};
  w.fetch = async (url, op) => {
    w.__llamadas.push(JSON.parse(op.body));
    return { status: 200, json: async () => ({ ok: true, businessDate: 'x', cerrado: false, diaCompleto: true,
      porCategoria: [{ categoria: 'Liquor', unidades: 3, bruto: 40, descuentos: 4, neto: 36, impuesto: 3.2, modificadores: 6, sinPrecio: 0 }],
      total: { unidades: 3, bruto: 40, descuentos: 4, neto: 36, impuesto: 3.2, modificadores: 6, sinPrecio: 0 } }) };
  };
  const r = await w.bsToastVentas('liquor');
  const p = w.__llamadas[0] || {};
  prueba('pide la accion sales', p.action === 'sales', p.action);
  prueba('de HOY si no se le dice el dia', p.params && p.params.businessDate === hoy.replace(/-/g, ''), p.params && p.params.businessDate);
  prueba('con la categoria', p.params && p.params.categoria === 'liquor');
  prueba('y devuelve lo que dijo Toast', !!r && r.total.neto === 36);
  await w.bsToastVentas(null, '20261109');
  const q = w.__llamadas[1] || {};
  prueba('otro dia, si se le da', q.params && q.params.businessDate === '20261109' && !('categoria' in q.params), JSON.stringify(q.params));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
