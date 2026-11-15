(() => {
  if (window.BarStockStockChecks) return;

  // ── La verificación: "I have enough" con un número ───────────────────
  //
  // docs/plan-lista-compras.md (Axel, 2026-11-14). "Tengo suficiente" no
  // puede ser un sí o un no: un sí sin número calla el aviso pero deja el
  // LIVE mal en Inventory, el correo y "Order N", y el aviso vuelve al
  // día siguiente. Con el número, el LIVE de ese producto parte de ahí
  // hasta el siguiente conteo (live-stock.calcular, `verificaciones`).
  //
  // Se guarda en stock_checks (migración 042) con lo que decía la app en
  // ese momento: la diferencia es la misma señal que el esperado, a media
  // semana. NUNCA en on_hand, que es lo que se contó en el conteo.

  const cfg = () => window.BARSTOCK_CONFIG || {};

  // { item, n (lo que hay), decia (lo que decía la app), por (quién) }
  // → { ok } o { ok: false, error } con lo que contestó el servidor.
  async function guardar(o) {
    const item = String((o && o.item) || '').trim();
    const n = Number(o && o.n);
    if (!item) return { ok: false, error: 'No item.' };
    if (!isFinite(n) || n < 0) return { ok: false, error: 'The count has to be zero or more.' };
    try {
      const c = cfg();
      const loc = await window.BarStockInventoryCloud.fetchLocationId();
      const r = await fetch(c.SUPABASE_URL + '/rest/v1/stock_checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: c.SUPABASE_KEY, Authorization: 'Bearer ' + c.SUPABASE_KEY,
          Prefer: 'return=minimal' },
        body: JSON.stringify({ location_id: loc, item_name: item, counted: n,
          live_said: o.decia == null || !isFinite(Number(o.decia)) ? null : Number(o.decia),
          checked_by: o.por ? String(o.por).slice(0, 80) : null })
      });
      if (!r.ok) return { ok: false, error: 'HTTP ' + r.status + ': ' + (await r.text()).slice(0, 300) };
      if (window.BarStockEvents && window.BarStockEvents.emit) window.BarStockEvents.emit('stockChecked', { item });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  // Las de la locación abierta desde un instante (el último conteo).
  async function leer(desde) {
    const loc = await window.BarStockInventoryCloud.fetchLocationId();
    return window.BarStockRest.leerTodo('stock_checks?location_id=eq.' + loc +
      '&checked_at=gt.' + encodeURIComponent(new Date(desde).toISOString()) +
      '&select=item_name,counted,live_said,checked_by,checked_at&order=checked_at.asc');
  }

  window.BarStockStockChecks = { guardar, leer };
})();
