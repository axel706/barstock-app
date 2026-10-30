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
// Las hojas que el teléfono llega a ver. Las de las secciones de
// escritorio —cost-report, consumption-match, pour-iq, order-history,
// admin— quedan fuera porque en el móvil ni se abren.
const HOJAS = ['mobile-app', 'mobile', 'count-panel', 'scan-count',
               'add-to-order', 'stock-in', 'auth', 'empty-state', 'toast'];
const leer = n => fs.readFileSync(
  path.join(__dirname, '..', 'styles', n + '.css'), 'utf8');
const css = leer('mobile-app');

let ok = 0, mal = 0;
function prueba(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  FALLA ' + n + (extra ? '   → ' + extra : '')); }
}
function grupo(t) { console.log('\n' + t); }

// Los comentarios hablan de píxeles al explicar de dónde viene cada
// paso; se quitan antes de buscar.
const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '');

grupo('ningún tamaño suelto en lo que ve el teléfono');
// Las únicas excepciones son los dos wordmarks, y son deliberadas: si
// entran en la escala, subir "Text size" deforma la marca.
for (const h of HOJAS) {
  const txt = leer(h).replace(/\/\*[\s\S]*?\*\//g, '');
  const px = txt.match(/font-size:\s*[0-9.]+px/g) || [];
  // auth.css lleva DOS wordmarks con tamaño fijo, no uno: el de la
  // pantalla de entrada y el de la cortina del cambio de locación. Los
  // dos son la misma excepción deliberada — la marca no escala con el
  // ajuste de texto — y los dos están comentados en la hoja. Si este
  // número sube otra vez, mira que sea de verdad un wordmark y no un
  // px suelto colándose por la puerta de atrás.
  const esperado = h === 'auth' ? 2 : (h === 'mobile-app' ? 1 : 0);
  prueba(h + '.css', px.length === esperado, px.join(', '));
}

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
prueba('el wordmark de la banda no escala',
  /font-size:\s*23px/.test(logo), logo.replace(/\s+/g, ' ').slice(0, 80));

const auth = leer('auth').replace(/\/\*[\s\S]*?\*\//g, '');
const logoAuth = (auth.match(/\.auth-brand-type\{[^}]*\}/s) || [''])[0];
prueba('ni el del login', /font-size:\s*28px/.test(logoAuth),
  logoAuth.replace(/\s+/g, ' ').slice(0, 80));

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
