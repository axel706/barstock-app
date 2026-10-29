#!/usr/bin/env node
/*
 * ── La tarjeta de órdenes del Home ───────────────────────────────────
 *
 * Dos formas de la misma tarjeta:
 *
 *   varios → índice con una fila por proveedor, y cada fila entra
 *            DIRECTO a esa orden. Antes el único botón te dejaba en el
 *            índice de la pantalla de órdenes y leías la lista dos
 *            veces.
 *   uno    → se salta el índice y enseña las líneas.
 *
 * Y lo que más importa aquí: la cifra de la esquina YA NO ES DINERO.
 * Con 47 artículos sin precio salía "$0", que no significa gratis sino
 * "no lo sé". Una cifra falsa en la esquina es peor que ninguna.
 *
 *   node tools/test-tarjeta-ordenes.js
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'mobile-home.js'), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

// Cada proveedor con sus líneas. `value` 0 = sin precio, que es el
// caso que rompía la esquina.
function entorno(pedidos) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  w.state = { master: [] };
  w.BarStockWeeklyCycle = {
    estado: () => 'done', resetAt: () => '2026-10-25T08:00:00Z',
    fmtDate: () => 'Oct 25', edadCiclo: () => 2 * 86400000, cicloViejo: () => false
  };

  w.getActiveVendors = () => Object.keys(pedidos || {});
  w.getOrderRowsForVendor = v => (pedidos || {})[v] || [];
  // Tal cual la app: el override manual gana, y si no, toOrder.
  w.getEffectiveOrder = r => Math.max(0,
    (r.orderOverride !== '' && r.orderOverride != null)
      ? Number(r.orderOverride) || 0
      : Number(r.toOrder) || 0);
  w.computeOrderSubtotal = filas =>
    filas.reduce((s, r) => s + (Number(r.value) || 0) * w.getEffectiveOrder(r), 0);
  w.isRowPlaced = () => false;

  w.__ido = [];
  w.BarStockMobile = { ir: (x) => w.__ido.push('tab:' + x) };
  w.BarStockMobileOrders = { abrirVendor: (v) => w.__ido.push('vendor:' + v) };

  new Function(SRC)();
  return w;
}

function pintar(w) {
  const host = w.document.createElement('div');
  host.className = 'm-screen on';
  host.setAttribute('data-screen', 'home');
  w.document.body.appendChild(host);
  w.BarStockMobileHome.render(host);
  return host;
}

// La tarjeta de órdenes es la tercera: bienvenida, ciclo, órdenes.
const ord = (h) => h.querySelectorAll('.m-hero')[2];
const txt = (h) => ord(h).textContent.replace(/\s+/g, ' ');

// `toOrder` es el campo real de una fila de inventario pendiente de
// pedir. `finalOrder` pertenece a una orden YA GUARDADA y no existe
// aquí — leerlo fue justo el fallo que sacaba "0×" y "$0".
const linea = (item, qty, precio) => ({ item, toOrder: qty, value: precio, code: '' });

(() => {
  grupo('con varios proveedores: un índice');
  {
    const w = entorno({
      SOUTHERN: [linea('Tito’s Vodka', 2, 22.99), linea('Jameson', 12, 0)],
      BREAKTHRU: [linea('White Haven', 9, 14.20)],
      'WINE MERCHANT': [linea('Villa Brici', 3, 10.59)]
    });
    const h = pintar(w);

    prueba('hay tres filas de proveedor',
      ord(h).querySelectorAll('.m-hpv').length === 3,
      String(ord(h).querySelectorAll('.m-hpv').length));
    prueba('y ninguna lista de líneas', !ord(h).querySelector('.m-hln'));
    prueba('el título cuenta los proveedores', /3 vendors/.test(txt(h)), txt(h).slice(0, 60));

    // Ordenados por botellas, no por dinero: con artículos sin precio
    // el orden por importe pone arriba al proveedor más barato.
    const nombres = Array.from(ord(h).querySelectorAll('.m-hpv .nm')).map(e => e.textContent);
    prueba('el que más botellas pide va primero',
      nombres[0] === 'SOUTHERN', nombres.join(' | '));

    // La barra del primero llena; las demás en proporción a él.
    const anchos = Array.from(ord(h).querySelectorAll('.m-hpv .bar i'))
      .map(e => e.getAttribute('style'));
    prueba('la primera barra va al 100%', /width:\s*100%/.test(anchos[0] || ''), anchos[0]);

    grupo('cada fila entra en SU orden, no en el índice');
    ord(h).querySelectorAll('.m-hpv')[1].click();
    prueba('abre el proveedor de esa fila',
      w.__ido.includes('vendor:BREAKTHRU'), w.__ido.join(','));
    prueba('y no la pestaña a secas', !w.__ido.includes('tab:orders'));

    ord(h).querySelector('.m-hero-b').click();
    prueba('el botón del pie sí lleva al índice',
      w.__ido.includes('tab:orders'), w.__ido.join(','));
  }

  grupo('con un solo proveedor: las líneas');
  {
    const w = entorno({
      SOUTHERN: [
        linea('Tito’s Vodka 1.75L', 2, 22.99),
        linea('Blade and Bow', 1, 47.99),
        linea('Jameson 750', 6, 0),
        linea('Campari 750', 1, 24.80),
        linea('Aperol 1L', 1, 21.00),
        linea('Hendricks 750', 1, 31.00)
      ]
    });
    const h = pintar(w);

    prueba('el título es el proveedor', /SOUTHERN/.test(txt(h)), txt(h).slice(0, 60));
    prueba('y no "1 vendor"', !/1 vendor/.test(txt(h)));
    prueba('no hay índice', !ord(h).querySelector('.m-hpv'));
    // Cuatro y el resto contado: con cinco la tarjeta crece y arrastra
    // el alto de todo el carril.
    prueba('enseña tres líneas',
      ord(h).querySelectorAll('.m-hln').length === 3,
      String(ord(h).querySelectorAll('.m-hln').length));
    prueba('y cuenta el resto en el pie', /and 3 more · 6 lines/.test(txt(h)), txt(h));

    const vs = Array.from(ord(h).querySelectorAll('.m-hln .v')).map(e => e.textContent);
    prueba('el importe de la línea es precio × cantidad',
      vs[0] === '$46', vs.join(' | '));
    // Un precio 0 no es "gratis", es que no se sabe.
    prueba('sin precio lo dice con palabras', vs[2] === 'no price', vs.join(' | '));

    ord(h).querySelector('.m-hero-b').click();
    prueba('el botón entra en ese proveedor',
      w.__ido.includes('vendor:SOUTHERN'), w.__ido.join(','));
  }

  grupo('la cantidad es la que se va a PEDIR');
  {
    // onHand 0 y toOrder 2: lo que se pide es 2. El primer intento
    // leía `finalOrder` —que aquí no existe— y sacaba "0×" junto a un
    // "$0", mientras el pie decía "$30". Dos cifras del mismo dinero
    // sin hablarse.
    const w = entorno({
      SOUTHERN: [{ item: 'Smirnoff Blueberry Vodka', onHand: 0, toOrder: 2, value: 15, code: '' }]
    });
    const h = pintar(w);
    const q = ord(h).querySelector('.m-hln .q').textContent;
    const v = ord(h).querySelector('.m-hln .v').textContent;

    prueba('enseña lo que se pide, no lo que hay', q === '2×', q);
    prueba('y el importe es precio × cantidad', v === '$30', v);
    // La misma cifra en los dos sitios o la tarjeta se contradice.
    prueba('el pie dice lo mismo', /1 line · \$30/.test(txt(h)), txt(h));
  }

  grupo('y respeta el override manual');
  {
    // getEffectiveOrder antepone orderOverride a toOrder. Si la
    // tarjeta usara toOrder a secas, diría una cosa y el subtotal otra.
    const w = entorno({
      SOUTHERN: [{ item: 'Tito’s', onHand: 1, toOrder: 2, orderOverride: 5, value: 10, code: '' }]
    });
    const h = pintar(w);
    prueba('usa el override, no toOrder',
      ord(h).querySelector('.m-hln .q').textContent === '5×',
      ord(h).querySelector('.m-hln .q').textContent);
    prueba('y el importe va con él',
      ord(h).querySelector('.m-hln .v').textContent === '$50',
      ord(h).querySelector('.m-hln .v').textContent);
  }

  grupo('la esquina dejó de ser dinero');
  {
    // Todo sin precio: el caso que sacaba "$0".
    const w = entorno({ SOUTHERN: [linea('Jameson', 6, 0), linea('Aperol', 2, 0)] });
    const h = pintar(w);
    const amt = ord(h).querySelector('.m-hero-amt');

    prueba('no hay ningún $0 en la tarjeta', !/\$0\b/.test(txt(h)), txt(h));
    prueba('la esquina cuenta botellas', /^8/.test(amt.textContent), amt.textContent);
    prueba('y dice de qué', /bottles/.test(amt.textContent), amt.textContent);
    // Sin precios no se puede dar un importe, así que se dice cuántas
    // líneas lo tienen en vez de inventar un total.
    prueba('el pie dice cuántas llevan precio',
      /2 lines · 0 priced/.test(txt(h)), txt(h));
  }

  grupo('y vuelve cuando hay precios de verdad');
  {
    const w = entorno({ SOUTHERN: [linea('Tito’s', 2, 25), linea('Aperol', 1, 20)] });
    const h = pintar(w);
    prueba('el pie lleva el importe', /2 lines · \$70/.test(txt(h)), txt(h));
    prueba('y la esquina sigue en botellas',
      /3bottles/.test(ord(h).querySelector('.m-hero-amt').textContent.replace(/\s/g, '')),
      ord(h).querySelector('.m-hero-amt').textContent);
  }

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
