(() => {
  if (window.BarStockShoppingList) return;

  // ── La lista de compras, compartida por locación ─────────────────────
  //
  // docs/plan-lista-compras.md (Axel, 2026-11-14). Todos los managers ven
  // la misma: quién añadió cada cosa, cuánto y por qué. Vive en
  // shopping_list (migración 043). Quitar NO borra: pasa la fila a
  // `removed`, con quién y cuándo, para que un "Undo" no haga
  // desaparecer la historia.

  const cfg = () => window.BARSTOCK_CONFIG || {};
  const cab = (prefer) => {
    const c = cfg();
    return { 'Content-Type': 'application/json', apikey: c.SUPABASE_KEY, Authorization: 'Bearer ' + c.SUPABASE_KEY, Prefer: prefer || 'return=minimal' };
  };
  // Dice lo que contestó el servidor, tal cual: un mensaje que adivina
  // manda a buscar la causa donde no está.
  async function pedir(ruta, metodo, cuerpo) {
    const r = await fetch(cfg().SUPABASE_URL + '/rest/v1/' + ruta, { method: metodo, headers: cab(), body: JSON.stringify(cuerpo) });
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + (await r.text()).slice(0, 300));
  }
  const avisar = () => { if (window.BarStockEvents && window.BarStockEvents.emit) window.BarStockEvents.emit('shoppingListUpdated', {}); };

  // { item, qty, motivo ('app' | 'person'), por, nota } → { ok } | { ok: false, error }
  async function anadir(o) {
    const item = String((o && o.item) || '').trim();
    const qty = Number(o && o.qty);
    if (!item) return { ok: false, error: 'No item.' };
    if (!isFinite(qty) || qty <= 0) return { ok: false, error: 'The amount has to be more than zero.' };
    try {
      const loc = await window.BarStockInventoryCloud.fetchLocationId();
      await pedir('shopping_list', 'POST', { location_id: loc, item_name: item, qty,
        reason: o.motivo === 'person' ? 'person' : 'app', note: o.nota ? String(o.nota).slice(0, 200) : null,
        added_by: o.por ? String(o.por).slice(0, 80) : null });
      avisar();
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  async function quitar(id, por) {
    if (id == null) return { ok: false, error: 'No line.' };
    try {
      await pedir('shopping_list?id=eq.' + encodeURIComponent(id), 'PATCH',
        { status: 'removed', status_by: por ? String(por).slice(0, 80) : null, status_at: new Date().toISOString() });
      avisar();
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  // Lo que está por comprar o ya pedido, de la locación abierta.
  async function leer() {
    const loc = await window.BarStockInventoryCloud.fetchLocationId();
    return window.BarStockRest.leerTodo('shopping_list?location_id=eq.' + loc +
      '&status=in.(to_buy,ordered)&select=id,item_name,qty,reason,added_by,added_at,status&order=added_at.asc');
  }

  window.BarStockShoppingList = { anadir, quitar, leer };
})();
