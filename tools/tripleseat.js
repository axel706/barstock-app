/* ── TripleSeat: ¿qué contesta? ───────────────────────────────────────
 *
 * SÓLO LECTURA. Llama a /api/integrations?provider=tripleseat y escribe
 * en la consola. No toca nada, ni en Supabase ni en TripleSeat.
 *
 * Cómo se usa:
 *   1. Abre app.barstockpro.com con tu sesión.
 *   2. Consola del navegador (en Safari no admite `await` dentro de
 *      paréntesis; escríbelo suelto, como abajo).
 *   3. Pega este archivo entero y Enter.
 *   4. Llama, en este orden:
 *        await bsTripleseat('ping')        ¿funciona el login?
 *        await bsTripleseat('locations')   qué locaciones ve, con sus id
 *        await bsTripleseat('events')      una muestra de eventos
 *        await bsTripleseat('events', { site_id: 123 })   de un sitio
 *        await bsTripleseat('bookings')    una muestra de reservas
 *        await bsTripleseat('events', { page: 12 })   otra página
 *
 * Los eventos llegan de 50 en 50 y del más viejo al más nuevo.
 * `envoltorio` y `cabeceras` dicen cuántas páginas hay; `forma`, qué
 * campos anidados trae cada evento (sólo los nombres, nunca valores).
 *
 * Cada una imprime lo que contestó cada ruta que probó. Si algo falla,
 * lo que sale es lo que dijo TripleSeat, tal cual.
 */
(() => {
  window.bsTripleseat = async function (accion, params) {
    const S = window.BarStockSupabase;
    if (!S || !S.getClient) { console.warn('No encuentro la sesión de la app.'); return null; }
    const { data } = await S.getClient().auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) { console.warn('No hay sesión iniciada.'); return null; }
    const r = await fetch('/api/integrations?provider=tripleseat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action: accion || 'ping', params: params || {} })
    });
    let j;
    try { j = await r.json(); } catch (e) { j = { ok: false, status: r.status, error: 'La función no devolvió JSON.' }; }
    console.log('%cTripleSeat · ' + (accion || 'ping') + (j.ok ? ' · ok' : ' · falló'),
      'font-weight:bold;color:' + (j.ok ? '#16a34a' : '#dc2626'));
    console.log(j);
    return j;
  };
  console.log('Listo. Empieza por:  await bsTripleseat("ping")');
})();
