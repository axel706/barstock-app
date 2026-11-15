#!/usr/bin/env node
/*
 * ── El esperado, fase 2: guardarlo al cerrar el conteo ───────────────
 *
 * docs/plan-esperado.md. Al cerrar un conteo que abre ciclo, el LIVE de
 * la semana que se cierra (lo contado al abrir + lo que llegó − lo
 * vendido en Toast) se guarda junto a lo que se acaba de contar, en las
 * tablas de la migración 040. Lo que se protege:
 *
 *   1. Se arma con lo de ANTES del conteo: lo contado al abrir es el
 *      on hand que había, no el que el conteo acaba de escribir.
 *   2. Sólo lo que se contó: con "zero", un producto no contado vale 0
 *      sin que nadie lo haya mirado, y eso no es un dato.
 *   3. La cuenta no se escribe: expected y difference los calcula
 *      Postgres. Lo contado y el precio se copian.
 *   4. El ciclo primero, sus filas después con su id; si el ciclo falla,
 *      no se escribe ninguna fila y se dice lo que contestó el servidor.
 *   5. Sin conteo anterior conocido no hay desde dónde: no escribe, y lo
 *      dice.
 *   6. En count-finish: se toma antes del bucle que sobrescribe el on
 *      hand, se guarda sólo si el conteo abre ciclo, y NO se espera: si
 *      falla, el conteo ya está guardado.
 *   7. El LIVE de antes sale del mismo cálculo que el de la app
 *      (live-stock.js), no de una copia.
 *
 *   node tools/test-esperado-guardar.js
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

function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k', LOCATION_NAME: 'Crown' };
  w.parseNum = (v) => Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')) || 0;
  w.BarStockInventoryCloud = { fetchLocationId: async () => '11111111-2222-3333-4444-555555555555' };
  w.BarStockToastUsage = {
    ultimoConteo: async () => (o.sinConteo ? null : new Date('2026-11-09T02:30:00Z')),
    diaDeNegocio: (t) => new Date(new Date(t).getTime() - 4 * 3600e3).toISOString().slice(0, 10)
  };
  // El LIVE de la semana que se cierra, como lo devolvería live-stock.
  w.BarStockLive = { entre: async (x) => {
    w.__entre = x;
    return { desde: '2026-11-08', dias: [{ business_date: '2026-11-09', complete: true, closed: true }],
      sinConvertir: [{ nombre: 'Spicy Marg', motivo: 'Recipe missing', unidades: 4 }],
      filas: [
        { producto: "Tito's", contado: 3, llego: 5, vendido: 6.5, live: 1.5, porDia: { '2026-11-10': 2, '2026-11-11': 4.5 },
          de: [], llegadas: [{ n: 5, cuando: Date.parse('2026-11-11T12:00:00Z'), de: 'LOOP · CT-0211' }] },
        { producto: 'Baileys', contado: 2, llego: 0, vendido: 0, live: 2, porDia: {}, de: [], llegadas: [] },
        { producto: 'Sin contar', contado: 4, llego: 0, vendido: 1, live: 3, porDia: {}, de: [], llegadas: [] }
      ] };
  } };
  w.BarStockLiveCache = { toastLoVende: (r) => r && r.item === "Tito's" };
  w.__pet = [];
  w.fetch = async (url, op) => {
    const p = { url: String(url), metodo: (op && op.method) || 'GET', cabeceras: (op && op.headers) || {}, cuerpo: op && op.body ? JSON.parse(op.body) : null };
    w.__pet.push(p);
    if (/live_expected_cycles/.test(p.url)) {
      if (o.cicloFalla) return { ok: false, status: 409, text: async () => '{"code":"23505","message":"duplicate key value violates unique constraint"}', json: async () => ({}) };
      return { ok: true, status: 201, text: async () => '[{"id":"ciclo-1"}]', json: async () => [{ id: 'ciclo-1' }] };
    }
    if (/live_expected\b/.test(p.url)) {
      if (o.filasFallan) return { ok: false, status: 400, text: async () => '{"message":"boom"}', json: async () => ({}) };
      return { ok: true, status: 201, text: async () => '', json: async () => null };
    }
    return { ok: false, status: 404, text: async () => 'no route', json: async () => ({}) };
  };
  if (fs.existsSync(path.join(RAIZ, 'src/live-expected.js'))) w.eval(leer('src/live-expected.js'));
  return w;
}

(async () => {
const MASTER = () => [
  { item: "Tito's", onHand: 3, value: '$21.50' },
  { item: 'Baileys', onHand: 2, value: '30' },
  { item: 'Sin contar', onHand: 4, value: '10' }
];

grupo('1 · lo de antes del conteo');
{
  const w = entorno();
  const E = w.BarStockLiveExpected;
  prueba('existe el módulo', !!E && typeof E.antes === 'function' && typeof E.guardar === 'function');
  const m = MASTER();
  const a = E ? await E.antes(m) : null;
  // El conteo escribe encima después: lo de antes no puede moverse.
  m[0].onHand = 1;
  prueba('guarda el conteo anterior', a && a.desde === '2026-11-09T02:30:00.000Z', a && a.desde);
  prueba('y el on hand de ANTES, copiado', a && a.onHand["Tito's"] === 3, a && JSON.stringify(a.onHand));
  prueba('y el precio de ese momento', a && a.precio["Tito's"] === 21.5, a && JSON.stringify(a.precio));
}

grupo('2 · guardar: el ciclo y sus filas');
{
  const w = entorno();
  const E = w.BarStockLiveExpected;
  const m = MASTER();
  const a = await E.antes(m);
  // El conteo: Tito's 1, Baileys 2. "Sin contar" no se contó.
  m[0].onHand = 1;
  const r = await E.guardar({ antes: a, master: m, contados: ["Tito's", 'Baileys'], hasta: Date.parse('2026-11-16T02:00:00Z') });
  prueba('contesta bien', r && r.ok === true, JSON.stringify(r));
  prueba('el LIVE se pide con lo de ANTES y desde el conteo anterior',
    w.__entre && w.__entre.conteo === a.desde && w.__entre.master.find(x => x.item === "Tito's").onHand === 3,
    w.__entre && JSON.stringify(w.__entre.master));
  prueba('y sin pasar del cierre', w.__entre && w.__entre.ahora === Date.parse('2026-11-16T02:00:00Z'));
  const posts = w.__pet.filter(p => p.metodo === 'POST');
  prueba('primero el ciclo, después sus filas', posts.length === 2 && /live_expected_cycles/.test(posts[0].url) && /\/live_expected(\?|$)/.test(posts[1].url),
    posts.map(p => p.url).join(' | '));
  const c = posts[0] ? (Array.isArray(posts[0].cuerpo) ? posts[0].cuerpo[0] : posts[0].cuerpo) : {};
  prueba('el ciclo: locación, desde, hasta y sus días', c.location_id === '11111111-2222-3333-4444-555555555555' &&
    c.cycle_start === '2026-11-09T02:30:00.000Z' && c.cycle_end === '2026-11-16T02:00:00.000Z' &&
    c.start_day === '2026-11-08' && c.end_day === '2026-11-15', JSON.stringify(c));
  prueba('provisional', c.status === 'provisional');
  prueba('con los días de Toast que había y lo que no se convirtió',
    Array.isArray(c.sales_days) && c.sales_days[0].d === '2026-11-09' && c.unconverted[0].motivo === 'Recipe missing', JSON.stringify(c));
  prueba('el ciclo pide su id de vuelta', /return=representation/.test(JSON.stringify(posts[0] && posts[0].cabeceras)));
  const filas = posts[1] ? posts[1].cuerpo : [];
  const t = filas.find(f => f.item_name === "Tito's") || {};
  prueba('sólo lo contado: Tito\'s y Baileys, no "Sin contar"', filas.length === 2 && !filas.some(f => f.item_name === 'Sin contar'),
    filas.map(f => f.item_name).join(','));
  prueba('cada fila con el id de su ciclo', filas.every(f => f.cycle_id === 'ciclo-1'));
  prueba("Tito's: abrió con 3, llegaron 5, se vendieron 6.5, se contó 1",
    t.start_count === 3 && t.arrived === 5 && t.sold === 6.5 && t.counted === 1, JSON.stringify(t));
  prueba('con sus llegadas y lo vendido por día', t.arrivals && t.arrivals[0].n === 5 && t.sold_by_day['2026-11-11'] === 4.5, JSON.stringify(t));
  prueba('el precio de ese momento', t.unit_price === 21.5);
  prueba('Toast lo vende', t.in_toast === true && filas.find(f => f.item_name === 'Baileys').in_toast === false);
  prueba('la cuenta no se escribe: la hace Postgres', !('expected' in t) && !('difference' in t));
  prueba('dice cuántas filas guardó', r.filas === 2, JSON.stringify(r));
}

grupo('3 · lo que no se guarda');
{
  let w = entorno({ sinConteo: true });
  let a = await w.BarStockLiveExpected.antes(MASTER());
  let r = await w.BarStockLiveExpected.guardar({ antes: a, master: MASTER(), contados: ["Tito's"], hasta: Date.now() });
  prueba('sin conteo anterior: no escribe nada', r.ok === false && !w.__pet.some(p => p.metodo === 'POST'), JSON.stringify(r));
  prueba('y lo dice', /previous count/i.test(r.error || ''), r.error);

  w = entorno({ cicloFalla: true });
  a = await w.BarStockLiveExpected.antes(MASTER());
  r = await w.BarStockLiveExpected.guardar({ antes: a, master: MASTER(), contados: ["Tito's"], hasta: Date.now() });
  prueba('si el ciclo falla: ninguna fila', r.ok === false && !w.__pet.some(p => p.metodo === 'POST' && /\/live_expected(\?|$)/.test(p.url)), JSON.stringify(r));
  prueba('y dice lo que contestó el servidor, sin adivinar', /duplicate key/.test(r.error || ''), r.error);

  w = entorno({ filasFallan: true });
  a = await w.BarStockLiveExpected.antes(MASTER());
  r = await w.BarStockLiveExpected.guardar({ antes: a, master: MASTER(), contados: ["Tito's"], hasta: Date.now() });
  prueba('si las filas fallan, también lo dice', r.ok === false && /boom/.test(r.error || ''), JSON.stringify(r));

  w = entorno();
  a = await w.BarStockLiveExpected.antes(MASTER());
  r = await w.BarStockLiveExpected.guardar({ antes: a, master: MASTER(), contados: [], hasta: Date.now() });
  prueba('sin nada contado: nada que guardar', r.ok === false && !w.__pet.some(p => p.metodo === 'POST'), JSON.stringify(r));
}

grupo('3b · cerrar lo provisional cuando Toast tiene los días');
{
  // Al cerrar el conteo, el día del cierre puede no estar cargado entero
  // (la carga de la madrugada lo trae al día siguiente). El ciclo queda
  // `provisional`; cuando TODOS sus días (después de start_day, hasta
  // end_day) están cargados, completos y cerrados, se recalcula lo
  // vendido de cada fila con esos días y el ciclo pasa a `final`.
  const DIAS = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
  const montar = (o) => {
    o = o || {};
    const w = entorno();
    w.__pet = [];
    w.BarStockRest = { leerTodo: async (ruta) => {
      w.__pet.push({ url: ruta, metodo: 'GET' });
      if (/^live_expected_cycles/.test(ruta)) return o.sinCiclos ? [] : [{ id: 'ciclo-1', start_day: '2026-11-08', end_day: '2026-11-15' }];
      if (/^live_expected\?/.test(ruta)) return [
        { id: 7, cycle_id: 'ciclo-1', location_id: 'L', item_name: "Tito's", start_count: 3, counted: 1 },
        { id: 8, cycle_id: 'ciclo-1', location_id: 'L', item_name: 'Baileys', start_count: 2, counted: 2 } ];
      return [];
    } };
    w.BarStockToastUsage.ventasDesde = async (desde) => {
      w.__desde = desde;
      const dias = DIAS.filter(d => d !== o.falta).map(d => ({ business_date: d, complete: true, closed: !(o.abierto && d === '2026-11-15') }));
      dias.push({ business_date: '2026-11-16', complete: true, closed: false });
      return { dias, productos: [
        // El 16 es del ciclo nuevo: no cuenta.
        { producto: "Tito's", porDia: { '2026-11-10': 2, '2026-11-15': 1.5, '2026-11-16': 9 } }
      ], sinConvertir: [] };
    };
    const fetchViejo = w.fetch;
    w.fetch = async (url, op) => {
      const r = await fetchViejo(url, op);
      if (/live_expected\?on_conflict=id/.test(String(url))) return { ok: true, status: 201, text: async () => '', json: async () => null };
      if (/live_expected_cycles\?id=eq\./.test(String(url))) return { ok: true, status: 204, text: async () => '', json: async () => null };
      return r;
    };
    return w;
  };
  let w = montar();
  prueba('existe cerrarPendientes', typeof w.BarStockLiveExpected.cerrarPendientes === 'function');
  let r = await w.BarStockLiveExpected.cerrarPendientes();
  const esc = w.__pet.filter(p => p.metodo !== 'GET');
  prueba('contesta y dice cuántos cerró', r && r.ok === true && r.cerrados === 1, JSON.stringify(r));
  prueba('lee lo vendido desde el día del conteo anterior', w.__desde === '2026-11-08', w.__desde);
  const up = esc.find(p => /live_expected\?on_conflict=id/.test(p.url));
  const filas = up ? up.cuerpo : [];
  const t = filas.find(f => f.item_name === "Tito's") || {};
  prueba('las filas se rehacen de una vez, por su id', !!up && /merge-duplicates/.test(JSON.stringify(up.cabeceras)) && filas.length === 2, up && up.url);
  prueba("Tito's: 2 + 1.5, sin el 9 del ciclo nuevo", t.sold === 3.5 && t.id === 7, JSON.stringify(t));
  prueba('con lo vendido por día de esos días', t.sold_by_day && t.sold_by_day['2026-11-15'] === 1.5 && !('2026-11-16' in t.sold_by_day), JSON.stringify(t.sold_by_day));
  prueba('lo que no se vendió queda en 0', (filas.find(f => f.item_name === 'Baileys') || {}).sold === 0);
  prueba('lo contado y lo de antes no cambian', t.counted === 1 && t.start_count === 3);
  prueba('la cuenta sigue sin escribirse', !('expected' in t) && !('difference' in t));
  const fin = esc.find(p => /live_expected_cycles\?id=eq\.ciclo-1/.test(p.url));
  prueba('y el ciclo pasa a final, después de sus filas', !!fin && fin.metodo === 'PATCH' && fin.cuerpo.status === 'final' && !!fin.cuerpo.finalized_at &&
    esc.indexOf(fin) > esc.indexOf(up), JSON.stringify(fin && fin.cuerpo));
  prueba('con los días con los que se cerró', fin && fin.cuerpo.sales_days.length === 7 && fin.cuerpo.sales_days.every(d => d.closed), JSON.stringify(fin && fin.cuerpo.sales_days));

  w = montar({ abierto: true });
  r = await w.BarStockLiveExpected.cerrarPendientes();
  prueba('con el día del cierre todavía abierto: no toca nada', r.ok === true && r.cerrados === 0 && !w.__pet.some(p => p.metodo !== 'GET'), JSON.stringify(r));
  w = montar({ falta: '2026-11-12' });
  r = await w.BarStockLiveExpected.cerrarPendientes();
  prueba('con un día sin cargar: tampoco (no se sabe qué pasó ese día)', r.cerrados === 0 && !w.__pet.some(p => p.metodo !== 'GET'), JSON.stringify(r));
  w = montar({ sinCiclos: true });
  r = await w.BarStockLiveExpected.cerrarPendientes();
  prueba('sin nada provisional: una lectura y nada más', r.ok === true && r.cerrados === 0 && w.__pet.length === 1, JSON.stringify(w.__pet.map(p => p.url)));
  prueba('se lanza solo al abrir la app, sin esperarlo', /setTimeout\(\s*cerrarSolo/.test(leer('src/live-expected.js')));
}

grupo('4 · en el cierre del conteo');
{
  const cf = leer('src/count-finish.js');
  const iAntes = cf.indexOf('BarStockLiveExpected.antes');
  const iBucle = cf.indexOf('r.onHand = S().bottlesFor');
  prueba('lo de antes se toma ANTES del bucle que escribe el on hand', iAntes > 0 && iBucle > 0 && iAntes < iBucle, iAntes + ' / ' + iBucle);
  const iGuardar = cf.indexOf('BarStockLiveExpected.guardar');
  const iYa = cf.indexOf('const yaHayCiclo = await cicloYaCorrio()');
  prueba('se guarda después de saber si el conteo abre ciclo', iGuardar > iYa && iYa > 0);
  prueba('sólo si abre ciclo (un reconteo no)', /!yaHayCiclo[^\n]*\n?[^\n]*BarStockLiveExpected\.guardar|if \(!yaHayCiclo && [^)]*\)[\s\S]{0,120}BarStockLiveExpected\.guardar/.test(cf));
  prueba('sin esperarlo: el conteo no depende de esto', !/await\s+window\.BarStockLiveExpected\.guardar/.test(cf) && /BarStockLiveExpected\.guardar\([\s\S]{0,300}\.catch\(/.test(cf));
  prueba('tomar lo de antes no puede tumbar el conteo', /try\s*\{[^}]*BarStockLiveExpected\.antes/.test(cf));
  const html = leer('index.html');
  const pos = f => html.indexOf('src/' + f + '?v=');
  prueba('se carga después del LIVE y antes del cierre del conteo',
    pos('live-expected.js') > pos('live-cache.js') && pos('live-expected.js') < pos('count-finish.js') && pos('live-cache.js') > 0);
}

grupo('5 · el mismo cálculo del LIVE');
{
  const ls = leer('src/live-stock.js');
  prueba('live-stock tiene entre()', /async function entre\(/.test(ls) && /BarStockLive = \{[^}]*entre/.test(ls));
  prueba('ahora() y entre() arman con la MISMA función', (ls.match(/armarFilas\(/g) || []).length >= 3);
  const tu = leer('src/toast-usage.js');
  prueba('toast-usage deja ver el último conteo', /BarStockToastUsage = \{[^}]*ultimoConteo/.test(tu));
  prueba('el guardián vigila que no escriba en el conteo', /'src\/live-expected\.js'/.test(leer('tools/test-toast-no-toca-conteo.js')));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
