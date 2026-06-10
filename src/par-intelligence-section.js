// par-intelligence-section.js — Pour-IQ Phase 5: Par Intelligence Section
// Renders the standalone Pour-IQ section with filter chips, metrics, and per-item table.

(function() {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let _items = [];       // enriched items from state.master + par adjustments
  let _activeFilter = 'over';
  let _activeVendor = 'ALL';

  // ── Public API ─────────────────────────────────────────────────────────────
  window.PourIqSection = {
    render,
    refresh,
  };

  // ── Event hooks ────────────────────────────────────────────────────────────
  // Refresh when inventory loads from Supabase (covers startup + realtime updates)
  window.addEventListener('barstock:inventoryUpdated', () => {
    if (typeof refreshParAdjustments === 'function') {
      refreshParAdjustments().then(() => refresh()).catch(console.warn);
    } else {
      refresh();
    }
  });

  // ── Entry point ────────────────────────────────────────────────────────────
  function refresh() {
    if (!window.state || !window.state.master || !window.state.master.length) {
      const root = document.getElementById('pourIqRoot');
      if (root) root.innerHTML = '<div class="piq-empty"><i class="ti ti-brain" aria-hidden="true"></i>Load a master file to see Pour-IQ recommendations.</div>';
      return;
    }
    _items = buildItems(window.state.master);
    render();
    updateFocusGridBadge();
  }

  function render() {
    const root = document.getElementById('pourIqRoot');
    if (!root) return;
    const counts = getCounts();
    // Auto-select best default filter
    if (_activeFilter === 'over' && counts.over === 0) {
      if (counts.under > 0) _activeFilter = 'under';
      else if (counts.on > 0) _activeFilter = 'on';
      else _activeFilter = 'observing';
    }
    root.innerHTML = '';
    root.appendChild(buildSection());
    applyFilter(_activeFilter);
  }

  // ── Data builder ───────────────────────────────────────────────────────────
  // parAdjustments is the global Map filled by refreshParAdjustments()
  // Map key: `${row.item}||${row.code || ''}`
  // Map value: { status, normalWeeks, avgUsed, suggestedOptimal, currentSuggested, delta, adjustment }

  function buildItems(master) {
    const map = window.parAdjustments || new Map();
    return master.map(item => {
      const k = `${item.item}||${item.code || ''}`;
      const par = map.get(k);
      const piq = resolvePiq(item, par);
      return { ...item, _piq: piq };
    });
  }

  function resolvePiq(item, par) {
    if (!par) {
      return { status: 'observing', optimal: null, adjustment: 0, trend: null,
               avgUsed: null, weeksNormal: 0, currentSuggested: Number(item.suggested || 0) };
    }

    if (par.status === 'observing') {
      return { status: 'observing', optimal: null, adjustment: 0, trend: null,
               avgUsed: null, weeksNormal: par.normalWeeks || 0,
               currentSuggested: Number(item.suggested || 0) };
    }

    if (par.status === 'never_ordered') {
      return { status: 'review', optimal: null, adjustment: 0, trend: null,
               avgUsed: null, weeksNormal: par.normalWeeks || 0,
               currentSuggested: par.currentSuggested };
    }

    // status === 'active'
    const piqStatus = par.adjustment > 0 ? 'under' : par.adjustment < 0 ? 'over' : 'on';
    return {
      status: piqStatus,
      optimal: par.suggestedOptimal,
      adjustment: par.adjustment,
      trend: par.trendDelta !== undefined ? par.trendDelta : null,
      avgUsed: par.avgUsed,
      weeksNormal: par.normalWeeks,
      currentSuggested: par.currentSuggested,
    };
  }

  // ── Metrics ────────────────────────────────────────────────────────────────
  function getCounts() {
    const counts = { over: 0, on: 0, under: 0, observing: 0, review: 0 };
    _items.forEach(it => {
      const s = it._piq.status;
      if (counts[s] !== undefined) counts[s]++;
    });
    return counts;
  }

  function getEstimatedSavings() {
    return _items
      .filter(it => it._piq.status === 'over')
      .reduce((sum, it) => {
        const delta = Math.abs(it._piq.adjustment);
        const value = parseFloat(it.value) || 0;
        return sum + delta * value;
      }, 0);
  }

  // ── DOM builder ────────────────────────────────────────────────────────────
  function buildSection() {
    const counts = getCounts();
    const savings = getEstimatedSavings();
    const pending = counts.over + counts.under;

    const wrap = document.createElement('div');
    wrap.className = 'piq-section';

    // Header
    const header = document.createElement('div');
    header.className = 'piq-header';
    header.innerHTML = `
      <div class="piq-title">
        <i class="ti ti-brain" aria-hidden="true"></i>
        Pour-IQ&#x2122; &mdash; Par Intelligence
        <span class="piq-pending-badge" id="piqPendingBadge" style="display:${pending > 0 ? 'inline-flex' : 'none'}">
          ${pending} pending
        </span>
      </div>
      <button class="piq-apply-all-btn" id="piqApplyAllBtn" onclick="PourIqSection._applyAll()">
        <i class="ti ti-checks" aria-hidden="true"></i> Apply all pending
      </button>`;
    wrap.appendChild(header);

    // Filter chips
    const filterRow = document.createElement('div');
    filterRow.className = 'piq-filter-row';
    filterRow.innerHTML = `
      <div class="piq-filter-chip piq-chip-over" id="piqChip-over" onclick="PourIqSection._setFilter('over')" role="button" tabindex="0">
        <div class="piq-chip-label"><span class="piq-chip-dot" style="background:#E24B4A"></span>Over par</div>
        <div class="piq-chip-value" id="piqVal-over">${counts.over}</div>
        <div class="piq-chip-sub">reduce suggested</div>
      </div>
      <div class="piq-filter-chip piq-chip-on" id="piqChip-on" onclick="PourIqSection._setFilter('on')" role="button" tabindex="0">
        <div class="piq-chip-label"><span class="piq-chip-dot" style="background:#639922"></span>On par</div>
        <div class="piq-chip-value" id="piqVal-on">${counts.on}</div>
        <div class="piq-chip-sub">within &plusmn;1</div>
      </div>
      <div class="piq-filter-chip piq-chip-under" id="piqChip-under" onclick="PourIqSection._setFilter('under')" role="button" tabindex="0">
        <div class="piq-chip-label"><span class="piq-chip-dot" style="background:#EF9F27"></span>Under par</div>
        <div class="piq-chip-value" id="piqVal-under">${counts.under}</div>
        <div class="piq-chip-sub">raise suggested</div>
      </div>
      <div class="piq-filter-chip piq-chip-savings piq-chip-no-filter" id="piqChip-savings">
        <div class="piq-chip-label"><span class="piq-chip-dot" style="background:#1D9E75"></span>Est. savings</div>
        <div class="piq-chip-value" id="piqVal-savings">$${savings.toFixed(0)}</div>
        <div class="piq-chip-sub">if over par applied</div>
      </div>
      ${counts.observing > 0 ? `
      <div class="piq-filter-chip piq-chip-observing" id="piqChip-observing" onclick="PourIqSection._setFilter('observing')" role="button" tabindex="0">
        <div class="piq-chip-label"><span class="piq-chip-dot" style="background:#888780"></span>Observing</div>
        <div class="piq-chip-value" id="piqVal-observing">${counts.observing}</div>
        <div class="piq-chip-sub">building baseline</div>
      </div>` : ''}`;
    wrap.appendChild(filterRow);

    // Vendor filter chips
    const vendorRow = document.createElement('div');
    vendorRow.className = 'tabs';
    vendorRow.id = 'piqVendorTabs';
    wrap.appendChild(vendorRow);

    // Baseline message when no actionable items yet
    if (counts.observing > 0 && counts.over === 0 && counts.under === 0 && counts.on === 0) {
      const weeksData = Math.max(..._items.map(it => it._piq.weeksNormal || 0));
      const weeksMsg = weeksData === 0
        ? 'First cycle in progress &mdash; complete <strong>4 weekly cycles</strong> to unlock recommendations.'
        : `<strong>${weeksData} week${weeksData !== 1 ? 's' : ''}</strong> of data collected &mdash; <strong>${Math.max(0, 4 - weeksData)} more</strong> needed for recommendations.`;
      const msg = document.createElement('div');
      msg.className = 'piq-baseline-msg';
      msg.innerHTML = `<i class="ti ti-chart-line" aria-hidden="true"></i> ${weeksMsg}`;
      wrap.appendChild(msg);
    }

    // Table
    const tableWrap = document.createElement('div');
    tableWrap.className = 'piq-table-wrap';
    tableWrap.innerHTML = `
      <table class="piq-table">
        <colgroup>
          <col style="width:23%"><col style="width:13%"><col style="width:9%">
          <col style="width:9%"><col style="width:9%"><col style="width:8%">
          <col style="width:13%"><col style="width:8%"><col style="width:10%">
        </colgroup>
        <thead>
          <tr>
            <th>Item</th><th>Vendor</th><th>Suggested</th><th>Optimal</th>
            <th>Avg/wk</th><th>Weeks</th><th>Trend</th><th>Adjustment</th><th>Action</th>
          </tr>
        </thead>
        <tbody id="piqTableBody"></tbody>
      </table>
      <div class="piq-empty" id="piqEmpty" style="display:none;">
        <i class="ti ti-mood-happy" aria-hidden="true"></i>
        No items in this category
      </div>`;
    wrap.appendChild(tableWrap);

    // Populate rows
    const tbody = tableWrap.querySelector('#piqTableBody');
    const sorted = sortItems(_items);
    sorted.forEach(item => tbody.appendChild(buildRow(item)));

    return wrap;
  }

  function sortItems(items) {
    return [...items].sort((a, b) => {
      const order = { over: 0, under: 1, on: 2, review: 3, observing: 4 };
      const os = order[a._piq.status] ?? 5;
      const ob = order[b._piq.status] ?? 5;
      if (os !== ob) return os - ob;
      return Math.abs(b._piq.adjustment) - Math.abs(a._piq.adjustment);
    });
  }

  function buildRow(item) {
    const { status, optimal, adjustment, trend } = item._piq;
    const { avgUsed, weeksNormal, currentSuggested } = item._piq;
    const suggested = currentSuggested ?? '—';
    const avgUsedStr = avgUsed != null ? avgUsed.toFixed(1) : '—';
    const weeksStr = weeksNormal != null ? weeksNormal : '—';

    const tr = document.createElement('tr');
    tr.dataset.status = status;
    tr.dataset.vendor = item.vendor || '';
    tr.innerHTML = `
      <td style="font-weight:500">${escHtml(item.item || item.name || '')}</td>
      <td class="piq-muted">${escHtml(item.vendor || '')}</td>
      <td>${suggested}</td>
      <td>${optimal ?? '—'}</td>
      <td>${avgUsedStr}</td>
      <td>${weeksStr}</td>
      <td>${buildTrendCell(trend)}</td>
      <td>${buildAdjustmentChip(status, adjustment)}</td>
      <td>${buildActionCell(item, status, adjustment)}</td>`;
    return tr;
  }

  function buildTrendCell(delta) {
    if (delta === null || delta === undefined) return '<span class="piq-muted">—</span>';
    if (delta > 0.2)  return `<span class="piq-trend piq-trend-up"><i class="ti ti-trending-up" aria-hidden="true"></i> +${delta.toFixed(1)}</span>`;
    if (delta < -0.2) return `<span class="piq-trend piq-trend-down"><i class="ti ti-trending-down" aria-hidden="true"></i> ${delta.toFixed(1)}</span>`;
    return `<span class="piq-trend piq-trend-flat"><i class="ti ti-arrows-horizontal" aria-hidden="true"></i> ${delta.toFixed(1)}</span>`;
  }

  function buildAdjustmentChip(status, adjustment) {
    if (status === 'over')      return '<span class="piq-pill piq-pill-red">&minus;1</span>';
    if (status === 'under')     return '<span class="piq-pill piq-pill-amber">+1</span>';
    if (status === 'on')        return '<span class="piq-pill piq-pill-green">&#x2713;</span>';
    if (status === 'observing') return '<span class="piq-pill piq-pill-gray">Observing</span>';
    if (status === 'review')    return '<span class="piq-pill piq-pill-blue">Review</span>';
    return '—';
  }

  function buildActionCell(item, status, adjustment) {
    if (status === 'over' || status === 'under') {
      const id = escHtml(item.id || item.code || '');
      return `<button class="piq-act-btn" onclick="PourIqSection._applyOne('${id}')">Apply</button>`;
    }
    return '<span class="piq-act-none">—</span>';
  }

  // ── Vendor filter ─────────────────────────────────────────────────────────────
  function renderVendorTabs() {
    const el = document.getElementById('piqVendorTabs');
    if (!el) return;
    const vendors = ['ALL', ...Array.from(new Set(_items.map(it => it.vendor).filter(Boolean))).sort()];
    el.innerHTML = vendors.map(v =>
      `<div class="oh-filter-chip ${_activeVendor === v ? 'active' : ''}" onclick="PourIqSection._setVendor('${v.replace(/'/g, "\'")}')">${v}</div>`
    ).join('');
  }

  window.PourIqSection._setVendor = function(v) {
    _activeVendor = v;
    applyFilter(_activeFilter);
  };

  // ── Filter ─────────────────────────────────────────────────────────────────
  window.PourIqSection._setFilter = function(f) {
    if (f === 'savings') return;
    _activeFilter = f;
    _activeVendor = 'ALL';
    applyFilter(f);
  };

  function applyFilter(f) {
    // Chip active states
    ['over','on','under','savings','observing'].forEach(k => {
      const el = document.getElementById('piqChip-' + k);
      if (!el) return;
      el.classList.remove('piq-chip-active-over','piq-chip-active-on','piq-chip-active-under','piq-chip-active-observing');
      if (k === f) el.classList.add(k === 'observing' ? 'piq-chip-active-observing' : 'piq-chip-active-' + f);
    });

    renderVendorTabs();

    // Rows — filter by status AND vendor
    const rows = document.querySelectorAll('#piqTableBody tr');
    let visible = 0;
    rows.forEach(row => {
      const statusMatch = row.dataset.status === f;
      const vendorMatch = _activeVendor === 'ALL' || row.dataset.vendor === _activeVendor;
      const show = statusMatch && vendorMatch;
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    const empty = document.getElementById('piqEmpty');
    if (empty) empty.style.display = visible === 0 ? 'block' : 'none';

    // Apply all btn visibility
    const btn = document.getElementById('piqApplyAllBtn');
    if (btn) btn.style.display = (f === 'over' || f === 'under') ? 'inline-flex' : 'none';
  }

  // ── Apply ──────────────────────────────────────────────────────────────────
  window.PourIqSection._applyOne = async function(itemId) {
    const item = _items.find(it => (it.id || it.code) == itemId);
    if (!item) return;
    await applyAdjustment(item);
    await refresh();
  };

  window.PourIqSection._applyAll = async function() {
    const actionable = _items.filter(it =>
      it._piq.status === 'over' || it._piq.status === 'under'
    );
    if (actionable.length === 0) return;
    const confirmed = confirm(`Apply ${actionable.length} par adjustment${actionable.length > 1 ? 's' : ''}?`);
    if (!confirmed) return;
    await Promise.all(actionable.map(applyAdjustment));
    await refresh();
  };

  async function applyAdjustment(item) {
    const { currentSuggested, adjustment } = item._piq;
    if (adjustment === 0) return;
    const newSuggested = currentSuggested + adjustment;
    try {
      await window.supabase
        .from('inventory_items')
        .update({ suggested: newSuggested })
        .eq('id', item.id);
      item._piq.currentSuggested = newSuggested;
      item._piq.adjustment = 0;
      item._piq.status = 'on';
      if (item.suggested !== undefined) item.suggested = newSuggested;
      const k = `${item.item}||${item.code || ''}`;
      if (window.parAdjustments && window.parAdjustments.has(k)) {
        const par = window.parAdjustments.get(k);
        par.currentSuggested = newSuggested;
        par.adjustment = 0;
      }
    } catch (err) {
      console.error('[PourIqSection] applyAdjustment error', err);
    }
  }

  // ── Focus grid badge ───────────────────────────────────────────────────────
  function updateFocusGridBadge() {
    const counts = getCounts();
    if (typeof window.bsUpdatePourIqBadge === 'function') {
      window.bsUpdatePourIqBadge(counts.over, counts.under);
    }
  }

  // ── Utils ──────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
