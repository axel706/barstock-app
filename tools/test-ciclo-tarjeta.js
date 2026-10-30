#!/usr/bin/env node
/*
 * ── La tarjeta del ciclo en el Home del teléfono ─────────────────────
 *
 * Dos cosas que proteger, y la primera es un número equivocado que
 * estuvo meses en pantalla:
 *
 *   1. "Counted N items" contaba master().length — el INVENTARIO
 *      entero. Todo lo que está en cero nunca se miró, así que el
 *      conteo se enseñaba inflado justo en la cifra que sirve para
 *      saber si quedó completo. Se cuentan los que tienen on hand
 *      por encima de cero, y nada más.
 *
 *   2. La fila de entregas sale SÓLO cuando se sabe. Mientras la
 *      consulta viaja no hay fila; nunca un "0 deliveries" por no
 *      haber mirado todavía. Es el mismo fallo de las diecisiete
 *      semanas, y la tarjeta del ciclo es de las que se miran de reojo.
 *
 *   node tools/test-ciclo-tarjeta.js
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
const esperar = ms => new Promise(r => setTimeout(r, ms));

// El mínimo que el Home necesita para pintarse: el inventario, el
// ciclo y las órdenes. Lo demás se defiende solo con typeof.
function entorno(opts) {
  const o = opts || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  w.state = { master: o.master || [] };

  w.BarStockWeeklyCycle = {
    estado: () => 'done',
    resetAt: () => '2026-10-25T08:00:00Z',
    fmtDate: () => 'Oct 25',
    edadCiclo: () => (o.dias == null ? 2 : o.dias) * 86400000,
    cicloViejo: () => !!o.viejo
  };

  w.getActiveVendors = () => Object.keys(o.pedidos || {});
  w.getOrderRowsForVendor = v => (o.pedidos || {})[v] || [];
  w.computeOrderSubtotal = f => f.length * 10;
  w.isRowPlaced = () => !!o.colocado;

  w.BARSTOCK_CONFIG = o.config || {};
  // Los avisos de la app: el botón de sync tiene que DECIR qué pasó,
  // también cuando no pasó nada. Un botón que funciona en silencio es
  // indistinguible de uno roto.
  w.__toast = '';
  w.BarStockToast = { show: (t) => { w.__toast = t; } };
  if (o.fetch) { w.fetch = o.fetch; global.fetch = o.fetch; }
  // Las entregas del ciclo salen del módulo de facturas, que es el
  // dueño de esa pregunta: filtra a bebida y a proveedores ocultos.
  // Antes el Home las leía por su cuenta y sin esos filtros, y la
  // tarjeta contradecía a la pantalla de facturas.
  if (o.entregas !== undefined) {
    w.BarStockMobileInvoices = { resumen: async () => o.entregas };
  }
  if (o.locId) {
    w.BarStockParIntelligence = { fetchLocationId: async () => o.locId };
  }

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

// La tarjeta del ciclo es la segunda del carril: bienvenida, ciclo.
function ciclo(host) {
  return host.querySelectorAll('.m-hero')[1];
}
function filas(host) {
  // Fecha y texto van en dos elementos pegados, así que textContent
  // los junta sin espacio. Se leen por separado.
  return Array.from(ciclo(host).querySelectorAll('.m-hero-tl li'))
    .map(li => (li.querySelector('u').textContent + ' ' +
                li.querySelector('p').textContent).replace(/\s+/g, ' ').trim());
}

const inv = (n, conStock) => Array.from({ length: n }, (_, i) => ({
  item: 'ITEM ' + i, code: 'C' + i, vendor: 'ACME',
  onHand: i < conStock ? 3 : 0
}));

(async () => {
  grupo('se cuenta lo contado, no el catálogo');
  let w = entorno({ master: inv(265, 198) });
  let h = pintar(w);
  let f = filas(h);
  prueba('la primera fila dice los que tienen stock',
    /198 items counted/.test(f[0] || ''), f[0]);
  prueba('y no el inventario entero',
    !/265 items counted/.test(f[0] || ''), f[0]);

  grupo('un inventario sin tocar no dice que se contó todo');
  w = entorno({ master: inv(265, 0) });
  prueba('cero contados', /0 items counted/.test(filas(pintar(w))[0] || ''));

  grupo('la fila de hoy dice en qué punto está la semana');
  w = entorno({ master: inv(10, 6), pedidos: { ACME: [1, 2, 3], BEV: [4] } });
  f = filas(pintar(w));
  prueba('con líneas esperando, las cuenta',
    /Today 4 lines waiting to order/.test(f[f.length - 1] || ''), f[f.length - 1]);

  w = entorno({ master: inv(10, 6), pedidos: {}, colocado: true });
  f = filas(pintar(w));
  prueba('sin líneas pero con órdenes puestas, lo dice',
    /Today 1 vendor ordered/.test(f[f.length - 1] || ''), f[f.length - 1]);

  w = entorno({ master: inv(10, 6), pedidos: {}, colocado: false });
  f = filas(pintar(w));
  prueba('y sin nada de nada, lo dice también',
    /Today Nothing waiting/.test(f[f.length - 1] || ''), f[f.length - 1]);

  grupo('sin saber de entregas, no hay fila de entregas');
  w = entorno({ master: inv(10, 6), pedidos: {} });
  f = filas(pintar(w));
  prueba('dos filas, no tres', f.length === 2, JSON.stringify(f));
  prueba('ninguna habla de entregas',
    !f.some(x => /deliver/i.test(x)), JSON.stringify(f));

  grupo('cuando las facturas llegan, aparece la fila');
  {
    // Ya filtradas a bebida por el módulo de facturas: la tarjeta no
    // vuelve a contarlas por su cuenta.
    const w = entorno({
      master: inv(10, 6), pedidos: {},
      entregas: { n: 2, unidades: 22, dinero: 58.57, sueltas: 0, ultima: '2026-10-27' }
    });
    const h = pintar(w);
    await esperar(60);
    const f = filas(h);
    prueba('dos facturas distintas, no tres líneas',
      /2 deliveries in, 22 units/.test(f[1] || ''), f[1]);
    prueba('fechada con la última factura', /^Oct 27 /.test(f[1] || ''), f[1]);
  }

  grupo('una factura sola se dice en singular');
  {
    const w = entorno({
      master: inv(10, 6), pedidos: {},
      entregas: { n: 1, unidades: 9, dinero: 20, sueltas: 0, ultima: '2026-10-26' }
    });
    const h = pintar(w);
    await esperar(60);
    prueba('"1 delivery", no "1 deliveries"',
      /1 delivery in, 9 units/.test(filas(h)[1] || ''), filas(h)[1]);
  }

  grupo('el ciclo abierto de más avisa en la línea, no en un subtítulo');
  w = entorno({ master: inv(10, 6), pedidos: {}, viejo: true, dias: 11 });
  h = pintar(w);
  f = filas(h);
  prueba('lo dice con los días que lleva',
    /Open 11 days/.test(f[f.length - 1] || ''), f[f.length - 1]);
  prueba('y marca la fila', !!ciclo(h).querySelector('.m-hero-tl li.is-alerta'));

  grupo('la tarjeta dice de dónde viene y qué enseña');
  {
    const w = entorno({
      master: inv(10, 6), pedidos: {},
      entregas: { n: 24, unidades: 1256, dinero: 15424, sueltas: 86, ultima: '2026-10-28' }
    });
    const h = pintar(w);
    await esperar(60);
    const c = Array.from(h.querySelectorAll('.m-hero'))
      .find(x => /MarginEdge sync/i.test(x.textContent));
    const t = c.textContent.replace(/\s+/g, ' ');
    // El rótulo nombra la fuente: esto no lo escribiste tú.
    prueba('el rótulo dice MarginEdge', /MarginEdge sync/i.test(t), t.slice(0, 60));
    prueba('y el título, de qué va', /What came in this cycle/.test(t), t.slice(0, 90));
    // El número ya está en la esquina; repetirlo en el título no
    // añade nada.
    prueba('el título no repite el número', !/24 invoices this/.test(t), t.slice(0, 90));
  }

  grupo('con cero facturas la tarjeta sigue, para poder buscar');
  {
    // Esconderla hasta que haya datos deja el botón inútil justo
    // cuando lo necesitas: esperando una entrega.
    const w = entorno({
      master: inv(10, 6), pedidos: {},
      entregas: { n: 0, unidades: 0, dinero: 0, sueltas: 0, ultima: '' }
    });
    const h = pintar(w);
    await esperar(60);
    const c = Array.from(h.querySelectorAll('.m-hero'))
      .find(x => /MarginEdge sync/i.test(x.textContent));
    prueba('la tarjeta está', !!c);
    prueba('y lo dice con palabras', /Nothing new yet/.test(c.textContent), c.textContent.slice(0, 90));
    prueba('con su botón de buscar', !!c.querySelector('.m-hero-sync'));
  }

  grupo('el botón de sincronizar vive en la tarjeta');
  {
    const w = entorno({
      master: inv(10, 6), pedidos: {},
      entregas: { n: 2, unidades: 22, dinero: 58, sueltas: 1, ultima: '2026-10-27' }
    });
    let llamado = 0;
    w.BarStockMarginEdgeConnect = {
      buscarFacturas: async () => { llamado++; return { facturas: 1, lineas: 3 }; }
    };
    const h = pintar(w);
    await esperar(60);

    const card = Array.from(h.querySelectorAll('.m-hero'))
      .find(c => /MarginEdge sync/i.test(c.textContent));
    prueba('la tarjeta está', !!card, Array.from(h.querySelectorAll('.m-hero-k')).map(x => x.textContent).join(' | '));

    const sync = card.querySelector('.m-hero-sync');
    prueba('con su botón a la izquierda', !!sync);
    // A la izquierda del texto del pie, y la acción a la derecha.
    const pie = card.querySelector('.m-hero-acts');
    prueba('antes que el texto del pie',
      pie.firstElementChild === sync, pie.firstElementChild.className);
    prueba('y la acción sigue a la derecha',
      pie.lastElementChild.classList.contains('m-hero-b'), pie.lastElementChild.className);

    sync.click();
    // Gira mientras busca: un botón quieto cinco segundos se pulsa
    // dos veces, y cada pulsación son peticiones a una API que
    // contesta 429 a la segunda por segundo.
    prueba('gira mientras busca', sync.classList.contains('girando'));
    prueba('y no se puede pulsar otra vez', sync.disabled);

    // 1200 y no 700: `sincronizarDesdeTarjeta` mantiene el aviso en
    // pantalla un MINIMO_MS (1000ms) aunque la respuesta llegue antes,
    // para que el degradado de la tarjeta alcance a verse moviéndose.
    // Si cambias ese mínimo, esta espera sube con él.
    await esperar(1200);
    prueba('pide las facturas nuevas', llamado === 1, String(llamado));
    // Un botón que funciona y no lo dice es indistinguible de uno
    // roto: si no hay nada nuevo, los números no cambian y el giro
    // dura un parpadeo.
    prueba('y dice qué pasó', !!w.__toast, String(w.__toast));
    prueba('deja de girar al terminar', !sync.classList.contains('girando'));
  }

  grupo('sin nada nuevo también lo dice');
  {
    const w = entorno({
      master: inv(10, 6), pedidos: {},
      entregas: { n: 2, unidades: 22, dinero: 58, sueltas: 0, ultima: '2026-10-27' }
    });
    w.BarStockMarginEdgeConnect = {
      buscarFacturas: async () => ({ facturas: 2, lineas: 0 })
    };
    const h = pintar(w);
    await esperar(60);
    const c = Array.from(h.querySelectorAll('.m-hero'))
      .find(x => /MarginEdge sync/i.test(x.textContent));
    c.querySelector('.m-hero-sync').click();
    await esperar(1200);   // el mínimo en pantalla, igual que arriba
    // "Nada nuevo" es un resultado, no un fallo.
    prueba('lo dice con palabras', /up to date/i.test(String(w.__toast)), String(w.__toast));
  }

  grupo('y si falla, lo dice también');
  {
    const w = entorno({
      master: inv(10, 6), pedidos: {},
      entregas: { n: 1, unidades: 5, dinero: 20, sueltas: 0, ultima: '2026-10-27' }
    });
    w.BarStockMarginEdgeConnect = {
      buscarFacturas: async () => { throw new Error('MarginEdge rate limit (429)'); }
    };
    const h = pintar(w);
    await esperar(60);
    const c = Array.from(h.querySelectorAll('.m-hero'))
      .find(x => /MarginEdge sync/i.test(x.textContent));
    const b = c.querySelector('.m-hero-sync');
    b.click();
    await esperar(120);
    prueba('enseña el error', /429/.test(String(w.__toast)), String(w.__toast));
    prueba('y se puede volver a pulsar', !b.disabled);
  }

  grupo('la tarjeta no depende del estado del conteo');
  {
    // La carga vivía DENTRO de la rama "ciclo cerrado" de la tarjeta
    // del ciclo. Con la locación contando, esa rama no se ejecuta:
    // los datos de MarginEdge no se pedían nunca y su tarjeta no
    // aparecía — sin error, sin hueco, sin pista.
    for (const estado of ['step1', 'step2', 'counting', 'done']) {
      const w = entorno({
        master: inv(10, 6), pedidos: {},
        entregas: { n: 3, unidades: 40, dinero: 900, sueltas: 0, ultima: '2026-10-27' }
      });
      w.BarStockWeeklyCycle.estado = () => estado;
      if (estado === 'counting') {
        w.BarStockCountSession = { progress: () => ({ counted: 5, total: 10 }), size: () => 5 };
      }
      const h = pintar(w);
      await esperar(60);
      const hay = Array.from(h.querySelectorAll('.m-hero'))
        .some(x => /MarginEdge sync/i.test(x.textContent));
      prueba('con el ciclo en "' + estado + '" la tarjeta está', hay);
    }
  }

  grupo('sin conectar no es lo mismo que sin facturas');
  {
    // Decir "nothing new yet" en una locación que nadie conectó es
    // mentira por omisión, y sólo te enterabas si pulsabas el botón
    // y leías el aviso.
    const w = entorno({
      master: inv(10, 6), pedidos: {},
      entregas: { n: 0, unidades: 0, dinero: 0, sueltas: 0, ultima: '', conectado: false }
    });
    const h = pintar(w);
    await esperar(60);
    const c = Array.from(h.querySelectorAll('.m-hero'))
      .find(x => /MarginEdge sync/i.test(x.textContent));
    const t = c.textContent.replace(/\s+/g, ' ');
    prueba('lo dice', /Not connected yet/.test(t), t.slice(0, 80));
    prueba('y no finge que no llegó nada', !/Nothing new yet/.test(t), t.slice(0, 80));
    // Son diez mil productos y un par de minutos: aquí se dice dónde,
    // no se intenta hacer.
    prueba('manda al escritorio', /Settings . Connections/.test(t), t.slice(0, 220));
    prueba('y sin botón de refrescar, que no haría nada',
      !c.querySelector('.m-hero-sync'));
  }

  grupo('conectada y sin facturas, el botón vuelve');
  {
    const w = entorno({
      master: inv(10, 6), pedidos: {},
      entregas: { n: 0, unidades: 0, dinero: 0, sueltas: 0, ultima: '', conectado: true }
    });
    const h = pintar(w);
    await esperar(60);
    const c = Array.from(h.querySelectorAll('.m-hero'))
      .find(x => /MarginEdge sync/i.test(x.textContent));
    prueba('dice que no hay nada nuevo', /Nothing new yet/.test(c.textContent));
    prueba('con su botón', !!c.querySelector('.m-hero-sync'));
  }

  grupo('si la lectura falla, la tarjeta lo dice en vez de esconderse');
  {
    const w = entorno({ master: inv(10, 6), pedidos: {} });
    w.BarStockMobileInvoices = {
      resumen: async () => { throw new Error('relation does not exist'); }
    };
    const h = pintar(w);
    await esperar(80);
    const c = Array.from(h.querySelectorAll('.m-hero'))
      .find(x => /MarginEdge sync/i.test(x.textContent));
    // Una tarjeta que no está es indistinguible de "no hay nada".
    prueba('la tarjeta sigue ahí', !!c);
    prueba('y dice qué pasó',
      !!c && /Could not read invoices/.test(c.textContent), c && c.textContent.slice(0, 90));
    prueba('con el error concreto',
      !!c && /relation does not exist/.test(c.textContent), c && c.textContent.slice(0, 160));
    prueba('y el botón para reintentar', !!c && !!c.querySelector('.m-hero-sync'));
  }

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
