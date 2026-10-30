#!/usr/bin/env node
/*
 * ── La cortina al cambiar de locación ────────────────────────────────
 *
 * Cambiar de bar hace `location.reload()`, y al recargar la pantalla de
 * entrada se pinta desde el primer fotograma a propósito. Resultado: dos
 * segundos de login cada vez que cambias de locación, con la sesión
 * perfectamente viva.
 *
 * La cortina no tapa un estado roto: en el instante del cambio la app SÍ
 * sabe que hay sesión. Lo que faltaba era que ese dato sobreviviera al
 * reload.
 *
 * Lo que hay que proteger, que es justo lo que es fácil de romper:
 *
 *   1. El script que lee la marca va EN LÍNEA en el <head>. Si alguien
 *      lo mueve a un `src/*.js`, el login parpadea antes de que cargue
 *      y la cortina no sirve para nada.
 *   2. El TEMPORIZADOR DE SEGURIDAD. Una cortina atascada es peor que
 *      el parpadeo que vino a tapar. Se levanta sola pase lo que pase.
 *   3. `#locCurtain` exento de la regla que esconde todo mientras
 *      `auth-locked`. Sin esa excepción la cortina nunca se ve.
 *   4. Por encima del login en z-index. Un número por debajo y no
 *      tapa nada.
 *   5. La marca se pone en `setActiveLocationName`, el único punto por
 *      el que pasan los tres caminos (hoja del móvil, selector del
 *      escritorio, paso de locación del login).
 *   6. La cortina se levanta en los DOS lados de auth: haya sesión o
 *      no. Si solo se levantara al entrar, un usuario sin sesión se
 *      quedaría mirando la cortina hasta que salte el temporizador.
 *   7. Nace oculta. Sin `html.loc-switch` no existe.
 *
 *   node tools/test-cortina-locacion.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const html = leer('index.html');
const css = leer('styles/auth.css');
const auth = leer('src/auth.js');
const locs = leer('src/location-access.js');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const cabeza = html.slice(0, html.indexOf('</head>'));

grupo('la marca se pone en un solo sitio');
{
  // El cuerpo de setActiveLocationName, aislado.
  const m = /function setActiveLocationName\(name\)\{([\s\S]*?)\n  \}/.exec(locs);
  prueba('setActiveLocationName existe', !!m);
  const cuerpo = m ? m[1] : '';

  prueba('deja la marca para la cortina',
    /sessionStorage\.setItem\(\s*['"]barstock\.switchingTo['"]/.test(cuerpo));

  // localStorage sobreviviría al cierre de pestaña: una cortina
  // fantasma para siempre si algo falla a mitad.
  prueba('en sessionStorage, no en localStorage',
    !/localStorage\.setItem\(\s*['"]barstock\.switchingTo/.test(locs));

  prueba('la escritura va protegida',
    /try\s*\{[^}]*barstock\.switchingTo[^}]*\}\s*catch/.test(cuerpo));

  // Si alguien la pone en quien llama en vez de aquí, se cubre un
  // camino y se olvidan los otros dos.
  const fuera = (/sessionStorage\.setItem\(\s*['"]barstock\.switchingTo/g);
  const veces = (locs.match(fuera) || []).length;
  prueba('se pone una sola vez', veces === 1, veces + ' veces');
}

grupo('el arranque la lee antes de pintar');
{
  prueba('el script está en el <head>',
    /barstock\.switchingTo/.test(cabeza));

  // Esto es todo el punto: en línea, no un archivo que llega tarde.
  //
  // Se mira bloque por bloque y no con un regex de una sola pieza: en
  // el <head> hay otros <script src=...> (Supabase, por ejemplo) y
  // cualquier patrón que cruce de uno a otro da el resultado contrario
  // al que busca.
  {
    const bloques = cabeza.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || [];
    const elNuestro = bloques.filter(b => /barstock\.switchingTo/.test(b));
    prueba('hay exactamente un bloque que lee la marca',
      elNuestro.length === 1, elNuestro.length + ' bloques');
    prueba('va en línea, no en un src/*.js',
      elNuestro.length === 1 && !/<script[^>]*\bsrc\s*=/.test(elNuestro[0]));
  }

  // El <body> todavía no existe ahí arriba.
  prueba('la clase va en <html>, no en <body>',
    /documentElement\.classList\.add\(\s*['"]loc-switch['"]/.test(cabeza));

  prueba('sin marca no hace nada',
    /if\s*\(\s*!\s*n\s*\)\s*return/.test(cabeza));

  prueba('expone cómo levantarla',
    /window\.__bsLiftCurtain\s*=/.test(cabeza));

  prueba('al levantarla borra la marca',
    /__bsLiftCurtain[\s\S]{0,400}removeItem\(\s*['"]barstock\.switchingTo/.test(cabeza));
}

grupo('el tope de seguridad');
{
  const m = /var\s+TOPE\s*=\s*(\d+)/.exec(cabeza);
  prueba('existe', !!m);

  const ms = m ? Number(m[1]) : 0;
  prueba('no es eterno', ms > 0 && ms <= 10000, ms + 'ms');

  // Menos de 3 s y se levantaría encima de una red lenta, que es
  // exactamente cuando la cortina hace falta.
  prueba('da tiempo a una red lenta', ms >= 3000, ms + 'ms');

  // Vive en el mismo bloque en línea: así salta aunque auth.js no
  // llegue a cargarse nunca, que es el caso que de verdad importa.
  // Ojo: `[^)]*` no sirve aquí, se para en el `)` de `function()`.
  prueba('lo arma el propio script en línea',
    /setTimeout\([\s\S]{0,60}__bsLiftCurtain[\s\S]{0,40}TOPE\s*\)/.test(cabeza));
}

grupo('el mínimo en pantalla');
{
  // El fallo que vino a arreglar: con la sesión caliente auth contesta
  // en 200ms, la cortina se levantaba antes de que la píldora acabara
  // de entrar (500ms de animación) y lo que quedaba era un parpadeo.
  const m = /var\s+MINIMO\s*=\s*(\d+)/.exec(cabeza);
  prueba('existe', !!m);

  const min = m ? Number(m[1]) : 0;
  const tope = Number((/var\s+TOPE\s*=\s*(\d+)/.exec(cabeza) || [])[1] || 0);

  // La animación de entrada de la píldora dura .5s. Un mínimo por
  // debajo de eso la vuelve a cortar y no hemos arreglado nada.
  // Otra vez el punto sin cero delante: `.5s` es válido en CSS, y un
  // `\.?` suelto delante del grupo se lo come y deja "5" — o sea 5000ms
  // en vez de 500. Ya pasó en test-tab-activa.js.
  const entrada = Number((/animation:\s*lcPill\s+(\d*\.?\d+)s/.exec(css) || [])[1] || 0) * 1000;
  prueba('la píldora alcanza a entrar entera', min >= entrada && entrada > 0,
    min + 'ms vs ' + entrada + 'ms de animación');

  // Y además tiene que quedarse quieta un momento para poder leerla.
  prueba('queda tiempo para leerla', min - entrada >= 300,
    (min - entrada) + 'ms quieta');

  // Un suelo largo hace lento algo que es rápido, y eso tiene un
  // coste real: con los datos listos en 300ms, igual esperas el suelo
  // entero. El número de ahora (2.6s) está elegido a ojo sobre el
  // teléfono, no medido. Este tope no dice cuál es el bueno; dice
  // hasta dónde deja de ser un tránsito y pasa a ser una espera.
  prueba('sigue siendo un tránsito, no una espera', min <= 3500, min + 'ms');

  // Y que quede margen para que auth conteste dentro del suelo: si el
  // suelo rozara el techo, el tope no serviría de nada.
  prueba('el techo tiene margen sobre el suelo', tope - min >= 2000,
    (tope - min) + 'ms de margen');

  // El techo tiene que ganar siempre; si no, la cortina se puede
  // quedar pegada más de lo que promete el tope.
  prueba('el tope sigue mandando', tope > min, tope + ' > ' + min);

  // Si llega la respuesta antes de tiempo, se espera; no se levanta.
  prueba('si llega pronto, espera lo que falte',
    /falta\s*=\s*MINIMO\s*-\s*\(\s*Date\.now\(\)\s*-\s*t0\s*\)/.test(cabeza) &&
    /if\s*\(\s*falta\s*>\s*0\s*\)/.test(cabeza));

  // Dos llamadas no pueden dejar dos esperas corriendo.
  prueba('una sola espera pendiente',
    /if\s*\(\s*pendiente\s*===\s*null\s*\)/.test(cabeza));

  // La marca se borra al primer aviso, no al final de la espera: si
  // no, un reload a mitad la encontraría y la cortina volvería a salir.
  prueba('la marca se borra al primer aviso',
    /__bsLiftCurtain\s*=\s*function\(\)\{\s*(?:\/\/[^\n]*\n\s*)*try\s*\{[^}]*removeItem/.test(
      cabeza.replace(/\r/g, '')));
}

grupo('se ve por encima del login');
{
  prueba('está exenta de la regla que esconde todo',
    /body\.auth-locked\s*>\s*\*:not\(#authOverlay\):not\(#locCurtain\)/.test(css));

  const m = /#locCurtain\{([\s\S]*?)\}/.exec(css);
  prueba('la regla existe', !!m);
  const r = m ? m[1] : '';

  prueba('nace oculta', /display:\s*none/.test(r), r.trim().slice(0, 60));

  const zc = Number((/z-index:\s*(\d+)/.exec(r) || [])[1] || 0);
  const zl = Number((/#authOverlay\{[\s\S]*?z-index:\s*(\d+)/.exec(css) || [])[1] || 0);
  prueba('por encima del login', zc > zl && zl > 0, zc + ' vs ' + zl);

  prueba('solo la muestra html.loc-switch',
    /html\.loc-switch\s+#locCurtain\{[^}]*display:\s*flex/.test(css));

  // Translúcida dejaría ver la foto del login y el cambio parecería
  // otro parpadeo.
  prueba('el fondo es opaco',
    /background:[^;]*#0b1220/.test(r) && !/rgba\([^)]*,\s*0?\.\d+\s*\)/.test((/background:[^;]*/.exec(r) || [''])[0]));

  prueba('respeta prefers-reduced-motion',
    /prefers-reduced-motion[\s\S]{0,200}#locCurtain[\s\S]{0,120}animation:\s*none/.test(css));
}

