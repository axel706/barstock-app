(() => {
  if (window.BarStockDeskHome) return;

  // ── El Home del escritorio (Axel, 2026-11-25, lámina H1) ─────────────
  //
  // El saludo no va aquí: vive en la barra de arriba (desk-shell.js),
  // en todas las pantallas.
  //
  // "Lo de ahora primero", con las cuatro cifras como PRIMERA fila (Axel
  // lo corrigió sobre la lámina): On the shelf, Sold, Spent this cycle y
  // Live vs count. Debajo, ancha, la tarjeta que la semana pone primero
  // (la regla de home-orden: el conteo, las órdenes o Running out) con el
  // transfer por confirmar al lado; después las demás tarjetas y las
  // ventas de Toast; y al final los reportes de la portada de antes.
  //
  // Los DATOS son los del Home del teléfono (BarStockMobileHome.datos():
  // las mismas tarjetas, las mismas cifras ya decididas); aquí sólo se
  // pinta. Dos Homes calculando por su lado acabarían diciendo cosas
  // distintas del mismo bar, que es el fallo que más ha mordido aquí.
  //
  // Lo que el escritorio aún no tiene no se ofrece: un botón que lleva a
  // una pantalla que no existe es una afordancia que miente. Por eso:
  //   · Running out sale sin "See them" ni "To buy" (la revisión y la
  //     lista son la sección Running out, que llega en su paso).
  //   · "Choose yours" / "Change" de un transfer (abren el buscador del
  //     teléfono) no salen: se dice que se elige en el teléfono.
  //   · El icono de "Cycle detail" (la pantalla del ciclo) no sale.
  //   · Spent this cycle va sin botón (su hoja es del teléfono).
  // Cuando cada cosa exista aquí, su botón vuelve.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-US');

  let _host = null, _cards = [], _diag = undefined, _pidiendoDiag = false;

  function MH() { return window.BarStockMobileHome; }

  // Se ve sólo en el armazón del escritorio y sin sección abierta.
  function visible() {
    const wrap = document.querySelector('.wrap');
    return !!(_host && document.body.classList.contains('dk') && wrap &&
      !wrap.classList.contains('bs-focus-mode') && window.innerWidth > 640);
  }

  // ── Live vs count: el último ciclo cerrado ──────────────────────────
  //
  // Lo dice live-diagnostico (la misma lectura del correo del lunes y de
  // Finish count): lo que se alejó del LIVE, en dinero, por debajo y por
  // encima. Se lee una vez por pintado de la app; el ciclo cerrado no
  // cambia en el día.
  function leerDiag() {
    const LD = window.BarStockLiveDiag;
    if (_pidiendoDiag || _diag !== undefined || !LD || !LD.semana) return;
    _pidiendoDiag = true;
    const desde = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
    LD.semana(desde)
      .then(d => { _diag = d || { hay: false }; })
      .catch(e => { _diag = { error: String((e && e.message) || e) }; })
      .then(() => { _pidiendoDiag = false; pintar(); });
  }

  function cifraDiag() {
    const d = _diag;
    if (d === undefined) return { id: 'diag', k: 'Live vs count', v: '<span class="dkh-esq"></span>', d: 'Loading', s: '' };
    // Un fallo se dice con lo que pasó, no se disfraza de "nada".
    if (d.error) return { id: 'diag', k: 'Live vs count', v: '—', d: 'Could not read: ' + esc(d.error), tono: 'am' };
    if (!d.hay) return { id: 'diag', k: 'Live vs count', v: '—', d: 'No closed cycle yet' };
    if (d.invalido) return { id: 'diag', k: 'Live vs count', v: '—', d: 'Last cycle too short to compare' };
    const fin = d.fin ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
      .format(new Date(d.fin + 'T12:00:00Z')) : '';
    if (!d.total) return { id: 'diag', k: 'Live vs count', s: 'cycle to ' + esc(fin), v: '$0', d: 'Everything close to Live' };
    return {
      id: 'diag', k: 'Live vs count', s: 'cycle to ' + esc(fin) + (d.provisional ? ' · provisional' : ''),
      tono: d.corto > 0 ? 'am' : '',
      v: (d.corto > 0 ? '−' + money(d.corto) : '+' + money(d.sobra)),
      d: d.total + (d.total === 1 ? ' far off' : ' far off') +
        (d.corto > 0 && d.sobra > 0 ? ' · +' + money(d.sobra) + ' more' : '')
    };
  }

  // ── Spent this cycle (Axel, 2026-11-25, lámina "Spent this cycle", A) ──
  //
  // Como en el teléfono: UN botón. Sync, o Review en ámbar con algo que
  // arreglar, o "MarginEdge" sin conectar. Mientras sincroniza, la barra
  // de avance y "3 of 12 invoices…" con el botón girando y apagado; si
  // falla, ámbar, "Sync failed", lo que dijo y Retry. El Sync es el del
  // teléfono (mobile-home.sincronizarGasto): el avance y el error llegan
  // como dato por alSync, y sólo se repinta esta cifra.
  let _oGasto = null;
  function htmlGasto(o) {
    const M = MH();
    const G = M && M.estadoGasto ? M.estadoGasto() : null;
    const cargando = /m-cf-esq/.test(String(o.v));
    let tono = o.tono || '', s = o.s || '', sTono = o.sTono || '', d = o.d, btn = '', que = '', barra = '';
    if (G && G.sincronizando) {
      const a = G.avance || {};
      d = !a.pedidos ? 'Looking for invoices…'
        : a.hechos ? a.hechos + ' of ' + a.pedidos + ' invoices…'
        : a.pedidos + (a.pedidos === 1 ? ' invoice found…' : ' invoices found…');
      const parte = a.pedidos ? Math.max(4, Math.min(100, (a.hechos || 0) / a.pedidos * 100)) : 0;
      barra = `<span class="dkh-gbar${a.pedidos ? '' : ' sin'}"><i style="width:${parte.toFixed(0)}%"></i></span>`;
      btn = '<span class="dkh-gira"></span> Syncing';
      que = 'nada';
    } else if (G && G.error) {
      // "Sync failed" va al principio de la línea, no en la cabecera: ahí,
      // junto al logo y el título, se cortaba en "Sy…". Y la línea puede
      // ocupar dos renglones: lo que dijo MarginEdge se lee entero.
      tono = 'err';
      d = '<b class="m-cf-err">Sync failed</b> · ' + esc(G.error);
      btn = '<i class="ti ti-refresh" aria-hidden="true"></i> Retry'; que = 'sync';
    } else if (cargando) {
      que = '';
    } else if (o.btn === 'Review') {
      btn = 'Review'; que = 'review';
    } else if (o.btn === 'MarginEdge') {
      btn = 'MarginEdge'; que = 'conectar';
    } else {
      d = o.d + (G && G.hace ? ' · synced ' + esc(G.hace) : '');
      btn = '<i class="ti ti-refresh" aria-hidden="true"></i> Sync'; que = 'sync';
    }
    return `
      <div class="dkh-cf dkh-gasto${tono ? ' dkh-' + esc(tono) : ''}" data-cifra="gasto">
        <div class="dkh-cf-k"><span>${o.logo || ''}${o.k}</span>${s ? `<i class="${esc(sTono)}">${s}</i>` : ''}</div>
        <b class="dkh-cf-v">${o.v}</b>
        ${barra}
        <div class="dkh-cf-d"><span>${d}</span>${btn ? `<button type="button" class="dkh-cf-b${que === 'review' ? ' dkh-am' : ''}" data-gasto="${que}"${que === 'nada' ? ' disabled' : ''}>${btn}</button>` : ''}</div>
      </div>`;
  }

  // El avance del Sync repinta SÓLO esta cifra (y la ventana, si está
  // abierta): rehacer el Home entero en cada tanda de facturas es mucho.
  function pintarGasto() {
    if (_oGasto && _host) {
      const viejo = _host.querySelector('[data-cifra="gasto"]');
      if (viejo) {
        const t = document.createElement('div');
        t.innerHTML = htmlGasto(_oGasto).trim();
        viejo.replaceWith(t.firstElementChild);
        engancharGasto();
      }
    }
    if (_ventana) pintarVentana();
  }

  function sincronizar() {
    const M = MH();
    if (M && M.sincronizarGasto) M.sincronizarGasto();
  }

  // A Settings, al panel que se pide: 'meMatch' (Match products, las
  // líneas sin botella), 'mePurchases' (What came in, con su "Update N
  // prices") o 'integrations' (la conexión de MarginEdge).
  function irAjustes(panel) {
    cerrarVentana();
    if (typeof window.openSettingsModal === 'function') window.openSettingsModal();
    if (typeof window.showSettingsPanel === 'function') window.showSettingsPanel(panel);
  }

  function engancharGasto() {
    const b = _host && _host.querySelector('[data-gasto]');
    if (!b) return;
    const que = b.dataset.gasto;
    b.onclick = () => {
      if (que === 'sync') sincronizar();
      else if (que === 'review') abrirVentana();
      else if (que === 'conectar') irAjustes('integrations');
    };
  }

  // ── La ventana de Review: lo de la hoja del teléfono ────────────────
  let _ventana = null;
  function abrirVentana() {
    cerrarVentana();
    _vista = 'resumen';
    _ventana = document.createElement('div');
    _ventana.id = 'dkGasto';
    _ventana.innerHTML = '<div class="dkg-bg"></div><div class="dkg-box" role="dialog" aria-modal="true" aria-label="Spent this cycle"></div>';
    document.body.appendChild(_ventana);
    _ventana.querySelector('.dkg-bg').onclick = cerrarVentana;
    document.addEventListener('keydown', alTeclado);
    pintarVentana();
  }
  function cerrarVentana() {
    if (!_ventana) return;
    _ventana.remove();
    _ventana = null;
    document.removeEventListener('keydown', alTeclado);
  }
  function alTeclado(ev) { if (ev.key === 'Escape') cerrarVentana(); }
  // ── Review prices, DENTRO de la ventana (Axel, 2026-11-25) ──────────
  //
  // La primera versión mandaba a Settings › What came in, y Axel lo
  // notó: "review > review prices me lleva a settings". El teléfono
  // nunca lo hizo (mobile-notif.pintarPrecios: "mandar a alguien allí
  // desde una notificación es perderlo. Aquí se ve la lista, se aprueba,
  // y se acabó"). Aquí igual: la lista de lo que cambió, cada producto
  // con su precio de antes y el de su última factura, y "Update N
  // prices". La cuenta y el guardado son los de marginedge-purchases
  // (calcularPrecios, aplicarPrecios): los mismos que usan la campana y
  // What came in.
  let _vista = 'resumen';         // 'resumen' | 'precios'
  let _precios = null;            // null = leyendo · { cambios } · { error }
  let _aplicando = null;          // null · { n, tot } · { hecho, ok, problemas } · { error }

  async function verPrecios() {
    _vista = 'precios'; _precios = null; _aplicando = null;
    pintarVentana();
    const P = window.BarStockMarginEdgePurchases;
    try {
      if (!P || !P.calcularPrecios) throw new Error('Prices are not loaded.');
      const r = await P.calcularPrecios();
      _precios = { cambios: (r && r.cambios) || [] };
    } catch (e) { _precios = { error: String((e && e.message) || e) }; }
    pintarVentana();
  }

  async function actualizarPrecios() {
    const P = window.BarStockMarginEdgePurchases;
    const cambios = (_precios && _precios.cambios) || [];
    if (!P || !P.aplicarPrecios || !cambios.length || (_aplicando && !_aplicando.error && !_aplicando.hecho)) return;
    _aplicando = { n: 0, tot: cambios.length };
    pintarVentana();
    try {
      const r = await P.aplicarPrecios(cambios, (n, tot) => { _aplicando = { n, tot }; pintarVentana(); });
      _aplicando = { hecho: true, ok: r.ok || 0, problemas: (r.problemas || []).length };
      pintarVentana();
      // El catálogo se relee ANTES de volver a contar los precios: la
      // cuenta compara cada factura con el catálogo en memoria y, sin
      // releerlo, volvería a decir que cambiaron los que se acaban de
      // actualizar (lo mismo que hace la campana del teléfono).
      const RT = window.BarStockInventoryRealtime;
      if (RT && RT.recargar) { try { await RT.recargar(); } catch (e) { console.warn('[desk-home] no se pudo releer el catálogo', e); } }
      const M = MH();
      if (M && M.releerPrecios) M.releerPrecios();
    } catch (e) {
      _aplicando = { error: String((e && e.message) || e) };
      pintarVentana();
    }
  }

  function htmlPrecios() {
    const dinero = (n) => '$' + (Number(n) || 0).toFixed(2);
    const pct = (c) => c.antes ? Math.round(((c.precio - c.antes) / c.antes) * 100) : 0;
    const A = _aplicando;
    const cab = `
      <button type="button" class="dkg-x" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button>
      <h3><button type="button" class="dkg-atras" data-accion="atras" aria-label="Back"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>${
        _precios && _precios.cambios ? _precios.cambios.length + (_precios.cambios.length === 1 ? ' price changed' : ' prices changed') : 'Prices'}</h3>`;
    if (!_precios) return cab + '<p class="dkg-s">Reading the latest invoice of each item…</p>';
    if (_precios.error) return cab + `<div class="dkg-r dkg-am"><span>Could not read prices: ${esc(_precios.error)}</span></div>`;
    if (A && A.hecho) {
      return cab + `<div class="dkg-ok"><i class="ti ti-circle-check" aria-hidden="true"></i>${A.ok} price${A.ok === 1 ? '' : 's'} updated.${
        A.problemas ? `<br>${A.problemas} could not be saved.` : ''}</div>
        <div class="dkg-bs"><button type="button" class="dkg-b" data-accion="atras">Done</button></div>`;
    }
    const cambios = _precios.cambios;
    if (!cambios.length) return cab + '<p class="dkg-s">Every price already matches its latest invoice.</p>';
    const corriendo = A && !A.error && !A.hecho;
    return cab + `
      <p class="dkg-s">From the latest invoice of each item</p>
      ${A && A.error ? `<div class="dkg-r dkg-am"><span>${esc(A.error)}</span></div>` : ''}
      <div class="dkg-lista">${cambios.map(c => `
        <div class="dkg-pr">
          <span class="dkg-pr-n"><b>${esc(c.item)}</b><small>${esc(c.vendor || '')}${c.factura ? ' · invoice ' + esc(c.factura) : ''}${c.fecha ? ' · ' + esc(c.fecha) : ''}</small></span>
          <span class="dkg-pr-v ${c.precio > c.antes ? 'up' : 'dn'}">${dinero(c.antes)} → <b>${dinero(c.precio)}</b><small>${pct(c) > 0 ? '+' : ''}${pct(c)}%</small></span>
        </div>`).join('')}</div>
      <div class="dkg-bs">
        <button type="button" class="dkg-b dkg-am" data-accion="actualizar"${corriendo ? ' disabled' : ''}>${
          corriendo ? 'Updating… ' + A.n + ' of ' + A.tot : 'Update ' + cambios.length + (cambios.length === 1 ? ' price' : ' prices')}</button>
      </div>
      <p class="dkg-s">Only these change. Everything else keeps the price you typed — nothing is cleared.</p>`;
  }

  function pintarVentana() {
    const M = MH();
    if (!_ventana || !M) return;
    if (_vista === 'precios') {
      const caja = _ventana.querySelector('.dkg-box');
      caja.innerHTML = htmlPrecios();
      caja.querySelector('.dkg-x').onclick = cerrarVentana;
      caja.querySelectorAll('[data-accion="atras"]').forEach(b => { b.onclick = () => { _vista = 'resumen'; pintarVentana(); }; });
      const up = caja.querySelector('[data-accion="actualizar"]');
      if (up) up.onclick = actualizarPrecios;
      return;
    }
    const G = M.estadoGasto ? M.estadoGasto() : {};
    const fg = M.filasGasto ? M.filasGasto() : { conectada: true, filas: [] };
    const a = G.avance || {};
    const sub = G.sincronizando
      ? (!a.pedidos ? 'Looking for invoices…' : a.hechos ? a.hechos + ' of ' + a.pedidos + ' invoices…' : a.pedidos + ' invoices found…')
      : (G.hace ? 'synced ' + G.hace : 'never synced');
    const filas = fg.filas.map(f => {
      const ir = f.que === 'fix' ? 'meMatch' : f.que === 'precios' ? 'precios' : '';
      const der = f.que === 'fix' ? 'Fix ›' : f.que === 'precios' ? 'Review ›' : (f.v || '');
      return ir
        ? `<button type="button" class="dkg-r dkg-am" data-ir="${ir}"><span>${esc(f.t)}</span><b>${esc(der)}</b></button>`
        : `<div class="dkg-r${f.am ? ' dkg-am' : ''}"><span>${esc(f.t)}</span>${der ? `<b>${esc(der)}</b>` : ''}</div>`;
    }).join('');
    const precios = (G.precios || 0) > 0;
    _ventana.querySelector('.dkg-box').innerHTML = `
      <button type="button" class="dkg-x" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button>
      <h3>Spent this cycle${G.total ? ' · ' + money(G.total) : ''}</h3>
      <p class="dkg-s">${G.desde ? 'Since ' + esc(G.desde) + ' · ' : ''}MarginEdge · ${esc(sub)}</p>
      ${G.error && !G.sincronizando ? `<div class="dkg-r dkg-am"><span>Last sync failed: ${esc(G.error)}</span></div>` : ''}
      ${filas}
      <div class="dkg-bs">
        ${fg.conectada ? `<button type="button" class="dkg-b" data-accion="sync"${G.sincronizando ? ' disabled' : ''}>${G.sincronizando ? '<span class="dkh-gira"></span> Syncing' : '<i class="ti ti-refresh" aria-hidden="true"></i> Sync now'}</button>` : ''}
        <button type="button" class="dkg-b${precios ? ' dkg-am' : ''}" data-ir="${!fg.conectada ? 'integrations' : precios ? 'precios' : 'mePurchases'}">${!fg.conectada ? 'Connect MarginEdge' : precios ? 'Review prices' : 'What came in'}</button>
      </div>`;
    const caja = _ventana.querySelector('.dkg-box');
    caja.querySelector('.dkg-x').onclick = cerrarVentana;
    const sy = caja.querySelector('[data-accion="sync"]');
    if (sy) sy.onclick = sincronizar;
    caja.querySelectorAll('[data-ir]').forEach(b => {
      b.onclick = () => b.dataset.ir === 'precios' ? verPrecios() : irAjustes(b.dataset.ir);
    });
  }

  function htmlCifra(o) {
    if (o.id === 'gasto') { _oGasto = o; return htmlGasto(o); }
    const btn = o.id === 'estante' ? 'Details' : o.id === 'ayer' ? o.btn : '';
    return `
      <div class="dkh-cf${o.tono ? ' dkh-' + esc(o.tono) : ''}">
        <div class="dkh-cf-k"><span>${o.logo || ''}${o.k}</span>${o.s ? `<i class="${o.sTono ? esc(o.sTono) : ''}">${o.s}</i>` : ''}</div>
        <b class="dkh-cf-v">${o.v}</b>
        <div class="dkh-cf-d"><span>${o.d}</span>${btn ? `<button type="button" class="dkh-cf-b" data-cf="${esc(o.id)}"${o.off ? ' disabled' : ''}>${btn}</button>` : ''}</div>
      </div>`;
  }

  // ── Una tarjeta, de los datos de siempre ─────────────────────────────
  function botones(c, i) {
    const bs = [];
    const elegir = c.transfer && /^Choose yours$/.test(c.btn || '');
    if (c.btn && c.fase !== 'agota' && !elegir) bs.push(`<button type="button" class="dkh-b dkh-b1" data-go="${i}">${esc(c.btn)}</button>`);
    if (c.btn2 && c.fase !== 'agota') bs.push(`<button type="button" class="dkh-b" data-go2="${i}">${esc(c.btn2)}</button>`);
    if (c.btn3 && !c.transfer) bs.push(`<button type="button" class="dkh-b" data-gob3="${i}">${esc(c.btn3)}</button>`);
    const nota = elegir ? '<span class="dkh-nota">Choose your product on your phone</span>' : '';
    return (bs.length || nota || c.vs) ? `<div class="dkh-acts">${c.vs ? `<span class="dkh-vs">${esc(c.vs)}</span>` : ''}${nota}${bs.join('')}</div>` : '';
  }

  function cuerpo(c, i) {
    const partes = [];
    if (c.sub) partes.push(`<p class="dkh-sub">${esc(c.sub)}</p>`);
    if (c.lista) partes.push(`<div class="dkh-lista">${c.lista.map(x => '<span>' + x + '</span>').join('')}</div>`);
    // La línea del ciclo trae <em> armado con números por mobile-home.
    if (c.linea) partes.push(`<ul class="dkh-linea">${c.linea.map(x =>
      `<li class="${x.hoy ? 'hoy' : ''}"><u>${esc(x.d)}</u><p>${x.t}</p></li>`).join('')}</ul>`);
    if (c.filas) partes.push(`<div class="dkh-filas">${c.filas.map(x => `
      <div class="dkh-fila"><span class="izq">${x.q ? `<b>${esc(x.q)}</b>` : ''}${esc(x.n)}</span>
        <span class="der">${x.tag ? esc(x.tag) + ' ' : ''}${x.out ? `<em class="dkh-out-${esc(x.out.tono)}">${esc(x.out.txt)}</em>` : ''}${x.v ? esc(x.v) : ''}</span></div>`).join('')}</div>`);
    if (c.prov) partes.push(`<div class="dkh-filas">${c.prov.map((x, k) => `
      <button type="button" class="dkh-fila dkh-pv" data-pv="${i}-${k}"><span class="izq">${esc(x.nombre)}</span><span class="der">${esc(x.d)} ›</span></button>`).join('')}</div>`);
    if (c.mas) partes.push(`<p class="dkh-mas">${esc(c.mas)}</p>`);
    return partes.join('');
  }

  function tarjeta(c, i, clase) {
    const amt = c.amt ? `<div class="dkh-amt">${esc(c.amt)}${c.amtPie ? `<small>${esc(c.amtPie)}</small>` : ''}</div>` : '';
    return `
      <article class="dkh-card dkh-${esc(c.tono || 'calm')} ${clase || ''}">
        <div class="dkh-k"><span>${c.kHtml ? c.k : esc(c.k)}</span>${c.kr ? `<i>${esc(c.kr)}</i>` : ''}</div>
        <div class="dkh-top">
          <div class="dkh-txt">
            <h3>${esc(c.tt)}${c.ttU ? ` <small>${esc(c.ttU)}</small>` : ''}</h3>
            ${cuerpo(c, i)}
          </div>
          ${amt}
        </div>
        ${botones(c, i)}
      </article>`;
  }

  // ── Running out, ancha: las botellas del teléfono, con su número ────
  //
  // Axel, 2026-11-25, lámina A: "el estilo debería ser más similar al del
  // teléfono, siluetas, pero al tener espacio podemos seguir incluyendo
  // el estimado de cuánto hay en número". La misma lista de la tarjeta del
  // teléfono (running-out.js) y la misma silueta (home-cartas.silueta, la
  // del conteo: formaDe), llena contra su par como en el teléfono; debajo,
  // el número, el día y cuánto pedir, y el nombre. Hasta seis.
  function tarjetaAgota(c, i) {
    const RO = window.BarStockRunningOut;
    const LC = window.BarStockLiveCache;
    const HC = window.BarStockHomeCartas;
    const BP = window.BarStockBottleProfiles;
    const lista = RO ? RO.lista() : [];
    const r1 = (v) => String(Math.round(v * 10) / 10);
    const cols = lista.slice(0, 6).map((x, k) => {
      const par = Number(x.r && x.r.suggested) || 0;
      const hay = LC && LC.cuanto ? LC.cuanto(x.r) : (Number(x.r && x.r.onHand) || 0);
      const lleno = par > 0 ? Math.max(0, Math.min(1, hay / par)) : 0;
      const n = LC && LC.pedir ? LC.pedir(x.r) : null;
      // El color del líquido dice lo mismo que el número: vacía (borde
      // rojo), poca (roja, menos de un tercio del par) o lo demás (ámbar).
      const tono = hay <= 0 ? 'cero' : lleno < 1 / 3 ? 'bajo' : 'medio';
      const sil = HC && HC.silueta && BP && BP.formaDe ? HC.silueta(BP.formaDe(x.r), lleno, 'dkhRo' + k) : '';
      return `
        <div class="dkh-ro dkh-ro-${tono}">
          ${sil}
          <span class="dkh-ro-v">${x.vivo ? '≈' : ''}${r1(hay)}<small>/${r1(par)}</small></span>
          <span class="dkh-ro-d"><em class="dkh-out-${esc((x.out && x.out.tono) || 'a')}">${esc((x.out && x.out.txt) || '')}</em>${n > 0 ? ' · Order ' + esc(n) : n === 0 ? ' · Covered' : ''}</span>
          <b class="dkh-ro-n" title="${esc(x.item)}">${esc(x.item)}</b>
        </div>`;
    }).join('');
    const mas = lista.length > 6 ? `<span class="dkh-vs">and ${lista.length - 6} more</span>` : '';
    // "See all" abre la sección Running out (desk-running-out.js): toda la
    // lista con sus acciones. Sólo con la sección montada.
    const todo = lista.length && document.getElementById('runningOutSection')
      ? `<button type="button" class="dkh-b dkh-b1" data-ro-todo>See all ${lista.length} ›</button>` : '';
    return `
      <article class="dkh-card dkh-red dkh-agota dkh-hero">
        <div class="dkh-k"><span>${c.kHtml ? c.k : esc(c.k)}</span>${c.kr ? `<i>${esc(c.kr)}</i>` : ''}</div>
        <h3>${esc(c.tt)}</h3>
        <div class="dkh-ros">${cols}</div>
        ${mas || todo ? `<div class="dkh-acts">${mas}${todo}</div>` : ''}
      </article>`;
  }

  // ── Las ventas de Toast: la semana de lunes a domingo ───────────────
  function tarjetaVentas(V) {
    const TS = window.BarStockToastSales;
    if (!V || !V.cargados || !TS || !TS.semanaCal) return '';
    const W = TS.semanaCal(V, 0);
    if (!W) return '';
    const dias = W.dias;
    const tope = Math.max(1e-9, ...dias.map(x => Math.max(Number(x.dinero) || 0, Number(x.normalDinero) || 0)));
    const top = TS.masVendido(V.base, W.fechas, 'dinero').slice(0, 3);
    const barras = dias.map(x => `
      <div class="dkh-vt${x.esHoy ? ' hoy' : ''}${x.futuro ? ' fut' : ''}">
        <span class="dkh-vt-b"><i style="height:${Math.max(0, Math.min(100, (Number(x.dinero) || 0) / tope * 100)).toFixed(1)}%"></i>${x.normalDinero ? `<s style="bottom:${Math.min(100, x.normalDinero / tope * 100).toFixed(1)}%"></s>` : ''}</span>
        <u>${esc(String(x.dia || '').slice(0, 3))}</u>
      </div>`).join('');
    return `
      <article class="dkh-card dkh-ventas">
        <div class="dkh-k"><span>Sales · Toast</span><i>${esc(W.etiqueta || '')}</i></div>
        <h3>${money(W.total && W.total.dinero)}<small>${W.total && W.total.parcial ? 'so far this week' : 'this week'}</small></h3>
        <div class="dkh-vts">${barras}</div>
        ${top.length ? `<p class="dkh-sub">Most sold: ${top.map(x => esc(x.nombre)).join(' · ')}</p>` : ''}
      </article>`;
  }

  // ── Los reportes de la portada de antes ────────────────────────────
  //
  // Sus cifras las escribe focus-stats.js por id (#fgSub-…, #fgStats-…),
  // con el botón "Report last week" de Costs. No se copian: se MUEVEN
  // esos mismos elementos aquí, una vez, y focus-stats sigue
  // escribiéndolos donde estén.
  const REPORTES = [
    { sec: 'pourIq', t: 'Pour·IQ' },
    { sec: 'costReport', t: 'Costs' },
    { sec: 'consumption', t: 'Variance' },
    { sec: 'noMatch', t: 'Unmatched' }
  ];
  function reportes() {
    return `<div class="dkh-reps">${REPORTES.map(x => `
      <div class="dkh-card dkh-rep" data-sec="${x.sec}" role="button" tabindex="0">
        <div class="dkh-k"><span>${esc(x.t)}</span><i>Open ›</i></div>
        <div class="dkh-rep-c" data-rep="${x.sec}"></div>
      </div>`).join('')}</div>`;
  }
  function moverReportes() {
    REPORTES.forEach(x => {
      const caja = _host.querySelector(`[data-rep="${x.sec}"]`);
      if (!caja) return;
      ['fgSub-' + x.sec, 'fgStats-' + x.sec].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.parentElement !== caja) caja.appendChild(el);
      });
    });
  }

  function pintar() {
    if (!visible()) return;
    const M = MH();
    if (!M || !M.datos) return;
    leerDiag();
    let d;
    try { d = M.datos(); } catch (e) { console.warn('[desk-home] datos', e); return; }
    _cards = d.tarjetas || [];

    // Los elementos de los reportes se apartan antes de reescribir y
    // vuelven después: son de focus-stats y no se pueden perder.
    const aparte = document.createDocumentFragment();
    REPORTES.forEach(x => ['fgSub-' + x.sec, 'fgStats-' + x.sec].forEach(id => {
      const el = document.getElementById(id);
      if (el && _host.contains(el)) aparte.appendChild(el);
    }));

    const cifras = (d.cifras || []).slice();
    cifras.push(cifraDiag());

    const iTr = _cards.findIndex(c => c && c.transfer);
    const resto = _cards.map((c, i) => ({ c, i })).filter(x => x.c && !x.c.transfer);
    const hero = resto[0];
    const lado = iTr >= 0 ? { c: _cards[iTr], i: iTr } : resto[1];
    const demas = resto.filter(x => x !== hero && x !== lado);
    const pintaHero = (x) => x.c.fase === 'agota' ? tarjetaAgota(x.c, x.i) : tarjeta(x.c, x.i, 'dkh-hero');


    _host.innerHTML = `
      <div class="dkh-cifras">${cifras.map(htmlCifra).join('')}</div>
      <div class="dkh-ahora${lado ? '' : ' solo'}">
        ${hero ? pintaHero(hero) : ''}
        ${lado ? tarjeta(lado.c, lado.i, 'dkh-lado') : ''}
      </div>
      <div class="dkh-resto">
        ${demas.map(x => x.c.fase === 'agota' ? tarjetaAgota(x.c, x.i) : tarjeta(x.c, x.i)).join('')}
        ${tarjetaVentas(d.ventas)}
      </div>
      ${reportes()}`;

    REPORTES.forEach(x => ['fgSub-' + x.sec, 'fgStats-' + x.sec].forEach(id => {
      const el = aparte.querySelector('#' + id);
      const caja = _host.querySelector(`[data-rep="${x.sec}"]`);
      if (el && caja) caja.appendChild(el);
    }));
    moverReportes();
    enganchar();
  }

  function enganchar() {
    const en = (sel, clave, fn) => _host.querySelectorAll(sel).forEach(b => {
      const c = _cards[Number(b.dataset[clave])];
      if (c && c[fn]) b.onclick = (ev) => { ev.stopPropagation(); c[fn](); };
    });
    en('[data-go]', 'go', 'go');
    en('[data-go2]', 'go2', 'go2');
    en('[data-gob3]', 'gob3', 'goB3');
    _host.querySelectorAll('[data-pv]').forEach(b => {
      const [ci, pi] = String(b.dataset.pv).split('-').map(Number);
      const p = _cards[ci] && _cards[ci].prov && _cards[ci].prov[pi];
      if (p && p.go) b.onclick = () => p.go();
    });
    const M = MH();
    const cf = (id) => _host.querySelector(`[data-cf="${id}"]`);
    if (cf('estante') && M.detalleEstante) cf('estante').onclick = () => M.detalleEstante();
    if (cf('ayer') && M.sincronizarHoy) cf('ayer').onclick = () => M.sincronizarHoy();
    engancharGasto();
    _host.querySelectorAll('[data-ro-todo]').forEach(b => {
      b.onclick = () => { const S = window.BarStockDeskShell; if (S && S.ir) S.ir('runningOut'); };
    });
    _host.querySelectorAll('.dkh-rep[data-sec]').forEach(t => {
      const abrir = () => { if (typeof window.bsOpenSection === 'function') window.bsOpenSection(t.dataset.sec); };
      // El botón de dentro ("Report last week") hace lo suyo y para el
      // clic: la tarjeta no se lo come.
      t.onclick = (ev) => { if (!ev.target.closest('button')) abrir(); };
      t.onkeydown = (ev) => { if (ev.key === 'Enter') abrir(); };
    });
  }

  function montar() {
    if (_host || !document.body || !document.body.classList.contains('dk')) return;
    const grid = document.getElementById('bsFocusGrid');
    if (!grid || !grid.parentElement) return;
    _host = document.createElement('section');
    _host.id = 'dkHome';
    _host.setAttribute('aria-label', 'Home');
    grid.parentElement.insertBefore(_host, grid);

    const M = MH();
    if (M && M.alCambiar) M.alCambiar(pintar);
    if (M && M.alSync) M.alSync(pintarGasto);
    // Al volver al Home (se quita .bs-focus-mode) se repinta: el ciclo y
    // las órdenes pueden haber cambiado en la sección de la que vienes.
    const wrap = document.querySelector('.wrap');
    if (wrap) new MutationObserver(() => { if (visible()) pintar(); })
      .observe(wrap, { attributes: true, attributeFilter: ['class'] });
    // Una ventana que pasa de teléfono a escritorio se encuentra el Home
    // sin pintar (pintar() no hace nada mientras no se ve).
    let espera = null;
    window.addEventListener('resize', () => {
      clearTimeout(espera);
      espera = setTimeout(() => { if (visible()) pintar(); }, 200);
    }, { passive: true });
    pintar();
    // Lo que llega después de arrancar (inventario, Pour·IQ, el LIVE):
    // el mismo vigilante del Home del teléfono, que repinta al cambiar.
    if (M && M.vigilar) M.vigilar();
  }

  // El armazón (desk-shell.js) se monta en DOMContentLoaded y pone .dk
  // en el body; éste va detrás. Si no llega en dos segundos, no hay
  // armazón y no hay Home nuevo: la portada de siempre sigue ahí.
  function arrancar(n) {
    if (!document.body.classList.contains('dk')) { if (n < 40) setTimeout(() => arrancar(n + 1), 50); return; }
    montar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(() => arrancar(0), 0));
  else setTimeout(() => arrancar(0), 0);

  window.BarStockDeskHome = { pintar, montar, cifraDiag, abrirVentana, cerrarVentana, _diag: (d) => { _diag = d; } };
})();
