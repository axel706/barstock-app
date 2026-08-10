(() => {
  if (window.__barstockInventoryRealtimeBooted) return;
  window.__barstockInventoryRealtimeBooted = true;

  const config = window.BARSTOCK_CONFIG || {};

  const BARSTOCK_RT_URL = config.SUPABASE_URL;
  const BARSTOCK_RT_KEY = config.SUPABASE_KEY;
  const BARSTOCK_RT_LOCATION_NAME = config.LOCATION_NAME || 'The Crown Tavern';

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
    // Esqueleto solo cuando no hay NADA que mostrar todavia (primer login,
    // navegador nuevo, cambio de locacion). En las recargas de realtime ya
    // hay datos en pantalla, y parpadear esqueletos encima seria peor que
    // no hacer nada. El render() normal los sobreescribe al llegar los datos.
    const isFirstLoad = !Array.isArray(state.master) || state.master.length === 0;
    if (isFirstLoad && window.BarStockSkeleton) {
      window.BarStockSkeleton.tableRows('inventoryBody', 8, 7);
      window.BarStockSkeleton.tableRows('vendorBody', 7, 5);
    }

    const locationId = await fetchLocationId();

    const res = await fetch(
      `${BARSTOCK_RT_URL}/rest/v1/inventory_items?location_id=eq.${locationId}&select=code,item_name,vendor,on_hand,suggested,value,category,order_override,par_adjusted_week`,
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
      // El override ahora viene de la nube. Antes se intentaba "rescatar" del
      // state.master en memoria comparando nombre + vendor con igualdad exacta
      // de texto y sin usar el codigo; cualquier diferencia minima, o dos
      // articulos con el mismo nombre, hacia que se perdiera en silencio.
      const override = (r.order_override === null || r.order_override === undefined)
        ? ''
        : Math.max(0, Number(r.order_override) || 0);
      return {
        code: r.code || '',
        item: r.item_name || '',
        itemNorm: typeof normalizeName === 'function' ? normalizeName(r.item_name || '') : (r.item_name || ''),
        vendor: String(r.vendor || 'UNKNOWN').trim().toUpperCase(),
        onHand,
        suggested,
        value: Number(r.value || 0),
        category: r.category || null,
        // Semana en que Pour-IQ ya ajusto este articulo. Se escribia desde
        // hace tiempo pero nunca se leia, por eso los articulos ajustados
        // reaparecian como pendientes de inmediato.
        parAdjustedWeek: r.par_adjusted_week || null,
        toOrder: typeof computeToOrder === 'function' ? computeToOrder(onHand, suggested) : 0,
        orderOverride: override
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

    setRealtimeStatus(`Inventory cloud cargado: ${state.master.length} items`);
  }

  // ── Freno para rafagas de realtime ──────────────────────────────────
  //
  // Postgres emite un evento POR FILA. Un "reset on hand" o un conteo
  // nuevo son un solo PATCH masivo, pero llegan como 258 eventos, y antes
  // cada uno disparaba una recarga completa del inventario mas render().
  // Con clearAllOrderOverrides() encima, pasaban de 500 redibujados en
  // pocos segundos: el panel parpadeaba y los clicks no entraban porque
  // el innerHTML se reemplazaba justo cuando soltabas el dedo.
  //
  // Se juntan en una sola recarga 500ms despues del ULTIMO evento. Si
  // llegan mas mientras una recarga esta en vuelo, se encola una sola,
  // no una por evento.
  const RELOAD_DEBOUNCE_MS = 500;
  let reloadTimer = null;
  let reloadInFlight = false;
  let reloadPending = false;

  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(runReload, RELOAD_DEBOUNCE_MS);
  }

  async function runReload() {
    if (reloadInFlight) { reloadPending = true; return; }
    reloadInFlight = true;
    try {
      await loadInventoryFromSupabase();
    } catch (err) {
      console.warn('recarga de inventario fallida', err);
    } finally {
      reloadInFlight = false;
      if (reloadPending) { reloadPending = false; scheduleReload(); }
    }
  }

  async function enableInventoryRealtime() {
    await ensureSupabaseSdk();

    const rtClient = window.BarStockSupabase.getClient();

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
        () => {
          scheduleReload();
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
        // Si la carga fallo, el esqueleto se quedaria latiendo para siempre
        // y pareceria que la app esta colgada. Mejor decir que paso.
        if (window.BarStockSkeleton && (!Array.isArray(state.master) || !state.master.length)) {
          window.BarStockSkeleton.error('inventoryBody', 8, 'No se pudo cargar el inventario. Recarga la pagina.');
          window.BarStockSkeleton.error('vendorBody', 7, 'No se pudo cargar el inventario. Recarga la pagina.');
        }
      });
    }, 600);
  });
})();
