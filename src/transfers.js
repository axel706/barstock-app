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

  // ── Escribir ─────────────────────────────────────────────────────────
  //
  // o = { otra, entra: true|false, item, otroItem, qty, antes, conteo, por }
  //   entra:  true si llegan a mi locación, false si salen de ella.
  //   antes:  llegaron antes del último conteo (el camino 2): moved_at es
  //           un minuto antes de ese conteo, y no suma al LIVE.
  async function crear(o) {
    if (!puede()) return { ok: false, error: 'Transfers need "Make and send orders".' };
    const item = String((o && o.item) || '').trim();
    const qty = Number(o && o.qty);
    if (!item) return { ok: false, error: 'No item.' };
    if (!o.otra) return { ok: false, error: 'Choose the other location.' };
    if (!isFinite(qty) || qty <= 0) return { ok: false, error: 'The amount has to be more than zero.' };
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
      const otroItem = o.otroItem ? String(o.otroItem).trim() : null;
      const fila = {
        account_id: cfg().ACCOUNT_ID || '',
        from_location: yoEntro ? o.otra : loc, to_location: yoEntro ? loc : o.otra,
        from_item: yoEntro ? otroItem : item, to_item: yoEntro ? item : otroItem,
        qty, moved_at: movido, before_count: !!o.antes, started_at: loc,
        created_by: corto(o.por), note: corto(o.nota, 200)
      };
      const r = await pedir('location_transfers', 'POST', fila, 'return=representation');
      olvidar(); avisar();
      return { ok: true, transfer: Array.isArray(r) ? r[0] : r };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  // Confirmar desde la otra locación, con SU producto. Sólo si sigue
  // pendiente: dos teléfonos confirmando a la vez no lo hacen dos veces.
  async function confirmar(t, item, por) {
    if (!puede()) return { ok: false, error: 'Confirming needs "Make and send orders".' };
    const mio = String(item || '').trim();
    if (!t || !t.id) return { ok: false, error: 'No transfer.' };
    if (!mio) return { ok: false, error: 'Choose your product.' };
    try {
      const loc = await miLoc();
      const cambio = { status: 'confirmed', status_by: corto(por), status_at: new Date().toISOString() };
      cambio[entra(t, loc) ? 'to_item' : 'from_item'] = mio;
      const r = await pedir('location_transfers?id=eq.' + encodeURIComponent(t.id) + '&status=eq.pending', 'PATCH', cambio, 'return=representation');
      olvidar(); avisar();
      if (!Array.isArray(r) || !r.length) return { ok: false, error: 'It was already confirmed, undone or marked not right.' };
      return { ok: true, transfer: r[0] };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  async function rechazar(t, nota, por) {
    if (!puede()) return { ok: false, error: 'This needs "Make and send orders".' };
    if (!t || !t.id) return { ok: false, error: 'No transfer.' };
    try {
      const r = await pedir('location_transfers?id=eq.' + encodeURIComponent(t.id) + '&status=eq.pending', 'PATCH',
        { status: 'rejected', status_by: corto(por), status_at: new Date().toISOString(), note: corto(nota, 200) }, 'return=representation');
      olvidar(); avisar();
      if (!Array.isArray(r) || !r.length) return { ok: false, error: 'It was already confirmed or undone.' };
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  async function deshacer(t, por, conteoIso) {
    if (!puede()) return { ok: false, error: 'This needs "Make and send orders".' };
    if (!deshacible(t, conteoIso)) return { ok: false, error: 'There was a count after it: it can no longer be undone.' };
    try {
      await pedir('location_transfers?id=eq.' + encodeURIComponent(t.id) + '&status=in.(pending,confirmed)', 'PATCH',
        { status: 'undone', status_by: corto(por), status_at: new Date().toISOString() });
      olvidar(); avisar();
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  window.BarStockTransfers = {
    leer, olvidar, locaciones, productosDe, nombreDe, crear, confirmar, rechazar, deshacer,
    entra, miItem, suItem, otraLoc, loRegistre, porConfirmar, cuentaAqui, pareja, miPareja, deshacible, puede, DIAS
  };
})();
