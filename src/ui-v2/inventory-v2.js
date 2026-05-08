(function () {
  if (window.BarStockInventoryV2) return;

  function getRows() {
    if (Array.isArray(window.state?.master)) return window.state.master;
    if (typeof state !== 'undefined' && Array.isArray(state.master)) return state.master;
    return [];
  }

  function getItemName(row) {
    return row.item || row.ITEM || row.Item || row.name || row.Name || '';
  }

  function getVendor(row) {
    return row.vendor || row.VENDOR || row.Vendor || row.code || row.CODE || '';
  }

  function getOnHand(row) {
    return row.onHand ?? row.on_hand ?? row['ON HAND'] ?? row.OnHand ?? '';
  }

  function getSuggested(row) {
    return row.suggested ?? row.SUGGESTED ?? row.Suggested ?? '';
  }

  function getToOrder(row) {
    return row.toOrder ?? row.to_order ?? row['TO ORDER'] ?? row.ToOrder ?? '';
  }

  function render() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('uiV2') !== '1') return;

    const root = document.getElementById('barstockInventoryV2');
    if (!root) return;

    const rows = getRows();

    root.innerHTML = `
      <section class="inventory-v2-panel">
        <div class="inventory-v2-header">
          <div>
            <p class="inventory-v2-eyebrow">BarStock V2</p>
            <h2>Inventory</h2>
            <p class="inventory-v2-subtitle">${rows.length} items loaded</p>
          </div>

          <div class="inventory-v2-actions">
            <button type="button" class="inventory-v2-btn inventory-v2-btn-green">Add New Item</button>
            <button type="button" class="inventory-v2-btn inventory-v2-btn-blue">Scan Price Invoice</button>
          </div>
        </div>

        <div class="inventory-v2-toolbar">
          <input id="inventoryV2Search" class="inventory-v2-search" placeholder="Search inventory..." />
          <select id="inventoryV2Vendor" class="inventory-v2-select">
            <option value="">All vendors</option>
            <option value="LOOP">Loop</option>
            <option value="SOUTHERN">Southern</option>
            <option value="BREAKTHRU">Breakthru</option>
            <option value="WINE MERCHANT">Wine Merchant</option>
          </select>
        </div>

        <div class="inventory-v2-table-wrap">
          <table class="inventory-v2-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Vendor / Code</th>
                <th>On Hand</th>
                <th>Suggested</th>
                <th>To Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="inventoryV2Body"></tbody>
          </table>
        </div>
      </section>
    `;

    bind(root, rows);
    renderRows(rows);
  }

  function renderRows(rows) {
    const body = document.getElementById('inventoryV2Body');
    if (!body) return;

    body.innerHTML = rows.map(row => `
      <tr>
        <td>${escapeHtml(getItemName(row))}</td>
        <td>${escapeHtml(getVendor(row))}</td>
        <td>${escapeHtml(String(getOnHand(row)))}</td>
        <td>${escapeHtml(String(getSuggested(row)))}</td>
        <td>${escapeHtml(String(getToOrder(row)))}</td>
        <td>
          <div class="inventory-v2-row-actions">
            <button type="button">Edit</button>
            <button type="button">Zero</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function bind(root, rows) {
    const search = root.querySelector('#inventoryV2Search');
    const vendor = root.querySelector('#inventoryV2Vendor');

    function applyFilters() {
      const q = search.value.trim().toLowerCase();
      const v = vendor.value.trim().toLowerCase();

      const filtered = rows.filter(row => {
        const item = getItemName(row).toLowerCase();
        const rowVendor = getVendor(row).toLowerCase();

        const matchesSearch = !q || item.includes(q) || rowVendor.includes(q);
        const matchesVendor = !v || rowVendor.includes(v);

        return matchesSearch && matchesVendor;
      });

      renderRows(filtered);
    }

    search.addEventListener('input', applyFilters);
    vendor.addEventListener('change', applyFilters);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  window.BarStockInventoryV2 = { render };

  document.addEventListener('DOMContentLoaded', render);
  setTimeout(render, 500);
})();
