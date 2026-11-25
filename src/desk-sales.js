(() => {
  if (window.BarStockDeskSales) return;

  // ── Sales en el escritorio (Axel, 2026-11-25, lámina A) ──────────────
  //
  // "Cuando presionas Full Report, el Full Report que veo es el del
  // teléfono. No tiene una pantalla dedicada de escritorio." Ahora la
  // tiene: la sección Sales de la barra lateral (antes "Soon"), que abren
  // también "All products" y "Full report" de la tarjeta de Toast del Home,
  // en la misma semana, día y vista.
  //
  // Arriba, la semana con ‹ ›, cinco cifras (neto, botellas, licor y
  // cócteles, vino, el mejor día) y los siete días como casillas, más la
  // semana entera. Debajo, UNA tabla con un cambio entre dos (Axel eligió
  // "dos tablas, un cambio"): el dinero y las botellas no caben en una
  // fila, porque el dinero va por lo que vende Toast ("Espresso Martini")
  // y las botellas por el producto del inventario ("Kahlua"), que salen
  // de las recetas y los pours.
  //   · Money · what Toast sold: nombre de Toast, licor o vino, neto,
  //     vendidos y su parte; filtro All / Liquor & cocktails / Wine.
  //   · Bottles · what left the shelf: producto, proveedor, botellas y
  //     contra lo de siempre; tocar uno abre su ficha (Do we have).
  // Las dos se ordenan por cualquier columna y se filtran por nombre. Al
  // pie, lo que el dinero deja fuera y las líneas sin precio.
  //
  // Los números son los de toast-sales.js, y las cuentas de "vs usual" y
  // de los pies, las de la hoja del teléfono (mobile-sales: comparar,
  // vsUsual, pies). Aquí sólo se pinta.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const b1 = (n) => String(Math.round((Number(n) || 0) * 10) / 10);
  const dinero0 = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const TS = () => window.BarStockToastSales;
  const MS = () => window.BarStockMobileSales;

  let _sec = null, _V = null, _pidiendo = false;
  // Lo elegido: la semana (0 = la de hoy), el día (0 = lunes … 6, o 'sem'),
  // la tabla ('dinero' | 'botellas'), el orden y los filtros.
  let _atras = 0, _dia = 'sem', _vista = 'dinero', _q = '', _cat = 'todo';
  const _orden = { dinero: { col: 'dinero', dir: -1 }, botellas: { col: 'botellas', dir: -1 } };

  function abierta() { return !!(_sec && _sec.classList.contains('bs-active-section')); }

  // Desde la tarjeta del Home: o = { vista, atras, dia }.
  function abrir(o) {
    o = o || {};
    _atras = Math.max(0, Number(o.atras) || 0);
    _dia = o.dia === undefined || o.dia === null ? 'sem' : o.dia;
    if (o.vista) _vista = o.vista === 'dinero' ? 'dinero' : 'botellas';
    _q = '';
    const S = window.BarStockDeskShell;
    if (S && S.ir) S.ir('sales');
    else if (typeof window.bsOpenSection === 'function') window.bsOpenSection('sales');
    pintar();
  }

  function cargar() {
    const T = TS();
    if (!T || !T.ahora || _pidiendo) return;
    _pidiendo = true;
    T.ahora().then(V => { _V = V; }).catch(e => { console.warn('[sales]', e); _V = { error: e }; })
      .then(() => { _pidiendo = false; if (abierta()) pintar(); });
  }

  function pintar() {
    const caja = _sec && _sec.querySelector('#dkSales');
    if (!caja) return;
    const T = TS(), M = MS();
    if (!_V) { caja.innerHTML = '<h2 class="dks-t">Sales</h2><p class="dks-nada">Loading sales…</p>'; cargar(); return; }
    if (_V.error) { caja.innerHTML = `<h2 class="dks-t">Sales</h2><p class="dks-nada">Could not read the sales: ${esc(_V.error.message || _V.error)}</p>`; return; }
    if (!T || !M || !_V.cargados || !T.semanaCal) { caja.innerHTML = '<h2 class="dks-t">Sales</h2><p class="dks-nada">This location has no Toast sales loaded.</p>'; return; }

    const maxAtras = T.semanasAtras ? T.semanasAtras(_V) : 0;
    _atras = Math.max(0, Math.min(maxAtras, _atras));
    const W = T.semanaCal(_V, _atras);
    if (!W) { caja.innerHTML = '<h2 class="dks-t">Sales</h2><p class="dks-nada">No sales for this week.</p>'; return; }
    const sem = W.dias;
    if (_dia !== 'sem' && (!sem[_dia] || sem[_dia].futuro)) _dia = 'sem';
    const esSem = _dia === 'sem';
    const d = esSem ? W.total : sem[_dia];
    const fechas = esSem ? W.fechas : d.fecha;
    const nom = (x) => M.nomDia(x);

    const carga = T.ultimaCarga ? T.ultimaCarga(_V.base && _V.base.dias) : null;
    const sync = carga ? `Synced ${esc(T.textoCarga(carga))}<i class="${T.cargaVieja(carga) ? 'vieja' : ''}"></i>` : 'Never synced<i class="vieja"></i>';

    // ── Las cinco cifras ──
    const cD = M.comparar(d, 'dinero'), cB = M.comparar(d, 'botellas');
    const pct = (x) => d.dinero ? Math.round(x / d.dinero * 100) + '%' : '';
    const pasados = sem.filter(x => !x.futuro && x.cargado);
    const mejor = pasados.reduce((a, x) => (!a || x.dinero > a.dinero ? x : a), null);
    const cifra = (k, v, sub, tono, punto) => `
      <div class="dks-k"><u>${punto ? `<i class="dks-pt ${punto}"></i>` : ''}${esc(k)}</u><b>${v}</b><small class="${tono || ''}">${esc(sub || '')}</small></div>`;
    const cifras = cifra('Net · ' + nom(d), dinero0(d.dinero), cD.txt, cD.tono)
      + cifra('Bottles', b1(d.botellas), cB.txt, cB.tono)
      + cifra('Liquor & cocktails', dinero0(d.licor), pct(d.licor), '', 'licor')
      + cifra('Wine', dinero0(d.vino), pct(d.vino), '', 'vino')
      + cifra('Best day · week', mejor && mejor.dinero > 0 ? esc(nom(mejor)) : '—', mejor && mejor.dinero > 0 ? dinero0(mejor.dinero) : '', '');

    // ── Los días ──
    const din = _vista === 'dinero';
    const val = (x) => din ? x.dinero : x.botellas;
    const nor = (x) => din ? x.normalDinero : x.normalBotellas;
    const tope = Math.max(1e-9, ...sem.map(x => Math.max(val(x) || 0, nor(x) || 0)));
    const alto = (n) => Math.max(0, Math.min(100, (n / tope) * 100)).toFixed(1) + '%';
    // Lo que dice cada casilla. Lo vendido primero: hoy, cargado a medias
    // con el Sync, no está "cargado" (no está cerrado) y decía "No data"
    // con sus ventas en la barra (Axel, 2026-11-25).
    const etiquetaDia = (x) => x.futuro ? '—'
      : val(x) > 0 ? (din ? dinero0(x.dinero) : b1(x.botellas) + ' btl')
      : !x.cargado ? (x.esHoy ? 'Not synced yet' : 'No data')
      : !nor(x) ? 'Closed' : (din ? '$0' : '0 btl');
    const dias = `<button type="button" class="dks-dia dks-sem${esSem ? ' on' : ''}" data-dia="sem"><b>Week</b><small>${esc(W.etiqueta)}</small></button>` +
      sem.map((x, k) => `
        <button type="button" class="dks-dia${!esSem && k === _dia ? ' on' : ''}${x.futuro ? ' fut' : ''}" data-dia="${k}"${x.futuro ? ' disabled' : ''}>
          <span class="dks-g">${x.futuro ? '' : din
            ? `<i class="vino" style="height:${alto(x.vino)}"></i><i class="licor" style="height:${alto(x.licor)}"></i>`
            : `<i class="bot" style="height:${alto(x.botellas)}"></i>`}${nor(x) ? `<s style="bottom:${alto(nor(x))}"></s>` : ''}</span>
          <b>${esc(nom(x))}</b><small>${etiquetaDia(x)}</small>
        </button>`).join('');

    // ── La tabla ──
    const t = norm(_q);
    let filas, cols;
    if (din) {
      const todos = T.masVendido(_V.base, fechas, 'dinero');
      const total = d.dinero || todos.reduce((a, x) => a + x.dinero, 0);
      filas = todos.filter(x => _cat === 'todo' || x.categoria === _cat)
        .filter(x => t.length < 2 || norm(x.nombre).includes(t))
        .map(x => ({ nombre: x.nombre, tipo: x.categoria === 'licor' ? 'Liquor & cocktails' : 'Wine', cat: x.categoria,
          dinero: x.dinero, unidades: x.unidades, parte: total ? x.dinero / total : 0 }));
      cols = [['nombre', 'Item in Toast'], ['tipo', 'Type'], ['dinero', 'Net', 'num'], ['unidades', 'Sold', 'num'], ['parte', 'Share', 'num']];
    } else {
      filas = T.masVendido(_V.base, fechas, 'botellas')
        .filter(x => t.length < 2 || norm(x.nombre).includes(t))
        .map(x => { const u = M.vsUsual(x.nombre, x.botellas, d); return { nombre: x.nombre, proveedor: (u.r && u.r.vendor) || '', botellas: x.botellas, dif: u.dif, usualTxt: u.txt, tono: u.tono, enInv: !!u.r }; });
      cols = [['nombre', 'Product'], ['proveedor', 'Vendor'], ['botellas', 'Bottles', 'num'], ['dif', 'vs usual', 'num']];
    }
    const o = _orden[_vista];
    filas.sort((a, b) => {
      const x = a[o.col], y = b[o.col];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * o.dir;
    });
    const topeFila = Math.max(1e-9, ...filas.map(x => din ? x.dinero : x.botellas));
    const cab = cols.map(([k, txt, c]) => `<button type="button" class="dks-th${c ? ' num' : ''}${o.col === k ? ' on' : ''}" data-col="${k}">${esc(txt)}${o.col === k ? (o.dir < 0 ? ' ▾' : ' ▴') : ''}</button>`).join('');
    const cuerpo = !filas.length
      ? `<div class="dks-vacio">${t.length >= 2 ? 'Nothing matches.' : d.semana ? 'Nothing sold this week.' : 'Nothing sold this day.'}</div>`
      : filas.map(x => din ? `
        <div class="dks-tr">
          <span class="dks-n">${esc(x.nombre)}<i class="${x.cat}" style="width:${(x.dinero / topeFila * 100).toFixed(1)}%"></i></span>
          <span class="dks-s">${esc(x.tipo)}</span>
          <span class="num">${dinero0(x.dinero)}</span>
          <span class="num">${Math.round(x.unidades)}</span>
          <span class="num">${(x.parte * 100).toFixed(1)}%</span>
        </div>` : `
        <div class="dks-tr${x.enInv ? ' dks-abre' : ''}"${x.enInv ? ` data-item="${esc(x.nombre)}" role="button" tabindex="0"` : ''}>
          <span class="dks-n">${esc(x.nombre)}<i class="bot" style="width:${(x.botellas / topeFila * 100).toFixed(1)}%"></i></span>
          <span class="dks-s">${esc(x.proveedor)}</span>
          <span class="num">${b1(x.botellas)}</span>
          <span class="num ${x.tono || ''}">${esc(x.usualTxt || '')}</span>
        </div>`).join('');
    const pies = din ? M.pies(_V, fechas, d) : [];

    // La forma de las secciones del escritorio (Axel, 2026-11-25, lámina
    // "Section screens" A, el estándar): la cabeza de la página (título,
    // cifras, días), y debajo los controles y los títulos de las columnas,
    // que se quedan pegados bajo la barra de arriba al bajar (.dks-pega),
    // y una fila por artículo. Rueda la página, no una caja.
    const tcls = din ? 'dks-tdin' : 'dks-tbot';
    caja.innerHTML = `
      <header class="dks-cabeza">
        <div class="dks-top">
          <h2 class="dks-t">Sales</h2>
          <span class="dks-marca"><img class="dks-logo" src="assets/brands/toast.png" width="307" height="78" alt="Toast"><span class="dks-sync">${sync}</span></span>
        </div>
        <div class="dks-cifras">${cifras}</div>
        <div class="dks-dias">${dias}</div>
      </header>
      <div class="dks-pega ${tcls}">
        <div class="dks-fil">
          <span class="dks-tabs" role="group" aria-label="Table">
            <button type="button" class="${din ? 'on' : ''}" data-vista="dinero">Money <small>what Toast sold</small></button>
            <button type="button" class="${din ? '' : 'on'}" data-vista="botellas">Bottles <small>what left the shelf</small></button>
          </span>
          <label class="dks-q"><i class="ti ti-search" aria-hidden="true"></i><input id="dksQ" type="search" autocomplete="off" placeholder="${din ? 'Filter items' : 'Filter products'}" value="${esc(_q)}"></label>
          ${din ? `<span class="dks-cats">${[['todo', 'All'], ['licor', 'Liquor & cocktails'], ['vino', 'Wine']].map(([k, x]) =>
            `<button type="button" class="${_cat === k ? 'on' : ''}" data-cat="${k}">${x}</button>`).join('')}</span>` : ''}
          <span class="dks-semana" role="group" aria-label="Week">
            <button type="button" class="dks-f" data-sem="1" aria-label="Previous week"${_atras >= maxAtras ? ' disabled' : ''}><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
            <b>${esc(W.etiqueta)}</b>
            <button type="button" class="dks-f" data-sem="-1" aria-label="Next week"${_atras <= 0 ? ' disabled' : ''}><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
          </span>
        </div>
        <div class="dks-thr">${cab}</div>
      </div>
      <div class="dks-filas ${tcls}">${cuerpo}</div>
      ${pies.length ? `<p class="dks-pie">${pies.map(esc).join(' · ')}</p>` : ''}
      ${!din ? '<p class="dks-pie">Bottles come from recipes and pours. A cocktail counts in the bottles it uses.</p>' : ''}`;
    enganchar(caja, maxAtras);
  }

  function enganchar(caja, maxAtras) {
    caja.querySelectorAll('[data-sem]').forEach(b => {
      b.onclick = () => { if (b.disabled) return; _atras = Math.max(0, Math.min(maxAtras, _atras + Number(b.dataset.sem))); _dia = 'sem'; pintar(); };
    });
    caja.querySelectorAll('[data-dia]').forEach(b => {
      b.onclick = () => { if (b.disabled) return; _dia = b.dataset.dia === 'sem' ? 'sem' : Number(b.dataset.dia); pintar(); };
    });
    caja.querySelectorAll('[data-vista]').forEach(b => { b.onclick = () => { _vista = b.dataset.vista; pintar(); }; });
    caja.querySelectorAll('[data-cat]').forEach(b => { b.onclick = () => { _cat = b.dataset.cat; pintar(); }; });
    caja.querySelectorAll('[data-col]').forEach(b => {
      b.onclick = () => {
        const o = _orden[_vista];
        if (o.col === b.dataset.col) o.dir = -o.dir;
        else { o.col = b.dataset.col; o.dir = /nombre|tipo|proveedor/.test(o.col) ? 1 : -1; }
        pintar();
      };
    });
    const q = caja.querySelector('#dksQ');
    if (q) q.oninput = () => {
      _q = q.value;
      const pos = q.selectionStart;
      pintar();
      // Se repinta todo: el campo nuevo recupera el foco y el cursor.
      const n = caja.querySelector('#dksQ');
      if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
    };
    // Un producto del inventario abre su ficha: la de Do we have.
    caja.querySelectorAll('[data-item]').forEach(f => {
      const ir = () => abrirFicha(f.dataset.item);
      f.onclick = ir;
      f.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ir(); } };
    });
  }

  function abrirFicha(nombre) {
    const DS = window.BarStockDeskSearch;
    const m = (window.state && window.state.master) || [];
    const i = m.findIndex(r => r && r.item === nombre);
    if (!DS || i < 0) return;
    DS.buscar(nombre);
    DS.elegir(i);
  }

  // La sección existe ANTES de que arranque desk-shell.js (se carga justo
  // antes que él), como Running out: el armazón vigila las secciones que
  // encuentra al montar.
  function montar() {
    if (_sec) return;
    const wrap = document.querySelector('.wrap');
    if (!wrap) return;
    _sec = document.createElement('section');
    // dk-pantalla: la forma de las secciones (desk-shell.css).
    _sec.className = 'card section-card dk-sales-sec dk-pantalla';
    _sec.id = 'salesSection';
    // El título va dentro de la cabeza de la página (lo pinta pintar()).
    _sec.innerHTML = '<div id="dkSales"><h2 class="dks-t">Sales</h2></div>';
    wrap.appendChild(_sec);
    // Al abrirse, se lee (toast-sales guarda lo leído media hora) y se pinta.
    new MutationObserver(() => { if (abierta()) { _V = null; pintar(); } })
      .observe(_sec, { attributes: true, attributeFilter: ['class'] });
    // El Sync de hoy trajo ventas (el aviso que escucha también live-cache).
    const E = window.BarStockEvents;
    if (E && E.on) E.on('toastSalesUpdated', () => { _V = null; if (abierta()) pintar(); });
  }

  if (document.querySelector('.wrap')) montar();
  else document.addEventListener('DOMContentLoaded', montar);

  window.BarStockDeskSales = { abrir, montar, abierta, pintar };
})();
