#!/usr/bin/env node
/*
 * ── La botella flauta de vino ────────────────────────────────────────
 *
 * La de Riesling, medida de una foto de un J. Lohr Bay Mist (fondo
 * transparente, 554 px de alto, 128 de ancho máximo), fila por fila sobre
 * el canal alfa. Desajuste de área 0.77 %. La usan varios vinos, y hasta
 * ahora iban en la Burgundy, la de White Haven. Lo que se protege:
 *
 *   1. Existe: `wine_flute`, "Wine · Flute", en el selector, válida.
 *   2. Es la más esbelta del catálogo y su hombro es MUY largo: baja del
 *      45 % al 80 % de la altura y se funde con el cuello. La Burgundy
 *      es más ancha y su hombro empieza más arriba.
 *   3. La línea de llena al 70 %, a media bajada del hombro: Axel la
 *      bajó sobre la lámina desde el 77 % y el 74 %.
 *   4. Riesling y Gewürztraminer la reciben por nombre, y dejan de ir a
 *      la Burgundy. Los blancos de esa regla (Sauvignon Blanc,
 *      Chardonnay…) siguen en la Burgundy.
 *
 *   node tools/test-silueta-wine-flute.js
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
const K = 'wine_flute';
const P = B.PROFILES[K];

console.log('\nexiste y se ofrece');
prueba('clave wine_flute', !!P);
prueba('se llama Wine · Flute', !!P && P.name === 'Wine · Flute', P && P.name);
prueba('sale en el selector', B.pickable().includes(K));
prueba('perfil valido', !!P && B.isValidProfile(P));
prueba('esbeltez medida, 4.33', !!P && P.asp === 4.33, P && P.asp);

console.log('\nconserva su forma');
if (P) {
  const r = (y) => B.radiusAt(K, y);
  prueba('la mas esbelta del catalogo', B.pickable().every(k => k === K || Number(B.PROFILES[k].asp) <= P.asp));
  prueba('cuerpo recto hasta la mitad', r(0.15) > 0.97 && r(0.4) > 0.95, r(0.15).toFixed(3) + ' / ' + r(0.4).toFixed(3));
  prueba('hombro largo: a mitad de camino todavia baja', r(0.6) > 0.65 && r(0.6) < 0.75 && r(0.72) > 0.44 && r(0.72) < 0.5,
    r(0.6).toFixed(3) + ' / ' + r(0.72).toFixed(3));
  prueba('distinta de la Burgundy: a la misma altura, mas abierta', r(0.6) > B.radiusAt('wine_burgundy', 0.6) + 0.05,
    r(0.6).toFixed(3) + ' vs ' + B.radiusAt('wine_burgundy', 0.6).toFixed(3));
}

console.log('\nla linea de llena');
prueba('al 70 %', !!P && P.yFull === 0.7, P && P.yFull);

console.log('\nRiesling y Gewurztraminer la reciben; los demas blancos no');
{
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-assign.js'), 'utf8'))();
  const A = window.BarStockBottleAssign;
  for (const n of ['J. Lohr Bay Mist White Riesling', 'Chateau Ste Michelle Riesling', 'Trimbach Gewurztraminer', 'Hugel Gewürztraminer']) {
    const a = A.byRules({ item: n, category: 'Wine' });
    prueba(n, a.shape === K, a.shape);
  }
  for (const n of ['White Haven Sauvignon Blanc', 'Paul Hobbs Chardonnay', 'Santa Margherita Pinot Grigio']) {
    const a = A.byRules({ item: n, category: 'Wine' });
    prueba(n + ' sigue en Burgundy', a.shape === 'wine_burgundy', a.shape);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
