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
  let _entrado = false;      // ¿ya se decidió por dónde se entra?
  let _host = null;          // contenedor de las pantallas propias
  let _barra = null;
  let _banda = null;         // el encabezado fijo, común a todas

  const esMovil = () => window.matchMedia('(max-width: ' + ANCHO + 'px)').matches;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ── Registro ─────────────────────────────────────────────────────────

  function register(def) {
    if (!def || !def.id) return;
    _pant.set(def.id, Object.assign({ tab: false, orden: 100 }, def));
    if (_montado) { pintarBarra(); entrada(); }
  }

  function tabs() {
    return Array.from(_pant.values())
      .filter(p => p.tab)
      .sort((a, b) => a.orden - b.orden);
  }

  // ── Montaje ──────────────────────────────────────────────────────────

  // ── La banda ─────────────────────────────────────────────────────────
  //
  // Vive aquí y no en el Home porque tiene que estar en TODAS las
  // pantallas, también en las que son secciones del escritorio. Mientras
  // la pintaba el Home sólo existía en el Home, y al entrar a Buscar o a
  // Inventario desaparecía.
  //
  // Va fija: el contenido pasa por debajo. Por eso lleva su propio
  // desenfoque — el velo de .m-screens está detrás del contenido, no
  // delante, así que sin esto se leería el texto a través de la banda.
  function montarBanda() {
    _banda = document.createElement('header');
    _banda.id = 'mBand';
    _banda.className = 'm-band';
    // La escalera del desenfoque progresivo. Seis capas vacías: cada
    // una desenfoca más que la anterior y la CSS la recorta a su
    // franja con una máscara. Van primero en el DOM para que el logo y
    // los botones queden por encima.
    _banda.innerHTML =
      '<span class="m-blur" aria-hidden="true">' +
        '<i></i><i></i><i></i><i></i><i></i><i></i>' +
      '</span>' +
      '<span class="m-logo">BarStock<i>.</i><em>PRO</em></span>' +
      // Sin boton de luna: en el telefono el modo claro no existe (ver
      // la cabecera de mobile-app.css). Un boton que no hace nada es
      // peor que no tener boton.
      '<span class="m-band-ico">' +
        '<button type="button" class="m-ico" id="mSet" aria-label="Settings">' +
          '<i class="ti ti-settings" aria-hidden="true"></i></button>' +
      '</span>';
    // Al principio del body: así el bloqueo de la pantalla de entrada
    // (body.auth-locked > *) también la tapa, como a todo lo demás.
    document.body.insertBefore(_banda, document.body.firstChild);

    const st = _banda.querySelector('#mSet');
    if (st) st.onclick = () => {
      // Pantalla propia si existe. El modal del escritorio tiene
      // rejillas de dos columnas y botones a la derecha: en el
      // teléfono los campos salen a media anchura y "Guardar" cae
      // fuera del pulgar.
      if (window.BarStockMobileSettings) return ir('settings');
      // openSettingsModal, no openSettings. Lo segundo no existe y
      // nunca existió: el botón llevaba todo este tiempo llamando a
      // undefined dentro de un `typeof`, que es la forma más silenciosa
      // que hay de no hacer nada.
      if (typeof window.openSettingsModal === 'function') window.openSettingsModal();
    };
  }

  function montar() {
    if (_montado || !esMovil()) return;

    montarBanda();

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
    bloquearZoom(true);
    vigilarTeclado(true);
    gestos(true);
    pintarBarra();
    entrada();
  }

  // ── Por dónde se entra ───────────────────────────────────────────────
  //
  // Se entra por Home. Si alguien llega con una sección ya abierta —un
  // enlace, una recarga a media faena— se respeta: cambiarle la pantalla
  // a alguien que estaba en algo es peor que no tener Home.
  //
  // Esto NO puede decidirse una sola vez al montar. El armazón y las
  // pantallas cuelgan los dos de DOMContentLoaded, y el <script> del
  // armazón va primero, así que al montar todavía no hay ningún 'home'
  // registrado: la comprobación salía que no, no se entraba a ninguna
  // parte, y se quedaba viéndose la página de escritorio hasta que
  // tocabas el icono de la casa. Por eso se reintenta cada vez que algo
  // se registra, y _entrado garantiza que ocurra una vez y no más.
  function entrada() {
    if (!_montado || _entrado) return;

    const abierta = document.querySelector('.card.section-card.bs-active-section');
    if (abierta) { _entrado = true; marcarActiva(null); return; }

    // Todavía sin Home: no es un fallo, es que su script aún no corrió.
    // Se vuelve por aquí en cuanto se registre.
    if (!_pant.has('home')) return;

    _entrado = true;
    ir('home');
  }

  // ── Nada de pellizcar para ampliar ───────────────────────────────────
  //
  // `touch-action: manipulation` ya mata el zoom del doble toque, pero
  // NO el del pellizco, y con el pellizco la app se mueve de sitio y
  // deja de parecer una app.
  //
  // No se hace con `user-scalable=no` en el viewport a propósito: esa
  // meta es global y le quitaría el zoom también al iPad, que ve la
  // tabla del escritorio y ahí sí hace falta. Esto va en JavaScript y
  // sólo mientras el armazón está montado.
  //
  // Dos frentes porque son dos navegadores: `gesturestart` y compañía
  // son de Safari, y el `touchmove` con dos dedos es para Chrome en
  // Android, que no dispara los otros.
  //
  // Lo pagamos en accesibilidad: quien necesite agrandar para leer ya
  // no puede. Es una decisión, no un descuido.
  function sinPellizco(e) { e.preventDefault(); }
  function sinDosDedos(e) { if (e.touches && e.touches.length > 1) e.preventDefault(); }

  // ── Con el teclado abierto, la barra estorba ─────────────────────────
  //
  // En iOS un elemento fijo se queda pegado al borde de la ventana
  // VISIBLE, y al abrirse el teclado esa ventana encoge: la barra sube
  // con ella y deja un escalón debajo. Pelear contra eso es pelear
  // contra el sistema.
  //
  // Se esconde y ya. Mientras escribes no vas a cambiar de pestaña, y
  // la pantalla gana cinco centímetros justo cuando menos tiene.
  function conTeclado(si) {
    document.body.classList.toggle('m-kb', si);
  }
  function alEnfocar(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) conTeclado(true);
  }
  function alSalir(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) conTeclado(false);
  }

  function bloquearZoom(si) {
    const m = si ? 'addEventListener' : 'removeEventListener';
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev =>
      document[m](ev, sinPellizco, { passive: false }));
    document[m]('touchmove', sinDosDedos, { passive: false });
  }

  function vigilarTeclado(si) {
    const m = si ? 'addEventListener' : 'removeEventListener';
    document[m]('focusin', alEnfocar);
    document[m]('focusout', alSalir);
    if (!si) conTeclado(false);
  }

  function desmontar() {
    if (!_montado) return;
    if (_host) _host.remove();
    if (_barra) _barra.remove();
    if (_banda) _banda.remove();
    _host = _barra = _banda = null;
    _activa = null;
    _montado = false;
    _entrado = false;
    bloquearZoom(false);
    vigilarTeclado(false);
    gestos(false);
    document.body.classList.remove('m-shell');
    document.body.classList.remove('m-on');
    // Las pantallas propias se quedan sin dibujar; las secciones del
    // escritorio nunca se tocaron, asi que no hay nada que restaurar.
  }

  // ── La barra ─────────────────────────────────────────────────────────

  function pintarBarra() {
    if (!_barra) return;
    const lista = tabs();

    const boton = (p) => {
      const n = typeof p.badge === 'function' ? (p.badge() || 0) : 0;
      return `<button type="button" class="m-tab${_activa === p.id ? ' on' : ''}"
                      data-m="${esc(p.id)}" role="tab"
                      aria-selected="${_activa === p.id}" aria-label="${esc(p.label || p.id)}">
                <i class="ti ${esc(p.icon || 'ti-point')}" aria-hidden="true"></i>
                ${n ? '<span class="m-dot"></span>' : ''}
              </button>`;
    };

    // ── El escáner va en el CENTRO ──────────────────────────────────
    //
    // Antes colgaba del extremo derecho, fuera de la barra. Es la
    // acción más frecuente del teléfono y estaba en la esquina peor
    // alcanzable del pulgar derecho; en el centro llega cualquiera.
    //
    // La barra se parte por la mitad y deja un hueco: el círculo se
    // apoya encima y la barra parece salir de él hacia los lados. El
    // corte sale de cuántas pestañas haya, no de una lista a mano.
    const mitad = Math.ceil(lista.length / 2);

    _barra.innerHTML =
      '<div class="m-tabs-bar">' +
        lista.slice(0, mitad).map(boton).join('') +
        '<span class="m-tabs-hole" aria-hidden="true"></span>' +
        lista.slice(mitad).map(boton).join('') +
      '</div>' +
      '<button type="button" class="m-fab' + (escaneo().activo ? '' : ' off') + '"' +
              ' id="mFab" aria-label="Scan and count">' +
        '<i class="ti ti-scan" aria-hidden="true"></i>' +
      '</button>';

    _barra.querySelectorAll('.m-tab').forEach(b => {
      b.onclick = () => ir(b.dataset.m);
    });

    const fab = _barra.querySelector('#mFab');
    if (fab) fab.onclick = () => {
      // Apagado no es inerte: explica POR QUÉ y ofrece el camino. Un
      // boton que no hace nada al tocarlo se lee como roto.
      const e = escaneo();
      if (!e.activo) {
        if (e.motivo && window.confirm(e.motivo)) ir('cycle');
        return;
      }
      // El escaner es el mismo de siempre. Esta app no reimplementa el
      // conteo: es lo que mejor funciona y lo que mas ha costado.
      if (window.BarStockScanCount && window.BarStockScanCount.open) window.BarStockScanCount.open();
      else if (typeof window.openScanCount === 'function') window.openScanCount();
    };
  }

  // Lo contesta mobile-cycle, que es quien sabe qué es un ciclo. Si ese
  // archivo no cargara, el botón se queda encendido: más vale un botón
  // de más que bloquear la acción principal del teléfono porque faltó
  // un script.
  function escaneo() {
    const C = window.BarStockMobileCycle;
    if (!C || typeof C.escaneo !== 'function') return { activo: true };
    try { return C.escaneo() || { activo: true }; }
    catch (e) { return { activo: true }; }
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

  // ── Tiempo real ──────────────────────────────────────────────────────
  //
  // Del teléfono al escritorio funcionaba porque el escritorio se
  // repinta con su propio render(). Al revés no: cada pantalla del
  // teléfono se pintaba al entrar y ahí se quedaba, así que un cambio
  // hecho en el ordenador no se veía hasta salir y volver.
  //
  // Se suscribe AQUÍ y no en cada módulo. Son los mismos dos eventos
  // para todos, y repetir la suscripción en cinco sitios es garantizar
  // que la sexta pantalla que se escriba se olvide de hacerlo.
  //
  // Cada pantalla decide QUÉ significa refrescarse con `refrescar`. No
  // se llama a `show` porque algunas lo usan para volver a su estado
  // inicial —Buscar te sacaría de la ficha abierta— y refrescar no
  // puede mover a nadie de donde está.
  function refrescarActiva() {
    if (!_montado || !_activa || !_host) return;
    const p = _pant.get(_activa);
    if (!p || typeof p.refrescar !== 'function') return;
    const caja = Array.from(_host.children).find(c => c.dataset.screen === _activa);
    if (!caja || !caja.classList.contains('on')) return;
    try { p.refrescar(caja); } catch (e) { console.warn('[movil] refrescar ' + _activa, e); }
  }

  function escucharNube() {
    const E = window.BarStockEvents;
    if (!E || !E.on) return;
    E.on('inventoryUpdated', refrescarActiva);
    E.on('ordersUpdated', refrescarActiva);
  }

  // ── Gestos ───────────────────────────────────────────────────────────
  //
  // Dos, los que cualquiera da por hecho en un teléfono:
  //
  //   Tirar hacia abajo    vuelve a leer la nube. El tiempo real cubre
  //                        lo normal, pero con la pantalla apagada o
  //                        sin cobertura un rato se pierden eventos, y
  //                        éste es el gesto con el que todo el mundo
  //                        pide "mira otra vez".
  //   Deslizar desde el    vuelve a la pantalla anterior, pero sólo
  //   borde izquierdo      donde hay una: dentro de un proveedor, o en
  //                        la ficha de un producto.
  //
  // Van con eventos táctiles y no con una librería: son veinte líneas
  // y una librería aquí es un kilobyte y una dependencia por un gesto.

  const TIRON = 72;        // cuánto hay que bajar para que cuente
  const TOPE_TIRON = 110;  // y hasta dónde estira, para que no sea un chicle
  const BORDE = 30;        // la franja desde la que se desliza para volver
  const VOLVER = 64;       // cuánto hay que recorrer

  let _t = null;

  function arribaDelTodo() {
    return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
  }

  function cinta() {
    let el = document.getElementById('mPull');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mPull';
      el.className = 'm-pull';
      el.innerHTML = '<i class="ti ti-refresh" aria-hidden="true"></i>';
      document.body.appendChild(el);
    }
    return el;
  }

  function alTocar(e) {
    if (!e.touches || e.touches.length !== 1) { _t = null; return; }
    const t = e.touches[0];
    _t = {
      x: t.clientX, y: t.clientY,
      // Sólo cuenta como tirón si se empieza con la página arriba del
      // todo. Si no, tirar hacia abajo es desplazarse, no recargar.
      puedeTirar: arribaDelTodo(),
      puedeVolver: t.clientX <= BORDE && !!atrasDe(),
      haciendo: null
    };
  }

  function alMover(e) {
    if (!_t || !e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - _t.x, dy = t.clientY - _t.y;

    // El primer movimiento decide qué gesto es y ya no cambia. Sin
    // esto, un dedo que baja en diagonal dispara los dos.
    if (!_t.haciendo) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (_t.puedeVolver && dx > Math.abs(dy)) _t.haciendo = 'volver';
      else if (_t.puedeTirar && dy > Math.abs(dx)) _t.haciendo = 'tirar';
      else _t.haciendo = 'nada';
    }

    if (_t.haciendo === 'tirar') {
      e.preventDefault();
      const d = Math.min(TOPE_TIRON, dy * 0.55);
      const c = cinta();
      c.classList.add('on');
      c.style.transform = 'translate(-50%, ' + d + 'px) rotate(' + (d * 3) + 'deg)';
      c.classList.toggle('listo', d >= TIRON * 0.55);
    } else if (_t.haciendo === 'volver') {
      e.preventDefault();
    }
  }

  function alSoltar() {
    if (!_t) return;
    const hacia = _t.haciendo, t = _t;
    _t = null;

    if (hacia === 'tirar') {
      const c = cinta();
      const listo = c.classList.contains('listo');
      c.classList.remove('on', 'listo');
      c.style.transform = '';
      if (listo) recargar();
    }
  }

  function alSoltarVolver(e) {
    if (!_t || _t.haciendo !== 'volver') return;
    const t = (e.changedTouches && e.changedTouches[0]) || null;
    if (t && t.clientX - _t.x >= VOLVER) {
      const f = atrasDe();
      if (f) { try { f(); } catch (err) {} }
    }
  }

  // La pantalla activa decide si tiene a dónde volver. Si no lo tiene,
  // el gesto ni se arma: deslizar y que no pase nada es peor que no
  // tener gesto.
  function atrasDe() {
    if (!_montado || !_activa || !_host) return null;
    const p = _pant.get(_activa);
    if (!p || typeof p.atras !== 'function') return null;
    const caja = Array.from(_host.children).find(c => c.dataset.screen === _activa);
    if (!caja || !caja.classList.contains('on')) return null;
    return p.atras(caja) ? () => p.atras(caja, true) : null;
  }

  let _recargando = false;

  async function recargar() {
    if (_recargando) return;
    _recargando = true;
    const c = cinta();
    c.classList.add('girando');
    try {
      // Las mismas dos cargas que usa el arranque, no unas propias.
      const t = [];
      if (window.BarStockInventoryRealtime && window.BarStockInventoryRealtime.recargar) {
        t.push(window.BarStockInventoryRealtime.recargar());
      }
      if (typeof window.loadOrdersFromCloud === 'function') t.push(window.loadOrdersFromCloud());
      await Promise.all(t);
      if (window.BarStockWeeklyCycle && window.BarStockWeeklyCycle.refresh) {
        await window.BarStockWeeklyCycle.refresh();
      }
    } catch (e) {
      console.warn('[movil] recargar', e);
    } finally {
      c.classList.remove('girando');
      _recargando = false;
      refrescarActiva();
    }
  }

  function gestos(si) {
    const m = si ? 'addEventListener' : 'removeEventListener';
    document[m]('touchstart', alTocar, { passive: true });
    document[m]('touchmove', alMover, { passive: false });
    document[m]('touchend', alSoltarVolver, { passive: true });
    document[m]('touchend', alSoltar, { passive: true });
    document[m]('touchcancel', alSoltar, { passive: true });
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
    escucharNube();
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
    register, ir, refrescarBadges, refrescarActiva,
    esMovil, montado: () => _montado, activa: () => _activa,
    ANCHO
  };
})();
