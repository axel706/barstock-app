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
            <div class="history-top">
              <div class="history-row-1">
                ${badge(order.vendor)}
                <span class="history-date-inline">${escapeHtml(formatHistoryDate(order.createdAt))}</span>
              </div>
              <div class="history-row-2">
                <div class="history-row-2-left">
                  <span class="history-filetype">${escapeHtml(order.exportType === 'loop_csv' ? 'LOOP upload-ready CSV' : 'Vendor JPG')}</span>
                  <span class="pill unknown history-meta-pill">${escapeHtml(String(order.items.length))} item${order.items.length===1?'':'s'}</span>
                  <span class="pill unknown history-meta-pill">${escapeHtml(fmt(order.totalUnits))} bottle${Number(order.totalUnits)===1?'':'s'}</span>
                  <span class="pill unknown history-meta-pill">${escapeHtml(fmtMoney(order.subtotal || 0))}</span>
                </div>
                <div class="history-row-2-right history-actions">
                  <button class="ui-control compare-select-btn ${compareSelection.includes(order.id) ? 'active' : ''}" onclick="toggleCompareSelection('${order.id}')">${compareSelection.includes(order.id) ? 'Selected' : 'Select'}</button>
                  <button class="ui-control" onclick="compareWithPrevious('${order.id}')">Compare to Previous</button>
                  <button class="ui-control" onclick="openHistoryDateEdit('${order.id}')">Edit Date</button>
                  <button class="ui-control" onclick="toggleHistoryDetails('${order.id}')">View</button>
                  <button class="ui-control success" onclick="reopenHistoryOrder('${order.id}', this)">Re-open</button>
                  <button class="ui-control primary" onclick="reExportHistoryOrder('${order.id}')">Re-export</button>
                  <button class="ui-control danger" onclick="deleteHistoryOrder('${order.id}', this)">Delete</button>
                </div>
              </div>
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

  window.renderOrderHistory     = renderOrderHistory;
  window.toggleHistoryDetails   = toggleHistoryDetails;
  window.deleteHistoryOrder     = deleteHistoryOrder;
  window.refreshOrdersFromCloud = refreshOrdersFromCloud;
  window.reopenHistoryOrder     = reopenHistoryOrder;
  window.reExportHistoryOrder   = reExportHistoryOrder;

})();
