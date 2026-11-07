#!/usr/bin/env node
/*
 * ── 1800 Reposado, 360, Frangelico, St. Elder, St-Germain y Mozart ───
 *
 * 1800 y 360 caían en la forma de vodka (tequila y vodka); los cuatro
 * licores en liqueur_slim. Medidas de fotos JPG con fondo blanco, fila
 * por fila, del primer al último píxel que no es fondo.
 *
 *   1800 Reposado  447 px  desajuste 0.81 %
 *   360            410 px  sin el cierre de alambre; cuerpo recto
 *   Frangelico     554 px  desajuste 1.41 %  (lado izquierdo: el cordón)
 *   St. Elder      424 px  desajuste 0.93 %
 *   St-Germain     552 px  desajuste 0.59 %  (57 puntos donde cambia)
 *   Mozart         554 px  desajuste 0.67 %
 *
 * Lo que Axel corrigió sobre la lámina, y por eso se protege:
 *
 *   - 360: "le pusiste un bump y no lleva". La foto daba un escalón al
 *     40 % y lo tomé por real. El cuerpo es recto.
 *   - St-Germain: "necesita más detalles". Los 34 puntos parejos se
 *     comían el filo del hombro y el pellizco del cuello; lleva 57.
 *
 * Además: el alambre del 360 no cuenta; St-Germain salió de la regla de
 * liqueur_slim que le ganaba; "360 ml" no es la botella de 360.
 *
 *   node tools/test-silueta-seis.js
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
  ['t1800', '1800 Reposado', 2.61, 0.74],
  ['v360', '360', 3.94, 0.73],
  ['frangelico', 'Frangelico', 3.38, 0.83],
  ['st_elder', 'St. Elder', 3.79, 0.78],
  ['st_germain', 'St-Germain', 3.78, 0.84],
  ['mozart', 'Mozart', 1.45, 0.66]
];

console.log('\nexisten y se ofrecen, con su esbeltez y su linea de llena');
for (const [k, n, asp, yf] of E) {
  const P = B.PROFILES[k];
  prueba(n, !!P && P.name === n && B.pickable().includes(k) && B.isValidProfile(P), P && P.name);
  prueba(n + ': esbeltez ' + asp + ', llena al ' + Math.round(yf * 100) + ' %', !!P && P.asp === asp && P.yFull === yf,
    P && (P.asp + ' / ' + P.yFull));
}

const r = (k, y) => B.PROFILES[k] ? B.radiusAt(k, y) : NaN;

console.log('\n360: recto, sin escalon ni alambre');
{
  const P = B.PROFILES.v360;
  const cuerpo = P ? P.p.filter(([y]) => y > 0.1 && y < 0.63).map(([, v]) => v) : [];
  prueba('el cuerpo no cambia de ancho (con el escalon bajaba a .91)', cuerpo.length > 10 && Math.min(...cuerpo) === Math.max(...cuerpo), cuerpo.join(' '));
  const cuello = P ? P.p.filter(([y]) => y > 0.78 && y < 0.99).map(([, v]) => v) : [];
  prueba('el cuello no se ensancha donde va el alambre (llegaba a .64)', cuello.length && Math.max(...cuello) < 0.4, Math.max(...cuello));
}

console.log('\nSt-Germain: el detalle que se comian los puntos parejos');
{
  const P = B.PROFILES.st_germain;
  prueba('mas puntos que los 34 de siempre', !!P && P.p.length > 45, P && P.p.length);
  prueba('el pellizco del cuello, mas angosto que la tapa', r('st_germain', 0.877) < 0.37 && r('st_germain', 0.95) > 0.43,
    r('st_germain', 0.877).toFixed(3) + ' vs ' + r('st_germain', 0.95).toFixed(3));
  prueba('el hombro en corona, al 75 %', r('st_germain', 0.755) > 0.98 && r('st_germain', 0.72) < r('st_germain', 0.755) && r('st_germain', 0.8) < 0.94,
    [0.72, 0.755, 0.8].map(y => r('st_germain', y).toFixed(3)).join(' '));
  prueba('la cintura, mas angosta que el pie', r('st_germain', 0.35) < r('st_germain', 0.03) - 0.05,
    r('st_germain', 0.35).toFixed(3) + ' vs ' + r('st_germain', 0.03).toFixed(3));
}

console.log('\ncada una conserva lo suyo');
prueba('1800: se abre hacia la base', r('t1800', 0.1) > r('t1800', 0.6) + 0.12, r('t1800', 0.1).toFixed(2) + ' vs ' + r('t1800', 0.6).toFixed(2));
prueba('Frangelico: la capucha mas ancha que la cintura del cordon', r('frangelico', 0.55) > r('frangelico', 0.45) + 0.15,
  r('frangelico', 0.55).toFixed(2) + ' vs ' + r('frangelico', 0.45).toFixed(2));
prueba('Mozart: la bola, la mas ancha de las seis', E.every(([k]) => k === 'mozart' || (B.PROFILES[k] && B.PROFILES[k].asp > B.PROFILES.mozart.asp)));

console.log('\npor nombre');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const [n, c, k] of [['1800 Reposado', 'Tequila & Mezcal', 't1800'],
                           ['Tequila 1800 Reposado', 'Tequila & Mezcal', 't1800'],
                           ['1800 Silver', 'Tequila & Mezcal', 'vodka'],
                           ['360 Double Chocolate', 'Vodka', 'v360'],
                           ['360 Vodka', 'Vodka', 'v360'],
                           ['Frangelico', 'Liqueur', 'frangelico'],
                           ['St. Elder Elderflower', 'Liqueur', 'st_elder'],
                           ['St-Germain', 'Liqueur', 'st_germain'],
                           ['St Germain Elderflower', 'Liqueur', 'st_germain'],
                           ['Grand Marnier', 'Liqueur', 'liqueur_slim'],
                           ['Mozart White Chocolate', 'Liqueur', 'mozart']]) {
    const s = A.byRules({ item: n, category: c }).shape;
    prueba(n + ' → ' + k, s === k, s);
  }
  const ml = A.byRules({ item: 'Something 360 ml', category: 'Vodka' }).shape;
  prueba('"360 ml" no es la botella de 360', ml !== 'v360', ml);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
