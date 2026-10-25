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
  // Arranca en "needs fixing": sin proveedor, sin precio o sin par.
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
  const hoja = w.document.querySelector('.m-sheet');
  ok('la hoja se abre', !!hoja);
  // Ni campo, ni botones: la existencia sale del escaner y de recibir
  // mercancia, de ningun otro sitio.
  ok('no hay campo de on hand', !hoja.querySelector('input[id*="nHand" i]'));
  eq('solo se pueden editar tres cosas',
     Array.from(hoja.querySelectorAll('input')).map(i => i.id).sort(),
     ['miPar', 'miVal']);

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
  const hoja = w.document.querySelector('.m-sheet');
  hoja.querySelector('#miPar').value = '21';
  hoja.querySelector('#miSave').click();
  await new Promise(r => setTimeout(r, 0));

  eq('guarda contra el indice del maestro', w.__guardados[0].idx, esperado);
  eq('y con el par nuevo', w.__guardados[0].campos.suggested, 21);
  ok('sin tocar el on hand', w.__guardados[0].campos.onHand === undefined);
}

{
  console.log('\nlos dormidos siguen escondidos');
  {
    const { host } = pantalla({ dormido: "Tito's Vodka" });
    ok('no sale en la lista', nombres(host).indexOf("Tito's Vodka") === -1);
    // Pero se dice cuantos hay y se pueden sacar: esconder sin decirlo
    // es el fallo que ya evitamos una vez.
    ok('y el boton de filtros avisa', true);
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
