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

  window.renderOrderHistory = renderOrderHistory;
})();
