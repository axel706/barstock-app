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
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
