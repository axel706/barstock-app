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
    // Sin encabezado propio: el logo lo pinta el armazón, fijo y en
    // todas las pantallas.
    host.innerHTML = `
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
      </div>

      <!-- Salir vive aquí porque el botón del escritorio está dentro de
           .wrap, y .wrap se esconde mientras hay pantalla propia: desde
           el teléfono no había ninguna forma de cerrar sesión.
           Separado del resto y en rojo: no es una sección más. -->
      <div class="m-list m-list-end">
        <button type="button" class="m-item m-item-out" id="mMoreOut">
          <i class="ti ti-logout" aria-hidden="true"></i>
          <span class="m-item-t">Log out</span>
        </button>
      </div>

      <!-- TEMPORAL. Mide la geometría real del teléfono para entender
           por qué queda hueco bajo la barra. Se quita en cuanto se
           sepa; no vale adivinar tres veces seguidas. -->
      <pre class="m-diag" id="mDiag"></pre>`;

    diagnostico(host);

    host.querySelectorAll('[data-sec]').forEach(b => {
      b.onclick = () => {
        if (typeof window.bsOpenSection === 'function') window.bsOpenSection(b.dataset.sec);
        // La barra deja de marcar "More": lo que se esta viendo es una
        // seccion, y una pestaña encendida sobre otra pantalla miente.
        if (window.BarStockMobile) window.BarStockMobile.refrescarBadges();
      };
    });
    const set = host.querySelector('#mMoreSet');
    if (set) set.onclick = () => {
      if (typeof window.openSettingsModal === 'function') window.openSettingsModal();
    };

    const out = host.querySelector('#mMoreOut');
    if (out) out.onclick = () => {
      // Se pregunta: cerrar sesión por un roce del pulgar, con un conteo
      // a medias, es de las pocas cosas de esta app que cuestan trabajo
      // de verdad deshacer.
      if (!window.confirm('Log out of BarStock?')) return;
      const A = window.BarStockAuth;
      if (A && typeof A.logout === 'function') A.logout();
    };
  }

  // ── TEMPORAL ─────────────────────────────────────────────────────────
  //
  // Hay un hueco oscuro bajo la barra de pestañas que aparece sólo con
  // poco contenido. Hay tres explicaciones posibles y desde fuera del
  // teléfono no se distinguen: que viewport-fit=cover no aplique, que
  // la caja de los elementos fijos excluya la franja del gesto, o que
  // la barra no esté fija en absoluto. Cada una se arregla distinto.
  // Esto mide las tres de una vez. Se borra en cuanto se sepa.
  const despues = (prop) => {
    try { return getComputedStyle(document.body, '::after')[prop] || '-'; }
    catch (e) { return '?'; }
  };
  const quienHayEn = (y) => {
    try {
      const e = document.elementFromPoint(Math.round(window.innerWidth / 2), y);
      if (!e) return 'nada';
      return e.tagName.toLowerCase() +
             (e.id ? '#' + e.id : '') +
             (e.className && typeof e.className === 'string'
               ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    } catch (e) { return '?'; }
  };

  function diagnostico(host) {
    const el = host.querySelector('#mDiag');
    if (!el) return;

    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom,0px);';
    document.body.appendChild(probe);
    const insetAbajo = probe.getBoundingClientRect().height;
    probe.style.height = 'env(safe-area-inset-top,0px)';
    const insetArriba = probe.getBoundingClientRect().height;
    probe.remove();

    const tabs = document.getElementById('mTabs');
    const r = tabs ? tabs.getBoundingClientRect() : null;
    const cs = tabs ? getComputedStyle(tabs) : null;

    el.textContent = [
      'standalone ' + (window.navigator.standalone === true),
      'innerH ' + window.innerHeight + '  screenH ' + window.screen.height,
      'visualH ' + (window.visualViewport ? Math.round(window.visualViewport.height) : '-'),
      'inset arriba ' + insetArriba + '  abajo ' + insetAbajo,
      'body alto ' + Math.round(document.body.getBoundingClientRect().height),
      'tabs position ' + (cs ? cs.position : '-'),
      'tabs top ' + (r ? Math.round(r.top) : '-') + '  bottom ' + (r ? Math.round(r.bottom) : '-'),
      'hueco bajo tabs ' + (r ? Math.round(window.innerHeight - r.bottom) : '-'),
      // Lo que falta por saber: si el velo de body::after se esta
      // estirando de verdad, y que elemento pinta el ultimo pixel.
      'velo pos ' + despues('position') + '  bottom ' + despues('bottom'),
      'abajo del todo: ' + quienHayEn(window.innerHeight - 4)
    ].join('\n');
  }

  function registrar() {
    const M = window.BarStockMobile;
    if (!M) return;
    // Inventory ya NO apunta a la seccion del escritorio: tiene
    // pantalla propia en mobile-inventory.js. Si ese archivo no cargara,
    // esta pestaña no existe y es mejor asi — una pestaña que abre una
    // tabla de ocho columnas en un telefono no es un respaldo, es un
    // callejon.
    M.register({ id: 'orders',    icon: 'ti-shopping-cart', label: 'Orders',    tab: true, orden: 40, seccion: 'vendor' });
    M.register({ id: 'more',      icon: 'ti-dots',          label: 'More',      tab: true, orden: 50, mount: montarMas });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();

  window.BarStockMobileTabs = { MAS };
})();
