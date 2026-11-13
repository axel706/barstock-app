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
  // catPorDia: la categoría de Toast de cada botella (toast-usage.js).
  const cat = (pd, c) => Object.fromEntries(Object.entries(pd).map(([f, b]) => [f, { [c]: b }]));
  const sb = { [sumar(HOY, -1)]: 0.5 };
  return { dias, ventas, productos: [{ producto: "Tito's Vodka 1L", porDia, catPorDia: cat(porDia, 'Liquor') },
    { producto: 'Sauv Blanc', porDia: sb, catPorDia: cat(sb, 'Wine') }] };
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
  // Para el correo de la mañana: lo mismo partido en licor y vino, con
  // lo de siempre de cada uno.
  prueba('botellas partidas: licor y vino', s[6].botLicor === 3 && s[6].botVino === 0.5, s[6].botLicor + ' / ' + s[6].botVino);
  prueba('lo de siempre de cada uno, en botellas', s[6].normalBotLicor === 2 && s[6].normalBotVino === 0,
    s[6].normalBotLicor + ' / ' + s[6].normalBotVino);
  prueba('y en dinero', s[6].normalLicor === 200 && s[6].normalVino === 50, s[6].normalLicor + ' / ' + s[6].normalVino);
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
  // Sin hoy: como estaba antes de cualquier Sync (la carga de la
  // madrugada sólo trae días cerrados).
  if (o.sinHoy) {
    D.dias = D.dias.filter(d => d.business_date !== HOY);
    D.ventas = D.ventas.filter(v => v.business_date !== HOY);
    D.productos.forEach(p => { delete p.porDia[HOY]; if (p.catPorDia) delete p.catPorDia[HOY]; });
  }
  w.__syncLlamadas = [];
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-7' };
  w.BarStockDevPanel = { llamar: async (prov, acc, par) => { w.__syncLlamadas.push([prov, acc, par]); return o.syncFalla || { ok: true }; } };
  w.BarStockToastUsage = {
    diaDeNegocio: () => HOY,
    ventasDesde: async () => { w.__lecturas++; return o.sinDatos ? { dias: [], ventas: [], productos: [] } : D; }
  };
  // La hora de cada carga (fetched_at): la última, hace `o.horas` horas.
  const ult = new Date(Date.now() - (o.horas === undefined ? 3 : o.horas) * 3600e3);
  D.dias.forEach((d, k) => { d.fetched_at = new Date(ult.getTime() - (D.dias.length - 1 - k) * 864e5).toISOString(); });
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

