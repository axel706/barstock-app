#!/usr/bin/env node
/*
 * ── La pestaña activa de la barra inferior ───────────────────────────
 *
 * Iba en blanco al 14% sobre vidrio oscuro. Eso no se lee azul ni
 * blanco: se lee GRIS, y gris en una interfaz quiere decir
 * "deshabilitado", justo lo contrario de "estás aquí".
 *
 * Lo que hay que proteger son las cuatro decisiones del rediseño,
 * porque las cuatro son fáciles de deshacer sin darse cuenta:
 *
 *   1. Que el relleno sea azul sólido y no vuelva al blanco translúcido.
 *   2. Que el azul vaya FIJO (#38bdf8) y no por `var(--accent)`. En
 *      tema claro esa variable es #0284c7, y la barra es oscura en los
 *      dos temas: azul oscuro sobre vidrio oscuro con el icono en tono
 *      oscuro encima no se ve.
 *   3. Que el icono activo vaya engrosado, y con `-webkit-text-stroke`.
 *      Son glifos de la fuente Tabler, no SVG: `stroke-width` no hace
 *      absolutamente nada aquí, y es el error obvio al tocar esto.
 *   4. Que el grosor no pase de .7px. Más cierra los huecos interiores
 *      del glifo (la puerta de la casa, el asa del carrito) y a 21px
 *      se empasta.
 *
 * Y una quinta que no es de color: el grosor vive en `.ti`, no en el
 * botón, para que una pestaña nueva lo herede sin tocar JS.
 *
 *   node tools/test-tab-activa.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const css = leer('styles/mobile-app.css');
const html = leer('index.html');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

// La regla del botón activo, aislada.
const mActiva = /body\.m-shell\s+\.m-tab\.on\s*\{([^}]*)\}/.exec(css);
// La regla del icono dentro del botón activo.
const mIcono = /body\.m-shell\s+\.m-tab\.on\s+\.ti\s*\{([^}]*)\}/.exec(css);

grupo('el relleno de la pestaña activa');
{
  prueba('la regla existe', !!mActiva);
  const r = mActiva ? mActiva[1] : '';

  prueba('es azul sólido', /background:\s*#38bdf8/i.test(r), r.trim());

  // El fallo original: blanco translúcido sobre vidrio oscuro = gris.
  prueba('no volvió al blanco translúcido',
    !/background:\s*rgba\(\s*255\s*,\s*255\s*,\s*255/i.test(r), r.trim());

  // --accent cambia con el tema; la barra no. No puede entrar aquí.
  prueba('el azul no depende del tema',
    !/background:[^;]*var\(\s*--accent/i.test(r), r.trim());

  prueba('el icono encima va en tono oscuro',
    /color:\s*#0[0-9a-f]{5}/i.test(r), r.trim());
}

grupo('el grosor del icono activo');
{
  prueba('la regla existe y cuelga de .ti', !!mIcono);
  const r = mIcono ? mIcono[1] : '';

  prueba('engrosa con -webkit-text-stroke',
    /-webkit-text-stroke:/.test(r), r.trim());

  // El error obvio: tratar un glifo de fuente como si fuera un SVG.
  prueba('no intenta stroke-width (son glifos, no SVG)',
    !/[^-]stroke-width:/.test(r), r.trim());

  // Ojo con el punto: `.7px` sin cero delante es válido en CSS, y un
  // `\.?` suelto delante del grupo se lo come y deja "7".
  const px = Number((/-webkit-text-stroke:\s*(\d*\.?\d+)px/.exec(r) || [])[1] || 0);
  prueba('tiene grosor de verdad', px > 0, px + 'px');
  prueba('no pasa de .7px', px <= 0.7, px + 'px');

  prueba('hereda el color del botón, no lo fija',
    /currentColor/i.test(r), r.trim());
}

grupo('las etiquetas de las secciones');
{
  const shell = leer('src/mobile-shell.js');

  // Un cubo es Inventory y un carrito es Orders si ya lo sabes. Si no,
  // lo averiguas entrando.
  prueba('la pestaña pinta su nombre', /class="m-tab-lab"/.test(shell));

  // También la activa. Quitársela rompe la retícula: al cambiar de
  // sección una palabra aparece y otra desaparece, y ese salto se ve.
  prueba('también la activa',
    !/m-tab\.on[^}]*\.m-tab-lab\s*\{[^}]*display:\s*none/.test(css),
    'alguien escondió la etiqueta de la pestaña activa');

  const lab = /\.m-tab-lab\s*\{([^}]*)\}/.exec(css);
  prueba('la regla existe', !!lab);
  prueba('sigue el ajuste de Text size',
    !!lab && /font-size:\s*var\(--m-meta\)/.test(lab[1]), (lab && lab[1] || '').trim());
  // A tamaño grande "Inventory" aprieta. Que se recorte, no que
  // desborde la pestaña y descuadre la barra.
  prueba('un nombre largo se recorta', !!lab && /text-overflow:\s*ellipsis/.test(lab[1]));

  const tab = /body\.m-shell \.m-tab\s*\{([^}]*)\}/.exec(css);
  prueba('la pestaña va en columna',
    !!tab && /flex-direction:\s*column/.test(tab[1]));
  const alto = Number((/height:\s*(\d+)px/.exec(tab ? tab[1] : '') || [])[1] || 0);
  prueba('creció para que quepa el nombre', alto >= 46, alto + 'px');
}

grupo('el escáner sigue apoyado en la barra');
{
  // Lo que importa no es el tamaño: es que sobresalga lo MISMO por
  // arriba y por abajo. El `bottom` fija los 4px de abajo, así que el
  // alto tiene que ser el de la barra más 8.
  const tab = /body\.m-shell \.m-tab\s*\{([^}]*)\}/.exec(css);
  const bar = /\.m-tabs-bar\s*\{([^}]*)\}/.exec(css);
  const fab = /body\.m-shell \.m-fab\s*\{([^}]*)\}/.exec(css);
  const hole = /\.m-tabs-hole\s*\{([^}]*)\}/.exec(css);

  const hTab  = Number((/height:\s*(\d+)px/.exec(tab  ? tab[1]  : '') || [])[1] || 0);
  const pad   = Number((/padding:\s*(\d+)px/.exec(bar  ? bar[1]  : '') || [])[1] || 0);
  const hFab  = Number((/height:\s*(\d+)px/.exec(fab  ? fab[1]  : '') || [])[1] || 0);
  const hHole = Number((/flex:\s*0 0 (\d+)px/.exec(hole ? hole[1] : '') || [])[1] || 0);
  const hBar  = hTab + pad * 2;

  prueba('el escáner sobresale 4px por lado', hFab === hBar + 8,
    'barra ' + hBar + 'px, escáner ' + hFab + 'px');
  prueba('el hueco le deja aire', hHole >= hFab + 8,
    'hueco ' + hHole + 'px para un botón de ' + hFab + 'px');
  prueba('se apoya 4px por debajo',
    !!fab && /bottom:\s*calc\(env\(safe-area-inset-bottom[^)]*\)\s*-\s*4px\)/.test(fab[1]));
}

grupo('lo que la barra tapa sigue siendo alcanzable');
{
  // Si la barra crece y esto no, la última fila de cualquier lista se
  // queda debajo y no hay forma de llegar a ella.
  // Hay TRES reglas `body.m-shell {` en la hoja. Se busca la que
  // reserva el hueco, no la primera que aparezca.
  const bloques = css.match(/body\.m-shell\s*\{[^}]*\}/g) || [];
  const elHueco = bloques.find(b => /padding-bottom:\s*calc\(/.test(b)) || '';
  const pb = Number((/padding-bottom:\s*calc\((\d+)px/.exec(elHueco) || [])[1] || 0);

  const tab = /body\.m-shell \.m-tab\s*\{([^}]*)\}/.exec(css);
  const bar = /\.m-tabs-bar\s*\{([^}]*)\}/.exec(css);
  const hBar = Number((/height:\s*(\d+)px/.exec(tab ? tab[1] : '') || [])[1] || 0) +
               Number((/padding:\s*(\d+)px/.exec(bar ? bar[1] : '') || [])[1] || 0) * 2;

  prueba('el contenido reserva sitio para la barra', pb >= hBar + 20,
    'reserva ' + pb + 'px para una barra de ' + hBar + 'px');

  const floor = Number((/\.m-floor\s*\{[^}]*height:\s*calc\((\d+)px/.exec(css) || [])[1] || 0);
  prueba('el desenfoque la cubre', floor >= hBar + 10,
    'suelo ' + floor + 'px para una barra de ' + hBar + 'px');
  // Pasarse lo convierte en una banda oscura cruzando la pantalla,
  // que es el fallo que ya costó cuatro commits.
  prueba('pero no sube media pantalla', floor <= hBar + 40, floor + 'px');
}

grupo('y no se rompió nada alrededor');
{
  // Las pestañas apagadas conservan su color tenue.
  prueba('las apagadas siguen en su gris azulado',
    /body\.m-shell\s+\.m-tab\s*\{[^}]*color:\s*#9bb0c6/i.test(css));

  // Esto ya volvió una vez: es lo único que pinta los últimos 34px.
  prueba('.m-tabs::before sigue en pie',
    /\.m-tabs::before\s*\{/.test(css));

  // Sin romper el caché el cambio no llega a ningún teléfono.
  prueba('mobile-app.css lleva cache buster nuevo',
    /styles\/mobile-app\.css\?v=mapp(6[89]|[7-9]\d|\d{3,})/.test(html),
    (/styles\/mobile-app\.css\?v=\w+/.exec(html) || [])[0]);
}

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
