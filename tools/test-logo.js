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
// El rótulo de bienvenida salió del Home con el rediseño (2026-11-12):
// el Home ya no pinta el logo. Si vuelve a pintarlo, con la clase.
prueba('y usan la clase del círculo',
  /m-logo-dot/.test(shell) && (!/BarStock<i/.test(home) || /m-logo-dot/.test(home)));

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
  // El respaldo puede ser un color literal o la variable de marca —
  // pero la variable tiene que traer SU propio respaldo, porque un
  // `var()` sin segundo argumento en un navegador que no la conozca
  // deja la propiedad sin valor y volvemos al logo invisible.
  prueba('hay un color sólido de respaldo',
    !!fuera && (/color:\s*#[0-9a-f]{3,6}/i.test(fuera[1]) ||
                /color:\s*var\(--bs-stock-solid,\s*#[0-9a-f]{3,6}\)/i.test(fuera[1])),
    (fuera && fuera[1] || '').trim());
  prueba('y no es transparente',
    !!fuera && !/color:\s*transparent/.test(fuera[1]));

  prueba('el degradado va dentro de un @supports',
    /@supports[^{]*background-clip:\s*text[^{]*\{[\s\S]{0,600}?\.m-logo \.m-logo-st/.test(hoja));
  prueba('con el prefijo -webkit, que es quien lo soporta en iOS',
    /-webkit-background-clip:\s*text/.test(hoja));
  // ── El degradado vive en una variable ──────────────────────────
  //
  // Lo usan cuatro sitios: la banda del móvil, la cabecera del
  // escritorio, la pantalla de entrada y la bienvenida. Cuatro copias
  // de tres paradas de color acaban siendo cuatro degradados
  // distintos, y entonces el logo deja de ser uno.
  const tema = raiz("styles/theme.css");
  prueba('el degradado está en una sola variable',
    /--bs-stock-grad:\s*linear-gradient\(/.test(tema));
  prueba('acaba en el azul del punto',
    /--bs-stock-grad:[^;]*#38bdf8[^;]*;/.test(tema) &&
    /\.m-logo \.m-logo-dot[\s\S]{0,200}background:\s*#38bdf8/.test(hoja));
  prueba('y el móvil la usa en vez de su copia',
    /background:\s*var\(--bs-stock-grad\)/.test(hoja));

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

grupo('los otros tres logos llevan el mismo degradado');
{
  // La cabecera del escritorio, la pantalla de entrada y la
  // bienvenida. Antes iban en blanco mientras el móvil ya viajaba de
  // verde a azul: el mismo producto con dos marcas.
  const app = raiz("styles/app.css");
  const idx = raiz("index.html");
  const onb = raiz("src/onboarding.js");

  prueba('hay una regla compartida', /\.bs-stock\s*\{/.test(app));
  prueba('con su color sólido fuera del @supports',
    /\.bs-stock\{[^}]*color:var\(--bs-stock-solid/.test(app.replace(/\s+/g, '')));
  prueba('y el degradado dentro',
    /@supports[^{]*background-clip:text[^{]*\{[\s\S]{0,900}?\.bs-stock\{/
      .test(app.replace(/\s+/g, '')));

  prueba('la cabecera del escritorio parte el wordmark',
    /id="headerLogo">Bar<b class="bs-stock">Stock<\/b>/.test(idx), 'headerLogo');
  prueba('la pantalla de entrada también',
    /auth-brand-type">Bar<b class="bs-stock">Stock<\/b>/.test(idx), 'authCardBrand');
  prueba('y la bienvenida',
    /Bar<b class="bs-stock">Stock<\/b>/.test(onb), 'onboarding');
}

grupo('el logo dibujado vive en un solo sitio');
{
  // ── Por qué ────────────────────────────────────────────────────
  //
  // Estaba escrito a mano en tres archivos: el PDF de la orden, el del
  // reporte de consumo y la imagen del correo de costes. Al teñir uno
  // de degradado, los otros dos se quedaron en blanco — el mismo
  // producto con dos marcas según el papel que te llegue. Y el del
  // canvas además usaba un punto TIPOGRÁFICO en vez del círculo del
  // brandbook.
  const mod = raiz('src/brand-logo.js');
  prueba('el módulo existe', /BarStockBrandLogo/.test(mod));
  prueba('sabe dibujar en PDF', /function enPdf/.test(mod));
  prueba('y en canvas', /function enCanvas/.test(mod));
  // Canvas sí sabe hacer degradados de verdad: ahí no hace falta el
  // truco de letra a letra.
  prueba('en canvas usa un degradado de verdad',
    /createLinearGradient/.test(mod));
  prueba('y el punto es un círculo, no un punto tipográfico',
    /arc\(/.test(mod) && !/fillText\('\.'/.test(mod));

  const usuarios = ['src/email-order.js', 'src/consumption-report.js',
                    'src/email-cost-report.js'];
  for (const f of usuarios) {
    const t = raiz(f);
    prueba(f.replace('src/', '') + ' lo usa',
      /BarStockBrandLogo\.(enPdf|enCanvas)/.test(t));
    // Y ya no se lo dibuja por su cuenta.
    prueba(f.replace('src/', '') + ' ya no escribe el wordmark a mano',
      !/(text|fillText)\(\s*'BarStock'/.test(t),
      (/(text|fillText)\(\s*'BarStock'[^)]*\)/.exec(t) || [''])[0]);
  }

  // El orden de carga: el módulo antes que los tres.
  const idx = raiz('index.html');
  const iMod = idx.indexOf('src/brand-logo.js');
  prueba('se carga antes que quien lo usa',
    iMod > 0 &&
    iMod < idx.indexOf('src/consumption-report.js') &&
    iMod < idx.indexOf('src/email-order.js') &&
    iMod < idx.indexOf('src/email-cost-report.js'));
}

grupo('el PDF lleva el mismo degradado');
{
  // ── Por qué aquí se dibuja y no se maqueta ──────────────────────
  //
  // `background-clip: text` es CSS de navegador. El PDF lo genera
  // jsPDF dibujando, así que "Stock" se pinta letra a letra
  // interpolando el color. A 22pt y cinco caracteres el escalón no se
  // distingue de un degradado continuo.
  //
  // Lo que esta prueba vigila es que las paradas sean LAS MISMAS que
  // las de la app. Dos degradados parecidos en la pantalla y en el
  // papel es peor que uno solo mal elegido: nadie lo nota hasta que
  // alguien pone las dos cosas lado a lado.
  const pdf = raiz('src/brand-logo.js');
  const tema = raiz('styles/theme.css');

  prueba('el wordmark se parte en Bar + Stock', /text\('Bar', x, y\)/.test(pdf));
  prueba('y "Stock" se dibuja letra a letra',
    /for \(let i = 0; i < STOCK\.length/.test(pdf));

  const paradasPdf = (/const PARADAS = \[([^\]]*\]\s*)*\];/.exec(pdf) || [''])[0];
  const hex = (s) => (s.match(/0x([0-9a-f]{2})/gi) || [])
    .map(x => x.slice(2).toLowerCase());
  const delPdf = hex(paradasPdf).join('');

  const grad = (/--bs-stock-grad:[^;]*;/.exec(tema) || [''])[0];
  const delTema = (grad.match(/#([0-9a-f]{6})/gi) || [])
    .map(x => x.slice(1).toLowerCase()).join('');

  prueba('las paradas del PDF son las de la app', delPdf === delTema,
    'pdf ' + delPdf + ' · tema ' + delTema);

  // Y aterriza en el azul del punto, que es el sentido del degradado.
  prueba('acaba en el azul del punto', /38bdf8$/.test(delPdf), delPdf);

  // El color se toma en el centro de cada letra: con el borde, la
  // última no llega al azul y el punto queda descolgado.
  prueba('el color se toma en el centro de cada letra',
    /\(i \+ 0\.5\) \/ STOCK\.length/.test(pdf));
}

grupo('la cortina de locación también');
{
  const idx = raiz('index.html');
  prueba('parte el wordmark',
    /lc-logo">Bar<b class="bs-stock">Stock<\/b>/.test(idx));
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
