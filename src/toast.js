(() => {
  if (window.BarStockToast) return;

  // Los 94 mensajes de la app pasan por setStatus(). En vez de tocar los
  // 94 lugares, este modulo se engancha ahi y los convierte en avisos
  // flotantes. El statusBar se sigue actualizando por si algo lo lee.

  const DURATION_MS = 4000;
  const MAX_VISIBLE = 3;

  let container = null;

  function ensureContainer() {
    if (container && document.body.contains(container)) return container;
    container = document.createElement('div');
    container.id = 'bsToastContainer';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
    return container;
  }

  // El tono se deduce del texto. No es perfecto, pero cubre los mensajes
  // reales de la app sin tener que reescribir los 94 llamados.
  function toneFor(msg) {
    const m = String(msg || '').toLowerCase();

    if (/(fail|failed|error|could not|couldn't|no se pudo|not saved|denied|invalid)/.test(m)) {
      return 'error';
    }
    if (/(warning|warn|skipped|blocked|locally only|with warnings|pending)/.test(m)) {
      return 'warn';
    }
    if (/(placed|saved|imported|updated|synced|loaded|sent|reset|created|deleted|applied|complete|ready|copied)/.test(m) ||
        /(cargado|guardado|actualizado|enviado|listo|aplicado|creado|eliminado)/.test(m)) {
      return 'ok';
    }
    return 'info';
  }

  const ICONS = {
    ok:    'M13 27l9 9 17-18',
    warn:  null,
    error: null,
    info:  null
  };

  function buildIcon(tone) {
    if (tone === 'ok') {
      return '<svg class="bs-toast-ic" viewBox="0 0 52 52" aria-hidden="true">' +
             '<path d="' + ICONS.ok + '" fill="none" stroke="currentColor" stroke-width="5" ' +
             'stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="46" stroke-dashoffset="46"/></svg>';
    }
    if (tone === 'error') {
      return '<svg class="bs-toast-ic" viewBox="0 0 52 52" aria-hidden="true">' +
             '<path d="M17 17l18 18M35 17L17 35" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>';
    }
    if (tone === 'warn') {
      return '<svg class="bs-toast-ic" viewBox="0 0 52 52" aria-hidden="true">' +
             '<path d="M26 14v16M26 38v.5" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>';
    }
    return '<svg class="bs-toast-ic" viewBox="0 0 52 52" aria-hidden="true">' +
           '<circle cx="26" cy="26" r="4" fill="currentColor"/></svg>';
  }

  function dismiss(el) {
    if (!el || el.dataset.leaving === '1') return;
    el.dataset.leaving = '1';
    el.classList.add('bs-toast-out');
    setTimeout(() => el.remove(), 260);
  }

  // ── En el teléfono, burbujas en la cabecera ─────────────────────
  //
  // Los avisos flotantes tapaban media pantalla al arrancar: tres o
  // cuatro apilados sobre el contenido. En la banda hay un hueco libre
  // a la izquierda del logo, y ahí caben de una en una.
  //
  // Una cada vez, en cola. Entra, se queda un momento, se va, y pasa la
  // siguiente. Cuando la cola se vacía, lo informativo desaparece sin
  // dejar rastro; lo que era un error o un aviso deja una pastilla que
  // se puede tocar — un fallo no debe esfumarse porque pasaron cuatro
  // segundos.

  // `requestAnimationFrame` a secas no existe fuera del navegador, y
  // los tests cargan este módulo en jsdom. Se pide por `window`, como
  // el resto del proyecto.
  const raf = f => (window.requestAnimationFrame || (g => setTimeout(g, 16)))(f);

  const ENTRADA = 2200;   // cuánto se queda cada burbuja
  const ENTRADA_RAPIDA = 1500;  // con cola larga, más cortas
  const SALIDA = 260;

  let _cola = [];
  let _enCurso = false;
  let _pendientes = [];

  // ── Por qué NO se comprueba que la banda exista ──────────────────
  //
  // Los tres avisos del arranque —conexión, órdenes, inventario— se
  // disparan antes de que el shell monte la banda. Si se exigía
  // `#mBand`, esos justo se iban al contenedor flotante: los únicos
  // que molestan, y los únicos que seguían saliendo como antes.
  //
  // Basta el ancho de pantalla. Si la banda aún no está, la cola
  // espera a que aparezca.
  function enMovil() {
    return window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  // Dos sitios distintos y a propósito:
  //
  //   el hueco  — centrado, donde vive el logo. Las burbujas pasan por
  //               ahí porque es el único sitio con ancho de verdad.
  //   la marca  — a la izquierda, del tamaño del botón de ajustes. Ahí
  //               se queda lo que no debe desaparecer.
  function contenedor(clase) {
    const banda = document.getElementById('mBand');
    if (!banda) return null;
    let el = banda.querySelector('.' + clase);
    if (!el) {
      el = document.createElement('span');
      el.className = clase;
      banda.appendChild(el);
    }
    return el;
  }

  function hueco() { return contenedor('m-band-slot'); }
  function marca() { return contenedor('m-band-note'); }

  function burbuja(tone, texto, clase) {
    const b = document.createElement('span');
    b.className = 'm-bub m-bub-' + tone + (clase ? ' ' + clase : '');
    const i = document.createElement('i');
    i.className = 'ti ' + (tone === 'ok' ? 'ti-check'
                        : tone === 'error' ? 'ti-alert-triangle'
                        : tone === 'warn' ? 'ti-alert-circle' : 'ti-info-circle');
    i.setAttribute('aria-hidden', 'true');
    const t = document.createElement('span');
    t.textContent = texto;
    b.appendChild(i); b.appendChild(t);
    return b;
  }

  let _esperas = 0;
  const MAX_ESPERAS = 40;   // ~12 s esperando a que monte la banda

  function siguiente() {
    if (!_cola.length) { _enCurso = false; _esperas = 0; resumen(); return; }

    const slot = hueco();
    if (!slot) {
      // La banda todavía no está. No se tira el aviso: se espera.
      if (_esperas++ > MAX_ESPERAS) { _cola = []; _enCurso = false; return; }
      _enCurso = true;
      setTimeout(siguiente, 300);
      return;
    }
    _esperas = 0;

    _enCurso = true;
    const t = _cola.shift();
    if (t.tone === 'error' || t.tone === 'warn') _pendientes.push(t);

    slot.innerHTML = '';
    const b = burbuja(t.tone, t.text);
    slot.appendChild(b);

    // ── El logo se aparta ──────────────────────────────────────────
    //
    // El logo va centrado y empieza a menos de cien píxeles del borde,
    // así que al hueco le quedaban unos setenta: no cabía ni "Orders
    // loaded" sin montarse encima. En vez de recortar los mensajes
    // hasta que no digan nada, el logo se desvanece mientras hay una
    // burbuja y vuelve cuando se va. Dura dos segundos y se lee como
    // intencionado.
    const banda = document.getElementById('mBand');
    if (banda) banda.classList.add('m-band-bub');

    raf(() => b.classList.add('on'));

    const espera = _cola.length > 1 ? ENTRADA_RAPIDA : ENTRADA;
    setTimeout(() => {
      b.classList.remove('on');
      setTimeout(() => {
        if (b.parentNode) b.remove();
        // Sólo se devuelve el logo si no viene otra detrás: si no,
        // parpadearía entre burbuja y burbuja.
        if (!_cola.length && banda) banda.classList.remove('m-band-bub');
        siguiente();
      }, SALIDA);
    }, espera);
  }

  // Lo que queda cuando la cola termina.
  // Lo que queda cuando la cola termina: un botón redondo a la
  // izquierda, de la misma forma que el de ajustes. No tapa el logo y
  // se queda hasta que lo tocas.
  function resumen() {
    const slot = hueco();
    const nota = marca();
    if (slot) slot.innerHTML = '';
    const banda = document.getElementById('mBand');
    if (banda) banda.classList.remove('m-band-bub');
    if (!nota) return;

    nota.innerHTML = '';
    if (!_pendientes.length) return;

    const n = _pendientes.length;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'm-ico m-ico-alert';
    b.setAttribute('aria-label', n + (n === 1 ? ' notice' : ' notices'));
    b.innerHTML = '<i class="ti ti-bell" aria-hidden="true"></i>' +
                  (n > 1 ? '<em class="m-ico-n">' + n + '</em>' : '');
    b.onclick = abrirLista;
    nota.appendChild(b);
    raf(() => b.classList.add('on'));
  }

  function abrirLista() {
    cerrarLista();
    const caja = document.createElement('div');
    caja.id = 'mBubList';
    caja.className = 'm-bub-list';
    caja.innerHTML =
      _pendientes.map(p =>
        '<div class="m-bub-row m-bub-' + p.tone + '"></div>').join('') +
      '<button type="button" class="m-bub-clear">Dismiss</button>';
    Array.from(caja.querySelectorAll('.m-bub-row')).forEach((row, i) => {
      row.textContent = _pendientes[i].text;
    });
    caja.querySelector('.m-bub-clear').onclick = () => {
      _pendientes = [];
      cerrarLista();
      resumen();
    };
    // Tocar fuera también la cierra: un panel que sólo se va con su
    // botón se queda abierto estorbando.
    setTimeout(() => {
      const fuera = e => {
        if (!caja.contains(e.target) && !e.target.closest('.m-ico-alert')) {
          cerrarLista();
          document.removeEventListener('pointerdown', fuera, true);
        }
      };
      document.addEventListener('pointerdown', fuera, true);
    }, 0);
    document.body.appendChild(caja);
    raf(() => caja.classList.add('on'));
  }

  function cerrarLista() {
    const v = document.getElementById('mBubList');
    if (v) v.remove();
  }

  function encolar(text, tone) {
    // Mismo mensaje repetido seguido: no se apila.
    const ultimo = _cola[_cola.length - 1];
    if (ultimo && ultimo.text === text) return;
    _cola.push({ text, tone });
    if (!_enCurso) siguiente();
  }

  function show(msg, opts) {
    const text = String(msg == null ? '' : msg).trim();
    if (!text) return;

    const tono = (opts && opts.tone) || toneFor(text);
    if (enMovil()) { encolar(text, tono); return; }

    const root = ensureContainer();
    const tone = tono;

    // Si el mismo mensaje ya esta en pantalla, reiniciar su tiempo en vez
    // de apilar duplicados. render() puede disparar el mismo status varias
    // veces seguidas y se veria como spam.
    const existing = Array.from(root.children).find(
      c => c.dataset.msg === text && c.dataset.leaving !== '1'
    );
    if (existing) {
      clearTimeout(Number(existing.dataset.timer));
      existing.dataset.timer = String(setTimeout(() => dismiss(existing), DURATION_MS));
      return;
    }

    const el = document.createElement('div');
    el.className = 'bs-toast bs-toast-' + tone;
    el.dataset.msg = text;
    el.innerHTML = buildIcon(tone) + '<span class="bs-toast-msg"></span>';
    el.querySelector('.bs-toast-msg').textContent = text;

    // Click para cerrar: si aparece algo largo y estorba, se quita.
    el.addEventListener('click', () => {
      clearTimeout(Number(el.dataset.timer));
      dismiss(el);
    });

    root.appendChild(el);

    // No dejar que se acumulen: los mas viejos salen.
    const live = Array.from(root.children).filter(c => c.dataset.leaving !== '1');
    if (live.length > MAX_VISIBLE) {
      live.slice(0, live.length - MAX_VISIBLE).forEach(dismiss);
    }

    el.dataset.timer = String(setTimeout(() => dismiss(el), DURATION_MS));
  }

  window.BarStockToast = { show, dismiss };

  // ── Enganche a setStatus ────────────────────────────────────────
  // Se envuelve la funcion original en vez de reemplazarla, para que
  // el statusBar siga actualizandose igual que siempre. Si algo del
  // codigo viejo depende de leer ese texto, no se rompe.
  function hook() {
    if (typeof window.setStatus !== 'function' || window.__bsToastHooked) return;
    const original = window.setStatus;
    window.setStatus = function (msg) {
      try { original.call(this, msg); } catch (e) { console.warn(e); }
      try { show(msg); } catch (e) { console.warn(e); }
    };
    window.__bsToastHooked = true;
  }

  if (document.readyState === 'complete') {
    hook();
  } else {
    window.addEventListener('load', () => setTimeout(hook, 0));
  }
})();
