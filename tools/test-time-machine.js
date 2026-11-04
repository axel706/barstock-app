#!/usr/bin/env node
/*
 * ── Time Machine ────────────────────────────────────────────────────
 *
 * La pantalla que enseña cuánto se tardó en cada conteo. Lo que se
 * protege aquí no es que se vea bien:
 *
 *   1. El último conteo es el más NUEVO, llegue la lista en el orden
 *      que llegue.
 *   2. Cada conteo se compara con el de justo antes, con la MISMA
 *      regla que la pantalla de cierre (no una copia).
 *   3. Un conteo de prueba se enseña, pero nunca se compara: ni él con
 *      el anterior, ni el siguiente con él.
 *   4. La lectura pagina: PostgREST corta en 1000 sin avisar.
 *   5. Un fallo dice lo que pasó y no se disfraza de "no hay conteos".
 *   6. Esta pantalla sólo lee.
 *
 *   node tools/test-time-machine.js
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
const esperar = ms => new Promise(r => setTimeout(r, ms || 0));
const MIN = 60000;

function cargar(fetchFn) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  global.localStorage = w.localStorage;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k',
                        LOCATION_NAME: 'The Crown Tavern' };
  w.__peticiones = [];
  w.fetch = async (url, op) => {
    w.__peticiones.push({ url, metodo: (op && op.method) || 'GET' });
    return fetchFn(url, op);
  };
  global.fetch = w.fetch;
  for (const f of ['count-session', 'count-finish', 'rest-paginado', 'mobile-time-machine']) {
    new Function(fs.readFileSync(path.join(RAIZ, 'src/' + f + '.js'), 'utf8'))();
  }
  return w;
}

const resp = (filas, estado) => ({
  ok: !estado || estado < 400, status: estado || 200,
  json: async () => filas, text: async () => JSON.stringify(filas)
});

// Cuatro conteos de verdad, llegando DESORDENADOS a propósito.
const FILAS = [
  { id: 2, finished_at: '2026-10-20T22:00:00Z', active_ms: 101 * MIN, items: 190 },
  { id: 4, finished_at: '2026-11-03T22:00:00Z', active_ms:  72 * MIN, items: 184 },
  { id: 1, finished_at: '2026-10-13T22:00:00Z', active_ms: 125 * MIN, items: 171 },
  { id: 3, finished_at: '2026-10-27T22:00:00Z', active_ms:  80 * MIN, items: 184 }
];

(async () => {

const w = cargar(async () => resp([]));
const armar = w.BarStockMobileTimeMachine._armar;

grupo('el ultimo es el mas nuevo, venga como venga');
{
  const d = armar(FILAS);
  prueba('arriba el del 3 de noviembre', d.ultimo && d.ultimo.id === 4, d.ultimo && d.ultimo.id);
  prueba('y debajo, del mas nuevo al mas viejo',
    d.anteriores.map(f => f.id).join() === '3,2,1', d.anteriores.map(f => f.id).join());
}

grupo('cada uno contra el de justo antes');
{
  const d = armar(FILAS);
  prueba('el ultimo dice cuanto mejoro', d.ultimo.dif && d.ultimo.dif.txt === '8 min faster than last time',
    d.ultimo.dif && d.ultimo.dif.txt);
  prueba('y va en verde', d.ultimo.dif && d.ultimo.dif.rapido);
  // Las tarjetas pequeñas no llevan "than last time": cada una se
  // compara con la de debajo, no con "la vez pasada" de hoy.
  prueba('el del 27 contra el del 20', d.anteriores[0].dif && d.anteriores[0].dif.txt === '21 min faster',
    d.anteriores[0].dif && d.anteriores[0].dif.txt);
  prueba('el del 20 contra el del 13', d.anteriores[1].dif && d.anteriores[1].dif.txt === '24 min faster',
    d.anteriores[1].dif && d.anteriores[1].dif.txt);
  prueba('el mas viejo no tiene con que compararse', !d.anteriores[2].dif);
  prueba('y dice que es el primero guardado', d.anteriores[2].primero === true);
  prueba('solo el mas viejo lo dice', d.anteriores.filter(f => f.primero).length === 1);
}
{
  const d = armar([
    { id: 1, finished_at: '2026-10-27T22:00:00Z', active_ms: 60 * MIN, items: 100 },
    { id: 2, finished_at: '2026-11-03T22:00:00Z', active_ms: 75 * MIN, items: 100 }
  ]);
  prueba('si tardo mas, lo dice', d.ultimo.dif && d.ultimo.dif.txt === '15 min slower than last time',
    d.ultimo.dif && d.ultimo.dif.txt);
  prueba('y no va en verde', d.ultimo.dif && d.ultimo.dif.lento && !d.ultimo.dif.rapido);
}

grupo('la regla es la de la pantalla de cierre, no una copia');
{
  const F = w.BarStockCountFinish;
  prueba('count-finish la exporta', typeof F.comparar === 'function');
  prueba('y sin cola dice lo de siempre', F.comparar(72 * MIN, 80 * MIN) === '8 min faster than last time');
  prueba('igual, igual que siempre', F.comparar(80 * MIN, 80 * MIN) === 'same as last time');
  const src = fs.readFileSync(path.join(RAIZ, 'src/mobile-time-machine.js'), 'utf8')
    .replace(/\/\/.*$/gm, '');
  prueba('Time Machine no escribe su propia resta de minutos', !/\/\s*60000/.test(src));
  prueba('ni su propio minimo', !/5\s*\*\s*60000/.test(src));
}

grupo('los conteos de prueba se ven, pero no se comparan');
{
  const d = armar([
    { id: 1, finished_at: '2026-10-27T22:00:00Z', active_ms: 80 * MIN, items: 184 },
    { id: 2, finished_at: '2026-10-30T15:00:00Z', active_ms: 40 * 1000, items: 3 },
    { id: 3, finished_at: '2026-11-03T22:00:00Z', active_ms: 72 * MIN, items: 184 }
  ]);
  prueba('el de prueba sale en la lista', d.anteriores.some(f => f.id === 2));
  prueba('el ultimo no se compara contra la prueba', !d.ultimo.dif, d.ultimo.dif && d.ultimo.dif.txt);
  const prueba2 = d.anteriores.find(f => f.id === 2);
  prueba('y la prueba no se compara contra el anterior', !prueba2.dif, prueba2.dif && prueba2.dif.txt);
}
{
  const d = armar([
    { id: 1, finished_at: '2026-10-27T22:00:00Z', active_ms: 80 * MIN, items: 184 },
    { id: 2, finished_at: '2026-11-03T22:00:00Z', active_ms: 30 * 1000, items: 2 }
  ]);
  prueba('una prueba como ultimo conteo se enseña arriba', d.ultimo.id === 2);
  prueba('sin decir "79 min faster"', !d.ultimo.dif, d.ultimo.dif && d.ultimo.dif.txt);
}

grupo('el tiempo por articulo');
{
  const T = w.BarStockMobileTimeMachine;
  const host = w.document.createElement('div');
  global.fetch = w.fetch = async () => resp(FILAS);
  await T.pintar(host);
  const txt = host.textContent.replace(/\s+/g, ' ');
  // 72 min entre 184 articulos son 23.5 s: se redondea, no se trunca.
  prueba('72 min y 184 articulos son 23 s', /23 s\s*per item/.test(txt), txt.slice(0, 200));
  prueba('125 min y 171 son 44 s', /44 s\s*per item/.test(txt));
}
{
  const T = w.BarStockMobileTimeMachine;
  const host = w.document.createElement('div');
  global.fetch = w.fetch = async () => resp([{ id: 9, finished_at: '2026-11-03T22:00:00Z', active_ms: 10 * MIN, items: 0 }]);
  await T.pintar(host);
  prueba('sin articulos no se divide entre cero', /—\s*per item/.test(host.textContent) &&
    !/NaN|Infinity/.test(host.textContent), host.textContent.replace(/\s+/g, ' ').slice(0, 160));
}

grupo('las barras');
{
  const d = armar(FILAS);
  prueba('una por conteo', d.barras.length === 4, String(d.barras.length));
  prueba('de la mas vieja a la mas nueva',
    d.barras.map(b => b.etiqueta).join('|') === 'Oct 13|Oct 20|Oct 27|Nov 3', d.barras.map(b => b.etiqueta).join('|'));
  prueba('la mas larga llena la tarjeta', d.barras[0].alto === 100, String(d.barras[0].alto));
  prueba('y la ultima va marcada', d.barras[3].ahora && d.barras.filter(b => b.ahora).length === 1);
}
{
  const muchas = Array.from({ length: 10 }, (_, i) => ({
    id: i, finished_at: '2026-' + String(i + 1).padStart(2, '0') + '-05T22:00:00Z',
    active_ms: (60 + i) * MIN, items: 100
  }));
  const d = armar(muchas);
  prueba('con diez, solo las seis ultimas', d.barras.length === 6, String(d.barras.length));
  prueba('y la marcada es la del ultimo conteo', d.barras[5].ahora && d.barras[5].etiqueta === 'Oct 5',
    d.barras[5].etiqueta);
  prueba('pero las tarjetas, todas', d.anteriores.length === 9);
}

grupo('con un solo conteo, que es hoy');
{
  const d = armar([FILAS[1]]);
  prueba('sale arriba', d.ultimo && d.ultimo.id === 4);
  prueba('sin comparacion', !d.ultimo.dif);
  prueba('sin barras: una no es una tendencia', d.barras.length === 0);
  prueba('y sin tarjetas debajo', d.anteriores.length === 0);

  const host = w.document.createElement('div');
  global.fetch = w.fetch = async () => resp([FILAS[1]]);
  await w.BarStockMobileTimeMachine.pintar(host);
  prueba('y lo explica', /first saved count/.test(host.textContent));
}
{
  const host = w.document.createElement('div');
  global.fetch = w.fetch = async () => resp([]);
  await w.BarStockMobileTimeMachine.pintar(host);
  prueba('sin ninguno, dice que no hay', /No counts saved yet/.test(host.textContent));
}

grupo('un fallo dice lo que paso');
{
  const host = w.document.createElement('div');
  global.fetch = w.fetch = async () => resp({ message: 'JWT expired' }, 401);
  const avisos = console.warn; console.warn = () => {};
  await w.BarStockMobileTimeMachine.pintar(host);
  console.warn = avisos;
  const txt = host.textContent;
  prueba('avisa que no pudo leer', /Could not load your count times/.test(txt), txt.slice(0, 160));
  prueba('con el error de verdad', /JWT expired/.test(txt));
  // Un fallo no puede parecer una lista vacía: "no hay conteos" ante
  // un 401 mandaría a buscar conteos perdidos que no se perdieron.
  prueba('y no se disfraza de "no hay conteos"', !/No counts saved yet/.test(txt));
}

grupo('la lectura pagina y solo lee');
{
  // 1000 justas en la primera página: si el lector parara ahí, el
  // conteo 1001 no existiría.
  const pagina1 = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 10, finished_at: '2025-01-01T00:00:00Z', active_ms: 60 * MIN, items: 1 }));
  w.__peticiones = [];
  w.fetch = async (url, op) => {
    w.__peticiones.push({ url, metodo: (op && op.method) || 'GET' });
    return resp(/offset=0\b/.test(url) ? pagina1 : FILAS.slice(0, 3));
  };
  global.fetch = w.fetch;
  const host = w.document.createElement('div');
  await w.BarStockMobileTimeMachine.pintar(host);
  prueba('pide la segunda pagina', w.__peticiones.length === 2, String(w.__peticiones.length));
  prueba('y la cuenta entera llega', host.querySelectorAll('.m-tm-card').length === 1002,
    String(host.querySelectorAll('.m-tm-card').length));
  const u = decodeURIComponent(w.__peticiones[0].url);
  prueba('pide solo los de esta locacion', /location_name=eq\.The Crown Tavern/.test(u), u);
  // Sin orden fijo la paginacion no es estable: una fila puede salir
  // dos veces o ninguna.
  prueba('con un orden fijo', /order=finished_at\.desc,id\.desc/.test(u), u);
  prueba('y nunca escribe', w.__peticiones.every(p => p.metodo === 'GET'),
    w.__peticiones.map(p => p.metodo).join());
}
{
  // Un servidor que siempre devuelve 1000 no puede convertirse en una
  // lista corta presentada como entera.
  const llena = Array.from({ length: 1000 }, () => ({}));
  global.fetch = w.fetch = async () => resp(llena);
  global.fetch = w.fetch;
  let error = '';
  try { await w.BarStockRest.leerTodo('count_sessions?order=id.desc'); }
  catch (e) { error = e.message; }
  prueba('al tope, para y lo dice', /stopped instead of showing a partial list/.test(error), error);
}

grupo('se engancha a la app');
{
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const i = (f) => html.indexOf('src/' + f + '.js');
  prueba('se carga', i('mobile-time-machine') > 0);
  prueba('despues de la regla que usa', i('count-finish') < i('mobile-time-machine'));
  prueba('y el lector antes que ella', i('rest-paginado') > 0 && i('rest-paginado') < i('mobile-time-machine'));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
