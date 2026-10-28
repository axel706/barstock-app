#!/usr/bin/env node
/*
 * ── De lado no se mueve nada ─────────────────────────────────────────
 *
 * Un deslizamiento en cualquier hueco movía la interfaz entera, BARRAS
 * FIJAS INCLUIDAS. Eso último es lo que señaló la causa: un elemento
 * fijo no se mueve con el scroll del documento, así que no era scroll
 * — era iOS paneando el viewport.
 *
 * Por eso `overflow-x` no sirvió de nada, ni en el body ni en el
 * raíz: los elementos fijos escapan a cualquier recorte. Lo que lo
 * para es `touch-action`, que le dice al navegador qué gestos existen
 * en esta app.
 *
 * Este test es corto a propósito: comprueba UNA cosa. Empaquetar esto
 * con otros tres cambios ya costó cinco commits revertidos.
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

const regla = (/body\.m-shell\.m-on\s*\{\s*touch-action:([^;}]*)[;}]/.exec(css) || [])[1] || '';
const carril = (/body\.m-shell\.m-on \.m-rail\s*\{\s*touch-action:([^;}]*)[;}]/.exec(css) || [])[1] || '';

console.log('\nel viewport no se panea');
prueba('la regla existe', !!regla.trim(), 'no se encontró');
prueba('sólo se desplaza en vertical', regla.trim() === 'pan-y', regla.trim());
// pan-y excluye pinch-zoom: una app no hace zoom, y lo pidió así.
prueba('y por tanto tampoco hay pellizco', !/pinch/.test(regla), regla.trim());
// Las secciones del escritorio tienen tablas anchas que sí se
// desplazan a lo ancho. Por eso la regla lleva `.m-on`.
prueba('sólo con una pantalla propia delante',
  !/body\.m-shell\s*\{[^}]*touch-action:\s*pan-y/.test(css));

console.log('\nel carril de tarjetas es la excepción');
prueba('ahí el gesto lateral sigue vivo', carril.trim() === 'pan-x', carril.trim());

console.log('\ny no se toca nada de lo que ya rompimos');
// La franja negra bajo la barra la causó el contenedor fijo. Está
// comprobado: con el suelo puesto y sin contenedor, no aparece.
prueba('el body no se fija',
  !/body\.m-shell\.m-on\s*\{[^}]*position:\s*fixed/.test(css));
prueba('el raíz no se toca', !/html:has\(body\.m-shell\.m-on\)/.test(css));
prueba('#mScreens sigue como estaba',
  !/body\.m-shell\.m-on\s*>\s*\.m-screens/.test(css));
prueba('la barra sigue pintando el borde de abajo',
  /\.m-tabs::before\s*\{[^}]*height:\s*calc\(16px \+ env\(safe-area-inset-bottom/.test(css));

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
