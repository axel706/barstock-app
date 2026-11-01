#!/usr/bin/env node
/*
 * ── El ciclo que se quedó sin contar ─────────────────────────────────
 *
 * En Will's & Bill's no se cuenta. Se reinicia el ciclo, todo queda en
 * cero, todo aparece en Ordering, se ajusta a ojo y se pide.
 *
 * La semana siguiente la app se queda sin salida:
 *
 *   · el ciclo sigue abierto, así que el paso es `step2`
 *   · nadie contó, así que nunca llega a `done`
 *   · y todo lo de esa semana ya se pidió, así que Ordering está vacío
 *
 * El paso 2 ofrecía "Load the count · Scan the bottles" para siempre, y
 * lo único que desatasca —empezar la semana de nuevo— no existía en
 * ninguna pantalla: el botón de reiniciar sólo vive en `done`.
 *
 * Lo que se protege:
 *
 *   1. La app RECONOCE el estado. Un ciclo de hace una semana sin nada
 *      contado no puede hablar como si acabaras de abrirlo.
 *   2. La salida está en las DOS pantallas donde se mira: la tarjeta
 *      del Home y la del ciclo.
 *   3. Y no sale cuando no toca: con un ciclo de ayer la respuesta es
 *      contar, no reiniciar.
 *   4. Importar no desaparece. La tarjeta le cede su segundo botón a
 *      la salida, así que la pantalla del ciclo lo recoge.
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

// o: { dias, contado, counting }
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
    fmtDate: () => 'Oct 25',
    edadCiclo: () => Date.now() - abierto.getTime(),
    diasDeCalendario: () => o.dias,
    cicloViejo: () => o.dias > 7,
    pausado: () => false,
    abandonado: () => false,
    hace: (ms) => Math.round(ms / 60000) + ' min',
    // La de verdad: abierto, sin conteo, y más viejo que su semana.
    cicloSinContar: () => !o.counting && !o.contado && o.dias > 7,
    reiniciar: () => { w.__reiniciado = (w.__reiniciado || 0) + 1; }
  };

  w.getActiveVendors = () => [];
  w.getOrderRowsForVendor = () => [];
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

grupo('un ciclo de ayer habla como un ciclo de ayer');
{
  const w = entorno({ dias: 1 });
  const c = home(w);
  prueba('la tarjeta está', !!c);
  prueba('no dice los días que lleva', !/\d+ days/.test(c.textContent), c.textContent.slice(0, 90));
  prueba('y el segundo botón sigue siendo importar',
    /Import a file/.test(c.textContent), c.textContent.slice(0, 140));
  prueba('sin salida de emergencia', !/Start over/.test(c.textContent));

  const h = ciclo(w);
  prueba('la pantalla del ciclo tampoco la ofrece', !h.querySelector('#mcOtra'));
  // Pero importar sí está, siempre: es la otra forma de cargar el conteo.
  prueba('aunque importar sí', !!h.querySelector('#mcFile'));
}

grupo('uno de hace diez días, no');
{
  const w = entorno({ dias: 10 });
  const c = home(w);
  prueba('dice cuántos lleva', /10 days/.test(c.textContent), c.textContent.slice(0, 90));
  prueba('y que no se contó nada',
    /Nothing counted/.test(c.textContent), c.textContent.slice(0, 140));
  prueba('el segundo botón es la salida',
    /Start over/.test(c.textContent), c.textContent.slice(0, 160));
  // Contar sigue siendo lo correcto: no se le quita el sitio.
  prueba('contar sigue siendo el primario', /Count now/.test(c.textContent));
}

grupo('la salida pregunta antes, y dice que no se pierde nada');
{
  const w = entorno({ dias: 10 });
  const c = home(w);
  const b = Array.from(c.querySelectorAll('button'))
    .find(x => /Start over/.test(x.textContent));
  prueba('el botón existe', !!b);
  b.click();
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

grupo('y la pantalla del ciclo lleva la misma salida');
{
  const w = entorno({ dias: 10 });
  const h = ciclo(w);
  prueba('la ofrece', !!h.querySelector('#mcOtra'));
  prueba('con la explicación entera',
    /no count to lose/.test(h.textContent), h.textContent.slice(0, 400));
  // Importar no puede desaparecer: en la tarjeta le cede el sitio a
  // la salida, así que aquí tiene que estar.
  prueba('e importar sigue estando', !!h.querySelector('#mcFile'));
}

grupo('con un conteo en marcha, nada de esto aparece');
{
  // Hay trabajo hecho: ahí la salida no es empezar de nuevo, es
  // terminar o descartar el conteo.
  const w = entorno({ dias: 10, counting: true });
  const h = ciclo(w);
  prueba('no se ofrece empezar de nuevo', !h.querySelector('#mcOtra'));
  prueba('sino descartar el conteo', !!h.querySelector('#mcDrop'));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
