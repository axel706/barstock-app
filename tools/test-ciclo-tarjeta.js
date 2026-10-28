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
  if (o.fetch) { w.fetch = o.fetch; global.fetch = o.fetch; }
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
  const lineas = [
    { order_id: 'A', quantity: 12, invoice_date: '2026-10-26' },
    { order_id: 'A', quantity: 6,  invoice_date: '2026-10-26' },
    { order_id: 'B', quantity: 4,  invoice_date: '2026-10-27' }
  ];
  let pedidas = [];
  w = entorno({
    master: inv(10, 6), pedidos: {},
    config: { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' },
    locId: 'loc-1',
    fetch: async (u) => {
      pedidas.push(u);
      const off = /offset=(\d+)/.exec(u);
      const n = off ? Number(off[1]) : 0;
      return { ok: true, json: async () => (n === 0 ? lineas : []) };
    }
  });
  h = pintar(w);
  await esperar(60);
  f = filas(h);
  prueba('dos facturas distintas, no tres líneas',
    /2 deliveries in, 22 units/.test(f[1] || ''), f[1]);
  prueba('fechada con la última factura',
    /^Oct 27 /.test(f[1] || ''), f[1]);
  prueba('se pide desde el arranque del ciclo',
    /invoice_date=gte\.2026-10-25/.test(pedidas[0] || ''), pedidas[0]);
  prueba('y paginado, que PostgREST corta en 1000 sin avisar',
    /limit=1000&offset=0/.test(pedidas[0] || ''), pedidas[0]);

  grupo('una factura sola se dice en singular');
  w = entorno({
    master: inv(10, 6), pedidos: {},
    config: { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' },
    locId: 'loc-1',
    fetch: async (u) => ({
      ok: true,
      json: async () => (/offset=0/.test(u)
        ? [{ order_id: 'A', quantity: 9, invoice_date: '2026-10-26' }] : [])
    })
  });
  h = pintar(w);
  await esperar(60);
  prueba('"1 delivery", no "1 deliveries"',
    /1 delivery in, 9 units/.test(filas(h)[1] || ''), filas(h)[1]);

  grupo('el ciclo abierto de más avisa en la línea, no en un subtítulo');
  w = entorno({ master: inv(10, 6), pedidos: {}, viejo: true, dias: 11 });
  h = pintar(w);
  f = filas(h);
  prueba('lo dice con los días que lleva',
    /Open 11 days/.test(f[f.length - 1] || ''), f[f.length - 1]);
  prueba('y marca la fila', !!ciclo(h).querySelector('.m-hero-tl li.is-alerta'));

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
