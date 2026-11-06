#!/usr/bin/env node
/*
 * ── La silueta de Bluecoat ───────────────────────────────────────────
 *
 * Medida de una foto de la botella real (fondo transparente, 426 px de
 * alto, 124 de ancho máximo), fila por fila sobre el canal alfa y
 * reducida a 34 puntos. Desajuste de área 0.72 %. Lo que se protege:
 *
 *   1. Existe con la clave y el nombre: `bluecoat`, "Bluecoat", y se
 *      ofrece en el selector.
 *   2. Es un perfil válido para el motor que dibuja Y calcula el volumen.
 *   3. Conserva lo que la separa de la de vodka, que tiene casi la misma
 *      esbeltez (3.41): se estrecha hacia la base, hombro cuadrado y
 *      corto, cuello largo que se afina hacia el corcho.
 *   4. La línea de llena va en la parte alta del hombro, no en el cuello:
 *      al 75 % (donde empieza el cuello) Axel la vio "un poco, sólo un
 *      poco" alta, y quedó en el 73 %. Con la regla del 95 % caía al 71 %.
 *   5. Un producto que se llama Bluecoat y aún no tiene forma recibe ésta.
 *
 *   node tools/test-silueta-bluecoat.js
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
const K = 'bluecoat';
const P = B.PROFILES[K];

console.log('\nexiste y se ofrece');
prueba('clave bluecoat', !!P);
prueba('se llama Bluecoat', !!P && P.name === 'Bluecoat', P && P.name);
prueba('sale en el selector', B.pickable().includes(K));
prueba('es de las que se miden por nivel', !!P && P.pourable === true);

console.log('\nel motor la acepta');
prueba('perfil valido', !!P && B.isValidProfile(P));
prueba('esbeltez medida, 3.44', !!P && P.asp === 3.44, P && P.asp);

console.log('\nconserva su forma');
if (P) {
  const r = (y) => B.radiusAt(K, y);
  prueba('se estrecha hacia la base', r(0.15) < r(0.6) - 0.07, r(0.15).toFixed(3) + ' / ' + r(0.6).toFixed(3));
  prueba('hombro cuadrado y corto', r(0.65) > 0.98 && r(0.76) < 0.38, r(0.65).toFixed(3) + ' → ' + r(0.76).toFixed(3));
  prueba('cuello largo que se afina', r(0.78) > r(0.88) + 0.03 && r(0.88) < 0.31, r(0.78).toFixed(3) + ' → ' + r(0.88).toFixed(3));
}

console.log('\nla linea de llena, en lo alto del hombro');
if (P) {
  prueba('al 73 %', P.yFull === 0.73, P.yFull);
  prueba('todavia en el hombro, no en el cuello', B.radiusAt(K, P.yFull) > 0.4, B.radiusAt(K, P.yFull).toFixed(3));
}

console.log('\nun producto llamado Bluecoat la recibe');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const n of ['Bluecoat Gin', 'Bluecoat American Dry Gin', 'Blue Coat Gin']) {
    const a = A.byRules({ item: n, category: 'Gin' });
    prueba(n, a.shape === K, a.shape);
  }
  const b = A.byRules({ item: 'Bombay Sapphire', category: 'Gin' });
  prueba('y los demas gins siguen con la suya', b.shape !== K, b.shape);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
