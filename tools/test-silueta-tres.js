#!/usr/bin/env node
/*
 * ── Glenfiddich, Casa Noble y Drambuie ──────────────────────────────
 *
 * Tres botellas que caían en una forma que no se les parece: Glenfiddich
 * en la de whiskey, Casa Noble en la de vodka (el tequila va ahí por la
 * categoría) y Drambuie en liqueur_slim, que es la mitad de ancha.
 * Medidas de fotos con fondo transparente, fila por fila sobre el canal
 * alfa:
 *
 *   Glenfiddich  1162 × 296 px  desajuste 0.73 %
 *   Casa Noble   1940 × 473 px  desajuste 0.55 %
 *   Drambuie      500 × 205 px  desajuste 0.46 %
 *
 * Lo que se protege:
 *
 *   1. Existen, con su nombre, en el selector, válidas.
 *   2. Cada una conserva lo suyo: Glenfiddich alta y recta; Casa Noble
 *      con hombro biselado y la bola del tapón más ancha que el cuello;
 *      Drambuie baja y ancha con hombro largo.
 *   3. Las líneas de llena que Axel dio por buenas: 75 %, 73 % (medida
 *      del líquido en la foto) y 72 %.
 *   4. Por nombre, y ganándole a la categoría.
 *
 *   node tools/test-silueta-tres.js
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
  ['glenfiddich', 'Glenfiddich', 3.93, 0.75],
  ['casa_noble', 'Casa Noble', 4.1, 0.73],
  ['drambuie', 'Drambuie', 2.44, 0.72]
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
prueba('Glenfiddich: recta hasta el hombro y cuello estrecho', r('glenfiddich', 0.2) > 0.9 && r('glenfiddich', 0.62) > 0.97 && r('glenfiddich', 0.8) < 0.5,
  [0.2, 0.62, 0.8].map(y => r('glenfiddich', y).toFixed(2)).join(' '));
prueba('Casa Noble: el hombro cae entre el 64 % y el 75 %', r('casa_noble', 0.62) > 0.97 && r('casa_noble', 0.77) < 0.45,
  r('casa_noble', 0.62).toFixed(2) + ' → ' + r('casa_noble', 0.77).toFixed(2));
prueba('Casa Noble: la bola del tapon, mas ancha que el cuello', r('casa_noble', 0.92) > r('casa_noble', 0.8) + 0.1,
  r('casa_noble', 0.8).toFixed(2) + ' → ' + r('casa_noble', 0.92).toFixed(2));
prueba('Drambuie: baja y ancha, mas que liqueur_slim', B.PROFILES.drambuie && B.PROFILES.drambuie.asp < B.PROFILES.liqueur_slim.asp - 1,
  B.PROFILES.drambuie && (B.PROFILES.drambuie.asp + ' vs ' + B.PROFILES.liqueur_slim.asp));
prueba('Drambuie: hombro largo del 58 % al 73 %', r('drambuie', 0.56) > 0.98 && r('drambuie', 0.64) < 0.9 && r('drambuie', 0.74) < 0.4,
  [0.56, 0.64, 0.74].map(y => r('drambuie', y).toFixed(2)).join(' '));

console.log('\npor nombre, ganandole a la categoria');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const [n, c, k] of [['Glenfiddich 12 Year', 'Whiskey & Bourbon', 'glenfiddich'],
                           ['Glenfiddich 14 Bourbon Barrel', 'Whiskey & Bourbon', 'glenfiddich'],
                           ['Casa Noble Crystal Organic Tequila Blanco', 'Tequila & Mezcal', 'casa_noble'],
                           ['Casa Noble Reposado', 'Tequila & Mezcal', 'casa_noble'],
                           ['Drambuie', 'Liqueur', 'drambuie']]) {
    const s = A.byRules({ item: n, category: c }).shape;
    prueba(n, s === k, s);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
