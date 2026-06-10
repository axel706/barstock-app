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
  let _itemComments = new Map(); // item_name -> comment string
  let _customNotes = ''; // free text notes for current week

  // ─── Load weeks ──────────────────────────────────────────────────
  async function loadWeeks() {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    const res = await fetch(
      `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&select=week_start,is_event_week&order=week_start.desc`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    const rows = await res.json();
    const weekMap = new Map();
    for (const r of rows || []) {
      if (!weekMap.has(r.week_start)) {
        weekMap.set(r.week_start, { week_start: r.week_start, is_event_week: r.is_event_week, itemCount: 0 });
      }
      weekMap.get(r.week_start).itemCount++;
    }
    _weeks = Array.from(weekMap.values()).sort((a, b) => b.week_start.localeCompare(a.week_start));
    return _weeks;
  }

  // ─── Load week detail ─────────────────────────────────────────────
  async function loadWeekDetail(weekStart) {
    const { url, key } = getConfig();
    const locationId = await fetchLocationId();
    const res = await fetch(
      `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=eq.${weekStart}&select=*&order=item_name.asc`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    return await res.json();
  }

  async function loadPrevWeekDetail(weekStart) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      const res = await fetch(
        `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=lt.${weekStart}&used=not.is.null&select=item_name,used&order=week_start.desc&limit=500`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const all = await res.json();
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

  function matchSold(itemName, salesMap) {
    const norm = normItem(itemName);
    if (salesMap.has(norm)) return salesMap.get(norm);
    for (const [k, v] of salesMap) {
      if (norm.includes(k) || k.includes(norm)) return v;
    }
    return null;
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

    list.innerHTML = _weeks.map(w => {
      const dotClass = w.is_event_week ? 'tu-dot-event' : 'tu-dot-normal';
      const tagClass = w.is_event_week ? 'tu-tag-event' : 'tu-tag-normal';
      const tagLabel = w.is_event_week ? 'Event week' : 'Normal';
      const hasSales = _salesData.has(w.week_start);
      return `<div class="tu-week-row" onclick="window.BarStockTheoreticalUsage.openWeek('${w.week_start}')">
        <span class="tu-dot ${dotClass}"></span>
        <span class="tu-week-label">${formatWeekLabel(w.week_start)}</span>
        <span class="tu-week-tag ${tagClass}">${tagLabel}</span>
        ${hasSales ? '<span class="tu-week-tag tu-tag-normal" style="background:#E1F5EE;color:#085041">Sales loaded</span>' : ''}
        <span class="tu-week-meta">${w.itemCount} items</span>
        <i class="ti ti-chevron-right" style="font-size:14px;color:var(--sub)" aria-hidden="true"></i>
      </div>`;
    }).join('');
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
    if (!_salesData.has(weekStart)) {
      const salesMap = await loadSalesFromSupabase(weekStart);
      if (salesMap.size) _salesData.set(weekStart, salesMap);
    }
    _itemComments = await loadCommentsFromSupabase(weekStart);
    _customNotes = await loadNotesFromSupabase(weekStart);
    renderWeekDetail(weekStart);
  }

  async function renderWeekDetail(weekStart) {
    const [rows, prevRows] = await Promise.all([
      loadWeekDetail(weekStart),
      loadPrevWeekDetail(weekStart)
    ]);
    // Build prev week used map: item_name -> used
    const prevUsedMap = new Map();
    for (const r of prevRows || []) {
      if (r.used !== null) prevUsedMap.set(r.item_name, Number(r.used));
    }
    const salesMap = _salesData.get(weekStart) || new Map();
    const body = document.getElementById('tuDetailBody');
    const empty = document.getElementById('tuDetailEmpty');
    const summaryGrid = document.getElementById('tuSummaryGrid');
    const eventBtn = document.getElementById('tuEventToggleBtn');

    if (eventBtn) {
      eventBtn.textContent = _currentWeek.is_event_week ? 'Unmark event week' : 'Mark as event week';
      eventBtn.style.borderColor = _currentWeek.is_event_week ? 'rgba(239,159,39,0.6)' : '';
      eventBtn.style.color = _currentWeek.is_event_week ? '#EF9F27' : '';
    }

    if (!rows?.length) {
      body.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    const enriched = rows.map(r => {
      const used = r.used !== null ? Number(r.used) : null;
      const sold = salesMap.size ? matchSold(r.item_name, salesMap) : null;
      const variance = used !== null && sold !== null ? used - sold : null;
      const variancePct = variance !== null && sold > 0 ? (variance / sold) * 100 : null;
      const loss = variance !== null ? variance * Number(r.value || 0) : null;
      const prevUsed = prevUsedMap.has(r.item_name) ? prevUsedMap.get(r.item_name) : null;
      const trendDelta = used !== null && prevUsed !== null ? Math.round((used - prevUsed) * 10) / 10 : null;
      return { ...r, used, sold, variance, variancePct, loss, trendDelta };
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

    // Summary metrics
    const withSales = enriched.filter(r => r.sold !== null);
    const withLoss = enriched.filter(r => r.variance !== null && r.variance > 0);
    const totalLoss = withLoss.reduce((s, r) => s + (r.loss || 0), 0);
    const noSales = enriched.filter(r => r.used > 0 && r.sold === null);

    if (summaryGrid) {
      summaryGrid.innerHTML = `
        <div class="tu-metric"><div class="tu-metric-lbl">Total Loss</div><div class="tu-metric-val" style="color:#D85A30">$${totalLoss.toFixed(2)}</div></div>
        <div class="tu-metric"><div class="tu-metric-lbl">Items analyzed</div><div class="tu-metric-val">${withSales.length || enriched.length}</div></div>
        <div class="tu-metric"><div class="tu-metric-lbl">No sales data</div><div class="tu-metric-val" style="color:#9ca3af">${noSales.length}</div></div>
      `;
    }

    body.innerHTML = enriched.map(r => {
      const usedFmt = r.used !== null ? r.used.toFixed(2) : '—';
      const soldFmt = r.sold !== null ? r.sold.toFixed(2) : '<span class="muted">No data</span>';
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
      return `<tr>
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
      </tr>`;
    }).join('') || '<tr><td colspan="10" class="muted" style="text-align:center;padding:20px">No items found.</td></tr>';
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
  async function generatePdf() {
    if (!_currentWeek) return;
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
      const used = r.used !== null ? Number(r.used) : null;
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

    pdf.save(`theoretical_usage_${_currentWeek.week_start}.pdf`);
    if (typeof setStatus === 'function') setStatus('Theoretical Usage PDF generated.');
  }

  // ─── Email modal ──────────────────────────────────────────────────
  function openEmailModal() {
    if (typeof window.BarStockEmailCostReport !== 'undefined' && window.BarStockEmailCostReport.openModal) {
      alert('Email for Theoretical Usage coming soon.');
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
    saveNotesFromModal
  };

})();
