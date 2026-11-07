#!/usr/bin/env node
/*
 * ── Bulleit, Buffalo Trace, Bols y Bacardí ──────────────────────────
 *
 * Bulleit y Buffalo Trace caían en la forma genérica de whiskey, Bols en
 * liqueur_slim y Bacardí en la de vodka por ser ron. Medidas de fotos con
 * fondo blanco (JPG y WEBP): la máscara va fila por fila, del primer al
 * último píxel que no es fondo. Ninguna se enderezó: con las de la tanda
 * anterior, enderezar de más fue justo lo que Axel rechazó.
 *
 *   Bulleit          554 px   desajuste 0.65 %
 *   Buffalo Trace   1078 px   desajuste 0.77 %
 *   Bols             898 px   desajuste 0.89 %
 *   Bacardí          971 px   desajuste 0.91 %  (sin la sombra del piso)
 *
 * Lo que se protege:
 *
 *   1. Existen, con su nombre, en el selector, válidas.
 *   2. Cada una conserva lo suyo, y Bacardí sin el ensanche que la sombra
 *      del piso le ponía en la base.
 *   3. Las líneas de llena: 74, 72, 69 y 71 %.
 *   4. Por nombre, con y sin acento: "Bacardí" con í no coincidía, porque
 *      para JavaScript la í no es letra de palabra y \b no encuentra el
 *      borde. De Bols, los licores; de Bacardí, sin los añejos.
 *
 *   node tools/test-silueta-cuatro-g.js
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
  ['bulleit', 'Bulleit', 2.46, 0.74],
  ['buffalo_trace', 'Buffalo Trace', 2.9, 0.72],
  ['bols', 'Bols', 3.55, 0.69],
  ['bacardi', 'Bacardí', 4.13, 0.71]
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
prueba('Bulleit: hombro casi cuadrado del 70 % al 80 %', r('bulleit', 0.67) > 0.98 && r('bulleit', 0.82) < 0.32,
  r('bulleit', 0.67).toFixed(2) + ' → ' + r('bulleit', 0.82).toFixed(2));
prueba('Buffalo Trace: mas angosta abajo, hombro redondo', r('buffalo_trace', 0.15) < r('buffalo_trace', 0.47) - 0.08 && r('buffalo_trace', 0.65) < 0.42,
  [0.15, 0.47, 0.65].map(y => r('buffalo_trace', y).toFixed(2)).join(' '));
prueba('Bols: campana, ancha abajo y en cono hasta el cuello', r('bols', 0.25) > 0.98 && r('bols', 0.45) < 0.78 && r('bols', 0.6) < 0.52,
  [0.25, 0.45, 0.6].map(y => r('bols', y).toFixed(2)).join(' '));
// Al 5 % y no mas abajo: por debajo ya es el talon redondeado del vidrio.
// Con la sombra, la base salia mas ancha que el cuerpo (.94 contra .92).
prueba('Bacardi: sin el ensanche de la sombra en la base', r('bacardi', 0.05) <= r('bacardi', 0.5) + 0.005,
  r('bacardi', 0.05).toFixed(3) + ' vs ' + r('bacardi', 0.5).toFixed(3));
prueba('Bacardi: recta y alta, hombro del 64 % al 73 %', r('bacardi', 0.62) > 0.96 && r('bacardi', 0.74) < 0.42,
  r('bacardi', 0.62).toFixed(2) + ' → ' + r('bacardi', 0.74).toFixed(2));

console.log('\npor nombre');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const [n, c, k] of [['Bulleit Bourbon', 'Whiskey & Bourbon', 'bulleit'],
                           ['Bulleit Rye', 'Whiskey & Bourbon', 'bulleit'],
                           ['Buffalo Trace Bourbon', 'Whiskey & Bourbon', 'buffalo_trace'],
                           ['Bols Blue Curacao', 'Liqueur', 'bols'],
                           ['Bols Triple Sec', 'Liqueur', 'bols'],
                           ['Bols Genever', 'Gin', 'vodka'],
                           ['Bacardi Superior', 'Rum', 'bacardi'],
                           ['Bacardí Superior', 'Rum', 'bacardi'],
                           ['BACARDÍ', 'Rum', 'bacardi'],
                           ['Bacardí Limón', 'Rum', 'bacardi'],
                           ['Bacardi 8 Años', 'Rum', 'vodka'],
                           ['Bacardí Reserva Ocho', 'Rum', 'vodka']]) {
    const s = A.byRules({ item: n, category: c }).shape;
    prueba(n + ' → ' + k, s === k, s);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