grupo('la cortina está en el documento');
{
  prueba('el nodo existe', /id="locCurtain"/.test(html));
  prueba('tiene hueco para el nombre', /id="lcName"/.test(html));

  // Después del overlay: mismo sitio del documento, un z-index más.
  prueba('va después del overlay de login',
    html.indexOf('id="locCurtain"') > html.indexOf('id="authOverlay"'));

  // Si el nombre lo pusiera un módulo, se vería la píldora vacía y
  // luego llenarse.
  prueba('el nombre se rellena en línea',
    /id="lcName"[\s\S]{0,900}<script>[\s\S]{0,500}lcName[\s\S]{0,400}textContent/.test(html));

  prueba('no la lee nadie con lector de pantalla', /id="locCurtain"[^>]*aria-hidden="true"/.test(html));
}

grupo('auth la levanta sepa lo que sepa');
{
  prueba('hay una sola función que la levanta',
    /function levantarCortina\(\)/.test(auth));

  // Los dos lados. Si solo se levantara al entrar, quien no tiene
  // sesión se queda mirando la cortina hasta el temporizador.
  const sm = /function showOverlay\(\)\{([\s\S]*?)\n  \}/.exec(auth);
  const hd = /function hideOverlay\(\)\{([\s\S]*?)\n  \}/.exec(auth);
  prueba('se levanta cuando NO hay sesión',
    !!sm && /levantarCortina\(\)/.test(sm[1]));
  prueba('se levanta cuando SÍ hay sesión',
    !!hd && /levantarCortina\(\)/.test(hd[1]));

  prueba('no revienta si la cortina no existe',
    /try\s*\{[^}]*__bsLiftCurtain[^}]*\}\s*catch/.test(auth));
}

grupo('el caché');
{
  prueba('auth.css renovado', /styles\/auth\.css\?v=login6/.test(html),
    (/styles\/auth\.css\?v=\w+/.exec(html) || [])[0]);
  prueba('auth.js renovado', /src\/auth\.js\?v=gate2/.test(html),
    (/src\/auth\.js\?v=\w+/.exec(html) || [])[0]);
  prueba('location-access.js renovado',
    /src\/location-access\.js\?v=active-location-3/.test(html),
    (/src\/location-access\.js\?v=[\w-]+/.exec(html) || [])[0]);
}

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
