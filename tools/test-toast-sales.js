#!/usr/bin/env node
/*
 * ── Toast Sales: la tarjeta del Home ─────────────────────────────────
 *
 * Axel, 2026-11-12, sobre lámina. Lo que se protege:
 *
 *   1. La semana son los siete días CERRADOS hasta ayer: hoy sigue
 *      abierto y su barra crecería como si fuera un día flojo.
 *   2. Las botellas salen del mismo cálculo que el LIVE (porDia de
 *      toast-usage); el dinero, del Net sales guardado.
 *   3. El dinero es licor + vino. La cerveza y el open bar ("Banquet
 *      Beverage") no entran. Una fila sin precio no suma como $0.
 *   4. "Un día normal" es la mediana de ese día de la semana ANTES de
 *      él, con al menos cuatro muestras.
 *   5. La tarjeta abre en ayer; tocar una barra elige ese día; Bottles /
 *      $ cambia la vista, y en $ salen licor y vino.
 *   6. Sin días de Toast cargados, no hay tarjeta.
 *   7. Pintar no entra en un bucle de pedir y repintar.
 *
 *   node tools/test-toast-sales.js
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

const HOY = '2026-11-11';   // miércoles, abierto
const sumar = (d, k) => new Date(new Date(d + 'T12:00:00Z').getTime() + k * 864e5).toISOString().slice(0, 10);
const dow = (d) => new Date(d + 'T12:00:00Z').getUTCDay();

// 13 semanas cerradas hasta ayer, y hoy abierto. Los lunes, cerrado:
// sin ventas. Los martes se vende más (2 botellas, $200 de licor);
// el último martes, 3 botellas y $300.
function datos() {
  const dias = [], porDia = {}, ventas = [];
  for (let k = 91; k >= 1; k--) {
    const f = sumar(HOY, -k);
    dias.push({ business_date: f, complete: true, closed: true });
    if (dow(f) === 1) continue;
    const martes = dow(f) === 2;
    const ultimo = f === sumar(HOY, -1);
    porDia[f] = ultimo ? 3 : martes ? 2 : 1;
    ventas.push({ business_date: f, toast_item_name: "Tito's", sales_category: 'Liquor', net: ultimo ? 300 : martes ? 200 : 100, quantity: 10 });
    ventas.push({ business_date: f, toast_item_name: 'Sauv Blanc', sales_category: 'Wine', net: 50, quantity: 4 });
    ventas.push({ business_date: f, toast_item_name: 'IPA', sales_category: 'Beer', net: 40, quantity: 8 });
    ventas.push({ business_date: f, toast_item_name: 'Silver Bar', sales_category: 'Banquet Beverage', net: 900, quantity: 30 });
  }
  dias.push({ business_date: HOY, complete: true, closed: false });
  porDia[HOY] = 9;
  ventas.push({ business_date: HOY, toast_item_name: "Tito's", sales_category: 'Liquor', net: 999, quantity: 1 });
  // Una fila sin precio el último martes: no suma como $0.
  ventas.push({ business_date: sumar(HOY, -1), toast_item_name: 'Rosé', sales_category: 'Wine', net: null, quantity: 1 });
  return { dias, ventas, productos: [{ producto: "Tito's Vodka 1L", porDia }, { producto: 'Sauv Blanc', porDia: { [sumar(HOY, -1)]: 0.5 } }] };
}

function cargar(w) {
  new Function(leer('src/run-out.js'))();
  new Function(leer('src/toast-sales.js'))();
}

grupo('la semana y sus números');
{
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  global.window = dom.window; global.document = dom.window.document;
  cargar();
  const TS = window.BarStockToastSales;
  const D = datos();
  const r = TS.resumir(Object.assign({ hoy: HOY }, D));
  const s = r.semana;
  prueba('siete días', s.length === 7, String(s.length));
  prueba('acaba ayer, no hoy (abierto)', s[6].fecha === '2026-11-10' && !s.some(x => x.fecha === HOY), s.map(x => x.fecha).join(','));
  prueba('con su día de la semana', s[6].dia === 'Tue' && s[0].dia === 'Wed', s.map(x => x.dia).join(','));
  prueba('botellas del día: todos los productos', s[6].botellas === 3.5, String(s[6].botellas));
  prueba('dinero: licor + vino', s[6].licor === 300 && s[6].vino === 50 && s[6].dinero === 350, JSON.stringify(s[6]));
  prueba('sin cerveza ni open bar', s[5].dinero === 0 && s[0].dinero === 150, s[0].dinero + ' / ' + s[5].dinero);
  prueba('la fila sin precio no suma, y se cuenta', s[6].sinPrecio === 1, String(s[6].sinPrecio));
  prueba('un martes normal: la mediana de los martes de antes', s[6].normalBotellas === 2 && s[6].normalDinero === 250,
    s[6].normalBotellas + ' / ' + s[6].normalDinero);
  prueba('el lunes cerrado: 0 y lo normal 0', s[5].dia === 'Mon' && s[5].botellas === 0 && s[5].normalBotellas === 0);
  // Con menos de cuatro muestras del día, no hay "normal".
  const corto = TS.resumir({ hoy: HOY, productos: D.productos, ventas: D.ventas,
    dias: D.dias.filter(d => d.business_date >= sumar(HOY, -15)) });
  prueba('con menos de cuatro muestras, sin "normal"', corto.semana[6].normalBotellas === null, String(corto.semana[6].normalBotellas));

  const tb = TS.masVendido(D, '2026-11-10', 'botellas');
  prueba('lo más vendido en botellas, de mayor a menor', tb[0].nombre === "Tito's Vodka 1L" && tb[0].botellas === 3 && tb[1].botellas === 0.5);
  const td = TS.masVendido(D, '2026-11-10', 'dinero');
  prueba('en dinero, por artículo de Toast y sin cerveza', td.length === 2 && td[0].nombre === "Tito's" && td[0].dinero === 300 &&
    !td.some(x => x.nombre === 'IPA' || x.nombre === 'Silver Bar'), JSON.stringify(td));
}

async function home(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.__lecturas = 0;
  const D = datos();
  w.BarStockToastUsage = {
    diaDeNegocio: () => HOY,
    ventasDesde: async () => { w.__lecturas++; return o.sinDatos ? { dias: [], ventas: [], productos: [] } : D; }
  };
  cargar();
  w.state = { master: [] };
  global.state = w.state;
  w.parAdjustments = new Map();
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {} };
  new Function(leer('src/mobile-home.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'home';
  w.document.body.appendChild(host);
  def.mount(host);
  await esperar(30);
  return { w, host };
}
const tarjeta = (h) => h.querySelector('#mhVentas .m-ts');

(async () => {

grupo('la tarjeta del Home');
{
  const { w, host } = await home();
  const t = tarjeta(host);
  prueba('sale', !!t);
  prueba('abre en ayer (martes)', /3\.5/.test(t.querySelector('.m-ts-t b').textContent) && /Tue/.test(t.querySelector('.m-ts-t span').textContent),
    t.querySelector('.m-ts-t').textContent.replace(/\s+/g, ' '));
  prueba('contra un martes normal: +75%', /↗ 75% vs usual Tue/.test(t.querySelector('.m-ts-t em').textContent), t.querySelector('.m-ts-t em').textContent);
  prueba('siete barras, la de ayer elegida', t.querySelectorAll('.m-ts-b').length === 7 && t.querySelectorAll('.m-ts-b')[6].classList.contains('on'));
  prueba('con la raya de lo normal', t.querySelectorAll('.m-ts-b u').length === 7);
  prueba('lo más vendido de ese día', /Tito's Vodka 1L/.test(t.querySelector('.m-ts-top').textContent));

  t.querySelectorAll('.m-ts-b')[0].click();
  const t2 = tarjeta(host);
  prueba('tocar una barra elige ese día', t2.querySelectorAll('.m-ts-b')[0].classList.contains('on') &&
    /Wed/.test(t2.querySelector('.m-ts-t span').textContent) && /^1$/.test(t2.querySelector('.m-ts-t b').textContent.trim()),
    t2.querySelector('.m-ts-t').textContent.replace(/\s+/g, ' '));

  t2.querySelector('[data-v="dinero"]').click();
  const t3 = tarjeta(host);
  prueba('$: el dinero del día elegido', t3.querySelector('.m-ts-t b').textContent.trim() === '$150', t3.querySelector('.m-ts-t b').textContent);
  prueba('$: licor y vino aparte', /Liquor & cocktails \$100/.test(t3.textContent) && /Wine \$50/.test(t3.textContent));
  prueba('$: cada barra partida en dos', t3.querySelectorAll('.m-ts-b')[0].querySelectorAll('i').length === 2);
  prueba('$: sin cerveza en lo más vendido', !/IPA|Silver Bar/.test(t3.querySelector('.m-ts-top').textContent));

  const antes = w.__lecturas;
  await esperar(60);
  prueba('pintar no vuelve a leer en bucle', w.__lecturas === antes && antes === 1, antes + ' → ' + w.__lecturas);
}
{
  const { host } = await home({ sinDatos: true });
  prueba('sin Toast cargado, no hay tarjeta', !tarjeta(host));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
