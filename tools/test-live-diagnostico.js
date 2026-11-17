#!/usr/bin/env node
/*
 * ── Live vs count: qué pudo pasar (src/live-diagnostico.js) ──────────
 *
 * Axel, 2026-11-17: "que empiece a sugerir qué estuvo mal, qué
 * artículos, si es receta, tuvo más o menos de lo esperado". Las reglas
 * son las de docs/plan-esperado.md (sección 4). Lo que se protege:
 *
 *   1. Cada causa sale sólo con los números que la sostienen: una caja
 *      justa, una semana que deshace la anterior, la misma proporción
 *      varias semanas, cuadraba y de pronto falta. Si no, "too early".
 *   2. La regla de qué se aleja es UNA, la de Finish count.
 *   3. Lo que Toast no vende no sale (sin ventas, todo parecería faltar).
 *   4. Un ciclo de hace semanas no se presenta como "el del domingo".
 *   5. Sólo lee.
 *
 *   node tools/test-live-diagnostico.js
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

global.window = global;
new Function(fs.readFileSync(path.join(RAIZ, 'src/live-diagnostico.js'), 'utf8'))();
const DG = window.BarStockLiveDiag;

// Ciclos del más nuevo (c0, cerrado el domingo 22) al más viejo.
const CICLOS = [0, 1, 2, 3].map(i => ({ id: 'c' + i, end_day: ['2026-11-22', '2026-11-15', '2026-11-08', '2026-11-01'][i],
  status: 'final', unconverted: i ? [] : [{ nombre: 'Espresso Martini', motivo: 'Recipe missing', unidades: 14.4 },
    { nombre: 'Corona', motivo: 'Not matched (Beer)', unidades: 30 }] }));
// La historia de un producto: [diferencia, vendido] por semana, de la más nueva a la más vieja.
const hist = (item, xs, o) => xs.map(([dif, sold], i) => Object.assign({ cycle_id: 'c' + i, item_name: item,
  sold, difference: dif, expected: 5, counted: 5 + dif, unit_price: 20, in_toast: true }, o || {}));
const uno = (item, xs, o) => {
  const r = DG.diagnosticar({ ciclos: CICLOS, filas: hist(item, xs, o), proveedor: () => 'Southern' });
  return r.lista.find(x => x.item === item) || null;
};

grupo('qué sale: la misma regla que Finish count');
{
  prueba('más de 1 botella y más de ¼ de lo vendido: sale', !!uno('A', [[-2, 6]]));
  prueba('1 botella exacta: no', !uno('A', [[-1, 2]]));
  prueba('2 botellas de algo que vende 40: no', !uno('A', [[-2, 40]]));
  prueba('lo que Toast no vende: no', !uno('A', [[-3, 0]], { in_toast: false }));
  prueba('Finish count usa esta regla, no una copia', /DG\.seAleja\(dif, vendido\)/.test(fs.readFileSync(path.join(RAIZ, 'src/live-expected.js'), 'utf8')) &&
    !/Math\.abs\(dif\) > UMBRAL && Math\.abs\(dif\) > PARTE/.test(fs.readFileSync(path.join(RAIZ, 'src/live-expected.js'), 'utf8')));
  const r = DG.diagnosticar({ ciclos: CICLOS, filas: hist('Viejo', [[0, 1], [-5, 4]]).slice(1), proveedor: () => '' });
  prueba('lo que no se contó el domingo no sale (aunque faltara antes)', r.lista.length === 0, JSON.stringify(r.lista));
}

grupo('las causas');
{
  let x = uno('Aperol', [[6, 4]]);
  prueba('sobra justo una caja (6): sin factura', x && x.causa === 'caja' && x.caja === 6 && x.proveedor === 'Southern', JSON.stringify(x));
  prueba('12 también', (uno('Aperol', [[11.9, 10]]) || {}).caja === 12);
  prueba('faltan 6: no es una caja', (uno('Aperol', [[-6, 4]]) || {}).causa !== 'caja');
  x = uno('Jameson', [[2.5, 6], [-2.4, 6]]);
  prueba('deshace la semana anterior: error al contar', x && x.causa === 'conteo' && x.antes === -2.4, JSON.stringify(x));
  prueba('si no la deshace (falta otra vez): no es error al contar', (uno('Jameson', [[2.5, 6], [2.4, 6]]) || {}).causa !== 'conteo');
  x = uno("Tito's", [[-2.5, 8], [-2.8, 9], [-2, 7]]);
  prueba('falta la misma parte tres semanas: receta, 3 semanas', x && x.causa === 'receta' && x.semanas === 3, JSON.stringify(x));
  prueba('con cuánto se usa de más (≈30 %)', x && x.desvio === 30, JSON.stringify(x));
  x = uno("Tito's", [[-2.5, 8], [-2.8, 9], [0, 7]]);
  prueba('dos semanas: receta, 2', x && x.causa === 'receta' && x.semanas === 2, JSON.stringify(x));
  x = uno("Tito's", [[-2.5, 8], [-12, 15]]);
  prueba('dos semanas con proporciones muy distintas: no es receta', x && x.causa !== 'receta', JSON.stringify(x));
  x = uno('Hendricks', [[-2, 4], [0.1, 4], [-0.3, 5], [0, 4]]);
  prueba('cuadraba tres semanas y de pronto falta: merma', x && x.causa === 'merma' && x.cuadro === 3, JSON.stringify(x));
  prueba('con menos historia, no se llama merma', (uno('Hendricks', [[-2, 4], [0.1, 4]]) || {}).causa === 'pronto');
  prueba('sobra de pronto: no es merma', (uno('Hendricks', [[2, 4], [0.1, 4], [0, 5], [0, 4]]) || {}).causa !== 'merma');
  prueba('una semana sola: too early', (uno('Casamigos', [[-1.1, 2.2]]) || {}).causa === 'pronto');
  // Una semana sin Toast corta la racha: no se sabe qué pasó.
  const filas = hist("Tito's", [[-2.5, 8], [-2.8, 9], [-2, 7]]);
  filas[1].in_toast = false;
  x = DG.diagnosticar({ ciclos: CICLOS, filas, proveedor: () => '' }).lista[0];
  prueba('una semana sin Toast corta la historia', x && x.causa === 'pronto', JSON.stringify(x));
}

grupo('un ciclo que no cubrió una semana no se diagnostica (Crown, 2026-11-15)');
{
  // Medido desde el reinicio a cero de ese domingo: dos horas, Tito's
  // "0 + 0 − 0.1" contra 8.3 contados.
  const C2 = [Object.assign({}, CICLOS[0], { cycle_start: '2026-11-16T00:03:45Z', cycle_end: '2026-11-16T02:37:04Z' })].concat(CICLOS.slice(1));
  const r = DG.diagnosticar({ ciclos: C2, filas: hist("Tito's", [[8.35, 0.1]]), proveedor: () => '' });
  prueba('no saca conclusiones: lo marca, con sus horas', r.hay === true && r.invalido === true && r.horas === 3 && !r.lista, JSON.stringify(r));
  // Y como historia tampoco cuenta: el ciclo corto de en medio no hace de semana.
  const C3 = CICLOS.map((c, i) => Object.assign({}, c, i === 1
    ? { cycle_start: '2026-11-15T20:00:00Z', cycle_end: '2026-11-15T22:00:00Z' }
    : { cycle_start: '2026-10-01T00:00:00Z', cycle_end: '2026-10-08T00:00:00Z' }));
  const x = DG.diagnosticar({ ciclos: C3, filas: hist('Jameson', [[2.5, 6], [-2.4, 6]]), proveedor: () => '' }).lista[0];
  prueba('un ciclo corto en la historia no cuenta como la semana anterior', x && x.causa !== 'conteo', JSON.stringify(x));
}

grupo('el resumen');
{
  const filas = [].concat(hist('A', [[-2, 6]], { unit_price: 10 }), hist('B', [[-3, 6]], { unit_price: 30 }), hist('C', [[6, 4]], { unit_price: 5 }));
  const r = DG.diagnosticar({ ciclos: CICLOS, filas, proveedor: () => '' });
  prueba('lo que más dinero pesa primero', r.lista.map(x => x.item).join(',') === 'B,C,A', r.lista.map(x => x.item).join(','));
  prueba('faltante y sobrante en dinero', r.corto === 110 && r.sobra === 30, JSON.stringify([r.corto, r.sobra]));
  prueba('con la parte de lo vendido', r.lista[0].parte === 50 && r.lista[0].dinero === -90);
  prueba('lo vendido sin receta, del ciclo (sin lo que no es receta)', r.sinConvertir.length === 1 && r.sinConvertir[0].nombre === 'Espresso Martini' && r.sinConvertir[0].unidades === 14, JSON.stringify(r.sinConvertir));
  const muchos = [];
  for (let i = 0; i < 9; i++) muchos.push(...hist('P' + i, [[-2 - i, 6]]));
  const m = DG.diagnosticar({ ciclos: CICLOS, filas: muchos, proveedor: () => '' });
  prueba('como mucho seis uno a uno, y cuántos más', m.lista.length === 6 && m.mas === 3 && m.total === 9);
  prueba('provisional se dice', DG.diagnosticar({ ciclos: [Object.assign({}, CICLOS[0], { status: 'provisional' })], filas: [], proveedor: () => '' }).provisional === true);
  prueba('sin ciclos: hay = false', DG.diagnosticar({ ciclos: [], filas: [] }).hay === false);
}

grupo('leer: sólo lee, y no presenta un ciclo viejo como el del domingo');
(async () => {
  const pedidas = [];
  window.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k' };
  new Function(fs.readFileSync(path.join(RAIZ, 'src/rest-paginado.js'), 'utf8'))();
  let ciclos = [{ id: 'c0', end_day: '2026-11-22', status: 'final', unconverted: [] }];
  global.fetch = async (u, o) => {
    pedidas.push({ u: String(u), m: (o && o.method) || 'GET' });
    const filas = /live_expected_cycles\?/.test(u) ? ciclos : /live_expected\?/.test(u) ? hist('A', [[-2, 6]]).slice(0, 1) : [];
    return { ok: true, json: async () => filas, text: async () => JSON.stringify(filas) };
  };
  window.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-1' };
  window.state = { master: [{ item: 'A', vendor: 'LOOP' }] };
  let r = await DG.semana('2026-11-16');
  prueba('lee el último ciclo y sus filas', r.hay && r.lista.length === 1 && r.lista[0].proveedor === 'LOOP', JSON.stringify(r).slice(0, 200));
  prueba('de su locación', pedidas.every(p => /location_id=eq\.loc-1|cycle_id=in\.\(c0\)/.test(p.u)), pedidas.map(p => p.u).join(' | '));
  prueba('y sólo lee', pedidas.every(p => p.m === 'GET'));
  ciclos = [{ id: 'cv', end_day: '2026-11-08', status: 'final', unconverted: [] }];
  r = await DG.semana('2026-11-16');
  prueba('el último conteo es de antes de la semana pasada: no hay', r.hay === false, JSON.stringify(r));

  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const pos = (f) => html.indexOf('src="src/' + f);
  prueba('se carga antes de quien lo usa', pos('live-diagnostico.js') > pos('rest-paginado.js') && pos('live-diagnostico.js') < pos('live-expected.js') &&
    pos('live-diagnostico.js') < pos('morning-report.js') && pos('rest-paginado.js') > 0);
  prueba('el servidor lo corre para el correo del lunes', require(path.join(RAIZ, 'lib/morning-cron.js')).MODULOS.includes('live-diagnostico'));
  prueba('el guardián vigila que no escriba en el conteo', /'src\/live-diagnostico\.js'/.test(fs.readFileSync(path.join(RAIZ, 'tools/test-toast-no-toca-conteo.js'), 'utf8')));

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
