#!/usr/bin/env node
/*
 * ── Contar por nombre, sin cámara ────────────────────────────────────
 *
 * Axel, 2026-11-23: "necesito una opción para hacer conteo sin
 * escanear, no abrir cámara, solo buscar item". Elegido sobre lámina:
 * "Count without the camera" opción B (se pregunta al empezar) y "Count
 * by name" orden 2 (la zona donde estás, primero), 2026-11-25.
 *
 * Lo que se protege:
 *   1. Un conteo nuevo pregunta: escanear o por nombre. Preguntar no
 *      abre la cámara.
 *   2. Por nombre, la cámara no se pide NUNCA: ni al abrir, ni al volver
 *      del panel, ni al volver de Finish count.
 *   3. La lista: lo que falta arriba (con zonas, primero lo de la zona
 *      donde estás la última vez), lo contado abajo con su número.
 *   4. Buscar filtra por palabras en cualquier orden, lo contado incluido.
 *   5. Tocar una botella abre el panel de conteo; al volver, la búsqueda
 *      se limpia, la botella pasa a Counted y un aviso con Undo lo dice.
 *      Undo la quita. Lo recontado no lleva Undo.
 *   6. La elección vale para el conteo: retomarlo abre por nombre sin
 *      preguntar. Un conteo de antes, sin modo, sigue escaneando.
 *   7. Escanear sigue igual: elegirlo enciende la cámara.
 *   8. El contador "N / M" se refresca solo (se perdió el 2026-11-25).
 *
 *   node tools/test-contar-por-nombre.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d !== undefined ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const MASTER = [
  { item: 'Aperol', vendor: 'Southern', bottleSizeMl: 750, onHand: 0, par: 2 },
  { item: 'Bulleit Bourbon', vendor: 'Southern', bottleSizeMl: 750, onHand: 0, par: 2 },
  { item: 'Bulleit Rye', vendor: 'Southern', bottleSizeMl: 750, onHand: 0, par: 2 },
  { item: 'Canyon Oaks Chardonnay', vendor: 'Wine Merchant', bottleSizeMl: 750, onHand: 0, par: 6 },
  { item: 'Campari', vendor: 'Southern', bottleSizeMl: 750, onHand: 0, par: 2, code: '0805' }
];

async function escenario({ sesion, zonas } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document; global.localStorage = w.localStorage;
  w.BARSTOCK_CONFIG = { ACCOUNT_ID: 'acct', LOCATION_NAME: 'Test', SUPABASE_URL: 'https://s.test', SUPABASE_KEY: 'k' };
  global.fetch = w.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => '' });
  w.state = { master: MASTER.map(r => Object.assign({}, r)) };
  w.eval('var state = window.state');
  if (sesion) w.localStorage.setItem('bs_count_acct__Test', JSON.stringify(sesion));

  let pedidas = 0;
  const pistas = [];
  Object.defineProperty(w, 'isSecureContext', { value: true });
  Object.defineProperty(w.navigator, 'mediaDevices', { value: { getUserMedia: async () => {
    pedidas++;
    const t = { vivo: true, stop() { this.vivo = false; }, getSettings: () => ({}), getCapabilities: () => ({}) };
    pistas.push(t);
    return { getTracks: () => [t], getVideoTracks: () => [t] };
  } } });
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
  w.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });   // jsdom no trae lienzo
  const intervalos = [];
  const si0 = globalThis.setInterval;
  globalThis.setInterval = (fn, ms, ...a) => { intervalos.push(ms); return si0(fn, ms, ...a); };

  for (const f of ['bottle-profiles.js', 'count-session.js', 'zones.js', 'count-panel.js', 'count-by-name.js', 'scan-count.js']) {
    new w.Function(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'))();
  }
  // El panel de conteo, sustituido: deja contar una botella a voluntad.
  let panel = null;
  w.BarStockCountPanel.open = (row, cb) => { panel = { row, cb }; };
  w.BarStockCountFinish = { open: (cb) => { panel = { cb }; } };
  if (zonas) {
    const Z = w.BarStockZones;
    Z.activas = () => true;
    Z.lista = () => ['Back bar', 'Cellar'];
    Z.cargar = async () => {};
    // paraPasada lee la lista por dentro, no por Z.lista: se sustituye también.
    Z.paraPasada = () => Z.activa() || 'Back bar';
    Z.ultimas = async () => new Map(Object.entries(zonas).map(([k, v]) => [k, new Set(v)]));
    Z.setActiva('Cellar');
  }
  return { w, pedidas: () => pedidas, vivas: () => pistas.filter(t => t.vivo).length, panel: () => panel, intervalos };
}

const esperar = () => new Promise(r => setTimeout(r, 40));
const textos = (w, sel) => [...w.document.querySelectorAll(sel)].map(x => x.textContent.replace(/\s+/g, ' ').trim());

(async () => {
  grupo('un conteo nuevo pregunta, y preguntar no abre la cámara');
  {
    const E = await escenario();
    await E.w.BarStockScanCount.open(); await esperar();
    const $ = (id) => E.w.document.getElementById(id);
    prueba('sale "How do you want to count?"', /How do you want to count/.test($('scElige').textContent));
    prueba('con "Scan barcodes" y "Search by name"', textos(E.w, '.sc-el-b b').join('|') === 'Scan barcodes|Search by name', textos(E.w, '.sc-el-b b').join('|'));
    prueba('sin pedir la cámara', E.pedidas() === 0, E.pedidas());
    prueba('el contador se refresca solo (cada 500 ms)', E.intervalos.includes(500), E.intervalos.join(','));

    grupo('por nombre: la lista, y la cámara nunca');
    [...E.w.document.querySelectorAll('.sc-el-b')].find(b => b.dataset.m === 'nombre').click(); await esperar();
    prueba('la elección queda en el conteo', E.w.BarStockCountSession.modo() === 'nombre');
    prueba('el visor es la lista', $('scOverlay').classList.contains('sc-por-nombre') && !!E.w.document.querySelector('.sc-bn-q'));
    prueba('sin zonas: "Left to count", de la A a la Z',
      textos(E.w, '.sc-bn-k span')[0] === 'Left to count' &&
      textos(E.w, '.sc-bn-it .sc-bn-nm').join('|') === 'Aperol|Bulleit Bourbon|Bulleit Rye|Campari|Canyon Oaks Chardonnay',
      textos(E.w, '.sc-bn-it .sc-bn-nm').join('|'));
    prueba('sigue sin cámara', E.pedidas() === 0, E.pedidas());

    grupo('buscar: palabras en cualquier orden');
    const q = E.w.document.querySelector('.sc-bn-q');
    q.value = 'bul'; q.dispatchEvent(new E.w.Event('input'));
    prueba('"bul" da los dos Bulleit', textos(E.w, '.sc-bn-it .sc-bn-nm').join('|') === 'Bulleit Bourbon|Bulleit Rye', textos(E.w, '.sc-bn-it .sc-bn-nm').join('|'));
    q.value = 'rye bulleit'; q.dispatchEvent(new E.w.Event('input'));
    prueba('"rye bulleit" da el Rye', textos(E.w, '.sc-bn-it .sc-bn-nm').join('|') === 'Bulleit Rye');

    grupo('tocar una botella, contarla y volver');
    q.value = 'bul'; q.dispatchEvent(new E.w.Event('input'));
    [...E.w.document.querySelectorAll('.sc-bn-it')].find(b => b.dataset.item === 'Bulleit Bourbon').click();
    prueba('abre el panel de esa botella', E.panel() && E.panel().row && E.panel().row.item === 'Bulleit Bourbon');
    E.w.BarStockCountSession.addPass('Bulleit Bourbon', 2, [0.4], 750, '');
    E.panel().cb(true); await esperar();
    prueba('la búsqueda se limpia', E.w.document.querySelector('.sc-bn-q').value === '');
    prueba('y el buscador recupera el foco (el teclado sigue abierto)',
      E.w.document.activeElement === E.w.document.querySelector('.sc-bn-q'));
    const k = textos(E.w, '.sc-bn-k span');
    prueba('pasa a "Counted" con su número',
      k.includes('Counted') && textos(E.w, '.sc-bn-it.hecho .sc-bn-nm').join('|') === 'Bulleit Bourbon' &&
      textos(E.w, '.sc-bn-it.hecho .sc-bn-n').join('|') === '✓ 2.4', textos(E.w, '.sc-bn-it.hecho').join('|'));
    prueba('y ya no está en lo que falta', !textos(E.w, '.sc-bn-it:not(.hecho) .sc-bn-nm').includes('Bulleit Bourbon'));
    const av = E.w.document.querySelector('.sc-bn-aviso');
    prueba('un aviso "✓ Bulleit Bourbon · 2.4" con Undo', av.classList.contains('on') && /Bulleit Bourbon · 2\.4/.test(av.textContent) && !!av.querySelector('.sc-bn-undo'));
    prueba('el aviso va justo bajo el buscador (abajo lo taparía el teclado)',
      av.previousElementSibling && av.previousElementSibling.classList.contains('sc-bn-fila'));
    prueba('volver del panel no enciende la cámara', E.pedidas() === 0, E.pedidas());
    av.querySelector('.sc-bn-undo').click(); await esperar();
    prueba('Undo la quita del conteo', !E.w.BarStockCountSession.has('Bulleit Bourbon'));
    prueba('y vuelve a lo que falta', textos(E.w, '.sc-bn-it:not(.hecho) .sc-bn-nm').includes('Bulleit Bourbon'));

    grupo('recontar no lleva Undo; volver sin contar no avisa');
    E.w.BarStockCountSession.addPass('Campari', 1, [], 750, '');
    [...E.w.document.querySelectorAll('.sc-bn-it')].find(b => b.dataset.item === 'Campari').click();
    E.w.BarStockCountSession.addPass('Campari', 1, [], 750, '');
    E.panel().cb(true); await esperar();
    prueba('recontado: aviso sin Undo', /Campari · 2/.test(av.textContent) && !av.querySelector('.sc-bn-undo'));
    E.w.document.querySelector('.sc-bn-q').blur();
    [...E.w.document.querySelectorAll('.sc-bn-it')].find(b => b.dataset.item === 'Aperol').click();
    E.panel().cb(false); await esperar();
    prueba('elegida de la lista, sin buscar: no se abre el teclado',
      E.w.document.activeElement !== E.w.document.querySelector('.sc-bn-q'));
    prueba('"Back" sin contar: el aviso no habla de Aperol', !/Aperol/.test(av.textContent));

    grupo('Finish count, de ida y vuelta, sin cámara');
    E.w.document.getElementById('scFinish').click();
    E.panel().cb(); await esperar();
    prueba('ninguna cámara pedida en el conteo por nombre (sin escanear)', E.pedidas() === 0, E.pedidas());

    grupo('escanear UNA botella desde la lista (lámina "Scan from the list", A)');
    const esc = E.w.document.querySelector('.sc-bn-esc');
    prueba('la barra de búsqueda lleva el botón de escanear', !!esc);
    // Lámina "Scan button options", A: AL LADO de la barra, no dentro
    // (dentro se encimaba con su borde), y con el cristal azul de la app
    // —la misma regla de mobile-app.css, no una copia—.
    prueba('el botón va al lado del buscador, no dentro', !!esc && !esc.closest('.sc-bn-busca') &&
      esc.parentElement === E.w.document.querySelector('.sc-bn-busca').parentElement);
    {
      const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8');
      const azul = css.slice(css.indexOf('EXACTAMENTE el mismo cristal azul'));
      prueba('con el cristal de la app (la misma regla)', /#scBnEsc/.test(css.slice(css.indexOf('── Cristal ──'), css.indexOf('── La barra de cristal'))));
      prueba('teñido del azul de Done (la misma regla)', /#scBnEsc/.test(azul.slice(0, azul.indexOf('{'))));
    }
    esc && esc.click(); await esperar();
    prueba('lo toca: la cámara se enciende', E.pedidas() === 1 && E.vivas() === 1, E.pedidas());
    prueba('y el visor es la cámara, con "← List"', $('scOverlay').classList.contains('sc-una') &&
      !$('scOverlay').classList.contains('sc-por-nombre') && !!$('scALista'));
    $('scALista') && $('scALista').click(); await esperar();
    prueba('"← List" sin escanear: cámara apagada', E.vivas() === 0, E.vivas());
    prueba('y de vuelta en la lista', $('scOverlay').classList.contains('sc-por-nombre') && !$('scOverlay').classList.contains('sc-una'));
    esc && esc.click(); await esperar();
    E.w.BarStockScanCount.__leer && E.w.BarStockScanCount.__leer('0805');
    prueba('leer un código abre el panel de esa botella', E.panel() && E.panel().row && E.panel().row.item === 'Campari');
    prueba('con la cámara apagada mientras se cuenta', E.vivas() === 0, E.vivas());
    E.panel().cb(true); await esperar();
    prueba('al cerrar el panel: vuelve a la lista', $('scOverlay').classList.contains('sc-por-nombre') && !$('scOverlay').classList.contains('sc-una'));
    prueba('y la cámara sigue apagada', E.vivas() === 0, E.vivas());
    prueba('el conteo sigue por nombre', E.w.BarStockCountSession.modo() === 'nombre');
    const yaPedidas = E.pedidas();

    grupo('cerrar y volver a abrir: sigue por nombre, sin preguntar');
    E.w.BarStockScanCount.close();
    await E.w.BarStockScanCount.open(); await esperar();
    prueba('no pregunta', !/How do you want/.test(E.w.document.getElementById('scElige').textContent));
    prueba('abre la lista', E.w.document.getElementById('scOverlay').classList.contains('sc-por-nombre'));
    prueba('y sin cámara', E.pedidas() === yaPedidas, E.pedidas());
  }

  grupo('con zonas: primero lo de la zona donde estás (orden 2)');
  {
    const E = await escenario({ zonas: { 'Canyon Oaks Chardonnay': ['Cellar'], Campari: ['Back bar', 'Cellar'], Aperol: ['Back bar'] } });
    E.w.BarStockCountSession.setModo('nombre');
    await E.w.BarStockScanCount.open(); await esperar(); await esperar();
    const k = textos(E.w, '.sc-bn-k');
    prueba('"In the Cellar last time · 2" y luego "Everything else left · 3"',
      k[0] === 'In the Cellar last time2' && k[1] === 'Everything else left3', k.join(' / '));
    prueba('arriba lo del Cellar, de la A a la Z', textos(E.w, '.sc-bn-it .sc-bn-nm').slice(0, 2).join('|') === 'Campari|Canyon Oaks Chardonnay',
      textos(E.w, '.sc-bn-it .sc-bn-nm').join('|'));
    E.w.BarStockZones.setActiva('Back bar'); await esperar();
    prueba('cambiar de zona reordena', textos(E.w, '.sc-bn-k')[0] === 'In the Back bar last time2' &&
      textos(E.w, '.sc-bn-it .sc-bn-nm').slice(0, 2).join('|') === 'Aperol|Campari', textos(E.w, '.sc-bn-k').join(' / '));
  }

  grupo('escanear sigue igual, y un conteo de antes no pregunta');
  {
    const E = await escenario();
    await E.w.BarStockScanCount.open(); await esperar();
    [...E.w.document.querySelectorAll('.sc-el-b')].find(b => b.dataset.m === 'escaner').click(); await esperar();
    prueba('elegir escanear enciende la cámara', E.pedidas() === 1 && E.vivas() === 1, E.pedidas());
    prueba('y queda escaneando', E.w.BarStockCountSession.modo() === 'escaner' && !E.w.document.getElementById('scOverlay').classList.contains('sc-por-nombre'));
  }
  {
    const E = await escenario({ sesion: { startedAt: '2026-11-22T22:00:00Z', items: { Campari: { passes: [{ sealed: 1, opens: [], sizeMl: 750 }] } } } });
    await E.w.BarStockScanCount.open(); await esperar();
    prueba('conteo empezado sin modo: escanea sin preguntar', E.pedidas() === 1 && !/How do you want/.test(E.w.document.getElementById('scElige').textContent), E.pedidas());
  }

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
