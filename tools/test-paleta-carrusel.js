#!/usr/bin/env node
/*
 * ── La paleta del carrusel ───────────────────────────────────────────
 *
 * El fallo que esto vino a arreglar no era estético: la tarjeta del
 * ciclo y la de MarginEdge usaban las DOS `tono: 'teal'`. No es que se
 * parecieran — eran el mismo color, y al deslizar de una a otra no
 * cambiaba nada en pantalla. Igual pasaba con el paso "Load the count"
 * del ciclo, que iba en azul, la familia de las órdenes.
 *
 * ── La regla ────────────────────────────────────────────────────────
 *
 * Un tono por FAMILIA de tarjeta, y el tono significa algo:
 *
 *     verde    bienvenida
 *     teal     ciclo
 *     violet   MarginEdge
 *     blue     órdenes
 *     red      se está acabando
 *     amber    necesita que la mires      (estado, no tarjeta)
 *     calm     no hay nada que hacer      (estado, no tarjeta)
 *
 * Amber y calm son transversales a propósito: cualquier tarjeta puede
 * ponerse ámbar si pide atención. Por eso esta prueba NO exige que
 * cada tono se use una sola vez; exige que cada FAMILIA tenga el suyo.
 *
 * Y vigila el degradado, que es lo otro que se deshace solo:
 *
 *   1. Tres paradas. Con dos es una rampa constante y sobre un color
 *      oscuro no se lee como transición, se lee como color plano
 *      sucio.
 *   2. Los siete arrancan del nivel 500 de su familia. El primer
 *      intento mezclaba 500 y 600, y el recorrido solo se veía en dos
 *      de siete porque los 600 ya salen oscuros.
 *   3. El encabezado en blanco. Los tintes pálidos se lavan sobre la
 *      esquina viva.
 *
 *   node tools/test-paleta-carrusel.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const css = leer('styles/mobile-app.css').replace(/\/\*[\s\S]*?\*\//g, '');
const js = leer('src/mobile-home.js');
const jsLimpio = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const TONOS = ['verde', 'teal', 'violet', 'blue', 'red', 'amber', 'calm'];

grupo('cada tono existe y lleva su degradado');
{
  for (const t of TONOS) {
    const m = new RegExp('\\.m-hero-' + t + '\\s*\\{([^}]*)\\}').exec(css);
    if (!m) { prueba(t, false, 'no existe la regla'); continue; }
    const r = m[1];

    const paradas = (r.match(/rgba\([^)]*\)\s+\d+%/g) || []).length;
    prueba(t + ' · tres paradas', paradas === 3, paradas + ' paradas');
  }
}

grupo('todos arrancan con el mismo brío');
{
  // Lo que hace visible la transición es el RECORRIDO de luminosidad.
  // Si un tono arranca oscuro, no tiene de dónde caer. Se mide la
  // luminosidad del primer color de cada degradado: tienen que estar
  // todos en la misma banda, o unos se verán degradados y otros no.
  const luz = [];
  for (const t of TONOS) {
    const m = new RegExp('\\.m-hero-' + t + '\\s*\\{([^}]*)\\}').exec(css);
    const c = /rgba\((\d+),(\d+),(\d+)/.exec(m ? m[1] : '');
    if (!c) { prueba(t + ' · color de salida', false); continue; }
    // luminancia percibida, la fórmula de siempre
    const L = Math.round(.299 * +c[1] + .587 * +c[2] + .114 * +c[3]);
    luz.push([t, L]);
  }
  const vals = luz.map(x => x[1]);
  const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  // calm es gris a propósito y queda por debajo; se le perdona.
  const sinCalm = luz.filter(x => x[0] !== 'calm').map(x => x[1]);
  const dMin = Math.min.apply(null, sinCalm), dMax = Math.max.apply(null, sinCalm);
  prueba('ninguno sale demasiado oscuro', dMin >= 90,
    luz.map(x => x[0] + ':' + x[1]).join(' '));
  prueba('ni la diferencia entre ellos es abismal', dMax - dMin <= 90,
    'de ' + dMin + ' a ' + dMax);

  // Y todos tienen que CAER a casi negro, o no hay transición.
  for (const t of TONOS) {
    const m = new RegExp('\\.m-hero-' + t + '\\s*\\{([^}]*)\\}').exec(css);
    // SOLO lo de dentro del linear-gradient. La regla termina con el
    // color del `border`, que es claro a propósito, y cogiendo el
    // último rgba() de todo el bloque se medía el borde en vez de la
    // última parada.
    const grad = /linear-gradient\(([^;]*)\)/.exec(m ? m[1] : '');
    const todas = (grad ? grad[1] : '').match(/rgba\((\d+),(\d+),(\d+)/g) || [];
    const ult = /rgba\((\d+),(\d+),(\d+)/.exec(todas[todas.length - 1] || '');
    const L = ult ? Math.round(.299 * +ult[1] + .587 * +ult[2] + .114 * +ult[3]) : 999;
    prueba(t + ' · cae a casi negro', L <= 30, 'luminancia ' + L);
  }
}

grupo('el encabezado se lee sobre la esquina viva');
{
  // Los tintes pálidos de cada familia (#fde68a sobre ámbar) se lavan
  // ahora que la esquina de arriba es mucho más viva.
  prueba('va en blanco',
    /\.m-hero-amber \.m-hero-k[\s\S]{0,400}?color:\s*rgba\(255,255,255/.test(css) ||
    /\.m-hero-k\s*\{\s*color:\s*rgba\(255,255,255/.test(css));

  for (const t of ['amber', 'red', 'teal', 'violet']) {
    const re = new RegExp('\\.m-hero-' + t + ' \\.m-hero-k\\s*\\{\\s*color:\\s*#');
    prueba('nadie dejó un tinte pálido en ' + t, !re.test(css));
  }
}

grupo('cada familia tiene su tono, y no lo comparte');
{
  // Se lee el tono que emite cada constructor, no el CSS.
  // La bienvenida (verde) y MarginEdge (violeta) salieron del carrusel
  // con el rediseño del Home (2026-11-12).
  const dueno = {
    // El rótulo se calcula —un ciclo sin contar dice los días que
    // lleva abierto— así que no puede ir pegado al tono en la misma
    // línea. Lo que importa es que el teal siga siendo del ciclo.
    ciclo:      /tono:\s*'teal',[\s\S]{0,400}?'Cycle open/,
    ordenes:    /tono:\s*'blue',\s*\n?\s*k:\s*'Orders waiting'|tono:\s*'blue',$/m,
    pronto:     /tono:\s*'red'/
  };
  for (const [q, re] of Object.entries(dueno)) {
    prueba(q + ' tiene tono propio', re.test(jsLimpio));
  }

  // El fallo original era el ciclo en teal Y MarginEdge en teal a la
  // vez. La tarjeta de MarginEdge salió del carrusel (2026-11-12): vive
  // en la cifra "Spent this cycle" y su hoja.
  prueba('MarginEdge ya no es una tarjeta del carrusel', !/function tarjetaFacturas/.test(jsLimpio));

  // Y el paso "Load the count" en azul, que es la familia de órdenes.
  prueba('ningún paso del ciclo se va al azul',
    !/tono:\s*'blue', k: 'Cycle/.test(jsLimpio));
}

grupo('mientras sincroniza, se ve');
{
  // El degradado que se movía en la tarjeta de MarginEdge se fue con
  // ella. Lo que queda es el giro de "Sync now" en la hoja de Spent this
  // cycle, con las mismas dos reglas.
  const js2 = jsLimpio;
  prueba('el botón gira mientras busca', /\.m-cfh-sync\.girando \.ti\s*\{[^}]*animation:\s*mSyncGira/.test(css));
  prueba('y se para en TODAS las salidas',
    /const parar = \(\) => \{[\s\S]{0,160}classList\.remove\('girando'\)/.test(js2));

  // Mil milisegundos: un sync rápido es un parpadeo, el botón parece que
  // no hizo nada y se vuelve a pulsar.
  const min = Number((/MINIMO_MS\s*=\s*(\d+)/.exec(js2) || [])[1] || 0);
  prueba('tiene un mínimo en pantalla', min >= 900, min + 'ms');
  prueba('pero no hace esperar de más', min <= 1600, min + 'ms');

  prueba('respeta prefers-reduced-motion',
    /prefers-reduced-motion[\s\S]{0,120}\.m-cfh-sync\.girando \.ti[\s\S]{0,40}animation:\s*none/.test(css));
}

grupo('lo de abajo del Home habla el mismo idioma');
{
  // Mismo degradado de tres paradas que el carrusel. Lo que cambia es
  // qué dice el color, no cómo está hecho.
  //
  // `.m-stat` NO está en la lista a propósito: ver más abajo.
  const abajo = {
    '.m-mvcard': 'Top movers',
    '.m-col-up': 'Took off',
    '.m-col-dn': 'Went quiet'
  };
  for (const [sel, q] of Object.entries(abajo)) {
    const m = new RegExp(sel.replace('.', '\\.') + '\\s*\\{([^}]*)\\}').exec(css);
    const r = m ? m[1] : '';
    const paradas = (r.match(/rgba\([^)]*\)\s+\d+%/g) || []).length;
    prueba(q + ' · tres paradas', paradas === 3, paradas + ' paradas');
  }

  // ── Las dos cifras se quedan FUERA del sistema ────────────────────
  //
  // Se probaron dos veces dentro: primero con el pizarra del carrusel
  // y luego con una versión apagada de ese pizarra. Las dos veces el
  // recuadro pesaba más que el número que contiene, que es al revés
  // de lo que tiene que hacer una tarjeta de cifra.
  //
  // No son tarjetas: son dos números. El degradado es para lo que
  // arriba se mira y se toca.
  // Desde 2026-11-12 son tres (.m-cf-c, "On the shelf", "Sold
  // yesterday", "Spent this cycle"), con la misma regla.
  const stat = /\.m-cf-c\s*\{([^}]*)\}/.exec(css);
  prueba('las cifras siguen en vidrio liso',
    !!stat && /background:\s*rgba\(255,255,255,\.09\)/.test(stat[1]),
    (stat && stat[1] || '').trim().slice(0, 70));
  prueba('sin degradado', !!stat && !/linear-gradient/.test(stat[1]));
  prueba('y su rótulo conserva el gris de antes',
    /\.m-cf-k\s*\{[^}]*color:\s*#c3d2e2/.test(css));

  // Took off y Went quiet conservan color porque ahí el color ES el
  // dato: sube o baja. Si alguien las pasa a gris, la mitad del
  // mensaje desaparece.
  const up = /\.m-col-up\s*\{([^}]*)\}/.exec(css);
  const dn = /\.m-col-dn\s*\{([^}]*)\}/.exec(css);
  prueba('Took off sigue siendo verde', !!up && /rgba\(16,185,129/.test(up[1]));
  prueba('Went quiet sigue siendo rojo', !!dn && /rgba\(244,63,94/.test(dn[1]));

  // Los rótulos en blanco, igual que arriba. Las cifras no entran:
  // sobre vidrio liso el blanco puro es demasiado y su gris funciona.
  for (const [sel, q] of [['\\.m-mvcard \\.m-hero-k', 'Top movers'],
                          ['\\.m-col-dn \\.m-col-k', 'las dos columnas']]) {
    const re = new RegExp(sel + '[^}]*color:\\s*rgba\\(255,255,255');
    prueba('el rótulo de ' + q + ' va en blanco', re.test(css));
  }
}

grupo('los botones saltan sobre el fondo oscuro');
{
  // Al nivel 400 de su familia: el 500 es el del relleno y se
  // confundiría con su propia tarjeta.
  for (const t of TONOS.filter(x => x !== 'calm')) {
    // \s+ y no un espacio: los selectores están alineados en columna
    // y llevan dos o tres espacios entre las clases.
    const re = new RegExp('body\\.m-shell\\s+\\.m-hero-' + t + '\\s+\\.m-hero-b\\s*\\{[^}]*background:\\s*#');
    prueba(t + ' tiene botón propio', re.test(css));
  }
}

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
