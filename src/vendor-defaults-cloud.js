(() => {
  if (window.BarStockVendorDefaults?.active) return;

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
    if (!locationId) throw new Error(`Could not find location: ${locationName}`);
    return locationId;
  }

  async function getDefaults(vendor) {
    const { url, key } = getConfig();
    try {
      const locationId = await fetchLocationId();
      const res = await fetch(
        `${url}/rest/v1/vendor_defaults?location_id=eq.${locationId}&vendor=eq.${encodeURIComponent(vendor)}&select=*`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      if (!res.ok) throw new Error('Failed to get vendor defaults: ' + await res.text());
      const data = await res.json();
      return data?.[0] || null;
    } catch (err) {
      console.warn('vendor_defaults getDefaults error:', err);
      return null;
    }
  }

  async function getAllDefaults() {
    const { url, key } = getConfig();
    try {
      const locationId = await fetchLocationId();
      const res = await fetch(
        `${url}/rest/v1/vendor_defaults?location_id=eq.${locationId}&order=vendor.asc&select=*`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      if (!res.ok) throw new Error('Failed to get all vendor defaults: ' + await res.text());
      return await res.json() || [];
    } catch (err) {
      console.warn('vendor_defaults getAllDefaults error:', err);
      return [];
    }
  }

  async function saveDefaults(vendor, fields) {
    const { url, key } = getConfig();
    try {
      const locationId = await fetchLocationId();
      const payload = {
        location_id:          locationId,
        vendor,
        vendor_email:          fields.vendor_email          || '',
        account_number:        fields.account_number        || '',
        rep_name:              fields.rep_name              || '',
        rep_phone:             fields.rep_phone             || '',
        delivery_window:       fields.delivery_window       || '',
        delivery_address:      fields.delivery_address      || '',
        special_instructions:  fields.special_instructions  || '',
        updated_at: new Date().toISOString()
      };
      const res = await fetch(
        `${url}/rest/v1/vendor_defaults?on_conflict=location_id,vendor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: key,
            Authorization: `Bearer ${key}`,
            Prefer: 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(payload)
        }
      );
      if (!res.ok) throw new Error('Failed to save vendor defaults: ' + await res.text());
      return true;
    } catch (err) {
      console.error('❌ vendor_defaults saveDefaults error:', err);
      return false;
    }
  }

  // El día y la hora en que llega el pedido de este proveedor (migración
  // 032). Va aparte de saveDefaults: la ficha manda sus campos con
  // merge-duplicates, que sólo toca las columnas que se le pasan, así
  // que guardar la ficha no borra el horario ni al revés.
  //
  // Devuelve { ok, error } con lo que dijo Supabase tal cual: si la 032
  // no está corrida, el error lo dice ("column ... does not exist"), y
  // adivinarlo aquí ya mandó una vez a correr una migración ya corrida.
  async function saveDelivery(vendor, day, time) {
    const { url, key } = getConfig();
    try {
      const locationId = await fetchLocationId();
      const res = await fetch(
        `${url}/rest/v1/vendor_defaults?on_conflict=location_id,vendor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: key,
            Authorization: `Bearer ${key}`,
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify({
            location_id: locationId, vendor,
            delivery_day: day == null ? null : Number(day),
            delivery_time: time || null,
            updated_at: new Date().toISOString()
          })
        }
      );
      if (!res.ok) return { ok: false, error: 'Supabase answered ' + res.status + ': ' + (await res.text()).slice(0, 200) };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  window.BarStockVendorDefaults = {
    active: true,
    getDefaults,
    getAllDefaults,
    saveDefaults,
    saveDelivery
  };
})();
