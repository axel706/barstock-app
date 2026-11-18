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

// ── Tinta (Axel, 2026-11-18, lámina B) ─────────────────────────────
// El fondo de las tarjetas: el de "From Toast" en Recipes, desde ahora
// el estándar. Lo que no puede volver a pasar: que se copie el color en
// cada pantalla (se toca uno y dejan de decir lo mismo), que una
// tarjeta de Tinta lleve desenfoque, y que lo que avisa pierda su color.
console.log('\nTinta: el fondo de las tarjetas');
{
  const raiz = (/:root \{([\s\S]*?)\n\}/.exec(css) || [])[1] || '';
  prueba('--tinta y --tinta-borde viven en :root', /--tinta: rgba\(15,23,42,\.62\);/.test(raiz) && /--tinta-borde: rgba\(255,255,255,\.1\);/.test(raiz));
  const fuera = css.replace(raiz, '');
  prueba('el color de la tinta no está copiado en ninguna regla (se usa la variable)', !/rgba\(15,\s*23,\s*42,\s*\.62\)/.test(fuera),
    (fuera.match(/[^\n]*rgba\(15,\s*23,\s*42,\s*\.62\)[^\n]*/) || [''])[0].trim());
  const regla = (re) => (re.exec(css) || [])[1] || '';
  const inv = regla(/body\.m-shell \.m-inv \{([^}]*)\}/);
  prueba('las filas de Inventory, de Tinta', /background: var\(--tinta\);/.test(inv) && /border: 1px solid var\(--tinta-borde\);/.test(inv), inv.trim().slice(0, 120));
  prueba('las tarjetas de Do we have, de Tinta', /\.m-fic-bien \{ background: var\(--tinta\); border: 1px solid var\(--tinta-borde\); \}/.test(css));
  prueba('lo que avisa conserva su borde y un toque de su color sobre la tinta',
    /\.m-fic-ojo\s+\{ background: linear-gradient\(135deg, rgba\(245,158,11,\.16\), var\(--tinta\) 55%\), var\(--tinta\);\s*border: 1px solid rgba\(252,211,77,\.32\);/.test(css) &&
    /\.m-fic-mal\s+\{ background: linear-gradient\(135deg, rgba\(239,68,68,\.16\), var\(--tinta\) 55%\), var\(--tinta\);\s*border: 1px solid rgba\(248,113,113,\.32\);/.test(css));
  prueba('las tarjetas de Running out, de Tinta', /\.m-ro-c \{[^}]*background: var\(--tinta\); border: 1px solid var\(--tinta-borde\);/.test(css));
  prueba('From Toast (la de referencia) usa la misma variable', /#mScreens \.m-tl-sec \{[^}]*background: var\(--tinta\)/.test(css));
  const conTinta = css.split('}').filter(b => /var\(--tinta\)/.test(b));
  prueba('ninguna regla de Tinta lleva desenfoque', conTinta.length >= 4 && !conTinta.some(b => /backdrop-filter:\s*blur/.test(b)), conTinta.length + ' reglas');
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
