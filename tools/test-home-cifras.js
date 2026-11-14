#!/usr/bin/env node
/*
 * ── Home: las tres cifras ────────────────────────────────────────────
 *
 * Axel, 2026-11-12, sobre lámina. Sustituyen al par "Spent this cycle /
 * On the shelf". Lo que se protege:
 *
 *   1. Tres cifras, en este orden: On the shelf, Sold yesterday, Spent
 *      this cycle. Cada una con título, número, una línea y su botón.
 *   2. Sold yesterday es el Net sales de ayer (toast-sales), y vender
 *      más se pinta en VERDE (las clases .m-up/.m-down son del gasto y
 *      van al revés). Su botón es Sync: carga lo vendido HOY (ver
 *      "el Sync de Sold", abajo).
 *   3. Sin Toast, no hay Sold yesterday: quedan dos.
 *   4. Spent this cycle dice desde cuándo; su botón Sync sincroniza
 *      MarginEdge y abre la hoja con lo que decía la tarjeta.
 *   5. Con algo que arreglar se pone ámbar, dice cuántos y el botón es
 *      Review, que abre la hoja SIN sincronizar.
 *   6. Las cifras van fuera del bloque que acopla band-dock (el saludo
 *      y la búsqueda): el header no cambia.
 *
 *   node tools/test-home-cifras.js
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

const HOY = '2026-11-11';
const sumar = (d, k) => new Date(new Date(d + 'T12:00:00Z').getTime() + k * 864e5).toISOString().slice(0, 10);

async function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  global.CustomEvent = w.CustomEvent;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  new Function(leer('src/events.js'))();
  new Function(leer('src/dialog.js'))();
  w.state = { master: [{ item: "Tito's", vendor: 'LOOP', onHand: 4, suggested: 8, value: 25 },
    { item: 'Kahlua', vendor: 'SOUTHERN', onHand: 1201.3, suggested: 2, value: 1 }] };
  global.state = w.state;
  w.parAdjustments = new Map();
  w.normalizeName = (s) => String(s || '').toLowerCase();
  new Function(leer('src/inventory-value.js'))();
  w.BarStockSpend = { compute: () => ({ now: { total: 3644 }, prev: { total: 4530 }, totalDelta: -886 }) };
  w.BarStockWeeklyCycle = { estado: () => 'done', resetAt: () => '2026-11-08T05:00:00Z', fmtDate: () => 'Nov 8',
    edadCiclo: () => 3 * 864e5, cicloViejo: () => false };
  w.BarStockMobileInvoices = { resumen: async () => ({ n: 6, unidades: 142, dinero: 3644,
    sueltas: o.sueltas || 0, ultima: '' }) };
  w.__syncs = 0;
  w.BarStockMarginEdgeConnect = { buscarFacturas: async () => { w.__syncs++; return { lineas: 0 }; } };
  // Toast: una semana con ayer (martes) a $3,500 y los martes de antes a $2,500.
  const dias = [], ventas = [];
  for (let k = 1; k <= 40; k++) {
    const f = sumar(HOY, -k);
    dias.push({ business_date: f, complete: true, closed: true });
    ventas.push({ business_date: f, toast_item_name: "Tito's", sales_category: 'Liquor', net: k === 1 ? 3500 : 2500, quantity: 10 });
  }
  // Lo que deja el Sync: la fila de hoy, abierta, y sus ventas.
  const ponerHoy = (net) => {
    dias.push({ business_date: HOY, complete: true, closed: false, fetched_at: '2026-11-11T23:12:00Z' });
    if (net) ventas.push({ business_date: HOY, toast_item_name: "Tito's", sales_category: 'Liquor', net, quantity: 3 });
  };
  if (o.hoy !== undefined) ponerHoy(o.hoy);
  w.__sync = [];
  w.__avisos = [];
  w.BarStockToast = { show: (m) => w.__avisos.push(m) };
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-1' };
  w.BarStockDevPanel = { llamar: async (p, a, par) => {
    w.__sync.push([p, a, par]);
    await esperar(30);
    if (o.syncFalla) return { ok: false, error: o.syncFalla };
    if (o.syncTrae !== undefined) ponerHoy(o.syncTrae);
    return { ok: true };
  } };
  w.BarStockToastUsage = { diaDeNegocio: () => HOY,
    ventasDesde: async () => (w.__lento && await esperar(w.__lento), o.sinToast ? { dias: [], ventas: [], productos: [] } : { dias, ventas, productos: [] }) };
  new Function(leer('src/run-out.js'))();
  new Function(leer('src/toast-sales.js'))();
  // El LIVE: con `o.vivo`, Tito's (contado 4) se movió y vale 2.6.
  if (o.vivo) w.BarStockRunOut.ahora = async () => ({ estado: 'listo', conteo: '2026-11-09T02:00:00Z', desde: '2026-11-08',
    filas: [{ producto: "Tito's", contado: 4, llego: 0, vendido: 1.4, live: 2.6, movimiento: true, llegadas: [], viene: [] }] });
  new Function(leer('src/live-cache.js'))();
  if (o.vivo) await w.BarStockLiveCache.cargar();
  w.__abrir = null;
  w.BarStockMobileSales = { abrir: (x) => { w.__abrir = x; } };
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {} };
  new Function(leer('src/mobile-home.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'home';
  w.document.body.appendChild(host);
  def.mount(host);
  await esperar(60);
  return { w, host };
}
const cifras = (h) => [...h.querySelectorAll('#mhCifras .m-cf-c')];
const cifra = (h, t) => cifras(h).find(c => new RegExp(t, 'i').test(c.querySelector('.m-cf-k').textContent));
const txt = (el) => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';

(async () => {

grupo('las tres cifras');
{
  const { w, host } = await entorno();
  const ks = cifras(host).map(c => txt(c.querySelector('.m-cf-k')));
  prueba('tres, en su orden', JSON.stringify(ks) === JSON.stringify(['On the shelf', 'Sold yesterday', 'Spent this cycle']), JSON.stringify(ks));
  prueba('ninguna sobra: el par viejo ya no está', !host.querySelector('.m-pair') && !host.querySelector('.m-stat'));
  prueba('cada una con su botón', cifras(host).every(c => !!c.querySelector('.m-cf-b')));

  const a = cifra(host, 'Sold yesterday');
  prueba('Sold yesterday: el Net sales de ayer', txt(a.querySelector('.m-cf-v')) === '$3,500', txt(a));
  const sube = a.querySelector('.m-cf-d span');
  prueba('vender más, en verde (+40% vs un martes normal)', !!sube && sube.classList.contains('m-cf-sube') && /↗ 40%/.test(sube.textContent),
    sube && sube.outerHTML);
  // Axel, 2026-11-13: Report pasa a ser Sync (el reporte sigue en el
  // Full report de la tarjeta grande).
  prueba('su botón es Sync, no Report', /^Sync$/.test(txt(a.querySelector('.m-cf-b'))), txt(a.querySelector('.m-cf-b')));
  prueba('sin Sync todavía, sin línea de estado', !a.querySelector('.m-cf-s'));

  const g = cifra(host, 'Spent this cycle');
  prueba('Spent this cycle: el gasto y desde cuándo', txt(g.querySelector('.m-cf-v')) === '$3,644' && /since Nov 8/.test(txt(g)), txt(g));
  prueba('su botón es Sync', /Sync/.test(txt(g.querySelector('.m-cf-b'))));
  g.querySelector('.m-cf-b').click();
  await esperar(1300);
  const hoja = w.document.querySelector('#mSheet .m-cfh');
  prueba('Sync sincroniza MarginEdge', w.__syncs === 1, String(w.__syncs));
  prueba('y abre la hoja con lo que decía la tarjeta', !!hoja && /6 invoices · 142 units/.test(txt(hoja)) && /\$3,644/.test(txt(hoja)),
    txt(hoja));
  prueba('con Sync now y See invoices', !!hoja && /Sync now/.test(txt(hoja)) && /See invoices/.test(txt(hoja)));
}

grupo('con algo que arreglar');
{
  const { w, host } = await entorno({ sueltas: 2 });
  const g = cifra(host, 'Spent this cycle');
  prueba('ámbar', g.classList.contains('m-cf-am'));
  prueba('dice cuántos', /2 to fix/.test(txt(g)), txt(g));
  prueba('y el botón es Review', /^Review$/.test(txt(g.querySelector('.m-cf-b'))));
  g.querySelector('.m-cf-b').click();
  await esperar(20);
  prueba('Review abre la hoja sin sincronizar', !!w.document.querySelector('#mSheet .m-cfh') && w.__syncs === 0, String(w.__syncs));
  prueba('y la hoja dice qué', /2 lines have no bottle/.test(txt(w.document.querySelector('#mSheet .m-cfh'))));
}

grupo('On the shelf: las botellas');
{
  // Axel, 2026-11-13: la segunda línea de On the shelf son las botellas,
  // y se mueven con el LIVE. Bajo el título, como el "synced" de Sold.
  const { host } = await entorno();
  const c = cifra(host, 'On the shelf');
  const st = c.querySelector('.m-cf-s');
  prueba('sin LIVE: lo contado, sin "≈"', !!st && txt(st) === '1,205 bottles', txt(st));
  prueba('bajo el título, antes de la cifra', !!st && st.previousElementSibling === c.querySelector('.m-cf-k') && st.nextElementSibling === c.querySelector('.m-cf-v'));
}
{
  const { host } = await entorno({ vivo: true });
  const st = cifra(host, 'On the shelf').querySelector('.m-cf-s');
  // Tito's pasa de 4 a 2.6: 1201.3 + 2.6 = 1203.9 → 1,204.
  prueba('con LIVE: la suma del LIVE de cada producto, con "≈"', !!st && txt(st) === '≈1,204 bottles', txt(st));
}

grupo('el Sync de Sold');
{
  // Axel, 2026-11-13, sobre lámina: Sync carga lo vendido hoy. Con
  // ventas, "Sold today" y la hora bajo el TÍTULO (no bajo la cifra).
  const { w, host } = await entorno({ syncTrae: 1200 });
  cifra(host, 'Sold').querySelector('.m-cf-b').click();
  await esperar(5);
  const c0 = cifra(host, 'Sold');
  prueba('mientras, "Syncing…" y el botón apagado', /Syncing/.test(txt(c0.querySelector('.m-cf-b'))) && c0.querySelector('.m-cf-b').disabled);
  await esperar(120);
  prueba('llama a sync con hoy y la locación', w.__sync.length === 1 && w.__sync[0][1] === 'sync' &&
    w.__sync[0][2].businessDate === '20261111' && w.__sync[0][2].locationId === 'loc-1', JSON.stringify(w.__sync));
  const c = cifra(host, 'Sold');
  prueba('pasa a "Sold today"', txt(c.querySelector('.m-cf-k')) === 'Sold today', txt(c));
  prueba('con lo vendido hoy', txt(c.querySelector('.m-cf-v')) === '$1,200', txt(c.querySelector('.m-cf-v')));
  const st = c.querySelector('.m-cf-s');
  prueba('"synced" y la hora de Nueva York', !!st && txt(st) === 'synced 6:12 PM', txt(st));
  prueba('la hora va bajo el título, antes de la cifra', !!st && st.previousElementSibling === c.querySelector('.m-cf-k') &&
    st.nextElementSibling === c.querySelector('.m-cf-v'));
  prueba('y abajo, "so far today"', txt(c.querySelector('.m-cf-d')) === 'so far today');
  prueba('el botón vuelve a Sync', /^Sync$/.test(txt(c.querySelector('.m-cf-b'))) && !c.querySelector('.m-cf-b').disabled);
  await esperar(300);
}
{
  // Axel, 2026-11-13: "al pulsar sync y este termina, la tarjeta
  // desaparece por unos segundos y luego reaparece". Lo vendido se
  // vaciaba al terminar el sync y la tarjeta se pintaba sin datos
  // mientras se releía. Ahora sigue en "Syncing…" hasta tener lo nuevo.
  const { w, host } = await entorno({ syncTrae: 1200 });
  w.__lento = 200;
  const vista = [];
  const mirar = () => { const c = cifra(host, 'Sold'); vista.push(c ? txt(c.querySelector('.m-cf-b')) + '/' + txt(c.querySelector('.m-cf-k')) : 'NADA');
    vista.push(host.querySelector('#mhVentas .m-ts') ? 'grande' : 'SIN GRANDE'); };
  cifra(host, 'Sold').querySelector('.m-cf-b').click();
  for (let k = 0; k < 12; k++) { await esperar(20); mirar(); }
  await esperar(150);
  prueba('mientras relee, la tarjeta no desaparece', !vista.includes('NADA'), vista.join(','));
  prueba('ni la grande de Toast', !vista.includes('SIN GRANDE'));
  prueba('y sigue en Syncing… hasta tener lo nuevo', !vista.includes('Sync/Sold yesterday'), vista.join(','));
  prueba('al final, "Sold today"', txt(cifra(host, 'Sold').querySelector('.m-cf-k')) === 'Sold today');
  await esperar(300);
}
{
  // Sin ventas todavía: sigue ayer, y lo dice.
  const { host } = await entorno({ syncTrae: 0 });
  cifra(host, 'Sold').querySelector('.m-cf-b').click();
  await esperar(150);
  const c = cifra(host, 'Sold');
  prueba('sin ventas hoy: sigue "Sold yesterday" con lo de ayer', txt(c.querySelector('.m-cf-k')) === 'Sold yesterday' &&
    txt(c.querySelector('.m-cf-v')) === '$3,500', txt(c));
  prueba('y dice que hoy no hay nada aún', /^no sales yet$/.test(txt(c.querySelector('.m-cf-s'))), txt(c.querySelector('.m-cf-s')));
  // Lo que queda pendiente de este Home (su relectura de ventas) pinta
  // sobre el `document` global, que el siguiente entorno sustituye: se
  // deja terminar antes de crear otro.
  await esperar(300);
}
{
  const { w, host } = await entorno({ syncFalla: 'Toast said 401' });
  cifra(host, 'Sold').querySelector('.m-cf-b').click();
  await esperar(150);
  const c = cifra(host, 'Sold');
  prueba('si falla: ámbar y "Sync failed"', c.classList.contains('m-cf-am') && txt(c.querySelector('.m-cf-s')) === 'Sync failed' &&
    c.querySelector('.m-cf-s').classList.contains('m-cf-err'), txt(c));
  prueba('los números no cambian', txt(c.querySelector('.m-cf-k')) === 'Sold yesterday' && txt(c.querySelector('.m-cf-v')) === '$3,500');
  prueba('el botón es Retry', /^Retry$/.test(txt(c.querySelector('.m-cf-b'))));
  prueba('y avisa con lo que dijo el servidor', w.__avisos.some(m => /Toast said 401/.test(m)), JSON.stringify(w.__avisos));
}
{
  // Al abrir la app con hoy ya sincronizado: sale de los datos.
  const { host } = await entorno({ hoy: 800 });
  const c = cifra(host, 'Sold');
  prueba('con hoy ya cargado, abre en "Sold today"', txt(c.querySelector('.m-cf-k')) === 'Sold today' && txt(c.querySelector('.m-cf-v')) === '$800', txt(c));
}

grupo('sin Toast');
{
  const { host } = await entorno({ sinToast: true });
  prueba('dos cifras, sin Sold yesterday', cifras(host).length === 2 && !cifra(host, 'Sold yesterday') &&
    host.querySelector('#mhCifras').classList.contains('dos'));
}

grupo('el header no cambia');
{
  const { host } = await entorno();
  const bloque = host.querySelector('#mhSearch').closest('.m-body');
  prueba('las cifras van fuera del bloque del saludo y la búsqueda', !bloque.querySelector('#mhCifras'));
  prueba('y justo después de él', bloque.nextElementSibling && !!bloque.nextElementSibling.querySelector('#mhCifras'));
}

grupo('centradas');
{
  // Axel, 2026-11-12, opción B sobre lámina: título, número y su línea
  // centrados, sobre el mismo eje que el botón (que ya lo estaba). Se
  // pone en la tarjeta y lo heredan los tres; jsdom no maqueta, así que
  // se mira la regla.
  const css = leer('styles/mobile-app.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const c = (/\.m-cf-c\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
  prueba('la tarjeta centra su texto', /text-align\s*:\s*center/.test(c), c.replace(/\s+/g, ' ').trim());
  const hijos = ['.m-cf-k', '.m-cf-v', '.m-cf-d'].filter(k =>
    new RegExp(k.replace('.', '\\.') + '\\s*\\{[^}]*text-align\\s*:\\s*(left|start)').test(css));
  prueba('y ninguno de los tres se vuelve a la izquierda', hijos.length === 0, hijos.join(', '));
}

grupo('los botones, de cristal');
{
  // Axel, 2026-11-13, opción B: los botones de las tres cifras y "All
  // products" llevan el cristal de la banda; Review sigue amarillo sólido.
  const css = leer('styles/mobile-app.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const reg = /body\.m-shell #mBand \.m-ico:not\(\.m-ico-alert\),[^{]*\{([^}]*)\}/.exec(css);
  prueba('comparten la regla de cristal de la banda', !!reg && /#mScreens :is\(\.m-cf-b, \.m-ts-mas\)\s*[,{]/.test(reg[0]) && /blur\(10px\)/.test(reg[1]));
  prueba('y su reflejo', /#mScreens :is\(\.m-cf-b, \.m-ts-mas\)::before,/.test(css));
  // El texto va suelto: sin esto el reflejo lo lavaba.
  prueba('el reflejo, debajo del texto', /:is\(\.m-cf-b, \.m-ts-mas\) \{ position: relative; isolation: isolate; \}/.test(css) &&
    /:is\(\.m-cf-b, \.m-ts-mas\)::before \{ z-index: -1; \}/.test(css));
  // Con el id delante: sin él, el cristal (con id) le ganaba al amarillo.
  prueba('Review sigue amarillo sólido', /body\.m-shell #mScreens \.m-cf-am \.m-cf-b \{ background: #fcd34d;/.test(css));
  prueba('y no queda el amarillo viejo, que perdía', !/body\.m-shell \.m-cf-am \.m-cf-b \{/.test(css));
  // Axel, 2026-11-13: las pestañas del Home (B) y el Bottles / $ (A).
  prueba('las pestañas del Home y Bottles / $, del mismo cristal', !!reg && /#mScreens :is\(#mhTabs, \.m-ts-seg\)\s*[,{]/.test(reg[0]) &&
    /#mScreens :is\(#mhTabs, \.m-ts-seg\)::before,/.test(css));
  prueba('la elegida de las pestañas, cristal azul (B)', /#mScreens #mhTabs button\.on \{[^}]*background: rgba\(125,211,252,\.32\)/.test(css));
  prueba('la de Bottles / $, sólida como siempre (A)', /body\.m-shell \.m-ts-seg button\.on \{ background: #7dd3fc;/.test(css) &&
    !/#mScreens \.m-ts-seg button\.on/.test(css));
  prueba('sus botones, sin el desenfoque de app.css (pastilla fantasma)',
    /#mScreens :is\(#mhTabs, \.m-ts-seg\) button \{\s*-webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: none;/.test(css));
  prueba('People no cambia: sólo #mhTabs, no .m-sx-tabs', !/:is\([^)]*\.m-sx-tabs[^)]*\)\s*(::before)?\s*[,{]/.test(css));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
