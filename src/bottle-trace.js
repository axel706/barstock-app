(() => {
  if (window.BarStockBottleTrace) return;

  // ── Silueta desde una foto ───────────────────────────────────────────
  //
  // Fotografías la botella contra una pared lisa y de ahí sale su perfil
  // exacto. Sin IA y sin red: procesamiento de imagen normal sobre un
  // canvas, en el propio teléfono.
  //
  // ── Por qué así y no con la IA ──────────────────────────────────────
  //
  // La IA describe de memoria y, cuando no conoce el producto, se lo
  // inventa con seguridad. Buscar la foto en internet arregla eso a medias
  // pero añade tres problemas: hace falta un buscador de imágenes de pago,
  // la primera imagen puede ser el producto equivocado —y entonces la
  // forma sale mal con total aplomo— y se roza el copyright.
  //
  // Tu foto no tiene ninguno de esos. Es ESA botella, la que de verdad
  // está en tu estante, y el resultado es determinista: la misma foto da
  // siempre el mismo perfil.
  //
  // ── Cómo se traza ───────────────────────────────────────────────────
  //
  // 1. Se toma el color del fondo de las cuatro esquinas
  // 2. Cada fila de la imagen se recorre buscando qué píxeles se apartan
  //    de ese color: son la botella
  // 3. El radio de esa fila es la mitad de la distancia entre el primero
  //    y el último
  // 4. Se suaviza, se normaliza y se reduce a catorce puntos
  //
  // Nada de esto adivina: mide. Y como el umbral depende de la luz, hay
  // un deslizador para ajustarlo, con el contorno dibujado encima de la
  // foto para verlo al instante. Ese dibujo es lo importante: un trazado
  // malo se ve antes de guardarse, no después de contar con él.

  const P = () => window.BarStockBottleProfiles;
  const $ = (id) => document.getElementById(id);

  const W = 260;             // ancho al que se reduce la foto para trabajar
  const POINTS = 14;         // puntos de control del perfil final

  let _row = null;
  let _onDone = null;
  let _img = null;           // ImageData de la foto reducida
  let _prof = null;          // perfil trazado
  let _thr = 42;             // umbral de separación con el fondo
  let _yFull = 0.78;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // ── Trazado ──────────────────────────────────────────────────────────
  function trace(img, thr) {
    const { data, width, height } = img;
    const at = (x, y) => {
      const i = (y * width + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };

    // El fondo se toma de las esquinas, no de un valor fijo: así funciona
    // igual contra una pared blanca que contra una de madera.
    const corners = [at(2, 2), at(width - 3, 2), at(2, height - 3), at(width - 3, height - 3)];
    const bg = [0, 1, 2].map(c => corners.reduce((a, k) => a + k[c], 0) / corners.length);
    const far = (px) => Math.abs(px[0] - bg[0]) + Math.abs(px[1] - bg[1]) + Math.abs(px[2] - bg[2]) > thr * 3;

    const rows = [];
    for (let y = 0; y < height; y++) {
      let lo = -1, hi = -1, n = 0;
      for (let x = 0; x < width; x++) {
        if (far(at(x, y))) { if (lo < 0) lo = x; hi = x; n++; }
      }
      // Una fila con cuatro píxeles sueltos es ruido, no vidrio.
      rows.push(n >= 4 ? { lo, hi, w: hi - lo } : null);
    }

    const first = rows.findIndex(r => r);
    let last = -1;
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i]) { last = i; break; }
    if (first < 0 || last - first < 20) return null;

    // El centro es la mediana de los centros: una etiqueta o una sombra
    // desplazan alguna fila, pero no la mayoría.
    const centers = [];
    for (let y = first; y <= last; y++) if (rows[y]) centers.push((rows[y].lo + rows[y].hi) / 2);
    centers.sort((a, b) => a - b);

    // Radio por fila, de la BASE hacia arriba, que es como se define el
    // perfil. En la imagen la base está abajo, así que se recorre al revés.
    const raw = [];
    for (let y = last; y >= first; y--) {
      const r = rows[y];
      raw.push(r ? r.w / 2 : (raw.length ? raw[raw.length - 1] : 0));
    }

    // Suavizado: el borde de una foto tiembla un píxel por fila y sin esto
    // el perfil sale con dientes de sierra.
    const sm = raw.map((_, i) => {
      let s = 0, n = 0;
      for (let k = -3; k <= 3; k++) {
        const j = i + k;
        if (j >= 0 && j < raw.length) { s += raw[j]; n++; }
      }
      return s / n;
    });

    const maxR = Math.max(...sm);
    if (!(maxR > 0)) return null;

    // Reducción a puntos de control, repartidos por altura.
    const p = [];
    for (let i = 0; i < POINTS; i++) {
      const t = i / (POINTS - 1);
      const idx = Math.min(sm.length - 1, Math.round(t * (sm.length - 1)));
      p.push([Number(t.toFixed(4)), Number(Math.max(0.02, sm[idx] / maxR).toFixed(4))]);
    }
    p[0][0] = 0;
    p[p.length - 1][0] = 1;

    return { yFull: _yFull, p };
  }

  // ── Pintado ──────────────────────────────────────────────────────────
  function paint() {
    const host = $('btPreview');
    if (!host || !_img) return;

    _prof = trace(_img, _thr);

    if (!_prof || !P().isValidProfile(_prof)) {
      host.innerHTML = `<div class="bt-bad">No bottle found. Try a plainer background,
        or move the slider.</div>`;
      $('btSave').disabled = true;
      return;
    }
    $('btSave').disabled = false;

    // El contorno trazado se dibuja ENCIMA de la foto. Es lo que convierte
    // esto en verificable: si el trazo no sigue el vidrio, se ve aquí.
    host.innerHTML = `
      <div class="bt-stage">
        <canvas id="btPhoto"></canvas>
        <svg viewBox="0 0 200 260" preserveAspectRatio="none">
          <path d="${P().pathFor(_prof, 200, 260, 0)}" class="bt-outline"/>
          <line x1="0" y1="${260 - _yFull * 260}" x2="200" y2="${260 - _yFull * 260}"
                class="bt-full"/>
        </svg>
        <div class="bt-fullgrab" id="btFullGrab"></div>
      </div>`;

    // La foto se repinta debajo del trazo
    const cv = $('btPhoto');
    cv.width = _img.width; cv.height = _img.height;
    cv.getContext('2d').putImageData(_img, 0, 0);

    positionFull();
    bindFull();
  }

  function positionFull() {
    const st = document.querySelector('.bt-stage'), g = $('btFullGrab');
    if (!st || !g) return;
    g.style.top = ((1 - _yFull) * st.clientHeight) + 'px';
  }

  function bindFull() {
    const st = document.querySelector('.bt-stage');
    if (!st) return;
    let drag = false;
    const move = (clientY) => {
      const r = st.getBoundingClientRect();
      _yFull = Math.max(0.45, Math.min(0.95, 1 - (clientY - r.top) / r.height));
      if (_prof) _prof.yFull = _yFull;
      const line = st.querySelector('.bt-full');
      if (line) { line.setAttribute('y1', 260 - _yFull * 260); line.setAttribute('y2', 260 - _yFull * 260); }
      positionFull();
      $('btFullVal').textContent = Math.round(_yFull * 100) + '%';
    };
    st.addEventListener('pointerdown', (e) => { drag = true; st.setPointerCapture(e.pointerId); move(e.clientY); });
    st.addEventListener('pointermove', (e) => { if (drag) move(e.clientY); });
    st.addEventListener('pointerup', () => { drag = false; });
    st.addEventListener('pointercancel', () => { drag = false; });
  }

  // ── Cargar la foto ───────────────────────────────────────────────────
  function loadFile(file) {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const scale = W / im.width;
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = Math.round(im.height * scale);
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(im, 0, 0, cv.width, cv.height);
        _img = cx.getImageData(0, 0, cv.width, cv.height);
        $('btHint').style.display = 'none';
        paint();
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  // ── Guardar ──────────────────────────────────────────────────────────
  async function save() {
    if (!_prof || !_row) return;
    $('btSave').disabled = true;
    $('btSave').textContent = 'Saving…';

    const c = window.BARSTOCK_CONFIG || {};
    try {
      const locationId = await window.BarStockInventoryCloud.fetchLocationId();
      let u = `${c.SUPABASE_URL}/rest/v1/inventory_items?location_id=eq.${locationId}` +
              `&item_name=eq.${encodeURIComponent(_row.item)}`;
      if (_row.code) u += `&code=eq.${encodeURIComponent(_row.code)}`;
      const res = await fetch(u, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: c.SUPABASE_KEY,
          Authorization: `Bearer ${c.SUPABASE_KEY}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ bottle_profile: _prof })
      });
      if (!res.ok) throw new Error(res.status + ' ' + (await res.text()).slice(0, 120));

      _row.bottleProfile = _prof;
      close(true);
    } catch (e) {
      $('btSave').disabled = false;
      $('btSave').textContent = 'Save shape';
      const h = $('btHint');
      h.style.display = '';
      h.className = 'bt-bad';
      h.textContent = 'Could not save: ' + (e.message || e);
    }
  }

  // ── Panel ────────────────────────────────────────────────────────────
  function build() {
    if ($('btPanel')) return;
    const el = document.createElement('div');
    el.id = 'btPanel';
    el.className = 'bt-panel';
    el.innerHTML = `
      <div class="bt-head">
        <button class="sc-x" id="btBack" type="button" aria-label="Back">
          <i class="ti ti-arrow-left" aria-hidden="true"></i>
        </button>
        <div>
          <div class="bt-title">Trace this bottle</div>
          <div class="bt-name" id="btName"></div>
        </div>
      </div>

      <div class="bt-body">
        <div class="bt-hint" id="btHint">
          Stand the bottle against a plain wall, fill most of the frame,
          and keep the whole bottle in shot. The outline is traced on your
          phone — nothing is uploaded.
        </div>
        <div id="btPreview"></div>
      </div>

      <div class="bt-foot">
        <label class="bt-file">
          <input type="file" accept="image/*" capture="environment" id="btFile">
          <i class="ti ti-camera" aria-hidden="true"></i> Take photo
        </label>
        <div class="bt-slider">
          <span>Edge</span>
          <input type="range" min="12" max="110" value="42" id="btThr">
        </div>
        <div class="bt-slider">
          <span>Full at <b id="btFullVal">78%</b></span>
        </div>
        <button class="bt-save" id="btSave" type="button" disabled>Save shape</button>
      </div>`;
    document.body.appendChild(el);

    $('btBack').onclick = () => close(false);
    $('btSave').onclick = save;
    $('btFile').onchange = (e) => { if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]); };
    $('btThr').oninput = (e) => { _thr = Number(e.target.value); paint(); };
  }

  function open(row, onDone) {
    build();
    _row = row;
    _onDone = onDone || null;
    _img = null; _prof = null; _thr = 42;

    // El punto de partida de la línea de lleno es el del arquetipo de su
    // familia, que es mejor que un número inventado.
    const fam = P().get(row && row.bottleShape) || P().get('generic');
    _yFull = fam.yFull;
    $('btFullVal').textContent = Math.round(_yFull * 100) + '%';

    $('btName').textContent = row ? row.item : '';
    $('btThr').value = 42;
    $('btHint').style.display = '';
    $('btHint').className = 'bt-hint';
    $('btHint').textContent = 'Stand the bottle against a plain wall, fill most of the frame, and keep the whole bottle in shot. The outline is traced on your phone — nothing is uploaded.';
    $('btPreview').innerHTML = '';
    $('btSave').disabled = true;
    $('btSave').textContent = 'Save shape';
    $('btPanel').classList.add('on');
  }

  function close(saved) {
    const el = $('btPanel');
    if (el) el.classList.remove('on');
    const cb = _onDone;
    _row = null; _onDone = null; _img = null;
    if (cb) cb(!!saved);
  }

  window.BarStockBottleTrace = { open, close, trace };
})();
