#!/usr/bin/env node
/*
 * ── Órdenes en el teléfono ───────────────────────────────────────────
 *
 * Esta pantalla cambia cantidades que acaban en un pedido real, así que
 * lo que se protege no es el aspecto:
 *
 *   1. Ajustar usa updateFinalOrder con el índice del MAESTRO. Ése es
 *      el camino que guarda en la nube; cualquier otro deja el cambio
 *      sólo en el teléfono y el escritorio pide lo de antes.
 *   2. Escribir a mano guarda al TERMINAR, no en cada tecla. Tecleando
 *      "12" se pasa por "1", y guardar ese 1 es pedir una botella.
 *   3. Una línea que no llegó a la nube se marca. Sin eso, ajustar con
 *      mala señal se ve igual que ajustar bien.
 *   4. Un proveedor sin ajuste manual no enseña botones que no hacen
 *      nada: enseña la cantidad y dice por qué.
 *
 *   node tools/test-orders-screen.js
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

// item, vendor, onHand, par, toOrder, precio, override
const FILAS = [
  ["Tito's Vodka",      'LOOP',      0,  18, 18, 26.99, ''],
  ['Bulleit Bourbon',   'LOOP',      2,  6,  4,  22.40, 6],
  ['Jameson Irish',     'LOOP',      1,  4,  3,  0,     ''],
  ['Prosecco Nino',     'SOUTHERN',  1,  3,  2,  14.00, ''],
  ['Mystery Amaro',     'PEQUENO',   0,  2,  2,  10.00, ''],
  ['Sin clasificar',    'UNKNOWN',   0,  5,  5,  9.00,  '']
];

function pantalla(extra) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  w.state = { master: FILAS.map(([item, vendor, onHand, suggested, toOrder, value, ov]) => ({
    item, vendor, onHand, suggested, toOrder, value, orderOverride: ov,
    code: '', itemNorm: item.toLowerCase()
  })) };

  // Las mismas funciones del escritorio, con su misma forma.
  w.supportsManualFinalOrder = (v) =>
    ['SOUTHERN', 'BREAKTHRU', 'WINE MERCHANT', 'LOOP'].includes(String(v || '').toUpperCase());
  w.getEffectiveOrder = (r) =>
    (w.supportsManualFinalOrder(r.vendor) && r.orderOverride !== '' && r.orderOverride != null)
      ? Math.max(0, Number(r.orderOverride)) : Math.max(0, Number(r.toOrder) || 0);
  w.getActiveVendors = () => ['LOOP', 'SOUTHERN', 'PEQUENO', 'UNKNOWN'];
  // Copiado del de verdad, y el detalle importa: filtra por cantidad
  // EFECTIVA, no por toOrder. De ahi que poner un cero saque la linea
  // de la lista — que es sobre lo que se apoya todo lo de excluir.
  w.getOrderRowsForVendor = (v) => w.state.master.filter(r =>
    w.getEffectiveOrder(r) > 0 && r.vendor === v && !w.isRowPlaced(r));
  w.computeOrderSubtotal = (rows) => (rows || []).reduce(
    (s, r) => s + w.getEffectiveOrder(r) * (Number(r.value) || 0), 0);

  w.isRowPlaced = () => false;

  w.__abierto = [];
  w.BarStockAddToOrder = { open(v) {
    // El de verdad: sin proveedor mira la pestaña del escritorio, y
    // devuelve false si no sirve.
    const quien = v || (w.getActiveVendorTab ? w.getActiveVendorTab() : '');
    if (!quien || !w.supportsManualFinalOrder(quien)) return false;
    w.__abierto.push(String(quien).toUpperCase());
    return true;
  } };

  w.__guardados = [];
  w.updateFinalOrder = (i, v) => {
    w.__guardados.push({ i, v });
    w.state.master[i].orderOverride = Math.max(0, Number(v) || 0);
  };
  w.__reset = [];
  w.resetFinalOrder = (i) => { w.__reset.push(i); w.state.master[i].orderOverride = ''; };

  // ── Lo que hace falta para colocar ────────────────────────────────
  // Las mismas piezas del escritorio. Si la pantalla del telefono se
  // inventara su propia forma de guardar una orden, habria dos, y
  // cualquier arreglo habria que hacerlo dos veces.
  w.uniqueOrderId = () => 'ord_test_1';
  w.cloneOrderRow = (r) => Object.assign({}, r);
  w.__guardadas = [];
  w.persistOrderToSupabase = async (o) => {
    if (w.__fallarGuardado) throw new Error('cloud down');
    w.__guardadas.push(o);
  };
  w.__recargado = 0;
  // ── Fiel a lo que pasa de verdad, y esto importa ─────────────────
  //
  // Releer de la nube marca las lineas como colocadas Y dispara un
  // repintado. Las dos cosas juntas son las que destaparon el fallo:
  // el proveedor desaparece de `proveedores()` a mitad del envio, y
  // una pantalla de revision que consulte datos vivos se desmonta
  // sola — los pasos 2 y 3 no se ven y acabas en la lista sin
  // confirmacion, con el correo ya enviado.
  //
  // Con el stub mudo de antes, todo pasaba y en el telefono fallaba.
  w.loadOrdersFromCloud = async () => {
    w.__recargado++;
    const puestas = new Set();
    w.__guardadas.forEach(o => (o.items || []).forEach(i => puestas.add(i.item)));
    w.isRowPlaced = (r) => puestas.has(r && r.item);
    if (w.BarStockMobileOrders) w.BarStockMobileOrders.refresh();
  };

  w.__defaults = { SOUTHERN: {
    vendor_email: 'orders@southern.com, pedro@southern.com',
    account_number: '44821', rep_name: 'Pedro Morales'
  } };
  w.__guardadosDef = [];
  w.BarStockVendorDefaults = {
    getDefaults: async (v) => w.__defaults[v] || {},
    saveDefaults: async (v, f) => { w.__guardadosDef.push({ v, f }); }
  };

  w.__toasts = [];
  w.BarStockToast = { show: (t) => w.__toasts.push(String(t)) };

  // ── El correo ─────────────────────────────────────────────────────
  // El PDF lo genera el modulo del escritorio: si hubiera dos
  // generadores, el pedido se veria distinto segun desde donde se
  // mando.
  w.__pdfPedidos = [];
  w.BarStockEmailOrder = {
    generarPdf: async (vendor, items, resumen) => {
      w.__pdfPedidos.push({ vendor, items: items.length, resumen });
      return 'JVBERi0xLjQK';   // un PDF de mentira en base64
    }
  };
  w.BarStockSenderProfile = {
    getProfile: async () => ({ name: 'Axel Torres', email: 'axel@wjm.com' })
  };
  w.__enviados = [];
  // `global.fetch` TAMBIEN, no solo `w.fetch`: el modulo llama a
  // `fetch` a secas y dentro del `new Function` eso resuelve al global
  // de Node, no al del navegador falso. Es la misma trampa que el
  // proyecto ya tiene anotada con `state`, y aqui se traduce en una
  // peticion de verdad saliendo a internet desde una prueba.
  const red = async (url, opts) => {
    const cuerpo = JSON.parse((opts && opts.body) || '{}');
    w.__enviados.push({ url: String(url), cuerpo });
    if (w.__fallarCorreo) return { json: async () => ({ ok: false, error: 'mailbox full' }) };
    return { json: async () => ({ ok: true, id: 'msg_1' }) };
  };
  w.fetch = red; global.fetch = red;

  let def = null;
  // `cabecera` y `alVolver` son las DE VERDAD, copiadas del armazon
  // por referencia: se carga `mobile-shell.js` solo para tomarlas.
  //
  // Un stub propio aqui seria una segunda implementacion de la
  // cabecera, y el dia que cambie el markup el test seguiria pasando
  // mientras la app se rompe. Es justo lo que paso con
  // `loadOrdersFromCloud`.
  // `cabecera` y `alVolver` son las DE VERDAD, tomadas del armazon.
  // Un stub propio seria una segunda implementacion, y el dia que
  // cambie el markup los tests pasarian mientras la app se rompe.
  w.BarStockMobile = Object.assign(
    { register(d) { def = d; }, refrescarBadges() {} },
    require('./lib-cabecera'));

  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-orders.js'), 'utf8'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

  const host = w.document.createElement('div');
  host.className = 'm-screen on';
  host.dataset.screen = 'orders';
  w.document.body.appendChild(host);
  def.mount(host);
  return { w, host, def };
}

const nombres = (host, sel) =>
  Array.from(host.querySelectorAll(sel)).map(e => e.textContent.trim());
const abrir = (host, nombre) => {
  const b = Array.from(host.querySelectorAll('.m-ordv'))
    .find(x => x.querySelector('.m-ordv-n').textContent.trim() === nombre);
  b.click();
};

console.log('\nel resumen');
{
  const { host } = pantalla();
  // UNKNOWN no es un proveedor, es lo que todavia no tiene uno: un
  // pedido a UNKNOWN no se puede colocar en ningun sitio.
  ok('UNKNOWN no sale', nombres(host, '.m-ordv-n').indexOf('UNKNOWN') === -1);
  eq('salen los tres de verdad', nombres(host, '.m-ordv-n'), ['LOOP', 'SOUTHERN', 'PEQUENO']);

  // 18*26.99 + 6*22.40 + 3*0 = 620.22
  ok('el total del proveedor usa la cantidad efectiva', /\$620/.test(host.textContent));
  // 620.22 de LOOP + 28 de SOUTHERN + 20 de PEQUENO
  ok('y el de la semana los suma todos', /\$668/.test(host.textContent));

  // Un pedido sin precios no es barato, es uno que no sabes lo que
  // cuesta. Tiene que cantar desde el resumen.
  const loop = host.querySelector('.m-ordv');
  ok('LOOP avisa de la linea sin precio', loop.classList.contains('aviso'));
  ok('y dice cuantas son', /1 without price/.test(loop.textContent));
}

console.log('\nel detalle');
{
  const { host } = pantalla();
  abrir(host, 'LOOP');
  eq('tres lineas', host.querySelectorAll('.m-ord-l').length, 3);
  // El volver ya no es un renglon propio con etiqueta: es el chevron
  // de la cabecera, a la izquierda del titulo.
  ok('se puede volver', !!host.querySelector('#mAtras'));

  const sin = Array.from(host.querySelectorAll('.m-ord-l'))
    .find(x => /Jameson/.test(x.textContent));
  ok('la de sin precio se marca', sin.classList.contains('sinprecio'));
  // La diferencia entre "cuesta cero" y "no se lo que cuesta".
  ok('y su total de linea es una raya, no $0', /—/.test(sin.querySelector('.m-ord-l-t').textContent));

  const ed = Array.from(host.querySelectorAll('.m-ord-l'))
    .find(x => /Bulleit/.test(x.textContent));
  ok('la ajustada a mano se marca', ed.classList.contains('editada'));
  ok('y dice a que vuelve', /Auto was 4/.test(ed.textContent));
}

console.log('\najustar guarda por el camino de siempre');
{
  const { w, host } = pantalla();
  abrir(host, 'LOOP');
  const l = host.querySelector('.m-ord-l');            // Tito's, indice 0
  l.querySelector('[data-q="1"]').click();
  eq('suma uno', w.__guardados, [{ i: 0, v: 19 }]);
  // El indice es el del MAESTRO: es lo que updateFinalOrder espera, y
  // con el de la lista filtrada se pisaria otro articulo.
  eq('y el indice es el del maestro', w.state.master[0].orderOverride, 19);

  const { w: w2, host: h2 } = pantalla();
  abrir(h2, 'LOOP');
  const inp = h2.querySelector('.m-ord-l input');
  inp.value = '1';
  inp.dispatchEvent(new w2.Event('input'));
  eq('tecleando no se guarda nada', w2.__guardados, []);
  inp.value = '12';
  inp.dispatchEvent(new w2.Event('change'));
  eq('al terminar, si', w2.__guardados, [{ i: 0, v: 12 }]);
}

console.log('\ndeshacer un ajuste');
{
  const { w, host } = pantalla();
  abrir(host, 'LOOP');
  const ed = Array.from(host.querySelectorAll('.m-ord-l'))
    .find(x => /Bulleit/.test(x.textContent));
  ed.querySelector('.m-ord-undo').click();
  eq('usa resetFinalOrder, no un camino propio', w.__reset, [1]);
}

console.log('\nlo que no llego a la nube se ve');
{
  const { w, host } = pantalla();
  abrir(host, 'LOOP');
  // Lo llama persistOrderOverride desde index.html cuando Supabase
  // rechaza el cambio. Sin esto, ajustar con mala señal se ve
  // exactamente igual que ajustar bien.
  w.BarStockMobileOrders.falloAlGuardar(w.state.master[0]);
  const l = host.querySelector('.m-ord-l');
  ok('la linea se marca', l.classList.contains('mal'));
  ok('y lo dice', /not saved/.test(l.textContent));

  // Y al reintentar se limpia.
  l.querySelector('[data-q="1"]').click();
  ok('reintentar quita la marca',
     !host.querySelector('.m-ord-l').classList.contains('mal'));
}

console.log('\nun proveedor sin ajuste manual');
{
  const { host } = pantalla();
  abrir(host, 'PEQUENO');
  const l = host.querySelector('.m-ord-l');
  // Boton que no responde es peor que no tener boton.
  ok('no hay botones de cantidad', !l.querySelector('[data-q]'));
  ok('se enseña la cantidad igual', /\b2\b/.test(l.textContent));
  ok('y se dice por que', /no manual override/.test(l.textContent));
}

console.log('\ndesde aqui SI se coloca');
{
  // Durante mucho tiempo esta pantalla decia "Place the order from
  // desktop or iPad" y no tenia boton. Ya no: se repasa y se coloca
  // desde el telefono.
  const { host } = pantalla();
  abrir(host, 'LOOP');
  const botones = Array.from(host.querySelectorAll('button')).map(b => b.textContent).join(' ');
  ok('hay un boton que lleva a revisar', /review and send/i.test(botones), botones.slice(0, 80));
  ok('y ya no manda al escritorio', !/from desktop or iPad/i.test(host.textContent));

  // ARRIBA, no al final. Con noventa lineas, lo que esta abajo no se
  // encuentra: por eso ocupa el sitio donde estaba el aviso.
  const b = host.querySelector('.m-ord-enviar');
  const lista = host.querySelector('#moList');
  ok('y esta antes que las lineas',
     !!b && !!lista && (b.compareDocumentPosition(lista) & 4) !== 0);
}

console.log('\ndejar una linea fuera, y traerla de vuelta');
{
  const { w, host } = pantalla();
  abrir(host, 'LOOP');
  const l = host.querySelector('.m-ord-l');            // Tito's, indice 0
  l.querySelector('[data-fuera]').click();
  // Excluir ES poner la cantidad a cero. No hay columna nueva: eso ya
  // era lo que hacia bajar con el boton, solo que la linea se borraba
  // de la lista sin decirlo y sin vuelta atras.
  eq('excluir guarda un cero', w.__guardados, [{ i: 0, v: 0 }]);
  ok('y sale de la lista', !/Tito/.test(host.querySelector('#moList').textContent));
  // Y aparece donde se puede recuperar.
  ok('aparece en los dejados fuera', /Tito/.test(host.querySelector('.m-ord-fuera').textContent));
  ok('diciendo lo que el automatico queria', /auto wanted 18/.test(host.textContent));

  host.querySelector('[data-volver]').click();
  // Vuelve a automatico, no a la cantidad de antes: el automatico se
  // recalcula con lo que hay hoy en el estante.
  eq('volver usa resetFinalOrder', w.__reset, [0]);
  ok('y regresa a la lista', /Tito/.test(host.querySelector('#moList').textContent));
}

console.log('\nlo que nunca se iba a pedir no cuenta como excluido');
{
  const { w, host } = pantalla();
  // Un articulo con el automatico en cero y override cero nunca se
  // "dejo fuera": no hacia falta. Sin este filtro, la lista tendria
  // los doscientos que no tocaba pedir.
  w.state.master.push({ item: 'Nunca', vendor: 'LOOP', onHand: 9, suggested: 2,
    toOrder: 0, value: 5, orderOverride: 0, code: '', itemNorm: 'nunca' });
  abrir(host, 'LOOP');
  ok('no sale en los dejados fuera',
     !host.querySelector('.m-ord-fuera') ||
     !/Nunca/.test(host.querySelector('.m-ord-fuera').textContent));
}

console.log('\nel aviso viejo ya no esta en ningun sitio');
{
  // Estaba en las DOS pantallas, para que nadie mirara los totales, se
  // fuera y no se enterara de que aquello no colocaba nada. Ahora
  // coloca, asi que esa frase seria mentira.
  const { host } = pantalla();
  ok('ni en el resumen', !/from desktop or iPad/i.test(host.textContent));
  abrir(host, 'LOOP');
  ok('ni en el detalle', !/from desktop or iPad/i.test(host.textContent));
}

console.log('\nañadir un producto');
{
  const { w, host } = pantalla();
  abrir(host, 'LOOP');
  host.querySelector('#moAdd').click();
  // Se le pasa el proveedor en el que estas. Sin el, el dialogo mira
  // la pestaña del escritorio —que aqui no significa nada— y se
  // cerraba solo: eso era "el boton no sirve".
  eq('abre para el proveedor en el que estas', w.__abierto, ['LOOP']);

  const { host: h2 } = pantalla();
  abrir(h2, 'PEQUENO');
  // Añadir una linea ES poner una cantidad a mano. En un proveedor sin
  // ajuste manual el dialogo no podria guardar nada, asi que no hay
  // boton en vez de un boton que no abre.
  ok('sin ajuste manual no hay boton', !h2.querySelector('#moAdd'));
}

console.log('\nla pantalla vacia dice CUAL de los dos vacios es');
{
  // "Todavia no has contado" es una tarea pendiente y "no hace falta
  // pedir nada" es una buena noticia. El mensaje de antes servia para
  // los dos y no decia ninguno.
  const sinContar = pantalla();
  sinContar.w.state.master.forEach(r => { r.toOrder = 0; r.orderOverride = ''; });
  sinContar.w.BarStockWeeklyCycle = { estado: () => 'step2' };
  sinContar.def.show(sinContar.host);
  ok('sin conteo lo dice', /No count yet/i.test(sinContar.host.textContent));
  ok('y no celebra nada', !sinContar.host.querySelector('.m-nada-i.bien'));

  const contado = pantalla();
  contado.w.state.master.forEach(r => { r.toOrder = 0; r.orderOverride = ''; });
  contado.w.BarStockWeeklyCycle = { estado: () => 'done' };
  contado.def.show(contado.host);
  ok('contado y sin nada que pedir, lo dice', /Nothing to order/i.test(contado.host.textContent));
  ok('y ahi si se celebra', !!contado.host.querySelector('.m-nada-i.bien'));
}


console.log('\nal volver se entra por el resumen');
{
  const { host, def } = pantalla();
  abrir(host, 'LOOP');
  ok('estabas dentro', !!host.querySelector('#mAtras'));
  def.show(host);
  // Entrar a Ordenes y caer dentro del proveedor que miraste ayer es
  // desorientador.
  ok('al volver, el resumen', !host.querySelector('#mAtras'));
}

// ── Revisar y colocar ───────────────────────────────────────────────

const esperar = (ms) => new Promise(r => setTimeout(r, ms || 0));

// Colocar y enviar son TRES pasos y cada uno dura un minimo en
// pantalla (PASO_MS = 420ms en mobile-orders.js). Sin ese minimo
// pasaban en un parpadeo y no se leia ninguno. Si lo cambias ahi,
// sube esto con el.
const TODO_EL_PROCESO = 1800;
async function revisar(host, vendor) {
  abrir(host, vendor);
  host.querySelector('.m-ord-enviar').click();
  await esperar(10);   // los destinatarios se leen de la nube
  return host;
}

(async () => {

console.log('\nla revision ensena que sale y a quien');
{
  const { w, host } = pantalla();
  await revisar(host, 'SOUTHERN');

  ok('es otra pantalla', /Review the order/i.test(host.textContent));
  // El chevron ya no lleva etiqueta visible; el destino vive en el
  // `aria-label`, que es lo que oye un lector de pantalla.
  ok('con el proveedor en el camino de vuelta',
     /SOUTHERN/.test(host.querySelector('#mAtras').getAttribute('aria-label')),
     host.querySelector('#mAtras').getAttribute('aria-label'));
  ok('ensena las lineas', host.querySelectorAll('.m-rev-l').length === 1);
  ok('con el importe de la linea', /\$28/.test(host.querySelector('.m-rev-l').textContent));

  // AQUI NO SE EDITA. Una pantalla que muestra y a la vez deja cambiar
  // no es una revision: es la anterior otra vez.
  ok('y sin nada que tocar',
     !host.querySelector('.m-rev-list input') &&
     !host.querySelector('.m-rev-list button'));

  // Los destinatarios salen de vendor_defaults, partidos por comas
  // igual que los parte el escritorio.
  const chips = Array.from(host.querySelectorAll('.m-rev-chip:not(.m-rev-add)'))
    .map(c => c.textContent.trim());
  eq('trae los correos guardados', chips, ['orders@southern.com', 'pedro@southern.com']);
}

console.log('\nlos destinatarios se tocan sin ir a Ajustes');
{
  const { host } = pantalla();
  await revisar(host, 'SOUTHERN');

  host.querySelector('[data-quitar="1"]').click();
  ok('quitar uno lo quita',
     host.querySelectorAll('.m-rev-chip:not(.m-rev-add)').length === 1);

  host.querySelector('#mrAdd').click();
  const inp = host.querySelector('#mrMail');
  inp.value = 'no-es-un-correo';
  host.querySelector('#mrOk').click();
  ok('una direccion mala no entra',
     host.querySelectorAll('.m-rev-chip:not(.m-rev-add)').length === 1);

  host.querySelector('#mrAdd').click();
  host.querySelector('#mrMail').value = 'nuevo@southern.com';
  host.querySelector('#mrOk').click();
  const chips = Array.from(host.querySelectorAll('.m-rev-chip:not(.m-rev-add)'))
    .map(c => c.textContent.trim());
  eq('una buena si', chips, ['orders@southern.com', 'nuevo@southern.com']);
}

console.log('\nsin destinatario no se puede colocar');
{
  const { host } = pantalla();
  await revisar(host, 'PEQUENO');   // este no tiene correo guardado
  ok('el boton nace apagado', host.querySelector('.m-rev-go').disabled);
  ok('y dice por que', /add at least one address/i.test(host.textContent));
}

console.log('\ncolocar guarda por el mismo camino que el escritorio');
{
  const { w, host } = pantalla();
  await revisar(host, 'SOUTHERN');
  host.querySelector('.m-rev-go').click();
  await esperar(TODO_EL_PROCESO);

  ok('se guardo una orden', w.__guardadas.length === 1, String(w.__guardadas.length));
  const o = w.__guardadas[0];
  ok('con su proveedor', o && o.vendor === 'SOUTHERN');
  ok('y sus lineas', o && o.items.length === 1);
  ok('con las unidades contadas', o && o.totalUnits === 2, String(o && o.totalUnits));
  // LOOP sale por CSV y el resto por imagen, como en el escritorio.
  ok('y el tipo de exportacion del escritorio', o && o.exportType === 'vendor_jpg');

  // Releer de la nube es lo que hace que las lineas desaparezcan de
  // Ordering. Sin esto la orden esta puesta y la pantalla no se entera.
  ok('se relee la verdad desde la nube', w.__recargado === 1);
}

console.log('\ny despues manda el correo con el PDF adjunto');
{
  const { w, host } = pantalla();
  await revisar(host, 'SOUTHERN');
  host.querySelector('.m-rev-go').click();
  await esperar(TODO_EL_PROCESO);

  ok('se pidio UN pdf', w.__pdfPedidos.length === 1);
  // El del escritorio. Dos generadores = dos pedidos distintos segun
  // desde donde se mando.
  ok('al generador del escritorio', w.__pdfPedidos[0].vendor === 'SOUTHERN');

  ok('se llamo al endpoint de siempre', w.__enviados.length === 1 &&
     /\/api\/send-order$/.test(w.__enviados[0].url), (w.__enviados[0] || {}).url);
  const c = w.__enviados[0].cuerpo;
  eq('a los destinatarios de la pantalla', c.to,
     ['orders@southern.com', 'pedro@southern.com']);
  ok('con el PDF adjunto', !!c.pdfBase64, String(c.pdfBase64).slice(0, 10));
  ok('y nombre de archivo con fecha', /southern_order_\d{4}-\d{2}-\d{2}\.pdf/.test(c.filename),
     c.filename);
  ok('con el perfil de quien lo manda', c.senderEmail === 'axel@wjm.com');

  // ── Y LO DICE, y se queda dicho ──────────────────────────────────
  //
  // Antes salia un aviso efimero y la pantalla se cerraba sola hacia
  // la lista. Con el correo ya en la bandeja del proveedor, eso se lee
  // igual que un fallo: hiciste todo bien y nadie te lo confirmo.
  ok('se queda una confirmacion en pantalla',
     /sent to/i.test(host.textContent), host.textContent.slice(0, 90));
  ok('con a quien fue', /orders@southern\.com/.test(host.textContent));
  ok('y con lo que iba dentro', /\$28|2 bottles/i.test(host.textContent));
  ok('sin volver solo a la lista', !host.querySelector('.m-ordv'));

  // Salir lo decide el usuario.
  host.querySelector('#mrDone').click();
  ok('y al pulsar Done si vuelve al resumen', !!host.querySelector('.m-ordv'));
}

console.log('\nno saber NO es lo mismo que fallar');
{
  // El caso real: el PDF sube lento, la peticion llega, el correo SALE
  // y la respuesta se pierde o vuelve como una pagina de error del
  // gateway. Decir "no salio" cuando el proveedor ya lo tiene hace que
  // lo mandes dos veces.
  const { w, host } = pantalla();
  const err = console.error; console.error = () => {};
  w.fetch = global.fetch = async (url, opts) => {
    w.__enviados.push({ url: String(url), cuerpo: JSON.parse((opts && opts.body) || '{}') });
    return { status: 504, json: async () => { throw new Error('not json'); } };
  };
  await revisar(host, 'SOUTHERN');
  host.querySelector('.m-rev-go').click();
  await esperar(TODO_EL_PROCESO);

  ok('la orden se guardo', w.__guardadas.length === 1);
  ok('no afirma que no salio', !/did not go out/i.test(host.textContent));
  ok('dice que no pudo confirmarlo',
     /could not confirm/i.test(host.textContent), host.textContent.slice(0, 140));
  ok('y sugiere mirar antes de reenviar', /check your inbox/i.test(host.textContent));
  ok('el boton avisa de lo que hace',
     /again anyway/i.test(host.querySelector('.m-rev-go').textContent));
  console.error = err;
}

console.log('\nsi el servidor dice que NO, eso si es un fallo');
{
  const { w, host } = pantalla();
  w.__fallarCorreo = true;
  const err = console.error; console.error = () => {};
  await revisar(host, 'SOUTHERN');
  host.querySelector('.m-rev-go').click();
  await esperar(TODO_EL_PROCESO);

  // Lo que NO puede pasar: que parezca que no se hizo nada.
  ok('la orden se guardo igual', w.__guardadas.length === 1);
  ok('y la pantalla lo dice con todas las letras',
     /the order is placed/i.test(host.textContent), host.textContent.slice(0, 120));
  ok('sin volver al resumen', !host.querySelector('.m-ordv'));
  ok('el boton pasa a reintentar el envio',
     /try sending again/i.test(host.querySelector('.m-rev-go').textContent));

  // Y reintentar manda el correo SIN volver a guardar: si guardara,
  // quedarian dos ordenes al mismo proveedor.
  w.__fallarCorreo = false;
  host.querySelector('.m-rev-go').click();
  await esperar(TODO_EL_PROCESO);
  ok('reintentar no crea una segunda orden', w.__guardadas.length === 1,
     String(w.__guardadas.length));
  ok('pero si vuelve a mandar', w.__enviados.length === 2, String(w.__enviados.length));
  console.error = err;
}

console.log('\nguardar la libreta NO borra el resto de la ficha');
{
  const { w, host } = pantalla();
  await revisar(host, 'SOUTHERN');
  host.querySelector('.m-rev-go').click();
  await esperar(TODO_EL_PROCESO);

  const g = w.__guardadosDef[0];
  ok('se guardaron los destinatarios', !!g && g.v === 'SOUTHERN');
  // `saveDefaults` escribe el registro ENTERO. Mandar solo el correo
  // borraria el numero de cuenta y el rep.
  ok('y el numero de cuenta sigue ahi', !!g && g.f.account_number === '44821',
     JSON.stringify(g && g.f));
  ok('y el rep tambien', !!g && g.f.rep_name === 'Pedro Morales');
  ok('con el correo actualizado',
     !!g && g.f.vendor_email === 'orders@southern.com, pedro@southern.com');
}

console.log('\nsi la nube falla, la orden NO esta colocada');
{
  const { w, host } = pantalla();
  w.__fallarGuardado = true;
  // El modulo escribe el error en consola, y aqui ESE error es lo que
  // se esta probando: se calla para que el informe se lea.
  const err = console.error; console.error = () => {};
  await revisar(host, 'SOUTHERN');
  host.querySelector('.m-rev-go').click();
  await esperar(TODO_EL_PROCESO);

  ok('no se guardo nada', w.__guardadas.length === 0);
  ok('no se releyo nada', w.__recargado === 0);
  // Decirlo con todas las letras. Creer que si acaba en dos ordenes al
  // mismo proveedor.
  ok('lo dice', w.__toasts.some(t => /could not place/i.test(t)), w.__toasts.join(' | '));
  ok('y te deja donde estabas, para reintentar',
     /Review the order/i.test(host.textContent));
  ok('con el boton otra vez vivo', !host.querySelector('.m-rev-go').disabled);
  console.error = err;
}

console.log('\nla revision no se queda pegada');
{
  const { host, def } = pantalla();
  await revisar(host, 'SOUTHERN');
  ok('estabas revisando', /Review the order/i.test(host.textContent));

  // Atras va un escalon, no dos: de la revision a las lineas.
  def.atras(host, true);
  ok('atras lleva a las lineas, no al resumen',
     !/Review the order/i.test(host.textContent) && !!host.querySelector('.m-ord-enviar'));

  // Y volver a entrar a Ordenes nunca cae en una confirmacion.
  // `atras` nos dejo en el detalle, asi que primero al resumen.
  def.atras(host, true);
  await revisar(host, 'SOUTHERN');
  def.show(host);
  ok('y al reentrar se empieza por el resumen',
     !/Review the order/i.test(host.textContent) && !!host.querySelector('.m-ordv'));
}

console.log('\n' + (falla ? falla + ' fallos' : 'todo bien') +
  '   ·   ' + (pasa + falla) + ' comprobaciones');
process.exit(falla ? 1 : 0);

})();
