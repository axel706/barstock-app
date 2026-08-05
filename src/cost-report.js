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
    container.className = 'cr-vendor-grid';
    vendors.forEach((v, vIdx) => {
      const card = document.createElement('div');
      card.className = 'cr-vendor-card';
      const subtotalWine = v.invoices.reduce((s, i) => s + (parseFloat(i.wine) || 0), 0);
      const subtotalLiquor = v.invoices.reduce((s, i) => s + (parseFloat(i.liquor) || 0), 0);
      card.innerHTML = `
        <div class="cr-vendor-card-head">
          <div class="cr-vendor-tag">${escapeHtml(v.name)}</div>
        </div>
        <div class="cr-vendor-card-subtotal">
          <span class="cr-sub-wine">$${subtotalWine.toFixed(2)}</span>
          <span class="cr-sep">·</span>
          <span class="cr-sub-liquor">$${subtotalLiquor.toFixed(2)}</span>
        </div>
        <div class="cr-card-invoices">
          ${v.invoices.map((inv, iIdx) => `
            <div class="cr-card-invoice-row">
              <div class="cr-card-input"><input type="number" step="0.01" placeholder="$ Wine" value="${inv.wine}" oninput="BarStockCostReport._updateInvoice(${vIdx}, ${iIdx}, 'wine', this.value)"></div>
              <div class="cr-card-input"><input type="number" step="0.01" placeholder="$ Liquor" value="${inv.liquor}" oninput="BarStockCostReport._updateInvoice(${vIdx}, ${iIdx}, 'liquor', this.value)"></div>
              ${v.invoices.length > 1 ? `<button class="cr-btn-remove" onclick="BarStockCostReport._removeInvoice(${vIdx}, ${iIdx})" title="Remove">×</button>` : ''}
            </div>
          `).join('')}
        </div>
        <button class="cr-card-add-btn" onclick="BarStockCostReport._addInvoice(${vIdx})">+ Add invoice</button>
      `;
      container.appendChild(card);
    });

    // Ultima celda del grid: agregar vendor. Antes era un boton suelto en
    // el encabezado, lejos de las tarjetas que iba a crear. Como celda,
    // ocupa el hueco que deja el grid y se lee como "aqui va uno mas".
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'cr-vendor-card cr-vendor-add';
    add.onclick = () => addCustomVendor();
    add.innerHTML = `
      <i class="ti ti-plus" aria-hidden="true"></i>
      <span>Add custom vendor</span>`;
    container.appendChild(add);
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

  // Sumar decimales en punto flotante produce cosas como
  // 1506.199999999999. Eso se guardaba tal cual en el reporte y despues
  // reaparecia en el campo al cargarlo. Como son importes de dinero,
  // se redondea a dos decimales en cuanto se suma.
  function money2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function getValues() {
    const num = id => parseFloat((document.getElementById(id) || {}).value) || 0;
    const str = id => ((document.getElementById(id) || {}).value) || '';
    const byVendor = vendors.map(v => ({
      name: v.name,
      wine: money2(v.invoices.reduce((s, i) => s + (parseFloat(i.wine) || 0), 0)),
      liquor: money2(v.invoices.reduce((s, i) => s + (parseFloat(i.liquor) || 0), 0))
    }));
    return {
      byVendor,
      totalWine: money2(byVendor.reduce((s, v) => s + v.wine, 0)),
      totalLiquor: money2(byVendor.reduce((s, v) => s + v.liquor, 0)),
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

    // El panel lateral se refresca desde AQUI, no envolviendo la funcion
    // desde fuera: updateInvoice() llama a updatePreview() internamente y
    // esa llamada nunca pasa por window.BarStockCostReport, asi que un
    // wrapper externo se la saltaba (los invoices no actualizaban el panel).
    if (window.BarStockCostSteps?.renderPanel) {
      try { window.BarStockCostSteps.renderPanel(); } catch (e) { console.warn('cost panel', e); }
    }
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
      notes: d.notes,
      weeklyCogsData: _weeklyCogsData.length > 0 ? _weeklyCogsData : undefined
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

    // Construir mapa de reportes por año/mes/semana
    const byYear = {};
    reports.forEach(r => {
      const year = r.periodFrom.slice(0, 4);
      if (!byYear[year]) byYear[year] = {};
      const month = r.periodFrom.slice(0, 7); // YYYY-MM
      if (!byYear[year][month]) byYear[year][month] = [];
      byYear[year][month].push(r);
    });

    const years = Object.keys(byYear).sort((a, b) => b - a);
    const currentYear = years[0];
    const multiYear = years.length > 1;

    // Determinar color del dot segun COGS vs target
    function dotColor(r) {
      const wt = r.wineTarget || 22;
      const lt = r.liquorTarget || 15;
      const wOver = (r.wineCogs || 0) - wt;
      const lOver = (r.liquorCogs || 0) - lt;
      const maxOver = Math.max(wOver, lOver);
      if (maxOver <= 0) return '#22c55e';
      if (maxOver <= 3) return '#f59e0b';
      return '#ef4444';
    }

    function vsTargetText(r) {
      const wt = r.wineTarget || 22;
      const lt = r.liquorTarget || 15;
      const wOver = ((r.wineCogs || 0) - wt).toFixed(1);
      const lOver = ((r.liquorCogs || 0) - lt).toFixed(1);
      const maxOver = Math.max(parseFloat(wOver), parseFloat(lOver));
      if (maxOver <= 0) return '<span style="color:#22c55e">on target</span>';
      return '<span style="color:#ef4444">+' + maxOver.toFixed(1) + '% over</span>';
    }

    // Nombre de mes
    function monthName(ym) {
      const [y, m] = ym.split('-');
      return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short' });
    }

    // Generar los ultimos 12 meses del año seleccionado
    function getLast12Months(year) {
      const months = [];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        months.push(ym);
      }
      return months;
    }

    function renderHeatmap(year) {
      const months = year === currentYear ? getLast12Months(year) : Object.keys(byYear[year] || {}).sort();
      const yearData = byYear[year] || {};

      const legendHtml = `
        <div class="cr-heatmap-legend">
          <span><span class="cr-heatmap-dot" style="background:#22c55e;"></span>On target</span>
          <span><span class="cr-heatmap-dot" style="background:#f59e0b;"></span>Near target</span>
          <span><span class="cr-heatmap-dot" style="background:#ef4444;"></span>Over target</span>
          <span><span class="cr-heatmap-dot" style="background:var(--color-border-tertiary);"></span>No report</span>
        </div>`;

      const monthsHtml = months.map(ym => {
        const reps = yearData[ym] || [];
        const label = monthName(ym);
        const weeksHtml = reps.length === 0
          ? '<div class="cr-heatmap-empty-month">—</div>'
          : reps.map(r => {
            const wColor = (() => { const o = (r.wineCogs||0)-(r.wineTarget||22); return o<=0?'#22c55e':o<=3?'#f59e0b':'#ef4444'; })();
            const lColor = (() => { const o = (r.liquorCogs||0)-(r.liquorTarget||15); return o<=0?'#22c55e':o<=3?'#f59e0b':'#ef4444'; })();
            return `
            <div class="cr-heatmap-week" onclick="BarStockCostReport._showPopover(event, '${r.id}')">
              <div style="display:flex;gap:3px;flex-shrink:0;">
                <div style="display:flex;flex-direction:column;align-items:center;gap:1px;">
                  <span style="font-size:8px;font-weight:700;color:var(--sub,#64748b);line-height:1;">W</span>
                  <div class="cr-heatmap-dot" style="background:${wColor};"></div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:center;gap:1px;">
                  <span style="font-size:8px;font-weight:700;color:var(--sub,#64748b);line-height:1;">L</span>
                  <div class="cr-heatmap-dot" style="background:${lColor};"></div>
                </div>
              </div>
              <span class="cr-heatmap-week-label">${r.periodFrom.slice(8)} – ${r.periodTo.slice(8)}</span>
            </div>`;
          }).join('');
        return `
          <div class="cr-heatmap-month">
            <div class="cr-heatmap-month-name">${label}</div>
            <div class="cr-heatmap-weeks">${weeksHtml}</div>
          </div>`;
      }).join('');

      return legendHtml + '<div class="cr-heatmap-grid">' + monthsHtml + '</div>';
    }

    // Tabs si hay multiples años
    let tabsHtml = '';
    if (multiYear) {
      tabsHtml = '<div class="cr-heatmap-tabs">' + years.map(y =>
        `<button class="cr-heatmap-tab ${y === currentYear ? 'active' : ''}" onclick="BarStockCostReport._switchYear('${y}')">${y}</button>`
      ).join('') + '</div>';
    }

    container.innerHTML = tabsHtml + '<div id="crHeatmapBody">' + renderHeatmap(currentYear) + '</div>';
    container._renderHeatmap = renderHeatmap;
    container._byYear = byYear;
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
    // Los reportes viejos ya quedaron guardados con decimales sucios, asi
    // que tambien se limpia al leer, no solo al calcular.
    vendors = r.vendors.map(v => ({
      name: v.name,
      invoices: [{ wine: String(money2(v.wine)), liquor: String(money2(v.liquor)) }]
    }));
    // Restaurar weekly cogs data si el reporte tiene multiples invoices
    _weeklyCogsData = r.weeklyCogsData || [];
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

    const TBL_STYLES = { fontSize: 8, cellPadding: { top: 5, right: 8, bottom: 5, left: 8 }, font: 'helvetica', lineColor: [218, 224, 234], lineWidth: 0, textColor: [15, 23, 42], valign: 'middle' };
    const TBL_HEAD = { fillColor: [224, 242, 254], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5, cellPadding: { top: 5, right: 8, bottom: 5, left: 8 } };
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

    // ── GRAFICO SEMANAL ──────────────────────────────────────
    const weeklyData = _weeklyCogsData.length > 1 ? _weeklyCogsData : null;
    if (weeklyData) {
      ensureSpace(140);
      const chartBlockStart = y;
      const chartW  = pageW - margin * 2;
      const chartH  = 80;
      const padL = 32; const padB = 20; const padT = 8; const padR = 32;
      const plotX = margin + padL;
      const plotW = chartW - padL - padR;
      const plotH = chartH - padT - padB;
      const maxInvoices = weeklyData.length;

      const weeklyWine   = weeklyData.map(w => w.wineCogs);
      const weeklyLiquor = weeklyData.map(w => w.liquorCogs);

      const allVals = [...weeklyWine, ...weeklyLiquor, 22, 15];
      const maxVal  = Math.ceil(Math.max(...allVals) / 5) * 5 || 40;
      const minVal  = 0;
      const range   = maxVal - minVal;

      // Banner — identico al resto
      drawBanner('WEEKLY SPEND TREND');

      const plotY0 = y + padT;

      const innerPad = plotW * 0.12;
      const toX = (i) => maxInvoices > 1 ? plotX + innerPad + (i / (maxInvoices - 1)) * (plotW - innerPad * 2) : plotX + plotW / 2;
      const toY = (v) => plotY0 + plotH - ((v - minVal) / range) * plotH;

      // Grid lines
      const gridSteps = 4;
      for (let g = 0; g <= gridSteps; g++) {
        const gv = minVal + (range / gridSteps) * g;
        const gy = toY(gv);
        pdf.setDrawColor(218, 224, 234); pdf.setLineWidth(0.3);
        pdf.line(plotX, gy, plotX + plotW, gy);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(148, 163, 184);
        pdf.text(Math.round(gv) + '%', plotX - 3, gy + 2, { align: 'right' });
      }

      // Target punteado
      const drawDashed = (val, color) => {
        const ty = toY(val);
        pdf.setDrawColor(...color); pdf.setLineWidth(0.8);
        for (let dx = 0; dx < plotW; dx += 6) pdf.line(plotX + dx, ty, Math.min(plotX + dx + 3, plotX + plotW), ty);
      };
      drawDashed(22, [239, 68, 68]);
      drawDashed(15, [245, 158, 11]);

      // Lineas y puntos
      const drawLine = (data, color) => {
        if (data.length < 2) return;
        pdf.setDrawColor(...color); pdf.setLineWidth(1.5);
        for (let i = 0; i < data.length - 1; i++) pdf.line(toX(i), toY(data[i]), toX(i+1), toY(data[i+1]));
        data.forEach((v, i) => {
          pdf.setFillColor(...color);
          pdf.circle(toX(i), toY(v), 2, 'F');
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(...color);
          pdf.text(v.toFixed(0) + '%', toX(i), toY(v) - 3, { align: 'center' });
        });
      };
      drawLine(weeklyWine,   [56, 189, 248]);
      drawLine(weeklyLiquor, [34, 197, 94]);

      // X labels — solo numero de semana para evitar overflow
      for (let i = 0; i < maxInvoices; i++) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(148, 163, 184);
        pdf.text('Wk ' + (i + 1), toX(i), plotY0 + plotH + 10, { align: 'center' });
      }

      // Leyenda inline compacta
      const legY = plotY0 + plotH + 16;
      const legItems = [
        { label: 'Wine COGS%', color: [56, 189, 248] },
        { label: 'Liquor COGS%', color: [34, 197, 94] },
        { label: 'Wine target 22%', color: [239, 68, 68], dashed: true },
        { label: 'Liquor target 15%', color: [245, 158, 11], dashed: true },
      ];
      let legX = plotX;
      legItems.forEach(item => {
        if (item.dashed) {
          pdf.setDrawColor(...item.color); pdf.setLineWidth(0.8);
          for (let dx = 0; dx < 12; dx += 4) pdf.line(legX + dx, legY, legX + dx + 2, legY);
        } else {
          pdf.setFillColor(...item.color); pdf.circle(legX + 3, legY, 1.5, 'F');
          pdf.setDrawColor(...item.color); pdf.setLineWidth(0.8); pdf.line(legX, legY, legX + 6, legY);
        }
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(100, 116, 139);
        pdf.text(item.label, legX + 10, legY + 2);
        legX += pdf.getTextWidth(item.label) + 20;
      });

      y += chartH + 20;
      drawRoundedBlock(chartBlockStart, y);
      y += 8;
    }

    // ── COMPARATIVA DE PERIODO EN PDF ────────────────────────
    if (_compareReport) {
      ensureSpace(80);
      const prev = _compareReport;
      const currWineCogs   = d.wineSales   > 0 ? (d.totalWine   / d.wineSales)   * 100 : 0;
      const currLiquorCogs = d.liquorSales > 0 ? (d.totalLiquor / d.liquorSales) * 100 : 0;
      const prevWineCogs   = prev.wineCogs   || 0;
      const prevLiquorCogs = prev.liquorCogs || 0;
      const wineCogsChg    = currWineCogs   - prevWineCogs;
      const liquorCogsChg  = currLiquorCogs - prevLiquorCogs;
      const wineVsTarget   = currWineCogs   - (d.wineTarget   || 22);
      const liquorVsTarget = currLiquorCogs - (d.liquorTarget || 15);

      const compBlockStart = y;
      drawBanner('PERIOD COMPARISON');

      const colW1 = tableWidth * 0.22;
      const colW2 = tableWidth * 0.13;
      const colW3 = tableWidth * 0.20;
      const colW4 = tableWidth * 0.20;
      const colW5 = tableWidth * 0.13;
      const colW6 = tableWidth * 0.12;

      pdf.autoTable({
        startY: y,
        head: [['Category', 'Target', `Prev COGS% (${formatPeriod(prev.periodFrom, prev.periodTo).split(' — ')[0]})`, 'Curr COGS%', 'Delta', 'Vs Target']],
        body: [
          ['Wine',   (d.wineTarget   || 22) + '%', prevWineCogs.toFixed(1)   + '%', currWineCogs.toFixed(1)   + '%', (wineCogsChg   > 0 ? '+' : '') + wineCogsChg.toFixed(1)   + '%', (wineVsTarget   > 0.1 ? '+' : '') + wineVsTarget.toFixed(1)   + '% vs target'],
          ['Liquor', (d.liquorTarget || 15) + '%', prevLiquorCogs.toFixed(1) + '%', currLiquorCogs.toFixed(1) + '%', (liquorCogsChg > 0 ? '+' : '') + liquorCogsChg.toFixed(1) + '%', (liquorVsTarget > 0.1 ? '+' : '') + liquorVsTarget.toFixed(1) + '% vs target'],
        ],
        margin: { left: margin, right: margin }, theme: 'plain',
        styles: TBL_STYLES, headStyles: TBL_HEAD,
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold', cellWidth: colW1 },
          1: { halign: 'right', cellWidth: colW2, textColor: [148, 163, 184] },
          2: { halign: 'right', cellWidth: colW3 },
          3: { halign: 'right', cellWidth: colW4 },
          4: { halign: 'right', cellWidth: colW5, fontStyle: 'bold',
               textColor: wineCogsChg > 0 ? [220, 38, 38] : [22, 163, 74] },
          5: { halign: 'right', cellWidth: colW6 }
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 4) {
            const chg = data.row.index === 0 ? wineCogsChg : liquorCogsChg;
            data.cell.styles.textColor = chg > 0 ? [220, 38, 38] : [22, 163, 74];
          }
          if (data.section === 'body' && data.column.index === 5) {
            const vs = data.row.index === 0 ? wineVsTarget : liquorVsTarget;
            data.cell.styles.textColor = vs > 0.1 ? [220, 38, 38] : [22, 163, 74];
          }
          if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right';
        },
        didDrawCell: rowSeparators
      });
      y = pdf.lastAutoTable.finalY;
      drawRoundedBlock(compBlockStart, y);
      y += 12;
    }

    // Auto Insights — un insight por linea
    const perfParts = buildPerformanceNote(d, expectedWine, expectedLiquor);
    if (perfParts) {
      ensureSpace(80);
      y += 16;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(30, 91, 138);
      pdf.text('Auto Insights', margin, y); y += 14;

      // Separar insights — cada uno termina con punto seguido de espacio y mayuscula
      const rawText = stripHtml(perfParts);
      // Split solo en ". " seguido de mayuscula (evita partir numeros decimales)
      const sentences = rawText.split(/\.\s+(?=[A-Z])/).filter(s => s.trim());

      sentences.forEach(sentence => {
        const trimmed = sentence.trim().replace(/\.+$/, '') + '.';
        ensureSpace(30);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(15, 23, 42);
        const wrapped = pdf.splitTextToSize(trimmed, pageW - margin * 2);
        pdf.text(wrapped, margin, y);
        y += wrapped.length * 11 + 2;
      });
      y += 6;
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
    const totalPgs = pdf.getNumberOfPages();
    for (let pg = 1; pg <= totalPgs; pg++) {
      pdf.setPage(pg);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(148, 163, 184);
      pdf.text(location + ' \u2013 Internal Use Only', margin, pageH - 20);
      if (pg === totalPgs) {
        pdf.text('Generated by BarStock Pro \u00b7 Automated reporting system', pageW - margin, pageH - 20, { align: 'right' });
      }
    }

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

    // El bloque mensual se acaba de mostrar/ocultar por modo, pero tambien
    // pertenece al paso 1. Sin esto aparecería aunque estes en otro paso.
    if (window.BarStockCostSteps?.refresh) window.BarStockCostSteps.refresh();
  }

  function getPeriodMode() { return _periodMode; }

  // ── MONTHLY BUILD FROM WEEKLY REPORTS ────────────────────
  let _selectedWeeklyIds = new Set();
  let _weeklyCogsData = [];

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

    // Build calendar
    const byMonth = {};
    reports.forEach(r => {
      const ym = r.periodFrom.slice(0, 7);
      if (!byMonth[ym]) byMonth[ym] = [];
      byMonth[ym].push(r);
    });
    const byYear = {};
    Object.keys(byMonth).forEach(ym => {
      const y = ym.slice(0, 4);
      if (!byYear[y]) byYear[y] = {};
      byYear[y][ym] = byMonth[ym];
    });
    const years = Object.keys(byYear).sort((a, b) => b - a);
    let _calYear = years[0];
    let _calMonth = null;

    const calYearsEl = document.getElementById('crCalendarYears');
    const calMonthsEl = document.getElementById('crCalendarMonths');
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    function renderCalendar() {
      if (!calYearsEl || !calMonthsEl) return;
      calYearsEl.innerHTML = years.map(y =>
        `<button onclick="window._crCalSelectYear('${y}')"
          class="oh-filter-chip ${_calYear===y?'active':''}">${y}</button>`
      ).join('');

      calMonthsEl.innerHTML = monthNames.map((name, i) => {
        const key = `${_calYear}-${String(i+1).padStart(2,'0')}`;
        const has = !!(byYear[_calYear] && byYear[_calYear][key]);
        const sel = _calMonth === key;
        return `<button onclick="window._crCalSelectMonth('${key}',${has})"
          style="padding:10px 4px;border-radius:10px;font-size:13px;font-weight:700;cursor:${has?'pointer':'default'};
          background:${sel?'#bfedff':has?'#dcfce7':'rgba(0,0,0,.04)'};
          color:${sel?'#0369a1':has?'#15803d':'#94a3b8'};
          border:1.5px solid ${sel?'#38bdf8':has?'#22c55e':'#e2e8f0'};
          transition:all .15s">${name}</button>`;
      }).join('');
    }

    window._crCalSelectYear = function(y) {
      _calYear = y; _calMonth = null;
      renderCalendar(); renderList();
    };
    window._crCalSelectMonth = function(key, has) {
      if (!has) return;
      _calMonth = _calMonth === key ? null : key;
      renderCalendar(); renderList();
    };

    function renderList() {
      if (!_calMonth) { container.innerHTML = ''; container._reports = []; if (applyBtn) applyBtn.style.display = 'none'; return; }
      const filtered = _calMonth
        ? (byMonth[_calMonth] || [])
        : reports.filter(r => r.periodFrom.startsWith(_calYear));
      container.innerHTML = filtered.map(r => `
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
      </div>`).join('') || (window.BarStockEmpty
        ? window.BarStockEmpty.block({
            icon: 'ti-calendar-off',
            title: 'No reports for this period',
            text: 'Pick another month, or import a cost report for these weeks.'
          })
        : '<div style="font-size:13px;color:#94a3b8;padding:8px 0">No reports for this period.</div>');
      container._reports = filtered;
      if (applyBtn) applyBtn.style.display = 'none';
      _selectedWeeklyIds.clear();
    }

    renderCalendar();
    // No mostrar lista hasta que se seleccione un mes
    container._reports = [];
    if (applyBtn) applyBtn.style.display = 'none';
    window._crCalMonth = null;
    return;

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

    // Guardar COGS% por semana para el grafico
    _weeklyCogsData = sorted.map(r => ({
      label: formatPeriod(r.periodFrom, r.periodTo).split(' — ')[0],
      wineCogs:   r.wineCogs   || 0,
      liquorCogs: r.liquorCogs || 0
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
      if (btn) btn.textContent = '+ Select report to compare';
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
    if (btn) btn.textContent = '− Hide selector';
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

  // ── HEATMAP HELPERS ─────────────────────────────────────
  function switchYear(year) {
    const container = document.getElementById('crHistoryContainer');
    if (!container || !container._renderHeatmap) return;
    document.querySelectorAll('.cr-heatmap-tab').forEach(t => t.classList.toggle('active', t.textContent === year));
    document.getElementById('crHeatmapBody').innerHTML = container._renderHeatmap(year);
  }

  function showPopover(e, id) {
    e.stopPropagation();
    document.querySelectorAll('.cr-heatmap-popover').forEach(p => p.remove());

    const r = _shownReports.find(x => String(x.id) === String(id));
    if (!r) return;

    const wt = r.wineTarget || 22;
    const lt = r.liquorTarget || 15;
    const maxOver = Math.max((r.wineCogs || 0) - wt, (r.liquorCogs || 0) - lt);
    const vsTarget = maxOver <= 0
      ? '<span style="color:#22c55e;">on target</span>'
      : '<span style="color:#ef4444;">+' + maxOver.toFixed(1) + '% over</span>';

    const pop = document.createElement('div');
    pop.className = 'cr-heatmap-popover';
    pop.innerHTML = `
      <div class="cr-pop-period">${formatPeriod(r.periodFrom, r.periodTo)}</div>
      <div class="cr-pop-stats">
        <div class="cr-pop-stat"><span class="cr-pop-label">Wine COGS</span><span class="cr-pop-val" style="color:#38bdf8;">${Math.round(r.wineCogs || 0)}%</span></div>
        <div class="cr-pop-stat"><span class="cr-pop-label">Liquor COGS</span><span class="cr-pop-val" style="color:#22c55e;">${Math.round(r.liquorCogs || 0)}%</span></div>
        <div class="cr-pop-stat"><span class="cr-pop-label">Total spend</span><span class="cr-pop-val">${fmtMoney((r.totalWine || 0) + (r.totalLiquor || 0))}</span></div>
        <div class="cr-pop-stat"><span class="cr-pop-label">Vs target</span><span class="cr-pop-val">${vsTarget}</span></div>
      </div>
      <div class="cr-pop-actions">
        <button class="cr-pop-btn" onclick="BarStockCostReport._loadReport('${r.id}');document.querySelectorAll('.cr-heatmap-popover').forEach(p=>p.remove())">Load</button>
        <button class="cr-pop-btn cr-pop-danger" onclick="BarStockCostReport._deleteReport('${r.id}')">Delete</button>
      </div>`;

    // Anclar al week element
    const week = e.currentTarget;
    week.style.position = 'relative';
    week.appendChild(pop);
    pop.style.position = 'absolute';
    pop.style.top = '0';
    pop.style.left = '110%';
    pop.style.zIndex = '99999';

    // Si se sale por la derecha, mostrar a la izquierda
    requestAnimationFrame(() => {
      const popRect = pop.getBoundingClientRect();
      if (popRect.right > window.innerWidth - 10) {
        pop.style.left = 'auto';
        pop.style.right = '110%';
      }
    });

    setTimeout(() => document.addEventListener('click', function close() {
      document.querySelectorAll('.cr-heatmap-popover').forEach(p => p.remove());
      document.removeEventListener('click', close);
    }), 10);
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
    _deleteReport: deleteReport,
    _showPopover: showPopover,
    _switchYear: switchYear
  };

  // Auto-init cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
