#!/usr/bin/env node
/*
 * ── Quién rueda, y el suelo ──────────────────────────────────────────
 *
 * Tres síntomas que durante semanas se trataron como tres problemas:
 *
 *   · deslizar en cualquier hueco movía la interfaz entera de lado,
 *     como una página web;
 *   · el rebote de iOS arrastraba la barra de pestañas y dejaba un
 *     escalón debajo;
 *   · el panel de avisos se atascaba al llegar al final de la lista.
 *
 * Los tres eran lo mismo: el documento se podía desplazar. Esto
 * protege el arreglo —el documento quieto y UN contenedor que rueda—
 * porque es de los que se deshacen solos: basta que alguien vuelva a
 * poner un window.scrollTo o le quite el overflow a #mScreens.
 *
 *   node tools/test-armazon-scroll.js
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

function montar(movil) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({
    matches: !!movil,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}
  });
  w.scrollTo = function () { w.__scrollTo = (w.__scrollTo || 0) + 1; };
  w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&') };
  w.BarStockEvents = { _h: {}, on(n, f) { (this._h[n] = this._h[n] || []).push(f); },
                       emit(n, d) { (this._h[n] || []).forEach(f => f(d || {})); } };
  w.bsOpenSection = () => {};
  w.bsCloseSection = () => {};
  new Function(leer('src/mobile-shell.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return w;
}

grupo('el suelo que desenfoca existe y está debajo de la barra');
{
  const w = montar(true);
  const suelo = w.document.getElementById('mFloor');
  prueba('se monta', !!suelo);
  prueba('con seis capas', !!suelo && suelo.querySelectorAll('i').length === 6,
    suelo && String(suelo.querySelectorAll('i').length));
  // El orden en el DOM es lo que lo deja por debajo cuando dos
  // elementos comparten contexto de apilamiento.
  const hijos = Array.from(w.document.body.children).map(c => c.id);
  prueba('antes que la barra en el DOM',
    hijos.indexOf('mFloor') < hijos.indexOf('mTabs'), hijos.join(','));
  prueba('y no se lee ni se toca',
    !!suelo && suelo.getAttribute('aria-hidden') === 'true');
}

grupo('el que rueda es el contenedor, no la ventana');
{
  const w = montar(true);
  const M = w.BarStockMobile;

  // Sin pantalla propia delante manda el documento: ahí está la página
  // del escritorio, que no se toca.
  prueba('con las pantallas ocultas, no hay contenedor', M.scroller() === null);

  M.register({ id: 'home', tab: true, mount() {}, show() {} });
  M.ir('home');
  const host = w.document.getElementById('mScreens');
  prueba('con una pantalla propia, el contenedor es #mScreens',
    M.scroller() === host);

  host.scrollTop = 240;
  const antes = w.__scrollTo || 0;
  M.irArriba();
  prueba('volver arriba mueve el contenedor', host.scrollTop === 0);
  prueba('y NO la ventana', (w.__scrollTo || 0) === antes,
    'window.scrollTo se llamó');

  // Al cambiar de pestaña también sube, que es lo que se espera de
  // una app: no heredas el desplazamiento de la pantalla anterior.
  M.register({ id: 'inv', tab: true, mount() {}, show() {} });
  host.scrollTop = 500;
  M.ir('inv');
  prueba('cambiar de pestaña empieza arriba', host.scrollTop === 0);
}

grupo('con una sección del escritorio, rueda el documento');
{
  const w = montar(true);
  const M = w.BarStockMobile;
  M.register({ id: 'cost', tab: true, seccion: 'costs' });
  const antes = w.__scrollTo || 0;
  M.ir('cost');
  prueba('las pantallas propias se ocultan', M.scroller() === null);
  prueba('y ahí sí se usa window.scrollTo', (w.__scrollTo || 0) > antes);
}

grupo('el panel de avisos para el contenedor, no el body');
{
  const w = montar(true);
  const M = w.BarStockMobile;
  M.register({ id: 'home', tab: true, mount() {}, show() {} });
  M.ir('home');
  const host = w.document.getElementById('mScreens');

  w.BarStockToast = { pendientes: () => [], olvidar() {} };
  w.BARSTOCK_CONFIG = {};
  new Function(leer('src/mobile-notif.js'))();

  const N = w.BarStockMobileNotif;
  prueba('el módulo se carga', !!N && typeof N.abrir === 'function');

  host.scrollTop = 300;
  N.abrir();
  // El panel cuelga del fondo porque es el fondo quien lo centra.
  const fondo = w.document.getElementById('mNotifBack');
  const panel = w.document.getElementById('mNotifPanel');
  prueba('el panel vive dentro del fondo', !!fondo && !!panel && panel.parentNode === fondo);
  // Y por eso el clic de cerrar tiene que mirar dónde cayó: tocar un
  // aviso no puede cerrar el panel.
  fondo.onclick({ target: panel });
  prueba('tocar el panel no lo cierra', !!w.document.getElementById('mNotifPanel'));

  prueba('el contenedor queda quieto', host.classList.contains('m-nf-quieto'));
  prueba('sin moverlo de sitio', host.scrollTop === 300);
  // El apaño viejo: fijar el body con top negativo. Dejaba el body más
  // corto que la ventana y debajo asomaba una franja negra.
  prueba('y sin fijar el body', !w.document.body.style.top,
    'body.style.top = ' + w.document.body.style.top);
  prueba('ni marcarlo', !w.document.body.classList.contains('m-nf-abierto'));

  N.cerrar();
  prueba('al cerrar se suelta', !host.classList.contains('m-nf-quieto'));
  prueba('y sigue donde estaba', host.scrollTop === 300);
}

grupo('la hoja no deja rodar el documento');
{
  const css = leer('styles/mobile-app.css');
  prueba('el raíz no deja rodar la ventana',
    /html:has\(body\.m-shell\.m-on\)\s*\{[^}]*overflow:\s*hidden/.test(css));
  // El body NO se fija: en WebKit un elemento fijo abre contexto de
  // apilamiento, y las capas del fondo van con z-index negativo. Al
  // fijarlo dejaron de pintar el borde de abajo y salió una franja
  // negra bajo la barra en toda la app.
  prueba('y el body NO se fija, que eso rompía el fondo',
    !/body\.m-shell\.m-on\s*\{[^}]*position:\s*fixed/.test(css));
  prueba('#mScreens es el único que rueda',
    /body\.m-shell\.m-on\s*>\s*\.m-screens\s*\{[^}]*overflow-y:\s*auto/.test(css));
  prueba('y va fijo, así el body no tiene nada en flujo',
    /body\.m-shell\.m-on\s*>\s*\.m-screens\s*\{[^}]*position:\s*fixed/.test(css));
  // Un velo encima del borde de abajo ES la barra negra. El suelo
  // desenfoca y nada más.
  prueba('el suelo no lleva tinte encima del borde',
    !/\.m-floor i:nth-child\(6\)\s*\{[^}]*background:/.test(css));
  prueba('y no se desliza de lado',
    /body\.m-shell\.m-on\s*>\s*\.m-screens\s*\{[^}]*overflow-x:\s*hidden/.test(css));
  prueba('el hueco de la barra pasó al contenedor',
    /body\.m-shell\.m-on\s*>\s*\.m-screens\s*\{[^}]*padding-bottom/.test(css));
  // El centrado lo hace el flex del fondo, no un transform. Si
  // volviera a hacerlo el transform, la animación de entrada se lo
  // llevaría por delante otra vez.
  prueba('el fondo centra el panel',
    /\.m-nf-back\s*\{[^}]*align-items:\s*center/.test(css));
  prueba('con relleno igual arriba y abajo, que es lo que lo centra',
    /\.m-nf-back\s*\{[^}]*padding:\s*calc\(94px \+ env\(safe-area-inset-bottom/.test(css));
  prueba('y el panel no lleva coordenadas propias',
    !/\.m-nf-panel\s*\{[^}]*(top|bottom):\s*\d/.test(css));
  prueba('su transform es sólo la animación',
    /\.m-nf-panel\.on\s*\{[^}]*transform:\s*scale\(1\)/.test(css));
  // 118px subían el desenfoque hasta media pantalla y se leía como una
  // franja negra en todas las pantallas. Va de la mitad de la barra
  // (52 de alto → 26) hacia abajo, y de ahí no sube.
  prueba('el suelo empieza en la mitad de la barra, no más arriba',
    /\.m-floor\s*\{[^}]*height:\s*calc\(26px \+ env\(safe-area-inset-bottom/.test(css));
  prueba('el suelo tiene sus seis capas de desenfoque',
    (css.match(/\.m-floor i:nth-child\(\d\)/g) || []).length === 6);
  prueba('con máscara en todas, que es lo que lo hace progresivo',
    (css.match(/\.m-floor i:nth-child\(\d\)\s*\{[^}]*mask-image/g) || []).length === 6);
  prueba('ya no se fija el body al abrir avisos',
    !/body\.m-nf-abierto\s*\{[^}]*position:\s*fixed/.test(css));
}

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
