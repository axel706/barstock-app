(() => {
  if (window.BarStockChipGlow) return;

  // ── El resplandor que sigue al cursor ────────────────────────────────
  //
  // Las pastillas de filtro —vendors en Inventory y Ordering, vendors y
  // años en Order History, estados en Pour-IQ— encienden una luz suave
  // bajo el puntero. No es decoración sola: en una fila de doce pastillas
  // parecidas, el resplandor dice cuál vas a pulsar antes de pulsarla.
  //
  // ── Por qué un solo escuchador y no uno por pastilla ─────────────────
  //
  // Porque esas pastillas se rehacen con innerHTML cada vez que cambias
  // un filtro. Un listener colgado de cada una moriría con ella y el
  // efecto funcionaría una vez y nunca más — el tipo de fallo que parece
  // "a veces va". Uno solo en el documento sobrevive a cualquier
  // repintado, y de paso son doce escuchadores menos.
  //
  // ── Por qué variables CSS y no estilo directo ────────────────────────
  //
  // El JS solo escribe dos números: dónde está el cursor. Todo lo demás
  // —color, tamaño, si aparece o no— vive en el CSS, junto al resto del
  // aspecto de la pastilla. Cambiar el color del resplandor no debería
  // obligar a abrir un archivo de JavaScript.

  const SEL = '.oh-filter-chip, .bs-nav-tab, .cm-chip';

  let pend = null;      // el evento en espera de pintarse
  let raf = 0;

  function paint() {
    raf = 0;
    if (!pend) return;
    const { el, x, y } = pend;
    pend = null;
    // Porcentajes y no píxeles: el gradiente los entiende igual y así el
    // valor no se queda obsoleto si la pastilla cambia de tamaño entre
    // el movimiento y el pintado.
    el.style.setProperty('--gx', x + '%');
    el.style.setProperty('--gy', y + '%');
  }

  // Un movimiento de ratón dispara decenas de eventos por segundo. Sin
  // esto se escribiría en el DOM en cada uno; con rAF se escribe una vez
  // por fotograma, que es todas las que el ojo puede ver.
  function onMove(e) {
    const el = e.target.closest && e.target.closest(SEL);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    pend = {
      el,
      x: (((e.clientX - r.left) / r.width) * 100).toFixed(1),
      y: (((e.clientY - r.top) / r.height) * 100).toFixed(1)
    };
    if (!raf) raf = requestAnimationFrame(paint);
  }

  // Al salir se devuelve la luz al centro. Si se quedara en la última
  // posición, la próxima vez que entres por el otro lado el resplandor
  // daría un salto visible antes de alcanzar al cursor.
  function onOut(e) {
    const el = e.target.closest && e.target.closest(SEL);
    if (!el) return;
    el.style.removeProperty('--gx');
    el.style.removeProperty('--gy');
  }

  function init() {
    // En una pantalla táctil no hay puntero que seguir: el dedo tapa la
    // pastilla y el resplandor solo aparecería después de tocar, cuando
    // ya no sirve de nada. Y quien pide menos movimiento en el sistema
    // no quiere luces persiguiendo el cursor.
    const puntero = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const quieto  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!puntero || quieto) return;

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout',  onOut,  { passive: true });
    document.documentElement.classList.add('bs-chip-glow');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.BarStockChipGlow = { SEL };
})();
