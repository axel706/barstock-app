(() => {
  if (window.BarStockTheoreticalUsage) return;

  function getConfig() {
    const config = window.BARSTOCK_CONFIG || {};
    return {
      url: config.SUPABASE_URL,
      key: config.SUPABASE_KEY,
      locationName: config.LOCATION_NAME || 'The Crown Tavern'
    };
  }

  async function fetchLocationId() {
    const { url, key, locationName } = getConfig();
    const res = await fetch(
      `${url}/rest/v1/locations?name=eq.${encodeURIComponent(locationName)}&select=id`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    const data = await res.json();
    if (!data?.length) throw new Error('Location not found: ' + locationName);
    return data[0].id;
  }

  let _currentWeek = null;
  let _weeks = [];
  let _salesData = new Map(); // week_start -> Map(item_name -> sold)
  let _sortMode = 'variance'; // 'loss' or 'variance'
  let _vendorFilter = 'ALL';
  let _exclusions = new Set(); // 'item_name' keys for current week
  let _reportMode = false;
  let _itemComments = new Map(); // item_name -> comment string
  let _customNotes = ''; // free text notes for current week

  // ─── Load weeks ──────────────────────────────────────────────────
  // ─── Paginacion ──────────────────────────────────────────────────
  //
  // Supabase corta TODA respuesta en 1000 filas, y inventory_snapshots
  // guarda una fila por articulo por semana. Con 258 articulos eso son
  // 3.9 semanas: por eso Usage mostraba 4 ciclos habiendo 9.
  //
  // Lo peor no era el corte sino que se encogia solo. Cada producto
  // nuevo en el maestro quitaba historia sin avisar — con 150 articulos
  // se veian 6 semanas, con 258 se ven menos de 4.
  //
  // El orden se recibe como parametro porque no todas las consultas lo
  // usan igual: loadPrevWeekDetail DEPENDE de que venga por semana
  // descendente para quedarse con el registro mas reciente de cada
  // articulo. Y siempre se ordena por una clave unica por fila, o al
  // paginar se repiten o se saltan registros entre paginas.
  async function fetchAllSnapshots(baseUrl, order) {
    const { key } = getConfig();
    const PAGE = 1000;
    const MAX_PAGES = 50;
    const out = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const sep = baseUrl.includes('?') ? '&' : '?';
      const res = await fetch(
        `${baseUrl}${sep}order=${order}&limit=${PAGE}&offset=${page * PAGE}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const rows = await res.json();
      if (!Array.isArray(rows)) break;
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }

  // ─── Ciclo abierto contra ciclo cerrado ──────────────────────────
  //
  // runCycle() hace dos cosas al importar un conteo: CIERRA la semana
  // anterior —le escribe on_hand_end y used— y ABRE una nueva con
  // used en null. Asi que la semana mas reciente NUNCA tiene datos:
  // es la que esta corriendo ahora mismo.
  //
  // Por eso cada semana lleva `hasUsage`. Cualquier vista que quiera
  // "el ultimo ciclo" quiere el ultimo con hasUsage, no el primero de
  // la lista.
  async function loadWeeks() {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    // El orden aqui da igual: se agrupa en un Map y se ordena abajo.
    const rows = await fetchAllSnapshots(
      `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&select=week_start,is_event_week,used`,
      'id.asc'
    );
    const weekMap = new Map();
    for (const r of rows || []) {
      if (!weekMap.has(r.week_start)) {
        weekMap.set(r.week_start, { week_start: r.week_start, is_event_week: r.is_event_week, itemCount: 0, hasUsage: false });
      }
      weekMap.get(r.week_start).itemCount++;
      if (r.used !== null && r.used !== undefined) weekMap.get(r.week_start).hasUsage = true;
    }
    _weeks = Array.from(weekMap.values()).sort((a, b) => b.week_start.localeCompare(a.week_start));
    return _weeks;
  }

  // ─── Load week detail ─────────────────────────────────────────────
  async function loadWeekDetail(weekStart) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    // Una sola semana son ~258 filas hoy, por debajo del corte. Se pagina
    // igual: el dia que el maestro pase de 1000 articulos, esto se
    // truncaria en silencio y los numeros saldrian mal sin sintoma.
    return await fetchAllSnapshots(
      `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=eq.${weekStart}&select=*`,
      'item_name.asc'
    );
  }

  async function loadPrevWeekDetail(weekStart) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      // Antes pedia 500 filas fijas. Con 258 articulos eso cubria menos
      // de dos semanas, asi que un producto que no se conto la semana
      // pasada se quedaba sin valor previo — y no habia aviso, la
      // comparacion simplemente no aparecia.
      //
      // El orden lleva item_name como segunda clave para que sea unico
      // por fila; con solo week_start.desc, dos filas de la misma semana
      // pueden intercambiarse entre paginas y perderse.
      const all = await fetchAllSnapshots(
        `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=lt.${weekStart}&used=not.is.null&select=item_name,used`,
        'week_start.desc,item_name.asc'
      );
      // Keep only the most recent week's data per item
      const seen = new Set();
      const result = [];
      for (const r of all || []) {
        if (!seen.has(r.item_name)) { seen.add(r.item_name); result.push(r); }
      }
      return result;
    } catch(e) { return []; }
  }

  // ─── Semana de evento ────────────────────────────────────────────
  //
  // No es una etiqueta decorativa. `par-intelligence` filtra
  // `is_event_week=eq.false` en tres consultas al calcular los pares: una
  // Nochevieja contada como una semana normal sube el par de medio bar
  // durante meses.
  //
  // Recibe la semana como argumento en vez de leer la que hubiera abierta
  // en la pantalla. La pantalla que la llamaba ya no existe, y una
  // función que escribe en la base según una variable global de otro
  // módulo es una que acaba marcando la semana equivocada.
  async function setEventWeek(weekStart, value) {
    if (!weekStart) return false;
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    const val = !!value;
    const res = await fetch(
      `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=eq.${weekStart}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
        body: JSON.stringify({ is_event_week: val })
      }
    );
    // La lista en memoria se actualiza aquí para que quien haya pintado
    // la lista de ciclos no tenga que volver a pedirla entera.
    const w = _weeks.find(x => x.week_start === weekStart);
    if (w) w.is_event_week = val;
    return res.ok;
  }

  function isEventWeek(weekStart) {
    const w = _weeks.find(x => x.week_start === weekStart);
    return !!(w && w.is_event_week);
  }

  // ─── Parse sales CSV ─────────────────────────────────────────────
  function parseCsvRow(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  function parseSalesCsv(text) {
    // Strip BOM if present
    const clean = text.replace(/^\uFEFF/, '');
    const lines = clean.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return new Map();
    const headers = parseCsvRow(lines[0]).map(h => h.toUpperCase().replace(/['"]/g, ''));
    const itemIdx = headers.findIndex(h => h === 'PRODUCT' || h.includes('ITEM') || h === 'NAME');
    const soldIdx = headers.findIndex(h => h === 'SOLD UNITS' || h === 'SOLD' || h.includes('SOLD'));
    const categoryIdx = headers.findIndex(h => h === 'CATEGORY');
    if (itemIdx === -1 || soldIdx === -1) throw new Error('CSV must have Product and Sold Units columns.');
    const result = new Map();
    for (const line of lines.slice(1)) {
      const cols = parseCsvRow(line);
      // Skip Bar Consumables
      if (categoryIdx >= 0 && (cols[categoryIdx] || '').toUpperCase().includes('BAR CONSUMABLE')) continue;
      const item = (cols[itemIdx] || '').replace(/['"]/g, '').trim();
      const sold = Math.round(parseFloat(cols[soldIdx] || 0) * 100) / 100;
      if (item && sold >= 0) result.set(item.toUpperCase(), sold);
    }
    return result;
  }

  // ─── Escapar para un atributo HTML ────────────────────────────────
  //
  // Los nombres viajaban DENTRO de un onclick: onclick="fn('Tito&#39;s')".
  // El navegador decodifica la entidad antes de interpretar el JS, así
  // que ejecutaba fn('Tito's') y lanzaba un error de sintaxis: cualquier
  // producto con apóstrofo tenía sus botones muertos. Y la otra variante
  // del proyecto, .replace(/'/g,"\'"), no escapaba nada en absoluto:
  // "\'" es solo una comilla.
  //
  // Ahora el nombre va en un data-* y el handler lo lee de this.dataset.
  // Ahí el escapado sí funciona y no hay dos capas de intérprete.

  function normItem(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim(); }

  // ─── De dónde salen las ventas de un artículo ─────────────────────
  //
  // Tres orígenes, en orden de autoridad. El primero que responde gana:
  //
  //   1. override  — alguien escribió la cifra a mano para esta semana
  //   2. alias     — alguien dijo qué línea(s) del POS son este artículo
  //   3. fichero   — emparejado por nombre, exacto y luego aproximado
  //
  // El orden importa y no es arbitrario: una persona que mira un ticket
  // sabe más que un fichero, y un enlace declarado a mano sabe más que
  // adivinar por parecido de texto.
  //
  // El emparejado aproximado se queda EL ÚLTIMO y a propósito: "Aviary
  // Cabernet Sauvignon 2021" contra una línea "CABERNET" da positivo y
  // manda las ventas de otro vino a este. Sigue ahí porque acierta la
  // mayoría de las veces y quitarlo dejaría medio inventario sin datos,
  // pero cualquier cosa declarada explícitamente pasa por delante.
  //
  // Devuelve { sold, src } y no un número suelto: la pantalla necesita
  // poder decir de dónde salió la cifra. Un número corregido a mano que
  // parece importado es exactamente el tipo de cosa que hace desconfiar
  // de un informe entero.
  //
  // `keys` son las líneas del fichero que este artículo se ha llevado.
  // Sin eso no se puede saber qué líneas quedan libres, que es justo lo
  // que hay que enseñar para poder enlazar una.
  function soldFor(itemName, salesMap, aliases, overrides) {
    if (overrides && overrides.has(itemName)) {
      return { sold: Number(overrides.get(itemName).sold), src: 'manual', keys: [] };
    }

    // Varias líneas del POS pueden apuntar al mismo artículo —el mismo
    // vino por copa y por botella— y entonces se SUMAN. Quedarse con la
    // primera perdería la mitad de las ventas sin decir nada.
    if (aliases && aliases.has(itemName)) {
      let total = 0; const keys = [];
      for (const pos of aliases.get(itemName)) {
        if (salesMap.has(pos)) { total += Number(salesMap.get(pos)) || 0; keys.push(pos); }
      }
      // Con enlaces declarados pero ninguno presente en el fichero, la
      // respuesta correcta es cero ventas, no "sin datos": sabemos qué
      // buscar y no está, así que no se vendió.
      if (aliases.get(itemName).length) {
        return { sold: total, src: keys.length ? 'alias' : 'alias-empty', keys };
      }
    }

    const norm = normItem(itemName);
    if (salesMap.has(norm)) return { sold: salesMap.get(norm), src: 'exact', keys: [norm] };
    for (const [k, v] of salesMap) {
      if (norm.includes(k) || k.includes(norm)) return { sold: v, src: 'fuzzy', keys: [k] };
    }
    return { sold: null, src: 'none', keys: [] };
  }

  // ─── Qué líneas del fichero no se ha llevado nadie ────────────────
  //
  // Son las candidatas a enlazar. Si un vino no aparece en el informe,
  // su venta está casi siempre en esta lista, con otro nombre.
  //
  // Se marcan también las que reclama más de un artículo: eso solo pasa
  // con el emparejado aproximado y significa que una de las dos cifras
  // está mal.
  async function salesLines(weekStart) {
    if (!_salesData.has(weekStart)) {
      _salesData.set(weekStart, await loadSalesFromSupabase(weekStart));
    }
    const salesMap = _salesData.get(weekStart) || new Map();
    if (_aliasWeek !== weekStart) {
      const c = await loadCorrections(weekStart);
      _aliases = c.aliases; _overrides = c.overrides; _aliasWeek = weekStart;
    }

    const master = (window.state && window.state.master) || [];
    const takenBy = new Map();     // pos_name -> [item, ...]
    for (const m of master) {
      if (!m.item) continue;
      const s = soldFor(m.item, salesMap, _aliases, _overrides);
      for (const k of s.keys) {
        if (!takenBy.has(k)) takenBy.set(k, []);
        takenBy.get(k).push(m.item);
      }
    }

    const out = [];
    for (const [pos, sold] of salesMap) {
      const by = takenBy.get(pos) || [];
      out.push({ pos, sold: Number(sold) || 0, takenBy: by, free: by.length === 0 });
    }
    // Las libres primero, y dentro de cada grupo las de más ventas: una
    // línea con 40 unidades sin dueño es mucho más urgente que una de 0.5.
    return out.sort((a, b) => (a.free === b.free) ? b.sold - a.sold : (a.free ? -1 : 1));
  }

  // ─── Correcciones guardadas ───────────────────────────────────────
  //
  // Caché de una sola semana: los alias y los números escritos a mano del
  // ciclo que se esté calculando. `_aliasWeek` recuerda de cuál son, y
  // cada guardado la pone a null para que el siguiente cálculo vuelva a
  // pedirlos. Sin eso, corregir una venta no cambiaría nada en pantalla
  // hasta recargar la página.
  let _aliases = new Map();     // item_name -> [pos_name, ...]
  let _overrides = new Map();   // item_name -> { sold, reason }
  let _aliasWeek = null;

  async function loadCorrections(weekStart) {
    const { url, key } = getConfig();
    const out = { aliases: new Map(), overrides: new Map() };
    try {
      const locationId = await fetchLocationId();
      const [ar, or_] = await Promise.all([
        fetch(`${url}/rest/v1/sales_aliases?location_id=eq.${locationId}&select=pos_name,item_name`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } }),
        fetch(`${url}/rest/v1/sales_overrides?location_id=eq.${locationId}&week_start=eq.${weekStart}&select=item_name,sold,reason`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } })
      ]);
      for (const r of (await ar.json()) || []) {
        if (!out.aliases.has(r.item_name)) out.aliases.set(r.item_name, []);
        out.aliases.get(r.item_name).push(r.pos_name);
      }
      for (const r of (await or_.json()) || []) {
        out.overrides.set(r.item_name, { sold: Number(r.sold), reason: r.reason || '' });
      }
    } catch (err) {
      // Sin correcciones se sigue calculando como antes. Que falle la
      // nube no debe dejar la pantalla en blanco.
      console.warn('[TheoreticalUsage] loadCorrections failed:', err);
    }
    return out;
  }

  // ─── Guardar correcciones ─────────────────────────────────────────
  async function saveAlias(itemName, posName) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    await fetch(`${url}/rest/v1/sales_aliases?on_conflict=location_id,pos_name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`,
                 Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ location_id: locationId, pos_name: normItem(posName), item_name: itemName })
    });
    _aliasWeek = null;   // invalidar la caché
  }

  async function removeAlias(posName) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    await fetch(`${url}/rest/v1/sales_aliases?location_id=eq.${locationId}&pos_name=eq.${encodeURIComponent(normItem(posName))}`,
      { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` } });
    _aliasWeek = null;
  }

  async function saveOverride(weekStart, itemName, sold, reason) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    await fetch(`${url}/rest/v1/sales_overrides?on_conflict=location_id,week_start,item_name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`,
                 Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        location_id: locationId, week_start: weekStart, item_name: itemName,
        sold: Number(sold), reason: reason || '', updated_at: new Date().toISOString()
      })
    });
    _aliasWeek = null;
  }

  // ─── Corregir el conteo de cierre ─────────────────────────────────
  //
  // El caso real: al contar se saltaron unos artículos que sí estaban en
  // la estantería. No es que el poured esté mal por sí mismo — es que el
  // conteo lo está, y el poured es una resta que lo arrastra.
  //
  //   poured = stock inicial + recibido − stock final
  //
  // Subir el stock final baja el poured. Y ese mismo número es el stock
  // inicial de la semana siguiente y el on-hand que se ve hoy. Escribirlo
  // en un solo sitio dejaría la app con dos verdades, que es exactamente
  // lo que ya pasaba con el lápiz antiguo: ajustaba el cierre y solo lo
  // veían Usage y Consumption Match.
  //
  // Aquí se escribe en los cuatro sitios, en este orden:
  //
  //   1. el ciclo corregido      on_hand_end_adjusted + used
  //   2. el ciclo siguiente      on_hand_start (y su used, si ya cerró)
  //   3. el inventario vivo      solo si el siguiente es el ciclo abierto
  //   4. count_corrections       lo contado, lo real y el motivo
  //
  // `on_hand_end` NO se toca: guarda lo que dijo el conteo. La diferencia
  // entre las dos columnas es la medida de cuánto fiarse de esa semana.
  async function savePourFix(weekStart, itemName, code, actualEnd, reason) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    const val = Number(actualEnd);
    const out = { used: null, prevUsed: null, stock: null, live: false, nextWeek: null };

    // ── 1. El ciclo corregido ──
    const r0 = await fetch(
      `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=eq.${weekStart}` +
      `&item_name=eq.${encodeURIComponent(itemName)}&select=id,on_hand_start,ordered,on_hand_end,on_hand_end_adjusted,used`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const snaps = await r0.json();
    if (!snaps?.length) throw new Error('That item has no snapshot for this cycle.');
    const s = snaps[0];

    const newUsed = Number(s.on_hand_start || 0) + Number(s.ordered || 0) - val;
    out.prevUsed = s.on_hand_end_adjusted !== null && s.on_hand_end_adjusted !== undefined
      ? Number(s.on_hand_start || 0) + Number(s.ordered || 0) - Number(s.on_hand_end_adjusted)
      : (s.used !== null ? Number(s.used) : null);
    out.used = newUsed;

    await fetch(`${url}/rest/v1/inventory_snapshots?id=eq.${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
      body: JSON.stringify({ on_hand_end_adjusted: val, used: newUsed })
    });

    // ── 2. El ciclo siguiente ──
    //
    // Solo el inmediatamente posterior. Si hubiera más ciclos cerrados
    // después, sus restas también cambiarían en cascada; la interfaz
    // avisa de eso antes de guardar en vez de reescribir meses de
    // histórico sin que nadie lo haya pedido.
    const rn = await fetch(
      `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=gt.${weekStart}` +
      `&item_name=eq.${encodeURIComponent(itemName)}&select=id,week_start,on_hand_start,ordered,on_hand_end,on_hand_end_adjusted,used` +
      `&order=week_start.asc&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const nexts = await rn.json();

    if (nexts?.length) {
      const n = nexts[0];
      out.nextWeek = n.week_start;
      const patch = { on_hand_start: val };

      // Si ese ciclo ya cerró, su propia resta cambia. Si sigue abierto,
      // used es null y así se queda: se calculará al cerrarlo.
      const nEnd = n.on_hand_end_adjusted !== null && n.on_hand_end_adjusted !== undefined
        ? Number(n.on_hand_end_adjusted) : (n.on_hand_end !== null ? Number(n.on_hand_end) : null);
      if (nEnd !== null) patch.used = val + Number(n.ordered || 0) - nEnd;

      await fetch(`${url}/rest/v1/inventory_snapshots?id=eq.${n.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
        body: JSON.stringify(patch)
      });

      // ── 3. El inventario vivo ──
      //
      // Solo si el ciclo siguiente es el que está corriendo: entonces su
      // stock inicial es literalmente el on-hand de hoy. Si el ajuste es
      // de hace tres meses, el stock actual no tiene nada que ver.
      const openWeek = window.BarStockParIntelligence?.getEffectiveWeekStart?.();
      if (nEnd === null && openWeek && n.week_start === openWeek) {
        out.live = true;
        out.stock = val;
        await applyLiveStock(itemName, code, val);
      }
    }

    // ── 4. El registro ──
    await fetch(`${url}/rest/v1/count_corrections?on_conflict=location_id,week_start,item_name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`,
                 Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        location_id: locationId, week_start: weekStart, item_name: itemName,
        counted: s.on_hand_end, actual: val, reason: reason || '',
        updated_at: new Date().toISOString()
      })
    });

    _aliasWeek = null;   // invalidar la caché de correcciones
    return out;
  }

  // El on-hand vivo se escribe por la MISMA ruta que la edición manual de
  // Inventory —nube, estado local, repintado— para que no haya dos formas
  // de mover el mismo número con resultados distintos.
  async function applyLiveStock(itemName, code, val) {
    const master = (window.state && window.state.master) || [];
    const i = master.findIndex(m => m.item === itemName);
    if (i < 0) return;
    const row = master[i];

    if (window.BarStockInventoryCloud?.patchInventoryItem) {
      await window.BarStockInventoryCloud.patchInventoryItem({
        oldCode: row.code, oldItem: row.item,
        code: row.code, item: row.item, vendor: row.vendor,
        onHand: val, suggested: row.suggested, value: row.value
      });
    }
    row.onHand = val;
    if (typeof window.saveState === 'function') window.saveState();
    if (typeof window.render === 'function') window.render();
    // La portada lee de parAdjustments, que se reconstruye aparte.
    window.BarStockFocusStats?.refresh?.();
  }

  // Qué pasaría si se guardara. Lo usa el diálogo para enseñarlo ANTES.
  async function previewPourFix(weekStart, itemName, actualEnd) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    const val = Number(actualEnd);

    const [r0, rn] = await Promise.all([
      fetch(`${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=eq.${weekStart}` +
            `&item_name=eq.${encodeURIComponent(itemName)}&select=on_hand_start,ordered,on_hand_end,on_hand_end_adjusted,used`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }),
      fetch(`${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=gt.${weekStart}` +
            `&item_name=eq.${encodeURIComponent(itemName)}&select=week_start,on_hand_end,used&order=week_start.asc`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    ]);
    const s = (await r0.json())?.[0];
    const after = (await rn.json()) || [];
    if (!s) return null;

    const start = Number(s.on_hand_start || 0), ord = Number(s.ordered || 0);
    const curEnd = s.on_hand_end_adjusted !== null && s.on_hand_end_adjusted !== undefined
      ? Number(s.on_hand_end_adjusted) : Number(s.on_hand_end || 0);
    const openWeek = window.BarStockParIntelligence?.getEffectiveWeekStart?.();

    return {
      counted: s.on_hand_end,
      curEnd,
      newEnd: val,
      curUsed: start + ord - curEnd,
      newUsed: start + ord - val,
      start, ordered: ord,
      // Ciclos cerrados posteriores al que se corrige: sus restas también
      // cambiarían y esto NO los toca.
      closedAfter: after.filter(w => w.used !== null && w.week_start !== openWeek).length,
      touchesLive: !!(after.length && after[0].week_start === openWeek)
    };
  }

  async function removeOverride(weekStart, itemName) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    await fetch(`${url}/rest/v1/sales_overrides?location_id=eq.${locationId}&week_start=eq.${weekStart}&item_name=eq.${encodeURIComponent(itemName)}`,
      { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` } });
    _aliasWeek = null;
  }


  // ─── Save sales to Supabase ───────────────────────────────────────
  //
  // `kind` es 'liquor' o 'wine'. Se guarda porque las ventas de un ciclo
  // llegan en dos archivos y hay que poder decir cuál falta: un ciclo sin
  // el archivo del vino no enseña un hueco, enseña una pérdida inventada.
  async function saveSalesToSupabase(weekStart, salesMap, fileName, kind) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      const k = (kind === 'liquor' || kind === 'wine') ? kind : null;

      // Fetch existing items for this week
      const existingRes = await fetch(
        `${url}/rest/v1/theoretical_sales?location_id=eq.${locationId}&week_start=eq.${weekStart}&select=id,item_name`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const existing = await existingRes.json();
      const existingMap = new Map((existing || []).map(r => [r.item_name, r.id]));

      const toInsert = [];
      const toUpdate = [];

      for (const [item_name, sold] of salesMap.entries()) {
        if (existingMap.has(item_name)) {
          toUpdate.push({ id: existingMap.get(item_name), sold, source_file: fileName || '', kind: k });
        } else {
          toInsert.push({ location_id: locationId, week_start: weekStart, item_name, sold, source_file: fileName || '', kind: k });
        }
      }

      // Insert new
      const chunkSize = 200;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        await fetch(`${url}/rest/v1/theoretical_sales`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
          body: JSON.stringify(toInsert.slice(i, i + chunkSize))
        });
      }

      // Update existing
      for (const r of toUpdate) {
        await fetch(`${url}/rest/v1/theoretical_sales?id=eq.${r.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
          body: JSON.stringify({ sold: r.sold, source_file: r.source_file, kind: r.kind })
        });
      }
      console.log('[TheoreticalUsage] Sales upserted:', toInsert.length, 'new,', toUpdate.length, 'updated for', weekStart, k || '(sin tipo)');
      _salesStatus.delete(weekStart);
    } catch (err) {
      console.warn('[TheoreticalUsage] saveSales failed:', err);
    }
  }

  // ─── Qué archivos tiene ya este ciclo ─────────────────────────────
  //
  // La pregunta que se hace la pantalla al abrir un ciclo: ¿están el del
  // licor y el del vino, o falta alguno?
  //
  // Las filas sin `kind` son de antes de la migración 009 y no hay forma
  // de deducir de cuál venían. Se cuentan aparte como `legacy`: hay
  // ventas cargadas, pero no se sabe de qué tipo. La pantalla no debe
  // avisar de que "falta el vino" en un ciclo del año pasado que sí lo
  // tenía; solo diría una mentira sobre datos que ya no se van a tocar.
  const _salesStatus = new Map();

  async function salesStatus(weekStart) {
    if (!weekStart) return { liquor: null, wine: null, legacy: 0, total: 0 };
    if (_salesStatus.has(weekStart)) return _salesStatus.get(weekStart);

    const out = { liquor: null, wine: null, legacy: 0, total: 0 };
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      const res = await fetch(
        `${url}/rest/v1/theoretical_sales?location_id=eq.${locationId}&week_start=eq.${weekStart}&select=kind,source_file`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      if (res.ok) {
        for (const r of (await res.json()) || []) {
          out.total++;
          if (r.kind === 'liquor' || r.kind === 'wine') {
            // Se queda el nombre del archivo y cuántas líneas trajo: al
            // abrir un ciclo dos meses después, "pos_liquor_0825.csv ·
            // 214 líneas" dice mucho más que un tic verde.
            if (!out[r.kind]) out[r.kind] = { file: r.source_file || '', lines: 0 };
            out[r.kind].lines++;
          } else {
            out.legacy++;
          }
        }
      }
    } catch (e) {
      console.warn('[TheoreticalUsage] salesStatus failed:', e);
    }
    _salesStatus.set(weekStart, out);
    return out;
  }

  // ─── Cargar un archivo de ventas en un ciclo concreto ─────────────
  //
  // Recibe la semana, y no la que estuviera abierta en ninguna pantalla.
  // El fallo más caro de la versión anterior era justo ese: los archivos
  // se subían estando abierta otra semana y las ventas acababan en el
  // ciclo equivocado sin que nada lo dijera.
  async function uploadSales(weekStart, file, kind) {
    if (!weekStart || !file) throw new Error('Missing week or file');
    const text = await file.text();
    const map = parseSalesCsv(text);
    if (!map.size) throw new Error('That file has no readable sales lines.');

    const existing = _salesData.get(weekStart) || new Map();
    _salesData.set(weekStart, new Map([...existing, ...map]));

    await saveSalesToSupabase(weekStart, map, file.name, kind);

    // Las correcciones se cachean por semana; una carga nueva las deja
    // desactualizadas respecto a lo que hay en la base.
    _aliasWeek = null;
    return { items: map.size, file: file.name };
  }


  // ─── Load sales from Supabase ─────────────────────────────────────
  async function loadSalesFromSupabase(weekStart) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      const res = await fetch(
        `${url}/rest/v1/theoretical_sales?location_id=eq.${locationId}&week_start=eq.${weekStart}&select=item_name,sold`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const rows = await res.json();
      const salesMap = new Map();
      for (const r of rows || []) salesMap.set(r.item_name, Number(r.sold || 0));
      return salesMap;
    } catch (err) {
      console.warn('[TheoreticalUsage] loadSales failed:', err);
      return new Map();
    }
  }

  // ─── Render week list ─────────────────────────────────────────────

  // ─── Open week detail ─────────────────────────────────────────────

  // ─── computeWeek ─────────────────────────────────────────────────
  //
  // La formula de used, sold, variance y loss vive AQUI y en ningun
  // otro sitio. Devuelve las filas de una semana ya calculadas y
  // ordenadas, SIN TOCAR EL DOM, para que otras vistas —hoy
  // Consumption Match— puedan pedir un ciclo sin abrir la pantalla de
  // Usage ni depender de que el usuario haya entrado antes.
  //
  // Antes esto vivia dentro de renderWeekDetail y la unica forma de
  // conseguir las cifras era pintar la tabla. Eso obligaba a llamar a
  // openWeek() desde fuera, que ademas esconde y muestra paneles: una
  // vista movia la pantalla de otra solo para leer un numero.
  async function computeWeek(weekStart, exclusions) {
    const [rows, prevRows] = await Promise.all([
      loadWeekDetail(weekStart),
      loadPrevWeekDetail(weekStart)
    ]);
    if (!rows?.length) return [];

    // Build prev week used map: item_name -> used
    const prevUsedMap = new Map();
    for (const r of prevRows || []) {
      if (r.used !== null) prevUsedMap.set(r.item_name, Number(r.used));
    }

    // Las ventas se cargan desde la nube si no estan ya en memoria: una
    // vista que no ha pasado por openWeek no tiene nada cacheado.
    // Se cachea tambien el resultado vacio: sin eso, una semana sin
    // ventas volvia a preguntar a la nube en cada reordenacion de la
    // tabla y nunca acertaba.
    if (!_salesData.has(weekStart)) {
      _salesData.set(weekStart, await loadSalesFromSupabase(weekStart));
    }
    const salesMap = _salesData.get(weekStart) || new Map();
    const excl = exclusions || new Set();

    // Las correcciones se piden una vez por semana y se cachean: esta
    // función se llama en cada reordenación de la tabla y en cada cambio
    // de filtro.
    if (_aliasWeek !== weekStart) {
      const c = await loadCorrections(weekStart);
      _aliases = c.aliases;
      _overrides = c.overrides;
      _aliasWeek = weekStart;
    }

    // Build value map from live master (window.state exposed since v2.3)
    const valueMap = new Map();
    if (window.state?.master) {
      for (const r of window.state.master) {
        if (r.item) valueMap.set(r.item, Number(r.value || 0));
      }
    }

    const enriched = rows.map(r => {
      const onHandEndAdj = r.on_hand_end_adjusted !== null && r.on_hand_end_adjusted !== undefined ? Number(r.on_hand_end_adjusted) : null;
      const usedRaw = r.used !== null ? Number(r.used) : null;
      const used = onHandEndAdj !== null && r.on_hand_start !== null
        ? Number(r.on_hand_start || 0) + Number(r.ordered || 0) - onHandEndAdj
        : usedRaw;
      // Un override vale aunque no se haya cargado ningún fichero: es
      // justamente el caso de una venta que el POS nunca registró.
      const s = (salesMap.size || _overrides.size)
        ? soldFor(r.item_name, salesMap, _aliases, _overrides)
        : { sold: null, src: 'none' };
      const sold = s.sold;
      const variance = used !== null && sold !== null ? used - sold : null;
      const variancePct = variance !== null && sold > 0 ? (variance / sold) * 100 : null;
      const loss = variance !== null ? variance * (valueMap.get(r.item_name) || Number(r.value || 0)) : null;
      const prevUsed = prevUsedMap.has(r.item_name) ? prevUsedMap.get(r.item_name) : null;
      const trendDelta = used !== null && prevUsed !== null ? Math.round((used - prevUsed) * 10) / 10 : null;
      const isExcluded = excl.has(r.item_name);
      return {
        ...r, used, sold, variance, variancePct, loss, trendDelta, isExcluded,
        soldSrc: s.src,
        soldNote: _overrides.get(r.item_name)?.reason || '',
        posNames: _aliases.get(r.item_name) || []
      };
    });

    // Sort based on _sortMode — no sales data always last
    enriched.sort((a, b) => {
      if (a.sold === null && b.sold !== null) return 1;
      if (a.sold !== null && b.sold === null) return -1;
      if (_sortMode === 'loss') {
        const aVal = a.loss !== null ? a.loss : -999;
        const bVal = b.loss !== null ? b.loss : -999;
        return bVal - aVal;
      } else {
        const aVal = a.variance !== null ? a.variance : -999;
        const bVal = b.variance !== null ? b.variance : -999;
        return bVal - aVal;
      }
    });

    return enriched;
  }

  // ─── loadCycle ───────────────────────────────────────────────────
  //
  // Punto de entrada para otras vistas. Sin argumento devuelve el
  // ULTIMO CICLO CERRADO, que es el que tiene numeros — no la semana
  // en curso, que acaba de abrirse vacia.
  async function loadCycle(weekStart) {
    if (!_weeks.length) await loadWeeks();
    const target = weekStart || (_weeks.find(w => w.hasUsage) || {}).week_start || null;
    if (!target) return { week: null, rows: [], weeks: _weeks };
    const excl = await fetchExclusions(target);
    const rows = await computeWeek(target, excl);
    return { week: target, rows, weeks: _weeks };
  }


  // Devuelve el conjunto sin tocar el estado global, para que computeWeek
  // pueda pedir las exclusiones de una semana que no es la que esta
  // abierta en pantalla.
  async function fetchExclusions(weekStart) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      const res = await fetch(
        `${url}/rest/v1/theoretical_exclusions?location_id=eq.${locationId}&week_start=eq.${weekStart}&select=item_name`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const rows = await res.json();
      return new Set((rows || []).map(r => r.item_name));
    } catch (err) {
      console.warn('[TheoreticalUsage] loadExclusions failed:', err);
      return new Set();
    }
  }


  async function saveExclusion(weekStart, itemName) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    await fetch(`${url}/rest/v1/theoretical_exclusions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ location_id: locationId, week_start: weekStart, item_name: itemName, reason: 'Not mapped in POS' })
    });
    _exclusions.add(itemName);
  }

  async function removeExclusion(weekStart, itemName) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    await fetch(
      `${url}/rest/v1/theoretical_exclusions?location_id=eq.${locationId}&week_start=eq.${weekStart}&item_name=eq.${encodeURIComponent(itemName)}`,
      { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    _exclusions.delete(itemName);
  }

  // ─── Excluir o readmitir, desde cualquier pantalla ────────────────
  //
  // Un artículo excluido desaparece del cálculo entero: computeWeek lo
  // salta y Consumption Match ni lo ve. Sin una forma de deshacerlo desde
  // fuera, excluir sería un viaje de ida — el artículo se esfumaría de la
  // aplicación sin dejar ni un rastro que permitiera traerlo de vuelta.
  //
  // Devuelve el estado en que queda, para que quien lo llame pinte sin
  // volver a preguntar.
  async function toggleItemExclusion(weekStart, itemName) {
    if (!weekStart || !itemName) return null;
    const set = await fetchExclusions(weekStart);
    const wasExcluded = set.has(itemName);
    if (wasExcluded) await removeExclusion(weekStart, itemName);
    else await saveExclusion(weekStart, itemName);
    return !wasExcluded;
  }

  // Las exclusiones de un ciclo, para pintar el estado del botón.
  async function exclusionsFor(weekStart) {
    return await fetchExclusions(weekStart);
  }


  // El lápiz de la columna USED pasa por la MISMA ruta que la corrección
  // de conteo. Antes escribía on_hand_end_adjusted y nada más: el ajuste
  // lo veían Usage y Consumption Match, pero el par óptimo, Pour-IQ, la
  // portada y el stock seguían con el número viejo. Dos caminos para
  // mover el mismo número es como se llega a dos verdades.

  // ─── Upload Sales CSV ─────────────────────────────────────────────


  // ─── Comments & Notes ────────────────────────────────────────────


  // ─── Generate PDF ─────────────────────────────────────────────────

  // ── La única puerta ──────────────────────────────────────────────────
  //
  // Este módulo ya no pinta nada. Era la pantalla de Theoretical Usage
  // —lista de semanas, tabla de detalle, PDF, modales— y además la
  // fórmula que hay debajo. La pantalla se retiró porque Consumption
  // Match hace lo mismo y se entiende; la fórmula se queda, porque
  // encima de ella corren Consumption Match, la portada, los dos
  // diálogos de corrección y, de rebote, par-intelligence.
  //
  // El nombre `BarStockTheoreticalUsage` se conserva. Renombrarlo
  // tocaría siete archivos para no cambiar ni un comportamiento.
  //
  // Nada de lo que sale aquí lee una variable global de estado: todas
  // reciben la semana como argumento. Antes media API dependía de
  // `_currentWeek`, que era "la semana abierta en la pantalla" — y esa
  // era exactamente la razón por la que los archivos de ventas acababan
  // cargados en el ciclo equivocado.
  window.BarStockTheoreticalUsage = {
    get weeks() { return _weeks; },

    // La última semana CERRADA. La primera de la lista es la que está
    // corriendo y no tiene números todavía.
    get lastClosedWeek() { return (_weeks.find(w => w.hasUsage) || null); },

    // ── La fórmula ──
    loadCycle,
    computeWeek,

    // ── Corregir las ventas de un artículo ──
    // Viven junto a la fórmula para que las pantallas que las usan no
    // puedan discrepar sobre qué gana a qué.
    salesLines,
    saveAlias, removeAlias, saveOverride, removeOverride,
    aliasesFor:  (item) => _aliases.get(item) || [],
    overrideFor: (item) => _overrides.get(item) || null,

    // ── Corregir el conteo de cierre ──
    savePourFix, previewPourFix,

    // ── Los archivos de ventas ──
    uploadSales, salesStatus,

    // ── Excluir artículos y marcar semanas de evento ──
    toggleItemExclusion, exclusionsFor,
    setEventWeek, isEventWeek
  };

})();
