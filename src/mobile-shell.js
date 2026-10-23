(() => {
  if (window.BarStockMobile) return;

  // ── El armazón de la app móvil ───────────────────────────────────────
  //
  // Barra de pestañas abajo, botón de escanear, y un sitio donde vivir
  // para las pantallas que sólo existen en el teléfono.
  //
  // ── Nada de esto pasa en escritorio ──────────────────────────────────
  //
  // El armazón se monta sólo por debajo de ANCHO px, y se desmonta
  // entero si la ventana crece. No es una decisión estética: la app de
  // escritorio funciona y lleva meses afinándose. Un módulo nuevo que
  // pueda tocarla es un riesgo que no hace falta correr.
  //
  // ── Cómo se añade una pantalla ───────────────────────────────────────
  //
  //   BarStockMobile.register({
  //     id: 'home',
  //     icon: 'ti-home',            // icono de la pestaña
  //     label: 'Home',
  //     tab: true,                  // ¿sale en la barra?
  //     orden: 10,                  // posición
  //     mount(host) { ... },        // una vez, al entrar la primera vez
  //     show(host) { ... },         // cada vez que se entra
  //     badge() { return 3; }       // opcional, puntito en la pestaña
  //   });
  //
  // O para mandar a una sección que YA existe en el escritorio:
  //
  //   BarStockMobile.register({ id:'inventory', seccion:'inventory', ... });
  //
  // Registrar es lo único que hace falta: la barra se dibuja sola a
  // partir de lo registrado. Añadir una pestaña no toca este archivo, y
  // por eso no hay ninguna lista de pantallas escrita a mano en ningún
  // sitio — que es como empiezan los desajustes entre el botón y lo que
  // abre.

  const ANCHO = 640;

  const _pant = new Map();   // id -> definicion
  let _activa = null;
  let _montado = false;
  let _host = null;          // contenedor de las pantallas propias
  let _barra = null;

  const esMovil = () => window.matchMedia('(max-width: ' + ANCHO + 'px)').matches;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ── Registro ─────────────────────────────────────────────────────────

  function register(def) {
    if (!def || !def.id) return;
    _pant.set(def.id, Object.assign({ tab: false, orden: 100 }, def));
    if (_montado) pintarBarra();
  }

  function tabs() {
    return Array.from(_pant.values())
      .filter(p => p.tab)
      .sort((a, b) => a.orden - b.orden);
  }

  // ── Montaje ──────────────────────────────────────────────────────────

  function montar() {
    if (_montado || !esMovil()) return;

    _host = document.createElement('div');
    _host.id = 'mScreens';
    _host.className = 'm-screens hidden';
    document.body.appendChild(_host);

    _barra = document.createElement('nav');
    _barra.id = 'mTabs';
    _barra.className = 'm-tabs';
    _barra.setAttribute('role', 'tablist');
    document.body.appendChild(_barra);

    document.body.classList.add('m-shell');
    _montado = true;
    pintarBarra();

    // Se entra por Home. Si alguien llega con una sección ya abierta
    // —un enlace, una recarga a media faena— se respeta: cambiarle la
    // pantalla a alguien que estaba en algo es peor que no tener Home.
    const abierta = document.querySelector('.card.section-card.bs-active-section');
    if (!abierta && _pant.has('home')) ir('home');
    else marcarActiva(null);
  }

  function desmontar() {
    if (!_montado) return;
    if (_host) _host.remove();
    if (_barra) _barra.remove();
    _host = _barra = null;
    _activa = null;
    _montado = false;
    document.body.classList.remove('m-shell');
    document.body.classList.remove('m-on');
    // Las pantallas propias se quedan sin dibujar; las secciones del
    // escritorio nunca se tocaron, asi que no hay nada que restaurar.
  }

  // ── La barra ─────────────────────────────────────────────────────────

  function pintarBarra() {
    if (!_barra) return;
    const lista = tabs();

    _barra.innerHTML =
      '<div class="m-tabs-bar">' +
        lista.map(p => {
          const n = typeof p.badge === 'function' ? (p.badge() || 0) : 0;
          return `<button type="button" class="m-tab${_activa === p.id ? ' on' : ''}"
                          data-m="${esc(p.id)}" role="tab"
                          aria-selected="${_activa === p.id}" aria-label="${esc(p.label || p.id)}">
                    <i class="ti ${esc(p.icon || 'ti-point')}" aria-hidden="true"></i>
                    ${n ? '<span class="m-dot"></span>' : ''}
                  </button>`;
        }).join('') +
      '</div>' +
      '<button type="button" class="m-fab" id="mFab" aria-label="Scan and count">' +
        '<i class="ti ti-scan" aria-hidden="true"></i>' +
      '</button>';

    _barra.querySelectorAll('.m-tab').forEach(b => {
      b.onclick = () => ir(b.dataset.m);
    });

    const fab = _barra.querySelector('#mFab');
    if (fab) fab.onclick = () => {
      // El escaner es el mismo de siempre. Esta app no reimplementa el
      // conteo: es lo que mejor funciona y lo que mas ha costado.
      if (window.BarStockScanCount && window.BarStockScanCount.open) window.BarStockScanCount.open();
      else if (typeof window.openScanCount === 'function') window.openScanCount();
    };
  }

  function marcarActiva(id) {
    _activa = id;
    if (!_barra) return;
    _barra.querySelectorAll('.m-tab').forEach(b => {
      const on = b.dataset.m === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  // Lo llaman las pantallas cuando su contador cambia, para que el
  // puntito aparezca sin tener que repintar la barra entera desde fuera.
  function refrescarBadges() { if (_montado) pintarBarra(); }

  // ── Navegar ──────────────────────────────────────────────────────────

  function ir(id) {
    const p = _pant.get(id);
    if (!p || !_montado) return;

    // Pestaña que apunta a una seccion del escritorio: se usa la
    // navegacion que ya existe en vez de duplicarla. Una segunda forma
    // de abrir una seccion es una segunda forma de que se desincronice.
    if (p.seccion) {
      ocultarPropias();
      if (typeof window.bsOpenSection === 'function') window.bsOpenSection(p.seccion);
      marcarActiva(id);
      window.scrollTo({ top: 0 });
      return;
    }

    // Pantalla propia: se cierra lo del escritorio y se enseña la suya.
    if (typeof window.bsCloseSection === 'function') {
      try { window.bsCloseSection(); } catch (e) {}
    }

    // Se busca entre los hijos en vez de con un selector: los id son
    // nuestros, pero un selector obliga a escapar y CSS.escape es una
    // dependencia que no hace falta para recorrer cinco elementos.
    let caja = Array.from(_host.children).find(c => c.dataset.screen === id);
    if (!caja) {
      caja = document.createElement('div');
      caja.className = 'm-screen';
      caja.dataset.screen = id;
      _host.appendChild(caja);
      if (typeof p.mount === 'function') {
        try { p.mount(caja); } catch (e) { console.warn('[movil] mount ' + id, e); }
      }
    }

    _host.classList.remove('hidden');
    // La pagina de siempre se esconde: el contenedor de las pantallas
    // propias cuelga del body, asi que sin esto el Home nuevo se
    // dibujaba DEBAJO del viejo en vez de sustituirlo.
    //
    // Se hace con una clase en el body y la regla vive en la media
    // query, no con un style inline: asi en escritorio es imposible
    // que algo esconda la app aunque este modulo se ejecute por error.
    document.body.classList.add('m-on');
    Array.from(_host.children).forEach(c => c.classList.toggle('on', c === caja));
    if (typeof p.show === 'function') {
      try { p.show(caja); } catch (e) { console.warn('[movil] show ' + id, e); }
    }

    marcarActiva(id);
    window.scrollTo({ top: 0 });
  }

  function ocultarPropias() {
    if (_host) _host.classList.add('hidden');
    document.body.classList.remove('m-on');
  }

  // ── Arranque ─────────────────────────────────────────────────────────
  //
  // Se vigila el ancho en vez de mirarlo una vez: girar el telefono o
  // abrir el inspector cambia de lado sin recargar, y un armazon a
  // medias es peor que ninguno.
  function sincronizar() {
    if (esMovil()) montar(); else desmontar();
  }

  function init() {
    sincronizar();
    try {
      window.matchMedia('(max-width: ' + ANCHO + 'px)').addEventListener('change', sincronizar);
    } catch (e) {
      window.addEventListener('resize', sincronizar);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.BarStockMobile = {
    register, ir, refrescarBadges,
    esMovil, montado: () => _montado, activa: () => _activa,
    ANCHO
  };
})();
