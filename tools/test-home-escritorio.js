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
  !/BarStockInventoryValue|BarStockSpend|\.dinero\(\)/.test(DH));
// Los precios cambiados sí se piden, pero a la función COMPARTIDA (la de
// la campana del teléfono y What came in), nunca con una cuenta propia.
prueba('los precios, con calcularPrecios/aplicarPrecios de marginedge-purchases',
  /P\.calcularPrecios\(\)/.test(DH) && /P\.aplicarPrecios\(/.test(DH) && !/marginedge_invoice_lines|unit_price/.test(DH));

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
  { id: 'gasto', k: 'Spent this cycle', v: '$6,880', d: '3 to fix', btn: 'Review', tono: 'am' }
];
let oyente = null;
w.BarStockMobileHome = {
  datos: () => ({ saludo: 'Hello, Axel', tarjetas: cards, cifras, ventas: null }),
  alCambiar: (fn) => { oyente = fn; },
  vigilar: () => {},
  detalleEstante: () => llamadas.push('detalle'),
  sincronizarHoy: () => llamadas.push('sync'),
  sincronizarGasto: () => llamadas.push('syncME'),
  estadoGasto: () => gEstado,
  filasGasto: () => ({ conectada: true, filas: [
    { t: '4 invoices · 134 units', v: '$4,876' },
    { t: '1 line has no bottle', v: 'fix', am: true, que: 'fix' },
    { t: '3 prices changed', v: 'review', am: true, que: 'precios' }] }),
  alSync: (fn) => { oyenteSync = fn; },
  releerPrecios: () => llamadas.push('releer')
};
let oyenteSync = null;
let gEstado = { sincronizando: false, avance: null, error: null, precios: 3, total: 4876, desde: 'Nov 22', hace: '12 minutes ago' };
const ajustes = [];
const aplicados = [];
let precioFalla = null;
w.BarStockMarginEdgePurchases = {
  calcularPrecios: async () => {
    if (precioFalla) throw new Error(precioFalla);
    return { cambios: [
      { item: "Tito's Vodka", antes: 29, precio: 31, vendor: 'LOOP', factura: '53975', fecha: '2026-11-24' },
      { item: 'Aperol', antes: 21, precio: 20, vendor: 'Southern' },
      { item: 'Campari', antes: 26, precio: 27.5, vendor: 'Southern' }] };
  },
  aplicarPrecios: async (cambios, avisar) => {
    cambios.forEach((c, i) => { aplicados.push(c.item); if (avisar) avisar(i + 1, cambios.length); });
    return { ok: cambios.length, problemas: [] };
  }
};
w.BarStockInventoryRealtime = { recargar: async () => { llamadas.push('recargar'); } };
w.openSettingsModal = () => ajustes.push('abrir');
w.showSettingsPanel = (p) => ajustes.push(p);
w.BarStockLiveDiag = { semana: () => diag instanceof Error ? Promise.reject(diag) : Promise.resolve(diag) };
w.BarStockRunningOut = { lista: () => [{ r: { item: 'Cointreau', suggested: 2 }, item: 'Cointreau', vivo: true, out: { txt: 'Out Thu', tono: 'r' } }] };
w.BarStockLiveCache = { cuanto: () => 0.8, pedir: () => 2 };
// La silueta es la de home-cartas (la del conteo); aquí se ve con quién y
// con qué se llamó.
const siluetas = [];
w.BarStockBottleProfiles = { formaDe: (r) => 'forma-de-' + r.item };
w.BarStockHomeCartas = { silueta: (forma, lleno, id) => { siluetas.push({ forma, lleno, id }); return `<svg class="sil-falsa" data-forma="${forma}"></svg>`; } };
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
  const gb = () => H().querySelector('[data-gasto]');
  const gt = () => H().querySelector('[data-cifra="gasto"]').textContent.replace(/\s+/g, ' ');
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

  grupo('2b. Spent this cycle: Sync, Review y sus estados (lámina A)');
  prueba('con algo que arreglar, Review', !!gb() && gb().textContent.trim() === 'Review' && gb().dataset.gasto === 'review');
  gb().click();
  const V = () => D.getElementById('dkGasto');
  prueba('Review abre la ventana', !!V());
  prueba('con los renglones de la hoja del teléfono', /4 invoices · 134 units/.test(V().textContent) && /1 line has no bottle/.test(V().textContent) && /3 prices changed/.test(V().textContent));
  prueba('y Review prices en ámbar (hay precios cambiados)', /Review prices/.test(V().querySelector('.dkg-b.dkg-am').textContent));
  ajustes.length = 0;
  V().querySelector('[data-ir="meMatch"]').click();
  prueba('"Fix ›" lleva a Settings › Match products', ajustes.join(',') === 'abrir,meMatch', ajustes.join(','));
  prueba('y cierra la ventana', !V());
  // Review prices: la lista DENTRO de la ventana, como la campana del
  // teléfono; nada de mandar a Settings (Axel: "me lleva a settings").
  gb().click(); ajustes.length = 0;
  V().querySelector('.dkg-b.dkg-am').click();
  await espera(10);
  prueba('"Review prices" no manda a Settings', ajustes.length === 0, ajustes.join(','));
  prueba('enseña la lista en la misma ventana', !!V() && /3 prices changed/.test(V().querySelector('h3').textContent) && V().querySelectorAll('.dkg-pr').length === 3);
  prueba('cada producto con su precio de antes y el nuevo', /Tito's Vodka/.test(V().textContent) && /\$29\.00 → \$31\.00/.test(V().textContent) && /\+7%/.test(V().textContent), V().textContent.replace(/\s+/g, ' ').slice(0, 200));
  V().querySelector('[data-accion="actualizar"]').click();
  await espera(5);
  prueba('"Update 3 prices" guarda con aplicarPrecios', aplicados.length === 3, String(aplicados.length));
  await espera(20);
  prueba('y dice cuántos', /3 prices updated/.test(V().textContent), V().textContent.replace(/\s+/g, ' '));
  prueba('relee el catálogo y vuelve a contar los precios', llamadas.includes('recargar') && llamadas.indexOf('recargar') < llamadas.indexOf('releer'), llamadas.join(','));
  V().querySelector('[data-accion="atras"]').click();
  prueba('atrás vuelve al resumen', /Spent this cycle/.test(V().querySelector('h3').textContent));
  w.BarStockDeskHome.cerrarVentana();
  // Un fallo al leer los precios se dice, con lo que pasó.
  precioFalla = 'permission denied for table marginedge_links';
  gb().click();
  V().querySelector('.dkg-b.dkg-am').click();
  await espera(10);
  prueba('si no puede leerlos, lo dice', /Could not read prices: permission denied/.test(V().textContent));
  precioFalla = null;
  w.BarStockDeskHome.cerrarVentana();
  gb().click(); llamadas.length = 0;
  V().querySelector('[data-accion="sync"]').click();
  prueba('Sync now es el Sync del teléfono', llamadas.includes('syncME'));
  // Sincronizando: el avance llega por alSync y sólo se repinta la cifra.
  const antesHome = H().querySelector('.dkh-ahora');
  gEstado = Object.assign({}, gEstado, { sincronizando: true, avance: { pedidos: 12, hechos: 3 } });
  oyenteSync && oyenteSync();
  prueba('sincronizando dice por dónde va', /3 of 12 invoices…/.test(gt()), gt());
  prueba('con su barra de avance', !!H().querySelector('[data-cifra="gasto"] .dkh-gbar i'));
  prueba('y el botón girando y apagado', gb().disabled && /Syncing/.test(gb().textContent));
  prueba('la ventana dice lo mismo', /3 of 12 invoices…/.test(V().textContent) && V().querySelector('[data-accion="sync"]').disabled);
  prueba('el avance no rehace el Home entero', H().querySelector('.dkh-ahora') === antesHome);
  w.BarStockDeskHome.cerrarVentana();
  // Falló: ámbar, lo que dijo y Retry.
  gEstado = Object.assign({}, gEstado, { sincronizando: false, avance: null, error: 'MarginEdge did not answer for 90 s · stopped waiting, try again' });
  oyenteSync && oyenteSync();
  prueba('si falla, "Sync failed" y lo que dijo', /Sync failed/.test(gt()) && /did not answer for 90 s/.test(gt()), gt());
  prueba('en ámbar', H().querySelector('[data-cifra="gasto"]').classList.contains('dkh-err'));
  llamadas.length = 0;
  gb().click();
  prueba('Retry vuelve a sincronizar', gb().textContent.trim() === 'Retry' || llamadas.includes('syncME'));
  prueba('…y llama al Sync', llamadas.includes('syncME'));
  // Nada que arreglar: Sync, con cuándo fue el último.
  gEstado = Object.assign({}, gEstado, { error: null });
  cifras[2] = { id: 'gasto', k: 'Spent this cycle', v: '$6,880', d: 'since Nov 22', btn: 'Sync' };
  w.BarStockDeskHome.pintar();
  prueba('sin nada que arreglar, Sync', gb().dataset.gasto === 'sync' && /Sync/.test(gb().textContent));
  prueba('y cuándo se sincronizó', /synced 12 minutes ago/.test(gt()), gt());
  // Sin conectar: lleva a la conexión.
  cifras[2] = { id: 'gasto', k: 'Spent this cycle', v: '…', d: 'since Nov 22', btn: 'MarginEdge' };
  w.BarStockDeskHome.pintar(); ajustes.length = 0;
  gb().click();
  prueba('sin MarginEdge, el botón lleva a conectarlo', ajustes.join(',') === 'abrir,integrations', ajustes.join(','));
  cifras[2] = { id: 'gasto', k: 'Spent this cycle', v: '$6,880', d: '3 to fix', btn: 'Review', tono: 'am' };
  w.BarStockDeskHome.pintar();
  prueba('la hoja del teléfono y la ventana leen los mismos renglones (filasGasto)',
    /function filasGasto\(E, precios\)/.test(MH) && /const fg = filasGasto\(E, _precios\)/.test(MH));

  grupo('3. Lo de ahora, ancho, con el transfer al lado');
  const ahora = H().querySelector('.dkh-ahora');
  prueba('la primera tarjeta que no es transfer es la ancha', !!ahora.querySelector('.dkh-agota.dkh-hero'));
  prueba('el transfer va al lado', /Transfer/.test((ahora.querySelector('.dkh-lado') || {}).textContent || ''));

  grupo('4. Nada lleva a lo que el escritorio no tiene');
  const agota = H().querySelector('.dkh-agota');
  prueba('Running out sin "See them"', !/See them/.test(agota.textContent));
  prueba('Running out sin "To buy"', !/To buy/.test(agota.textContent));
  prueba('pero con cuánto pedir', /Order 2/.test(agota.textContent), agota.textContent.replace(/\s+/g, ' '));
  // Lámina A (2026-11-25): las botellas del teléfono, con su número.
  prueba('cada producto con la silueta del conteo (home-cartas.silueta + formaDe)',
    !!agota.querySelector('.dkh-ro svg.sil-falsa[data-forma="forma-de-Cointreau"]'));
  prueba('llena contra su par (0.8 de 2)', siluetas.some(x => Math.abs(x.lleno - 0.4) < 1e-9));
  prueba('cada recorte con su id propio', siluetas.every(x => /^dkhRo\d+$/.test(x.id)));
  prueba('y el número debajo, con su par', /≈0\.8\s*\/2/.test(agota.querySelector('.dkh-ro-v').textContent));
  prueba('el día y el nombre', /Out Thu/.test(agota.textContent) && /Cointreau/.test(agota.querySelector('.dkh-ro-n').textContent));
  prueba('poca (menos de un tercio del par) lleva su tono', !agota.querySelector('.dkh-ro-bajo') && !!agota.querySelector('.dkh-ro-medio'));
  prueba('ya no hay barra', !agota.querySelector('.dkh-ro-bar'));
  prueba('desk-home no dibuja la botella por su cuenta', !/pathFor|clipPath/.test(DH));
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

  grupo('7c. Las columnas miran el sitio del Home, no la ventana (iPad horizontal)');
  prueba('#dkHome es un contenedor', /#dkHome \{[^}]*container: dkhome \/ inline-size/.test(CSS_DH));
  prueba('las dos columnas, por el ancho del Home', /@container dkhome \(max-width: 960px\) \{[^}]*\.dkh-cifras/.test(CSS_DH));
  prueba('ninguna regla de columnas mira la ventana', !/@media[^{]*max-width: 1240px/.test(CSS_DH));

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
