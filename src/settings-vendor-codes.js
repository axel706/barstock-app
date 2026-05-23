(() => {
  if (window.BarStockVendorCodesUi) return;

  // ===== Navegación menú <-> paneles =====
  function showPanel(name) {
    const menu = document.getElementById('settingsMenu');
    const panel = document.getElementById('settingsPanel-' + name);
    if (menu) menu.classList.add('hidden');
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.add('hidden'));
    if (panel) panel.classList.remove('hidden');
    if (name === 'vendorCodes') loadVendorCodes();
  }

  function backToMenu() {
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.add('hidden'));
    const menu = document.getElementById('settingsMenu');
    if (menu) menu.classList.remove('hidden');
  }

  // ===== Editor de vendor codes =====
  let rows = [];

  function renderRows() {
    const container = document.getElementById('vendorCodesList');
    if (!container) return;
    let html = '<div class="vendor-code-header"><div>Vendor</div><div>Term</div><div>Numeric</div><div></div></div>';
    html += rows.map((r, i) => `
      <div class="vendor-code-row">
        <input type="text" value="${escapeAttr(r.vendor)}" placeholder="WINE MERCHANT" oninput="BarStockVendorCodesUi._set(${i},'vendor',this.value)">
        <input type="text" value="${escapeAttr(r.search_term)}" placeholder="NVO" oninput="BarStockVendorCodesUi._set(${i},'search_term',this.value)" ${r.is_numeric ? 'disabled' : ''}>
        <label class="vc-numeric"><input type="checkbox" ${r.is_numeric ? 'checked' : ''} onchange="BarStockVendorCodesUi._setNumeric(${i},this.checked)"></label>
        <button class="vendor-code-remove" onclick="BarStockVendorCodesUi._remove(${i})" title="Remove">×</button>
      </div>
    `).join('');
    container.innerHTML = html;
  }

  function escapeAttr(s) {
    return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function loadVendorCodes() {
    const container = document.getElementById('vendorCodesList');
    if (container) container.innerHTML = '<div class="small muted">Loading...</div>';
    try {
      if (window.BarStockVendorMappingCloud) {
        const data = await window.BarStockVendorMappingCloud.listMappings();
        rows = (data || []).map(r => ({
          vendor: r.vendor || '',
          search_term: r.search_term || '',
          is_numeric: !!r.is_numeric
        }));
      }
    } catch (e) {
      console.error('Could not load vendor codes', e);
      rows = [];
    }
    renderRows();
  }

  function addRow() {
    rows.push({ vendor: '', search_term: '', is_numeric: false });
    renderRows();
  }

  function removeRow(i) {
    rows.splice(i, 1);
    renderRows();
  }

  function setField(i, field, value) {
    if (rows[i]) rows[i][field] = value;
  }

  function setNumeric(i, checked) {
    if (rows[i]) {
      rows[i].is_numeric = checked;
      if (checked) rows[i].search_term = '';
      renderRows();
    }
  }

  async function save() {
    const btn = document.getElementById('vendorCodesSaveBtn');
    // Validar: cada fila debe tener vendor; y term o numeric
    const clean = rows
      .map(r => ({ vendor: String(r.vendor || '').trim().toUpperCase(), search_term: String(r.search_term || '').trim().toUpperCase(), is_numeric: !!r.is_numeric }))
      .filter(r => r.vendor && (r.search_term || r.is_numeric));

    if (typeof setButtonBusy === 'function') setButtonBusy(btn, 'SAVING');
    try {
      if (!window.BarStockVendorMappingCloud) throw new Error('Vendor mapping module not available');
      await window.BarStockVendorMappingCloud.replaceMappings(clean);
      // Recargar el mapeo en memoria para que inferVendor lo use de inmediato
      if (typeof hydrateVendorMappings === 'function') await hydrateVendorMappings();
      // Re-aplicar el mapeo a los items del master actual y sincronizar
      if (typeof reapplyVendorMapping === 'function') await reapplyVendorMapping();
      if (typeof closeSettingsModal === 'function') closeSettingsModal();
      if (typeof setStatus === 'function') setStatus('Vendor codes saved and applied to current items.');
    } catch (e) {
      console.error(e);
      alert('Could not save vendor codes: ' + e.message);
    } finally {
      if (typeof clearButtonBusy === 'function') clearButtonBusy(btn);
    }
  }

  // API global
  window.showSettingsPanel = showPanel;
  window.backToSettingsMenu = backToMenu;
  window.addVendorCodeRow = addRow;
  window.saveVendorCodes = save;

  window.BarStockVendorCodesUi = {
    active: true,
    _set: setField,
    _setNumeric: setNumeric,
    _remove: removeRow
  };
})();
