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
