#!/usr/bin/env node
/*
 * ── Lo pedido una semana sin conteo no se pierde (par-intelligence) ───
 *
 * Axel, 2026-11-22: "¿qué pasa cuando una locación NO PUEDE HACER SU
 * CONTEO? […] para no dañar el historial". Leyendo el código salió esto:
 *
 * Cada semana de Pour·IQ es una fila de inventory_snapshots que ABRE un
 * conteo (on_hand_start) y CIERRA el siguiente: used = inicio + pedido −
 * final. Al mandar una orden, updateSnapshotOrdered suma lo pedido a la
 * fila de la semana de HOY. Si esa semana no se contó, su fila no existe
 * y la suma se tiraba sin aviso (`if (!snaps?.length) continue;`). La
 * fila que sigue abierta —la del último conteo— la cerraba el siguiente
 * conteo sin esas botellas, así que el used salía de MENOS justo lo
 * pedido, y con él los pares.
 *
 * Lo que se protege:
 *   1. Con fila de esta semana, todo como siempre: suma ahí.
 *   2. Sin fila de esta semana, suma a la fila ABIERTA más reciente de
 *      ese producto (la que cerrará el próximo conteo, y en cuya resta
 *      esas botellas entran).
 *   3. Nunca a una fila ya cerrada: su used ya está calculado y cambiar
 *      el pedido sin rehacerlo los dejaría diciendo cosas distintas.
 *   4. Borrar o reabrir la orden (reverseSnapshotOrdered) resta de la
 *      MISMA fila a la que se sumó.
 *
 *   node tools/test-snapshot-pedido.js
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

// Un PostgREST de mentira: sólo lo que usa par-intelligence para leer y
// cambiar inventory_snapshots (eq, lt, neq, is.null, order, limit).
function tabla(filas) {
  const pasa = (f, campo, cond) => {
    const v = f[campo];
    if (cond === 'is.null') return v === null || v === undefined;
    const [op, ...resto] = cond.split('.');
    const x = decodeURIComponent(resto.join('.'));
    if (op === 'eq') return String(v ?? '') === x;
    if (op === 'neq') return String(v ?? '') !== x;
    if (op === 'lt') return String(v) < x;
    if (op === 'lte') return String(v) <= x;
    return true;
  };
  async function fetch(url, opt = {}) {
    const u = new URL(url);
    const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.pathname.endsWith('/locations')) return json([{ id: 'loc-1' }]);
    const conds = [];
    let orden = null, limite = Infinity;
    for (const [k, v] of u.searchParams) {
      if (k === 'select' || k === 'offset' || k === 'on_conflict') continue;
      if (k === 'order') { orden = v; continue; }
      if (k === 'limit') { limite = Number(v); continue; }
      conds.push([k, v]);
    }
    let sel = filas.filter(f => conds.every(([k, v]) => pasa(f, k, v)));
    if (orden) {
      const [c, dir] = orden.split('.');
      sel = sel.slice().sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (dir === 'desc' ? -1 : 1));
    }
    sel = sel.slice(0, limite);
    if ((opt.method || 'GET') === 'PATCH') {
      const cambio = JSON.parse(opt.body);
      sel.forEach(f => Object.assign(f, cambio));
      return json(null);
    }
    return json(sel.map(f => ({ ...f })));
  }
  return fetch;
}

// Domingo 2026-11-22 a mediodía: cycleWeekFor mete el domingo en la
// semana del lunes SIGUIENTE (2026-11-23). Pero se fija la semana con el
// override para no depender del reloj.
function entorno(filas, semana) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k', LOCATION_NAME: 'The Crown Tavern' };
  w.console = { log() {}, warn() {}, error() {} };
  w.fetch = tabla(filas);
  for (const f of ['week', 'par-intelligence']) {
    new Function('window', 'fetch', 'console', 'document', leer('src/' + f + '.js'))(w, w.fetch, w.console, w.document);
  }
  w.BarStockParIntelligence.setWeekStartOverride(semana);
  return w;
}
const fila = (id, semana, item, o = {}) => ({
  id, location_id: 'loc-1', week_start: semana, item_name: item, code: '',
  on_hand_start: 3, ordered: null, on_hand_end: null, used: null, ...o
});

(async () => {
  grupo('con fila de esta semana, como siempre');
  {
    const filas = [fila('a', '2026-11-16', "Tito's", { on_hand_end: 4, used: 6 }), fila('b', '2026-11-23', "Tito's")];
    const w = entorno(filas, '2026-11-23');
    await w.BarStockParIntelligence.updateSnapshotOrdered([{ item: "Tito's", code: '', finalOrder: 5 }]);
    prueba('suma a la fila de esta semana', filas[1].ordered === 5, JSON.stringify(filas));
    prueba('y no toca la anterior', filas[0].ordered === null);
  }

  grupo('una semana sin conteo: su fila no existe');
  {
    // Contó el 16, no contó el 23: sólo existe la fila del 16, abierta.
    const filas = [fila('v', '2026-11-09', "Tito's", { on_hand_end: 3, used: 5 }), fila('a', '2026-11-16', "Tito's", { ordered: 2 })];
    const w = entorno(filas, '2026-11-23');
    await w.BarStockParIntelligence.updateSnapshotOrdered([{ item: "Tito's", code: '', finalOrder: 5 }]);
    prueba('lo pedido no se pierde: va a la fila abierta', filas[1].ordered === 7, 'ordered ' + filas[1].ordered);
    prueba('nunca a una fila cerrada', filas[0].ordered === null);
    // Y el conteo que llegue la cierra con esas botellas dentro.
    w.BarStockParIntelligence.setWeekStartOverride('2026-11-30');
    await w.BarStockParIntelligence.completeSnapshot([{ item: "Tito's", code: '', onHand: 4 }]);
    prueba('el used que sale las cuenta: 3 + 7 − 4 = 6', filas[1].used === 6, 'used ' + filas[1].used);
  }

  grupo('sin ninguna fila abierta');
  {
    const filas = [fila('v', '2026-11-09', "Tito's", { on_hand_end: 3, used: 5 })];
    const w = entorno(filas, '2026-11-23');
    await w.BarStockParIntelligence.updateSnapshotOrdered([{ item: "Tito's", code: '', finalOrder: 5 }]);
    prueba('no se inventa una: la cerrada sigue igual', filas[0].ordered === null && filas.length === 1);
  }

  grupo('borrar la orden resta de la misma fila');
  {
    const filas = [fila('a', '2026-11-16', "Tito's", { ordered: 7 })];
    const w = entorno(filas, '2026-11-23');
    // Una orden colocada el miércoles 25: su semana (23) no tiene fila.
    await w.BarStockParIntelligence.reverseSnapshotOrdered({
      id: 'o1', createdAt: '2026-11-25T18:00:00Z', items: [{ item: "Tito's", code: '', finalOrder: 5 }]
    });
    prueba('resta de la fila abierta a la que se sumó', filas[0].ordered === 2, 'ordered ' + filas[0].ordered);
  }

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
