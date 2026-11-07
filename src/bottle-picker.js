(() => {
  if (window.BarStockBottlePicker) return;

  // ── Cambiar la silueta de UN producto ────────────────────────────────
  //
  // El botón de asignación por lote resuelve trescientos artículos con
  // reglas y deja cada uno con la forma de su categoría. Eso acierta en la
  // mayoría y falla en las de siempre: la Crown Royal que no se parece a
  // ningún whiskey, el licor que viene en botella de coñac.
  //
  // Esto es el arreglo de esos casos. Un producto, una elección, y se
  // queda: la forma elegida a mano pisa la de la categoría y el lote no
  // vuelve a tocarla, porque el asignador solo mira los que NO tienen
  // forma.
  //
  // Vive en su propio archivo y no dentro del panel de conteo ni del modal
  // de edición porque se abre desde los dos. Si estuviera en uno de ellos,
  // el otro tendría una copia, y el día que se añada una silueta habría
  // dos parrillas que actualizar y una se quedaría atrás.

  const P = () => window.BarStockBottleProfiles;

  const SIZES = [50, 187, 200, 250, 330, 355, 375, 473, 500, 700, 750, 1000, 1500, 1750, 3000];

  let _row = null;
  let _shape = null;
  let _size = 750;
  let _onSaved = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // ── Dibujo ───────────────────────────────────────────────────────────
  //
  // La caja es la MISMA para todas y eso es el punto: lo que se fija es la
  // altura, así que lo único que cambia entre una celda y otra es la
  // silueta. Si cada una se dibujara a su tamaño, elegir sería comparar
  // botellas grandes contra botellas chicas en vez de formas contra
  // formas.
  const VB = { w: 74, h: 96, pad: 5 };

  function sil(key) {
    return `<svg viewBox="0 0 ${VB.w} ${VB.h}" class="ac-sil bp-sil" aria-hidden="true">
      <path d="${P().pathFor(key, VB.w, VB.h, VB.pad)}"/>${P().asaFor && P().asaFor(key, VB.w, VB.h, VB.pad)
        ? `<path d="${P().asaFor(key, VB.w, VB.h, VB.pad)}"/>` : ''}</svg>`;
  }

  // ── El orden de la parrilla: A–Z ─────────────────────────────────────
  //
  // Estuvo de gorda a flaca: con diecisiete formas ponía juntas las
  // parecidas y las nuevas no aterrizaban al final, fuera de la pantalla
  // ("no veo estas últimas 2 botellas"). Con más de ochenta, casi todas
  // con nombre de marca, ya no se busca por forma sino por nombre, y
  // ordenadas por esbeltez no había manera de encontrar "Campari". Axel
  // pidió A–Z por defecto, y la búsqueda de arriba hace el resto.
  //
  // `none` va aparte y al final: no es una botella, es apagar el
  // deslizador.
  const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function ordenadas(V) {
    return V.pickable()
      .filter(k => k !== 'none')
      .sort((a, b) => norm(V.get(a).name).localeCompare(norm(V.get(b).name), 'en', { numeric: true }))
      .concat(V.pickable().includes('none') ? ['none'] : []);
  }

  // Las que coinciden con lo escrito, por nombre o por clave, sin
  // acentos: "bacardi" encuentra "Bacardí" y "patron" a "Patrón".
  function filtradas(V, q) {
    const n = norm(q).trim();
    const todas = ordenadas(V);
    if (!n) return todas;
    return todas.filter(k => norm(V.get(k).name).includes(n) || norm(k.replace(/_/g, ' ')).includes(n));
  }

  // ── Sugeridas para ESTE producto ─────────────────────────────────────
  //
  // La que tiene puesta, la que le pondría la asignación automática por
  // el nombre y la de su categoría. Son las mismas reglas de
  // bottle-assign.js, no otras: si allí se corrige una regla, aquí se
  // sugiere lo corregido. Casi siempre la buena está entre estas tres.
  function sugeridas(V) {
    const A = window.BarStockBottleAssign;
    const out = [];
    const poner = (k, por) => {
      if (!k || k === 'generic' || out.some(x => x.k === k)) return;
      if (!V.pickable().includes(k)) return;
      out.push({ k, por });
    };
    const actual = _row && _row.bottleShape ? V.resolveKey(_row.bottleShape) : null;
    poner(actual, 'Current');
    if (A && A.byRules && _row) {
      try { poner(A.byRules({ item: _row.item || '' }).shape, 'By name'); } catch (e) {}
      try { if (_row.category) poner(A.byRules({ item: '', category: _row.category }).shape, 'Its category'); } catch (e) {}
    }
    return out.slice(0, 3);
  }

  // ── Pintar ───────────────────────────────────────────────────────────
  // En el teléfono es una hoja desde abajo; en el escritorio, el modal de
  // siempre. Lo demás (el orden, las sugeridas, guardar) es lo mismo.
  let _movil = false;
  let _q = '';
  function paint() { return _movil ? pintarHoja() : pintarModal(); }

  function pintarModal() {
    const V = P();
    const keys = ordenadas(V);

    const cells = keys.map(k => {
      const prof = V.get(k);
      // `none` no es una botella, es "esto se cuenta entero". Se dibuja
      // distinto a propósito para que no parezca una forma más entre las
      // demás: quien la elija está apagando el deslizador, no eligiendo
      // una silueta.
      const isNone = (k === 'none');
      const sub = isNone ? 'counted whole' : `${prof.asp} : 1`;
      return `
        <div class="ac-cell bp-cell${k === _shape ? ' on' : ''}${isNone ? ' bp-none' : ''}"
             data-k="${esc(k)}" role="button" tabindex="0">
          ${isNone
            ? `<div class="bp-nonebox"><i class="ti ti-package" aria-hidden="true"></i></div>`
            : sil(k)}
          <span class="ac-cell-name">${esc(prof.name)}</span>
          <span class="ac-cell-sub">${esc(sub)}</span>
        </div>`;
    }).join('');

    const sizeChips = SIZES.map(s =>
      `<button type="button" class="bp-size${Number(s) === Number(_size) ? ' on' : ''}"
               data-s="${s}">${s}</button>`).join('');

    body(`
      <div class="ac-sum bp-item">${esc(_row.item || '')}</div>

      <div class="ac-grid bp-grid">${cells}</div>

      <!-- "Size you order" y no "bottle size": desde que un codigo de
           barras lleva su propio tamaño hay DOS en juego, y confundirlos
           sale caro. Este es el del producto —la botella que se le pide
           al proveedor— y es el divisor del que sale el on hand; el otro
           es el de la botella concreta que se escaneo. -->
      <div class="bp-sizes-label">Size you order</div>
      <div class="bp-sizes">${sizeChips}</div>

      <div class="ac-foot">
        <button class="ac-cancel" type="button">Cancel</button>
        <button class="ac-ok" type="button" id="bpSave">Save</button>
      </div>`);

    const el = document.getElementById('bpBody');

    el.querySelectorAll('.bp-cell').forEach(c => {
      const pick = () => { _shape = c.dataset.k; paint(); };
      c.onclick = pick;
      c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
    });

    el.querySelectorAll('.bp-size').forEach(b => {
      b.onclick = () => { _size = Number(b.dataset.s); paint(); };
    });

    el.querySelector('.ac-cancel').onclick = close;
    el.querySelector('#bpSave').onclick = save;

    // La elegida queda a la vista aunque esté abajo del todo. Abrir el
    // selector de una Crown Royal y ver la parrilla arriba, sin saber cuál
    // está puesta, obliga a buscarla a ojo entre diecisiete.
    const on = el.querySelector('.bp-cell.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  // ── La hoja del teléfono ─────────────────────────────────────────────
  //
  // El modal del escritorio en el teléfono era una caja con su propio
  // scroll y los botones al fondo: no se sentía de la app. Diseño que
  // Axel eligió sobre lámina: hoja desde abajo como la ficha de producto,
  // búsqueda arriba, tres sugeridas y luego todas en rejilla A–Z; el
  // tamaño y Cancel / Save quedan fijos abajo.
  //
  // La búsqueda se pinta UNA vez: si se repintara con cada letra, el
  // teclado del teléfono se cerraría a cada pulsación. Al escribir solo
  // se repinta la rejilla.
  function celda(k, por) {
    const V = P();
    const prof = V.get(k);
    const isNone = (k === 'none');
    return `
      <div class="bp-c${k === _shape ? ' on' : ''}${isNone ? ' bp-none' : ''}" data-k="${esc(k)}" role="button" tabindex="0">
        ${isNone ? `<div class="bp-nonebox"><i class="ti ti-package" aria-hidden="true"></i></div>` : sil(k)}
        <span class="bp-cn">${esc(prof.name)}</span>
        ${por ? `<span class="bp-cs">${esc(por)}</span>` : ''}
      </div>`;
  }

  function pintarHoja() {
    const h = document.getElementById('bpSheet');
    const el = document.getElementById('bpBody');
    if (!h || !el) return;
    const sizeChips = SIZES.map(s =>
      `<button type="button" class="bp-size${Number(s) === Number(_size) ? ' on' : ''}" data-s="${s}">${s}</button>`).join('');
    el.innerHTML = `
      <div class="bp-top">
        <div class="m-sheet-grip"></div>
        <div class="bp-k">Bottle shape</div>
        <div class="bp-item">${esc(_row.item || '')}</div>
        <div class="m-searchbar on bp-busca">
          <i class="ti ti-search" aria-hidden="true"></i>
          <input id="bpQ" type="search" inputmode="search" autocomplete="off"
                 placeholder="Search bottles" aria-label="Search bottles" value="${esc(_q)}">
          <button type="button" id="bpClear" aria-label="Clear"><i class="ti ti-x" aria-hidden="true"></i></button>
        </div>
      </div>
      <div class="bp-scroll" id="bpRej"></div>
      <div class="bp-pie">
        <div class="bp-sizes-label">Size you order</div>
        <div class="bp-sizes">${sizeChips}</div>
        <div class="bp-acts">
          <button type="button" class="bp-b2" id="bpCancel">Cancel</button>
          <button type="button" class="bp-b" id="bpSave">Save</button>
        </div>
      </div>`;

    const inp = el.querySelector('#bpQ');
    inp.oninput = () => { _q = inp.value; pintarRejilla(); };
    el.querySelector('#bpClear').onclick = () => { _q = ''; inp.value = ''; pintarRejilla(); inp.focus(); };
    el.querySelectorAll('.bp-size').forEach(b => {
      b.onclick = () => {
        _size = Number(b.dataset.s);
        el.querySelectorAll('.bp-size').forEach(x => x.classList.toggle('on', x === b));
      };
    });
    el.querySelector('#bpCancel').onclick = close;
    el.querySelector('#bpSave').onclick = save;
    // La fila de tamaños se desliza de lado y empieza en 50: el elegido
    // (casi siempre 750) quedaba fuera. Se centra en él. Con scrollLeft y
    // no scrollIntoView, que movería también la hoja hacia arriba.
    const fila = el.querySelector('.bp-sizes'), elegido = el.querySelector('.bp-size.on');
    if (fila && elegido) fila.scrollLeft = Math.max(0, elegido.offsetLeft - fila.offsetLeft - (fila.clientWidth - elegido.offsetWidth) / 2);
    pintarRejilla();
  }

  function pintarRejilla() {
    const V = P();
    const caja = document.getElementById('bpRej');
    if (!caja) return;
    const q = String(_q || '').trim();
    const lista = filtradas(V, q);
    // Con algo escrito, las sugeridas sobran: se busca otra cosa.
    const sug = q ? [] : sugeridas(V);
    caja.innerHTML =
      (sug.length ? `<div class="bp-lbl">Suggested for this product</div>
        <div class="bp-rej">${sug.map(x => celda(x.k, x.por)).join('')}</div>` : '') +
      `<div class="bp-lbl">${q ? lista.length + (lista.length === 1 ? ' match' : ' matches') : 'All bottles · A–Z'}</div>` +
      (lista.length
        ? `<div class="bp-rej">${lista.map(k => celda(k)).join('')}</div>`
        : `<p class="bp-nada">No bottle shape called "${esc(q)}".</p>`);
    caja.querySelectorAll('.bp-c').forEach(c => {
      const pick = () => {
        _shape = c.dataset.k;
        caja.querySelectorAll('.bp-c').forEach(x => x.classList.toggle('on', x.dataset.k === _shape));
      };
      c.onclick = pick;
      c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
    });
  }

  // ── Guardar ──────────────────────────────────────────────────────────
  //
  // Escribe en la nube PRIMERO y en memoria después. Al revés, un fallo de
  // red dejaría la pantalla diciendo que la forma cambió y la base de
  // datos con la anterior, y eso no se nota hasta el siguiente conteo.
  async function save() {
    if (!_row || !_shape) { close(); return; }

    const nada = (_shape === 'none');
    const nuevoSize = nada ? null : _size;

    body(`<div class="ac-status"><i class="ti ti-loader" aria-hidden="true"></i> Saving…</div>`);

    const c = window.BARSTOCK_CONFIG || {};
    const url = c.SUPABASE_URL, key = c.SUPABASE_KEY;

    let locationId = null;
    try { locationId = await window.BarStockInventoryCloud.fetchLocationId(); }
    catch (e) {
      body(`<div class="ac-status">Could not reach the database.</div>`);
      setTimeout(paint, 1800);
      return;
    }

    try {
      let u = `${url}/rest/v1/inventory_items?location_id=eq.${locationId}` +
              `&item_name=eq.${encodeURIComponent(_row.item)}`;
      if (_row.code) u += `&code=eq.${encodeURIComponent(_row.code)}`;

      const res = await fetch(u, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: key, Authorization: `Bearer ${key}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ bottle_shape: _shape, bottle_size_ml: nuevoSize })
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      console.warn('[silueta] no se pudo guardar', e);
      body(`<div class="ac-status">Couldn't save. The previous shape is still set.</div>`);
      setTimeout(paint, 2200);
      return;
    }

    // Y al mapa GLOBAL, que es lo que hace que la forma valga en las dos
    // barras. Sin esto, arreglar la silueta de un Beefeater en The Crown
    // no servía de nada en Will's & Bill's, aunque el código de barras sí
    // se reconociera: la forma vivía en la fila de inventario, que es por
    // locación. Va después del PATCH local y sin bloquear el cierre.
    if (window.BarStockItemShapes) {
      window.BarStockItemShapes.save(_row.item, _row.code || '', _shape, nuevoSize);
    }

    // Se muta la fila que ya está en memoria en vez de sustituirla. La
    // pantalla de conteo puede tener una referencia a este mismo objeto
    // abierta en ese momento; si se reemplazara, seguiría dibujando la
    // forma vieja hasta cerrarla.
    _row.bottleShape = _shape;
    _row.bottleSizeMl = nuevoSize;

    const m = ((window.state && window.state.master) || [])
      .find(r => r.item === _row.item && (!_row.code || r.code === _row.code));
    if (m && m !== _row) { m.bottleShape = _shape; m.bottleSizeMl = nuevoSize; }

    const cb = _onSaved;
    close();
    if (typeof window.render === 'function') window.render();
    if (typeof window.setStatus === 'function') {
      window.setStatus(`Bottle shape updated for ${_row ? _row.item : ''}`);
    }
    if (cb) cb(_shape, nuevoSize);
  }

  // ── Abrir y cerrar ───────────────────────────────────────────────────
  function open(row, onSaved) {
    if (!row || !P()) return;
    _row = row;
    _onSaved = onSaved || null;
    // Una fila antigua puede traer una clave que ya no existe con ese
    // nombre ('burgundy'). Se resuelve a la actual para que la parrilla
    // marque la que de verdad se está usando y no salga ninguna marcada.
    _shape = P().resolveKey(row.bottleShape);
    if (_shape === 'generic') _shape = null;
    _size = Number(row.bottleSizeMl) || 750;
    _q = '';
    _movil = !!(document.body && document.body.classList.contains('m-shell') &&
      window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
    if (_movil) { abrirHoja(); return; }
    build();
    document.getElementById('bpModalBg').classList.remove('hidden');
    paint();
  }

  // Id propio y no `mSheet`: desde Inventory el selector se abre ENCIMA
  // de la ficha de producto, que ya es `#mSheet`, y dos con el mismo id
  // hacían que quitar uno quitara el otro.
  function abrirHoja() {
    const vieja = document.getElementById('bpSheet');
    if (vieja) vieja.remove();
    const h = document.createElement('div');
    h.className = 'm-sheet bp-sheet';
    h.id = 'bpSheet';
    h.innerHTML = `<div class="m-sheet-bg"></div>
      <div class="m-sheet-box bp-box" role="dialog" aria-label="Bottle shape"><div id="bpBody"></div></div>`;
    document.body.appendChild(h);
    h.querySelector('.m-sheet-bg').onclick = close;
    pintarHoja();
    if (window.BarStockSheet) window.BarStockSheet.enganchar(h, close);
    // La elegida a la vista: con ochenta, si está abajo no se encuentra.
    const on = h.querySelector('.bp-c.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  function build() {
    if (document.getElementById('bpModalBg')) return;
    const bg = document.createElement('div');
    bg.id = 'bpModalBg';
    bg.className = 'modalbg hidden';
    bg.innerHTML = `<div class="modal ac-modal bp-modal">
      <div class="ac-head"><i class="ti ti-bottle" aria-hidden="true"></i> Bottle shape</div>
      <div id="bpBody"></div>
    </div>`;
    document.body.appendChild(bg);
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
  }

  function close() {
    const bg = document.getElementById('bpModalBg');
    if (bg) bg.classList.add('hidden');
    const h = document.getElementById('bpSheet');
    if (h) h.remove();
    _row = null; _onSaved = null;
  }

  function body(html) {
    const el = document.getElementById('bpBody');
    if (el) el.innerHTML = html;
  }

  window.BarStockBottlePicker = { open, close, SIZES, _ordenadas: () => ordenadas(P()), _filtradas: (q) => filtradas(P(), q) };
})();
