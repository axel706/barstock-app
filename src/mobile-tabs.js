(() => {
  if (window.BarStockMobileTabs) return;

  // ── Las pestañas que apuntan a pantallas que ya existen ──────────────
  //
  // Inventory y Orders no se reescriben: se abren con bsOpenSection, la
  // misma funcion que usa el escritorio. Una segunda forma de abrir una
  // seccion es una segunda forma de que se desincronice.
  //
  // "More" es una hoja con el resto. Siete pastillas en una tira que se
  // desborda es lo que habia; cuatro pestañas y un cajon es lo que cabe
  // en un pulgar.
  //
  // Este archivo es SOLO registro. Añadir una pestaña se hace aqui y en
  // ningun otro sitio.

  const MAS = [
    { id: 'history',     icon: 'ti-history',       label: 'History' },
    { id: 'noMatch',     icon: 'ti-alert-circle',  label: 'Unmatched' },
    { id: 'costReport',  icon: 'ti-chart-bar',     label: 'Costs' },
    { id: 'consumption', icon: 'ti-chart-area',    label: 'Variance' },
    { id: 'pourIq',      icon: 'ti-brain',         label: 'Pour·IQ' }
  ];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  function montarMas(host) {
    host.innerHTML = `
      <header class="m-head">
        <span class="m-logo">BarStock<i>.</i></span>
        <span class="m-loc">${esc((window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '')}</span>
      </header>
      <div class="m-lab">EVERYTHING ELSE</div>
      <div class="m-list">
        ${MAS.map(m => `
          <button type="button" class="m-item" data-sec="${esc(m.id)}">
            <i class="ti ${esc(m.icon)}" aria-hidden="true"></i>
            <span class="m-item-t">${esc(m.label)}</span>
            <i class="ti ti-chevron-right m-chev" aria-hidden="true"></i>
          </button>`).join('')}
        <button type="button" class="m-item" id="mMoreSet">
          <i class="ti ti-settings" aria-hidden="true"></i>
          <span class="m-item-t">Settings</span>
          <i class="ti ti-chevron-right m-chev" aria-hidden="true"></i>
        </button>
      </div>`;

    host.querySelectorAll('[data-sec]').forEach(b => {
      b.onclick = () => {
        if (typeof window.bsOpenSection === 'function') window.bsOpenSection(b.dataset.sec);
        // La barra deja de marcar "More": lo que se esta viendo es una
        // seccion, y una pestaña encendida sobre otra pantalla miente.
        if (window.BarStockMobile) window.BarStockMobile.refrescarBadges();
      };
    });
    const set = host.querySelector('#mMoreSet');
    if (set) set.onclick = () => { if (typeof window.openSettings === 'function') window.openSettings(); };
  }

  function registrar() {
    const M = window.BarStockMobile;
    if (!M) return;
    M.register({ id: 'inventory', icon: 'ti-package',       label: 'Inventory', tab: true, orden: 30, seccion: 'inventory' });
    M.register({ id: 'orders',    icon: 'ti-shopping-cart', label: 'Orders',    tab: true, orden: 40, seccion: 'vendor' });
    M.register({ id: 'more',      icon: 'ti-dots',          label: 'More',      tab: true, orden: 50, mount: montarMas });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();

  window.BarStockMobileTabs = { MAS };
})();
