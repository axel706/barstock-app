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
  //   { passes: [ { sealed: 1, opens: [0.5], at: "…" },
  //               { sealed: 2, opens: [0.7], at: "…" } ] }
  //
  // Una PASADA es un escaneo. El mismo producto aparece en el closet, en
  // la barra y en la cava, y cada sitio es una pasada distinta que se
  // SUMA a las anteriores.
  //
  // Antes esto era un solo `{ sealed, opens }` por artículo y `set()` lo
  // reemplazaba entero. Eso costó un conteo real: 0.5 abierta + 1 sellada
  // en el closet, y al reescanear en la barra el panel abría con esos
  // mismos valores puestos, sin decir que eran memoria. Lo natural fue
  // ajustar el 0.5 a 0.7 —la botella que se tenía delante— y con eso se
  // borró la del closet. Quedó 3.7 donde iban 4.2. Y no falla a gritos:
  // da un número plausible.
  //
  // Guardando las pasadas por separado, lo ya contado deja de ser un
  // campo editable y pasa a ser historia. El panel abre en modo sumar y
  // corregir es un gesto aparte y visible.
  //
  // Las abiertas siguen en lista y no sumadas dentro de cada pasada, por
  // el mismo motivo de siempre: equivocarse en la segunda botella no debe
  // obligar a rehacer la primera. Guardado como 0.92 no habría forma de
  // deshacer solo una parte.

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
      // Si venía del formato viejo, se convierte y se vuelve a escribir
      // ya migrado: así solo se paga una vez y no en cada consulta.
      if (migrar(_data)) {
        try { localStorage.setItem(_key, JSON.stringify(_data)); } catch (e2) {}
      }
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
  //
  // Devuelve la entrada con `sealed` y `opens` YA SUMADOS de todas las
  // pasadas, además de las pasadas en crudo. Los dos primeros existen
  // porque barcode-fix y el cierre los leen así desde antes de que
  // existieran las pasadas, y no tienen por qué enterarse del cambio.
  function get(item) {
    const e = data().items[item];
    if (!e) return null;
    const passes = e.passes || [];
    return {
      passes,
      sealed: passes.reduce((a, p) => a + (Number(p.sealed) || 0), 0),
      opens:  passes.reduce((a, p) => a.concat(p.opens || []), [])
    };
  }

  function passesOf(item) {
    const e = data().items[item];
    return (e && e.passes) || [];
  }

  // ── Del formato viejo al de pasadas ──────────────────────────────────
  //
  // Una sesión a medias en el teléfono está en el formato de antes:
  // `{ sealed, opens }` suelto. Se envuelve como una pasada única, que es
  // exactamente lo que era. Sin esto, actualizar la app en mitad de un
  // conteo lo tiraría a la basura.
  function migrar(d) {
    let tocado = false;
    for (const k of Object.keys(d.items || {})) {
      const e = d.items[k];
      if (!e || Array.isArray(e.passes)) continue;
      d.items[k] = {
        passes: [{
          sealed: Number(e.sealed) || 0,
          opens: Array.isArray(e.opens) ? e.opens.slice() : [],
          at: d.startedAt || new Date().toISOString()
        }]
      };
      tocado = true;
    }
    return tocado;
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

  // ── La señal compartida ──────────────────────────────────────────────
  //
  // El conteo vive en este teléfono, y eso está bien. Lo que no puede
  // vivir solo aquí es el HECHO de que hay uno abierto: el botón del
  // ciclo lo lee de la nube, y con la señal en un único dispositivo, el
  // iPad decía "Start new cycle" y ponía el on hand a cero en mitad del
  // conteo de otra persona.
  //
  // `locations.counting_since` es esa señal. No guarda el conteo, solo
  // que existe y desde cuándo. Se escribe sin esperar respuesta y sin
  // romper nada si falla: quedarse sin red no puede impedir contar.
  function marcarNube(valor) {
    const c = window.BARSTOCK_CONFIG || {};
    if (!c.SUPABASE_URL || !c.SUPABASE_KEY || !c.LOCATION_NAME) return;
    const u = `${c.SUPABASE_URL}/rest/v1/locations` +
      `?account_id=eq.${encodeURIComponent(c.ACCOUNT_ID || '')}` +
      `&name=eq.${encodeURIComponent(c.LOCATION_NAME)}`;
    fetch(u, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: c.SUPABASE_KEY, Authorization: `Bearer ${c.SUPABASE_KEY}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ counting_since: valor })
    })
      // `.catch()` a secas solo ve fallos de RED. Una respuesta 400 —que
      // es lo que devuelve PostgREST si la columna no existe porque la
      // migración no se corrió— llega como respuesta correcta y se caía
      // en el vacío: la señal no se escribía, el botón nunca decía
      // "Counting", y no había ni una línea en consola que lo explicara.
      .then(async (res) => {
        if (res.ok) {
          // El botón del ciclo vive de esta señal. Sin avisarle, se
          // entera la próxima vez que alguien recargue la página.
          window.BarStockWeeklyCycle?.refresh?.();
          return;
        }
        const t = await res.text().catch(() => '');
        console.warn('conteo: la nube rechazo counting_since (' + res.status + ')', t);
        if (/counting_since/.test(t)) {
          console.warn(
            'conteo: falta la columna. Corre la migracion 011:\n' +
            '  alter table public.locations add column if not exists counting_since timestamptz;');
        }
      })
      .catch(e => console.warn('conteo: no se pudo avisar a la nube', e));
  }

  // ── Escribir ─────────────────────────────────────────────────────────
  // Una pasada limpia: selladas no negativas, abiertas entre 0 y 1, y
  // fuera las abiertas en cero — una botella vacía no se cuenta, no está.
  function limpiarPasada(sealed, opens) {
    return {
      sealed: Math.max(0, Number(sealed) || 0),
      opens: (opens || [])
        .map(n => Math.max(0, Math.min(1, Number(n) || 0)))
        .filter(n => n > 0),
      at: new Date().toISOString()
    };
  }

  // Una pasada sin nada dentro no es una pasada. Escanear un producto,
  // mirarlo y no tocar nada no debe dejar rastro ni contarlo como visto.
  function vacia(p) { return !p.sealed && !p.opens.length; }

  // La señal de "hay un conteo en curso" se enciende con el PRIMER
  // artículo, no al abrir el escáner. Abrir la cámara, mirar y salir sin
  // escanear nada no es un conteo, y dejaría el ciclo bloqueado por un
  // gesto que no hizo nada.
  function avisarSiPrimero(d, habia) {
    if (!habia && Object.keys(d.items).length) marcarNube(d.startedAt);
  }

  // ── Sumar una pasada ─────────────────────────────────────────────────
  //
  // Lo que hace el panel al dar Next. NO reemplaza: si el artículo ya
  // tenía pasadas, esta se añade al final y el total sube.
  function addPass(item, sealed, opens) {
    const d = data();
    const habia = !!Object.keys(d.items).length;
    const p = limpiarPasada(sealed, opens);
    if (vacia(p)) return null;

    if (!d.items[item]) d.items[item] = { passes: [] };
    d.items[item].passes.push(p);
    save();
    avisarSiPrimero(d, habia);
    return p;
  }

  // ── Corregir una pasada ──────────────────────────────────────────────
  //
  // El único camino por el que algo ya guardado cambia de valor, y se
  // llega a él a propósito desde la hoja de detalle. Dejarla vacía es
  // borrarla: es lo que significa poner todo a cero.
  function replacePass(item, idx, sealed, opens) {
    const e = data().items[item];
    if (!e || !e.passes[idx]) return false;
    const p = limpiarPasada(sealed, opens);
    if (vacia(p)) return removePass(item, idx);
    e.passes[idx] = p;
    save();
    return true;
  }

  // Borrar la última pasada de un artículo lo devuelve a NO CONTADO, no a
  // cero. No son lo mismo: no contado vuelve a la lista de faltantes del
  // cierre, que es donde tiene que aparecer para que alguien lo mire.
  function removePass(item, idx) {
    const e = data().items[item];
    if (!e || !e.passes[idx]) return false;
    e.passes.splice(idx, 1);
    if (!e.passes.length) delete data().items[item];
    save();
    return true;
  }

  // ── Reemplazar el artículo entero por una sola pasada ────────────────
  //
  // Queda para barcode-fix, que mueve lo contado de un producto a otro y
  // llega con los totales ya sumados en la mano. Es la única llamada que
  // sigue teniendo sentido como reemplazo, y por eso no se borró.
  function set(item, sealed, opens) {
    const d = data();
    const habia = !!Object.keys(d.items).length;
    const p = limpiarPasada(sealed, opens);
    if (vacia(p)) { delete d.items[item]; save(); return null; }
    d.items[item] = { passes: [p] };
    save();
    avisarSiPrimero(d, habia);
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
    // Se apaga la señal compartida: el resto de dispositivos tiene que
    // dejar de ver "contando" en cuanto este conteo deja de existir, sea
    // porque se cerró o porque se descartó.
    marcarNube(null);
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
    passesOf, addPass, replacePass, removePass,
    totalFor, countedItems, size, startedAt, summary,
    pause, resume, isPaused, pausedAt, exists, progress, missingRows
  };
})();
