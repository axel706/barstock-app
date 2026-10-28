// La escala tipográfica del móvil.
//
// Había 29 tamaños distintos en la hoja. No era una escala, era
// improvisación acumulada: cada pantalla eligió el suyo sin saber de
// las demás, y el control de "Text size" sólo movía los encabezados
// porque eran lo único migrado.
//
// Esta prueba no juzga si 14px es el tamaño correcto. Comprueba que no
// vuelva a aparecer un px suelto, que es como se deshace una escala.

const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(
  path.join(__dirname, '..', 'styles', 'mobile-app.css'), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  FALLA ' + n + (extra ? '   → ' + extra : '')); }
}
function grupo(t) { console.log('\n' + t); }

// Los comentarios hablan de píxeles al explicar de dónde viene cada
// paso; se quitan antes de buscar.
const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '');

grupo('ningún tamaño suelto, salvo el logo');
// El logo es la única excepción y es deliberada: ver más abajo.
const sueltos = (limpio.match(/font-size:\s*[0-9.]+px/g) || []);
prueba('una sola declaración en px', sueltos.length === 1, sueltos.join(', '));

grupo('la escala existe y cuelga de una sola base');
for (const t of ['meta', 'small', 'eyebrow', 'body', 'strong', 'head', 'title',
                 'screen', 'figure']) {
  prueba('--m-' + t, new RegExp('--m-' + t + ':\\s*(var\\(--m-base\\)|calc)').test(limpio));
}
prueba('y los tres ajustes mueven la base',
  /--m-base:\s*14px/.test(limpio) &&
  /m-txt-sm\s*\{\s*--m-base:/.test(limpio) &&
  /m-txt-lg\s*\{\s*--m-base:/.test(limpio));

grupo('el logo queda fuera de la escala');
// El wordmark no puede encoger porque alguien suba el texto de la app:
// sus proporciones son del brandbook y son relativas a sí mismo.
prueba('el sufijo PRO en em', /\.m-logo em\s*\{[^}]*font-size:\s*\.37em/s.test(limpio));
prueba('el punto en em', /\.m-logo \.m-logo-dot[^{]*\{[^}]*width:\s*\.22em/s.test(limpio));

// Y el wordmark con un tamaño FIJO. Si entra en la escala, subir
// "Text size" agranda el logo entero —punto y sufijo incluidos, que
// cuelgan de él en em— y una preferencia de lectura acaba deformando
// la marca.
const logo = (limpio.match(/\.m-logo \{[^}]*\}/s) || [''])[0];
prueba('el wordmark no escala con el texto',
  /font-size:\s*23px/.test(logo), logo.replace(/\s+/g, ' ').slice(0, 80));

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
