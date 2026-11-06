#!/usr/bin/env node
/*
 * ── La silueta de Don Julio Añejo ────────────────────────────────────
 *
 * Medida de una foto de la botella real (fondo transparente, 425 px de
 * alto, 228 de ancho máximo), fila por fila sobre el canal alfa y
 * reducida a 34 puntos. Desajuste de área 1.04 %. Lo que se protege:
 *
 *   1. Existe con la clave y el nombre: `don_julio_anejo`, "Don Julio
 *      Añejo", y se ofrece en el selector.
 *   2. Es un perfil válido para el motor que dibuja Y calcula el volumen.
 *   3. Conserva lo que la distingue de Crown, la más parecida en ancho:
 *      hombro corto y casi plano, cuello recto y tapón más ancho que el
 *      cuello.
 *   4. La línea de llena va donde termina el hombro y empieza el cuello,
 *      no en el tapón. El primer intento la puso justo debajo de la
 *      madera (79 %) y Axel lo vio en la lámina: "te estás yendo al
 *      tapón". El aro oscuro del tapón mide lo mismo que el cuello y el
 *      corte por ancho no lo distinguía. Con la regla del 95 % caía al
 *      63 %, en mitad del hombro.
 *   5. Un producto que se llama Don Julio Añejo y aún no tiene forma
 *      recibe ésta. El Blanco y el Reposado NO: no se ha medido si usan
 *      la misma botella.
 *
 *   node tools/test-silueta-don-julio.js
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
const K = 'don_julio_anejo';
const P = B.PROFILES[K];

console.log('\nexiste y se ofrece');
prueba('clave don_julio_anejo', !!P);
prueba('se llama Don Julio Añejo', !!P && P.name === 'Don Julio Añejo', P && P.name);
prueba('sale en el selector', B.pickable().includes(K));
prueba('es de las que se miden por nivel', !!P && P.pourable === true);

console.log('\nel motor la acepta');
prueba('perfil valido', !!P && B.isValidProfile(P));
prueba('esbeltez medida, 1.86', !!P && P.asp === 1.86, P && P.asp);

console.log('\nconserva su forma');
if (P) {
  const r = (y) => B.radiusAt(K, y);
  prueba('cuerpo ancho que se abre hacia arriba', r(0.5) > 0.98 && r(0.1) < r(0.5) - 0.04, r(0.1).toFixed(3) + ' / ' + r(0.5).toFixed(3));
  prueba('hombro corto: del cuerpo al cuello en menos del 12 % de la altura', r(0.57) > 0.95 && r(0.68) < 0.36,
    r(0.57).toFixed(3) + ' → ' + r(0.68).toFixed(3));
  prueba('cuello recto', Math.abs(r(0.72) - r(0.79)) < 0.02, r(0.72).toFixed(3) + ' / ' + r(0.79).toFixed(3));
  prueba('y el tapon, mas ancho que el cuello', r(0.86) > r(0.75) + 0.08, r(0.86).toFixed(3));
}

console.log('\nla linea de llena, donde empieza el cuello');
if (P) {
  prueba('por encima del hombro', P.yFull >= 0.68, P.yFull);
  prueba('y lejos del tapon, que empieza hacia el 80 %', P.yFull <= 0.72, P.yFull);
  const f = B.volumeTo(K, P.yFull) / B.volumeTo(K, 0.8);
  prueba('casi todo lo que cabe hasta el tapon', f > 0.97, f.toFixed(4));
}

console.log('\nun producto llamado Don Julio Añejo la recibe');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const n of ['Don Julio Añejo', 'Don Julio Anejo Tequila', 'DON JULIO AÑEJO 750ml']) {
    const a = A.byRules({ item: n, category: 'Tequila & Mezcal' });
    prueba(n, a.shape === K, a.shape);
  }
  for (const n of ['Don Julio Blanco', 'Don Julio Reposado', 'Don Julio 1942']) {
    const b = A.byRules({ item: n, category: 'Tequila & Mezcal' });
    prueba(n + ' no, sin medir', b.shape !== K, b.shape);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
