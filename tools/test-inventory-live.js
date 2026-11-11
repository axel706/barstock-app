#!/usr/bin/env node
/*
 * ── Inventory: el LIVE en la lista ───────────────────────────────────
 *
 * Axel, 2026-11-11, opción A con decimal: el número grande es el LIVE
 * con "≈" y un decimal, y la línea de abajo empieza con "● Live". Lo que
 * se protege:
 *   1. Lo que se movió desde el conteo: "≈7.1", con la marca.
 *   2. Lo que no se movió (la cerveza, lo que no se vendió ni llegó): lo
 *      contado, sin marca. "Live" sin nada detrás miente.
 *   3. Un LIVE negativo se enseña tal cual, en rojo.
 *   4. El color, la barra y el orden "lo que falta primero" salen del
 *      MISMO número que se enseña.
 *   5. Con un conteo activo, lo contado y sin marca.
 *   6. on_hand no se toca.
 *
 *   node tools/test-inventory-live.js
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
const grupo = t => console.log('\n' + t);
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const ITEMS = [
  ["Tito's Vodka 1L", 'LOOP', 3, 8],
  ['Bulleit Rye', 'BREAKTHRU', 1, 2],
  ['Guinness Keg', 'SOUTHERN', 1, 1],
  ['Baileys 1L', 'LOOP', 1, 4]
];

function pantalla(vivo, agota) {
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.state = { master: ITEMS.map(([item, vendor, onHand, suggested]) => ({ item, vendor, onHand, suggested, value: 20, category: 'Liquor', code: '', toOrder: 0 })) };
  w.normalizeName = (s) => String(s || '').trim().toLowerCase();
  w.getVendorsForFilter = () => ['ALL', 'LOOP', 'BREAKTHRU', 'SOUTHERN'];
  w.getVendorsWithUnknown = () => ['LOOP', 'BREAKTHRU', 'SOUTHERN'];
  // Pour·IQ con gasto medio para todos: así sus "days" salen de partida.
  w.parAdjustments = new Map(ITEMS.map(([item]) => [item + '||', { avgUsed: 2, normalWeeks: 8 }]));
  w.__llamadas = 0;
  w.BarStockLive = { ahora: async () => { w.__llamadas++; return vivo; } };
  if (agota) w.BarStockRunOut = { ahora: async () => { w.__llamadas++; return agota; } };
  w.eval(leer('src/product-hero.js'));
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, refrescarBadges() {} };
  w.eval(leer('src/mobile-inventory.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'inventory';
  w.document.body.appendChild(host);
  def.mount(host);
  return { w, host, def };
}
const fila = (host, n) => [...host.querySelectorAll('.m-inv')].find(b => (b.querySelector('.m-inv-n') || {}).textContent === n);
const VIVO = { estado: 'listo', filas: [
  { producto: "Tito's Vodka 1L", contado: 3, llego: 5, vendido: 0.9, live: 7.1, movimiento: true, de: [] },
  { producto: 'Bulleit Rye', contado: 1, llego: 0, vendido: 1.4, live: -0.4, movimiento: true, de: [] },
  { producto: 'Guinness Keg', contado: 1, llego: 0, vendido: 0, live: 1, movimiento: false, de: [] },
  { producto: 'Baileys 1L', contado: 1, llego: 0, vendido: 0, live: 1, movimiento: false, de: [] }
] };

(async () => {

grupo('lo que se movió y lo que no');
{
  const { host, w } = pantalla(VIVO);
  await esperar(20);
  const t = fila(host, "Tito's Vodka 1L");
  prueba('el LIVE con "≈" y un decimal', /≈7\.1/.test(t.querySelector('.m-inv-v b').textContent), t.querySelector('.m-inv-v b').textContent);
  prueba('con "● Live" al principio de la línea de abajo', !!t.querySelector('.m-inv-meta .m-live') && t.querySelector('.m-inv-meta').firstElementChild.classList.contains('m-live'));
  const g = fila(host, 'Guinness Keg');
  prueba('lo que no se movió: lo contado, sin marca', g.querySelector('.m-inv-v b').textContent.trim() === '1' && !g.querySelector('.m-live'));
  const b = fila(host, 'Bulleit Rye');
  prueba('un negativo, tal cual', /≈-0\.4/.test(b.querySelector('.m-inv-v b').textContent), b.querySelector('.m-inv-v b').textContent);
  const rojo = w.BarStockProductHero.tono({ onHand: 0, suggested: 2 }).c;
  const H = w.BarStockProductHero;
  const colorDe = (el) => el.querySelector('.m-inv-v b').getAttribute('style');
  prueba('el color sale del LIVE, no de lo contado (Tito\'s 7.1/8 es verde)', colorDe(t).includes(H.tono({ onHand: 7.1, suggested: 8 }).c) && !colorDe(t).includes(H.tono({ onHand: 3, suggested: 8 }).c));
  prueba('el negativo, rojo como "out of stock"', colorDe(b).includes(rojo));
  const barra = t.querySelector('.m-inv-bar');
  prueba('la barra también (89 % y no 37 %)', !!barra && /width:\s*89%/.test(barra.getAttribute('style')), barra && barra.getAttribute('style'));
  prueba('on_hand no se toca', w.state.master.find(r => r.item === "Tito's Vodka 1L").onHand === 3 && w.state.master.find(r => r.item === 'Bulleit Rye').onHand === 1);
  prueba('se pidió una vez', w.__llamadas === 1);
}

grupo('con un conteo activo');
{
  const { host } = pantalla({ estado: 'contando' });
  await esperar(20);
  const t = fila(host, "Tito's Vodka 1L");
  prueba('lo contado, sin marca', t.querySelector('.m-inv-v b').textContent.trim() === '3' && !host.querySelector('.m-live'));
}

grupo('si el LIVE falla');
{
  const { host, w } = pantalla(null);
  w.BarStockLive.ahora = async () => { throw new Error('red'); };
  await esperar(20);
  prueba('la lista sigue, con lo contado', !!fila(host, "Tito's Vodka 1L") && !host.querySelector('.m-live'));
}

grupo('cuándo se acaba (opción C)');
{
  const med = [1, 0, 1, 1, 1, 2, 2];
  const AG = { estado: 'listo', filas: [
    Object.assign({}, VIVO.filas[0], { med, agota: '2026-11-28', enDias: 9 }),
    Object.assign({}, VIVO.filas[1], { med, agota: '2026-11-19', enDias: 0 }),
    Object.assign({}, VIVO.filas[2], { med: null, agota: null, enDias: null }),
    Object.assign({}, VIVO.filas[3], { med, agota: '2026-11-21', enDias: 2 })
  ] };
  const { host } = pantalla(null, AG);
  await esperar(20);
  const meta = (n) => fila(host, n).querySelector('.m-inv-meta');
  const out = (n) => (meta(n).querySelector('.m-out') || {});
  prueba('a dos días: el día de la semana, en rojo', /Out Sat/.test(out('Baileys 1L').textContent) && out('Baileys 1L').classList.contains('m-out-r'), out('Baileys 1L').textContent);
  prueba('más de seis días: con la fecha, en gris', /Out Nov 28/.test(out("Tito's Vodka 1L").textContent) && out("Tito's Vodka 1L").classList.contains('m-out-g'));
  prueba('un LIVE por debajo de cero: "Out now"', /Out now/.test(out('Bulleit Rye').textContent));
  prueba('va detrás de "● Live"', meta("Tito's Vodka 1L").firstElementChild.classList.contains('m-live') && meta("Tito's Vodka 1L").children[1].classList.contains('m-out'));
  prueba('lo que Toast vende pierde los "days" de Pour·IQ', !/days?\b/.test(meta("Tito's Vodka 1L").textContent) && !/days?\b/.test(meta('Baileys 1L').textContent), meta('Baileys 1L').textContent);
  prueba('lo que Toast no vende (la cerveza) conserva sus "days"', /\d+ days?/.test(meta('Guinness Keg').textContent) && !meta('Guinness Keg').querySelector('.m-out'), meta('Guinness Keg').textContent);
}
{
  // Sin "cuándo se acaba" cargado, el LIVE solo, y los "days" de siempre.
  const { host } = pantalla(VIVO);
  await esperar(20);
  prueba('sin run-out: ni "Out" ni se quitan los days', !host.querySelector('.m-out') && /\d+ days?/.test(fila(host, "Tito's Vodka 1L").querySelector('.m-inv-meta').textContent));
}

grupo('la carga');
{
  const html = leer('index.html');
  const p = f => html.indexOf('src/' + f + '?v=');
  prueba('el LIVE carga antes que Inventory', p('live-stock.js') > 0 && p('live-stock.js') < p('mobile-inventory.js'), p('live-stock.js') + ' / ' + p('mobile-inventory.js'));
  prueba('y "cuándo se acaba" también', p('run-out.js') > 0 && p('run-out.js') < p('mobile-inventory.js'));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
