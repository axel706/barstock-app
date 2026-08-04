(() => {
  if (window.__barstockOrderHistoryUiBooted) return;
  window.__barstockOrderHistoryUiBooted = true;

  let _showPrevious = false;

  function getCurrentWeekStart() {
    if (window.BarStockParIntelligence?.getEffectiveWeekStart) {
      return window.BarStockParIntelligence.getEffectiveWeekStart();
    }
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 1 : (1 - day);
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().split('T')[0];
  }

  function isCurrentCycle(createdAt) {
    const weekStart = getCurrentWeekStart();
    const orderDate = new Date(createdAt);
    const monday = new Date(weekStart + 'T00:00:00');
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59);
    return orderDate >= monday && orderDate <= sunday;
  }

  function vendorBadgeHtml(vendor) {
    return typeof badge === 'function' ? badge(vendor) : `<span>${vendor}</span>`;
  }

  function orderCardHtml(order) {
    const exportLabel = order.exportType === 'loop_csv' ? 'CSV' : 'JPG';
    return `
      <div class="oh-card">
        <div class="oh-card-top">
          ${vendorBadgeHtml(order.vendor)}
          ${order.poNumber ? `<span class="oh-card-po">${escapeHtml(order.poNumber)}</span>` : ''}
        </div>
        <div>
          <div class="oh-card-amount">${escapeHtml(fmtMoney(order.subtotal || 0))}</div>
          <div class="oh-card-sub">${escapeHtml(String(order.items.length))} item${order.items.length===1?'':'s'} · ${escapeHtml(fmt(order.totalUnits))} btl <span class="oh-card-badge">${exportLabel}</span></div>
        </div>
        <div class="oh-card-footer">
          <div class="oh-card-time">${escapeHtml(formatHistoryDate(order.createdAt))}</div>
          <div class="oh-card-actions">
            <button class="oh-card-btn primary" onclick="openEmailOrderModal('${order.id}')" title="Email order"><i class="ti ti-mail" style="font-size:14px"></i></button>
            <button class="oh-card-btn" onclick="reopenHistoryOrder('${order.id}', this)" title="Re-open order"><i class="ti ti-refresh" style="font-size:14px"></i></button>
            <button class="oh-card-btn danger" onclick="deleteHistoryOrder('${order.id}', this)" title="Delete order"><i class="ti ti-trash" style="font-size:14px"></i></button>
            <button class="oh-card-btn" onclick="toggleHcExpanded('${order.id}')" title="More" id="hcChevron_${order.id}"><i class="ti ti-dots" style="font-size:14px"></i></button>
          </div>
        </div>
      </div>
      <div class="hc-expanded hidden" id="hcExpanded_${order.id}" style="border-top:0.5px solid rgba(255,255,255,.06);padding-top:10px;display:flex;flex-wrap:wrap;gap:6px">
        <button class="hc-exp-btn" onclick="toggleHistoryDetails('${order.id}')">View items</button>
        <button class="hc-exp-btn compare-select-btn ${compareSelection.includes(order.id) ? 'active' : ''}" onclick="toggleCompareSelection('${order.id}')">${compareSelection.includes(order.id) ? 'Selected' : 'Select'}</button>
        <button class="hc-exp-btn" onclick="compareWithPrevious('${order.id}')">Compare to previous</button>
        <button class="hc-exp-btn" onclick="openHistoryDateEdit('${order.id}')">Edit date</button>
        <button class="hc-exp-btn" onclick="reExportHistoryOrder('${order.id}')">Re-export</button>
      </div>
      <div class="history-items hidden" id="historyItems_${order.id}" style="border-top:0.5px solid rgba(255,255,255,.06);padding-top:10px">
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <thead><tr><th style="text-align:left;padding:4px 8px;color:var(--sub);font-size:10px;letter-spacing:0.06em;text-transform:uppercase">Code</th><th style="text-align:left;padding:4px 8px;color:var(--sub);font-size:10px;letter-spacing:0.06em;text-transform:uppercase">Item</th><th style="text-align:right;padding:4px 8px;color:var(--sub);font-size:10px;letter-spacing:0.06em;text-transform:uppercase">Qty</th></tr></thead>
          <tbody>${order.items.map(item => '<tr><td style="padding:3px 8px;color:var(--sub)">' + escapeHtml(item.code) + '</td><td style="padding:3px 8px;color:var(--text)">' + escapeHtml(item.item) + '</td><td style="padding:3px 8px;text-align:right;font-weight:600;color:var(--text)">' + fmt(item.finalOrder) + '</td></tr>').join('')}</tbody>
        </table>
      </div>`;
  }

  function orderRowHtml(order) {
    const exportLabel = order.exportType === 'loop_csv' ? 'CSV' : 'JPG';
    return `
      <div class="oh-prev-row">
        ${vendorBadgeHtml(order.vendor)}
        ${order.poNumber ? `<span class="oh-card-po">${escapeHtml(order.poNumber)}</span>` : ''}
        <div class="oh-prev-meta">
          <span>${escapeHtml(String(order.items.length))} item${order.items.length===1?'':'s'}</span>
          <span>${escapeHtml(fmt(order.totalUnits))} btl</span>
          <span style="font-weight:600;color:var(--text)">${escapeHtml(fmtMoney(order.subtotal || 0))}</span>
          <span class="oh-card-badge">${exportLabel}</span>
        </div>
        <div class="oh-prev-time">${escapeHtml(formatHistoryDate(order.createdAt))}</div>
        <div class="oh-prev-actions">
          <button class="oh-card-btn primary" onclick="openEmailOrderModal('${order.id}')" title="Email order"><i class="ti ti-mail" style="font-size:13px"></i></button>
          <button class="oh-card-btn" onclick="reopenHistoryOrder('${order.id}', this)" title="Re-open order"><i class="ti ti-refresh" style="font-size:13px"></i></button>
          <button class="oh-card-btn danger" onclick="deleteHistoryOrder('${order.id}', this)" title="Delete order"><i class="ti ti-trash" style="font-size:13px"></i></button>
          <button class="oh-card-btn" onclick="toggleHcExpanded('${order.id}')" title="More" id="hcChevron_${order.id}"><i class="ti ti-dots" style="font-size:13px"></i></button>
        </div>
      </div>
      <div class="hc-expanded hidden" id="hcExpanded_${order.id}">
        <button class="hc-exp-btn" onclick="toggleHistoryDetails('${order.id}')">View items</button>
        <button class="hc-exp-btn" onclick="reExportHistoryOrder('${order.id}')">Re-export</button>
        <button class="hc-exp-btn" onclick="openHistoryDateEdit('${order.id}')">Edit date</button>
      </div>
      <div class="history-items hidden" id="historyItems_${order.id}">
        <table>
          <thead><tr><th>CODE</th><th>ITEM</th><th>FINAL ORDER</th></tr></thead>
          <tbody>${order.items.map(item => '<tr><td>' + escapeHtml(item.code) + '</td><td>' + escapeHtml(item.item) + '</td><td>' + fmt(item.finalOrder) + '</td></tr>').join('')}</tbody>
        </table>
      </div>`;
  }

  function renderOrderHistory() {
    const wrap = document.getElementById('historyList');
    if (!wrap) return;

    const vendorFilter = String(historyVendorTab || 'ALL');
    const history = Array.isArray(state.orderHistory) ? [...state.orderHistory] : [];

    const filtered = history
      .filter(order => vendorFilter === 'ALL' || String(order.vendor || '') === vendorFilter)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (!filtered.length) {
      // Distinguir "todavia no has ordenado nada" de "este vendor no tiene
      // ordenes": son situaciones distintas y el usuario hace cosas distintas.
      if (window.BarStockEmpty) {
        wrap.innerHTML = (vendorFilter !== 'ALL' && history.length)
          ? window.BarStockEmpty.block({
              icon: 'ti-filter-off',
              title: 'No orders for this vendor',
              text: 'Switch to All Vendors to see the rest of your history.'
            })
          : window.BarStockEmpty.block({
              icon: 'ti-receipt',
              title: 'No orders yet',
              text: 'Orders you place will show up here.'
            });
      } else {
        wrap.innerHTML = `<div class="oh-empty">No orders found.</div>`;
      }
      renderCompareToolbar();
      return;
    }

    const current = filtered.filter(o => isCurrentCycle(o.createdAt));
    const previous = filtered.filter(o => !isCurrentCycle(o.createdAt));

    // Vendor filter chips
    const vendors = ['ALL', ...new Set(history.map(o => o.vendor).filter(Boolean))];
    const chipsHtml = `
      <div class="oh-filters">
        ${vendors.map(v => `<div class="oh-filter-chip ${vendorFilter===v?'active':''}" onclick="setHistoryVendorTab('${v}')">${v}</div>`).join('')}
      </div>`;

    // Current week cards
    const currentHtml = current.length ? `
      <div class="oh-week-label">Current cycle</div>
      <div class="oh-card-grid">
        ${current.map(orderCardHtml).join('')}
      </div>` : '';

    // Previous weeks
    let previousHtml = '';
    if (previous.length) {
      if (_showPrevious) {
        // Group by week
        const groups = previous.reduce((acc, order) => {
          const key = formatHistoryGroupDate(order.createdAt);
          if (!acc[key]) acc[key] = [];
          acc[key].push(order);
          return acc;
        }, {});

        const groupsHtml = Object.entries(groups).map(([label, orders]) => `
          <div class="oh-week-label" style="margin-top:14px">${escapeHtml(label)}</div>
          <div class="oh-prev-list">${orders.map(orderRowHtml).join('')}</div>
        `).join('');

        previousHtml = `
          ${groupsHtml}
          <button class="oh-load-btn" onclick="window.__ohTogglePrevious()">
            <i class="ti ti-chevron-up" aria-hidden="true"></i> Hide previous weeks
          </button>`;
      } else {
        previousHtml = `
          <button class="oh-load-btn" onclick="window.__ohTogglePrevious()">
            <i class="ti ti-chevron-down" aria-hidden="true"></i> Load previous weeks (${previous.length} orders)
          </button>`;
      }
    }

    wrap.innerHTML = chipsHtml + currentHtml + previousHtml;
    renderCompareToolbar();
  }

  window.__ohTogglePrevious = function() {
    _showPrevious = !_showPrevious;
    renderOrderHistory();
  };

  window.setHistoryVendorTab = function(vendor) {
    historyVendorTab = vendor;
    renderOrderHistory();
  };

  function toggleHistoryDetails(id) {
    const el = document.getElementById(`historyItems_${id}`);
    if (el) el.classList.toggle('hidden');
  }

  async function deleteHistoryOrder(id, triggerBtn) {
    await refreshOrdersFromCloud();
    try {
      if (typeof setButtonBusy === 'function') setButtonBusy(triggerBtn, 'DELETING');
      if (typeof window.deleteOrderFromSupabase === 'function') {
        await window.deleteOrderFromSupabase(id);
      } else {
        throw new Error('Orders cloud delete helper not available');
      }
      const deletedOrder = (state.orderHistory || []).find(o => o.id === id);
      if (deletedOrder && window.BarStockParIntelligence) {
        window.BarStockParIntelligence.reverseSnapshotOrdered(deletedOrder).catch(err => console.warn('[ParIntelligence] reverse failed:', err));
      }
      state.orderHistory = (state.orderHistory || []).filter(order => order.id !== id);
      compareSelection = compareSelection.filter(entryId => entryId !== id);
      if (typeof rebuildPlacedOrdersFromHistory === 'function') rebuildPlacedOrdersFromHistory();
      saveState();
      renderCompareToolbar();
      renderOrderHistory();
      if (typeof render === 'function') render();
      setStatus('Order removed from history and cloud.');
    } catch (err) {
      console.error(err);
      alert('Could not delete order from cloud.');
      setStatus('Error deleting order from cloud.');
    } finally {
      if (typeof clearButtonBusy === 'function') clearButtonBusy(triggerBtn);
    }
  }

  async function refreshOrdersFromCloud() {
    try {
      if (typeof window.loadOrdersFromCloud === 'function') {
        await window.loadOrdersFromCloud();
      } else {
        throw new Error('Orders cloud loader not available');
      }
    } catch (err) {
      console.error(err);
      setStatus('Could not refresh orders from cloud.');
    }
  }

  async function reopenHistoryOrder(id, triggerBtn) {
    const order = (state.orderHistory || []).find(entry => entry.id === id);
    if (!order) return;
    try {
      if (typeof setButtonBusy === 'function') setButtonBusy(triggerBtn, 'REOPENING');
      if (typeof window.deleteOrderFromSupabase === 'function') {
        await window.deleteOrderFromSupabase(id);
      } else {
        throw new Error('Orders cloud delete helper not available');
      }
      if (order && window.BarStockParIntelligence) {
        window.BarStockParIntelligence.reverseSnapshotOrdered(order).catch(err => console.warn('[ParIntelligence] reverse failed:', err));
      }
      if (typeof window.loadOrdersFromCloud === 'function') await window.loadOrdersFromCloud();
      if (typeof setStatus === 'function') setStatus(`${order.vendor} order re-opened and synced from cloud.`);
    } catch (err) {
      console.error(err);
      alert('Could not re-open order from cloud.\n\n' + (err.message || String(err)));
      if (typeof setStatus === 'function') setStatus('Error re-opening order from cloud.');
    } finally {
      if (typeof clearButtonBusy === 'function') clearButtonBusy(triggerBtn);
    }
  }

  async function reExportHistoryOrder(id) {
    const order = (state.orderHistory || []).find(entry => entry.id === id);
    if (!order) return;
    if (order.exportType === 'loop_csv') {
      exportLoopCsvFromRows(order.items, order.filename || 'loop_upload.csv');
      setStatus(`LOOP upload-ready CSV re-exported from Order History.`);
    } else {
      await exportVendorJpgFromRows(order.vendor, order.items, order.filename || `vendor_order_${String(order.vendor||'').toLowerCase().replace(/\s+/g,'_')}.jpg`);
      setStatus(`Vendor JPG re-exported for ${order.vendor}.`);
    }
  }

  function openOrderItemsModal(id) {
    const order = (state.orderHistory || []).find(o => o.id === id);
    if (!order) return;
    const modal = document.getElementById('ohItemsModal');
    const title = document.getElementById('ohItemsModalTitle');
    const sub = document.getElementById('ohItemsModalSub');
    const body = document.getElementById('ohItemsModalBody');
    if (!modal || !body) return;
    title.textContent = order.vendor + ' — ' + (order.poNumber || '');
    sub.textContent = formatHistoryDate(order.createdAt) + ' · ' + order.items.length + ' items · ' + fmt(order.totalUnits) + ' btl';
    body.innerHTML = order.items.map(item =>
      '<tr><td>' + escapeHtml(item.code || '') + '</td><td>' + escapeHtml(item.item || '') + '</td><td style="font-weight:600;text-align:right">' + fmt(item.finalOrder) + '</td></tr>'
    ).join('');
    closeAllOhPopovers();
    modal.classList.remove('hidden');
  }

  function closeAllOhPopovers() {
    document.querySelectorAll('.oh-popover').forEach(p => p.remove());
  }

  function toggleHcExpanded(id) {
    const existing = document.getElementById('ohPop_' + id);
    if (existing) { existing.remove(); return; }
    closeAllOhPopovers();

    const btn = document.getElementById('hcChevron_' + id);
    if (!btn) return;
    const order = (state.orderHistory || []).find(o => o.id === id);
    if (!order) return;

    const pop = document.createElement('div');
    pop.id = 'ohPop_' + id;
    pop.className = 'oh-popover';
    const isSelected = compareSelection.includes(id);
    pop.innerHTML = [
      `<button class="oh-pop-btn" onclick="openOrderItemsModal('${id}')"><i class="ti ti-list-details"></i> View items</button>`,
      `<button class="oh-pop-btn ${isSelected ? 'active' : ''}" onclick="toggleCompareSelection('${id}');closeAllOhPopovers()"><i class="ti ti-checkbox"></i> ${isSelected ? 'Selected' : 'Select'}</button>`,
      `<button class="oh-pop-btn" onclick="compareWithPrevious('${id}');closeAllOhPopovers()"><i class="ti ti-arrows-diff"></i> Compare to previous</button>`,
      `<button class="oh-pop-btn" onclick="openHistoryDateEdit('${id}');closeAllOhPopovers()"><i class="ti ti-calendar-edit"></i> Edit date</button>`,
      `<button class="oh-pop-btn" onclick="reExportHistoryOrder('${id}');closeAllOhPopovers()"><i class="ti ti-download"></i> Re-export</button>`,
    ].join('');

    // Position relative to button
    const rect = btn.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.top = (rect.bottom + 6) + 'px';
    pop.style.right = (window.innerWidth - rect.right) + 'px';
    pop.style.zIndex = '99999';
    document.body.appendChild(pop);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!pop.contains(e.target) && e.target !== btn) {
          pop.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 10);
  }

  window.renderOrderHistory     = renderOrderHistory;
  window.openOrderItemsModal    = openOrderItemsModal;
  window.closeAllOhPopovers     = closeAllOhPopovers;
  window.toggleHcExpanded       = toggleHcExpanded;
  window.toggleHistoryDetails   = toggleHistoryDetails;
  window.deleteHistoryOrder     = deleteHistoryOrder;
  window.refreshOrdersFromCloud = refreshOrdersFromCloud;
  window.reopenHistoryOrder     = reopenHistoryOrder;
  window.reExportHistoryOrder   = reExportHistoryOrder;

})();
