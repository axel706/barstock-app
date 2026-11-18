#!/usr/bin/env node
/*
 * ── Cuánto pedir y cuándo se acaba (src/pedido.js) ───────────────────
 *
 * Axel, 2026-11-18 (docs/plan-pedido.md): que la app enseñe cuánto pedir
 * para que cada producto dure de entrega a entrega de su proveedor, sin
 * llenar el estante, y que avise con tiempo. Lo que se protege:
 *
 *   1. La tendencia sigue lo reciente (el Nino vende más que en agosto),
 *      pero una semana de fiesta sola no la mueve (mediana de 4).
 *   2. Lo que se usa: lo MAYOR de Pour·IQ y lo reciente de Toast, sin
 *      multiplicar (la primera versión contaba lo reciente dos veces).
 *   3. Se pide lo de UNA vuelta del proveedor: uso + colchón − lo que
 *      habrá al llegar. Nunca negativo. Vino en múltiplos de 3.
 *   4. El colchón cubre ~80 % (0.84 σ), crece con lo que se USA (no
 *      con el reloj: un lunes cerrado no lo agranda) y la σ es la de los
 *      conteos, sin escalar y como mucho media semana.
 *   5. El aviso: lo típico más el colchón (no un día fuerte cada día), y
 *      la entrega a su hora: la de las 4 PM no cubre el mediodía.
 *   6. Con los números del Nino del 18 de noviembre (3.1 botellas un
 *      miércoles), se acaba hoy o mañana: la regla vieja no lo veía.
 *
 *   node tools/test-pedido.js
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
new Function(fs.readFileSync(path.join(RAIZ, 'src/pedido.js'), 'utf8'))();
const P = window.BarStockPedido;
const NY = (s) => { // 'AAAA-MM-DD HH:MM' en Nueva York → ms
  const [d, h] = s.split(' '); const [hh, mm] = h.split(':').map(Number);
  return P.inicio(d) + ((hh - 4) * 60 + mm) * 60000;
};

// ── Los días del Nino Ardevi que Axel sacó de la app (Crown) ──────────
const NINO = { '2026-08-19': .39, '2026-08-20': 1.34, '2026-08-21': 2.23, '2026-08-22': 1.56, '2026-08-23': .95,
  '2026-08-26': .51, '2026-08-27': .63, '2026-08-28': 2.33, '2026-08-29': 3, '2026-08-30': 3.57,
  '2026-09-02': .18, '2026-09-03': 0, '2026-09-04': 1.99, '2026-09-05': 1.99, '2026-09-06': 2.11,
  '2026-09-09': .57, '2026-09-10': 1.52, '2026-09-11': 2.46, '2026-09-12': 5.34, '2026-09-13': 2.46,
  '2026-09-16': 1.22, '2026-09-17': 1.14, '2026-09-18': 2.46, '2026-09-19': 4.75, '2026-09-20': 3.31,
  '2026-09-23': 2.96, '2026-09-24': 2.58, '2026-09-25': 2.09, '2026-09-26': 3.23, '2026-09-27': 1.68,
  '2026-09-30': 1.58, '2026-10-01': 10.33, '2026-10-02': 2.94, '2026-10-03': 1.89, '2026-10-04': 2.86,
  '2026-10-07': 1.62, '2026-10-08': .93, '2026-10-09': 5.6, '2026-10-10': 9.07, '2026-10-11': 3.57,
  '2026-10-14': 1.3, '2026-10-15': 5.42, '2026-10-16': 6.24, '2026-10-17': 6.25, '2026-10-18': 4.82,
  '2026-10-21': 2.88, '2026-10-22': 5.5, '2026-10-23': 3.1, '2026-10-24': 4.99, '2026-10-25': 1.91,
  '2026-10-28': 1.28, '2026-10-29': 2.8, '2026-10-30': 7.47, '2026-10-31': 1.81, '2026-11-01': 3.04,
  '2026-11-04': 4.16, '2026-11-05': 3.23, '2026-11-06': 6.27, '2026-11-07': 10.63, '2026-11-08': 3.82,
  '2026-11-11': 4.91, '2026-11-12': 3.29, '2026-11-13': 7.24, '2026-11-14': 19.72, '2026-11-15': 7.87 };
// Lunes y martes cargados (sin ventas en lo que dio Axel): todas las
// semanas quedan enteras.
const cargados = [];
for (let d = '2026-08-17'; d <= '2026-11-16'; d = new Date(Date.parse(d + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10)) cargados.push(d);
const HOY = '2026-11-18';

grupo('1 · la tendencia');
{
  const d = P.demanda({ pouriq: null, toast: { porDia: NINO, cargados }, hoy: HOY });
  // Medianas semanales: las 13 → 16.4; las 4 últimas → 23.2.
  prueba('sube con lo reciente (≈1.4×)', d.tendencia > 1.35 && d.tendencia < 1.5, String(d.tendencia));
  const fiesta = Object.assign({}, NINO, { '2026-11-14': 80 });
  const df = P.demanda({ pouriq: null, toast: { porDia: fiesta, cargados }, hoy: HOY });
  prueba('una semana de fiesta sola no la mueve (mediana de 4)', Math.abs(df.tendencia - d.tendencia) < 1e-9, df.tendencia + ' vs ' + d.tendencia);
  const loco = {}; for (const k of Object.keys(NINO)) loco[k] = k >= '2026-10-19' ? NINO[k] * 20 : NINO[k];
  prueba('con tope: nunca más de 3×', P.demanda({ pouriq: null, toast: { porDia: loco, cargados }, hoy: HOY }).tendencia === 3);
  prueba('sin Toast suficiente, 1', P.demanda({ pouriq: { avg: 10, sd: 2, semanas: 8 }, toast: null, hoy: HOY }).tendencia === 1);
}

grupo('2 · lo que se usa por semana: lo MAYOR de Pour·IQ y lo reciente de Toast, sin multiplicar');
{
  // Lo reciente de Toast del Nino: la mediana de las 4 últimas, 23.2.
  const d = P.demanda({ pouriq: { avg: 28.9, sd: 6, semanas: 10 }, toast: { porDia: NINO, cargados }, hoy: HOY });
  // La primera versión multiplicaba 28.9 × 1.42 = 41: el Nino a 42 por
  // semana en la tabla de Crown (2026-11-18), contando dos veces lo reciente.
  prueba('Pour·IQ más alto: manda Pour·IQ, sin la tendencia encima (no 41)', Math.abs(d.semanal - 28.9) < 1e-9 && d.fuente === 'pouriq', d.semanal + ' ' + d.fuente);
  const r = P.demanda({ pouriq: { avg: 12, sd: 3, semanas: 10 }, toast: { porDia: NINO, cargados }, hoy: HOY });
  prueba('lo reciente de Toast más alto: manda Toast (el producto se disparó)', Math.abs(r.semanal - 23.245) < 0.01 && r.fuente === 'toast-recent', r.semanal + ' ' + r.fuente);
  // Escalada a lo de ahora, el Cinzano Dry (Pour·IQ 0.3, Toast 1.6) traía
  // un colchón de 4.5 para usar 1.6 (tabla de Crown, 2026-11-18).
  prueba('y la σ de los conteos, SIN escalar: lo de más es tendencia, no ruido', Math.abs(r.sigma - 3) < 1e-9, String(r.sigma));
  const k = P.demanda({ pouriq: { avg: 11.3, sd: 9.4, semanas: 10 }, toast: null, hoy: HOY });
  prueba('la σ nunca pasa de media semana (el Kamora: 9.4 sobre 11.3)', Math.abs(k.sigma - 5.65) < 1e-9, String(k.sigma));
  prueba('la tendencia queda como dato, no entra en la cuenta', d.tendencia > 1.35 && Math.abs(d.semanal - 28.9) < 1e-9);
  prueba('la semana se reparte con la forma de Toast (el lunes, 0)', d.porDia[1] === 0 && d.porDia[6] > d.porDia[3], JSON.stringify(d.porDia.map(x => +x.toFixed(2))));
  prueba('y suma lo de la semana', Math.abs(d.porDia.reduce((a, b) => a + b, 0) - d.semanal) < 1e-9);
  const t = P.demanda({ pouriq: { avg: 16, sd: 4, semanas: 2 }, toast: { porDia: NINO, cargados }, hoy: HOY });
  prueba('Pour·IQ con menos de 4 semanas: Toast (mediana de las 4 últimas)', t.fuente === 'toast' && Math.abs(t.semanal - 23.245) < 0.01, t.fuente + ' ' + t.semanal);
  const s2 = P.demanda({ pouriq: { avg: 14, sd: 2, semanas: 6 }, toast: null, hoy: HOY });
  prueba('sin Toast: Pour·IQ repartido por igual', s2.fuente === 'pouriq' && s2.porDia.every(x => Math.abs(x - 2) < 1e-9));
}

grupo('3 y 4 · cuánto pedir para una vuelta del proveedor');
{
  // 1 botella al día, sin variación. Llega el miércoles a las 4 AM y el
  // siguiente, una semana después.
  const dem = { porDia: [1, 1, 1, 1, 1, 1, 1], semanal: 7, sigma: 0 };
  const base = { dem, viene: [], ahora: P.inicio('2026-11-16'), llegada: P.inicio('2026-11-18'), siguiente: P.inicio('2026-11-25') };
  let r = P.cuantoPedir(Object.assign({}, base, { stock: 2 }));
  prueba('lo de una vuelta (7) menos lo que habrá al llegar (2 − 2 = 0)', r.pedir === 7 && Math.abs(r.uso - 7) < 1e-9 && r.queda === 0, JSON.stringify(r));
  r = P.cuantoPedir(Object.assign({}, base, { stock: 5 }));
  prueba('con más en la estantería, menos', r.pedir === 4, JSON.stringify(r));
  prueba('con de sobra, 0 y nunca negativo', P.cuantoPedir(Object.assign({}, base, { stock: 30 })).pedir === 0);
  prueba('lo que ya viene durante la vuelta cuenta', P.cuantoPedir(Object.assign({}, base, { stock: 2, viene: [{ cuando: P.inicio('2026-11-20'), n: 3 }] })).pedir === 4);
  prueba('un LIVE negativo cuenta como 0', P.cuantoPedir(Object.assign({}, base, { stock: -3 })).pedir === 7);
  prueba('vino: múltiplos de 3 hacia arriba (7 → 9)', P.cuantoPedir(Object.assign({}, base, { stock: 2, multiplo: 3 })).pedir === 9);
  r = P.cuantoPedir(Object.assign({}, base, { stock: 2, dem: { porDia: dem.porDia, semanal: 7, sigma: 4 } }));
  prueba('el colchón: 0.84 σ para una semana (7 + 3.36 → 11)', Math.abs(r.colchon - 3.36) < 1e-9 && r.pedir === 11, JSON.stringify(r));
  r = P.cuantoPedir(Object.assign({}, base, { stock: 2, dem: { porDia: dem.porDia, semanal: 7, sigma: 4 }, siguiente: P.inicio('2026-12-02') }));
  prueba('para dos semanas, √2 veces', Math.abs(r.colchon - 3.36 * Math.SQRT2) < 1e-9, String(r.colchon));
  prueba('múltiplos de 3: Wine Merchant o vino; Breakthru, de uno en uno',
    P.multiploPara({ vendor: 'WINE MERCHANT' }) === 3 && P.multiploPara({ vendor: 'Breakthru', vino: true }) === 3 && P.multiploPara({ vendor: 'BREAKTHRU' }) === 1);
  // "Intentar" múltiplos de 3: el Red Schooner (Southern, 0.3 a la semana)
  // pedía 3 para cubrir media botella.
  const vinoSouthern = P.redondeoPara({ vendor: 'SOUTHERN', vino: true });
  r = P.cuantoPedir(Object.assign({}, base, vinoSouthern, { stock: 8.5 }));
  prueba('vino de otro proveedor: falta media botella → 1, no 3', r.pedir === 1 && r.multiplo === 1, JSON.stringify(r));
  r = P.cuantoPedir(Object.assign({}, base, vinoSouthern, { stock: 4.5 }));
  prueba('…y si al múltiplo le falta una botella o menos, al múltiplo (4.5 → 6)', r.pedir === 6 && r.multiplo === 3, JSON.stringify(r));
  r = P.cuantoPedir(Object.assign({}, base, P.redondeoPara({ vendor: 'WINE MERCHANT', vino: true }), { stock: 8.5 }));
  prueba('Wine Merchant, siempre de 3 en 3 (media botella → 3)', r.pedir === 3, JSON.stringify(r));
}

grupo('5 · el aviso: lo típico más el colchón, y la entrega a su hora');
{
  // 2 al día, sin variación; llegan 12 el jueves a las 4 PM (medio día).
  const dem = { porDia: [2, 2, 2, 2, 2, 2, 2], semanal: 14, sigma: 0 };
  const viene = [{ cuando: NY('2026-11-19 16:00'), n: 12 }];
  const aguanta = P.seAcaba({ dem, stock: 1.5, viene, ahora: P.inicio('2026-11-19') });
  prueba('con 1.5 llega a la entrega (gasta 1 antes de las 4 PM) y no se acaba en la semana', aguanta === null || aguanta.enDias > 3, JSON.stringify(aguanta));
  const corto = P.seAcaba({ dem, stock: 0.8, viene, ahora: P.inicio('2026-11-19') });
  prueba('con 0.8 se acaba el jueves ANTES de que llegue (la regla vieja sumaba la entrega al empezar el día)', !!corto && corto.dia === '2026-11-19' && corto.en <= NY('2026-11-19 16:00'), JSON.stringify(corto));
  prueba('en cero, se acaba ya', P.seAcaba({ dem, stock: 0, viene: [], ahora: P.inicio('2026-11-19') }).enDias === 0);
  // El colchón adelanta el aviso: con σ, antes que sin σ.
  const sin = P.seAcaba({ dem: { porDia: [1, 1, 1, 1, 1, 1, 1], semanal: 7, sigma: 0 }, stock: 5, viene: [], ahora: P.inicio('2026-11-16') });
  const con = P.seAcaba({ dem: { porDia: [1, 1, 1, 1, 1, 1, 1], semanal: 7, sigma: 3 }, stock: 5, viene: [], ahora: P.inicio('2026-11-16') });
  prueba('el colchón adelanta el aviso', !!sin && !!con && con.enDias < sin.enDias, JSON.stringify([sin, con]));
  // White Haven en la tabla de Crown: 23.1 botellas, ~20 a la semana. Con
  // un "día fuerte" cada día salía "se acaba el domingo" (4 días).
  const wh = P.seAcaba({ dem: { porDia: [20 / 7, 20 / 7, 20 / 7, 20 / 7, 20 / 7, 20 / 7, 20 / 7], semanal: 20, sigma: 5 }, stock: 23.1, viene: [], ahora: NY('2026-11-18 10:00') });
  prueba('White Haven: no "se acaba en 4 días" (seis o más, o nada)', wh === null || wh.enDias >= 6, JSON.stringify(wh));
  // Y con la semana de verdad, el lunes cerrado: el colchón crecía con el
  // reloj y salía "se acaba el lunes" sin vender nada ese día (tabla de
  // Crown, 2026-11-18: 23.1, 19 a la semana, Breakthru el martes 4 PM).
  // Domingo..sábado; el lunes, 0.
  const forma = [0.14, 0, 0.08, 0.12, 0.16, 0.22, 0.28];
  const whd = { porDia: forma.map(x => x * 19), semanal: 19, sigma: 6.5 };
  const whr = P.seAcaba({ dem: whd, stock: 22.5, viene: [], ahora: NY('2026-11-18 01:00') });
  prueba('un día cerrado no hace que se acabe (no "Mon")', !whr || P.diaDe(whr.en - 1) !== '2026-11-23' && whr.dia !== '2026-11-23', JSON.stringify(whr));
  prueba('el colchón crece con lo que se usa: cero sin usar', P.colchonDe(whd, 0) === 0 && Math.abs(P.colchonDe(whd, 19) - 0.84 * 6.5) < 1e-9);
}

grupo('5b · hoy, lo que el LIVE dice que falta (hoyResta)');
{
  // 2 al día, 3 botellas, miércoles a mediodía. Sin hoyResta, lo que
  // queda del día (8 de 24 h → 4/3). Con un hoy ya vendido de más (el
  // ritmo de run-out dice que faltan 3), se acaba hoy.
  const dem = { porDia: [2, 2, 2, 2, 2, 2, 2], semanal: 14, sigma: 0 };
  const a = P.seAcaba({ dem, stock: 2.5, viene: [], ahora: NY('2026-11-18 12:00') });
  const b = P.seAcaba({ dem, stock: 2.5, viene: [], ahora: NY('2026-11-18 12:00'), hoyResta: 3 });
  prueba('sin hoyResta, lo típico del resto del día: no se acaba hoy', a && a.enDias === 1, JSON.stringify(a));
  prueba('con hoyResta 3 (el ritmo de hoy), se acaba hoy', b && b.enDias === 0, JSON.stringify(b));
}

grupo('6 · el Nino del 18 de noviembre');
{
  // 3.1 botellas el miércoles a las 10 AM (comprobado en la barra), sin
  // nada en camino. Con la mediana de 13 semanas no salía en Running out.
  const dem = P.demanda({ pouriq: null, toast: { porDia: NINO, cargados }, hoy: HOY });
  const r = P.seAcaba({ dem, stock: 3.1, viene: [], ahora: NY('2026-11-18 10:00') });
  prueba('se acaba hoy o mañana', !!r && r.enDias <= 1, JSON.stringify(r));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
