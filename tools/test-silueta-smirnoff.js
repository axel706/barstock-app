#!/usr/bin/env node
/*
 * ── La silueta de Smirnoff ───────────────────────────────────────────
 *
 * Medida de una foto de la botella real (fondo transparente, 554 px de
 * alto, 141 de ancho máximo), fila por fila sobre el canal alfa y
 * reducida a 34 puntos. Desajuste de área 0.66 %. Lo que se protege:
 *
 *   1. Existe: `smirnoff`, "Smirnoff", en el selector, válida.
 *   2. Conserva lo que la separa de la de vodka que tenía: base
 *      ensanchada, cintura suave abajo, cuerpo que se abre hasta un
 *      hombro corto, cuello recto.
 *   3. La línea de llena cubre el hombro (el criterio que Axel fijó con
 *      Botanist) y no entra al cuello.
 *   4. Los Smirnoff la reciben por nombre, sabores incluidos —comparten
 *      botella—, pero NO Smirnoff Ice ni los seltzers: van en botellín o
 *      lata y se cuentan enteros.
 *
 *   node tools/test-silueta-smirnoff.js
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
const K = 'smirnoff';
const P = B.PROFILES[K];

console.log('\nexiste y se ofrece');
prueba('clave smirnoff', !!P);
prueba('se llama Smirnoff', !!P && P.name === 'Smirnoff', P && P.name);
prueba('sale en el selector', B.pickable().includes(K));
prueba('perfil valido', !!P && B.isValidProfile(P));
prueba('esbeltez medida, 3.93', !!P && P.asp === 3.93, P && P.asp);

console.log('\nconserva su forma');
if (P) {
  const r = (y) => B.radiusAt(K, y);
  prueba('base ensanchada y cintura suave', r(0.05) > 0.97 && r(0.15) < r(0.05) - 0.05, r(0.05).toFixed(3) + ' / ' + r(0.15).toFixed(3));
  prueba('cuerpo que se abre hasta el hombro', r(0.69) > 0.98 && r(0.69) > r(0.2) + 0.05, r(0.2).toFixed(3) + ' → ' + r(0.69).toFixed(3));
  prueba('hombro corto y cuello recto', r(0.8) < 0.41 && Math.abs(r(0.82) - r(0.94)) < 0.03, r(0.8).toFixed(3));
}

console.log('\nla linea de llena cubre el hombro');
if (P) {
  const r = B.radiusAt(K, P.yFull);
  prueba('al 75 %', P.yFull === 0.75, P.yFull);
  prueba('dentro del hombro, no en el cuello', r < 0.95 && r > 0.45, r.toFixed(3));
}

console.log('\nlos Smirnoff la reciben, los Ice no');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const n of ['Smirnoff Vodka', 'Smirnoff Vanilla', 'SMIRNOFF NO. 21 750ML', 'Smirnoff Raspberry']) {
    const a = A.byRules({ item: n, category: 'Vodka' });
    prueba(n, a.shape === K, a.shape);
  }
  for (const n of ['Smirnoff Ice', 'Smirnoff Ice Red White & Berry', 'Smirnoff Seltzer']) {
    const a = A.byRules({ item: n, category: 'Beer' });
    prueba(n + ' no', a.shape !== K, a.shape);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
