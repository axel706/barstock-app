/* ── Toast: ¿qué contesta? ────────────────────────────────────────────
 *
 * SÓLO LECTURA. Llama a /api/integrations?provider=toast y escribe en la consola. No toca nada,
 * ni en Supabase ni en Toast.
 *
 * Cómo se usa:
 *   1. Abre app.barstockpro.com con tu sesión (cualquier locación).
 *   2. Consola del navegador.
 *   3. Pega este archivo entero y Enter.
 *   4. Llama, en este orden:
 *        await bsToast('ping')         ¿funciona el login?
 *        await bsToast('restaurant')   ¿el GUID es de verdad Crown?
 *        await bsToast('menu')         cuántos artículos y una muestra
 *        await bsToast('orders')       las ventas de ayer, resumidas
 *        await bsToast('orders', { businessDate: '20261101' })   otro día
 *
 * Cada una devuelve el objeto y además lo imprime. Si algo falla, lo que
 * sale es lo que dijo Toast o lo que le falta a la función, tal cual.
 */
(() => {
  window.bsToast = async function (accion, params) {
    const S = window.BarStockSupabase;
    if (!S || !S.getClient) {
      console.warn('No encuentro la sesión de la app. ¿Estás en app.barstockpro.com y con la sesión iniciada?');
      return null;
    }
    const { data } = await S.getClient().auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) {
      console.warn('No hay sesión iniciada. Entra en la app y vuelve a probar.');
      return null;
    }

    const r = await fetch('/api/integrations?provider=toast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action: accion || 'ping', params: params || {} })
    });
    let j;
    try { j = await r.json(); }
    catch (e) { j = { ok: false, status: r.status, error: 'La función no devolvió JSON (¿está desplegada?).' }; }

    console.log('%cToast · ' + (accion || 'ping') + (j.ok ? ' · ok' : ' · falló'),
      'font-weight:bold;color:' + (j.ok ? '#16a34a' : '#dc2626'));
    console.log(j);
    return j;
  };
  console.log('Listo. Empieza por:  await bsToast("ping")');
})();
