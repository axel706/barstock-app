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
  // Lo que el escritorio aún no tiene (Transfers, Counts) sale como
  // "Soon", apagado: Axel lo eligió frente a
  // esconderlo, para que se vea lo que viene.

  const ITEMS = [
    { id: 'home', label: 'Home', icon: 'ti-home' },
    { id: 'inventory', label: 'Inventory', icon: 'ti-package', sec: 'inventory' },
    { id: 'noMatch', label: 'Unmatched', icon: 'ti-alert-circle', sec: 'noMatch', sub: true },
    { id: 'vendor', label: 'Orders', icon: 'ti-shopping-cart', sec: 'vendor' },
    { id: 'history', label: 'History', icon: 'ti-history', sec: 'history', sub: true },
    { id: 'runningOut', label: 'Running out', icon: 'ti-hourglass-low', sec: 'runningOut' },
    { id: 'transfers', label: 'Transfers', icon: 'ti-arrows-exchange', pronto: true },
    { grupo: 'Reports' },
    { id: 'sales', label: 'Sales', icon: 'ti-chart-line', sec: 'sales' },
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

  // ── Dónde estás y cómo volver (Axel, 2026-11-25, lámina C) ──────────
  //
  // "Desde esta misma pantalla debería haber una opción para regresar al
  // home sin tener que entrar al menú lateral." Dentro de una sección, el
  // saludo deja su sitio a la ruta: "Home › Running out", con Home como
  // enlace. En el Home, el saludo de siempre. Esc hace lo mismo que Home
  // (salvo con algo abierto encima, que es de quien lo abrió).
  function pintarMiga() {
    const el = document.getElementById('dkMiga');
    if (!el) return;
    const a = activa();
    const enSeccion = a !== 'home';
    document.body.classList.toggle('dk-en-seccion', enSeccion);
    if (!enSeccion) { if (el._a !== a) { el.innerHTML = ''; el._a = a; } return; }
    const it = ITEMS.find(x => x.id === a || x.sec === a);
    const sec = document.getElementById(a + 'Section');
    const boton = sec && sec.querySelector('.focus-max-btn');
    const nombre = (it && it.label) || (boton && boton.dataset.label) || a;
    if (el._a === a && el._n === nombre) return;
    el._a = a; el._n = nombre;
    el.innerHTML = `<button type="button" id="dkMigaHome">Home</button><i aria-hidden="true">›</i><b>${esc(nombre)}</b>`;
    el.querySelector('#dkMigaHome').addEventListener('click', () => ir('home'));
  }

  function alEscape(ev) {
    if (ev.key !== 'Escape' || ev.defaultPrevented || !document.body.classList.contains('dk-en-seccion')) return;
    const t = ev.target;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName || ''))) return;
    // Lo que esté abierto encima se cierra con su propio Esc.
    if (document.body.classList.contains('dk-buscando') || document.getElementById('mSheet') ||
        document.querySelector('.modalbg:not(.hidden), #dkGasto:not([hidden])')) return;
    ir('home');
  }

  function marcar() {
    pintarMiga();
    // El header de las secciones que ya tienen el suyo (desk-header.js):
    // título, vistas al centro y sus controles en sitios fijos. Las demás
    // siguen con la ruta hasta que se rehagan.
    const DH = window.BarStockDeskHeader;
    if (DH && DH.marcar) DH.marcar(activa());
    marcarLado();
  }
  // Orders en Sent es "History" en la barra lateral.
  function marcarLado() {
    if (!_lado) return;
    let a = activa();
    const DO = window.BarStockDeskOrders;
    if (a === 'vendor' && DO && DO.vista && DO.vista() === 'sent') a = 'history';
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
    } else if (id === 'history' && window.BarStockDeskOrders && window.BarStockDeskOrders.verSent) {
      // History es Orders › Sent (desk-sent.js, lámina "Sent · desktop"):
      // la sección de antes queda escondida, sin que nada la abra.
      window.BarStockDeskOrders.verSent();
      if (typeof window.bsOpenSection === 'function') window.bsOpenSection('vendor');
    } else if (it.sec && typeof window.bsOpenSection === 'function') {
      // Orders desde la barra lateral entra en Open.
      if (id === 'vendor' && window.BarStockDeskOrders && window.BarStockDeskOrders.verOpen) window.BarStockDeskOrders.verOpen();
      window.bsOpenSection(it.sec);
    }
    marcar();
  }

  // Las pantallas del teléfono que tienen su sección en el escritorio.
  // Lo demás (Buscar, el ciclo, To buy…) aún no existe aquí y no hace
  // nada: el Home del escritorio no enseña los botones que llevan ahí.
  const DESDE_MOVIL = { home: 'home', inventory: 'inventory', orders: 'vendor', history: 'history', runningOut: 'runningOut' };
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

  // ── Esconder la barra lateral (Axel, 2026-11-25, opción A) ──────────
  //
  // Del todo: el contenido ocupa el ancho entero y el botón de la
  // izquierda del saludo la vuelve a sacar. Escondida, el ciclo y Count
  // no se ven hasta abrirla (lo eligió así frente a dejar los iconos).
  // Lo que se eligió se recuerda en ESTE dispositivo (localStorage): es
  // una comodidad de cada pantalla, no un dato. Sin almacenamiento
  // (navegación privada), funciona igual y sólo se olvida al recargar.
  const CLAVE_OCULTO = 'bs-dk-lado-oculto';
  function leerOculto() {
    try { return localStorage.getItem(CLAVE_OCULTO) === '1'; } catch (e) { return false; }
  }
  function esconderLado(oculto, sinGuardar) {
    document.body.classList.toggle('dk-sin-lado', !!oculto);
    const b = document.getElementById('dkMenu');
    if (b) {
      b.setAttribute('aria-label', oculto ? 'Show the sidebar' : 'Hide the sidebar');
      b.title = oculto ? 'Show the sidebar' : 'Hide the sidebar';
      b.setAttribute('aria-expanded', String(!oculto));
      const i = b.querySelector('i');
      if (i) i.className = 'ti ' + (oculto ? 'ti-layout-sidebar-left-expand' : 'ti-layout-sidebar-left-collapse');
    }
    if (_lado) _lado.setAttribute('aria-hidden', String(!!oculto));
    if (!sinGuardar) {
      try { localStorage.setItem(CLAVE_OCULTO, oculto ? '1' : '0'); } catch (e) {}
    }
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

    // UN vidrio para la barra y el header (styles/desk-shell.css, #dkMarco):
    // una capa en L detrás de los dos, cortada al alto del header. Ese alto
    // cambia con la zona segura del iPad y con lo que lleve la fila, así
    // que se mide cuando cambia el tamaño del header, nunca al rodar.
    const marco = document.createElement('div');
    marco.id = 'dkMarco';
    marco.setAttribute('aria-hidden', 'true');
    // Dentro de .wrap: .wrap lleva z-index 1 y es su propio contexto de
    // apilado; colgado del body, el marco (39) quedaba ENCIMA de toda la
    // página y tapaba el saludo, el buscador y los botones del header.
    // Dentro, va bajo el header (40) y sobre lo demás de la página.
    const wrap = header.closest('.wrap') || document.body;
    wrap.insertBefore(marco, wrap.firstChild);
    const medirAlto = () => {
      const h = Math.round(header.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty('--dk-alto', h + 'px');
    };
    medirAlto();
    if (window.ResizeObserver) new ResizeObserver(medirAlto).observe(header);
    else window.addEventListener('resize', medirAlto, { passive: true });

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

    // El saludo, primero en la barra de arriba, y antes que él el botón
    // que esconde o saca la barra lateral.
    const saludo = document.createElement('div');
    saludo.id = 'dkSaludo';
    saludo.className = 'dk-saludo';
    header.insertBefore(saludo, header.firstChild);
    // La ruta va antes del saludo (y el buscador, después: desk-search lo
    // pone tras el saludo). Dentro de una sección, el saludo se esconde.
    const miga = document.createElement('nav');
    miga.id = 'dkMiga';
    miga.className = 'dk-miga';
    miga.setAttribute('aria-label', 'Where you are');
    header.insertBefore(miga, saludo);
    document.addEventListener('keydown', alEscape);
    const menu = document.createElement('button');
    menu.type = 'button';
    menu.id = 'dkMenu';
    menu.innerHTML = '<i class="ti ti-layout-sidebar-left-collapse" aria-hidden="true"></i>';
    header.insertBefore(menu, header.firstChild);
    menu.addEventListener('click', () => esconderLado(!document.body.classList.contains('dk-sin-lado')));
    esconderLado(leerOculto(), true);
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

  window.BarStockDeskShell = { montar, ir, activa, desdeMovil, esconderLado, marcarLado, ITEMS };
})();
