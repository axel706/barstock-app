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

  // Huella de la ultima carga, para no redibujar cuando nada cambio
  let _lastStamp = null;

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

    // ── Leer el inventario ENTERO, o no leerlo ──────────────────────
    //
    // Esto era un `fetch` suelto: sin `limit`, sin paginar, y sin mirar
    // `res.ok`. Lo que llegara se convertia en `state.master`, y de ahi
    // en la verdad: al cerrar un conteo, `replaceInventoryMaster` BORRA
    // la tabla y reinserta esa lista. Una lectura corta se convertia en
    // un borrado permanente, en silencio.
    //
    // Paso: entre el 25 de octubre y el 1 de noviembre desaparecieron
    // ocho productos de Crown. Nadie los borro — se perdieron asi.
    //
    // Ahora: se comprueba la respuesta, se pagina de verdad, y se
    // contrasta el total con el que dice el servidor. Si no cuadra, se
    // lanza; quien llama ya sabe tratar un fallo de carga, y fallar es
    // infinitamente mejor que escribir medio inventario encima.
    const COLS = window.BarStockInventoryRow.COLS;
    const PAGINA = 1000;
    const H = { apikey: BARSTOCK_RT_KEY, Authorization: `Bearer ${BARSTOCK_RT_KEY}` };

    let rows = [];
    let esperados = null;
    for (let p = 0; p < 40; p++) {
      const res = await fetch(
        `${BARSTOCK_RT_URL}/rest/v1/inventory_items?location_id=eq.${locationId}` +
        `&select=${COLS}&order=item_name.asc&limit=${PAGINA}&offset=${p * PAGINA}`,
        { headers: Object.assign({ Prefer: 'count=exact' }, H) }
      );
      if (!res.ok) {
        throw new Error('inventory_items respondio ' + res.status + ': ' + (await res.text()));
      }
      // El total REAL, que es con lo que se comprueba al final. Viene en
      // la cabecera como "0-999/1234".
      if (esperados === null) {
        const n = Number(String(res.headers.get('content-range') || '').split('/')[1]);
        if (isFinite(n)) esperados = n;
      }
      const trozo = await res.json();
      if (!Array.isArray(trozo)) {
        throw new Error('La respuesta de inventory_items no fue válida');
      }
      rows = rows.concat(trozo);
      if (trozo.length < PAGINA) break;
    }

    // La comprobacion que faltaba. Sin esto, "llegaron 262 de 270" se
    // veia exactamente igual que "hay 262".
    if (esperados !== null && rows.length !== esperados) {
      throw new Error('inventory_items incompleto: llegaron ' + rows.length +
                      ' de ' + esperados + '. No se toca el inventario local.');
    }

    // Si lo que llego es identico a lo que ya hay en pantalla, no se toca
    // nada. Reconstruir state.master y redibujar con los MISMOS datos no
    // cambia un pixel de contenido, pero si reemplaza el DOM: el panel
    // lateral parpadea y un campo a medio escribir pierde el foco.
    //
    // La huella incluye lo que se dibuja. Si cambia algo de verdad, cambia
    // la cadena y la recarga sigue su curso.
    const stamp = rows.map(r => [
      r.code, r.item_name, r.vendor, r.on_hand, r.suggested,
      r.value, r.order_override, r.par_adjusted_week,
      // Sin estos dos, asignar forma y tamaño no cambiaria la huella y
      // la recarga se saltaria entera: state.master se quedaria con los
      // valores viejos hasta recargar la pagina a mano.
      r.bottle_size_ml, r.bottle_shape
    ].join('')).sort().join('');

    if (stamp === _lastStamp && Array.isArray(state.master) && state.master.length) {
      return;
    }
    _lastStamp = stamp;

    // La fila de la nube → la de state.master, en un solo sitio
    // (src/inventory-row.js): el correo de la mañana la necesita también
    // en el servidor, y dos copias acaban diciendo cosas distintas.
    state.master = rows.map(r => window.BarStockInventoryRow.deNube(r));

    // ── La silueta viene del mapa GLOBAL ──────────────────────────────
    //
    // `bottle_shape` en la fila de inventario es una copia por locacion.
    // La verdad esta en `item_shapes`, que es de la cuenta entera, igual
    // que los codigos de barras aprendidos: una botella escaneada y
    // asignada en The Crown tiene que dibujarse igual en Will's & Bill's.
    //
    // Va sin await para no retrasar el primer pintado: la fila local ya
    // trae una forma con la que dibujar, y cuando el mapa llega se
    // corrige y se vuelve a pintar.
    // Igual que las siluetas: sin await. La lista se pinta entera y
    // cuando llega la actividad se vuelve a pintar ya con lo quieto
    // escondido. Al reves —esperando— la pantalla se quedaria en blanco
    // por una consulta que solo decide que NO mostrar.
    // La lista de zonas, de una vez y para toda la pagina. Sin esto solo
    // se cargaba al abrir el escaner o Ajustes, y los paneles de
    // articulo de una pestaña recien abierta creian que no habia zonas.
    if (window.BarStockZones) {
      window.BarStockZones.cargar().catch(() => {});
    }

    if (window.BarStockDormant) {
      window.BarStockDormant.cargar().then(m => {
        if (m && typeof render === 'function') render();
      }).catch(() => {});
    }

    if (window.BarStockItemShapes) {
      window.BarStockItemShapes.hydrate(state.master).then(n => {
        if (n && typeof render === 'function') render();
      });
    }

    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();

    if (window.BarStockEvents && typeof window.BarStockEvents.emit === 'function') {
      window.BarStockEvents.emit('inventoryUpdated', {
        source: 'inventory-realtime',
        itemCount: state.master.length
      });
    }

    setRealtimeStatus(`Inventory loaded · ${state.master.length} items`);
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

    // El canal escuchaba TODA la tabla inventory_items, sin filtrar. Con
    // varias locaciones en la misma cuenta, cualquier cambio en cualquier
    // otra —Crown Tavern, otra pestana, otro usuario— disparaba una
    // recarga completa aqui. De ahi el parpadeo cada 10 o 15 segundos.
    const rtLocationId = await fetchLocationId();

    window.__barstockInventoryRealtimeChannel = rtClient
      .channel('barstock-inventory-master-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_items',
          filter: `location_id=eq.${rtLocationId}`
        },
        () => {
          scheduleReload();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('Live updates on');
        }
      });
  }

  window.enableInventoryRealtime = enableInventoryRealtime;

  // Volver a leer el inventario a mano. Lo usa el "tirar para recargar"
  // del telefono: el tiempo real cubre lo normal, pero con la pantalla
  // apagada o sin cobertura un rato se pierden eventos, y tirar hacia
  // abajo es el gesto con el que todo el mundo pide "mira otra vez".
  window.BarStockInventoryRealtime = { recargar: loadInventoryFromSupabase };

  window.addEventListener('load', () => {
    setTimeout(() => {
      enableInventoryRealtime().catch(err => {
        console.error(err);
        setRealtimeStatus('Live updates unavailable');
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
