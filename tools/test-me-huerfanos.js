#!/usr/bin/env node
/*
 * ── Llegó y nadie lo reclama ─────────────────────────────────────────
 *
 * El agujero que esto tapa es real y costó una factura entera: entró
 * "Smith & Hook Reserve Cabernet Sauvignon", el estante tenía "Smith
 * Hook Cabernet Sauvignon" emparejado con OTRO producto, y el
 * historial dijo que no había llegado nada. Sin un aviso.
 *
 * La pantalla de emparejar no podía verlo: va de tus botellas hacia
 * fuera, así que un producto que ninguna reclama no aparece en ningún
 * sitio. Esto hace la pregunta al revés.
 *
 *   node tools/test-me-huerfanos.js
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

// ── El mundo ─────────────────────────────────────────────────────────

const CATALOGO = [
  { product_id: 'p-hook',  name: 'Smith Hook Cabernet Sauvignon',         type: 'WINE' },
  { product_id: 'p-res',   name: 'Smith & Hook Reserve Cabernet Sauvignon', type: 'WINE' },
  { product_id: 'p-lux',   name: 'Luxardo Maraschino Originale',          type: 'LIQUOR' },
  { product_id: 'p-papel', name: 'Kitchen Roll 2ply x12',                 type: 'FOOD' }
];

const INVENTARIO = [
  { item: 'Smith Hook Cabernet Sauvignon', code: 'SH750', category: 'Wine', vendor: 'BREAKTHRU', onHand: 2 },
  { item: 'Tito’s Vodka 1.75L',       code: 'TT175', category: 'Liquor', vendor: 'SOUTHERN', onHand: 4 }
];

function entorno(opts) {
  const o = opts || {};
  const dom = new JSDOM('<!doctype html><body><div id="meuBody"></div></body>',
    { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;

  w.state = { master: (o.master || INVENTARIO).map(r => Object.assign({}, r)) };
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };
  w.BarStockWeeklyCycle = { resetAt: () => '2026-10-25T08:00:00Z' };

  w.__escrito = [];

  const fetchFalso = async (u, init) => {
    const metodo = (init && init.method) || 'GET';
    if (metodo === 'POST') {
      const cuerpo = JSON.parse(init.body);
      w.__escrito.push({ u: String(u), cuerpo });
      return { ok: true, json: async () => [cuerpo], text: async () => '' };
    }
    const off = Number((/offset=(\d+)/.exec(u) || [])[1] || 0);
    const pagina = (filas) => ({ ok: true, json: async () => (off ? [] : filas), text: async () => '' });

    if (/marginedge_invoice_lines/.test(u)) return pagina(o.lineas || []);
    if (/marginedge_links/.test(u))         return pagina(o.enlaces || []);
    if (/marginedge_not_mine/.test(u))      return pagina(o.descartados || []);
    if (/marginedge_products/.test(u))      return pagina(o.catalogo || CATALOGO);
    return pagina([]);
  };
  w.fetch = fetchFalso; global.fetch = fetchFalso;

  new Function(leer('src/marginedge-match.js'))();
  new Function(leer('src/marginedge-unclaimed.js'))();
  return w;
}

const LINEA = (id, nombre, qty, precio, fecha) => ({
  product_id: id, vendor_item_name: nombre, vendor_name: 'PLCB',
  quantity: qty, line_price: precio, invoice_date: fecha, invoice_number: '2689338'
});

(async () => {
  grupo('lo que llegó y nadie reclama');
  {
    const w = entorno({
      lineas: [
        LINEA('p-hook', 'Smith Hook Cab', 1, 21.99, '2026-10-26'),
        LINEA('p-res', 'Smith & Hook Reserve Cab', 1, 12.59, '2026-10-27'),
        LINEA('p-lux', 'Luxardo Maraschino', 2, 71.80, '2026-10-27')
      ],
      // Sólo el primero está emparejado: es exactamente el caso real.
      enlaces: [{ product_id: 'p-hook' }]
    });

    const l = await w.BarStockMarginEdgeUnclaimed._calcular();
    prueba('deja fuera lo que ya tiene dueño',
      !l.some(g => g.id === 'p-hook'), l.map(g => g.id).join(','));
    prueba('y enseña los dos que no lo tienen', l.length === 2, String(l.length));
    prueba('lo caro primero, que es donde está el dinero',
      l[0].id === 'p-lux', l.map(g => g.id).join(','));
    prueba('con el nombre del catálogo, no el del proveedor',
      l.some(g => g.nombre === 'Smith & Hook Reserve Cabernet Sauvignon'),
      l.map(g => g.nombre).join(' | '));
  }

  grupo('propone la botella en vez de hacerte buscar');
  {
    const w = entorno({
      lineas: [LINEA('p-res', 'Smith & Hook Reserve Cab', 1, 12.59, '2026-10-27')],
      enlaces: []
    });
    const l = await w.BarStockMarginEdgeUnclaimed._calcular();
    prueba('encuentra Smith Hook para el Reserve',
      !!l[0].sugerida && /Smith Hook/.test(l[0].sugerida.item),
      l[0].sugerida ? l[0].sugerida.item : 'ninguna');
  }

  grupo('cuando no se parece a nada, pregunta en vez de adivinar');
  {
    const w = entorno({
      lineas: [LINEA('p-papel', 'Kitchen Roll', 4, 128.01, '2026-10-26')],
      enlaces: []
    });
    const l = await w.BarStockMarginEdgeUnclaimed._calcular();
    // Un emparejado equivocado mueve dinero a la botella que no es.
    // Eso es peor que no contarlo.
    prueba('no propone nada para el papel de cocina', !l[0].sugerida,
      l[0].sugerida ? l[0].sugerida.item : 'ninguna');
  }

  grupo('varias facturas del mismo producto son UNA decisión');
  {
    const w = entorno({
      lineas: [
        LINEA('p-res', 'Smith & Hook', 1, 12.59, '2026-10-26'),
        LINEA('p-res', 'Smith & Hook', 2, 25.18, '2026-10-27')
      ],
      enlaces: []
    });
    const l = await w.BarStockMarginEdgeUnclaimed._calcular();
    prueba('una sola ficha', l.length === 1, String(l.length));
    prueba('con las unidades sumadas', l[0].unidades === 3, String(l[0].unidades));
    prueba('y el dinero sumado', Math.abs(l[0].dinero - 37.77) < 0.001, String(l[0].dinero));
    prueba('fechada con la factura más reciente', l[0].fecha === '2026-10-27', l[0].fecha);
  }

  grupo('"Not mine" saca el producto de la lista para siempre');
  {
    const w = entorno({
      lineas: [LINEA('p-papel', 'Kitchen Roll', 4, 128.01, '2026-10-26')],
      enlaces: [],
      descartados: [{ product_id: 'p-papel' }]
    });
    const l = await w.BarStockMarginEdgeUnclaimed._calcular();
    // Sin esta salida la lista no llega nunca a cero, y una lista que
    // nunca se vacía se deja de mirar.
    prueba('ya no aparece', l.length === 0, String(l.length));
  }

  grupo('el resumen lleva el dinero, no sólo el número');
  {
    const w = entorno({
      lineas: [
        LINEA('p-res', 'Smith & Hook', 1, 12.59, '2026-10-27'),
        LINEA('p-lux', 'Luxardo', 2, 71.80, '2026-10-27')
      ],
      enlaces: []
    });
    const r = await w.BarStockMarginEdgeUnclaimed.resumen();
    prueba('cuenta los productos', r.n === 2, String(r.n));
    prueba('y suma lo que no está contado',
      Math.abs(r.dinero - 84.39) < 0.001, String(r.dinero));
  }

  grupo('pintar y elegir');
  {
    const w = entorno({
      lineas: [LINEA('p-res', 'Smith & Hook Reserve Cab', 1, 12.59, '2026-10-27')],
      enlaces: []
    });
    await w.BarStockMarginEdgeUnclaimed.abrir();
    await esperar(30);

    const cuerpo = w.document.getElementById('meuBody');
    prueba('sale la ficha', !!cuerpo.querySelector('.meu-it'));
    prueba('con el dinero que no cuenta', /12\.59/.test(cuerpo.textContent));
    prueba('y la sugerencia a un toque', !!cuerpo.querySelector('.meu-sug'));

    cuerpo.querySelector('.meu-sug').click();
    await esperar(40);

    const esc = w.__escrito.filter(e => /marginedge_links/.test(e.u));
    prueba('guarda el vínculo', esc.length === 1, JSON.stringify(w.__escrito));
    prueba('contra el producto correcto', esc[0] && esc[0].cuerpo.product_id === 'p-res');
    // Por NOMBRE del artículo, que es la identidad que usa la app en
    // todas partes. Un código de proveedor puede venir vacío.
    prueba('y con el nombre de tu botella',
      esc[0] && esc[0].cuerpo.item_name === 'Smith Hook Cabernet Sauvignon',
      esc[0] && esc[0].cuerpo.item_name);
    prueba('la ficha desaparece de la lista', !cuerpo.querySelector('.meu-it'));
    prueba('y el cero se dice, no se deja en blanco',
      /Everything that arrived is counted/.test(cuerpo.textContent));
  }

  grupo('descartar escribe en su propia tabla');
  {
    const w = entorno({
      lineas: [LINEA('p-papel', 'Kitchen Roll', 4, 128.01, '2026-10-26')],
      enlaces: []
    });
    await w.BarStockMarginEdgeUnclaimed.abrir();
    await esperar(30);
    w.document.querySelector('.meu-no').click();
    await esperar(40);

    const esc = w.__escrito.filter(e => /marginedge_not_mine/.test(e.u));
    prueba('guarda el descarte', esc.length === 1, JSON.stringify(w.__escrito));
    prueba('por product_id, no por nombre',
      esc[0] && esc[0].cuerpo.product_id === 'p-papel');
    // Los nombres de MarginEdge cambian y "Smith Hook" y "Smith & Hook
    // Reserve" se leen casi igual: descartar por nombre se llevaría los
    // dos por delante.
    prueba('y no toca la tabla de vínculos',
      !w.__escrito.some(e => /marginedge_links/.test(e.u)));
  }

  grupo('sin facturas nuevas no hay pantalla que mirar');
  {
    const w = entorno({ lineas: [], enlaces: [] });
    await w.BarStockMarginEdgeUnclaimed.abrir();
    await esperar(30);
    prueba('lo dice con palabras',
      /Everything that arrived is counted/.test(
        w.document.getElementById('meuBody').textContent));
  }

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
