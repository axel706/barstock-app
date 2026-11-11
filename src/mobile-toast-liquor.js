(() => {
  if (window.BarStockMobileToastLiquor) return;

  // ── Liquor from Toast · la pantalla del teléfono ─────────────────────
  //
  // Opción C de la lámina (2026-11-11; Axel: "dame la pantalla que creas
  // correcta"): secciones como el menú de Toast (Vodka, Gin, Bourbon +
  // Rye…) y una fila compacta por MARCA. Una marca es una fila aunque
  // Toast la venda en tres medidas: la botella se elige una vez. La
  // lógica es la de toast-liquor.js; aquí sólo se pinta.
  //
  // Cambiar la botella es un <select> nativo puesto encima de la fila, sin
  // verse: en el iPhone abre la rueda del sistema, igual que en la
  // pantalla de vinos. Elegir ES confirmar: no hay un segundo botón que
  // olvidar. Por eso el select también lleva "Not in inventory" (ignorar)
  // y, ya decidida, "Back to review" (deshacer).

  const T = () => window.BarStockToastLiquor;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const IGNORAR = '__ignorar', DESHACER = '__deshacer';
  let _tab = 'review';
  let _error = '';
  let _quitar = null;
  let _host = null, _cab = null, _volver = null;

  // Lo que pasó, no lo que se supone: si Supabase o Toast dijeron algo,
  // va tal cual debajo.
  function aviso(d) {
    if (d.estado === 'cargando') return `<div class="m-tw-aviso">Reading Toast sales… ${d.progreso || 0} of ${d.total || 7} days</div>`;
    if (d.estado === 'sinRestaurante') return `<div class="m-tw-aviso mal">This location isn't linked to a Toast restaurant yet, so nothing can be matched here.</div>`;
    if (d.estado === 'otroRestaurante') return `<div class="m-tw-aviso mal">The Toast data here belongs to another restaurant, not to this location.</div>`;
    if (d.estado === 'error') return `<div class="m-tw-aviso mal">Couldn't load Toast liquor.<small>${esc(d.error)}</small></div>`;
    return '';
  }

  // ── Por revisar, NINGUNA botella marcada ──────────────────────────
  //
  // La rueda del iPhone no avisa ('change') si se elige la opción que ya
  // estaba marcada. La sugerida venía marcada, y elegirla no guardaba
  // nada: Axel elegía Tito's sobre Tito's y la fila "ahí se queda"
  // (2026-11-11). Ahora, por revisar, la rueda arranca en "Choose" y la
  // sugerida va la primera y aparte, así que elegirla siempre es un
  // cambio. Ya decidida, sí va marcada su botella: ahí elegir la misma
  // no tiene nada que guardar.
  function selector(M, productos) {
    const ops = [];
    const revisar = M.estado === 'review';
    if (revisar) {
      ops.push('<option value="" selected>— Choose a bottle —</option>');
      if (M.producto) ops.push(`<option value="${esc(M.producto)}">✓ ${esc(M.producto)} (suggested)</option>`);
    }
    for (const p of productos) {
      if (revisar && p === M.producto) continue;
      ops.push(`<option value="${esc(p)}"${!revisar && p === M.producto && M.estado !== 'ignored' ? ' selected' : ''}>${esc(p)}</option>`);
    }
    ops.push(`<option value="${IGNORAR}"${M.estado === 'ignored' ? ' selected' : ''}>Not in inventory</option>`);
    if (M.estado !== 'review') ops.push(`<option value="${DESHACER}">Back to review</option>`);
    return `<select class="m-tl-sel" data-k="${esc(M.clave)}" aria-label="Bottle for ${esc(M.marca)}">${ops.join('')}</select>`;
  }

  function fila(M, productos) {
    const marcaPunto = M.estado !== 'review' ? '' : M.nivel === 'high' ? '' : `<i class="m-tl-pt ${M.nivel === 'mid' ? 'dudo' : 'no'}"></i>`;
    const medidas = M.medidas.map(m => `<span class="${m.oz === undefined ? 'mal' : ''}">${esc(T().medidaTexto(m))}</span>`).join('');
    const destino = M.estado === 'ignored' ? '<span class="m-tl-dest mut">Not in inventory</span>'
      : M.producto ? `<span class="m-tl-dest">${esc(M.producto)}</span>`
        : '<span class="m-tl-dest vacio">Choose a bottle</span>';
    return `<div class="m-tl-fila">
      <div class="m-tl-izq"><b>${marcaPunto}${esc(M.marca)}</b>
        <div class="m-tl-med">${medidas}</div>
        <small>${M.vendido} sold</small></div>
      ${destino}<i class="ti ti-chevron-right m-tl-v" aria-hidden="true"></i>
      ${selector(M, productos)}</div>`;
  }

  function seccion(S, productos) {
    const claras = S.marcas.filter(M => M.estado === 'review' && M.nivel === 'high' && M.producto).length;
    return `<div class="m-tl-sec">
      <div class="m-tl-sec-h"><b>${esc(S.tipo)}</b>
        <span>${_tab === 'review' ? (claras ? claras + ' suggested' : S.marcas.length + ' to review') : S.marcas.length + ' done'}</span>
        ${_tab === 'review' && claras ? `<button type="button" class="m-tl-todas" data-tipo="${esc(S.tipo)}">Confirm ${claras}</button>` : ''}
      </div>${S.marcas.map(M => fila(M, productos)).join('')}</div>`;
  }

  function pintar(host, cab, volver) {
    if (host) _host = host;
    if (cab) _cab = cab;
    if (volver) _volver = volver;
    host = _host;
    if (!host || !host.isConnected) return;
    const d = T().datos() || { estado: 'cargando' };
    let cuerpo = '';
    if (d.estado !== 'listo') cuerpo = aviso(d);
    else {
      const todas = T().marcas();
      const lista = todas.filter(M => _tab === 'review' ? M.estado === 'review' : M.estado !== 'review');
      const nRev = todas.filter(M => M.estado === 'review').length;
      const P = T().MEDIDAS;
      cuerpo = `
        <div class="m-tw-p">One bottle per brand. Each way Toast sells it takes its own pour:
          Single ${P.single} oz, Double ${P.double}, Up or Rocks ${P.up}, Shot ${P.shot}. Sold in the last ${T().DIAS} days.</div>
        <div class="m-tw-tabs">
          <button type="button" data-tab="review" class="${_tab === 'review' ? 'on' : ''}">To review · ${nRev}</button>
          <button type="button" data-tab="done" class="${_tab === 'done' ? 'on' : ''}">Done · ${todas.length - nRev}</button>
        </div>
        ${_error ? `<div class="m-tw-aviso mal">${esc(_error)}</div>` : ''}
        ${lista.length ? T().porTipo(lista).map(S => seccion(S, d.productos)).join('')
          : `<div class="m-tw-p">${_tab === 'review' ? 'Nothing left to review.' : 'Nothing here yet.'}</div>`}`;
    }
    host.innerHTML = (_cab ? _cab() : '') + '<div class="m-tw m-tl">' + cuerpo + '</div>';
    if (_volver) _volver();

    host.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { _tab = b.dataset.tab; _error = ''; pintar(); }; });
    const hacer = (fn) => async () => {
      _error = '';
      try { await fn(); } catch (e) { _error = 'Not saved: ' + String((e && e.message) || e); }
      pintar();
    };
    host.querySelectorAll('.m-tl-sel').forEach(s => {
      s.onchange = hacer(async () => {
        const v = s.value, k = s.dataset.k;
        if (!v) return;
        if (v === IGNORAR) return T().ignorarMarca(k);
        if (v === DESHACER) return T().deshacerMarca(k);
        const r = await T().confirmarMarca(k, v);
        // Lo que no se guardó se dice, con su medida: "deberías tener"
        // no contará esas ventas hasta que la medida exista.
        if (r.sinMedida.length) _error = 'Saved, except ' + r.sinMedida.join(', ') + ': that size has no pour yet.';
      });
    });
    host.querySelectorAll('[data-tipo]').forEach(b => { b.onclick = hacer(() => T().confirmarSugeridas(b.dataset.tipo)); });
  }

  function montar(host, cab, volver) {
    if (!T()) return;
    _host = host;
    _tab = 'review';
    _error = '';
    // Sólo repinta si esta vista sigue puesta: al salir a otro panel de
    // Settings el host es el mismo, y repintar ahí pisaría ese panel.
    if (!_quitar) _quitar = T().alCambiar(() => { if (_host && _host.querySelector('.m-tl')) pintar(); });
    pintar(host, cab, volver);
    T().cargar();
  }

  window.BarStockMobileToastLiquor = { montar, pintar };
})();
