/* ── Qué haría el enlace automático, sin hacerlo ─────────────────────
 *
 * SÓLO LECTURA. Hace GETs y escribe en la consola. No toca nada, no
 * escribe ni una fila.
 *
 * Cómo se usa:
 *   1. Abre app.barstockpro.com en la locación que quieras mirar.
 *   2. Consola del navegador.
 *   3. Pega este archivo entero y Enter.
 *   4. Llama:   await bsEnsayo()
 *
 * Para cada factura del CICLO ABIERTO enseña las tres órdenes que más
 * se le parecen, con sus puntos desglosados, y dice si se enlazaría o
 * por qué no.
 *
 * Esto existe porque los pesos y los umbrales de
 * `src/invoice-order-auto.js` son un punto de partida, no una verdad.
 * Antes de que escriban nada, hay que verlos decidir sobre datos de
 * verdad. Él dijo que hoy sólo cambiaría una orden: esto debería
 * enseñar exactamente una.
 */
(() => {
  const c = window.BARSTOCK_CONFIG || {};
  const H = { apikey: c.SUPABASE_KEY, Authorization: 'Bearer ' + c.SUPABASE_KEY };
  const MAX_ORDENES = 300;

  async function leerTodo(ruta) {
    let todo = [], p = 0;
    for (;;) {
      const r = await fetch(`${c.SUPABASE_URL}/rest/v1/${ruta}&limit=1000&offset=${p * 1000}`,
        { headers: H });
      if (!r.ok) throw new Error(await r.text());
      const t = await r.json();
      if (!Array.isArray(t) || !t.length) break;
      todo = todo.concat(t);
      if (t.length < 1000) break;
      p++;
    }
    return todo;
  }

  const d2 = (x) => '$' + (Math.round(Number(x || 0) * 100) / 100).toFixed(2);
  const p2 = (x) => (Math.round(Number(x || 0) * 100)) + '%';

  window.bsEnsayo = async function () {
    const A = window.BarStockInvoiceOrderAuto;
    if (!A) { console.error('Falta src/invoice-order-auto.js en esta version.'); return; }

    const locId = await window.BarStockParIntelligence.fetchLocationId();

    // El arranque del ciclo abierto: el mismo suelo que usa la app.
    const C = window.BarStockCycle;
    const ini = C && C.startedAt && C.startedAt();
    const desde = ini ? ini.toISOString() : '';
    console.log('%cCiclo abierto desde ' + (desde ? desde.slice(0, 10) : '(sin ciclo)'),
      'font-weight:bold');

    const ordenes = await leerTodo(
      `vendor_orders?location_id=eq.${locId}` +
      `&select=id,app_order_id,vendor,po_number,created_at,subtotal&order=created_at.desc`);
    const recortadas = ordenes.slice(0, MAX_ORDENES);
    const ids = recortadas.map(o => o.id).filter(Boolean);

    const lineasOrden = ids.length ? await leerTodo(
      `vendor_order_items?vendor_order_id=in.(${ids.map(encodeURIComponent).join(',')})` +
      `&select=vendor_order_id,item_name,quantity,unit_price&order=item_name.asc`) : [];

    const lineas = await leerTodo(
      `marginedge_invoice_lines?location_id=eq.${locId}` +
      `&select=order_id,product_id,quantity,unit_price,invoice_date,invoice_number,vendor_name` +
      `&order=order_id.asc`);
    const enlaces = await leerTodo(
      `marginedge_links?location_id=eq.${locId}&select=product_id,item_name&order=product_id.asc`);

    let ya = [];
    try {
      ya = await leerTodo(
        `invoice_order_links?location_id=eq.${locId}&select=order_id,vendor_order_id`);
    } catch (e) { console.warn('sin invoice_order_links'); }

    const filas = A.proponer({
      lineas, enlaces, ordenes: recortadas, lineasOrden,
      yaEnlazadas: new Set(ya.map(x => String(x.order_id))),
      desde
    });

    const etiqueta = new Map(recortadas.map(o =>
      [String(o.id), (o.po_number || o.app_order_id || o.id) + ' · ' + (o.vendor || '?')]));

    console.log('Facturas del ciclo abierto sin dueño: ' + filas.length);
    let enlazaria = 0;

    for (const f of filas) {
      const cab = 'Factura ' + (f.numero || f.factura) + ' · ' + (f.fecha || '?') +
                  ' · ' + d2(f.total) + ' · ' + f.productos + ' productos' +
                  (f.sinEnlace ? ' (+' + f.sinEnlace + ' sin enlazar)' : '');
      console.group(cab);
      for (const k of f.candidatas) {
        console.log(
          (k.orden === f.enlaza ? '→ ' : '  ') +
          (etiqueta.get(k.orden) || k.orden) +
          '   puntos ' + k.puntos.toFixed(3) +
          '   | productos ' + k.coinc + ' (' + p2(k.solape) + ' de la factura, ' +
          p2(k.cobertura) + ' de la orden)' +
          ' | importe ' + p2(k.dinero) +
          ' | fecha ' + p2(k.dias) +
          ' | proveedor ' + (k.prov ? 'igual' : 'distinto'));
      }
      if (f.enlaza) { enlazaria++; console.log('%cSE ENLAZARIA', 'color:#16a34a;font-weight:bold'); }
      else { console.log('%cno se enlaza: ' + f.porQueNo, 'color:#b45309'); }
      console.groupEnd();
    }

    console.log('%cResumen: ' + enlazaria + ' de ' + filas.length + ' se enlazarian.',
      'font-weight:bold');
    console.log('Umbrales actuales: solape >= ' + A.MINIMO_SOLAPE +
                ', puntos >= ' + A.MINIMO_PUNTOS + ', margen sobre la 2a >= ' + A.MARGEN);
    return { filas, enlazaria };
  };

  console.log('Listo. Llama:  await bsEnsayo()');
})();
