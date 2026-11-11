#!/usr/bin/env node
/*
 * ── El LIVE en la ficha y en "Do we have…" ───────────────────────────
 *
 * Axel, 2026-11-11: "el live sólo se está mostrando en la vista de lista
 * de Inventory; si entras al producto o lo buscan en Do we have, te
 * muestra el dato del conteo. Si ya cambió a live, el dato que se
 * muestra en todos lados es ése, junto con el tag de que es live."
 *
 * Diseño elegido (A, sobre lámina):
 *   1. La cabecera (product-hero) enseña "≈X.X of N", con el color y la
 *      botella del LIVE, y "● Live" en la esquina de arriba a la derecha.
 *   2. Bajo el número, "Out Fri" donde Toast lo vende; los "Runs out in N
 *      days" de Pour·IQ sólo para lo que Toast no vende.
 *   3. Lo que no se movió desde el conteo: lo contado, sin marca, como
 *      siempre.
 *   4. Las tarjetas de la búsqueda ya no llevan las zonas: con el LIVE no
 *      suman lo que dice el número. Las zonas, sólo en la ficha.
 *   5. En la ficha, junto a las zonas, una pieza aparte con lo que llegó
 *      por pedido desde el conteo ("+5 Arrived"): está en el bar, pero
 *      nadie dijo dónde.
 *
 *   node tools/test-ficha-live.js
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

const HOY = new Date().toISOString().slice(0, 10);
const enDias = (k) => new Date(Date.now() + k * 864e5).toISOString().slice(0, 10);
const MED = [1, 1, 1, 1, 1, 1, 1];

// Tito's: contó 3, llegaron 5 por el pedido de LOOP, vendió 0.9.
// St Germain: contó 2, vendió 0.6, nada llegó.
// Guinness: no se movió, Toast no la vende.
// Casamigos: no se movió, pero Toast lo vende.
const FILAS = [
  { producto: "Tito's Vodka 1L", contado: 3, llego: 5, vendido: 0.9, live: 7.1, movimiento: true, de: [],
    llegadas: [{ n: 5, cuando: Date.now() - 864e5, de: 'LOOP' }], viene: [], med: MED, agota: enDias(7), enDias: 7 },
  { producto: 'St Germain', contado: 2, llego: 0, vendido: 0.6, live: 1.4, movimiento: true, de: [],
    llegadas: [], viene: [], med: MED, agota: enDias(1), enDias: 1 },
  { producto: 'Guinness Keg', contado: 1, llego: 0, vendido: 0, live: 1, movimiento: false, de: [],
    llegadas: [], viene: [], med: null, agota: null, enDias: null },
  { producto: 'Casamigos', contado: 3, llego: 0, vendido: 0, live: 3, movimiento: false, de: [],
    llegadas: [], viene: [], med: MED, agota: null, enDias: null }
];

async function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  new Function(leer('src/events.js'))();
  new Function(leer('src/bottle-profiles.js'))();
  w.BarStockRunOut = { ahora: async () => (o.contando ? { estado: 'contando' } : { estado: 'listo', hoy: HOY, filas: FILAS }) };
  new Function(leer('src/live-cache.js'))();
  new Function(leer('src/product-hero.js'))();
  const m = (item, vendor, onHand, suggested, category) =>
    ({ item, vendor, code: '', category, onHand, suggested, value: 20, bottleShape: 'vodka', bottleSizeMl: 1000 });
  w.state = { master: [
    m("Tito's Vodka 1L", 'LOOP', 3, 8, 'Vodka'),
    m('St Germain', 'BREAKTHRU', 2, 3, 'Liqueur'),
    m('Guinness Keg', 'SOUTHERN', 1, 1, 'Beer'),
    m('Casamigos', 'BREAKTHRU', 3, 4, 'Tequila')
  ] };
  w.normalizeName = (s) => String(s || '').toLowerCase();
  // Pour·IQ con historia para todos: sus "days" saldrían de partida.
  w.parAdjustments = new Map(w.state.master.map(r => [r.item + '||', { avgUsed: 2, normalWeeks: 8 }]));
  w.__zonasPedidas = [];
  w.BarStockZones = {
    lista: () => [{}], cargar: async () => {}, activas: () => true,
    donde: async (item) => { w.__zonasPedidas.push(item);
      return o.sinReparto ? { zonas: [], at: Date.now() }
        : { zonas: [{ zona: 'Bar', botellas: 2 }, { zona: 'Closet', botellas: 1 }], at: Date.now() }; },
    cuando: () => ({ txt: 'Counted Sun Nov 8', viejo: false })
  };
  w.BarStockProductWeeks = { semanas: async () => [], rumbo: () => null };
  if (!o.sinCargar) await w.BarStockLiveCache.cargar();
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {} };
  new Function(leer('src/mobile-search.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'search';
  w.document.body.appendChild(host);
  def.mount(host);
  return { w, host, buscar: (q) => { const i = host.querySelector('#msInput'); i.value = q; i.oninput(); } };
}
const tarjeta = (host, n) => [...host.querySelectorAll('#msList .m-res')].find(t => (t.querySelector('.m-fic-n') || {}).textContent.includes(n));
const H = (w, nombre, o) => {
  const d = w.document.createElement('div');
  d.innerHTML = w.BarStockProductHero.html(w.state.master.find(r => r.item === nombre), o || {});
  return d;
};

(async () => {

grupo('la cabecera con LIVE');
{
  const { w } = await entorno();
  const t = H(w, "Tito's Vodka 1L");
  const b = t.querySelector('.m-fic-big b');
  prueba('el número es el LIVE, con "≈" y un decimal', b && b.textContent.trim() === '≈7.1', b && b.textContent);
  prueba('"of 8" sigue al lado', /of 8/.test(t.querySelector('.m-fic-big').textContent));
  prueba('"● Live" en la esquina', !!t.querySelector('.m-fic > .m-live.m-fic-live'));
  // El color sale del LIVE: 7.1 de 8 es verde; lo contado (3 de 8) sería ámbar.
  prueba('el color sale del LIVE, no de lo contado', /#4ade80/.test(b.getAttribute('style') || ''), b.getAttribute('style'));
  prueba('la cabecera lleva la clase que hace sitio a la marca', t.querySelector('.m-fic').classList.contains('m-fic-conlive'));

  const s = H(w, 'St Germain');
  const x = s.querySelector('.m-fic-x');
  prueba('Toast lo vende: "Out" bajo el número', !!x && /Out /.test(x.textContent) && !!x.querySelector('.m-out-r'), x && x.innerHTML);
  prueba('y sin los "Runs out in N days" de Pour·IQ', !/Runs out in/.test(s.textContent), s.textContent.replace(/\s+/g, ' '));
  prueba('con LIVE en ámbar: 1.4 de 3', /#fbbf24/.test(s.querySelector('.m-fic-big b').getAttribute('style') || ''));
}

grupo('lo que no se movió, como siempre');
{
  const { w } = await entorno();
  const g = H(w, 'Guinness Keg');
  prueba('lo contado, sin "≈"', g.querySelector('.m-fic-big b').textContent.trim() === '1');
  prueba('sin marca Live', !g.querySelector('.m-live'));
  prueba('Toast no la vende: conserva los días de Pour·IQ', /Runs out in \d+ day/.test(g.textContent), g.textContent.replace(/\s+/g, ' '));
  const c = H(w, 'Casamigos');
  prueba('Toast lo vende pero no se movió: sin marca', !c.querySelector('.m-live'));
  prueba('y sin los días de Pour·IQ: Toast dice que dura más', !/Runs out in/.test(c.textContent), c.textContent.replace(/\s+/g, ' '));
}

grupo('con un conteo activo, lo contado');
{
  const { w } = await entorno({ contando: true });
  const t = H(w, "Tito's Vodka 1L");
  prueba('el número es lo contado', t.querySelector('.m-fic-big b').textContent.trim() === '3');
  prueba('sin marca', !t.querySelector('.m-live'));
}

grupo('Do we have: las tarjetas');
{
  const { w, host, buscar } = await entorno();
  buscar('tito');
  await esperar(30);
  const t = tarjeta(host, "Tito's");
  prueba('la tarjeta enseña el LIVE', !!t && /≈7\.1/.test(t.querySelector('.m-fic-big').textContent));
  prueba('con la marca', !!t && !!t.querySelector('.m-fic-live'));
  prueba('sin zonas en la tarjeta', !!t && !/Closet/.test(t.textContent), t && t.textContent.replace(/\s+/g, ' '));
  prueba('la lista no pide zonas', w.__zonasPedidas.length === 0, String(w.__zonasPedidas.length));
}

grupo('la ficha: zonas y lo que llegó');
{
  const { w, host, buscar } = await entorno();
  buscar('tito');
  await esperar(30);
  tarjeta(host, "Tito's").click();
  await esperar(30);
  const hoja = w.document.querySelector('#mSheet');
  prueba('la cabecera de la ficha enseña el LIVE', !!hoja && /≈7\.1/.test(hoja.querySelector('.m-fic-big').textContent));
  const z = hoja && hoja.querySelector('#msZonas');
  const t = z ? z.textContent.replace(/\s+/g, ' ') : '';
  prueba('las zonas, tal como se contaron', /2\s*Bar/.test(t) && /1\s*Closet/.test(t), t);
  const lleg = z && z.querySelector('.m-zon-t.lleg');
  prueba('lo que llegó, en una pieza aparte', !!lleg && /\+5/.test(lleg.textContent) && /Arrived/.test(lleg.textContent), lleg && lleg.textContent);
  prueba('y de dónde vino, junto a cuándo se contó', /Counted Sun Nov 8 · arrived \w+, LOOP order/.test(t), t);
  prueba('los "Lasts about" de Pour·IQ no salen si Toast lo vende', !/Lasts about/.test(hoja.textContent));
}
{
  const { w, host, buscar } = await entorno();
  buscar('germain');
  await esperar(30);
  tarjeta(host, 'St Germain').click();
  await esperar(30);
  const z = w.document.querySelector('#msZonas');
  prueba('nada llegó: sin la pieza de lo que llegó', !!z && !z.querySelector('.lleg') && !/arrived/.test(z.textContent), z && z.textContent);
}
{
  const { w, host, buscar } = await entorno({ sinReparto: true });
  buscar('tito');
  await esperar(30);
  tarjeta(host, "Tito's").click();
  await esperar(30);
  const z = w.document.querySelector('#msZonas');
  prueba('sin reparto por zonas, lo que llegó también se dice', !!z && /Not counted by zone yet/.test(z.textContent) && !!z.querySelector('.lleg'), z && z.innerHTML);
}

grupo('el LIVE llega con Do we have abierto');
{
  // Se entra directo a buscar sin pasar por Inventory: nadie lo pidió
  // todavía. La pantalla lo pide al enseñarse y se repinta al llegar,
  // también la cabecera de una ficha abierta.
  const { w, host, buscar } = await entorno({ sinCargar: true });
  host.classList.add('on');
  buscar('tito');
  await esperar(10);
  tarjeta(host, "Tito's").click();
  await esperar(10);
  const antes = w.document.querySelector('#mSheet .m-fic-big b').textContent.trim();
  w.BarStockMobileSearch.show(host);
  buscar('tito');
  tarjeta(host, "Tito's").click();
  await esperar(40);
  prueba('antes de llegar, lo contado', antes === '3', antes);
  prueba('al llegar, la tarjeta se repinta con el LIVE', /\u22487\.1/.test(tarjeta(host, "Tito's").querySelector('.m-fic-big').textContent));
}
{
  const { w, host, buscar } = await entorno({ sinCargar: true });
  host.classList.add('on');
  buscar('tito');
  await esperar(10);
  tarjeta(host, "Tito's").click();
  await esperar(10);
  const hoja = w.document.querySelector('#mSheet');
  await w.BarStockLiveCache.cargar();
  await esperar(20);
  prueba('con la ficha abierta, se repinta su cabecera sin cerrarla',
    w.document.querySelector('#mSheet') === hoja && /\u22487\.1/.test(hoja.querySelector('.m-fic-big').textContent),
    hoja.querySelector('.m-fic-big').textContent);
  prueba('y "Where it is" añade lo que llegó', !!hoja.querySelector('#msZonas .lleg'));
}

grupo('el número que llegó lo calcula live-stock, una vez');
{
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  global.window = dom.window;
  window.BarStockOrderReceipts = { mismoNombre: (a, b) => String(a).toLowerCase() === String(b).toLowerCase() };
  new Function(leer('src/live-stock.js'))();
  const ahora = Date.parse('2026-11-11T18:00:00Z');
  const filas = window.BarStockLive.calcular({
    master: [{ item: "Tito's", onHand: 3 }],
    ordenes: [{ id: 1, vendor: 'LOOP', po_number: 'CT-1', created_at: '2026-11-09T15:00:00Z', arrives_at: '2026-11-10T12:00:00Z' }],
    repartido: new Map([['1', [{ item: "Tito's", pedido: 5, recibido: 0 }]]]),
    recibos: [{ item: "Tito's", qty: 2, fecha: Date.parse('2026-11-10T12:00:00Z'), usado: false }],
    conteo: Date.parse('2026-11-09T03:00:00Z'), diaConteo: '2026-11-08', ahora, vendido: []
  });
  const f = filas[0];
  prueba('cada llegada, con cuánto, cuándo y de quién',
    f.llegadas && f.llegadas.length === 2 && f.llegadas[0].n === 5 && f.llegadas[0].de === 'LOOP' &&
    f.llegadas[0].cuando === Date.parse('2026-11-10T12:00:00Z') && f.llegadas[1].n === 2 && f.llegadas[1].de === '',
    JSON.stringify(f.llegadas));
  prueba('y suman lo mismo que "llegó"', f.llego === 7, String(f.llego));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
