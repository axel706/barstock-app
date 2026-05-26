(() => {
  if (window.BarStockSenderProfile?.active) return;

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

  async function getProfile() {
    const { url, key } = getConfig();
    try {
      const locationId = await fetchLocationId();
      const res = await fetch(
        `${url}/rest/v1/sender_profile?location_id=eq.${locationId}&select=*`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      if (!res.ok) throw new Error('Failed to get sender profile: ' + await res.text());
      const data = await res.json();
      return data?.[0] || null;
    } catch (err) {
      console.warn('sender_profile getProfile error:', err);
      return null;
    }
  }

  async function saveProfile(fields) {
    const { url, key } = getConfig();
    try {
      const locationId = await fetchLocationId();
      const payload = {
        location_id: locationId,
        name:  fields.name  || '',
        email: fields.email || '',
        phone: fields.phone || '',
        title: fields.title || '',
        updated_at: new Date().toISOString()
      };
      const res = await fetch(
        `${url}/rest/v1/sender_profile?on_conflict=location_id`,
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
      if (!res.ok) throw new Error('Failed to save sender profile: ' + await res.text());
      return true;
    } catch (err) {
      console.error('sender_profile saveProfile error:', err);
      return false;
    }
  }

  window.BarStockSenderProfile = {
    active: true,
    getProfile,
    saveProfile
  };
})();
