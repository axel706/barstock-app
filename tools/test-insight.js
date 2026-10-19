#!/usr/bin/env node
/*
 * ── El aviso "este conteo no cuadra" ─────────────────────────────────
 *
 * La cuenta es:
 *
 *     esperado = lo que habia al abrir + lo que entro
 *                − consumo tipico × semanas que lleva abierto el ciclo
 *
 * El factor de semanas era un 1 implicito. Desde que los ciclos se
 * quedan abiertos hasta que el usuario dice lo contrario, eso infla el
 * esperado y hace que todo lo que se mueve salga como "contaste de
 * menos". Doce avisos de los cuales ocho eran el mismo fallo.
 *
 * Y el consumo tipico era una mediana mientras el par usaba un promedio
 * ponderado: dos ideas de "lo normal" en la misma app.
 *
 *   node tools/test-insight.js
 */

const path = require('path');
const fs = require('fs');

const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let pasa = 0, falla = 0;
function ok(n, c, d) {
  if (c) { pasa++; console.log('  ok   ' + n); }
  else { falla++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const eq = (n, got, esp) =>
  ok(n, JSON.stringify(got) === JSON.stringify(esp),
     'dio ' + JSON.stringify(got) + ', esperaba ' + JSON.stringify(esp));
// Tolerancia amplia a proposito: week_start es una fecha sin hora, asi
// que "hace una semana" son 7 dias mas las horas que lleve corridas hoy.
// Eso mueve el esperado una fraccion. Lo que se comprueba es el factor,
// no el decimal.
const cerca = (n, got, esp, tol) =>
  ok(n, Math.abs(got - esp) <= (tol === undefined ? 0.35 : tol), 'dio ' + got + ', esperaba ~' + esp);

// Hace N dias, en lunes-ISO como lo guarda week_start.
function haceDias(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

function montar(filas, contados) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;

  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://x.test', SUPABASE_KEY: 'k', LOCATION_NAME: 'Test' };
  w.state = { master: Object.keys(contados).map(i => ({ item: i, bottleSizeMl: 750 })) };

  // global y no solo w: el modulo llama a `fetch` a secas, que se
  // resuelve contra globalThis, no contra la window de jsdom.
  w.fetch = global.fetch = async () => ({ ok: true, status: 200, json: async () => filas });

  // Solo lo que count-insight le pide de verdad.
  const P = { fetchLocationId: async () => 'loc-1' };
  const src = fs.readFileSync(path.join(RAIZ, 'src/par-intelligence.js'), 'utf8');
  const m = src.match(/function ewmaStats\(weekMap\)[\s\S]*?\n  \}/);
  const ALPHA = Number((src.match(/const ALPHA = ([\d.]+)/) || [])[1]);
  // Se toma la funcion REAL del archivo del par. Si alla cambia la
  // formula, esta prueba la usa tal cual: no hay una copia que se quede
  // atras sin que nadie lo note.
  P.ewmaStats = new Function('ALPHA', 'return ' + m[0])(ALPHA);
  w.BarStockParIntelligence = P;

  w.BarStockCountSession = {
    countedItems: () => Object.keys(contados),
    bottlesFor: (item) => contados[item],
    missingRows: () => []
  };

  new Function(fs.readFileSync(path.join(RAIZ, 'src/count-insight.js'), 'utf8'))();
  return w;
}

// Ocho semanas cerradas a 2/semana, mas el ciclo abierto sin cerrar.
function serie(semanasAbierto, usos) {
  const f = [];
  const n = usos.length;
  for (let i = 0; i < n; i++) {
    f.push({
      item_name: 'Vodka',
      week_start: haceDias(7 * (n - i) + semanasAbierto * 7),
      used: usos[i], ordered: 0,
      on_hand_start: 10, on_hand_end: 10 - usos[i], on_hand_end_adjusted: null
    });
  }
  f.push({
    item_name: 'Vodka',
    week_start: haceDias(Math.round(semanasAbierto * 7)),
    used: null, ordered: 4,
    on_hand_start: 6, on_hand_end: null, on_hand_end_adjusted: null
  });
  return f;
}

(async () => {

console.log('\nlas semanas que lleva abierto el ciclo');
{
  // inicio 6 + pedido 4 = 10.  Consumo 2/sem.
  //   ciclo de 1 semana  →  10 − 2    = 8
  //   ciclo de 2 semanas →  10 − 4    = 6
  //   ciclo de 3 semanas →  10 − 6    = 4
  const usos = [2, 2, 2, 2, 2, 2, 2, 2];

  const a = await montar(serie(1, usos), { Vodka: 0 }).BarStockCountInsight.analizar(true);
  cerca('un ciclo de una semana resta una semana de consumo', a.raros[0].esperado, 8);

  const b = await montar(serie(2, usos), { Vodka: 0 }).BarStockCountInsight.analizar(true);
  cerca('uno de dos semanas resta dos', b.raros[0].esperado, 6);

  const c = await montar(serie(3, usos), { Vodka: 0 }).BarStockCountInsight.analizar(true);
  cerca('uno de tres semanas resta tres', c.raros[0].esperado, 4);

  // Este es el fallo que motivo todo: con el 1 fijo, el ciclo de tres
  // semanas tambien decia 8, y contar 4 botellas —el numero correcto—
  // saltaba como error.
  ok('contar lo correcto en un ciclo largo ya no salta',
     Math.abs(4 - c.raros[0].esperado) < 2,
     'esperado ' + c.raros[0].esperado + ' contra 4 reales');

  eq('y la pantalla sabe sobre que ventana se calculo', Math.round(c.semanasCiclo), 3);
}

console.log('\nlos topes');
{
  const usos = [2, 2, 2, 2, 2, 2, 2, 2];

  // Un conteo a los tres dias no deberia esperar medio consumo: se cuenta
  // al final, con la semana ya corrida.
  const a = await montar(serie(3 / 7, usos), { Vodka: 0 }).BarStockCountInsight.analizar(true);
  cerca('un ciclo de tres dias no baja de una semana', a.raros[0].esperado, 8);

  // Una fila abierta y olvidada no puede volver cada producto una alarma.
  // Contado 3 y no 0: con esperado en cero, un conteo de cero no salta
  // (la regla de esperado===0 pide que lo contado sea algo), y entonces
  // no habria fila donde mirar el tope.
  const b = await montar(serie(40, usos), { Vodka: 3 }).BarStockCountInsight.analizar(true);
  eq('un ciclo de 40 semanas se topa en 8', b.raros[0].semanas, 8);
}

console.log('\nlo tipico');
{
  // Plana 1.5, ponderada ~4.4: un producto que despego al final.
  // La mediana daba 0.5 y el aviso seguiria esperando lo de siempre.
  const usos = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 5, 5];
  const w = montar(serie(1, usos), { Vodka: 0 });
  const r = await w.BarStockCountInsight.analizar(true);
  const t = r.raros[0].semanal;
  ok('usa el promedio ponderado, no la mediana', t > 2,
     'dio ' + t + '; la mediana de esa serie es 0.5');

  const P = w.BarStockParIntelligence;
  const mapa = new Map();
  usos.forEach((u, i) => mapa.set(haceDias(7 * (usos.length - i) + 7), u));
  cerca('y es exactamente el mismo numero que calcula el par', t, P.ewmaStats(mapa).avg, 0.02);
}

console.log('\nlo que no debe saltar');
{
  const usos = [2, 2, 2, 2, 2, 2, 2, 2];
  // esperado 8, contado 7: una botella de diferencia.
  const a = await montar(serie(1, usos), { Vodka: 7 }).BarStockCountInsight.analizar(true);
  eq('una botella de diferencia no es un aviso', a.raros.length, 0);

  // Menos de tres semanas cerradas no es un promedio.
  const b = await montar(serie(1, [2, 2]), { Vodka: 0 }).BarStockCountInsight.analizar(true);
  eq('sin historia suficiente no se inventa un esperado', b.listo, false);
}

console.log('\nel orden aleatorio de las filas');
{
  // La consulta pide order=id.asc y el id es un UUID. A la mediana le
  // daba igual; al ponderado le cambia el resultado entero.
  const usos = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 5, 5];
  const der = serie(1, usos);
  const rev = der.slice().reverse();

  const a = await montar(der, { Vodka: 0 }).BarStockCountInsight.analizar(true);
  const b = await montar(rev, { Vodka: 0 }).BarStockCountInsight.analizar(true);
  eq('el mismo resultado llegue como llegue', a.raros[0].semanal, b.raros[0].semanal);
}

console.log('\n' + (falla ? falla + ' FALLO(S)' : 'todo bien') + '   ·   ' + pasa + ' comprobaciones');
process.exit(falla ? 1 : 0);
})();
