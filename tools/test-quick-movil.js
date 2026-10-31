#!/usr/bin/env node
/*
 * ── Quick order en el teléfono ───────────────────────────────────────
 *
 * De esta pantalla sale un pedido REAL a un proveedor, así que lo que
 * se protege no es el aspecto:
 *
 *   1. El botón cambia con el proveedor. LOOP no se pide por correo
 *      —se sube un CSV— así que ahí es "Save to history" y se guarda y
 *      punto. En los demás es una orden que sale por email, y entonces
 *      pasa por la revisión, que es donde se eligen los destinatarios.
 *      Si el botón mintiera, mandarías un pedido creyendo que apuntas
 *      una compra.
 *
 *   2. La ENTRADA la arma `construirEntrada` del escritorio. Dos
 *      pantallas armándola a su manera acaban con dos clases de orden
 *      rápida en el historial.
 *
 *   3. Esta pantalla no guarda ni envía por su cuenta: no hay `fetch`
 *      ni `persistOrderToSupabase` en el archivo. Es la guarda
 *      estructural de lo anterior.
 *
 *   4. Volver atrás NO pierde el borrador, y colocar la orden SÍ lo
 *      tira. Lo primero te ahorra teclearlo todo otra vez de pie en
 *      una tienda; lo segundo evita mandar el mismo pedido dos veces.
 *
 *   5. Cambiar de proveedor vacía las líneas. Una orden es a un
 *      proveedor.
 *
 *   6. Ningún campo nuevo por debajo de 16px. Safari hace zoom al
 *      enfocarlos y con el zoom bloqueado no se vuelve.
 *
 *   node tools/test-quick-movil.js
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

// item, vendor, onHand, par, toOrder, precio
const FILAS = [
  ["Tito's Vodka 1.75L", 'LOOP',     0, 18, 18, 26.99],
  ['Bulleit Bourbon',    'LOOP',     2,  6,  4, 22.40],
  ['Prosecco Nino',      'SOUTHERN', 1,  3,  2, 14.00],
  ['Cointreau',          'SOUTHERN', 0,  4,  4, 34.50],
  ['Canyon Oaks Chard',  'SOUTHERN', 3,  6,  3,  0]
];

function pantalla() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  w.state = { master: FILAS.map(([item, vendor, onHand, suggested, toOrder, value]) => ({
    item, vendor, onHand, suggested, toOrder, value, orderOverride: '',
    code: '', itemNorm: item.toLowerCase()
  })) };

  // ── Las piezas del escritorio, con su forma de verdad ─────────────
  //
  // Van en `global` ADEMÁS de en `w`: `quick-order.js` las llama como
  // identificadores a secas, y dentro de un `new Function` eso
  // resuelve al global de Node, no al del navegador falso. Es la misma
  // trampa que este proyecto ya tiene anotada con `fetch`.
  const poner = (n, f) => { w[n] = f; global[n] = f; };
  poner('parseNum', (v) => {
    const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  });
  poner('clampNonNegative', (v) => Math.max(0, w.parseNum(v)));
  let _id = 0;
  poner('uniqueOrderId', () => 'ord_test_' + (++_id));
  poner('escapeHtml', (s) => String(s == null ? '' : s));
  poner('normalizeName', (s) => String(s || '').trim().toLowerCase());
  poner('fmtMoney', (v) => '$' + w.parseNum(v).toFixed(2));
  poner('fmt', (v) => String(v));
  poner('setStatus', () => {});
  poner('state', w.state);

  w.supportsManualFinalOrder = (v) =>
    ['SOUTHERN', 'BREAKTHRU', 'WINE MERCHANT', 'LOOP'].includes(String(v || '').toUpperCase());
  w.getEffectiveOrder = (r) =>
    (w.supportsManualFinalOrder(r.vendor) && r.orderOverride !== '' && r.orderOverride != null)
      ? Math.max(0, Number(r.orderOverride)) : Math.max(0, Number(r.toOrder) || 0);
  w.getActiveVendors = () => ['LOOP', 'SOUTHERN'];
  w.getVendorsWithUnknown = () => ['LOOP', 'SOUTHERN', 'UNKNOWN'];
  w.computeOrderSubtotal = (rows) => (rows || []).reduce(
    (s, r) => s + w.getEffectiveOrder(r) * (Number(r.value) || 0), 0);

  w.__guardadas = [];
  w.persistOrderToSupabase = async (o) => {
    if (w.__fallarGuardado) throw new Error('cloud down');
    w.__guardadas.push(o);
  };
  w.__recargado = 0;
  w.loadOrdersFromCloud = async () => { w.__recargado++; };

  w.__toasts = [];
  w.BarStockToast = { show: (t) => w.__toasts.push(String(t)) };

  // El contenedor de Orders, para ver a dónde se manda el borrador.
  w.__borradores = [];
  w.__secciones = [];
  w.BarStockMobileOrders = {
    revisarBorrador: (b) => { w.__borradores.push(b); return true; },
    abrirSeccion: (s) => { w.__secciones.push(s); }
  };

  w.__ido = [];
  let def = null;
  w.BarStockMobile = Object.assign(
    { register(d) { def = d; }, refrescarBadges() {},
      ir(id) { w.__ido.push(String(id)); } },
    require('./lib-cabecera'));

  // El módulo del escritorio, DE VERDAD. Es de donde sale
  // `construirEntrada`, `porCorreo` y la lista de proveedores: un stub
  // aquí sería la segunda copia que el test viene a impedir.
  new Function(fs.readFileSync(path.join(RAIZ, 'src/quick-order.js'), 'utf8'))();
  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-quick.js'), 'utf8'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

  const host = w.document.createElement('div');
  host.className = 'm-screen on';
  host.dataset.screen = 'quick';
  w.document.body.appendChild(host);
  def.mount(host);
  return { w, host, def };
}

const texto = (host, sel) => {
  const e = host.querySelector(sel);
  return e ? e.textContent.trim() : '';
};
const chip = (host, nombre) =>
  Array.from(host.querySelectorAll('[data-qv]')).find(b => b.dataset.qv === nombre);

// Añade una botella: busca, elige el primer resultado, pone cantidad.
function anadir(w, host, texto_, cant, precio) {
  const f = host.querySelector('#mqFind');
  f.value = texto_;
  f.dispatchEvent(new w.Event('input'));
  const r = host.querySelector('[data-qr="0"]');
  if (!r) return false;
  r.click();
  const q = host.querySelector('#mqQty');
  if (q) q.value = String(cant == null ? 1 : cant);
  if (precio != null) host.querySelector('#mqPrice').value = String(precio);
  host.querySelector('#mqAdd').click();
  return true;
}

console.log('\nel buscador pide dos letras y solo mira el proveedor elegido');
{
  const { w, host } = pantalla();
  // Arranca en el primer proveedor de la lista de la app.
  ok('arranca en LOOP', !!(chip(host, 'LOOP') || {}).classList.contains('on'));

  const f = host.querySelector('#mqFind');
  f.value = 't';
  f.dispatchEvent(new w.Event('input'));
  ok('con una letra no enseña nada', !host.querySelector('[data-qr]'));

  f.value = 'tito';
  f.dispatchEvent(new w.Event('input'));
  ok('con dos ya busca', !!host.querySelector('[data-qr]'));

  f.value = 'prosecco';
  f.dispatchEvent(new w.Event('input'));
  ok('y no cuela una botella de otro proveedor', !host.querySelector('[data-qr]'),
     'Prosecco es de SOUTHERN y estamos en LOOP');
}

console.log('\nLOOP se guarda y se acabo: no pasa por la revision');
{
  const { w, host } = pantalla();
  ok('añade la botella', anadir(w, host, 'tito', 2));
  ok('y sale en la lista', /Tito/.test(texto(host, '.m-qk-list')));

  const b = host.querySelector('#mqMain');
  ok('el boton dice Save to history', /save to history/i.test((b || {}).textContent || ''),
     (b || {}).textContent);
  ok('y el subtitulo avisa de que no se manda nada',
     /nothing gets sent/i.test(texto(host, '.m-hsub')), texto(host, '.m-hsub'));
}

console.log('\nlo que se guarda sale del constructor del escritorio');
(async () => {
  const { w, host } = pantalla();
  anadir(w, host, 'tito', 2, 30);
  host.querySelector('#mqMain').click();
  await new Promise(r => setTimeout(r, 0));

  const o = w.__guardadas[0];
  ok('se guardo una orden', !!o);
  ok('y se releyo la nube', w.__recargado === 1);
  if (o) {
    ok('marcada como rapida', o.quickOrder === true);
    ok('con la nota por defecto', o.note === 'Quick Order', o.note);
    ok('LOOP sale por CSV', o.exportType === 'loop_csv', o.exportType);
    ok('con la cantidad en finalOrder', o.items[0].finalOrder === 2, String(o.items[0].finalOrder));
    ok('y el precio escrito a mano, no el del catalogo',
       o.items[0].value === 30, String(o.items[0].value));
    ok('el total en botellas', o.totalUnits === 2, String(o.totalUnits));
    ok('y en dinero', o.subtotal === 60, String(o.subtotal));
  }

  ok('la pantalla lo cuenta', /saved/i.test(texto(host, '.m-rev-ok-t')), texto(host, '.m-rev-ok-t'));
  ok('y el borrador se vacio', !host.querySelector('.m-qk-l'));
  host.querySelector('#mqDone').click();
  ok('Done lleva a Sent, donde acaba de aparecer',
     w.__secciones.join(',') === 'sent', w.__secciones.join(','));

  // ── Si la nube falla, las lineas SE QUEDAN ───────────────────────
  const b = pantalla();
  b.w.__fallarGuardado = true;
  anadir(b.w, b.host, 'tito', 2);
  b.host.querySelector('#mqMain').click();
  await new Promise(r => setTimeout(r, 0));
  ok('lo dice', /was not saved/i.test(texto(b.host, '.m-rev-fallo')), texto(b.host, '.m-rev-fallo'));
  ok('y no se tragó el borrador', !!b.host.querySelector('.m-qk-l'));
  ok('ni dio por hecho que guardo', !b.host.querySelector('.m-rev-ok-t'));

  console.log('\nel resto de proveedores va a la revision, no se guarda aqui');
  {
    const { w, host } = pantalla();
    chip(host, 'SOUTHERN').click();
    anadir(w, host, 'cointreau', 3);

    const bt = host.querySelector('#mqMain');
    ok('el boton dice Review and send', /review and send/i.test((bt || {}).textContent || ''),
       (bt || {}).textContent);
    ok('y el subtitulo dice que sale por correo',
       /by email/i.test(texto(host, '.m-hsub')), texto(host, '.m-hsub'));

    bt.click();
    ok('se entrego el borrador', w.__borradores.length === 1);
    const b2 = w.__borradores[0] || {};
    ok('con el proveedor', b2.nombre === 'SOUTHERN', b2.nombre);
    ok('y sus lineas', (b2.filas || []).length === 1);
    ok('con la cantidad puesta', (b2.filas || [{}])[0].qty === 3);
    ok('aqui NO se guardo nada', w.__guardadas.length === 0);
    ok('ni se mando a ninguna seccion', w.__secciones.length === 0);
  }

  console.log('\ncambiar de proveedor vacia las lineas');
  {
    const { w, host } = pantalla();
    anadir(w, host, 'tito', 2);
    w.confirm = () => false;
    chip(host, 'SOUTHERN').click();
    ok('si dices que no, no cambia', !!(chip(host, 'LOOP') || {}).classList.contains('on'));
    ok('y las lineas siguen', !!host.querySelector('.m-qk-l'));
    w.confirm = () => true;
    chip(host, 'SOUTHERN').click();
    ok('si dices que si, cambia', !!(chip(host, 'SOUTHERN') || {}).classList.contains('on'));
    ok('y se vacian', !host.querySelector('.m-qk-l'),
       'una orden es a UN proveedor');
  }

  console.log('\nvolver no pierde el borrador; colocar si lo tira');
  {
    const { w, host, def } = pantalla();
    anadir(w, host, 'tito', 2);
    // Esto es lo que hace el armazon al volver a entrar.
    def.show(host);
    ok('el borrador sigue ahi', !!host.querySelector('.m-qk-l'),
       'volver de la revision y encontrarlo vacio obliga a teclearlo todo otra vez');

    // Y esto es lo que llama `colocar()` en cuanto la orden existe.
    w.BarStockMobileQuick.limpiar();
    def.show(host);
    ok('colocada, el borrador se tira', !host.querySelector('.m-qk-l'),
       'si no, volver atras lo deja listo para mandarse otra vez');
  }

  console.log('\nel dialogo del escritorio sigue funcionando igual');
  {
    // ── Por que esto se prueba ───────────────────────────────────────
    //
    // `save()` se partio en dos para que el movil pudiera pasarle los
    // datos por parametro en vez de por el DOM. El escritorio es lo
    // que Axel usa HOY: si el camino de siempre se rompio, se entera
    // el lunes con la orden en la mano.
    const { w } = pantalla();
    const q = w.BarStockQuickOrder;

    const campo = (id, type, value) => {
      const e = w.document.createElement('input');
      e.id = id; e.type = type || 'text'; e.value = value == null ? '' : value;
      w.document.body.appendChild(e);
      return e;
    };
    const caja = (id) => {
      const e = w.document.createElement('div');
      e.id = id; w.document.body.appendChild(e);
      return e;
    };
    caja('quickOrderVendorTabs'); caja('quickOrderItemsBody');
    caja('quickOrderSubtotalAmount'); caja('quickOrderCount');
    caja('quickOrderModalBg'); caja('quickOrderProductsList');
    campo('quickOrderDateInput', 'date', '2026-10-31');
    campo('quickOrderTimeInput', 'time', '14:20');
    campo('quickOrderNoteInput', 'text', 'Run to the store');
    const prod = campo('quickOrderProductInput', 'text', 'Cointreau');
    campo('quickOrderQtyInput', 'number', '3');
    const precio = campo('quickOrderPriceInput', 'number', '');

    q.setVendor('SOUTHERN');
    ok('las pestañas salen de la lista de la app',
       /SOUTHERN/.test(w.document.getElementById('quickOrderVendorTabs').innerHTML) &&
       /UNKNOWN/.test(w.document.getElementById('quickOrderVendorTabs').innerHTML));

    q.addItem();
    ok('añadio la linea', q.getItems().length === 1);
    ok('con el precio del catalogo si no escribes uno',
       q.getItems()[0].value === 34.5, String(q.getItems()[0].value));

    prod.value = 'Prosecco Nino';
    w.document.getElementById('quickOrderQtyInput').value = '2';
    precio.value = '12';
    q.addItem();
    ok('y una segunda', q.getItems().length === 2);

    await q.save();
    const o = w.__guardadas[0];
    ok('el escritorio guardo', !!o);
    if (o) {
      ok('con su fecha y hora, no con "ahora"',
         o.createdAt.slice(0, 10) === '2026-10-31', o.createdAt);
      ok('con la nota escrita', o.note === 'Run to the store', o.note);
      ok('SOUTHERN sale por imagen', o.exportType === 'vendor_jpg', o.exportType);
      ok('las dos lineas', o.items.length === 2);
      ok('3 + 2 botellas', o.totalUnits === 5, String(o.totalUnits));
      ok('y el dinero cuadra', o.subtotal === 3 * 34.5 + 2 * 12, String(o.subtotal));
    }
    ok('y cerro el dialogo',
       w.document.getElementById('quickOrderModalBg').classList.contains('hidden'));
  }

  console.log('\nla pantalla no sabe guardar ni enviar por su cuenta');
  {
    const src = fs.readFileSync(path.join(RAIZ, 'src/mobile-quick.js'), 'utf8');
    const sinComentarios = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    ok('ni un fetch', !/\bfetch\s*\(/.test(sinComentarios));
    ok('ni persistOrderToSupabase', !/persistOrderToSupabase/.test(sinComentarios));
    ok('ni genera el PDF', !/generarPdf/.test(sinComentarios));
    // Y la regla de LOOP no esta escrita aqui otra vez: se pregunta.
    ok('pregunta la regla de LOOP en vez de repetirla',
       /porCorreo/.test(sinComentarios));

    // ── 16px o Safari hace zoom ──────────────────────────────────────
    const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8');
    const bloque = (css.match(/\.m-qk-campo\s*\{[^}]*\}/) || [''])[0];
    ok('el campo nuevo tiene suelo de 16px', /max\(\s*16px/.test(bloque), bloque.slice(0, 120));
    // A escala "small" la base baja a 13px y `--m-strong` se queda en
    // 14.8: por eso el suelo es un numero clavado y no la variable.
    ok('y no confia solo en --m-strong',
       !/font-size:\s*var\(--m-strong\)\s*;/.test(bloque));

    // Todos los campos de la pantalla pasan por clases con suelo de
    // 16px. Una clase nueva sin medir es como se colaron los dos
    // campos de Ajustes que ya nos pasaron.
    const { host } = pantalla();
    chip(host, 'SOUTHERN').click();
    host.querySelector('#mqWhen').click();
    const malos = Array.from(host.querySelectorAll('input')).filter(i =>
      !/m-qk-campo/.test(i.className) &&
      !i.closest('.m-step') && !i.closest('.m-money'));
    ok('ningun campo fuera de las clases medidas', malos.length === 0,
       malos.map(i => i.id || i.type).join(','));
  }

  console.log('\n' + (falla ? falla + ' MAL   ·   ' : 'todo bien   ·   ') +
              pasa + ' comprobaciones');
  process.exit(falla ? 1 : 0);
})();
