#!/usr/bin/env node
/*
 * ── Fireball, Monkey Shoulder, Oban y Boulard ───────────────────────
 *
 * Cuatro botellas que caían en una forma genérica: las tres primeras en
 * la de whiskey, Boulard en la de brandy. Medidas de fotos con fondo
 * transparente, fila por fila sobre el canal alfa:
 *
 *   Fireball         521 × 170 px   desajuste 0.71 %
 *   Monkey Shoulder 1082 × 422 px   desajuste 0.85 %  (mitad izquierda:
 *                                   los monos van en el hombro derecho)
 *   Oban            1162 × 294 px   desajuste 0.76 %
 *   Boulard         1038 × 280 px   desajuste 0.98 %
 *
 * Lo que se protege:
 *
 *   1. Existen, con su nombre, en el selector, válidas.
 *   2. Cada una conserva lo suyo: Fireball recta con hombro alto; Monkey
 *      Shoulder baja y ancha; Oban alta con hombro corto; Boulard con el
 *      hombro bajo y el cuello muy largo.
 *   3. Las líneas de llena que Axel dio por buenas: 75 % (Fireball, por
 *      el hombro) y 65 %, 71 % y 73 % (medidas del líquido en la foto).
 *   4. Por nombre, ganándole a la categoría. El Boulard XO no: va en un
 *      decantador.
 *
 *   node tools/test-silueta-cuatro.js
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
  ['fireball', 'Fireball', 3.06, 0.75],
  ['monkey_shoulder', 'Monkey Shoulder', 2.56, 0.65],
  ['oban', 'Oban', 3.95, 0.71],
  ['boulard', 'Boulard', 3.71, 0.73]
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
prueba('Fireball: recta hasta el 64 % y cuello estrecho', r('fireball', 0.3) > 0.98 && r('fireball', 0.62) > 0.98 && r('fireball', 0.8) < 0.4,
  [0.3, 0.62, 0.8].map(y => r('fireball', y).toFixed(2)).join(' '));
prueba('Monkey Shoulder: la mas baja y ancha de las cuatro', E.every(([k]) => k === 'monkey_shoulder' || (B.PROFILES[k] && B.PROFILES.monkey_shoulder && B.PROFILES[k].asp > B.PROFILES.monkey_shoulder.asp)));
prueba('Monkey Shoulder: hombro del 52 % al 66 %', r('monkey_shoulder', 0.5) > 0.97 && r('monkey_shoulder', 0.68) < 0.4,
  r('monkey_shoulder', 0.5).toFixed(2) + ' → ' + r('monkey_shoulder', 0.68).toFixed(2));
prueba('Oban: hombro corto del 57 % al 67 %', r('oban', 0.55) > 0.97 && r('oban', 0.7) < 0.47,
  r('oban', 0.55).toFixed(2) + ' → ' + r('oban', 0.7).toFixed(2));
prueba('Boulard: hombro bajo y cuello muy largo', r('boulard', 0.4) > 0.97 && r('boulard', 0.6) < 0.45 && r('boulard', 0.85) < 0.35,
  [0.4, 0.6, 0.85].map(y => r('boulard', y).toFixed(2)).join(' '));

console.log('\npor nombre, ganandole a la categoria');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const [n, c, k] of [['Fireball Cinnamon Whisky', 'Whiskey & Bourbon', 'fireball'],
                           ['Fireball', 'Liqueur', 'fireball'],
                           ['Monkey Shoulder Blended Malt', 'Whiskey & Bourbon', 'monkey_shoulder'],
                           ['Oban 14 Year', 'Whiskey & Bourbon', 'oban'],
                           ['Boulard VSOP Calvados', 'Brandy & Cognac', 'boulard'],
                           ['Boulard XO Calvados', 'Brandy & Cognac', 'brandy']]) {
    const s = A.byRules({ item: n, category: c }).shape;
    prueba(n + ' → ' + k, s === k, s);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
