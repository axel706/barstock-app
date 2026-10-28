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
// flex-end más 0.13em de margen inferior es la implementación
// canónica. `align-self:baseline` sobre una caja vacía deja el punto
// flotando un pelo según el navegador.
const dotApp = (app.match(/\.brand-logo-dot\{[^}]*\}/s) || [''])[0];
prueba('header de escritorio', /align-self:\s*flex-end/.test(dotApp));
prueba('login', /align-self:\s*flex-end/.test(dotAuth));
prueba('y el estilo en línea del header también',
  !/margin:0 \.043em 0 \.022em;align-self:baseline/.test(html));

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
