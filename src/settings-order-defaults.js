(() => {
  if (window.BarStockOrderDefaultsUi?.active) return;

  let _activeVendor = null;
  let _cache = {};

  function getVendors() {
    if (typeof getActiveVendors === 'function') {
      return getActiveVendors().filter(v => v !== 'UNKNOWN');
    }
    return ['LOOP', 'SOUTHERN', 'BREAKTHRU', 'WINE MERCHANT'];
  }

  function renderTabs() {
    const container = document.getElementById('orderDefaultsVendorTabs');
    if (!container) return;
    const vendors = getVendors();
    if (!vendors.length) {
      container.innerHTML = '<div class="small muted">No vendors configured yet.</div>';
      return;
    }
    if (!_activeVendor || !vendors.includes(_activeVendor)) {
      _activeVendor = vendors[0];
    }
    const who = document.getElementById('orderDefaultsWho');
    if (who) {
      who.innerHTML = _activeVendor
        ? `Editing <strong>${_activeVendor}</strong> — these details print on this vendor's orders only.`
        : '';
    }
    container.innerHTML = vendors.map(v => {
      const active = v === _activeVendor;
      return `<button
        onclick="BarStockOrderDefaultsUi._selectVendor('${v}')"
        style="padding:5px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid ${active ? '#1e5b8a' : 'rgba(255,255,255,.15)'};background:${active ? '#1e5b8a' : 'transparent'};color:${active ? '#fff' : 'inherit'}"
      >${v}</button>`;
    }).join('');
  }

  function fillForm(data) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };
    set('od_vendor_email',         data?.vendor_email         || '');
    set('od_account_number',       data?.account_number       || '');
    set('od_rep_name',             data?.rep_name             || '');
    set('od_rep_phone',            data?.rep_phone            || '');
    set('od_delivery_window',      data?.delivery_window      || '');
    set('od_delivery_address',     data?.delivery_address     || '');
    set('od_special_instructions', data?.special_instructions || '');
  }

  function readForm() {
    const get = id => String((document.getElementById(id) || {}).value || '').trim();
    return {
      vendor_email:         get('od_vendor_email'),
      account_number:       get('od_account_number'),
      rep_name:             get('od_rep_name'),
      rep_phone:            get('od_rep_phone'),
      delivery_window:      get('od_delivery_window'),
      delivery_address:     get('od_delivery_address'),
      special_instructions: get('od_special_instructions')
    };
  }

  async function selectVendor(vendor) {
    if (_activeVendor && _activeVendor !== vendor) {
      _cache[_activeVendor] = readForm();
    }
    _activeVendor = vendor;
    renderTabs();
    if (_cache[vendor]) {
      fillForm(_cache[vendor]);
    } else {
      fillForm({});
      if (window.BarStockVendorDefaults) {
        const data = await window.BarStockVendorDefaults.getDefaults(vendor);
        _cache[vendor] = data || {};
        fillForm(_cache[vendor]);
      }
    }
  }

  async function load() {
    _cache = {};
    _activeVendor = null;
    const vendors = getVendors().filter(v => v !== 'UNKNOWN');
    if (!vendors.length) return;
    _activeVendor = vendors[0];
    renderTabs();
    if (window.BarStockVendorDefaults) {
      const data = await window.BarStockVendorDefaults.getDefaults(_activeVendor);
      _cache[_activeVendor] = data || {};
      fillForm(_cache[_activeVendor]);
    }
  }

  async function save() {
    const btn = document.getElementById('orderDefaultsSaveBtn');
    if (!_activeVendor) return;
    _cache[_activeVendor] = readForm();

    if (typeof setButtonBusy === 'function') setButtonBusy(btn, 'SAVING');
    try {
      if (!window.BarStockVendorDefaults) throw new Error('Module not available');
      const vendors = Object.keys(_cache);
      for (const vendor of vendors) {
        await window.BarStockVendorDefaults.saveDefaults(vendor, _cache[vendor]);
      }
      if (typeof closeSettingsModal === 'function') closeSettingsModal();
      if (typeof setStatus === 'function') setStatus('Order defaults saved.');
    } catch (e) {
      console.error(e);
      alert('Could not save order defaults: ' + e.message);
    } finally {
      if (typeof clearButtonBusy === 'function') clearButtonBusy(btn);
    }
  }

  const _origShowPanel = window.showSettingsPanel;
  window.showSettingsPanel = function(name) {
    if (_origShowPanel) _origShowPanel(name);
    if (name === 'orderDefaults') load();
  };

  window.saveOrderDefaults = save;

  window.BarStockOrderDefaultsUi = {
    active: true,
    _selectVendor: selectVendor
  };
})();
