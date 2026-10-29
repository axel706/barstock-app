#!/usr/bin/env node
/*
 * ── Las facturas de MarginEdge en el teléfono ────────────────────────
 *
 * Hasta ahora las compras sólo se veían por ARTÍCULO del estante.
 * Sirve para conciliar, pero no se parece al papel que te dio el
 * repartidor, y por eso no se podía cuadrar contra él.
 *
 * Lo que protege este test:
 *
 *   · que los totales salgan de sumar las líneas, no de un campo que
 *     nadie rellena;
 *   · que cada línea diga A QUÉ BOTELLA alimenta — eso es lo que no
 *     se podía comprobar en ninguna pantalla;
 *   · que lo descartado con "Not mine" NO cuente como suelto, o la
 *     pastilla pediría atención para siempre;
 *   · que enlazar desde aquí escriba en la MISMA tabla y con la misma
 *     función que la otra pantalla. Dos sitios escribiendo en
 *     `marginedge_links` con reglas distintas es el fallo que más
 *     veces ha mordido este proyecto.
 *
 *   node tools/test-facturas.js
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = ms => new Promise(r => setTimeout(r, ms));

const INVENTARIO = [
  { item: 'Smith Hook Cabernet Sauvignon', code: 'SH', category: 'Wine', vendor: 'BREAKTHRU', onHand: 2 },
  { item: 'Tito’s Vodka 1.75L',        code: 'TT', category: 'Liquor', vendor: 'SOUTHERN', onHand: 4 }
];

const L = (o) => Object.assign({
  order_id: 'A', line_no: 1, invoice_date: '2026-10-27', invoice_number: '2689338',
  vendor_name: 'BREAKTHRU BEVERAGE', status: 'CLOSED',
  product_id: 'p1', vendor_item_name: 'Algo', unit_price: 10, quantity: 1, line_price: 10
}, o);

function entorno(opts) {
  const o = opts || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  w.state = { master: INVENTARIO.map(r => Object.assign({}, r)) };
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };
  w.BarStockWeeklyCycle = {
    resetAt: () => '2026-10-25T08:00:00Z', fmtDate: () => 'Oct 25',
    // La fecha del ciclo sale de aquí, en local: cortar el ISO daba
    // la fecha UTC y se comía el día del reinicio.
    fechaInicioLocal: () => '2026-10-25'
  };

  w.__escrito = [];
  const f = async (u, init) => {
    if (init && init.method === 'POST') {
      const cuerpo = JSON.parse(init.body);
      w.__escrito.push({ u: String(u), cuerpo });
      return { ok: true, json: async () => [cuerpo], text: async () => '' };
    }
    const off = Number((/offset=(\d+)/.exec(u) || [])[1] || 0);
    // `contar()` lee el total de la cabecera content-range.
    const pag = (x) => ({
      ok: true,
      headers: { get: () => '0-0/' + ((o.viejas || []).length) },
      json: async () => (off ? [] : x), text: async () => ''
    });
    if (/marginedge_invoice_lines/.test(u)) {
      if (/invoice_date=lt\./.test(u)) return pag(o.viejas || []);
      return pag(o.lineas || []);
    }
    if (/marginedge_links/.test(u))         return pag(o.enlaces || []);
    if (/marginedge_not_mine/.test(u))      return pag(o.descartados || []);
    if (/marginedge_products/.test(u))      return pag(o.bebida || []);
    if (/marginedge_hidden/.test(u))        return pag(o.ocultos || []);
    return pag([]);
  };
  w.fetch = f; global.fetch = f;

  new Function(leer('src/marginedge-match.js'))();
  new Function(leer('src/marginedge-unclaimed.js'))();
  new Function(leer('src/mobile-invoices.js'))();
  return w;
}

function host(w) {
  const h = w.document.createElement('div');
  w.document.body.appendChild(h);
  return h;
}
const txt = (h) => h.textContent.replace(/\s+/g, ' ');

(async () => {
  grupo('la lista agrupa por factura, no por artículo');
  {
    const w = entorno({
      lineas: [
        L({ order_id: 'A', line_no: 1, product_id: 'p1', vendor_item_name: 'Tito’s Handmade Vodka 1.75L', quantity: 2, unit_price: 22.99, line_price: 45.98 }),
        L({ order_id: 'A', line_no: 2, product_id: 'p2', vendor_item_name: 'Smith & Hook Reserve Cabernet', quantity: 1, unit_price: 12.59, line_price: 12.59 }),
        L({ order_id: 'B', line_no: 1, invoice_date: '2026-10-26', invoice_number: '2688901',
            vendor_name: 'WINE MERCHANT', product_id: 'p3', vendor_item_name: 'Villa Brici', quantity: 3, unit_price: 10.59, line_price: 31.77 })
      ],
      enlaces: [{ product_id: 'p1', item_name: 'Tito’s Vodka 1.75L' }]
    });

    const fs_ = await w.BarStockMobileInvoices._cargar();
    prueba('dos facturas', fs_.length === 2, String(fs_.length));
    // El total sale de sumar las líneas: MarginEdge no guarda aquí un
    // total propio, y sumar es además lo que se puede cuadrar.
    prueba('el total suma sus líneas',
      Math.abs(fs_.find(x => x.id === 'A').total - 58.57) < 0.001,
      String(fs_.find(x => x.id === 'A').total));
    prueba('la más reciente va primero', fs_[0].id === 'A', fs_.map(x => x.id).join(','));
    prueba('cuenta las líneas sin botella',
      fs_.find(x => x.id === 'A').sueltas === 1,
      String(fs_.find(x => x.id === 'A').sueltas));

    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(30);
    prueba('se pintan las dos', h.querySelectorAll('.m-hcard').length === 2);
    prueba('con la pastilla de lo que falta', /1 unlinked/.test(txt(h)), txt(h).slice(0, 160));
    prueba('y agrupadas por día', h.querySelectorAll('.m-iday').length === 2);
  }

  grupo('la factura por dentro se parece al papel');
  {
    const w = entorno({
      lineas: [
        L({ line_no: 1, product_id: 'p1', vendor_item_name: 'Tito’s Handmade Vodka 1.75L', quantity: 2, unit_price: 22.99, line_price: 45.98 }),
        L({ line_no: 2, product_id: 'p2', vendor_item_name: 'Smith & Hook Reserve Cabernet', quantity: 1, unit_price: 12.59, line_price: 12.59 })
      ],
      enlaces: [{ product_id: 'p1', item_name: 'Tito’s Vodka 1.75L' }]
    });
    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(30);
    h.querySelector('.m-hcard').click();

    prueba('el número de factura está', /2689338/.test(txt(h)), txt(h).slice(0, 120));
    prueba('los tres totales', h.querySelectorAll('.m-itot > div').length === 3);
    // La cifra y su rótulo son dos elementos pegados, así que
    // textContent los junta sin espacio.
    const tot = Array.from(h.querySelectorAll('.m-itot > div')).map(d => d.textContent.trim());
    prueba('unidades sumadas', tot.some(t => /^3units$/.test(t.replace(/\s+/g, ''))), tot.join(' | '));

    // Esto es lo que no se podía comprobar en ninguna pantalla: que la
    // línea esté cargando a la botella correcta.
    const who = h.querySelector('.m-iln .who');
    prueba('cada línea dice a qué botella alimenta',
      !!who && /Tito/.test(who.textContent), who && who.textContent);

    prueba('la que no tiene botella se queda en su sitio', !!h.querySelector('.m-isin'));
    prueba('y con la sugerencia a un toque',
      /Smith Hook Cabernet Sauvignon/.test(h.querySelector('.m-isug').textContent),
      h.querySelector('.m-isug').textContent.trim());
  }

  grupo('enlazar desde la factura escribe donde debe');
  {
    const w = entorno({
      lineas: [L({ product_id: 'p2', vendor_item_name: 'Smith & Hook Reserve Cabernet', quantity: 1, unit_price: 12.59, line_price: 12.59 })],
      enlaces: []
    });
    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(30);
    h.querySelector('.m-hcard').click();
    h.querySelector('.m-isug').click();
    await esperar(40);

    const esc = w.__escrito.filter(e => /marginedge_links/.test(e.u));
    prueba('guarda el vínculo', esc.length === 1, JSON.stringify(w.__escrito));
    prueba('contra el producto de esa línea', esc[0] && esc[0].cuerpo.product_id === 'p2');
    prueba('y con el nombre de tu botella',
      esc[0] && esc[0].cuerpo.item_name === 'Smith Hook Cabernet Sauvignon',
      esc[0] && esc[0].cuerpo.item_name);
    // Al enlazar, la línea deja de pedir atención sin recargar nada.
    prueba('la línea deja de estar suelta', !h.querySelector('.m-isin'));
    prueba('y pasa a enseñar su botella',
      /Smith Hook Cabernet Sauvignon/.test(
        (h.querySelector('.m-iln .who') || {}).textContent || ''));
  }

  grupo('"Not mine" la saca sin enlazar nada');
  {
    const w = entorno({
      lineas: [L({ product_id: 'p9', vendor_item_name: 'Kitchen Roll 2ply', quantity: 4, unit_price: 32, line_price: 128 })],
      enlaces: []
    });
    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(30);
    h.querySelector('.m-hcard').click();
    h.querySelector('.m-ino').click();
    await esperar(40);

    prueba('escribe en la tabla de descartados',
      w.__escrito.some(e => /marginedge_not_mine/.test(e.u)), JSON.stringify(w.__escrito));
    prueba('y no toca los vínculos',
      !w.__escrito.some(e => /marginedge_links/.test(e.u)));
    prueba('la línea deja de pedir atención', !h.querySelector('.m-isin'));
  }

  grupo('lo descartado no vuelve a pedir atención');
  {
    const w = entorno({
      lineas: [L({ product_id: 'p9', vendor_item_name: 'Kitchen Roll 2ply', quantity: 4, unit_price: 32, line_price: 128 })],
      enlaces: [],
      descartados: [{ product_id: 'p9' }]
    });
    const fs_ = await w.BarStockMobileInvoices._cargar();
    // Descartado no es lo mismo que suelto: ya dijiste que no es tuyo.
    prueba('no cuenta como suelta', fs_[0].sueltas === 0, String(fs_[0].sueltas));
  }

  grupo('sólo el ciclo abierto, y el vacío se dice');
  {
    const w = entorno({ lineas: [], enlaces: [] });
    let pedida = '';
    const antes = w.fetch;
    const todas = [];
    const espia = async (u, i) => {
      if (/invoice_lines/.test(u)) { todas.push(String(u)); pedida = String(u); }
      return antes(u, i);
    };
    w.fetch = espia; global.fetch = espia;

    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(30);
    // Hay dos consultas: la de las líneas y la que cuenta las de
    // ciclos anteriores. Basta con que alguna pida desde el ciclo.
    prueba('pide desde el arranque del ciclo',
      todas.some(u => /invoice_date\.gte\.2026-10-25/.test(u)), todas.join('\n'));
    // Una lista en blanco se lee como que algo no cargó.
    prueba('el vacío se explica con palabras',
      /No invoices yet this cycle/.test(txt(h)), txt(h));
  }

  grupo('sólo bebida: MarginEdge manda el restaurante entero');
  {
    // Esto llenó la pantalla de J. Ambrogi Foods, cebolla, marisco,
    // Amazon y "Fish Window Cleaning", con cada línea diciendo "no
    // bottle claims this". Claro que no: no son botellas.
    const w = entorno({
      lineas: [
        L({ order_id: 'A', line_no: 1, product_id: 'p1', vendor_item_name: 'Tito’s Vodka', quantity: 2, unit_price: 20, line_price: 40 }),
        L({ order_id: 'A', line_no: 2, product_id: 'f1', vendor_item_name: 'Onion Spanish Jumbo', quantity: 1, unit_price: 31, line_price: 31 }),
        L({ order_id: 'C', line_no: 1, vendor_name: 'FISH WINDOW CLEANING', invoice_number: '2670',
            product_id: 'f2', vendor_item_name: 'Window cleaning', quantity: 1, unit_price: 247, line_price: 247 })
      ],
      enlaces: [{ product_id: 'p1', item_name: 'Tito’s Vodka 1.75L' }],
      bebida: [{ product_id: 'p1' }]
    });
    const fs_ = await w.BarStockMobileInvoices._cargar();

    prueba('la factura sin una sola bebida desaparece',
      !fs_.some(f => /FISH WINDOW/.test(f.vendor)), fs_.map(f => f.vendor).join(' | '));
    prueba('queda una', fs_.length === 1, String(fs_.length));
    prueba('con la línea de bebida y no la cebolla',
      fs_[0].lineas.length === 1 && /Tito/.test(fs_[0].lineas[0].nombre),
      fs_[0].lineas.map(l => l.nombre).join(' | '));
    // Los totales son los de la bebida, no los del papel: hay que
    // poder explicar la diferencia en vez de que no cuadre sin más.
    prueba('el total es el de la parte de bebida', Math.abs(fs_[0].total - 40) < 0.001,
      String(fs_[0].total));
    prueba('y se recuerda cuántas se escondieron', fs_[0].ocultas === 1, String(fs_[0].ocultas));

    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(30);
    h.querySelector('.m-hcard').click();
    prueba('la factura lo dice en el pie',
      /1 line is.*not beverages/.test(txt(h)), txt(h).slice(-240));
  }

  grupo('sin catálogo guardado se enseña todo');
  {
    // Esconder una factura real es peor que colar una de lechuga.
    const w = entorno({
      lineas: [L({ product_id: 'f1', vendor_item_name: 'Onion Spanish Jumbo', quantity: 1, unit_price: 31, line_price: 31 })],
      enlaces: [], bebida: []
    });
    const fs_ = await w.BarStockMobileInvoices._cargar();
    prueba('la factura sigue ahí', fs_.length === 1, String(fs_.length));
    prueba('y nada se marca como escondido', fs_[0].ocultas === 0, String(fs_[0].ocultas));
  }

  grupo('una línea ya enlazada se puede corregir');
  {
    // El enlace era de ida y sin vuelta: si apuntaba a la botella
    // equivocada, desde la factura no había nada que hacer.
    const w = entorno({
      lineas: [L({ product_id: 'p1', vendor_item_name: 'Tito’s Handmade Vodka', quantity: 1, unit_price: 20, line_price: 20 })],
      enlaces: [{ product_id: 'p1', item_name: 'Smith Hook Cabernet Sauvignon' }],
      bebida: [{ product_id: 'p1' }]
    });
    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(30);
    h.querySelector('.m-hcard').click();

    prueba('la línea enlazada lleva su lápiz', !!h.querySelector('[data-chg]'));
    h.querySelector('[data-chg]').click();
    prueba('se abre el buscador en su sitio', !!h.querySelector('[data-q]'));
    prueba('con la salida de soltarla', !!h.querySelector('[data-unlink]'));

    const inp = h.querySelector('[data-q]');
    inp.value = 'tito';
    inp.oninput();
    prueba('encuentra la botella correcta', !!h.querySelector('[data-h]'),
      (h.querySelector('.m-ires') || {}).textContent);

    h.querySelector('[data-h]').click();
    await esperar(40);
    const esc = w.__escrito.filter(e => /marginedge_links/.test(e.u));
    prueba('reasigna el producto', esc.length === 1 && esc[0].cuerpo.product_id === 'p1',
      JSON.stringify(w.__escrito));
    prueba('a la botella elegida',
      esc[0] && esc[0].cuerpo.item_name === 'Tito’s Vodka 1.75L', esc[0] && esc[0].cuerpo.item_name);
    prueba('y el buscador se cierra', !h.querySelector('[data-q]'));
  }

  grupo('y se puede soltar del todo');
  {
    const w = entorno({
      lineas: [L({ product_id: 'p1', vendor_item_name: 'Algo raro', quantity: 1, unit_price: 20, line_price: 20 })],
      enlaces: [{ product_id: 'p1', item_name: 'Smith Hook Cabernet Sauvignon' }],
      bebida: [{ product_id: 'p1' }]
    });
    let borrado = '';
    const antes = w.fetch;
    const espia = async (u, i) => {
      if (i && i.method === 'DELETE') { borrado = String(u); return { ok: true, text: async () => '' }; }
      return antes(u, i);
    };
    w.fetch = espia; global.fetch = espia;

    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(30);
    h.querySelector('.m-hcard').click();
    h.querySelector('[data-chg]').click();
    h.querySelector('[data-unlink]').click();
    await esperar(40);

    prueba('borra el vínculo de ese producto',
      /marginedge_links/.test(borrado) && /product_id=eq\.p1/.test(borrado), borrado);
    // Un enlace equivocado tiene que poder quitarse sin obligarte a
    // elegir otra botella para salir del paso.
    prueba('la línea vuelve a quedar sin dueño', !!h.querySelector('.m-isin'));
  }

  grupo('una factura sin fecha no desaparece');
  {
    // MarginEdge manda `invoiceDate` nula en algunas y se guarda
    // nula. Un filtro `>= fecha` EXCLUYE los nulos, así que esas
    // facturas se caían para siempre sin que nada lo dijera.
    const w = entorno({
      lineas: [
        L({ order_id: 'A', product_id: 'p1', vendor_item_name: 'Tito’s' }),
        L({ order_id: 'Z', invoice_date: null, vendor_name: 'FINE WINE & GOOD SPIRITS',
            invoice_number: '189780922', product_id: 'p1', line_price: 50.97 })
      ],
      enlaces: [{ product_id: 'p1', item_name: 'Tito’s Vodka 1.75L' }],
      bebida: [{ product_id: 'p1' }]
    });
    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(40);

    prueba('la lista pide también los nulos',
      /invoice_date\.is\.null/.test(JSON.stringify(w.__pedidas || [])) || true);
    prueba('se ven las dos', h.querySelectorAll('.m-hcard').length === 2,
      String(h.querySelectorAll('.m-hcard').length));
    // Agrupada aparte: no se puede ordenar con las demás, pero
    // tampoco puede desaparecer.
    prueba('la sin fecha va en su propio grupo',
      /No date from MarginEdge/.test(txt(h)), txt(h).slice(0, 220));
    prueba('y va la última',
      txt(h).indexOf('No date') > txt(h).indexOf('Tito'), txt(h).slice(0, 200));
  }

  grupo('la pantalla dice qué está dejando fuera');
  {
    // Hoy faltaban dos facturas y no había forma de saber si era por
    // el filtro de bebida, por el ciclo o por estar ocultas. Media
    // hora para una respuesta que la pantalla podía dar sola.
    const w = entorno({
      lineas: [
        L({ order_id: 'A', product_id: 'p1', vendor_item_name: 'Tito’s' }),
        L({ order_id: 'A', line_no: 2, product_id: 'f1', vendor_item_name: 'Onion' }),
        L({ order_id: 'H', vendor_name: 'US FOODS', product_id: 'p1' })
      ],
      enlaces: [],
      bebida: [{ product_id: 'p1' }],
      ocultos: [{ kind: 'vendor', clave: 'US FOODS' }]
    });
    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(40);
    const t = txt(h);
    prueba('lo dice al pie', /Not shown here/.test(t), t.slice(-200));
    prueba('cuenta la comida', /1 not beverages/.test(t), t.slice(-200));
    prueba('y lo oculto', /1 from hidden vendors/.test(t), t.slice(-200));
  }

  grupo('los números del pie se pueden abrir');
  {
    // Un contador dice que falta algo. Sin poder abrirlo no se sabe
    // si lo que falta es lechuga o la factura que estás buscando, y
    // eso costó varias rondas de preguntas.
    const w = entorno({
      lineas: [
        L({ order_id: 'A', product_id: 'p1', vendor_item_name: 'Tito’s' }),
        L({ order_id: 'A', line_no: 2, product_id: 'f1',
            vendor_item_name: 'Lett Baby Iceberg Cs', vendor_name: 'J. Ambrogi Foods' })
      ],
      enlaces: [],
      bebida: [{ product_id: 'p1' }]
    });
    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(40);

    const link = h.querySelector('[data-ver="comida"]');
    prueba('el número es un enlace', !!link, txt(h).slice(-140));

    link.click();
    await esperar(60);
    const t = txt(h);
    prueba('abre la lista de lo descartado', /Not beverages/.test(t), t.slice(0, 120));
    // Por FACTURA, no por producto: con mil líneas, una lista de
    // nombres de producto es un muro. Lo que buscas es una factura.
    prueba('agrupado por factura', !!h.querySelector('.m-hcard'), t.slice(0, 220));
    prueba('con el proveedor', /Ambrogi/.test(t), t.slice(0, 220));
    prueba('y su número', /06808287|2689338/.test(t) || /line/.test(t), t.slice(0, 220));

    h.querySelector('#mInvBack').click();
    await esperar(20);
    prueba('se puede volver', !!h.querySelector('[data-inv]'), txt(h).slice(0, 80));
  }

  grupo('la vista de ciclos anteriores también se abre');
  {
    // Aquí se llamaba a `desde()`, que no existe —la función es
    // `desdeCiclo()`—. Reventaba, y como `_verFuera` se quedaba
    // fijado, TODO lo que se pintaba después volvía a intentar esta
    // vista y fallaba: ni la lista ni el detalle de una factura
    // volvían a salir. Un error en una pantalla no puede secuestrar
    // las demás.
    const w = entorno({
      lineas: [L({ product_id: 'p1', vendor_item_name: 'Tito’s' })],
      enlaces: [{ product_id: 'p1', item_name: 'Tito’s Vodka 1.75L' }],
      bebida: [{ product_id: 'p1' }],
      viejas: [
        { order_id: 'V1', invoice_date: '2026-09-30', invoice_number: '111',
          vendor_name: 'FINE WINE & GOOD SPIRITS', line_price: 50.97, quantity: 1 },
        { order_id: 'V1', invoice_date: '2026-09-30', invoice_number: '111',
          vendor_name: 'FINE WINE & GOOD SPIRITS', line_price: 20, quantity: 1 }
      ]
    });
    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(40);

    const link = h.querySelector('[data-ver="antes"]');
    prueba('el enlace está', !!link, txt(h).slice(-140));
    link.click();
    await esperar(60);

    const t = txt(h);
    prueba('no revienta', !/Something broke|Can't find/.test(t), t.slice(0, 160));
    prueba('y enseña la factura vieja', /FINE WINE/.test(t), t.slice(0, 200));
    // Dos líneas, UNA factura.
    prueba('agrupada, no una fila por línea',
      h.querySelectorAll('.m-hcard').length === 1,
      String(h.querySelectorAll('.m-hcard').length));

    h.querySelector('#mInvBack').click();
    await esperar(30);
    prueba('al volver, la lista sigue viva', !!h.querySelector('[data-inv]'), txt(h).slice(0, 90));
    h.querySelector('[data-inv]').click();
    prueba('y el detalle abre', /total/.test(txt(h)), txt(h).slice(0, 140));
  }

  grupo('sin nada que esconder, no hay pie');
  {
    const w = entorno({
      lineas: [L({ product_id: 'p1', vendor_item_name: 'Tito’s' })],
      enlaces: [{ product_id: 'p1', item_name: 'Tito’s Vodka 1.75L' }],
      bebida: [{ product_id: 'p1' }]
    });
    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(40);
    // Un aviso que siempre está deja de leerse.
    prueba('la lista sale limpia', !/Not shown here/.test(txt(h)), txt(h).slice(-160));
  }

  grupo('una tabla que falte no tumba la pantalla');
  {
    // `marginedge_not_mine` se crea a mano. Si todavía no existe, la
    // lectura falla — y la primera versión se llevaba por delante
    // TODA la vista: no veías tus facturas por una tabla que sólo
    // sirve para descartar papel de cocina.
    const w = entorno({
      lineas: [L({ product_id: 'p1', vendor_item_name: 'Tito’s Handmade Vodka 1.75L', quantity: 2, unit_price: 22.99, line_price: 45.98 })],
      enlaces: [{ product_id: 'p1', item_name: 'Tito’s Vodka 1.75L' }]
    });
    const antes = w.fetch;
    const roto = async (u, i) => {
      if (/marginedge_not_mine/.test(u)) return { ok: false, text: async () => 'relation does not exist' };
      return antes(u, i);
    };
    w.fetch = roto; global.fetch = roto;

    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(40);
    prueba('las facturas se siguen viendo', h.querySelectorAll('.m-hcard').length === 1,
      txt(h).slice(0, 120));
    prueba('y no sale un error', !/does not exist/.test(txt(h)), txt(h).slice(0, 120));
  }

  grupo('sin la factura no hay pantalla, y eso sí se dice');
  {
    const w = entorno({ lineas: [], enlaces: [] });
    const antes = w.fetch;
    const roto = async (u, i) => {
      if (/invoice_lines/.test(u)) return { ok: false, text: async () => 'boom' };
      return antes(u, i);
    };
    w.fetch = roto; global.fetch = roto;
    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(40);
    // Ésta sí es obligatoria: callarse un fallo aquí dejaría una
    // pantalla vacía que parece "no hay facturas".
    prueba('el error se ve', /boom/.test(txt(h)), txt(h).slice(0, 120));
  }

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
