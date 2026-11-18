(() => {
  if (window.BarStockMobileToastWine) return;

  // ── Wine from Toast · las tarjetas del teléfono ─────────────────────
  //
  // Lo mismo que la tabla del escritorio (toast-wine-panel.js), una
  // tarjeta por artículo de Toast, para poder hacerlo desde la barra. Axel
  // pidió las dos vistas. La lógica es la de toast-wine.js: aquí solo se
  // pinta. Se abre desde Settings, grupo "Toast" (mobile-settings.js).
  //
  // Cambiar el vino abre el buscador de toda la app, a pantalla completa
  // (bottle-search.js, Axel 2026-11-18, lámina A). Fue un <select> nativo:
  // la rueda del iPhone con el inventario entero, y el resto de la app
  // ya elige escribiendo. Elegir en el buscador confirma, como en Liquor
  // from Toast; "Confirm" confirma la sugerida sin abrir nada.

  const W = () => window.BarStockToastWine;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const NIVEL = { high: ['Suggested', 'ok'], mid: ['Check', 'dudo'], none: ['No match', 'no'] };
  let _tab = 'review';
  let _error = '';
  let _quitar = null;
  let _host = null;

  function aviso(d) {
    if (d.estado === 'cargando') return `<div class="m-tw-aviso">Reading Toast sales… ${d.progreso || 0} of ${d.total || 7} days</div>`;
    if (d.estado === 'sinRestaurante') return `<div class="m-tw-aviso mal">This location isn't linked to a Toast restaurant yet, so nothing can be matched here.</div>`;
    if (d.estado === 'otroRestaurante') return `<div class="m-tw-aviso mal">The Toast data here belongs to another restaurant, not to this location.</div>`;
    if (d.estado === 'error') return `<div class="m-tw-aviso mal">Couldn't load Toast wine.<small>${esc(d.error)}</small></div>`;
    return '';
  }

  function tarjeta(f, productos) {
    const sv = `<span class="m-tw-sv${f.servicio === 'bottle' ? ' b' : ''}">${esc(W().servicioTexto(f))}</span>`;
    const meta = `<div class="m-tw-meta">${sv}<span>${esc(f.grupo)} · ${f.vendido} sold</span></div>`;
    if (f.estado !== 'review') {
      return `<div class="m-tw-card">
        <div class="m-tw-r1"><b>${esc(f.nombre)}</b></div>${meta}
        <div class="m-tw-dest">${f.producto ? '→ <span>' + esc(f.producto) + '</span>' : '<span class="m-tw-mut">Not an inventory wine</span>'}</div>
        <div class="m-tw-acts"><button type="button" class="m-tw-b2" data-un="${esc(f.guid)}">Undo</button></div></div>`;
    }
    const n = NIVEL[f.nivel] || NIVEL.none;
    return `<div class="m-tw-card">
      <div class="m-tw-r1"><b>${esc(f.nombre)}</b><span class="m-tw-n ${n[1]}">${n[0]}</span></div>${meta}
      <button type="button" class="m-tw-elige" data-g="${esc(f.guid)}" aria-label="Inventory wine for ${esc(f.nombre)}">
        ${f.producto ? '<span>' + esc(f.producto) + '</span><small>Change</small>' : '<span class="m-tw-mut">Choose a wine</span><small>Search</small>'}
      </button>
      <div class="m-tw-acts">
        <button type="button" class="m-tw-b2" data-ig="${esc(f.guid)}">Ignore</button>
        <button type="button" class="m-tw-b" data-ok="${esc(f.guid)}">Confirm</button>
      </div></div>`;
  }

  // `cab` pinta el encabezado y `volver` engancha su flecha. Las dos se
  // guardan porque esta vista se repinta entera cada vez que cambia algo
  // (llega un día de ventas, se confirma un vino), y la flecha de volver
  // vive DENTRO de lo que se repinta (#mAtras): sin volver a engancharla,
  // tras el primer repintado dejaba de responder.
  let _cab = null, _volver = null;

  function pintar(host, cab, volver) {
    if (host) _host = host;
    if (cab) _cab = cab;
    if (volver) _volver = volver;
    host = _host;
    if (!host || !host.isConnected) return;
    const d = W().datos() || { estado: 'cargando' };
    const cabecera = _cab ? _cab() : '';
    let cuerpo = '';
    if (d.estado !== 'listo') cuerpo = aviso(d);
    else {
      const cuenta = (e) => d.filas.filter(f => f.estado === e).length;
      const claras = d.filas.filter(f => f.estado === 'review' && f.nivel === 'high' && f.producto).length;
      // "Done" junta confirmados e ignorados: en el teléfono, tres
      // pestañas no caben al lado sin partirse.
      const lista = d.filas.filter(f => _tab === 'review' ? f.estado === 'review' : f.estado !== 'review');
      cuerpo = `
        <div class="m-tw-p">A glass counts ${W().COPA_OZ} oz of its bottle; a bottle counts one. Sold in the last ${W().DIAS} days.</div>
        <div class="m-tw-tabs">
          <button type="button" data-tab="review" class="${_tab === 'review' ? 'on' : ''}">To review · ${cuenta('review')}</button>
          <button type="button" data-tab="confirmed" class="${_tab === 'confirmed' ? 'on' : ''}">Done · ${cuenta('confirmed') + cuenta('ignored')}</button>
        </div>
        ${_error ? `<div class="m-tw-aviso mal">${esc(_error)}</div>` : ''}
        ${_tab === 'review' && claras ? `<button type="button" class="m-tw-todas" id="mTwTodas">Confirm all suggested (${claras})</button>` : ''}
        ${lista.length ? lista.map(f => tarjeta(f, d.productos)).join('') : `<div class="m-tw-p">${_tab === 'review' ? 'Nothing left to review.' : 'Nothing here yet.'}</div>`}`;
    }
    host.innerHTML = cabecera + '<div class="m-tw">' + cuerpo + '</div>';
    if (_volver) _volver();

    host.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { _tab = b.dataset.tab; _error = ''; pintar(); }; });
    const hacer = (fn) => async () => {
      _error = '';
      try { await fn(); } catch (e) { _error = 'Not saved: ' + String((e && e.message) || e); pintar(); }
    };
    const fila = (g) => (d.filas || []).find(f => f.guid === g);
    const elegir = (g) => {
      const f = fila(g), B = window.BarStockBottleSearch;
      if (!f || !B || !B.abrir) return;
      B.abrir({
        titulo: f.nombre,
        sub: W().servicioTexto(f) + ' · ' + f.vendido + ' sold',
        productos: d.productos || [],
        pista: f.nombre,
        sugerida: f.producto || null,
        que: 'wines',
        pie: [{ id: 'ignorar', texto: 'Not an inventory wine', sub: 'Ignore it' }],
        alElegir: (p) => { B.cerrar(); hacer(() => W().confirmar(g, p))(); },
        alPie: () => { B.cerrar(); hacer(() => W().ignorar(g))(); }
      });
    };
    host.querySelectorAll('.m-tw-elige').forEach(b => { b.onclick = () => elegir(b.dataset.g); });
    host.querySelectorAll('[data-ok]').forEach(b => {
      b.onclick = hacer(async () => {
        const f = fila(b.dataset.ok);
        // Sin sugerida no hay nada que confirmar: se abre el buscador.
        if (!f || !f.producto) return elegir(b.dataset.ok);
        await W().confirmar(b.dataset.ok, f.producto);
      });
    });
    host.querySelectorAll('[data-ig]').forEach(b => { b.onclick = hacer(() => W().ignorar(b.dataset.ig)); });
    host.querySelectorAll('[data-un]').forEach(b => { b.onclick = hacer(() => W().deshacer(b.dataset.un)); });
    const todas = host.querySelector('#mTwTodas');
    if (todas) todas.onclick = hacer(() => W().confirmarSugeridas());
  }

  function montar(host, cab, volver) {
    if (!W()) return;
    _host = host;
    _tab = 'review';
    _error = '';
    // Solo repinta si esta vista sigue puesta: al salir a otro panel de
    // Settings el host es el mismo, y repintar ahí pisaría ese panel.
    if (!_quitar) _quitar = W().alCambiar(() => { if (_host && _host.querySelector('.m-tw')) pintar(); });
    pintar(host, cab, volver);
    W().cargar();
  }

  window.BarStockMobileToastWine = { montar, pintar };
})();
