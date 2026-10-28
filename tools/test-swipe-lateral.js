#!/usr/bin/env node
/*
 * ── De lado no se mueve nada ─────────────────────────────────────────
 *
 * Un deslizamiento en cualquier hueco de la pantalla movía la interfaz
 * entera a la izquierda, como una página web. Es lo primero que
 * delata que algo no es una app.
 *
 * Este test es corto a propósito: comprueba UNA regla. El intento
 * anterior arregló esto a la vez que otras tres cosas, se llevó por
 * delante el fondo de la app y hubo que tirar cuatro commits.
 *
 *   node tools/test-swipe-lateral.js
 */

const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(
  path.join(__dirname, '..', 'styles', 'mobile-app.css'), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}

const regla = (/html:has\(body\.m-shell\.m-on\)\s*\{([^}]*)\}/.exec(css) || [])[1] || '';

const cuerpo = (/body\.m-shell\.m-on\s*\{\s*overflow-x:[^}]*\}/.exec(css) || [])[0] || '';

console.log('\nel documento no se desplaza a lo ancho');
prueba('la regla existe y cuelga del raíz', !!regla, 'no se encontró');
prueba('corta el eje X', /overflow-x:\s*clip/.test(regla), regla.trim());
prueba('con red para quien no conozca clip',
  regla.indexOf('overflow-x: hidden') < regla.indexOf('overflow-x: clip'),
  'el orden importa: hidden primero');

// En el raíz el recorte tiene que propagarse a la ventana y Safari no
// siempre cumple: acepta la regla —así que la red de `hidden` ya no
// entra— pero no recorta. En el body no hay propagación que valga.
prueba('y también en el body, que ahí no hay propagación que falle',
  /overflow-x:\s*clip/.test(cuerpo), cuerpo.trim() || 'no se encontró');
// `hidden` en el body lo haría contenedor desplazable y le quitaría el
// scroll vertical al documento.
prueba('en el body, clip a secas y nunca hidden',
  !!cuerpo && !/hidden/.test(cuerpo), cuerpo.trim());

console.log('\ny no toca nada más');
// `hidden` en el eje X convierte al elemento en contenedor
// desplazable y cambia quién manda en el vertical. `clip` no.
prueba('no fija el eje Y', !/overflow-y/.test(regla), regla.trim());
prueba('no fija el body', !/position:\s*fixed/.test(regla));
// Con una sección del escritorio delante hay tablas anchas que SÍ se
// desplazan a lo ancho. Por eso la regla lleva `.m-on`.
prueba('sólo con una pantalla propia delante',
  !/html:has\(body\.m-shell\)\s*\{[^}]*overflow-x/.test(css));

// Lo que pinta los últimos 34px sigue donde estaba. Quitarlo dejó una
// franja negra bajo la barra en todas las pantallas.
console.log('\ny lo de antes sigue en pie');
prueba('la barra sigue pintando el borde de abajo',
  /\.m-tabs::before\s*\{[^}]*height:\s*calc\(16px \+ env\(safe-area-inset-bottom/.test(css));

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
