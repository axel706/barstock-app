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

  // ── Pausar ───────────────────────────────────────────────────────────
  //
  // Pausar no guarda nada: la sesión ya vivía en el dispositivo y cerrar
  // el escáner nunca perdió un dato. Lo que faltaba era DECIRLO. Un
  // conteo a medias sin marca es indistinguible de uno olvidado, y sin
  // saber cuál es, lo prudente es no tocarlo — así que nadie lo retoma y
  // se acaba recontando todo.
  //
  // `pausedAt` es esa marca. Sirve para que la barra de la pantalla
  // principal pueda decir "pausado hace 40 minutos" en vez de limitarse a
  // "hay algo a medias".
  function pause() {
    const d = data();
    d.pausedAt = new Date().toISOString();
    save();
    return d.pausedAt;
  }

  function resume() {
    const d = data();
    delete d.pausedAt;
    save();
  }

  function isPaused() { return !!data().pausedAt; }
  function pausedAt() { return data().pausedAt || null; }

  // Hay sesión si se contó algo. Una sesión recién creada, sin un solo
  // artículo, no cuenta: ofrecer "retomar" un conteo vacío es ofrecer
  // nada, y ensucia la pantalla principal cada vez que alguien abre el
  // escáner y lo cierra sin escanear.
  function exists() { return size() > 0; }

  // ── Progreso ─────────────────────────────────────────────────────────
  //
  // Lo que necesita la barra de arriba y la hoja del escáner. Es
  // summary() sin la lista de nombres, que en 300 artículos son varios
  // kilobytes que nadie va a mirar mientras escanea.
  function progress() {
    // window.state.master y no state.master: esta funcion la llama la
    // barra de la pantalla principal, que puede correr antes de que el
    // script grande declare la global. Con la forma corta eso era un
    // ReferenceError que se llevaba por delante toda la barra.
    const master = (window.state && window.state.master) || [];
    const counted = size();
    const total = master.length;
    return {
      counted,
      total,
      missing: Math.max(0, total - counted),
      pct: total ? Math.round((counted / total) * 100) : 0,
      startedAt: startedAt(),
      pausedAt: pausedAt()
    };
  }

  // Los artículos que faltan, con su categoría, para poder agruparlos.
  // Sin el nombre concreto, "faltan 177" no le dice a nadie a qué estante
  // volver.
  function missingRows() {
    const master = (window.state && window.state.master) || [];
    const counted = new Set(countedItems());
    return master.filter(r => !counted.has(r.item));
  }

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
    const master = (window.state && window.state.master) || [];
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
    totalFor, countedItems, size, startedAt, summary,
    pause, resume, isPaused, pausedAt, exists, progress, missingRows
  };
})();
