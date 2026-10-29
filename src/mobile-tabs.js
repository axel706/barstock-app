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

  // ── Lo que NO está aquí, y por qué ───────────────────────────────────
  //
  // Unmatched, Costs, Variance y Pour·IQ abren la sección del
  // escritorio tal cual: tablas de ocho columnas dentro de un teléfono.
  // Se podía entrar, pero no se podía usar.
  //
  // Una entrada que lleva a algo inservible es peor que no tenerla: la
  // pruebas, no funciona, y a partir de ahí dudas del resto del menú.
  // Vuelven en cuanto cada una tenga pantalla propia, como History.
  const MAS = [];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  function montarMas(host) {
    // Sin encabezado propio: el logo lo pinta el armazón, fijo y en
    // todas las pantallas.
    host.innerHTML = `
      <div class="m-lab">EVERYTHING ELSE</div>
      <div class="m-list">
        <button type="button" class="m-item" id="mMoreHist">
          <i class="ti ti-history" aria-hidden="true"></i>
          <span class="m-item-t">History</span>
          <i class="ti ti-chevron-right m-chev" aria-hidden="true"></i>
        </button>
        <button type="button" class="m-item" id="mMoreInv">
          <i class="ti ti-receipt" aria-hidden="true"></i>
          <span class="m-item-t">Invoices</span>
          <i class="ti ti-chevron-right m-chev" aria-hidden="true"></i>
        </button>
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
`;

    // History tiene pantalla propia en el teléfono: la del escritorio
    // es una tabla que en un móvil no se puede leer. Va aparte de MAS
    // porque no abre una sección, abre una pantalla del armazón.
    const his = host.querySelector('#mMoreHist');
    if (his) his.onclick = () => {
      if (window.BarStockMobile) window.BarStockMobile.ir('orderHistory');
    };

    // Las facturas de MarginEdge, igual: pantalla propia del armazón,
    // no una sección del escritorio.
    const inv = host.querySelector('#mMoreInv');
    if (inv) inv.onclick = () => {
      if (window.BarStockMobile) window.BarStockMobile.ir('invoices');
    };

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
      if (window.BarStockMobileSettings && window.BarStockMobile) {
        window.BarStockMobile.ir('settings');
        return;
      }
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
  function registrar() {
    const M = window.BarStockMobile;
    if (!M) return;
    // Inventory ya NO apunta a la seccion del escritorio: tiene
    // pantalla propia en mobile-inventory.js. Si ese archivo no cargara,
    // esta pestaña no existe y es mejor asi — una pestaña que abre una
    // tabla de ocho columnas en un telefono no es un respaldo, es un
    // callejon.
    // Orders tampoco apunta ya a la seccion del escritorio: tiene
    // pantalla propia en mobile-orders.js.
    M.register({ id: 'more',      icon: 'ti-dots',          label: 'More',      tab: true, orden: 50, mount: montarMas });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();

  window.BarStockMobileTabs = { MAS };
})();
