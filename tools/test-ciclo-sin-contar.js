#!/usr/bin/env node
/*
 * ── La salida de un ciclo que no se va a contar ──────────────────────
 *
 * En Will's & Bill's no se cuenta. Se reinicia el ciclo, todo queda en
 * cero, todo aparece en Ordering, se ajusta a ojo y se pide. La semana
 * siguiente la app se quedaba sin salida: el paso 2 ofrecía "Load the
 * count · Scan the bottles" para siempre, y lo único que desatasca
 * —empezar la semana de nuevo— sólo vivía en el estado `done`.
 *
 * ── Dos intentos de adivinar, y por qué ya no se adivina ────────────
 *
 * Primero la salida salía con el ciclo abierto más de SIETE días. El
 * de ella abrió el 26 y lo miró el 1: seis. Llegaba un día tarde, cada
 * semana.
 *
 * Después, con el ciclo abierto y NADA que pedir. Tampoco: en su
 * locación quedaban renglones en Ordering, así que la app decidió que
 * había camino y se guardó la salida. Él seguía viendo lo mismo.
 *
 * La pregunta estaba mal. Si esta semana se va a contar o no lo sabe
 * quien lleva la barra, no la app. Así que la salida está SIEMPRE en el
 * paso 2, detrás de su confirmación — que es como el botón de
 * escritorio se ha comportado desde siempre.
 *
 * Lo que se protege aquí:
 *
 *   1. En el paso 2 la salida está, sin condiciones y sin umbrales.
 *   2. Pregunta antes, y dice lo primero que hay que saber: que no se
 *      pierde ningún conteo.
 *   3. No aparece donde ya hay camino: con un conteo en marcha la
 *      respuesta es terminarlo o descartarlo, no reiniciar.
 *   4. Importar no desaparece: sigue en las dos pantallas.
 *   5. La tarjeta del Home no se toca. Contar e importar caben; la
 *      salida necesita la explicación que sólo cabe en el ciclo.
 *
 *   node tools/test-ciclo-sin-contar.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = ms => new Promise(r => setTimeout(r, ms || 0));

const inv = (n, conStock) => Array.from({ length: n }, (_, i) => ({
  item: 'ITEM ' + i, code: 'C' + i, vendor: 'ACME',
  onHand: i < conStock ? 3 : 0, toOrder: 0
}));

// o: { dias, contado, counting, porPedir }
function entorno(o) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.BARSTOCK_CONFIG = {};
  w.BarStockToast = { show() {} };
  w.scrollTo = () => {};

  // Con stock = ya se contó; sin stock = el ciclo está a cero.
  w.state = { master: inv(50, o.contado ? 40 : 0) };

  const abierto = new Date(Date.now() - o.dias * 86400000);
  w.BarStockWeeklyCycle = {
    estado: () => o.counting ? 'counting' : (o.contado ? 'done' : 'step2'),
    resetAt: () => abierto.toISOString(),
    fmtDate: () => 'Oct 26',
    edadCiclo: () => Date.now() - abierto.getTime(),
    diasDeCalendario: () => o.dias,
    cicloViejo: () => o.dias > 7,
    pausado: () => false,
    abandonado: () => false,
    hace: (ms) => Math.round(ms / 60000) + ' min',
    reiniciar: () => { w.__reiniciado = (w.__reiniciado || 0) + 1; }
  };

  // Lo que queda por pedir. Estuvo en la condición y ya no está: se
  // deja en el entorno para poder probar justo eso.
  w.getActiveVendors = () => ['ACME'];
  w.getOrderRowsForVendor = () => (o.porPedir ? [{ item: 'ITEM 1', toOrder: 6 }] : []);
  w.computeOrderSubtotal = () => 0;
  w.isRowPlaced = () => false;
  w.BarStockCountSession = { exists: () => false, size: () => 0 };
  w.BarStockZones = { lista: () => [], activas: () => false, paraPasada: () => '' };
  w.BarStockMobile = { register(d) { w.__def = d; }, ir() {}, refrescarBadges() {} };

  // El diálogo DE VERDAD: la salida pregunta antes, y un stub propio
  // sería una segunda implementación.
  new Function(fs.readFileSync(path.join(RAIZ, 'src/dialog.js'), 'utf8'))();
  return w;
}

function home(w) {
  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-home.js'), 'utf8'))();
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'home';
  w.document.body.appendChild(host);
  w.BarStockMobileHome.render(host);
  return Array.from(host.querySelectorAll('.m-hero'))
    .find(c => /Cycle open/.test(c.textContent));
}

function ciclo(w) {
  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-cycle.js'), 'utf8'))();
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'cycle';
  w.document.body.appendChild(host);
  w.BarStockMobileCycle.render(host);
  return host;
}

(async () => {

grupo('el de Will\'s & Bill\'s: abierto el 26, mirado el 1, con cosas por pedir');
{
  // La captura exacta que lo destapó, con la condición que falló:
  // seis días, nada contado, y Ordering NO vacío.
  const w = entorno({ dias: 6, porPedir: true });
  const h = ciclo(w);
  prueba('la salida está', !!h.querySelector('#mcOtra'));
  prueba('dice cuántos días lleva abierto',
    /open 6 days/.test(h.textContent), h.textContent.slice(0, 160));
  prueba('y para qué es', /not going to be counted/.test(h.textContent));
}

grupo('en el paso 2 está siempre, sin umbrales');
{
  for (const caso of [
    { dias: 0, porPedir: true },   // recién abierto
    { dias: 1, porPedir: false },
    { dias: 6, porPedir: false },
    { dias: 30, porPedir: true }
  ]) {
    const h = ciclo(entorno(caso));
    prueba('dias=' + caso.dias + ' porPedir=' + caso.porPedir,
      !!h.querySelector('#mcOtra'));
  }
}

grupo('e importar no desaparece de ninguna de las dos pantallas');
{
  const w = entorno({ dias: 6, porPedir: true });
  prueba('en el ciclo', !!ciclo(w).querySelector('#mcFile'));
  prueba('y en la tarjeta', /Import a file/.test(home(w).textContent));
}

grupo('contar sigue siendo el botón primario de la tarjeta');
{
  // Que la salida esté a mano no la asciende: la respuesta correcta
  // sigue siendo contar, y es la única con color sólido.
  const c = home(entorno({ dias: 30, porPedir: false }));
  prueba('Count now es el .m-hero-b',
    /Count now/.test(c.querySelector('.m-hero-b').textContent));
  const secs = Array.from(c.querySelectorAll('.m-hero-b2')).map(b => b.textContent.trim());
  prueba('y los otros dos son secundarios',
    secs.join('|') === 'Import a file|Start over', secs.join(' · '));
}

grupo('y en la tarjeta del Home, que es donde se mira');
{
  // Estuvo sólo en la pantalla del ciclo y fue peor: a esa pantalla no
  // se llega desde ningún sitio en el teléfono, así que el botón
  // existía y no lo veía nadie.
  for (const dias of [1, 6, 30]) {
    const c = home(entorno({ dias, porPedir: dias !== 6 }));
    const bs = Array.from(c.querySelectorAll('button')).map(b => b.textContent.trim());
    prueba('dias=' + dias + ': los tres en la fila',
      bs.join('|') === 'Count now|Import a file|Start over', bs.join(' · '));
  }
}

grupo('y el tercero de la tarjeta hace lo mismo que el del ciclo');
{
  const w = entorno({ dias: 6, porPedir: true });
  const c = home(w);
  Array.from(c.querySelectorAll('button'))
    .find(b => /Start over/.test(b.textContent)).click();
  await esperar(20);
  const t = (w.document.getElementById('dlgBg') || {}).textContent || '';
  prueba('pregunta antes', /Start the week over/.test(t), t.slice(0, 120));
  // En el botón no cabe la explicación, así que TIENE que estar aquí.
  prueba('y la explicación entera está en el diálogo',
    /not going to be counted/.test(t) && /On hand stays/.test(t) &&
    /available to order again/.test(t), t.slice(0, 260));
  prueba('todavía no ha reiniciado nada', !w.__reiniciado);
  w.document.getElementById('dlgSi').click();
  await esperar(20);
  prueba('al confirmar, reinicia', w.__reiniciado === 1, String(w.__reiniciado));
}

grupo('la tarjeta no crece por el tercer botón');
{
  // La regla de siempre: estas tarjetas no cambian de alto. Tres
  // botones en UNA fila, no dos filas.
  const c = home(entorno({ dias: 6, porPedir: true }));
  const fila = c.querySelector('.m-hero-acts');
  prueba('los tres cuelgan de la misma fila',
    fila.querySelectorAll('button').length === 3,
    String(fila.querySelectorAll('button').length));
  const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8');
  prueba('y el CSS apreta la fila cuando hay tres',
    /m-hero-acts:has\(\.m-hero-b2 ~ \.m-hero-b2\)/.test(css));
}

grupo('la salida pregunta antes, y dice que no se pierde nada');
{
  const w = entorno({ dias: 6, porPedir: true });
  const h = ciclo(w);
  h.querySelector('#mcOtra').click();
  await esperar(20);

  const dlg = w.document.getElementById('dlgBg');
  const t = dlg ? dlg.textContent : '';
  prueba('sale el diálogo', /Start the week over/.test(t), t.slice(0, 120));
  // El miedo al botón de reiniciar es que te borre el conteo. Aquí no
  // hay conteo, y eso es lo primero que tiene que leerse.
  prueba('dice que el on hand no se mueve', /On hand stays/.test(t), t.slice(0, 200));
  prueba('y que todo vuelve a poder pedirse',
    /available to order again/.test(t), t.slice(0, 220));

  prueba('todavía no ha reiniciado nada', !w.__reiniciado);
  w.document.getElementById('dlgSi').click();
  await esperar(20);
  prueba('al confirmar, reinicia', w.__reiniciado === 1, String(w.__reiniciado));
}

grupo('donde ya hay camino, no se ofrece');
{
  // Hay trabajo hecho: la salida no es empezar de nuevo, es terminar o
  // descartar el conteo.
  const h = ciclo(entorno({ dias: 10, counting: true }));
  prueba('con un conteo en marcha, no', !h.querySelector('#mcOtra'));
  prueba('sino descartar el conteo', !!h.querySelector('#mcDrop'));
}
{
  // Ciclo cerrado: reiniciar ya existe y vive en la tarjeta del Home.
  const h = ciclo(entorno({ dias: 10, contado: true }));
  prueba('con el conteo cargado, tampoco', !h.querySelector('#mcOtra'));
}

grupo('y no vuelve a colarse un umbral');
{
  const wc = fs.readFileSync(path.join(RAIZ, 'src/weekly-cycle.js'), 'utf8');
  const mc = fs.readFileSync(path.join(RAIZ, 'src/mobile-cycle.js'), 'utf8');
  const mh = fs.readFileSync(path.join(RAIZ, 'src/mobile-home.js'), 'utf8');
  prueba('cicloSinContar ya no existe en ningún lado',
    !/cicloSinContar/.test(wc + mc + mh));
  prueba('ni queda un umbral de días decidiendo la salida',
    !/SUELO_MS|quedaPorPedir/.test(wc + mc + mh));
  // El comentario es la mitad del arreglo: quien lea esto tiene que
  // encontrarse los dos intentos fallidos antes de proponer un tercero.
  prueba('y queda escrito por qué no se detecta',
    /llegaba un día TARDE|NO se detecta/i.test(wc));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
