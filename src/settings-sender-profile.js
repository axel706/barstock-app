(() => {
  if (window.BarStockSenderProfileUi?.active) return;

  async function load() {
    if (!window.BarStockSenderProfile) return;
    const data = await window.BarStockSenderProfile.getProfile();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('sp_name',  data?.name  || '');
    set('sp_title', data?.title || '');
    set('sp_email', data?.email || '');
    set('sp_phone', data?.phone || '');
  }

  async function save() {
    const btn = document.getElementById('senderProfileSaveBtn');
    const get = id => String((document.getElementById(id) || {}).value || '').trim();
    const fields = {
      name:  get('sp_name'),
      title: get('sp_title'),
      email: get('sp_email'),
      phone: get('sp_phone')
    };

    if (!fields.name) { alert('Please enter your name.'); return; }

    if (typeof setButtonBusy === 'function') setButtonBusy(btn, 'SAVING');
    try {
      if (!window.BarStockSenderProfile) throw new Error('Module not available');
      const ok = await window.BarStockSenderProfile.saveProfile(fields);
      if (!ok) throw new Error('Save returned false');
      if (typeof closeSettingsModal === 'function') closeSettingsModal();
      if (typeof setStatus === 'function') setStatus('Sender profile saved.');
    } catch (e) {
      console.error(e);
      alert('Could not save sender profile: ' + e.message);
    } finally {
      if (typeof clearButtonBusy === 'function') clearButtonBusy(btn);
    }
  }

  // Enganchar al showSettingsPanel existente
  const _orig = window.showSettingsPanel;
  window.showSettingsPanel = function(name) {
    if (_orig) _orig(name);
    if (name === 'senderProfile') load();
  };

  window.saveSenderProfile = save;
  window.BarStockSenderProfileUi = { active: true, load };
})();
