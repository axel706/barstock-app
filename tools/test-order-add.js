#!/usr/bin/env node
/*
 * ── Agregar un producto a la orden en curso ──────────────────────────
 *
 * Lo que se prueba aqui no es que el panel se vea bonito: es que no
 * mienta. Hay dos formas de que este boton diga "listo" y no haya hecho
 * nada, y las dos son invisibles en pantalla:
 *
 *   1. Proveedor que no acepta final order manual. getEffectiveOrder
 *      ignora el override y se cae al toOrder. La fila nunca aparece.
 *   2. Producto ya colocado en este ciclo. isRowPlaced lo saca de la
 *      tabla pase lo que pase el override.
 *
 *   node tools/test-order-add.js
 */

const path = require('path');
const fs = require('fs');

const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let pasa = 0, falla = 0;
function ok(n, c, d) {
  if (c) { pasa++; console.log('  ok   ' + n); }
  else { falla++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const eq = (n, got, esp) =>
  ok(n, JSON.stringify(got) === JSON.stringify(esp),
     'dio ' + JSON.stringify(got) + ', esperaba ' + JSON.stringify(esp));

// ── Un index.html de mentira con lo justo ────────────────────────────
//
// Las funciones que se imitan son las de verdad, copiadas tal cual del
// index: si alla cambian y aqui no, la prueba deja de valer. Por eso
// van con el numero de linea al lado.
function montar(opts) {
  const o = opts || {};
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <button type="button" id="addToOrderBtn" class="tb-pill tb-pill--add" disabled>
      <i class="ti ti-plus"></i><span class="tb-label">Add product</span>
    </button>
  </body>`, { url: 'https://x.test' });

  const w = dom.window;
  w.state = { master: o.master || [], placedOrders: o.placed || [] };

  let tab = o.tab || 'SOUTHERN';
  w.getActiveVendorTab = () => tab;
  w.__setTab = (v) => { tab = v; };

  // index.html:1323
  w.supportsManualFinalOrder = (vendor) =>
    ['SOUTHERN', 'BREAKTHRU', 'WINE MERCHANT', 'LOOP'].includes(String(vendor || '').toUpperCase());

  // index.html:1324
  w.getEffectiveOrder = (row) => {
    if (w.supportsManualFinalOrder(row.vendor) &&
        row.orderOverride !== '' && row.orderOverride !== null && row.orderOverride !== undefined) {
      return Math.max(0, Number(row.orderOverride) || 0);
    }
    return Math.max(0, Number(row.toOrder) || 0);
  };

  // index.html:2146
  const norm = (s) => String(s || '').trim().toLowerCase();
  w.isRowPlaced = (row) =>
    Array.isArray(w.state.placedOrders) &&
    w.state.placedOrders.includes(
      `${String(row.vendor || '').toUpperCase()}||${norm(row.code)}||${norm(row.item)}`);

  // index.html:3409 — lo unico que el modulo llega a tocar
  w.__llamadas = [];
  w.updateFinalOrder = (i, v) => {
    w.__llamadas.push([i, v]);
    const r = w.state.master[i];
    if (r && w.supportsManualFinalOrder(r.vendor)) r.orderOverride = Math.max(0, Number(v) || 0);
  };

  const src = fs.readFileSync(path.join(RAIZ, 'src/add-to-order.js'), 'utf8');
  global.window = w; global.document = w.document;
  new Function(src)();
  // En el navegador el script va al final del body y init() lo dispara
  // DOMContentLoaded. jsdom ya tiene el documento listo cuando llegamos
  // aqui, asi que ese evento no vuelve a ocurrir.
  w.BarStockAddToOrder.init();
  return w;
}

const ITEMS = [
  { item: "Tito's Vodka",     code: '101', vendor: 'SOUTHERN', onHand: 1, suggested: 17, toOrder: 16, orderOverride: '' },
  { item: 'Casa Noble',       code: '7747', vendor: 'SOUTHERN', onHand: 2, suggested: 3, toOrder: 0, orderOverride: '' },
  { item: 'Triple Sec',       code: '305', vendor: 'SOUTHERN', onHand: 9, suggested: 4, toOrder: 0, orderOverride: '' },
  { item: 'Carlo Rossi',      code: '88',  vendor: 'BREAKTHRU', onHand: 0, suggested: 5, toOrder: 0, orderOverride: '' },
  { item: 'Agua Mineral',     code: '900', vendor: 'UNKNOWN',  onHand: 0, suggested: 2, toOrder: 0, orderOverride: '' }
];
const clon = () => JSON.parse(JSON.stringify(ITEMS));

const $ = (w, id) => w.document.getElementById(id);
const filas = (w) => Array.from(w.document.querySelectorAll('.ato-row'));
const textoDe = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const nombreDe = (el) => el.querySelector('.ato-name').textContent.replace(/\s+/g, ' ').trim();

console.log('\nel boton de la barra');
{
  const w = montar({ master: clon(), tab: 'SOUTHERN' });
  ok('con un proveedor que acepta final order manual, se habilita', !$(w, 'addToOrderBtn').disabled);

  w.__setTab('ALL'); w.BarStockAddToOrder.sync();
  ok('en ALL se deshabilita', $(w, 'addToOrderBtn').disabled);

  w.__setTab('UNKNOWN'); w.BarStockAddToOrder.sync();
  ok('en UNKNOWN tambien', $(w, 'addToOrderBtn').disabled);

  ok('y dice por que en vez de desaparecer',
     /pick a vendor/i.test($(w, 'addToOrderBtn').title));

  // Southern, Breakthru, Wine Merchant y LOOP son los unicos que
  // soporta getEffectiveOrder. Si alguien añade otro ahi y no aqui, el
  // boton se quedaria apagado sin motivo visible.
  w.__setTab('BREAKTHRU'); w.BarStockAddToOrder.sync();
  ok('BREAKTHRU tambien lo acepta', !$(w, 'addToOrderBtn').disabled);
}

console.log('\nla lista');
{
  const w = montar({
    master: clon(),
    tab: 'SOUTHERN',
    placed: ['SOUTHERN||305||triple sec']
  });
  w.BarStockAddToOrder.open();

  const f = filas(w);
  eq('solo salen los del proveedor activo', f.length, 3);

  const libre = f.filter(x => x.dataset.off === '0').map(nombreDe);
  eq('los elegibles son los que no estan ya en la orden ni colocados', libre, ['Casa Noble']);

  const tito = f.find(x => /Tito/.test(textoDe(x)));
  ok("Tito's sale bloqueado y marcado: ya va en la orden",
     tito.dataset.off === '1' && /already in this order/i.test(textoDe(tito)));

  const ts = f.find(x => /Triple Sec/.test(textoDe(x)));
  ok('Triple Sec sale bloqueado y marcado: ya se coloco este ciclo',
     ts.dataset.off === '1' && /already ordered this cycle/i.test(textoDe(ts)));

  // Un producto con to order 0 es justo el caso que motivo todo esto:
  // hoy no aparece en la tabla y habia que hacer una orden aparte.
  ok('el elegible enseña su to order 0 sin esconderlo',
     /to order 0/i.test(textoDe(f.find(x => /Casa Noble/.test(textoDe(x))))));
}

console.log('\nbuscar');
{
  const w = montar({ master: clon(), tab: 'SOUTHERN' });
  w.BarStockAddToOrder.open();

  const s = $(w, 'atoSearch');
  s.value = 'casa'; s.dispatchEvent(new w.Event('input'));
  eq('filtra por nombre', filas(w).map(nombreDe), ['Casa Noble']);

  s.value = '7747'; s.dispatchEvent(new w.Event('input'));
  eq('y por codigo', filas(w).map(nombreDe), ['Casa Noble']);

  s.value = 'zzz'; s.dispatchEvent(new w.Event('input'));
  ok('sin resultados lo dice', /nothing matches/i.test($(w, 'atoList').textContent));
}

console.log('\nagregar');
{
  const w = montar({ master: clon(), tab: 'SOUTHERN' });
  w.BarStockAddToOrder.open();

  ok('sin nada elegido, Add esta apagado', $(w, 'atoGo').disabled);

  filas(w).find(x => /Casa Noble/.test(textoDe(x))).click();
  ok('al elegir se enciende', !$(w, 'atoGo').disabled);

  const q = $(w, 'atoQty');
  $(w, 'atoPlus').click();
  eq('el + sube', q.value, '2');
  $(w, 'atoMinus').click(); $(w, 'atoMinus').click();
  eq('el - no baja de 1', q.value, '1');

  q.value = '4'; q.dispatchEvent(new w.Event('input'));
  $(w, 'atoGo').click();

  eq('llama a updateFinalOrder con el indice y la cantidad', w.__llamadas, [[1, 4]]);
  eq('y el producto queda con override 4', w.state.master[1].orderOverride, 4);

  // Lo importante no es el override en si: es que la fila APAREZCA.
  ok('ahora entra en la orden, aunque su to order siga en 0',
     w.getEffectiveOrder(w.state.master[1]) === 4 && w.state.master[1].toOrder === 0);

  ok('el panel se cierra', $(w, 'atoBg').classList.contains('hidden'));
}

console.log('\nlo que no puede pasar en silencio');
{
  // Entre abrir el panel y dar clic puede entrar una sincronizacion de
  // la nube que marque el producto como colocado. Si eso no se vuelve a
  // comprobar al guardar, el override se escribe, el panel dice que todo
  // bien, y la fila no aparece nunca.
  const w = montar({ master: clon(), tab: 'SOUTHERN' });
  w.BarStockAddToOrder.open();
  filas(w).find(x => /Casa Noble/.test(textoDe(x))).click();

  w.state.placedOrders.push('SOUTHERN||7747||casa noble');
  $(w, 'atoGo').click();

  eq('no se guarda nada si se coloco mientras el panel estaba abierto', w.__llamadas, []);
  ok('y lo dice en pantalla', /already placed this cycle/i.test($(w, 'atoBody').textContent));
  ok('el panel sigue abierto para que se vea', !$(w, 'atoBg').classList.contains('hidden'));
}
{
  const w = montar({ master: clon(), tab: 'SOUTHERN' });
  w.BarStockAddToOrder.open();
  filas(w).find(x => /Casa Noble/.test(textoDe(x))).click();

  // El proveedor cambia por debajo a uno que no acepta override manual.
  w.state.master[1].vendor = 'UNKNOWN';
  $(w, 'atoGo').click();

  eq('tampoco si el proveedor dejo de aceptar final order manual', w.__llamadas, []);
  ok('y lo dice', /doesn't take a manual final order/i.test($(w, 'atoBody').textContent));
}
{
  const w = montar({ master: clon(), tab: 'ALL' });
  w.BarStockAddToOrder.open();
  ok('en ALL el panel ni se abre', !$(w, 'atoBg'));
}

console.log('\n' + (falla ? falla + ' FALLO(S)' : 'todo bien') + '   ·   ' + pasa + ' comprobaciones');
process.exit(falla ? 1 : 0);
