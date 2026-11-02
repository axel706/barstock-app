(() => {
  if (window.BarStockInventoryCloud) return;

  function getConfig() {
    const config = window.BARSTOCK_CONFIG || {};
    return {
      url: config.SUPABASE_URL,
      key: config.SUPABASE_KEY,
      accountId: config.ACCOUNT_ID || 'wjm-hospitality',
      locationName: config.LOCATION_NAME || 'The Crown Tavern'
    };
  }

  async function fetchLocationId() {
    const { url, key, accountId, locationName } = getConfig();

    if (!url || !key) {
      throw new Error('Missing Supabase config for inventory cloud.');
    }

    const res = await fetch(
      `${url}/rest/v1/locations?account_id=eq.${encodeURIComponent(accountId)}&name=eq.${encodeURIComponent(locationName)}&select=id`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`
        }
      }
    );

    const data = await res.json();
    const locationId = data?.[0]?.id;

    if (!locationId) {
      throw new Error(`Could not find ${locationName} location`);
    }

    return locationId;
  }

  async function patchInventoryItem({ oldCode, oldItem, code, item, vendor, onHand, suggested, value }) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    const res = await fetch(
      `${url}/rest/v1/inventory_items?location_id=eq.${locationId}&code=eq.${encodeURIComponent(oldCode || '')}&item_name=eq.${encodeURIComponent(oldItem || '')}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          code,
          item_name: item,
          vendor,
          on_hand: Number(onHand || 0),
          suggested: Number(suggested || 0),
          value: Number(value || 0)
        })
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Error updating inventory_items: ' + txt);
    }

    return true;
  }

  async function deleteInventoryItem({ code, item }) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    let deleteUrl = `${url}/rest/v1/inventory_items?location_id=eq.${locationId}&item_name=eq.${encodeURIComponent(item || '')}`;

    if (code) {
      deleteUrl += `&code=eq.${encodeURIComponent(code)}`;
    }

    const res = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Error deleting inventory_items: ' + txt);
    }

    return true;
  }

  async function createInventoryItem({ code, item, vendor, onHand, suggested, value }) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    const res = await fetch(`${url}/rest/v1/inventory_items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify([{
        location_id: locationId,
        code: code || '',
        item_name: item || '',
        vendor: String(vendor || 'UNKNOWN').trim().toUpperCase(),
        suggested: Number(suggested || 0),
        on_hand: Number(onHand || 0),
        value: Number(value || 0)
      }])
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Error creating inventory_items: ' + txt);
    }

    return true;
  }

  // ─── setOrderOverride ────────────────────────────────────────────
  // Guarda (o limpia) el "Final Order" manual de un articulo en la nube.
  // Antes esto solo vivia en el navegador, asi que se perdia al cambiar de
  // navegador y cada vez que el inventario se recargaba desde la nube.
  // value === '' | null  => limpia el override (vuelve a automatico)
  async function setOrderOverride({ code, item, value }) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    const clean = (value === '' || value === null || value === undefined)
      ? null
      : Math.max(0, Number(value) || 0);

    let patchUrl = `${url}/rest/v1/inventory_items?location_id=eq.${locationId}&item_name=eq.${encodeURIComponent(item || '')}`;
    if (code) patchUrl += `&code=eq.${encodeURIComponent(code)}`;

    const res = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ order_override: clean })
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Error saving order_override: ' + txt);
    }

    return true;
  }

  // ─── clearAllOrderOverrides ──────────────────────────────────────
  // Se llama al importar un conteo nuevo y al hacer Reset on hand:
  // cada ciclo semanal arranca limpio.
  async function clearAllOrderOverrides() {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    const res = await fetch(
      `${url}/rest/v1/inventory_items?location_id=eq.${locationId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ order_override: null })
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Error clearing order_override: ' + txt);
    }

    return true;
  }

  async function resetOnHandForItems(items) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    const res = await fetch(
      `${url}/rest/v1/inventory_items?location_id=eq.${locationId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ on_hand: 0 })
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Error resetting inventory_items: ' + txt);
    }

    return true;
  }

  async function touchWeeklyReset(customDate) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    const resetAt = customDate || new Date().toISOString();

    const res = await fetch(
      `${url}/rest/v1/locations?id=eq.${locationId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          weekly_reset_at: resetAt
        })
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Error updating weekly_reset_at: ' + txt);
    }

    return true;
  }

  async function deleteAllInventoryItems() {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    const res = await fetch(
      `${url}/rest/v1/inventory_items?location_id=eq.${locationId}`,
      {
        method: 'DELETE',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`
        }
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Error deleting inventory_items: ' + txt);
    }

    return true;
  }

  // ── El seguro contra borrar medio inventario ──────────────────────
  //
  // Esta funcion BORRA la tabla entera y la reinserta desde el array
  // local. La llaman cinco sitios, y todos dan por hecho que
  // `state.master` esta completo. El dia que no lo este —una carga a
  // medias, un cambio de locacion a destiempo, una lectura que fallo
  // sin ruido— se lleva por delante todo lo que falte, sin preguntar y
  // sin dejar rastro.
  //
  // Paso: una noche, contando, Baileys y otros dos dejaron de existir.
  // Nunca supimos cual de los cinco fue, y eso es justo el problema:
  // no habia forma de saberlo.
  //
  // Asi que antes de borrar se cuenta lo que hay. Si lo que entra es
  // mucho mas pequeño, se para. Un inventario no encoge un 20% solo.
  //
  // `force: true` para los dos casos en que si es legitimo: vaciar a
  // proposito desde Admin, y el import de un conteo que de verdad trae
  // una lista nueva mas corta.
  const MERMA_MAX = 0.8;   // menos del 80% de lo que habia = sospechoso

  async function cuantosHay(url, key, locationId) {
    try {
      const r = await fetch(
        `${url}/rest/v1/inventory_items?location_id=eq.${locationId}&select=id&limit=0`,
        { headers: { apikey: key, Authorization: `Bearer ${key}`,
                     Prefer: 'count=exact', Range: '0-0' } });
      const n = Number(String(r.headers.get('content-range') || '').split('/')[1]);
      return isFinite(n) ? n : null;
    } catch (e) { return null; }
  }

  async function replaceInventoryMaster(masterRows, opts) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    const entran = (masterRows || []).length;
    if (!(opts && opts.force)) {
      const habia = await cuantosHay(url, key, locationId);
      // `null` = no se pudo contar. Ahi NO se para: fallar por el lado
      // de no escribir dejaria la app sin poder importar un conteo por
      // una lectura perdida. Pero se dice.
      if (habia === null) {
        console.warn('[inventario] no se pudo contar antes de reemplazar; se sigue');
      } else if (entran < habia * MERMA_MAX) {
        const msg = 'Refusing to replace the catalogue: ' + entran +
          ' items would replace ' + habia + '. That would delete ' +
          (habia - entran) + '. Reload and try again.';
        console.error('[inventario] ' + msg);
        throw new Error(msg);
      }
    }

    await deleteAllInventoryItems();

    // Esta funcion BORRA y reinserta la tabla entera, asi que todo lo que
    // no aparezca aqui se pierde. category faltaba, y por eso las
    // categorias asignadas desaparecian en cada import del conteo.
    //
    // bottle_size_ml y bottle_shape se conservan por el mismo motivo:
    // describen la BOTELLA, no el conteo. Un Casamigos de 750 ml sigue
    // siendo de 750 ml la semana que viene, y volver a asignarlos cada
    // lunes seria tirar a la basura el trabajo de clasificar 300
    // articulos.
    //
    // order_override y par_adjusted_week NO se conservan, y es
    // intencional: un conteo nuevo abre la semana desde cero. Un articulo
    // que la semana pasada se dejo en cero puede necesitarse esta.
    //
    // Regla para quien añada una columna a inventory_items: si describe
    // el ARTICULO, va en esta lista. Si describe el CONTEO de esta
    // semana, no. Olvidarlo no da ningun error — el dato simplemente
    // desaparece cada lunes.
    //
    // created_at se olvido exactamente asi. La columna tiene default
    // now(), y como esta funcion BORRA y reinserta, cada import le ponia
    // la fecha de hoy a los 270 articulos: todos "creados" el mismo
    // lunes, al mismo microsegundo. El campo decia cuando corrio el
    // ultimo conteo, no cuando entro el producto.
    //
    // Nadie lo noto porque nadie lo leia. En cuanto BarStockDormant
    // empezo a usarlo para la gracia de los recien creados, el inventario
    // entero quedo recien creado y no se escondia nada.
    const rows = (masterRows || []).map(r => ({
      location_id: locationId,
      code: r.code || '',
      item_name: r.item || '',
      vendor: r.vendor || '',
      suggested: Number(r.suggested || 0),
      on_hand: Number(r.onHand || 0),
      value: Number(r.value || 0),
      category: r.category || null,
      bottle_size_ml: r.bottleSizeMl || null,
      bottle_shape: r.bottleShape || null,
      // Sin esto el default now() lo vuelve a poner en hoy. Si la fila
      // no trae fecha —articulo nuevo de este import— se deja fuera y
      // que el default haga su trabajo, que ahi si es correcto.
      ...(r.createdAt ? { created_at: r.createdAt } : {}),
      // Describe el ARTICULO —como quedaron sus botellas abiertas en el
      // ultimo conteo—, asi que va en la lista. Fuera de ella se
      // perderia en cada import, sin dar ningun error.
      last_opens: Array.isArray(r.lastOpens) && r.lastOpens.length ? r.lastOpens : null
    }));

    const chunkSize = 200;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);

      const res = await fetch(`${url}/rest/v1/inventory_items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(chunk)
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error('Error inserting inventory_items: ' + txt);
      }
    }

    return true;
  }

  window.BarStockInventoryCloud = {
    fetchLocationId,
    createInventoryItem,
    patchInventoryItem,
    deleteInventoryItem,
    resetOnHandForItems,
    setOrderOverride,
    clearAllOrderOverrides,
    touchWeeklyReset,
    deleteAllInventoryItems,
    replaceInventoryMaster
  };
})();
