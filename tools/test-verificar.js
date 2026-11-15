#!/usr/bin/env node
/*
 * ── La verificación: "I have enough" con un número ───────────────────
 *
 * docs/plan-lista-compras.md, fase 1 (Axel, 2026-11-14): cuando alguien
 * mira la estantería a media semana y dice "hay 6", el LIVE de ese
 * producto parte de ahí. Lo que se protege:
 *
 *   1. LIVE = lo verificado + lo que llegó DESPUÉS − lo vendido DESPUÉS.
 *      El día de la verificación se parte por la hora, como el del
 *      conteo. Gana la última; una de antes del conteo, o del futuro,
 *      no cuenta.
 *   2. No toca on_hand: lo contado sigue siendo lo contado.
 *   3. La línea de la semana salta a lo verificado ese día, y su último
 *      punto sigue siendo el número grande.
 *   4. La fecha prudente mide la duda desde la verificación.
 *   5. Guardar una verificación escribe sólo en stock_checks, con lo que
 *      decía la app en ese momento; si falla, dice lo que pasó.
 *   6. La migración 042: la tabla, sin borrar ni editar, y el historial
 *      sigue al producto al renombrarlo.
 *
 *   node tools/test-verificar.js
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
const cerca = (a, b) => Math.abs(a - b) < 1e-6;

const w = new JSDOM('<!doctype html><body></body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
w.eval(leer('src/order-receipts.js'));
w.eval(leer('src/live-stock.js'));
w.eval(leer('src/toast-usage.js'));
w.eval(leer('src/run-out.js'));
const L = w.BarStockLive, R = w.BarStockRunOut;

const T = (s) => new Date(s).getTime();
// Conteo: domingo 15 a las 9 PM. Hoy: viernes 20 a las 11 PM.
const CONTEO = T('2026-11-16T02:00:00Z'), DIA = '2026-11-15', AHORA = T('2026-11-21T04:00:00Z');
const MASTER = [{ item: "Tito's", onHand: 3 }, { item: 'Baileys', onHand: 2 }];
// Lo vendido de Tito's: martes 1, miércoles 2, jueves 1, viernes 1.
const VENDIDO = [{ producto: "Tito's", botellas: 5,
  porDia: { '2026-11-17': 1, '2026-11-18': 2, '2026-11-19': 1, '2026-11-20': 1 },
  porDiaBruto: { '2026-11-17': 1, '2026-11-18': 2, '2026-11-19': 1, '2026-11-20': 1 } }];
// Un pedido que llegó el martes (+5) y otro el jueves (+2): dos recibos sin pedido.
const RECIBOS = [{ item: "Tito's", qty: 5, fecha: '2026-11-17T15:00:00Z' }, { item: "Tito's", qty: 2, fecha: '2026-11-19T15:00:00Z' }];
// Verificación: miércoles 18 a las 3 PM (20:00Z), "hay 6". A esa hora del
// miércoles se había vendido la mitad del día (fraccion de mentira: 0.5).
const fraccion = (dia, instante) => (dia === '2026-11-18' ? 0.5 : 1);
const diaDe = (t) => w.BarStockToastUsage.diaDeNegocio(t);
const calc = (verificaciones) => L.calcular({ master: MASTER, ordenes: [], repartido: new Map(), recibos: RECIBOS.map(x => Object.assign({}, x)),
  conteo: CONTEO, diaConteo: DIA, ahora: AHORA, vendido: VENDIDO, verificaciones, fraccion, diaDe });
const tito = (filas) => filas.find(f => f.producto === "Tito's");

(async () => {
grupo('1 · el LIVE parte de lo verificado');
{
  const sin = tito(calc([]));
  prueba('sin verificar, lo de siempre: 3 + 7 − 5 = 5', sin.live === 5, String(sin.live));
  const con = tito(calc([{ item_name: "Tito's", counted: 6, live_said: 6.5, checked_at: '2026-11-18T20:00:00Z', checked_by: 'Ana' }]));
  // Después de las 3 PM del miércoles: la mitad del miércoles (1), el
  // jueves (1) y el viernes (1) vendidos; llegaron 2 el jueves.
  prueba('con "hay 6" el miércoles a las 3: 6 + 2 − 3 = 5', con.live === 5, JSON.stringify({ live: con.live, l: con.llegoVerif, v: con.vendidoVerif }));
  prueba('lo vendido después, con el miércoles partido por la hora', cerca(con.vendidoVerif, 3), String(con.vendidoVerif));
  prueba('lo que llegó después: sólo el jueves', con.llegoVerif === 2, String(con.llegoVerif));
  prueba('dice de quién, cuándo y cuánto', con.verificado && con.verificado.n === 6 && con.verificado.por === 'Ana' &&
    con.verificado.cuando === T('2026-11-18T20:00:00Z') && con.verificado.decia === 6.5, JSON.stringify(con.verificado));
  prueba('lo contado no cambia (on_hand es lo que se contó)', con.contado === 3 && con.llego === 7 && con.vendido === 5, JSON.stringify(con));
  prueba('lleva la marca Live', con.movimiento === true);
  const dos = tito(calc([
    { item_name: "Tito's", counted: 9, checked_at: '2026-11-17T20:00:00Z' },
    { item_name: "Tito's", counted: 6, checked_at: '2026-11-18T20:00:00Z' }]));
  prueba('gana la última', dos.verificado.n === 6 && dos.live === 5, JSON.stringify(dos.verificado));
  const vieja = tito(calc([{ item_name: "Tito's", counted: 40, checked_at: '2026-11-14T20:00:00Z' }]));
  prueba('una de antes del conteo no cuenta', !vieja.verificado && vieja.live === 5);
  const futura = tito(calc([{ item_name: "Tito's", counted: 40, checked_at: '2026-11-25T20:00:00Z' }]));
  prueba('una de después de "ahora" tampoco', !futura.verificado && futura.live === 5);
  const otra = calc([{ item_name: 'Baileys', counted: 0.5, checked_at: '2026-11-18T20:00:00Z' }]);
  prueba('un producto sin movimiento también: Baileys pasa a 0.5', otra.find(f => f.producto === 'Baileys').live === 0.5 &&
    otra.find(f => f.producto === 'Baileys').movimiento === true);
}

grupo('2 · la línea de la semana salta a lo verificado');
{
  const f = tito(calc([{ item_name: "Tito's", counted: 6, checked_at: '2026-11-18T20:00:00Z' }]));
  const p = L.diaADia(f, DIA, '2026-11-20', diaDe);
  const de = (d) => p.find(x => x.fecha === d) || {};
  prueba('hasta el martes, lo de siempre (3 + 5 − 1 = 7)', de('2026-11-17').queda === 7, JSON.stringify(de('2026-11-17')));
  prueba('el miércoles acaba en lo verificado menos lo de después (6 − 1 = 5)', de('2026-11-18').queda === 5, JSON.stringify(de('2026-11-18')));
  prueba('y el último punto es el número grande', p[p.length - 1].queda === f.live, p[p.length - 1].queda + ' vs ' + f.live);
}

grupo('3 · la fecha prudente mide la duda desde la verificación');
{
  const f = tito(calc([{ item_name: "Tito's", counted: 6, checked_at: '2026-11-18T20:00:00Z' }]));
  prueba('el margen sale de lo vendido después (3 → 0.5), no desde el conteo', R.margenDe(f) === Math.min(R.MARGEN, R.MARGEN_PARTE * 3));
  const g = Object.assign({}, f, { vendidoVerif: 0.4 });
  prueba('recién verificado, casi sin margen', cerca(R.margenDe(g), 0.1), String(R.margenDe(g)));
}

grupo('4 · guardar una verificación');
{
  const v = new JSDOM('<!doctype html><body></body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  v.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k' };
  v.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-1' };
  v.__pet = [];
  let falla = false;
  v.fetch = async (url, op) => {
    v.__pet.push({ url: String(url), metodo: (op && op.method) || 'GET', cuerpo: op && op.body ? JSON.parse(op.body) : null, cab: op && op.headers });
    if (falla) return { ok: false, status: 400, text: async () => '{"message":"boom"}' };
    return { ok: true, status: 201, text: async () => '' };
  };
  if (fs.existsSync(path.join(RAIZ, 'src/stock-checks.js'))) v.eval(leer('src/stock-checks.js'));
  const S = v.BarStockStockChecks;
  prueba('existe el módulo', !!S && typeof S.guardar === 'function' && typeof S.leer === 'function');
  if (S) {
    let r = await S.guardar({ item: "Tito's", n: 6, decia: 1.2, por: 'Ana' });
    const p = v.__pet[0] || {};
    prueba('escribe en stock_checks', p.metodo === 'POST' && /\/rest\/v1\/stock_checks$/.test(p.url), p.url);
    prueba('con la locación, el producto, lo que había y lo que decía la app', p.cuerpo && p.cuerpo.location_id === 'loc-1' &&
      p.cuerpo.item_name === "Tito's" && p.cuerpo.counted === 6 && p.cuerpo.live_said === 1.2 && p.cuerpo.checked_by === 'Ana', JSON.stringify(p.cuerpo));
    prueba('contesta bien', r && r.ok === true);
    r = await S.guardar({ item: "Tito's", n: -1 });
    prueba('un número negativo no se guarda', r.ok === false && v.__pet.length === 1, JSON.stringify(r));
    r = await S.guardar({ item: '', n: 2 });
    prueba('sin producto tampoco', r.ok === false && v.__pet.length === 1);
    falla = true;
    r = await S.guardar({ item: "Tito's", n: 3 });
    prueba('si falla, dice lo que contestó el servidor', r.ok === false && /boom/.test(r.error || ''), JSON.stringify(r));
    prueba('y nunca escribe en el inventario', v.__pet.every(x => !/inventory_items|inventory_snapshots|on_hand/.test(x.url + JSON.stringify(x.cuerpo))));
  }
}

grupo('5 · el LIVE de la app las lee');
{
  const ls = leer('src/live-stock.js');
  prueba('armarFilas lee las verificaciones desde el conteo', /BarStockStockChecks[\s\S]{0,200}leer\(/.test(ls) && /verificaciones/.test(ls));
  prueba('y si no se pueden leer, sigue sin ellas', /catch[\s\S]{0,160}verificaciones/.test(ls));
  const tu = leer('src/toast-usage.js');
  prueba('lo vendido trae también el día sin partir (para partirlo por otra hora)', /porDiaBruto/.test(tu));
  const html = leer('index.html');
  const pos = f => html.indexOf('src/' + f + '?v=');
  prueba('stock-checks se carga antes del LIVE', pos('stock-checks.js') > 0 && pos('stock-checks.js') < pos('live-stock.js'));
  prueba('el guardián lo vigila', /'src\/stock-checks\.js'/.test(leer('tools/test-toast-no-toca-conteo.js')));
}

grupo('6 · la migración 042');
{
  const F = 'database/migrations/042_stock_checks.sql';
  const c = fs.existsSync(path.join(RAIZ, F)) ? leer(F).replace(/--.*$/gm, '') : '';
  prueba('existe', !!c);
  prueba('crea stock_checks', /create table if not exists public\.stock_checks/.test(c));
  prueba('con lo verificado, lo que decía la app, quién y cuándo', /counted\s+numeric\s+not null/.test(c) && /live_said\s+numeric/.test(c) &&
    /checked_by\s+text/.test(c) && /checked_at\s+timestamptz\s+not null default now\(\)/.test(c));
  prueba('sin borrar ni editar desde la app', !/for (delete|update)/.test(c) && /for insert/.test(c));
  prueba('el historial sigue al producto al renombrarlo', /after update of item_name on public\.inventory_items/.test(c) && /update public\.stock_checks set item_name = new\.item_name/.test(c));
  prueba('no toca on_hand', !/on_hand/i.test(c));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
