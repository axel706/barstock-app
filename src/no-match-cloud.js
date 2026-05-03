(() => {
  if (window.BarStockNoMatchCloud) return;

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

  async function deleteNoMatch(rawItem) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    const res = await fetch(
      `${url}/rest/v1/inventory_no_matches?location_id=eq.${locationId}&raw_item=eq.${encodeURIComponent(rawItem || '')}`,
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
      throw new Error('Error deleting inventory_no_matches: ' + txt);
    }

    return true;
  }

  async function saveAlias({ rawItem, itemNorm }) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    const res = await fetch(
      `${url}/rest/v1/inventory_aliases?on_conflict=location_id,raw_item`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify([{
          location_id: locationId,
          raw_item: String(rawItem || '').toLowerCase().trim(),
          item_norm: itemNorm
        }])
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Error saving inventory_aliases: ' + txt);
    }

    return true;
  }

  window.BarStockNoMatchCloud = {
    fetchLocationId,
    saveAlias,
    deleteNoMatch
  };
})();
