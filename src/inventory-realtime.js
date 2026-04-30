(() => {
  if (window.__barstockInventoryRealtimeBooted) return;
  window.__barstockInventoryRealtimeBooted = true;

  const BARSTOCK_RT_URL = 'https://lqmoftpedmbhtuzlbbuh.supabase.co';
  const BARSTOCK_RT_KEY = 'sb_publishable_OOsEgZD8rRC6115PkGSHsA_nAB9n68S';
  const BARSTOCK_RT_LOCATION_NAME = 'The Crown Tavern';

  async function ensureSupabaseSdk() {
    if (window.supabase) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function setRealtimeStatus(msg) {
    try {
      if (typeof setStatus === 'function') {
        setStatus(msg);
      } else {
      }
    } catch (e) {
    }
  }

  async function fetchLocationId() {
    const res = await fetch(
      `${BARSTOCK_RT_URL}/rest/v1/locations?name=eq.${encodeURIComponent(BARSTOCK_RT_LOCATION_NAME)}&select=id,name`,
      {
        headers: {
          apikey: BARSTOCK_RT_KEY,
          Authorization: `Bearer ${BARSTOCK_RT_KEY}`
        }
      }
    );
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) {
      throw new Error(`No se encontró la locación ${BARSTOCK_RT_LOCATION_NAME}`);
    }
    return data[0].id;
  }

  async function loadInventoryFromSupabase() {
    const locationId = await fetchLocationId();

    const res = await fetch(
      `${BARSTOCK_RT_URL}/rest/v1/inventory_items?location_id=eq.${locationId}&select=code,item_name,vendor,on_hand,suggested,value`,
      {
        headers: {
          apikey: BARSTOCK_RT_KEY,
          Authorization: `Bearer ${BARSTOCK_RT_KEY}`
        }
      }
    );

    const rows = await res.json();
    if (!Array.isArray(rows)) {
      throw new Error('La respuesta de inventory_items no fue válida');
    }

    state.master = rows.map(r => {
      const onHand = Number(r.on_hand || 0);
      const suggested = Number(r.suggested || 0);
      return {
        code: r.code || '',
        item: r.item_name || '',
        itemNorm: typeof normalizeName === 'function' ? normalizeName(r.item_name || '') : (r.item_name || ''),
        vendor: String(r.vendor || 'UNKNOWN').trim().toUpperCase(),
        onHand,
        suggested,
        value: Number(r.value || 0),
        toOrder: typeof computeToOrder === 'function' ? computeToOrder(onHand, suggested) : 0,
        orderOverride: ''
      };
    });

    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();

    if (window.BarStockEvents && typeof window.BarStockEvents.emit === 'function') {
      window.BarStockEvents.emit('inventoryUpdated', {
        source: 'inventory-realtime',
        itemCount: state.master.length
      });
    }

    // Sync dependent modules after realtime inventory update
    try {
      if (typeof rebuildPlacedOrdersFromHistory === 'function') {
        rebuildPlacedOrdersFromHistory();
      }

      if (typeof populateQuickOrderProducts === 'function') {
        const activeQuickVendor = typeof quickOrderVendorTab !== 'undefined' ? quickOrderVendorTab : 'LOOP';
        populateQuickOrderProducts(activeQuickVendor);
      }

      if (typeof render === 'function') {
        render();
      }
    } catch (e) {
      console.warn('Realtime dependent module sync failed', e);
    }

    setRealtimeStatus(`Inventory cloud cargado: ${state.master.length} items`);
  }

  async function enableInventoryRealtime() {
    await ensureSupabaseSdk();

    const rtClient = window.supabase.createClient(BARSTOCK_RT_URL, BARSTOCK_RT_KEY);

    await loadInventoryFromSupabase();

    if (window.__barstockInventoryRealtimeChannel) {
      try { await window.__barstockInventoryRealtimeChannel.unsubscribe(); } catch (e) {}
    }

    window.__barstockInventoryRealtimeChannel = rtClient
      .channel('barstock-inventory-master-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_items'
        },
        async () => {
          await loadInventoryFromSupabase();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('Inventory realtime conectado');
        }
      });
  }

  window.enableInventoryRealtime = enableInventoryRealtime;

  window.addEventListener('load', () => {
    setTimeout(() => {
      enableInventoryRealtime().catch(err => {
        console.error(err);
        setRealtimeStatus('Error conectando inventory realtime');
      });
    }, 600);
  });
})();
