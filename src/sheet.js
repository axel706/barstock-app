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

  // `op` es opcional, y sin él todo se comporta como siempre:
  //
  //   op.alSubir()  Si existe, arrastrar hacia ARRIBA hace crecer la caja
  //                 y, pasado el umbral, se llama. Es para Time Machine,
  //                 que de tarjeta pasa a pantalla completa. Quien llama
  //                 decide qué significa "completa" (una clase y su CSS);
  //                 aquí sólo se reconoce el gesto.
  //   op.quieta()   Si devuelve true, no se arrastra nada: ni subir ni
  //                 bajar. Time Machine en pantalla completa ya no es una
  //                 tarjeta y sólo se sale con su X.
  //
  // Va aquí y no en un gesto aparte en Time Machine: el gesto de las
  // hojas ya estuvo escrito seis veces, y la séptima copia es la que se
  // deja de comportar como las demás.
  function enganchar(hoja, cerrar, op) {
    if (!hoja) return;
    op = op || {};
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
    // ── Qué se desplaza bajo el dedo ──────────────────────────────────
    //
    // Antes solo se miraba la caja: si ella no se desplazaba, se cancelaba
    // el gesto. Con el selector de botella eso rompió el scroll entero
    // (Axel: "no puedo hacer scroll en el grid"): allí la caja está quieta
    // a propósito —búsqueda arriba, botones fijos abajo— y lo que se
    // desplaza es la rejilla de DENTRO, y de lado la fila de tamaños. El
    // gesto cancelaba los dos.
    //
    // Ahora se busca, desde lo que toca el dedo hacia arriba, lo primero
    // que de verdad se desplaza. La caja cuenta como antes (por su
    // contenido); lo de dentro, solo si su CSS lo deja desplazarse.
    const deja = (el, eje) => {
      try {
        const v = window.getComputedStyle(el)[eje === 'y' ? 'overflowY' : 'overflowX'];
        return v === 'auto' || v === 'scroll';
      } catch (e) { return false; }
    };
    const desplazador = (t) => {
      for (let el = t; el && el !== caja && caja.contains(el); el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight + 1 && deja(el, 'y')) return el;
      }
      return caja.scrollHeight > caja.clientHeight ? caja : null;
    };
    const deLado = (t) => {
      for (let el = t; el && el !== caja && caja.contains(el); el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 1 && deja(el, 'x')) return el;
      }
      return null;
    };

    const noArrastres = (e) => {
      if (!caja.contains(e.target)) { e.preventDefault(); return; }
      // Dentro de la caja: solo si algo bajo el dedo puede desplazarse.
      if (!desplazador(e.target) && !deLado(e.target)) e.preventDefault();
    };
    hoja.addEventListener('touchmove', noArrastres, { passive: false });

    // ── Arrastrar para cerrar ─────────────────────────────────────────
    //
    // Sólo cuenta cuando la caja está arriba del todo. Si estás leyendo
    // la mitad de una ficha larga y tiras hacia abajo, lo que quieres es
    // volver al principio, no cerrar.
    let y0 = null, t0 = 0, dy = 0, activo = false, h0 = 0;
    // Lo que se desplaza bajo el dedo al empezar: la caja en casi todas
    // las hojas, la rejilla en el selector de botella. "Arriba del todo"
    // se mira en ESE, o tirar hacia abajo a media rejilla cerraría la
    // hoja en vez de subir la lista.
    let sc = caja;
    // La dirección se decide con el primer movimiento claro. Antes el
    // gesto cancelaba TODO movimiento en cuanto empezaba, también el de
    // lado: la fila de tamaños del selector de botella no se deslizaba,
    // ni ninguna fila horizontal de ninguna hoja.
    let x0 = 0, rumbo = null;

    const empezar = (e) => {
      if (op.quieta && op.quieta()) return;
      sc = desplazador(e.target) || caja;
      if (sc.scrollTop > 0) return;
      const t = e.touches ? e.touches[0] : e;
      y0 = t.clientY; x0 = t.clientX || 0; rumbo = null;
      t0 = Date.now(); dy = 0; activo = true;
      h0 = caja.getBoundingClientRect().height;
      caja.style.transition = 'none';
    };

    const mover = (e) => {
      if (!activo) return;
      const t = e.touches ? e.touches[0] : e;
      dy = t.clientY - y0;
      if (!rumbo) {
        const dx = (t.clientX || 0) - x0;
        // Menos de 6px todavía no dice nada: ni se arrastra ni se cancela.
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) { dy = 0; return; }
        rumbo = Math.abs(dx) > Math.abs(dy) ? 'lado' : 'vertical';
        // De lado no es cerrar la hoja: se suelta y el dedo desliza lo
        // que tenga debajo.
        if (rumbo === 'lado') { activo = false; caja.style.transition = ''; dy = 0; return; }
      }
      // Hacia arriba no se estira: la hoja no sube más de donde está.
      // Salvo que la hoja sepa crecer: entonces crece con el dedo. Crece
      // de ALTO y no se traslada, porque trasladarla la despegaría del
      // borde de abajo y se vería el Home por debajo.
      if (dy < 0) {
        if (!op.alSubir) { dy = 0; return; }
        if (e.cancelable) e.preventDefault();
        caja.style.height = Math.round(h0 - dy) + 'px';
        return;
      }
      if (sc.scrollTop > 0) { soltar(); return; }
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

      if (dy < 0 && op.alSubir) {
        // Se quita el alto del dedo y el CSS lleva la caja a su sitio:
        // al de pantalla completa si pasó el umbral, al de tarjeta si no.
        caja.style.transition = 'height .22s ease-out';
        caja.style.height = '';
        if (-dy > UMBRAL || -v > VELOCIDAD) op.alSubir();
        return;
      }

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
