(() => {
  if (window.BarStockDevPanel) return;

  // ── Lo que comparten los paneles de "Developer tools" ────────────────
  //
  // El panel de TripleSeat traía escritas dentro la llamada a la función
  // de integraciones (con la sesión de la app) y el copiar al
  // portapapeles. Al hacer el de Toast hacían falta las dos, idénticas.
  // Copiarlas era el fallo que más se repite en este proyecto: lo mismo
  // escrito en dos sitios, que un día deja de decir lo mismo. Viven aquí
  // y los dos paneles las usan.
  //
  // No escribe nada en ningún sitio: pregunta y copia.

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // Una pregunta a /api/integrations, con la sesión de la app. La función
  // de Vercel la comprueba una vez y reparte al proveedor.
  async function llamar(proveedor, action, params) {
    const S = window.BarStockSupabase;
    const client = S && S.getClient && S.getClient();
    const { data } = client ? await client.auth.getSession() : { data: null };
    const token = (data && data.session && data.session.access_token) || '';
    const r = await fetch('/api/integrations?provider=' + encodeURIComponent(proveedor), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action, params: params || {} })
    });
    return r.json();
  }

  // Al portapapeles. Primero la forma de ahora; si el navegador no da
  // permiso (pasa en algunos teléfonos), la antigua del textarea.
  async function copiar(texto) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(texto); return true; }
    } catch (e) { /* sin permiso: se prueba a la antigua */ }
    try {
      const t = document.createElement('textarea');
      t.value = texto; t.setAttribute('readonly', '');
      t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch (e) { return false; }
  }

  window.BarStockDevPanel = { esc, llamar, copiar };
})();
