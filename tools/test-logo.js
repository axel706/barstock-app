// El punto del logo.
//
// Es un CÍRCULO, no un punto tipográfico, y su azul es #38BDF8. El
// brandbook lo lista como la regla que más se incumple: «never a
// period, never vertically centred, never any other colour».
//
// Esto no comprueba píxeles, comprueba que ninguna de las cuatro
// implementaciones vuelva a escribir un punto a mano ni el azul malo.

const fs = require('fs');
const path = require('path');
const raiz = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  FALLA ' + n + (extra ? '   → ' + extra : '')); }
}
function grupo(t) { console.log('\n' + t); }

const shell  = raiz('src/mobile-shell.js');
const home   = raiz('src/mobile-home.js');
const mcss   = raiz('styles/mobile-app.css');
const auth   = raiz('styles/auth.css');
const app    = raiz('styles/app.css');
const html   = raiz('index.html');

grupo('nadie escribe el punto como carácter');
prueba('la banda del móvil', !/BarStock<i>\.<\/i>/.test(shell));
prueba('el rótulo de bienvenida', !/BarStock<i>\.<\/i>/.test(home));
prueba('y las dos usan la clase del círculo',
  /m-logo-dot/.test(shell) && /m-logo-dot/.test(home));

grupo('el azul es el bueno');
// El brandbook pregunta literalmente: «Is the dot exactly #38BDF8,
// and not #3B82F6?». El login estaba en el malo.
const dotAuth = (auth.match(/\.auth-brand-dot\{[^}]*\}/) || [''])[0];
prueba('login en #38bdf8', /#38bdf8/i.test(dotAuth), dotAuth.slice(0, 90));
prueba('login ya no en #3b82f6', !/#3b82f6/i.test(dotAuth));

grupo('las medidas son relativas al cuerpo');
prueba('login en em, no en px',
  /width:\s*\.22em/.test(dotAuth) && !/width:\s*\d+px/.test(dotAuth));
prueba('la banda del móvil en em', /width: \.22em/.test(mcss));

grupo('el punto se apoya en la línea base');
// Una caja vacía tiene su línea base en su propio borde inferior, así
// que `baseline` con margen inferior CERO la apoya exactamente donde
// se apoyan las letras, a cualquier cuerpo.
//
// El 0.13em que escribe el brandbook es un ajuste a ojo calibrado para
// un tamaño concreto: en la banda del móvil caía de más y en el rótulo
// de bienvenida flotaba. Si vuelve a aparecer, es que alguien lo copió
// otra vez sin probarlo en las dos.
const dotApp = (app.match(/\.brand-logo-dot\{[^}]*\}/s) || [''])[0];
const dotMov = (mcss.match(/\.m-logo \.m-logo-dot[^{]*\{[^}]*\}/s) || [''])[0];

prueba('header de escritorio', /align-self:\s*baseline/.test(dotApp));
prueba('login', /align-self:\s*baseline/.test(dotAuth));
prueba('banda del móvil', /align-self: baseline/.test(dotMov));

// Se mira la DECLARACIÓN, no el texto: los comentarios de esas mismas
// reglas explican de dónde salía el 0.13 y harían fallar la prueba por
// hablar del problema.
const margen = css => {
  const m = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/margin:\s*([^;]+);/);
  return m ? m[1].trim() : '';
};
prueba('el margen inferior del header es cero',
  /^0 \.043em 0 \.022em$/.test(margen(dotApp)), margen(dotApp));
prueba('y el del login', /^0 \.043em 0 \.022em$/.test(margen(dotAuth)), margen(dotAuth));
prueba('y el del móvil', /^0 \.043em 0 \.022em$/.test(margen(dotMov)), margen(dotMov));
prueba('ni en los estilos en línea',
  !/align-self:flex-end/.test(html.split('brand-logo-dot')[1] || ''));

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
