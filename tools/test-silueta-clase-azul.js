#!/usr/bin/env node
/*
 * ── La silueta de Clase Azul ─────────────────────────────────────────
 *
 * Medida de una foto de la botella real (fondo transparente, 538 px de
 * alto, 135 de ancho máximo), fila por fila sobre el canal alfa y
 * reducida a 34 puntos. Desajuste de área 1.22 %. Lo que se protege:
 *
 *   1. Existe con la clave y el nombre que Axel le dio: `clase_azul`,
 *      "Clase Azul", y se ofrece en el selector.
 *   2. Es un perfil válido para el motor que dibuja Y calcula el volumen.
 *   3. Conserva lo que la distingue: base ancha, CINTURA encima del pie
 *      azul, panza del medallón, cuello fino y TAPÓN esférico. La
 *      cintura parecía un fallo de medición y se comprobó que es real.
 *   4. La línea de llena va justo debajo del tapón, no donde cae el 95 %
 *      del volumen. Con esa regla salía al 66 % de la altura, en mitad
 *      del cuerpo, y Axel lo vio en la lámina: "dejas el lleno muy
 *      abajo". El tapón es macizo y el tramo de arriba, largo y estrecho,
 *      guarda tan poco que el último 5 % ocupaba un tercio de la altura.
 *   5. Un producto que se llama Clase Azul y aún no tiene forma recibe
 *      ésta, aunque su categoría sea tequila.
 *
 *   node tools/test-silueta-clase-azul.js
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
const P = B.PROFILES.clase_azul;

console.log('\nexiste y se ofrece');
prueba('clave clase_azul', !!P);
prueba('se llama Clase Azul', !!P && P.name === 'Clase Azul', P && P.name);
prueba('sale en el selector', B.pickable().includes('clase_azul'));
prueba('es de las que se miden por nivel', !!P && P.pourable === true);

console.log('\nel motor la acepta');
prueba('perfil valido', !!P && B.isValidProfile(P));
prueba('esbeltez medida, 3.97', !!P && P.asp === 3.97, P && P.asp);

console.log('\nconserva su forma');
let cuello = null;
if (P) {
  const r = (y) => B.radiusAt('clase_azul', y);
  prueba('base ancha', r(0.05) > 0.97, r(0.05).toFixed(3));
  prueba('cintura encima del pie azul', r(0.36) < 0.6 && r(0.36) < r(0.29) - 0.12, r(0.36).toFixed(3));
  prueba('panza del medallon por encima', r(0.48) > 0.72 && r(0.48) > r(0.36) + 0.15, r(0.48).toFixed(3));
  cuello = [0, 9];
  for (let y = 0.6; y <= 0.85; y += 0.001) { const v = r(y); if (v < cuello[1]) cuello = [y, v]; }
  prueba('cuello fino hacia el 77 %', cuello[0] > 0.74 && cuello[0] < 0.79 && cuello[1] < 0.42,
    cuello.map(x => x.toFixed(3)).join(' '));
  prueba('y el tapon, mas ancho que el cuello', r(0.9) > cuello[1] + 0.3, r(0.9).toFixed(3));
}

console.log('\nla linea de llena, justo debajo del tapon');
if (P && cuello) {
  prueba('por debajo del cuello', P.yFull < cuello[0], P.yFull + ' vs ' + cuello[0].toFixed(3));
  prueba('pero no en mitad del cuerpo: a menos de 3 puntos del cuello', cuello[0] - P.yFull < 0.03,
    (cuello[0] - P.yFull).toFixed(3));
  const f = B.volumeTo('clase_azul', P.yFull) / B.volumeTo('clase_azul', cuello[0]);
  prueba('casi todo lo que cabe hasta el cuello, no el 95 %', f > 0.99, f.toFixed(4));
}

console.log('\nun producto llamado Clase Azul la recibe');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  const a = A.byRules({ item: 'Clase Azul Plata Tequila', category: 'Tequila & Mezcal' });
  prueba('por el nombre, aunque la categoria diga tequila', a.shape === 'clase_azul', a.shape);
  const b = A.byRules({ item: 'Casamigos Blanco', category: 'Tequila & Mezcal' });
  prueba('y los demas tequilas siguen con la suya', b.shape === 'vodka', b.shape);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
