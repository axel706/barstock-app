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

  async function persistOrderToSupabase(order) {
    const locationId = await orderCloudFetchLocationId();

    const vendorOrderPayload = {
      app_order_id: order.id,
      location_id: locationId,
      location_name: window.BarStockOrdersConfig().locationName,
      vendor: order.vendor || '',
      status: 'placed',
      subtotal: Number(order.subtotal || 0),
      filename: order.filename || '',
      export_type: order.exportType || '',
      total_units: Number(order.totalUnits || 0)
    };

    // UPSERT de la orden principal
    const orderRes = await fetch(
      `${window.BarStockOrdersConfig().url}/rest/v1/vendor_orders?on_conflict=app_order_id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: window.BarStockOrdersConfig().key,
          Authorization: `Bearer ${window.BarStockOrdersConfig().key}`,
          Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(vendorOrderPayload)
      }
    );

    if (!orderRes.ok) {
      const txt = await orderRes.text();
      throw new Error('Error guardando vendor_orders: ' + txt);
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
})();

(() => {
  if (window.__barstockOrdersCoreBooted) return;
  window.__barstockOrdersCoreBooted = true;

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

      const ordersRes = await fetch(
        `${window.BarStockOrdersConfig().url}/rest/v1/vendor_orders?location_id=eq.${locationId}&select=app_order_id,vendor,created_at,export_type,filename,total_units,subtotal&order=created_at.desc`,
        {
          headers: {
            apikey: window.BarStockOrdersConfig().key,
            Authorization: `Bearer ${window.BarStockOrdersConfig().key}`
          }
        }
      );
      const orders = await ordersRes.json();
      if (!Array.isArray(orders)) throw new Error('Invalid vendor_orders response');

      // Filtrar items solo por los app_order_ids de esta locación
      const orderIds = orders.map(o => o.app_order_id).filter(Boolean);
      let items = [];

      if (orderIds.length > 0) {
        const idsParam = orderIds.map(id => `"${id}"`).join(',');
        const itemsRes = await fetch(
          `${window.BarStockOrdersConfig().url}/rest/v1/vendor_order_items?app_order_id=in.(${idsParam})&select=app_order_id,code,item_name,vendor,quantity,unit_price`,
          {
            headers: {
              apikey: window.BarStockOrdersConfig().key,
              Authorization: `Bearer ${window.BarStockOrdersConfig().key}`
            }
          }
        );
        items = await itemsRes.json();
        if (!Array.isArray(items)) throw new Error('Invalid vendor_order_items response');
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
        totalUnits: Number(order.total_units || 0),
        subtotal: Number(order.subtotal || 0),
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

      if (typeof setStatus === 'function') setStatus('Orders loaded from cloud.');
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
