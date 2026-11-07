#!/usr/bin/env node
/*
 * ── Chivas Regal, Empress 1908, Disaronno y Jameson ─────────────────
 *
 * Chivas y Jameson caían en la forma genérica de whiskey, Empress en la
 * de vodka (por ser gin) y Disaronno en liqueur_slim. Medidas de fotos,
 * fila por fila sobre el canal alfa:
 *
 *   Chivas Regal   872 × 326 px  desajuste 0.68 %
 *   Empress 1908   543 × 165 px  desajuste 0.90 %
 *   Disaronno      606 × 294 px  desajuste 0.65 %  (JPG, fondo blanco)
 *   Jameson        864 × 217 px  desajuste 1.41 %  (cuerpo continuo)
 *
 * Disaronno se midió primero de una foto CORTADA, sin el tapón: salía
 * chata (1.76) y con la línea al 82 %. Axel lo vio y mandó la foto
 * entera. Jameson traía el borde comido abajo y ondas en el cuerpo; con
 * lo que Axel pidió para Grey Goose, el cuerpo es una recta continua.
 *
 * Lo que se protege:
 *
 *   1. Existen, con su nombre, en el selector, válidas.
 *   2. Disaronno es la de la foto entera: 2.06, con el tapón cuadrado más
 *      ancho que el cuello, y no la chata de la foto cortada.
 *   3. Jameson sin ondas: de la base al hombro sube a pasos iguales.
 *   4. Las líneas de llena que Axel dio por buenas: 75, 72, 72 y 70 %.
 *   5. Por nombre, acotadas a lo medido: el Chivas de siempre y el
 *      Jameson de siempre; los mayores y las líneas especiales, no.
 *
 *   node tools/test-silueta-cuatro-d.js
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
  ['chivas', 'Chivas Regal', 2.67, 0.75],
  ['empress', 'Empress 1908', 3.29, 0.72],
  ['disaronno', 'Disaronno', 2.06, 0.72],
  ['jameson', 'Jameson', 3.98, 0.7]
];

console.log('\nexisten y se ofrecen, con su esbeltez y su linea de llena');
for (const [k, n, asp, yf] of E) {
  const P = B.PROFILES[k];
  prueba(n, !!P && P.name === n && B.pickable().includes(k) && B.isValidProfile(P), P && P.name);
  prueba(n + ': esbeltez ' + asp + ', llena al ' + Math.round(yf * 100) + ' %', !!P && P.asp === asp && P.yFull === yf,
    P && (P.asp + ' / ' + P.yFull));
}

const r = (k, y) => B.PROFILES[k] ? B.radiusAt(k, y) : NaN;

console.log('\nDisaronno, de la foto entera');
prueba('el tapon cuadrado, mas ancho que el cuello', r('disaronno', 0.93) > r('disaronno', 0.8) + 0.2,
  r('disaronno', 0.8).toFixed(2) + ' → ' + r('disaronno', 0.93).toFixed(2));
prueba('hombro del 64 % al 75 %', r('disaronno', 0.63) > 0.97 && r('disaronno', 0.77) < 0.32,
  r('disaronno', 0.63).toFixed(2) + ' → ' + r('disaronno', 0.77).toFixed(2));

console.log('\nJameson, continua de la base al hombro');
{
  const P = B.PROFILES.jameson;
  const tramo = P ? P.p.filter(([y]) => y > 0.04 && y < 0.62) : [];
  const pasos = [];
  for (let i = 1; i < tramo.length; i++) pasos.push(tramo[i][1] - tramo[i - 1][1]);
  const max = pasos.length ? Math.max(...pasos) : NaN, min = pasos.length ? Math.min(...pasos) : NaN;
  prueba('el radio solo sube hacia el hombro', tramo.length > 10 && min > 0, min && min.toFixed(4));
  // Medida tal cual, la foto daba pasos de -.03 a +.03.
  prueba('sin ondas: todos los pasos iguales', tramo.length > 10 && max - min < 0.002, min.toFixed(4) + ' … ' + max.toFixed(4));
}

console.log('\ncada una conserva lo suyo');
prueba('Chivas: hombro redondo del 48 % al 64 %', r('chivas', 0.46) > 0.98 && r('chivas', 0.58) < 0.85 && r('chivas', 0.66) < 0.47,
  [0.46, 0.58, 0.66].map(y => r('chivas', y).toFixed(2)).join(' '));
prueba('Empress: recta, hombro corto del 67 % al 73 %', r('empress', 0.3) > 0.97 && r('empress', 0.66) > 0.95 && r('empress', 0.75) < 0.4,
  [0.3, 0.66, 0.75].map(y => r('empress', y).toFixed(2)).join(' '));

console.log('\npor nombre, acotado a lo medido');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const [n, c, k] of [['Chivas Regal 12', 'Whiskey & Bourbon', 'chivas'],
                           ['Chivas Regal', 'Whiskey & Bourbon', 'chivas'],
                           ['Chivas Regal 18', 'Whiskey & Bourbon', 'whiskey'],
                           ['Empress 1908 Indigo Gin', 'Gin', 'empress'],
                           ['Disaronno Amaretto', 'Liqueur', 'disaronno'],
                           ['Jameson Irish Whiskey', 'Whiskey & Bourbon', 'jameson'],
                           ['Jameson Orange', 'Whiskey & Bourbon', 'jameson'],
                           ['Jameson Black Barrel', 'Whiskey & Bourbon', 'whiskey'],
                           ['Jameson Caskmates IPA', 'Whiskey & Bourbon', 'whiskey']]) {
    const s = A.byRules({ item: n, category: c }).shape;
    prueba(n + ' → ' + k, s === k, s);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
