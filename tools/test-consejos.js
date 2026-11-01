#!/usr/bin/env node
/*
 * ── Los consejos de la tarjeta de bienvenida ─────────────────────────
 *
 * La tarjeta decía siempre lo mismo y su texto se CORTABA a media
 * palabra en el borde derecho —"Look up st…"— porque llevaba dos
 * márgenes negativos encima del mismo párrafo: el del cuerpo (-30px) y
 * uno suyo (-40px). El cuerpo recorta lo que sobra, así que esos 40px
 * se perdían.
 *
 * Ahora rota entre funciones que nadie descubre solo, y cada mensaje
 * tiene que caber en los tres renglones que la plantilla reserva a
 * TODAS las tarjetas.
 *
 * Lo que se protege:
 *
 *   1. El párrafo no se sale de su caja. Es lo que lo cortaba.
 *   2. Ningún consejo es tan largo que se corte. El alto es fijo por
 *      diseño, así que el que tiene que caber es el texto.
 *   3. Rotar NO repinta el carrusel. Repintarlo devolvería a la
 *      primera tarjeta a quien esté mirando otra.
 *   4. Un minuto entre mensajes. El texto cambia mientras alguien
 *      puede estar leyéndolo.
 *
 *   node tools/test-consejos.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const js = fs.readFileSync(path.join(RAIZ, 'src/mobile-home.js'), 'utf8');
const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const bloque = (/const CONSEJOS = \[([\s\S]*?)\n  \];/.exec(js) || ['', ''])[1];
const textos = [...bloque.matchAll(/sub:\s*((?:'[^']*'\s*\+?\s*)+)/g)]
  .map(m => m[1].replace(/'\s*\+\s*'/g, '').replace(/^'|'\s*$/g, '').trim());
const titulos = [...bloque.matchAll(/tt:\s*'([^']*)'/g)].map(m => m[1]);

grupo('el parrafo ya no se sale de su caja');
{
  // El cuerpo se sale -30px y RECORTA lo que sobre. Un segundo margen
  // negativo encima del párrafo lo empujaba fuera de ese recorte, y el
  // texto se cortaba a media palabra.
  const r = /\.m-hero-ancha \.m-hero-s \{([^}]*)\}/.exec(css);
  prueba('la regla existe', !!r);
  prueba('sin margen negativo propio', !!r && !/margin-right:\s*-/.test(r[1]),
    (r && r[1] || '').trim());

  const cuerpo = /\.m-hero-ancha \.m-hero-cuerpo \{([^}]*)\}/.exec(css);
  prueba('el del cuerpo se queda, que es el que manda',
    !!cuerpo && /margin-right:\s*-30px/.test(cuerpo[1]));
}

grupo('ningun consejo se pasa de los tres renglones');
{
  prueba('hay varios consejos', textos.length >= 4, String(textos.length));

  // ── De dónde sale el tope ────────────────────────────────────────
  //
  // No es un número elegido a ojo. El texto que se cortaba en la
  // captura medía 176 caracteres y necesitaba cuatro renglones; el
  // cuerpo reserva tres. 165 deja margen para que la última línea no
  // quede justa, y sigue permitiendo decir algo útil.
  //
  // Si algún día cambia el tamaño del texto o el ancho de la tarjeta,
  // este número se queda corto o largo — pero entonces falla aquí, que
  // es donde se mira, y no en el teléfono de alguien.
  const TOPE = 165;
  const largos = textos.filter(t => t.length > TOPE)
    .map(t => t.length + ': ' + t.slice(0, 40) + '…');
  prueba('todos caben', largos.length === 0, largos.join(' | '));

  // ── El titulo, en UNA linea ──────────────────────────────────────
  //
  // El cuerpo estaba clavado a tres renglones, pero el titulo no tenia
  // tope. "Something arrived without an order?" ocupaba dos lineas a
  // 22px, la tarjeta crecia, y como el carril estira todas a la mas
  // alta crecia el Home entero. Es el fallo que la plantilla vino a
  // resolver, por la unica parte que se habia quedado sin medir.
  //
  // El tope: a --m-head (22px) en la columna de texto de un telefono
  // de 390px caben unos 27 caracteres. 26 deja margen.
  const TOPE_T = 26;
  const titulosLargos = titulos.filter(t => t.length > TOPE_T)
    .map(t => t.length + ': ' + t);
  prueba('ningun titulo se parte en dos', titulosLargos.length === 0,
    titulosLargos.join(' | '));
}

grupo('rotar no repinta el carrusel');
{
  // Repintar el Home devuelve el carril a la primera tarjeta. A quien
  // esté mirando la del ciclo se la moverían de debajo del dedo cada
  // minuto.
  const r = /function rotar\(\)\s*\{([\s\S]*?)\n  \}/.exec(js);
  prueba('la funcion existe', !!r);
  const cuerpo = r ? r[1] : '';
  prueba('no llama a render', !/\brender\(/.test(cuerpo), cuerpo.slice(0, 80));
  prueba('ni a refresh', !/\brefresh\(/.test(cuerpo));
  prueba('escribe el texto directo', /\.textContent\s*=/.test(cuerpo));

  // Y sólo si la tarjeta está delante: rotar un texto que nadie ve es
  // gastar por gastar, y escribir sobre un elemento que ya no está en
  // el documento es el fallo que este proyecto ya tiene anotado.
  prueba('solo si la tarjeta esta en pantalla',
    /querySelector\([^)]*m-hero-tip/.test(cuerpo));
  prueba('y no con la pestaña detras', /document\.hidden/.test(cuerpo));
}

grupo('un minuto, no unos segundos');
{
  const m = /const CADA_MS = ([^;]+);/.exec(js);
  prueba('el intervalo esta', !!m, m && m[1]);
  // El texto cambia mientras alguien puede estar leyéndolo. Lo único
  // peor que un cartel que no se lee es uno que se va a media frase.
  const ms = m ? Function('return ' + m[1])() : 0;
  prueba('y es de al menos 30 s', ms >= 30000, String(ms));
}

grupo('la tarjeta se marca para poder encontrarla');
{
  prueba('lleva su clase', /m-hero-tip/.test(js));
  prueba('y el css la conoce', /\.m-hero-tip/.test(css));
  // El cambio con un parpadeo corto: sin él el texto salta de golpe y
  // parece un fallo de pintado.
  prueba('con transicion', /\.m-hero-tip \.m-hero-txt \{[^}]*transition/.test(css));
  prueba('y respeta a quien pidio menos movimiento',
    /prefers-reduced-motion[\s\S]{0,200}m-hero-tip[^}]*transition:\s*none/.test(css));
}

grupo('la tarjeta no puede crecer por el titulo');
{
  // Los puntos suspensivos son la red, no el plan: el tope de arriba
  // existe para que nunca se vean. Pero sin esta regla, un titulo
  // largo que se cuele agranda el Home entero en vez de recortarse.
  const r = /\n  \.m-hero-t \{([^}]*)\}/.exec(css);
  prueba('la regla existe', !!r);
  const t = r ? r[1] : '';
  prueba('una sola linea', /white-space:\s*nowrap/.test(t), t.replace(/\s+/g, ' ').trim());
  prueba('y lo que sobre se recorta', /text-overflow:\s*ellipsis/.test(t));
}

grupo('los consejos dicen la verdad de hoy');
{
  const todo = textos.join(' ');
  // Decia que colocar ordenes vivia en el escritorio. Era verdad
  // cuando se escribio y dejo de serlo el dia que el telefono aprendio
  // a colocarlas y a mandarlas por correo. Un consejo desactualizado
  // enseña a NO usar lo que si se puede.
  prueba('no dice que las ordenes sean solo de escritorio',
    !/placing them[\s\S]{0,40}desktop/i.test(todo) &&
    !/orders[\s\S]{0,30}live on desktop/i.test(todo), todo.slice(0, 120));

  // Y cada consejo dice DONDE esta la cosa. Uno que no lleva a ningun
  // sitio es una curiosidad.
  //
  // El primero no: es la bienvenida, y su trabajo es decir de que va
  // la app, no mandarte a una pantalla.
  const sinCamino = textos.slice(1).filter(t =>
    !/Orders ›|Search |Import ›|the bell/i.test(t));
  prueba('todos dicen donde', sinCamino.length === 0,
    sinCamino.map(t => t.slice(0, 40)).join(' | '));
}

grupo('la app recibe con una distinta cada vez');
{
  // Sin esto, cada arranque empezaba por la bienvenida —que se aprende
  // el primer dia— y las otras siete solo las veia quien dejara el
  // Home abierto varios minutos. O sea casi nadie.
  prueba('el indice se guarda', /CLAVE_CONSEJO/.test(js));
  prueba('en localStorage', /localStorage\.setItem\(CLAVE_CONSEJO/.test(js));

  // Se avanza AL CARGAR y no al salir: cerrar la app de golpe no
  // dispara ningun evento fiable en iOS, y una marca que depende de
  // despedirse bien se queda atascada.
  prueba('y se avanza al cargar, no al cerrar',
    !/beforeunload|pagehide/.test(js));

  // La primera vez de todas, la bienvenida: para eso esta la primera.
  const ini = /let _consejo = \(\(\) => \{([\s\S]*?)\}\)\(\);/.exec(js);
  prueba('arranca la logica de inicio', !!ini);
  prueba('sin marca previa empieza en cero',
    !!ini && /prev === null \? 0/.test(ini[1]), ini && ini[1].slice(0, 80));

  // Y el indice da la vuelta: el modulo lo usa con modulo en los dos
  // sitios, asi que un numero guardado grande no rompe nada.
  prueba('el indice da la vuelta',
    (js.match(/% CONSEJOS\.length/g) || []).length >= 2);

  // Comprobacion de verdad: se ejecuta el modulo dos veces con el
  // mismo almacen y tiene que salir un consejo distinto.
  let JSDOM = null;
  try { JSDOM = require('jsdom').JSDOM; } catch (e) {}
  if (!JSDOM) {
    prueba('(hace falta jsdom para esta parte)', false, 'npm install');
  } else {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
    const w = dom.window;
    const leido = [];
    // Un entorno minimo: solo interesa con que consejo arranca.
    for (let i = 0; i < 3; i++) {
      global.window = w; global.document = w.document;
      global.localStorage = w.localStorage;
      w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
      w.state = { master: [] };
      w.BarStockWeeklyCycle = { estado: () => 'loading' };
      w.getActiveVendors = () => []; w.getOrderRowsForVendor = () => [];
      w.computeOrderSubtotal = () => 0; w.isRowPlaced = () => false;
      w.BARSTOCK_CONFIG = {}; w.BarStockToast = { show() {} };
      delete w.BarStockMobileHome;
      new Function(js)();
      const host = w.document.createElement('div');
      host.className = 'm-screen on'; host.dataset.screen = 'home';
      w.document.body.appendChild(host);
      w.BarStockMobileHome.render(host);
      const t = host.querySelector('.m-hero-tip .m-hero-t');
      leido.push(t ? t.textContent : '');
      host.remove();
    }
    prueba('tres arranques, tres consejos distintos',
      new Set(leido).size === 3, leido.join(' | '));
    prueba('y el primero es la bienvenida',
      /Good to have you/.test(leido[0]), leido[0]);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
