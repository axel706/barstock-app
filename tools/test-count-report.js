#!/usr/bin/env node
/*
 * ── El reporte de un conteo (src/count-report.js) ────────────────────
 *
 * Axel, 2026-11-27: Reports › Counts, "un registro de los counts […] en
 * modo reporte". Lo que se protege:
 *
 *   1. Un conteo es una SEMANA: el primer cierre; los demás, reconteos.
 *   2. Live vs count es la cuenta guardada (live_expected) y la regla de
 *      Finish count (seAleja): ni otra cuenta ni otra regla.
 *   3. El porqué es el de live-diagnostico (el del correo del lunes) más
 *      los cuatro nuevos, cada uno sólo con los números que lo sostienen,
 *      y lo que parece un error al contar va primero.
 *   4. Lo que no se guardó no se inventa: sin ciclo no hay esperado ni
 *      "not counted", y lo vendido sin receta no se le cuelga a nadie.
 *   5. Sólo lee.
 *
 *   node tools/test-count-report.js
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
window.BarStockCountFinish = { MINIMO_PARA_COMPARAR: 5 * 60000, comparar: (a, b) => (a < b ? Math.round((b - a) / 60000) + ' min faster' : Math.round((a - b) / 60000) + ' min slower') };
for (const f of ['src/live-diagnostico.js', 'src/count-report.js']) new Function(fs.readFileSync(path.join(RAIZ, f), 'utf8'))();
const CR = window.BarStockCountReport;
const SRC = fs.readFileSync(path.join(RAIZ, 'src/count-report.js'), 'utf8');

const H = 3600e3;
const fin = (dia) => new Date(Date.parse(dia + 'T02:30:00Z')).toISOString();
// Domingos de conteo (cierre el lunes 02:30 UTC). Un ciclo por conteo,
// del 15 al 23 (el de antes del 15 no se guardó).
const SES = [
  { id: 1, week_key: '2026-11-03', finished_at: fin('2026-11-03'), active_ms: 71 * 60000, items: 185 },
  { id: 2, week_key: '2026-11-10', finished_at: fin('2026-11-10'), active_ms: 69 * 60000, items: 186 },
  { id: 3, week_key: '2026-11-17', finished_at: fin('2026-11-17'), active_ms: 78 * 60000, items: 188 },
  { id: 4, week_key: '2026-11-24', finished_at: fin('2026-11-24'), active_ms: 72 * 60000, items: 190 },
  // Un reconteo del jueves: la misma semana.
  { id: 5, week_key: '2026-11-24', finished_at: '2026-11-27T20:00:00Z', active_ms: 3 * 60000, items: 4 }
];
const CIC = [
  { id: 'c24', cycle_start: fin('2026-11-17'), cycle_end: new Date(Date.parse(fin('2026-11-24')) + 20000).toISOString(), end_day: '2026-11-23', status: 'final',
    unconverted: [{ nombre: 'Margarita', motivo: 'Recipe missing', unidades: 31 }, { nombre: 'Corona', motivo: 'Not matched (Beer)', unidades: 40 }] },
  { id: 'c17', cycle_start: fin('2026-11-10'), cycle_end: fin('2026-11-17'), end_day: '2026-11-16', status: 'final', unconverted: [] },
  { id: 'c10', cycle_start: fin('2026-11-03'), cycle_end: fin('2026-11-10'), end_day: '2026-11-09', status: 'final', unconverted: [] }
];
// [start, arrived, sold, counted] por ciclo, del más nuevo al más viejo.
const fila = (cy, item, [st, ar, so, co], o) => Object.assign({ cycle_id: cy, item_name: item, start_count: st, arrived: ar, sold: so, counted: co,
  expected: st + ar - so, difference: co - (st + ar - so), unit_price: 20, in_toast: true, checked: null }, o || {});
const FIL = [
  // Tito's: corto tres semanas por una parte parecida de lo vendido → receta.
  fila('c24', "Tito's", [8, 12, 9.4, 8]), fila('c17', "Tito's", [8, 12, 9, 8.2]), fila('c10', "Tito's", [9, 12, 9.5, 8.6]),
  // Canyon Oaks: le falta justo media caja y llegó una orden con ella.
  fila('c24', 'Canyon Oaks', [4, 12, 3.1, 6.9]),
  // Grey Goose: sobra justo una caja, sin que llegara nada.
  fila('c24', 'Grey Goose', [2, 0, 1, 13]),
  // Maker's: esta semana deshace la anterior.
  fila('c24', "Maker's Mark", [4, 0, 2.3, 2.8]), fila('c17', "Maker's Mark", [6, 0, 2.6, 2.2]),
  // Pedro Morales: contado en 0 y Toast lo vendió.
  fila('c24', 'Pedro Morales', [5, 0, 2.1, 0]),
  // Triage: salta de 2 a 14 sin nada que llegara.
  fila('c24', 'Triage Vodka', [2, 0, 0.8, 14], { checked: { n: 19.8, at: '2026-11-19T15:30:00Z', by: 'Axel', live_said: 1.6, expected: 19 } }),
  // Aperol cuadra; Dad's Hat no es de Toast.
  fila('c24', 'Aperol', [3, 6, 4.1, 4.9]), fila('c24', "Dad's Hat", [2, 0, 0, 1.5], { in_toast: false }),
  // Cointreau: primera semana corto → too early.
  fila('c24', 'Cointreau', [3, 0, 1.2, 0.4])
];
const FOTOS = [];
const foto = (sem, item, oh, ord) => FOTOS.push({ week_start: sem, item_name: item, on_hand_start: oh, ordered: ord || 0 });
// La semana de antes (lo que se contó el 17) y ésta (el 24).
for (const [it, a, b] of [["Tito's", 8, 8], ['Canyon Oaks', 4, 6.9], ['Grey Goose', 2, 13], ["Maker's Mark", 4, 2.8], ['Pedro Morales', 5, 0],
  ['Triage Vodka', 2, 14], ['Aperol', 3, 4.9], ["Dad's Hat", 2, 1.5], ['Cointreau', 3, 0.4]]) { foto('2026-11-17', it, a); foto('2026-11-24', it, b); }
// Kamora: 3 el 17 y no contado el 24 (no tiene fila en el ciclo).
foto('2026-11-17', 'Kamora', 3); foto('2026-11-24', 'Kamora', 0);
// Woodford: nuevo, contado por primera vez.
foto('2026-11-24', 'Woodford', 3);
const MASTER = ["Tito's", 'Canyon Oaks', 'Grey Goose', "Maker's Mark", 'Pedro Morales', 'Triage Vodka', 'Aperol', "Dad's Hat", 'Cointreau', 'Kamora', 'Woodford']
  .map(item => ({ item, value: 20, suggested: item === 'Triage Vodka' ? 4 : 3 }));

grupo('1. Los conteos: uno por semana');
const L = CR.armarLista(SES, CIC, FIL);
prueba('cuatro semanas, la más nueva primero', L.length === 4 && L[0].semana === '2026-11-24', L.map(x => x.semana).join(','));
prueba('el reconteo del jueves no es otro conteo: se cuenta', L[0].reconteos === 1 && L[0].items === 190);
prueba('el tiempo, contra el conteo de antes', L[0].vs && /6 min faster/.test(L[0].vs.txt), L[0].vs && L[0].vs.txt);
prueba('el primero guardado no se compara', L[3].primero && !L[3].vs);
prueba('Live vs count del conteo, de su ciclo (cerrado a la misma hora)', !!L[0].live && L[0].live.lejos > 0);
prueba('sin ciclo guardado (el del 3), sin Live: no se inventa', L[3].live === null);
prueba('el ciclo se reconoce por la hora del cierre (±6 h), no por la semana', CR.cicloDe(SES[3], CIC) === CIC[0] && CR.cicloDe({ finished_at: '2026-11-20T00:00:00Z' }, CIC) === null);

grupo('2. Live vs count: la cuenta guardada y la regla de Finish count');
const rep = CR.armarReporte({ semana: '2026-11-24', previa: '2026-11-17', sesion: SES[3], sesionPrevia: SES[2], fotos: FOTOS, ciclo: CIC[0], ciclos: CIC, filas: FIL, master: MASTER });
const de = (n) => rep.filas.find(x => x.item === n);
prueba('la diferencia es la de live_expected (contado − esperado)', de("Tito's").dif === -2.6 && de("Tito's").esperado === 10.6, JSON.stringify(de("Tito's")));
prueba('dentro de la regla, "even"', de('Aperol').estado === 'even' && !de('Aperol').msg);
prueba('lo que Toast no vende, sin Live ni diferencia', de("Dad's Hat").estado === 'sinLive' && de("Dad's Hat").dif === null);
prueba('la regla es la de live-diagnostico (seAleja), no otra', /G\.seAleja\(/.test(SRC) && !/UMBRAL\s*=/.test(SRC));
prueba('el dinero, con el precio guardado del ciclo', de("Tito's").dinero === -52);
prueba('la cascada cuadra: contado − esperado es la diferencia neta', Math.abs((rep.cascada.contado - rep.cascada.esperado) - rep.resumen.live.neto) < 0.01,
  JSON.stringify(rep.cascada) + ' ' + rep.resumen.live.neto);
// La cifra grande es la del Home y del correo: lo corto de lo que se aleja.
const DG = window.BarStockLiveDiag.diagnosticar({ ciclos: CIC, filas: FIL });
prueba('"Live vs count" es la misma cifra que el Home (diagnosticar)', rep.resumen.live.corto === DG.corto && rep.resumen.live.sobra === DG.sobra,
  rep.resumen.live.corto + '/' + DG.corto + ' ' + rep.resumen.live.sobra + '/' + DG.sobra);
prueba('y antes + entró − vendido = esperado', Math.abs(rep.cascada.antes + rep.cascada.entro - rep.cascada.vendido - rep.cascada.esperado) < 0.01);
prueba('la verificación de la semana, en su fila', de('Triage Vodka').check && de('Triage Vodka').check.by === 'Axel');
prueba('botellas y dinero en la estantería, contra el conteo de antes', rep.resumen.botellas === 54.5 && rep.resumen.botellasAntes === 36, rep.resumen.botellas + ' / ' + rep.resumen.botellasAntes);

grupo('3. El porqué de cada producto');
const m = (n) => (de(n).msg || {});
prueba('3 semanas corto por una parte parecida: "very likely a recipe or a pour"', /3rd week short in a row: very likely a recipe or a pour/.test(m("Tito's").txt) && m("Tito's").tono === 'a', m("Tito's").txt);
prueba('media caja corta con una orden que llegó: "did the delivery come short"', /Exactly half a case short.*delivery come short/.test(m('Canyon Oaks').txt), m('Canyon Oaks').txt);
prueba('una caja de más: "a case that arrived without an order or invoice"', /Exactly one case more/.test(m('Grey Goose').txt) && m('Grey Goose').tono === 'v', m('Grey Goose').txt);
prueba('deshace la semana anterior: "a counting slip"', /Undoes last week's 1\.2 short: a counting slip/.test(m("Maker's Mark").txt), m("Maker's Mark").txt);
prueba('contado en 0 con ventas: error al contar, en rojo', /Counted 0, but Toast sold 2\.1/.test(m('Pedro Morales').txt) && m('Pedro Morales').tono === 'ro', m('Pedro Morales').txt);
prueba('un salto sin nada que llegara: en rojo', /2 → 14 with nothing that came in/.test(m('Triage Vodka').txt) && m('Triage Vodka').tono === 'ro', m('Triage Vodka').txt);
prueba('contado la vez pasada y no ahora: "Not counted this time", con su fecha', de('Kamora').estado === 'sinContar' && /Not counted this time: it had 3 on Nov 1[67]/.test(m('Kamora').txt), m('Kamora').txt);
prueba('la primera semana fuera: "too early to tell", gris', /First week short: too early/.test(m('Cointreau').txt) && m('Cointreau').tono === 'gx');
prueba('nuevo: "first time it\'s counted"', /New: first time/.test(m('Woodford').txt));
prueba('lo que parece un error al contar va primero', rep.filas.slice(0, 3).every(x => x.msg && x.msg.tono === 'ro'), rep.filas.slice(0, 4).map(x => x.item).join(','));
prueba('"Check these first" son esos tres', rep.revisar.map(x => x.item).sort().join(',') === 'Kamora,Pedro Morales,Triage Vodka', rep.revisar.map(x => x.item).join(','));
prueba('lo corto, por dinero; lo de más, aparte', rep.cortos[0].item === 'Canyon Oaks' && rep.mas.some(x => x.item === 'Grey Goose') && rep.dineroCorto < 0 && rep.dineroMas > 0,
  rep.cortos.map(x => x.item).join(','));
prueba('lo vendido sin receta no se le cuelga a un producto', !rep.filas.some(x => x.msg && /recipe yet|no recipe/i.test(x.msg.txt)));

grupo('4. Lo que se repite y semana tras semana');
prueba("Tito's se repite tres conteos del mismo lado", rep.reincidentes.length === 1 && rep.reincidentes[0].item === "Tito's" && rep.reincidentes[0].difs.length === 3,
  JSON.stringify(rep.reincidentes));
const S = CR.armarSemanas(CIC, FIL, CIC[0]);
prueba('las semanas, de la más vieja a la de este conteo', S.length === 3 && S[2].este && S[0].id === 'c10');
prueba('con los tragos sin receta del ciclo (no la cerveza sin emparejar)', S[2].sinReceta === 31);

grupo('5. Sin el ciclo (los conteos de antes del 15): nada inventado');
const viejo = CR.armarReporte({ semana: '2026-11-17', previa: null, sesion: SES[2], sesionPrevia: null, fotos: FOTOS, ciclo: null, ciclos: [], filas: [], master: MASTER });
prueba('sin esperado ni diferencia', viejo.sinCiclo && viejo.filas.every(x => x.esperado === null && x.dif === null));
prueba('sin "not counted" (sólo el ciclo sabe qué se contó)', !viejo.filas.some(x => x.estado === 'sinContar'));
prueba('sin cascada', viejo.cascada === null && viejo.resumen.live === null);

grupo('6. Sólo lee');
prueba('ni POST, ni PATCH, ni DELETE', !/method:\s*'(POST|PATCH|DELETE)'/.test(SRC) && !/fetch\(/.test(SRC));
const IDX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
prueba('carga después de live-diagnostico (lo usa)', IDX.indexOf('src/count-report.js') > IDX.indexOf('src/live-diagnostico.js') && IDX.indexOf('src/live-diagnostico.js') > 0);

console.log(mal ? `\n${mal} MAL de ${ok + mal}` : `\ntodo bien   ·   ${ok} comprobaciones`);
process.exit(mal ? 1 : 0);
