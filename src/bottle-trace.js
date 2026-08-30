(() => {
  if (window.BarStockBottleTrace) return;

  // ── Silueta desde tu foto ────────────────────────────────────────────
  //
  // Fotografías la botella, la IA lee sus bordes sobre esa foto, y tú
  // corriges arrastrando lo que no haya caído sobre el vidrio.
  //
  // ── Por qué se abandonó el umbral por color ─────────────────────────
  //
  // La primera versión recortaba comparando cada píxel con el color del
  // fondo. Falló por dos motivos, y el segundo no tiene arreglo:
  //
  //   1. Promediaba las cuatro esquinas en un solo color. En una foto
  //      real las de arriba son pared y las de abajo estante, así que el
  //      promedio no se parece a ninguna y media imagen contaba como
  //      botella.
  //
  //   2. El vidrio transparente ÓPTICAMENTE ES EL FONDO. Un Tito's
  //      contra una pared clara no tiene borde que umbralizar. Y eso es
  //      medio inventario: vodka, gin, tequila blanco, ron blanco.
  //
  // ── Por qué esta versión sí ─────────────────────────────────────────
  //
  // Al modelo no se le pide que RECUERDE la botella —ahí es donde se
  // inventa— sino que LEA la foto: a dieciséis alturas, dónde está cada
  // borde. Es percepción, y un modelo de visión distingue un borde de
  // vidrio de un fondo mucho mejor que una resta de colores.
  //
  // Y encima, lo que se guarda no es lo que dijo el modelo: es lo que
  // quedó en pantalla después de que tú lo miraras. Los tiradores son
  // arrastrables. En el caso bueno no tocas ninguno; en el peor, mueves
  // nueve. Nunca sale un resultado inservible, que es lo que pasaba
  // antes.

  const P = () => window.BarStockBottleProfiles;
  const $ = (id) => document.getElementById(id);

  const SEND_W = 760;        // ancho al que se manda la foto
  const HANDLES = 9;         // tiradores arrastrables

  let _row = null;
  let _onDone = null;
  let _dataUrl = null;
  let _imgW = 0, _imgH = 0;  // tamaño mostrado del <img>
  let _top = 0.12, _bottom = 0.92;
  let _cx = 0.5;             // eje de la botella, fracción del ancho
  let _hs = [];              // radio de cada tirador, fracción del ancho
  let _yFull = 0.78;
  let _drag = -1;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // ── Perfil a partir de los tiradores ─────────────────────────────────
  function profile() {
    const maxR = Math.max(..._hs);
    if (!(maxR > 0)) return null;
    const p = _hs.map((r, i) => [
      Number((i / (HANDLES - 1)).toFixed(4)),
      Number(Math.max(0.02, r / maxR).toFixed(4))
    ]);
    p[0][0] = 0;
    p[p.length - 1][0] = 1;
    return { yFull: Number(_yFull.toFixed(3)), p };
  }

  // ── Pintado ──────────────────────────────────────────────────────────
  function paint() {
    const host = $('btPreview');
    if (!host || !_dataUrl) return;

    const prof = profile();
    const okProf = prof && P().isValidProfile(prof);
    $('btSave').disabled = !okProf;

    // CANVAS, no <img>.
    //
    // En iOS una imagen de verdad en el DOM arrastra comportamientos del
    // sistema que no se pueden desactivar por completo: mantener pulsado
    // abre el menu de guardar, y arrastrar la arrastra a ella. Contra eso
    // no se gana con touch-action ni con user-select.
    //
    // Un canvas pinta exactamente lo mismo y Safari no lo trata como
    // imagen, asi que el problema desaparece de raiz en vez de taparse.
    host.innerHTML = `
      <div class="bt-stage" id="btStage">
        <canvas id="btCanvas"></canvas>
        <svg id="btSvg" preserveAspectRatio="none"></svg>
      </div>
      <div class="bt-tip">Drag the dots onto the edge of the bottle.</div>`;

    const im = new Image();
    im.onload = () => {
      const cv = $('btCanvas');
      if (!cv) return;
      cv.width = im.width; cv.height = im.height;
      cv.getContext('2d').drawImage(im, 0, 0);
      drawOverlay();
    };
    im.src = _dataUrl;
  }

  function drawOverlay() {
    const stage = $('btStage'), svg = $('btSvg'), cv = $('btCanvas');
    if (!stage || !svg || !cv) return;
    _imgW = cv.clientWidth; _imgH = cv.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${_imgW} ${_imgH}`);
    svg.setAttribute('width', _imgW);
    svg.setAttribute('height', _imgH);

    const X = (fx) => fx * _imgW;
    const Y = (fy) => fy * _imgH;
    const yAt = (i) => _bottom + (_top - _bottom) * (i / (HANDLES - 1));

    // El contorno que se está construyendo, cerrado por los dos lados
    let d = '';
    for (let i = 0; i < HANDLES; i++) d += (i ? ' L ' : 'M ') + X(_cx + _hs[i]) + ' ' + Y(yAt(i));
    for (let i = HANDLES - 1; i >= 0; i--) d += ' L ' + X(_cx - _hs[i]) + ' ' + Y(yAt(i));
    d += ' Z';

    svg.innerHTML = `
      <path d="${d}" class="bt-outline"/>
      <line x1="0" y1="${Y(_yFullImg())}" x2="${_imgW}" y2="${Y(_yFullImg())}" class="bt-full"/>
      ${_hs.map((r, i) => `
        <circle cx="${X(_cx + r)}" cy="${Y(yAt(i))}" r="26" class="bt-halo"/>
        <circle cx="${X(_cx + r)}" cy="${Y(yAt(i))}" r="12" class="bt-dot" data-i="${i}"/>
      `).join('')}`;
  }

  // La línea de lleno se guarda en coordenadas de la BOTELLA (0 base, 1
  // boca) pero se dibuja en coordenadas de la imagen.
  function _yFullImg() { return _bottom + (_top - _bottom) * _yFull; }

  function bindDrag() {
    const stage = $('btStage');
    if (!stage) return;

    // Las medidas van en PIXELES de pantalla, no en fracciones de 0 a 1.
    //
    // Antes se comparaba en fracciones, pero la foto es mucho mas alta
    // que ancha: 0.12 en vertical son muchos mas pixeles que 0.12 en
    // horizontal. Eso deformaba que punto se agarraba, y arriba —donde
    // los puntos quedan mas juntos en pantalla— fallaba casi siempre.
    const rect = () => $('btCanvas').getBoundingClientRect();

    const yAtPx = (i, r) => r.top + (
      (_bottom + (_top - _bottom) * (i / (HANDLES - 1))) * r.height);
    const xAtPx = (i, r) => r.left + (_cx + _hs[i]) * r.width;

    stage.addEventListener('pointerdown', (e) => {
      if (!_hs.length) return;
      e.preventDefault();
      const r = rect();

      let best = -1, bd = 1e9;
      for (let i = 0; i < HANDLES; i++) {
        const dx = e.clientX - xAtPx(i, r);
        const dy = e.clientY - yAtPx(i, r);
        const dd = Math.hypot(dx, dy);
        if (dd < bd) { bd = dd; best = i; }
      }
      const dFull = Math.abs(e.clientY -
        (r.top + (_bottom + (_top - _bottom) * _yFull) * r.height));

      // 60 px de radio de agarre: un dedo mide eso. Y el punto gana a la
      // linea salvo que la linea este claramente mas cerca.
      if (bd < 60) _drag = best;
      else if (dFull < 40) _drag = -2;
      else return;

      stage.setPointerCapture(e.pointerId);
      move(e);
    }, { passive: false });

    const move = (e) => {
      if (_drag === -1) return;
      e.preventDefault();
      const r = rect();
      if (_drag === -2) {
        const t = ((e.clientY - r.top) / r.height - _bottom) / (_top - _bottom);
        _yFull = Math.max(0.4, Math.min(0.96, t));
        $('btFullVal').textContent = Math.round(_yFull * 100) + '%';
      } else {
        const fx = (e.clientX - r.left) / r.width;
        _hs[_drag] = Math.max(0.01, Math.min(0.48, Math.abs(fx - _cx)));
      }
      drawOverlay();
      const pr = profile();
      $('btSave').disabled = !(pr && P().isValidProfile(pr));
    };

    stage.addEventListener('pointermove', move, { passive: false });
    stage.addEventListener('pointerup', () => { _drag = -1; });
    stage.addEventListener('pointercancel', () => { _drag = -1; });
  }

  // ── Foto → IA ────────────────────────────────────────────────────────
  function loadFile(file) {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        // Se reduce antes de mandarla: una foto de iPhone son varios MB y
        // no hacen falta para leer un contorno.
        const sc = Math.min(1, SEND_W / im.width);
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.width * sc);
        cv.height = Math.round(im.height * sc);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        _dataUrl = cv.toDataURL('image/jpeg', 0.82);

        // Punto de partida por si la IA falla: el arquetipo de su familia.
        seedFromArchetype();
        paint(); bindDrag();
        askAI();
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  // Punto de partida del modo manual: los nueve puntos en LINEA RECTA a
  // media altura de la imagen.
  //
  // Antes arrancaban sobre el arquetipo de la familia, y salia un
  // poligono con forma de rombo repartido por la foto: ni se parecia a
  // una botella ni se entendia que habia que arrastrarlo. Una columna
  // recta dice sola lo que hay que hacer — llevar cada punto al borde
  // del vidrio— y de paso no finge una precision que no tiene.
  function seedFromArchetype() {
    const fam = P().get(_row && _row.bottleShape) || P().get('generic');
    _top = 0.14; _bottom = 0.92; _cx = 0.5;
    _yFull = fam.yFull;
    _hs = new Array(HANDLES).fill(0.15);
    if ($('btFullVal')) $('btFullVal').textContent = Math.round(_yFull * 100) + '%';
  }

  async function askAI() {
    const st = $('btStatus');
    st.className = 'bt-hint';
    st.style.display = '';
    st.textContent = 'Reading the outline…';
    try {
      const res = await fetch('/api/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'photo', image: _dataUrl, name: _row ? _row.item : '' })
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || ('HTTP ' + res.status));

      _top = d.top; _bottom = d.bottom;

      // El eje es la mediana de los centros que leyó el modelo: si se
      // equivoca en un borde suelto, no arrastra a los demás.
      const centers = d.edges.map(e => (e[0] + e[1]) / 2).sort((a, b) => a - b);
      _cx = centers[Math.floor(centers.length / 2)];

      // Se remuestrea a nuestros nueve tiradores, de la base a la boca.
      _hs = [];
      for (let i = 0; i < HANDLES; i++) {
        const t = i / (HANDLES - 1);
        const j = Math.min(d.edges.length - 1, Math.round(t * (d.edges.length - 1)));
        _hs.push(Math.max(0.01, (d.edges[j][1] - d.edges[j][0]) / 2));
      }

      if (d.yFull != null) {
        _yFull = Math.max(0.4, Math.min(0.96, (d.yFull - _bottom) / (_top - _bottom)));
      }
      $('btFullVal').textContent = Math.round(_yFull * 100) + '%';

      st.textContent = 'Outline read. Drag any dot that missed the glass.';
      drawOverlay();
    } catch (e) {
      // Que la IA falle no bloquea nada: quedan los tiradores del
      // arquetipo y se colocan a mano. Nueve arrastres, siempre posible.
      st.className = 'bt-bad';
      st.textContent = 'Could not read it automatically (' + esc(e.message || e) +
                       '). Place the dots by hand.';
    }
  }

  // ── Guardar ──────────────────────────────────────────────────────────
  async function save() {
    const prof = profile();
    if (!prof || !_row) return;
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
        body: JSON.stringify({ bottle_profile: prof })
      });
      if (!res.ok) throw new Error(res.status + ' ' + (await res.text()).slice(0, 120));
      _row.bottleProfile = prof;
      close(true);
    } catch (e) {
      $('btSave').disabled = false;
      $('btSave').textContent = 'Save shape';
      const st = $('btStatus');
      st.style.display = ''; st.className = 'bt-bad';
      st.textContent = 'Could not save: ' + (e.message || e);
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
        <div class="bt-hint" id="btStatus">
          Photograph the bottle standing up, whole and filling most of the
          frame. Any background works.
        </div>
        <div id="btPreview"></div>
      </div>

      <div class="bt-foot">
        <label class="bt-file">
          <input type="file" accept="image/*" capture="environment" id="btFile">
          <i class="ti ti-camera" aria-hidden="true"></i> Take photo
        </label>
        <div class="bt-slider"><span>Full at <b id="btFullVal">78%</b></span></div>
        <button class="bt-save" id="btSave" type="button" disabled>Save shape</button>
      </div>`;
    document.body.appendChild(el);

    $('btBack').onclick = () => close(false);
    $('btSave').onclick = save;
    $('btFile').onchange = (e) => { if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]); };
    window.addEventListener('resize', () => { if ($('btPanel') && $('btPanel').classList.contains('on')) drawOverlay(); });
  }

  function open(row, onDone) {
    build();
    _row = row; _onDone = onDone || null;
    _dataUrl = null; _hs = []; _drag = -1;
    seedFromArchetype();
    $('btName').textContent = row ? row.item : '';
    $('btPreview').innerHTML = '';
    $('btStatus').style.display = '';
    $('btStatus').className = 'bt-hint';
    $('btStatus').textContent = 'Photograph the bottle standing up, whole and filling most of the frame. Any background works.';
    $('btSave').disabled = true;
    $('btSave').textContent = 'Save shape';
    $('btPanel').classList.add('on');
  }

  function close(saved) {
    const el = $('btPanel');
    if (el) el.classList.remove('on');
    const cb = _onDone;
    _row = null; _onDone = null; _dataUrl = null;
    if (cb) cb(!!saved);
  }

  window.BarStockBottleTrace = { open, close };
})();
