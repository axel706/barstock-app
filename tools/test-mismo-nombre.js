#!/usr/bin/env node
/*
 * ── "Bailey's" y "Baileys" son el mismo producto ─────────────────────
 *
 * La conciliación cruzaba el nombre guardado en el vínculo con el de
 * la línea de la orden CARÁCTER POR CARÁCTER:
 *
 *     if (r.item !== l.item_name) continue;
 *
 * El vínculo decía "Baileys Irish Cream" y la orden "Bailey's Irish
 * Cream". Para cualquiera es la misma botella; para un `!==` son dos
 * cadenas distintas. Resultado: la entrega no se encontraba y la
 * orden salía CORTA aunque hubiera llegado — con el dinero de menos
 * en el ciclo y sin ninguna pista de por qué.
 *
 * Pasaba en los dos sitios que concilian: el historial del móvil y
 * "What came in" del escritorio.
 *
 *   node tools/test-mismo-nombre.js
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

// ── El caso real, extremo a extremo ─────────────────────────────────

function entorno() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  w.state = { master: [], orderHistory: [] };
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };
  // Sin `reverseSnapshotOrdered` a proposito: en una locacion donde el
  // modulo no este completo, reabrir NO puede romperse por eso.
  w.BarStockCycle = { startedAt: () => new Date('2026-10-25T08:00:00Z') };

  const f = async (u) => {
    const pag = (x) => ({ ok: true, json: async () => x, text: async () => '' });
    const off = Number((/offset=(\d+)/.exec(u) || [])[1] || 0);
    if (off) return pag([]);

    if (/vendor_orders\?/.test(u)) return pag([
      // DOS ids, y a proposito distintos: `id` es la fila de
      // Supabase y `app_order_id` el que genera la app. Confundirlos
      // es lo que rompia reabrir y reenviar.
      { id: 1, app_order_id: 'ord_abc123', vendor: 'BREAKTHRU', po_number: 'CT-0205',
        created_at: '2026-10-26T10:00:00Z', subtotal: 113.97, status: 'sent' }
    ]);
    if (/vendor_order_items/.test(u)) return pag([
      // Con apóstrofe tipográfico, como lo escribe la app.
      { vendor_order_id: 1, item_name: 'Bailey’s Irish Cream', quantity: 3, unit_price: 37.99 }
    ]);
    if (/marginedge_invoice_lines/.test(u)) return pag([
      { product_id: 'p1', quantity: 3, invoice_date: '2026-10-27', invoice_number: '2689338', vendor_name: 'BREAKTHRU' }
    ]);
    if (/marginedge_links/.test(u)) return pag([
      // Sin apóstrofe, como está en el inventario.
      { product_id: 'p1', item_name: 'Baileys Irish Cream' }
    ]);
    return pag([]);
  };
  w.fetch = f; global.fetch = f;

  new Function(leer('src/marginedge-match.js'))();
  new Function(leer('src/mobile-history.js'))();
  return w;
}

(async () => {
  grupo('el historial encuentra la entrega');
  {
    const w = entorno();
    const h = w.document.createElement('div');
    w.document.body.appendChild(h);
    await w.BarStockMobileHistory.montar(h);
    await esperar(60);

    const t = h.textContent.replace(/\s+/g, ' ');
    // Lo que veía Axel: "1 item came up short · $113.97 never arrived".
    prueba('no dice que se quedó corta', !/came up short/i.test(t), t.slice(0, 200));
    prueba('ni que no llegó nada', !/never arrived/i.test(t), t.slice(0, 200));
  }

  grupo('reabrir y reenviar usan el id de la APP');
  {
    // Esta pantalla lee `vendor_orders`, que tiene DOS ids: el de su
    // propia fila y `app_order_id`, el que genera la app. Todo lo
    // demas —`state.orderHistory`, `deleteOrderFromSupabase`, el
    // escritorio— habla el segundo.
    //
    // Usando el primero, "reabrir" no encontraba nunca la orden y la
    // pantalla decia que era demasiado vieja. Con la orden delante.
    const w = entorno();
    w.state.orderHistory = [{ id: 'ord_abc123', vendor: 'BREAKTHRU', items: [] }];
    w.__borradas = [];
    w.deleteOrderFromSupabase = async (id) => { w.__borradas.push(id); };
    w.loadOrdersFromCloud = async () => {};
    w.BarStockVendorDefaults = { getDefaults: async () => ({ vendor_email: 'a@b.com' }) };
    w.BarStockToast = { show() {} };

    const h = w.document.createElement('div');
    w.document.body.appendChild(h);
    await w.BarStockMobileHistory.montar(h);
    await esperar(60);
    h.querySelector('[data-o]').click();
    await esperar(30);

    prueba('no la da por perdida',
      !/older than what the app keeps/i.test(h.textContent), h.textContent.slice(0, 120));
    prueba('ofrece reenviar', !!h.querySelector('#mhRe'));
    prueba('y reabrir', !!h.querySelector('#mhAbrir'));

    // ARRIBA. Con veintisiete lineas, lo que va al final no se
    // encuentra.
    const acc = h.querySelector('.m-hacc');
    const lista = h.querySelector('.m-hlist');
    prueba('y van antes que las lineas',
      !!acc && !!lista && (acc.compareDocumentPosition(lista) & 4) !== 0);

    // Reabrir borra por `app_order_id`, no por la fila de Supabase.
    h.querySelector('#mhAbrir').click();
    await esperar(10);
    h.querySelector('#mhSi').click();
    await esperar(40);
    prueba('borra con el id de la app',
      w.__borradas[0] === 'ord_abc123', JSON.stringify(w.__borradas));
  }

  grupo('la normalización, caso por caso');
  {
    // Se prueba contra el motor real, no contra una copia: si alguien
    // cambia `norm` en el emparejado, esto tiene que seguir valiendo.
    const w = entorno();
    const n = w.BarStockMarginEdgeMatch._norm;

    const igual = (a, b) => n(a) === n(b);
    prueba('apóstrofe tipográfico', igual('Bailey’s Irish Cream', 'Baileys Irish Cream'));
    prueba('apóstrofe recto', igual("Tito's Vodka", 'Titos Vodka'));
    prueba('acentos', igual('Jose Cuervo', 'José Cuervo'));
    prueba('mayúsculas y espacios de más', igual('  CROWN  ROYAL ', 'Crown Royal'));
    prueba('guiones y puntos', igual('Fever-Tree Tonic', 'Fever Tree Tonic'));

    // Y lo que NO debe unir: dos botellas distintas que se parecen.
    prueba('no junta tamaños distintos', !igual('Tito’s Vodka 750', 'Tito’s Vodka 1.75L'));
    prueba('ni dos productos distintos', !igual('Smith Hook Cabernet', 'Smith Hook Reserve Cabernet'));
  }

  grupo('los dos sitios que concilian usan la misma regla');
  {
    // Si uno compara en crudo y el otro normalizado, el móvil y el
    // escritorio dirían cosas distintas de la misma orden.
    for (const f of ['src/mobile-history.js', 'src/marginedge-purchases.js']) {
      const s = leer(f);
      prueba(f.split('/').pop() + ' compara normalizado', /mismoNombre\(/.test(s));
      prueba(f.split('/').pop() + ' ya no compara en crudo',
        !/!==\s*l\.item_name/.test(s));
    }
  }

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
