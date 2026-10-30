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
  const dueno = {
    bienvenida: /tono:\s*'verde'/,
    ciclo:      /tono:\s*'teal', k: 'Cycle open'/,
    marginedge: /tono:\s*e\.sueltas \? 'amber' : 'violet'/,
    ordenes:    /tono:\s*'blue',\s*\n?\s*k:\s*'Orders waiting'|tono:\s*'blue',$/m,
    pronto:     /tono:\s*'red'/
  };
  for (const [q, re] of Object.entries(dueno)) {
    prueba(q + ' tiene tono propio', re.test(jsLimpio));
  }

  // El fallo original, por si vuelve: el ciclo en teal Y MarginEdge en
  // teal a la vez.
  const facturas = /function tarjetaFacturas[\s\S]*?\n  \}/.exec(jsLimpio);
  prueba('MarginEdge ya no es teal',
    !!facturas && !/tono:[^,\n]*'teal'/.test(facturas[0]));

  // Y el paso "Load the count" en azul, que es la familia de órdenes.
  prueba('ningún paso del ciclo se va al azul',
    !/tono:\s*'blue', k: 'Cycle/.test(jsLimpio));
}

grupo('mientras sincroniza, el degradado se mueve');
{
  const m = /\.m-hero-sync-on\s*\{([^}]*)\}/.exec(css);
  prueba('la regla existe', !!m);
  const r = m ? m[1] : '';

  prueba('anima', !!r && /animation:\s*mSyncDeriva/.test(r), r.trim());
  prueba('mueve el fondo, no el color',
    /@keyframes mSyncDeriva\s*\{[^}]*background-position/.test(
      css.replace(/\s+/g, ' ').replace(/\} *\}/g, '}}')) ||
    /mSyncDeriva[\s\S]{0,200}background-position/.test(css));

  // Recorrido corto a propósito: con uno largo la esquina viva acaba
  // bajo los tres renglones y el texto gris pierde contraste.
  const z = Number((/background-size:\s*(\d+)%/.exec(r) || [])[1] || 0);
  prueba('el recorrido es corto', z > 100 && z <= 180, z + '%');

  // Una tarjeta que se queda animando para siempre dice que sigue
  // sincronizando cuando ya terminó.
  const js2 = jsLimpio;
  prueba('se quita en TODAS las salidas',
    /const parar = \(\) => \{[\s\S]{0,260}m-hero-sync-on/.test(js2));
  prueba('y se pone al arrancar', /classList\.add\('m-hero-sync-on'\)/.test(js2));

  // Mil milisegundos: el recorrido dura 2.6s, y con medio segundo se
  // veía un tirón a media pasada.
  const min = Number((/MINIMO_MS\s*=\s*(\d+)/.exec(js2) || [])[1] || 0);
  prueba('tiene un mínimo en pantalla', min >= 900, min + 'ms');
  prueba('pero no hace esperar de más', min <= 1600, min + 'ms');

  prueba('respeta prefers-reduced-motion',
    /prefers-reduced-motion[\s\S]{0,200}\.m-hero-sync-on[\s\S]{0,80}animation:\s*none/.test(css));
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
