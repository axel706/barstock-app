#!/usr/bin/env node
/*
 * ── 2 Gingers, Averna, Baileys y Blade and Bow ──────────────────────
 *
 * 2 Gingers y Blade and Bow caían en la forma de whiskey, Averna en
 * liqueur_slim y Baileys en liqueur_cream. Fotos con fondo blanco: la
 * máscara va fila por fila, del primer al último píxel que no es fondo.
 *
 *   2 Gingers       917 px  desajuste 0.61 %
 *   Averna          554 px  desajuste 0.91 %  (el pie es de la botella)
 *   Baileys        1036 px  desajuste 0.70 %
 *   Blade and Bow   541 px  desajuste 0.96 %  (lado izquierdo: la llave)
 *
 * Lo que se protege:
 *
 *   1. Existen, con su nombre, en el selector, válidas.
 *   2. Cada una conserva lo suyo.
 *   3. Las líneas de llena: 79, 76, 70 y 63 %.
 *   4. Baileys gana a la regla de "cream liqueur": "Baileys Irish Cream
 *      Liqueur" lleva esas dos palabras, y con esa regla primero se
 *      quedaba en liqueur_cream. Y acepta el apóstrofo tipográfico, que es
 *      como lo trae el escáner. RumChata sigue en liqueur_cream.
 *
 *   node tools/test-silueta-cuatro-h.js
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
  ['two_gingers', '2 Gingers', 3.79, 0.79],
  ['averna', 'Averna', 4.5, 0.76],
  ['baileys', 'Baileys', 3.28, 0.7],
  ['blade_and_bow', 'Blade and Bow', 2.33, 0.63]
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
prueba('2 Gingers: recta hasta el hombro, cuello largo', r('two_gingers', 0.3) > 0.96 && r('two_gingers', 0.55) > 0.96 && r('two_gingers', 0.75) < 0.5,
  [0.3, 0.55, 0.75].map(y => r('two_gingers', y).toFixed(2)).join(' '));
prueba('Averna: el pie mas ancho que el cuerpo de encima', r('averna', 0.05) > r('averna', 0.17) + 0.05,
  r('averna', 0.05).toFixed(2) + ' vs ' + r('averna', 0.17).toFixed(2));
prueba('Averna: la mas esbelta de las cuatro', E.every(([k]) => k === 'averna' || (B.PROFILES[k] && B.PROFILES.averna && B.PROFILES[k].asp < B.PROFILES.averna.asp)));
prueba('Baileys: se abre hacia el hombro, largo y caido', r('baileys', 0.1) < r('baileys', 0.5) - 0.08 && r('baileys', 0.6) > 0.6 && r('baileys', 0.6) < 0.85,
  [0.1, 0.5, 0.6].map(y => r('baileys', y).toFixed(2)).join(' '));
prueba('Blade and Bow: la base biselada', r('blade_and_bow', 0.05) < r('blade_and_bow', 0.2) - 0.1,
  r('blade_and_bow', 0.05).toFixed(2) + ' vs ' + r('blade_and_bow', 0.2).toFixed(2));
prueba('Blade and Bow: hombro corto, del 58 % al 66 %', r('blade_and_bow', 0.56) > 0.97 && r('blade_and_bow', 0.67) < 0.4,
  r('blade_and_bow', 0.56).toFixed(2) + ' → ' + r('blade_and_bow', 0.67).toFixed(2));

console.log('\npor nombre');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const [n, c, k] of [['2 Gingers Irish Whiskey', 'Whiskey & Bourbon', 'two_gingers'],
                           ['Averna Amaro', 'Liqueur', 'averna'],
                           ['Baileys Irish Cream', 'Liqueur', 'baileys'],
                           ['Baileys Irish Cream Liqueur', 'Liqueur', 'baileys'],
                           ["Bailey's Original", 'Liqueur', 'baileys'],
                           ['Bailey’s Irish Cream', 'Liqueur', 'baileys'],
                           ['RumChata', 'Liqueur', 'liqueur_cream'],
                           ['Blade and Bow Bourbon', 'Whiskey & Bourbon', 'blade_and_bow']]) {
    const s = A.byRules({ item: n, category: c }).shape;
    prueba(n + ' → ' + k, s === k, s);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
