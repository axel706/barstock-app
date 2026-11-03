#!/usr/bin/env node
/*
 * ── El enlace automatico de factura a orden ─────────────────────────
 *
 * El reparto de hoy va LINEA POR LINEA y el primero que pide un recibo
 * se lo queda, recorriendo las ordenes de la mas nueva a la mas vieja.
 * Por eso registrar una orden nueva le quita los recibos a una
 * anterior y esa vuelve a decir "waiting".
 *
 * Esto decide, una sola vez, de que orden es cada factura.
 *
 * Lo que se protege:
 *
 *   1. El PASADO NO SE TOCA. Solo se miran facturas y ordenes del
 *      ciclo abierto. El fue explicito: las pasadas ya estan bien.
 *   2. Lo que ya tiene dueño se deja en paz. Un enlace a mano no se
 *      sobrescribe nunca.
 *   3. Gana quien comparte PRODUCTOS, no quien se parece en dinero.
 *   4. El proveedor no es requisito: el caso que origina todo esto es
 *      pedir a LOOP y que la factura llegue a nombre de Fine Wine.
 *   5. Si duda, NO escribe: pocos productos en comun, puntuacion baja,
 *      o dos candidatas empatadas. Esas se quedan como hoy.
 *
 *   node tools/test-enlace-auto.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const w = { console: { warn() {} } };
global.window = w;
new Function('window', fs.readFileSync(path.join(RAIZ, 'src/invoice-order-auto.js'), 'utf8'))(w);
const A = w.BarStockInvoiceOrderAuto;

// ── Un mundo de mentira, lo mas parecido al de verdad ───────────────
//
// Las facturas son lineas de marginedge_invoice_lines agrupadas por
// order_id, con sus productos por product_id; el nombre sale de
// marginedge_links.
let _pid = 0;
const catalogo = new Map();
function prod(nombre) {
  if (!catalogo.has(nombre)) catalogo.set(nombre, 'p' + (++_pid));
  return catalogo.get(nombre);
}
const enlaces = () => Array.from(catalogo, ([item_name, product_id]) => ({ product_id, item_name }));

// factura('F1', '2026-11-02', 'Fine Wine', [['Tito', 6, 27], ...])
function factura(id, fecha, vendor, items) {
  return items.map(([item, quantity, unit_price]) => ({
    order_id: id, product_id: prod(item), quantity, unit_price,
    invoice_date: fecha, invoice_number: id, vendor_name: vendor
  }));
}
function orden(id, fecha, vendor, subtotal) {
  return { id, created_at: fecha, vendor, subtotal, po_number: id, app_order_id: id };
}
function lineasDe(id, items) {
  return items.map(([item_name, quantity, unit_price]) => ({
    vendor_order_id: id, item_name, quantity, unit_price
  }));
}

const CICLO = '2026-10-26T00:00:00Z';

function correr(d) {
  return A.proponer(Object.assign({ desde: CICLO, enlaces: enlaces() }, d));
}

(() => {

grupo('gana quien comparte productos, no quien se parece en dinero');
{
  // O-BUENA tiene los mismos tres productos y un importe que no cuadra
  // del todo. O-CARA no comparte ninguno pero clava el total.
  const r = correr({
    lineas: factura('F1', '2026-11-01', 'Fine Wine',
      [['Tito Vodka', 6, 27], ['Bombay', 3, 22], ['Jameson', 2, 31]]),
    ordenes: [orden('O-BUENA', '2026-10-30', 'LOOP', 190),
              orden('O-CARA',  '2026-10-30', 'Fine Wine', 290)],
    lineasOrden: [].concat(
      lineasDe('O-BUENA', [['Tito Vodka', 6, 27], ['Bombay', 3, 22], ['Jameson', 2, 31]]),
      lineasDe('O-CARA',  [['Cabernet', 12, 18], ['Prosecco', 6, 14]]))
  });
  prueba('una factura a decidir', r.length === 1, String(r.length));
  prueba('se enlaza a la de los productos', r[0].enlaza === 'O-BUENA', String(r[0].enlaza));
  // Y eso pese a que la otra tiene el mismo proveedor y mejor importe.
  const cara = r[0].candidatas.find(k => k.orden === 'O-CARA');
  prueba('aunque la otra comparta proveedor', cara && cara.prov === 1);
  prueba('y le gane en importe', cara && cara.dinero > r[0].candidatas[0].dinero,
    cara && (cara.dinero + ' vs ' + r[0].candidatas[0].dinero));
}

grupo('el proveedor distinto no estorba');
{
  // El caso de Crown entero: se pide en el portal de LOOP, se va a la
  // tienda, y la factura llega a nombre de Fine Wine. Si el proveedor
  // fuera requisito, el unico caso que de verdad duele no casaria.
  const r = correr({
    lineas: factura('F2', '2026-10-31', 'Fine Wine & Good Spirits',
      [['Tito Vodka', 6, 27], ['Bombay', 3, 22], ['Jameson', 2, 31]]),
    ordenes: [orden('O-LOOP', '2026-10-29', 'LOOP', 265)],
    lineasOrden: lineasDe('O-LOOP',
      [['Tito Vodka', 6, 27], ['Bombay', 3, 22], ['Jameson', 2, 31]])
  });
  prueba('casa igual', r[0].enlaza === 'O-LOOP', String(r[0].enlaza));
  prueba('y consta que el proveedor no coincide', r[0].candidatas[0].prov === 0);
}

grupo('EL PASADO NO SE TOCA');
{
  // Una factura anterior al ciclo, con su orden perfecta delante.
  const r = correr({
    lineas: factura('F-VIEJA', '2026-10-05', 'LOOP', [['Tito Vodka', 6, 27]]),
    ordenes: [orden('O-VIEJA', '2026-10-04', 'LOOP', 162)],
    lineasOrden: lineasDe('O-VIEJA', [['Tito Vodka', 6, 27]])
  });
  prueba('ni se mira', r.length === 0, JSON.stringify(r.map(x => x.factura)));
}
{
  // Y al reves: factura de este ciclo, orden del pasado. Tampoco, o
  // estariamos reasignando una orden cerrada.
  const r = correr({
    lineas: factura('F3', '2026-11-01', 'LOOP',
      [['Tito Vodka', 6, 27], ['Bombay', 3, 22], ['Jameson', 2, 31]]),
    ordenes: [orden('O-VIEJA', '2026-10-04', 'LOOP', 265)],
    lineasOrden: lineasDe('O-VIEJA',
      [['Tito Vodka', 6, 27], ['Bombay', 3, 22], ['Jameson', 2, 31]])
  });
  prueba('una orden del ciclo pasado no es candidata',
    r.length === 1 && r[0].enlaza === null, JSON.stringify(r[0] && r[0].enlaza));
  prueba('y se dice por que', r[0].porQueNo === 'no hay ordenes en el ciclo', r[0].porQueNo);
}

grupo('lo que ya tiene dueño se deja en paz');
{
  const base = {
    lineas: factura('F4', '2026-11-01', 'LOOP',
      [['Tito Vodka', 6, 27], ['Bombay', 3, 22], ['Jameson', 2, 31]]),
    ordenes: [orden('O-1', '2026-10-30', 'LOOP', 265)],
    lineasOrden: lineasDe('O-1',
      [['Tito Vodka', 6, 27], ['Bombay', 3, 22], ['Jameson', 2, 31]])
  };
  prueba('sin dueño, se propone', correr(base).length === 1);
  const r = correr(Object.assign({ yaEnlazadas: new Set(['F4']) }, base));
  prueba('con dueño, ni aparece', r.length === 0, String(r.length));
}

grupo('si duda, no escribe');
{
  // Un solo producto de cinco: podria ser cualquier cosa.
  const r = correr({
    lineas: factura('F5', '2026-11-01', 'LOOP',
      [['Tito Vodka', 6, 27], ['Cabernet', 12, 18], ['Prosecco', 6, 14],
       ['Malbec', 6, 16], ['Rioja', 6, 19]]),
    ordenes: [orden('O-2', '2026-10-30', 'LOOP', 162)],
    lineasOrden: lineasDe('O-2', [['Tito Vodka', 6, 27]])
  });
  prueba('no se enlaza', r[0].enlaza === null);
  prueba('y dice por que', r[0].porQueNo === 'pocos productos en comun', r[0].porQueNo);
}
{
  // Dos ordenes clavadas: el caso ambiguo de verdad, dos pedidos al
  // mismo proveedor la misma semana. Elegir una es echarlo a suertes
  // con cara de certeza.
  const items = [['Tito Vodka', 6, 27], ['Bombay', 3, 22], ['Jameson', 2, 31]];
  const r = correr({
    lineas: factura('F6', '2026-11-01', 'LOOP', items),
    ordenes: [orden('O-A', '2026-10-30', 'LOOP', 265),
              orden('O-B', '2026-10-30', 'LOOP', 265)],
    lineasOrden: [].concat(lineasDe('O-A', items), lineasDe('O-B', items))
  });
  prueba('no se enlaza ninguna', r[0].enlaza === null, String(r[0].enlaza));
  prueba('y se dice que estan empatadas',
    r[0].porQueNo === 'dos candidatas empatadas', r[0].porQueNo);
}
{
  // Una factura cuyos productos no estan enlazados en MarginEdge: no
  // se sabe que botellas son, asi que no hay nada que puntuar.
  const r = correr({
    lineas: [{ order_id: 'F7', product_id: 'desconocido', quantity: 2, unit_price: 20,
               invoice_date: '2026-11-01', invoice_number: 'F7', vendor_name: 'LOOP' }],
    ordenes: [orden('O-3', '2026-10-30', 'LOOP', 40)],
    lineasOrden: lineasDe('O-3', [['Tito Vodka', 6, 27]])
  });
  prueba('sin productos identificables, no se propone', r.length === 0, String(r.length));
}

grupo('el importe desempata en proporcion, no en dolares');
{
  // Mismos productos en las dos, pero una clava el importe. ±200 seria
  // casi todo en una orden de 300 y casi nada en una de 3000, por eso
  // la distancia va dividida por el tamaño de la orden.
  const k1 = A.puntuar(
    { items: new Set(['A']), total: 300, fecha: '2026-11-01', proveedor: 'X' },
    { items: new Set(['A']), total: 300, fecha: '2026-11-01', proveedor: 'X' });
  const k2 = A.puntuar(
    { items: new Set(['A']), total: 300, fecha: '2026-11-01', proveedor: 'X' },
    { items: new Set(['A']), total: 500, fecha: '2026-11-01', proveedor: 'X' });
  prueba('clavarlo puntua mas que fallarlo', k1.dinero > k2.dinero);
  // 200 de diferencia sobre 3000 casi no penaliza; sobre 300, mucho.
  const grande = A.puntuar(
    { items: new Set(['A']), total: 3000, fecha: '2026-11-01', proveedor: 'X' },
    { items: new Set(['A']), total: 3200, fecha: '2026-11-01', proveedor: 'X' });
  prueba('la misma diferencia duele menos en una orden grande',
    grande.dinero > k2.dinero, grande.dinero + ' vs ' + k2.dinero);
}

grupo('y nada de esto toca el reparto');
{
  // La regla entera depende de que mobile-history.js siga igual: este
  // modulo solo ESCRIBE enlaces, y el reparto ya los respeta.
  const h = fs.readFileSync(path.join(RAIZ, 'src/mobile-history.js'), 'utf8');
  prueba('el reparto sigue respetando el enlace primero',
    /if \(r\.reservado\) \{[\s\S]{0,200}\} else if \(r\.fecha && r\.fecha < suelo\)/.test(h));
  prueba('y no sabe nada de este modulo', !/InvoiceOrderAuto/.test(h));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
