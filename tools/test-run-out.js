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
w.eval(leer('src/toast-usage.js'));
w.eval(leer('src/pedido.js'));
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

grupo('el ritmo de hoy: lo que falta, por la hora del Sync');
{
  // Axel, 2026-11-14: con una fiesta a mediodía el prosecco iba a 12.5
  // botellas a las 3 PM, quedaban 6, y la app decía "Out Thu": como ya
  // se había pasado de un sábado normal, daba el resto del día por
  // terminado. "El problema es que la app no pueda decir SE TE ACABA HOY
  // con el ritmo de ventas que lleva."
  //
  // Con lo vendido por hora (toast_sales_days.hours, migración 041) se
  // sabe qué parte del día suele llevar vendida la barra a esa hora: la
  // mediana de los mismos días de la semana. Lo que falta de hoy es lo
  // MAYOR entre lo de siempre − lo vendido (como antes) y lo vendido ×
  // lo que le falta al día a esa hora.
  //
  // La curva del sábado de Crown (2026-11-14), de las 11 AM a las 8 PM.
  const Q = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 65, 63, 52, 87, 157, 159, 107, 128, 48, 0, 0, 0];
  const conHoras = (desde, n, cual) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      const d = new Date(Date.parse(desde + 'T12:00:00Z') + k * 7 * 864e5).toISOString().slice(0, 10);
      out.push({ business_date: d, complete: true, closed: true, hours: cual === null ? null : { q: Q, net: Q, sin_hora: 0 } });
    }
    return out;
  };
  // Cuatro sábados antes del 14 de noviembre.
  const sab = conHoras('2026-10-17', 4);
  // A las 3:00 PM de Nueva York (20:00 UTC en invierno) un sábado lleva
  // 6 + 65 + 63 + 52 = 186 de 872: el 21.3 %.
  const f = R.fraccionDelDia(sab, '2026-11-14', '2026-11-14T20:00:00Z');
  prueba('a las 3 PM un sábado lleva el 21 % del día', f != null && Math.abs(f - 186 / 872) < 1e-9, String(f));
  const f2 = R.fraccionDelDia(sab, '2026-11-14', '2026-11-14T20:30:00Z');
  prueba('a las 3:30, media hora más de su curva', f2 != null && Math.abs(f2 - (186 + 87 / 2) / 872) < 1e-9, String(f2));
  prueba('con menos de cuatro sábados, no se sabe', R.fraccionDelDia(sab.slice(1), '2026-11-14', '2026-11-14T20:00:00Z') === null);
  prueba('los días sin horas no cuentan como muestra',
    R.fraccionDelDia(sab.slice(1).concat(conHoras('2026-10-10', 1, null)), '2026-11-14', '2026-11-14T20:00:00Z') === null);
  prueba('otro día de la semana no es muestra de un sábado', R.fraccionDelDia(conHoras('2026-10-16', 4), '2026-11-14', '2026-11-14T20:00:00Z') === null);
  prueba('el mismo día (hoy, a medias) no es muestra de sí mismo',
    R.fraccionDelDia(sab.slice(1).concat([{ business_date: '2026-11-14', complete: true, closed: false, hours: { q: Q } }]), '2026-11-14', '2026-11-14T20:00:00Z') === null);
  // Pasada la medianoche sigue siendo el mismo día de negocio.
  const tarde = R.fraccionDelDia(sab, '2026-11-14', '2026-11-15T06:30:00Z');
  prueba('a la 1:30 AM del día de negocio, todo vendido', tarde === 1, String(tarde));

  // El prosecco: mediana del sábado 4, quedan 6, vendidas 12.5 a las 3 PM.
  const med = [3, 0, 1, 1, 2, 3, 4];
  let p = R.proyectar({ stock: 6, med, viene: [], hoy: '2026-11-14', hoyVendido: 12.5 });
  prueba('sin el ritmo, da hoy por terminado (lo de antes)', p && p.enDias > 0, JSON.stringify(p));
  p = R.proyectar({ stock: 6, med, viene: [], hoy: '2026-11-14', hoyVendido: 12.5, hoyFrac: f });
  prueba('con el ritmo: Out today', p && p.enDias === 0 && p.dia === '2026-11-14', JSON.stringify(p));
  // Un día flojo no retrasa el aviso: manda lo de siempre − lo vendido.
  p = R.proyectar({ stock: 3.4, med, viene: [], hoy: '2026-11-14', hoyVendido: 0.5, hoyFrac: f });
  prueba('un día flojo: lo de siempre − lo vendido sigue mandando (3.5 > 3.4: hoy)', p && p.enDias === 0, JSON.stringify(p));
  // Demasiado pronto para extrapolar (a las 11:30, el 0.3 % del día): un
  // trago vendido no puede volverse 300.
  const pronto = R.fraccionDelDia(sab, '2026-11-14', '2026-11-14T16:30:00Z');
  p = R.proyectar({ stock: 6, med, viene: [], hoy: '2026-11-14', hoyVendido: 1, hoyFrac: pronto });
  prueba('antes del 15 % del día no se extrapola', p && p.enDias > 0, JSON.stringify({ pronto, p }));

  // Cuánto pedir hasta el domingo, con el mismo resto de hoy.
  let c = R.cuantoPedir({ stock: 6, med, viene: [], hoy: '2026-11-14', hoyVendido: 12.5, hoyFrac: f });
  const resto = 12.5 * (1 - f) / f;
  prueba('cuánto pedir usa el mismo resto de hoy', Math.abs(c.vende - (resto + 3)) < 1e-9, JSON.stringify(c));

  const ro = leer('src/run-out.js'), mr = leer('src/morning-report.js'), tu = leer('src/toast-usage.js');
  prueba('ahora() pasa el ritmo a proyectar', /proyectar\(\{[^}]*hoyFrac/.test(ro));
  prueba('…con la hora del Sync de hoy, no la del reloj', /fetched_at/.test(ro));
  prueba('el correo de la mañana se lo pasa a cuantoPedir', /cuantoPedir\(\{[^}]*hoyFrac: f\.hoyFrac/.test(mr));
  prueba('los días cargados se leen con sus horas', /select=business_date,complete,closed,fetched_at,hours/.test(tu));
}

grupo('la fecha prudente: media botella de margen');
{
  // Axel, 2026-11-14, con el Dad's Hat: ≈1.0 en la estantería un sábado
  // por la noche y "Out Wed". "No sé si hay más de una, pero puede haber
  // menos de una." El LIVE es un estimado y la fecha se calculaba como si
  // fuera exacto. Hasta que el esperado mida cuánto falla cada producto,
  // la fecha se calcula con media botella menos: avisar antes es el lado
  // seguro. Lo que queda (el número grande) no cambia.
  // El Dad's Hat: ~0.6 los días abiertos, el lunes cerrado.
  const med = [0.6, 0, 0.6, 0.6, 0.6, 0.6, 0.6];
  // Sábado 14 a última hora: lo de hoy ya está vendido.
  let p = R.proyectar({ stock: 1.0, med, viene: [], hoy: '2026-11-14', hoyVendido: 0.6 });
  prueba('sin margen: dura hasta el martes', p && p.dia === '2026-11-17', JSON.stringify(p));
  p = R.proyectar({ stock: 1.0, med, viene: [], hoy: '2026-11-14', hoyVendido: 0.6, margen: R.MARGEN });
  prueba('con media botella de margen: el domingo', p && p.dia === '2026-11-15', JSON.stringify(p));
  prueba('el margen es media botella', R.MARGEN === 0.5, String(R.MARGEN));
  // Cuánto pedir cuadra con la fecha: si dice que se acaba el domingo,
  // el correo no puede decir "Order 0".
  let c = R.cuantoPedir({ stock: 1.0, med, viene: [], hoy: '2026-11-14', hoyVendido: 0.6 });
  prueba('sin margen, para llegar al domingo no hace falta pedir', c.pedir === 0, JSON.stringify(c));
  c = R.cuantoPedir({ stock: 1.0, med, viene: [], hoy: '2026-11-14', hoyVendido: 0.6, margen: R.MARGEN });
  prueba('con margen, pide 1: cuadra con "Out Sun"', c.pedir === 1, JSON.stringify(c));
  // Sin margen, lo de siempre: el resto de las pruebas de arriba no
  // cambian, y quien no lo pide no lo recibe.
  p = R.proyectar({ stock: 2.6, med: R.medianas([{ producto: 'T', porDia }], dias).porProducto.get('T'), viene: [], hoy: '2026-11-19' });
  prueba('sin pedirlo, sin margen (como antes)', p && p.dia === '2026-11-22', JSON.stringify(p));

  const ro = leer('src/run-out.js'), mr = leer('src/morning-report.js'), ru = leer('src/running-out.js');
  prueba('ahora() calcula la fecha con el margen de cada fila', /proyectar\(\{[^}]*margen\b/.test(ro) && /margenDe\(f\)/.test(ro));
  prueba('y lo deja en la fila para el correo', /Object\.assign\(\{\}, f, \{[^}]*margen/.test(ro));
  prueba('el correo pide con el mismo margen', /cuantoPedir\(\{[^}]*margen: f\.margen/.test(mr));
  // Axel, 2026-11-14, con la lista ya en producción: "avisarme que Don
  // Julio se acaba en 19 días, Luccio en 8 […] exactamente de qué me
  // sirve? Eso no debería ni aparecer junto con Running out first". La
  // media botella fija los metía: 0.5 − 0.5 = 0. Dos correcciones:
  //   · lo que Toast no descuenta (Pour·IQ) va SIN margen: su número es
  //     lo contado, no un estimado;
  //   · lo que Toast sí, con un margen del tamaño de la duda: una parte
  //     de lo que se restó desde el conteo, nunca más de MARGEN.
  prueba('lo que Toast no vende (Pour·IQ) va sin margen', !/MARGEN/.test(ru));
  prueba('el margen de una fila es una parte de lo vendido, hasta MARGEN',
    R.margenDe({ vendido: 6 }) === 0.5 && Math.abs(R.margenDe({ vendido: 0.4 }) - 0.4 * R.MARGEN_PARTE) < 1e-9 && R.margenDe({ vendido: 0 }) === 0,
    [R.margenDe({ vendido: 6 }), R.margenDe({ vendido: 0.4 }), R.margenDe({ vendido: 0 })].join(','));
  // Un producto lento casi sin vender: 0.5 en la estantería, 0.02 al día.
  const lento = [0.02, 0, 0.02, 0.02, 0.02, 0.02, 0.02];
  p = R.proyectar({ stock: 0.5, med: lento, viene: [], hoy: '2026-11-14', margen: R.margenDe({ vendido: 0.1 }) });
  prueba('un producto lento no se da por acabado por el margen', p === null || p.enDias >= 7, JSON.stringify(p));
}

grupo('fase 2 de docs/plan-pedido.md: la demanda de pedido.js, con Pour·IQ');
// El Nino del 2026-11-18: 3.1 botellas un miércoles que vende 4, y la
// mediana de 13 semanas lo daba por durar. Ahora lo de cada día es lo
// MAYOR de Pour·IQ y lo reciente de Toast, con un colchón del 80 %.
(async () => {
  const U = w.BarStockToastUsage;
  const guarda = { ventasDesde: U.ventasDesde, diaDeNegocio: U.diaDeNegocio, now: w.Date.now };
  const NY10 = Date.parse('2026-11-18T15:00:00Z');   // miércoles, 10 AM en Nueva York
  U.ventasDesde = async () => ({ productos: [{ producto: 'T', porDia }], dias });
  U.diaDeNegocio = () => '2026-11-18';
  w.Date.now = () => NY10;
  w.state = { master: [{ item: 'T', code: '' }] };
  w.BarStockLive = { ahora: async () => ({ estado: 'listo', conteo: null, desde: null,
    filas: [{ producto: 'T', live: 2.6, viene: [], vendido: 0 }] }) };
  try {
    w.parAdjustments = null;
    const sin = (await R.ahora()).filas[0];
    w.parAdjustments = new Map([['T||', { status: 'active', avgUsed: 14, stdDev: 2, normalWeeks: 10 }]]);
    const con = (await R.ahora()).filas[0];
    prueba('sin Pour·IQ, la demanda de Toast (≈4.5 a la semana): aguanta hasta el fin de semana', sin.dem && sin.dem.fuente === 'toast' && sin.enDias >= 2, JSON.stringify([sin.agota, sin.enDias, sin.dem && sin.dem.fuente]));
    prueba('con Pour·IQ a 14, se acaba hoy o mañana', con.dem && con.dem.fuente === 'pouriq' && con.enDias != null && con.enDias <= 1, JSON.stringify([con.agota, con.enDias, con.dem && con.dem.semanal]));
    prueba('la fila lleva lo de cada día de la demanda (med) y la demanda (dem)', con.med === con.dem.porDia && Math.abs(con.med.reduce((a, b) => a + b, 0) - 14) < 1e-9);
    const c0 = R.cuantoPedir({ stock: 2.6, med: con.med, viene: [], hoy: '2026-11-18' });
    const c1 = R.cuantoPedir({ stock: 2.6, dem: con.dem, viene: [], hoy: '2026-11-18' });
    prueba('"Order N" lleva el mismo colchón que el aviso', c1.colchon > 0 && c1.pedir > c0.pedir, JSON.stringify([c0, c1]));
  } catch (e) { prueba('ahora() con la demanda nueva', false, String(e && e.stack || e)); }
  finally { U.ventasDesde = guarda.ventasDesde; U.diaDeNegocio = guarda.diaDeNegocio; w.Date.now = guarda.now; }

  // La entrega cuenta a SU hora: 0.8 botellas un jueves que gasta 2 y
  // 12 llegan a las 4 PM. Antes la entrega se sumaba al empezar el día.
  const p = R.proyectar({ stock: 0.8, med: [2, 2, 2, 2, 2, 2, 2], viene: [{ cuando: '2026-11-19T21:00:00Z', n: 12 }], hoy: '2026-11-19' });
  prueba('lo que llega a las 4 PM no salva el mediodía', p && p.dia === '2026-11-19', JSON.stringify(p));

  const ro = leer('src/run-out.js'), idx = leer('index.html'), cron = leer('lib/morning-cron.js'), lc = leer('src/live-cache.js'), mr = leer('src/morning-report.js');
  prueba('una sola cuenta: proyectar() usa pedido.seAcaba', /P\.seAcaba\(/.test(ro) && !/s -= restaDia/.test(ro));
  const pos = (f) => idx.indexOf('src/' + f + '?');
  prueba('pedido.js se carga antes que run-out.js', pos('pedido.js') > 0 && pos('pedido.js') < pos('run-out.js'));
  const mods = (cron.match(/const MODULOS = \[([\s\S]*?)\]/) || [])[1] || '';
  const im = (m) => mods.indexOf("'" + m + "'");
  prueba('el correo en el servidor carga Pour·IQ y pedido antes de run-out', im('par-intelligence') > 0 && im('pedido') > 0 && im('week') >= 0 && im('week') < im('par-intelligence') && im('pedido') < im('run-out'), mods);
  prueba('y calcula parAdjustments antes de los datos', /ctx\.parAdjustments = await ctx\.BarStockParIntelligence\.getPendingAdjustments/.test(cron));
  prueba('Pour·IQ llega tarde en la app: avisa y el LIVE se rehace', /emit\('parAdjustmentsUpdated'/.test(idx) && /'parAdjustmentsUpdated'\]\) window\.BarStockEvents\.on\(ev, caducar\)/.test(lc));
  prueba('el correo y la lista piden con la demanda', /dem: f\.dem/.test(mr) && /dem: a\.dem/.test(lc));

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
