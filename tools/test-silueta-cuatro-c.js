#!/usr/bin/env node
/*
 * ── Nikka Coffey, Grey Goose, Cîroc y WhistlePig ────────────────────
 *
 * Dos whiskies que caían en la forma genérica de whiskey y dos vodkas en
 * la de vodka. Medidas de fotos con fondo transparente, fila por fila
 * sobre el canal alfa:
 *
 *   Nikka Coffey   554 × 176 px   desajuste 0.53 %
 *   Grey Goose    1000 × 224 px   desajuste 1.98 %  (sin el escalón)
 *   Cîroc          554 × 124 px   desajuste 0.73 %
 *   WhistlePig     554 × 270 px   desajuste 0.57 %
 *
 * La foto de Grey Goose traía un escalón a media botella: abajo, un 7 %
 * más ancha de golpe. Es del recorte, no de la botella. Axel lo vio
 * ("debe ser continuo") y eligió, entre dos arreglos dibujados, el cuerpo
 * que se estrecha en línea recta de la base al hombro.
 *
 * Lo que se protege:
 *
 *   1. Existen, con su nombre, en el selector, válidas.
 *   2. Cada una conserva lo suyo, y Grey Goose sin escalón: de la base al
 *      hombro el radio sólo baja, y en tramos iguales baja lo mismo.
 *   3. Las líneas de llena que Axel dio por buenas: 71 %, 68 %, 81 %, 72 %.
 *   4. Por nombre, acotadas a lo medido: de Nikka la línea Coffey sin el
 *      gin ni el vodka; de WhistlePig, el 10.
 *
 *   node tools/test-silueta-cuatro-c.js
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
  ['nikka_coffey', 'Nikka Coffey', 3.15, 0.71],
  ['grey_goose', 'Grey Goose', 4.46, 0.68],
  ['ciroc', 'Cîroc', 4.47, 0.81],
  ['whistlepig', 'WhistlePig', 2.05, 0.72]
];

console.log('\nexisten y se ofrecen, con su esbeltez y su linea de llena');
for (const [k, n, asp, yf] of E) {
  const P = B.PROFILES[k];
  prueba(n, !!P && P.name === n && B.pickable().includes(k) && B.isValidProfile(P), P && P.name);
  prueba(n + ': esbeltez ' + asp + ', llena al ' + Math.round(yf * 100) + ' %', !!P && P.asp === asp && P.yFull === yf,
    P && (P.asp + ' / ' + P.yFull));
}

console.log('\nGrey Goose, continua de la base al hombro');
{
  const P = B.PROFILES.grey_goose;
  const tramo = P ? P.p.filter(([y]) => y >= 0.0469 && y <= 0.5781) : [];
  let baja = tramo.length > 10, iguales = tramo.length > 10;
  const pasos = [];
  for (let i = 1; i < tramo.length; i++) {
    const d = tramo[i - 1][1] - tramo[i][1];
    pasos.push(d);
    if (d < 0) baja = false;
  }
  const max = Math.max(...pasos), min = Math.min(...pasos);
  // Con el escalón de la foto, un paso era de .03 y los demás de cero.
  iguales = iguales && max - min < 0.002;
  prueba('el radio solo baja', baja, pasos.map(d => d.toFixed(3)).join(' '));
  prueba('sin escalon: todos los pasos iguales', iguales, min.toFixed(4) + ' … ' + max.toFixed(4));
  prueba('de r 1 en la base a .928 en el hombro', tramo.length && tramo[0][1] === 1 && tramo[tramo.length - 1][1] === 0.928,
    tramo.length && (tramo[0][1] + ' → ' + tramo[tramo.length - 1][1]));
}

console.log('\ncada una conserva lo suyo');
const r = (k, y) => B.PROFILES[k] ? B.radiusAt(k, y) : NaN;
prueba('Nikka Coffey: recta hasta el 64 %, cuello estrecho', r('nikka_coffey', 0.3) > 0.97 && r('nikka_coffey', 0.62) > 0.97 && r('nikka_coffey', 0.8) < 0.42,
  [0.3, 0.62, 0.8].map(y => r('nikka_coffey', y).toFixed(2)).join(' '));
prueba('Ciroc: se estrecha de la base al hombro y cierra brusco al 80 %', r('ciroc', 0.1) > r('ciroc', 0.7) + 0.08 && r('ciroc', 0.79) > 0.82 && r('ciroc', 0.86) < 0.5,
  [0.1, 0.7, 0.79, 0.86].map(y => r('ciroc', y).toFixed(2)).join(' '));
prueba('WhistlePig: la mas baja y ancha de las cuatro', E.every(([k]) => k === 'whistlepig' || (B.PROFILES[k] && B.PROFILES.whistlepig && B.PROFILES[k].asp > B.PROFILES.whistlepig.asp)));

console.log('\npor nombre, acotado a lo medido');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const [n, c, k] of [['Nikka Coffey Grain Whisky', 'Whiskey & Bourbon', 'nikka_coffey'],
                           ['Nikka Coffey Malt', 'Whiskey & Bourbon', 'nikka_coffey'],
                           ['Nikka Coffey Gin', 'Gin', 'vodka'],
                           ['Nikka From the Barrel', 'Whiskey & Bourbon', 'whiskey'],
                           ['Grey Goose Vodka', 'Vodka', 'grey_goose'],
                           ['Ciroc Apple', 'Vodka', 'ciroc'],
                           ['CÎROC Red Berry', 'Vodka', 'ciroc'],
                           ['WhistlePig 10 Year Rye', 'Whiskey & Bourbon', 'whistlepig'],
                           ['WhistlePig PiggyBack', 'Whiskey & Bourbon', 'whiskey'],
                           ['WhistlePig 12 Old World', 'Whiskey & Bourbon', 'whiskey']]) {
    const s = A.byRules({ item: n, category: c }).shape;
    prueba(n + ' → ' + k, s === k, s);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
