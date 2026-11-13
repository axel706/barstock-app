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

grupo('cuánto pedir para llegar al domingo');
{
  // Axel, 2026-11-12, para el correo de la mañana: si se acaba el
  // miércoles hacen falta más que si se acaba el sábado. Lo que se suele
  // vender cada día desde HOY hasta el DOMINGO, incluido todo el domingo,
  // menos lo que queda y lo que llega antes, redondeado hacia arriba. No
  // hasta la siguiente entrega del proveedor: a mitad de semana se pide
  // en LOOP, que se recoge al momento.
  // [dom, lun, mar, mié, jue, vie, sáb]
  const med = [1.2, 0, 0.5, 0.8, 1.4, 2.6, 3.1];
  // Jueves 2026-11-12 → jue+vie+sáb+dom = 1.4+2.6+3.1+1.2 = 8.3
  let c = R.cuantoPedir({ stock: 0.6, med, viene: [], hoy: '2026-11-12' });
  prueba('hasta el domingo de esa semana', c.hasta === '2026-11-15', c.hasta);
  prueba('jueves a domingo se suele vender 8.3', Math.abs(c.vende - 8.3) < 1e-9, String(c.vende));
  prueba('con 0.6 en la estantería, pedir 8', c.pedir === 8, String(c.pedir));
  // El sábado: sáb + dom = 4.3; con 2.1 → faltan 2.2 → 3.
  c = R.cuantoPedir({ stock: 2.1, med, viene: [], hoy: '2026-11-14' });
  prueba('si es sábado, mucho menos: 3', c.pedir === 3 && Math.abs(c.vende - 4.3) < 1e-9, JSON.stringify(c));
  // Lo que viene antes del domingo se resta; lo que llega el lunes, no.
  c = R.cuantoPedir({ stock: 0.6, med, viene: [{ cuando: '2026-11-13T21:00:00Z', n: 6 }, { cuando: '2026-11-16T15:00:00Z', n: 12 }], hoy: '2026-11-12' });
  prueba('lo que llega antes del domingo cuenta; lo del lunes, no', c.llega === 6 && c.pedir === 2, JSON.stringify(c));
  // El domingo mismo: sólo el domingo.
  c = R.cuantoPedir({ stock: 0.5, med, viene: [], hoy: '2026-11-15' });
  prueba('el domingo, sólo lo que queda del domingo', c.hasta === '2026-11-15' && Math.abs(c.vende - 1.2) < 1e-9 && c.pedir === 1, JSON.stringify(c));
  // Llega de sobra: nada que pedir.
  c = R.cuantoPedir({ stock: 9, med, viene: [], hoy: '2026-11-12' });
  prueba('con de sobra, cero', c.pedir === 0, String(c.pedir));
  // Un LIVE negativo (se vendió más de lo contado) no regala botellas.
  c = R.cuantoPedir({ stock: -0.4, med, viene: [], hoy: '2026-11-14' });
  prueba('lo negativo cuenta como cero, no resta', c.pedir === 5, String(c.pedir));
  // 8.3 − 0.3 = 8.000000000001 en coma flotante no puede pedir 9.
  c = R.cuantoPedir({ stock: 0.3, med, viene: [], hoy: '2026-11-12' });
  prueba('una suma exacta no sube una botella por la coma flotante', c.pedir === 8, String(c.pedir));
}

grupo('hoy cargado a medias no se cuenta dos veces');
{
  // Axel, 2026-11-13, antes del "sync" manual de hoy: si lo de hoy ya
  // está cargado, el LIVE ya lo restó. Restar además el día entero lo
  // contaría dos veces. El día 0 resta sólo lo que falta.
  const med = [3, 1, 1, 2, 2, 4, 5];               // jueves = 2
  // Jueves 19: LIVE 2.5, ya vendidas 1.5 hoy → falta 0.5 hoy → 2.0
  // al cerrar; viernes 4 → se acaba el viernes.
  let p = R.proyectar({ stock: 2.5, med, viene: [], hoy: '2026-11-19', hoyVendido: 1.5 });
  prueba('con lo de hoy cargado, hoy resta sólo lo que falta', p && p.dia === '2026-11-20', JSON.stringify(p));
  p = R.proyectar({ stock: 2.5, med, viene: [], hoy: '2026-11-19' });
  prueba('sin nada cargado de hoy, hoy cuenta entero (como antes)', p && p.dia === '2026-11-20' && p.enDias === 1, JSON.stringify(p));
  p = R.proyectar({ stock: 1.5, med, viene: [], hoy: '2026-11-19', hoyVendido: 1.5 });
  prueba('lo que queda no se acaba hoy si lo de hoy ya se restó', p && p.dia === '2026-11-20', JSON.stringify(p));
  p = R.proyectar({ stock: 1.5, med, viene: [], hoy: '2026-11-19' });
  prueba('…y sí, sin cargar, con el día entero por delante', p && p.dia === '2026-11-19', JSON.stringify(p));
  p = R.proyectar({ stock: 0.4, med, viene: [], hoy: '2026-11-19', hoyVendido: 6 });
  prueba('vender hoy más de lo de siempre no resta en negativo', p && p.dia === '2026-11-20', JSON.stringify(p));

  // Cuánto pedir hasta el domingo, el mismo día 0. Jueves 12: jueves 2 +
  // viernes 4 + sábado 5 + domingo 3 = 14; con 1.5 vendidas hoy, 12.5.
  let c = R.cuantoPedir({ stock: 0.6, med, viene: [], hoy: '2026-11-12', hoyVendido: 1.5 });
  prueba('cuánto pedir resta de hoy sólo lo que falta', Math.abs(c.vende - 12.5) < 1e-9 && c.pedir === 12, JSON.stringify(c));
  c = R.cuantoPedir({ stock: 0.6, med, viene: [], hoy: '2026-11-12' });
  prueba('y sin cargar, el día entero (como antes)', c.vende === 14 && c.pedir === 14, JSON.stringify(c));
  const mr = leer('src/morning-report.js');
  prueba('el correo de la mañana le pasa lo vendido hoy', /cuantoPedir\(\{[^}]*hoyVendido: f\.hoyVendido/.test(mr));
  const ro = leer('src/run-out.js');
  prueba('ahora() lo saca de la misma lectura que el LIVE', /p\.porDia && p\.porDia\[hoy\]/.test(ro) && /proyectar\(\{[^}]*hoyVendido/.test(ro));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
