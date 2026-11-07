#!/usr/bin/env node
/*
 * ── Red Label, Dad's Hat, Cointreau y Balvenie ──────────────────────
 *
 * Tres whiskies que caían en la forma genérica de whiskey y Cointreau,
 * que iba en liqueur_slim con Grand Marnier y compañía. Medidas de fotos
 * con fondo transparente, fila por fila sobre el canal alfa:
 *
 *   Red Label   543 × 136 px  desajuste 0.45 %
 *   Dad's Hat   670 × 211 px  desajuste 0.58 %
 *   Cointreau   990 × 408 px  desajuste 0.76 %  (foto del litro)
 *   Balvenie    978 × 328 px  desajuste 0.90 %
 *
 * Lo que se protege:
 *
 *   1. Existen, con su nombre, en el selector, válidas.
 *   2. Cada una conserva lo suyo.
 *   3. Las líneas de llena que Axel dio por buenas: 76 %, 72 %, 72 % y
 *      72 %. Cointreau por el hombro; las otras, medidas del líquido.
 *   4. Por nombre. Cointreau salió de la regla de liqueur_slim, que va
 *      antes y le ganaba; las otras cuatro de esa regla siguen ahí. De
 *      Johnnie Walker, sólo el Red Label: es el único medido.
 *
 *   node tools/test-silueta-cuatro-b.js
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
  ['red_label', 'Red Label', 3.99, 0.76],
  ['dads_hat', "Dad's Hat", 3.18, 0.72],
  ['cointreau', 'Cointreau', 2.43, 0.72],
  ['balvenie', 'Balvenie', 2.98, 0.72]
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
prueba('Red Label: recta hasta el 67 %, cuello corto', r('red_label', 0.3) > 0.98 && r('red_label', 0.67) > 0.97 && r('red_label', 0.86) < 0.42,
  [0.3, 0.67, 0.86].map(y => r('red_label', y).toFixed(2)).join(' '));
prueba("Dad's Hat: hombro corto del 64 % al 73 %", r('dads_hat', 0.6) > 0.97 && r('dads_hat', 0.75) < 0.42,
  r('dads_hat', 0.6).toFixed(2) + ' → ' + r('dads_hat', 0.75).toFixed(2));
prueba('Cointreau: la mas ancha de las cuatro', E.every(([k]) => k === 'cointreau' || (B.PROFILES[k] && B.PROFILES.cointreau && B.PROFILES[k].asp > B.PROFILES.cointreau.asp)));
prueba('Cointreau: hombro del 58 % al 73 %', r('cointreau', 0.55) > 0.97 && r('cointreau', 0.75) < 0.36,
  r('cointreau', 0.55).toFixed(2) + ' → ' + r('cointreau', 0.75).toFixed(2));
prueba('Balvenie: el anillo del cuello, mas ancho que lo de arriba', r('balvenie', 0.75) > r('balvenie', 0.87) + 0.08,
  r('balvenie', 0.75).toFixed(2) + ' vs ' + r('balvenie', 0.87).toFixed(2));

console.log('\npor nombre');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const [n, c, k] of [['Johnnie Walker Red Label', 'Whiskey & Bourbon', 'red_label'],
                           ['JW Red Label', 'Whiskey & Bourbon', 'red_label'],
                           ['Johnnie Walker Black Label', 'Whiskey & Bourbon', 'whiskey'],
                           ["Dad's Hat Pennsylvania Rye", 'Whiskey & Bourbon', 'dads_hat'],
                           ['Cointreau', 'Liqueur', 'cointreau'],
                           ['Cointreau 1L', 'Liqueur', 'cointreau'],
                           ['Grand Marnier', 'Liqueur', 'liqueur_slim'],
                           // Antes era St-Germain; desde que tiene su forma medida, el ejemplo
                           // de los que siguen en liqueur_slim es Luxardo.
                           ['Luxardo Maraschino', 'Liqueur', 'liqueur_slim'],
                           ['The Balvenie 12 DoubleWood', 'Whiskey & Bourbon', 'balvenie']]) {
    const s = A.byRules({ item: n, category: c }).shape;
    prueba(n + ' → ' + k, s === k, s);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
