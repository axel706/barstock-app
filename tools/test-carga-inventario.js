#!/usr/bin/env node
/*
 * ── Leer el inventario entero, o no leerlo ──────────────────────────
 *
 * `loadInventoryFromSupabase` era un `fetch` suelto: sin `limit`, sin
 * paginar y sin mirar `res.ok`. Lo que llegara se convertía en
 * `state.master`, y de ahí en la verdad — porque al cerrar un conteo,
 * `replaceInventoryMaster` BORRA la tabla y reinserta esa lista.
 *
 * Una lectura corta se convertía en un borrado permanente. En
 * silencio, sin confirmación, y sin respaldo que lo delatara: el
 * respaldo se toma ANTES, así que registra lo que había, no lo que se
 * escribió.
 *
 * Pasó: entre el 25 de octubre y el 1 de noviembre desaparecieron ocho
 * productos de Crown. Nadie los borró.
 *
 * Lo que se protege:
 *
 *   1. Una respuesta con error NO se trata como inventario vacío.
 *   2. Se pagina de verdad; 1000 filas no es el techo.
 *   3. Y se contrasta con el total que dice el servidor: si llegaron
 *      menos, se lanza y NO se toca `state.master`.
 *
 *   node tools/test-carga-inventario.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const fila = (i) => ({
  code: 'C' + i, item_name: 'Item ' + String(i).padStart(4, '0'),
  vendor: 'LOOP', on_hand: 1, suggested: 2, value: 10,
  category: 'Vodka', order_override: null, par_adjusted_week: null,
  bottle_size_ml: 750, bottle_shape: '', created_at: '2026-01-01', last_opens: null
});

// o: { hay, sirve, estado, noArray }
//   hay    cuántas filas existen de verdad
//   sirve  cuántas entrega el servidor (para simular una lectura corta)
function entorno(o) {
  o = o || {};
  const hay = o.hay;
  const sirve = o.sirve === undefined ? hay : o.sirve;

  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  // El modulo lee `state` a pelo, sin `window.` delante. En el
  // navegador da igual; aqui el IIFE corre en el global de Node.
  Object.defineProperty(global, 'state', {
    configurable: true, get: () => w.state, set: (v) => { w.state = v; }
  });
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k',
                        ACCOUNT_ID: 'a1', LOCATION_NAME: 'The Crown Tavern' };
  w.state = { master: [{ item: 'LO QUE YA HABIA', onHand: 1 }] };
  w.render = () => {};
  w.saveState = () => {};
  w.normalizeName = (s) => String(s || '').trim().toLowerCase();
  w.computeToOrder = (oh, sug) => Math.max(0, sug - oh);
  w.BarStockToast = { show() {} };

  const todas = Array.from({ length: hay }, (_, i) => fila(i));

  global.fetch = w.fetch = async (url) => {
    const u = String(url);
    if (/locations\?/.test(u)) {
      return { ok: true, status: 200, headers: { get: () => '' },
               json: async () => [{ id: 'loc-1' }] };
    }
    if (/inventory_items/.test(u)) {
      if (o.estado) {
        return { ok: false, status: o.estado, headers: { get: () => '' },
                 text: async () => 'boom', json: async () => ({ message: 'boom' }) };
      }
      if (o.noArray) {
        return { ok: true, status: 200, headers: { get: () => '0-0/' + hay },
                 json: async () => ({ message: 'nope' }) };
      }
      const off = Number((/offset=(\d+)/.exec(u) || [])[1] || 0);
      const lim = Number((/limit=(\d+)/.exec(u) || [])[1] || 1000);
      // El servidor dice la verdad en la cabecera, pero entrega `sirve`.
      const trozo = todas.slice(0, sirve).slice(off, off + lim);
      return { ok: true, status: 200,
               headers: { get: (h) => /range/i.test(h) ? '0-0/' + hay : '' },
               json: async () => trozo };
    }
    return { ok: true, status: 200, headers: { get: () => '' }, json: async () => [] };
  };

  // La fila de la nube → state.master vive en inventory-row.js, que va
  // antes en index.html (lo usa también el correo de la mañana).
  new Function(fs.readFileSync(path.join(RAIZ, 'src/inventory-row.js'), 'utf8'))();
  new Function(fs.readFileSync(path.join(RAIZ, 'src/inventory-realtime.js'), 'utf8'))();
  return w;
}

async function cargar(w) {
  const RT = w.BarStockInventoryRealtime || {};
  // El modulo la expone como `recargar`; en index.html ademas queda
  // como global.
  const f = w.loadInventoryFromSupabase || RT.recargar;
  if (typeof f !== 'function') throw new Error('no se expone loadInventoryFromSupabase');
  return f();
}

(async () => {

grupo('la lectura normal trae todo');
{
  const w = entorno({ hay: 270 });
  let err = null;
  try { await cargar(w); } catch (e) { err = e; }
  prueba('no falla', !err, err && err.message);
  prueba('y llegan los 270', w.state.master.length === 270,
    String(w.state.master.length));
}

grupo('más de mil tampoco se corta');
{
  // 1000 era el techo silencioso de PostgREST. Con paginación, no.
  const w = entorno({ hay: 2300 });
  let err = null;
  try { await cargar(w); } catch (e) { err = e; }
  prueba('no falla', !err, err && err.message);
  prueba('llegan las 2300', w.state.master.length === 2300,
    String(w.state.master.length));
}

grupo('una lectura CORTA se rechaza, y no toca nada');
{
  // El caso de Crown: el servidor dice que hay 270 y entrega 262.
  const w = entorno({ hay: 270, sirve: 262 });
  let err = null;
  try { await cargar(w); } catch (e) { err = e; }
  prueba('lanza', !!err, err && err.message);
  prueba('y dice los números',
    err && /262/.test(err.message) && /270/.test(err.message), err && err.message);
  // Lo importante: `state.master` se queda como estaba. Si se
  // reemplazara con la lista corta, el siguiente cierre de conteo la
  // escribiría y borraría los ocho.
  prueba('NO toca el inventario local',
    w.state.master.length === 1 && w.state.master[0].item === 'LO QUE YA HABIA',
    JSON.stringify(w.state.master.map(r => r.item)));
}

grupo('un error del servidor no es un inventario vacío');
{
  for (const estado of [500, 401, 404]) {
    const w = entorno({ hay: 270, estado });
    let err = null;
    try { await cargar(w); } catch (e) { err = e; }
    prueba('HTTP ' + estado + ' lanza', !!err, err && err.message);
    prueba('  y no vacía el inventario', w.state.master.length === 1,
      String(w.state.master.length));
  }
}

grupo('ni una respuesta que no es una lista');
{
  const w = entorno({ hay: 270, noArray: true });
  let err = null;
  try { await cargar(w); } catch (e) { err = e; }
  prueba('lanza', !!err, err && err.message);
  prueba('y no toca nada', w.state.master.length === 1, String(w.state.master.length));
}

grupo('y el código no vuelve a leer sin red de seguridad');
{
  const src = fs.readFileSync(path.join(RAIZ, 'src/inventory-realtime.js'), 'utf8');
  prueba('se comprueba res.ok', /if \(!res\.ok\)/.test(src));
  prueba('se pide el total exacto', /count=exact/.test(src));
  prueba('se pagina', /offset=\$\{p \* PAGINA\}/.test(src));
  prueba('y se contrasta el total',
    /rows\.length !== esperados/.test(src));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
