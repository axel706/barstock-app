#!/usr/bin/env node
/*
 * ── Las filas de las listas, sin desenfoque propio ────────────────────
 *
 * Axel, 2026-11-15: "el scroll de casi todas las listas se siente
 * laggy". Medido en Chromium con la lista real de Inventory (120 filas,
 * CPU frenada 4×): app.css le pone `backdrop-filter: blur(6px)` a TODO
 * <button>, y las filas son botones; cada fila visible se volvía a
 * desenfocar en cada fotograma. ~100 fotogramas en 3 s con él, ~150 sin
 * él, y a la vista no cambia (el fondo ya va desenfocado detrás: la
 * mayor diferencia, 14 de 255 en algunos píxeles). "Probemos y si no me
 * gusta lo eliminamos."
 *
 * Lo que se protege:
 *   1. La regla existe y quita el desenfoque a los botones de las
 *      pantallas del teléfono.
 *   2. NO a los de cristal: la barra de búsqueda, el filtro y el + de
 *      Inventory, "Done", "Tell the team it's low", las cifras del Home.
 *   3. El escritorio no se toca (sólo #mScreens).
 *
 *   node tools/test-listas-sin-blur.js
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

const css = leer('styles/mobile-app.css');
const m = /\/\* ── Las filas de las listas, sin desenfoque[\s\S]*?\*\/\s*([^{]+)\{([^}]*)\}/.exec(css);
prueba('la regla existe', !!m);
const sel = m ? m[1] : '', cuerpo = m ? m[2] : '';
prueba('quita el desenfoque, también el de Safari', /backdrop-filter:\s*none/.test(cuerpo) && /-webkit-backdrop-filter:\s*none/.test(cuerpo), cuerpo.trim());
prueba('sólo en las pantallas del teléfono', /#mScreens/.test(sel) && !/#mTabs|#mBand|#mSheet/.test(sel), sel.trim());
for (const k of ['m-low-b', 'm-cf-b', 'm-ts-mas', 'm-ro-done']) prueba('deja el cristal de .' + k, sel.indexOf(k) >= 0, sel.trim());

// Lo que de verdad se pinta (con y sin desenfoque) no se puede medir
// aquí: jsdom no calcula backdrop-filter, y una comprobación así pasaba
// también sin el cambio. Se mide en Chromium (ver el commit).

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
