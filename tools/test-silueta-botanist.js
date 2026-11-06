#!/usr/bin/env node
/*
 * ── La silueta de The Botanist ───────────────────────────────────────
 *
 * Medida de una foto de la botella real (fondo transparente, 385 px de
 * alto, 124 de ancho máximo), fila por fila sobre el canal alfa y
 * reducida a 34 puntos. Desajuste de área 0.95 %. Lo que se protege:
 *
 *   1. Existe con la clave y el nombre: `botanist`, "The Botanist", y se
 *      ofrece en el selector.
 *   2. Es un perfil válido para el motor que dibuja Y calcula el volumen.
 *   3. Conserva lo que la distingue: cilindro recto y un hombro muy corto
 *      y brusco (del cuerpo al cuello en ~6 % de la altura). La de vodka
 *      tiene hombro largo; la de whiskey, collares.
 *   4. La línea de llena cubre el hombro y para antes del cuello. Se
 *      ajustó sobre la lámina con Axel: 71 % "muy arriba", 67 % le faltaba
 *      "que cubra los hombros", 69 % sí. Aquí la regla del 95 % se pasaba
 *      por ARRIBA (75 %, dentro del cuello).
 *   5. Un producto que se llama Botanist y aún no tiene forma recibe ésta.
 *
 *   node tools/test-silueta-botanist.js
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
const K = 'botanist';
const P = B.PROFILES[K];

console.log('\nexiste y se ofrece');
prueba('clave botanist', !!P);
prueba('se llama The Botanist', !!P && P.name === 'The Botanist', P && P.name);
prueba('sale en el selector', B.pickable().includes(K));
prueba('es de las que se miden por nivel', !!P && P.pourable === true);

console.log('\nel motor la acepta');
prueba('perfil valido', !!P && B.isValidProfile(P));
prueba('esbeltez medida, 3.1', !!P && P.asp === 3.1, P && P.asp);

console.log('\nconserva su forma');
if (P) {
  const r = (y) => B.radiusAt(K, y);
  prueba('cilindro recto', Math.abs(r(0.15) - r(0.6)) < 0.03 && r(0.4) > 0.96, r(0.15).toFixed(3) + ' / ' + r(0.6).toFixed(3));
  prueba('hombro muy corto: del cuerpo al cuello en menos del 8 %', r(0.66) > 0.97 && r(0.73) < 0.37,
    r(0.66).toFixed(3) + ' → ' + r(0.73).toFixed(3));
  prueba('cuello recto hasta el tapon', Math.abs(r(0.76) - r(0.9)) < 0.05, r(0.76).toFixed(3) + ' / ' + r(0.9).toFixed(3));
}

console.log('\nla linea de llena cubre el hombro y no entra al cuello');
if (P) {
  prueba('al 69 %', P.yFull === 0.69, P.yFull);
  prueba('ya dentro del hombro', B.radiusAt(K, P.yFull) < 0.95, B.radiusAt(K, P.yFull).toFixed(3));
  prueba('pero no en el cuello', B.radiusAt(K, P.yFull) > 0.5, B.radiusAt(K, P.yFull).toFixed(3));
}

console.log('\nun producto llamado Botanist la recibe');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const n of ['The Botanist Gin', 'Botanist Islay Dry Gin', 'BOTANIST GIN 750ML']) {
    const a = A.byRules({ item: n, category: 'Gin' });
    prueba(n, a.shape === K, a.shape);
  }
  const b = A.byRules({ item: 'Bluecoat Gin', category: 'Gin' });
  prueba('y Bluecoat sigue con la suya', b.shape === 'bluecoat', b.shape);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
