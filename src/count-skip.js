// ── Saltar el conteo de una semana ("Skip this week") ───────────────
//
// Axel, 2026-11-22: "¿qué pasa cuando una locación NO PUEDE HACER SU
// CONTEO? […] para no dañar el historial, y que aun así puedan ver los
// productos en órdenes". Lámina "Skip this week's count", opción A; lo
// puede quien tiene "Count inventory" (`contar`).
//
// Saltar abre el ciclo de PEDIDOS (locations.weekly_reset_at, lo que
// hace que lo pedido la semana pasada deje de contar como colocado) y
// NO toca el on hand: el último conteo sigue siendo el ancla. Antes la
// única salida era "Start new cycle" + "Start over", que pone todo a 0,
// así que Open pedía el par entero y el LIVE arrancaba de 0.
//
// ── El LIVE no puede moverse con el ciclo ────────────────────────────
//
// El LIVE empieza en lo más nuevo entre el último conteo y el inicio del
// ciclo (toast-usage.ultimoConteo). Un salto mueve el inicio del ciclo
// sin conteo: sin más, el LIVE volvería a empezar en ese instante desde
// el on hand viejo y se olvidaría de la semana vendida. Por eso cada
// salto queda en `count_skips` (migración 047) con el inicio de antes, y
// `ancla()` lo sigue hacia atrás: el LIVE cuenta desde el inicio de
// verdad. Como es una tabla, lo saben todos los teléfonos y el correo
// de la mañana (este archivo va en MODULOS de lib/morning-cron.js).
//
// ── Undo ─────────────────────────────────────────────────────────────
//
// Hasta que sale la primera orden del ciclo saltado (Axel: "undo está
// bien"). Devuelve weekly_reset_at al de antes y marca la fila con
// `undone_at`; no se borra, es historial. Los ajustes a mano de cantidad
// (orderOverride) que el salto vació no vuelven: son de una orden que
// todavía no salió y se rehacen en Open.
//
// Lo que NO hace, a propósito: el paso 2 (on hand ya a 0) no se salta.
// Axel, 2026-11-23: "si se pierde se pierde […] siento que en algún
// momento puede meter ruido en los conteos o el historial". Volver a
// poner el conteo de antes sería otra cosa escribiendo on_hand.
(function () {
  if (window.BarStockCountSkip) return;

  const cfg = () => window.BARSTOCK_CONFIG || {};
  const hdr = (extra) => Object.assign({ apikey: cfg().SUPABASE_KEY, Authorization: 'Bearer ' + cfg().SUPABASE_KEY }, extra || {});
  const t = (x) => { const v = x instanceof Date ? x.getTime() : Date.parse(x || ''); return isFinite(v) ? v : NaN; };

  let _filas = null;      // las de esta locación, de la más nueva a la más vieja
  let _leyendo = null;

  // Sin la tabla (la 047 sin correr) o sin red, lista vacía: sin saltos
  // guardados no hay nada que seguir, y el LIVE se comporta como antes.
  let _de = '';           // la locación de lo leído: cambiar de locación relee
  async function leer(fresco) {
    if (_de !== (cfg().LOCATION_NAME || '')) { _filas = null; _de = cfg().LOCATION_NAME || ''; }
    if (_filas && !fresco) return _filas;
    if (_leyendo) return _leyendo;
    _leyendo = (async () => {
      const c = cfg();
      if (!c.SUPABASE_URL || !c.SUPABASE_KEY || !c.LOCATION_NAME) return (_filas = []);
      try {
        const r = await fetch(c.SUPABASE_URL + '/rest/v1/count_skips?location_name=eq.' + encodeURIComponent(c.LOCATION_NAME) +
          '&select=id,skipped_at,prev_reset_at,skipped_by,undone_at&order=skipped_at.desc&limit=100', { headers: hdr() });
        const filas = await r.json();
        _filas = Array.isArray(filas) ? filas : [];
      } catch (e) {
        console.warn('[saltar] no se pudieron leer los saltos:', e && e.message || e);
        _filas = [];
      }
      return _filas;
    })();
    try { return await _leyendo; } finally { _leyendo = null; }
  }

  const vigentes = (filas) => (filas || []).filter(f => !f.undone_at);
  const deEse = (filas, inicio) => vigentes(filas).find(f => t(f.skipped_at) === t(inicio)) || null;

  // ── Desde dónde cuenta el LIVE ───────────────────────────────────────
  // El inicio del ciclo, o, si lo puso un salto, el que había antes
  // (y así hacia atrás si se saltaron dos semanas seguidas).
  function seguir(filas, inicio) {
    let d = inicio instanceof Date ? inicio : new Date(inicio);
    for (let i = 0; i < 20; i++) {
      const s = deEse(filas, d);
      if (!s) break;
      if (!s.prev_reset_at) return null;
      d = new Date(s.prev_reset_at);
    }
    return d;
  }
  async function ancla(inicio) {
    if (!inicio) return inicio;
    return seguir(await leer(), inicio);
  }

  // ── El inicio de verdad del ciclo, para repartir facturas ────────────
  //
  // Axel, 2026-11-22, en Will's & Bill's: tras saltar, On the shelf pasó
  // de ~$11–12 mil a $15 mil. El reparto factura↔orden (order-receipts)
  // deja que una orden DEL CICLO se quede con una factura de antes de
  // colocarla (la compra de LOOP apuntada después), y "del ciclo" lo
  // decide su inicio. Con el inicio del salto, las órdenes de la semana
  // saltada dejaban de reclamar esas facturas: la orden contaba lo pedido
  // como llegado Y la factura sumaba otra vez como "sin orden". Lo mismo
  // contado dos veces. El reparto, el LIVE y Sent miran desde aquí: el
  // inicio del ciclo seguido hacia atrás por los saltos, el mismo desde
  // el que cuenta el LIVE. Sin saltos, el de siempre.
  async function inicioReal() {
    const C = window.BarStockCycle;
    if (!C) return null;
    if (C.load && !(C.isLoaded && C.isLoaded())) { try { await C.load(); } catch (e) {} }
    const ini = C.startedAt && C.startedAt();
    return ini ? ancla(ini) : ini;
  }
  // Sin esperar, con los saltos ya leídos (si no, el de siempre).
  function inicioRealYa() {
    const C = window.BarStockCycle;
    const ini = C && C.startedAt && C.startedAt();
    if (!ini || !_filas || _de !== (cfg().LOCATION_NAME || '')) return ini;
    return seguir(_filas, ini);
  }

  // El salto que abrió el ciclo de ahora, o null.
  async function actual() {
    const C = window.BarStockCycle;
    if (!C) return null;
    if (C.load && !(C.isLoaded && C.isLoaded())) { try { await C.load(); } catch (e) {} }
    const ini = C.startedAt && C.startedAt();
    return ini ? deEse(await leer(), ini) : null;
  }
  // Lo mismo sin esperar: para pintar. null si aún no se ha leído.
  function actualYa() {
    const C = window.BarStockCycle;
    const ini = C && C.startedAt && C.startedAt();
    if (_de !== (cfg().LOCATION_NAME || '')) return null;
    return ini && _filas ? deEse(_filas, ini) : null;
  }

  // Undo sólo mientras no haya salido ninguna orden del ciclo saltado:
  // después, deshacer movería esas órdenes al ciclo de antes.
  function puedeDeshacer(s) {
    if (!s || !s.prev_reset_at) return false;
    const desde = t(s.skipped_at);
    const hist = (window.state && window.state.orderHistory) || [];
    return !hist.some(o => o && !o.deleted && t(o.createdAt || o.date) >= desde);
  }

  function quien() { const g = window.BarStockGuest; return (g && g.nombre && g.nombre()) || ''; }

  async function trasMover(origen) {
    const O = window.BarStockCycleOpen;
    if (O && O.settle) await O.settle(origen);
    if (typeof window.rebuildPlacedOrdersFromHistory === 'function') {
      try { await window.rebuildPlacedOrdersFromHistory(); } catch (e) { console.warn('[saltar] órdenes colocadas:', e); }
    }
    const E = window.BarStockEvents;
    if (E && E.emit) { E.emit('inventoryUpdated', { source: 'count-skip' }); E.emit('ordersUpdated', { source: 'count-skip' }); }
    if (typeof window.render === 'function') { try { window.render(); } catch (e) {} }
  }

  // ── Saltar ───────────────────────────────────────────────────────────
  // Primero la fila, después el ciclo: si la fila no se puede escribir
  // no se mueve nada (sin ella el LIVE perdería la semana). Si el ciclo
  // falla después, la fila queda apuntando a un inicio que nunca existió
  // y no la sigue nadie.
  async function saltar() {
    const c = cfg();
    const C = window.BarStockCycle, IC = window.BarStockInventoryCloud;
    if (!C || !IC || !IC.touchWeeklyReset) return { ok: false, error: 'The cycle modules are not loaded.' };
    if (C.load && !(C.isLoaded && C.isLoaded())) await C.load();
    const prev = C.startedAt && C.startedAt();
    const ahora = new Date().toISOString();
    let r;
    try {
      r = await fetch(c.SUPABASE_URL + '/rest/v1/count_skips', {
        method: 'POST', headers: hdr({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ location_name: c.LOCATION_NAME, skipped_at: ahora,
          prev_reset_at: prev ? new Date(prev).toISOString() : null, skipped_by: quien() || null })
      });
    } catch (e) { return { ok: false, error: 'Could not reach the server: ' + (e && e.message || e) }; }
    if (!r.ok) return { ok: false, error: (await r.text().catch(() => '')) || ('The server answered ' + r.status) };
    _filas = null;

    try {
      const O = window.BarStockCycleOpen;
      if (O && O.prepare) O.prepare({ resetLocal: false });
      await IC.touchWeeklyReset(ahora);
      // Los ajustes a mano eran de la orden de la semana pasada.
      if (IC.clearAllOrderOverrides) await IC.clearAllOrderOverrides();
      if (window.state && Array.isArray(window.state.master)) {
        window.state.master = window.state.master.map(x => Object.assign({}, x, { orderOverride: '' }));
        if (typeof window.saveState === 'function') window.saveState();
      }
    } catch (e) {
      return { ok: false, error: 'Saved the skip, but the cycle did not open: ' + (e && e.message || e) };
    }
    await leer(true);
    await trasMover('skip');
    return { ok: true };
  }

  // ── Deshacer ─────────────────────────────────────────────────────────
  async function deshacer() {
    const c = cfg();
    const s = await actual();
    if (!s) return { ok: false, error: 'This cycle was not opened by a skip.' };
    if (!puedeDeshacer(s)) return { ok: false, error: 'An order already went out this cycle.' };
    const IC = window.BarStockInventoryCloud;
    try {
      const O = window.BarStockCycleOpen;
      if (O && O.prepare) O.prepare({ resetLocal: false });
      await IC.touchWeeklyReset(new Date(s.prev_reset_at).toISOString());
    } catch (e) { return { ok: false, error: 'The cycle did not go back: ' + (e && e.message || e) }; }
    // El ciclo ya volvió. Si marcar la fila falla, el salto deja de
    // valer igual (su inicio ya no es el del ciclo), y se dice.
    let aviso = '';
    try {
      const r = await fetch(c.SUPABASE_URL + '/rest/v1/count_skips?id=eq.' + encodeURIComponent(s.id), {
        method: 'PATCH', headers: hdr({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ undone_at: new Date().toISOString() })
      });
      if (!r.ok) aviso = await r.text().catch(() => String(r.status));
    } catch (e) { aviso = String(e && e.message || e); }
    await leer(true);
    await trasMover('undo-skip');
    return aviso ? { ok: true, aviso } : { ok: true };
  }

  // Los inicios de ciclo que un salto puso y se deshicieron: no fueron
  // ciclos (mobile-invoices los quita de cycle_periods).
  async function deshechos() {
    return (await leer()).filter(f => f.undone_at).map(f => t(f.skipped_at));
  }

  // ── Con qué se pide en la semana saltada (Axel, 2026-11-23, lámina A)
  //
  // Open pide `par − on hand`, y el on hand es el conteo de la semana
  // pasada: sin más, pediría como si no se hubiera vendido nada. Quien
  // pide elige, con un interruptor arriba de Open:
  //   · 'live'  — par − el LIVE (lo que debería haber hoy). Lo que Toast
  //               no vende va con lo contado. Es lo de entrada.
  //   · 'vacio' — el par entero, como si todo estuviera a 0.
  // La elección es de este teléfono y de ESTE salto (localStorage): es
  // una comodidad de quien pide, no un dato. Sin salto, null: Open pide
  // como siempre. Lo usa getEffectiveOrder (index.html), así que vale
  // para Open, el Home y el escritorio por igual.
  const claveModo = (s) => 'bs-salto-modo:' + (cfg().LOCATION_NAME || '') + ':' + t(s.skipped_at);
  function modo() {
    const s = actualYa();
    if (!s) return null;
    try { return window.localStorage.getItem(claveModo(s)) === 'vacio' ? 'vacio' : 'live'; } catch (e) { return 'live'; }
  }
  function fijarModo(m) {
    const s = actualYa();
    if (!s) return;
    try { window.localStorage.setItem(claveModo(s), m === 'vacio' ? 'vacio' : 'live'); } catch (e) {}
  }
  const LC = () => window.BarStockLiveCache;
  // Lo que se toma por "lo que hay" para pedir. Sin el LIVE leído todavía,
  // lo contado (y Open se repinta al llegar: mobile-orders).
  function base(r) {
    const m = modo();
    if (!m) return null;
    if (m === 'vacio') return 0;
    const L = LC();
    return L && L.listo && L.listo() && L.cuanto ? L.cuanto(r) : Number(r && r.onHand) || 0;
  }
  function aPedir(r) {
    const b = base(r);
    if (b === null) return null;
    if (typeof window.computeToOrder === 'function') return window.computeToOrder(b, r.suggested);
    return Math.max(0, (Number(r.suggested) || 0) - Math.round(b));
  }
  // La línea de cada producto en Open: de dónde sale lo que se pide.
  function deDonde(r) {
    const m = modo();
    if (!m) return '';
    if (m === 'vacio') return 'empty shelf';
    const L = LC();
    const v = L && L.listo && L.listo() && L.vivo ? L.vivo(r) : null;
    return v ? '≈' + v.live.toFixed(1) + ' on the shelf' : 'counted ' + (Number(r && r.onHand) || 0);
  }

  window.BarStockCountSkip = { leer, ancla, inicioReal, inicioRealYa, actual, actualYa, puedeDeshacer, saltar, deshacer, deshechos,
    modo, fijarModo, aPedir, deDonde };
})();
