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
  // Tocar la fila abre una hoja con buscador: la sugerida arriba, y
  // escribiendo se encuentra cualquier botella. Elegir ES confirmar: no
  // hay un segundo botón que olvidar. La hoja también lleva "Not in
  // inventory" (ignorar) y, ya decidida, "Back to review" (deshacer).
  //
  // Fue una rueda nativa (<select>), como en los vinos, y en Crown no
  // sirvió (Axel, 2026-11-11): con todo el inventario en la lista, llegar
  // a Pedro Morales era bajar la rueda entera hasta la P, marca tras
  // marca. Y la rueda no avisa si se elige lo que ya estaba marcado.

  const T = () => window.BarStockToastLiquor;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

  function fila(M) {
    const marcaPunto = M.estado !== 'review' ? '' : M.nivel === 'high' ? '' : `<i class="m-tl-pt ${M.nivel === 'mid' ? 'dudo' : 'no'}"></i>`;
    const medidas = M.medidas.map(m => `<span class="${m.oz === undefined ? 'mal' : ''}">${esc(T().medidaTexto(m))}</span>`).join('');
    const destino = M.estado === 'ignored' ? '<span class="m-tl-dest mut">Not in inventory</span>'
      : M.producto ? `<span class="m-tl-dest">${esc(M.producto)}</span>`
        : '<span class="m-tl-dest vacio">Choose a bottle</span>';
    // Lo que no cuenta, dicho en la fila: una marca hecha con una medida
    // sin pour no puede parecer completa.
    const noCuenta = M.sinPour.length ? `<small class="mal">${esc(M.sinPour.join(', '))}: not counted yet</small>` : '';
    return `<button type="button" class="m-tl-fila" data-k="${esc(M.clave)}">
      <span class="m-tl-izq"><b>${marcaPunto}${esc(M.marca)}</b>
        <span class="m-tl-med">${medidas}</span>
        <small>${M.vendido} sold</small>${noCuenta}</span>
      ${destino}<i class="ti ti-chevron-right m-tl-v" aria-hidden="true"></i></button>`;
  }

  // Las marcas sin NINGUNA medida con pour: no hay nada que guardar, así
  // que no se ofrecen. Se dicen, para que no parezca que faltan.
  function enEspera(lista) {
    if (!lista.length) return '';
    const por = {};
    for (const M of lista) for (const m of M.sinPour) por[m] = (por[m] || 0) + 1;
    return `<div class="m-tl-sec m-tl-espera-sec">
      <div class="m-tl-sec-h"><b>Waiting for a pour</b><span>${lista.length} brand${lista.length === 1 ? '' : 's'}</span></div>
      <div class="m-tw-p m-tl-espera-p">Toast sells these only as ${esc(Object.keys(por).join(', '))}, and that size has no pour in BarStock yet. They show up here to match as soon as it does.</div>
      ${lista.map(M => `<div class="m-tl-espera"><b>${esc(M.marca)}</b><span>${esc(M.tipo)} · ${M.vendido} sold</span></div>`).join('')}
    </div>`;
  }

  // ── La hoja: elegir la botella escribiendo ───────────────────────────
  //
  // La hoja vive en bottle-search.js, que también la usan las recetas.
  // Aquí sólo se dice qué marca es y qué se guarda al elegir.
  const P = () => window.BarStockBottleSearch;
  const cerrarHoja = () => P().cerrar();

  function abrirHoja(k) {
    const M = T().marcas().find(x => x.clave === k);
    const d = T().datos();
    if (!M || !d || !d.productos) return;
    P().abrir({
      titulo: M.marca,
      sub: M.tipo + ' · ' + M.medidas.map(m => T().medidaTexto(m)).join(' · '),
      productos: d.productos,
      pista: M.marca,
      sugerida: M.estado === 'review' && M.producto ? M.producto : null,
      actual: M.estado === 'confirmed' ? M.producto : null,
      pie: [{ id: 'ignorar', texto: 'Not in inventory' }]
        .concat(M.estado !== 'review' ? [{ id: 'deshacer', texto: 'Back to review' }] : []),
      alElegir: (p) => hacer(async () => {
        const r = await T().confirmarMarca(k, p);
        aviso2(M.marca + ' → ' + p + (r.sinMedida.length ? ' · ' + r.sinMedida.join(', ') + ' not counted yet' : ''));
      })(),
      alPie: (id) => id === 'ignorar'
        ? hacer(async () => { await T().ignorarMarca(k); aviso2(M.marca + ': not in inventory'); })()
        : hacer(async () => { await T().deshacerMarca(k); aviso2(M.marca + ': back to review'); })()
    });
  }

  // Lo que pasó, en el header, donde se ve aunque la lista esté bajada.
  // Antes el aviso salía arriba de la lista y no se veía desde abajo.
  function aviso2(t) {
    if (window.BarStockToast && window.BarStockToast.show) { try { window.BarStockToast.show('Saved: ' + t); } catch (e) {} }
  }

  // Guarda, cierra la hoja y repinta. Un fallo se dice arriba y también
  // en el header.
  function hacer(fn) {
    return async () => {
      _error = '';
      try { await fn(); }
      catch (e) {
        _error = 'Not saved: ' + String((e && e.message) || e);
        if (window.BarStockToast && window.BarStockToast.show) { try { window.BarStockToast.show(_error); } catch (er) {} }
      }
      cerrarHoja();
      pintar();
    };
  }

  function seccion(S, productos) {
    const claras = S.marcas.filter(M => M.estado === 'review' && M.nivel === 'high' && M.producto).length;
    return `<div class="m-tl-sec">
      <div class="m-tl-sec-h"><b>${esc(S.tipo)}</b>
        <span>${_tab === 'review' ? (claras ? claras + ' suggested' : S.marcas.length + ' to review') : S.marcas.length + ' done'}</span>
        ${_tab === 'review' && claras ? `<button type="button" class="m-tl-todas" data-tipo="${esc(S.tipo)}">Confirm ${claras}</button>` : ''}
      </div>${S.marcas.map(M => fila(M)).join('')}</div>`;
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
      const espera = todas.filter(M => M.estado === 'sinPour');
      const decididas = todas.filter(M => M.estado === 'confirmed' || M.estado === 'ignored');
      const lista = _tab === 'review' ? todas.filter(M => M.estado === 'review') : decididas;
      const nRev = todas.filter(M => M.estado === 'review').length;
      // Las medidas de ESTA locación (Settings › Toast › Pours), no las
      // de siempre: cada restaurante pone las suyas desde el 2026-11-13.
      const oz = (m) => { const v = T().ozDe(m); return v === undefined ? '?' : v; };
      cuerpo = `
        <div class="m-tw-p">One bottle per brand. Each way Toast sells it takes its own pour:
          Single ${oz('Single')} oz, Double ${oz('Double')}, Up or Rocks ${oz('Up/Rx')}, Shot ${oz('Shot')}. Change them in Settings › Toast › Pours. Sold in the last ${T().DIAS} days.</div>
        <div class="m-tw-tabs">
          <button type="button" data-tab="review" class="${_tab === 'review' ? 'on' : ''}">To review · ${nRev}</button>
          <button type="button" data-tab="done" class="${_tab === 'done' ? 'on' : ''}">Done · ${decididas.length}</button>
        </div>
        ${_error ? `<div class="m-tw-aviso mal">${esc(_error)}</div>` : ''}
        ${lista.length ? T().porTipo(lista).map(S => seccion(S, d.productos)).join('')
          : `<div class="m-tw-p">${_tab === 'review' ? 'Nothing left to review.' : 'Nothing here yet.'}</div>`}
        ${_tab === 'review' ? enEspera(espera) : ''}`;
    }
    host.innerHTML = (_cab ? _cab() : '') + '<div class="m-tw m-tl">' + cuerpo + '</div>';
    if (_volver) _volver();

    host.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { _tab = b.dataset.tab; _error = ''; pintar(); }; });
    host.querySelectorAll('.m-tl-fila').forEach(b => { b.onclick = () => abrirHoja(b.dataset.k); });
    host.querySelectorAll('[data-tipo]').forEach(b => {
      b.onclick = hacer(async () => {
        const n = await T().confirmarSugeridas(b.dataset.tipo);
        aviso2(n + ' ' + b.dataset.tipo + ' brand' + (n === 1 ? '' : 's'));
      });
    });
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
