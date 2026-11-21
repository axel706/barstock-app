#!/usr/bin/env node
/*
 * ── Woodford Reserve ─────────────────────────────────────────────────
 *
 * Caía en la forma de whiskey. Foto de Axel (2026-11-21) con fondo
 * blanco, fila por fila, del primer al último píxel que no es fondo:
 * 603 px de alto por 319 de ancho, desajuste de área 0.48 %. Es la
 * petaca ancha y plana: cuerpo recto casi hasta la mitad, hombro
 * redondo del 52 % al 70 %, cuello corto. El bourbon se ve en la foto:
 * llega al 66 %, justo antes del hombro.
 *
 * Lo que se protege:
 *
 *   1. Existe, con su nombre, en el selector, válida.
 *   2. Lo suyo: ancha (no la de whiskey), recta hasta la mitad, cuello
 *      corto.
 *   3. La línea de llena: 66 %.
 *   4. Por nombre: el Bourbon, el Double Oaked y el Rye van en la misma
 *      botella.
 *
 *   node tools/test-silueta-woodford.js
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

console.log('\nexiste y se ofrece, con su esbeltez y su linea de llena');
const P = B.PROFILES.woodford;
prueba('Woodford Reserve', !!P && P.name === 'Woodford Reserve' && B.pickable().includes('woodford') && B.isValidProfile(P), P && P.name);
prueba('esbeltez 1.89, llena al 66 %', !!P && P.asp === 1.89 && P.yFull === 0.66, P && (P.asp + ' / ' + P.yFull));

console.log('\nconserva lo suyo');
const r = (k, y) => B.PROFILES[k] ? B.radiusAt(k, y) : NaN;
prueba('ancha y baja, no la de whiskey', !!P && P.asp < B.PROFILES.whiskey.asp - 0.5, P && P.asp + ' vs ' + B.PROFILES.whiskey.asp);
prueba('recta de la base a la mitad', [0.1, 0.25, 0.4, 0.5].every(y => r('woodford', y) > 0.98),
  [0.1, 0.25, 0.4, 0.5].map(y => r('woodford', y).toFixed(3)).join(' '));
prueba('hombro redondo y cuello corto', r('woodford', 0.6) > 0.85 && r('woodford', 0.75) < 0.27 && r('woodford', 0.9) < 0.3,
  [0.6, 0.75, 0.9].map(y => r('woodford', y).toFixed(2)).join(' '));

console.log('\npor nombre');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const [n, c, k] of [['Woodford Reserve Bourbon', 'Whiskey & Bourbon', 'woodford'],
                           ['Woodford Reserve Double Oaked', 'Whiskey & Bourbon', 'woodford'],
                           ['Woodford Rye', 'Whiskey & Bourbon', 'woodford']]) {
    const s = A.byRules({ item: n, category: c }).shape;
    prueba(n + ' → ' + k, s === k, s);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
