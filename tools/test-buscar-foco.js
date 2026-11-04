#!/usr/bin/env node
/*
 * ── Abrir un producto desde Top movers no abre el teclado ─────────────
 *
 * Tocar un producto en Top movers entra a Buscar y le abre la ficha
 * (`abrirItem`). Buscar, al mostrarse, pone el foco en su campo a
 * propósito: así, quien entra a buscar tiene el teclado con el primer
 * toque. Pero aquí nadie va a escribir: la ficha se abría encima y el
 * teclado del buscador de detrás se quedaba abierto, tapando media
 * ficha.
 *
 * Lo que se protege:
 *
 *   1. Entrar por abrirItem no deja el foco en el buscador.
 *   2. Entrar a Buscar normalmente lo sigue poniendo, en el mismo gesto
 *      (sin setTimeout), que es lo que hace que iOS saque el teclado.
 *   3. Una vez abierta una ficha así, volver a entrar a Buscar a mano
 *      vuelve a dar el teclado: el "sin teclado" no se queda pegado.
 *
 *   node tools/test-buscar-foco.js
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

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

function entorno() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  for (const f of ['bottle-profiles', 'product-hero']) {
    new Function(fs.readFileSync(path.join(RAIZ, 'src/' + f + '.js'), 'utf8'))();
  }
  w.state = { master: [
    { item: 'White Haven Sauvignon Blanc', vendor: 'BREAKTHRU', category: 'Wine', onHand: 16.25,
      suggested: 24, value: 11.89, bottleSizeMl: 750 },
    { item: "Tito's Vodka", vendor: 'LOOP', category: 'Vodka', onHand: 12, suggested: 12, value: 26 }
  ] };
  w.normalizeName = (s) => String(s || '').toLowerCase();
  w.parAdjustments = new Map();
  w.BarStockZones = { lista: () => [], cargar: async () => {}, activas: () => false, donde: async () => null };

  // El armazón, como el de verdad: monta la pantalla la primera vez y
  // llama a show() cada vez que se entra, todo dentro del mismo toque.
  let def = null, host = null;
  w.BarStockMobile = {
    register(d) { def = d; },
    ir(id) {
      if (id !== 'search') return;
      if (!host) {
        host = w.document.createElement('div');
        host.className = 'm-screen on'; host.dataset.screen = 'search';
        w.document.body.appendChild(host);
        def.mount(host);
      }
      def.show(host);
    }
  };
  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-search.js'), 'utf8'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return w;
}

const enfocado = (w) => {
  const a = w.document.activeElement;
  return a && a.id ? a.id : (a ? a.tagName : 'nada');
};

grupo('desde Top movers, la ficha sin teclado');
{
  const w = entorno();
  w.BarStockMobileSearch.abrirItem('White Haven Sauvignon Blanc');
  prueba('la ficha se abre', /White Haven/.test(w.document.body.textContent));
  prueba('y el buscador no tiene el foco', enfocado(w) !== 'msInput', enfocado(w));
}

grupo('entrar a buscar sigue dando el teclado');
{
  const w = entorno();
  w.BarStockMobile.ir('search');
  prueba('el foco va al buscador', enfocado(w) === 'msInput', enfocado(w));
}
{
  // El "sin teclado" de abrirItem es de una sola vez.
  const w = entorno();
  w.BarStockMobileSearch.abrirItem('White Haven Sauvignon Blanc');
  w.document.activeElement && w.document.activeElement.blur && w.document.activeElement.blur();
  w.BarStockMobile.ir('search');
  prueba('despues de una ficha, buscar a mano vuelve a dar el teclado', enfocado(w) === 'msInput', enfocado(w));
}

grupo('el foco sigue sin setTimeout');
{
  // iOS sólo abre el teclado si el focus() ocurre dentro del gesto. Con
  // un setTimeout el teclado no salía y hacía falta un segundo toque.
  const src = fs.readFileSync(path.join(RAIZ, 'src/mobile-search.js'), 'utf8');
  const i = src.indexOf('  function show(host) {');
  const cuerpo = src.slice(i, src.indexOf('\n  }\n', i));
  prueba('show() enfoca directamente', /inp\.focus\(\)/.test(cuerpo) && !/setTimeout/.test(cuerpo.replace(/\/\/.*$/gm, '')));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
