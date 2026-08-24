(() => {
  if (window.BarStockCycle) return;

  // ── Qué es "este ciclo" ──────────────────────────────────────────────
  //
  // Un ciclo empieza cuando SE PRESIONA "Start new cycle", no cuando
  // cambia el calendario. Esa es la regla, y antes no se cumplía en
  // ninguna de las pantallas que la usaban.
  //
  // Había tres definiciones distintas conviviendo:
  //
  //   order-history-ui.js  lunes a domingo del calendario
  //   focus-stats.js       una copia de lo mismo, con el domingo al reves
  //   orders-cloud.js      weekly_reset_at, la unica correcta
  //
  // Las dos primeras ni siquiera coincidían entre sí: en domingo, una
  // saltaba al lunes siguiente y la otra retrocedía al anterior.
  //
  // El síntoma real: el 23 de agosto, un domingo, se abrió un ciclo
  // nuevo y Order History seguía contando las órdenes del lunes 17 como
  // si fueran del mismo, porque ambas fechas caen en la misma semana de
  // calendario. Siete órdenes donde había tres.
  //
  // Ahora hay una sola fuente: locations.weekly_reset_at. Si adelantas
  // el conteo tres días o te retrasas diez, el ciclo sigue tu acción.

  let _startedAt = null;   // Date | null
  let _loaded = false;
  let _loading = null;

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY, account: c.ACCOUNT_ID, name: c.LOCATION_NAME };
  }

  async function load() {
    // Una sola consulta en vuelo aunque varias pantallas la pidan a la vez
    if (_loading) return _loading;
    _loading = (async () => {
      const { url, key, account, name } = cfg();
      if (!url || !key || !name) return null;
      try {
        const res = await fetch(
          `${url}/rest/v1/locations?account_id=eq.${encodeURIComponent(account)}` +
          `&name=eq.${encodeURIComponent(name)}&select=weekly_reset_at`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } }
        );
        const rows = await res.json();
        const raw = Array.isArray(rows) && rows[0] ? rows[0].weekly_reset_at : null;
        const d = raw ? new Date(raw) : null;
        _startedAt = (d && !isNaN(d.getTime())) ? d : null;
        _loaded = true;
      } catch (e) {
        console.warn('[cycle] no se pudo leer weekly_reset_at', e);
      } finally {
        _loading = null;
      }
      return _startedAt;
    })();
    return _loading;
  }

  function startedAt() { return _startedAt; }
  function isLoaded()  { return _loaded; }

  // ¿Esta fecha pertenece al ciclo abierto?
  //
  // El ciclo no tiene final: va desde el último reset hasta ahora. Poner
  // un tope de siete días recrearía el problema — si te retrasas y
  // colocas una orden el noveno día, sigue siendo de este ciclo hasta
  // que abras el siguiente.
  function contains(dateish) {
    if (!dateish) return false;
    const d = new Date(dateish);
    if (isNaN(d.getTime())) return false;
    // Sin reset registrado no hay con qué separar: todo es del ciclo
    // actual. Es mejor que inventar una frontera de calendario.
    if (!_startedAt) return true;
    return d >= _startedAt;
  }

  // Para el encabezado: "Cycle open · Aug 23"
  function label() {
    if (!_startedAt) return '';
    try {
      return _startedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) { return ''; }
  }

  load();

  window.BarStockCycle = { load, startedAt, contains, label, isLoaded };
})();
