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

const w = { console: { warn() {} }, Intl, Date };
global.window = w;
// La fecha de una factura la decide order-receipts.js (fechaFactura),
// que en la app se carga antes: el reparto y el enlace, una sola regla.
new Function('window', fs.readFileSync(path.join(RAIZ, 'src/order-receipts.js'), 'utf8'))(w);
// `fetch` se inyecta como parametro y se delega a `w.fetch` en cada
// llamada: dentro del modulo se resuelve del ambito, no de `window`,
// asi que reasignar `w.fetch` a mitad del test no le llegaria.
new Function('window', 'fetch', 'console',
  fs.readFileSync(path.join(RAIZ, 'src/invoice-order-auto.js'), 'utf8'))(
  w, (...a) => w.fetch(...a), w.console);
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

grupo('una factura del lunes es de la semana que abrió el conteo del domingo (Crown, 2026-11-16)');
{
  // El conteo cerró el domingo 15 a las 9:37 PM de Nueva York (lunes
  // 02:37 UTC). La factura 2716029 de PLCB dice "2026-11-16", sin hora:
  // leída como medianoche UTC era el DOMINGO a las 7 PM en Nueva York,
  // "antes del ciclo", y no se miraba. Casaba al 100 % con CT-0219.
  const r = A.proponer({ desde: '2026-11-16T02:37:08.374Z', enlaces: enlaces(),
    lineas: factura('2716029', '2026-11-16', 'Pennsylvania Liquor Control Board (PLCB)',
      [['Tito Vodka', 6, 27], ['Bombay', 3, 22], ['Jameson', 2, 31]]),
    ordenes: [orden('CT-0219', '2026-11-16T15:00:00Z', 'BREAKTHRU', 265)],
    lineasOrden: lineasDe('CT-0219', [['Tito Vodka', 6, 27], ['Bombay', 3, 22], ['Jameson', 2, 31]]) });
  prueba('la factura del lunes se mira y se enlaza', r.length === 1 && r[0].enlaza === 'CT-0219', JSON.stringify(r.map(x => [x.factura, x.enlaza, x.porQueNo])));
  // Y una del domingo, el día del conteo, sigue fuera: lo que llegó el
  // domingo estaba en la estantería al contar.
  const d = A.proponer({ desde: '2026-11-16T02:37:08.374Z', enlaces: enlaces(),
    lineas: factura('DOM', '2026-11-15', 'LOOP', [['Tito Vodka', 6, 27]]),
    ordenes: [orden('CT-0219', '2026-11-16T15:00:00Z', 'BREAKTHRU', 162)],
    lineasOrden: lineasDe('CT-0219', [['Tito Vodka', 6, 27]]) });
  prueba('la del domingo del conteo, no', d.length === 0, JSON.stringify(d.map(x => x.factura)));
}

