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

function entorno(o) {
  o = o || {};
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

    if (o.ordenes)   { if (/vendor_orders\?/.test(u))          return pag(o.ordenes); }
    if (o.lineas)    { if (/vendor_order_items/.test(u))        return pag(o.lineas); }
    if (o.facturas)  { if (/marginedge_invoice_lines/.test(u))  return pag(o.facturas); }
    if (o.enlaces)   { if (/marginedge_links/.test(u))          return pag(o.enlaces); }

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
  new Function(leer('src/order-receipts.js'))();
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

  grupo('buscador y filtros, como en Inventory');
  {
    // Las pastillas All / Short / Waiting ocupaban un renglon entero
    // para una eleccion que se hace de vez en cuando. Ahora viven en
    // un cajon, detras del mismo boton que usa Inventory.
    const w = entorno();
    const h = w.document.createElement('div');
    w.document.body.appendChild(h);
    await w.BarStockMobileHistory.montar(h);
    await esperar(60);

    prueba('el buscador y el boton van en la misma fila',
      !!h.querySelector('.m-inv-bar2 .m-searchbar') && !!h.querySelector('.m-inv-bar2 #mhAdj'));
    prueba('y es el MISMO boton que Inventory',
      h.querySelector('#mhAdj').classList.contains('m-adj'));
    prueba('las pastillas ya no estan en la pantalla', !h.querySelector('.m-hchip'));

    // Sin filtro puesto, el boton esta apagado y no hay nada que
    // quitar.
    prueba('el boton nace apagado', !h.querySelector('#mhAdj').classList.contains('on'));
    prueba('y no hay etiqueta de filtro', !h.querySelector('#mhClr'));

    h.querySelector('#mhAdj').click();
    const hoja = w.document.querySelector('#mSheet');
    prueba('abre un cajon', !!hoja);
    const ops = hoja ? Array.from(hoja.querySelectorAll('[data-f]')).map(b => b.dataset.f) : [];
    prueba('con las tres opciones', ops.join(',') === 'all,short,waiting', ops.join(','));
    prueba('y cada una dice que significa',
      /never arrived/i.test(hoja.textContent) && /No invoice/i.test(hoja.textContent));

    hoja.querySelector('[data-f="short"]').click();
    prueba('elegir cierra el cajon', !w.document.querySelector('#mSheet'));
    prueba('el boton se enciende', h.querySelector('#mhAdj').classList.contains('on'));
    // Un icono encendido avisa de que algo filtra, pero no de QUE.
    prueba('y se dice cual es', /Short/.test((h.querySelector('#mhClr') || {}).textContent || ''),
      (h.querySelector('#mhClr') || {}).textContent);

    h.querySelector('#mhClr').click();
    prueba('y se puede quitar sin abrir el cajon',
      !h.querySelector('#mhClr') && !h.querySelector('#mhAdj').classList.contains('on'));
  }

  grupo('la lupa del buscador de Inventory');
  {
    // Embudo era el icono de filtrar, y filtrar es lo que hace el
    // boton de al lado: dos cosas distintas con el mismo dibujo.
    const inv = leer('src/mobile-inventory.js');
    const barra = /<div class="m-searchbar on[^"]*">([\s\S]{0,700}?)<\/div>/.exec(inv);
    prueba('es una lupa', !!barra && /ti-search/.test(barra[1]), (barra && barra[1] || '').slice(0, 70));
    prueba('y no un embudo', !!barra && !/ti-filter/.test(barra[1]));

    // ── El orden: primero sobre QUE, despues acotar ────────────────
    //
    // El segmentado elige el conjunto —lo que hay que arreglar, o
    // todo— y el buscador lo acota. Al reves se buscaba dentro de un
    // conjunto que todavia no habias elegido.
    //
    // Y es el mismo orden que Orders, que era de lo que iba.
    const iSeg = inv.indexOf('id="miSeg"');
    const iBar = inv.indexOf('class="m-inv-bar2"');
    prueba('el segmentado va antes del buscador',
      iSeg > 0 && iBar > 0 && iSeg < iBar, 'seg@' + iSeg + ' bar@' + iBar);
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

    grupo('la factura puede llegar ANTES que la orden');
  {
    // ── El caso real, 1 de noviembre ─────────────────────────────
    //
    // Factura de Fine Wine & Good Spirits del 30 de octubre; la orden
    // a LOOP se registró el 1 de noviembre. Las dos dentro del mismo
    // ciclo, los productos bien enlazados, y la orden decía "waiting"
    // con la factura delante.
    //
    // El corte era "sólo entregas posteriores a la orden, con un día
    // de margen", que da por supuesto que primero se pide y después
    // llega. Con LOOP se pide en su portal, llega la mercancía, y la
    // orden se apunta en la app cuando toca.
    const w = entorno({
      ordenes: [{ id: 7, app_order_id: 'ord_loop', vendor: 'LOOP', po_number: 'WB-0034',
                  created_at: '2026-11-01T15:00:00Z', subtotal: 71.98, status: 'sent' }],
      lineas: [
        { vendor_order_id: 7, item_name: 'Bombay Saphire Gin', quantity: 1, unit_price: 26.09 },
        { vendor_order_id: 7, item_name: 'Jameson Irish Whiskey', quantity: 1, unit_price: 29.69 }
      ],
      facturas: [
        { product_id: 'p1', quantity: 1, invoice_date: '2026-10-30', invoice_number: '2930', vendor_name: 'Fine Wine & Good Spirits' },
        { product_id: 'p2', quantity: 1, invoice_date: '2026-10-30', invoice_number: '2930', vendor_name: 'Fine Wine & Good Spirits' }
      ],
      enlaces: [
        { product_id: 'p1', item_name: 'Bombay Saphire Gin' },
        { product_id: 'p2', item_name: 'Jameson Irish Whiskey' }
      ]
    });
    const h = w.document.createElement('div');
    w.document.body.appendChild(h);
    await w.BarStockMobileHistory.montar(h);
    await esperar(60);

    const t = h.textContent.replace(/\s+/g, ' ');
    prueba('la orden NO se queda esperando', !/waiting/i.test(t), t.slice(0, 220));
    prueba('ni dice que llegó corta', !/short/i.test(t), t.slice(0, 220));
    // El nombre del proveedor de la factura NO tiene por qué coincidir
    // con el de la orden: LOOP es Fine Wine & Good Spirits. El
    // emparejado va por producto, y así tiene que seguir.
    prueba('el nombre del proveedor no estorba', !/never arrived/i.test(t));
  }

  grupo('y dos órdenes del mismo artículo no se pisan');
  {
    // Con el suelo en el ciclo entero, dos órdenes compiten por las
    // mismas entregas. La primera se queda lo que llegó primero: si
    // se repartiera al revés, la orden nueva se comería la entrega de
    // la vieja y la vieja saldría corta sin serlo.
    const w = entorno({
      ordenes: [
        { id: 1, app_order_id: 'a', vendor: 'LOOP', po_number: 'P1',
          created_at: '2026-10-26T10:00:00Z', subtotal: 10, status: 'sent' },
        { id: 2, app_order_id: 'b', vendor: 'LOOP', po_number: 'P2',
          created_at: '2026-10-29T10:00:00Z', subtotal: 10, status: 'sent' }
      ],
      lineas: [
        { vendor_order_id: 1, item_name: 'Tito Vodka', quantity: 2, unit_price: 10 },
        { vendor_order_id: 2, item_name: 'Tito Vodka', quantity: 2, unit_price: 10 }
      ],
      facturas: [
        { product_id: 'p1', quantity: 2, invoice_date: '2026-10-27', invoice_number: 'F1', vendor_name: 'X' }
      ],
      enlaces: [{ product_id: 'p1', item_name: 'Tito Vodka' }]
    });
    const h = w.document.createElement('div');
    w.document.body.appendChild(h);
    await w.BarStockMobileHistory.montar(h);
    await esperar(60);

    const t = h.textContent.replace(/\s+/g, ' ');
    // Una completa y otra esperando: con una sola entrega de dos, no
    // pueden estar las dos bien.
    prueba('una queda esperando', /waiting/i.test(t), t.slice(0, 240));
    prueba('y la otra no', (t.match(/waiting/gi) || []).length === 1, t.slice(0, 240));
  }

  grupo('una orden vieja no se come las facturas de este ciclo');
  {
    // ── El fallo que costo una manana ────────────────────────────
    //
    // Al relajar el suelo cambie tambien el reparto a "de la mas
    // vieja a la mas nueva", pensando en que dos ordenes del mismo
    // articulo no se pisaran. Pero una orden de hace meses conserva
    // su suelo viejo —su fecha menos un dia— asi que puede reclamar
    // CUALQUIER factura posterior. Al pasar primero, se comio las de
    // este mes: el historial entero paso a "waiting" de golpe.
    //
    // Las recientes eligen primero. Eso es lo que hacia que esto
    // funcionara y no se toca.
    const w = entorno({
      ordenes: [
        { id: 9, app_order_id: 'nueva', vendor: 'LOOP', po_number: 'NUEVA',
          created_at: '2026-10-28T10:00:00Z', subtotal: 20, status: 'sent' },
        { id: 1, app_order_id: 'vieja', vendor: 'LOOP', po_number: 'VIEJA',
          created_at: '2026-07-04T10:00:00Z', subtotal: 20, status: 'sent' }
      ],
      lineas: [
        { vendor_order_id: 9, item_name: 'Tito Vodka', quantity: 1, unit_price: 20 },
        { vendor_order_id: 1, item_name: 'Tito Vodka', quantity: 1, unit_price: 20 }
      ],
      facturas: [
        { product_id: 'p1', quantity: 1, invoice_date: '2026-10-29', invoice_number: 'F9', vendor_name: 'X' }
      ],
      enlaces: [{ product_id: 'p1', item_name: 'Tito Vodka' }]
    });
    const h = w.document.createElement('div');
    w.document.body.appendChild(h);
    await w.BarStockMobileHistory.montar(h);
    await esperar(60);

    const tarjetas = Array.from(h.querySelectorAll('.m-hcard'))
      .map(c => c.textContent.replace(/\s+/g, ' '));
    const nueva = tarjetas.find(t => /NUEVA/.test(t)) || '';
    const vieja = tarjetas.find(t => /VIEJA/.test(t)) || '';
    prueba('la del ciclo recibe la factura',
      !!nueva && !/waiting/i.test(nueva), nueva.slice(0, 160));
    prueba('y la vieja es la que se queda esperando',
      !!vieja && /waiting/i.test(vieja), vieja.slice(0, 160));
  }

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
