#!/usr/bin/env node
/*
 * ── El LIVE en el Home ───────────────────────────────────────────────
 *
 * Axel, 2026-11-11, sobre lámina (A + A, con sus ajustes):
 *
 *   Running out first
 *     1. "● Live" ANTES del título.
 *     2. Lo que Toast vende entra por su día ("Out today", "Out Thu"),
 *        el que se acaba antes primero, y sólo lo de los próximos 7 días.
 *        Lo que Toast no vende (la cerveza) sigue con Pour·IQ, sobre el
 *        mismo número que enseña Inventory.
 *     3. En la esquina, cuántos se acaban en dos días ("2 by Thu").
 *
 *   On the shelf
 *     4. El número es LIVE × precio, con "● Live" antes del título, y
 *        lleva el protagonismo: debajo sólo "Details".
 *     5. "Details" abre el aviso de la app (el de reiniciar el ciclo),
 *        sin que la tarjeta crezca, con la cuenta: contado, llegado,
 *        vendido y el total. Los productos sin precio, aparte.
 *     6. Sin LIVE (conteo activo), lo de antes: contado + lo facturado
 *        desde el conteo, sin marca.
 *
 *   node tools/test-home-live.js
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
const fila = (producto, contado, llego, vendido, k) => ({
  producto, contado, llego, vendido, live: Math.round((contado + llego - vendido) * 100) / 100,
  movimiento: llego !== 0 || vendido !== 0, de: [], llegadas: [], viene: [],
  med: k === null ? null : MED, agota: k == null ? null : enDias(k), enDias: k == null ? null : k
});
// St Germain se acaba hoy, Bulleit en 2 días, Tito's en 4, Baileys en 6,
// Casamigos en 10 (fuera de la semana). Guinness no la vende Toast.
const FILAS = [
  fila('St Germain', 1, 0, 0.6, 0),
  fila('Bulleit Rye', 1, 0, 0.4, 2),
  fila("Tito's Vodka 1L", 3, 5, 0.9, 4),
  fila('Baileys 1L', 2, 0, 0.5, 6),
  fila('Casamigos', 4, 0, 0.2, 10),
  fila('Guinness Keg', 1, 0, 0, null)
];

async function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  new Function(leer('src/events.js'))();
  new Function(leer('src/dialog.js'))();
  // `lento`: el LIVE llega DESPUÉS del resto de lo que repinta el Home
  // (el resumen de facturas), para que sólo lo repinte alCambiar.
  w.BarStockRunOut = { ahora: async () => (o.lento ? await esperar(60) : null, o.contando ? { estado: 'contando' } : { estado: 'listo', hoy: HOY, conteo: '2026-11-09T04:30:00Z', filas: FILAS }) };
  new Function(leer('src/live-cache.js'))();
  const m = (item, onHand, suggested, value) => ({ item, vendor: 'LOOP', code: '', category: 'Liquor', onHand, suggested, value });
  w.state = { master: [
    m('St Germain', 1, 3, 30), m('Bulleit Rye', 1, 2, 28), m("Tito's Vodka 1L", 3, 8, 20),
    m('Baileys 1L', 2, 4, 25), m('Casamigos', 4, 4, 40), m('Guinness Keg', 1, 1, 190), m('Sin precio', 2, 2, 0)
  ] };
  // inventory-value lee `state` suelto: en el navegador es window.state.
  global.state = w.state;
  // "Sin precio" sin Pour·IQ: sólo está para el dinero.
  w.parAdjustments = new Map(w.state.master.filter(r => r.item !== 'Sin precio')
    .map(r => [r.item + '||', { avgUsed: 2, normalWeeks: 8, status: 'active' }]));
  w.normalizeName = (s) => String(s || '').toLowerCase();
  w.BARSTOCK_CONFIG = { LOCATION_NAME: 'Crown Tavern' };
  new Function(leer('src/inventory-value.js'))();
  // Lo facturado desde el conteo, como lo apunta hoy mobile-history.
  // Lo facturado desde el conteo: el Home se lo pide al resumen de
  // facturas y se lo deja a inventory-value (depositarLlegado).
  w.BarStockMobileInvoices = { resumen: async () => ({ n: 1, unidades: 10, dinero: 500, sueltas: 0, ultima: '' }) };
  if (!o.sinCargar) await w.BarStockLiveCache.cargar();
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {} };
  new Function(leer('src/mobile-home.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'home';
  w.document.body.appendChild(host);
  def.mount(host);
  // Con sinCargar se mira el Home tal como sale, antes de que llegue.
  if (!o.sinCargar) await esperar(20);
  return { w, host };
}
const tarjeta = (host) => [...host.querySelectorAll('.m-hero')].find(c => /Running out first/i.test(c.textContent));
const estante = (host) => [...host.querySelectorAll('.m-stat')].find(c => /On the shelf/i.test(c.textContent));

(async () => {

grupo('Running out first, con Toast');
{
  const { host } = await entorno();
  const c = tarjeta(host);
  prueba('la tarjeta sale', !!c);
  const k = c.querySelector('.m-hero-k');
  prueba('"● Live" antes del título', !!k && !!k.firstElementChild && k.firstElementChild.classList.contains('m-live') &&
    /Running out first/.test(k.textContent), k && k.innerHTML);
  const ln = [...c.querySelectorAll('.m-hln')];
  const nombres = ln.map(l => l.querySelector('.n').textContent.trim());
  prueba('el que se acaba antes, primero', nombres[0] === 'St Germain' && nombres[1] === 'Bulleit Rye', nombres.join(', '));
  const o0 = ln[0] && ln[0].querySelector('.m-out');
  prueba('con su día: "Out today", en rojo', !!o0 && o0.textContent === 'Out today' && o0.classList.contains('m-out-r'), o0 && o0.outerHTML);
  prueba('sin "/wk"', !/\/wk/.test(c.textContent), c.textContent.replace(/\s+/g, ' '));
  prueba('lo que se acaba en 10 días no entra', !/Casamigos/.test(c.textContent));
  // St Germain, Bulleit, Tito's y Baileys (Toast) + Guinness (Pour·IQ: 1 / 2 × 7 = 4 días).
  prueba('el titular cuenta lo de la semana', /5 run out this week/.test(c.querySelector('.m-hero-t').textContent),
    c.querySelector('.m-hero-t').textContent);
  const amt = c.querySelector('.m-hero-amt');
  // St Germain (0) y Bulleit (2).
  prueba('en la esquina, los de dos días o menos', !!amt && /^2/.test(amt.textContent.trim()) && /by \w{3}/.test(amt.textContent),
    amt && amt.textContent.replace(/\s+/g, ' '));
  prueba('el pie cuenta los que no caben', /and 2 more/.test(c.textContent), c.textContent.replace(/\s+/g, ' '));
}
{
  const { host } = await entorno({ contando: true });
  const c = tarjeta(host);
  prueba('con un conteo activo, sin marca', !c || !c.querySelector('.m-live'));
}

grupo('On the shelf, con LIVE');
{
  const { w, host } = await entorno();
  const e = estante(host);
  const k = e.querySelector('.m-stat-k');
  prueba('"● Live" antes del título', !!k.firstElementChild && k.firstElementChild.classList.contains('m-live'), k.innerHTML);
  // Contado: 30 + 28 + 60 + 50 + 160 + 190 = 518. Llegó: 5 × 20 = 100.
  // Vendido: .6×30 + .4×28 + .9×20 + .5×25 + .2×40 = 18 + 11.2 + 18 + 12.5 + 8 = 67.7.
  // LIVE: 518 + 100 − 67.7 = 550.3.
  const v = e.querySelector('.m-stat-v').textContent.trim();
  prueba('el número es LIVE × precio', v === '$550', v);
  const d = e.querySelector('.m-stat-d');
  prueba('debajo, sólo "Details"', !!d && /^Details$/.test(d.textContent.trim()), d && d.textContent);
  prueba('sin la cuenta en la tarjeta', !/counted/.test(e.textContent));

  let opc = null;
  w.BarStockDialog.avisar = (o) => { opc = o; return Promise.resolve(true); };
  const btn = e.querySelector('[data-detalle]');
  prueba('"Details" se puede tocar', !!btn);
  if (btn) btn.click();
  await esperar(5);
  const filas = opc && opc.filas ? opc.filas.map(f => f.k + '=' + f.v).join(' | ') : '';
  prueba('abre el aviso con la cuenta', !!opc && /On the shelf/.test(opc.titulo) &&
    /Counted .*=\$518/.test(filas) && /Arrived since=\+\$100/.test(filas) &&
    /Sold in Toast since=−\$68/.test(filas) && /On the shelf now=\$550/.test(filas), filas);
  prueba('y dice los que no tienen precio', !!opc && /1 item has no price/.test(opc.nota || ''), opc && opc.nota);
}

grupo('On the shelf, sin LIVE');
{
  const { host } = await entorno({ contando: true });
  const e = estante(host);
  prueba('sin marca', !e.querySelector('.m-live'));
  // Contado 518 + facturado desde el conteo 500 = 1,018, como antes.
  prueba('contado + lo facturado, como antes', e.querySelector('.m-stat-v').textContent.trim() === '$1,018',
    e.querySelector('.m-stat-v').textContent);
}

grupo('el LIVE llega con el Home pintado');
{
  const { w, host } = await entorno({ sinCargar: true, lento: true });
  await esperar(30);
  prueba('antes, sin marca', !estante(host).querySelector('.m-live'));
  await esperar(60);
  prueba('el Home lo pide al pintarse y se repinta al llegar', !!estante(host).querySelector('.m-live') &&
    estante(host).querySelector('.m-stat-v').textContent.trim() === '$550', estante(host).textContent.replace(/\s+/g, ' '));
}

grupo('el aviso acepta filas');
{
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  global.window = dom.window; global.document = dom.window.document;
  new Function(leer('src/dialog.js'))();
  window.BarStockDialog.avisar({ titulo: 'T', cuerpo: 'c',
    filas: [{ k: 'Counted <b>', v: '$1' }, { k: 'Total', v: '$2', total: true }], nota: 'n' });
  await esperar(5);   // se abre por cola, en el tic siguiente
  const bg = document.getElementById('dlgBg');
  const f = bg.querySelectorAll('.dlg-filas > span');
  prueba('una línea por fila, con su valor', f.length === 4 && f[1].textContent === '$1');
  prueba('escapadas', /Counted &lt;b&gt;/.test(bg.innerHTML));
  prueba('el total, marcado', !!bg.querySelector('.dlg-filas .tot'));
  prueba('y la nota debajo', !!bg.querySelector('.dlg-nota') && bg.querySelector('.dlg-nota').textContent === 'n');
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
