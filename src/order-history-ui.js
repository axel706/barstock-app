(() => {
  if (window.__barstockOrderHistoryUiBooted) return;
  window.__barstockOrderHistoryUiBooted = true;

  function renderOrderHistory(){
    const wrap = document.getElementById('historyList');
    if(!wrap) return;
    const searchTerm = normalizeName(document.getElementById('historySearchInput')?.value || '');
    const vendorFilter = String(historyVendorTab || 'ALL');
    const dateFilter = String(document.getElementById('historyDateFilter')?.value || '');
    const history = Array.isArray(state.orderHistory) ? [...state.orderHistory] : [];
    const filtered = history
      .filter(order => {
        const vendorOk = vendorFilter === 'ALL' || String(order.vendor || '') === vendorFilter;
        const dateOk = !dateFilter || normalizeHistoryDateInput(order.createdAt) === dateFilter;
        const searchBlob = normalizeName([
          order.vendor || '',
          order.exportType || '',
          ...(Array.isArray(order.items) ? order.items.flatMap(item => [item.item || '', item.code || '']) : [])
        ].join(' '));
        const searchOk = !searchTerm || searchBlob.includes(searchTerm);
        return vendorOk && dateOk && searchOk;
      })
      .sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));

    if(!filtered.length){
      wrap.innerHTML = `<div class="history-empty">No orders found.</div>`;
      renderCompareToolbar();
      return;
    }

    const groups = filtered.reduce((acc, order) => {
      const key = formatHistoryGroupDate(order.createdAt);
      if(!acc[key]) acc[key] = [];
      acc[key].push(order);
      return acc;
    }, {});

    wrap.innerHTML = Object.entries(groups).map(([label, orders]) => `
      <div class="history-date-group">
        <div class="history-date-label">${escapeHtml(label)}</div>
        ${orders.map(order => `
          <div class="history-card">
            <div class="hc-row">
              ${badge(order.vendor)}
              ${order.poNumber ? `<span class="hc-po">${escapeHtml(order.poNumber)}</span>` : ''}
              <div class="hc-meta">
                <span class="hc-meta-item"><strong>${escapeHtml(String(order.items.length))}</strong> item${order.items.length===1?'':'s'}</span>
                <span class="hc-meta-item"><strong>${escapeHtml(fmt(order.totalUnits))}</strong> btl</span>
                <span class="hc-meta-item"><strong>${escapeHtml(fmtMoney(order.subtotal || 0))}</strong></span>
                <span class="hc-meta-item" style="color:var(--sub);font-size:11px">${escapeHtml(order.exportType === 'loop_csv' ? 'CSV' : 'JPG')}</span>
              </div>
              <span class="hc-time">${escapeHtml(formatHistoryDate(order.createdAt))}</span>
              <button class="hc-icon-btn primary" onclick="openEmailOrderModal('${order.id}')" title="Email order"><i class="ti ti-mail" style="font-size:16px"></i></button>
              <button class="hc-icon-btn" onclick="reopenHistoryOrder('${order.id}', this)" title="Re-open order"><i class="ti ti-refresh" style="font-size:16px"></i></button>
              <button class="hc-icon-btn danger" onclick="deleteHistoryOrder('${order.id}', this)" title="Delete order"><i class="ti ti-trash" style="font-size:16px"></i></button>
              <button class="hc-icon-btn" onclick="toggleHcExpanded('${order.id}')" title="More actions" id="hcChevron_${order.id}"><i class="ti ti-dots" style="font-size:16px"></i></button>
            </div>
            <div class="hc-expanded hidden" id="hcExpanded_${order.id}">
              <button class="hc-exp-btn" onclick="toggleHistoryDetails('${order.id}')">View items</button>
              <button class="hc-exp-btn compare-select-btn ${compareSelection.includes(order.id) ? 'active' : ''}" onclick="toggleCompareSelection('${order.id}')">${compareSelection.includes(order.id) ? 'Selected' : 'Select'}</button>
              <button class="hc-exp-btn" onclick="compareWithPrevious('${order.id}')">Compare to previous</button>
              <button class="hc-exp-btn" onclick="openHistoryDateEdit('${order.id}')">Edit date</button>
              <button class="hc-exp-btn" onclick="reExportHistoryOrder('${order.id}')">Re-export</button>
            </div>
            <div class="history-items hidden" id="historyItems_${order.id}">
              <table>
                <thead><tr><th>CODE</th><th>ITEM</th><th>FINAL ORDER</th></tr></thead>
                <tbody>
                  ${order.items.map(item => `<tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.item)}</td><td>${fmt(item.finalOrder)}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>`).join('')}
      </div>`).join('');
  }

  function toggleHistoryDetails(id){
    const el = document.getElementById(`historyItems_${id}`);
    if(el) el.classList.toggle('hidden');
  }

  async function deleteHistoryOrder(id, triggerBtn){
    await refreshOrdersFromCloud();
    try{
      if (typeof setButtonBusy === 'function') setButtonBusy(triggerBtn, 'DELETING');

      if (typeof window.deleteOrderFromSupabase === 'function') {
        await window.deleteOrderFromSupabase(id);
      } else {
        throw new Error('Orders cloud delete helper not available');
      }

      // Par Intelligence — reverse ordered qty
      const deletedOrder = (state.orderHistory || []).find(o => o.id === id);
      if (deletedOrder && window.BarStockParIntelligence) {
        window.BarStockParIntelligence.reverseSnapshotOrdered(deletedOrder).catch(err => console.warn('[ParIntelligence] reverse failed:', err));
      }

      state.orderHistory = (state.orderHistory||[]).filter(order => order.id !== id);
      compareSelection = compareSelection.filter(entryId => entryId !== id);

      if(typeof rebuildPlacedOrdersFromHistory === 'function'){
        rebuildPlacedOrdersFromHistory();
      }

      saveState();
      renderCompareToolbar();
      renderOrderHistory();
      if(typeof render === 'function') render();
      setStatus('Order removed from history and cloud.');
    } catch(err){
      console.error(err);
      alert('Could not delete order from cloud.');
      setStatus('Error deleting order from cloud.');
    } finally {
      if (typeof clearButtonBusy === 'function') clearButtonBusy(triggerBtn);
    }
  }

  async function refreshOrdersFromCloud(){
    try{
      if (typeof window.loadOrdersFromCloud === 'function') {
        await window.loadOrdersFromCloud();
      } else {
        throw new Error('Orders cloud loader not available');
      }
    } catch(err){
      console.error(err);
      setStatus('Could not refresh orders from cloud.');
    }
  }

  async function reopenHistoryOrder(id, triggerBtn){
    const order = (state.orderHistory || []).find(entry => entry.id === id);
    if(!order) return;

    try{
      if (typeof setButtonBusy === 'function') setButtonBusy(triggerBtn, 'REOPENING');

      if (typeof window.deleteOrderFromSupabase === 'function') {
        await window.deleteOrderFromSupabase(id);
      } else {
        throw new Error('Orders cloud delete helper not available');
      }

      // Par Intelligence — reverse ordered qty
      if (order && window.BarStockParIntelligence) {
        window.BarStockParIntelligence.reverseSnapshotOrdered(order).catch(err => console.warn('[ParIntelligence] reverse failed:', err));
      }

      if (typeof window.loadOrdersFromCloud === 'function') {
        await window.loadOrdersFromCloud();
      }

      if (typeof setStatus === 'function') {
        setStatus(`${order.vendor} order re-opened and synced from cloud.`);
      }
    } catch(err){
      console.error(err);
      alert('Could not re-open order from cloud.\n\n' + (err.message || String(err)));
      if (typeof setStatus === 'function') {
        setStatus('Error re-opening order from cloud.');
      }
    } finally {
      if (typeof clearButtonBusy === 'function') clearButtonBusy(triggerBtn);
    }
  }

  async function reExportHistoryOrder(id){
    const order = (state.orderHistory||[]).find(entry => entry.id === id);
    if(!order) return;
    if(order.exportType === 'loop_csv'){
      exportLoopCsvFromRows(order.items, order.filename || 'loop_upload.csv');
      setStatus(`LOOP upload-ready CSV re-exported from Order History.`);
    } else {
      await exportVendorJpgFromRows(order.vendor, order.items, order.filename || `vendor_order_${String(order.vendor||'').toLowerCase().replace(/\s+/g,'_')}.jpg`);
      setStatus(`Vendor JPG re-exported for ${order.vendor}.`);
    }
  }

  function toggleHcExpanded(id) {
    const panel = document.getElementById('hcExpanded_' + id);
    const btn = document.getElementById('hcChevron_' + id);
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (btn) btn.innerHTML = panel.classList.contains('hidden')
      ? '<i class="ti ti-dots" style="font-size:16px"></i>'
      : '<i class="ti ti-x" style="font-size:16px"></i>';
  }

  window.renderOrderHistory     = renderOrderHistory;
  window.toggleHcExpanded       = toggleHcExpanded;
  window.toggleHistoryDetails   = toggleHistoryDetails;
  window.deleteHistoryOrder     = deleteHistoryOrder;
  window.refreshOrdersFromCloud = refreshOrdersFromCloud;
  window.reopenHistoryOrder     = reopenHistoryOrder;
  window.reExportHistoryOrder   = reExportHistoryOrder;

})();
