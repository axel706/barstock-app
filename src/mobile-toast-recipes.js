(() => {
  if (window.BarStockMobileToastRecipes) return;

  // ── Recipes · la pantalla del teléfono ───────────────────────────────
  //
  // Opción B de la lámina (Axel, 2026-11-11): una tarjeta por cóctel con
  // sus ingredientes, y la botella se elige en cada línea. Tres pestañas
  // como las separa la carta: Cocktails, Happy Hour y Mods (los
  // modificadores que convierten un licor solo en trago). La lógica es
  // la de toast-recipes.js; aquí sólo se pinta.
  //
  // Tocar una línea abre la hoja de bottle-search.js, la misma de Liquor
  // from Toast. Elegir ES guardar.
  //
  // Lo que no se puede elegir se dice y no se ofrece: el licor que pide
  // el cliente no tiene botella fija, y una receta que no está en la hoja
  // de Axel dice "Recipe missing" en rojo. Una tarjeta sin líneas que no
  // lo dijera parecería un trago que no gasta nada.

  const T = () => window.BarStockToastRecipes;
  const S = () => window.BarStockBottleSearch;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const oz = (n) => (Math.round(n * 100) / 100) + ' oz';

  const PESTANAS = [['cocktails', 'Cocktails'], ['hh', 'Happy Hour'], ['mods', 'Mods']];
  let _tab = 'cocktails';
  let _error = '';
  let _quitar = null;
  let _host = null, _cab = null, _volver = null;

  function aviso(d) {
    if (d.estado === 'cargando') return '<div class="m-tw-aviso">Loading recipes…</div>';
    // Lo que contestó Supabase, tal cual: adivinar la causa ("corre la
    // migración") ya mandó una vez a correr una migración ya corrida.
    if (d.estado === 'error') return `<div class="m-tw-aviso mal">Couldn't load the recipes.<small>${esc(d.error)}</small></div>`;
    return '';
  }

  function linea(R, l) {
    const cond = T().condicion(l);
    const izq = `<span class="m-rc-ing">${esc(l.etiqueta)} · ${oz(l.oz)}${cond ? `<small>${esc(cond)}</small>` : ''}</span>`;
    if (l.eleccion) {
      return `<div class="m-rc-fila">${izq}<span class="m-tl-dest mut">Guest's choice</span></div>`;
    }
    const destino = l.producto ? `<span class="m-tl-dest">${esc(l.producto)}</span>`
      : '<span class="m-tl-dest vacio">Choose a bottle</span>';
    return `<button type="button" class="m-tl-fila m-rc-fila" data-l="${l.id}">${izq}${destino}<i class="ti ti-chevron-right m-tl-v" aria-hidden="true"></i></button>`;
  }

  function tarjeta(R) {
    const precio = R.precio != null ? `<span class="m-rc-precio">$${esc(R.precio)}</span>` : '';
    const cuerpo = R.pendiente
      ? `<div class="m-rc-falta">Recipe missing · ${esc(R.pendiente)}</div>`
      : R.lineas.map(l => linea(R, l)).join('');
    return `<div class="m-tl-sec m-rc-card">
      <div class="m-tl-sec-h"><b>${esc(R.nombre)}</b><span></span>${precio}</div>
      ${R.nota ? `<div class="m-tw-p m-rc-nota">${esc(R.nota)}</div>` : ''}
      ${cuerpo}</div>`;
  }

  function abrirHoja(id) {
    let R = null, l = null;
    for (const r of T().recetas()) for (const x of r.lineas) if (x.id === id) { R = r; l = x; }
    const d = T().datos();
    if (!R || !l || l.eleccion || !d || !d.productos) return;
    const cond = T().condicion(l);
    S().abrir({
      titulo: l.etiqueta,
      sub: R.nombre + ' · ' + oz(l.oz) + (cond ? ' · ' + cond : ''),
      productos: d.productos,
      pista: l.etiqueta,
      sugerida: l.producto ? null : T().sugerida(id),
      actual: l.producto,
      pie: l.producto ? [{ id: 'quitar', texto: 'Clear bottle' }] : [],
      alElegir: (p) => hacer(async () => { await T().elegir(id, p); aviso2('Saved: ' + l.etiqueta + ' → ' + p); })(),
      alPie: () => hacer(async () => { await T().quitar(id); aviso2(l.etiqueta + ': bottle cleared'); })()
    });
  }

  // Lo que pasó, en el header, donde se ve aunque la lista esté bajada.
  function aviso2(t) {
    if (window.BarStockToast && window.BarStockToast.show) { try { window.BarStockToast.show(t); } catch (e) {} }
  }

  function hacer(fn) {
    return async () => {
      _error = '';
      try { await fn(); }
      catch (e) {
        _error = 'Not saved: ' + String((e && e.message) || e);
        aviso2(_error);
      }
      S().cerrar();
      pintar();
    };
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
    else if (!T().recetas().length) {
      cuerpo = '<div class="m-tw-p">No recipes for this location yet.</div>';
    } else {
      const lista = T().grupo(_tab);
      const faltan = T().faltan();
      cuerpo = `
        <div class="m-tw-p">Each drink as Toast sells it, and what it takes from the inventory.
          Tap an ingredient to choose its bottle.${faltan ? ` <b class="m-rc-cuenta">${faltan} to choose.</b>` : ''}</div>
        <div class="m-tw-tabs">${PESTANAS.map(([k, n]) =>
          `<button type="button" data-tab="${k}" class="${_tab === k ? 'on' : ''}">${n} · ${T().grupo(k).length}</button>`).join('')}</div>
        ${_error ? `<div class="m-tw-aviso mal">${esc(_error)}</div>` : ''}
        ${lista.map(tarjeta).join('')}`;
    }
    host.innerHTML = (_cab ? _cab() : '') + '<div class="m-tw m-rc">' + cuerpo + '</div>';
    if (_volver) _volver();

    host.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { _tab = b.dataset.tab; _error = ''; pintar(); }; });
    host.querySelectorAll('[data-l]').forEach(b => { b.onclick = () => abrirHoja(Number(b.dataset.l)); });
  }

  function montar(host, cab, volver) {
    if (!T()) return;
    _host = host;
    _tab = 'cocktails';
    _error = '';
    // Sólo repinta si esta vista sigue puesta: al salir a otro panel de
    // Settings el host es el mismo, y repintar ahí pisaría ese panel.
    if (!_quitar) _quitar = T().alCambiar(() => { if (_host && _host.querySelector('.m-rc')) pintar(); });
    pintar(host, cab, volver);
    T().cargar();
  }

  window.BarStockMobileToastRecipes = { montar, pintar };
})();
