#!/usr/bin/env node
/*
 * ── Tullamore D.E.W., Elijah Craig, Don Julio Blanco y Michter's ─────
 *
 * Tres whiskies que caían en la forma genérica de whiskey y Don Julio
 * Blanco, que caía en la de vodka por ser tequila. Medidas de fotos con
 * fondo transparente, fila por fila sobre el canal alfa:
 *
 *   Tullamore D.E.W.   992 × 365 px  desajuste 1.34 %  (cuerpo continuo)
 *   Elijah Craig       978 × 390 px  desajuste 0.74 %
 *   Don Julio Blanco   998 × 641 px  desajuste 0.60 %
 *   Michter's          996 × 304 px  desajuste 0.76 %
 *
 * Tullamore traía el cuerpo con ondas del 5 % por la perspectiva de la
 * foto; con lo que Axel pidió para Grey Goose, es una recta continua.
 *
 * Lo que se protege:
 *
 *   1. Existen, con su nombre, en el selector, válidas.
 *   2. Tullamore sin ondas: de la base al hombro baja a pasos iguales.
 *   3. Cada una conserva lo suyo: Elijah Craig angosta abajo y ancha en
 *      los hombros; Don Julio Blanco redonda y distinta de la del Añejo;
 *      Michter's recta con cuello largo.
 *   4. Las líneas de llena que Axel dio por buenas: 75, 72, 65 y 63 %.
 *   5. Por nombre, acotadas a lo medido: de Don Julio, el Blanco; de
 *      Michter's, la línea US*1 y no los de 10 o 20 años.
 *
 *   node tools/test-silueta-cuatro-e.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}

global.window = {};
new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-profiles.js'), 'utf8'))();
const B = window.BarStockBottleProfiles;
const E = [
  ['tullamore', 'Tullamore D.E.W.', 2.72, 0.75],
  ['elijah_craig', 'Elijah Craig', 2.51, 0.72],
  ['don_julio_blanco', 'Don Julio Blanco', 1.56, 0.65],
  ['michters', "Michter's", 3.28, 0.63]
];

console.log('\nexisten y se ofrecen, con su esbeltez y su linea de llena');
for (const [k, n, asp, yf] of E) {
  const P = B.PROFILES[k];
  prueba(n, !!P && P.name === n && B.pickable().includes(k) && B.isValidProfile(P), P && P.name);
  prueba(n + ': esbeltez ' + asp + ', llena al ' + Math.round(yf * 100) + ' %', !!P && P.asp === asp && P.yFull === yf,
    P && (P.asp + ' / ' + P.yFull));
}

console.log('\nTullamore, continua de la base al hombro');
{
  const P = B.PROFILES.tullamore;
  const tramo = P ? P.p.filter(([y]) => y > 0.07 && y < 0.62) : [];
  const pasos = [];
  for (let i = 1; i < tramo.length; i++) pasos.push(tramo[i][1] - tramo[i - 1][1]);
  const max = pasos.length ? Math.max(...pasos) : NaN, min = pasos.length ? Math.min(...pasos) : NaN;
  prueba('el radio solo baja hacia el hombro', tramo.length > 10 && max < 0, max && max.toFixed(4));
  // Medida tal cual, la foto daba pasos de -.03 a +.02.
  prueba('sin ondas: todos los pasos iguales', tramo.length > 10 && max - min < 0.002, min.toFixed(4) + ' … ' + max.toFixed(4));
}

console.log('\ncada una conserva lo suyo');
const r = (k, y) => B.PROFILES[k] ? B.radiusAt(k, y) : NaN;
prueba('Elijah Craig: angosta abajo, ancha en los hombros', r('elijah_craig', 0.1) < 0.88 && r('elijah_craig', 0.45) > 0.98,
  r('elijah_craig', 0.1).toFixed(2) + ' → ' + r('elijah_craig', 0.45).toFixed(2));
prueba('Don Julio Blanco: redonda, se cierra del 33 % al 66 %', r('don_julio_blanco', 0.31) > 0.98 && r('don_julio_blanco', 0.5) < 0.9 && r('don_julio_blanco', 0.68) < 0.3,
  [0.31, 0.5, 0.68].map(y => r('don_julio_blanco', y).toFixed(2)).join(' '));
prueba('Don Julio Blanco: no es la del Anejo', B.PROFILES.don_julio_blanco && B.PROFILES.don_julio_blanco.asp < B.PROFILES.don_julio_anejo.asp - 0.2,
  B.PROFILES.don_julio_blanco && (B.PROFILES.don_julio_blanco.asp + ' vs ' + B.PROFILES.don_julio_anejo.asp));
prueba("Michter's: recta, hombro del 52 % al 63 %, cuello largo", r('michters', 0.48) > 0.98 && r('michters', 0.64) < 0.43 && r('michters', 0.8) < 0.4,
  [0.48, 0.64, 0.8].map(y => r('michters', y).toFixed(2)).join(' '));

console.log('\npor nombre, acotado a lo medido');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const [n, c, k] of [['Tullamore Dew Irish Whiskey', 'Whiskey & Bourbon', 'tullamore'],
                           ['Elijah Craig Small Batch', 'Whiskey & Bourbon', 'elijah_craig'],
                           ['Don Julio Blanco', 'Tequila & Mezcal', 'don_julio_blanco'],
                           ['Don Julio Reposado', 'Tequila & Mezcal', 'vodka'],
                           ['Don Julio Añejo', 'Tequila & Mezcal', 'don_julio_anejo'],
                           ["Michter's US*1 Rye", 'Whiskey & Bourbon', 'michters'],
                           ['Michters Small Batch Bourbon', 'Whiskey & Bourbon', 'michters'],
                           ["Michter's 10 Year Bourbon", 'Whiskey & Bourbon', 'whiskey']]) {
    const s = A.byRules({ item: n, category: c }).shape;
    prueba(n + ' → ' + k, s === k, s);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
