(() => {
  if (window.BarStockSheet) return;

  // ── El gesto de las hojas, en UN sitio ───────────────────────────────
  //
  // Las hojas de la app —la ficha de producto, la de editar, los
  // filtros, el alta— llevan un asa dibujada arriba. El asa dice
  // "arrástrame para cerrar", y no había nada detrás: al intentarlo, el
  // dedo movía la pantalla de atrás. Una afordancia que miente es peor
  // que no tener asa.
  //
  // Y el fondo no debería moverse en ningún caso, se arrastre o no. Con
  // la hoja abierta, lo de detrás está fuera de juego.
  //
  // Esto lo enganchan los cuatro módulos que crean hojas. Escribirlo en
  // cada uno sería la quinta vez en este proyecto que lo mismo vive en
  // varios sitios y un día dejan de comportarse igual.

  // Cuánto hay que bajar para que se cierre. Menos que esto vuelve a su
  // sitio: un roce al desplazar la lista no puede cerrar la hoja.
  const UMBRAL = 110;
  // Y con qué velocidad basta aunque no se haya bajado tanto: un
  // manotazo corto y rápido también es "ciérrate".
  const VELOCIDAD = 0.55;   // px por ms

  function enganchar(hoja, cerrar) {
    if (!hoja) return;
    const caja = hoja.querySelector('.m-sheet-box');
    if (!caja) return;

    const fin = typeof cerrar === 'function' ? cerrar : () => hoja.remove();

    // ── El fondo no se mueve ──────────────────────────────────────────
    //
    // `overflow:hidden` en el body no basta en iOS: Safari sigue
    // desplazando la pantalla. Lo que sí funciona es cancelar el gesto
    // en todo lo que no sea la caja, y dejar que la caja desplace lo
    // suyo con `overscroll-behavior: contain` para que al llegar al
    // final no se lo pase a la página.
    const noArrastres = (e) => {
      if (!caja.contains(e.target)) { e.preventDefault(); return; }
      // Dentro de la caja: sólo si de verdad puede desplazarse.
      if (caja.scrollHeight <= caja.clientHeight) e.preventDefault();
    };
    hoja.addEventListener('touchmove', noArrastres, { passive: false });

    // ── Arrastrar para cerrar ─────────────────────────────────────────
    //
    // Sólo cuenta cuando la caja está arriba del todo. Si estás leyendo
    // la mitad de una ficha larga y tiras hacia abajo, lo que quieres es
    // volver al principio, no cerrar.
    let y0 = null, t0 = 0, dy = 0, activo = false;

    const empezar = (e) => {
      if (caja.scrollTop > 0) return;
      const t = e.touches ? e.touches[0] : e;
      y0 = t.clientY; t0 = Date.now(); dy = 0; activo = true;
      caja.style.transition = 'none';
    };

    const mover = (e) => {
      if (!activo) return;
      const t = e.touches ? e.touches[0] : e;
      dy = t.clientY - y0;
      // Hacia arriba no se estira: la hoja no sube más de donde está.
      if (dy < 0) { dy = 0; return; }
      if (caja.scrollTop > 0) { soltar(); return; }
      if (e.cancelable) e.preventDefault();
      caja.style.transform = 'translateY(' + dy + 'px)';
      // El fondo se va aclarando: dice que soltar aquí cierra.
      const bg = hoja.querySelector('.m-sheet-bg');
      if (bg) bg.style.opacity = String(Math.max(0, 1 - dy / 420));
    };

    const soltar = () => {
      if (!activo) return;
      activo = false;
      const v = dy / Math.max(1, Date.now() - t0);
      caja.style.transition = 'transform .18s ease-out';

      if (dy > UMBRAL || v > VELOCIDAD) {
        caja.style.transform = 'translateY(100%)';
        const bg = hoja.querySelector('.m-sheet-bg');
        if (bg) bg.style.transition = 'opacity .18s ease-out', bg.style.opacity = '0';
        // Se espera a que termine de bajar, pero con un tope: si la
        // animación no llega a dispararse —reduce-motion, una pestaña
        // en segundo plano— la hoja tiene que cerrarse igual.
        let hecho = false;
        const ya = () => { if (hecho) return; hecho = true; fin(); };
        caja.addEventListener('transitionend', ya, { once: true });
        setTimeout(ya, 260);
        return;
      }
      caja.style.transform = '';
      const bg = hoja.querySelector('.m-sheet-bg');
      if (bg) bg.style.opacity = '';
    };

    caja.addEventListener('touchstart', empezar, { passive: true });
    caja.addEventListener('touchmove', mover, { passive: false });
    caja.addEventListener('touchend', soltar);
    caja.addEventListener('touchcancel', soltar);

    // Con ratón también, para poder probarlo en el escritorio.
    caja.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;   // ya lo lleva el táctil
      empezar(e);
      const mv = (ev) => mover(ev);
      const up = () => {
        soltar();
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    });
  }

  // ── ¿Hay una hoja abierta ahora mismo? ────────────────────────────────
  //
  // Lo pregunta el armazón: sus dos gestos —tirar para recargar y
  // deslizar desde el borde para volver— cuelgan de `document`, y la
  // hoja vive en el `<body>`, así que arrastrarla hacia abajo disparaba
  // también el "pull to refresh". Dos gestos sobre el mismo dedo.
  //
  // Se mira el DOM en vez de llevar una cuenta: las hojas se cierran por
  // cinco caminos distintos (el asa, el fondo, la X, Escape, el botón de
  // la propia hoja) y todos acaban en `remove()`, pero un contador se
  // desincronizaría el día que alguien añada el sexto.
  function hayAlguna() {
    return !!document.querySelector('.m-sheet');
  }

  window.BarStockSheet = { enganchar, hayAlguna, UMBRAL };
})();
