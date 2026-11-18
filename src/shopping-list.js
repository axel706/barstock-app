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

  // De la lista a la compra (fase 4, Axel 2026-11-15, opción A): las
  // líneas que salieron en una orden pasan a `ordered`, con la orden
  // (`order_ref` = el id de la orden, app_order_id) y la cantidad que se
  // pidió de verdad, que pudo cambiarse en Quick order: decir "4
  // ordered" cuando se pidieron 6 sería mentir. Una petición por línea:
  // son pocas, y cada una lleva su cantidad.
  //   lineas: [{ id, qty }] → { ok, hechas } | { ok: false, error, hechas }
  async function marcarPedidas(lineas, ref, por) {
    const hechas = [];
    const ahora = new Date().toISOString();
    try {
      for (const l of lineas || []) {
        const q = Number(l && l.qty);
        const cambio = { status: 'ordered', order_ref: ref ? String(ref) : null,
          status_by: por ? String(por).slice(0, 80) : null, status_at: ahora };
        if (isFinite(q) && q > 0) cambio.qty = q;
        await pedir('shopping_list?id=eq.' + encodeURIComponent(l.id), 'PATCH', cambio);
        hechas.push(l.id);
      }
      avisar();
      return { ok: true, hechas };
    } catch (e) {
      if (hechas.length) avisar();
      return { ok: false, error: String(e && e.message || e), hechas };
    }
  }

  // Cuánto pedir de un producto al ponerlo en la lista: el "Order N" de
  // la app (live-cache.pedir, el mismo del correo), y sin lo que se
  // suele gastar (lo que Toast no vende), hasta el par. Uno como mínimo:
  // si alguien lo pone en la lista, es que hace falta algo. Vivía en la
  // revisión de "Running out"; "Running low" necesita el mismo número.
  //
  // `quedan` (opcional): lo que alguien acaba de decir que hay ("Running
  // low"). Manda sobre el LIVE en las dos cuentas.
  function sugerido(r, quedan) {
    const LC = window.BarStockLiveCache;
    const dicho = quedan != null && isFinite(Number(quedan));
    const p = LC && LC.pedir ? LC.pedir(r, dicho ? Number(quedan) : undefined) : null;
    // Un 0 de la cuenta ES la respuesta ("alcanza hasta la entrega"):
    // antes se tomaba por "no hay" y caía al par − lo que hay, que no mira
    // lo que llega (Axel, 2026-11-18: 15 y 33 con 24 y 48 en camino). El
    // par sólo vale cuando la cuenta no puede hacerse.
    if (p != null) return p;
    const queda = dicho ? Number(quedan) : LC && LC.cuanto ? LC.cuanto(r) : Number(r && r.onHand) || 0;
    return Math.max(1, Math.ceil((Number(r && r.suggested) || 0) - queda));
  }

  // Lo que está por comprar o ya pedido, de la locación abierta.
  async function leer() {
    const loc = await window.BarStockInventoryCloud.fetchLocationId();
    return window.BarStockRest.leerTodo('shopping_list?location_id=eq.' + loc +
      '&status=in.(to_buy,ordered)&select=id,item_name,qty,reason,note,added_by,added_at,status,status_by,status_at,order_ref&order=added_at.asc');
  }

  // ── Lo pedido, hasta que llega (fase 4) ──────────────────────────────
  //
  // Una línea pedida está pendiente hasta la hora de llegada de SU orden
  // (state.orderHistory, por el id de la orden en order_ref): desde ahí ya
  // está en el LIVE y deja de estar pendiente. No se escribe nada al
  // llegar (el bartender no podría: el candado no le deja cambiar
  // líneas); se calcula al leer. Si la orden no está en lo cargado, deja
  // de estar pendiente a los 8 días: una línea que no se va nunca acaba
  // siendo ruido.
  //
  // Vivía en mobile-to-buy.js y la revisión de Running out leía la lista
  // entera: lo que Axel pidió el domingo y ya había llegado seguía "On
  // the list" en la revisión, sin "Add" para volver a pedirlo, y no se
  // habría ido nunca (2026-11-17). Ahora es una regla para las dos.
  const ESPERA_MAX = 8 * 864e5;
  const ordenDe = (x) => {
    const h = (window.state && window.state.orderHistory) || [];
    return x && x.order_ref ? h.find(o => String(o.id) === String(x.order_ref)) || null : null;
  };
  function llego(x, ahora) {
    const o = ordenDe(x);
    if (o && o.arrivesAt) return new Date(o.arrivesAt).getTime() <= ahora;
    const t = new Date(x.status_at || x.added_at).getTime();
    return !isNaN(t) && ahora - t > ESPERA_MAX;
  }
  // Lo que sigue pendiente: por comprar, o pedido y sin llegar.
  function vigentes(lineas, ahora) {
    const t = ahora == null ? Date.now() : ahora;
    return (lineas || []).filter(x => x && (x.status === 'to_buy' || (x.status === 'ordered' && !llego(x, t))));
  }

  window.BarStockShoppingList = { anadir, quitar, cambiar, marcarPedidas, leer, sugerido, llego, vigentes, ordenDe, ESPERA_MAX };
})();
