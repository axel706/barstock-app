(() => {
  if (window.__barstockOrderCloudBooted) return;
  window.__barstockOrderCloudBooted = true;

  function getOrdersConfig() {
    const config = window.BARSTOCK_CONFIG || {};
    return {
      url: config.SUPABASE_URL,
      key: config.SUPABASE_KEY,
      accountId: config.ACCOUNT_ID || 'wjm-hospitality',
      locationName: config.LOCATION_NAME || 'The Crown Tavern'
    };
  }

  window.BarStockOrdersConfig = window.BarStockOrdersConfig || getOrdersConfig;

  async function orderCloudFetchLocationId() {
    const res = await fetch(
      `${window.BarStockOrdersConfig().url}/rest/v1/locations?account_id=eq.${encodeURIComponent(window.BarStockOrdersConfig().accountId)}&name=eq.${encodeURIComponent(window.BarStockOrdersConfig().locationName)}&select=id,name`,
      {
        headers: {
          apikey: window.BarStockOrdersConfig().key,
          Authorization: `Bearer ${window.BarStockOrdersConfig().key}`
        }
      }
    );
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) {
      throw new Error(`No se encontró la locación ${window.BarStockOrdersConfig().locationName}`);
    }
    return data[0].id;
  }

  const PO_PREFIXES = {
    'The Crown Tavern': 'CT',
    'The Jockey Tavern': 'JT',
    "Will's & Bill's":  'WB',
    'DEVELOP':          'DP'
  };

  function getPoPrefix() {
    const name = window.BarStockOrdersConfig().locationName || '';
    return PO_PREFIXES[name] || name.replace(/[^A-Z]/gi, '').substring(0, 3).toUpperCase() || 'PO';
  }

  async function getNextPoNumber(locationId) {
    try {
      const cfg = window.BarStockOrdersConfig();
      const res = await fetch(
        `${cfg.url}/rest/v1/rpc/increment_po_counter`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: cfg.key,
            Authorization: `Bearer ${cfg.key}`
          },
          body: JSON.stringify({ p_location_id: locationId })
        }
      );
      if (!res.ok) throw new Error('RPC failed: ' + await res.text());
      const counter = await res.json();
      const prefix = getPoPrefix();
      return `${prefix}-${String(counter).padStart(4, '0')}`;
    } catch (err) {
      console.warn('getNextPoNumber failed, using fallback:', err);
      return `PO-${Date.now()}`;
    }
  }

  // ── La llegada del pedido (migración 033) ──────────────────────────
  //
  // Se fija aquí, al guardarlo, para que valga igual en los cuatro
  // caminos que colocan una orden (escritorio, teléfono, quick order de
  // LOOP y de correo). Un pedido normal llega en la siguiente entrega de
  // su proveedor (vendor-delivery.js); un quick order, a la hora que diga
  // él (por ahora, la suya: casi siempre ya está en la bodega). Si la
  // orden ya trae su llegada —se está volviendo a guardar— se respeta.
  async function llegadaDe(order, creada) {
    if (order.arrivesAt !== undefined) return order.arrivesAt || null;
    if (order.quickOrder) return creada;
    const VD = window.BarStockVendorDelivery;
    if (!VD || !VD.llegadaDe) return null;
    try { return await VD.llegadaDe(order.vendor, creada); }
    catch (e) { console.warn('[ordenes] no se pudo leer el horario de ' + order.vendor, e); return null; }
  }

  // Si la 033 no está corrida, PostgREST contesta que no encuentra la
  // columna. Se repite sin ella: un pedido sin su llegada es mejor que un
  // pedido que no se guarda. Se mira el nombre de la columna en la
  // respuesta, no cualquier error: con otro fallo se repetiría a ciegas.
  const faltaColumna = (txt) => /arrives_at|is_quick/.test(String(txt || '')) &&
    /column|schema cache|PGRST204|42703/i.test(String(txt || ''));

  async function persistOrderToSupabase(order) {
    const locationId = await orderCloudFetchLocationId();

    const poNumber = await getNextPoNumber(locationId);
    const creada = order.createdAt || order.date || new Date().toISOString();
    order.arrivesAt = await llegadaDe(order, creada);

    const vendorOrderPayload = {
      app_order_id: order.id,
      location_id: locationId,
      location_name: window.BarStockOrdersConfig().locationName,
      vendor: order.vendor || '',
      status: 'placed',
      po_number: poNumber,
      subtotal: Number(order.subtotal || 0),
      filename: order.filename || '',
      export_type: order.exportType || '',
      total_units: Number(order.totalUnits || 0),
      created_at: creada,
      arrives_at: order.arrivesAt || null,
      is_quick: !!order.quickOrder
    };

    // DELETE existing order for this app_order_id + location_id, then INSERT fresh
    const cfg = window.BarStockOrdersConfig();
    await fetch(
      `${cfg.url}/rest/v1/vendor_orders?app_order_id=eq.${encodeURIComponent(order.id)}&location_id=eq.${locationId}`,
      {
        method: 'DELETE',
        headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }
      }
    );

    const insertar = (cuerpo) => fetch(
      `${cfg.url}/rest/v1/vendor_orders`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`,
          Prefer: 'return=representation'
        },
        body: JSON.stringify(cuerpo)
      }
    );
    let orderRes = await insertar(vendorOrderPayload);

    if (!orderRes.ok) {
      let txt = await orderRes.text();
      if (faltaColumna(txt)) {
        console.warn('[ordenes] vendor_orders sin arrives_at / is_quick (falta la migración 033): se guarda sin ellas.');
        const viejo = Object.assign({}, vendorOrderPayload);
        delete viejo.arrives_at; delete viejo.is_quick;
        orderRes = await insertar(viejo);
        if (!orderRes.ok) txt = await orderRes.text();
      }
      if (!orderRes.ok) throw new Error('Error guardando vendor_orders: ' + txt);
    }

    const orderRows = await orderRes.json();
    const vendorOrderId = orderRows?.[0]?.id;
    if (!vendorOrderId) {
      throw new Error('No se recibió el id de vendor_orders');
    }

    // limpiar items previos de esa orden si existían
    const delRes = await fetch(
      `${window.BarStockOrdersConfig().url}/rest/v1/vendor_order_items?app_order_id=eq.${encodeURIComponent(order.id)}`,
      {
        method: 'DELETE',
        headers: {
          apikey: window.BarStockOrdersConfig().key,
          Authorization: `Bearer ${window.BarStockOrdersConfig().key}`
        }
      }
    );

    if (!delRes.ok) {
      const txt = await delRes.text();
      throw new Error('Error limpiando vendor_order_items: ' + txt);
    }

    const itemRows = (order.items || []).map((r) => {
      const qty = Number(r.finalOrder || r.quantity || 0);
      const unitPrice = Number(r.value || 0);
      return {
        vendor_order_id: vendorOrderId,
        app_order_id: order.id,
        vendor: order.vendor || '',
        code: r.code || '',
        item_name: r.item || '',
        quantity: qty,
        unit_price: unitPrice,
        line_total: Number((qty * unitPrice).toFixed(2))
      };
    }).filter(r => r.quantity > 0);

    if (itemRows.length) {
      const itemsRes = await fetch(
        `${window.BarStockOrdersConfig().url}/rest/v1/vendor_order_items`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: window.BarStockOrdersConfig().key,
            Authorization: `Bearer ${window.BarStockOrdersConfig().key}`,
            Prefer: 'return=minimal'
          },
          body: JSON.stringify(itemRows)
        }
      );

      if (!itemsRes.ok) {
        const txt = await itemsRes.text();
        throw new Error('Error guardando vendor_order_items: ' + txt);
      }
    }

    return vendorOrderId;
  }

  async function deleteOrderFromSupabase(id) {
    const { url, key } = window.BarStockOrdersConfig();

    const itemsRes = await fetch(
      `${url}/rest/v1/vendor_order_items?app_order_id=eq.${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`
        }
      }
    );

    if (!itemsRes.ok) {
      const txt = await itemsRes.text();
      throw new Error('Error deleting vendor_order_items: ' + txt);
    }

    const orderRes = await fetch(
      `${url}/rest/v1/vendor_orders?app_order_id=eq.${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`
        }
      }
    );

    if (!orderRes.ok) {
      const txt = await orderRes.text();
      throw new Error('Error deleting vendor_orders: ' + txt);
    }

    return true;
  }

  window.deleteOrderFromSupabase = deleteOrderFromSupabase;
  window.persistOrderToSupabase = persistOrderToSupabase;
  // El segundo bloque de este archivo (la carga) la necesita también y
  // no ve lo de éste: se comparte por aquí en vez de escribirla dos veces.
  window.BarStockOrdersFaltaColumna = faltaColumna;
})();

(() => {
  if (window.__barstockOrdersCoreBooted) return;
  window.__barstockOrdersCoreBooted = true;

  // Definida en el primer bloque (el que guarda). La carga la usa para
  // reconocer que falta la migración 033; sin ella, aquí no existía y la
  // carga reventaba justo en ese caso (lo encontró tools/test-llegada.js).
  const faltaColumna = (txt) => !!(window.BarStockOrdersFaltaColumna && window.BarStockOrdersFaltaColumna(txt));

  async function getOrdersLocationId() {
    const res = await fetch(
      `${window.BarStockOrdersConfig().url}/rest/v1/locations?account_id=eq.${encodeURIComponent(window.BarStockOrdersConfig().accountId)}&name=eq.${encodeURIComponent(window.BarStockOrdersConfig().locationName)}&select=id,weekly_reset_at`,
      {
        headers: {
          apikey: window.BarStockOrdersConfig().key,
          Authorization: `Bearer ${window.BarStockOrdersConfig().key}`
        }
      }
    );
    const data = await res.json();
    const row = data?.[0];
    if (!row?.id) throw new Error('No location found for Orders');
    return row;
  }

  async function rebuildPlacedOrdersFromHistory() {
    try {
      const location = await getOrdersLocationId();
      const resetAt = location.weekly_reset_at ? new Date(location.weekly_reset_at) : null;
      const keys = [];

      (state.orderHistory || []).forEach(order => {
        const orderDate = new Date(order.createdAt || order.date || 0);
        if (resetAt && orderDate < resetAt) return;

        (order.items || []).forEach(item => {
          if (typeof placedKeyForRow !== 'function') return;
          const key = placedKeyForRow({
            code: item.code || '',
            item: item.item || '',
            vendor: String(item.vendor || order.vendor || '').trim().toUpperCase()
          });
          if (key) keys.push(key);
        });
      });

      state.placedOrders = Array.from(new Set(keys.filter(Boolean)));
    } catch (err) {
      console.error('rebuildPlacedOrdersFromHistory failed', err);
    }
  }

  async function loadOrdersFromCloud() {
    try {
      const location = await getOrdersLocationId();
      const locationId = location.id;

      // Paginado por el mismo motivo que vendor_order_items: Supabase corta
      // toda respuesta REST en 1000 filas. Sin esto, al pasar de 1000 ordenes
      // las mas viejas desaparecerian del historial sin aviso.
      // El desempate por app_order_id evita que una fila se repita o se salte
      // cuando varias ordenes comparten el mismo created_at.
      const orders = [];
      {
        const PAGE_SIZE = 1000;
        const MAX_PAGES = 100; // tope de seguridad
        // Con la llegada y la marca de quick order (033). Si la base aún
        // no las tiene, PostgREST lo dice y se vuelve a pedir sin ellas:
        // el historial de pedidos no puede quedarse vacío por eso.
        const BASE = 'app_order_id,vendor,created_at,export_type,filename,total_units,subtotal,po_number';
        let columnas = BASE + ',arrives_at,is_quick';

        for (let page = 0; page < MAX_PAGES; page++) {
          const offset = page * PAGE_SIZE;
          const pedir = () => fetch(
            `${window.BarStockOrdersConfig().url}/rest/v1/vendor_orders` +
            `?location_id=eq.${locationId}` +
            `&select=${columnas}` +
            `&order=created_at.desc,app_order_id.asc` +
            `&limit=${PAGE_SIZE}&offset=${offset}`,
            {
              headers: {
                apikey: window.BarStockOrdersConfig().key,
                Authorization: `Bearer ${window.BarStockOrdersConfig().key}`
              }
            }
          );
          let ordersRes = await pedir();
          if (!ordersRes.ok && columnas !== BASE) {
            const txt = await ordersRes.text();
            if (!faltaColumna(txt)) throw new Error('vendor_orders: ' + txt);
            console.warn('[ordenes] vendor_orders sin arrives_at / is_quick (falta la migración 033): se leen sin ellas.');
            columnas = BASE;
            ordersRes = await pedir();
          }
          const pageOrders = await ordersRes.json();
          if (!Array.isArray(pageOrders)) throw new Error('Invalid vendor_orders response');

          orders.push(...pageOrders);
          if (pageOrders.length < PAGE_SIZE) break; // pagina incompleta = no hay mas
        }
      }

      // Filtrar items solo por los app_order_ids de esta locación.
      //
      // CAUSA RAIZ del bug de "orden con 0 items": Supabase corta cualquier
      // respuesta REST en un maximo de filas (1000 por defecto). En locaciones
      // con historial grande el total de vendor_order_items supera ese tope y
      // la respuesta llegaba truncada: unas ordenes se quedaban sin items y la
      // que caia justo en el corte llegaba a la mitad. Los datos en la nube
      // siempre estuvieron completos; lo que fallaba era la lectura.
      //
      // Por eso aqui se pagina explicitamente con limit/offset y un orden
      // estable, pidiendo pagina tras pagina hasta que la nube deje de
      // devolver filas. Asi el numero de items nunca depende del tamaño
      // del historial.
      const orderIds = orders.map(o => o.app_order_id).filter(Boolean);
      let items = [];
      const ORDER_IDS_BATCH_SIZE = 50;
      const PAGE_SIZE = 1000;
      const MAX_PAGES = 200; // tope de seguridad, evita bucles infinitos

      if (orderIds.length > 0) {
        const batches = [];
        for (let i = 0; i < orderIds.length; i += ORDER_IDS_BATCH_SIZE) {
          batches.push(orderIds.slice(i, i + ORDER_IDS_BATCH_SIZE));
        }

        const batchResults = await Promise.all(batches.map(async (batch) => {
          const idsParam = batch.map(id => `"${id}"`).join(',');
          const collected = [];

          for (let page = 0; page < MAX_PAGES; page++) {
            const offset = page * PAGE_SIZE;
            const itemsRes = await fetch(
              `${window.BarStockOrdersConfig().url}/rest/v1/vendor_order_items` +
              `?app_order_id=in.(${idsParam})` +
              `&select=app_order_id,code,item_name,vendor,quantity,unit_price` +
              `&order=app_order_id.asc,item_name.asc,code.asc` +
              `&limit=${PAGE_SIZE}&offset=${offset}`,
              {
                headers: {
                  apikey: window.BarStockOrdersConfig().key,
                  Authorization: `Bearer ${window.BarStockOrdersConfig().key}`
                }
              }
            );
            const pageItems = await itemsRes.json();
            if (!Array.isArray(pageItems)) throw new Error('Invalid vendor_order_items response');

            collected.push(...pageItems);

            // pagina incompleta = ya no hay mas filas
            if (pageItems.length < PAGE_SIZE) break;
          }

          return collected;
        }));

        items = batchResults.flat();
      }

      const itemsByOrder = {};
      for (const item of items) {
        const key = String(item.app_order_id || '');
        if (!key) continue;
        if (!itemsByOrder[key]) itemsByOrder[key] = [];
        itemsByOrder[key].push(item);
      }

      state.orderHistory = orders.map(order => ({
        id: String(order.app_order_id || ''),
        vendor: String(order.vendor || 'UNKNOWN').trim().toUpperCase(),
        createdAt: order.created_at || new Date().toISOString(),
        date: order.created_at || new Date().toISOString(),
        exportType: order.export_type || 'vendor_jpg',
        filename: String(order.filename || ''),
        poNumber: String(order.po_number || ''),
        totalUnits: Number(order.total_units || 0),
        subtotal: Number(order.subtotal || 0),
        // undefined si la base aún no tiene la columna: así, al volver a
        // guardar la orden, se calcula; null es "se miró y no se sabe".
        arrivesAt: order.arrives_at === undefined ? undefined : (order.arrives_at || null),
        quickOrder: !!order.is_quick,
        items: (itemsByOrder[String(order.app_order_id || '')] || []).map(item => ({
          code: String(item.code || '').trim(),
          item: String(item.item_name || '').trim(),
          vendor: String(item.vendor || order.vendor || 'UNKNOWN').trim().toUpperCase(),
          onHand: 0,
          suggested: 0,
          value: Number(item.unit_price || 0),
          toOrder: 0,
          orderOverride: '',
          finalOrder: Number(item.quantity || 0)
        }))
      }));

      await rebuildPlacedOrdersFromHistory();

      if (typeof saveState === 'function') saveState();

      if (window.BarStockEvents && typeof window.BarStockEvents.emit === 'function') {
        window.BarStockEvents.emit('ordersUpdated', {
          source: 'orders-cloud',
          count: state.orderHistory.length
        });
      } else {
        if (typeof render === 'function') render();
        if (typeof renderOrderHistory === 'function') renderOrderHistory();
        if (typeof renderCompareToolbar === 'function') renderCompareToolbar();
      }

      if (typeof setStatus === 'function') setStatus('Orders loaded');
    } catch (err) {
      console.error('loadOrdersFromCloud failed', err);
      if (typeof setStatus === 'function') setStatus('Could not load orders from cloud.');
    }
  }

  async function initOrdersModule() {
    await loadOrdersFromCloud();
  }

  async function deleteAllOrders() {
    const cfg = window.BarStockOrdersConfig();
    const locRes = await fetch(
      `${cfg.url}/rest/v1/locations?account_id=eq.${encodeURIComponent(cfg.accountId)}&name=eq.${encodeURIComponent(cfg.locationName)}&select=id`,
      { headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` } }
    );
    const locData = await locRes.json();
    if (!Array.isArray(locData) || !locData.length) throw new Error('Location not found');
    const locationId = locData[0].id;

    const res = await fetch(
      `${cfg.url}/rest/v1/vendor_orders?location_id=eq.${locationId}`,
      {
        method: 'DELETE',
        headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Error deleting vendor_orders: ' + txt);
    }
  }

  async function replaceOrders(orders) {
    await deleteAllOrders();
    for (const order of (orders || [])) {
      await persistOrderToSupabase(order);
    }
  }

  window.rebuildPlacedOrdersFromHistory = rebuildPlacedOrdersFromHistory;
  window.loadOrdersFromCloud = loadOrdersFromCloud;
  window.initOrdersModule = initOrdersModule;
  window.BarStockOrdersCloud = { deleteAllOrders, replaceOrders, loadOrdersFromCloud };

  window.addEventListener('load', () => {
    setTimeout(() => {
      initOrdersModule().catch(console.error);
    }, 1200);
  });
})();
