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

grupo('el desenfoque de la banda no se come el logo ni los botones');
{
  const hoja = fs.readFileSync(path.join(__dirname, '..', 'styles', 'mobile-app.css'), 'utf8');
  const r = (sel) => {
    const m = new RegExp('^\\s*' + sel.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}', 'm').exec(hoja);
    return m ? m[1] : '';
  };
  const blur = r('.m-blur'), logo = r('.m-logo'), ico = r('.m-band-ico');

  // El z-index por sí solo NO arreglaba esto: en WebKit un elemento
  // con backdrop-filter se lleva por delante a vecinos que deberían
  // ir encima si no están en su propia capa compuesta. Hacen falta
  // las dos cosas, y por eso se prueban las dos.
  const z = (t) => Number((/z-index:\s*(-?\d+)/.exec(t) || [])[1]);
  prueba('las capas de desenfoque van en un escalón declarado',
    z(blur) === 0, 'z-index ' + z(blur));
  prueba('el logo va por encima', z(logo) > z(blur), 'z-index ' + z(logo));
  prueba('los botones también', z(ico) > z(blur), 'z-index ' + z(ico));

  prueba('el logo está en su propia capa', /transform:\s*translateZ\(0\)/.test(logo));
  prueba('y los botones también', /transform:\s*translateZ\(0\)/.test(ico));

  // Aislar .m-blur parece la solución elegante y rompe el efecto: lo
  // convertiría en su propio backdrop root y sus capas dejarían de
  // ver lo que hay detrás de la banda.
  prueba('sin aislar las capas, que las dejaría sin nada que desenfocar',
    !/isolation:\s*isolate/.test(blur));
}

