(() => {
  if (window.BarStockDeskShell) return;

  // ── El armazón del escritorio (Axel, 2026-11-25, opción A1) ─────────
  //
  // La barra de pestañas del teléfono pasa a ser una barra lateral, con
  // los mismos nombres, y lo que vivía en el header de siempre (locación,
  // ciclo, Import, Export, More, tema, Logout) queda arriba, en una sola
  // fila. Paso 1: el ARMAZÓN, con las secciones de hoy dentro tal cual.
  // Cada sección se rehace después, una por una, sobre su lámina.
  //
  // Lo que NO hace este módulo, a propósito:
  //   · No mueve los botones del header. Siguen en su sitio del DOM y la
  //     hoja (desk-shell.css) los pone en fila con `display: contents`:
  //     toolbar-pills.css los estila por `.bs-header-line3 …`, y sacarlos
  //     de ahí les quitaba su forma. Sólo salen el estado del maestro y el
  //     sello del build, que van al pie de la barra lateral.
  //   · No envuelve bsOpenSection ni bsCloseSection: las llama. Este
  //     proyecto ya tuvo cuatro módulos pisándose una función compartida.
  //     Lo encendido se lee de la sección que lleva .bs-active-section,
  //     la misma regla de updateActiveTab() en index.html.
  //   · En el teléfono no existe: la hoja sólo actúa por encima de 640 px,
  //     el mismo ANCHO de mobile-shell.js.
  //
  // La barra de arriba (Axel, 2026-11-25, tras ver el Home): el saludo a
  // la izquierda, la locación en el centro y, a la derecha, Import,
  // Export, More, el tema y Logout. El botón del ciclo vive en la barra
  // lateral, bajo el logo y antes de las secciones: se MUEVE el mismo
  // #cycleBtn (weekly-cycle.js lo busca por id y le puso su clic al
  // arrancar; moverlo no le quita ninguna de las dos cosas).
  //
  // Lo que el escritorio aún no tiene (Running out, Transfers, Sales,
  // Counts) sale como "Soon", apagado: Axel lo eligió frente a
  // esconderlo, para que se vea lo que viene.

  const ITEMS = [
    { id: 'home', label: 'Home', icon: 'ti-home' },
    { id: 'inventory', label: 'Inventory', icon: 'ti-package', sec: 'inventory' },
    { id: 'noMatch', label: 'Unmatched', icon: 'ti-alert-circle', sec: 'noMatch', sub: true },
    { id: 'vendor', label: 'Orders', icon: 'ti-shopping-cart', sec: 'vendor' },
    { id: 'history', label: 'History', icon: 'ti-history', sec: 'history', sub: true },
    { id: 'runningOut', label: 'Running out', icon: 'ti-hourglass-low', pronto: true },
    { id: 'transfers', label: 'Transfers', icon: 'ti-arrows-exchange', pronto: true },
    { grupo: 'Reports' },
    { id: 'sales', label: 'Sales', icon: 'ti-chart-line', pronto: true },
    { id: 'pourIq', label: 'Pour·IQ', icon: 'ti-brain', sec: 'pourIq' },
    { id: 'consumption', label: 'Variance', icon: 'ti-chart-histogram', sec: 'consumption' },
    { id: 'costReport', label: 'Costs', icon: 'ti-chart-bar', sec: 'costReport' },
    { id: 'counts', label: 'Counts', icon: 'ti-clock-hour-4', pronto: true },
    { grupo: 'Account' },
    { id: 'settings', label: 'Settings', icon: 'ti-settings' },
    { id: 'admin', label: 'Admin', icon: 'ti-shield-lock', sec: 'admin', admin: true }
  ];

  let _lado = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function itemHtml(it) {
    if (it.grupo) return `<div class="dk-grupo">${esc(it.grupo)}</div>`;
    const cls = ['dk-nav'];
    if (it.sub) cls.push('dk-sub');
    if (it.pronto) cls.push('dk-pronto');
    const soon = it.pronto ? '<span class="dk-soon">Soon</span>' : '';
    // El "Soon" no es un botón: un botón que no hace nada es una
    // afordancia que miente. Es un renglón apagado.
    const tag = it.pronto ? 'div' : 'button';
    const tipo = it.pronto ? '' : ' type="button"';
    const oculto = it.admin ? ' style="display:none"' : '';
    return `<${tag}${tipo} class="${cls.join(' ')}" data-dk="${it.id}" title="${esc(it.label)}"${oculto}>` +
      `<i class="ti ${it.icon}" aria-hidden="true"></i><span class="dk-lbl">${esc(it.label)}</span>${soon}</${tag}>`;
  }

  // Qué sección está abierta: la que lleva .bs-active-section. Ninguna
  // es el Home (la portada de hoy, hasta que se rehaga).
  function activa() {
    const open = document.querySelector('.card.section-card.bs-active-section');
    if (!open) return 'home';
    return open.id.replace(/Section$/, '');
  }

  function marcar() {
    if (!_lado) return;
    const a = activa();
    _lado.querySelectorAll('.dk-nav[data-dk]').forEach(b => {
      b.classList.toggle('on', b.dataset.dk === a);
    });
  }

  function ir(id) {
    const it = ITEMS.find(x => x.id === id);
    if (!it || it.pronto) return;
    if (id === 'home') {
      if (typeof window.bsCloseSection === 'function') window.bsCloseSection();
    } else if (id === 'settings') {
      if (typeof window.openSettingsModal === 'function') window.openSettingsModal();
    } else if (it.sec && typeof window.bsOpenSection === 'function') {
      window.bsOpenSection(it.sec);
    }
    marcar();
  }

  // Las pantallas del teléfono que tienen su sección en el escritorio.
  // Lo demás (Buscar, el ciclo, To buy…) aún no existe aquí y no hace
  // nada: el Home del escritorio no enseña los botones que llevan ahí.
  const DESDE_MOVIL = { home: 'home', inventory: 'inventory', orders: 'vendor', history: 'history' };
  function desdeMovil(id) {
    const a = DESDE_MOVIL[id];
    if (!a) return false;
    ir(a);
    return true;
  }

  // Admin sale para quien auth.js se lo enseña: se copia lo que dice su
  // pastilla de siempre (#bsAdminNavTab), sin repetir la regla de quién
  // es admin.
  function copiarAdmin() {
    const fuente = document.getElementById('bsAdminNavTab');
    const mio = _lado && _lado.querySelector('[data-dk="admin"]');
    if (!fuente || !mio) return;
    mio.style.display = fuente.style.display === 'none' ? 'none' : '';
  }

  // El saludo es el del Home del teléfono (mobile-home: el nombre de la
  // sesión de PIN o el del perfil de remitente). Sin nombre, mobile-home
  // dice el día ("Wednesday"): entonces va la fecha entera, sin repetir.
  function pintarSaludo() {
    const el = document.getElementById('dkSaludo');
    if (!el) return;
    const MH = window.BarStockMobileHome;
    let s = '';
    try { s = MH && MH.saludo ? MH.saludo() : ''; } catch (e) { s = ''; }
    const fmt = (o) => new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: 'America/New_York' }, o)).format(new Date());
    const con = /^Hello/.test(s);
    const titulo = con ? s : fmt({ weekday: 'long', month: 'short', day: 'numeric' });
    const fecha = con ? fmt({ weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '') : '';
    const html = `<b>${esc(titulo)}</b>${fecha ? `<span>${esc(fecha)}</span>` : ''}`;
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }

  function montar() {
    if (_lado || !document.body) return;
    const header = document.querySelector('.bs-header');
    if (!header) return;

    document.body.classList.add('dk');
    _lado = document.createElement('nav');
    _lado.id = 'dkLado';
    _lado.setAttribute('aria-label', 'Sections');

    const logo = document.getElementById('headerLogo');
    const logoHtml = logo ? logo.innerHTML : 'BarStock';

    _lado.innerHTML =
      `<div class="dk-logo brand-logo-type">${logoHtml}</div>` +
      `<div class="dk-ciclo" id="dkCiclo"></div>` +
      `<div class="dk-lista">${ITEMS.map(itemHtml).join('')}</div>` +
      `<div class="dk-pie">` +
        `<button type="button" class="dk-contar" id="dkContar" title="Count"><i class="ti ti-scan" aria-hidden="true"></i><span class="dk-lbl">Count</span></button>` +
        `<div class="dk-estado" id="dkEstado"></div>` +
      `</div>`;
    document.body.appendChild(_lado);

    _lado.querySelectorAll('button.dk-nav[data-dk]').forEach(b => {
      b.addEventListener('click', () => ir(b.dataset.dk));
    });

    // Count es el mismo botón de "Take inventory" de Inventory: el que
    // comprueba que el ciclo esté abierto antes de contar. No se copia su
    // regla, se le hace clic.
    _lado.querySelector('#dkContar').addEventListener('click', () => {
      const t = document.getElementById('takeInventoryBtn');
      if (t) t.click();
    });

    // El estado del maestro y el sello del build, al pie. Se MUEVEN (son
    // los mismos elementos: quien los escribe sigue encontrándolos por su
    // id).
    const ciclo = document.getElementById('cycleBtn');
    if (ciclo) _lado.querySelector('#dkCiclo').appendChild(ciclo);

    // El saludo, primero en la barra de arriba.
    const saludo = document.createElement('div');
    saludo.id = 'dkSaludo';
    saludo.className = 'dk-saludo';
    header.insertBefore(saludo, header.firstChild);
    pintarSaludo();
    const MH = window.BarStockMobileHome;
    // El nombre llega tarde (el perfil de remitente se pide a la nube):
    // mobile-home avisa al tenerlo, como avisa al Home.
    if (MH && MH.alCambiar) MH.alCambiar(pintarSaludo);

    const pie = _lado.querySelector('#dkEstado');
    ['bsStatusRow', 'buildBadge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) pie.appendChild(el);
    });

    // Marcas para la hoja: los tres grupos de la barra de arriba, sin
    // :has(), que el Safari de algunos iPads aún no tiene.
    const grupo = id => document.getElementById(id)?.closest('.bs-toolbar-group');
    grupo('importMenuBtn')?.classList.add('dk-imp');
    grupo('exportMenuBtn')?.classList.add('dk-exp');
    grupo('bsMoreBtn')?.parentElement?.classList.add('dk-mas');

    // Lo encendido cambia cuando una sección gana o pierde
    // .bs-active-section, la abra quien la abra (la barra, la portada,
    // un enlace de otra sección).
    const obs = new MutationObserver(marcar);
    document.querySelectorAll('.card.section-card').forEach(el => {
      obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    const tab = document.getElementById('bsAdminNavTab');
    if (tab) new MutationObserver(copiarAdmin).observe(tab, { attributes: true, attributeFilter: ['style'] });
    copiarAdmin();
    marcar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();

  window.BarStockDeskShell = { montar, ir, activa, desdeMovil, ITEMS };
})();
