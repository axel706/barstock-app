#!/usr/bin/env node
/*
 * ── Ocultar proveedores y facturas ───────────────────────────────────
 *
 * El filtro por categoría no bastaba. Se quedaba con BEER, LIQUOR,
 * WINE y NA_BEVERAGES, y aun así entraban Gordon Food Service, US
 * Foods y The Chefs Warehouse: te venden zumo, refresco, leche y
 * café, y MarginEdge los categoriza como bebida. Técnicamente lo son;
 * para una barra, no. Esa distinción pide criterio humano.
 *
 * Lo que protege este test:
 *
 *   · que ocultar BORRE lo ya guardado — si no, la tabla crece con
 *     comida para siempre y el historial miente sobre su tamaño;
 *   · que el servidor se salte lo oculto ANTES de descargar, no sólo
 *     al escribir: bajar las líneas de un proveedor de cocina gasta
 *     peticiones de un límite que ya nos dio 429 varias veces;
 *   · que ocultar un proveedor no toque la factura de otro.
 *
 *   node tools/test-ocultar.js
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

const L = (o) => Object.assign({
  order_id: 'A', line_no: 1, invoice_date: '2026-10-27', invoice_number: '9041767972',
  vendor_name: 'Gordon Food Service', status: 'CLOSED',
  product_id: 'j1', vendor_item_name: 'Orange Juice 12/32oz',
  unit_price: 29.6, quantity: 4, line_price: 118.4
}, o);

function entorno(opts) {
  const o = opts || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  w.state = { master: [] };
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };
  w.BarStockWeeklyCycle = { resetAt: () => '2026-10-25T08:00:00Z', fmtDate: () => 'Oct 25' };
  w.confirm = () => true;
  w.alert = (m) => { w.__alert = m; };

  w.__escrito = []; w.__borrado = [];
  const f = async (u, init) => {
    const m = (init && init.method) || 'GET';
    if (m === 'POST') { w.__escrito.push({ u: String(u), cuerpo: JSON.parse(init.body) });
                        return { ok: true, json: async () => [], text: async () => '' }; }
    if (m === 'DELETE') { w.__borrado.push(String(u)); return { ok: true, text: async () => '' }; }
    const off = Number((/offset=(\d+)/.exec(u) || [])[1] || 0);
    const pag = (x) => ({ ok: true, json: async () => (off ? [] : x), text: async () => '' });
    if (/marginedge_invoice_lines/.test(u)) return pag(o.lineas || []);
    if (/marginedge_links/.test(u))         return pag([]);
    if (/marginedge_not_mine/.test(u))      return pag([]);
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

const host = (w) => { const h = w.document.createElement('div'); w.document.body.appendChild(h); return h; };
const txt = (h) => h.textContent.replace(/\s+/g, ' ');

(async () => {
  grupo('un proveedor oculto no aparece');
  {
    const w = entorno({
      lineas: [
        L({ order_id: 'A', product_id: 'j1' }),
        L({ order_id: 'B', vendor_name: 'Fine Wine & Good Spirits', product_id: 'v1',
            invoice_number: '189780922', line_price: 50.97, quantity: 1 })
      ],
      bebida: [{ product_id: 'j1' }, { product_id: 'v1' }],
      ocultos: [{ kind: 'vendor', clave: 'GORDON FOOD SERVICE' }]
    });
    const fs_ = await w.BarStockMobileInvoices._cargar();
    prueba('queda sólo la del licor', fs_.length === 1, fs_.map(f => f.vendor).join(' | '));
    prueba('y es la correcta', /Fine Wine/.test(fs_[0].vendor), fs_[0].vendor);
  }

  grupo('se compara el nombre normalizado');
  {
    // Los nombres llegan con puntuación distinta según el día.
    const w = entorno({
      lineas: [L({ vendor_name: "J. Ambrogi Foods" })],
      bebida: [{ product_id: 'j1' }],
      ocultos: [{ kind: 'vendor', clave: 'J AMBROGI FOODS' }]
    });
    const fs_ = await w.BarStockMobileInvoices._cargar();
    prueba('"J. Ambrogi" y "J AMBROGI" son el mismo', fs_.length === 0, String(fs_.length));
  }

  grupo('ocultar una factura suelta no se lleva al proveedor');
  {
    const w = entorno({
      lineas: [
        L({ order_id: 'A', vendor_name: 'PLCB', product_id: 'v1' }),
        L({ order_id: 'B', vendor_name: 'PLCB', product_id: 'v1', invoice_number: '2692557' })
      ],
      bebida: [{ product_id: 'v1' }],
      ocultos: [{ kind: 'invoice', clave: 'A' }]
    });
    const fs_ = await w.BarStockMobileInvoices._cargar();
    prueba('la otra del mismo proveedor sigue', fs_.length === 1 && fs_[0].id === 'B',
      fs_.map(f => f.id).join(','));
  }

  grupo('ocultar escribe y borra');
  {
    const w = entorno({
      lineas: [L({ order_id: 'A', product_id: 'j1' })],
      bebida: [{ product_id: 'j1' }]
    });
    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(30);
    h.querySelector('.m-hcard').click();
    h.querySelector('#mInvHideV').click();
    await esperar(60);

    const esc = w.__escrito.filter(e => /marginedge_hidden/.test(e.u));
    prueba('guarda el proveedor oculto', esc.length === 1, JSON.stringify(w.__escrito));
    prueba('con kind vendor', esc[0] && esc[0].cuerpo.kind === 'vendor');
    // Por nombre normalizado, que es lo único estable que hay.
    prueba('y la clave normalizada',
      esc[0] && esc[0].cuerpo.clave === 'GORDON FOOD SERVICE', esc[0] && esc[0].cuerpo.clave);
    prueba('guarda el nombre legible para la lista',
      esc[0] && /Gordon Food Service/.test(esc[0].cuerpo.label), esc[0] && esc[0].cuerpo.label);

    // Sin esto la tabla crecería con comida para siempre.
    const del = w.__borrado.filter(u => /marginedge_invoice_lines/.test(u));
    prueba('borra sus líneas ya guardadas', del.length === 1, w.__borrado.join('\n'));
    prueba('filtrando por ese proveedor', /vendor_name=eq\./.test(del[0] || ''), del[0]);
  }

  grupo('ocultar una factura borra sólo la suya');
  {
    const w = entorno({
      lineas: [L({ order_id: 'A', product_id: 'j1' })],
      bebida: [{ product_id: 'j1' }]
    });
    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(30);
    h.querySelector('.m-hcard').click();
    h.querySelector('#mInvHideI').click();
    await esperar(60);

    const esc = w.__escrito.filter(e => /marginedge_hidden/.test(e.u));
    prueba('guarda kind invoice', esc[0] && esc[0].cuerpo.kind === 'invoice',
      esc[0] && esc[0].cuerpo.kind);
    prueba('con el order_id', esc[0] && esc[0].cuerpo.clave === 'A', esc[0] && esc[0].cuerpo.clave);
    const del = w.__borrado.filter(u => /marginedge_invoice_lines/.test(u));
    prueba('y borra por order_id, no por proveedor',
      /order_id=eq\.A/.test(del[0] || '') && !/vendor_name/.test(del[0] || ''), del[0]);
  }

  grupo('sin la tabla, lo dice con el remedio');
  {
    const w = entorno({
      lineas: [L({ order_id: 'A', product_id: 'j1' })],
      bebida: [{ product_id: 'j1' }]
    });
    const antes = w.fetch;
    const roto = async (u, i) => {
      if (i && i.method === 'POST' && /marginedge_hidden/.test(u)) {
        return { ok: false, text: async () => 'PGRST205 relation "marginedge_hidden" does not exist' };
      }
      return antes(u, i);
    };
    w.fetch = roto; global.fetch = roto;

    const h = host(w);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(30);
    h.querySelector('.m-hcard').click();
    h.querySelector('#mInvHideV').click();
    await esperar(60);
    // Un error de PostgREST en crudo no dice qué hacer.
    prueba('nombra el archivo que hay que correr',
      /marginedge-hidden\.sql/.test(w.__alert || ''), w.__alert);
    prueba('y no borra nada', !w.__borrado.some(u => /invoice_lines/.test(u)),
      w.__borrado.join('\n'));
  }

  grupo('el servidor se los salta antes de descargar');
  {
    const s = leer('api/marginedge.js');
    prueba('lee la tabla de ocultos', /from\('marginedge_hidden'\)/.test(s));
    // Si sólo filtrara al escribir, el sync volvería a traer cada hora
    // lo que acabas de borrar, gastando peticiones de un límite de dos
    // por segundo.
    prueba('corta en la fase de cabeceras', /ocultos\.vendors\.has\(normNombre\(o\.vendorName\)\)/.test(s));
    prueba('también por factura suelta', /ocultos\.facturas\.has\(String\(o\.orderId\)\)/.test(s));
    prueba('y con red en la fase de líneas', /ocultos2/.test(s));
    // Si falta la tabla, no se puede dejar de sincronizar.
    prueba('sin la tabla no oculta nada y sigue', /return \{ vendors: new Set\(\), facturas: new Set\(\) \}/.test(s));
  }

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
