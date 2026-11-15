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

  // La cantidad de una línea, desde To buy (Axel, 2026-11-15: "el Order
  // N, pero se debe poder ajustar"). Quién y cuándo van en status_by /
  // status_at: la última mano que la tocó.
  async function cambiar(id, qty, por) {
    const q = Number(qty);
    if (id == null) return { ok: false, error: 'No line.' };
    if (!isFinite(q) || q <= 0) return { ok: false, error: 'The amount has to be more than zero.' };
    try {
      await pedir('shopping_list?id=eq.' + encodeURIComponent(id), 'PATCH',
        { qty: q, status_by: por ? String(por).slice(0, 80) : null, status_at: new Date().toISOString() });
      avisar();
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  // Cuánto pedir de un producto al ponerlo en la lista: el "Order N" de
  // la app (live-cache.pedir, el mismo del correo), y sin lo que se
  // suele gastar (lo que Toast no vende), hasta el par. Uno como mínimo:
  // si alguien lo pone en la lista, es que hace falta algo. Vivía en la
  // revisión de "Running out"; "Running low" necesita el mismo número.
  function sugerido(r) {
    const LC = window.BarStockLiveCache;
    const p = LC && LC.pedir ? LC.pedir(r) : null;
    if (p != null && p > 0) return p;
    const queda = LC && LC.cuanto ? LC.cuanto(r) : Number(r && r.onHand) || 0;
    return Math.max(1, Math.ceil((Number(r && r.suggested) || 0) - queda));
  }

  // Lo que está por comprar o ya pedido, de la locación abierta.
  async function leer() {
    const loc = await window.BarStockInventoryCloud.fetchLocationId();
    return window.BarStockRest.leerTodo('shopping_list?location_id=eq.' + loc +
      '&status=in.(to_buy,ordered)&select=id,item_name,qty,reason,note,added_by,added_at,status,status_by,status_at,order_ref&order=added_at.asc');
  }

  window.BarStockShoppingList = { anadir, quitar, cambiar, leer, sugerido };
})();
