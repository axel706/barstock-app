#!/usr/bin/env node
/*
 * ── La silueta de Aperol ─────────────────────────────────────────────
 *
 * Medida de una foto de la botella real (fondo transparente, 1000 px de
 * alto, 243 de ancho máximo), fila por fila sobre el canal alfa y
 * reducida a 34 puntos. Desajuste de área 0.98 %. Lo que se protege:
 *
 *   1. Existe con la clave y el nombre que Axel le dio: `aperol`,
 *      "Aperol", y se ofrece en el selector.
 *   2. Es un perfil válido para el motor que dibuja Y calcula el volumen.
 *   3. Conserva lo que la distingue de las demás: base ensanchada,
 *      cintura baja y cuerpo que se abre hasta el hombro. Si alguien la
 *      "alisa" en un cilindro, deja de ser ella.
 *   4. `yFull` es la altura del 95 % del volumen, no un número a ojo.
 *   5. Un producto que se llama Aperol y aún no tiene forma recibe ésta.
 *
 *   node tools/test-silueta-aperol.js
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
const P = B.PROFILES.aperol;

console.log('\nexiste y se ofrece');
prueba('clave aperol', !!P);
prueba('se llama Aperol', !!P && P.name === 'Aperol', P && P.name);
prueba('sale en el selector', B.pickable().includes('aperol'));
prueba('es de las que se miden por nivel', !!P && P.pourable === true);

console.log('\nel motor la acepta');
prueba('perfil valido', !!P && B.isValidProfile(P));
prueba('esbeltez medida, 4.12', !!P && P.asp === 4.12, P && P.asp);

console.log('\nconserva su forma');
if (P) {
  const r = (y) => B.radiusAt('aperol', y);
  prueba('la base se ensancha casi al maximo', r(0.05) > 0.95, r(0.05).toFixed(3));
  prueba('la cintura, hacia el 20 %, es mas estrecha', r(0.2) < 0.88 && r(0.2) < r(0.05) - 0.08, r(0.2).toFixed(3));
  prueba('y el cuerpo se abre hasta el hombro', r(0.57) > 0.97 && r(0.57) > r(0.2) + 0.1, r(0.57).toFixed(3));
  prueba('cuello largo y estrecho', r(0.85) < 0.42 && r(0.95) < 0.42, r(0.85).toFixed(3));
}

console.log('\nyFull es el 95 % del volumen');
if (P) {
  const total = B.volumeTo('aperol', 1);
  const f = B.volumeTo('aperol', P.yFull) / total;
  prueba('a yFull cabe el 95 %', Math.abs(f - 0.95) < 0.005, f.toFixed(4));
}

console.log('\nun producto llamado Aperol la recibe');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  const a = A.byRules({ item: 'Aperol Aperitivo', category: 'Liqueur' });
  prueba('por el nombre, aunque la categoria diga licor', a.shape === 'aperol', a.shape);
  const b = A.byRules({ item: 'Cointreau', category: 'Liqueur' });
  prueba('y no le quita su forma a los demas licores', b.shape === 'liqueur_slim', b.shape);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
