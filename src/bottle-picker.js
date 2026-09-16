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
  // La caja es la MISMA para las diecisiete y eso es el punto: lo que se
  // fija es la altura, así que lo único que cambia entre una celda y otra
  // es la silueta. Si cada una se dibujara a su tamaño, elegir sería
  // comparar botellas grandes contra botellas chicas en vez de formas
  // contra formas.
  const VB = { w: 74, h: 96, pad: 5 };

  function sil(key) {
    return `<svg viewBox="0 0 ${VB.w} ${VB.h}" class="ac-sil bp-sil" aria-hidden="true">
      <path d="${P().pathFor(key, VB.w, VB.h, VB.pad)}"/></svg>`;
  }

  // ── Pintar ───────────────────────────────────────────────────────────
  function paint() {
    const V = P();
    const keys = V.pickable();

    const cells = keys.map(k => {
      const prof = V.get(k);
      // `none` no es una botella, es "esto se cuenta entero". Se dibuja
      // distinto a propósito para que no parezca una forma más entre las
      // demás: quien la elija está apagando el deslizador, no eligiendo
      // una silueta.
      const isNone = (k === 'none');
      const sub = isNone ? 'sin deslizador' : `${prof.asp} : 1`;
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

      <div class="bp-sizes-label">Tamaño del envase (ml)</div>
      <div class="bp-sizes">${sizeChips}</div>

      <div class="ac-foot">
        <button class="ac-cancel" type="button">Cancelar</button>
        <button class="ac-ok" type="button" id="bpSave">Guardar</button>
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

  // ── Guardar ──────────────────────────────────────────────────────────
  //
  // Escribe en la nube PRIMERO y en memoria después. Al revés, un fallo de
  // red dejaría la pantalla diciendo que la forma cambió y la base de
  // datos con la anterior, y eso no se nota hasta el siguiente conteo.
  async function save() {
    if (!_row || !_shape) { close(); return; }

    const nada = (_shape === 'none');
    const nuevoSize = nada ? null : _size;

    body(`<div class="ac-status"><i class="ti ti-loader" aria-hidden="true"></i> Guardando…</div>`);

    const c = window.BARSTOCK_CONFIG || {};
    const url = c.SUPABASE_URL, key = c.SUPABASE_KEY;

    let locationId = null;
    try { locationId = await window.BarStockInventoryCloud.fetchLocationId(); }
    catch (e) {
      body(`<div class="ac-status">No se pudo alcanzar la base de datos.</div>`);
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
      body(`<div class="ac-status">No se pudo guardar. La forma anterior sigue puesta.</div>`);
      setTimeout(paint, 2200);
      return;
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
      window.setStatus(`Silueta de '${_row ? _row.item : ''}' actualizada.`);
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
    build();
    document.getElementById('bpModalBg').classList.remove('hidden');
    paint();
  }

  function build() {
    if (document.getElementById('bpModalBg')) return;
    const bg = document.createElement('div');
    bg.id = 'bpModalBg';
    bg.className = 'modalbg hidden';
    bg.innerHTML = `<div class="modal ac-modal bp-modal">
      <div class="ac-head"><i class="ti ti-bottle" aria-hidden="true"></i> Silueta de la botella</div>
      <div id="bpBody"></div>
    </div>`;
    document.body.appendChild(bg);
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
  }

  function close() {
    const bg = document.getElementById('bpModalBg');
    if (bg) bg.classList.add('hidden');
    _row = null; _onSaved = null;
  }

  function body(html) {
    const el = document.getElementById('bpBody');
    if (el) el.innerHTML = html;
  }

  window.BarStockBottlePicker = { open, close, SIZES };
})();
