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
  // Si son distintos, sale una tarjeta en el carrusel del Home
  // (mobile-home.js, tarjetaVersion) que se queda hasta actualizar. Y
  // también si la app ya cargó una nueva al abrir pero no se pulsó
  // UPDATE: ver pendiente(), más abajo. Antes
  // era un aviso que saltaba arriba y se recogía solo a los 8 segundos,
  // más una entrada en la campana con su punto azul; Axel quitó los dos
  // (2026-11-09): la tarjeta basta. La recarga la decide quien está
  // usando la app: nunca a mitad de un conteo sin que lo pida.

  const MINIMO_MS = 60 * 1000;      // como mucho una pregunta por minuto
  const ARRANQUE_MS = 5000;         // la primera, cuando la app ya pintó

  let _actual = null;
  let _nueva = null;
  let _ultima = 0;
  let _enCurso = null;

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
    // Y la tarjeta de More, si está pintada: que no siga diciendo
    // "Up to date" con una versión nueva ya sabida.
    const C = window.BarStockVersionCenter;
    if (C && C.pintar) { try { C.pintar(); } catch (e) {} }
    // Y el Home, para que salga (o se quede) la tarjeta de la versión.
    const H = window.BarStockMobileHome;
    if (H && H.refresh) { try { H.refresh(); } catch (e) {} }
  }

  // ── La que queda por "instalar" ────────────────────────────────────
  //
  // Al abrir en frío la app ya carga la versión más nueva, quiera o no
  // quien la usa. Axel (2026-11-09): aun así, la tarjeta del Home se
  // queda hasta que se pulse UPDATE, aunque se cierre y se abra la app,
  // y la animación y What's new salen al pulsarlo. Da la ilusión de que
  // es quien la usa el que actualiza, y por eso se juntan las notas de
  // todas las versiones que se saltó.
  //
  // Pendiente es, por orden: la del servidor, si hay una más nueva que la
  // cargada; si no, la cargada, si es más nueva que la última que se vio
  // en este teléfono (version-center.js la apunta al terminar la
  // animación). Sin ninguna vista —la primera vez en un teléfono— no hay
  // nada pendiente: un usuario nuevo no "actualiza" a lo que ya tiene.
  function pendiente() {
    if (_nueva) return _nueva;
    const a = api.actual();
    const C = window.BarStockVersionCenter;
    const v = C && C.visto ? C.visto() : null;
    return (a && v && /^\d{8}-\d{6}$/.test(v) && v < a) ? a : null;
  }

  const api = {
    comprobar,
    actual: () => _actual || (_actual = leerActual()),
    nueva: () => _nueva,
    pendiente,
    // Antes era un reload() en seco: la pantalla se iba a negro mientras
    // bajaba la versión nueva ("el apagón"). Ahora la recarga va dentro
    // de la animación de update-anim.js, que la hace al final de la
    // salida. Sin ese módulo, o sin versión nueva sabida, se recarga
    // como antes: la animación es lo de menos, actualizar es lo que
    // importa. Con la pendiente ya cargada, la recarga trae la misma
    // build: lo que importa es la animación y What's new de después.
    _recargar: () => {
      const A = window.BarStockUpdateAnim;
      const recargar = () => window.location.reload();
      const b = pendiente();
      if (A && A.salir && b) A.salir(b, recargar);
      else recargar();
    }
  };
  window.BarStockVersion = api;

  // Al volver a la app: desbloquear el teléfono o regresar de otra app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') comprobar();
  });
  setTimeout(() => comprobar(), ARRANQUE_MS);
})();
