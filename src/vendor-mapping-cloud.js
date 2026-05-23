(() => {
  if (window.BarStockVendorMappingCloud) return;

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
    const res = await fetch(
      `${url}/rest/v1/locations?account_id=eq.${encodeURIComponent(accountId)}&name=eq.${encodeURIComponent(locationName)}&select=id`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    const data = await res.json();
    const locationId = data?.[0]?.id;
    if (!locationId) throw new Error(`Could not find ${locationName} location`);
    return locationId;
  }

  // Cargar las reglas de mapeo de la locación actual
  async function listMappings() {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    const res = await fetch(
      `${url}/rest/v1/vendor_code_mappings?location_id=eq.${locationId}&order=vendor.asc&select=*`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) throw new Error('Failed to list vendor mappings');
    return await res.json();
  }

  // Reemplazar TODO el mapeo de la locación (borra y reinserta)
  async function replaceMappings(rules) {
    const { url, key, locationName } = getConfig();
    const locationId = await fetchLocationId();
    // Borrar las existentes de esta locación
    await fetch(
      `${url}/rest/v1/vendor_code_mappings?location_id=eq.${locationId}`,
      { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!rules.length) return [];
    const payload = rules.map(r => ({
      location_id: locationId,
      vendor: String(r.vendor || '').trim().toUpperCase(),
      search_term: String(r.search_term || '').trim().toUpperCase(),
      is_numeric: !!r.is_numeric
    }));
    const res = await fetch(
      `${url}/rest/v1/vendor_code_mappings`,
      {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(payload)
      }
    );
    if (!res.ok) throw new Error('Failed to save vendor mappings');
    return await res.json();
  }

  window.BarStockVendorMappingCloud = {
    listMappings,
    replaceMappings
  };
})();
