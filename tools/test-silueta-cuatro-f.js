#!/usr/bin/env node
/*
 * ── Basil Hayden, Skrewball, Malibu y Dewar's ───────────────────────
 *
 * Tres whiskies que caían en la forma genérica de whiskey y Malibu, que
 * caía en la de vodka por ser ron.
 *
 * Skrewball, Malibu y Dewar's se midieron dos veces. Las primeras fotos
 * traían etiquetas que sobresalían y bordes mal recortados, y yo enderecé
 * de más: Skrewball salió cilindro, Malibu una recta que se angostaba
 * hacia arriba y Dewar's sin su pie. Axel: "estan mal disenadas". Mandó
 * otras fotos y de ahí salen estas, que conservan la forma real.
 *
 *   Basil Hayden   992 px   desajuste 3.32 %  (lado izquierdo, sin la banda)
 *   Skrewball      550 px   desajuste 0.95 %
 *   Malibu        1140 px   desajuste 0.73 %  (borde derecho reflejado)
 *   Dewar's        446 px   desajuste 0.93 %
 *
 * Lo que se protege:
 *
 *   1. Existen, con su nombre, en el selector, válidas.
 *   2. Lo que se había perdido la primera vez: Skrewball se angosta hacia
 *      la base, Malibu tiene cintura y hombro largo, Dewar's tiene pie.
 *   3. Basil Hayden, continua de la base al hombro.
 *   4. Las líneas de llena: 70, 75, 74 y 78 %.
 *   5. Por nombre: Dewar's sólo el White Label; Malibu no en lata.
 *
 *   node tools/test-silueta-cuatro-f.js
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
  ['basil_hayden', 'Basil Hayden', 3.92, 0.7],
  ['skrewball', 'Skrewball', 3.37, 0.75],
  ['malibu', 'Malibu', 3.51, 0.74],
  ['dewars', "Dewar's", 4.09, 0.78]
];

console.log('\nexisten y se ofrecen, con su esbeltez y su linea de llena');
for (const [k, n, asp, yf] of E) {
  const P = B.PROFILES[k];
  prueba(n, !!P && P.name === n && B.pickable().includes(k) && B.isValidProfile(P), P && P.name);
  prueba(n + ': esbeltez ' + asp + ', llena al ' + Math.round(yf * 100) + ' %', !!P && P.asp === asp && P.yFull === yf,
    P && (P.asp + ' / ' + P.yFull));
}

const r = (k, y) => B.PROFILES[k] ? B.radiusAt(k, y) : NaN;

console.log('\nlo que se habia perdido la primera vez');
prueba('Skrewball se angosta hacia la base (no es un cilindro)', r('skrewball', 0.1) < r('skrewball', 0.48) - 0.07,
  r('skrewball', 0.1).toFixed(2) + ' vs ' + r('skrewball', 0.48).toFixed(2));
prueba('Malibu: cintura a un tercio, mas angosta que abajo y que arriba', r('malibu', 0.33) < r('malibu', 0.13) - 0.03 && r('malibu', 0.33) < r('malibu', 0.53) - 0.03,
  [0.13, 0.33, 0.53].map(y => r('malibu', y).toFixed(2)).join(' '));
prueba('Malibu: hombro largo, del 58 % al 77 %', r('malibu', 0.6) > 0.85 && r('malibu', 0.67) > 0.5 && r('malibu', 0.77) < 0.42,
  [0.6, 0.67, 0.77].map(y => r('malibu', y).toFixed(2)).join(' '));
prueba("Dewar's: el pie, mas ancho que el cuerpo de encima", r('dewars', 0.05) > r('dewars', 0.2) + 0.05,
  r('dewars', 0.05).toFixed(2) + ' vs ' + r('dewars', 0.2).toFixed(2));
prueba("Dewar's: ancha en el hombro", r('dewars', 0.6) > r('dewars', 0.2) + 0.06,
  r('dewars', 0.6).toFixed(2) + ' vs ' + r('dewars', 0.2).toFixed(2));

console.log('\nBasil Hayden, continua de la base al hombro');
{
  const P = B.PROFILES.basil_hayden;
  const tramo = P ? P.p.filter(([y]) => y >= 0.06 && y <= 0.58) : [];
  const pasos = [];
  for (let i = 1; i < tramo.length; i++) pasos.push(tramo[i][1] - tramo[i - 1][1]);
  const max = pasos.length ? Math.max(...pasos) : NaN, min = pasos.length ? Math.min(...pasos) : NaN;
  prueba('sin escalones: todos los pasos iguales', tramo.length > 10 && max - min < 0.002, min.toFixed(4) + ' … ' + max.toFixed(4));
}

console.log('\npor nombre');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const [n, c, k] of [['Basil Hayden Bourbon', 'Whiskey & Bourbon', 'basil_hayden'],
                           ["Basil Hayden's Dark Rye", 'Whiskey & Bourbon', 'basil_hayden'],
                           ['Skrewball Peanut Butter Whiskey', 'Whiskey & Bourbon', 'skrewball'],
                           ['Malibu Coconut Rum', 'Rum', 'malibu'],
                           ['Malibu Pineapple', 'Rum', 'malibu'],
                           ["Dewar's White Label", 'Whiskey & Bourbon', 'dewars'],
                           ['Dewars', 'Whiskey & Bourbon', 'dewars'],
                           ["Dewar's 12 Year", 'Whiskey & Bourbon', 'whiskey']]) {
    const s = A.byRules({ item: n, category: c }).shape;
    prueba(n + ' → ' + k, s === k, s);
  }
  const lata = A.byRules({ item: 'Malibu Splash Can', category: 'Rum' }).shape;
  prueba('Malibu Splash en lata no recibe la botella', lata !== 'malibu', lata);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
