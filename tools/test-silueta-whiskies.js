#!/usr/bin/env node
/*
 * ── Blanton's, Jura y Macallan ───────────────────────────────────────
 *
 * Tres whiskies que caían en la forma genérica de whiskey. Medidos de
 * fotos con fondo transparente, fila por fila sobre el canal alfa:
 *
 *   Blanton's  530 × 269 px  desajuste 1.63 %  (el caballito del tapón
 *              no es simétrico: lo que más se separa es arriba)
 *   Jura       508 × 177 px  desajuste 0.71 %  (medida sin el tubo de
 *              cartón que traía la foto a la izquierda)
 *   Macallan   182 × 47 px   desajuste 1.20 %  (foto diminuta)
 *
 * Lo que se protege:
 *
 *   1. Existen, con su nombre, en el selector, válidas.
 *   2. Cada una conserva lo suyo: Blanton's ancha con cúpula y tapón con
 *      relieve; Jura con cintura y hombro corto; Macallan recta y alta.
 *   3. Las líneas de llena que Axel dio por buenas: 59 % (subida desde el
 *      56 % sobre la lámina), 68 % y 75 %.
 *   4. Por nombre. Todos los Macallan usan la misma botella (Axel).
 *
 *   node tools/test-silueta-whiskies.js
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
  ['blantons', "Blanton's", 1.98, 0.59],
  ['jura', 'Jura', 2.87, 0.68],
  ['macallan', 'Macallan', 3.87, 0.75]
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
prueba("Blanton's: cupula que se cierra en el cuello", r('blantons', 0.3) > 0.97 && r('blantons', 0.5) < 0.9 && r('blantons', 0.65) < 0.35,
  [0.3, 0.5, 0.65].map(y => r('blantons', y).toFixed(2)).join(' '));
prueba("Blanton's: el tapon con relieve, mas ancho que el cuello", r('blantons', 0.8) > r('blantons', 0.68) + 0.08,
  r('blantons', 0.68).toFixed(2) + ' → ' + r('blantons', 0.8).toFixed(2));
prueba('Jura: cintura entre la base y el hombro', r('jura', 0.3) < r('jura', 0.15) - 0.05 && r('jura', 0.3) < r('jura', 0.58) - 0.05,
  [0.15, 0.3, 0.58].map(y => r('jura', y).toFixed(2)).join(' '));
prueba('Jura: hombro corto', r('jura', 0.62) > 0.95 && r('jura', 0.75) < 0.5, r('jura', 0.62).toFixed(2) + ' → ' + r('jura', 0.75).toFixed(2));
prueba('Macallan: recta y alta, hombro arriba', r('macallan', 0.7) > 0.95 && r('macallan', 0.8) < 0.42, r('macallan', 0.7).toFixed(2) + ' → ' + r('macallan', 0.8).toFixed(2));

console.log('\npor nombre');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  const con = (n, c) => A.byRules({ item: n, category: c || 'Whiskey' }).shape;
  for (const [n, k] of [["Blanton's Original Single Barrel", 'blantons'], ['Blantons Bourbon', 'blantons'],
                        ['Jura 12 Year', 'jura'], ['Isle of Jura Journey', 'jura'],
                        ['Macallan 12 Double Cask', 'macallan'], ['The Macallan 18 Sherry Oak', 'macallan']]) {
    prueba(n, con(n) === k, con(n));
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
