(() => {
  if (window.BarStockLocationSettings) return;

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
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      }
    );
    const data = await res.json();
    const locationId = data?.[0]?.id;
    if (!locationId) throw new Error(`Could not find ${locationName} location`);
    return locationId;
  }

  async function getSettings() {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    const res = await fetch(
      `${url}/rest/v1/location_settings?location_id=eq.${locationId}&select=*`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      }
    );

    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) {
      return { reply_to_email: null };
    }
    return rows[0];
  }

  async function saveSettings(settings) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();

    const payload = {
      location_id: locationId,
      reply_to_email: settings.reply_to_email || null,
      report_recipients: settings.report_recipients || '',
      updated_at: new Date().toISOString()
    };

    const res = await fetch(
      `${url}/rest/v1/location_settings?on_conflict=location_id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify([payload])
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Error saving location_settings: ' + txt);
    }

    return true;
  }

  async function getReportRecipients() {
    try {
      const settings = await getSettings();
      if (settings.report_recipients) return settings.report_recipients;
    } catch(e) {
      console.warn('Could not load report recipients', e);
    }
    return '';
  }

  async function getReplyToEmail() {
    try {
      const settings = await getSettings();
      if (settings.reply_to_email) return settings.reply_to_email;
    } catch(e) {
      console.warn('Could not load location settings', e);
    }

    // Fallback to logged-in user's email
    try {
      const client = window.BarStockSupabase?.getClient();
      if (client) {
        const { data } = await client.auth.getUser();
        if (data?.user?.email) return data.user.email;
      }
    } catch(e) {
      console.warn('Could not get logged-in user email', e);
    }

    return null;
  }

  window.BarStockLocationSettings = {
    getSettings,
    saveSettings,
    getReplyToEmail,
    getReportRecipients
  };
})();
