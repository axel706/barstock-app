#!/usr/bin/env node
/*
 * ── Buchanan's, Campari, Captain Morgan y Don Julio de 750 ──────────
 *
 * Buchanan's caía en la forma de whiskey, Campari en liqueur_slim y
 * Captain Morgan en la de vodka (por ser ron). Fotos con fondo blanco,
 * fila por fila, del primer al último píxel que no es fondo.
 *
 *   Buchanan's       416 px  desajuste 0.64 %  (sin los sellos laterales)
 *   Campari         1047 px  desajuste 0.92 %
 *   Captain Morgan   548 px  desajuste 0.81 %
 *   Don Julio 750    554 px  desajuste 0.56 %
 *
 * Don Julio: el Blanco se había medido de una foto de 1.75 L y se le
 * ponía esa forma en cualquier tamaño. La de 750 (medida del Reposado)
 * es otra botella: base plana y ancha, 1.73 contra 1.56. Axel aprobó:
 * Blanco y Reposado reciben la de 750, y el tamaño elige la de 1.75 L,
 * como las magnums de vino. Los que ya tenían la de 1.75 L siendo de 750
 * se dibujan con la de 750 por su tamaño, sin tocar lo guardado.
 *
 * Lo que se protege:
 *
 *   1. Existen, con su nombre, en el selector, válidas.
 *   2. Cada una conserva lo suyo, y Buchanan's sin el bulto de los sellos.
 *   3. Las líneas de llena: 66, 76, 74 y 66 %.
 *   4. El tamaño elige la botella de Don Julio, en los dos sentidos.
 *   5. Por nombre: Buchanan's 12 sí y 18 no; Captain Morgan sin el
 *      Private Stock.
 *
 *   node tools/test-silueta-cuatro-i.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d !== undefined ? '   → ' + d : '')); }
}

global.window = {};
new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-profiles.js'), 'utf8'))();
const B = window.BarStockBottleProfiles;
const E = [
  ['buchanans', "Buchanan's", 2.04, 0.66],
  ['campari', 'Campari', 4.04, 0.76],
  ['captain_morgan', 'Captain Morgan', 4.06, 0.74],
  ['don_julio', 'Don Julio', 1.73, 0.66]
];

console.log('\nexisten y se ofrecen, con su esbeltez y su linea de llena');
for (const [k, n, asp, yf] of E) {
  const P = B.PROFILES[k];
  prueba(n, !!P && P.name === n && B.pickable().includes(k) && B.isValidProfile(P), P && P.name);
  prueba(n + ': esbeltez ' + asp + ', llena al ' + Math.round(yf * 100) + ' %', !!P && P.asp === asp && P.yFull === yf,
    P && (P.asp + ' / ' + P.yFull));
}

console.log('\ncada una conserva lo suyo');
const r = (k, y) => B.PROFILES[k] ? B.radiusAt(k, y) : NaN;
prueba("Buchanan's: sin el bulto de los sellos (del 27 % al 43 % no pasa de lo de alrededor)",
  [0.3, 0.35, 0.4].every(y => r('buchanans', y) <= Math.max(r('buchanans', 0.25), r('buchanans', 0.45)) + 0.01),
  [0.25, 0.3, 0.35, 0.4, 0.45].map(y => r('buchanans', y).toFixed(3)).join(' '));
prueba("Buchanan's: ancha, hombro del 55 % al 70 %", r('buchanans', 0.5) > 0.95 && r('buchanans', 0.7) < 0.36,
  r('buchanans', 0.5).toFixed(2) + ' → ' + r('buchanans', 0.7).toFixed(2));
prueba('Campari: recta, cuello angosto', r('campari', 0.3) > 0.95 && r('campari', 0.6) > 0.96 && r('campari', 0.8) < 0.42,
  [0.3, 0.6, 0.8].map(y => r('campari', y).toFixed(2)).join(' '));
prueba('Captain Morgan: recta y alta, hombro corto', r('captain_morgan', 0.3) > 0.95 && r('captain_morgan', 0.72) < 0.45,
  r('captain_morgan', 0.3).toFixed(2) + ' → ' + r('captain_morgan', 0.72).toFixed(2));
prueba('Don Julio 750: base plana y ancha, no la esfera de 1.75 L', r('don_julio', 0.02) > 0.85 && r('don_julio_blanco', 0.02) < 0.5,
  r('don_julio', 0.02).toFixed(2) + ' vs ' + r('don_julio_blanco', 0.02).toFixed(2));

console.log('\nel tamano elige la botella de Don Julio');
prueba('Don Julio de 750 → la de 750', B.forSize('don_julio', 750) === 'don_julio', B.forSize('don_julio', 750));
prueba('Don Julio de 1.75 L → la de 1.75 L', B.forSize('don_julio', 1750) === 'don_julio_blanco', B.forSize('don_julio', 1750));
// Axel, 2026-11-09: la redonda (don_julio_blanco) es la de SU Don Julio
// Blanco, y se la asignó a mano. Antes, con 750 ml, el conteo la cambiaba
// en silencio por la de 750 y enseñaba otra botella de la que decía el
// selector. Asignada, se respeta sea cual sea el tamaño.
prueba('la redonda asignada se respeta aunque sea de 750', B.forSize('don_julio_blanco', 750) === 'don_julio_blanco', B.forSize('don_julio_blanco', 750));
prueba('el que tiene la de 1.75 L y es de 1.75 L → se queda', B.forSize('don_julio_blanco', 1750) === 'don_julio_blanco', B.forSize('don_julio_blanco', 1750));
prueba('las magnums de vino siguen igual', B.forSize('bordeaux', 1500) === 'wine_magnum' && B.forSize('bordeaux', 750) === 'bordeaux');

console.log('\npor nombre');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const [n, c, k] of [["Buchanan's 12 Deluxe", 'Whiskey & Bourbon', 'buchanans'],
                           ['Buchanans DeLuxe', 'Whiskey & Bourbon', 'buchanans'],
                           ["Buchanan's 18 Special Reserve", 'Whiskey & Bourbon', 'whiskey'],
                           ['Campari', 'Liqueur', 'campari'],
                           ['Captain Morgan Spiced Rum', 'Rum', 'captain_morgan'],
                           ['Captain Morgan Private Stock', 'Rum', 'vodka'],
                           ['Don Julio Blanco', 'Tequila & Mezcal', 'don_julio'],
                           ['Don Julio Reposado', 'Tequila & Mezcal', 'don_julio'],
                           ['Don Julio Añejo', 'Tequila & Mezcal', 'don_julio_anejo']]) {
    const s = A.byRules({ item: n, category: c }).shape;
    prueba(n + ' → ' + k, s === k, s);
  }
  const g = A.byRules({ item: 'Don Julio Blanco 1.75L', category: 'Tequila & Mezcal' });
  prueba('Don Julio Blanco 1.75L: la de 750 con tamano 1750, que dibuja la de 1.75 L',
    g.shape === 'don_julio' && g.size === 1750 && B.forSize(g.shape, g.size) === 'don_julio_blanco', g.shape + ' ' + g.size);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
