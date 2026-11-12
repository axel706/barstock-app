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
    // A quién va el correo de la mañana (migración 035). Sólo si quien
    // guarda lo trae: el escritorio no tiene ese campo, y mandarlo vacío
    // borraría la lista que se puso en el teléfono. Con merge-duplicates
    // una columna que no va en el cuerpo no se toca.
    if (Object.prototype.hasOwnProperty.call(settings, 'morning_recipients')) {
      payload.morning_recipients = settings.morning_recipients || '';
    }

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
      // Lo que dijo Supabase. Y sólo si dice que falta ESA columna, cuál
      // es la migración: no a cualquier error que mencione la tabla.
      if (/PGRST204|42703/.test(txt) && /morning_recipients/.test(txt)) {
        throw new Error('The morning_recipients column is not in the database yet: run migration 035. (' + txt + ')');
      }
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
