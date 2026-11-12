(() => {
  if (window.BarStockAdminApi) return;
  // ── La llamada a /api/admin, una sola ────────────────────────────────
  //
  // La usaban el panel de Admin del escritorio (admin-panel.js) y, desde
  // el 2026-11-12, Settings › People › Bartenders del teléfono
  // (mobile-bartenders.js). Vivía dentro del panel; copiarla al teléfono
  // era tener la misma llamada en dos sitios, y el día que cambie la
  // sesión una de las dos se queda atrás.
  //
  // La seguridad no está aquí: /api/admin rechaza a cualquiera que no
  // sea ADMIN_EMAIL, lo llame quien lo llame.
  async function llamar(action, params) {
    const client = await window.BarStockAuth.getAuthClient();
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData && sessionData.session && sessionData.session.access_token;
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(Object.assign({ action }, params || {}))
    });
    // Un 500 de Vercel puede no ser JSON: se dice lo que contestó.
    const texto = await res.text();
    try { return JSON.parse(texto); }
    catch (e) { return { ok: false, error: 'The server answered ' + res.status + ': ' + texto.slice(0, 160) }; }
  }

  // Quien tiene la sesión es Axel. Sólo para enseñar o esconder: decidir
  // lo decide el servidor.
  function soyAdmin() {
    const a = (window.BARSTOCK_CONFIG || {}).ADMIN_EMAIL;
    return !!a && String(window.__bsUserEmail || '').toLowerCase() === String(a).toLowerCase();
  }

  window.BarStockAdminApi = { llamar, soyAdmin };
})();
