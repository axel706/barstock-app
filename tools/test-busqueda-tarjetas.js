#!/usr/bin/env node
/*
 * ── "Do we have…": los resultados son tarjetas ───────────────────────
 *
 * La lista eran filas de texto (nombre, proveedor y zonas, la cifra a la
 * derecha). Axel pidió que cada resultado sea la MISMA tarjeta de la
 * ficha —botella, cifra con su color, "Runs out in…"—. Llevaba las ZONAS
 * en el hueco de la derecha hasta el LIVE (Axel, 2026-11-11): con "≈1.4"
 * en grande, las zonas suman lo contado y la tarjeta se contradecía.
 * Ahora van sólo en la ficha (test-ficha-live.js). La gráfica de semanas
 * se queda en la ficha, como estaba.
 *
 * Lo que se protege:
 *
 *   1. Cada resultado es la tarjeta de product-hero, y al tocarla se
 *      abre la ficha de ese producto, igual que antes.
 *   2. En la lista, ni zonas ni gráfica: la lista no las pide.
 *   3. La ficha sigue pidiendo y pintando la gráfica, y las zonas.
 *
 *   node tools/test-busqueda-tarjetas.js
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
const esperar = ms => new Promise(r => setTimeout(r, ms));

function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  new Function(leer('src/bottle-profiles.js'))();
  new Function(leer('src/product-hero.js'))();
  w.state = { master: [] };
  for (let i = 0; i < 10; i++) {
    w.state.master.push({ item: 'Tequila Blanco ' + i, vendor: 'LOOP', code: 'C' + i, category: 'Tequila',
      onHand: i === 0 ? 0.85 : 3, suggested: 4, value: 20, bottleShape: 'vodka', bottleSizeMl: 750 });
  }
  w.normalizeName = (s) => String(s || '').toLowerCase();
  w.parAdjustments = new Map();
  w.__zonasPedidas = [];
  w.BarStockZones = o.zonasApagadas
    ? { lista: () => [], cargar: async () => {}, activas: () => false, donde: async () => null }
    : { lista: () => [{}], cargar: async () => {}, activas: () => true,
        donde: async (item) => { w.__zonasPedidas.push(item);
          return { zonas: [{ zona: 'Closet', botellas: 1 }, { zona: 'Main Bar', botellas: 0.55 }], at: Date.now() }; } };
  w.__semanas = [];
  w.BarStockProductWeeks = { semanas: async (item) => { w.__semanas.push(item);
    return [{ usado: 2 }, { usado: 3 }, { usado: 1 }]; }, rumbo: () => ({ d: -0.5 }) };
  if (o.observador) {
    // Un IntersectionObserver de mentira que da todo por visible al
    // observarlo: lo que se prueba es que se USA, no la geometría.
    w.IntersectionObserver = function (cb) {
      const o = { observe: (el) => cb([{ isIntersecting: true, target: el }], o), unobserve() {}, disconnect() {} };
      return o;
    };
  }
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {} };
  new Function(leer('src/mobile-search.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'search';
  w.document.body.appendChild(host);
  def.mount(host);
  const inp = host.querySelector('#msInput');
  inp.value = 'blanco'; inp.oninput();
  return { w, host };
}

(async () => {

grupo('cada resultado es la tarjeta de la ficha');
{
  const { w, host } = entorno();
  await esperar(30);
  const tarjetas = host.querySelectorAll('#msList .m-res');
  prueba('diez resultados, diez tarjetas', tarjetas.length === 10, String(tarjetas.length));
  const t = tarjetas[0];
  prueba('con la tarjeta de product-hero dentro', !!t && !!t.querySelector('.m-fic'));
  prueba('con su botella', !!t && !!t.querySelector('.m-bot svg path'));
  prueba('con su cifra y su color', !!t && /0\.85/.test(t.querySelector('.m-fic-big').textContent) &&
    /#f87171/.test(t.querySelector('.m-fic-big b').getAttribute('style') || ''));
  prueba('y su nombre', !!t && /Tequila Blanco 0/.test(t.querySelector('.m-fic-n').textContent));
}

grupo('en la lista, nada; en la ficha, las zonas y la grafica');
{
  const { w, host } = entorno({ observador: true });
  await esperar(30);
  prueba('la tarjeta no lleva hueco', !host.querySelector('#msList .m-res .m-fic-g'));
  prueba('ni zonas', !/Closet/.test(host.querySelector('#msList').textContent));
  prueba('la lista no pide zonas', w.__zonasPedidas.length === 0, String(w.__zonasPedidas.length));
  prueba('ni semanas', w.__semanas.length === 0, String(w.__semanas.length));

  host.querySelector('#msList .m-res').click();
  await esperar(30);
  const hoja = w.document.querySelector('#mSheet');
  prueba('tocarla abre la ficha de ese producto', !!hoja && /Tequila Blanco 0/.test(hoja.textContent));
  prueba('la ficha pinta su grafica, como antes', w.__semanas.includes('Tequila Blanco 0') && !!hoja.querySelector('.m-fic-gb'));
  prueba('y sus zonas', /Closet/.test((hoja.querySelector('#msZonas') || {}).textContent || ''));
}

grupo('la tarjeta no va dentro de otra');
{
  // El envoltorio lleva `m-res` y con eso heredaba el fondo, el borde y
  // el relleno de la fila vieja: salía una tarjeta dentro de otra. Lo
  // vio la captura, no un test; ahora lo vigila éste.
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'styles', 'mobile-app.css'), 'utf8');
  const m = /body\.m-shell \.m-res\.m-res-fic\s*\{([^}]*)\}/.exec(css);
  const r = m ? m[1] : '';
  prueba('hay regla que gana a body.m-shell .m-res', !!m);
  prueba('sin fondo', /background:\s*none/.test(r), r);
  prueba('sin borde', /border:\s*0/.test(r), r);
  prueba('sin relleno', /padding:\s*0/.test(r), r);
}

grupo('la barra de "Do we have", de cristal');
{
  // Axel, 2026-11-13, opción A: el mismo cristal de Time Machine, la
  // campana y el escáner, sólo en "Do we have" (Home) y en Buscar.
  const home = leer('src/mobile-home.js'), bus = leer('src/mobile-search.js');
  prueba('la del Home y la de Buscar llevan .m-vidrio',
    /class="m-searchbar m-vidrio" id="mhSearch"/.test(home) && /class="m-searchbar on m-vidrio"/.test(bus));
  const css = leer('styles/mobile-app.css').replace(/\/\*[\s\S]*?\*\//g, '');
  // La MISMA regla que los botones, no una copia: si se toca el cristal,
  // cambian los dos.
  const m = /body\.m-shell #mBand \.m-ico:not\(\.m-ico-alert\),\s*body\.m-shell :is\(#mScreens, #mDock\) \.m-searchbar\.m-vidrio(?:,[^{]*)?\s*\{([^}]*)\}/.exec(css);
  prueba('comparte la regla de cristal de los botones', !!m && /backdrop-filter: blur\(10px\)/.test(m[1]));
  // Con su id, un `position` ahí le ganaba al absolute de la copia
  // acoplada y al fixed de Buscar.
  prueba('y esa regla no pone position', !!m && !/position/.test(m[1]), m && m[1]);
  prueba('acoplada o fija, sin desenfoque propio (ya está la escalera)',
    /#mDock \.m-searchbar\.m-vidrio,\s*body\.m-shell #mScreens \.m-searchbar\.m-vidrio\.m-dock-fija \{\s*-webkit-backdrop-filter: none; backdrop-filter: none;/.test(css));
  prueba('ninguna otra barra de búsqueda la lleva', (leer('src/mobile-sales.js') + leer('src/mobile-inventory.js')).indexOf('m-vidrio') < 0);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
