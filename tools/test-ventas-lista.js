#!/usr/bin/env node
/*
 * ── Toast Sales · "All products" y "Full report" ──────────────────────
 *
 * Axel, 2026-11-12, sobre lámina:
 *   1. "All products" en la vista botellas de la tarjeta; "Full report"
 *      en la de $.
 *   2. Abre una hoja en el día que estaba elegido en la tarjeta.
 *   3. TODO lo vendido ese día en botellas, del que más al que menos,
 *      con el total y el número de productos.
 *   4. La diferencia contra lo normal sale de las medianas de run-out
 *      (live-cache.medianas), no de otro cálculo.
 *   5. Las pastillas cambian de día; el filtro acota por nombre.
 *   6. Tocar un producto cierra la hoja y abre su ficha.
 *   7. Full report: Net sales del día en licor y vino, cada artículo de
 *      Toast con cuántos, cuánto y qué parte del día; los cócteles como
 *      cócteles; al pie, la cerveza y el open bar que quedan fuera, y
 *      las líneas sin precio, dichas.
 *
 *   node tools/test-ventas-lista.js
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
const AYER = sumar(HOY, -1), SAB = sumar(HOY, -4);
// Medianas de Tito's por día de la semana: los martes 1.6.
const MED_TITO = [1, 0, 1.6, 1, 1, 1.5, 2];

async function entorno() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.BarStockRunOut = { mediana: (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)],
    ahora: async () => ({ estado: 'listo', hoy: HOY, filas: [
      { producto: "Tito's Vodka 1L", contado: 5, llego: 0, vendido: 1, live: 4, movimiento: true, de: [], llegadas: [], viene: [], med: MED_TITO } ] }) };
  new Function(leer('src/live-cache.js'))();
  const dias = [];
  for (let k = 1; k <= 30; k++) dias.push({ business_date: sumar(HOY, -k), complete: true, closed: true });
  const productos = [
    { producto: "Tito's Vodka 1L", porDia: { [AYER]: 2.1, [SAB]: 3 } },
    { producto: 'Nino Ardevi Prosecco', porDia: { [AYER]: 3.6, [SAB]: 5 } },
    { producto: 'Kahlua', porDia: { [AYER]: 0.6 } }
  ];
  w.BarStockToastUsage = { diaDeNegocio: () => HOY,
    ventasDesde: async () => ({ dias, productos, ventas: [
      { business_date: AYER, toast_item_name: 'Espresso Martini', sales_category: 'Liquor', net: 392, quantity: 28 },
      { business_date: AYER, toast_item_name: "Tito's", sales_category: 'Liquor', net: 300, quantity: 28 },
      { business_date: AYER, toast_item_name: "Tito's", sales_category: 'Liquor', net: 41, quantity: 3 },
      { business_date: AYER, toast_item_name: 'Nino Ardevi Prosecco', sales_category: 'Wine', net: 480, quantity: 13 },
      { business_date: AYER, toast_item_name: 'Rosé', sales_category: 'Wine', net: null, quantity: 1 },
      { business_date: AYER, toast_item_name: 'IPA', sales_category: 'Beer', net: 438, quantity: 70 },
      { business_date: AYER, toast_item_name: 'Silver Bar', sales_category: 'Banquet Beverage', net: 0, quantity: 31 } ] }) };
  new Function(leer('src/toast-sales.js'))();
  new Function(leer('src/mobile-sales.js'))();
  w.state = { master: [
    { item: "Tito's Vodka 1L", vendor: 'LOOP', onHand: 5, suggested: 8 },
    { item: 'Nino Ardevi Prosecco', vendor: 'WINE MERCHANT', onHand: 6, suggested: 12 },
    { item: 'Kahlua', vendor: 'SOUTHERN', onHand: 2, suggested: 3 } ] };
  global.state = w.state;
  w.parAdjustments = new Map();
  w.normalizeName = (s) => String(s || '').toLowerCase();
  await w.BarStockLiveCache.cargar();
  w.__abierto = null;
  w.BarStockMobileSearch = { abrirItem: (n) => { w.__abierto = n; } };
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
const hoja = (w) => w.document.querySelector('#mSheet .m-vl');
const nombres = (w) => [...hoja(w).querySelectorAll('.m-vl-r')].map(r => r.dataset.item);

(async () => {

grupo('el botón');
{
  const { host } = await entorno();
  prueba('en la vista botellas', !!host.querySelector('#mhVentas [data-mas]'));
  host.querySelector('#mhVentas [data-v="dinero"]').click();
  const b = host.querySelector('#mhVentas [data-mas]');
  prueba('en la de $, "Full report"', !!b && /Full report/.test(b.textContent), b && b.textContent);
}

grupo('la hoja');
{
  const { w, host } = await entorno();
  host.querySelector('#mhVentas [data-mas]').click();
  await esperar(20);
  const h = hoja(w);
  prueba('se abre', !!h);
  prueba('en el día elegido (ayer)', h.querySelectorAll('.m-vl-c')[6].classList.contains('on'));
  prueba('todo lo vendido, del que más al que menos', JSON.stringify(nombres(w)) === JSON.stringify(['Nino Ardevi Prosecco', "Tito's Vodka 1L", 'Kahlua']), nombres(w).join(' | '));
  const tot = h.querySelector('.m-vl-tot').textContent.replace(/\s+/g, ' ');
  prueba('con el total y cuántos productos', /6\.3\s*bottles · 3 products · Tue/.test(tot), tot);
  const tito = h.querySelector('.m-vl-r[data-item="Tito\'s Vodka 1L"]');
  prueba('contra lo normal: la mediana de run-out (2.1 − 1.6)', /↗ 0\.5/.test(tito.querySelector('.v small').textContent), tito.textContent.replace(/\s+/g, ' '));
  prueba('con su proveedor', /LOOP/.test(tito.querySelector('.n small').textContent));

  h.querySelectorAll('.m-vl-c')[3].click();
  prueba('otra pastilla, otro día', hoja(w).querySelectorAll('.m-vl-c')[3].classList.contains('on') &&
    JSON.stringify(nombres(w)) === JSON.stringify(['Nino Ardevi Prosecco', "Tito's Vodka 1L"]), nombres(w).join(' | '));

  const q = hoja(w).querySelector('#mvQ');
  q.value = 'tito'; q.oninput();
  prueba('el filtro acota', JSON.stringify(nombres(w)) === JSON.stringify(["Tito's Vodka 1L"]), nombres(w).join(' | '));

  hoja(w).querySelector('.m-vl-r').click();
  prueba('tocar un producto abre su ficha', w.__abierto === "Tito's Vodka 1L", String(w.__abierto));
  prueba('y cierra la hoja', !w.document.querySelector('#mSheet'));
}
{
  // Abre en el día que estaba elegido en la tarjeta, no siempre en ayer.
  const { w, host } = await entorno();
  host.querySelectorAll('#mhVentas .m-ts-b')[3].click();
  host.querySelector('#mhVentas [data-mas]').click();
  await esperar(20);
  prueba('abre en el día elegido en la tarjeta', hoja(w).querySelectorAll('.m-vl-c')[3].classList.contains('on'));
}

grupo('Full report');
{
  const { w, host } = await entorno();
  host.querySelector('#mhVentas [data-v="dinero"]').click();
  host.querySelector('#mhVentas [data-mas]').click();
  await esperar(20);
  const h = hoja(w);
  prueba('se abre como Full report', !!h && /Full report/.test(h.querySelector('.m-vl-t').textContent));
  prueba('en el día elegido (ayer)', h.querySelectorAll('.m-vl-c')[6].classList.contains('on'));
  prueba('sin filtro: es un reporte', !h.querySelector('#mvQ'));
  const tot = h.querySelector('.m-vl-tot').textContent.replace(/\s+/g, ' ');
  prueba('Net sales del día: licor + vino', /\$1,213\s*net · Tue/.test(tot), tot);
  const ley = h.querySelector('#mvLey').textContent.replace(/\s+/g, ' ');
  prueba('partido en licor y vino', /Liquor & cocktails \$733/.test(ley) && /Wine \$480/.test(ley), ley);
  const secs = [...h.querySelectorAll('.m-vl-sec')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
  prueba('dos secciones con su total', JSON.stringify(secs) === JSON.stringify(['Liquor & cocktails$733', 'Wine$480']), JSON.stringify(secs));
  const filas = [...h.querySelectorAll('.m-vl-r-din')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
  prueba('los cócteles como cócteles, el que más dinero primero', /^Espresso Martini\s*28 sold \$392\s*32\.3%/.test(filas[0] || ''), filas[0]);
  prueba("un artículo suma sus filas (Tito's 300 + 41, 31 vendidos)", filas.some(f => /^Tito's\s*31 sold \$341/.test(f)), filas.join(' | '));
  const pie = [...h.querySelectorAll('.m-vl-pie')].map(x => x.textContent).join(' | ');
  prueba('al pie, lo que queda fuera', /Not in this report: Beer \$438 · Banquet Beverage \$0/.test(pie), pie);
  prueba('y la línea sin precio, dicha', /1 line came without a price and is not counted/.test(pie), pie);
  prueba('sin cerveza en la lista', !filas.some(f => /IPA|Silver Bar/.test(f)));
  h.querySelector('.m-vl-r-din').click();
  prueba('un artículo de Toast no abre ficha', w.__abierto === null && !!w.document.querySelector('#mSheet'));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
