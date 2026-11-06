#!/usr/bin/env node
/*
 * ── Belvedere y Ketel One ────────────────────────────────────────────
 *
 * Las dos iban en la forma de vodka (3.41), y son bastante más
 * esbeltas y altas. Medidas de fotos con fondo transparente, fila por
 * fila sobre el canal alfa: Belvedere 447 × 93 px, desajuste 0.44 %;
 * Ketel One 384 × 83 px, desajuste 0.92 %. Fotos pequeñas: cada píxel de
 * ancho pesa más del 1 %. Lo que se protege:
 *
 *   1. Existen, con su nombre, en el selector, válidas.
 *   2. Las dos más esbeltas que la de vodka, y distintas entre sí:
 *      Belvedere con el hombro más bajo y el cuello más largo, Ketel One
 *      con el hombro más alto. Axel: "similares pero no iguales".
 *   3. La línea de llena cubre el hombro de cada una (68 % y 75 %).
 *   4. Por nombre: Belvedere y Ketel One; Ketel One Botanical no, que
 *      va en otra botella.
 *
 *   node tools/test-silueta-vodkas-altas.js
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
const BV = B.PROFILES.belvedere, KO = B.PROFILES.ketel_one;

console.log('\nexisten y se ofrecen');
prueba('Belvedere', !!BV && BV.name === 'Belvedere' && B.pickable().includes('belvedere') && B.isValidProfile(BV), BV && BV.name);
prueba('Ketel One', !!KO && KO.name === 'Ketel One' && B.pickable().includes('ketel_one') && B.isValidProfile(KO), KO && KO.name);
prueba('esbeltez medida: 4.81 y 4.63', !!BV && !!KO && BV.asp === 4.81 && KO.asp === 4.63);

console.log('\nmas esbeltas que la de vodka, y distintas entre si');
if (BV && KO) {
  const v = B.PROFILES.vodka.asp;
  prueba('las dos mas esbeltas que vodka', BV.asp > v + 1 && KO.asp > v + 1, v);
  const r = (k, y) => B.radiusAt(k, y);
  prueba('cuerpo recto en las dos', r('belvedere', 0.3) > 0.97 && r('ketel_one', 0.4) > 0.97);
  prueba('Belvedere: el hombro ya cae al 68 %', r('belvedere', 0.68) < 0.8, r('belvedere', 0.68).toFixed(3));
  prueba('Ketel One: al 68 % todavia es cuerpo', r('ketel_one', 0.68) > 0.95, r('ketel_one', 0.68).toFixed(3));
  prueba('Belvedere con mas cuello: al 76 % ya es cuello, Ketel One no', r('belvedere', 0.76) < 0.45 && r('ketel_one', 0.76) > 0.5,
    r('belvedere', 0.76).toFixed(3) + ' / ' + r('ketel_one', 0.76).toFixed(3));
}

console.log('\nla linea de llena cubre el hombro de cada una');
if (BV && KO) {
  prueba('Belvedere al 68 %', BV.yFull === 0.68, BV.yFull);
  prueba('Ketel One al 75 %', KO.yFull === 0.75, KO.yFull);
  const rb = B.radiusAt('belvedere', BV.yFull), rk = B.radiusAt('ketel_one', KO.yFull);
  prueba('las dos dentro del hombro, no en el cuello', rb < 0.95 && rb > 0.45 && rk < 0.95 && rk > 0.45,
    rb.toFixed(3) + ' / ' + rk.toFixed(3));
}

console.log('\npor nombre');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  const con = (n) => A.byRules({ item: n, category: 'Vodka' }).shape;
  prueba('Belvedere Vodka', con('Belvedere Vodka') === 'belvedere', con('Belvedere Vodka'));
  prueba('BELVEDERE 750ML', con('BELVEDERE 750ML') === 'belvedere', con('BELVEDERE 750ML'));
  prueba('Ketel One Vodka', con('Ketel One Vodka') === 'ketel_one', con('Ketel One Vodka'));
  prueba('Ketel One Citroen', con('Ketel One Citroen') === 'ketel_one', con('Ketel One Citroen'));
  prueba('Ketel One Botanical no', con('Ketel One Botanical Cucumber & Mint') !== 'ketel_one', con('Ketel One Botanical Cucumber & Mint'));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
