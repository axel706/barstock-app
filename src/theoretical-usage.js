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
  function parseSalesCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return new Map();
    const headers = lines[0].split(',').map(h => h.trim().toUpperCase());
    const itemIdx = headers.findIndex(h => h.includes('ITEM') || h.includes('PRODUCT') || h === 'NAME');
    const soldIdx = headers.findIndex(h => h.includes('SOLD') || h.includes('QUANTITY') || h.includes('QTY') || h.includes('UNITS'));
    if (itemIdx === -1 || soldIdx === -1) throw new Error('CSV must have Item/Product and Sold/Quantity columns.');
    const result = new Map();
    for (const line of lines.slice(1)) {
      const cols = line.split(',');
      const item = (cols[itemIdx] || '').trim();
      const sold = parseFloat(cols[soldIdx]) || 0;
      if (item) result.set(item.toUpperCase(), sold);
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
    renderWeekDetail(weekStart);
  }

  async function renderWeekDetail(weekStart) {
    const rows = await loadWeekDetail(weekStart);
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
      return { ...r, used, sold, variance, variancePct, loss };
    });

    // Sort by loss desc (most loss first), nulls last
    enriched.sort((a, b) => {
      if (a.loss === null && b.loss === null) return 0;
      if (a.loss === null) return 1;
      if (b.loss === null) return -1;
      return b.loss - a.loss;
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

      return `<tr>
        <td>${r.code || ''}</td>
        <td style="font-weight:500">${r.item_name}</td>
        <td>${typeof badge === 'function' ? badge(r.vendor) : r.vendor}</td>
        <td>${usedFmt}</td>
        <td>${soldFmt}</td>
        <td>${varianceFmt}</td>
        <td>${variancePctFmt}</td>
        <td>${lossFmt}</td>
        <td>${statusBadge}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="9" class="muted" style="text-align:center;padding:20px">No items found.</td></tr>';
  }

  function showWeekList() {
    _currentWeek = null;
    document.getElementById('tuWeekListView').classList.remove('hidden');
    document.getElementById('tuWeekDetailView').classList.add('hidden');
  }

  // ─── Upload Sales CSV ─────────────────────────────────────────────
  function initCsvUpload() {
    const input = document.getElementById('tuSalesCsvFile');
    if (!input) return;
    input.addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f || !_currentWeek) return;
      try {
        const text = await f.text();
        const salesMap = parseSalesCsv(text);
        _salesData.set(_currentWeek.week_start, salesMap);
        renderWeekDetail(_currentWeek.week_start);
        if (typeof setStatus === 'function') setStatus(`Sales CSV loaded: ${salesMap.size} items matched for week of ${formatWeekLabel(_currentWeek.week_start)}.`);
      } catch (err) {
        alert(err.message || String(err));
      }
      e.target.value = '';
    });
  }

  // ─── Generate PDF ─────────────────────────────────────────────────
  async function generatePdf() {
    if (!_currentWeek) return;
    const rows = await loadWeekDetail(_currentWeek.week_start);
    const salesMap = _salesData.get(_currentWeek.week_start) || new Map();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 36;
    let y = margin;

    const location = (window.BARSTOCK_CONFIG?.LOCATION_NAME || 'The Crown Tavern').toUpperCase();
    const weekLabel = formatWeekLabel(_currentWeek.week_start);

    // Header
    const hdrH = y + 42;
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, pageW, hdrH, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22); pdf.setTextColor(248, 250, 252);
    pdf.text('BarStock', margin, y + 16);
    const bsW = pdf.getTextWidth('BarStock');
    pdf.setFillColor(56, 189, 248);
    pdf.circle(margin + bsW + 3.5, y + 13.5, 2.6, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(100, 116, 139);
    pdf.text('PRO', margin + bsW + 9, y + 16);
    const locW = pdf.getTextWidth(location) + 16;
    pdf.setFillColor(56, 189, 248);
    pdf.roundedRect(margin, y + 20, locW, 14, 7, 7, 'F');
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(8);
    pdf.text(location, margin + locW / 2, y + 30, { align: 'center' });
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(248, 250, 252);
    pdf.text('THEORETICAL USAGE', pageW - margin, y + 14, { align: 'right' });
    const wkW = pdf.getTextWidth(weekLabel) + 16;
    pdf.setFillColor(56, 189, 248);
    pdf.roundedRect(pageW - margin - wkW, y + 20, wkW, 14, 7, 7, 'F');
    pdf.setTextColor(15, 23, 42); pdf.setFontSize(8);
    pdf.text(weekLabel, pageW - margin - wkW / 2, y + 30, { align: 'center' });
    y = hdrH;
    pdf.setFillColor(56, 189, 248);
    pdf.rect(0, y, pageW, 3, 'F');
    y += 20;

    // Enriched data
    const enriched = rows.map(r => {
      const used = r.used !== null ? Number(r.used) : null;
      const sold = salesMap.size ? matchSold(r.item_name, salesMap) : null;
      const variance = used !== null && sold !== null ? used - sold : null;
      const variancePct = variance !== null && sold > 0 ? (variance / sold) * 100 : null;
      const loss = variance !== null ? variance * Number(r.value || 0) : null;
      return { ...r, used, sold, variance, variancePct, loss };
    }).sort((a, b) => {
      if (a.loss === null && b.loss === null) return 0;
      if (a.loss === null) return 1;
      if (b.loss === null) return -1;
      return b.loss - a.loss;
    });

    const withLoss = enriched.filter(r => r.variance !== null && r.variance > 0);
    const totalLoss = withLoss.reduce((s, r) => s + (r.loss || 0), 0);
    const noSales = enriched.filter(r => r.used > 0 && r.sold === null);
    const top6Loss = withLoss.slice(0, 6).reduce((s, r) => s + (r.loss || 0), 0);
    const top6Pct = totalLoss > 0 ? Math.round((top6Loss / totalLoss) * 100) : 0;

    // Summary table
    pdf.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Metric', 'Value']],
      body: [
        ['Total Loss', `$${totalLoss.toFixed(2)}`],
        ['Items analyzed', String(enriched.length)],
        ['Items with 0 sold (used > 0)', String(noSales.length)],
        ['Top 6 share of total loss', `~${top6Pct}%`],
      ],
      headStyles: { fillColor: [15, 23, 42], textColor: [248, 250, 252], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 200 }, 1: { cellWidth: 150 } },
      theme: 'grid',
    });
    y = pdf.lastAutoTable.finalY + 16;

    // Items table
    const tableRows = enriched.map(r => [
      r.item_name,
      r.variance !== null ? (r.variance > 0 ? '+' : '') + r.variance.toFixed(2) : '—',
      r.loss !== null && r.loss > 0 ? `$${r.loss.toFixed(2)}` : '—',
      r.sold === null ? 'No sales data' : r.variance > 0.1 ? 'Potential loss' : 'OK'
    ]);

    pdf.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Product', 'Variance Units', 'Loss ($)', 'Notes']],
      body: tableRows,
      headStyles: { fillColor: [15, 23, 42], textColor: [248, 250, 252], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 200 }, 1: { halign: 'right', cellWidth: 80 }, 2: { halign: 'right', cellWidth: 80 } },
      theme: 'grid',
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const val = parseFloat(data.cell.raw);
          if (val > 0) data.cell.styles.textColor = [168, 45, 45];
          else if (val < 0) data.cell.styles.textColor = [29, 158, 117];
        }
      }
    });

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

  window.BarStockTheoreticalUsage = {
    refresh,
    openWeek,
    showWeekList,
    toggleEventWeek,
    generatePdf,
    openEmailModal
  };

})();