grupo('el encabezado: el logo de Toast y la última carga');
{
  // Axel, 2026-11-12, opción C sobre lámina: el logo de Toast solo en la
  // primera línea (el archivo que dio él, tal cual), y debajo "SALES ·
  // SYNCED NOV 12 · 5:02 AM" con un punto verde, ámbar si lleva mucho
  // sin cargarse.
  const TS = window.BarStockToastSales;
  prueba('la última carga es la más nueva de los días', TS.ultimaCarga([{ fetched_at: '2026-11-10T10:00:00Z' }, { fetched_at: '2026-11-12T10:02:00Z' }, {}]) === '2026-11-12T10:02:00Z');
  prueba('sin ninguna, nada', TS.ultimaCarga([{}]) === null);
  prueba('se dice en hora de Nueva York', TS.textoCarga('2026-11-12T10:02:00Z') === 'Nov 12 · 5:02 AM', TS.textoCarga('2026-11-12T10:02:00Z'));
  const T0 = Date.parse('2026-11-12T12:00:00Z');
  // La carga de Vercel corre a las 5 y a las 7 AM: a las 7 de la mañana
  // la última puede tener 24 h. Pasadas 26, las dos de un día fallaron.
  prueba('20 h: al día', TS.cargaVieja(new Date(T0 - 20 * 3600e3).toISOString(), T0) === false);
  prueba('27 h: vieja', TS.cargaVieja(new Date(T0 - 27 * 3600e3).toISOString(), T0) === true);
  prueba('sin carga: vieja, no "al día"', TS.cargaVieja(null, T0) === true);
  prueba('la hora de carga se pide con los días', /toast_sales_days[^;]*select=business_date,complete,closed,fetched_at/.test(leer('src/toast-usage.js')));
}
{
  const { host } = await home();
  const t = tarjeta(host);
  const logo = t.querySelector('img.m-ts-logo');
  prueba('el logo de Toast arriba, con su texto alternativo', !!logo && logo.getAttribute('alt') === 'Toast' && /assets\/brands\/toast\.png/.test(logo.getAttribute('src')));
  prueba('y ya no el rótulo "Toast sales"', !t.querySelector('.m-ts-k'));
  const sy = t.querySelector('.m-ts-sync');
  prueba('debajo, "Sales · synced" con fecha y hora', !!sy && /^Sales · synced [A-Z][a-z]{2} \d{1,2} · \d{1,2}:\d{2} (AM|PM)$/.test(sy.textContent.trim()), sy && sy.textContent);
  prueba('con el punto verde', !!sy && !!sy.querySelector('i') && !sy.classList.contains('vieja'));
}
{
  const { host } = await home({ horas: 30 });
  const sy = tarjeta(host).querySelector('.m-ts-sync');
  prueba('30 h sin cargar: el punto en ámbar', !!sy && sy.classList.contains('vieja'), sy && sy.className);
}
{
  const css = leer('styles/mobile-app.css').replace(/\/\*[\s\S]*?\*\//g, '');
  prueba('la línea va en mayúsculas', /\.m-ts-sync\s*\{[^}]*text-transform\s*:\s*uppercase/.test(css));
  prueba('y el punto viejo es ámbar', /\.m-ts-sync\.vieja i\s*\{[^}]*#f(cd34d|bbf24|59e0b)/i.test(css));
  prueba('el logo está en el repositorio', fs.existsSync(path.join(__dirname, '..', 'assets', 'brands', 'toast.png')));
}

grupo('la tarjeta del Home');
{
  const { w, host } = await home({ sinHoy: true });
  const t = tarjeta(host);
  prueba('sale', !!t);
  prueba('abre en ayer (martes)', /3\.5/.test(t.querySelector('.m-ts-t b').textContent) && /Tue/.test(t.querySelector('.m-ts-t span').textContent),
    t.querySelector('.m-ts-t').textContent.replace(/\s+/g, ' '));
  // Axel, 2026-11-12, sobre lámina: la comparación pasa a una píldora
  // debajo del número; el día ya va al lado del número.
  const pil = t.querySelector('.m-ts-pill');
  prueba('contra un martes normal: +75%, en su píldora', !!pil && /↗ 75% vs usual$/.test(pil.textContent.trim()) && pil.classList.contains('m-ts-up'),
    pil && pil.outerHTML);
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

grupo('hoy, cargado a medias con el Sync de "Sold"');
{
  // Axel, 2026-11-13: con lo de hoy sincronizado, la tarjeta grande
  // también se pone al día. Hoy entra como último día, pero sin % contra
  // un día entero: va "So far today".
  const { host } = await home();
  const t = tarjeta(host);
  prueba('abre en hoy, llamado "Today"', /^9$/.test(t.querySelector('.m-ts-t b').textContent.trim()) && /Today/.test(t.querySelector('.m-ts-t span').textContent),
    t.querySelector('.m-ts-t').textContent.replace(/\s+/g, ' '));
  const pil = t.querySelector('.m-ts-pill');
  prueba('sin %, "So far today"', !!pil && pil.textContent.trim() === 'So far today' && !pil.classList.contains('m-ts-up') && !pil.classList.contains('m-ts-dn'),
    pil && pil.outerHTML);
  prueba('siete barras: se cae la más vieja, la última es hoy', t.querySelectorAll('.m-ts-b').length === 7 &&
    /Today/.test(t.querySelectorAll('.m-ts-d span')[6].textContent) && /Thu/.test(t.querySelectorAll('.m-ts-d span')[0].textContent),
    [...t.querySelectorAll('.m-ts-d span')].map(x => x.textContent).join(','));
  t.querySelectorAll('.m-ts-b')[5].click();
  const t2 = tarjeta(host);
  prueba('ayer sigue con su comparación', /3\.5/.test(t2.querySelector('.m-ts-t b').textContent) && /↗ 75% vs usual/.test(t2.querySelector('.m-ts-pill').textContent));
}
{
  const { host } = await home({ sinHoy: true });
  prueba('sin hoy cargado, ningún "Today"', !/Today/.test(tarjeta(host).textContent));
}

grupo('resumir: hoy aparte, y la semana sigue acabando ayer');
{
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  global.window = dom.window; global.document = dom.window.document;
  cargar();
  const TS = window.BarStockToastSales;
  const D = datos();
  const r = TS.resumir(Object.assign({ hoy: HOY }, D));
  // El correo de la mañana toma el último de la semana como "ayer": no
  // puede volverse hoy.
  prueba('la semana no cambia', r.semana[6].fecha === '2026-11-10');
  prueba('hoy va aparte, a medias', !!r.hoy && r.hoy.fecha === HOY && r.hoy.parcial === true && r.hoy.botellas === 9 && r.hoy.dinero === 999,
    JSON.stringify(r.hoy));
  const sc = TS.semanaConHoy(r);
  prueba('semanaConHoy: siete, acabando hoy', sc.length === 7 && sc[6].fecha === HOY && sc[0].fecha === r.semana[1].fecha);
  const sinNada = Object.assign({}, r, { hoy: Object.assign({}, r.hoy, { dinero: 0, botellas: 0 }) });
  prueba('hoy sin ventas: la semana de siempre', TS.semanaConHoy(sinNada) === r.semana);
  const sinHoy = TS.resumir({ hoy: HOY, productos: D.productos, ventas: D.ventas, dias: D.dias.filter(d => d.business_date !== HOY) });
  prueba('sin fila de hoy, hoy es null', sinHoy.hoy === null);
}

grupo('sincronizarHoy');
{
  const { w } = await home({ sinHoy: true });
  const TS = w.BarStockToastSales;
  let aviso = null;
  const antes = w.__lecturas;
  await TS.ahora();
  prueba('lo leído se guarda: no se vuelve a pedir', w.__lecturas === antes);
  // El aviso lo escucha live-cache: el LIVE se rehace con lo nuevo.
  w.BarStockEvents = { emit: (n, d) => { aviso = [n, d]; } };
  await TS.sincronizarHoy();
  const c = w.__syncLlamadas[0];
  prueba('llama a sync de Toast con hoy y la locación', !!c && c[0] === 'toast' && c[1] === 'sync' &&
    c[2].businessDate === '20261111' && c[2].locationId === 'loc-7', JSON.stringify(c));
  prueba('avisa toastSalesUpdated', !!aviso && aviso[0] === 'toastSalesUpdated');
  await TS.ahora();
  prueba('y olvida lo leído: lo siguiente se pide otra vez', w.__lecturas === antes + 1, antes + ' → ' + w.__lecturas);
}
{
  const { w } = await home({ syncFalla: { ok: false, error: 'Toast said 401' } });
  let err = null;
  try { await w.BarStockToastSales.sincronizarHoy(); } catch (e) { err = e; }
  prueba('si falla, lanza lo que dijo el servidor', !!err && /Toast said 401/.test(err.message), err && err.message);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
