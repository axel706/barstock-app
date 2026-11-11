#!/usr/bin/env node
/*
 * ── Cuándo se acaba (src/run-out.js) ─────────────────────────────────
 *
 * Axel, 2026-11-08: desde lo que queda HOY, día por día, con lo que se
 * suele gastar CADA día de la semana (mediana, para que un evento no lo
 * infle); no dividir entre un promedio. Lo que se protege:
 *   1. La mediana por día de la semana: un sábado con evento no la mueve.
 *   2. Un día cargado sin ventas cuenta 0 (el lunes cerrado); un día que
 *      no se cargó no cuenta.
 *   3. Una semana movida (más gasto los fines de semana) adelanta el
 *      aviso: no es un promedio repartido.
 *   4. Los pedidos que vienen se suman el día que llegan.
 *   5. Sin historia suficiente, o sin ventas, no se dice nada.
 *   6. Más allá de dos semanas, nada.
 *
 *   node tools/test-run-out.js
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

const w = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
w.eval(leer('src/run-out.js'));
const R = w.BarStockRunOut;

// 13 semanas cargadas, del lunes 2026-08-17 al domingo 2026-11-15.
const dias = [];
for (let k = 0; k < 91; k++) dias.push({ business_date: new Date(Date.UTC(2026, 7, 17) + k * 864e5).toISOString().slice(0, 10), complete: true, closed: true });
const dow = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
// Tito's: cerrado el lunes (0), 0.5 entre semana, 1 viernes y sábado; un
// sábado con evento gasta 6.
const porDia = {};
for (const d of dias) {
  const x = dias.indexOf(d);
  const w0 = dow(d.business_date);
  if (w0 === 1) continue;
  porDia[d.business_date] = (w0 === 5 || w0 === 6) ? 1 : 0.5;
}
porDia['2026-10-10'] = 6;   // sábado con evento

grupo('lo que se suele gastar cada día');
{
  const M = R.medianas([{ producto: 'T', porDia }], dias);
  const m = M.porProducto.get('T');
  prueba('el lunes cerrado: 0', m[1] === 0);
  prueba('entre semana 0.5, viernes y sábado 1', m[2] === 0.5 && m[5] === 1 && m[6] === 1, m.join(','));
  prueba('el sábado del evento no mueve la mediana', m[6] === 1);
  prueba('13 de cada día: suficiente', M.suficiente && M.muestras.every(n => n === 13));
  const huecos = dias.filter(d => d.business_date !== '2026-11-14');
  const M2 = R.medianas([{ producto: 'T', porDia: Object.assign({}, porDia, { '2026-11-14': 0 }) }], huecos.concat([{ business_date: '2026-11-14', complete: false, closed: true }]));
  prueba('un día no cargado (incompleto) no cuenta como 0', M2.muestras[6] === 12 && M2.porProducto.get('T')[6] === 1);
  const pocos = R.medianas([{ producto: 'T', porDia }], dias.slice(0, 21));
  prueba('con 3 semanas no es suficiente', !pocos.suficiente);
}

grupo('día por día');
{
  const med = R.medianas([{ producto: 'T', porDia }], dias).porProducto.get('T');
  // Hoy jueves 19: quedan 2.6. Jue 0.5 → 2.1, vie 1 → 1.1, sáb 1 → 0.1, dom 0.5 → −0.4: se acaba el domingo.
  let p = R.proyectar({ stock: 2.6, med, viene: [], hoy: '2026-11-19' });
  prueba('se acaba el domingo', !!p && p.dia === '2026-11-22' && p.enDias === 3, JSON.stringify(p));
  // Con un promedio (≈0.64/día) duraría hasta el martes: el fin de semana adelanta el aviso.
  const prom = med.reduce((a, b) => a + b, 0) / 7;
  prueba('un promedio repartido lo habría dicho tarde', Math.ceil(2.6 / prom) - 1 > 3, String(prom));
  p = R.proyectar({ stock: 2.6, med, viene: [{ cuando: '2026-11-21T12:00:00.000Z', n: 5 }], hoy: '2026-11-19' });
  prueba('con 5 que llegan el sábado ya no se acaba esa semana', !p || p.dia > '2026-11-26', JSON.stringify(p));
  p = R.proyectar({ stock: 40, med, viene: [], hoy: '2026-11-19' });
  prueba('más allá de dos semanas: nada', p === null);
  p = R.proyectar({ stock: 3, med: [0, 0, 0, 0, 0, 0, 0], viene: [], hoy: '2026-11-19' });
  prueba('sin ventas: nada', p === null);
  p = R.proyectar({ stock: -0.4, med, viene: [], hoy: '2026-11-19' });
  prueba('un LIVE negativo: se acabó hoy', !!p && p.enDias === 0);
}

grupo('la carga y el guardián');
{
  const html = leer('index.html');
  const p = f => html.indexOf('src/' + f + '?v=');
  prueba('después del LIVE y antes de Inventory', p('run-out.js') > p('live-stock.js') && p('run-out.js') < p('mobile-inventory.js') && p('live-stock.js') > 0);
  prueba('el guardián lo vigila', /'src\/run-out\.js'/.test(leer('tools/test-toast-no-toca-conteo.js')));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
