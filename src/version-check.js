(() => {
  if (window.BarStockVersion) return;

  // ── ¿Hay una versión nueva de la app? ────────────────────────────────
  //
  // La app del teléfono va instalada en la pantalla de inicio: no tiene
  // el botón de recargar de Safari, y tirar hacia abajo vuelve a leer los
  // DATOS, no el código. Cada vez que algo se mandaba a main había que
  // cerrarla y volver a abrirla, y ni así se sabía si ya estaba la nueva
  // sin ir a mirar la esquina del escritorio.
  //
  // Se compara el sello BUILD- de index.html: el de la página cargada
  // contra el del servidor, pedido sin caché. Es el mismo número que ya
  // se sube a mano en cada commit que cambia la app (tools/test-sello.js
  // lo vigila), así que no hace falta llevar la cuenta de nada más.
  //
  // Si son distintos, salta una tarjeta desde la campana —Axel eligió la
  // campana, pero que SALTE: que no haya que abrirla para enterarse—. Se
  // toca y recarga; la ✕ la cierra; sola se recoge a los 8 segundos. En
  // la campana se queda, la primera, con su punto azul, hasta actualizar.
  // La recarga la decide quien está usando la app: nunca a mitad de un
  // conteo sin que lo pida.

  const MINIMO_MS = 60 * 1000;      // como mucho una pregunta por minuto
  const ARRANQUE_MS = 5000;         // la primera, cuando la app ya pintó

  let _actual = null;
  let _nueva = null;
  let _mostrada = null;             // la versión cuya tarjeta ya saltó
  let _ultima = 0;
  let _enCurso = null;
  let _cierre = null;

  const SELLO = /BUILD-(\d{8}-\d{6})/;

  function leerActual() {
    const b = document.getElementById('buildBadge');
    const m = b && SELLO.exec(b.textContent || '');
    return m ? m[1] : null;
  }

  // El sello del servidor sale del mismo elemento, no del primer BUILD-
  // que aparezca: un comentario con un sello viejo daría una versión
  // nueva que no existe.
  function selloDe(html) {
    const m = /id="buildBadge"[^>]*>\s*BUILD-(\d{8}-\d{6})/.exec(String(html || ''));
    return m ? m[1] : null;
  }

  function esMovil() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
  }

  // ── Preguntar ───────────────────────────────────────────────────────
  //
  // Sin red, con un error del servidor o con una página sin sello no se
  // dice nada. Un "versión nueva" que no lo es, o un error en pantalla
  // por no tener cobertura en el sótano, es peor que no avisar.
  function comprobar(forzar) {
    if (!_actual) _actual = leerActual();
    if (!_actual) return Promise.resolve(null);
    const ahora = Date.now();
    if (_enCurso) return _enCurso;
    if (!forzar && ahora - _ultima < MINIMO_MS) return Promise.resolve(_nueva);
    _ultima = ahora;

    _enCurso = (async () => {
      try {
        const r = await fetch('/index.html?_=' + ahora, { cache: 'no-store' });
        if (!r || !r.ok) return _nueva;
        const s = selloDe(await r.text());
        if (s && s !== _actual) {
          _nueva = s;
          avisar();
        }
      } catch (e) {
        // Sin red: se volverá a preguntar a la siguiente vuelta.
      } finally {
        _enCurso = null;
      }
      return _nueva;
    })();
    return _enCurso;
  }

  function avisar() {
    const N = window.BarStockMobileNotif;
    if (N && N.refrescar) { try { N.refrescar(); } catch (e) {} }
    // UNA vez por versión. Sin esto, cada vuelta a la app sería otra
    // tarjeta hasta actualizar; para recordarlo ya está la campana.
    if (esMovil() && _mostrada !== _nueva) {
      _mostrada = _nueva;
      mostrar();
    }
  }

  function recargar() { api._recargar(); }

  // ── La tarjeta ─────────────────────────────────────────────────────
  function mostrar() {
    quitar(true);
    const t = document.createElement('div');
    t.id = 'mVer';
    t.className = 'm-ver';
    t.setAttribute('role', 'status');
    t.innerHTML =
      '<button type="button" class="m-ver-msg">' +
        '<span class="m-ver-ic"><i class="ti ti-refresh" aria-hidden="true"></i></span>' +
        '<span class="m-ver-t"><b>New version of BarStock</b><small>Tap to update</small></span>' +
      '</button>' +
      '<button type="button" class="m-ver-x" aria-label="Dismiss">' +
        '<i class="ti ti-x" aria-hidden="true"></i></button>';
    document.body.appendChild(t);
    t.querySelector('.m-ver-msg').onclick = recargar;
    t.querySelector('.m-ver-x').onclick = () => quitar();

    const raf = window.requestAnimationFrame || (f => setTimeout(f, 16));
    raf(() => raf(() => t.classList.add('on')));
    // Sola se recoge: la campana se queda con el aviso y el punto azul.
    _cierre = setTimeout(() => quitar(), api.DURACION);
  }

  function quitar(alInstante) {
    clearTimeout(_cierre);
    const t = document.getElementById('mVer');
    if (!t) return;
    if (alInstante) { t.remove(); return; }
    t.classList.remove('on');
    setTimeout(() => t.remove(), 220);
  }

  // ── Para la campana ────────────────────────────────────────────────
  //
  // Un aviso más de su lista, con acción y no con X: cerrarlo no es
  // actualizar, y esconderlo dejaría otra vez sin saber si la versión
  // cargada es la buena.
  function aviso() {
    if (!_nueva) return null;
    return {
      clave: 'version', grupo: 'App', ico: 'ti-refresh', tono: 'ver',
      t: 'New version of BarStock', d: 'Tap to update',
      accion: 'Update', recargar, efimero: true, version: true
    };
  }

  const api = {
    comprobar, aviso,
    actual: () => _actual || (_actual = leerActual()),
    nueva: () => _nueva,
    DURACION: 8000,
    _recargar: () => window.location.reload()
  };
  window.BarStockVersion = api;

  // Al volver a la app: desbloquear el teléfono o regresar de otra app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') comprobar();
  });
  setTimeout(() => comprobar(), ARRANQUE_MS);
})();
