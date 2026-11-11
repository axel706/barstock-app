(() => {
  if (window.BarStockDialog) return;

  // ── Preguntar y avisar, con la cara de la app ────────────────────────
  //
  // Sustituye a `confirm()` y `alert()` del navegador. Los de serie no
  // se pueden tocar: en el iPhone salen blancos, con la tipografía del
  // sistema y un "OK" azul de iOS, y en medio de una app oscura se leen
  // como un error del teléfono más que como una pregunta de la app.
  //
  // ── Lo que cambia para quien lo usa ──────────────────────────────────
  //
  // `confirm()` es SÍNCRONO y esto no puede serlo: no existe forma de
  // parar el hilo esperando a que alguien pulse un botón. Así que
  // devuelve una promesa y quien pregunta tiene que esperarla:
  //
  //     if (!confirm('¿Seguro?')) return;                 // antes
  //     if (!await Dialog.confirmar({ ... })) return;     // ahora
  //
  // Eso obliga a que la función que pregunta sea `async`. Es el precio,
  // y es la razón de que la mudanza se haga por sitios y no de golpe:
  // una función que se vuelve `async` sin que su llamador lo sepa
  // devuelve una promesa donde antes devolvía un valor, y eso falla en
  // silencio.
  //
  // ── Una sola a la vez ────────────────────────────────────────────────
  //
  // Si ya hay una abierta, la nueva espera su turno en vez de pisarla.
  // Dos diálogos encimados dejan al de abajo sin forma de cerrarse y la
  // app parece colgada.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  let _cola = Promise.resolve();
  let _cerrar = null;        // cierra la que esté abierta

  function armar() {
    let bg = document.getElementById('dlgBg');
    if (bg) return bg;
    bg = document.createElement('div');
    bg.id = 'dlgBg';
    bg.className = 'modalbg hidden';
    bg.setAttribute('role', 'dialog');
    bg.setAttribute('aria-modal', 'true');
    document.body.appendChild(bg);
    return bg;
  }

  // `opc`:
  //   titulo    — la pregunta, en una línea
  //   cuerpo    — el detalle (opcional)
  //   filas     — [{ k, v, total }]: una cuenta alineada (opcional)
  //   nota      — una línea pequeña debajo de la cuenta (opcional)
  //   aviso     — la consecuencia irreversible, en rojo (opcional)
  //   ok        — texto del botón que sigue adelante
  //   cancelar  — texto del otro; `null` deja un solo botón (avisar)
  //   peligro   — pinta de rojo lo que destruye
  //   icono     — clase de Tabler; hay una por defecto para cada caso
  //   luego     — un SEGUNDO paso, con las mismas opciones. Ver abajo.
  //
  // ── Dos pasos en la misma caja ───────────────────────────────────────
  //
  // Para lo que no tiene vuelta atrás (reiniciar el ciclo pone a cero
  // todo el on hand) se pregunta dos veces. Antes la segunda era un
  // `confirm()` del navegador que salía ENCIMA de este diálogo: dos
  // preguntas apiladas, la de arriba blanca y con otra tipografía. Con
  // `luego`, al pulsar el botón del primer paso la misma caja se
  // convierte en el segundo, y la respuesta sólo es `true` si se
  // confirma ese. Cancelar en cualquiera de los dos es `false`.
  function cuerpoDe(o, paso, pasos) {
    const soloUno = o.cancelar === null;
    const icono = o.icono || (o.peligro ? 'ti-alert-triangle'
                                        : soloUno ? 'ti-info-circle' : 'ti-help-circle');
    return '<div class="modal dlg-modal' + (o.peligro ? ' peligro' : '') + '">' +
        '<div class="dlg-head">' +
          '<i class="ti ' + esc(icono) + '" aria-hidden="true"></i>' +
          '<span>' + esc(o.titulo || '') + '</span>' +
        '</div>' +
        (o.cuerpo ? '<div class="dlg-cuerpo">' + esc(o.cuerpo) + '</div>' : '') +
        // Una cuenta, alineada como un recibo: "Counted · $4,821". La
        // pidió "On the shelf" del Home (Axel, 2026-11-11) para no hacer
        // crecer su tarjeta; un párrafo no alinea las cifras.
        (o.filas && o.filas.length ? '<div class="dlg-filas">' + o.filas.map(f =>
          '<span' + (f.total ? ' class="tot"' : '') + '>' + esc(f.k) + '</span>' +
          '<span class="v' + (f.total ? ' tot' : '') + '">' + esc(f.v) + '</span>').join('') + '</div>' : '') +
        (o.nota ? '<div class="dlg-nota">' + esc(o.nota) + '</div>' : '') +
        (o.aviso ? '<div class="dlg-aviso">' + esc(o.aviso) + '</div>' : '') +
        '<div class="dlg-foot' + (soloUno ? ' solo' : '') + '">' +
          (soloUno ? '' :
            '<button type="button" class="dlg-cancel" id="dlgNo">' +
              esc(o.cancelar || 'Cancel') + '</button>') +
          '<button type="button" class="dlg-go" id="dlgSi">' +
            esc(o.ok || 'OK') + '</button>' +
        '</div>' +
        // Los puntos dicen en qué paso vas y que el segundo es el último.
        (pasos > 1 ? '<div class="dlg-pasos" aria-hidden="true">' +
          Array.from({ length: pasos }, (_, i) =>
            '<i' + (i === paso ? ' class="on"' : '') + '></i>').join('') +
          '</div>' : '') +
      '</div>';
  }

  function abrir(opc) {
    const o1 = opc || {};
    // El segundo paso hereda lo que no diga: el tono de peligro y los
    // textos de los botones si no trae los suyos.
    const o2 = o1.luego ? Object.assign({ peligro: o1.peligro, cancelar: o1.cancelar }, o1.luego) : null;
    const pasos = o2 ? 2 : 1;
    let paso = 0;
    const bg = armar();

    bg.innerHTML = cuerpoDe(o1, 0, pasos);
    bg.classList.remove('hidden');

    return new Promise((resolver) => {
      let hecho = false;
      const salir = (v) => {
        if (hecho) return;
        hecho = true;
        _cerrar = null;
        document.removeEventListener('keydown', tecla, true);
        bg.classList.add('hidden');
        bg.innerHTML = '';
        resolver(v);
      };
      _cerrar = () => salir(false);

      // Enganchar los botones del paso que se está viendo. Se llama otra
      // vez al pasar al segundo, porque la caja se vuelve a dibujar.
      const enganchar = () => {
        const si = bg.querySelector('#dlgSi');
        const no = bg.querySelector('#dlgNo');
        si.onclick = siguiente;
        if (no) no.onclick = () => salir(false);
        // El foco va al botón seguro cuando hay dos. Con uno solo da igual.
        try { (no || si).focus(); } catch (e) {}
      };
      // El botón de seguir: en el primer paso de dos, pasa al segundo;
      // en el último, contesta que sí.
      function siguiente() {
        if (o2 && paso === 0) {
          paso = 1;
          bg.innerHTML = cuerpoDe(o2, 1, pasos);
          enganchar();
          return;
        }
        salir(true);
      }

      // Tocar fuera cancela, pero NO cuando lo que se pregunta destruye
      // algo: ahí un roce con el pulgar al sacar el teléfono del
      // bolsillo no puede valer como respuesta. Cancelar es la
      // respuesta segura, así que cerrar por fuera equivale a cancelar.
      bg.onclick = (e) => { if (e.target === bg) salir(false); };

      // Enter es "seguir", no "sí": con dos pasos, un Enter no puede
      // saltarse el segundo.
      function tecla(e) {
        if (e.key === 'Escape') { e.preventDefault(); salir(false); }
        if (e.key === 'Enter') { e.preventDefault(); siguiente(); }
      }
      document.addEventListener('keydown', tecla, true);

      enganchar();
    });
  }

  // Se encolan: la segunda espera a que se cierre la primera.
  function encolar(opc) {
    const turno = _cola.then(() => abrir(opc));
    _cola = turno.catch(() => {});
    return turno;
  }

  function confirmar(opc) {
    return encolar(Object.assign({ ok: 'OK', cancelar: 'Cancel' }, opc || {}));
  }

  // Un solo botón. Devuelve una promesa igual, por si alguien quiere
  // esperar a que se cierre antes de seguir.
  function avisar(opc) {
    if (typeof opc === 'string') opc = { titulo: opc };
    return encolar(Object.assign({ ok: 'OK' }, opc || {}, { cancelar: null }));
  }

  window.BarStockDialog = {
    confirmar, avisar,
    abierto: () => !!_cerrar,
    cerrar: () => { if (_cerrar) _cerrar(); }
  };
})();
