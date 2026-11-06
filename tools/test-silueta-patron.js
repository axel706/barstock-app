#!/usr/bin/env node
/*
 * ── La silueta de Patrón ─────────────────────────────────────────────
 *
 * Medida de una foto de la botella real (fondo transparente, 445 px de
 * alto, 259 de ancho máximo), fila por fila sobre el canal alfa y
 * reducida a 34 puntos. Desajuste de área 1.05 %. Lo que se protege:
 *
 *   1. Existe: `patron`, "Patrón", en el selector, válida.
 *   2. Conserva lo que la distingue de las otras anchas: cuerpo casi
 *      recto, una CÚPULA de hombro larga, cuello corto y corcho en bola.
 *   3. La línea de llena cubre la cúpula y no entra al cuello. La regla
 *      del 95 % la ponía al 77 %, debajo del corcho.
 *   4. Silver, Reposado y Añejo la reciben por nombre; XO Cafe y
 *      Citrónge no, que van en otras botellas.
 *
 *   node tools/test-silueta-patron.js
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
const K = 'patron';
const P = B.PROFILES[K];

console.log('\nexiste y se ofrece');
prueba('clave patron', !!P);
prueba('se llama Patrón', !!P && P.name === 'Patrón', P && P.name);
prueba('sale en el selector', B.pickable().includes(K));
prueba('perfil valido', !!P && B.isValidProfile(P));
prueba('esbeltez medida, 1.72', !!P && P.asp === 1.72, P && P.asp);

console.log('\nconserva su forma');
if (P) {
  const r = (y) => B.radiusAt(K, y);
  prueba('cuerpo casi recto', r(0.1) > 0.95 && r(0.3) > 0.93, r(0.1).toFixed(3) + ' / ' + r(0.3).toFixed(3));
  prueba('cupula larga: del cuerpo al cuello en una cuarta parte de la altura', r(0.4) > 0.88 && r(0.5) < 0.82 && r(0.6) < 0.4,
    [0.4, 0.5, 0.6].map(y => r(y).toFixed(3)).join(' '));
  prueba('cuello corto y corcho mas ancho', r(0.7) < 0.31 && r(0.85) > r(0.7) + 0.03, r(0.7).toFixed(3) + ' / ' + r(0.85).toFixed(3));
}

console.log('\nla linea de llena cubre la cupula');
if (P) {
  const r = B.radiusAt(K, P.yFull);
  prueba('al 56 %', P.yFull === 0.56, P.yFull);
  prueba('arriba de la cupula, sin entrar al cuello', r < 0.7 && r > 0.4, r.toFixed(3));
}

console.log('\nlos Patron la reciben, XO Cafe y Citronge no');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const n of ['Patron Silver', 'Patrón Reposado', 'PATRON ANEJO 750ML']) {
    const a = A.byRules({ item: n, category: 'Tequila & Mezcal' });
    prueba(n, a.shape === K, a.shape);
  }
  for (const n of ['Patron XO Cafe', 'Patrón Citrónge Orange', 'Patron Citronge']) {
    const a = A.byRules({ item: n, category: 'Liqueur' });
    prueba(n + ' no', a.shape !== K, a.shape);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