grupo('el reparto: una orden del ciclo reclama la factura del lunes, sin enlace (el "waiting" de Crown)');
{
  // Sin ningún enlace: el reparto decide por fecha. La orden se colocó
  // después del cierre, así que su suelo es el arranque del ciclo, y la
  // factura del lunes leída como medianoche UTC quedaba debajo: "waiting"
  // con la factura delante.
  const RC = w.BarStockOrderReceipts;
  const ini = Date.parse('2026-11-16T02:37:08.374Z');
  const recibos = RC.recibosDe(factura('2716029', '2026-11-16', 'PLCB', [['Tito Vodka', 6, 27]]), enlaces(), new Map());
  const rep = RC.repartir({ recortadas: [orden('CT-0219', '2026-11-16T15:00:00Z', 'BREAKTHRU', 162)],
    lineas: lineasDe('CT-0219', [['Tito Vodka', 6, 27]]), recibos, inicioCiclo: ini });
  const l = (rep.get('CT-0219') || [])[0] || {};
  prueba('la orden recibe lo de la factura del lunes', l.recibido === 6, JSON.stringify(l));
  const dom = RC.recibosDe(factura('DOM', '2026-11-15', 'LOOP', [['Tito Vodka', 6, 27]]), enlaces(), new Map());
  const rep2 = RC.repartir({ recortadas: [orden('CT-0219', '2026-11-16T15:00:00Z', 'BREAKTHRU', 162)],
    lineas: lineasDe('CT-0219', [['Tito Vodka', 6, 27]]), recibos: dom, inicioCiclo: ini });
  prueba('y no la del domingo del conteo', ((rep2.get('CT-0219') || [])[0] || {}).recibido === 0);
  // Una fecha sin hora es el mediodía de ese día en Nueva York, en
  // invierno y en verano.
  prueba('mediodía de Nueva York (invierno)', RC.fechaFactura('2026-11-16') === Date.parse('2026-11-16T17:00:00Z'), new Date(RC.fechaFactura('2026-11-16')).toISOString());
  prueba('mediodía de Nueva York (verano)', RC.fechaFactura('2026-07-01') === Date.parse('2026-07-01T16:00:00Z'));
  prueba('una fecha con hora se respeta', RC.fechaFactura('2026-11-16T09:30:00Z') === Date.parse('2026-11-16T09:30:00Z'));
  prueba('sin fecha, 0', RC.fechaFactura('') === 0 && RC.fechaFactura(null) === 0);
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

grupo('escribirlo: solo las seguras, y sin pisar nada');
{
  const llamadas = [];
  w.fetch = async (url, opt) => { llamadas.push({ url, opt }); return { ok: true, text: async () => '' }; };
  w.console = { warn() {} };

  const items = [['Tito Vodka', 6, 27], ['Bombay', 3, 22], ['Jameson', 2, 31]];
  const base = {
    url: 'https://x.test', key: 'k', locId: 'loc1', desde: CICLO, enlaces: enlaces(),
    lineas: [].concat(
      factura('F-SEGURA', '2026-11-01', 'Fine Wine', items),
      // Esta no: un solo producto en comun de cinco.
      factura('F-DUDOSA', '2026-11-01', 'LOOP',
        [['Tito Vodka', 6, 27], ['Cabernet', 12, 18], ['Prosecco', 6, 14],
         ['Malbec', 6, 16], ['Rioja', 6, 19]])),
    ordenes: [orden('O-1', '2026-10-30', 'LOOP', 265)],
    lineasOrden: lineasDe('O-1', items)
  };

  return A.escribir(base).then(filas => {
    prueba('escribe una sola', filas.length === 1, String(filas.length));
    prueba('la segura', filas[0] && filas[0].order_id === 'F-SEGURA', filas[0] && filas[0].order_id);
    prueba('marcada como auto', filas[0] && filas[0].origen === 'auto');
    // Texto, como la 024: vendor_orders.id no es numerico.
    prueba('con el id de la orden en texto',
      filas[0] && typeof filas[0].vendor_order_id === 'string');

    const p = llamadas[0];
    prueba('una sola peticion', llamadas.length === 1, String(llamadas.length));
    prueba('con el on_conflict del unique de la 022',
      /on_conflict=location_id,order_id/.test(p.url), p.url);
    // ignore y NO merge: una factura que ya tiene dueño —a mano o de
    // una pasada anterior— se deja en paz. Un enlace a mano no se
    // pisa nunca.
    prueba('ignorando duplicados, no fusionandolos',
      /ignore-duplicates/.test(p.opt.headers.Prefer) &&
      !/merge-duplicates/.test(p.opt.headers.Prefer), p.opt.headers.Prefer);

    return A.escribir(Object.assign({}, base, { ordenes: [], lineasOrden: [] }));
  }).then(filas => {
    prueba('sin nada que enlazar, ni se llama', filas.length === 0 && llamadas.length === 1,
      String(llamadas.length));

    // Y si el POST falla, no se inventa que escribio.
    w.fetch = async () => ({ ok: false, text: async () => 'boom' });
    return A.escribir(base);
  }).then(filas => {
    prueba('un POST fallido no devuelve filas', filas.length === 0, String(filas.length));
    fin();
  });
}

function fin() {

grupo('y nada de esto toca el reparto');
{
  // La regla entera depende de que mobile-history.js siga igual: este
  // modulo solo ESCRIBE enlaces, y el reparto ya los respeta.
  const h = fs.readFileSync(path.join(RAIZ, 'src/mobile-history.js'), 'utf8');
  // El reparto vive en order-receipts.js desde 2026-11-11 (lo comparten
  // Sent y el LIVE); la regla se mira allí.
  const rc = fs.readFileSync(path.join(RAIZ, 'src/order-receipts.js'), 'utf8');
  prueba('el reparto sigue respetando el enlace primero',
    /if \(r\.reservado\) \{[\s\S]{0,200}\} else if \(r\.fecha && r\.fecha < suelo\)/.test(rc));
  // El reparto no cambia: solo le llegan mas enlaces, que ya sabia
  // respetar. Lo que SI hay es la llamada que los escribe, antes.
  prueba('el historial lo llama antes de repartir',
    h.indexOf('A.escribir(') > 0 &&
    h.indexOf('A.escribir(') < h.indexOf('const recibos'));
  prueba('con la frontera del ciclo abierto',
    /desde: ini \? ini\.toISOString\(\) : ''/.test(h));
  prueba('y sin releer la tabla despues',
    /for \(const f of nuevos\) dueno\.set\(/.test(h));
  // El arranque del ciclo se lee UNA vez: dos lecturas son dos
  // respuestas posibles a cuando empezo esta semana.
  prueba('el arranque del ciclo se lee una sola vez',
    (h.match(/C\.startedAt && C\.startedAt\(\)/g) || []).length === 1,
    String((h.match(/C\.startedAt && C\.startedAt\(\)/g) || []).length));
}

grupo('y el origen queda escrito');
{
  const m25 = path.join(RAIZ, 'database/migrations/025_invoice_order_links_origen.sql');
  prueba('con su migracion', fs.existsSync(m25));
  const sql = fs.existsSync(m25) ? fs.readFileSync(m25, 'utf8') : '';
  prueba('añade la columna', /add column if not exists origen/.test(sql));
  // Las filas que ya existen son todas a mano: marcarlas como auto
  // seria mentir sobre su origen y dejarlas expuestas al borrado en
  // bloque.
  prueba('y las de antes quedan como manual', /default 'manual'/.test(sql));
}

grupo('y se carga antes que quien lo usa');
{
  // Funcionaria igual cargado despues —la llamada es en tiempo de
  // ejecucion—, pero "funciona por casualidad" es justo lo que mordio
  // con sheet.js hace dos dias.
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  prueba('antes que el historial',
    html.indexOf('src/invoice-order-auto.js') < html.indexOf('src/mobile-history.js'));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

}
})();
