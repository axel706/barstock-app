(() => {
  if (window.BarStockSettingsUi?.active) return;

  async function openModal() {
    const modal = document.getElementById('settingsModalBg');
    if (!modal) return;

    // Mostrar el menú, ocultar paneles
    const menu = document.getElementById('settingsMenu');
    if (menu) menu.classList.remove('hidden');
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.add('hidden'));

    modal.classList.remove('hidden');

    // Pre-cargar el reply-to en background (para que su panel ya lo tenga)
    const input = document.getElementById('settingsReplyToEmail');
    if (input) {
      input.value = '';
      try {
        if (window.BarStockLocationSettings) {
          const settings = await window.BarStockLocationSettings.getSettings();
          input.value = settings?.reply_to_email || '';
        }
      } catch(e) {
        console.warn('Could not load settings', e);
      }
    }
  }

  function closeModal() {
    document.getElementById('settingsModalBg')?.classList.add('hidden');
  }

  function isValidEmail(email) {
    if (!email) return true; // empty is valid (will use fallback)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  async function save() {
    const btn = document.getElementById('settingsSaveBtn');
    const input = document.getElementById('settingsReplyToEmail');
    const replyTo = String(input?.value || '').trim();

    if (replyTo && !isValidEmail(replyTo)) {
      alert('Reply-to is not a valid email. Leave it empty or enter a valid email.');
      return;
    }

    if (typeof setButtonBusy === 'function') setButtonBusy(btn, 'SAVING');

    try {
      if (!window.BarStockLocationSettings) {
        throw new Error('Location settings module not available');
      }

      const recipInput = document.getElementById('settingsReportRecipients');
      const reportRecipients = String(recipInput?.value || '').trim();
      await window.BarStockLocationSettings.saveSettings({
        reply_to_email: replyTo || null,
        report_recipients: reportRecipients
      });

      closeModal();
      if (typeof setStatus === 'function') setStatus('Settings saved.');
    } catch(err) {
      console.error(err);
      alert('Could not save settings: ' + err.message);
    } finally {
      if (typeof clearButtonBusy === 'function') clearButtonBusy(btn);
    }
  }

  function bindBackdrop() {
    const bg = document.getElementById('settingsModalBg');
    if (!bg) return;
    bg.addEventListener('click', function(e) {
      if (e.target.id === 'settingsModalBg') closeModal();
    });
  }

  window.openSettingsModal = openModal;
  window.closeSettingsModal = closeModal;
  window.saveSettings = save;

  window.BarStockSettingsUi = {
    active: true,
    openModal,
    closeModal,
    save
  };

  document.addEventListener('DOMContentLoaded', bindBackdrop);
})();
