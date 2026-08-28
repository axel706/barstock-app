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

  async function replaceInventoryMaster(masterRows) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

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
      bottle_shape: r.bottleShape || null
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
