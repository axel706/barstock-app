#!/usr/bin/env node
/*
 * ── Se comporta como app, no como página ─────────────────────────────
 *
 * El documento no rueda; rueda UN contenedor dentro. Sin eso, el
 * rebote de iOS arrastra las barras fijas y la interfaz entera baila,
 * que es lo que delata a una web disfrazada de app.
 *
 * ── Y la trampa que ya nos costó cuatro commits ────────────────
 *
 * NO se le pone `position: fixed` al body. En WebKit un elemento fijo
 * abre contexto de apilamiento, y las capas del fondo de esta app van
 * con z-index negativo: quedaron atrapadas dentro y dejaron de pintar
 * el borde de abajo. Franja negra bajo la barra, en toda la app.
 *
 * Hay una comprobación aquí abajo que falla si alguien lo reintenta.
 *
 *   node tools/test-no-pagina.js
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const css = leer('styles/mobile-app.css');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

function montar() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {},
                          addListener() {}, removeListener() {} });
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

grupo('la hoja: el documento quieto, el contenedor rodando');
{
  const raiz = (/html:has\(body\.m-shell\.m-on\)\s*\{([^}]*)\}/g.exec(css) || [])[1] || '';
  prueba('el raíz no deja rodar la ventana', /overflow:\s*hidden/.test(css) &&
    /html:has\(body\.m-shell\.m-on\)\s*\{[^}]*overflow:\s*hidden/.test(css), raiz.trim());

  const cont = (/body\.m-shell\.m-on\s*>\s*\.m-screens\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
  prueba('#mScreens va fijo', /position:\s*fixed/.test(cont), cont.trim());
  prueba('y es el que rueda en vertical', /overflow-y:\s*auto/.test(cont));
  prueba('sin desplazarse de lado', /overflow-x:\s*hidden/.test(cont));
  prueba('con el rebote contenido, no encadenado',
    /overscroll-behavior:\s*contain/.test(cont));
  prueba('y con el hueco de las dos barras',
    /padding-top/.test(cont) && /padding-bottom/.test(cont));
}

grupo('lo que NO se hace, y por qué');
{
  // Un body fijo atrapa las capas del fondo (z-index negativo) y deja
  // una franja negra bajo la barra en todas las pantallas.
  prueba('el body NO se fija',
    !/body\.m-shell\.m-on\s*\{[^}]*position:\s*fixed/.test(css));
  // Y lo que pinta esos últimos 34px sigue en su sitio.
  prueba('la barra sigue pintando el borde de abajo',
    /\.m-tabs::before\s*\{[^}]*height:\s*calc\(16px \+ env\(safe-area-inset-bottom/.test(css));
  // El suelo desenfoca, no tiñe: un velo ahí se lee como barra negra.
  const capas = css.match(/\.m-floor > i:nth-child\(\d\)\s*\{[^}]*\}/g) || [];
  prueba('el suelo sigue sin tinte', capas.length === 6 &&
    capas.every(c => !/background/.test(c)));
}

grupo('el código pregunta quién rueda, no lo adivina');
{
  const w = montar();
  const M = w.BarStockMobile;

  prueba('sin pantalla propia, manda el documento', M.scroller() === null);

  M.register({ id: 'home', tab: true, mount() {}, show() {} });
  M.ir('home');
  const host = w.document.getElementById('mScreens');
  prueba('con pantalla propia, manda #mScreens', M.scroller() === host);

  host.scrollTop = 240;
  const antes = w.__scrollTo || 0;
  M.irArriba();
  prueba('volver arriba mueve el contenedor', host.scrollTop === 0);
  prueba('y NO la ventana', (w.__scrollTo || 0) === antes, 'se llamó window.scrollTo');

  M.register({ id: 'inv', tab: true, mount() {}, show() {} });
  host.scrollTop = 500;
  M.ir('inv');
  prueba('cambiar de pestaña empieza arriba', host.scrollTop === 0);

  // El tirón para refrescar sólo se arma estando arriba del todo. Si
  // siguiera mirando window.scrollY —siempre 0— se armaría en mitad
  // de la pantalla y recargaría al intentar desplazarse.
  const js = leer('src/mobile-shell.js');
  prueba('el tirón mira el contenedor, no la ventana',
    /function arribaDelTodo\(\)\s*\{\s*return desplazamiento\(\) <= 0;/.test(js));
}

grupo('con una sección del escritorio, rueda el documento');
{
  const w = montar();
  const M = w.BarStockMobile;
  M.register({ id: 'cost', tab: true, seccion: 'costs' });
  const antes = w.__scrollTo || 0;
  M.ir('cost');
  prueba('las pantallas propias se ocultan', M.scroller() === null);
  prueba('y ahí sí manda window.scrollTo', (w.__scrollTo || 0) > antes);
}

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
