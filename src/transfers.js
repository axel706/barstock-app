(() => {
  if (window.BarStockTransfers) return;

  // ── Transfers entre locaciones (docs/plan-transfer.md) ───────────────
  //
  // Axel, 2026-11-18: 12 Triage Vodka de Will's & Bill's a Crown, contadas
  // el domingo, y el lunes la factura de "Internal Transfers" las sumó
  // otra vez al LIVE. Esto es dónde se dice "esto vino de otra locación".
  //
  // Lo decidido (sobre lámina):
  //   · Quien lo registra lo aplica en SU locación al momento; la otra lo
  //     ve sin mover un dedo y sólo confirma ("Confirm") o "Not right".
  //     Hasta confirmar, ahí no cuenta.
  //   · Cada locación pone SU producto (se llaman distinto). La pareja se
  //     recuerda de los transfers pasados entre las dos.
  //   · Sólo con "Make and send orders" (`ordenes`).
  //   · Una fila no se borra: deshacer → 'undone', rechazar → 'rejected'.
  //
  // Aquí sólo los datos: leer, crear, confirmar, rechazar, deshacer, y
  // lo que la pantalla pregunta (qué me toca confirmar, qué cuenta en mi
  // locación, la pareja). Las cuentas del LIVE y de Pour·IQ son la fase 3.

  const cfg = () => window.BARSTOCK_CONFIG || {};
  const cab = (prefer) => {
    const c = cfg();
    return { 'Content-Type': 'application/json', apikey: c.SUPABASE_KEY, Authorization: 'Bearer ' + c.SUPABASE_KEY, Prefer: prefer || 'return=minimal' };
  };
  async function pedir(ruta, metodo, cuerpo, prefer) {
    const r = await fetch(cfg().SUPABASE_URL + '/rest/v1/' + ruta, { method: metodo, headers: cab(prefer), body: JSON.stringify(cuerpo) });
    const t = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 300));
    try { return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }
  const avisar = () => { if (window.BarStockEvents && window.BarStockEvents.emit) window.BarStockEvents.emit('transfersUpdated', {}); };
  const G = () => window.BarStockGuest;
  const puede = () => { const g = G(); return !g || !g.puede || g.puede('ordenes'); };
  const corto = (s, n) => (s == null ? null : String(s).slice(0, n || 80));
  const miLoc = () => window.BarStockInventoryCloud.fetchLocationId();

  // Cuántos días hacia atrás se miran. Un transfer más viejo ya pasó por
  // un conteo: no hay nada que confirmar ni que sumar.
  const DIAS = 60;

  // ── Leer ─────────────────────────────────────────────────────────────
  let _cache = null, _cacheLoc = null, _cacheEn = 0;
  const VIVO_MS = 60 * 1000;
  async function leer(op) {
    const loc = await miLoc();
    if (!(op && op.fresco) && _cache && _cacheLoc === loc && Date.now() - _cacheEn < VIVO_MS) return _cache;
    const desde = new Date(Date.now() - DIAS * 864e5).toISOString();
    const filas = await window.BarStockRest.leerTodo('location_transfers?or=(from_location.eq.' + loc + ',to_location.eq.' + loc + ')' +
      '&moved_at=gte.' + encodeURIComponent(desde) + '&select=*&order=moved_at.desc');
    _cache = filas; _cacheLoc = loc; _cacheEn = Date.now();
    return filas;
  }
  const olvidar = () => { _cache = null; };

  let _locs = null;
  async function locaciones() {
    if (_locs) return _locs;
    const c = cfg();
    _locs = await window.BarStockRest.leerTodo('locations?account_id=eq.' + encodeURIComponent(c.ACCOUNT_ID || '') + '&select=id,name&order=name.asc');
    return _locs;
  }
  const nombreDe = (locs, id) => { const l = (locs || []).find(x => x.id === id); return l ? l.name : 'another location'; };

  // Los productos de otra locación, para elegir el suyo.
  async function productosDe(locId) {
    const f = await window.BarStockRest.leerTodo('inventory_items?location_id=eq.' + locId + '&select=item_name&order=item_name.asc');
    return [...new Set(f.map(x => x.item_name).filter(Boolean))];
  }

  // ── Sin red: lo que pregunta la pantalla ─────────────────────────────
  const entra = (t, loc) => t.to_location === loc;
  const miItem = (t, loc) => (entra(t, loc) ? t.to_item : t.from_item);
  const suItem = (t, loc) => (entra(t, loc) ? t.from_item : t.to_item);
  const otraLoc = (t, loc) => (entra(t, loc) ? t.from_location : t.to_location);
  const loRegistre = (t, loc) => t.started_at === loc;

  // Lo que me toca confirmar: pendiente y registrado por la otra.
  const porConfirmar = (filas, loc) => (filas || []).filter(t => t.status === 'pending' && !loRegistre(t, loc));
  // Lo que cuenta en mi locación: lo que registré yo, o lo confirmado.
  const cuentaAqui = (t, loc) => t.status === 'confirmed' || (t.status === 'pending' && loRegistre(t, loc));

  // La pareja: en el último transfer entre estas dos locaciones donde mi
  // producto era `item` y el suyo estaba puesto, el suyo.
  function pareja(filas, loc, otra, item) {
    const t = (filas || []).find(x => otraLoc(x, loc) === otra && miItem(x, loc) === item && suItem(x, loc));
    return t ? suItem(t, loc) : null;
  }
  // Y al revés, al confirmar: mi producto para el suyo.
  function miPareja(filas, loc, otra, suyo) {
    const t = (filas || []).find(x => otraLoc(x, loc) === otra && suItem(x, loc) === suyo && miItem(x, loc));
    return t ? miItem(t, loc) : null;
  }

  // Se puede deshacer mientras no haya un conteo después de registrarlo.
  function deshacible(t, conteoIso) {
    if (!t || (t.status !== 'pending' && t.status !== 'confirmed')) return false;
    const c = conteoIso ? Date.parse(conteoIso) : NaN;
    return !(c > Date.parse(t.created_at));
  }

  // ── Las cuentas de cada lado (fase 3) ────────────────────────────────
  //
  // Un lado se APLICA cuando el transfer empieza a contar en él: el que lo
  // registra, al registrarlo; el otro, al confirmar. Cada app aplica SU
  // lado (la locación abierta), con su maestro:
  //   · Pour·IQ: ±qty en `ordered` de su semana en inventory_snapshots
  //     (lo que hace "Received" con una entrega: no es consumo). Con
  //     `before_count`, en la semana que cerró el conteo, y su `used` se
  //     rehace (+qty en la que recibe, −qty en la que da: el SQL del
  //     2026-11-18 de Triage Vodka). Si no, en la semana abierta, y `used`
  //     sale al cerrarla.
  //   · La que RECIBE: una orden "TRANSFER" con la misma función que la
  //     Quick order (quick-order.save), que llega a la hora del transfer.
  //     Es lo que se ve en Orders › Sent, a lo que se enlaza la factura
  //     de "Internal Transfers" y lo que suma al LIVE. Sus líneas van sin
  //     proveedor: no cuentan como "pedido colocado" del suyo.
  //   · La que DA: nada que escribir; live-stock resta lo que sale.
  // Deshacer o "Not right" lo quitan del lado que se aplicó.
  //
  // Un fallo aquí no deshace el transfer: se dice qué no se pudo.
  async function ajustarSemana(locId, item, delta, cerrada) {
    if (!item || !delta) return;
    const base = 'inventory_snapshots?location_id=eq.' + locId + '&item_name=eq.' + encodeURIComponent(item);
    const filas = await window.BarStockRest.leerTodo(base + '&on_hand_end=' + (cerrada ? 'not.is.null' : 'is.null') +
      '&select=id,ordered,used,on_hand_end,week_start&order=week_start.desc');
    const f = filas[0];
    if (!f) throw new Error('No week of ' + item + ' to put it in (Pour·IQ).');
    const cambio = { ordered: Math.round(((Number(f.ordered) || 0) + delta) * 100) / 100 };
    if (cerrada && f.used != null) cambio.used = Math.round(((Number(f.used) || 0) + delta) * 100) / 100;
    await pedir('inventory_snapshots?id=eq.' + encodeURIComponent(f.id), 'PATCH', cambio);
  }
  async function borrarOrden(appId) {
    if (!appId) return;
    const q = '?app_order_id=eq.' + encodeURIComponent(appId);
    await pedir('vendor_order_items' + q, 'DELETE');
    await pedir('vendor_orders' + q, 'DELETE');
  }

  // ── Un transfer, varias líneas (migración 046, 2026-11-18) ───────────
  //
  // Cada producto es su fila; las de un mismo transfer comparten
  // `group_id` (las de un producto, y las de antes de la 046, van solas:
  // su grupo es su id). Se registran, se confirman, se rechazan y se
  // deshacen a la vez, y la que recibe tiene UNA orden con todas.
  const grupoDe = (t) => t.group_id || t.id;
  function grupos(filas) {
    const m = new Map();
    for (const t of filas || []) {
      const k = grupoDe(t);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
    return [...m.values()];
  }
  const lista = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  const uuid = () => (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

  // Aplica MI lado de las filas de un grupo.
  async function aplicar(filas, loc) {
    filas = lista(filas);
    const errores = [];
    if (!filas.length) return errores;
    const yoRecibo = filas[0].to_location === loc;
    for (const t of filas) {
      const item = yoRecibo ? t.to_item : t.from_item;
      const qty = Number(t.qty) || 0;
      try { await ajustarSemana(loc, item, yoRecibo ? qty : -qty, !!t.before_count); }
      catch (e) { errores.push('Pour·IQ: ' + (e && e.message || e)); }
    }
    if (yoRecibo) {
      try {
        const Q = window.BarStockQuickOrder;
        if (!Q || !Q.save) throw new Error('orders are not loaded');
        const master = (window.state && window.state.master) || [];
        const locs = await locaciones().catch(() => []);
        const t0 = filas[0];
        const items = filas.map(t => {
          const r = master.find(x => x && x.item === t.to_item) || {};
          return { item: t.to_item, code: r.code || '', value: Number(r.value) || 0, qty: Number(t.qty) || 0 };
        });
        const res = await Q.save({ vendor: 'TRANSFER', when: new Date(t0.moved_at), arrivesAt: t0.moved_at,
          note: 'Transfer from ' + nombreDe(locs, t0.from_location), items });
        const id = res && res.entrada && res.entrada.id;
        if (id) await pedir('location_transfers?id=in.(' + filas.map(t => t.id).join(',') + ')', 'PATCH', { vendor_order_id: String(id) });
      } catch (e) { errores.push('Orders: ' + (e && e.message || e)); }
    }
    return errores;
  }

  // Quita de las filas lo aplicado en `lados` ('from', 'to').
  async function revertir(filas, lados) {
    filas = lista(filas);
    const errores = [];
    for (const t of filas) {
      const qty = Number(t.qty) || 0;
      for (const l of lados) {
        const loc = l === 'to' ? t.to_location : t.from_location;
        const item = l === 'to' ? t.to_item : t.from_item;
        try { await ajustarSemana(loc, item, l === 'to' ? -qty : qty, !!t.before_count); }
        catch (e) { errores.push('Pour·IQ: ' + (e && e.message || e)); }
      }
    }
    if (lados.includes('to')) {
      for (const id of new Set(filas.map(t => t.vendor_order_id).filter(Boolean))) {
        try { await borrarOrden(id); } catch (e) { errores.push('Orders: ' + (e && e.message || e)); }
      }
    }
    if (window.loadOrdersFromCloud) { try { await window.loadOrdersFromCloud(); } catch (e) {} }
    return errores;
  }
  const ladoDe = (t, loc) => (t.to_location === loc ? 'to' : 'from');
  const ladoDeQuienLoRegistro = (t) => (t.started_at === t.to_location ? 'to' : 'from');
  const conAviso = (r, errores) => (errores && errores.length ? Object.assign(r, { aviso: [...new Set(errores)].join(' · ') }) : r);

  // ── Escribir ─────────────────────────────────────────────────────────
  //
  // o = { otra, entra: true|false, lineas: [{ item, otroItem, qty }], antes, conteo, por }
  //   (o, de un producto: item, otroItem y qty sueltos)
  //   entra:  true si llegan a mi locación, false si salen de ella.
  //   antes:  llegaron antes del último conteo (el camino 2): moved_at es
  //           un minuto antes de ese conteo, y no suma al LIVE.
  async function crear(o) {
    if (!puede()) return { ok: false, error: 'Transfers need "Make and send orders".' };
    o = o || {};
    const lineas = (o.lineas || [{ item: o.item, otroItem: o.otroItem, qty: o.qty }])
      .map(l => ({ item: String((l && l.item) || '').trim(), otroItem: l && l.otroItem ? String(l.otroItem).trim() : null, qty: Number(l && l.qty) }));
    if (!lineas.length || lineas.some(l => !l.item)) return { ok: false, error: 'No item.' };
    if (!o.otra) return { ok: false, error: 'Choose the other location.' };
    if (lineas.some(l => !isFinite(l.qty) || l.qty <= 0)) return { ok: false, error: 'The amount has to be more than zero.' };
    let movido = new Date().toISOString();
    if (o.antes) {
      const c = o.conteo ? Date.parse(o.conteo) : NaN;
      if (isNaN(c)) return { ok: false, error: 'There is no count to put it before.' };
      movido = new Date(c - 60000).toISOString();
    }
    try {
      const loc = await miLoc();
      if (o.otra === loc) return { ok: false, error: 'Choose a different location.' };
      const yoEntro = o.entra !== false;
      // Un producto, sin grupo: así entra aunque la 046 no esté corrida.
      const grupo = lineas.length > 1 ? uuid() : null;
      const filas = lineas.map(l => Object.assign({
        account_id: cfg().ACCOUNT_ID || '',
        from_location: yoEntro ? o.otra : loc, to_location: yoEntro ? loc : o.otra,
        from_item: yoEntro ? l.otroItem : l.item, to_item: yoEntro ? l.item : l.otroItem,
        qty: l.qty, moved_at: movido, before_count: !!o.antes, started_at: loc,
        created_by: corto(o.por), note: corto(o.nota, 200)
      }, grupo ? { group_id: grupo } : {}));
      const r = await pedir('location_transfers', 'POST', filas.length > 1 ? filas : filas[0], 'return=representation');
      const hechas = lista(r);
      const errores = hechas.length ? await aplicar(hechas, loc) : [];
      olvidar(); avisar();
      return conAviso({ ok: true, transfer: hechas[0], transfers: hechas }, errores);
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  // Confirmar desde la otra locación las filas de un grupo, cada una con
  // SU producto. `items`: el producto para todas (una), o { id: producto }.
  // Sólo si siguen pendientes: dos teléfonos no lo aplican dos veces.
  async function confirmar(ts, items, por) {
    if (!puede()) return { ok: false, error: 'Confirming needs "Make and send orders".' };
    ts = lista(ts);
    if (!ts.length || !ts[0].id) return { ok: false, error: 'No transfer.' };
    const de = (t) => String((typeof items === 'string' ? items : items && items[t.id]) || '').trim();
    if (ts.some(t => !de(t))) return { ok: false, error: 'Choose your product.' };
    try {
      const loc = await miLoc();
      const hechas = [];
      for (const t of ts) {
        const cambio = { status: 'confirmed', status_by: corto(por), status_at: new Date().toISOString() };
        cambio[entra(t, loc) ? 'to_item' : 'from_item'] = de(t);
        const r = await pedir('location_transfers?id=eq.' + encodeURIComponent(t.id) + '&status=eq.pending', 'PATCH', cambio, 'return=representation');
        if (Array.isArray(r) && r.length) hechas.push(r[0]);
      }
      if (!hechas.length) { olvidar(); avisar(); return { ok: false, error: 'It was already confirmed, undone or marked not right.' }; }
      const errores = await aplicar(hechas, loc);
      olvidar(); avisar();
      return conAviso({ ok: true, transfer: hechas[0], transfers: hechas }, errores);
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  async function rechazar(ts, nota, por) {
    if (!puede()) return { ok: false, error: 'This needs "Make and send orders".' };
    ts = lista(ts);
    if (!ts.length || !ts[0].id) return { ok: false, error: 'No transfer.' };
    try {
      const hechas = [];
      for (const t of ts) {
        const r = await pedir('location_transfers?id=eq.' + encodeURIComponent(t.id) + '&status=eq.pending', 'PATCH',
          { status: 'rejected', status_by: corto(por), status_at: new Date().toISOString(), note: corto(nota, 200) }, 'return=representation');
        if (Array.isArray(r) && r.length) hechas.push(r[0]);
      }
      if (!hechas.length) { olvidar(); avisar(); return { ok: false, error: 'It was already confirmed or undone.' }; }
      // Pendiente, sólo estaba aplicado en quien lo registró: se le quita.
      const errores = await revertir(hechas, [ladoDeQuienLoRegistro(hechas[0])]);
      olvidar(); avisar();
      return conAviso({ ok: true }, errores);
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  async function deshacer(ts, por, conteoIso) {
    if (!puede()) return { ok: false, error: 'This needs "Make and send orders".' };
    ts = lista(ts);
    if (!ts.length || ts.some(t => !deshacible(t, conteoIso))) return { ok: false, error: 'There was a count after it: it can no longer be undone.' };
    // Lo que estaba aplicado se mira ANTES de escribir 'undone': después,
    // el estado ya no dice si llegó a confirmarse.
    const antes = new Map(ts.map(t => [t.id, { confirmado: t.status === 'confirmed', orden: t.vendor_order_id }]));
    try {
      const conf = [], pend = [];
      for (const t of ts) {
        const r = await pedir('location_transfers?id=eq.' + encodeURIComponent(t.id) + '&status=in.(pending,confirmed)', 'PATCH',
          { status: 'undone', status_by: corto(por), status_at: new Date().toISOString() }, 'return=representation');
        if (!Array.isArray(r) || !r.length) continue;
        const a = antes.get(t.id);
        const fila = Object.assign({}, r[0], { vendor_order_id: r[0].vendor_order_id || a.orden });
        (a.confirmado ? conf : pend).push(fila);
      }
      if (!conf.length && !pend.length) { olvidar(); avisar(); return { ok: false, error: 'It was already undone or marked not right.' }; }
      // Confirmado: aplicado en los dos lados; pendiente, sólo en quien lo
      // registró.
      const errores = (conf.length ? await revertir(conf, ['from', 'to']) : [])
        .concat(pend.length ? await revertir(pend, [ladoDeQuienLoRegistro(pend[0])]) : []);
      olvidar(); avisar();
      return conAviso({ ok: true }, errores);
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  window.BarStockTransfers = {
    leer, olvidar, locaciones, productosDe, nombreDe, crear, confirmar, rechazar, deshacer, aplicar, revertir, ajustarSemana, ladoDe,
    grupos, grupoDe,
    entra, miItem, suItem, otraLoc, loRegistre, porConfirmar, cuentaAqui, pareja, miPareja, deshacible, puede, DIAS
  };
})();
