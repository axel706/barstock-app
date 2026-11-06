#!/usr/bin/env node
/*
 * ── "Do we have…": los resultados son tarjetas ───────────────────────
 *
 * La lista eran filas de texto (nombre, proveedor y zonas, la cifra a la
 * derecha). Axel pidió que cada resultado sea la MISMA tarjeta de la
 * ficha —botella, cifra con su color, "Runs out in…"— y, de las dos
 * variantes dibujadas, eligió la que lleva las ZONAS en el hueco de la
 * derecha. La gráfica de semanas se queda en la ficha, como estaba.
 *
 * Lo que se protege:
 *
 *   1. Cada resultado es la tarjeta de product-hero, y al tocarla se
 *      abre la ficha de ese producto, igual que antes.
 *   2. En la lista, el hueco lleva las zonas, no la gráfica: la gráfica
 *      es una consulta por producto y en una lista serían decenas.
 *   3. La ficha sigue pidiendo y pintando la gráfica.
 *   4. Las zonas se piden según las tarjetas aparecen en pantalla: con
 *      tarjetas caben 2 o 3, y el corte fijo en los 6 primeros dejaba el
 *      hueco vacío a partir del 7.º. Sin IntersectionObserver, los 6
 *      primeros, como antes.
 *   5. Con las zonas apagadas el hueco queda vacío: ni zonas ni gráfica.
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

grupo('en la lista, las zonas; en la ficha, la grafica');
{
  const { w, host } = entorno();
  await esperar(30);
  const g = host.querySelector('#msList .m-res .m-fic-g');
  const txt = g ? g.textContent.replace(/\s+/g, ' ') : '';
  prueba('el hueco lleva las zonas', /1 Closet/.test(txt) && /0\.55 Main Bar/.test(txt), txt);
  prueba('y no la grafica', !host.querySelector('#msList .m-fic-gb'));
  prueba('la lista no pide semanas', w.__semanas.length === 0, String(w.__semanas.length));

  host.querySelector('#msList .m-res').click();
  await esperar(30);
  const hoja = w.document.querySelector('#mSheet');
  prueba('tocarla abre la ficha de ese producto', !!hoja && /Tequila Blanco 0/.test(hoja.textContent));
  prueba('y la ficha pinta su grafica, como antes', w.__semanas.includes('Tequila Blanco 0') && !!hoja.querySelector('.m-fic-gb'));
}

grupo('las zonas se piden segun aparecen');
{
  const { w } = entorno({ observador: true });
  await esperar(40);
  prueba('con IntersectionObserver, tambien las del 7.º en adelante', w.__zonasPedidas.length === 10, String(w.__zonasPedidas.length));
}
{
  const { w } = entorno();
  await esperar(40);
  prueba('sin el, las 6 primeras, como antes', w.__zonasPedidas.length === 6, String(w.__zonasPedidas.length));
}

grupo('con las zonas apagadas, el hueco queda vacio');
{
  const { host } = entorno({ zonasApagadas: true });
  await esperar(30);
  const g = host.querySelector('#msList .m-res .m-fic-g');
  prueba('sin zonas ni grafica', !g || !g.textContent.trim(), g && g.textContent);
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

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
