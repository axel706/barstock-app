(() => {
  if (window.BarStockFocusStats) return;

  // Mini-cards de la pantalla principal.
  //
  // Regla: lo que MUESTRA cada mini-card es fijo; lo que cambia es el
  // numero. Una tarjeta que rota entre datos distintos se ve bien una vez
  // y confunde siempre, porque nunca sabes que estas viendo ni puedes
  // comparar contra ayer.
  //
  // Casi todo sale de datos ya cargados en memoria. Lo unico que pide la
  // nube es Costs, y ese muestra esqueleto mientras llega.

  function fmtMoney(n) {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 10000) return '$' + Math.round(v / 1000) + 'k';
    return '$' + Math.round(v).toLocaleString();
  }

  // isCurrentCycle vive dentro del modulo de Order History y no es global,
  // asi que se replica aqui con la misma regla: la semana corre de lunes a
  // domingo. Si algun dia se expone, se puede borrar esto y usar aquella.
  function currentCycleStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  function inCurrentCycle(createdAt) {
    if (!createdAt) return false;
    const d = new Date(createdAt);
    if (isNaN(d)) return false;
    const monday = currentCycleStart();
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return d >= monday && d <= sunday;
  }

  function card(label, value, sub, color) {
    return `
      <div class="bs-fs-card">
        <div class="bs-fs-label">${label}</div>
        <div class="bs-fs-value"${color ? ` style="color:${color}"` : ''}>${value}</div>
        ${sub ? `<div class="bs-fs-sub">${sub}</div>` : ''}
      </div>`;
  }

  function skeleton() {
    return `
      <div class="bs-fs-card">
        <span class="bs-skel bs-skel-line" style="width:70%;margin:2px auto 6px"></span>
        <span class="bs-skel bs-skel-line" style="width:50%;height:16px;margin:0 auto"></span>
      </div>`;
  }

  function put(name, html) {
    const el = document.getElementById('fgStats-' + name);
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }

  // ── Inventory ──────────────────────────────────────────────────────
  function inventory() {
    const master = (window.state && state.master) || [];
    if (!master.length) return put('inventory', '');

    const toOrder = master.filter(r => (parseNum(r.toOrder) || 0) > 0).length;

    // Critico: menos del 25% de su par en existencia. Es el mismo umbral
    // que ya usa el semaforo de Ordering.
    const critical = master.filter(r => {
      const sug = parseNum(r.suggested) || 0;
      if (sug <= 0) return false;
      return (parseNum(r.onHand) || 0) / sug <= 0.25;
    }).length;

    put('inventory',
      card('To order', toOrder, 'of ' + master.length, toOrder > 0 ? '#38bdf8' : '') +
      card('Critical', critical, 'under 25%', critical > 0 ? '#f87171' : ''));

    // La descripcion la llenaba bsUpdateFocusGrid leyendo el contador del
    // header, que ya no existe. Ahora sale directo del estado.
    const sub = document.getElementById('fgSub-inventory');
    if (sub) sub.textContent = master.length + ' items loaded';
  }

  // ── Ordering ───────────────────────────────────────────────────────
  function ordering() {
    if (typeof getActiveVendors !== 'function' || typeof getOrderRowsForVendor !== 'function') return;
    const master = (window.state && state.master) || [];
    if (!master.length) return put('vendor', '');

    const vendorsList = getActiveVendors().filter(v => v !== 'ALL' && v !== 'UNKNOWN');
    let pending = 0, withRows = 0;
    vendorsList.forEach(v => {
      const rows = getOrderRowsForVendor(v);
      if (!rows.length) return;
      withRows++;
      if (typeof computeOrderSubtotal === 'function') pending += computeOrderSubtotal(rows);
    });

    // Ordenes colocadas en el ciclo actual
    const placed = (state.orderHistory || []).filter(o => inCurrentCycle(o.createdAt)).length;

    put('vendor',
      card('Pending', fmtMoney(pending), withRows + (withRows === 1 ? ' vendor' : ' vendors')) +
      card('Placed', placed, 'this cycle', placed > 0 ? '#4ade80' : ''));
  }

  // ── Order History ──────────────────────────────────────────────────
  function history() {
    const orders = (window.state && state.orderHistory) || [];
    if (!orders.length) return put('history', '');

    const cycle = orders.filter(o => inCurrentCycle(o.createdAt));
    const spent = cycle.reduce((s, o) => s + (Number(o.subtotal) || 0), 0);

    put('history',
      card('Orders', cycle.length, 'this cycle') +
      card('Spent', fmtMoney(spent), 'this cycle'));
  }

  // ── No Match ───────────────────────────────────────────────────────
  function noMatch() {
    const n = ((window.state && state.noMatches) || []).length;
    // Una sola mini-card: no hay un segundo dato que valga la pena aqui.
    put('noMatch', n > 0
      ? card('Pending', n, 'need review', '#fbbf24')
      : card('Pending', 0, 'all matched', '#4ade80'));
  }

  // ── Pour-IQ ────────────────────────────────────────────────────────
  function pourIq() {
    const map = window.parAdjustments;
    if (!map || !map.size) return put('pourIq', '');

    const master = (window.state && state.master) || [];
    let pending = 0, frees = 0;

    master.forEach(row => {
      const par = map.get(`${row.item}||${row.code || ''}`);
      if (!par || par.status !== 'active' || !par.adjustment) return;
      pending++;
      if (par.adjustment < 0) frees += (parseFloat(row.value) || 0);
    });

    put('pourIq',
      card('Pending', pending, 'adjustments', pending > 0 ? '#fbbf24' : '') +
      card('Frees up', fmtMoney(frees), 'this week', frees > 0 ? '#4ade80' : ''));
  }

  // ── Usage ──────────────────────────────────────────────────────────
  // Sale del mismo mapa de Pour-IQ, que ya trae el cruce de uso contra
  // venta. Cero llamadas extra a la nube.
  function usage() {
    const map = window.parAdjustments;
    if (!map || !map.size) return put('theoretical', '');

    let sum = 0, n = 0, weeks = 0;
    map.forEach(par => {
      if (par.normalWeeks) weeks = Math.max(weeks, par.normalWeeks);
      if (par.shrinkPct !== null && par.shrinkPct !== undefined) { sum += par.shrinkPct; n++; }
    });

    if (!n) {
      return put('theoretical', card('Weeks', weeks || '—', 'of data'));
    }

    const avg = (sum / n) * 100;
    put('theoretical',
      card('Unsold', avg.toFixed(1) + '%', 'poured, not sold', avg >= 15 ? '#f87171' : avg >= 8 ? '#fbbf24' : '#4ade80') +
      card('Weeks', weeks || '—', 'of data'));
  }

  // ── Costs ──────────────────────────────────────────────────────────
  // El unico que pide la nube. Se lee una vez y se cachea; mientras tanto
  // muestra esqueleto en vez de dejar el hueco vacio.
  let _costsCache = null;
  let _costsAsked = false;

  function costs() {
    if (_costsCache) {
      const { cogs, target, from } = _costsCache;
      if (cogs === null) return put('costReport', card('Reports', '—', 'none saved'));
      return put('costReport',
        card('Last COGS', cogs.toFixed(1) + '%', 'target ' + target.toFixed(1) + '%',
             cogs > target ? '#f87171' : '#4ade80') +
        card('Reported', from ? from.slice(5) : '—', 'period start'));
    }

    if (!_costsAsked) {
      _costsAsked = true;
      put('costReport', skeleton() + skeleton());
      loadCosts();
    }
  }

  async function loadCosts() {
    try {
      if (!window.BarStockCostReportCloud?.listReports) {
        _costsCache = { cogs: null }; return;
      }
      const rows = await window.BarStockCostReportCloud.listReports();
      const norm = window.BarStockCostReport?.normalizeCloudReport;
      const list = (rows || []).map(r => (norm ? norm(r) : null)).filter(Boolean);
      if (!list.length) { _costsCache = { cogs: null }; return; }

      list.sort((a, b) => String(b.periodFrom).localeCompare(String(a.periodFrom)));
      const r = list[0];

      const cost  = (r.totalWine || 0) + (r.totalLiquor || 0);
      const sales = (r.wineSales || 0) + (r.liquorSales || 0);
      const cogs  = sales > 0 ? (cost / sales) * 100 : 0;
      const target = sales > 0
        ? (((r.wineTarget || 0) * (r.wineSales || 0)) + ((r.liquorTarget || 0) * (r.liquorSales || 0))) / sales
        : 0;

      _costsCache = { cogs, target, from: r.periodFrom };
    } catch (e) {
      console.warn('[FocusStats] costs', e);
      _costsCache = { cogs: null };
    } finally {
      costs();
    }
  }

  function refresh() {
    try { inventory(); } catch (e) {}
    try { ordering();  } catch (e) {}
    try { history();   } catch (e) {}
    try { noMatch();   } catch (e) {}
    try { pourIq();    } catch (e) {}
    try { usage();     } catch (e) {}
    try { costs();     } catch (e) {}
  }

  window.BarStockFocusStats = { refresh, reloadCosts: () => { _costsCache = null; _costsAsked = false; costs(); } };

  // Mismo ritmo que el actualizador de la rejilla que ya existia
  window.addEventListener('load', () => {
    refresh();
    setInterval(refresh, 2000);
  });
})();
