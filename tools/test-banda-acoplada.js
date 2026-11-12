#!/usr/bin/env node
/*
 * ── La búsqueda que se acopla al header al hacer scroll ─────────────
 *
 * Axel, 2026-11-09, empezando por el Home (opción A sobre lámina): al
 * bajar, el saludo y la locación se desvanecen, la búsqueda se queda
 * pegada bajo el logo como parte del header, y el desenfoque empieza
 * justo debajo de ella. Al volver arriba del todo, todo regresa. Va a
 * repetirse en otras secciones, por eso vive en un módulo
 * (src/band-dock.js) y no dentro del Home.
 *
 * Lo que se protege:
 *   1. Se acopla cuando la búsqueda llega a su sitio bajo el header, y
 *      no antes: el cambio no se nota porque las dos están en el mismo
 *      punto.
 *   2. Se suelta al volver por encima de ese punto.
 *   3. La acoplada hace lo mismo que la de verdad (abre Buscar).
 *   4. El saludo se desvanece con el scroll y vuelve entero arriba.
 *   5. En otra pestaña no queda nada acoplado.
 *   6. Un repintado del Home (refresh) no deja la acoplada huérfana.
 *
 *   node tools/test-banda-acoplada.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

let SRC = '';
try { SRC = fs.readFileSync(path.join(RAIZ, 'src/band-dock.js'), 'utf8'); } catch (e) {}

// jsdom no maqueta: las posiciones se dan a mano. La banda mide 99 (52
// + la barra de estado) y la página se "desplaza" moviendo los tops.
const BANDA = 99;
function entorno() {
  const w = new JSDOM('<!doctype html><body class="m-shell">' +
    '<header id="mBand" class="m-band"></header>' +
    '<div id="mScreens"><div class="m-screen on" data-screen="home"></div></div></body>',
    { url: 'https://x.test/', runScripts: 'outside-only' }).window;
  w.requestAnimationFrame = (f) => { f(); return 1; };
  const band = w.document.getElementById('mBand');
  band.getBoundingClientRect = () => ({ top: 0, bottom: BANDA, height: BANDA, left: 0, width: 390 });
  if (SRC) w.eval(SRC);
  return w;
}
function pintarHome(w, clics) {
  const host = w.document.querySelector('[data-screen="home"]');
  host.innerHTML = '<div class="m-daterow" id="fila">Hello, Axel</div>' +
    '<button type="button" class="m-searchbar" id="mhSearch"><span>Do we have…</span></button>';
  const fila = host.querySelector('#fila'), bus = host.querySelector('#mhSearch');
  bus.onclick = () => { clics.n++; };
  // jsdom no maqueta. Se declara dónde está cada cosa EN REPOSO y la
  // posición en pantalla sale de lo bajado, como en un navegador: así
  // el módulo puede medir cuando quiera y le sale lo mismo.
  const y = () => w.scrollY || 0;
  bus.getBoundingClientRect = () => ({ top: 210 - y(), bottom: 258 - y(), height: 48, left: 30, width: 330 });
  fila.getBoundingClientRect = () => ({ top: 150 - y(), bottom: 200 - y(), height: 50, left: 30, width: 330 });
  return { host, fila, bus };
}
// La posición "natural": búsqueda a 210, saludo a 150. Bajar `y` las sube.
// Bajar `y`: sólo cambia el scroll. La búsqueda está a 210 y el saludo a
// 150 en reposo (pintarHome).
function mover(w, p, y) {
  w.scrollY = y;
  w.dispatchEvent(new w.Event('scroll'));
}
const acoplada = (w) => {
  const d = w.document.getElementById('mDock');
  return !!d && d.classList.contains('on');
};

const D0 = BANDA + 8;            // donde se acopla: 8 px bajo la banda

grupo('el módulo');
{
  const w = entorno();
  prueba('existe', !!w.BarStockBandDock && typeof w.BarStockBandDock.enganchar === 'function');
}

(async () => {
if (SRC) {
  grupo('se acopla al llegar, no antes');
  {
    const w = entorno(), clics = { n: 0 };
    const p = pintarHome(w, clics);
    w.BarStockBandDock.enganchar({ pantalla: p.host, barra: p.bus, desvanecer: [p.fila] });
    mover(w, p, 0);
    prueba('arriba: nada acoplado', !acoplada(w));
    mover(w, p, 210 - D0 - 1);
    prueba('un píxel antes: todavía no', !acoplada(w));
    mover(w, p, 210 - D0);
    prueba('al llegar a su sitio: acoplada', acoplada(w));
    const d = w.document.getElementById('mDock');
    const c = d && d.querySelector('.m-searchbar');
    prueba('en el mismo sitio que la de verdad', !!c && c.style.top === D0 + 'px' && c.style.left === '30px' && c.style.width === '330px',
      c && [c.style.top, c.style.left, c.style.width].join(' '));
    prueba('la de verdad se esconde, sin dejar hueco', p.bus.style.visibility === 'hidden');
    prueba('la copia no repite el id', !!c && !c.id);
    if (c) c.click();
    prueba('la acoplada abre Buscar, como la de verdad', clics.n === 1, String(clics.n));
    mover(w, p, 600);
    prueba('más abajo sigue acoplada', acoplada(w));

    grupo('se suelta al volver');
    mover(w, p, 210 - D0 - 1);
    prueba('por encima de su sitio: suelta', !acoplada(w));
    prueba('y la de verdad vuelve a verse', p.bus.style.visibility === '');
  }

  grupo('el saludo se desvanece con el scroll');
  {
    const w = entorno(), clics = { n: 0 };
    const p = pintarHome(w, clics);
    w.BarStockBandDock.enganchar({ pantalla: p.host, barra: p.bus, desvanecer: [p.fila] });
    mover(w, p, 0);
    prueba('arriba: entero', p.fila.style.opacity === '');
    mover(w, p, 150 - (BANDA + 4));
    const o = Number(p.fila.style.opacity);
    prueba('a medio camino: a medias', o > 0 && o < 1, p.fila.style.opacity);
    mover(w, p, 200 - BANDA);
    prueba('con su borde de abajo en el header: invisible', p.fila.style.opacity === '0', p.fila.style.opacity);
    mover(w, p, 0);
    prueba('de vuelta arriba: entero otra vez', p.fila.style.opacity === '');
  }

  grupo('arriba del todo, el saludo entero aunque esté pegado al header');
  {
    // Axel, 2026-11-09, en el iPhone: "ese contenido parece haber
    // quedado debajo de un velo". El desvanecido se medía por la
    // distancia al borde del header, y en su teléfono el saludo queda a
    // pocos px de él ya en reposo: salía a medias sin haber bajado nada.
    const w = entorno(), clics = { n: 0 };
    const p = pintarHome(w, clics);
    p.bus.getBoundingClientRect = () => ({ top: 170, bottom: 218, height: 48, left: 30, width: 330 });
    p.fila.getBoundingClientRect = () => ({ top: BANDA + 2, bottom: BANDA + 52, height: 50, left: 30, width: 330 });
    w.scrollY = 0;
    w.BarStockBandDock.enganchar({ pantalla: p.host, barra: p.bus, desvanecer: [p.fila] });
    prueba('sin haber bajado: opacidad entera', p.fila.style.opacity === '', p.fila.style.opacity);
  }

  grupo('en otra pestaña no queda nada acoplado');
  {
    const w = entorno(), clics = { n: 0 };
    const p = pintarHome(w, clics);
    w.BarStockBandDock.enganchar({ pantalla: p.host, barra: p.bus, desvanecer: [p.fila] });
    mover(w, p, 400);
    prueba('acoplada en el Home', acoplada(w));
    p.host.classList.remove('on');
    mover(w, p, 0);
    prueba('al cambiar de pestaña (scroll a 0): suelta', !acoplada(w));
    mover(w, p, 400);
    prueba('y con el Home escondido no se vuelve a acoplar', !acoplada(w));
  }

  grupo('un repintado del Home no deja una copia huérfana');
  {
    const w = entorno(), clics = { n: 0 };
    let p = pintarHome(w, clics);
    w.BarStockBandDock.enganchar({ pantalla: p.host, barra: p.bus, desvanecer: [p.fila] });
    mover(w, p, 400);
    p = pintarHome(w, clics);               // refresh(): innerHTML nuevo
    p.bus.getBoundingClientRect = () => ({ top: 210 - 400, bottom: 258 - 400, height: 48, left: 30, width: 330 });
    p.fila.getBoundingClientRect = () => ({ top: 150 - 400, bottom: 200 - 400, height: 50, left: 30, width: 330 });
    w.BarStockBandDock.enganchar({ pantalla: p.host, barra: p.bus, desvanecer: [p.fila] });
    prueba('sigue acoplada sin esperar al scroll', acoplada(w));
    prueba('y la nueva de verdad, escondida', p.bus.style.visibility === 'hidden');
    prueba('una sola copia', w.document.querySelectorAll('#mDock .m-searchbar').length === 1);
    w.document.querySelector('#mDock .m-searchbar').click();
    prueba('que abre con el botón nuevo', clics.n === 1);
  }

  grupo('Buscar: la barra fija y la lista con su propio scroll');
  await (async () => {
    // Axel, 2026-11-09: "lo mismo debe pasar al pulsar el do we have".
    // En Buscar la barra es un <input> de verdad: una copia no sirve (el
    // teclado escribiría en la escondida).
    //
    // Primero fue sticky en la página, y en el iPhone falló de dos
    // formas: con el teclado abierto la página entera se desplazaba y se
    // llevaba el header; y sin teclado el elástico de iOS arrastraba la
    // barra ("un rebote al subir o bajar todo"). Ahora la página no se
    // mueve: la lista tiene su propio scroll por debajo de la barra, y
    // la barra va fija fuera de él.
    const w = new JSDOM('<!doctype html><html><body class="m-shell"><header id="mBand" class="m-band"></header>' +
      '<div id="mScreens"><div class="m-screen on" data-screen="home"></div><div class="m-screen" data-screen="search">' +
      '<div class="m-searchbar on" id="sb"><input id="msInput"></div><div id="msScroll"><div id="msList"></div></div></div></div></body></html>',
      { url: 'https://x.test/', runScripts: 'outside-only' }).window;
    w.requestAnimationFrame = (f) => { f(); return 1; };
    w.visualViewport = Object.assign(new w.EventTarget(), { height: 500, offsetTop: 0 });
    w.document.getElementById('mBand').getBoundingClientRect = () => ({ top: 0, bottom: BANDA, height: BANDA });
    w.eval(SRC);
    const html = w.document.documentElement;
    const home = w.document.querySelector('[data-screen="home"]'), bus = w.document.querySelector('[data-screen="search"]');
    home.innerHTML = '<div class="m-daterow" id="fila">Hello</div><button type="button" class="m-searchbar" id="mhSearch">x</button>';
    const hb = home.querySelector('#mhSearch'), hf = home.querySelector('#fila');
    hb.getBoundingClientRect = () => ({ top: 210, bottom: 258, height: 48, left: 30, width: 330 });
    hf.getBoundingClientRect = () => ({ top: 150, bottom: 200, height: 50, left: 30, width: 330 });
    w.BarStockBandDock.enganchar({ pantalla: home, barra: hb, desvanecer: [hf] });

    // Se entra a Buscar.
    home.classList.remove('on'); bus.classList.add('on');
    const sb = w.document.getElementById('sb'), sc = w.document.getElementById('msScroll');
    sb.getBoundingClientRect = () => ({ top: D0, bottom: D0 + 50, height: 50, left: 13, width: 364 });
    w.BarStockBandDock.enganchar({ pantalla: bus, barra: sb, fija: true, scroll: sc });
    prueba('la barra va fija, fuera de lo que se desplaza', sb.classList.contains('m-dock-fija'));
    prueba('la lista lleva su propio scroll', sc.classList.contains('m-dock-scroll'));
    prueba('y la página de detrás no se mueve', html.classList.contains('m-scroll-propio') && w.document.body.classList.contains('m-scroll-propio'));
    prueba('la barra a su altura: 8 px bajo la banda', html.style.getPropertyValue('--m-dock-top') === D0 + 'px', html.style.getPropertyValue('--m-dock-top'));
    prueba('la lista sabe cuánto mide la barra', html.style.getPropertyValue('--m-dock-barra-h') === '50px', html.style.getPropertyValue('--m-dock-barra-h'));
    prueba('la lista acaba donde acaba lo visible (encima del teclado)', html.style.getPropertyValue('--m-vvh') === '500px', html.style.getPropertyValue('--m-vvh'));
    w.visualViewport.height = 320; w.visualViewport.dispatchEvent(new w.Event('resize'));
    prueba('al abrirse el teclado, la lista se acorta con lo visible', html.style.getPropertyValue('--m-vvh') === '320px', html.style.getPropertyValue('--m-vvh'));
    prueba('sin bajar: sin desenfoque (no tapa el primer resultado)', !acoplada(w));
    sc.scrollTop = 120; sc.dispatchEvent(new w.Event('scroll'));
    prueba('al bajar la lista: desenfoque debajo de la barra', acoplada(w));
    prueba('sin copia: la barra es la de verdad', !w.document.querySelector('#mDock .m-searchbar') && sb.style.visibility === '');
    prueba('con el alto hasta 10 px bajo la barra, donde empieza nítido', w.document.getElementById('mDock').style.height === (D0 + 50 + 10) + 'px',
      w.document.getElementById('mDock').style.height);
    sc.scrollTop = 0; sc.dispatchEvent(new w.Event('scroll'));
    prueba('arriba otra vez: sin desenfoque', !acoplada(w));

    // ── La página quieta, sin tocar el body ───────────────────────
    //
    // Primero se fijó el body (position: fixed + overflow: hidden). En
    // la app instalada, iOS volvía a medir la pantalla sin la franja de
    // abajo y la barra de pestañas subía ~60 px con negro debajo (Axel,
    // 2026-11-09, comparándolo con el Home). Ahora se frena el arrastre:
    // fuera de la lista no mueve nada, y dentro sólo mueve la lista.
    const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    prueba('el body no se fija (la barra de pestañas se subía)',
      !/m-scroll-propio[^{]*\{[^}]*position\s*:\s*fixed/.test(css) && !/m-scroll-propio[^{]*\{[^}]*overflow\s*:\s*hidden/.test(css));
    const arrastre = (el, desde, hasta) => {
      const ev0 = new w.Event('touchstart', { bubbles: true, cancelable: true });
      ev0.touches = [{ clientY: desde }]; el.dispatchEvent(ev0);
      const ev = new w.Event('touchmove', { bubbles: true, cancelable: true });
      ev.touches = [{ clientY: hasta }]; el.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    Object.defineProperty(sc, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(sc, 'clientHeight', { value: 500, configurable: true });
    const fila = w.document.getElementById('msList');
    prueba('arrastrar sobre la barra no mueve la página', arrastre(sb, 300, 200) === true);
    prueba('arrastrar la banda tampoco', arrastre(w.document.getElementById('mBand'), 50, 150) === true);
    // Dentro de la lista no se frena nada. Frenaba en los extremos, y en
    // iOS cancelar el primer movimiento bloquea el gesto entero: al final
    // de la lista no se podía volver (Axel, 2026-11-09). El rebote de la
    // lista lo contiene su overscroll-behavior.
    sc.scrollTop = 0;
    prueba('arriba de la lista, en los dos sentidos', arrastre(fila, 300, 400) === false && arrastre(fila, 400, 300) === false);
    sc.scrollTop = 1500;
    prueba('al final de la lista, se puede volver', arrastre(fila, 300, 400) === false);
    prueba('y empujar más tampoco se frena (lo contiene la CSS)', arrastre(fila, 400, 300) === false);
    prueba('la lista no pasa el rebote a la página', /\.m-dock-scroll\s*\{[^}]*overscroll-behavior\s*:\s*none/.test(css));
    // Y la pantalla conserva su alto mínimo. Se le quitó para que la
    // página no tuviera nada que desplazar, y con una página corta la
    // barra de pestañas sube y deja negro debajo (ya documentado en
    // .m-screen.on, y lo volvió a ver Axel).
    prueba('Buscar conserva su alto mínimo (si no, la barra de pestañas sube)',
      !/m-scroll-propio[^{]*\{[^}]*min-height\s*:\s*0/.test(css));
    // ── La trampa de iOS con una lista dentro de una página ───────
    //
    // Con la lista JUSTO en su tope, iOS le da el gesto a la página de
    // detrás, que se lo queda: la lista parecía bloqueada al final
    // (Axel, 2026-11-09, dos veces). Al poner el dedo, la lista se
    // separa 1 px del tope, y el gesto es siempre suyo.
    const tocar = (el) => { const e = new w.Event('touchstart', { bubbles: true, cancelable: true }); e.touches = [{ clientY: 300 }]; el.dispatchEvent(e); };
    sc.scrollTop = 1500; tocar(fila);
    prueba('al final: el dedo la encuentra 1 px antes del tope', sc.scrollTop === 1499, String(sc.scrollTop));
    sc.scrollTop = 0; tocar(fila);
    prueba('arriba: 1 px después del tope', sc.scrollTop === 1, String(sc.scrollTop));
    prueba('y ese píxel no saca el desenfoque', !acoplada(w));
    {
      // Buscar: el desenfoque entra con los primeros píxeles, no de golpe.
      const dk = w.document.getElementById('mDock');
      const oo = () => Number(dk.style.getPropertyValue('--m-dock-o'));
      sc.scrollTop = 12; sc.dispatchEvent(new w.Event('scroll')); const a1 = oo();
      sc.scrollTop = 60; sc.dispatchEvent(new w.Event('scroll')); const a2 = oo();
      prueba('en Buscar el desenfoque entra poco a poco', a1 > 0 && a1 < 1 && a2 === 1, a1 + ' | ' + a2);
      sc.scrollTop = 1; sc.dispatchEvent(new w.Event('scroll'));
    }
    sc.scrollTop = 700; tocar(fila);
    prueba('a media lista no se toca', sc.scrollTop === 700);
    // Una lista que cabe entera no tiene dónde separarse: ahí el
    // arrastre se frena, para que no se lo lleve la página.
    Object.defineProperty(sc, 'scrollHeight', { value: 500, configurable: true });
    sc.scrollTop = 0;
    prueba('una lista corta: el arrastre no mueve la página', arrastre(fila, 400, 300) === true);
    Object.defineProperty(sc, 'scrollHeight', { value: 2000, configurable: true });

    const hoja = w.document.createElement('div'); hoja.id = 'mSheet'; w.document.body.appendChild(hoja);
    prueba('la ficha (fuera de la pantalla) se sigue pudiendo arrastrar', arrastre(hoja, 400, 300) === false);
    hoja.remove();
    sc.scrollTop = 0;

    // Se sale a otra pantalla que NO engancha nada (Inventory): la
    // página tiene que volver a moverse sola, sin esperar a nadie. Si
    // se quedara bloqueada, Inventory no haría scroll.
    bus.classList.remove('on');
    const inv = w.document.createElement('div'); inv.className = 'm-screen on'; inv.dataset.screen = 'inventory';
    w.document.getElementById('mScreens').appendChild(inv);
    await new Promise(r => setTimeout(r, 0));
    prueba('al salir de Buscar, la página vuelve a moverse', !html.classList.contains('m-scroll-propio') && !w.document.body.classList.contains('m-scroll-propio'));
    prueba('y el arrastre vuelve a ser libre', arrastre(inv, 400, 300) === false);

    // De vuelta al Home, sin que el Home se repinte: su enganche sigue.
    inv.classList.remove('on'); home.classList.add('on');
    hb.getBoundingClientRect = () => ({ top: 210 - 400, bottom: 258 - 400, height: 48, left: 30, width: 330 });
    w.scrollY = 400; w.dispatchEvent(new w.Event('scroll'));
    prueba('volviendo al Home, el Home se sigue acoplando', acoplada(w) && !!w.document.querySelector('#mDock .m-searchbar'));
  })();

  grupo('Inventory: el título pasa al header y pestañas y filtro se quedan');
  await (async () => {
    // Axel, 2026-11-09: "al empezar a hacer scroll inventory se va y
    // reemplaza el logo en el header, todo el contenido arriba de la
    // línea roja se congela y el progressive blur empieza de ahí". Y que
    // la animación sea suave: por eso el fundido va ligado al scroll (no
    // se dispara de golpe) y el bloque se pega por CSS (sticky dentro de
    // la lista), no moviéndolo con JavaScript.
    const w = new JSDOM('<!doctype html><html><body class="m-shell"><header id="mBand" class="m-band"><span class="m-logo">BarStock</span></header>' +
      '<div id="mScreens"><div class="m-screen on" data-screen="inventory"><div id="miScroll">' +
      '<div class="m-inv-h" id="tit"><span class="m-inv-t">Inventory</span></div>' +
      '<div id="blo"><div class="m-seg"></div><div class="m-inv-bar2"><input id="miInput"></div></div>' +
      '<div id="miList"></div></div></div><div class="m-screen" data-screen="orders"></div></div></body></html>',
      { url: 'https://x.test/', runScripts: 'outside-only' }).window;
    w.requestAnimationFrame = (f) => { f(); return 1; };
    const band = w.document.getElementById('mBand');
    band.getBoundingClientRect = () => ({ top: 0, bottom: BANDA, height: BANDA });
    w.eval(SRC);
    const inv = w.document.querySelector('[data-screen="inventory"]'), ord = w.document.querySelector('[data-screen="orders"]');
    const sc = w.document.getElementById('miScroll'), blo = w.document.getElementById('blo'), tit = w.document.getElementById('tit');
    blo.getBoundingClientRect = () => ({ top: D0, bottom: D0 + 110, height: 110, left: 13, width: 364 });
    const eng = () => w.BarStockBandDock.enganchar({ pantalla: inv, scroll: sc, pegado: blo, titulo: tit, nombre: 'Inventory' });
    eng();
    // En reposo el bloque está 60 px por debajo de donde se pega. Lo
    // dice la marca de antes del bloque, no el bloque: su offsetTop,
    // una vez pegado, crece con el scroll.
    const marca = blo.previousElementSibling;
    prueba('hay una marca fija justo antes del bloque', !!marca && marca.classList.contains('m-dock-marca'));
    Object.defineProperty(marca, 'offsetTop', { value: D0 + 60, configurable: true });
    Object.defineProperty(blo, 'offsetTop', { get: () => D0 + 60 + sc.scrollTop, configurable: true });
    w.BarStockBandDock.medir();
    const q = () => band.style.getPropertyValue('--m-dock-q');
    const velo = blo.querySelector('.m-dock-velo');
    const bt = band.querySelector('.m-band-titulo');
    prueba('la lista lleva su propio scroll', sc.classList.contains('m-dock-scroll') && sc.classList.contains('m-dock-con-titulo'));
    prueba('pestañas y filtro van pegados (sticky), sin copia', blo.classList.contains('m-dock-pegado') && !w.document.querySelector('#mDock .m-searchbar'));
    prueba('con su desenfoque dentro, detrás de ellos', !!velo && blo.firstElementChild === velo);
    prueba('que es la escalera de seis capas', !!velo && velo.classList.contains('m-dock-esc') && velo.querySelectorAll(':scope > i').length === 6);
    prueba('el header tiene el título de la pantalla', !!bt && bt.textContent === 'Inventory' && band.classList.contains('m-con-titulo'));
    prueba('en reposo: el logo, el título grande entero y sin desenfoque', q() === '0' && tit.style.opacity === '' && velo.style.getPropertyValue('--m-dock-o') === '0',
      [q(), tit.style.opacity, velo.style.getPropertyValue('--m-dock-o')].join(' | '));
    sc.scrollTop = 30; sc.dispatchEvent(new w.Event('scroll'));
    const medio = Number(q());
    prueba('a medio camino: el fundido va por la mitad, ligado al scroll', medio > 0 && medio < 1 && Number(tit.style.opacity) > 0 && Number(tit.style.opacity) < 1,
      [q(), tit.style.opacity].join(' | '));
    sc.scrollTop = 60; sc.dispatchEvent(new w.Event('scroll'));
    prueba('acoplado: el título en el header, el grande fuera, desenfoque entero', q() === '1' && tit.style.opacity === '0' && velo.style.getPropertyValue('--m-dock-o') === '1',
      [q(), tit.style.opacity, velo.style.getPropertyValue('--m-dock-o')].join(' | '));
    sc.scrollTop = 900; sc.dispatchEvent(new w.Event('scroll'));
    prueba('más abajo sigue igual', q() === '1' && velo.style.getPropertyValue('--m-dock-o') === '1');
    sc.scrollTop = 30; sc.dispatchEvent(new w.Event('scroll'));
    prueba('y al volver retrocede por el mismo camino', Number(q()) === medio);
    eng();                                   // refrescar: show() en la misma pantalla
    prueba('un repintado no duplica el desenfoque ni el título', blo.querySelectorAll('.m-dock-velo').length === 1 && band.querySelectorAll('.m-band-titulo').length === 1 && sc.querySelectorAll('.m-dock-marca').length === 1);
    prueba('ni mueve la lista de donde estaba', sc.scrollTop === 30);

    // ── Una segunda pieza pegada debajo (Orders → Sent) ───────────
    //
    // Axel, 2026-11-09, sobre Sent: "la barra de búsqueda y el botón de
    // filtro también se deben congelar con el header como en inventory".
    // Esa fila la pinta la sección dentro de su contenido, no la
    // cabecera: se le dice al módulo con `tambien`, una función, porque
    // la sección se pinta después y por su cuenta.
    {
      const fila = w.document.createElement('div'); fila.className = 'm-inv-bar2';
      w.document.getElementById('miList').appendChild(fila);
      fila.getBoundingClientRect = () => ({ top: 0, bottom: 48, height: 48 });
      blo.lastElementChild.style.marginBottom = '13px';
      let hay = true;
      w.BarStockBandDock.enganchar({ pantalla: inv, scroll: sc, pegado: blo, titulo: tit, nombre: 'Inventory', tambien: () => (hay ? fila : null) });
      Object.defineProperty(blo.previousElementSibling, 'offsetTop', { value: D0 + 60, configurable: true });
      w.BarStockBandDock.medir();
      sc.scrollTop = 900; sc.dispatchEvent(new w.Event('scroll'));
      prueba('la segunda pieza también va pegada', fila.classList.contains('m-dock-pegado'));
      prueba('justo debajo de la primera, con su separación', fila.style.top === (D0 + 110 + 13) + 'px', fila.style.top);
      prueba('y el desenfoque se alarga hasta debajo de ella', blo.style.getPropertyValue('--m-dock-mas') === (13 + 48) + 'px', blo.style.getPropertyValue('--m-dock-mas'));
      hay = false; w.BarStockBandDock.medir();   // en la app: la sección se repinta
      prueba('si la sección deja de tenerla, el desenfoque vuelve a su largo', blo.style.getPropertyValue('--m-dock-mas') === '0px', blo.style.getPropertyValue('--m-dock-mas'));
      fila.remove();
    }

    // Orders, dentro de un detalle: la misma pantalla y la misma lista,
    // pero sin pestañas ni título. Se engancha sin nombre, y entonces el
    // header conserva el logo y no hay desenfoque que poner.
    sc.scrollTop = 900;
    w.BarStockBandDock.enganchar({ pantalla: inv, scroll: sc, pegado: blo, titulo: tit, nombre: '' });
    prueba('sin nombre: el header se queda con el logo', !band.classList.contains('m-con-titulo') && q() === '');
    prueba('y sin desenfoque', blo.querySelector('.m-dock-velo').style.getPropertyValue('--m-dock-o') === '0');
    prueba('y la lista sigue con su scroll propio', sc.classList.contains('m-dock-scroll') && w.document.documentElement.classList.contains('m-scroll-propio'));
    eng();
    Object.defineProperty(blo.previousElementSibling, 'offsetTop', { value: D0 + 60, configurable: true });
    w.BarStockBandDock.medir();

    // A otra pestaña: vuelve el logo.
    sc.scrollTop = 900; sc.dispatchEvent(new w.Event('scroll'));
    inv.classList.remove('on'); ord.classList.add('on');
    await new Promise(r => setTimeout(r, 0));
    prueba('en otra pestaña, el header vuelve al logo', !band.classList.contains('m-con-titulo') && q() === '');
    // Y al volver a Inventory se entra arriba, como siempre.
    ord.classList.remove('on'); inv.classList.add('on');
    await new Promise(r => setTimeout(r, 0));
    prueba('al volver a la pestaña, la lista empieza arriba', sc.scrollTop === 0 && q() === '0', sc.scrollTop + ' | ' + q());
  })();

  grupo('Inventory desde 2026-11-12: el header acoplado desde que entras');
  await (async () => {
    // Axel, 2026-11-12, con dos capturas: Inventory tiene que entrar ya
    // como acaba al bajar —"Inventory" en el header en el sitio del logo,
    // pestañas y filtro fijos— y no esperar a que haya scroll. Sin título
    // grande en la página. Lo pide la pantalla con `siempre`.
    const w = new JSDOM('<!doctype html><html><body class="m-shell"><header id="mBand" class="m-band"><span class="m-logo">BarStock</span></header>' +
      '<div id="mScreens"><div class="m-screen on" data-screen="inventory"><div id="miScroll">' +
      '<div id="blo"><div class="m-seg"></div><div class="m-inv-bar2"><input id="miInput"></div></div>' +
      '<div id="miList"></div></div></div></div></body></html>',
      { url: 'https://x.test/', runScripts: 'outside-only' }).window;
    w.requestAnimationFrame = (f) => { f(); return 1; };
    const band = w.document.getElementById('mBand');
    band.getBoundingClientRect = () => ({ top: 0, bottom: BANDA, height: BANDA });
    w.eval(SRC);
    const inv = w.document.querySelector('[data-screen="inventory"]');
    const sc = w.document.getElementById('miScroll'), blo = w.document.getElementById('blo');
    blo.getBoundingClientRect = () => ({ top: D0, bottom: D0 + 110, height: 110, left: 13, width: 364 });
    w.BarStockBandDock.enganchar({ pantalla: inv, scroll: sc, pegado: blo, nombre: 'Inventory', siempre: true });
    w.BarStockBandDock.medir();
    const q = () => band.style.getPropertyValue('--m-dock-q');
    const bt = band.querySelector('.m-band-titulo');
    prueba('sin bajar nada, "Inventory" ya está en el header', !!bt && bt.textContent === 'Inventory' && q() === '1', q());
    prueba('y pestañas y filtro van pegados', blo.classList.contains('m-dock-pegado'));
    sc.scrollTop = 200; sc.dispatchEvent(new w.Event('scroll'));
    prueba('al bajar sigue igual', q() === '1');
    sc.scrollTop = 0; sc.dispatchEvent(new w.Event('scroll'));
    prueba('y al volver arriba no regresa el logo', q() === '1', q());

    // "No debe pasar, el header debe estar fijo" (Axel, 2026-11-12): el
    // hueco de arriba medía banda + 14 y el sticky se pega a banda + 8,
    // así que en reposo las pestañas iban 6 px más abajo y subían al
    // primer scroll. Acoplada desde el principio, el hueco es justo el
    // punto donde se pega: no hay recorrido que hacer.
    prueba('la lista sabe que entra acoplada', sc.classList.contains('m-dock-siempre'));
    const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const r = /\.m-dock-scroll\.m-dock-con-titulo\.m-dock-siempre::before\s*\{([^}]*)\}/.exec(css);
    prueba('y su hueco de arriba es el punto donde se pega el bloque',
      !!r && /height\s*:\s*var\(--m-dock-top/.test(r[1]), r && r[1].trim());
    // Dentro de un detalle de Orders se engancha la MISMA lista sin
    // `siempre`: el hueco vuelve a ser el de siempre.
    w.BarStockBandDock.enganchar({ pantalla: inv, scroll: sc, pegado: blo, nombre: '' });
    prueba('sin `siempre`, la lista vuelve al hueco normal', !sc.classList.contains('m-dock-siempre'));

    // Un detalle de Sent / Invoices (2026-11-12): la sección pega su
    // bloque con fijar(), sin nombre. El nombre lo pone el armazón en la
    // banda (enBanda); band-dock no tiene que poner otro encima, pero sí
    // pegar el bloque con su desenfoque desde el principio.
    const det = w.document.createElement('div');
    det.className = 'm-det-fijo';
    w.document.getElementById('miList').appendChild(det);
    w.BarStockBandDock.fijar(det);
    w.BarStockBandDock.medir();
    prueba('fijar(): el bloque del detalle se pega', det.classList.contains('m-dock-pegado') && sc.classList.contains('m-dock-siempre'));
    prueba('con su desenfoque puesto desde que entras', (det.querySelector('.m-dock-velo') || { style: { getPropertyValue: () => '' } }).style.getPropertyValue('--m-dock-o') === '1');
    prueba('y sin título de band-dock en el header', !band.classList.contains('m-con-titulo'));
    sc.scrollTop = 0; sc.dispatchEvent(new w.Event('scroll'));
  })();

  grupo('lo que vio Axel en el iPhone (2026-11-09)');
  {
    // Sin las reglas comentadas: la que manda es la última y la de verdad.
    const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // "¿Por qué se oscurece?": la capa llevaba un tinte oscuro, y en la
    // zona del logo se sumaba al degradado de la banda. Sólo desenfoca.
    const m = /\.m-dock-blur\s*\{([^}]*)\}/.exec(css);
    prueba('el desenfoque acoplado no lleva tinte', !!m && !/background/.test(m[1]), m && m[1].replace(/\s+/g, ' '));
    // "Tiene un rebote, debería estar fija": el elástico de iOS al
    // llegar arriba. overscroll-behavior en el body no cuenta para el
    // scroll de la página; tiene que ir en el <html>.
    // "Necesitan ser un poco más grandes y legibles" (2026-11-12): los
    // iconos de la banda (Time Machine, campana, chevron) iban a 14 px
    // dentro de un círculo de 40; el chevron medía 4 × 8. Eligió 22 px,
    // de la escala, y el chevron movido a la izquierda (corrección
    // óptica: la punta del "<" a un lado y los brazos al otro lo hacían
    // parecer corrido a la derecha estando centrado).
    const ico = (/#mBand \.m-ico:not\(\.m-ico-alert\) > \.ti\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
    prueba('los iconos de la banda, a 22 px de la escala', /font-size\s*:\s*calc\(var\(--m-base\) \* 1\.57\)/.test(ico), ico.trim());
    const chev = (/#mBand \.m-ico > \.ti-chevron-left\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
    prueba('y el chevron, un poco a la izquierda', /display\s*:\s*inline-block/.test(chev) && /transform\s*:\s*translateX\(-\.04em\)/.test(chev), chev.trim());
    prueba('sin rebote: overscroll-behavior en el html', /(^|[\s,}])html\s*\{[^}]*overscroll-behavior(-y)?\s*:\s*none/.test(css));
  }

  grupo('el desenfoque es PROGRESIVO, no uno solo que se transparenta');
  {
    // Axel, 2026-11-09: "pedí progressive blur tanto en home, como en do
    // we have y ahora en inventory y veo que estás poniendo blur en su
    // lugar". Era un solo desenfoque de 22 px recortado con una máscara
    // que lo hacía transparente hacia abajo: eso mezcla lo nítido con lo
    // muy borroso, no desenfoca poco a poco. Progresivo es la escalera
    // de la banda: seis capas, cada una con más radio que la anterior y
    // recortada a su franja.
    const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const radios = [];
    for (let n = 1; n <= 6; n++) {
      const m = new RegExp('\\.m-dock-esc\\s*>\\s*i:nth-child\\(' + n + '\\)\\s*\\{([^}]*)\\}').exec(css);
      const r = m && /backdrop-filter\s*:\s*blur\((\d+)px\)/.exec(m[1]);
      radios.push(r ? Number(r[1]) : null);
      if (n === 1) prueba('cada capa va recortada a su franja', !!m && /mask-image/.test(m[1]));
    }
    prueba('seis capas con radio creciente', radios.every((r, i) => r !== null && (i === 0 || r > radios[i - 1])), JSON.stringify(radios));
    prueba('de casi nada a mucho', radios[0] <= 2 && radios[5] >= 20, JSON.stringify(radios));
    const cont = /\.m-dock-blur\s*\{([^}]*)\}/.exec(css), velo = /\.m-dock-velo\s*\{([^}]*)\}/.exec(css);
    prueba('el contenedor del Home y Buscar ya no desenfoca de un golpe', !!cont && !/backdrop-filter/.test(cont[1]));
    prueba('ni el de Inventory', !!velo && !/backdrop-filter/.test(velo[1]));
    // Y la escalera está puesta en las dos capas que la llevan.
    const w = entorno(), clics = { n: 0 };
    const p = pintarHome(w, clics);
    w.BarStockBandDock.enganchar({ pantalla: p.host, barra: p.bus, desvanecer: [p.fila] });
    mover(w, p, 400);
    const d = w.document.querySelector('#mDock .m-dock-blur');
    prueba('Home y Buscar: seis capas en el desenfoque acoplado', !!d && d.classList.contains('m-dock-esc') && d.querySelectorAll(':scope > i').length === 6);
    const src = fs.readFileSync(path.join(RAIZ, 'src/band-dock.js'), 'utf8');
    prueba('Inventory: la misma escalera, no otra copia', (src.match(/ESCALERA/g) || []).length >= 3);
  }

  grupo('fluidez: durante el scroll no se mide ni se reescribe de más');
  await (async () => {
    // Axel, 2026-11-10: "pule todas las animaciones de los headers, haz
    // todo más fluido". Lo que restaba fluidez no eran los fundidos: en
    // CADA fotograma de scroll el módulo medía la banda, el bloque y los
    // márgenes (cada medida obliga al navegador a recalcular el diseño a
    // mitad del scroll, con 264 renglones) y reescribía las variables
    // del documento entero aunque no cambiaran.
    //
    // Ahora se mide al pintar, al cambiar de tamaño y al poner el dedo;
    // durante el scroll sólo se lee lo bajado.
    const w = entorno(), clics = { n: 0 };
    const p = pintarHome(w, clics);
    const band = w.document.getElementById('mBand');
    let medidas = 0;
    const r0 = band.getBoundingClientRect;
    band.getBoundingClientRect = () => { medidas++; return r0(); };
    const b0 = p.bus.getBoundingClientRect; let medidasBarra = 0;
    p.bus.getBoundingClientRect = () => { medidasBarra++; return b0(); };
    w.BarStockBandDock.enganchar({ pantalla: p.host, barra: p.bus, desvanecer: [p.fila] });
    prueba('la copia del Home se prepara al pintar, no en el momento de acoplarse',
      w.document.querySelectorAll('#mDock .m-searchbar').length === 1 && !acoplada(w));
    medidas = 0; medidasBarra = 0;
    const escritas = [];
    const html = w.document.documentElement.style, sp0 = html.setProperty.bind(html);
    html.setProperty = (k, v) => { escritas.push(k); return sp0(k, v); };
    for (const y of [10, 40, 80, 103, 200, 400, 200, 80, 0]) mover(w, p, y);
    prueba('Home: ni una medida de la banda en nueve pasos de scroll', medidas === 0, String(medidas));
    prueba('ni de la búsqueda', medidasBarra === 0, String(medidasBarra));
    prueba('ni una variable del documento reescrita', escritas.length === 0, escritas.join(','));
    prueba('y sigue acoplándose donde debe', (mover(w, p, 103), acoplada(w)) && (mover(w, p, 102), !acoplada(w)));

    // El desenfoque del Home y de Buscar entraba de golpe; ahora entra
    // con el scroll, como el de Inventory.
    const d = w.document.getElementById('mDock');
    const o = () => Number(d.style.getPropertyValue('--m-dock-o'));
    mover(w, p, 0);   const o0 = o();
    mover(w, p, 90);  const o1 = o();
    mover(w, p, 103); const o2 = o();
    prueba('el desenfoque del Home entra poco a poco al acercarse', o0 === 0 && o1 > 0 && o1 < 1 && o2 === 1, [o0, o1, o2].join(' | '));

    // Y si la geometría cambia (gira la pantalla, se repinta), se vuelve a medir.
    medidas = 0; w.dispatchEvent(new w.Event('resize'));
    prueba('al cambiar de tamaño sí se mide', medidas > 0);
    medidas = 0;
    const t = new w.Event('touchstart', { bubbles: true }); t.touches = [{ clientY: 300 }]; p.bus.dispatchEvent(t);
    prueba('y al poner el dedo, una vez por gesto', medidas > 0);
  })();

  grupo('el Home lo usa, y carga después del módulo');
  {
    const home = fs.readFileSync(path.join(RAIZ, 'src/mobile-home.js'), 'utf8');
    prueba('mobile-home.js engancha la búsqueda', /BarStockBandDock[\s\S]{0,200}enganchar/.test(home));
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const i = html.indexOf('src/band-dock.js'), j = html.indexOf('src/mobile-home.js');
    prueba('band-dock.js antes que mobile-home.js', i > 0 && i < j);
    const bus = fs.readFileSync(path.join(RAIZ, 'src/mobile-search.js'), 'utf8');
    prueba('mobile-search.js fija su barra con la lista aparte', /BarStockBandDock[\s\S]{0,300}fija:\s*true[\s\S]{0,80}scroll:/.test(bus));
    prueba('band-dock.js antes que mobile-search.js', i > 0 && i < html.indexOf('src/mobile-search.js'));
    const invSrc = fs.readFileSync(path.join(RAIZ, 'src/mobile-inventory.js'), 'utf8');
    // Desde 2026-11-12 Inventory no tiene título grande: entra acoplada
    // (`siempre`) con su nombre en el header.
    prueba('mobile-inventory.js pega su bloque, con su nombre y acoplada desde el principio',
      /BarStockBandDock[\s\S]{0,400}pegado:[\s\S]{0,120}nombre: 'Inventory', siempre: true/.test(invSrc));
    prueba('band-dock.js antes que mobile-inventory.js', i > 0 && i < html.indexOf('src/mobile-inventory.js'));
    // Orders igual desde el mismo día, salvo dentro de un detalle (sin
    // nombre: el logo se queda).
    const ordSrc = fs.readFileSync(path.join(RAIZ, 'src/mobile-orders.js'), 'utf8');
    prueba('mobile-orders.js entra acoplada, pero no dentro de un detalle',
      /BarStockBandDock[\s\S]{0,800}nombre, siempre: !!nombre/.test(ordSrc));
    prueba('band-dock.js antes que mobile-orders.js', i > 0 && i < html.indexOf('src/mobile-orders.js'));
    const css2 = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    prueba('el bloque se pega por CSS (sticky), no con JavaScript', /\.m-dock-pegado\s*\{[^}]*position\s*:\s*sticky/.test(css2));
    prueba('el desenfoque sabe alargarse para una segunda pieza', /\.m-dock-velo\s*\{[^}]*bottom\s*:[^;]*--m-dock-mas/.test(css2));
    prueba('un aviso en el header tapa también el título', /m-band-bub\s+\.m-band-titulo[^{]*\{[^}]*opacity\s*:\s*0/.test(css2));
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
