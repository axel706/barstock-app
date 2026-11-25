(() => {
  if (window.BarStockDeskInventory) return;

  // ── Inventory en el escritorio (Axel, 2026-11-25) ────────────────────
  //
  // Con el estándar de las secciones (la sección es la pantalla), la barra
  // C ("un control segmentado suave y dos menús") y el producto en un
  // panel a la derecha (A). Lámina "Inventory · desktop" y "the bar that
  // sticks".
  //
  // TODAS las funciones del Inventory de antes se quedan, más las del
  // teléfono (el mapa está en la lámina y en CLAUDE.md), salvo lo que
  // Axel quitó a propósito:
  //   · el On Hand a mano (sólo lo escribe un conteo; para corregir el
  //     LIVE está ✎ Check the shelf),
  //   · Scan Price Invoice (los precios llegan de MarginEdge),
  //   · el modo foco (la sección ya es la pantalla entera).
  //
  // Este archivo no calcula nada propio: las filas y su orden son los del
  // teléfono (BarStockMobileInventory.filtrar / faltas), el número es el
  // LIVE (live-cache), el color el de product-hero, la ficha la de "Do we
  // have" (mobile-search.llenarFicha), y guardar pasa por lo de siempre
  // (BarStockItemEdit.renombrar / borrar, bsSaveItemFields,
  // updateFinalOrder, openCategoryModal, quickZeroSuggested).
  //
  // ── EL TIEMPO REAL (Axel: "debes estar seguro de que no se va a dañar")
  // No se toca: inventory-realtime.js sigue escuchando inventory_items,
  // recarga state.master, llama al render() de siempre y avisa
  // 'inventoryUpdated'. Aquí sólo se ESCUCHA ese aviso (y el del LIVE)
  // para repintar. Dos cuidados, porque cada recarga REEMPLAZA la lista:
  //   · el producto abierto se recuerda por su NOMBRE, no por su índice;
  //   · lo que estás editando en el panel (el borrador) no se pisa: con un
  //     borrador, el panel no se repinta; sólo la lista.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
  const r1 = (v) => String(Math.round(num(v) * 10) / 10);
  const dinero = (v) => '$' + num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dinero0 = (v) => '$' + Math.round(num(v)).toLocaleString('en-US');
  const master = () => (window.state && window.state.master) || [];
  const MI = () => window.BarStockMobileInventory;
  const LC = () => window.BarStockLiveCache;
  const puede = (k) => { const g = window.BarStockGuest; return !g || !g.puede || g.puede(k); };

  let _sec = null, _caja = null;
  // Lo elegido. `_orden`: los tres del teléfono (valor, falta, nombre) o
  // una columna ('onhand', 'avg', 'par', 'pedir', 'precio', 'vendor').
  let _vista = 'todo', _vendor = 'ALL', _orden = 'valor', _dir = 1, _q = '';
  let _sel = null;           // el NOMBRE del producto abierto
  let _borrador = null;      // { item, nombre, codigo, vendor, par, precio, override, renombrar }
  let _borrarArmado = false, _borrarT = null;

  function abierta() { return !!(_sec && _sec.classList.contains('bs-active-section')); }
  const idxDe = (nombre) => master().findIndex(r => r && r.item === nombre);

  const cuanto = (r) => LC() && LC().cuanto ? LC().cuanto(r) : num(r.onHand);
  const vivo = (r) => !!(LC() && LC().vivo && LC().vivo(r));
  const parAdj = (r) => { const m = window.parAdjustments; return m && m.get ? m.get(r.item + '||' + (r.code || '')) : null; };
  const color = (r) => { const H = window.BarStockProductHero; return H && H.tono ? H.tono(Object.assign({}, r, { onHand: cuanto(r) })).c : '#94a3b8'; };

  // ── Las filas ──
  function filas() {
    const M = MI();
    if (!M || !M.filtrar) return master().slice();
    const base = M.filtrar({ q: _q, filtro: _vista === 'agota' ? 'agota' : null, vendor: _vendor,
      solo: _vista === 'fix' ? 'fix' : 'todo', orden: ['valor', 'falta', 'nombre'].includes(_orden) ? _orden : 'valor' });
    if (['valor', 'falta', 'nombre'].includes(_orden) || _vista === 'agota') return base;
    const val = {
      onhand: (r) => cuanto(r), avg: (r) => { const p = parAdj(r); return p ? num(p.avgUsed) : -1; },
      par: (r) => num(r.suggested), pedir: (r) => num(r.toOrder), precio: (r) => num(r.value),
      vendor: (r) => String(r.vendor || 'UNKNOWN')
    }[_orden];
    return base.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * _dir || String(a.item).localeCompare(String(b.item));
    });
  }

  let _nSil = 0;
  function silueta(r) {
    const HC = window.BarStockHomeCartas, BP = window.BarStockBottleProfiles;
    if (!HC || !HC.silueta || !BP || !BP.formaDe) return '<span class="dki-sil0"></span>';
    const par = num(r.suggested);
    const lleno = par > 0 ? Math.max(0, Math.min(1, cuanto(r) / par)) : (cuanto(r) > 0 ? 1 : 0);
    return HC.silueta(BP.formaDe(r), lleno, 'dkiS' + (_nSil++));
  }

  function fila(r) {
    const M = MI();
    const falt = M && M.faltas ? M.faltas(r) : [];
    const ag = LC() && LC().agota ? LC().agota(r) : null;
    const chip = typeof window.getParChipHtml === 'function' ? window.getParChipHtml(r) : '';
    const p = parAdj(r);
    const tam = num(r.bottleSizeMl) ? (num(r.bottleSizeMl) >= 1000 ? r1(num(r.bottleSizeMl) / 1000) + ' L' : num(r.bottleSizeMl) + ' ml') : '';
    const extra = [tam, r.category || ''].filter(Boolean).join(' · ');
    const par = num(r.suggested);
    const v = vivo(r);
    return `<div class="dki-fila${r.item === _sel ? ' sel' : ''}" data-item="${esc(r.item)}" role="button" tabindex="0">
      <span class="dki-silc">${silueta(r)}</span>
      <span class="dki-n"><b>${esc(r.item)}</b><small>${v ? '<span class="dki-live">● Live</span>' : ''}${ag ? `<span class="dki-out ${ag.tono}">${esc(ag.txt)}</span>` : ''}${chip}${
        falt.map(f => `<span class="dki-falta ${f === 'no price' ? 'r' : f === 'no par' ? 'g' : 'a'}">${esc(f)}</span>`).join('')}${extra ? `<span>${esc(extra)}</span>` : ''}</small></span>
      <span class="dki-v">${typeof window.badge === 'function' ? window.badge(r.vendor || 'UNKNOWN') : esc(r.vendor || '')}</span>
      <span class="num dki-hay" style="color:${color(r)}">${v ? '≈' + r1(cuanto(r)) : r1(cuanto(r))}<small>/${par > 0 ? r1(par) : '—'}</small></span>
      <span class="num">${p && num(p.avgUsed) > 0 ? r1(p.avgUsed) : '—'}</span>
      <span class="num">${par > 0 ? r1(par) : '—'}</span>
      <span class="num">${num(r.toOrder) > 0 ? r1(r.toOrder) : '—'}</span>
      <span class="num${num(r.value) > 0 ? '' : ' r'}">${num(r.value) > 0 ? dinero(r.value) : '—'}</span>
    </div>`;
  }

  // ── La cabeza de la página ──
  function cabeza() {
    const V = window.BarStockInventoryValue;
    const c = V && V.compute ? V.compute() : null;
    const M = MI();
    const fix = M && M.faltas ? master().filter(r => M.faltas(r).length).length : 0;
    const RO = window.BarStockRunningOut;
    const agotan = RO && RO.lista ? RO.lista().length : 0;
    const COL = ['#38bdf8', '#c084fc', '#f59e0b', '#22c55e', '#f472b6', '#2dd4bf', '#fb7185', '#a3e635', '#818cf8', '#facc15'];
    const cats = c ? c.cats.slice(0, 10) : [];
    const colorCat = (x, k) => /uncategorized/.test(x.name) ? '#64748b' : COL[k % COL.length];
    const puedeEditar = puede('editar_productos');
    return `
      <div class="dki-top">
        <h2 class="dki-t">Inventory</h2>
        <span class="dki-herr">
          <button type="button" class="dki-b go" data-acc="contar"><i class="ti ti-scan" aria-hidden="true"></i>Count</button>
          ${puedeEditar ? '<button type="button" class="dki-b gr" data-acc="nuevo"><i class="ti ti-plus" aria-hidden="true"></i>Add item</button>' : ''}
          ${puedeEditar ? '<button type="button" class="dki-b ic" data-acc="categorias" title="Assign categories automatically" aria-label="Assign categories automatically"><i class="ti ti-tags" aria-hidden="true"></i></button>' : ''}
          ${puedeEditar ? '<button type="button" class="dki-b ic" data-acc="botellas" title="Assign bottle shapes and sizes" aria-label="Assign bottle shapes and sizes"><i class="ti ti-bottle" aria-hidden="true"></i></button>' : ''}
        </span>
      </div>
      <div class="dki-conteo" id="dkiConteo"></div>
      <div class="dki-cifras">
        <div class="dki-k dki-k1"><u>Money on the shelf</u><b>${c ? dinero0(c.total) : '—'}</b><small>as counted${c && c.noPrice ? ' · ' + c.noPrice + ' in stock with no price' : ''}${c && c.llegado ? ' · +' + dinero0(c.llegado) + ' arrived since' : ''}</small>
          ${cats.length ? `<span class="dki-cats">${cats.map((x, k) => `<i style="width:${x.pct.toFixed(1)}%;background:${colorCat(x, k)}" title="${esc(x.name.replace('— ', ''))} ${dinero0(x.value)}"></i>`).join('')}</span>
          <span class="dki-ley">${cats.slice(0, 6).map((x, k) => `<span style="--c:${colorCat(x, k)}">${esc(x.name.replace('— uncategorized', 'No category'))} ${dinero0(x.value)}</span>`).join('')}</span>` : ''}</div>
        <div class="dki-k"><u>Items</u><b>${master().length}</b><small>${c && c.uncategorized ? c.uncategorized + ' with no category' : 'all with a category'}</small></div>
        <div class="dki-k"><u>Needs fixing</u><b class="${fix ? 'a' : ''}">${fix}</b><small>no vendor, price or par</small></div>
        <div class="dki-k"><u>Running out</u><b class="${agotan ? 'r' : ''}">${agotan}</b><small>before Sunday</small></div>
      </div>`;
  }

  // ── La barra que se pega (C) ──
  function barra(n) {
    const M = MI();
    const fix = M && M.faltas ? master().filter(r => M.faltas(r).length).length : 0;
    const RO = window.BarStockRunningOut;
    const agotan = RO && RO.lista ? RO.lista().length : 0;
    const vendors = typeof window.getVendorsForFilter === 'function' ? window.getVendorsForFilter() : ['ALL'];
    const cap = (v) => String(v).toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase());
    const col = (k, t, cls) => `<button type="button" class="dki-th${cls ? ' ' + cls : ''}${_orden === k ? ' on' : ''}" data-col="${k}">${t}${_orden === k ? (_dir < 0 ? ' ▾' : ' ▴') : ''}</button>`;
    return `
      <div class="dki-fil">
        <span class="dki-seg" role="group" aria-label="View">
          <button type="button" class="${_vista === 'todo' ? 'on' : ''}" data-vista="todo">Everything <em>${master().length}</em></button>
          <button type="button" class="${_vista === 'fix' ? 'on' : ''}" data-vista="fix">Needs fixing <em class="a">${fix}</em></button>
          <button type="button" class="${_vista === 'agota' ? 'on' : ''}" data-vista="agota">Running out <em class="r">${agotan}</em></button>
        </span>
        <label class="dki-sel"><select id="dkiVendor" aria-label="Vendor"${_vista === 'agota' ? ' disabled' : ''}>${vendors.map(v =>
          `<option value="${esc(v)}"${v === _vendor ? ' selected' : ''}>${v === 'ALL' ? 'All vendors' : esc(cap(v))}</option>`).join('')}</select></label>
        <label class="dki-sel"><select id="dkiOrden" aria-label="Sort"${_vista === 'agota' ? ' disabled' : ''}>
          ${[['valor', 'Money on the shelf'], ['falta', 'Closest to empty'], ['nombre', 'Name']].map(([k, t]) => `<option value="${k}"${_orden === k ? ' selected' : ''}>${t}</option>`).join('')}
          ${['valor', 'falta', 'nombre'].includes(_orden) ? '' : '<option value="col" selected>By column</option>'}</select></label>
        <label class="dki-q"><i class="ti ti-search" aria-hidden="true"></i><input id="dkiQ" type="search" autocomplete="off" placeholder="Filter ${n} items" value="${esc(_q)}"></label>
      </div>
      <div class="dki-cols">
        <span></span>${col('nombre', 'Product')}${col('vendor', 'Vendor')}${col('onhand', 'On hand', 'num')}${col('avg', 'Avg/wk', 'num')}${col('par', 'Par', 'num')}${col('pedir', 'To order', 'num')}${col('precio', 'Price', 'num')}
      </div>`;
  }

  // ── El panel del producto (A) ──
  function panel(r, idx) {
    const edita = puede('editar_productos');
    const b = _borrador && _borrador.item === r.item ? _borrador : null;
    const vendors = typeof window.getVendorsWithUnknown === 'function' ? window.getVendorsWithUnknown() : [r.vendor || 'UNKNOWN'];
    const cap = (v) => String(v).toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase());
    const vend = b ? b.vendor : (r.vendor || 'UNKNOWN');
    const par = b ? b.par : num(r.suggested);
    const precio = b ? b.precio : num(r.value);
    const ov = b ? b.override : (r.orderOverride === '' || r.orderOverride == null ? '' : r.orderOverride);
    const BP = window.BarStockBottleProfiles;
    // El nombre de la forma, con la regla de la fila "Bottle" del teléfono.
    const clave = BP && BP.resolveKey ? BP.resolveKey(r.bottleShape) : (r.bottleShape || 'generic');
    const prof = r.bottleShape && clave !== 'generic' && BP && BP.get ? BP.get(clave) : null;
    const forma = !r.bottleShape || clave === 'generic' ? 'Not set · generic bottle' : (prof && prof.name) || String(r.bottleShape);
    const manual = typeof window.supportsManualFinalOrder === 'function' && window.supportsManualFinalOrder(vend);
    const editar = !edita ? '' : `
      <div class="dki-blk dki-ed">
        <u>Edit <span>${b ? 'Not saved yet' : 'Changes save with Save'}</span></u>
        ${b && b.renombrar ? `
          <label class="dki-in"><span>Name</span><input id="dkiNombre" value="${esc(b.nombre)}"></label>
          <label class="dki-in"><span>Code</span><input id="dkiCodigo" value="${esc(b.codigo)}"></label>` : `
          <div class="dki-fr"><span>Name &amp; code</span><b>${esc(r.code || 'No code')} <button type="button" class="dki-lnk" data-acc="renombrar">Rename</button></b></div>`}
        <div class="dki-fr"><span>Vendor</span><b><select id="dkiVend" aria-label="Vendor">${vendors.map(v =>
          `<option value="${esc(v)}"${String(v).toUpperCase() === String(vend).toUpperCase() ? ' selected' : ''}>${esc(cap(v))}</option>`).join('')}</select></b></div>
        <div class="dki-fr"><span>Category</span><b>${esc(r.category || 'No category')} <button type="button" class="dki-lnk" data-acc="categoria">Change</button></b></div>
        <div class="dki-fr"><span>Bottle</span><b>${esc(forma)}${num(r.bottleSizeMl) ? ' · ' + num(r.bottleSizeMl) + ' ml' : ''} <button type="button" class="dki-lnk" data-acc="botella">Change</button></b></div>
        <div class="dki-duo">
          <div class="dki-stp"><u>Par</u><span><button type="button" data-par="-1" aria-label="Less">−</button><input id="dkiPar" type="number" min="0" step="1" value="${esc(String(par))}"><button type="button" data-par="1" aria-label="More">+</button></span></div>
          <div class="dki-stp"><u>Price</u><span>$<input id="dkiPrecio" type="number" min="0" step="0.01" value="${esc(String(precio))}"></span></div>
        </div>
        <div class="dki-fr"><span>Order override</span><b>${manual
          ? `<input id="dkiOv" type="number" min="0" step="1" placeholder="auto ${esc(r1(r.toOrder))}" value="${esc(String(ov))}">`
          : '<em>not for this vendor</em>'}</b></div>
        <p class="dki-err" id="dkiErr"></p>
      </div>`;
    return `
      <div class="dki-ph">
        <div><h3>${esc(r.item)}</h3><small>${esc([r.code || 'No code', r.vendor || 'Unknown'].join(' · '))}</small></div>
        <button type="button" class="dki-b ic" data-acc="cerrar" aria-label="Close" title="Close (Esc)"><i class="ti ti-x" aria-hidden="true"></i></button>
      </div>
      ${editar}
      <div class="dki-ficha m-ficha" id="dkiFicha"></div>
      <div class="dki-acc">
        ${typeof window.openItemInfoModal === 'function' ? '<button type="button" class="dki-b" data-acc="info"><i class="ti ti-chart-dots" aria-hidden="true"></i>Pour·IQ history</button>' : ''}
        ${edita && typeof window.openStockIn === 'function' ? '<button type="button" class="dki-b" data-acc="recibido"><i class="ti ti-truck-delivery" aria-hidden="true"></i>Received</button>' : ''}
        ${edita ? '<button type="button" class="dki-b" data-acc="cero">Zero par</button>' : ''}
        ${edita ? `<button type="button" class="dki-b rd" data-acc="borrar">${_borrarArmado ? 'Click again to delete' : 'Delete'}</button>` : ''}
        ${edita ? `<button type="button" class="dki-b go dki-guardar" data-acc="guardar"${b ? '' : ' disabled'}>Save</button>` : ''}
      </div>`;
  }

  // ── Pintar ──
  let _pintando = false;
  function pintar(opts) {
    // Sólo en el escritorio: en el teléfono Inventory es su pantalla.
    if (!_caja || !abierta() || !document.body.classList.contains('dk')) return;
    _nSil = 0;
    const lista = filas();
    const idx = _sel ? idxDe(_sel) : -1;
    if (_sel && idx < 0) { _sel = null; _borrador = null; }      // lo borraron (aquí o en otro dispositivo)
    const enfocado = document.activeElement && document.activeElement.id;
    const posQ = enfocado === 'dkiQ' ? document.activeElement.selectionStart : null;
    const conservarPanel = !!(_borrador && _sel && _caja.querySelector('#dkiPanel .dki-ph') && !(opts && opts.panel));

    _caja.querySelector('#dkiCabeza').innerHTML = cabeza();
    const conteo = document.getElementById('countResumeHost');
    const hueco = _caja.querySelector('#dkiConteo');
    if (conteo && hueco) hueco.appendChild(conteo);
    _caja.querySelector('#dkiPega').innerHTML = barra(lista.length);
    _caja.querySelector('#dkiLista').innerHTML = lista.length ? lista.map(fila).join('')
      : `<p class="dki-vacio">${_q.trim().length >= 2 ? 'Nothing matches.' : _vista === 'fix' ? 'Nothing left to fix.' : _vista === 'agota' ? 'Nothing runs out this week.' : master().length ? 'Nothing here with this vendor.' : 'No inventory yet.'}</p>`;
    const pan = _caja.querySelector('#dkiPanel');
    _caja.classList.toggle('con-panel', !!_sel);
    if (!_sel) { pan.innerHTML = ''; }
    else if (!conservarPanel) {
      pan.innerHTML = panel(master()[idx], idx);
      const ficha = pan.querySelector('#dkiFicha');
      const MS = window.BarStockMobileSearch;
      if (ficha && MS && MS.llenarFicha) MS.llenarFicha(ficha, idx, () => pintar({ panel: true }), false);
    }
    // El buscador conserva el foco y el cursor al repintar.
    if (enfocado === 'dkiQ') { const q = _caja.querySelector('#dkiQ'); if (q) { q.focus(); try { q.setSelectionRange(posQ, posQ); } catch (e) {} } }
    medirPega();
  }
  let _raf = 0;
  const repintar = () => { if (_raf) return; _raf = requestAnimationFrame(() => { _raf = 0; pintar(); }); };

  // El panel se pega bajo la barra pegada: se mide su alto al pintar.
  function medirPega() {
    const p = _caja && _caja.querySelector('#dkiPega');
    if (p) _caja.style.setProperty('--dki-pega', Math.round(p.getBoundingClientRect().height) + 'px');
  }

  // ── El borrador ──
  function leerBorrador(r) {
    const val = (id) => { const e = _caja.querySelector('#' + id); return e ? e.value : null; };
    const b = _borrador && _borrador.item === r.item ? _borrador : {
      item: r.item, nombre: r.item, codigo: r.code || '', vendor: r.vendor || 'UNKNOWN',
      par: num(r.suggested), precio: num(r.value), override: r.orderOverride === '' || r.orderOverride == null ? '' : r.orderOverride, renombrar: false
    };
    if (val('dkiNombre') !== null) b.nombre = val('dkiNombre');
    if (val('dkiCodigo') !== null) b.codigo = val('dkiCodigo');
    if (val('dkiVend') !== null) b.vendor = val('dkiVend');
    if (val('dkiPar') !== null) b.par = Math.max(0, num(val('dkiPar')));
    if (val('dkiPrecio') !== null) b.precio = Math.max(0, num(val('dkiPrecio')));
    if (val('dkiOv') !== null) b.override = val('dkiOv') === '' ? '' : Math.max(0, num(val('dkiOv')));
    return b;
  }
  function marcarSucio() {
    const g = _caja.querySelector('.dki-guardar');
    if (g) g.disabled = false;
    const u = _caja.querySelector('.dki-ed > u span');
    if (u) u.textContent = 'Not saved yet';
  }

  async function guardar() {
    const idx = idxDe(_sel);
    const r = master()[idx];
    if (!r) return;
    const b = leerBorrador(r);
    const err = _caja.querySelector('#dkiErr');
    const g = _caja.querySelector('.dki-guardar');
    if (g) { g.disabled = true; g.textContent = 'Saving…'; }
    const fallo = (m) => { if (err) err.textContent = m; if (g) { g.disabled = false; g.textContent = 'Save'; } };
    try {
      // Primero el nombre: renombra en todas las tablas en una transacción
      // (item-edit.js, migración 038). Si falla, no se guarda nada más.
      const cambiaNombre = b.renombrar && (b.nombre.trim() !== r.item || b.codigo.trim() !== String(r.code || ''));
      if (cambiaNombre) {
        if (!b.nombre.trim()) return fallo('Give it a name.');
        const E = window.BarStockItemEdit;
        const res = E && E.renombrar ? await E.renombrar(r, { nombre: b.nombre.trim(), codigo: b.codigo.trim() }) : { ok: false, error: 'Not loaded.' };
        if (!res || !res.ok) return fallo('Not saved: ' + ((res && res.error) || 'unknown error'));
        if (res.compartidas) alert('Renamed at this location. Another location still has an item with the old name, so the shared barcode and bottle shape stay with it.');
      }
      const i2 = idxDe(cambiaNombre ? b.nombre.trim() : r.item);
      const ok = typeof window.bsSaveItemFields === 'function'
        ? await window.bsSaveItemFields(i2, { vendor: String(b.vendor || 'UNKNOWN').toUpperCase(), suggested: b.par, value: b.precio }) : false;
      if (!ok) return fallo('Not saved. Check the connection and try again.');
      // El override, por su camino de siempre (lo leen Orders y el teléfono).
      const r2 = master()[i2];
      const antes = r.orderOverride === '' || r.orderOverride == null ? '' : num(r.orderOverride);
      if (r2 && b.override !== antes && typeof window.updateFinalOrder === 'function') window.updateFinalOrder(i2, b.override === '' ? '' : String(b.override));
      _borrador = null;
      if (cambiaNombre) {
        // Como el teléfono y el modal de antes: un renombre se lee de nuevo
        // entero, con todo lo que cuelga del nombre.
        if (typeof window.setStatus === 'function') window.setStatus('Renamed everywhere. Reloading…');
        setTimeout(() => location.reload(), 700);
        return;
      }
      _sel = r2 ? r2.item : null;
      pintar({ panel: true });
    } catch (e) {
      fallo('Not saved: ' + (e && e.message || e));
    }
  }

  async function borrar() {
    const idx = idxDe(_sel);
    const r = master()[idx];
    if (!r) return;
    if (!_borrarArmado) {
      _borrarArmado = true;
      clearTimeout(_borrarT);
      _borrarT = setTimeout(() => { _borrarArmado = false; pintar({ panel: !_borrador }); }, 4000);
      const btn = _caja.querySelector('[data-acc="borrar"]');
      if (btn) btn.textContent = 'Click again to delete';
      return;
    }
    _borrarArmado = false;
    clearTimeout(_borrarT);
    const E = window.BarStockItemEdit;
    const err = _caja.querySelector('#dkiErr');
    // Respaldo de Time Machine antes; sin respaldo no se borra (item-edit.js).
    const res = E && E.borrar ? await E.borrar(r) : { ok: false, error: 'Not loaded.' };
    if (!res || !res.ok) { if (err) err.textContent = 'Not deleted: ' + ((res && res.error) || 'unknown error'); return; }
    if (typeof window.setStatus === 'function') window.setStatus(`Deleted ${r.item}. A backup is in Time Machine.`);
    _sel = null; _borrador = null;
    if (typeof window.render === 'function') window.render();
    pintar();
  }

  function elegir(nombre) {
    if (_borrador && _borrador.item !== nombre && !confirm('Discard the changes you have not saved?')) return;
    if (_borrador && _borrador.item !== nombre) _borrador = null;
    _sel = _sel === nombre ? null : nombre;
    _borrarArmado = false;
    pintar({ panel: true });
  }

  // ── Los toques ──
  function alClic(ev) {
    const t = ev.target;
    if (t.closest('.par-chip')) return;          // el chip de Pour·IQ abre lo suyo
    const acc = t.closest('[data-acc]');
    if (acc) {
      const a = acc.dataset.acc;
      const r = _sel ? master()[idxDe(_sel)] : null;
      const idx = _sel ? idxDe(_sel) : -1;
      if (a === 'contar') { const b = document.getElementById('takeInventoryBtn'); if (b) b.click(); }
      else if (a === 'nuevo' && typeof window.openNewItemModal === 'function') window.openNewItemModal();
      else if (a === 'categorias' && window.BarStockAutoCategory) window.BarStockAutoCategory.run();
      else if (a === 'botellas' && window.BarStockBottleAssign) window.BarStockBottleAssign.run();
      else if (a === 'cerrar') elegir(_sel);
      else if (a === 'renombrar' && r) { _borrador = leerBorrador(r); _borrador.renombrar = true; pintar({ panel: true }); const n = _caja.querySelector('#dkiNombre'); if (n) n.focus(); }
      else if (a === 'categoria' && idx >= 0 && typeof window.openCategoryModal === 'function') window.openCategoryModal(idx);
      else if (a === 'botella' && r && window.BarStockBottlePicker) window.BarStockBottlePicker.open(r, () => pintar({ panel: !_borrador }));
      else if (a === 'info' && idx >= 0) window.openItemInfoModal(idx);
      // Lo comprado fuera de una orden (la tienda) entra a Pour·IQ como
      // "ordered", no al on hand: openStockIn de index.html, el de siempre.
      else if (a === 'recibido' && idx >= 0) window.openStockIn(idx);
      else if (a === 'cero' && idx >= 0 && typeof window.quickZeroSuggested === 'function') window.quickZeroSuggested(idx);
      else if (a === 'borrar') borrar();
      else if (a === 'guardar') guardar();
      return;
    }
    const pb = t.closest('[data-par]');
    if (pb) {
      const r = master()[idxDe(_sel)];
      const inp = _caja.querySelector('#dkiPar');
      if (r && inp) { inp.value = Math.max(0, num(inp.value) + Number(pb.dataset.par)); _borrador = leerBorrador(r); marcarSucio(); }
      return;
    }
    const v = t.closest('[data-vista]');
    if (v) { _vista = v.dataset.vista; pintar(); return; }
    const c = t.closest('[data-col]');
    if (c) { const k = c.dataset.col; if (_orden === k) _dir = -_dir; else { _orden = k; _dir = /nombre|vendor/.test(k) ? 1 : -1; } pintar(); return; }
    const f = t.closest('.dki-fila');
    if (f) elegir(f.dataset.item);
  }
  function alCambiar(ev) {
    const id = ev.target.id;
    if (id === 'dkiVendor') { _vendor = ev.target.value; pintar(); }
    else if (id === 'dkiOrden') { if (ev.target.value !== 'col') { _orden = ev.target.value; _dir = 1; } pintar(); }
    else if (/^dki(Vend|Par|Precio|Ov|Nombre|Codigo)$/.test(id)) { const r = master()[idxDe(_sel)]; if (r) { _borrador = leerBorrador(r); marcarSucio(); } }
  }
  function alEscribir(ev) {
    if (ev.target.id === 'dkiQ') { _q = ev.target.value; pintar(); }
    else if (/^dki(Par|Precio|Ov|Nombre|Codigo)$/.test(ev.target.id)) { const r = master()[idxDe(_sel)]; if (r) { _borrador = leerBorrador(r); marcarSucio(); } }
  }
  // Esc cierra el panel (antes que "volver al Home" de desk-shell), y ↑ ↓
  // pasan de producto con el panel abierto. Escribiendo en un campo, no.
  function alTeclado(ev) {
    if (!abierta() || !_sel) return;
    const t = ev.target;
    if (t && /^(input|textarea|select)$/i.test(t.tagName || '')) return;
    if (document.getElementById('mSheet') || document.querySelector('.modalbg:not(.hidden)')) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); elegir(_sel); }
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      const l = filas();
      const i = l.findIndex(r => r.item === _sel);
      const j = i + (ev.key === 'ArrowDown' ? 1 : -1);
      if (l[j]) { ev.preventDefault(); elegir(l[j].item); const f = _caja.querySelector('.dki-fila.sel'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' }); }
    }
  }

  function montar() {
    if (_caja) return;
    _sec = document.getElementById('inventorySection');
    if (!_sec) return;
    // dk-pantalla: la forma de las secciones (desk-shell.css). En el
    // teléfono no hace nada: sus reglas son de body.dk.
    _sec.classList.add('dk-pantalla', 'dk-inv-sec');
    _caja = document.createElement('div');
    _caja.id = 'dkInv';
    _caja.innerHTML = `<header class="dki-cabeza" id="dkiCabeza"></header>
      <div class="dki-pega" id="dkiPega"></div>
      <div class="dki-cuerpo"><div class="dki-lista" id="dkiLista"></div><aside class="dki-panel" id="dkiPanel" aria-label="Product"></aside></div>`;
    _sec.insertBefore(_caja, _sec.firstChild);
    _caja.addEventListener('click', alClic);
    _caja.addEventListener('change', alCambiar);
    _caja.addEventListener('input', alEscribir);
    _caja.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('dki-fila')) { ev.preventDefault(); elegir(ev.target.dataset.item); } });
    window.addEventListener('keydown', alTeclado, true);
    // Al abrirse la sección se pinta.
    new MutationObserver(() => { if (abierta()) pintar({ panel: true }); }).observe(_sec, { attributes: true, attributeFilter: ['class'] });
    // El tiempo real y lo que mueve los números: se repinta lo que se ve.
    const E = window.BarStockEvents;
    if (E && E.on) ['inventoryUpdated', 'ordersUpdated', 'parAdjustmentsUpdated'].forEach(n => E.on(n, repintar));
    if (LC() && LC().alCambiar) LC().alCambiar(repintar);
    window.addEventListener('resize', medirPega, { passive: true });
  }

  if (document.getElementById('inventorySection')) montar();
  else document.addEventListener('DOMContentLoaded', montar);

  window.BarStockDeskInventory = { montar, pintar, abierta, elegir: (n) => elegir(n), _estado: () => ({ sel: _sel, borrador: _borrador, vista: _vista, vendor: _vendor, orden: _orden, q: _q }) };
})();
