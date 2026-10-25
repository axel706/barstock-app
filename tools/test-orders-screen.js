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

  w.__guardados = [];
  w.updateFinalOrder = (i, v) => {
    w.__guardados.push({ i, v });
    w.state.master[i].orderOverride = Math.max(0, Number(v) || 0);
  };
  w.__reset = [];
  w.resetFinalOrder = (i) => { w.__reset.push(i); w.state.master[i].orderOverride = ''; };

  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, refrescarBadges() {} };
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
  ok('se puede volver', !!host.querySelector('#moBack'));

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

console.log('\ndesde aqui no se coloca');
{
  const { host } = pantalla();
  abrir(host, 'LOOP');
  ok('lo dice la nota de arriba', /from desktop or iPad/i.test(host.textContent));
  ok('y no hay ningun boton de colocar', !/place .*order/i.test(
     Array.from(host.querySelectorAll('button')).map(b => b.textContent).join(' ')));
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

console.log('\nal volver se entra por el resumen');
{
  const { host, def } = pantalla();
  abrir(host, 'LOOP');
  ok('estabas dentro', !!host.querySelector('#moBack'));
  def.show(host);
  // Entrar a Ordenes y caer dentro del proveedor que miraste ayer es
  // desorientador.
  ok('al volver, el resumen', !host.querySelector('#moBack'));
}

console.log('\n' + (falla ? falla + ' FALLO(S)' : 'todo bien') + '   ·   ' + pasa + ' comprobaciones');
process.exit(falla ? 1 : 0);
