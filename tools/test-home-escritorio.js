#!/usr/bin/env node
/*
 * ── El Home del escritorio (Axel, 2026-11-25, lámina H1) ─────────────
 *
 * Lo que se protege:
 *
 *   1. Los datos son los del Home del teléfono: las cifras salen de UNA
 *      función (cifras() de mobile-home) que pintan los dos, y el
 *      escritorio no calcula nada por su lado.
 *   2. Las cuatro cifras son la PRIMERA fila, en su orden, y la cuarta
 *      es Live vs count; un fallo al leerla se dice con lo que pasó.
 *   3. La tarjeta de ahora es la que la semana pone primera; el
 *      transfer va a su lado.
 *   4. Nada lleva a una pantalla que el escritorio no tiene: Running out
 *      sin "See them" ni "To buy", el transfer sin "Choose yours" ni
 *      "Change", y sin el icono de Cycle detail.
 *   5. Los botones llaman a lo de siempre (go, go2, el proveedor).
 *   6. Los reportes de la portada se MUEVEN con su id y sobreviven a cada
 *      repintado (los escribe focus-stats.js).
 *   7. No se ve con una sección abierta.
 *   8. Una pantalla del teléfono pedida en el escritorio abre su sección.
 *   9. Los colores de los tonos son variables de :root compartidas,
 *      nunca copiadas, y el orden de carga.
 *
 *   node tools/test-home-escritorio.js
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
const espera = (ms) => new Promise(r => setTimeout(r, ms || 0));

const INDEX = leer('index.html');
const MH = leer('src/mobile-home.js');
const DH = leer('src/desk-home.js');
const CSS_DH = leer('styles/desk-home.css');
const CSS_M = leer('styles/mobile-app.css');

grupo('1. Las cifras se deciden en un solo sitio');
prueba('mobile-home tiene cifras()', /function cifras\(\)/.test(MH));
prueba('el teléfono las pinta desde cifras()', /function pintarCifras[\s\S]{0,200}cifras\(\)/.test(MH));
prueba('el escritorio las recibe de cifras() por datos()', /function datos\(\)[\s\S]{0,300}cifras\(\)\.partes/.test(MH));
prueba('desk-home no lee los módulos de dinero por su cuenta',
  !/BarStockInventoryValue|BarStockSpend|calcularPrecios|\.dinero\(\)/.test(DH));

// ── El escenario ────────────────────────────────────────────────────
const dom = new JSDOM(`<!doctype html><body class="dk"><div class="wrap">
  <div id="bsFocusGrid">
    <div id="fgSub-pourIq">6 adjustments ready</div><div id="fgStats-pourIq">PI</div>
    <div id="fgSub-costReport">No report for last week</div><div id="fgStats-costReport"><button id="cta">Report last week</button></div>
    <div id="fgSub-consumption">x</div><div id="fgStats-consumption">CM</div>
    <div id="fgSub-noMatch">y</div><div id="fgStats-noMatch">NM</div>
  </div>
  <div class="card section-card" id="vendorSection"></div>
</div></body>`, { url: 'https://x.test/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
const D = w.document;
Object.defineProperty(w, 'innerWidth', { value: 1440, configurable: true });

const llamadas = [];
let cards = [];
let diag = null;
const cifras = [
  { id: 'estante', k: 'On the shelf', v: '$18,420', d: 'Live now', btn: 'Details' },
  { id: 'ayer', k: 'Sold today', v: '$1,640', d: 'so far today', btn: 'Sync' },
  { id: 'gasto', k: 'Spent this cycle', v: '$6,880', d: '3 to fix', btn: 'Review' }
];
let oyente = null;
w.BarStockMobileHome = {
  datos: () => ({ saludo: 'Hello, Axel', tarjetas: cards, cifras, ventas: null }),
  alCambiar: (fn) => { oyente = fn; },
  vigilar: () => {},
  detalleEstante: () => llamadas.push('detalle'),
  sincronizarHoy: () => llamadas.push('sync')
};
w.BarStockLiveDiag = { semana: () => diag instanceof Error ? Promise.reject(diag) : Promise.resolve(diag) };
w.BarStockRunningOut = { lista: () => [{ r: { item: 'Cointreau', suggested: 2 }, item: 'Cointreau', vivo: true, out: { txt: 'Out Thu', tono: 'r' } }] };
w.BarStockLiveCache = { cuanto: () => 0.8, pedir: () => 2 };
w.bsOpenSection = (n) => { llamadas.push('open:' + n); D.querySelector('.wrap').classList.add('bs-focus-mode'); };

const C = (o) => Object.assign({ go: () => llamadas.push('go:' + o.k), go2: () => llamadas.push('go2:' + o.k) }, o);
cards = [
  C({ transfer: true, tono: 'blue', k: 'Transfer', tt: '12 Triage', btn: 'Choose yours', btn2: 'Not right', btn3: 'Change', goB3: () => llamadas.push('cambiar') }),
  C({ fase: 'agota', tono: 'red', k: 'Running out first', tt: '1 runs out', btn: 'See them', btn2: 'To buy · 2' }),
  C({ ciclo: true, tono: 'teal', k: 'Cycle open', tt: 'Count Sunday', btn: 'Restart', btn2: 'Skip week', ico: 'list-details', go3: () => llamadas.push('ciclo') }),
  C({ fase: 'ordenes', tono: 'blue', k: 'Orders waiting', tt: '2 vendors', btn: 'Review all',
      prov: [{ nombre: 'Southern', d: '9 lines', go: () => llamadas.push('prov:Southern') }] })
];
diag = { hay: true, fin: '2026-11-22', total: 3, corto: 412, sobra: 96, provisional: false };

w.eval(DH);
const H = () => D.getElementById('dkHome');

(async () => {
  await espera(30);

  grupo('2. Las cuatro cifras, primera fila');
  prueba('el Home se monta', !!H());
  const primero = H() && H().firstElementChild;
  prueba('lo primero del Home son las cifras', !!primero && primero.classList.contains('dkh-cifras'));
  prueba('el saludo no va en el Home (va en la barra de arriba)', !/saludo/.test(H().innerHTML));
  const ks = [...H().querySelectorAll('.dkh-cf-k > span')].map(e => e.textContent.trim());
  prueba('en su orden: shelf, sold, spent, Live vs count',
    JSON.stringify(ks) === JSON.stringify(['On the shelf', 'Sold today', 'Spent this cycle', 'Live vs count']), JSON.stringify(ks));
  const diagTxt = () => H().querySelectorAll('.dkh-cf')[3].textContent.replace(/\s+/g, ' ');
  prueba('Live vs count: lo que faltó, en dinero', /−\$412/.test(diagTxt()) && /3 far off/.test(diagTxt()), diagTxt());
  prueba('Spent this cycle va sin botón (su hoja es del teléfono)', !H().querySelector('[data-cf="gasto"]'));
  H().querySelector('[data-cf="estante"]').click();
  H().querySelector('[data-cf="ayer"]').click();
  prueba('Details y Sync llaman a lo del teléfono', llamadas.includes('detalle') && llamadas.includes('sync'));

  // Un fallo se dice con lo que pasó.
  w.BarStockDeskHome._diag(undefined);
  diag = new Error('permission denied for table live_expected');
  w.BarStockDeskHome.pintar();
  await espera(10);
  prueba('un fallo de Live vs count dice el error', /permission denied/.test(diagTxt()), diagTxt());
  w.BarStockDeskHome._diag({ hay: false });
  w.BarStockDeskHome.pintar();
  prueba('sin ciclo cerrado lo dice', /No closed cycle yet/.test(diagTxt()), diagTxt());

  grupo('3. Lo de ahora, ancho, con el transfer al lado');
  const ahora = H().querySelector('.dkh-ahora');
  prueba('la primera tarjeta que no es transfer es la ancha', !!ahora.querySelector('.dkh-agota.dkh-hero'));
  prueba('el transfer va al lado', /Transfer/.test((ahora.querySelector('.dkh-lado') || {}).textContent || ''));

  grupo('4. Nada lleva a lo que el escritorio no tiene');
  const agota = H().querySelector('.dkh-agota');
  prueba('Running out sin "See them"', !/See them/.test(agota.textContent));
  prueba('Running out sin "To buy"', !/To buy/.test(agota.textContent));
  prueba('pero con cuánto pedir', /Order 2/.test(agota.textContent), agota.textContent.replace(/\s+/g, ' '));
  const tr = H().querySelector('.dkh-lado');
  prueba('el transfer sin "Choose yours"', !/>Choose yours</.test(tr.innerHTML));
  prueba('y lo dice', /Choose your product on your phone/.test(tr.textContent));
  prueba('el transfer sin "Change"', !/>Change</.test(tr.innerHTML));
  prueba('con "Not right"', /Not right/.test(tr.textContent));
  prueba('sin el icono de Cycle detail', !H().querySelector('[data-go3]'));

  grupo('5. Los botones llaman a lo de siempre');
  llamadas.length = 0;
  const btn = (t) => [...H().querySelectorAll('button')].find(b => b.textContent.trim() === t);
  btn('Restart').click();
  btn('Skip week').click();
  btn('Not right').click();
  const pv = H().querySelector('[data-pv]');
  pv && pv.click();
  prueba('Restart → go', llamadas.includes('go:Cycle open'), llamadas.join(','));
  prueba('Skip week → go2', llamadas.includes('go2:Cycle open'));
  prueba('Not right → go2 del transfer', llamadas.includes('go2:Transfer'));
  prueba('un proveedor → su orden', llamadas.includes('prov:Southern'));

  grupo('6. Los reportes de la portada, movidos con su id');
  const enHome = (id) => !!H().querySelector('#' + id);
  for (const s of ['pourIq', 'costReport', 'consumption', 'noMatch']) {
    prueba(s + ': su cifra vive en el Home', enHome('fgStats-' + s) && enHome('fgSub-' + s));
  }
  w.BarStockDeskHome.pintar();
  w.BarStockDeskHome.pintar();
  prueba('tras repintar siguen ahí, uno de cada', ['pourIq', 'costReport', 'consumption', 'noMatch']
    .every(s => D.querySelectorAll('#fgStats-' + s).length === 1 && enHome('fgStats-' + s)));
  llamadas.length = 0;
  D.getElementById('cta').click();
  prueba('"Report last week" no abre la tarjeta por encima', !llamadas.some(x => /^open:/.test(x)), llamadas.join(','));
  H().querySelector('.dkh-rep[data-sec="pourIq"]').click();
  prueba('tocar un reporte abre su sección', llamadas.includes('open:pourIq'), llamadas.join(','));

  grupo('7. No se pinta con una sección abierta');
  const antes = H().innerHTML;
  cards = cards.slice(0, 2);
  oyente && oyente();
  prueba('con .bs-focus-mode no se repinta', H().innerHTML === antes);
  D.querySelector('.wrap').classList.remove('bs-focus-mode');
  await espera(10);
  prueba('al volver al Home se repinta', H().innerHTML !== antes);
  prueba('la hoja lo esconde con una sección abierta', /body\.dk \.wrap:not\(\.bs-focus-mode\) > #dkHome \{ display: grid; \}/.test(CSS_DH));
  prueba('y a la portada de antes', /body\.dk \.wrap > #bsFocusGrid \{ display: none !important; \}/.test(CSS_DH));

  grupo('7b. Vidrio en los dos modos');
  prueba('cifras y tarjetas llevan desenfoque', /#dkHome \.dkh-cf, #dkHome \.dkh-card \{[^}]*backdrop-filter: blur\(\d+px\)/.test(CSS_DH));
  prueba('en el claro, lo de Tinta pasa a vidrio claro con texto oscuro',
    /body\.light #dkHome \.dkh-cf,[\s\S]{0,120}\{[^}]*background: rgba\(255, 255, 255, \.\d+\)[^}]*backdrop-filter: blur[^}]*color: #0f172a/.test(CSS_DH));

  grupo('8. Una pantalla del teléfono, en el escritorio');
  const SH = leer('src/mobile-shell.js');
  prueba('mobile-shell.ir sin montar se lo pasa al armazón', /if \(!_montado\) \{[\s\S]{0,200}desdeMovil\(id\)/.test(SH));
  const DS = leer('src/desk-shell.js');
  prueba('orders abre la sección de órdenes', /orders: 'vendor'/.test(DS));

  grupo('9. Los tonos, compartidos, y el orden de carga');
  const tonos = [...new Set([...leer('src/mobile-home.js').matchAll(/tono: '([a-z]+)'/g), ...leer('src/transfer-confirm.js').matchAll(/tono: '([a-z]+)'/g)].map(m => m[1]))];
  const raiz = CSS_M.slice(0, CSS_M.indexOf('@media'));
  for (const t of tonos) {
    prueba(`--hero-${t} vive en :root`, raiz.includes('--hero-' + t + ':') && raiz.includes('--hero-' + t + '-borde:'));
    prueba(`.dkh-${t} usa la variable`, new RegExp('\\.dkh-' + t + '\\s*\\{ background: var\\(--hero-' + t + '\\)').test(CSS_DH));
  }
  prueba('el teléfono también usa las variables', /\.m-hero-red\s*\{ background: var\(--hero-red\)/.test(CSS_M));
  prueba('ningún degradado copiado en desk-home.css', !/linear-gradient\(135deg, rgba/.test(CSS_DH));
  const i = (f) => INDEX.indexOf(f);
  prueba('desk-home.js después de mobile-home.js', i('src/desk-home.js') > i('src/mobile-home.js') && i('src/mobile-home.js') > 0);
  prueba('y después de desk-shell.js', i('src/desk-home.js') > i('src/desk-shell.js'));
  prueba('desk-home.css después de mobile-app.css (sus variables)', i('styles/desk-home.css') > i('styles/mobile-app.css'));

  console.log(`\n${ok} ok, ${mal} mal`);
  process.exit(mal ? 1 : 0);
})();
