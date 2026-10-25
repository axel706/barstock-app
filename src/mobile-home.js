(() => {
  if (window.BarStockMobileHome) return;

  // ── Home del teléfono ────────────────────────────────────────────────
  //
  //   banda        logo centrado, modo claro/oscuro y ajustes
  //   fecha        el día y la locación, que juntos dicen dónde y cuándo
  //   buscar       siempre en el mismo sitio, nunca se mueve
  //   carrusel     lo de ahora mismo, una tarjeta por asunto
  //   top movers   qué se mueve más
  //   despegó/se apagó   qué CAMBIÓ respecto a su propia historia
  //   dinero       gastado esta semana y lo que hay en el estante
  //
  // ── No calcula nada nuevo ────────────────────────────────────────────
  //
  // Todos estos números salen de módulos que ya existen: el gasto de
  // BarStockSpend, el valor del estante de BarStockInventoryValue, el
  // consumo de parAdjustments. Volver a sumarlos aquí sería permitir que
  // dos pantallas dieran cifras distintas del mismo dinero, que es el
  // fallo que más veces ha mordido a este proyecto.
  //
  // ── Y nada dice cero mientras no se sabe ─────────────────────────────
  //
  // Cada hueco arranca en "…" y se rellena cuando su dato llega. Ya nos
  // costó caro tres veces: un historial que no cargaba se leía como
  // "esta es tu primera semana", y así estuvo diecisiete semanas.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const n1 = (n) => String(Math.round((Number(n) || 0) * 10) / 10);

  // Cuatro semanas es el mismo listón que usa Pour-IQ para dejar de
  // "observar". Por debajo, el promedio ponderado y el plano son casi el
  // mismo número y decir que algo "cambió" no significaría nada.
  const SEMANAS_MIN = 4;

  function cfgNombre() {
    return (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '';
  }

  function hoy() {
    return new Date().toLocaleDateString('en-US', { weekday: 'long' });
  }

  function master() { return (window.state && window.state.master) || []; }

  // Todos los artículos con su ficha de par, que es donde viven el
  // consumo ponderado y el histórico.
  function conPar() {
    const m = window.parAdjustments;
    if (!m || !m.size) return [];
    const out = [];
    for (const r of master()) {
      const p = m.get(r.item + '||' + (r.code || ''));
      if (p && p.status === 'active') out.push({ r, p });
    }
    return out;
  }

  // ── El carrusel ──────────────────────────────────────────────────────
  //
  // Una tarjeta por asunto, no una sola que elige. Antes se quedaba con
  // el proveedor de más dinero y escondía los demás en silencio: un
  // lunes con tres proveedores pendientes sólo veías uno.
  //
  // El orden es por urgencia, y lo que tiene fecha límite va primero.

  // ── El ciclo, siempre la primera ─────────────────────────────────────
  //
  // Antes eran dos tarjetas sueltas —conteo a medias y ciclo demasiado
  // viejo— y sólo aparecían cuando pasaba algo. El resto del tiempo, que
  // es casi siempre, el Home no decía en qué estado estaba la semana.
  //
  // Ahora es UNA tarjeta que está siempre y cambia de color y de texto
  // con el estado. El estado se le pregunta a weekly-cycle, igual que
  // hace la pantalla del ciclo: aquí no se deduce nada.
  function tarjetaCiclo() {
    const W = window.BarStockWeeklyCycle;
    const irAlCiclo = () => { if (window.BarStockMobile) window.BarStockMobile.ir('cycle'); };

    const st = (W && W.estado) ? W.estado() : 'loading';

    if (st === 'loading') {
      return { tono: 'calm', k: 'Cycle', tt: '…', sub: 'Checking the cycle',
               amt: '…', vs: '', btn: 'Open cycle', go: irAlCiclo };
    }

    if (st === 'step1') {
      return { tono: 'calm', k: 'No cycle yet', tt: 'Start the week',
               sub: 'Sets on hand to zero so the count starts clean',
               amt: '1', vs: 'of 3', btn: 'Open cycle', go: irAlCiclo };
    }

    const fecha = (W && W.resetAt && W.fmtDate && W.resetAt()) ? W.fmtDate(W.resetAt()) : '';

    if (st === 'step2') {
      return { tono: 'blue', k: 'Cycle open' + (fecha ? ' · ' + fecha : ''),
               tt: 'Load the count', sub: 'From a file, or count with your phone',
               amt: '2', vs: 'of 3', btn: 'Open cycle', go: irAlCiclo };
    }

    if (st === 'counting') {
      const S = window.BarStockCountSession;
      const pr = (S && S.progress) ? S.progress() : null;
      const n = pr ? pr.counted : ((S && S.size) ? S.size() : 0);
      const tot = pr ? pr.total : 0;
      const pct = tot ? Math.round((n / tot) * 100) : 0;

      const pau = !!(W && W.pausado && W.pausado());
      const viejo = !!(W && W.abandonado && W.abandonado());
      const zona = (window.BarStockZones && window.BarStockZones.activas())
        ? window.BarStockZones.paraPasada() : '';

      return {
        tono: viejo ? 'red' : 'amber',
        k: pau ? 'Count paused' : viejo ? 'Count abandoned' : 'Counting',
        tt: tot ? n + ' of ' + tot : String(n),
        sub: viejo ? 'Untouched for three days' : (zona ? 'Last scan in ' + zona : ''),
        barra: pct,
        amt: pct + '%',
        vs: tot ? (tot - n) + ' left' : '',
        btn: viejo ? 'Pick it up' : 'Keep counting',
        go: () => { if (window.BarStockScanCount) window.BarStockScanCount.open(); },

        // El bote. Va aquí y no sólo en la pantalla del ciclo porque es
        // la pareja de "seguir contando": cuando miras un conteo a
        // medias las dos únicas salidas son retomarlo o tirarlo, y
        // tener una a un toque y la otra a dos las desequilibra.
        //
        // Pequeño, sin color y al lado: tirar trabajo nunca debe ser
        // más fácil de pulsar que seguirlo.
        ico2: 'trash',
        ico2t: 'Discard this count',
        go2: () => descartar(n)
      };
    }

    // done
    const ms = (W && W.edadCiclo) ? W.edadCiclo() : null;
    const dias = ms ? Math.floor(ms / 86400000) : 0;
    const viejo = !!(W && W.cicloViejo && W.cicloViejo());

    return {
      tono: viejo ? 'amber' : 'teal',
      k: 'Cycle open',
      tt: fecha ? 'Since ' + fecha : 'Open',
      sub: viejo
        ? 'Usage keeps adding up until you restart'
        : 'Counted ' + master().length + ' items',
      amt: dias + 'd',
      vs: 'usual is 7',
      btn: 'Open cycle',
      go: irAlCiclo
    };
  }

  // El mismo descarte que la pantalla del ciclo: tira el conteo, deja
  // la semana abierta. Y dice el número — "¿descartar el conteo?" no
  // deja decidir nada, "vas a tirar 112 botellas contadas" sí.
  function descartar(n) {
    const ok = window.confirm(
      'Discard this count?\n\n' +
      n + ' bottle' + (n === 1 ? '' : 's') + ' counted so far will be thrown away. ' +
      'This cannot be undone.\n\nThe cycle stays open.');
    if (!ok) return;
    const W = window.BarStockWeeklyCycle;
    if (W && W.descartarConteo) W.descartarConteo();
  }

  function tarjetas() {
    const t = [tarjetaCiclo()];

    // 3 · Ordenes sin colocar, TODAS.
    if (typeof window.getActiveVendors === 'function' &&
        typeof window.getOrderRowsForVendor === 'function' &&
        typeof window.computeOrderSubtotal === 'function') {
      const v = [];
      let total = 0;
      for (const nombre of window.getActiveVendors()) {
        if (nombre === 'UNKNOWN') continue;
        const filas = window.getOrderRowsForVendor(nombre);
        if (!filas.length) continue;
        const sub = window.computeOrderSubtotal(filas);
        total += sub;
        v.push({ nombre, sub });
      }
      if (v.length) {
        v.sort((a, b) => b.sub - a.sub);
        t.push({
          tono: 'blue',
          k: 'Orders waiting',
          tt: v.length + (v.length === 1 ? ' vendor' : ' vendors'),
          lista: v.slice(0, 3).map(x => '<b>' + esc(x.nombre) + '</b> ' + money(x.sub)),
          amt: money(total),
          vs: '',
          btn: v.length === 1 ? 'Review the order' : 'Review orders',
          go: () => { if (window.BarStockMobile) window.BarStockMobile.ir('orders'); }
        });
      }
    }

    // 4 · Se acaba antes que lo demas. Sale de cruzar lo que hay con el
    // consumo ponderado; hasta ahora no estaba en ninguna pantalla.
    const pronto = conPar()
      .map(({ r, p }) => {
        const avg = Number(p.avgUsed) || 0;
        if (avg <= 0 || (p.normalWeeks || 0) < SEMANAS_MIN) return null;
        const dias = Math.round((Number(r.onHand) || 0) / avg * 7);
        return dias <= 7 ? { item: r.item, dias } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.dias - b.dias);

    if (pronto.length) {
      t.push({
        tono: 'red',
        k: 'Running out first',
        tt: pronto.length + (pronto.length === 1 ? ' product' : ' products'),
        lista: pronto.slice(0, 3).map(x =>
          '<b>' + esc(x.item.slice(0, 18)) + '</b> ' + x.dias + (x.dias === 1 ? ' day' : ' days')),
        amt: String(pronto.length),
        vs: 'within a week',
        btn: 'See them',
        go: () => { if (window.BarStockMobile) window.BarStockMobile.ir('inventory'); }
      });
    }

    // Ya no hay tarjeta de "All clear": la del ciclo está siempre, y
    // cuando no hay nada pendiente ella misma es el "todo en orden"
    // —dice desde cuándo está abierto y cuántos artículos se contaron—.
    // Una tarjeta que sólo sirve para decir que no hay tarjetas era un
    // hueco ocupado.

    return t;
  }

  function pintarTarjeta(c, i) {
    return `
      <article class="m-hero m-hero-${c.tono}" data-hero="${i}">
        <div class="m-hero-l">
          <!-- El texto va envuelto para que crezca él y empuje el botón
               al suelo de la tarjeta. Sin esto el botón se pegaba al
               final del texto, y como cada tarjeta tiene un número
               distinto de líneas, los botones quedaban a alturas
               distintas y se veía al deslizar. -->
          <div class="m-hero-txt">
            <div class="m-hero-k">${esc(c.k)}</div>
            <div class="m-hero-t">${esc(c.tt)}</div>
            ${c.barra !== undefined ? `<div class="m-prog"><i style="width:${c.barra}%"></i></div>` : ''}
            ${c.sub ? `<div class="m-hero-s">${esc(c.sub)}</div>` : ''}
            ${c.lista ? `<div class="m-hero-list">${c.lista.map(x => '<span>' + x + '</span>').join('')}</div>` : ''}
          </div>
          <div class="m-hero-acts">
            <button type="button" class="m-hero-b" data-go="${i}">${esc(c.btn)}</button>
            ${c.ico2 ? `<button type="button" class="m-hero-x" data-go2="${i}"
                                aria-label="${esc(c.ico2t || '')}">
                          <i class="ti ti-${esc(c.ico2)}" aria-hidden="true"></i>
                        </button>` : ''}
          </div>
        </div>
        <div class="m-hero-r">
          <div class="m-hero-amt">${esc(c.amt)}</div>
          ${c.vs ? `<div class="m-hero-vs">${esc(c.vs)}</div>` : ''}
        </div>
      </article>`;
  }

  // ── Top movers ───────────────────────────────────────────────────────

  // Cinco y no tres. Tres eran los que cabían con el formato viejo, no
  // los que hacen falta: de 270 productos, tres es una anécdota.
  const CUANTOS_MOVERS = 5;

  function movers() {
    return conPar()
      .map(({ r, p }) => ({
        item: r.item,
        vendor: r.vendor,
        avg: Number(p.avgUsed) || 0,
        // La tendencia contra su PROPIA historia, el mismo par de
        // números que alimenta Took off / Went quiet. Aquí dice algo
        // más útil: que un producto se mueva mucho no es noticia si
        // siempre se movió mucho.
        pct: tendencia(p)
      }))
      .filter(x => x.avg > 0)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, CUANTOS_MOVERS);
  }

  // null = no se sabe todavía. Con menos de SEMANAS_MIN de historia el
  // ponderado y el plano son casi el mismo número, y decir "subió un
  // 4%" ahí sería ruido con aspecto de dato.
  function tendencia(p) {
    if (!p || (p.normalWeeks || 0) < SEMANAS_MIN) return null;
    const hoy_ = Number(p.avgUsed) || 0;
    const antes = Number(p.avgHistorical) || 0;
    if (antes <= 0.2) return null;
    const d = Math.round((hoy_ / antes - 1) * 100);
    return Math.abs(d) < 8 ? 0 : d;   // por debajo de 8% es la misma semana
  }

  // Pastilla con icono y no texto suelto: a 10px una flecha dibujada se
  // lee de un vistazo y un "↑" tipografico se confunde con una comilla.
  function flecha(pct) {
    if (pct === null) return '';
    if (pct === 0) {
      return '<span class="m-tr"><i class="ti ti-minus" aria-hidden="true"></i>steady</span>';
    }
    const arriba = pct > 0;
    return '<span class="m-tr ' + (arriba ? 'up' : 'dn') + '">' +
           '<i class="ti ti-' + (arriba ? 'trending-up' : 'trending-down') + '" aria-hidden="true"></i>' +
           Math.abs(pct) + '%</span>';
  }

  // ── Qué cambió ───────────────────────────────────────────────────────
  //
  // El ponderado contra el histórico plano. Los dos los calcula
  // par-intelligence desde que el promedio del par pasó a ser ponderado:
  // esta pantalla sólo los compara.
  function cambios() {
    const arriba = [], abajo = [];
    for (const { r, p } of conPar()) {
      if ((p.normalWeeks || 0) < SEMANAS_MIN) continue;
      const hoy_ = Number(p.avgUsed) || 0;
      const antes = Number(p.avgHistorical) || 0;
      if (antes <= 0.2 && hoy_ <= 0.2) continue;   // ruido, no cambio

      if (antes > 0.2 && hoy_ >= antes * 1.5) {
        const x = hoy_ / antes;
        arriba.push({ item: r.item, dato: x >= 3 ? Math.round(x) + '×' : '+' + Math.round((x - 1) * 100) + '%', orden: x });
      } else if (antes > 0.5 && hoy_ <= antes * 0.4) {
        abajo.push({ item: r.item, dato: hoy_ < 0.05 ? '0' : n1(hoy_), orden: antes - hoy_ });
      }
    }
    arriba.sort((a, b) => b.orden - a.orden);
    abajo.sort((a, b) => b.orden - a.orden);
    return { arriba: arriba.slice(0, 2), abajo: abajo.slice(0, 2) };
  }

  // ── Dinero ───────────────────────────────────────────────────────────

  function gasto() {
    const S = window.BarStockSpend;
    if (!S || typeof S.compute !== 'function') return null;
    try {
      const d = S.compute();
      if (!d || !d.now) return null;
      // Las dos semanas en cero es la firma de "todavia no se", no de
      // "no gastaste nada".
      if (!d.now.total && !d.prev.total) return null;
      return { total: d.now.total, delta: d.totalDelta };
    } catch (e) { return null; }
  }

  function estante() {
    const V = window.BarStockInventoryValue;
    if (!V || typeof V.compute !== 'function') return null;
    try {
      const d = V.compute();
      if (!d || !d.items) return null;
      if (!d.total && d.noPrice >= d.items) return null;
      return { total: d.total, n: d.items, sin: d.noPrice };
    } catch (e) { return null; }
  }

  // ── Pintar ───────────────────────────────────────────────────────────

  function render(host) {
    if (!host) return;

    const cards = tarjetas();
    const mov = movers();
    const ch = cambios();
    const g = gasto();
    const e = estante();

    host.innerHTML = `
      <div class="m-body">
        <div class="m-daterow">
          <span class="m-day">${esc(hoy())}</span>
          ${pildora()}
        </div>

        <button type="button" class="m-searchbar" id="mhSearch">
          <i class="ti ti-search" aria-hidden="true"></i>
          <span>Do we have…</span>
        </button>
      </div>

      <div class="m-railwrap"><div class="m-rail" id="mhRail">
        ${cards.map(pintarTarjeta).join('')}
      </div></div>
      ${cards.length > 1
        ? `<div class="m-dots" id="mhDots">${cards.map((_, i) =>
            `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>`
        : ''}

      <div class="m-body">
        ${mov.length ? `
          <div class="m-mvcard">
            <div class="m-mvcard-h">
              <span class="m-hero-k"><i class="ti ti-flame" aria-hidden="true"></i> Top movers</span>
              <button type="button" class="m-seclink" id="mhAllMov">
                See all <i class="ti ti-chevron-right" aria-hidden="true"></i>
              </button>
            </div>

            <button type="button" class="m-mv1" data-item="${esc(mov[0].item)}">
              <span class="m-mv1-n">
                <b>${n1(mov[0].avg)}</b><small>btl/wk</small>
                ${flecha(mov[0].pct)}
              </span>
              <span class="m-mv1-t">${esc(mov[0].item)}</span>
              <span class="m-mv1-s">${esc(mov[0].vendor || '')}</span>
            </button>

            ${mov.length > 1 ? `<div class="m-mvcard-rows">
              ${mov.slice(1).map((x, i) => `
                <button type="button" class="m-mvr" data-item="${esc(x.item)}">
                  <span class="m-mvr-i">${i + 2}</span>
                  <span class="m-mvr-t">${esc(x.item)}</span>
                  ${flecha(x.pct)}
                  <b>${n1(x.avg)}</b>
                  <span class="m-mvr-bar" style="width:${
                    Math.round((x.avg / mov[0].avg) * 100)}%"></span>
                </button>`).join('')}
            </div>` : ''}
          </div>` : ''}

        ${(ch.arriba.length || ch.abajo.length) ? `
          <div class="m-cols">
            <div class="m-col m-col-up">
              <div class="m-col-k"><i class="ti ti-trending-up" aria-hidden="true"></i> Took off</div>
              ${ch.arriba.length
                ? ch.arriba.map(x => `<div class="m-col-r"><span>${esc(x.item)}</span><b>${esc(x.dato)}</b></div>`).join('')
                : '<div class="m-col-r m-col-none"><span>Nothing</span><b>—</b></div>'}
            </div>
            <div class="m-col m-col-dn">
              <div class="m-col-k"><i class="ti ti-trending-down" aria-hidden="true"></i> Went quiet</div>
              ${ch.abajo.length
                ? ch.abajo.map(x => `<div class="m-col-r"><span>${esc(x.item)}</span><b>${esc(x.dato)}</b></div>`).join('')
                : '<div class="m-col-r m-col-none"><span>Nothing</span><b>—</b></div>'}
            </div>
          </div>` : ''}

        <div class="m-pair">
          <div class="m-stat">
            <span class="m-stat-k">Spent this week</span>
            <b class="m-stat-v">${g ? money(g.total) : '…'}</b>
            <small class="m-stat-d ${g && g.delta >= 0 ? 'm-up' : 'm-down'}">${
              g ? (g.delta >= 0 ? '↗ +' : '↘ −') + money(Math.abs(g.delta)).slice(1) : '&nbsp;'
            }</small>
          </div>
          <div class="m-stat">
            <span class="m-stat-k">On the shelf</span>
            <b class="m-stat-v">${e ? money(e.total) : '…'}</b>
            <small class="m-stat-d">${e
              ? e.n + ' items' + (e.sin ? ' · ' + e.sin + ' no price' : '')
              : '&nbsp;'}</small>
          </div>
        </div>
      </div>`;

    enganchar(host, cards);
  }

  // ── La píldora de locación ───────────────────────────────────────────
  //
  // Con UNA sola locación no es un botón, es una etiqueta: un control
  // que no hace nada es peor que no tener control.
  //
  // Dos cosas que lo tenían muerto:
  //
  // 1. getAllowedLocations() es ASYNC. Se le estaba preguntando
  //    Array.isArray() a una promesa, que nunca es un array, así que
  //    siempre salía la etiqueta y jamás el botón. Una promesa no se
  //    queja de que la trates como un array — por eso no había error en
  //    consola y parecía "que no servía".
  //
  // 2. Aunque hubiera salido el botón, abría el <select> del encabezado
  //    de escritorio, y ese vive dentro de .wrap, que con body.m-on está
  //    en display:none. Un <select> dentro de algo oculto no se puede
  //    enfocar ni abrir. Por eso aquí la lista se pinta propia.
  //
  // El CAMBIO sí reusa lo de siempre: setActiveLocationName + recargar,
  // exactamente lo que hace el escritorio. Lo que no se duplica es la
  // decisión de qué significa cambiar de locación.

  let _locs = null;       // null = todavia no se sabe; [] = no hay
  let _pidiendo = false;

  function cargarLocs() {
    if (_locs !== null || _pidiendo) return;
    const L = window.BarStockLocationAccess;
    if (!L || !L.getAllowedLocations) { _locs = []; return; }
    _pidiendo = true;
    Promise.resolve()
      .then(() => L.getAllowedLocations())
      .then(l => {
        _locs = Array.isArray(l) ? l : [];
        // Sólo se repinta si cambia algo de lo que se ve: con una sola
        // locación la etiqueta ya estaba bien y repintar movería el
        // carrusel de sitio sin motivo.
        if (_locs.length > 1) refresh();
      })
      .catch(() => { _locs = []; })
      .then(() => { _pidiendo = false; });
  }

  function pildora() {
    const nombre = esc(cfgNombre());
    cargarLocs();

    const varias = Array.isArray(_locs) && _locs.length > 1;
    if (!varias) return `<span class="m-pill m-pill-solo"><i class="m-dot"></i>${nombre}</span>`;

    return `<button type="button" class="m-pill" id="mhLoc">
              <i class="m-dot"></i><span class="m-pill-t">${nombre}</span>
              <i class="ti ti-chevron-down" aria-hidden="true"></i>
            </button>`;
  }

  function abrirLocs() {
    if (!Array.isArray(_locs) || _locs.length < 2) return;
    const activa = cfgNombre();

    const hoja = document.createElement('div');
    hoja.className = 'm-sheet';
    // El id no es decoracion: las reglas de esta hoja se apoyan en el
    // para ganarle en especificidad al radio de app.css. Ver la
    // cabecera de mobile-app.css.
    hoja.id = 'mSheet';
    hoja.innerHTML = `
      <div class="m-sheet-bg"></div>
      <div class="m-sheet-box" role="dialog" aria-label="Choose location">
        <div class="m-sheet-grip"></div>
        <div class="m-sheet-t">Location</div>
        ${_locs.map(l => `
          <button type="button" class="m-sheet-op${l.name === activa ? ' on' : ''}"
                  data-loc="${esc(l.name)}">
            <span>${esc(l.name)}</span>
            ${l.name === activa ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}
          </button>`).join('')}
      </div>`;
    document.body.appendChild(hoja);

    const cerrar = () => hoja.remove();
    hoja.querySelector('.m-sheet-bg').onclick = cerrar;

    hoja.querySelectorAll('.m-sheet-op').forEach(b => {
      b.onclick = () => {
        const n = b.dataset.loc;
        if (n === activa) return cerrar();
        const L = window.BarStockLocationAccess;
        if (!L || !L.setActiveLocationName) return cerrar();
        L.setActiveLocationName(n);
        // Recargar y no repintar: media app lleva la locación metida en
        // sus consultas y su caché. Es lo mismo que hace el escritorio.
        window.location.reload();
      };
    });
  }

  function enganchar(host, cards) {
    // El logo y los dos botones ya no viven aquí: son del armazón, para
    // que estén también en Buscar y en las secciones del escritorio.

    const loc = host.querySelector('#mhLoc');
    if (loc) loc.onclick = abrirLocs;

    const bus = host.querySelector('#mhSearch');
    if (bus) bus.onclick = () => window.BarStockMobile.ir('search');

    host.querySelectorAll('[data-go]').forEach(b => {
      const c = cards[Number(b.dataset.go)];
      if (c && c.go) b.onclick = (ev) => { ev.stopPropagation(); c.go(); };
    });

    host.querySelectorAll('[data-go2]').forEach(b => {
      const c = cards[Number(b.dataset.go2)];
      if (c && c.go2) b.onclick = (ev) => { ev.stopPropagation(); c.go2(); };
    });

    host.querySelectorAll('[data-item]').forEach(b => {
      b.onclick = () => {
        if (window.BarStockMobileSearch && window.BarStockMobileSearch.abrirItem) {
          window.BarStockMobileSearch.abrirItem(b.dataset.item);
        }
      };
    });

    const all = host.querySelector('#mhAllMov');
    if (all) all.onclick = () => window.BarStockMobile.ir('inventory');

    puntos(host);
  }

  // Los puntos siguen al dedo. Es la unica confirmacion de cuantas
  // tarjetas hay y en cual estas; sin ellos, el asomo de la siguiente
  // dice que hay mas pero no cuantas.
  function puntos(host) {
    const rail = host.querySelector('#mhRail');
    const dots = host.querySelector('#mhDots');
    if (!rail || !dots) return;
    rail.addEventListener('scroll', () => {
      const hijos = Array.from(rail.children);
      if (!hijos.length) return;
      const centro = rail.scrollLeft + rail.clientWidth / 2;
      let mejor = 0, dist = Infinity;
      hijos.forEach((c, i) => {
        const d = Math.abs((c.offsetLeft + c.offsetWidth / 2) - centro);
        if (d < dist) { dist = d; mejor = i; }
      });
      Array.from(dots.children).forEach((d, i) => d.classList.toggle('on', i === mejor));
    }, { passive: true });
  }

  // Lo llama quien termina de cargar datos: el Home se pinta antes de
  // que lleguen el inventario y las ordenes, y sin esto se queda con los
  // huecos puestos hasta que cambias de pestaña y vuelves.
  function refresh() {
    const host = document.querySelector('.m-screen[data-screen="home"]');
    if (host && host.classList.contains('on')) render(host);
  }

  // ── Esperar a que lleguen los datos ──────────────────────────────────
  //
  // Esto apareció al arreglar la entrada por Home. Antes el Home no se
  // pintaba hasta que tocabas la casa, y para entonces ya había cargado
  // todo; ahora se pinta al arrancar, con el inventario y Pour·IQ aún en
  // camino, y se quedaba con media pantalla hasta que la tocabas.
  //
  // Se vigila una FIRMA de lo que el Home necesita en vez de engancharse
  // a un evento. No hay ninguno que diga "ya está todo": los que hay son
  // de cambios en vivo, y la carga inicial pasa por varios caminos
  // asíncronos distintos. Engancharse a uno sería arreglar el camino que
  // probé hoy y dejar rotos los otros.
  //
  // Se apaga solo: en cuanto la firma se queda quieta un rato, o a los
  // VIGILA_MAX, deja de mirar. Un intervalo eterno en el móvil es
  // batería que se va sin que nadie lo pida.

  const VIGILA_CADA = 400;
  const VIGILA_MAX = 25000;
  const QUIETO_BASTA = 6;        // 6 vueltas sin cambio = ya cargó

  let _reloj = null, _firma = null, _quieto = 0, _desde = 0;

  function firma() {
    const m = (window.state && window.state.master) || [];
    const p = window.parAdjustments;
    const g = gasto(), v = estante();
    const S = window.BarStockCountSession;
    let c = '-';
    try {
      if (S && S.exists && S.exists()) {
        c = (S.size ? S.size() : 0) + (S.isPaused && S.isPaused() ? 'p' : '');
      }
    } catch (e) {}
    return [
      m.length,
      p && p.size ? p.size : 0,
      g ? g.total : '-',
      v ? v.total : '-',
      c
    ].join('|');
  }

  function vigilar() {
    if (_reloj) return;
    _firma = firma(); _quieto = 0; _desde = Date.now();
    _reloj = setInterval(() => {
      const f = firma();
      if (f !== _firma) { _firma = f; _quieto = 0; refresh(); }
      else _quieto++;
      if (_quieto >= QUIETO_BASTA || Date.now() - _desde > VIGILA_MAX) {
        clearInterval(_reloj); _reloj = null;
      }
    }, VIGILA_CADA);
  }

  window.BarStockMobileHome = { render, refresh };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      id: 'home', icon: 'ti-home', label: 'Home', tab: true, orden: 10,
      mount(host) { render(host); vigilar(); },
      show(host) { render(host); vigilar(); }   // el estado del ciclo cambia
    });

    // Y lo que cambie en vivo despues, por su evento de siempre.
    const E = window.BarStockEvents;
    if (E && E.on) {
      E.on('inventoryUpdated', refresh);
      E.on('ordersUpdated', refresh);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
