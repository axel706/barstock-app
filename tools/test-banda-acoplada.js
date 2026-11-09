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
  return { host, fila, bus };
}
// La posición "natural": búsqueda a 210, saludo a 150. Bajar `y` las sube.
function mover(w, p, y) {
  p.bus.getBoundingClientRect = () => ({ top: 210 - y, bottom: 258 - y, height: 48, left: 30, width: 330 });
  p.fila.getBoundingClientRect = () => ({ top: 150 - y, bottom: 200 - y, height: 50, left: 30, width: 330 });
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
    prueba('con el alto hasta la rampa', w.document.getElementById('mDock').style.height === (D0 + 50 + 30) + 'px',
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
    sc.dispatchEvent(new w.Event('scroll'));
    const q = () => band.style.getPropertyValue('--m-dock-q');
    const velo = blo.querySelector('.m-dock-velo');
    const bt = band.querySelector('.m-band-titulo');
    prueba('la lista lleva su propio scroll', sc.classList.contains('m-dock-scroll') && sc.classList.contains('m-dock-con-titulo'));
    prueba('pestañas y filtro van pegados (sticky), sin copia', blo.classList.contains('m-dock-pegado') && !w.document.querySelector('#mDock .m-searchbar'));
    prueba('con su desenfoque dentro, detrás de ellos', !!velo && blo.firstElementChild === velo);
    prueba('el header tiene el título de la pantalla', !!bt && bt.textContent === 'Inventory' && band.classList.contains('m-con-titulo'));
    prueba('en reposo: el logo, el título grande entero y sin desenfoque', q() === '0' && tit.style.opacity === '' && velo.style.opacity === '0',
      [q(), tit.style.opacity, velo.style.opacity].join(' | '));
    sc.scrollTop = 30; sc.dispatchEvent(new w.Event('scroll'));
    const medio = Number(q());
    prueba('a medio camino: el fundido va por la mitad, ligado al scroll', medio > 0 && medio < 1 && Number(tit.style.opacity) > 0 && Number(tit.style.opacity) < 1,
      [q(), tit.style.opacity].join(' | '));
    sc.scrollTop = 60; sc.dispatchEvent(new w.Event('scroll'));
    prueba('acoplado: el título en el header, el grande fuera, desenfoque entero', q() === '1' && tit.style.opacity === '0' && velo.style.opacity === '1',
      [q(), tit.style.opacity, velo.style.opacity].join(' | '));
    sc.scrollTop = 900; sc.dispatchEvent(new w.Event('scroll'));
    prueba('más abajo sigue igual', q() === '1' && velo.style.opacity === '1');
    sc.scrollTop = 30; sc.dispatchEvent(new w.Event('scroll'));
    prueba('y al volver retrocede por el mismo camino', Number(q()) === medio);
    eng();                                   // refrescar: show() en la misma pantalla
    prueba('un repintado no duplica el desenfoque ni el título', blo.querySelectorAll('.m-dock-velo').length === 1 && band.querySelectorAll('.m-band-titulo').length === 1 && sc.querySelectorAll('.m-dock-marca').length === 1);
    prueba('ni mueve la lista de donde estaba', sc.scrollTop === 30);

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
    prueba('sin rebote: overscroll-behavior en el html', /(^|[\s,}])html\s*\{[^}]*overscroll-behavior(-y)?\s*:\s*none/.test(css));
  }

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
    prueba('mobile-inventory.js pega su bloque y pasa el título', /BarStockBandDock[\s\S]{0,400}pegado:[\s\S]{0,120}titulo:/.test(invSrc));
    prueba('band-dock.js antes que mobile-inventory.js', i > 0 && i < html.indexOf('src/mobile-inventory.js'));
    const css2 = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    prueba('el bloque se pega por CSS (sticky), no con JavaScript', /\.m-dock-pegado\s*\{[^}]*position\s*:\s*sticky/.test(css2));
    prueba('un aviso en el header tapa también el título', /m-band-bub\s+\.m-band-titulo[^{]*\{[^}]*opacity\s*:\s*0/.test(css2));
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
