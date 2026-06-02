/* ============================================================
   COST REPORT MODULE — Wine & Liquor Cost
   - Clases prefijadas cr-
   - localStorage POR LOCACIÓN (usa el sufijo de la app)
   - Lee la locación activa de BARSTOCK_CONFIG
   - PDF sin caracteres Unicode (flechas -> +/-)
   ============================================================ */
(function () {
  'use strict';

  const DEFAULT_VENDORS = ['LOOP / PLCB', 'FWGS', 'BREAKTHRU', 'SOUTHERN', 'WINE MERCHANT'];
  let vendors = [];

  // Clave de storage por locación — replica el patrón de la app.
  function storageKey() {
    let suffix = 'default';
    try {
      if (typeof getActiveStorageSuffix === 'function') {
        suffix = getActiveStorageSuffix();
      } else if (window.BARSTOCK_CONFIG && window.BARSTOCK_CONFIG.LOCATION_NAME) {
        suffix = window.BARSTOCK_CONFIG.LOCATION_NAME;
      }
    } catch (e) { /* noop */ }
    return 'barstock_cost_reports_' + suffix;
  }

  function activeLocationName() {
    try {
      if (window.BARSTOCK_CONFIG && window.BARSTOCK_CONFIG.LOCATION_NAME) {
        return window.BARSTOCK_CONFIG.LOCATION_NAME;
      }
    } catch (e) { /* noop */ }
    return 'BarStock';
  }

  function init() {
    const fromEl = document.getElementById('crPeriodFrom');
    const toEl = document.getElementById('crPeriodTo');
    if (!fromEl || !toEl) return; // sección no presente

    const today = new Date();
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - today.getDay());
    const lastMonday = new Date(lastSunday);
    lastMonday.setDate(lastSunday.getDate() - 6);
    fromEl.value = formatDate(lastMonday);
    toEl.value = formatDate(lastSunday);

    vendors = DEFAULT_VENDORS.map(name => ({ name, invoices: [{ wine: '', liquor: '' }] }));
    renderVendors();
    updatePreview();
    renderHistory();
    // El colapso lo maneja initSectionToggles() de la app (botón costReportToggle).
  }

  function formatDate(d) { return d.toISOString().slice(0, 10); }

  function renderVendors() {
    const container = document.getElementById('crVendorsContainer');
    if (!container) return;
    container.innerHTML = '';
    vendors.forEach((v, vIdx) => {
      const block = document.createElement('div');
      block.className = 'cr-vendor-block';
      const subtotalWine = v.invoices.reduce((s, i) => s + (parseFloat(i.wine) || 0), 0);
      const subtotalLiquor = v.invoices.reduce((s, i) => s + (parseFloat(i.liquor) || 0), 0);
      block.innerHTML = `
        <div class="cr-vendor-block-head">
          <div class="cr-vendor-tag">${escapeHtml(v.name)}</div>
          <div class="cr-vendor-subtotal">
            <span>Wine <strong>$${subtotalWine.toFixed(2)}</strong></span>
            <span class="cr-sep">·</span>
            <span>Liquor <strong>$${subtotalLiquor.toFixed(2)}</strong></span>
          </div>
        </div>
        <div class="cr-invoice-rows">
          ${v.invoices.map((inv, iIdx) => `
            <div class="cr-invoice-row">
              <div class="cr-invoice-label">Invoice ${iIdx + 1}</div>
              <div class="cr-invoice-input"><input type="number" step="0.01" placeholder="Wine" value="${inv.wine}" oninput="BarStockCostReport._updateInvoice(${vIdx}, ${iIdx}, 'wine', this.value)"></div>
              <div class="cr-invoice-input"><input type="number" step="0.01" placeholder="Liquor" value="${inv.liquor}" oninput="BarStockCostReport._updateInvoice(${vIdx}, ${iIdx}, 'liquor', this.value)"></div>
              ${v.invoices.length > 1 ? `<button class="cr-btn-remove" onclick="BarStockCostReport._removeInvoice(${vIdx}, ${iIdx})" title="Remove">×</button>` : '<div></div>'}
            </div>
          `).join('')}
        </div>
        <button class="cr-btn-add-invoice" onclick="BarStockCostReport._addInvoice(${vIdx})">+ Add invoice</button>
      `;
      container.appendChild(block);
    });
  }

  function updateInvoice(vIdx, iIdx, field, value) {
    vendors[vIdx].invoices[iIdx][field] = value;
    const block = document.querySelectorAll('.cr-vendor-block')[vIdx];
    if (block) {
      const subtotalEl = block.querySelector('.cr-vendor-subtotal');
      const v = vendors[vIdx];
      const wine = v.invoices.reduce((s, i) => s + (parseFloat(i.wine) || 0), 0);
      const liquor = v.invoices.reduce((s, i) => s + (parseFloat(i.liquor) || 0), 0);
      subtotalEl.innerHTML = `<span>Wine <strong>$${wine.toFixed(2)}</strong></span><span class="cr-sep">·</span><span>Liquor <strong>$${liquor.toFixed(2)}</strong></span>`;
    }
    updatePreview();
  }

  function addInvoice(vIdx) { vendors[vIdx].invoices.push({ wine: '', liquor: '' }); renderVendors(); }
  function removeInvoice(vIdx, iIdx) {
    vendors[vIdx].invoices.splice(iIdx, 1);
    if (vendors[vIdx].invoices.length === 0) vendors[vIdx].invoices.push({ wine: '', liquor: '' });
    renderVendors();
    updatePreview();
  }
  function addCustomVendor() {
    const name = prompt('Custom vendor name:');
    if (!name) return;
    vendors.push({ name: name.trim().toUpperCase(), invoices: [{ wine: '', liquor: '' }] });
    renderVendors();
  }

  function getValues() {
    const num = id => parseFloat((document.getElementById(id) || {}).value) || 0;
    const str = id => ((document.getElementById(id) || {}).value) || '';
    const byVendor = vendors.map(v => ({
      name: v.name,
      wine: v.invoices.reduce((s, i) => s + (parseFloat(i.wine) || 0), 0),
      liquor: v.invoices.reduce((s, i) => s + (parseFloat(i.liquor) || 0), 0)
    }));
    return {
      byVendor,
      totalWine: byVendor.reduce((s, v) => s + v.wine, 0),
      totalLiquor: byVendor.reduce((s, v) => s + v.liquor, 0),
      wineSales: num('crWineSales'),
      liquorSales: num('crLiquorSales'),
      wineTarget: num('crWineTarget'),
      liquorTarget: num('crLiquorTarget'),
      wineSalesLY: num('crWineSalesLY'),
      liquorSalesLY: num('crLiquorSalesLY'),
      notes: str('crNotes'),
      periodFrom: str('crPeriodFrom'),
      periodTo: str('crPeriodTo')
    };
  }

  function updatePreview() {
    if (!document.getElementById('crPurchasesHead')) return;
    const d = getValues();
    const total = d.totalWine + d.totalLiquor;
    const expectedWine = d.wineSales * (d.wineTarget / 100);
    const expectedLiquor = d.liquorSales * (d.liquorTarget / 100);
    const expectedWineLY = d.wineSalesLY * (d.wineTarget / 100);
    const expectedLiquorLY = d.liquorSalesLY * (d.liquorTarget / 100);

    document.getElementById('crPurchasesHead').innerHTML =
      '<th>Category</th>' + d.byVendor.map(v => `<th class="cr-right">${escapeHtml(v.name)}</th>`).join('') + '<th class="cr-right">Total</th>';
    document.getElementById('crPurchasesBody').innerHTML = `
      <tr><td><strong>Wine</strong></td>${d.byVendor.map(v => `<td class="cr-right">${fmtMoney(v.wine)}</td>`).join('')}<td class="cr-right"><strong>${fmtMoney(d.totalWine)}</strong></td></tr>
      <tr><td><strong>Liquor</strong></td>${d.byVendor.map(v => `<td class="cr-right">${fmtMoney(v.liquor)}</td>`).join('')}<td class="cr-right"><strong>${fmtMoney(d.totalLiquor)}</strong></td></tr>
    `;
    document.getElementById('crPurchasesFoot').innerHTML =
      `<td>Total Purchases</td>${d.byVendor.map(v => `<td class="cr-right">${fmtMoney(v.wine + v.liquor)}</td>`).join('')}<td class="cr-right">${fmtMoney(total)}</td>`;

    const wineRealClass = d.totalWine > expectedWine ? 'cr-cogs-bad' : 'cr-cogs-good';
    const liquorRealClass = d.totalLiquor > expectedLiquor ? 'cr-cogs-bad' : 'cr-cogs-good';
    document.getElementById('crBenchmarkBody').innerHTML = `
      <tr><td><strong>Wine</strong></td><td class="cr-right">${fmtMoney(d.wineSales)}</td><td class="cr-right cr-target-display">${Math.round(d.wineTarget)}%</td><td class="cr-right">${fmtMoney(expectedWine)}</td><td class="cr-right ${wineRealClass}">${fmtMoney(d.totalWine)}</td></tr>
      <tr><td><strong>Liquor</strong></td><td class="cr-right">${fmtMoney(d.liquorSales)}</td><td class="cr-right cr-target-display">${Math.round(d.liquorTarget)}%</td><td class="cr-right">${fmtMoney(expectedLiquor)}</td><td class="cr-right ${liquorRealClass}">${fmtMoney(d.totalLiquor)}</td></tr>
    `;
    const totalRealClass = total > (expectedWine + expectedLiquor) ? 'cr-cogs-bad' : 'cr-cogs-good';
    document.getElementById('crBenchmarkFoot').innerHTML =
      `<td>Totals</td><td></td><td></td><td class="cr-right">${fmtMoney(expectedWine + expectedLiquor)}</td><td class="cr-right ${totalRealClass}">${fmtMoney(total)}</td>`;

    const wineCogs = d.wineSales > 0 ? (d.totalWine / d.wineSales) * 100 : 0;
    const liquorCogs = d.liquorSales > 0 ? (d.totalLiquor / d.liquorSales) * 100 : 0;
    document.getElementById('crPerformanceBody').innerHTML = `
      <tr><td><strong>Wine</strong></td><td class="cr-right">${fmtMoney(d.wineSales)}</td><td class="cr-right ${wineCogs > d.wineTarget ? 'cr-cogs-bad' : 'cr-cogs-good'}">${Math.round(wineCogs)}%</td></tr>
      <tr><td><strong>Liquor</strong></td><td class="cr-right">${fmtMoney(d.liquorSales)}</td><td class="cr-right ${liquorCogs > d.liquorTarget ? 'cr-cogs-bad' : 'cr-cogs-good'}">${Math.round(liquorCogs)}%</td></tr>
    `;

    const wineSalesDiff = d.wineSalesLY > 0 ? ((d.wineSales - d.wineSalesLY) / d.wineSalesLY) * 100 : null;
    const liquorSalesDiff = d.liquorSalesLY > 0 ? ((d.liquorSales - d.liquorSalesLY) / d.liquorSalesLY) * 100 : null;
    const wineSpendDiff = expectedWineLY > 0 ? ((d.totalWine - expectedWineLY) / expectedWineLY) * 100 : null;
    const liquorSpendDiff = expectedLiquorLY > 0 ? ((d.totalLiquor - expectedLiquorLY) / expectedLiquorLY) * 100 : null;

    document.getElementById('crYoyBody').innerHTML = `
      <tr>
        <td><strong>Wine</strong></td>
        <td class="cr-right">${fmtMoney(d.wineSalesLY)}</td>
        <td class="cr-right">${fmtMoney(expectedWineLY)}</td>
        <td class="cr-right">${diffPill(wineSalesDiff, 'sales')}</td>
        <td class="cr-right">${diffPill(wineSpendDiff, 'spend')}</td>
      </tr>
      <tr>
        <td><strong>Liquor</strong></td>
        <td class="cr-right">${fmtMoney(d.liquorSalesLY)}</td>
        <td class="cr-right">${fmtMoney(expectedLiquorLY)}</td>
        <td class="cr-right">${diffPill(liquorSalesDiff, 'sales')}</td>
        <td class="cr-right">${diffPill(liquorSpendDiff, 'spend')}</td>
      </tr>
    `;

    renderSmartNotes(d, expectedWine, expectedLiquor, expectedWineLY, expectedLiquorLY);
  }

  function diffPill(diff, kind) {
    if (diff === null) return '<span style="color:#94a3b8">N/A</span>';
    const sign = diff > 0 ? '+' : (diff < 0 ? '-' : '');
    let cls;
    if (kind === 'spend') cls = diff > 0 ? 'cr-cogs-bad' : 'cr-cogs-good';
    else cls = diff < 0 ? 'cr-cogs-bad' : 'cr-cogs-good';
    if (Math.abs(diff) < 0.5) cls = 'cr-target-display';
    return `<span class="${cls}">${sign}${Math.round(Math.abs(diff))}%</span>`;
  }

  function renderSmartNotes(d, expectedWine, expectedLiquor, expectedWineLY, expectedLiquorLY) {
    const container = document.getElementById('crSmartNotes');
    if (!container) return;
    const note1 = buildPerformanceNote(d, expectedWine, expectedLiquor);
    const note2 = buildYoYNote(d, expectedWineLY, expectedLiquorLY);
    let html = '';
    if (note1) html += `<div class="cr-smart-note"><div class="cr-smart-note-title">Performance vs Expected</div>${note1}</div>`;
    if (note2) html += `<div class="cr-smart-note" style="border-left-color:#166534"><div class="cr-smart-note-title">Year-over-Year Insight</div>${note2}</div>`;
    container.innerHTML = html;
  }

  function buildPerformanceNote(d, expectedWine, expectedLiquor) {
    if (d.wineSales <= 0 && d.liquorSales <= 0) return '';
    const parts = [];
    const totalActual = d.totalWine + d.totalLiquor;
    const totalExpected = expectedWine + expectedLiquor;

    if (d.wineSales > 0) {
      const cogs = Math.round((d.totalWine / d.wineSales) * 100);
      const diffDollars = d.totalWine - expectedWine;
      const diffPts = cogs - Math.round(d.wineTarget);
      if (Math.abs(diffPts) < 1) {
        parts.push('<strong>Wine</strong> spend landed on target at ' + cogs + '% COGS — ' + fmtMoney(d.totalWine) + ' actual vs ' + fmtMoney(expectedWine) + ' expected.');
      } else if (diffPts > 0) {
        parts.push('<strong>Wine</strong> came in at ' + cogs + '% COGS, <span class="cr-up">' + diffPts + '% above the ' + Math.round(d.wineTarget) + '% target</span> — actual ' + fmtMoney(d.totalWine) + ' vs expected ' + fmtMoney(expectedWine) + ', an overspend of <span class="cr-up">' + fmtMoney(diffDollars) + '</span>.');
      } else {
        parts.push('<strong>Wine</strong> came in at ' + cogs + '% COGS, <span class="cr-down">' + Math.abs(diffPts) + '% below the ' + Math.round(d.wineTarget) + '% target</span> — actual ' + fmtMoney(d.totalWine) + ' vs expected ' + fmtMoney(expectedWine) + ', savings of <span class="cr-down">' + fmtMoney(Math.abs(diffDollars)) + '</span>.');
      }
    }

    if (d.liquorSales > 0) {
      const cogs = Math.round((d.totalLiquor / d.liquorSales) * 100);
      const diffDollars = d.totalLiquor - expectedLiquor;
      const diffPts = cogs - Math.round(d.liquorTarget);
      if (Math.abs(diffPts) < 1) {
        parts.push('<strong>Liquor</strong> spend landed on target at ' + cogs + '% COGS — ' + fmtMoney(d.totalLiquor) + ' actual vs ' + fmtMoney(expectedLiquor) + ' expected.');
      } else if (diffPts > 0) {
        parts.push('<strong>Liquor</strong> came in at ' + cogs + '% COGS, <span class="cr-up">' + diffPts + '% above the ' + Math.round(d.liquorTarget) + '% target</span> — actual ' + fmtMoney(d.totalLiquor) + ' vs expected ' + fmtMoney(expectedLiquor) + ', an overspend of <span class="cr-up">' + fmtMoney(diffDollars) + '</span>.');
      } else {
        parts.push('<strong>Liquor</strong> came in at ' + cogs + '% COGS, <span class="cr-down">' + Math.abs(diffPts) + '% below the ' + Math.round(d.liquorTarget) + '% target</span> — actual ' + fmtMoney(d.totalLiquor) + ' vs expected ' + fmtMoney(expectedLiquor) + ', savings of <span class="cr-down">' + fmtMoney(Math.abs(diffDollars)) + '</span>.');
      }
    }

    if (totalExpected > 0) {
      const pct = Math.round(((totalActual - totalExpected) / totalExpected) * 100);
      if (Math.abs(pct) >= 1) {
        if (pct > 0) {
          parts.push('<strong>Overall</strong> spend was <span class="cr-up">' + pct + '% above budget</span> — ' + fmtMoney(totalActual) + ' actual vs ' + fmtMoney(totalExpected) + ' expected.');
        } else {
          parts.push('<strong>Overall</strong> spend was <span class="cr-down">' + Math.abs(pct) + '% under budget</span> — ' + fmtMoney(totalActual) + ' actual vs ' + fmtMoney(totalExpected) + ' expected.');
        }
      }
    }

    return parts.join(' ');
  }

  function buildYoYNote(d) {
    const haveLY = (d.wineSalesLY > 0 || d.liquorSalesLY > 0);
    if (!haveLY) return '';
    const salesNow = d.wineSales + d.liquorSales;
    const salesLY = d.wineSalesLY + d.liquorSalesLY;
    if (salesLY <= 0 || salesNow <= 0) return '';
    const pct = Math.round(((salesNow - salesLY) / salesLY) * 100);
    const diff = Math.abs(salesNow - salesLY);
    if (Math.abs(pct) < 1) {
      return 'Sales were flat versus the same period last year — ' + fmtMoney(salesNow) + ' this week vs ' + fmtMoney(salesLY) + ' last year.';
    } else if (pct > 0) {
      return '<strong>Sales</strong> were <span class="cr-down">' + pct + '% higher</span> than the same period last year — ' + fmtMoney(salesNow) + ' this week vs ' + fmtMoney(salesLY) + ' last year (' + fmtMoney(diff) + ' more in revenue).';
    } else {
      return '<strong>Sales</strong> were <span class="cr-up">' + Math.abs(pct) + '% lower</span> than the same period last year — ' + fmtMoney(salesNow) + ' this week vs ' + fmtMoney(salesLY) + ' last year (' + fmtMoney(diff) + ' less in revenue).';
    }
  }

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  function fmtPct(n) { return (Number(n) || 0).toFixed(1) + '%'; }
  function fmtMoney(n) {
    return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function loadReports() {
    try { return JSON.parse(localStorage.getItem(storageKey()) || '[]'); }
    catch (e) { return []; }
  }

  async function saveReport() {
    const d = getValues();
    if (!d.periodFrom || !d.periodTo) { alert('Please set the report period.'); return; }
    const report = {
      periodFrom: d.periodFrom, periodTo: d.periodTo,
      vendors: d.byVendor,
      totalWine: d.totalWine, totalLiquor: d.totalLiquor,
      wineSales: d.wineSales, liquorSales: d.liquorSales,
      wineTarget: d.wineTarget, liquorTarget: d.liquorTarget,
      wineSalesLY: d.wineSalesLY, liquorSalesLY: d.liquorSalesLY,
      notes: d.notes
    };
    if (window.BarStockCostReportCloud) {
      try {
        await window.BarStockCostReportCloud.saveReport(report);
        await renderHistory();
        alert('Report saved to cloud.');
        return;
      } catch (e) {
        console.error('Cloud save failed, falling back to local', e);
      }
    }
    // Fallback local
    const wineCogs = d.wineSales > 0 ? (d.totalWine / d.wineSales) * 100 : 0;
    const liquorCogs = d.liquorSales > 0 ? (d.totalLiquor / d.liquorSales) * 100 : 0;
    const localReport = { id: 'rep_' + Date.now(), savedAt: new Date().toISOString(), wineCogs, liquorCogs, ...report };
    const reports = loadReports();
    reports.push(localReport);
    if (reports.length > 24) reports.shift();
    localStorage.setItem(storageKey(), JSON.stringify(reports));
    await renderHistory();
    alert('Report saved locally (cloud unavailable).');
  }

  // Normaliza un registro del cloud (snake_case) al formato de la UI (camelCase)
  function normalizeCloudReport(r) {
    const wineCogs = r.wine_sales > 0 ? (r.total_wine / r.wine_sales) * 100 : 0;
    const liquorCogs = r.liquor_sales > 0 ? (r.total_liquor / r.liquor_sales) * 100 : 0;
    return {
      id: r.id,
      periodFrom: r.period_from, periodTo: r.period_to,
      vendors: r.vendors || [],
      totalWine: Number(r.total_wine) || 0, totalLiquor: Number(r.total_liquor) || 0,
      wineSales: Number(r.wine_sales) || 0, liquorSales: Number(r.liquor_sales) || 0,
      wineTarget: Number(r.wine_target) || 0, liquorTarget: Number(r.liquor_target) || 0,
      wineSalesLY: Number(r.wine_sales_ly) || 0, liquorSalesLY: Number(r.liquor_sales_ly) || 0,
      wineCogs, liquorCogs,
      notes: r.notes || ''
    };
  }

  // Caché de los reportes actualmente mostrados (para loadReport)
  let _shownReports = [];

  async function renderHistory() {
    const container = document.getElementById('crHistoryContainer');
    if (!container) return;

    let reports = [];
    if (window.BarStockCostReportCloud) {
      try {
        const cloudRows = await window.BarStockCostReportCloud.listReports();
        reports = cloudRows.map(normalizeCloudReport);
      } catch (e) {
        console.error('Cloud list failed, falling back to local', e);
        reports = loadReports().slice().reverse();
      }
    } else {
      reports = loadReports().slice().reverse();
    }

    _shownReports = reports;

    if (!reports.length) {
      container.innerHTML = '<div class="cr-history-empty">No saved reports yet. Save a report to see it here.</div>';
      return;
    }
    container.innerHTML = '<div class="cr-history-list">' + reports.map(r => `
      <div class="cr-history-item">
        <div class="cr-history-item-info">
          <div class="cr-history-item-period">${formatPeriod(r.periodFrom, r.periodTo)}</div>
          <div class="cr-history-item-stats">Wine ${Math.round(r.wineCogs || 0)}% · Liquor ${Math.round(r.liquorCogs || 0)}% · Total ${fmtMoney(r.totalWine + r.totalLiquor)}</div>
        </div>
        <div class="cr-history-item-actions">
          <button class="cr-btn-small" onclick="BarStockCostReport._loadReport('${r.id}')">Load</button>
          <button class="cr-btn-small cr-danger" onclick="BarStockCostReport._deleteReport('${r.id}')">Delete</button>
        </div>
      </div>
    `).join('') + '</div>';
  }

  function formatPeriod(from, to) {
    const f = new Date(from + 'T00:00:00');
    const t = new Date(to + 'T00:00:00');
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${f.toLocaleDateString('en-US', opts)} — ${t.toLocaleDateString('en-US', opts)}`;
  }

  function loadReport(id) {
    const reports = _shownReports.length ? _shownReports : loadReports();
    const r = reports.find(x => String(x.id) === String(id));
    if (!r) return;
    const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setV('crPeriodFrom', r.periodFrom);
    setV('crPeriodTo', r.periodTo);
    setV('crWineSales', r.wineSales);
    setV('crLiquorSales', r.liquorSales);
    setV('crWineTarget', r.wineTarget);
    setV('crLiquorTarget', r.liquorTarget);
    setV('crWineSalesLY', r.wineSalesLY || '');
    setV('crLiquorSalesLY', r.liquorSalesLY || '');
    setV('crNotes', r.notes || '');
    vendors = r.vendors.map(v => ({
      name: v.name,
      invoices: [{ wine: v.wine.toString(), liquor: v.liquor.toString() }]
    }));
    renderVendors();
    updatePreview();
    const section = document.getElementById('costReportSection');
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  }

  async function deleteReport(id) {
    if (!confirm('Delete this report?')) return;
    if (window.BarStockCostReportCloud) {
      try {
        await window.BarStockCostReportCloud.deleteReport(id);
        await renderHistory();
        return;
      } catch (e) {
        console.error('Cloud delete failed, falling back to local', e);
      }
    }
    const reports = loadReports().filter(r => String(r.id) !== String(id));
    localStorage.setItem(storageKey(), JSON.stringify(reports));
    await renderHistory();
  }

  function resetForm() {
    if (!confirm('Reset all current data?')) return;
    vendors = DEFAULT_VENDORS.map(name => ({ name, invoices: [{ wine: '', liquor: '' }] }));
    ['crWineSales', 'crLiquorSales', 'crWineSalesLY', 'crLiquorSalesLY', 'crNotes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const wt = document.getElementById('crWineTarget'); if (wt) wt.value = '22';
    const lt = document.getElementById('crLiquorTarget'); if (lt) lt.value = '15';
    renderVendors();
    updatePreview();
  }

  // ============================================================
  // PDF — sin caracteres Unicode (flechas reemplazadas por +/-)
  // ============================================================
  async function generatePdf(saveFile = true) {
    const d = getValues();
    const location = activeLocationName();
    if (!d.periodFrom || !d.periodTo) { alert('Please set the report period.'); return; }

    const expectedWine = d.wineSales * (d.wineTarget / 100);
    const expectedLiquor = d.liquorSales * (d.liquorTarget / 100);
    const expectedWineLY = d.wineSalesLY * (d.wineTarget / 100);
    const expectedLiquorLY = d.liquorSalesLY * (d.liquorTarget / 100);
    const wineCogs = d.wineSales > 0 ? (d.totalWine / d.wineSales) * 100 : 0;
    const liquorCogs = d.liquorSales > 0 ? (d.totalLiquor / d.liquorSales) * 100 : 0;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin + 10;

    const TBL_STYLES = { fontSize: 9.5, cellPadding: { top: 8, right: 12, bottom: 8, left: 12 }, font: 'helvetica', lineColor: [218, 224, 234], lineWidth: 0, textColor: [15, 23, 42], valign: 'middle' };
    const TBL_HEAD = { fillColor: [224, 242, 254], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8.5, cellPadding: { top: 9, right: 12, bottom: 9, left: 12 } };
    const TBL_FOOT = { fillColor: [224, 242, 254], textColor: [15, 23, 42], fontStyle: 'bold' };
    const TBL_ALT = [248, 250, 253];

    function drawRoundedBlock(startY, endY) { pdf.setDrawColor(200, 215, 230); pdf.setLineWidth(0.8); pdf.roundedRect(margin, startY, pageW - margin * 2, endY - startY, 6, 6, 'S'); }
    function drawBanner(text) {
      pdf.setFillColor(15, 23, 42);
      pdf.roundedRect(margin, y, pageW - margin * 2, 24, 4, 4, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(224, 242, 254);
      pdf.text(text, pageW / 2, y + 16, { align: 'center' });
      y += 24;
    }
    function ensureSpace(needed) { if (y > pageH - margin - needed) { pdf.addPage(); y = margin + 10; } }
    function rowSeparators(data) {
      if (data.section === 'body' || data.section === 'head') {
        pdf.setDrawColor(218, 224, 234); pdf.setLineWidth(0.4);
        const cell = data.cell;
        pdf.line(cell.x, cell.y + cell.height, cell.x + cell.width, cell.y + cell.height);
      }
    }

    // HEADER — navy bg + linea azul
    const hdrH = y + 42;
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, pageW, hdrH, 'F');

    // Logo — BarStock
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22); pdf.setTextColor(248, 250, 252);
    pdf.text('BarStock', margin, y + 16);
    const barstockW = pdf.getTextWidth('BarStock');
    // Punto circular azul
    pdf.setFillColor(56, 189, 248);
    pdf.circle(margin + barstockW + 3.5, y + 13.5, 2.6, 'F');
    // PRO
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(100, 116, 139);
    pdf.text('PRO', margin + barstockW + 9, y + 16);
    // Location — pill azul
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
    const locW = pdf.getTextWidth(location.toUpperCase()) + 16;
    pdf.setFillColor(56, 189, 248);
    pdf.roundedRect(margin, y + 20, locW, 14, 7, 7, 'F');
    pdf.setTextColor(15, 23, 42);
    pdf.text(location.toUpperCase(), margin + locW / 2, y + 30, { align: 'center' });

    // Derecha — titulo + capsula con periodo
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(248, 250, 252);
    pdf.text('COST REPORT', pageW - margin, y + 14, { align: 'right' });

    const periodText = formatPeriod(d.periodFrom, d.periodTo);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
    const periodW = pdf.getTextWidth(periodText) + 16;
    pdf.setFillColor(56, 189, 248);
    pdf.roundedRect(pageW - margin - periodW, y + 20, periodW, 14, 7, 7, 'F');
    pdf.setTextColor(15, 23, 42);
    pdf.text(periodText, pageW - margin - periodW / 2, y + 30, { align: 'center' });

    y = hdrH;
    // Linea azul de acento — full width
    pdf.setFillColor(56, 189, 248);
    pdf.rect(0, y, pageW, 3, 'F');
    y += 28;

    const tableWidth = pageW - margin * 2;
    function shortVendorName(name) {
      const n = name.toUpperCase();
      if (n.includes('LOOP') || n.includes('PLCB')) return 'PLCB';
      if (n.includes('WINE MERCHANT')) return 'WINE M.';
      if (n.includes('BREAKTHRU')) return 'BT';
      if (n.includes('SOUTHERN')) return 'SOUTHERN';
      if (n.includes('FWGS')) return 'FWGS';
      return name.toUpperCase().substring(0, 10);
    }
    const vendorHeaders = d.byVendor.map(v => shortVendorName(v.name));
    const numVendors = d.byVendor.length;
    const firstColW = Math.max(100, tableWidth * 0.18);
    const otherColW = (tableWidth - firstColW) / (numVendors + 1);
    const purchasesColStyles = { 0: { halign: 'left', fontStyle: 'bold', cellWidth: firstColW } };
    for (let i = 1; i <= numVendors + 1; i++) purchasesColStyles[i] = { halign: 'right', cellWidth: otherColW };

    // ── 3 PÍLDORAS: Wine / Liquor / YoY ──────────────────────────────
    const cardH    = 88;
    const cardW    = (tableWidth - 16) / 3;
    const r        = 8;
    const pill     = [
      { x: margin,                  label: 'WINE',   cost: d.totalWine,   cogs: wineCogs,   target: d.wineTarget  },
      { x: margin + cardW + 8,      label: 'LIQUOR', cost: d.totalLiquor, cogs: liquorCogs, target: d.liquorTarget },
    ];

    // Wine & Liquor cards
    pill.forEach(p => {
      // Card background
      pdf.setFillColor(240, 249, 255);
      pdf.roundedRect(p.x, y, cardW, cardH, r, r, 'F');
      pdf.setDrawColor(56, 189, 248); pdf.setLineWidth(0.8);
      pdf.roundedRect(p.x, y, cardW, cardH, r, r, 'S');

      // Label
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(100, 116, 139);
      pdf.text(p.label, p.x + 14, y + 18);

      // Cost
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); pdf.setTextColor(15, 23, 42);
      pdf.text(fmtMoney(p.cost), p.x + 14, y + 42);

      // COGS% — rojo si > target, verde si <=
      const cogsColor = p.cogs > p.target ? [220, 38, 38] : [22, 163, 74];
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5);
      pdf.setTextColor(...cogsColor);
      pdf.text('COGS ' + fmtPct(p.cogs), p.x + 14, y + 60);

      // Target
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(148, 163, 184);
      pdf.text('target ' + fmtPct(p.target), p.x + 14, y + 74);
    });

    // YoY card
    const yoyX = margin + (cardW + 8) * 2;
    const wineChg   = d.wineSalesLY  > 0 ? ((d.wineSales  - d.wineSalesLY)  / d.wineSalesLY)  * 100 : null;
    const liqChg    = d.liquorSalesLY > 0 ? ((d.liquorSales - d.liquorSalesLY) / d.liquorSalesLY) * 100 : null;
    const fmtChg = v => v === null ? 'N/A' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    const chgColor = v => v === null ? [148, 163, 184] : v >= 0 ? [22, 163, 74] : [220, 38, 38];

    pdf.setFillColor(240, 249, 255);
    pdf.roundedRect(yoyX, y, cardW, cardH, r, r, 'F');
    pdf.setDrawColor(56, 189, 248); pdf.setLineWidth(0.8);
    pdf.roundedRect(yoyX, y, cardW, cardH, r, r, 'S');

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(100, 116, 139);
    pdf.text('YEAR-OVER-YEAR SALES', yoyX + 14, y + 18);

    // Wine row
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(100, 116, 139);
    pdf.text('Wine LY: ' + fmtMoney(d.wineSalesLY), yoyX + 14, y + 36);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5);
    pdf.setTextColor(...chgColor(wineChg));
    pdf.text(fmtChg(wineChg), yoyX + cardW - 14, y + 36, { align: 'right' });

    // Liquor row
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(100, 116, 139);
    pdf.text('Liquor LY: ' + fmtMoney(d.liquorSalesLY), yoyX + 14, y + 54);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5);
    pdf.setTextColor(...chgColor(liqChg));
    pdf.text(fmtChg(liqChg), yoyX + cardW - 14, y + 54, { align: 'right' });

    // Divider + label
    pdf.setDrawColor(218, 224, 234); pdf.setLineWidth(0.4);
    pdf.line(yoyX + 14, y + 62, yoyX + cardW - 14, y + 62);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(148, 163, 184);
    pdf.text('vs same period this year', yoyX + 14, y + 74);

    y += cardH + 12;
    // ─────────────────────────────────────────────────────────────────

    let blockStart = y;
    drawBanner('PURCHASES OVERVIEW');
    pdf.autoTable({
      startY: y,
      head: [['CATEGORY', ...vendorHeaders, 'TOTAL']],
      body: [
        ['Wine', ...d.byVendor.map(v => fmtMoney(v.wine)), fmtMoney(d.totalWine)],
        ['Liquor', ...d.byVendor.map(v => fmtMoney(v.liquor)), fmtMoney(d.totalLiquor)]
      ],
      foot: [['TOTAL PURCHASES', ...d.byVendor.map(v => fmtMoney(v.wine + v.liquor)), fmtMoney(d.totalWine + d.totalLiquor)]],
      margin: { left: margin, right: margin }, theme: 'plain',
      styles: TBL_STYLES, headStyles: TBL_HEAD, footStyles: { ...TBL_FOOT, halign: 'right' },
      alternateRowStyles: { fillColor: TBL_ALT }, columnStyles: purchasesColStyles,
      didParseCell: (data) => {
        if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right';
        if (data.section === 'body' && data.column.index === numVendors + 1) data.cell.styles.fontStyle = 'bold';
        if (data.section === 'foot') data.cell.styles.halign = data.column.index === 0 ? 'left' : 'right';
      },
      didDrawCell: rowSeparators
    });
    y = pdf.lastAutoTable.finalY; drawRoundedBlock(blockStart, y); y += 12;

    ensureSpace(150);
    const benchColW = tableWidth / 5;
    blockStart = y;
    drawBanner('COST BENCHMARK COMPARISON');
    pdf.autoTable({
      startY: y,
      head: [['CATEGORY', 'SALES', 'TARGET %', 'EXPECTED COST', 'REAL COST']],
      body: [
        ['Wine', fmtMoney(d.wineSales), Math.round(d.wineTarget) + '%', fmtMoney(expectedWine), fmtMoney(d.totalWine)],
        ['Liquor', fmtMoney(d.liquorSales), Math.round(d.liquorTarget) + '%', fmtMoney(expectedLiquor), fmtMoney(d.totalLiquor)]
      ],
      foot: [['TOTALS', '', '', fmtMoney(expectedWine + expectedLiquor), fmtMoney(d.totalWine + d.totalLiquor)]],
      margin: { left: margin, right: margin }, theme: 'plain',
      styles: TBL_STYLES, headStyles: TBL_HEAD, footStyles: TBL_FOOT,
      alternateRowStyles: { fillColor: TBL_ALT },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: benchColW },
        1: { halign: 'right', cellWidth: benchColW },
        2: { halign: 'right', textColor: [22, 101, 52], fontStyle: 'bold', cellWidth: benchColW },
        3: { halign: 'right', cellWidth: benchColW },
        4: { halign: 'right', cellWidth: benchColW, fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right';
        if (data.section === 'foot') data.cell.styles.halign = data.column.index === 0 ? 'left' : 'right';
        if (data.section === 'body' && data.column.index === 4) {
          const isWine = data.row.index === 0;
          const real = isWine ? d.totalWine : d.totalLiquor;
          const expected = isWine ? expectedWine : expectedLiquor;
          data.cell.styles.textColor = real > expected ? [220, 38, 38] : [22, 101, 52];
        }
        if (data.section === 'foot' && data.column.index === 4) {
          const real = d.totalWine + d.totalLiquor; const expected = expectedWine + expectedLiquor;
          data.cell.styles.textColor = real > expected ? [220, 38, 38] : [22, 101, 52];
        }
      },
      didDrawCell: rowSeparators
    });
    y = pdf.lastAutoTable.finalY; drawRoundedBlock(blockStart, y); y += 12;

    ensureSpace(110);
    const perfColW = tableWidth / 3;
    blockStart = y;
    drawBanner('COST PERFORMANCE');
    pdf.autoTable({
      startY: y,
      head: [['CATEGORY', 'SALES', 'COGS %']],
      body: [
        ['Wine', fmtMoney(d.wineSales), Math.round(wineCogs) + '%'],
        ['Liquor', fmtMoney(d.liquorSales), Math.round(liquorCogs) + '%']
      ],
      margin: { left: margin, right: margin }, theme: 'plain',
      styles: TBL_STYLES, headStyles: TBL_HEAD, alternateRowStyles: { fillColor: TBL_ALT },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: perfColW },
        1: { halign: 'right', cellWidth: perfColW },
        2: { halign: 'right', cellWidth: perfColW }
      },
      didParseCell: (data) => {
        if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right';
        if (data.section === 'body' && data.column.index === 2) {
          const cogs = data.row.index === 0 ? wineCogs : liquorCogs;
          const target = data.row.index === 0 ? d.wineTarget : d.liquorTarget;
          data.cell.styles.textColor = cogs > target ? [220, 38, 38] : [22, 101, 52];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawCell: rowSeparators
    });
    y = pdf.lastAutoTable.finalY; drawRoundedBlock(blockStart, y); y += 12;

    const perfText = stripHtml(buildPerformanceNote(d, expectedWine, expectedLiquor));
    if (perfText) {
      y += 16;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(30, 91, 138);
      pdf.text('Auto Insights', margin, y); y += 16;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(100, 116, 139);
      pdf.text('PERFORMANCE VS EXPECTED', margin, y); y += 12;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(15, 23, 42);
      const lines = pdf.splitTextToSize(perfText, pageW - margin * 2);
      pdf.text(lines, margin, y); y += lines.length * 13 + 14;
    }

    if (d.notes && d.notes.trim()) {
      ensureSpace(60);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(30, 91, 138);
      pdf.text('Manager Notes', margin, y); y += 16;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(71, 85, 105);
      const lines = pdf.splitTextToSize(d.notes, pageW - margin * 2);
      ensureSpace(lines.length * 13 + 10); pdf.text(lines, margin, y); y += lines.length * 13 + 10;
    }

    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(148, 163, 184);
    pdf.text(location + ' \u2013 Internal Use Only', margin, pageH - 30);
    pdf.text('Generated by BarStock Pro \u00b7 Automated reporting system', pageW - margin, pageH - 30, { align: 'right' });

    if (saveFile) {
      pdf.save('cost_report_' + d.periodFrom + '_to_' + d.periodTo + '.pdf');
    } else {
      return pdf.output('datauristring').split(',')[1];
    }
  }

  // API pública
  // ── PERIOD MODE TOGGLE ──────────────────────────────────
  let _periodMode = 'weekly'; // 'weekly' | 'monthly'

  function setPeriodMode(mode) {
    _periodMode = mode;
    const btnWeekly  = document.getElementById('crToggleWeekly');
    const btnMonthly = document.getElementById('crToggleMonthly');
    const label      = document.getElementById('crThisPeriodLabel');
    const desc       = document.getElementById('crSectionDesc');
    const notes      = document.getElementById('crNotes');

    const monthlySection = document.getElementById('crMonthlyBuildSection');
    if (mode === 'weekly') {
      if (btnWeekly)  { btnWeekly.style.background = '#38bdf8'; btnWeekly.style.color = '#0f172a'; }
      if (btnMonthly) { btnMonthly.style.background = 'transparent'; btnMonthly.style.color = '#94a3b8'; }
      if (label) label.textContent = 'This Week';
      if (desc)  desc.textContent  = 'Capture weekly invoices by vendor, track COGS against benchmarks, and compare against last year.';
      if (notes) notes.placeholder = "Add comments about this week's performance, anomalies, special events...";
      if (monthlySection) monthlySection.style.display = 'none';
    } else {
      if (btnWeekly)  { btnWeekly.style.background = 'transparent'; btnWeekly.style.color = '#94a3b8'; }
      if (btnMonthly) { btnMonthly.style.background = '#38bdf8'; btnMonthly.style.color = '#0f172a'; }
      if (label) label.textContent = 'This Month';
      if (desc)  desc.textContent  = 'Capture monthly invoices by vendor, track COGS against benchmarks, and compare against last year.';
      if (notes) notes.placeholder = "Add comments about this month's performance, anomalies, special events...";
      if (monthlySection) { monthlySection.style.display = 'block'; loadMonthlyReportsList(); }
    }
  }

  function getPeriodMode() { return _periodMode; }

  // ── MONTHLY BUILD FROM WEEKLY REPORTS ────────────────────
  let _selectedWeeklyIds = new Set();

  async function loadMonthlyReportsList() {
    const container = document.getElementById('crMonthlyReportsList');
    const applyBtn  = document.getElementById('crMonthlyApplyBtn');
    if (!container) return;
    _selectedWeeklyIds.clear();

    let reports = [];
    if (window.BarStockCostReportCloud) {
      try {
        const cloudRows = await window.BarStockCostReportCloud.listReports();
        reports = cloudRows.map(normalizeCloudReport);
      } catch(e) { reports = loadReports().slice().reverse(); }
    } else {
      reports = loadReports().slice().reverse();
    }

    if (!reports.length) {
      container.innerHTML = '<div style="font-size:13px;color:#94a3b8;">No saved weekly reports found.</div>';
      return;
    }

    container.innerHTML = reports.map(r => `
      <div class="cr-vendor-block" style="cursor:pointer;" onclick="BarStockCostReport.toggleWeeklySelectionEl('${r.id}', this)">
        <div class="cr-vendor-block-head">
          <div style="display:flex;align-items:center;gap:12px;">
            <input type="checkbox" id="chk_${r.id}" value="${r.id}" onchange="BarStockCostReport.toggleWeeklySelection('${r.id}', this.checked)" onclick="event.stopPropagation()" style="width:16px;height:16px;accent-color:#38bdf8;cursor:pointer;flex-shrink:0;">
            <div class="cr-vendor-tag">${formatPeriod(r.periodFrom, r.periodTo)}</div>
          </div>
          <div class="cr-vendor-subtotal">
            <span>Wine <strong>${Math.round(r.wineCogs||0)}%</strong></span>
            <span class="cr-sep">·</span>
            <span>Liquor <strong>${Math.round(r.liquorCogs||0)}%</strong></span>
            <span class="cr-sep">·</span>
            <span>Total <strong>${fmtMoney((r.totalWine||0)+(r.totalLiquor||0))}</strong></span>
          </div>
        </div>
      </div>
    `).join('');

    container._reports = reports;
    if (applyBtn) applyBtn.style.display = 'none';
  }

  function toggleWeeklySelectionEl(id, el) {
    const chk = document.getElementById('chk_' + id);
    if (!chk) return;
    chk.checked = !chk.checked;
    toggleWeeklySelection(id, chk.checked);
    el.style.borderColor = chk.checked ? '#38bdf8' : '';
    el.style.background = chk.checked ? 'rgba(56,189,248,0.08)' : '';
  }

  function toggleWeeklySelection(id, checked) {
    if (checked) _selectedWeeklyIds.add(id);
    else _selectedWeeklyIds.delete(id);
    const applyBtn = document.getElementById('crMonthlyApplyBtn');
    if (applyBtn) applyBtn.style.display = _selectedWeeklyIds.size > 0 ? 'block' : 'none';
  }

  function applyWeeklyReports() {
    const container = document.getElementById('crMonthlyReportsList');
    const reports = (container?._reports || []).filter(r => _selectedWeeklyIds.has(String(r.id)));
    if (!reports.length) return;

    // Sumar ventas
    let totalWineSales   = 0;
    let totalLiquorSales = 0;
    let totalWineSalesLY = 0;
    let totalLiquorSalesLY = 0;

    reports.forEach(r => {
      totalWineSales    += r.wineSales    || 0;
      totalLiquorSales  += r.liquorSales  || 0;
      totalWineSalesLY  += r.wineSalesLY  || 0;
      totalLiquorSalesLY += r.liquorSalesLY || 0;
    });

    // Setear periodo: desde el mas antiguo al mas reciente
    const sorted = [...reports].sort((a, b) => a.periodFrom.localeCompare(b.periodFrom));
    const periodFrom = sorted[0].periodFrom;
    const periodTo   = sorted[sorted.length - 1].periodTo;

    // Pre-llenar campos de ventas y periodo
    const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setV('crPeriodFrom', periodFrom);
    setV('crPeriodTo',   periodTo);
    setV('crWineSales',    totalWineSales.toFixed(2));
    setV('crLiquorSales',  totalLiquorSales.toFixed(2));
    setV('crWineSalesLY',  totalWineSalesLY.toFixed(2));
    setV('crLiquorSalesLY', totalLiquorSalesLY.toFixed(2));

    // Sumar vendors — byVendor tiene {name, wine, liquor} totales por reporte
    // Creamos una invoice por semana seleccionada para cada vendor
    const vendorMap = {};
    reports.forEach((r, rIdx) => {
      (r.vendors || []).forEach(v => {
        const key = v.name?.toUpperCase() || 'UNKNOWN';
        if (!vendorMap[key]) vendorMap[key] = { name: v.name, weeklyTotals: [] };
        vendorMap[key].weeklyTotals.push({
          wine:   parseFloat(v.wine)   || 0,
          liquor: parseFloat(v.liquor) || 0
        });
      });
    });

    // Una invoice por semana — permite ver el desglose semanal dentro del reporte mensual
    vendors = Object.values(vendorMap).map(v => ({
      name: v.name,
      invoices: v.weeklyTotals.length > 0
        ? v.weeklyTotals.map(wt => ({ wine: wt.wine.toFixed(2), liquor: wt.liquor.toFixed(2) }))
        : [{ wine: '', liquor: '' }]
    }));
    renderVendors();
    updatePreview();

    alert(`Applied ${reports.length} weekly report${reports.length > 1 ? 's' : ''}. Period: ${formatPeriod(periodFrom, periodTo)}.`);
  }

  // ── COMPARATIVA ──────────────────────────────────────────
  let _compareReport = null;

  async function toggleCompareSelector() {
    const wrap = document.getElementById('crCompareSelectorWrap');
    const btn  = document.getElementById('crCompareToggleBtn');
    if (!wrap) return;
    const isOpen = wrap.style.display !== 'none';
    if (isOpen) {
      wrap.style.display = 'none';
      btn.textContent = '+ Select report to compare';
      _compareReport = null;
      document.getElementById('crComparePreview').innerHTML = '';
      return;
    }
    const select = document.getElementById('crCompareSelect');
    select.innerHTML = '<option value="">— Select a saved report —</option>';
    let reports = [];
    if (window.BarStockCostReportCloud) {
      try {
        const cloudRows = await window.BarStockCostReportCloud.listReports();
        reports = cloudRows.map(normalizeCloudReport);
      } catch(e) { reports = loadReports().slice().reverse(); }
    } else {
      reports = loadReports().slice().reverse();
    }
    reports.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = formatPeriod(r.periodFrom, r.periodTo) + ' — Wine ' + Math.round(r.wineCogs||0) + '% · Liquor ' + Math.round(r.liquorCogs||0) + '%';
      select.appendChild(opt);
    });
    wrap.style.display = 'block';
    btn.textContent = '− Hide selector';
    wrap._reports = reports;
  }

  function loadComparison(id) {
    if (!id) { _compareReport = null; document.getElementById('crComparePreview').innerHTML = ''; return; }
    const wrap = document.getElementById('crCompareSelectorWrap');
    const reports = wrap?._reports || _shownReports;
    const r = reports.find(x => String(x.id) === String(id));
    if (!r) return;
    _compareReport = r;
    renderComparePreview();
  }

  function renderComparePreview() {
    const container = document.getElementById('crComparePreview');
    if (!container || !_compareReport) return;
    const prev = _compareReport;
    const curr = getValues();
    const currWineCogs   = curr.wineSales   > 0 ? (curr.totalWine   / curr.wineSales)   * 100 : 0;
    const currLiquorCogs = curr.liquorSales > 0 ? (curr.totalLiquor / curr.liquorSales) * 100 : 0;
    const prevWineCogs   = prev.wineCogs   || 0;
    const prevLiquorCogs = prev.liquorCogs || 0;
    const wineCogsChg   = currWineCogs   - prevWineCogs;
    const liquorCogsChg = currLiquorCogs - prevLiquorCogs;
    const wineVsTarget   = currWineCogs   - (curr.wineTarget   || 22);
    const liquorVsTarget = currLiquorCogs - (curr.liquorTarget || 15);
    const arrow = v => v > 0 ? '▲' : v < 0 ? '▼' : '—';
    const vsTargetBadge = (v) => {
      if (Math.abs(v) < 0.1) return '<span style="font-size:11px;font-weight:500;padding:2px 8px;border-radius:20px;background:rgba(22,163,74,.12);color:#15803d;">✓ on target</span>';
      if (v > 0) return `<span style="font-size:11px;font-weight:500;padding:2px 8px;border-radius:20px;background:rgba(220,38,38,.12);color:#b91c1c;">+${v.toFixed(1)}% over</span>`;
      return `<span style="font-size:11px;font-weight:500;padding:2px 8px;border-radius:20px;background:rgba(22,163,74,.12);color:#15803d;">${v.toFixed(1)}% under</span>`;
    };
    const deltaClr = (v) => v > 0 ? 'color:#dc2626;font-weight:500;' : v < 0 ? 'color:#16a34a;font-weight:500;' : '';

    container.innerHTML = `
      <div class="cr-preview-banner" style="margin-top:12px;">Period Comparison</div>
      <div class="cr-preview-table-wrapper">
        <table class="cr-preview-table">
          <thead>
            <tr>
              <th>Category</th>
              <th class="cr-right">Target</th>
              <th class="cr-right">Prev COGS% <small style="font-weight:400;color:#94a3b8;">${formatPeriod(prev.periodFrom, prev.periodTo)}</small></th>
              <th class="cr-right">Curr COGS%</th>
              <th class="cr-right">Δ vs prev</th>
              <th class="cr-right">Vs target</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span style="display:inline-flex;align-items:center;gap:6px;"><i class="ti ti-glass-full" style="color:#38bdf8;font-size:15px;" aria-hidden="true"></i>Wine</span></td>
              <td class="cr-right" style="color:#94a3b8;">${curr.wineTarget || 22}%</td>
              <td class="cr-right">${prevWineCogs.toFixed(1)}%</td>
              <td class="cr-right">${currWineCogs.toFixed(1)}%</td>
              <td class="cr-right" style="${deltaClr(wineCogsChg)}">${arrow(wineCogsChg)} ${Math.abs(wineCogsChg).toFixed(1)}%</td>
              <td class="cr-right">${vsTargetBadge(wineVsTarget)}</td>
            </tr>
            <tr>
              <td><span style="display:inline-flex;align-items:center;gap:6px;"><i class="ti ti-bottle" style="color:#22c55e;font-size:15px;" aria-hidden="true"></i>Liquor</span></td>
              <td class="cr-right" style="color:#94a3b8;">${curr.liquorTarget || 15}%</td>
              <td class="cr-right">${prevLiquorCogs.toFixed(1)}%</td>
              <td class="cr-right">${currLiquorCogs.toFixed(1)}%</td>
              <td class="cr-right" style="${deltaClr(liquorCogsChg)}">${arrow(liquorCogsChg)} ${Math.abs(liquorCogsChg).toFixed(1)}%</td>
              <td class="cr-right">${vsTargetBadge(liquorVsTarget)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  }

  window.BarStockCostReport = {
    init,
    addCustomVendor,
    saveReport,
    resetForm,
    generatePdf,
    generatePdfBase64: () => generatePdf(false),
    getValues,
    updatePreview,
    setPeriodMode,
    getPeriodMode,
    toggleCompareSelector,
    loadComparison,
    renderComparePreview,
    getCompareReport: () => _compareReport,
    toggleWeeklySelection,
    toggleWeeklySelectionEl,
    applyWeeklyReports,
    _updateInvoice: updateInvoice,
    _addInvoice: addInvoice,
    _removeInvoice: removeInvoice,
    _loadReport: loadReport,
    _deleteReport: deleteReport
  };

  // Auto-init cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
