#!/usr/bin/env node
/*
 * ── La silueta de Carlo Rossi, la primera con asa ────────────────────
 *
 * El garrafón de Carlo Rossi. Medido de una foto con fondo transparente
 * (453 px de alto), SOLO la mitad izquierda, del borde al eje, reflejada:
 * el asa va a la derecha y, medida de borde a borde, habría inflado el
 * ancho y el volumen. Desajuste de área 0.67 %.
 *
 * Lo que se protege:
 *
 *   1. Existe: `carlo_rossi`, "Carlo Rossi", en el selector, válida.
 *   2. La línea de llena está MEDIDA, no estimada: en la foto el vino
 *      es rojo oscuro y el cuello vacío es claro, y el cambio está al 79 %.
 *   3. El asa se DIBUJA pero no CUENTA. Las siluetas son de revolución
 *      (un radio por altura, reflejado) y así se calcula el volumen; el
 *      asa no cabe ahí. Va aparte, en `asa`, y `asaFor` la traza. El
 *      volumen sale igual con asa o sin ella.
 *   4. El asa nace del cuerpo y vuelve a él: el primer intento la cerraba
 *      sin tocar el cuello y en la lámina salía suelta.
 *   5. Los CUATRO sitios que dibujan botellas la pintan (ficha, panel de
 *      conteo, selector, asignación), y las botellas sin asa no cambian.
 *   6. Un producto Carlo Rossi recibe ésta, antes que la regla de
 *      "burgundy", que le ponía la botella de vino de 750 ml.
 *
 *   node tools/test-silueta-carlo-rossi.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}

global.window = {};
new Function(leer('src/bottle-profiles.js'))();
const B = window.BarStockBottleProfiles;
const K = 'carlo_rossi';
const P = B.PROFILES[K];

console.log('\nexiste y se ofrece');
prueba('clave carlo_rossi', !!P);
prueba('se llama Carlo Rossi', !!P && P.name === 'Carlo Rossi', P && P.name);
prueba('sale en el selector', B.pickable().includes(K));
prueba('perfil valido', !!P && B.isValidProfile(P));
prueba('esbeltez medida sin el asa, 1.95', !!P && P.asp === 1.95, P && P.asp);

console.log('\nla linea de llena, medida en la foto');
prueba('al 79 %', !!P && P.yFull === 0.79, P && P.yFull);

console.log('\nel asa se dibuja y no cuenta');
prueba('asaFor existe', typeof B.asaFor === 'function');
if (P && typeof B.asaFor === 'function') {
  const d = B.asaFor(K, 200, 260, 12);
  prueba('traza el asa', /^M [\d.]+ [\d.]+ L/.test(d) && /Z$/.test(d), d.slice(0, 40));
  prueba('una botella sin asa no traza nada', B.asaFor('vodka', 200, 260, 12) === '' && B.asaFor('generic', 200, 260, 12) === '');
  const sinAsa = Object.assign({}, P); delete sinAsa.asa;
  prueba('el volumen es el mismo con asa o sin ella',
    B.volumeTo(K, 0.5) === B.volumeTo(sinAsa, 0.5) && B.fractionAt(K, 0.5) === B.fractionAt(sinAsa, 0.5));

  // Las coordenadas del asa: a la derecha del eje, y empieza y acaba en
  // el borde de la silueta (nace del cuerpo y vuelve a él).
  const box = B.boxFor(K, 200, 260, 12);
  const pts = d.replace(/[MZ]/g, '').split('L').map(s => s.trim().split(/\s+/).map(Number));
  prueba('todo a la derecha del eje', pts.every(([x]) => x >= box.cx - 0.01));
  const [x0, y0] = pts[0];
  const yRel = (box.base - y0) / box.usable;
  const xBorde = box.cx + B.radiusAt(K, yRel) * box.maxR;
  prueba('nace en el borde del cuerpo', Math.abs(x0 - xBorde) < 0.5, x0.toFixed(2) + ' vs ' + xBorde.toFixed(2));
  const maxX = Math.max(...pts.map(p => p[0]));
  prueba('y sobresale de el', maxX > box.cx + 0.6 * box.maxR, (maxX - box.cx) / box.maxR);
}

console.log('\nlos cuatro sitios que dibujan botellas la pintan');
for (const f of ['src/product-hero.js', 'src/count-panel.js', 'src/bottle-picker.js', 'src/bottle-assign.js']) {
  prueba(f + ' pide el asa', /\.asaFor\(/.test(leer(f)));
}
{
  // La ficha: con asa, un trazo más; sin asa, igual que antes.
  new Function(leer('src/product-hero.js'))();
  const H = window.BarStockProductHero;
  const con = H.silueta({ onHand: 2, suggested: 4, bottleShape: K }, '#4ade80');
  const sin = H.silueta({ onHand: 2, suggested: 4, bottleShape: 'vodka' }, '#4ade80');
  prueba('la ficha pinta el asa', /class="m-bot-asa"/.test(con));
  prueba('fuera del recorte del liquido', !/clip-path[^>]*>[^]*m-bot-asa[^]*<\/g>/.test(con.replace(/\n/g, ' ')));
  prueba('y una botella sin asa no lleva nada de mas', !/m-bot-asa/.test(sin));
}

console.log('\nun producto Carlo Rossi la recibe');
{
  new Function(leer('src/bottle-assign.js'))();
  const A = window.BarStockBottleAssign;
  for (const n of ['Carlo Rossi Burgundy', 'Carlo Rossi Burgundy 4L', 'CARLO ROSSI SANGRIA']) {
    const a = A.byRules({ item: n, category: 'Wine' });
    prueba(n, a.shape === K, a.shape);
  }
  const b = A.byRules({ item: 'Louis Jadot Bourgogne Burgundy', category: 'Wine' });
  prueba('un Burgundy de 750 sigue con la de vino', b.shape === 'wine_burgundy', b.shape);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
