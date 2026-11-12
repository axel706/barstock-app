#!/usr/bin/env node
/*
 * ── Home: Sales · Movement · Changes ─────────────────────────────────
 *
 * Axel, 2026-11-12, sobre lámina. Debajo del carrusel, tres pestañas;
 * Movement y Changes con el molde de la tarjeta de Toast Sales.
 *
 *   1. Abren en Sales; tocar otra pestaña enseña su tarjeta y esconde
 *      las demás; la elegida se recuerda al volver al Home.
 *   2. Sólo salen las pestañas que tienen algo: sin Toast no hay Sales y
 *      se abre la primera que haya; con una sola, no hay pestañas.
 *   3. Movement: los cinco que más se mueven por botellas a la semana,
 *      con su tendencia y la raya de lo de siempre; en $ el orden es por
 *      dinero a la semana a tu precio. See all lleva a Inventory y tocar
 *      un producto abre su ficha.
 *   4. Changes: Took off / Went quiet con el mismo criterio de siempre
 *      (1.5× arriba, 0.4× abajo), "N /wk · was X"; un lado vacío lo dice.
 *
 *   node tools/test-home-secciones.js
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

// [producto, consumo reciente, histórico, precio]
const PAR = [
  ['Prosecco', 29.6, 33, 12],
  ['White Haven', 17.5, 14.6, 14],
  ['Canyon Oaks', 14.5, 11.9, 9],
  ['Villa Brici', 14, 15.9, 8],
  ["Tito's", 13, 13, 44],
  ['Kendall Jackson', 5, 2.4, 13],   // took off (2.1×)
  ['Baileys', 1, 3.4, 30],           // went quiet (0.29×)
  ['Chambord', 0.4, 0.4, 20]
];

async function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  const par = o.par || PAR;
  w.state = { master: par.map(([item, , , value]) => ({ item, vendor: 'LOOP', code: '', onHand: 2, suggested: 4, value })) };
  global.state = w.state;
  w.parAdjustments = new Map(par.map(([item, hoy, antes]) => [item + '||', { status: 'active', avgUsed: hoy, avgHistorical: antes, normalWeeks: 8 }]));
  const dias = [], ventas = [];
  for (let k = 1; k <= 20; k++) {
    const f = sumar(HOY, -k);
    dias.push({ business_date: f, complete: true, closed: true });
    ventas.push({ business_date: f, toast_item_name: "Tito's", sales_category: 'Liquor', net: 100, quantity: 5 });
  }
  w.BarStockToastUsage = { diaDeNegocio: () => HOY,
    ventasDesde: async () => (o.sinToast ? { dias: [], ventas: [], productos: [] } : { dias, ventas, productos: [] }) };
  new Function(leer('src/run-out.js'))();
  new Function(leer('src/toast-sales.js'))();
  w.__ir = []; w.__ficha = null;
  w.BarStockMobileSearch = { abrirItem: (n) => { w.__ficha = n; } };
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir: (x) => w.__ir.push(x) };
  new Function(leer('src/mobile-home.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'home';
  w.document.body.appendChild(host);
  def.mount(host);
  await esperar(40);
  return { w, host, def };
}
const tabs = (h) => [...h.querySelectorAll('#mhTabs [data-tab]')];
const visible = (h, id) => !h.querySelector(id).hidden;
const filas = (h, id) => [...h.querySelectorAll(id + ' .m-hb-r')].map(r => r.querySelector('.n').textContent);
const txt = (el) => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';

(async () => {

grupo('las pestañas');
{
  const { host, def } = await entorno();
  prueba('tres, en su orden', JSON.stringify(tabs(host).map(t => t.textContent.trim())) === JSON.stringify(['Sales', 'Movement', 'Changes']),
    tabs(host).map(t => t.textContent.trim()).join(','));
  // Se llamó .m-hs y heredó la pastilla de estado de Orders › Sent
  // (inline-block): el bloque se encogía al ancho de su contenido.
  const sx = host.querySelector('#mhSecciones');
  prueba('el bloque no lleva una clase de otra pantalla', sx.classList.contains('m-sx') && !sx.classList.contains('m-hs'), sx.className);
  prueba('abren en Sales', tabs(host)[0].classList.contains('on') && visible(host, '#mhVentas') && !visible(host, '#mhMov') && !visible(host, '#mhCamb'));
  tabs(host)[1].click();
  prueba('Movement enseña su tarjeta y esconde las demás', visible(host, '#mhMov') && !visible(host, '#mhVentas') && !visible(host, '#mhCamb'));
  def.show(host);
  await esperar(20);
  prueba('al volver al Home sigue en Movement', tabs(host)[1].classList.contains('on') && visible(host, '#mhMov'));
}
{
  const { host } = await entorno({ sinToast: true });
  prueba('sin Toast no hay Sales', !tabs(host).some(t => /Sales/.test(t.textContent)));
  prueba('y abre en la primera que haya', visible(host, '#mhMov'));
}
{
  // Sólo Movement: nada cambió y sin Toast.
  const { host } = await entorno({ sinToast: true, par: [['Prosecco', 10, 10, 12], ["Tito's", 8, 8, 44]] });
  prueba('con una sola sección, sin pestañas', host.querySelector('#mhTabs').hidden && visible(host, '#mhMov'));
}

grupo('Movement');
{
  const { w, host } = await entorno();
  tabs(host)[1].click();
  prueba('los cinco que más se mueven, de mayor a menor',
    JSON.stringify(filas(host, '#mhMov')) === JSON.stringify(['Prosecco', 'White Haven', 'Canyon Oaks', 'Villa Brici', "Tito's"]),
    filas(host, '#mhMov').join(' | '));
  const t = txt(host.querySelector('#mhMov .m-ts-t'));
  prueba('el primero es el número grande', /29\.6\s*btl\/wk · Prosecco/.test(t) && /↘ 10% vs usual/.test(t), t);
  const r1 = host.querySelectorAll('#mhMov .m-hb-r')[1];
  prueba('cada uno con su tendencia', /↗ 20%/.test(txt(r1.querySelector('.v small'))) && r1.querySelector('.v small').classList.contains('up'), txt(r1));
  prueba('y la raya de lo de siempre', !!r1.querySelector('.m-hb-bar u'));
  prueba("lo que no cambió dice steady", /— steady/.test(txt(host.querySelectorAll('#mhMov .m-hb-r')[4])));

  host.querySelector('#mhMov [data-vm="dinero"]').click();
  // A la semana a tu precio: Tito's 13×44 = 572 sube; Prosecco 355, WH 245…
  prueba('en $, el orden es por dinero a la semana',
    filas(host, '#mhMov')[0] === "Tito's" && /\$572/.test(txt(host.querySelector('#mhMov .m-ts-t'))),
    filas(host, '#mhMov').join(' | ') + ' / ' + txt(host.querySelector('#mhMov .m-ts-t')));

  host.querySelector('#mhMov [data-allmov]').click();
  prueba('See all lleva a Inventory', w.__ir.includes('inventory'), w.__ir.join(','));
  host.querySelector('#mhMov .m-hb-r').click();
  prueba('tocar un producto abre su ficha', w.__ficha === "Tito's", String(w.__ficha));
}

grupo('Changes');
{
  const { host } = await entorno();
  tabs(host)[2].click();
  const t = txt(host.querySelector('#mhCamb .m-ts-t'));
  prueba('Took off: cuántos', /^1\s*product using more than usual/.test(t), t);
  const r = host.querySelector('#mhCamb .m-hb-r');
  prueba('con lo de ahora y lo de antes', /Kendall Jackson/.test(txt(r)) && /5 \/wk/.test(txt(r)) && /was 2\.4/.test(txt(r)), txt(r));
  host.querySelector('#mhCamb [data-vc="abajo"]').click();
  const r2 = host.querySelector('#mhCamb .m-hb-r');
  prueba('Went quiet: el que bajó', /Baileys/.test(txt(r2)) && /was 3\.4/.test(txt(r2)) && r2.querySelector('.v small').classList.contains('dn'), txt(r2));
  prueba('Chambord (sin cambio) no entra en ninguno', !/Chambord/.test(txt(host.querySelector('#mhCamb'))));
}
{
  const { host } = await entorno({ par: [['Kendall Jackson', 5, 2.4, 13]] });
  tabs(host).find(t => /Changes/.test(t.textContent)).click();
  host.querySelector('#mhCamb [data-vc="abajo"]').click();
  prueba('un lado vacío lo dice', /Nothing went quiet/.test(txt(host.querySelector('#mhCamb'))));
}

grupo('nada se sale de la tarjeta');
{
  // En el teléfono, "Nino Ardevi Prosecco Extra Dry Veneto Vintage"
  // empujó "↘ 10% vs usual" fuera de la tarjeta (2026-11-12): nada en la
  // fila del número grande podía encogerse. jsdom no mide; se mira la
  // regla que lo impide.
  const css = leer('styles/mobile-app.css');
  const span = (/\.m-ts-t span\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
  const em = (/\.m-ts-t em\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
  prueba('el nombre se corta con "…"', /min-width:\s*0/.test(span) && /text-overflow:\s*ellipsis/.test(span) && /overflow:\s*hidden/.test(span), span.trim());
  prueba('y la comparación no cede', /flex:\s*0 0 auto/.test(em) && /white-space:\s*nowrap/.test(em), em.trim());
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
