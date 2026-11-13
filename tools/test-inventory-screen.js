#!/usr/bin/env node
/*
 * ── Inventario en el teléfono ────────────────────────────────────────
 *
 * Esta pantalla ESCRIBE en el inventario, así que lo que se protege
 * aquí no es que se vea bien:
 *
 *   1. El on hand NUNCA sale de aquí. La existencia viene del escáner y
 *      de recibir mercancía. Sobre ella se apoyan el par, el consumo y
 *      las órdenes; si una pantalla de edición puede tocarla, deja de
 *      poder rastrearse de dónde salió cada número.
 *   2. Se guarda por el índice del MAESTRO, no por el de la lista
 *      filtrada. La lista se reordena al guardar, así que un índice de
 *      lista apuntaría a otro artículo a la segunda corrección — y lo
 *      pisaría sin decir nada.
 *   3. "Needs fixing" es lo que dice que es. Si se cuela la categoría,
 *      entran los 270 y la lista deja de servir.
 *
 *   node tools/test-inventory-screen.js
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

const ITEMS = [
  // nombre, vendor, onHand, par, precio, categoria
  ['Tito\'s Vodka',        'LOOP',      0,  18, 0,     'Vodka'],   // sin precio
  ['Casa Noble Crystal',   'UNKNOWN',   3,  12, 38.40, ''],        // sin proveedor
  ['White Haven Sauv',     'BREAKTHRU', 14, 16, 12.00, 'Wine'],    // completo
  ['Villa Brici Pinot',    'WINE',      7,  0,  9.00,  'Wine'],    // sin par
  ['Barefoot Cabernet',    'LOOP',      2,  10, 6.00,  '']         // completo (sin categoria)
];

// El modulo solo expone refresh, asi que para montar la pantalla se
// atrapa la definicion que manda a register().
function pantalla(extra) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  w.state = { master: ITEMS.map(([item, vendor, onHand, suggested, value, category]) => ({
    item, vendor, onHand, suggested, value, category,
    code: '', itemNorm: item.toLowerCase(),
    toOrder: Math.max(0, suggested - onHand)
  })) };
  w.normalizeName = (s) => String(s || '').trim().toLowerCase();
  w.getVendorsForFilter = () => ['ALL', 'LOOP', 'BREAKTHRU', 'WINE', 'UNKNOWN'];
  w.getVendorsWithUnknown = () => ['LOOP', 'BREAKTHRU', 'WINE', 'UNKNOWN'];
  w.parAdjustments = new Map();
  w.__guardados = [];
  w.bsSaveItemFields = async (idx, campos) => {
    w.__guardados.push({ idx, campos });
    Object.assign(w.state.master[idx], campos);
    return true;
  };
  if (extra && extra.dormido) {
    w.BarStockDormant = { estaQuieto: (r) => r.item === extra.dormido, cuantos: () => 1 };
  }

  if (extra && extra.formas) {
    new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-profiles.js'), 'utf8'))();
    new Function(fs.readFileSync(path.join(RAIZ, 'src/product-hero.js'), 'utf8'))();
    w.state.master.forEach(r => { r.bottleShape = 'vodka'; r.bottleSizeMl = 750; });
    w.__selector = null;
    w.BarStockBottlePicker = { open(row, alGuardar) { w.__selector = { row, alGuardar }; } };
  }

  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, refrescarBadges() {} };
  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-inventory.js'), 'utf8'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

  const host = w.document.createElement('div');
  host.className = 'm-screen on';
  host.dataset.screen = 'inventory';
  w.document.body.appendChild(host);
  def.mount(host);
  return { w, host, def };
}

const nombres = (host) =>
  Array.from(host.querySelectorAll('.m-inv-n')).map(e => e.textContent.trim());

async function main() {
console.log('\nla pestaña abre la pantalla propia, no la tabla del escritorio');
{
  const { def } = pantalla();
  eq('se registra como Inventory', def.id, 'inventory');
  ok('y sin apuntar a una seccion', !def.seccion);
}

console.log('\n"needs fixing" es lo que dice que es');
{
  const { host } = pantalla();
  // Ahora se entra por "Everything" —la pregunta de todos los dias es
  // "que tengo"—, asi que el filtro de incompletos se pide.
  host.querySelector('[data-s="fix"]').click();
  // Sin proveedor, sin precio o sin par.
  eq('salen los tres incompletos', nombres(host).sort(),
     ["Casa Noble Crystal", "Tito's Vodka", "Villa Brici Pinot"]);
  // Barefoot no tiene categoria y NO debe salir: si contara, entrarian
  // casi los 270 y la lista no serviria para nada.
  ok('sin categoria no cuenta como incompleto',
     nombres(host).indexOf('Barefoot Cabernet') === -1);

  ok('y cada uno dice por que esta', /no price/.test(host.textContent) &&
     /no vendor/.test(host.textContent) && /no par/.test(host.textContent));
}

console.log('\nEverything enseña todo');
{
  const { host } = pantalla();
  host.querySelector('[data-s="todo"]').click();
  eq('los cinco', nombres(host).length, 5);
}

console.log('\nel on hand no se puede tocar desde aqui');
{
  const { w, host } = pantalla();
  host.querySelector('.m-inv').click();
  // Una pantalla, no una hoja, desde el 2026-11-13 (Axel: "debe ser
  // pantalla en lugar de tarjeta").
  const hoja = w.document.querySelector('.m-ed');
  ok('la pantalla de editar se abre', !!hoja);
  // Ni campo, ni botones: la existencia sale del escaner y de recibir
  // mercancia, de ningun otro sitio.
  ok('no hay campo de on hand', !hoja.querySelector('input[id*="nHand" i]'));
  eq('a la vista, par y precio', Array.from(hoja.querySelectorAll('input')).map(i => i.id).sort(), ['miPar', 'miVal']);
  // Nombre y código desde el 2026-11-13, tras "Rename" (renombrar va por
  // la función de la base, migración 038). El on hand sigue sin campo.
  hoja.querySelector('#miRen').click();
  eq('con Rename, nombre y código; y nada más',
     Array.from(hoja.querySelectorAll('input')).map(i => i.id).sort(),
     ['miCode', 'miName', 'miPar', 'miVal']);

  hoja.querySelector('#miSave').click();
}

console.log('\nse guarda contra el indice del maestro');
{
  const { w, host } = pantalla();
  // Se ordena por dinero en el estante, asi que el primero de la lista
  // NO es el primero del maestro. Si se guardara con el indice de la
  // lista, se pisaria otro articulo.
  const primero = nombres(host)[0];
  const esperado = w.state.master.findIndex(r => r.item === primero);
  ok('el primero de la lista no es el primero del maestro', esperado !== 0);

  host.querySelector('.m-inv').click();
  const hoja = w.document.querySelector('.m-ed');
  hoja.querySelector('#miPar').value = '21';
  hoja.querySelector('#miSave').click();
  await new Promise(r => setTimeout(r, 0));

  eq('guarda contra el indice del maestro', w.__guardados[0].idx, esperado);
  eq('y con el par nuevo', w.__guardados[0].campos.suggested, 21);
  ok('sin tocar el on hand', w.__guardados[0].campos.onHand === undefined);
}

{
  console.log('\nesta lista ya no esconde dormidos');
  {
    // Antes salian de la lista y volvian con un interruptor. Costo que
    // tres botellas "desaparecieran" en mitad de un conteo nocturno, y
    // que la pestaña dijera "Everything 164" con 260 en la base.
    // La regla sigue viva donde si tiene sentido: el total del conteo.
    // Ver tools/test-sin-dormidos.js.
    const { host } = pantalla({ dormido: "Tito's Vodka" });
    ok('sale igual', nombres(host).indexOf("Tito's Vodka") !== -1,
       nombres(host).join(' | '));
  }

  console.log('\nfiltrar por texto');
  {
    const { host } = pantalla();
    host.querySelector('[data-s="todo"]').click();
    const inp = host.querySelector('#miInput');
    inp.value = 'vill';
    inp.oninput();
    eq('filtra por nombre', nombres(host), ['Villa Brici Pinot']);

    inp.value = 'z';
    inp.oninput();
    // Con una sola letra no se filtra: medio teclazo no debe vaciar la
    // pantalla.
    eq('una sola letra no filtra', nombres(host).length, 5);
  }

  console.log('\nla botella se cambia desde la ficha, sin entrar a un conteo');
  {
    // Antes la unica puerta era "not this bottle?" dentro del conteo: para
    // corregir una silueta habia que reiniciar el ciclo. La fila abre el
    // MISMO selector, que guarda en la fila y en el mapa global de las
    // locaciones; aqui no se escribe nada por otro camino.
    const { w, host } = pantalla({ formas: true });
    host.querySelector('[data-s="todo"]').click();
    host.querySelector('.m-inv').click();
    const hoja = w.document.querySelector('.m-ed');
    const fila = hoja && hoja.querySelector('#miBottle');
    ok('hay una fila Bottle en la ficha', !!fila);
    ok('dice la forma que tiene ahora', !!fila && /Vodka/.test(fila.textContent), fila && fila.textContent.trim());
    ok('y su tamaño', !!fila && /750 ml/.test(fila.textContent));
    ok('con la silueta dibujada', !!fila && !!fila.querySelector('svg path'));
    const titulos = Array.from(hoja.querySelectorAll('.m-ed-lab')).map(t => t.textContent.trim());
    eq('debajo de Unit price', titulos.slice(-2), ['Unit price', 'Bottle']);
    eq('y no añade campos de texto', Array.from(hoja.querySelectorAll('input')).map(i => i.id).sort(), ['miPar', 'miVal']);

    if (fila) fila.click();
    const sel = w.__selector;
    const nombre = hoja.querySelector('.m-fic-n') && hoja.querySelector('.m-fic-n').textContent.trim();
    ok('abre el selector de siempre', !!sel);
    ok('con la fila DEL MAESTRO, no una copia', !!sel && w.state.master.includes(sel.row) && sel.row.item === nombre,
       sel && sel.row.item + ' vs ' + nombre);

    if (sel) {
      sel.row.bottleShape = 'carlo_rossi'; sel.row.bottleSizeMl = 4000;
      sel.alGuardar('carlo_rossi', 4000);
      const f2 = w.document.querySelector('#miBottle');
      ok('al guardar, la fila dice la nueva', !!f2 && /Carlo Rossi/.test(f2.textContent) && /4000 ml/.test(f2.textContent),
         f2 && f2.textContent.trim());
      ok('y la cabecera dibuja la nueva, con su asa', !!w.document.querySelector('.m-ed .m-fic .m-bot-asa'));
      ok('sin cerrar la pantalla', !!w.document.querySelector('.m-ed'));
    }
  }

  console.log('\nla X borra el filtro de golpe');
  {
    // Como en "Do we have…" del Home: borrar letra a letra con el
    // teclado del teléfono es lo que pedía Axel no tener que hacer.
    const { host, w } = pantalla();
    host.querySelector('[data-s="todo"]').click();
    const inp = host.querySelector('#miInput');
    const x = host.querySelector('#miClear');
    ok('hay una X dentro del buscador', !!x && !!x.closest('.m-searchbar'));
    ok('con el mismo icono que la de Do we have', !!x && !!x.querySelector('.ti-x'));
    inp.value = 'vill';
    inp.oninput();
    eq('filtrado', nombres(host), ['Villa Brici Pinot']);
    if (x) x.click();
    eq('la X vacia el campo', inp.value, '');
    eq('y la lista vuelve entera', nombres(host).length, 5);
    ok('y deja el teclado listo para escribir otra cosa', w.document.activeElement === inp);
  }

  console.log('\nel filtro se nota');
  {
    const { host } = pantalla();
    const aj = host.querySelector('#miAdj');
    ok('sin filtros, el boton esta apagado', !aj.classList.contains('on'));
    // Una lista filtrada y una lista corta se ven igual, y ahi es donde
    // alguien concluye que le faltan productos.
  }

  console.log('\n' + (falla ? falla + ' FALLO(S)' : 'todo bien') + '   ·   ' + pasa + ' comprobaciones');
  process.exit(falla ? 1 : 0);
}
}

main();
