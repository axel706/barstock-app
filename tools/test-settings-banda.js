#!/usr/bin/env node
/*
 * ── Settings: el nombre de la sección en la banda ────────────────────
 *
 * Axel, 2026-11-11, opción 1 de la lámina, "en todas las subsecciones":
 * dentro de una subsección de Settings el nombre ocupa el sitio del logo
 * y el botón redondo de la izquierda pasa a ser "atrás". Lo que se
 * protege, con el armazón DE VERDAD (mobile-shell.js), no uno de mentira:
 *   1. En una subsección: el nombre en la banda, el logo fuera, el botón
 *      de atrás en la banda, y la página sin título ni chevron propios.
 *   2. Ese atrás funciona en cada nivel (la ficha de un proveedor vuelve
 *      a la lista, la lista a Settings).
 *   3. La raíz de Settings no cambia: su cabecera con chevron, y la
 *      banda con el logo.
 *   4. Cambiar de pantalla devuelve la banda: el nombre de una sección
 *      no puede quedarse en el Home.
 *   5. La CSS: el atrás y Time Machine se enseñan uno u otro, con el
 *      prefijo de id que gana a .m-ico.
 *
 *   node tools/test-settings-banda.js
 */
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

function montar() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/', runScripts: 'outside-only' });
  const w = dom.window;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  w.scrollTo = () => {};
  w.CSS = { escape: (s) => String(s) };
  w.BarStockEvents = { on() {}, emit() {} };
  w.BARSTOCK_CONFIG = { LOCATION_NAME: 'The Crown Tavern' };
  w.getActiveVendors = () => ['LOOP', 'BREAKTHRU'];
  w.BarStockVendorDefaults = { getDefaults: async () => ({}), saveDefaults: async () => true };
  w.eval(leer('src/dialog.js'));
  w.eval(leer('src/mobile-shell.js'));
  w.eval(leer('src/vendor-delivery.js'));
  w.eval(leer('src/mobile-settings.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.BarStockMobile.register({ id: 'home', icon: 'ti-home', label: 'Home', tab: true, orden: 1, mount(h) { h.innerHTML = '<div class="home">Home</div>'; } });
  return w;
}

(async () => {
  const w = montar();
  const M = w.BarStockMobile;
  const banda = () => w.document.getElementById('mBand');
  const caja = () => w.document.querySelector('.m-screen[data-screen="settings"]');
  const nombre = () => (banda().querySelector('.m-band-seccion') || {}).textContent || '';
  const enSeccion = () => banda().classList.contains('m-en-seccion');

  M.ir('home'); M.ir('settings'); await esperar(10);
  // La raíz también (Axel, 2026-11-11: "settings debe tener la misma
  // apariencia que las otras subsecciones").
  prueba('la raíz de Settings: "Settings" en la banda', enSeccion() && nombre() === 'Settings', nombre());
  prueba('sin cabecera propia en la página', !caja().querySelector('#mAtras') && !caja().querySelector('.m-inv-t'));

  caja().querySelector('[data-p="delivery"]').click(); await esperar(10);
  prueba('Delivery: el nombre en la banda', enSeccion() && nombre() === 'Delivery', nombre());
  prueba('con el botón de atrás en la banda', !!banda().querySelector('#mBandAtras'));
  prueba('y la página sin título ni chevron propios', !caja().querySelector('#mAtras') && !caja().querySelector('.m-inv-t'));
  prueba('la línea que explica la sección sigue', /Live adds it from that moment/.test(caja().textContent));

  caja().querySelector('[data-v="LOOP"]').click(); await esperar(20);
  w.document.querySelector('#mSheet #msEntFicha').click(); await esperar(20);
  prueba('la ficha del proveedor: su nombre en la banda', nombre() === 'LOOP', nombre());
  banda().querySelector('#mBandAtras').click(); await esperar(10);
  prueba('atrás desde la ficha vuelve a la lista', nombre() === 'Delivery' && !!caja().querySelector('[data-v="LOOP"]'));
  banda().querySelector('#mBandAtras').click(); await esperar(10);
  prueba('atrás desde la lista vuelve a Settings', nombre() === 'Settings' && !!caja().querySelector('[data-p="delivery"]'));

  for (const id of ['zones', 'size', 'emails']) {
    const b = caja().querySelector('[data-p="' + id + '"]');
    if (!b) { prueba(id + ': existe', false); continue; }
    b.click(); await esperar(10);
    prueba(id + ': también en la banda', enSeccion() && nombre().length > 0 && !caja().querySelector('#mAtras'), nombre());
    banda().querySelector('#mBandAtras').click(); await esperar(10);
  }

  banda().querySelector('#mBandAtras').click(); await esperar(10);
  prueba('atrás desde la raíz sale de Settings y devuelve el logo', !enSeccion() && M.activa() === 'home', M.activa());

  M.ir('settings'); await esperar(10);
  caja().querySelector('[data-p="delivery"]').click(); await esperar(10);
  M.ir('home'); await esperar(10);
  prueba('ir a otra pantalla devuelve la banda', !enSeccion());

  const css = leer('styles/mobile-app.css');
  prueba('CSS: atrás escondido fuera de una sección', /body\.m-shell #mBand #mBandAtras \{ display: none; \}/.test(css));
  prueba('CSS: en una sección, atrás sí y Time Machine no', /#mBand\.m-en-seccion #mBandAtras \{ display: flex; \}/.test(css) && /#mBand\.m-en-seccion #mTime \{ display: none; \}/.test(css));
  prueba('CSS: el logo se va y el nombre entra', /\.m-band\.m-en-seccion \.m-logo \{ opacity: 0; \}/.test(css) && /\.m-band\.m-en-seccion \.m-band-seccion \{ opacity: 1; \}/.test(css));

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
