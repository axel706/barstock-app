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
  ok('ni la banda', !w.document.getElementById('mBand'));
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

console.log('\nla banda es del armazon, no del Home');
{
  const w = montar(true);
  const b = w.document.getElementById('mBand');
  // Vive aqui porque tiene que verse en TODAS las pantallas. Mientras
  // la pintaba el Home, al entrar a Buscar o a Inventario desaparecia.
  ok('existe sin que ninguna pantalla se haya registrado', !!b);
  ok('con el logo', !!b && !!b.querySelector('.m-logo'));
  ok('y su boton de ajustes', !!b && b.querySelectorAll('.m-ico').length === 1);
  // Sin boton de luna: en el telefono no hay modo claro, y un boton
  // que no hace nada es peor que no tener boton.
  ok('y ningun boton de tema', !w.document.getElementById('mTheme'));
  // Primera del body para que body.auth-locked > * tambien la tape: el
  // encabezado no puede quedar flotando sobre la pantalla de entrada.
  eq('va la primera del body', w.document.body.firstElementChild.id, 'mBand');

  let ajustes = 0;
  w.openSettingsModal = () => { ajustes++; };
  w.document.getElementById('mSet').click();
  eq('y los ajustes la pantalla de siempre', ajustes, 1);

  // Sigue estando al entrar a una seccion del escritorio: ahi es donde
  // mas se notaba que faltaba.
  w.BarStockMobile.register({ id: 'inv', tab: true, seccion: 'inventory' });
  w.BarStockMobile.ir('inv');
  ok('y sigue ahi dentro de una seccion', !!w.document.getElementById('mBand'));
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
  // Registrar Home ya entro en el solo, asi que aqui empieza en 1.
  eq('al registrar Home ya se entro', vistas, 1);

  M.ir('home');
  eq('la pantalla activa es la que se pidio', M.activa(), 'home');
  eq('se monta una sola vez', montadas, 1);
  // Sin esto, la pantalla nueva se dibujaba DEBAJO de la de siempre en
  // vez de sustituirla: #mScreens cuelga del body.
  ok('la pagina de siempre se esconde', w.document.body.classList.contains('m-on'));

  M.ir('inv');
  eq('una pestaña de seccion usa bsOpenSection', w.__abiertas, ['inventory']);
  ok('y la pagina de siempre vuelve a verse', !w.document.body.classList.contains('m-on'));
  ok('y esconde las pantallas propias',
     w.document.getElementById('mScreens').classList.contains('hidden'));

  M.ir('home');
  eq('volver no vuelve a montar', montadas, 1);
  eq('pero si vuelve a enseñar', vistas, 3);
  ok('y cierra la seccion del escritorio antes de pintar', w.__cerradas >= 1);
  ok('la pantalla vuelve a verse',
     !w.document.getElementById('mScreens').classList.contains('hidden'));
}

console.log('\nse entra por Home sin tocar nada');
{
  // El fallo real: el armazon y las pantallas cuelgan los dos de
  // DOMContentLoaded y el <script> del armazon va PRIMERO, asi que al
  // montar todavia no hay ningun 'home'. Antes se comprobaba una sola
  // vez ahi y se quedaba viendose la pagina de escritorio hasta que
  // tocabas el icono de la casa.
  const w = montar(true);
  eq('al montar, sin Home registrado, no hay pantalla', w.BarStockMobile.activa(), null);

  let montadas = 0;
  w.BarStockMobile.register({ id: 'home', tab: true, orden: 10, mount() { montadas++; } });
  eq('registrar Home despues entra solo', w.BarStockMobile.activa(), 'home');
  eq('y lo monta', montadas, 1);
  ok('y esconde la pagina de siempre', w.document.body.classList.contains('m-on'));

  // Entrar es UNA vez. Si cada registro posterior volviera a Home,
  // registrar Buscar te sacaria de donde estuvieras.
  w.BarStockMobile.register({ id: 'search', tab: true, orden: 20, mount() {} });
  w.BarStockMobile.ir('search');
  w.BarStockMobile.register({ id: 'otra', tab: true, orden: 30, mount() {} });
  eq('un registro posterior no te devuelve a Home', w.BarStockMobile.activa(), 'search');
}

console.log('\nuna seccion ya abierta manda sobre Home');
{
  const w = montar(true);
  // Alguien llega con una seccion abierta: un enlace, una recarga a
  // media faena. Cambiarle la pantalla es peor que no tener Home.
  const c = w.document.createElement('div');
  c.className = 'card section-card bs-active-section';
  w.document.body.appendChild(c);

  w.BarStockMobile.register({ id: 'home', tab: true, orden: 10, mount() {} });
  eq('no se le roba la pantalla', w.BarStockMobile.activa(), null);
  ok('y la pagina de siempre sigue a la vista', !w.document.body.classList.contains('m-on'));
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

console.log('\nel pellizco no amplia');
{
  // Se vigila con JavaScript y no con user-scalable=no en el viewport:
  // esa meta es global y le quitaria el zoom tambien al iPad, que ve la
  // tabla del escritorio y ahi si hace falta.
  const w = montar(true);
  let bloqueados = [];
  const ev = new w.Event('gesturestart', { cancelable: true });
  w.document.dispatchEvent(ev);
  ok('se bloquea el pellizco de Safari', ev.defaultPrevented);

  // Un dedo es desplazarse, y eso NO se toca.
  const uno = new w.Event('touchmove', { cancelable: true });
  uno.touches = [{}];
  w.document.dispatchEvent(uno);
  ok('con un dedo se sigue pudiendo desplazar', !uno.defaultPrevented);

  const dos = new w.Event('touchmove', { cancelable: true });
  dos.touches = [{}, {}];
  w.document.dispatchEvent(dos);
  ok('con dos dedos no', dos.defaultPrevented);

  // Y al crecer la ventana se sueltan: en escritorio esto no existe.
  const d = montar(false);
  const ev2 = new d.Event('gesturestart', { cancelable: true });
  d.document.dispatchEvent(ev2);
  ok('en escritorio no se bloquea nada', !ev2.defaultPrevented);
}

console.log('\nel escaner va en el centro de la barra');
{
  const w = montar(true);
  const M = w.BarStockMobile;
  M.register({ id: 'home', tab: true, orden: 10, mount() {} });
  M.register({ id: 'inv',  tab: true, orden: 20, mount() {} });
  M.register({ id: 'ord',  tab: true, orden: 30, mount() {} });
  M.register({ id: 'more', tab: true, orden: 40, mount() {} });

  const barra = w.document.querySelector('.m-tabs-bar');
  const hijos = Array.from(barra.children).map(c =>
    c.classList.contains('m-tabs-hole') ? 'HUECO' : c.dataset.m);
  // El corte sale de cuantas pestañas haya, no de una lista a mano.
  eq('dos a cada lado del hueco', hijos, ['home', 'inv', 'HUECO', 'ord', 'more']);

  // Con impares, la de mas va a la izquierda: se lee de izquierda a
  // derecha y Home tiene que quedar en el extremo.
  const w2 = montar(true);
  ['a', 'b', 'c'].forEach((id, i) =>
    w2.BarStockMobile.register({ id, tab: true, orden: i * 10, mount() {} }));
  const h2 = Array.from(w2.document.querySelector('.m-tabs-bar').children).map(c =>
    c.classList.contains('m-tabs-hole') ? 'HUECO' : c.dataset.m);
  eq('con tres, dos y una', h2, ['a', 'b', 'HUECO', 'c']);
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
