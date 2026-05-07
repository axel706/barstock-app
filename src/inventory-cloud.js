(() => {
  if (window.BarStockInventoryCloud) return;

  function getConfig() {
    const config = window.BARSTOCK_CONFIG || {};
    return {
      url: config.SUPABASE_URL,
      key: config.SUPABASE_KEY,
      locationName: config.LOCATION_NAME || 'The Crown Tavern'
    };
  }

  async function fetchLocationId() {
    const { url, key, locationName } = getConfig();

    if (!url || !key) {
      throw new Error('Missing Supabase config for inventory cloud.');
    }

    const res = await fetch(
      `${url}/rest/v1/locations?name=eq.${encodeURIComponent(locationName)}&select=id`,
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

  async function resetOnHandForItems(items) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    for (const row of items || []) {
      const item = row?.item || '';
      const code = row?.code || '';

      let patchUrl = `${url}/rest/v1/inventory_items?location_id=eq.${locationId}&item_name=eq.${encodeURIComponent(item)}`;

      if (code) {
        patchUrl += `&code=eq.${encodeURIComponent(code)}`;
      }

      const res = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          on_hand: 0
        })
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error('Error resetting inventory_items: ' + txt);
      }
    }

    return true;
  }

  async function touchWeeklyReset() {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

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
          weekly_reset_at: new Date().toISOString()
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

  window.BarStockInventoryCloud = {
    fetchLocationId,
    createInventoryItem,
    patchInventoryItem,
    deleteInventoryItem,
    resetOnHandForItems,
    touchWeeklyReset,
    deleteAllInventoryItems
  };
})();
