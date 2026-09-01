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

  // ─── Toggle event week ───────────────────────────────────────────
  async function toggleEventWeek() {
    if (!_currentWeek) return;
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    const newVal = !_currentWeek.is_event_week;
    await fetch(
      `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=eq.${_currentWeek.week_start}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
        body: JSON.stringify({ is_event_week: newVal })
      }
    );
    _currentWeek.is_event_week = newVal;
    renderWeekDetail(_currentWeek.week_start);
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

  // Se conserva para el PDF de Usage, que la llama por su cuenta.
  function matchSold(itemName, salesMap) {
    return soldFor(itemName, salesMap, null, null).sold;
  }

  // ─── Correcciones guardadas ───────────────────────────────────────
  // Las filas de la semana que hay en pantalla. El diálogo de corrección
  // necesita saber de dónde salió la cifra actual del artículo, y
  // recalcular el ciclo entero solo para eso sería absurdo.
  let _lastRows = [];
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

  async function removeOverride(weekStart, itemName) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    await fetch(`${url}/rest/v1/sales_overrides?location_id=eq.${locationId}&week_start=eq.${weekStart}&item_name=eq.${encodeURIComponent(itemName)}`,
      { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` } });
    _aliasWeek = null;
  }


  // ─── Save sales to Supabase ───────────────────────────────────────
  async function saveSalesToSupabase(weekStart, salesMap, fileName) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();

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
          toUpdate.push({ id: existingMap.get(item_name), sold, source_file: fileName || '' });
        } else {
          toInsert.push({ location_id: locationId, week_start: weekStart, item_name, sold, source_file: fileName || '' });
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
          body: JSON.stringify({ sold: r.sold, source_file: r.source_file })
        });
      }
      console.log('[TheoreticalUsage] Sales upserted:', toInsert.length, 'new,', toUpdate.length, 'updated for', weekStart);
    } catch (err) {
      console.warn('[TheoreticalUsage] saveSales failed:', err);
    }
  }

  async function resetSalesForWeek(weekStart) {
    if (!confirm('Reset all sales data for this week?')) return;
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      await fetch(
        `${url}/rest/v1/theoretical_sales?location_id=eq.${locationId}&week_start=eq.${weekStart}`,
        { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      _salesData.delete(weekStart);
      renderWeekDetail(weekStart);
      if (typeof setStatus === 'function') setStatus('Sales data reset for this week.');
    } catch (err) {
      console.warn('[TheoreticalUsage] resetSales failed:', err);
    }
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
  function renderWeekList() {
    const list = document.getElementById('tuWeekList');
    const empty = document.getElementById('tuWeekEmpty');
    const count = document.getElementById('tuWeekCount');
    if (!list) return;

    if (!_weeks.length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      if (count) count.textContent = 'No weeks available';
      return;
    }

    empty.classList.add('hidden');
    if (count) count.textContent = `${_weeks.length} week${_weeks.length !== 1 ? 's' : ''} tracked`;

    // ── Calendar ──────────────────────────────────────────────────────
    const calEl = document.getElementById('tuCalendar');
    const calYearsEl = document.getElementById('tuCalendarYears');
    const calMonthsEl = document.getElementById('tuCalendarMonths');

    const byMonth = {};
    _weeks.forEach(w => {
      const ym = w.week_start.slice(0, 7);
      if (!byMonth[ym]) byMonth[ym] = [];
      byMonth[ym].push(w);
    });
    const byYear = {};
    Object.keys(byMonth).forEach(ym => {
      const y = ym.slice(0, 4);
      if (!byYear[y]) byYear[y] = {};
      byYear[y][ym] = byMonth[ym];
    });
    const years = Object.keys(byYear).sort((a, b) => b - a);

    if (!window._tuCalYear || !byYear[window._tuCalYear]) window._tuCalYear = years[0];
    if (!window._tuCalMonth) window._tuCalMonth = null;

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    function renderTuCalendar() {
      if (!calEl || !calYearsEl || !calMonthsEl) return;
      calEl.style.display = 'block';
      const cy = window._tuCalYear;
      const cm = window._tuCalMonth;

      calYearsEl.innerHTML = years.map(y =>
        `<button onclick="window._tuCalYear='${y}';window._tuCalMonth=null;window._renderTuCal()"
          class="oh-filter-chip ${cy===y?'active':''}">${y}</button>`
      ).join('');

      calMonthsEl.innerHTML = monthNames.map((name, i) => {
        const key = `${cy}-${String(i+1).padStart(2,'0')}`;
        const has = !!(byYear[cy] && byYear[cy][key]);
        const sel = cm === key;
        return `<button onclick="if(${has}){window._tuCalMonth=${sel?'null':`'${key}'`};window._renderTuCal()}"
          style="padding:10px 4px;border-radius:10px;font-size:13px;font-weight:700;cursor:${has?'pointer':'default'};
          background:${sel?'#bfedff':has?'#dcfce7':'rgba(0,0,0,.04)'};
          color:${sel?'#0369a1':has?'#15803d':'#94a3b8'};
          border:1.5px solid ${sel?'#38bdf8':has?'#22c55e':'#e2e8f0'}">${name}</button>`;
      }).join('');
    }

    window._renderTuCal = function() {
      renderTuCalendar();
      const cy = window._tuCalYear;
      const cm = window._tuCalMonth;
      const filtered = cm
        ? (byMonth[cm] || [])
        : _weeks.filter(w => w.week_start.startsWith(cy));
      if (!cm) { list.innerHTML = ''; return; }
      list.innerHTML = filtered.map(w => {
        const dotClass = w.is_event_week ? 'tu-dot-event' : 'tu-dot-normal';
        const tagClass = w.is_event_week ? 'tu-tag-event' : 'tu-tag-normal';
        const tagLabel = w.is_event_week ? 'Event week' : 'Normal';
        // .size, no .has(): desde que se cachean tambien las semanas sin
        // ventas, tener la clave ya no significa tener datos.
        const hasSales = (_salesData.get(w.week_start) || new Map()).size > 0;
        return `<div class="tu-week-row" onclick="window.BarStockTheoreticalUsage.openWeek('${w.week_start}')">
          <span class="tu-dot ${dotClass}"></span>
          <span class="tu-week-label">${formatWeekLabel(w.week_start)}</span>
          <span class="tu-week-tag ${tagClass}">${tagLabel}</span>
          ${hasSales ? '<span class="tu-week-tag tu-tag-normal" style="background:#E1F5EE;color:#085041">Sales loaded</span>' : ''}
          <span class="tu-week-meta">${w.itemCount} items</span>
          <i class="ti ti-chevron-right" style="font-size:14px;color:var(--sub)" aria-hidden="true"></i>
        </div>`;
      }).join('') || '<div class="small muted" style="padding:12px 0">No weeks for this period.</div>';
    };

    renderTuCalendar();
    list.innerHTML = '';
    window._tuCalMonth = null;
  }

  function formatWeekLabel(weekStart) {
    const d = new Date(weekStart + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ─── Open week detail ─────────────────────────────────────────────
  async function openWeek(weekStart) {
    _currentWeek = _weeks.find(w => w.week_start === weekStart) || { week_start: weekStart, is_event_week: false };
    document.getElementById('tuWeekListView').classList.add('hidden');
    document.getElementById('tuWeekDetailView').classList.remove('hidden');
    document.getElementById('tuDetailWeekLabel').textContent = 'Week of ' + formatWeekLabel(weekStart);
    document.getElementById('tuDetailBody').innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;padding:20px">Loading...</td></tr>';
    initCsvUpload();
    // Las ventas ya no se cargan aqui: lo hace computeWeek, que es quien
    // las necesita. Hacerlo en los dos sitios pedia el fichero dos veces.
    _itemComments = await loadCommentsFromSupabase(weekStart);
    _customNotes = await loadNotesFromSupabase(weekStart);
    await loadExclusions(weekStart);
    renderWeekDetail(weekStart);
  }

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

  async function renderWeekDetail(weekStart) {
    const enriched = await computeWeek(weekStart, _exclusions);
    _lastRows = enriched;

    const body = document.getElementById('tuDetailBody');
    const empty = document.getElementById('tuDetailEmpty');
    const summaryGrid = document.getElementById('tuSummaryGrid');
    const eventBtn = document.getElementById('tuEventToggleBtn');

    if (eventBtn) {
      eventBtn.textContent = _currentWeek.is_event_week ? 'Unmark event week' : 'Mark as event week';
      eventBtn.style.borderColor = _currentWeek.is_event_week ? 'rgba(239,159,39,0.6)' : '';
      eventBtn.style.color = _currentWeek.is_event_week ? '#EF9F27' : '';
    }

    if (!enriched.length) {
      body.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    // Summary metrics
    const included = enriched.filter(r => !r.isExcluded);
    const excluded = enriched.filter(r => r.isExcluded);
    const withSales = included.filter(r => r.sold !== null);
    const withLoss = included.filter(r => r.variance !== null && r.variance > 0);
    const withGain = included.filter(r => r.variance !== null && r.variance < 0);
    const totalLoss = withLoss.reduce((s, r) => s + (r.loss || 0), 0);
    const totalGain = withGain.reduce((s, r) => s + Math.abs(r.loss || 0), 0);
    const netLoss = totalLoss - totalGain;
    const excludedLoss = excluded.filter(r => r.variance !== null && r.variance > 0).reduce((s, r) => s + (r.loss || 0), 0);
    const noSales = included.filter(r => r.used > 0 && r.sold === null);

    if (summaryGrid) {
      summaryGrid.innerHTML = `
        <div class="tu-metric"><div class="tu-metric-lbl">Loss</div><div class="tu-metric-val" style="color:#D85A30">$${totalLoss.toFixed(2)}</div></div>
        <div class="tu-metric"><div class="tu-metric-lbl">Gained</div><div class="tu-metric-val" style="color:#4ade80">$${totalGain.toFixed(2)}</div></div>
        <div class="tu-metric"><div class="tu-metric-lbl">Net Loss</div><div class="tu-metric-val" style="color:${netLoss > 0 ? '#D85A30' : '#4ade80'}">${netLoss > 0 ? '+' : ''}$${netLoss.toFixed(2)}</div></div>
        <div class="tu-metric"><div class="tu-metric-lbl">Excluded Loss</div><div class="tu-metric-val" style="color:#9ca3af">$${excludedLoss.toFixed(2)}</div></div>
        <div class="tu-metric"><div class="tu-metric-lbl">Items analyzed</div><div class="tu-metric-val">${withSales.length || included.length}</div></div>
        <div class="tu-metric"><div class="tu-metric-lbl">No sales data</div><div class="tu-metric-val" style="color:#9ca3af">${noSales.length}</div></div>
      `;
    }

    // In report mode filter to included only; in review show all
    const displayPool = _reportMode ? included : enriched;
    renderVendorChips(displayPool);
    const displayed = _vendorFilter === 'ALL' ? displayPool : displayPool.filter(r => (r.vendor || 'UNKNOWN') === _vendorFilter);

    body.innerHTML = displayed.map(r => {
      const hasAdj = r.on_hand_end_adjusted !== null && r.on_hand_end_adjusted !== undefined;
      const adjBtn = `<button class="tu-comment-btn${hasAdj ? ' tu-adj-active' : ''}" onclick="window.BarStockTheoreticalUsage.openAdjModal('${r.item_name.replace(/'/g, '&#39;')}', ${r.on_hand_end_adjusted !== null && r.on_hand_end_adjusted !== undefined ? r.on_hand_end_adjusted : r.on_hand_end ?? ''})" title="${hasAdj ? 'Adjusted — click to edit' : 'Adjust on hand end'}"><i class="ti ti-edit" aria-hidden="true"></i></button>`;
      const usedFmt = (r.used !== null ? r.used.toFixed(2) : '—') + ' ' + adjBtn;
      // La celda de ventas se puede corregir. El icono cambia de color
      // según de dónde salga la cifra: ámbar cuando la emparejó el
      // parecido de texto —que es donde vive el error— o cuando la
      // escribió una persona.
      const sfCls = (r.soldSrc === 'fuzzy' || r.soldSrc === 'alias-empty') ? ' tu-adj-active'
                  : r.soldSrc === 'manual' ? ' has-comment' : '';
      const sfTitle = r.soldSrc === 'manual' ? 'Typed in by hand — click to change'
                    : r.soldSrc === 'fuzzy' ? 'Matched by approximate name — check it'
                    : r.soldSrc === 'alias' ? 'From linked POS lines'
                    : r.soldSrc === 'alias-empty' ? 'Linked, but that line is not in this file'
                    : r.sold === null ? 'No sales data — link the POS line or type it'
                    : 'Matched by exact name';
      const sfBtn = `<button class="tu-comment-btn${sfCls}" title="${sfTitle}" onclick="window.BarStockTheoreticalUsage.fixSales('${r.item_name.replace(/'/g, '&#39;')}');event.stopPropagation()"><i class="ti ti-pencil" aria-hidden="true"></i></button>`;
      const soldFmt = (r.sold !== null ? r.sold.toFixed(2) : '<span class="muted">No data</span>') + ' ' + sfBtn;
      let varianceFmt = '—', variancePctFmt = '—', lossFmt = '—';
      let varianceClass = '';
      if (r.variance !== null) {
        varianceClass = r.variance > 0.1 ? 'tu-variance-pos' : r.variance < -0.1 ? 'tu-variance-neg' : 'tu-variance-ok';
        varianceFmt = `<span class="${varianceClass}">${r.variance > 0 ? '+' : ''}${r.variance.toFixed(2)}</span>`;
        variancePctFmt = r.variancePct !== null ? `<span class="${varianceClass}">${r.variancePct > 0 ? '+' : ''}${r.variancePct.toFixed(1)}%</span>` : '—';
        lossFmt = r.loss !== null && r.loss > 0 ? `<span class="tu-variance-pos">$${r.loss.toFixed(2)}</span>` : '<span class="tu-variance-ok">—</span>';
      }
      const statusBadge = r.sold === null
        ? '<span style="font-size:10px;background:#F1EFE8;color:#5F5E5A;padding:2px 6px;border-radius:4px;font-weight:600">No sales</span>'
        : r.variance > 0.1
          ? '<span style="font-size:10px;background:#FCEBEB;color:#A32D2D;padding:2px 6px;border-radius:4px;font-weight:600">Loss</span>'
          : '<span style="font-size:10px;background:#EAF3DE;color:#3B6D11;padding:2px 6px;border-radius:4px;font-weight:600">OK</span>';

      // Trend cell
      let trendFmt = '<span class="muted">—</span>';
      if (r.trendDelta !== null) {
        if (r.trendDelta > 0.2)
          trendFmt = `<span class="tu-trend-up"><i class="ti ti-trending-up" aria-hidden="true"></i> +${r.trendDelta.toFixed(1)}</span>`;
        else if (r.trendDelta < -0.2)
          trendFmt = `<span class="tu-trend-down"><i class="ti ti-trending-down" aria-hidden="true"></i> ${r.trendDelta.toFixed(1)}</span>`;
        else
          trendFmt = `<span class="tu-trend-flat"><i class="ti ti-arrows-horizontal" aria-hidden="true"></i> ${r.trendDelta.toFixed(1)}</span>`;
      }

      const comment = _itemComments.get(r.item_name) || '';
      const commentIcon = comment
        ? `<button class="tu-comment-btn has-comment" onclick="window.BarStockTheoreticalUsage.openCommentModal('${r.item_name.replace(/'/g,"\'")}')" title="${comment.replace(/"/g,'&quot;')}"><i class="ti ti-message-circle" aria-hidden="true"></i></button>`
        : `<button class="tu-comment-btn" onclick="window.BarStockTheoreticalUsage.openCommentModal('${r.item_name.replace(/'/g,"\'")}')" title="Add comment"><i class="ti ti-message-circle" aria-hidden="true"></i></button>`;
      const safeItemName = r.item_name.replace(/'/g, '&#39;');
      const excludeIcon = `<button class="tu-comment-btn${r.isExcluded ? ' tu-excl-active' : ''}" onclick="window.BarStockTheoreticalUsage.toggleExclusion('${safeItemName}')" title="${r.isExcluded ? 'Excluded — click to re-include' : 'Exclude from report'}"><i class="ti ti-eye-off" aria-hidden="true"></i></button>`;
      return `<tr class="${r.isExcluded ? 'tu-excluded-row' : ''}">
        <td>${r.code || ''}</td>
        <td style="font-weight:500">${r.item_name}</td>
        <td>${typeof badge === 'function' ? badge(r.vendor) : r.vendor}</td>
        <td>${usedFmt}</td>
        <td>${soldFmt}</td>
        <td>${varianceFmt}</td>
        <td>${variancePctFmt}</td>
        <td>${lossFmt}</td>
        <td>${trendFmt}</td>
        <td>${statusBadge}</td>
        <td>${commentIcon}</td>
        <td>${excludeIcon}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="11" class="muted" style="text-align:center;padding:20px">No items found.</td></tr>';

    // Report mode — excluded section below table
    const exclContainer = document.getElementById('tuExcludedSection');
    if (exclContainer) {
      if (_reportMode && excluded.length > 0) {
        const exclLoss = excluded.filter(r => r.variance !== null && r.variance > 0).reduce((s, r) => s + (r.loss || 0), 0);
        exclContainer.innerHTML = `
          <div class="tu-excl-header" onclick="this.nextElementSibling.classList.toggle('hidden');this.querySelector('.tu-excl-chevron').classList.toggle('rotated')">
            <span><i class="ti ti-eye-off" aria-hidden="true"></i> &nbsp;Excluded — not mapped in POS &nbsp;<span style="font-size:11px;background:var(--muted);color:var(--sub);padding:2px 8px;border-radius:4px;font-weight:600">${excluded.length} item${excluded.length!==1?'s':''} &middot; $${exclLoss.toFixed(2)}</span></span>
            <i class="ti ti-chevron-down tu-excl-chevron" aria-hidden="true"></i>
          </div>
          <div class="hidden">
            <table style="width:100%;font-size:12px;border-collapse:collapse">
              <thead><tr style="background:var(--muted)"><th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--sub);text-transform:uppercase">Item</th><th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--sub);text-transform:uppercase">Vendor</th><th style="padding:6px 10px;font-size:10px;color:var(--sub);text-transform:uppercase">Variance</th><th style="padding:6px 10px;font-size:10px;color:var(--sub);text-transform:uppercase">Loss ($)</th></tr></thead>
              <tbody>${excluded.map(r => `<tr style="border-top:0.5px solid var(--border)"><td style="padding:6px 10px;color:var(--sub)">${r.item_name}</td><td style="padding:6px 10px;color:var(--sub)">${r.vendor||''}</td><td style="padding:6px 10px;color:var(--sub)">${r.variance!==null?'+'+r.variance.toFixed(2):'—'}</td><td style="padding:6px 10px;color:var(--sub)">${r.loss!==null&&r.loss>0?'$'+r.loss.toFixed(2):'—'}</td></tr>`).join('')}</tbody>
            </table>
          </div>`;
        exclContainer.classList.remove('hidden');
      } else {
        exclContainer.classList.add('hidden');
        exclContainer.innerHTML = '';
      }
    }
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

  async function loadExclusions(weekStart) {
    _exclusions = await fetchExclusions(weekStart);
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

  function setMode(mode) {
    _reportMode = mode === 'report';
    document.getElementById('tuModeReview').classList.toggle('active', !_reportMode);
    document.getElementById('tuModeReport').classList.toggle('active', _reportMode);
    const reviewTools = document.getElementById('tuReviewTools');
    const reportTools = document.getElementById('tuReportTools');
    const sharedTools = document.getElementById('tuSharedTools');
    const vendorChips = document.getElementById('tuVendorChips');
    if (reviewTools) reviewTools.style.display = _reportMode ? 'none' : 'flex';
    if (reportTools) reportTools.style.display = _reportMode ? 'flex' : 'none';
    if (sharedTools) sharedTools.style.display = _reportMode ? 'none' : 'flex';
    if (vendorChips) vendorChips.style.display = _reportMode ? 'none' : 'flex';
    if (_currentWeek) renderWeekDetail(_currentWeek.week_start);
  }

  async function publishReport() {
    await window.BarStockEmailTheoretical.openModal();
  }

  async function saveOnHandAdjustment(weekStart, itemName, value) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    const val = Number(value);
    await fetch(
      `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=eq.${weekStart}&item_name=eq.${encodeURIComponent(itemName)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
        body: JSON.stringify({ on_hand_end_adjusted: val })
      }
    );
  }

  function renderVendorChips(enriched) {
    const container = document.getElementById('tuVendorChips');
    if (!container) return;
    const vendors = ['ALL', ...Array.from(new Set(enriched.map(r => r.vendor || 'UNKNOWN').filter(Boolean))).sort()];
    container.innerHTML = vendors.map(v =>
      `<div class="oh-filter-chip ${_vendorFilter === v ? 'active' : ''}" onclick="window.BarStockTheoreticalUsage.setVendorFilter('${v.replace(/'/g, "\'")}')">${v}</div>`
    ).join('');
  }

  function showWeekList() {
    _currentWeek = null;
    document.getElementById('tuWeekListView').classList.remove('hidden');
    document.getElementById('tuWeekDetailView').classList.add('hidden');
  }

  // ─── Upload Sales CSV ─────────────────────────────────────────────
  function attachCsvListener(inputId, label) {
    const input = document.getElementById(inputId);
    if (!input || input._tuListenerAttached) return;
    input._tuListenerAttached = true;
    input.addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f || !_currentWeek) return;
      try {
        const text = await f.text();
        const newSalesMap = parseSalesCsv(text);
        const existing = _salesData.get(_currentWeek.week_start) || new Map();
        const merged = new Map([...existing, ...newSalesMap]);
        _salesData.set(_currentWeek.week_start, merged);
        await saveSalesToSupabase(_currentWeek.week_start, newSalesMap, f.name);
        renderWeekDetail(_currentWeek.week_start);
        if (typeof setStatus === 'function') setStatus(`${label} CSV loaded: ${newSalesMap.size} items. Total: ${merged.size} for week of ${formatWeekLabel(_currentWeek.week_start)}.`);
      } catch (err) {
        alert(err.message || String(err));
      }
      e.target.value = '';
    });
  }

  function initCsvUpload() {
    attachCsvListener('tuSalesCsvLiquor', 'Liquor');
    attachCsvListener('tuSalesCsvWine', 'Wine');
  }


  // ─── Comments & Notes ────────────────────────────────────────────
  async function loadCommentsFromSupabase(weekStart) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      const res = await fetch(
        `${url}/rest/v1/theoretical_comments?location_id=eq.${locationId}&week_start=eq.${weekStart}&select=item_name,comment`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const rows = await res.json();
      const map = new Map();
      for (const r of rows || []) map.set(r.item_name, r.comment);
      return map;
    } catch (err) {
      console.warn('[TheoreticalUsage] loadComments failed:', err);
      return new Map();
    }
  }

  async function saveComment(weekStart, itemName, comment) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();

      // Check if exists
      const res = await fetch(
        `${url}/rest/v1/theoretical_comments?location_id=eq.${locationId}&week_start=eq.${weekStart}&item_name=eq.${encodeURIComponent(itemName)}&select=id`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const existing = await res.json();

      if (existing?.length) {
        await fetch(`${url}/rest/v1/theoretical_comments?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
          body: JSON.stringify({ comment, updated_at: new Date().toISOString() })
        });
      } else {
        await fetch(`${url}/rest/v1/theoretical_comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
          body: JSON.stringify({ location_id: locationId, week_start: weekStart, item_name: itemName, comment })
        });
      }
      _itemComments.set(itemName, comment);
    } catch (err) {
      console.warn('[TheoreticalUsage] saveComment failed:', err);
    }
  }

  async function loadNotesFromSupabase(weekStart) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      const res = await fetch(
        `${url}/rest/v1/theoretical_notes?location_id=eq.${locationId}&week_start=eq.${weekStart}&select=notes`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const rows = await res.json();
      return rows?.[0]?.notes || '';
    } catch (err) {
      console.warn('[TheoreticalUsage] loadNotes failed:', err);
      return '';
    }
  }

  async function saveNotes(weekStart, notes) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      const res = await fetch(
        `${url}/rest/v1/theoretical_notes?location_id=eq.${locationId}&week_start=eq.${weekStart}&select=id`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const existing = await res.json();
      if (existing?.length) {
        await fetch(`${url}/rest/v1/theoretical_notes?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
          body: JSON.stringify({ notes, updated_at: new Date().toISOString() })
        });
      } else {
        await fetch(`${url}/rest/v1/theoretical_notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
          body: JSON.stringify({ location_id: locationId, week_start: weekStart, notes })
        });
      }
      _customNotes = notes;
    } catch (err) {
      console.warn('[TheoreticalUsage] saveNotes failed:', err);
    }
  }

  function openCommentModal(itemName) {
    const modal = document.getElementById('tuCommentModal');
    const input = document.getElementById('tuCommentInput');
    const label = document.getElementById('tuCommentItemLabel');
    if (!modal || !input) return;
    label.textContent = itemName;
    input.value = _itemComments.get(itemName) || '';
    modal.classList.remove('hidden');
    input.focus();
    modal._currentItem = itemName;
  }

  async function saveCommentFromModal() {
    const modal = document.getElementById('tuCommentModal');
    const input = document.getElementById('tuCommentInput');
    if (!modal || !input || !_currentWeek) return;
    const itemName = modal._currentItem;
    const comment = input.value.trim();
    await saveComment(_currentWeek.week_start, itemName, comment);
    modal.classList.add('hidden');
    renderWeekDetail(_currentWeek.week_start);
    if (typeof setStatus === 'function') setStatus('Comment saved.');
  }

  function openNotesModal() {
    const modal = document.getElementById('tuNotesModal');
    const input = document.getElementById('tuNotesInput');
    if (!modal || !input) return;
    input.value = _customNotes || '';
    modal.classList.remove('hidden');
    input.focus();
  }

  async function saveNotesFromModal() {
    const modal = document.getElementById('tuNotesModal');
    const input = document.getElementById('tuNotesInput');
    if (!modal || !input || !_currentWeek) return;
    await saveNotes(_currentWeek.week_start, input.value.trim());
    modal.classList.add('hidden');
    if (typeof setStatus === 'function') setStatus('Notes saved.');
  }

  // ─── Generate PDF ─────────────────────────────────────────────────
  async function generatePdf(returnBase64 = false) {
    if (!_currentWeek) return null;
    const rows = await loadWeekDetail(_currentWeek.week_start);
    const salesMap = _salesData.get(_currentWeek.week_start) || new Map();
    const comments = _itemComments || new Map();
    const customNotes = _customNotes || '';
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 36;
    let y = margin;

    const NAVY = [15, 23, 42];
    const BLUE = [56, 189, 248];
    const WHITE = [248, 250, 252];
    const GRAY = [100, 116, 139];
    const RED = [168, 45, 45];
    const GREEN = [29, 158, 117];
    const ORANGE = [180, 83, 9];
    const RED_BG = [254, 226, 226];
    const GREEN_BG = [220, 252, 231];
    const ORANGE_BG = [255, 237, 213];
    const ALT_BG = [240, 246, 252];

    const location = (window.BARSTOCK_CONFIG?.LOCATION_NAME || 'The Crown Tavern').toUpperCase();
    const weekLabel = formatWeekLabel(_currentWeek.week_start);

    // ── HEADER ────────────────────────────────────────────────────────
    const hdrH = y + 42;
    pdf.setFillColor(...NAVY); pdf.rect(0, 0, pageW, hdrH, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22); pdf.setTextColor(...WHITE);
    pdf.text('BarStock', margin, y + 16);
    const bsW = pdf.getTextWidth('BarStock');
    pdf.setFillColor(...BLUE); pdf.circle(margin + bsW + 3.5, y + 13.5, 2.6, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...GRAY);
    pdf.text('PRO', margin + bsW + 9, y + 16);
    const locW = pdf.getTextWidth(location) + 16;
    pdf.setFillColor(...BLUE); pdf.roundedRect(margin, y + 20, locW, 14, 7, 7, 'F');
    pdf.setTextColor(...NAVY); pdf.setFontSize(8);
    pdf.text(location, margin + locW / 2, y + 30, { align: 'center' });
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...WHITE);
    pdf.text('THEORETICAL USAGE', pageW - margin, y + 14, { align: 'right' });
    const wkW = pdf.getTextWidth(weekLabel) + 16;
    pdf.setFillColor(...BLUE); pdf.roundedRect(pageW - margin - wkW, y + 20, wkW, 14, 7, 7, 'F');
    pdf.setTextColor(...NAVY); pdf.setFontSize(8);
    pdf.text(weekLabel, pageW - margin - wkW / 2, y + 30, { align: 'center' });
    y = hdrH;
    pdf.setFillColor(...BLUE); pdf.rect(0, y, pageW, 3, 'F');
    y += 16;

    // ── ENRICH DATA ───────────────────────────────────────────────────
    const enriched = rows.map(r => {
      const onHandEndAdj = r.on_hand_end_adjusted !== null && r.on_hand_end_adjusted !== undefined ? Number(r.on_hand_end_adjusted) : null;
      const usedRaw = r.used !== null ? Number(r.used) : null;
      const used = onHandEndAdj !== null && r.on_hand_start !== null
        ? Number(r.on_hand_start || 0) + Number(r.ordered || 0) - onHandEndAdj
        : usedRaw;
      const sold = salesMap.size ? matchSold(r.item_name, salesMap) : null;
      const variance = used !== null && sold !== null ? used - sold : null;
      const variancePct = variance !== null && sold > 0 ? (variance / sold) * 100 : null;
      const loss = variance !== null && r.value ? variance * Number(r.value) : null;
      return { ...r, used, sold, variance, variancePct, loss };
    });

    const withVariance = enriched.filter(r => r.variance !== null).sort((a, b) => b.variance - a.variance);
    const withLoss = withVariance.filter(r => r.variance > 0.05);
    const noSalesData = enriched.filter(r => r.sold === null);
    const totalLoss = withLoss.reduce((s, r) => s + (r.loss || 0), 0);
    const top10 = withLoss.slice(0, 10);
    const top10Loss = top10.reduce((s, r) => s + (r.loss || 0), 0);
    const top10Pct = totalLoss > 0 ? Math.round((top10Loss / totalLoss) * 100) : 0;
    const lossItems = withLoss.length;
    const totalItems = enriched.length;

    // ── 3 CARDS (Cost Report style) ───────────────────────────────────
    const cardH = 70;
    const cardW = (pageW - margin * 2 - 16) / 3;
    const cardDefs = [
      {
        label: 'TOTAL LOSS THIS WEEK',
        main: `$${totalLoss.toFixed(2)}`,
        sub: `${lossItems} items contributing to loss`,
        mainColor: totalLoss > 0 ? RED : GREEN,
        border: totalLoss > 0 ? [239, 68, 68] : [34, 197, 94]
      },
      {
        label: 'ITEMS WITH LOSS',
        main: `${lossItems} / ${totalItems}`,
        sub: `${noSalesData.length} items missing sales data`,
        mainColor: NAVY,
        border: BLUE
      },
      {
        label: 'TOP 10 SHARE OF LOSS',
        main: `~${top10Pct}%`,
        sub: top10Loss > 0 ? `$${top10Loss.toFixed(2)} of total loss` : 'No loss data available',
        mainColor: NAVY,
        border: BLUE
      },
    ];

    cardDefs.forEach((card, i) => {
      const cx = margin + i * (cardW + 8);
      pdf.setDrawColor(...card.border); pdf.setLineWidth(0.8);
      pdf.roundedRect(cx, y, cardW, cardH, 6, 6, 'S');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(...GRAY);
      pdf.text(card.label, cx + 10, y + 14);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(...card.mainColor);
      pdf.text(card.main, cx + 10, y + 36);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(...GRAY);
      pdf.text(card.sub, cx + 10, y + 52);
    });
    y += cardH + 14;

    // ── HELPERS ───────────────────────────────────────────────────────
    function ensureSpace(needed) {
      if (y > pageH - margin - needed) { pdf.addPage(); y = margin + 10; }
    }
    function drawBanner(text) {
      pdf.setFillColor(...NAVY);
      pdf.roundedRect(margin, y, pageW - margin * 2, 22, 4, 4, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(224, 242, 254);
      pdf.text(text, pageW / 2, y + 15, { align: 'center' });
      y += 22;
    }
    function drawRoundedBlock(startY, endY) {
      pdf.setDrawColor(200, 215, 230); pdf.setLineWidth(0.8);
      pdf.roundedRect(margin, startY, pageW - margin * 2, endY - startY, 6, 6, 'S');
    }

    // ── TOP 10 TABLE ──────────────────────────────────────────────────
    ensureSpace(40);
    let blockStart = y;
    drawBanner('TOP 10 — HIGHEST VARIANCE');
    const top10TableRows = top10.map(r => [
      r.item_name,
      r.used !== null ? r.used.toFixed(2) : '—',
      r.sold !== null ? r.sold.toFixed(2) : '—',
      (r.variance > 0 ? '+' : '') + r.variance.toFixed(2),
      r.loss !== null && r.loss > 0 ? '$' + r.loss.toFixed(2) : '—',
      comments.get(r.item_name) || ''
    ]);

    pdf.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Product', 'Used', 'Sold', 'Variance', 'Loss ($)', 'Comment']],
      body: top10TableRows,
      headStyles: { fillColor: [30, 41, 59], textColor: WHITE, fontStyle: 'bold', fontSize: 7, cellPadding: 4 },
      bodyStyles: { fontSize: 7, textColor: NAVY, cellPadding: 4 },
      alternateRowStyles: { fillColor: ALT_BG },
      columnStyles: {
        0: { cellWidth: 155 },
        1: { halign: 'right', cellWidth: 38 },
        2: { halign: 'right', cellWidth: 38 },
        3: { halign: 'right', cellWidth: 48 },
        4: { halign: 'right', cellWidth: 48 },
        5: { cellWidth: 'auto' }
      },
      theme: 'plain',
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (data.column.index === 3) {
            const val = parseFloat(data.cell.raw);
            if (val > 0) { data.cell.styles.textColor = RED; data.cell.styles.fontStyle = 'bold'; }
            else if (val < 0) { data.cell.styles.textColor = GREEN; data.cell.styles.fontStyle = 'bold'; }
          }
          if (data.column.index === 4 && data.cell.raw !== '—') {
            data.cell.styles.textColor = RED; data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      didDrawCell: (data) => {
        if (data.section === 'body') {
          pdf.setDrawColor(218, 228, 240); pdf.setLineWidth(0.3);
          pdf.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
      }
    });
    y = pdf.lastAutoTable.finalY;
    drawRoundedBlock(blockStart, y);
    y += 12;

    // -- POUR-IQ PATTERN REVIEW -------------------------------------------
    ensureSpace(40);
    const attention = withLoss.filter(r => r.variance > 1.0).slice(0, 5);
    const stable = withVariance.filter(r => Math.abs(r.variance) <= 0.2).slice(0, 5);
    const concerns = withLoss.filter(r => r.variance > 0.2 && r.variance <= 1.0).slice(0, 5);

    if (attention.length || stable.length || concerns.length) {
      const piqBody = [];
      const piqMeta = [];

      if (attention.length) {
        piqBody.push(['Requires Attention', '', '', '']); piqMeta.push('subheader-red');
        attention.forEach(r => { piqBody.push([r.item_name, r.vendor || '', '+' + r.variance.toFixed(2), 'Attention']); piqMeta.push('attention'); });
      }
      if (stable.length) {
        piqBody.push(['Stable', '', '', '']); piqMeta.push('subheader-green');
        stable.forEach(r => { piqBody.push([r.item_name, r.vendor || '', r.variance.toFixed(2), 'Stable']); piqMeta.push('stable'); });
      }
      if (concerns.length) {
        piqBody.push(['New Concern', '', '', '']); piqMeta.push('subheader-orange');
        concerns.forEach(r => { piqBody.push([r.item_name, r.vendor || '', '+' + r.variance.toFixed(2), 'Monitor']); piqMeta.push('concern'); });
      }

      const piqBlockStart = y;
      drawBanner('POUR-IQ  PATTERN REVIEW');
      pdf.autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Product', 'Vendor', 'Variance', 'Status']],
        body: piqBody,
        headStyles: { fillColor: [30, 41, 59], textColor: WHITE, fontStyle: 'bold', fontSize: 7, cellPadding: 4 },
        bodyStyles: { fontSize: 7, textColor: NAVY, cellPadding: 4 },
        alternateRowStyles: { fillColor: [255,255,255] },
        columnStyles: {
          0: { cellWidth: 190 },
          1: { cellWidth: 110 },
          2: { halign: 'right', cellWidth: 60 },
          3: { cellWidth: 'auto' }
        },
        theme: 'grid',
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const type = piqMeta[data.row.index];
          if (!type) return;
          if (type.startsWith('subheader')) {
            const bg = type === 'subheader-red' ? [254,235,235] : type === 'subheader-green' ? [235,252,240] : [255,245,230];
            const col = type === 'subheader-red' ? RED : type === 'subheader-green' ? GREEN : ORANGE;
            data.cell.styles.fillColor = bg;
            data.cell.styles.textColor = col;
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.column.index === 2 && !type.startsWith('subheader')) {
            const val = parseFloat(data.cell.raw);
            if (val > 0) { data.cell.styles.textColor = RED; data.cell.styles.fontStyle = 'bold'; }
            else if (val < 0) { data.cell.styles.textColor = GREEN; data.cell.styles.fontStyle = 'bold'; }
          }
          if (data.column.index === 3 && !type.startsWith('subheader')) {
            if (type === 'attention') { data.cell.styles.textColor = RED; data.cell.styles.fontStyle = 'bold'; }
            else if (type === 'stable') { data.cell.styles.textColor = GREEN; data.cell.styles.fontStyle = 'bold'; }
            else { data.cell.styles.textColor = ORANGE; data.cell.styles.fontStyle = 'bold'; }
          }
        }
      });
      y = pdf.lastAutoTable.finalY;
      drawRoundedBlock(piqBlockStart, y);
      y += 12;
    }

    // ── NOTES (page 2) ────────────────────────────────────────────────
    if (customNotes) {
      pdf.addPage(); y = margin + 10;
      pdf.autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [['NOTES']],
        body: [[customNotes]],
        headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7, cellPadding: 5 },
        bodyStyles: { fontSize: 8, textColor: NAVY, cellPadding: 8 },
        theme: 'grid',
      });
    }

    if (returnBase64) {
      return pdf.output('datauristring').split(',')[1];
    }
    pdf.save(`theoretical_usage_${_currentWeek.week_start}.pdf`);
    if (typeof setStatus === 'function') setStatus('Theoretical Usage PDF generated.');
  }

  // ─── Email modal ──────────────────────────────────────────────────
  function openEmailModal() {
    if (window.BarStockEmailTheoretical) {
      window.BarStockEmailTheoretical.openModal();
    } else {
      alert('Email module not available.');
    }
  }

  // ─── Refresh ──────────────────────────────────────────────────────
  async function refresh() {
    try {
      await loadWeeks();
      renderWeekList();
    } catch (err) {
      console.warn('[TheoreticalUsage] refresh failed:', err);
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────
  function init() {
    initCsvUpload();
    refresh();
  }

  window.addEventListener('load', () => setTimeout(init, 2000));

  function setSort(mode) {
    _sortMode = mode || 'variance';
    if (_currentWeek) renderWeekDetail(_currentWeek.week_start);
  }

  window.BarStockTheoreticalUsage = {
    get _currentWeek() { return _currentWeek; },
    get weeks() { return _weeks; },
    // La ultima semana CERRADA. La primera de la lista es la que esta
    // corriendo y no tiene numeros todavia.
    get lastClosedWeek() { return (_weeks.find(w => w.hasUsage) || null); },
    // Lectura para otras vistas: mismo used, misma variance, mismo loss,
    // sin pintar nada.
    loadCycle,
    computeWeek,
    // ── Corregir las ventas de un artículo ──
    // Viven aquí, junto a la fórmula, para que las dos pantallas que las
    // usan no puedan discrepar sobre qué gana a qué.
    salesLines,
    saveAlias, removeAlias, saveOverride, removeOverride,
    aliasesFor: (item) => _aliases.get(item) || [],
    overrideFor: (item) => _overrides.get(item) || null,
    // Abre el diálogo desde la tabla de Usage y repinta al cerrarlo. La
    // caché de correcciones ya la invalida cada guardado, así que el
    // repintado recalcula con lo nuevo.
    fixSales: (itemName) => {
      if (!window.BarStockSalesFix || !_currentWeek) return;
      const row = _lastRows.find(r => r.item_name === itemName) || null;
      window.BarStockSalesFix.open(itemName, _currentWeek.week_start, row,
        () => renderWeekDetail(_currentWeek.week_start));
    },
    refresh,
    openWeek,
    showWeekList,
    toggleEventWeek,
    generatePdf,
    openEmailModal,
    setSort,
    resetSales: () => _currentWeek && resetSalesForWeek(_currentWeek.week_start),
    openCommentModal,
    saveCommentFromModal,
    openNotesModal,
    saveNotesFromModal,
    setVendorFilter: (v) => { _vendorFilter = v; if (_currentWeek) renderWeekDetail(_currentWeek.week_start); },
    toggleExclusion: async (itemName) => {
      if (!_currentWeek) return;
      const week = _currentWeek.week_start;
      if (_exclusions.has(itemName)) {
        await removeExclusion(week, itemName);
      } else {
        await saveExclusion(week, itemName);
      }
      renderWeekDetail(week);
    },
    openAdjModal: (itemName, currentVal) => {
      document.getElementById('tuAdjModalItem').textContent = itemName;
      document.getElementById('tuAdjInput').value = currentVal !== '' && currentVal !== null && currentVal !== undefined ? currentVal : '';
      document.getElementById('tuAdjInput').dataset.item = itemName;
      document.getElementById('tuAdjModal').classList.remove('hidden');
    },
    saveAdjFromModal: async () => {
      if (!_currentWeek) return;
      const input = document.getElementById('tuAdjInput');
      const itemName = input.dataset.item;
      const val = parseFloat(input.value);
      if (isNaN(val) || val < 0) return;
      await saveOnHandAdjustment(_currentWeek.week_start, itemName, val);
      document.getElementById('tuAdjModal').classList.add('hidden');
      await openWeek(_currentWeek.week_start);
    },
    setMode,
    publishReport,
    clearAdj: async () => {
      if (!_currentWeek) return;
      const input = document.getElementById('tuAdjInput');
      const itemName = input.dataset.item;
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      await fetch(
        `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=eq.${_currentWeek.week_start}&item_name=eq.${encodeURIComponent(itemName)}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
          body: JSON.stringify({ on_hand_end_adjusted: null }) }
      );
      document.getElementById('tuAdjModal').classList.add('hidden');
      await openWeek(_currentWeek.week_start);
    }
  };

})();
