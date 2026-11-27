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
const ventasPintadas = [];
w.BarStockMobileHome = {
  datos: () => ({ saludo: 'Hello, Axel', tarjetas: cards, cifras, ventas: null }),
  // La tarjeta de Toast es la del teléfono: aquí se ve en qué caja y con
  // qué se pidió.
  ventas: (caja, repintar, opts) => { ventasPintadas.push({ caja, repintar, opts }); caja.innerHTML = '<div class="m-ts"><img class="m-ts-logo" data-logo="toast"></div>'; },
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

  // Cada tarjeta en SU sitio (Axel, 2026-11-25): el teléfono ordena por
  // urgencia, el escritorio no. Aquí el teléfono pone el transfer primero.
  grupo('3. Cada tarjeta en su sitio, sea cual sea el orden del teléfono');
  const ahora = H().querySelector('.dkh-ahora');
  prueba('Running out es la ancha', !!ahora.querySelector('.dkh-agota.dkh-hero'));
  prueba('el ciclo va a su lado', /Cycle open/.test((ahora.querySelector('.dkh-lado') || {}).textContent || ''));
  prueba('y lleva la marca de tamaño fijo', !!ahora.querySelector('.dkh-lado.dkh-fija'));
  const resto = [...H().querySelectorAll('.dkh-resto > *')].map(e => e.textContent.replace(/\s+/g, ' '));
  // Lámina "the gap next to Toast", B (Axel, 2026-11-27): el sitio a la
  // derecha de Toast es SIEMPRE de Transfers; antes el transfer iba antes
  // de Toast y, sin transfer, quedaba un hueco a su derecha.
  const hijos = [...H().querySelectorAll('.dkh-resto > *')];
  prueba('debajo: las órdenes, Toast, y el transfer a su derecha', /Orders waiting/.test(resto[0] || '') && hijos[1] && hijos[1].id === 'dkVentas'
    && /Transfer/.test(resto[2] || '') && hijos.length === 3, resto.map(x => x.slice(0, 20)).join(' | '));
  prueba('sin nada que se acabe, el sitio ancho es de las órdenes', /todas\.find\(x => es\(x, 'agota'\)\) \|\| todas\.find\(x => es\(x, 'ordenes'\)\)/.test(DH));

  grupo('3b. Sin transfer por confirmar, la tarjeta Transfers en su sitio');
  {
    const antes = cards;
    const irA = [];
    w.BarStockDeskShell = { ir: (s) => irA.push('ir:' + s) };
    w.BarStockDeskTransfers = { nuevo: () => irA.push('nuevo') };
    let puede = true;
    w.BarStockMobileTransfers = { datos: () => ({ loc: 'crown', porConf: [], recientes: [[{}], [{}]], puede }) };
    cards = antes.filter(c => !c.transfer);
    w.BarStockDeskHome.pintar();
    const hs = [...H().querySelectorAll('.dkh-resto > *')];
    const ul = hs[hs.length - 1];
    prueba('a la derecha de Toast, la tarjeta Transfers', hs.length === 3 && hs[1].id === 'dkVentas' && ul.classList.contains('dkh-txs'), hs.map(x => x.id || x.className).join(' | '));
    prueba('dice que no hay nada que confirmar', /Nothing to confirm/.test(ul.textContent), ul.textContent.replace(/\s+/g, ' '));
    prueba('y cuántos van esta semana', /2 this week/.test(ul.textContent));
    const b = (t) => [...ul.querySelectorAll('button')].find(x => x.textContent.trim().includes(t));
    b('New transfer').click();
    prueba('New transfer abre la sección y su formulario', irA.join(',') === 'ir:transfers,nuevo', irA.join(','));
    irA.length = 0;
    b('See all').click();
    prueba('See all abre la sección', irA.join(',') === 'ir:transfers', irA.join(','));
    puede = false;
    w.BarStockDeskHome.pintar();
    prueba('sin permiso, sin New transfer', !/New transfer/.test(H().querySelector('.dkh-txs').textContent));
    w.BarStockMobileTransfers = { datos: () => ({ loc: null, porConf: [], recientes: [], puede: true }) };
    w.BarStockDeskHome.pintar();
    prueba('sin leer todavía, no inventa un "0 this week"', !/this week/.test(H().querySelector('.dkh-txs').textContent));
    delete w.BarStockMobileTransfers; delete w.BarStockDeskTransfers; delete w.BarStockDeskShell;
    cards = antes;
    w.BarStockDeskHome.pintar();
  }

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
  const tr = [...H().querySelectorAll('.dkh-resto > .dkh-card')].find(e => /Transfer/.test(e.textContent));
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
  prueba('las dos columnas, por el ancho del Home', /@container dkhome \(max-width: 960px\) \{[\s\S]{0,400}\.dkh-cifras/.test(CSS_DH));
  prueba('ninguna regla de columnas mira la ventana', !/@media[^{]*max-width: 1240px/.test(CSS_DH));

  grupo('7d. Las ventas de Toast: la tarjeta del teléfono (lámina A)');
  {
    const MH2 = leer('src/mobile-home.js');
    const CSSG = leer('styles/desk-ficha.css');
    const caja = H().querySelector('#dkVentas');
    prueba('el Home tiene su caja, ancha', !!caja && caja.classList.contains('dkh-ventas') && /\.dkh-ventas \{[^}]*grid-column: span 2/.test(CSS_DH));
    prueba('la pinta mobile-home.ventas, en esa caja', ventasPintadas.length > 0 && ventasPintadas[ventasPintadas.length - 1].caja === caja);
    prueba('con su repintado', typeof (ventasPintadas.slice(-1)[0] || {}).repintar === 'function');
    // Axel, 2026-11-25: "creció demasiado […] cortarle Most Sold y el botón
    // ponerlo arriba".
    prueba('compacta en el escritorio', ((ventasPintadas.slice(-1)[0] || {}).opts || {}).compacta === true);
    prueba('compacta: sin Most sold ni su pie', /\$\{top\.length && !compacta \? `\s*<div class="m-ts-top">/.test(MH2) && /\$\{top\.length && !compacta \? `<div class="m-ts-pie">/.test(MH2));
    prueba('compacta: All products arriba, junto a Bottles / $', /<span class="m-ts-acc">\s*\$\{compacta && top\.length \? `<button type="button" class="m-ts-mas" data-mas>/.test(MH2));
    prueba('compacta: la leyenda de licor y vino va en el renglón de la píldora', /\$\{compacta \? `<div class="m-ts-fila">\$\{pill\}\$\{din \? leyenda : ''\}<\/div>` : pill\}/.test(MH2)
      && /\$\{din && !compacta \? leyenda : ''\}/.test(MH2));
    prueba('y ese renglón tiene alto fijo: la tarjeta no crece al pasar a $', /#dkVentas \.m-ts-fila \{[^}]*min-height: 32px/.test(CSS_DH));
    prueba('la tarjeta empieza a ras de su fila (le gana al margin-top generado)', /#dkHome #dkVentas > \.m-ts \{[^}]*margin: 0/.test(CSS_DH));
    prueba('desk-home no pinta ventas por su cuenta', !/semanaCal|masVendido|dkh-vts|dkh-vt-b/.test(DH));
    prueba('el teléfono pinta con la misma función', /function pintarVentas\(host\)[\s\S]{0,200}pintarVentasEn\(caja, \(\) => pintarVentas\(host\)\)/.test(MH2)
      && /ventas: \(caja, repintar, opts\) => pintarVentasEn\(/.test(MH2));
    prueba('sus estilos, generados del teléfono bajo #dkVentas', /#dkVentas \.m-ts \{/.test(CSSG) && /#dkVentas \.m-ts-sem \{/.test(CSSG) && /#dkVentas \.m-ts-seg/.test(CSSG));
    prueba('el logo de Toast, más grande que en el teléfono', /#dkVentas \.m-ts-logo \{ height: 30px/.test(CSS_DH));
    prueba('un solo marco: la caja sin fondo, la tarjeta con su vidrio', /\.dkh-ventas \{[^}]*background: none/.test(CSS_DH) && /#dkVentas > \.m-ts \{[^}]*backdrop-filter: blur\(16px\)/.test(CSS_DH));
    prueba('sin Toast, la caja vacía no se ve', /\.dkh-ventas:empty \{ display: none; \}/.test(CSS_DH));
    prueba('All products / Full report en la ventana del escritorio (m-vl en #mSheet)', /body\.dk #mSheet \.m-vl-/.test(CSSG));
  }

  grupo('7e. El ciclo, día por día (lámina "Cycle and Orders cards" 1A)');
  {
    const w2 = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://x.test/' }).window;
    w2.console = { log() {}, warn() {}, error() {} };
    const hora = 3600e3, dia = 864e5, ahora = Date.now();
    w2.state = { master: [], orderHistory: [
      { vendor: 'SOUTHERN', createdAt: new Date(ahora - 60e3).toISOString(), arrivesAt: new Date(ahora + dia).toISOString() },
      { vendor: 'BREAKTHRU', createdAt: new Date(ahora - 2 * dia).toISOString(), arrivesAt: new Date(ahora - dia).toISOString() },
      { vendor: 'TRANSFER', createdAt: new Date(ahora - 60e3).toISOString() } ] };
    w2.eval(leer('src/mobile-home.js'));
    const kNY = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ahora + d * dia));
    const D = w2.BarStockMobileHome._diasDelCiclo(new Date(ahora - 3 * dia).toISOString(), kNY(4),
      { contados: 153, salto: false, pend: 0, entregas: { [kNY(-1)]: 4 }, hora: '4 PM' });
    const de = (d) => (D || []).find(x => x.k === kNY(d)) || { ev: [] };
    const t = (x) => x.ev.join(' · ').replace(/<[^>]+>/g, '');
    prueba('un renglón por día, del que abrió el ciclo al domingo de contar', !!D && D.length === 8 && D[0].k === kNY(-3) && D[7].k === kNY(4), D && D.length);
    prueba('el primero: lo contado', /153 items counted/.test(t(de(-3))));
    prueba('las entregas en su día', /4 deliveries in/.test(t(de(-1))));
    prueba('las órdenes en el día en que se enviaron (sin transfers)', /Ordered Breakthru/.test(t(de(-2))) && /Ordered Southern/.test(t(de(0))) && !/Transfer/i.test(t(de(0))));
    prueba('lo que viene, en el día en que llega', /Southern arrives/.test(t(de(1))));
    prueba('lo que ya llegó no se anuncia', !D.some(x => /Breakthru arrives/.test(t(x))));
    prueba('hoy se llama Today y va marcado', de(0).u === 'Today' && de(0).hoy && !de(0).hecho);
    prueba('el último: el conteo, con su hora', de(4).cuenta && /Count · from 4 PM/.test(t(de(4))));
    prueba('un día sin nada no se rellena', de(2).ev.length === 0);
    prueba('con la semana saltada, lo dice', /Count skipped/.test(w2.BarStockMobileHome._diasDelCiclo(new Date(ahora - dia).toISOString(), kNY(2),
      { contados: 0, salto: true, pend: 3, hora: '4 PM' })[0].ev.join('').replace(/<[^>]+>/g, '')));
    prueba('las facturas dicen cuántas hubo cada día', /porDia\[k\] = \(porDia\[k\] \|\| 0\) \+ 1/.test(leer('src/mobile-invoices.js')) && /ultima, porDia,/.test(leer('src/mobile-invoices.js')));
    prueba('el teléfono sigue con su pista (la semana sólo la pinta el escritorio)', /libre: libreCiclo/.test(leer('src/mobile-home.js')) && !/dkh-semana|semana\.dias/.test(leer('src/mobile-home.js').replace(/semanaDias/g, '')));
    prueba('el escritorio la pinta a lo ancho, con "Count Sunday" de título', /function semanaHtml\(c\)/.test(DH) && /\$\{semanaHtml\(c\)\}/.test(DH) && /\(c\.semana && c\.semana\.titulo\) \|\|/.test(DH));
    prueba('y su estilo: hecho, hoy, el domingo de contar', /\.dkh-semana \.hoy i \{/.test(CSS_DH) && /\.dkh-semana \.cuenta i \{/.test(CSS_DH));
  }

  grupo('7f. Orders placed: las órdenes del ciclo (lámina 2A)');
  {
    const w3 = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://x.test/' }).window;
    w3.console = { log() {}, warn() {}, error() {} };
    const h = 3600e3, d = 864e5, n = Date.now();
    w3.state = { master: [], orderHistory: [
      { vendor: 'SOUTHERN', createdAt: new Date(n - h).toISOString(), arrivesAt: new Date(n + d).toISOString(), totalUnits: 18, subtotal: 612 },
      { vendor: 'BREAKTHRU', createdAt: new Date(n - 2 * d).toISOString(), arrivesAt: new Date(n - d).toISOString(), totalUnits: 24, subtotal: 740 },
      { vendor: 'TRANSFER', createdAt: new Date(n - h).toISOString(), totalUnits: 3 },
      { vendor: 'LOOP', createdAt: new Date(n - 20 * d).toISOString(), arrivesAt: new Date(n - 19 * d).toISOString(), totalUnits: 5, subtotal: 90 } ] };
    w3.BarStockWeeklyCycle = { resetAt: () => new Date(n - 3 * d).toISOString() };
    w3.eval(leer('src/mobile-home.js'));
    const O = w3.BarStockMobileHome._ordenesDelCiclo();
    prueba('las órdenes del ciclo (no las de antes ni los transfers)', !!O && O.ordenes.map(x => x.vendor).join(',') === 'SOUTHERN,BREAKTHRU', O && O.ordenes.map(x => x.vendor).join(','));
    prueba('lo que viene primero, con su hora', O.ordenes[0].estado === 'viene' && !!O.ordenes[0].cuando && O.siguiente.indexOf('Southern') === 0);
    prueba('lo que ya pasó su hora: "Arrived" (la regla del LIVE)', O.ordenes[1].estado === 'llego' && /^Arrived /.test(O.ordenes[1].cuando));
    prueba('con sus botellas y su dinero, y el total', O.ordenes[0].unidades === 18 && O.ordenes[0].dinero === 612 && O.total === 1352);
    prueba('los siete días desde hoy, con quién llega cada uno', O.dias.length === 7 && O.dias[0].hoy && O.dias[1].provs.includes('SOUTHERN'));
    prueba('sin ciclo, nada (no se inventa)', (() => { w3.BarStockWeeklyCycle.resetAt = () => ''; return w3.BarStockMobileHome._ordenesDelCiclo() === null; })());
    prueba('"No invoice" no se decide aquí (la carga de Sent escribe enlaces)', !/BarStockMobileHistory|invoice_order_links/.test(leer('src/mobile-home.js').slice(leer('src/mobile-home.js').indexOf('function ordenesDelCiclo'), leer('src/mobile-home.js').indexOf('function colocados'))));
    prueba('el escritorio la pinta: la semana con logos y una fila por orden', /function ordenesHtml\(c\)/.test(DH) && /\$\{ordenesHtml\(c\)\}/.test(DH) && /BarStockVendorLogo/.test(DH));
    prueba('con "Next: …" de título y el total al pie', /'Next: ' \+ c\.ordenes\.siguiente/.test(DH) && /' orders'\) \+ \(O\.total \? ' · ' \+ money\(O\.total\)/.test(DH));
    prueba('el teléfono no cambia (ordenes sólo la pinta el escritorio)', !/dkh-olist|ordenesHtml/.test(leer('src/mobile-home.js')));
  }

  grupo('7g. Tamaño fijo: el contenido se adapta a la tarjeta');
  prueba('el ciclo y Orders placed no estiran su fila (contain: size)', /\.dkh-card\.dkh-fija \{ contain: size; overflow: hidden; \}/.test(CSS_DH)
    && /c\.ciclo \|\| c\.fase === 'puestas' \? ' dkh-fija'/.test(DH));
  prueba('solas en su fila (sin Toast, o en dos columnas), su propio alto', /\.dkh-resto:not\(:has\(\.dkh-ventas:not\(:empty\)\)\) \.dkh-fija \{ min-height: 330px; \}/.test(CSS_DH)
    && /@container dkhome \(max-width: 960px\) \{[\s\S]{0,300}\.dkh-resto \.dkh-fija \{ min-height: 330px; \}/.test(CSS_DH));
  prueba('los días se reparten el alto, un renglón cada uno', /\.dkh-semana li \{[^}]*flex: 1 1 0; min-height: 0/.test(CSS_DH) && /\.dkh-semana p \{[^}]*white-space: nowrap; overflow: hidden; text-overflow: ellipsis/.test(CSS_DH));
  prueba('de Orders placed, tres órdenes (el pie cuenta todas)', /O\.ordenes\.slice\(0, 3\)/.test(DH));
  prueba('su título, en un renglón', /\.dkh-fija h3 \{ white-space: nowrap;/.test(CSS_DH));

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
