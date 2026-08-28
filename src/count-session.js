(() => {
  if (window.BarStockCountSession) return;

  // ── La sesión de conteo ──────────────────────────────────────────────
  //
  // Lo que se ha contado hasta ahora, mientras se cuenta. NO toca
  // inventory_items: eso pasa solo al cerrar el conteo, en un paso
  // aparte y con respaldo previo.
  //
  // ── Por qué se guarda en el dispositivo ─────────────────────────────
  //
  // Un conteo son 300 artículos y bastante rato. Safari descarta
  // pestañas en segundo plano cuando el teléfono necesita memoria, y en
  // un almacén la señal va y viene. Si la sesión viviera solo en
  // memoria, cualquiera de las dos cosas costaría la tarde entera.
  //
  // localStorage no es elegante, pero sobrevive a que se cierre la
  // pestaña, a que se bloquee el teléfono y a quedarse sin cobertura,
  // que son exactamente los tres casos que hay que aguantar.
  //
  // Va por LOCACIÓN: contar en The Crown y contar en Will's & Bill's son
  // sesiones distintas que no deben mezclarse nunca.
  //
  // ── Cómo se guarda cada artículo ────────────────────────────────────
  //
  //   { sealed: 3, opens: [0.62, 0.30] }
  //
  // Las abiertas van en una lista y no sumadas, a propósito: si alguien
  // se equivoca en la segunda botella, puede borrar esa sin rehacer la
  // primera. Guardado como 0.92 no habría forma de deshacer solo una
  // parte.

  const PREFIX = 'bs_count_';

  let _key = null;
  let _data = null;

  function locationKey() {
    const c = window.BARSTOCK_CONFIG || {};
    return PREFIX + (c.ACCOUNT_ID || 'acc') + '__' + (c.LOCATION_NAME || 'loc');
  }

  function blank() {
    return { startedAt: new Date().toISOString(), items: {} };
  }

  function load() {
    _key = locationKey();
    try {
      const raw = localStorage.getItem(_key);
      _data = raw ? JSON.parse(raw) : blank();
      if (!_data || typeof _data !== 'object' || !_data.items) _data = blank();
    } catch (e) {
      // Un JSON corrupto no puede impedir contar. Se empieza de cero y
      // se avisa por consola, que es lo único que se puede hacer.
      console.warn('conteo: sesion ilegible, se empieza de cero', e);
      _data = blank();
    }
    return _data;
  }

  function save() {
    if (!_key) load();
    try {
      localStorage.setItem(_key, JSON.stringify(_data));
    } catch (e) {
      // Cuota llena o modo privado. No se pierde lo que hay en memoria,
      // pero deja de haber red de seguridad: quien cuenta debe saberlo.
      console.warn('conteo: no se pudo guardar la sesion', e);
      return false;
    }
    return true;
  }

  function data() { if (!_data) load(); return _data; }

  // ── Consultar ────────────────────────────────────────────────────────
  function get(item) {
    const d = data();
    return d.items[item] || null;
  }

  function has(item) { return !!get(item); }

  // Total de un artículo: selladas enteras más la suma de las abiertas.
  function totalFor(item) {
    const e = get(item);
    if (!e) return 0;
    const opens = (e.opens || []).reduce((a, b) => a + (Number(b) || 0), 0);
    return (Number(e.sealed) || 0) + opens;
  }

  function countedItems() { return Object.keys(data().items); }
  function size() { return countedItems().length; }

  function startedAt() { return data().startedAt; }

  // ── Escribir ─────────────────────────────────────────────────────────
  function set(item, sealed, opens) {
    const d = data();
    d.items[item] = {
      sealed: Math.max(0, Number(sealed) || 0),
      opens: (opens || [])
        .map(n => Math.max(0, Math.min(1, Number(n) || 0)))
        // Una abierta a cero es una botella vacía, y una botella vacía no
        // se cuenta: no está.
        .filter(n => n > 0)
    };
    save();
    return d.items[item];
  }

  function remove(item) {
    const d = data();
    delete d.items[item];
    save();
  }

  // Vaciar exige el nombre de la locación como argumento. Es una función
  // que tira el trabajo de una tarde, y quería que no se pudiera llamar
  // por accidente desde la consola ni desde un botón mal cableado.
  function clear(confirmLocationName) {
    const c = window.BARSTOCK_CONFIG || {};
    if (confirmLocationName !== (c.LOCATION_NAME || '')) {
      throw new Error('clear() requiere el nombre de la locación actual');
    }
    _data = blank();
    save();
  }

  // ── Resumen para la pantalla de cierre ──────────────────────────────
  function summary() {
    const master = (window.state && state.master) || [];
    const counted = new Set(countedItems());
    const missing = master.filter(r => !counted.has(r.item));
    return {
      total: master.length,
      counted: counted.size,
      missing: missing.length,
      missingItems: missing.map(r => r.item),
      startedAt: startedAt()
    };
  }

  window.BarStockCountSession = {
    load, save, get, has, set, remove, clear,
    totalFor, countedItems, size, startedAt, summary
  };
})();
