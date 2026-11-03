#!/usr/bin/env node
/*
 * ── Las facturas de ciclos cerrados, por ciclo ──────────────────────
 *
 * Al abrir un ciclo nuevo, las facturas del anterior salen de la
 * pantalla de Invoices y caen en "N from earlier cycles". Eso ya
 * estaba bien —no se borra nada—, pero era un cajón PLANO: en dos
 * meses, cuatrocientas facturas ordenadas por fecha y nada más.
 *
 * Ahora cada una cae en el ciclo que estaba abierto el día que llegó.
 *
 * ── Lo que no se puede hacer ────────────────────────────────────────
 *
 * `locations.weekly_reset_at` sólo recuerda el ciclo ABIERTO, así que
 * la historia anterior a la primera fila de `cycle_periods` no existe
 * y no hay de dónde sacarla. Esas facturas van a un grupo final que
 * lo dice con esas palabras, en vez de inventar un rango.
 *
 * Lo que se protege:
 *
 *   1. Cada factura cae en SU ciclo, por fecha local.
 *   2. El límite es cerrado por abajo y abierto por arriba: una
 *      factura del día que abrió un ciclo es de ese ciclo, no del
 *      anterior. Ya nos comimos dos facturas del 26 por esto.
 *   3. Lo anterior al primer registro se agrupa aparte y se dice.
 *   4. Sin la tabla —su SQL se corre a mano— la pantalla sigue
 *      funcionando, con un solo cajón como antes.
 *   5. Un ciclo sin facturas no pinta cabecera.
 *   6. Los tres caminos de abrir ciclo registran la apertura.
 *
 *   node tools/test-ciclos-facturas.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

// Tres ciclos: abierto el 1 de nov, y antes 26-oct y 19-oct.
// Las marcas llevan hora de la tarde a propósito: con el corte en UTC
// el 26 por la tarde en Pensilvania se lee como 27.
const APERTURAS = [
  '2026-11-01T22:30:00.000Z',
  '2026-10-26T23:10:00.000Z',
  '2026-10-19T21:45:00.000Z'
];

// line_price por línea; una fila por línea de factura.
// Una de un proveedor que marcaste como NO tuyo, y una que no es
// bebida. Las dos tienen que quedarse fuera de la lista de antes
// igual que se quedan fuera de la del ciclo.
const OCULTO = 'FISH WINDOW CLEANING';
const LINEAS = [
  // ciclo 26-oct → 1-nov
  ['A1', '2026-10-26', '189652844', 'LOOP',          100],
  ['A1', '2026-10-26', '189652844', 'LOOP',           50],
  ['A2', '2026-10-30', 'SG-88120',  'SOUTHERN',      200],
  // ciclo 19-oct → 26-oct
  ['B1', '2026-10-19', '189640112', 'LOOP',          300],
  ['B2', '2026-10-23', 'TR-2201',   'TRIAGE',        120],
  // antes del primer registro
  ['C1', '2026-10-12', '189602001', 'LOOP',          400],
  // no es tuyo
  ['D1', '2026-10-28', 'FW-77',     OCULTO,          90],
  // es tuyo pero no es bebida
  ['E1', '2026-10-29', 'GR-12',     'LOOP',          40],
  // Target: ni esta en el catalogo de bebida ni enlazada a ninguna
  // botella tuya. Es una factura de verdad, pero no es de barra.
  ['T1', '2026-10-22', '',          'TARGET',        10.49]
];
const NO_BEBIDA = new Set(['E1']);
const AJENA     = new Set(['T1']);

function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.BARSTOCK_CONFIG = {
    SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k',
    LOCATION_NAME: 'The Crown Tavern'
  };
  w.state = { master: [] };
  w.scrollTo = () => {};
  w.BarStockToast = { show() {} };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };
  // El ciclo abierto arrancó el 1 de noviembre.
  w.BarStockWeeklyCycle = { fechaInicioLocal: () => '2026-11-01' };

  global.fetch = w.fetch = async (url) => {
    const u = String(url);
    if (/cycle_periods/.test(u)) {
      if (o.sinTabla) {
        return { ok: false, json: async () => ({
          code: '42P01', message: 'relation "cycle_periods" does not exist' }) };
      }
      return { ok: true, json: async () => APERTURAS.map(s => ({ started_at: s })) };
    }
    if (/marginedge_invoice_lines/.test(u) && /invoice_date=lt\./.test(u)) {
      return { ok: true, headers: { get: () => '0-0/' + LINEAS.length },
        json: async () => LINEAS.map(([id, f, num, v, p]) => ({
          order_id: id, invoice_date: f, invoice_number: num,
          vendor_name: v, line_price: p, quantity: 1,
          // product_id por FACTURA: basta para distinguir la de comida.
          // Las ajenas van SIN product_id, como en la base de verdad:
          // es lo que hace que el filtro de bebida no las pille.
          product_id: AJENA.has(id) ? '' : id,
          vendor_item_name: 'Linea de ' + id, unit_price: p })) };
    }
    if (/marginedge_hidden/.test(u)) {
      return { ok: true, headers: { get: () => '0-0/1' },
        json: async () => [{ kind: 'vendor', clave: OCULTO }] };
    }
    if (/marginedge_products/.test(u)) {
      // El catálogo de bebida: todos menos el de comida.
      return { ok: true, headers: { get: () => '0-0/4' },
        json: async () => LINEAS.map(l => l[0])
          .filter(id => !NO_BEBIDA.has(id) && !AJENA.has(id))
          .map(id => ({ product_id: id })) };
    }
    return { ok: true, headers: { get: () => '0-0/0' }, json: async () => [] };
  };

  // Esta pantalla no se registra como pestaña: vive dentro de Orders y
  // se monta a mano.
  w.BarStockMobile = { register() {}, ir() {}, refrescarBadges() {} };
  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-invoices.js'), 'utf8'))();
  return { w, M: w.BarStockMobileInvoices };
}

// Pinta la vista "earlier cycles" y devuelve los grupos leídos del DOM.
async function vista(o) {
  const { w, M } = entorno(o);
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'invoices';
  w.document.body.appendChild(host);
  await M.montar(host);

  // El enlace del pie, que es como se llega de verdad.
  const b = host.querySelector('[data-ver="antes"]');
  if (b) b.onclick();
  for (let i = 0; i < 40 && !host.querySelector('.m-hcard'); i++) {
    await new Promise(r => setTimeout(r, 5));
  }

  const grupos = [];
  let actual = null;
  for (const el of host.querySelectorAll('.m-iciclo, .m-hcard')) {
    if (el.classList.contains('m-iciclo')) {
      actual = {
        titulo: el.querySelector('.m-iciclo-t').textContent.trim(),
        meta: el.querySelector('.m-iciclo-s').textContent.trim(),
        facturas: []
      };
      grupos.push(actual);
    } else if (actual) {
      actual.facturas.push(el.querySelector('.m-hcard-v').textContent.trim());
    }
  }
  return { w, host, grupos };
}

(async () => {

grupo('cada factura cae en su ciclo');
{
  const { grupos, host } = await vista();
  prueba('hay tres grupos', grupos.length === 3,
    JSON.stringify(grupos.map(g => g.titulo)));

  prueba('el primero es Oct 26 – Nov 1', grupos[0] && grupos[0].titulo === 'Oct 26 – Nov 1',
    grupos[0] && grupos[0].titulo);
  prueba('con sus dos facturas',
    grupos[0] && grupos[0].facturas.join('|') === 'SOUTHERN|LOOP',
    grupos[0] && grupos[0].facturas.join('|'));
  prueba('y su total', /\$350\.00/.test(grupos[0].meta), grupos[0].meta);
  prueba('y cuántos días duró', /6 days/.test(grupos[0].meta), grupos[0].meta);

  prueba('el segundo es Oct 19 – Oct 26', grupos[1] && grupos[1].titulo === 'Oct 19 – Oct 26',
    grupos[1] && grupos[1].titulo);
  prueba('con las suyas',
    grupos[1] && grupos[1].facturas.sort().join('|') === 'LOOP|TRIAGE',
    grupos[1] && grupos[1].facturas.join('|'));

  // Seis líneas, cinco facturas: dos de ellas son de la misma (A1).
  prueba('ninguna factura se perdió por el camino',
    host.querySelectorAll('.m-hcard').length === 5,
    String(host.querySelectorAll('.m-hcard').length));
}

grupo('el día que abre un ciclo es de ESE ciclo, no del anterior');
{
  // La factura del 26 abrió ese ciclo esa misma tarde. Con el corte en
  // UTC —el 26 a las 23:10 en Pensilvania es el 27 en UTC— se habría
  // ido al grupo de antes. Ya nos comimos dos facturas del 26 por esto.
  const { grupos } = await vista();
  const loop26 = grupos.find(g => g.titulo === 'Oct 26 – Nov 1');
  prueba('la del 26 está en el ciclo del 26',
    loop26 && loop26.facturas.includes('LOOP'), JSON.stringify(loop26));
  const anterior = grupos.find(g => g.titulo === 'Oct 19 – Oct 26');
  prueba('y no se coló en el anterior',
    anterior && anterior.facturas.length === 2, JSON.stringify(anterior));
}

grupo('lo anterior al primer registro se dice, no se inventa');
{
  const { grupos } = await vista();
  const ultimo = grupos[grupos.length - 1];
  prueba('el último grupo es "Before Oct 19"', ultimo.titulo === 'Before Oct 19', ultimo.titulo);
  prueba('y explica por qué no tiene rango',
    /not recorded/.test(ultimo.meta), ultimo.meta);
  prueba('con la factura vieja dentro',
    ultimo.facturas.join('|') === 'LOOP', ultimo.facturas.join('|'));
}

grupo('un ciclo sin facturas no pinta cabecera');
{
  // Hay tres aperturas registradas y sólo dos tienen facturas propias;
  // el tercer grupo del DOM es el de "antes", no un ciclo vacío.
  const { grupos } = await vista();
  prueba('no hay cabeceras de más', grupos.length === 3,
    JSON.stringify(grupos.map(g => g.titulo)));
  prueba('y ninguna sin facturas',
    grupos.every(g => g.facturas.length > 0),
    JSON.stringify(grupos.map(g => [g.titulo, g.facturas.length])));
}

grupo('y las que no son compras de barra se dejan fuera');
{
  // Target, la ferretería: facturas de verdad, pero nada suyo es una
  // botella tuya. En el historial el filtro de bebida no basta porque
  // un producto de hace meses puede no estar ya en el catálogo.
  const { host } = await vista();
  prueba('Target no sale', !/TARGET/.test(host.textContent),
    host.textContent.slice(0, 220));
  prueba('pero las tuyas sí', /LOOP/.test(host.textContent));

  // Y NO en silencio: se dicen y se pueden desplegar. Esconder sin
  // decirlo ya nos costó caro con los productos dormidos.
  const b = host.querySelector('#miAjenas');
  prueba('se avisa de cuántas hay', !!b, host.textContent.slice(-140));
  prueba('y dice qué son', /nothing of yours/.test(host.textContent));

  b.onclick();
  for (let i = 0; i < 40 && !/TARGET/.test(host.textContent); i++) {
    await new Promise(r => setTimeout(r, 5));
  }
  prueba('al desplegar, aparecen', /TARGET/.test(host.textContent),
    host.textContent.slice(0, 220));
}

grupo('y aplican el MISMO filtro que la lista del ciclo');
{
  // Esta lista montaba su propia agrupación en crudo: salían todos los
  // proveedores, incluidos los que marcaste como no tuyos, y las
  // líneas que no son bebida.
  const { host } = await vista();
  const txt = host.textContent;
  prueba('el proveedor oculto no sale', !new RegExp(OCULTO, 'i').test(txt),
    txt.slice(0, 200));
  prueba('ni la factura que no es bebida', !/GR-12/.test(txt));
  // Y las de verdad siguen estando.
  prueba('las tuyas sí', /LOOP/.test(txt) && /SOUTHERN/.test(txt));
}

grupo('las facturas de antes se pueden ABRIR');
{
  // Eran divs muertos: se veian el proveedor y el total y ya. Enlazar
  // una a su orden —que es para lo que se mira esa lista— era
  // imposible.
  const { w, host } = await vista();
  const t = host.querySelector('[data-vieja]');
  prueba('son botones', !!t && t.tagName === 'BUTTON', t && t.tagName);
  prueba('con chevron', !!host.querySelector('.m-hcard-go'));

  t.onclick();
  for (let i = 0; i < 40 && !host.querySelector('.m-itot'); i++) {
    await new Promise(r => setTimeout(r, 5));
  }
  prueba('abren el detalle', !!host.querySelector('.m-itot'),
    host.textContent.slice(0, 120));
  // Y desde el detalle se puede enlazar, que era el objetivo.
  prueba('con la opción de enlazar a una orden',
    /Link to an order|Counts toward/.test(host.textContent),
    host.textContent.slice(0, 200));
}

grupo('y con el ciclo vacío, la puerta a las anteriores sigue ahí');
{
  // Es el día después de reiniciar: cero facturas propias. El pie con
  // "N from earlier cycles" se pintaba sólo en la lista con facturas,
  // así que justo cuando era la única puerta, no existía.
  const { w, M } = entorno();
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'invoices';
  w.document.body.appendChild(host);
  await M.montar(host);
  prueba('el ciclo está vacío', /No invoices yet this cycle/.test(host.textContent));
  const b = host.querySelector('[data-ver="antes"]');
  prueba('pero el enlace está', !!b, host.textContent.slice(0, 160));
  prueba('y dice cuántas hay', /9 from earlier cycles/.test(host.textContent),
    host.textContent.slice(0, 200));
  b.onclick();
  for (let i = 0; i < 40 && !host.querySelector('.m-hcard'); i++) {
    await new Promise(r => setTimeout(r, 5));
  }
  prueba('y lleva a algún sitio', host.querySelectorAll('.m-hcard').length === 5,
    String(host.querySelectorAll('.m-hcard').length));
}

grupo('sin la tabla, la pantalla sigue de pie');
{
  // El SQL se corre a mano. Que falte una migración puede quitar el
  // agrupado, nunca tumbar la vista.
  const { host, grupos } = await vista({ sinTabla: true });
  prueba('las facturas siguen saliendo',
    host.querySelectorAll('.m-hcard').length === 5,
    String(host.querySelectorAll('.m-hcard').length));
  prueba('en un solo cajón, como antes',
    grupos.length === 1 && grupos[0].titulo === 'No date',
    JSON.stringify(grupos.map(g => g.titulo)));
}

grupo('los tres caminos de abrir ciclo dejan constancia');
{
  const co = fs.readFileSync(path.join(RAIZ, 'src/cycle-open.js'), 'utf8');
  const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const cf = fs.readFileSync(path.join(RAIZ, 'src/count-finish.js'), 'utf8');

  prueba('el registro vive en cycle-open', /function registrar/.test(co));
  // En settle() y no en prepare(): prepare corre ANTES de escribir, así
  // que ahí la marca de tiempo habría que inventarla, y una frontera
  // aproximada es justo como una factura acaba del lado equivocado.
  prueba('y lo llama settle, no prepare',
    /await registrar\(origen\)/.test(co) &&
    co.indexOf('await registrar(origen)') > co.indexOf('async function settle'));

  prueba('camino 1 · el botón', /settle\?\.\('reset'\)/.test(idx));
  prueba('camino 2 · importar archivo', /settle\?\.\('file'\)/.test(idx));
  prueba('camino 3 · cerrar un conteo', /settle\?\.\('count'\)/.test(cf));

  // Dos dispositivos pueden cerrar el mismo ciclo a la vez.
  prueba('y un duplicado no rompe nada',
    /ignore-duplicates/.test(co));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
