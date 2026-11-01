/* ── Por qué esta orden dice "waiting" ───────────────────────────────
 *
 * SÓLO LECTURA. Hace GETs y escribe en la consola. No toca nada.
 *
 * Cómo se usa:
 *   1. Abre app.barstockpro.com en la locación que falla.
 *   2. Consola del navegador.
 *   3. Pega este archivo entero y Enter.
 *   4. Llama:   await bsPorQue('CT-0207', 'CT-0204')
 *      (los PO que aparecen en la tarjeta; admite los que quieras)
 *
 * Reproduce EXACTAMENTE el reparto de `src/mobile-history.js` —mismo
 * orden, mismo suelo, mismo consumo global— y en vez de un estado
 * imprime la decisión de cada recibo: por qué entró o por qué no.
 */
(() => {
  const c = window.BARSTOCK_CONFIG || {};
  const H = { apikey: c.SUPABASE_KEY, Authorization: 'Bearer ' + c.SUPABASE_KEY };
  const MAX_ORDENES = 300;   // el mismo de mobile-history.js

  const norm = (s) => typeof window.normalizeName === 'function'
    ? window.normalizeName(s || '')
    : String(s || '').trim().toLowerCase();
  const mismoNombre = (a, b) => norm(a) === norm(b);
  const dia = (t) => t ? new Date(t).toISOString().slice(0, 10) : '—';

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

  window.bsPorQue = async function (...pos) {
    const locId = await window.BarStockParIntelligence.fetchLocationId();

    const ordenes = await leerTodo(
      `vendor_orders?location_id=eq.${locId}` +
      `&select=id,app_order_id,vendor,po_number,created_at,subtotal` +
      `&order=created_at.desc`);
    const recortadas = ordenes.slice(0, MAX_ORDENES);
    const ids = recortadas.map(o => o.id).filter(Boolean);

    const lineas = await leerTodo(
      `vendor_order_items?vendor_order_id=in.(${ids.join(',')})` +
      `&select=vendor_order_id,item_name,quantity,unit_price&order=item_name.asc`);
    const facturas = await leerTodo(
      `marginedge_invoice_lines?location_id=eq.${locId}` +
      `&select=product_id,quantity,unit_price,invoice_date,invoice_number,vendor_name` +
      `&order=order_id.asc`);
    const enlaces = await leerTodo(
      `marginedge_links?location_id=eq.${locId}` +
      `&select=product_id,item_name&order=product_id.asc`);

    const deQuien = new Map(enlaces.map(e => [String(e.product_id), e.item_name || '']));
    const recibos = [];
    for (const f of facturas) {
      const item = deQuien.get(String(f.product_id));
      if (!item) continue;
      recibos.push({
        item, qty: Number(f.quantity) || 0,
        precio: Number(f.unit_price) || 0,
        fecha: f.invoice_date ? new Date(f.invoice_date).getTime() : 0,
        factura: f.invoice_number || '', vendor: f.vendor_name || ''
      });
    }

    const porOrden = new Map();
    for (const l of lineas) {
      const k = String(l.vendor_order_id);
      if (!porOrden.has(k)) porOrden.set(k, []);
      porOrden.get(k).push(l);
    }

    const C = window.BarStockCycle;
    const ini = C && C.startedAt && C.startedAt();
    const inicioCiclo = ini ? ini.getTime() : 0;

    console.log('%cCiclo abierto desde: ' + (ini ? ini.toISOString() : 'NINGUNO'),
      'font-weight:bold');
    console.log('Facturas con producto enlazado: ' + recibos.length +
      ' de ' + facturas.length + ' líneas');
    console.log('Sin enlazar (no cuentan para nadie): ' + (facturas.length - recibos.length));

    const buscados = pos.map(p => String(p).toUpperCase());
    const quien = new Map();   // recibo -> quién se lo llevó

    // El MISMO recorrido: de la más nueva a la más vieja, consumo global.
    for (const o of recortadas) {
      const po = String(o.po_number || o.app_order_id || '').toUpperCase();
      const mirar = buscados.includes(po);
      const ls = porOrden.get(String(o.id)) || [];
      const t0 = new Date(o.created_at).getTime();
      const suelo = (inicioCiclo && t0 >= inicioCiclo) ? inicioCiclo : (t0 - 86400000);

      if (mirar) {
        console.log('%c\n━━━ ' + po + ' · ' + o.vendor + ' · ' + dia(t0) +
          ' · ' + ls.length + ' líneas', 'font-weight:bold;font-size:13px');
        console.log('suelo = ' + dia(suelo) +
          (inicioCiclo && t0 >= inicioCiclo ? '  (arranque del ciclo)' : '  (su fecha − 1 día)'));
      }

      for (const l of ls) {
        const pedido = Number(l.quantity) || 0;
        let llegado = 0;
        const tabla = [];

        for (const r of recibos) {
          const mismo = mismoNombre(r.item, l.item_name);
          if (!mismo) continue;   // ni se menciona: sería toda la base
          let motivo = '';
          if (r.usado) motivo = 'YA USADO por ' + (quien.get(r) || '?');
          else if (r.fecha && r.fecha < suelo) motivo = 'ANTES DEL SUELO';
          else if (llegado >= pedido) motivo = 'ya completo';

          if (!motivo) {
            llegado += r.qty;
            r.usado = true;
            quien.set(r, po || o.vendor);
            motivo = '✓ contado';
          }
          if (mirar) {
            tabla.push({
              factura: r.factura, proveedor: r.vendor, fecha: dia(r.fecha),
              qty: r.qty, precio: r.precio, resultado: motivo
            });
          }
        }

        if (mirar) {
          const ok = llegado >= pedido;
          console.log('%c  ' + (ok ? '✓' : '✗') + ' ' + l.item_name +
            '  — pedidas ' + pedido + ', contadas ' + llegado,
            ok ? 'color:#4ade80' : 'color:#fbbf24');
          if (tabla.length) console.table(tabla);
          else console.log('     ningún recibo con ese nombre. ' +
            'O la factura no está, o el producto no está enlazado en Invoices.');
        }
      }
    }

    console.log('\n%cListo. Lo que importa de cada línea sin contar:',
      'font-weight:bold');
    console.log('  · sin tabla        → la factura no existe, o el producto no está enlazado');
    console.log('  · YA USADO por X   → otra orden más nueva se lo llevó');
    console.log('  · ANTES DEL SUELO  → la factura es anterior al arranque del ciclo');
  };

  console.log('%cListo. Ahora:  await bsPorQue(\'CT-0207\', \'CT-0204\')',
    'font-weight:bold;color:#4ade80');
})();
