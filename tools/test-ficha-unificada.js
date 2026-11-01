#!/usr/bin/env node
/*
 * ── El mismo producto, la misma cabecera ────────────────────────────
 *
 * Buscar "Tito's" desde Home y abrirlo desde Inventory enseñaban dos
 * cosas distintas del mismo producto: una con silueta, número grande y
 * color de estado, la otra con dos renglones de texto gris. Dos
 * pantallas que aprender para la misma pregunta.
 *
 * Ahora las dos piden la cabecera a `src/product-hero.js`. Lo que NO
 * cambia es el tipo: Inventory sigue siendo una hoja que sube desde
 * abajo, porque el "Save and next" es lo que convierte 118
 * correcciones en una sesión y una pantalla completa por artículo se
 * lo cargaría.
 *
 * Lo que se protege:
 *
 *   1. Las dos pintan la MISMA cabecera, del mismo módulo.
 *   2. Inventory sigue siendo hoja, con todos sus controles.
 *   3. El on hand sigue sin poder tocarse desde ahí.
 *   4. La silueta mide contra el PAR, no contra la botella abierta.
 *   5. Ninguna de las dos vuelve a tener su propia copia.
 *
 *   node tools/test-ficha-unificada.js
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

const TITOS = {
  item: "Tito's Vodka", code: '2153', vendor: 'LOOP', category: 'Vodka',
  onHand: 7.3, suggested: 18, value: 27.99, bottleSizeMl: 750,
  bottleShape: '', itemNorm: "tito's vodka", toOrder: 11
};
const OTRO = {
  item: 'Absolut Citron', code: '2154', vendor: 'LOOP', category: 'Vodka',
  onHand: 0, suggested: 6, value: 19.5, bottleSizeMl: 750,
  itemNorm: 'absolut citron', toOrder: 6
};

function base() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.state = { master: [TITOS, OTRO].map(r => Object.assign({}, r)) };
  w.normalizeName = (s) => String(s || '').trim().toLowerCase();
  w.getVendorsForFilter = () => ['ALL', 'LOOP'];
  w.getVendorsWithUnknown = () => ['LOOP', 'BREAKTHRU', 'UNKNOWN'];
  w.parAdjustments = new Map();
  w.BarStockToast = { show() {} };
  w.scrollTo = () => {};

  // Los dos módulos DE VERDAD. Con un stub de product-hero esta prueba
  // no probaría nada: es justo la pieza que se comparte.
  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-profiles.js'), 'utf8'))();
  new Function(fs.readFileSync(path.join(RAIZ, 'src/product-hero.js'), 'utf8'))();
  return w;
}

// La ficha de búsqueda (desde Home).
function fichaBusqueda() {
  const w = base();
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {}, refrescarBadges() {} };
  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-search.js'), 'utf8'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'search';
  w.document.body.appendChild(host);
  def.mount(host);
  def.abrir ? def.abrir("Tito's Vodka") : null;

  // Si no hay atajo, se teclea y se pulsa el resultado.
  if (!host.querySelector('.m-fic')) {
    const inp = host.querySelector('#msQ') || host.querySelector('input');
    inp.value = "Tito"; inp.oninput && inp.oninput();
    const b = host.querySelector('[data-i]');
    if (b) b.onclick();
  }
  return { w, host, fic: host.querySelector('.m-fic') };
}

// La hoja de Inventory.
function hojaInventario() {
  const w = base();
  w.__guardados = [];
  w.bsSaveItemFields = async (idx, campos) => {
    w.__guardados.push({ idx, campos });
    Object.assign(w.state.master[idx], campos); return true;
  };
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {}, refrescarBadges() {} };
  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-inventory.js'), 'utf8'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'inventory';
  w.document.body.appendChild(host);
  def.mount(host);

  // Arranca en "needs fixing" y Tito's está completo, así que no sale.
  host.querySelector('[data-s="todo"]').click();

  const fila = Array.from(host.querySelectorAll('[data-i]'))
    .find(b => /Tito/.test(b.textContent));
  fila.onclick();
  const h = w.document.querySelector('.m-sheet');
  return { w, host, hoja: h, fic: h.querySelector('.m-fic') };
}

(() => {

grupo('las dos pantallas pintan la misma cabecera');
{
  const a = fichaBusqueda();
  const b = hojaInventario();
  prueba('la de búsqueda la tiene', !!a.fic);
  prueba('la hoja de Inventory también', !!b.fic);

  for (const [n, c] of [['búsqueda', a.fic], ['Inventory', b.fic]]) {
    prueba(n + ': dibuja la silueta', !!c.querySelector('.m-bot svg'));
    prueba(n + ': el número grande es el on hand',
      c.querySelector('.m-fic-big b').textContent.trim() === '7.3',
      c.querySelector('.m-fic-big b').textContent);
    prueba(n + ': y va contra el par',
      /of 18/.test(c.querySelector('.m-fic-big span').textContent),
      c.querySelector('.m-fic-big span').textContent);
    prueba(n + ': el nombre entero', /Tito/.test(c.querySelector('.m-fic-n').textContent));
  }

  // El color del estado tiene que salir igual en las dos, o el mismo
  // producto se vería sano en una pantalla y en apuros en la otra.
  const col = (c) => c.querySelector('.m-fic-big b').getAttribute('style');
  prueba('mismo color de estado en las dos', col(a.fic) === col(b.fic),
    col(a.fic) + ' vs ' + col(b.fic));
  prueba('y la misma clase de tono', a.fic.className === b.fic.className,
    a.fic.className + ' vs ' + b.fic.className);
}

grupo('pero sólo Inventory lleva el código, que es lo que casa facturas');
{
  const a = fichaBusqueda();
  const b = hojaInventario();
  prueba('la hoja lo enseña', /2153/.test(b.fic.querySelector('.m-fic-s').textContent),
    b.fic.querySelector('.m-fic-s').textContent);
  prueba('y la ficha de búsqueda no', !/2153/.test(a.fic.querySelector('.m-fic-s').textContent),
    a.fic.querySelector('.m-fic-s').textContent);
}

grupo('Inventory sigue siendo una hoja, con todo lo que se podía tocar');
{
  const { w, hoja } = hojaInventario();
  prueba('es hoja, no pantalla', !!hoja.querySelector('.m-sheet-box'));
  prueba('sube desde abajo', !!hoja.querySelector('.m-sheet-grip'));
  prueba('proveedores', !!hoja.querySelector('#miVend'));
  prueba('par', !!hoja.querySelector('#miPar'));
  prueba('precio', !!hoja.querySelector('#miVal'));
  prueba('guardar', !!hoja.querySelector('#miSave'));
  prueba('y guardar y siguiente', !!hoja.querySelector('#miNext'));

  // La regla de siempre: el on hand viene del escáner y de recibir
  // mercancía. Si una pantalla de edición lo toca, deja de poder
  // rastrearse de dónde salió cada número.
  const ids = Array.from(hoja.querySelectorAll('input')).map(i => i.id).sort();
  prueba('y el on hand NO se puede editar', ids.join('|') === 'miPar|miVal', ids.join('|'));

  hoja.querySelector('#miPar').value = '21';
  hoja.querySelector('#miSave').click();
  prueba('guardar sigue guardando', w.__guardados.length === 1,
    JSON.stringify(w.__guardados));
}

grupo('la silueta mide contra el par, no contra la botella abierta');
{
  // 7.3 de 18 es menos de la mitad. Si midiera la parte decimal —0.3—
  // el recorte caería casi abajo del todo y el medidor mentiría.
  const { fic } = hojaInventario();
  const y = Number(fic.querySelector('clipPath rect').getAttribute('y'));
  prueba('el recorte cae en la mitad de arriba', y > 116 * 0.4 && y < 116 * 0.75, 'y=' + y);
}

grupo('y ninguna de las dos guarda su propia copia');
{
  const search = fs.readFileSync(path.join(RAIZ, 'src/mobile-search.js'), 'utf8');
  const inv    = fs.readFileSync(path.join(RAIZ, 'src/mobile-inventory.js'), 'utf8');
  const hero   = fs.readFileSync(path.join(RAIZ, 'src/product-hero.js'), 'utf8');

  // La silueta es el trozo gordo y no se duplica en ningún cliente.
  prueba('la silueta vive sólo en product-hero',
    /V\.pathFor/.test(hero) && !/V\.pathFor/.test(search) && !/V\.pathFor/.test(inv));

  // Las dos pantallas PIDEN la cabecera al módulo.
  prueba('búsqueda se la pide al módulo', /BarStockProductHero/.test(search));
  prueba('Inventory también', /BarStockProductHero/.test(inv));

  // Cada una tiene respaldo por si el archivo no carga, y tiene que
  // ser eso: un respaldo detrás de una comprobación, no el camino
  // normal. `tono()` lo llama cada fila de la lista de búsqueda, así
  // que sin respaldo un fallo de carga tira la pantalla entera.
  prueba('y el respaldo va detrás de comprobar que el módulo está',
    /if \(H && H\.tono\)/.test(search) && /if \(H && H\.html\)/.test(search) &&
    /if \(H && H\.html\)/.test(inv));

  // Y se carga antes que sus dos clientes, o la primera ficha del día
  // se cae al respaldo de texto.
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const pos = (f) => html.indexOf(f);
  prueba('product-hero carga antes que mobile-search',
    pos('src/product-hero.js') < pos('src/mobile-search.js'));
  prueba('y antes que mobile-inventory',
    pos('src/product-hero.js') < pos('src/mobile-inventory.js'));
  prueba('y después de bottle-profiles, que es quien dibuja',
    pos('src/bottle-profiles.js') < pos('src/product-hero.js'));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