grupo('"Stock" viaja de verde a azul, y no desaparece si no se puede');
{
  const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'mobile-shell.js'), 'utf8');
  const hoja = fs.readFileSync(path.join(__dirname, '..', 'styles', 'mobile-app.css'), 'utf8');

  prueba('la banda parte el wordmark en Bar + Stock',
    /Bar<b class="m-logo-st">Stock<\/b>/.test(shell));
  // Copiar el logo tiene que seguir dando "BarStock", no "Bar Stock".
  prueba('sin espacio entre las dos mitades',
    !/Bar\s+<b class="m-logo-st">/.test(shell));
  prueba('y el punto sigue detrás',
    /<\/b>\s*'?\s*\+?\s*'?<i class="m-logo-dot">/.test(shell.replace(/\n\s*/g, '')));

  // ── Lo importante de todo esto ─────────────────────────────────
  //
  // `background-clip: text` necesita `color: transparent`. Donde no
  // esté soportado, eso es un logo INVISIBLE. El color sólido tiene
  // que declararse fuera del @supports y antes.
  const fuera = /\.m-logo \.m-logo-st\s*\{([^}]*)\}/.exec(hoja);
  prueba('hay un color sólido de respaldo',
    !!fuera && /color:\s*#[0-9a-f]{3,6}/i.test(fuera[1]), (fuera && fuera[1] || '').trim());
  prueba('y no es transparente',
    !!fuera && !/color:\s*transparent/.test(fuera[1]));

  prueba('el degradado va dentro de un @supports',
    /@supports[^{]*background-clip:\s*text[^{]*\{[\s\S]{0,600}?\.m-logo \.m-logo-st/.test(hoja));
  prueba('con el prefijo -webkit, que es quien lo soporta en iOS',
    /-webkit-background-clip:\s*text/.test(hoja));
  prueba('acaba en el azul del punto',
    /linear-gradient\([^)]*#38bdf8[^)]*\)/.test(hoja) &&
    /\.m-logo \.m-logo-dot[\s\S]{0,200}background:\s*#38bdf8/.test(hoja));

  // text-shadow sobre texto transparente pinta la sombra POR DELANTE
  // del degradado. Pero quitarla a secas deja "Stock" sin contraste
  // sobre la foto de la banda mientras "Bar" sí la tiene.
  // Se busca el bloque POR SU CONTENIDO y no "el primero después de
  // un @supports": hay otros @supports antes en la hoja, y con una
  // búsqueda perezosa se capturaba la regla de respaldo en su lugar.
  const dentro = /\.m-logo \.m-logo-st\s*\{([^}]*-webkit-background-clip[^}]*)\}/.exec(hoja);
  prueba('se quita la sombra de texto',
    !!dentro && /text-shadow:\s*none/.test(dentro[1]));
  prueba('pero se repone como drop-shadow',
    !!dentro && /filter:\s*drop-shadow/.test(dentro[1]));

  // Esto NO puede salir de la banda: en los correos no hay
  // background-clip y el logo saldría en blanco.
  const correo = fs.existsSync(path.join(__dirname, '..', 'lib', 'email-shell.js'))
    ? fs.readFileSync(path.join(__dirname, '..', 'lib', 'email-shell.js'), 'utf8') : '';
  prueba('no se coló en los correos', !/background-clip/.test(correo));
}

grupo('ninguna pantalla se guarda un renglón para volver');
{
  // El chevron va A LA IZQUIERDA del título, en la misma fila, y lo
  // arma `BarStockMobile.cabecera`. Una pantalla que se escriba su
  // propio botón de volver recupera el patrón viejo — que gastaba un
  // renglón entero — y nadie se entera hasta verlo en el teléfono.
  //
  // La pantalla de facturas se quedó atrás justo por esto: usaba su
  // propia clase, `m-iback`, así que no salió en el barrido de
  // `m-back` cuando se cambió el resto.
  const dir = path.join(__dirname, '..', 'src');
  const malos = [];
  for (const f of fs.readdirSync(dir)) {
    if (!/^mobile-.*\.js$/.test(f) || f === 'mobile-shell.js') continue;
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    // Un chevron de volver con TEXTO al lado es el patrón viejo. El
    // chevron solo —la ficha de búsqueda— es legítimo.
    const re = /ti-chevron-left[^<]*<\/i>\s*[^<\s][^<]*/g;
    const hay = txt.match(re);
    if (hay) malos.push(f + ': ' + hay[0].slice(0, 46).replace(/\s+/g, ' '));
  }
  prueba('todas usan la cabecera del armazón', malos.length === 0, malos.join(' | '));

  // Y el armazón la expone, o las pantallas se caen al respaldo sin
  // botón de volver.
  const shell = fs.readFileSync(path.join(dir, 'mobile-shell.js'), 'utf8');
  prueba('el armazón la expone', /cabecera,\s*alVolver/.test(shell));
  prueba('con un id estable para engancharla', /id="mAtras"/.test(shell));

  // ── Si se puede salir con el gesto, tiene que haber botón ────────
  //
  // Una pantalla a la que se entra desde More no enciende ninguna
  // pestaña: sin flecha, la única salida es pulsar otra pestaña, que
  // es irse, no volver. La de facturas estuvo así desde que se
  // escribió, y el gesto del borde sí funcionaba — por eso no se
  // notó.
  //
  // El indicio de que una pantalla es de esas: su `atras` llama a
  // `BarStockMobile.volver()`. Si lo hace, su encabezado tiene que
  // preguntar por `nombreAnterior`.
  const sinBoton = [];
  for (const f of fs.readdirSync(dir)) {
    if (!/^mobile-.*\.js$/.test(f) || f === 'mobile-shell.js') continue;
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!/BarStockMobile\.volver\(\)|M\.volver\(\)|Mv\.volver\(\)/.test(txt)) continue;
    if (!/nombreAnterior/.test(txt)) sinBoton.push(f);
  }
  prueba('las que salen con el gesto tienen flecha', sinBoton.length === 0,
    sinBoton.join(', '));
}

grupo('los fondos no engordan');
{
  // Un fondo se descarga entero cada vez que la app arranca en un
  // teléfono sin caché. Las dos imágenes del patrón de marca llegaron
  // pesando 970 KB cada una; los que ya había van de 63 a 200.
  //
  // El tope es generoso a propósito: no se trata de perseguir bytes,
  // sino de que no entre un original de cámara sin tocar.
  const dir = path.join(__dirname, '..', 'assets', 'backgrounds');
  const gordos = [];
  for (const f of fs.readdirSync(dir)) {
    if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
    const kb = Math.round(fs.statSync(path.join(dir, f)).size / 1024);
    if (kb > 280) gordos.push(f + ' ' + kb + ' KB');
  }
  prueba('ninguno pasa de 280 KB', gordos.length === 0, gordos.join(', '));

  // Y que los del catálogo existan: una ruta mal escrita deja el fondo
  // en negro sin decir nada.
  //
  // Antes esto se sacaba con una expresión regular sobre el `const
  // BACKGROUNDS` del index. El día que la lista se mudó a
  // `src/backgrounds.js` —para dejar de estar escrita dos veces— la
  // expresión dejó de encontrar nada y esta prueba cantó "0 fondos".
  // Hizo su trabajo, pero leer el catálogo es más robusto que adivinar
  // su forma: ahora se ejecuta.
  const w = {};
  new Function('window',
    fs.readFileSync(path.join(__dirname, '..', 'src', 'backgrounds.js'), 'utf8'))(w);
  const rutas = w.BarStockBackgrounds.lista().map(b => b.src);
  const faltan = rutas.filter(r =>
    !fs.existsSync(path.join(__dirname, '..', r)));
  prueba('todos los del catálogo existen', faltan.length === 0, faltan.join(', '));
  prueba('y el catálogo no está vacío', rutas.length >= 5, rutas.length + ' fondos');
}

grupo('el caché se rompe cuando la hoja cambia');
{
  // Esto estuvo roto varios commits sin que nadie lo notara: los
  // `sed` que subian el numero apuntaban al valor anterior, uno fallo
  // y los siguientes no encontraron nada. La hoja cambiaba y la URL
  // no, asi que iOS servia la version cacheada.
  //
  // No se puede comprobar "es el numero correcto" sin repetir aqui el
  // numero. Lo que SI se puede: que el buster cambie cuando cambie la
  // hoja. Se guarda la huella de la hoja junto al buster.
  const crypto = require('crypto');
  const hoja = fs.readFileSync(path.join(__dirname, '..', 'styles', 'mobile-app.css'));
  const huella = crypto.createHash('sha1').update(hoja).digest('hex').slice(0, 12);
  const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const buster = (/mobile-app\.css\?v=([\w-]+)/.exec(idx) || [])[1] || '';

  const sello = path.join(__dirname, '.cache-buster.json');
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(sello, 'utf8')); } catch (e) {}

  const cambio = prev.huella && prev.huella !== huella;
  prueba('el buster existe', !!buster, buster);
  prueba('si la hoja cambio, el buster tambien',
    !cambio || prev.buster !== buster,
    'la hoja cambio pero sigue en ?v=' + buster + ' — iOS servira la version vieja');

  try { fs.writeFileSync(sello, JSON.stringify({ huella, buster }, null, 2) + '\n'); }
  catch (e) {}
}

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
