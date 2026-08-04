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

  // ¿Este articulo ya se ajusto en el ciclo semanal actual?
  // La regla de negocio es un paso por semana: una vez movido, se queda
  // quieto hasta el siguiente ciclo aunque todavia no llegue al optimo.
  function wasAdjustedThisWeek(item) {
    const adjusted = item.parAdjustedWeek;
    if (!adjusted) return false;

    let weekStart = null;
    try {
      if (window.BarStockParIntelligence?.getEffectiveWeekStart) {
        weekStart = window.BarStockParIntelligence.getEffectiveWeekStart();
      }
    } catch (e) { /* sin semana de referencia, no se bloquea nada */ }

    if (!weekStart) return false;
    // Ambas son 'YYYY-MM-DD', asi que comparar como texto es correcto
    return String(adjusted) >= String(weekStart);
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
    let piqStatus = par.adjustment > 0 ? 'under' : par.adjustment < 0 ? 'over' : 'on';

    // Ya se movio esta semana: sale de pendientes hasta el proximo ciclo.
    // Se conserva el optimo y la distancia para poder mostrar cuanto falta.
    if (piqStatus !== 'on' && wasAdjustedThisWeek(item)) {
      piqStatus = 'adjusted';
    }

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
    const counts = { over: 0, on: 0, under: 0, observing: 0, review: 0, adjusted: 0 };
    _items.forEach(it => {
      const s = it._piq.status;
      if (counts[s] !== undefined) counts[s]++;
    });
    return counts;
  }

  // ── Metricas de impacto ────────────────────────────────────────────────────

  function unitValue(item) {
    return parseFloat(item.value) || 0;
  }

  // Dinero que libera (o cuesta) el paso de ESTA semana. Como el ajuste es
  // siempre de 1, es el valor unitario.
  function weeklyImpact(item) {
    return Math.abs(item._piq.adjustment || 0) * unitValue(item);
  }

  // Pasos que faltan para llegar al rango objetivo. La regla existente solo
  // mueve cuando la diferencia pasa de 1, asi que el destino real es
  // distancia 1, no 0: por eso es |delta| - 1.
  function stepsRemaining(item) {
    const { currentSuggested, optimal } = item._piq;
    if (optimal == null || currentSuggested == null) return 0;
    return Math.max(0, Math.abs(currentSuggested - optimal) - 1);
  }

  // Dinero total todavia atrapado, sumando todos los pasos que faltan.
  // Es el horizonte: cuanto queda por recuperar si sigues cada semana.
  function getTotalOpportunity() {
    return _items.reduce((sum, it) => {
      if (it._piq.status !== 'over' && it._piq.status !== 'adjusted') return sum;
      const { currentSuggested, optimal } = it._piq;
      if (optimal == null || currentSuggested == null) return sum;
      if (currentSuggested <= optimal) return sum;
      return sum + (currentSuggested - optimal - 1) * unitValue(it);
    }, 0);
  }

  // Dias de existencia que quedan al ritmo de consumo actual.
  // Esto es lo accionable para un articulo bajo par: "+1" no dice nada,
  // "te quedan 4 dias" si.
  function daysLeft(item) {
    const avg = item._piq.avgUsed;
    const onHand = parseFloat(item.onHand);
    if (!avg || avg <= 0 || !isFinite(onHand)) return null;
    return Math.floor((onHand / avg) * 7);
  }

  function fmtMoneyShort(n) {
    return '$' + Math.round(n).toLocaleString();
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
    const opportunity = getTotalOpportunity();
    const pending = counts.over + counts.under;
    // Cuantas semanas faltan para que el articulo mas desviado converja
    const maxSteps = _items.reduce((m, it) => Math.max(m, stepsRemaining(it)), 0);

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
      <div class="piq-header-actions">
        <button class="piq-queue-btn" id="piqQueueBtn" onclick="PourIqSection._openQueue()">
          <i class="ti ti-cards" aria-hidden="true"></i> Review one by one
        </button>
        <button class="piq-apply-all-btn" id="piqApplyAllBtn" onclick="PourIqSection._applyAll()">
          <i class="ti ti-checks" aria-hidden="true"></i> Apply all pending
        </button>
      </div>`;
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
        <div class="piq-chip-label"><span class="piq-chip-dot" style="background:#1D9E75"></span>Frees up this week</div>
        <div class="piq-chip-value" id="piqVal-savings">${fmtMoneyShort(savings)}</div>
        <div class="piq-chip-sub">${fmtMoneyShort(opportunity)} total &middot; ${maxSteps} wk${maxSteps === 1 ? '' : 's'} to go</div>
      </div>
      ${counts.adjusted > 0 ? `
      <div class="piq-filter-chip piq-chip-adjusted" id="piqChip-adjusted" onclick="PourIqSection._setFilter('adjusted')" role="button" tabindex="0">
        <div class="piq-chip-label"><span class="piq-chip-dot" style="background:#38bdf8"></span>Adjusted</div>
        <div class="piq-chip-value" id="piqVal-adjusted">${counts.adjusted}</div>
        <div class="piq-chip-sub">done this week</div>
      </div>` : ''}
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
    vendorRow.style.marginBottom = '12px';
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
          <col style="width:26%"><col style="width:13%"><col style="width:17%">
          <col style="width:9%"><col style="width:8%"><col style="width:11%">
          <col style="width:8%"><col style="width:8%">
        </colgroup>
        <thead>
          <tr>
            <th>Item</th><th>Vendor</th><th>Par &rarr; target</th>
            <th>Avg/wk</th><th>Weeks</th><th>Impact</th><th>Adjustment</th><th>Action</th>
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
    const order = { under: 0, over: 1, adjusted: 2, on: 3, review: 4, observing: 5 };
    return [...items].sort((a, b) => {
      const os = order[a._piq.status] ?? 9;
      const ob = order[b._piq.status] ?? 9;
      if (os !== ob) return os - ob;

      // Bajo par: primero lo que se acaba antes. Quedarse sin producto
      // cuesta ventas, y 4 dias es mas urgente que 20.
      if (a._piq.status === 'under') {
        const da = daysLeft(a), db = daysLeft(b);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      }

      // Sobre par: primero lo que mas dinero libera. Un ajuste en algo de
      // $62 la botella no vale lo mismo que uno de $8, y antes se ordenaban
      // por magnitud del ajuste, que siempre es 1 y por lo tanto no ordenaba
      // nada.
      return weeklyImpact(b) - weeklyImpact(a);
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
      <td>${buildTargetCell(item)}</td>
      <td>${avgUsedStr}</td>
      <td>${weeksStr}</td>
      <td>${buildImpactCell(item)}</td>
      <td>${buildAdjustmentChip(status, adjustment)}</td>
      <td>${buildActionCell(item, status, adjustment)}</td>`;
    return tr;
  }

  // "16 → 9" con barra de avance y semanas restantes. Sin esto, un articulo
  // a una semana de llegar y otro a siete se ven identicos: ambos dicen -1.
  function buildTargetCell(item) {
    const { currentSuggested, optimal, status } = item._piq;
    if (optimal == null || currentSuggested == null) {
      return `<span class="piq-muted">${currentSuggested ?? '—'}</span>`;
    }

    const steps = stepsRemaining(item);
    const gap = Math.abs(currentSuggested - optimal);
    // Avance sobre la distancia original conocida; si ya llego, barra llena
    const pct = gap <= 1 ? 100 : Math.round(((1 / gap) * 100));
    const color = status === 'under' ? '#EF9F27' : '#1D9E75';

    return `<div class="piq-target">
      <div class="piq-target-nums">${currentSuggested} <span class="piq-muted">&rarr;</span> <strong>${optimal}</strong></div>
      <div class="piq-target-bar"><div class="piq-target-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="piq-target-sub">${steps === 0 ? 'last step' : steps + ' wk' + (steps === 1 ? '' : 's') + ' to go'}</div>
    </div>`;
  }

  // Para los que sobran: dinero. Para los que faltan: dias de existencia.
  // Son problemas distintos y se miden distinto.
  function buildImpactCell(item) {
    const { status } = item._piq;

    if (status === 'under') {
      const d = daysLeft(item);
      if (d === null) return '<span class="piq-muted">—</span>';
      const cls = d <= 5 ? 'piq-days-crit' : d <= 10 ? 'piq-days-warn' : 'piq-days-ok';
      return `<span class="piq-days ${cls}">${d} day${d === 1 ? '' : 's'}</span>`;
    }

    if (status === 'over' || status === 'adjusted') {
      const v = weeklyImpact(item);
      if (!v) return '<span class="piq-muted">—</span>';
      return `<span class="piq-impact">${fmtMoneyShort(v)}</span>`;
    }

    return '<span class="piq-muted">—</span>';
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
    if (status === 'adjusted')  return '<span class="piq-pill piq-pill-blue">Done this week</span>';
    if (status === 'observing') return '<span class="piq-pill piq-pill-gray">Observing</span>';
    if (status === 'review')    return '<span class="piq-pill piq-pill-blue">Review</span>';
    return '—';
  }

  // Clave nombre+codigo. Antes se usaba `item.id || item.code`, pero id no
  // existe y muchos articulos tienen el codigo vacio: con codigo vacio el
  // find() devolvia el primero de la lista y el ajuste se aplicaba al
  // articulo equivocado.
  // El %27 es porque encodeURIComponent NO escapa el apostrofo y esto va
  // dentro de comillas simples en el onclick.
  function itemKeyFor(item) {
    return encodeURIComponent(`${item.item || ''}||${item.code || ''}`).replace(/'/g, '%27');
  }

  function buildActionCell(item, status, adjustment) {
    if (status === 'over' || status === 'under') {
      return `<button class="piq-act-btn" onclick="PourIqSection._applyOne('${itemKeyFor(item)}')">Apply</button>`;
    }
    return '<span class="piq-act-none">—</span>';
  }

  // ── Vendor filter ─────────────────────────────────────────────────────────────
  function renderVendorTabs() {
    const el = document.getElementById('piqVendorTabs');
    if (!el) return;
    const vendors = ['ALL', ...Array.from(new Set(_items.map(it => it.vendor).filter(Boolean))).sort()];
    el.innerHTML = vendors.map(v =>
      // El escape viejo era un no-op: en JS "\'" es simplemente "'".
      // Hay que escapar con barra invertida real.
      `<div class="oh-filter-chip ${_activeVendor === v ? 'active' : ''}" onclick="PourIqSection._setVendor('${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">${escHtml(v)}</div>`
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
    ['over','on','under','savings','observing','adjusted'].forEach(k => {
      const el = document.getElementById('piqChip-' + k);
      if (!el) return;
      el.classList.remove('piq-chip-active-over','piq-chip-active-on','piq-chip-active-under','piq-chip-active-observing','piq-chip-active-adjusted');
      if (k === f) el.classList.add('piq-chip-active-' + f);
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
  window.PourIqSection._applyOne = async function(itemKey) {
    const decoded = decodeURIComponent(itemKey);
    const item = _items.find(it => `${it.item || ''}||${it.code || ''}` === decoded);
    if (!item) return;

    try {
      await applyAdjustment(item);
      if (typeof saveState === 'function') saveState();
      if (typeof render === 'function') render();
      if (typeof setStatus === 'function') {
        setStatus(`Par updated for '${item.item}' → ${item._piq.currentSuggested}`);
      }
    } catch (err) {
      console.error('[PourIqSection] applyAdjustment error', err);
      if (typeof setStatus === 'function') {
        setStatus(`Could not update par for '${item.item}'.`);
      }
    }
    refresh();
  };

  window.PourIqSection._applyAll = async function() {
    // Respeta el filtro de vendor activo: si estas viendo BREAKTHRU,
    // "Apply all" no debe tocar los demas vendors a tus espaldas.
    // 'adjusted' queda fuera a proposito: ya uso su paso de esta semana.
    const actionable = _items.filter(it =>
      (it._piq.status === 'over' || it._piq.status === 'under') &&
      (_activeVendor === 'ALL' || it.vendor === _activeVendor)
    );
    if (actionable.length === 0) return;

    const scope = _activeVendor === 'ALL' ? '' : ` for ${_activeVendor}`;
    if (!confirm(`Apply ${actionable.length} par adjustment${actionable.length > 1 ? 's' : ''}${scope}?`)) return;

    // En serie, no en paralelo: 44 PATCH simultaneos a Supabase se
    // estrangulan entre si y algunos fallan en silencio.
    let ok = 0;
    const failed = [];
    for (const item of actionable) {
      try {
        await applyAdjustment(item);
        ok++;
      } catch (err) {
        console.error('[PourIqSection] applyAdjustment error', err);
        failed.push(item.item);
      }
    }

    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();

    if (typeof setStatus === 'function') {
      setStatus(failed.length
        ? `${ok} par adjustments applied. ${failed.length} failed: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`
        : `${ok} par adjustment${ok > 1 ? 's' : ''} applied${scope}.`);
    }

    refresh();
  };

  // Cache del location_id: sin esto cada Apply del "Apply all" haria su
  // propia consulta de locacion, 44 veces seguidas para nada.
  let _locationIdCache = null;

  async function getLocationId() {
    if (_locationIdCache) return _locationIdCache;
    const cfg = window.BARSTOCK_CONFIG || {};
    const res = await fetch(
      `${cfg.SUPABASE_URL}/rest/v1/locations?name=eq.${encodeURIComponent(cfg.LOCATION_NAME)}&select=id`,
      { headers: { apikey: cfg.SUPABASE_KEY, Authorization: `Bearer ${cfg.SUPABASE_KEY}` } }
    );
    const data = await res.json();
    const id = Array.isArray(data) && data[0] ? data[0].id : null;
    if (!id) throw new Error('Location not found: ' + cfg.LOCATION_NAME);
    _locationIdCache = id;
    return id;
  }

  // Esta funcion estaba rota desde siempre y fallaba en silencio:
  // usaba window.supabase.from(...) — pero window.supabase es la libreria,
  // no un cliente conectado, y no tiene .from() — y filtraba por item.id,
  // un campo que los objetos de state.master nunca han tenido.
  // El try/catch se tragaba el error, asi que Apply no hacia nada y los
  // pendientes nunca bajaban.
  //
  // Ahora usa el mismo patron que applyInvPourIq() en index.html, que es
  // el que si funciona: PATCH por location_id + item_name via REST.
  async function applyAdjustment(item) {
    const { currentSuggested, adjustment } = item._piq;
    if (adjustment === 0) return;

    const newSuggested = currentSuggested + adjustment;
    const cfg = window.BARSTOCK_CONFIG || {};

    const locationId = await getLocationId();

    let url = `${cfg.SUPABASE_URL}/rest/v1/inventory_items` +
              `?location_id=eq.${locationId}` +
              `&item_name=eq.${encodeURIComponent(item.item || '')}`;
    // El codigo desambigua cuando dos articulos comparten nombre
    if (item.code) url += `&code=eq.${encodeURIComponent(item.code)}`;

    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: cfg.SUPABASE_KEY,
        Authorization: `Bearer ${cfg.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        suggested: newSuggested,
        // Igual que applyInvPourIq: marca la semana en que se ajusto,
        // que es lo que evita re-ajustar el mismo item dos veces.
        par_adjusted_week: new Date().toISOString().slice(0, 10)
      })
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`No se pudo guardar '${item.item}': ${txt}`);
    }

    const adjustedWeek = new Date().toISOString().slice(0, 10);

    // La distancia al optimo se recalcula, no se pone en cero. Bajar de 16
    // a 15 no te deja "on par" cuando el optimo es 9: te deja a 6 de
    // distancia y sin pasos disponibles hasta la proxima semana.
    // Misma regla que par-intelligence.js: solo se mueve si la diferencia
    // pasa de 1.
    const optimal = item._piq.optimal;
    const newDelta = (optimal != null) ? (newSuggested - optimal) : 0;
    const newAdjustment = newDelta > 1 ? -1 : newDelta < -1 ? 1 : 0;

    // Solo despues de confirmar que la nube acepto, se actualiza lo local
    item._piq.currentSuggested = newSuggested;
    item._piq.adjustment = newAdjustment;
    // 'adjusted', no 'on': ya gasto su paso de esta semana
    item._piq.status = newAdjustment === 0 ? 'on' : 'adjusted';
    item.parAdjustedWeek = adjustedWeek;
    item.suggested = newSuggested;
    if (typeof computeToOrder === 'function') {
      item.toOrder = computeToOrder(item.onHand, newSuggested);
    }

    // state.master es el objeto real que pinta el resto de la app.
    // _items son copias ({...item}), asi que hay que tocar el original.
    const master = (window.state && window.state.master) || [];
    const target = master.find(m =>
      m.item === item.item && String(m.code || '') === String(item.code || '')
    );
    if (target) {
      target.suggested = newSuggested;
      target.parAdjustedWeek = adjustedWeek;
      if (typeof computeToOrder === 'function') {
        target.toOrder = computeToOrder(target.onHand, newSuggested);
      }
    }

    // El mapa global es la fuente de la que refresh() reconstruye todo,
    // asi que tiene que quedar con la distancia real, no en cero.
    const k = `${item.item}||${item.code || ''}`;
    if (window.parAdjustments && window.parAdjustments.has(k)) {
      const par = window.parAdjustments.get(k);
      par.currentSuggested = newSuggested;
      par.delta = newDelta;
      par.adjustment = newAdjustment;
    }
  }

  // ── Modo cola: un articulo a la vez ────────────────────────────────────────
  // Para despachar 44 pendientes sin leer una tabla. Respeta el filtro de
  // vendor activo, igual que Apply all.

  let _queue = [];
  let _queueIdx = 0;

  function queueCandidates() {
    return sortItems(_items.filter(it =>
      (it._piq.status === 'over' || it._piq.status === 'under') &&
      (_activeVendor === 'ALL' || it.vendor === _activeVendor)
    ));
  }

  window.PourIqSection._openQueue = function() {
    _queue = queueCandidates();
    _queueIdx = 0;
    if (!_queue.length) {
      if (typeof setStatus === 'function') setStatus('Nothing pending to review.');
      return;
    }
    document.addEventListener('keydown', queueKeys);
    renderQueue();
  };

  window.PourIqSection._closeQueue = function() {
    document.removeEventListener('keydown', queueKeys);
    const el = document.getElementById('piqQueueOverlay');
    if (el) el.remove();
    refresh();
  };

  window.PourIqSection._queueSkip = function() {
    _queueIdx++;
    renderQueue();
  };

  window.PourIqSection._queueApply = async function() {
    const item = _queue[_queueIdx];
    if (!item) return;
    try {
      await applyAdjustment(item);
      if (typeof saveState === 'function') saveState();
      if (typeof render === 'function') render();
    } catch (err) {
      console.error('[PourIqSection] queue apply error', err);
      if (typeof setStatus === 'function') setStatus(`Could not update par for '${item.item}'.`);
    }
    _queueIdx++;
    renderQueue();
  };

  function queueKeys(e) {
    if (e.key === 'Escape')      { e.preventDefault(); window.PourIqSection._closeQueue(); }
    else if (e.key === 'ArrowRight' || e.key === 's') { e.preventDefault(); window.PourIqSection._queueSkip(); }
    else if (e.key === 'Enter')  { e.preventDefault(); window.PourIqSection._queueApply(); }
  }

  function renderQueue() {
    let el = document.getElementById('piqQueueOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'piqQueueOverlay';
      el.className = 'piq-queue-overlay';
      document.body.appendChild(el);
    }

    const item = _queue[_queueIdx];

    // Se acabaron
    if (!item) {
      const done = _queueIdx;
      el.innerHTML = `
        <div class="piq-queue-card">
          <i class="ti ti-circle-check piq-queue-done" aria-hidden="true"></i>
          <div class="piq-queue-title">Review complete</div>
          <div class="piq-queue-sub">${done} item${done === 1 ? '' : 's'} reviewed</div>
          <div class="piq-queue-btns">
            <button class="piq-queue-primary" onclick="PourIqSection._closeQueue()">Done</button>
          </div>
        </div>`;
      return;
    }

    const { currentSuggested, optimal, avgUsed, status, adjustment } = item._piq;
    const target = currentSuggested + adjustment;
    const steps = stepsRemaining(item);
    const d = status === 'under' ? daysLeft(item) : null;

    const impact = status === 'under'
      ? (d !== null ? `${d} day${d === 1 ? '' : 's'} of stock left` : 'Running low')
      : `Frees ${fmtMoneyShort(weeklyImpact(item))} this week`;

    el.innerHTML = `
      <div class="piq-queue-card">
        <div class="piq-queue-count">${_queueIdx + 1} of ${_queue.length}</div>

        <div class="piq-queue-item">${escHtml(item.item || '')}</div>
        <div class="piq-queue-vendor">${escHtml(item.vendor || '')} &middot; ${fmtMoneyShort(unitValue(item))} per unit</div>

        <div class="piq-queue-stats">
          <div><div class="piq-queue-sl">Par now</div><div class="piq-queue-sv">${currentSuggested}</div></div>
          <div><div class="piq-queue-sl">Uses/wk</div><div class="piq-queue-sv">${avgUsed != null ? avgUsed.toFixed(1) : '—'}</div></div>
          <div><div class="piq-queue-sl">Target</div><div class="piq-queue-sv piq-queue-target">${optimal ?? '—'}</div></div>
        </div>

        <div class="piq-queue-impact ${status === 'under' ? 'piq-queue-warn' : ''}">${impact}</div>
        <div class="piq-queue-sub">${steps === 0 ? 'Last step to target' : steps + ' more week' + (steps === 1 ? '' : 's') + ' after this one'}</div>

        <div class="piq-queue-btns">
          <button class="piq-queue-skip" onclick="PourIqSection._queueSkip()">Skip</button>
          <button class="piq-queue-primary" onclick="PourIqSection._queueApply()">
            ${adjustment > 0 ? 'Raise' : 'Lower'} to ${target}
          </button>
        </div>

        <div class="piq-queue-hint">Enter to apply &middot; &rarr; to skip &middot; Esc to close</div>
        <button class="piq-queue-close" onclick="PourIqSection._closeQueue()" aria-label="Close">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>`;
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
