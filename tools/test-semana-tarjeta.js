#!/usr/bin/env node
/*
 * ── "Do we have": la semana en la tarjeta ────────────────────────────
 *
 * Axel, 2026-11-13, opción A sobre lámina: la tarjeta de un producto con
 * "Live" lleva una línea con lo que quedaba cada día desde el conteo,
 * "solo en las que tienen Live" y "que las tarjetas no crezcan
 * demasiado". Lo que se protege:
 *
 *   1. Día a día desde el conteo: lo contado, más lo que llegó ESE día,
 *      menos lo vendido ese día. El último punto es el LIVE, el mismo
 *      número grande de la tarjeta, no otro cálculo.
 *   2. Una llegada sin hora cuenta hoy: si no, el último punto no
 *      cuadraría con el LIVE, que sí la suma.
 *   3. Sólo en la lista de "Do we have" y sólo con LIVE.
 *   4. Más de ocho días no se apretujan: los ocho últimos, "Since …".
 *   5. La gráfica mide 48 px: la tarjeta no crece de más.
 *
 *   node tools/test-semana-tarjeta.js
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
const txt = (el) => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';

const DESDE = '2026-11-08', HOY = '2026-11-13';   // conteo el domingo; hoy, viernes
// Las 10 AM de Nueva York del martes: su día de negocio es el martes.
const MARTES = Date.parse('2026-11-10T15:00:00Z');
const diaDe = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(new Date(t).getTime() - 4 * 3600e3));

function cargarLive() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  global.window = dom.window; global.document = dom.window.document;
  window.BarStockOrderReceipts = { mismoNombre: (a, b) => a === b };
  new Function(leer('src/live-stock.js'))();
  return window.BarStockLive;
}

grupo('día a día desde el conteo');
{
  const L = cargarLive();
  const filas = L.calcular({
    master: [{ item: "Tito's Vodka", onHand: 18 }], ordenes: [], recibos: [],
    conteo: Date.parse('2026-11-09T02:00:00Z'), diaConteo: DESDE,
    vendido: [{ producto: "Tito's Vodka", botellas: 2.5,
      porDia: { '2026-11-10': 0.9, '2026-11-11': 0.6, '2026-11-12': 0.6, '2026-11-13': 0.4 } }]
  });
  const f = filas[0];
  prueba('el LIVE guarda lo vendido por día', f.porDia && f.porDia['2026-11-11'] === 0.6, JSON.stringify(f.porDia));
  f.llegadas.push({ n: 2, cuando: MARTES, de: 'LOOP' });
  f.llego = 2; f.live = 17.5;
  const p = L.diaADia(f, DESDE, HOY, diaDe);
  prueba('seis días, del conteo a hoy', p.length === 6 && p[0].fecha === DESDE && p[5].fecha === HOY, p.map(x => x.fecha).join(','));
  prueba('empieza con lo contado', p[0].queda === 18);
  prueba('el lunes, cerrado: igual', p[1].queda === 18);
  prueba('el martes: +2 llegó, −0.9 vendido', p[2].queda === 19.1 && p[2].llego === 2 && p[2].vendido === 0.9, JSON.stringify(p[2]));
  prueba('acaba en el LIVE', p[5].queda === f.live, p[5].queda + ' vs ' + f.live);

  const sinHora = L.diaADia(Object.assign({}, f, { llegadas: [{ n: 2, cuando: null }] }), DESDE, HOY, diaDe);
  prueba('una llegada sin hora cuenta hoy, y sigue cuadrando', sinHora[5].llego === 2 && sinHora[2].llego === 0 && sinHora[5].queda === 17.5,
    JSON.stringify(sinHora[5]));
  const conVenta = L.diaADia(Object.assign({}, f, { porDia: Object.assign({ [DESDE]: 5 }, f.porDia) }), DESDE, HOY, diaDe);
  prueba('lo vendido el día del conteo no se resta (no está en el LIVE)', conVenta[0].queda === 18);
}

function lista(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.BarStockOrderReceipts = { mismoNombre: (a, b) => a === b };
  new Function(leer('src/live-stock.js'))();
  new Function(leer('src/bottle-profiles.js'))();
  new Function(leer('src/product-hero.js'))();
  w.state = { master: [
    { item: "Tito's Vodka", vendor: 'LOOP', onHand: 18, suggested: 18, bottleSizeMl: 750 },
    { item: "Tito's Vodka 1L", vendor: 'LOOP', onHand: 4, suggested: 6, bottleSizeMl: 1000 } ] };
  w.normalizeName = (s) => String(s || '').toLowerCase();
  w.parAdjustments = new Map();
  const dias = o.dias || 5;
  const desde = new Date(Date.parse(HOY + 'T12:00:00Z') - dias * 864e5).toISOString().slice(0, 10);
  const porDia = {};
  for (let k = 1; k <= dias; k++) porDia[new Date(Date.parse(desde + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10)] = 0.5;
  const vendido = dias * 0.5;
  // Sólo el de 750 se movió: el de litro no tiene LIVE.
  const fila = { producto: "Tito's Vodka", contado: 18, llego: 0, vendido, live: 18 - vendido, porDia, llegadas: [] };
  w.BarStockLiveCache = {
    cargar() {}, alCambiar() {}, toastLoVende: () => false, etiquetaAgota: () => '', llegadas: () => null,
    vivo: (r) => r.item === "Tito's Vodka" ? fila : null,
    semana: (r) => r.item === "Tito's Vodka" ? w.BarStockLive.diaADia(fila, desde, HOY, diaDe) : null
  };
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {} };
  new Function(leer('src/mobile-search.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'search';
  w.document.body.appendChild(host);
  def.mount(host);
  const inp = host.querySelector('#msInput');
  inp.value = 'tito'; inp.oninput();
  return { w, host, fila };
}
const tarjeta = (h, n) => [...h.querySelectorAll('.m-res-fic')].find(c => txt(c.querySelector('.m-fic-n')) === n);

grupo('en la lista de "Do we have"');
{
  const { w, host } = lista();
  const t = tarjeta(host, "Tito's Vodka");
  const s = t && t.querySelector('.m-dad');
  prueba('la tarjeta con Live lleva la semana', !!s);
  prueba('dentro de la tarjeta, no debajo', !!s && !!s.closest('.m-fic') && s.closest('.m-fic').classList.contains('m-fic-consem'));
  prueba('sin Live, no', !tarjeta(host, "Tito's Vodka 1L").querySelector('.m-dad'));
  const vs = [...s.querySelectorAll('.m-dad-v')].map(txt);
  prueba('un número por día: de 18 a lo que queda', JSON.stringify(vs) === JSON.stringify(['18', '17.5', '17', '16.5', '16', '15.5']), JSON.stringify(vs));
  prueba('el último es el número grande de la tarjeta', ('≈' + vs[vs.length - 1]) === txt(t.querySelector('.m-fic-big b')).replace('.0', ''),
    txt(t.querySelector('.m-fic-big b')));
  const ds = [...s.querySelectorAll('.m-dad-d span')].map(txt);
  prueba('los días, y el último "Today"', JSON.stringify(ds) === JSON.stringify(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Today']), JSON.stringify(ds));
  prueba('el de hoy, marcado', s.querySelectorAll('.m-dad-p.hoy').length === 1 && s.querySelectorAll('.m-dad-p')[5].classList.contains('hoy'));
  prueba('"This week" con cuánto empezó y cuánto se usó', /^This week\s*started 18 · used 2\.5$/.test(txt(s.querySelector('.m-dad-k'))), txt(s.querySelector('.m-dad-k')));
  const ys = [...s.querySelectorAll('.m-dad-p')].map(p => parseFloat(p.style.top));
  prueba('baja: cada punto más abajo que el anterior', ys.every((y, i) => !i || y > ys[i - 1]), ys.join(','));
  prueba('la ficha (sin `semana`) no la lleva', !/m-dad/.test(w.BarStockProductHero.html(w.state.master[0], {})));
}
{
  const { host } = lista({ dias: 12 });
  const s = tarjeta(host, "Tito's Vodka").querySelector('.m-dad');
  prueba('un conteo viejo: los ocho últimos días', s.querySelectorAll('.m-dad-p').length === 8);
  prueba('y el título dice desde cuándo', /^Since Nov 6/.test(txt(s.querySelector('.m-dad-k'))), txt(s.querySelector('.m-dad-k')));
}

grupo('no crece de más');
{
  const css = leer('styles/mobile-app.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const g = (/\.m-dad-g\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
  prueba('la gráfica mide 48 px', /height:\s*48px/.test(g), g.trim());
  prueba('y el dibujo usa esos 48', /const ALTO = 48/.test(leer('src/product-hero.js')));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
