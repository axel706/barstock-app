#!/usr/bin/env node
/*
 * ── El armazón de la app móvil ───────────────────────────────────────
 *
 * Lo que de verdad hay que proteger aquí no es que las pestañas se
 * pinten bonitas. Es esto:
 *
 *   1. En escritorio NO se monta nada. La app de arriba de 640px
 *      funciona y lleva meses afinándose; un modulo nuevo que la pueda
 *      tocar es un riesgo que no hace falta correr.
 *   2. Las secciones que ya existen se abren con bsOpenSection, no con
 *      una copia. Dos caminos para abrir lo mismo es como empiezan los
 *      desajustes entre el boton y lo que abre.
 *   3. La barra se dibuja desde lo REGISTRADO. Si hubiera una lista a
 *      mano, añadir una pantalla tendria dos sitios donde fallar.
 *
 *   node tools/test-mobile.js
 */

const path = require('path');
const fs = require('fs');

const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let pasa = 0, falla = 0;
function ok(n, c, d) {
  if (c) { pasa++; console.log('  ok   ' + n); }
  else { falla++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const eq = (n, got, esp) =>
  ok(n, JSON.stringify(got) === JSON.stringify(esp),
     'dio ' + JSON.stringify(got) + ', esperaba ' + JSON.stringify(esp));

// `movil` decide que contesta matchMedia, que es lo unico que mira el
// armazon para montarse o no.
function montar(movil) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;

  w.matchMedia = () => ({
    matches: !!movil,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
  });
  w.scrollTo = () => {};
  w.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&') };

  w.__abiertas = [];
  w.bsOpenSection = (n) => w.__abiertas.push(n);
  w.__cerradas = 0;
  w.bsCloseSection = () => { w.__cerradas++; };

  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-shell.js'), 'utf8'))();
  // jsdom deja el documento en 'loading' para siempre, asi que el
  // DOMContentLoaded del que cuelga init() no llega solo. En el
  // navegador el <script> va al final del body y si llega.
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return w;
}

const tabsDe = (w) => Array.from(w.document.querySelectorAll('.m-tab')).map(b => b.dataset.m);

console.log('\nen escritorio no existe');
{
  const w = montar(false);
  ok('no se monta la barra', !w.document.getElementById('mTabs'));
  ok('ni el contenedor de pantallas', !w.document.getElementById('mScreens'));
  ok('ni se marca el body', !w.document.body.classList.contains('m-shell'));

  // Registrar con el armazon desmontado no debe reventar: el orden de
  // carga de los <script> no esta garantizado.
  w.BarStockMobile.register({ id: 'home', tab: true, mount() {} });
  ok('registrar sin armazon no revienta', true);
  ok('y sigue sin montarse', !w.document.getElementById('mTabs'));
}

console.log('\nen el telefono');
{
  const w = montar(true);
  ok('se monta la barra', !!w.document.getElementById('mTabs'));
  ok('y el body queda marcado', w.document.body.classList.contains('m-shell'));
}

console.log('\nla barra sale de lo registrado');
{
  const w = montar(true);
  const M = w.BarStockMobile;
  M.register({ id: 'home',   tab: true, orden: 10, icon: 'ti-home',  mount(h) { h.textContent = 'HOME'; } });
  M.register({ id: 'more',   tab: true, orden: 50, icon: 'ti-dots',  mount(h) { h.textContent = 'MORE'; } });
  M.register({ id: 'search', tab: true, orden: 20, icon: 'ti-search', mount(h) { h.textContent = 'BUSCAR'; } });
  M.register({ id: 'oculta', tab: false, mount() {} });

  eq('salen en el orden pedido, no en el de registro', tabsDe(w), ['home', 'search', 'more']);
  ok('una pantalla sin tab no sale en la barra', tabsDe(w).indexOf('oculta') === -1);
}

console.log('\nnavegar');
{
  const w = montar(true);
  const M = w.BarStockMobile;
  let montadas = 0;
  let vistas = 0;
  M.register({ id: 'home', tab: true, orden: 10, mount() { montadas++; }, show() { vistas++; } });
  M.register({ id: 'inv',  tab: true, orden: 20, seccion: 'inventory' });

  M.ir('home');
  eq('la pantalla activa es la que se pidio', M.activa(), 'home');
  eq('se monta una sola vez', montadas, 1);

  M.ir('inv');
  eq('una pestaña de seccion usa bsOpenSection', w.__abiertas, ['inventory']);
  ok('y esconde las pantallas propias',
     w.document.getElementById('mScreens').classList.contains('hidden'));

  M.ir('home');
  eq('volver no vuelve a montar', montadas, 1);
  eq('pero si vuelve a enseñar', vistas, 2);
  ok('y cierra la seccion del escritorio antes de pintar', w.__cerradas >= 1);
  ok('la pantalla vuelve a verse',
     !w.document.getElementById('mScreens').classList.contains('hidden'));
}

console.log('\nlo que no debe tumbar nada');
{
  const w = montar(true);
  const M = w.BarStockMobile;
  M.ir('noExiste');
  ok('ir a una pantalla que no existe no revienta', true);

  // Una pantalla que falla al montarse no puede llevarse la app por
  // delante: la barra tiene que seguir respondiendo.
  M.register({ id: 'rota', tab: true, mount() { throw new Error('boom'); } });
  M.ir('rota');
  eq('una pantalla que revienta al montarse no tumba el armazon', M.activa(), 'rota');
  ok('y la barra sigue ahi', !!w.document.getElementById('mTabs'));
}

console.log('\nel boton de escanear');
{
  const w = montar(true);
  let abierto = 0;
  w.BarStockScanCount = { open() { abierto++; } };
  w.BarStockMobile.register({ id: 'home', tab: true, mount() {} });
  w.document.getElementById('mFab').click();
  eq('abre el escaner que ya existe, no una copia', abierto, 1);
}

console.log('\n' + (falla ? falla + ' FALLO(S)' : 'todo bien') + '   ·   ' + pasa + ' comprobaciones');
process.exit(falla ? 1 : 0);
