(() => {
  if (window.BarStockCountPanel) return;

  // ── Panel del artículo ───────────────────────────────────────────────
  //
  // Se abre después de escanear. Dos formas de contar, porque son dos
  // cosas distintas:
  //
  //   SELLADAS  con + y −. Son enteros y se ven de un vistazo. Nada de
  //             teclado: quien cuenta tiene una botella en la otra mano.
  //
  //   ABIERTAS  con el deslizador sobre la silueta de SU botella. La
  //             altura se convierte en volumen usando la geometría real,
  //             que es lo único que distingue esto de estimar por
  //             décimas a ojo.
  //
  // Pueden coexistir varias abiertas: la de la barra y la de la bodega
  // son dos botellas y las dos cuentan. Se guardan por separado para que
  // corregir la segunda no obligue a rehacer la primera.
  //
  // ── Lo que NO hace ──────────────────────────────────────────────────
  //
  // No toca inventory_items. Escribe en la sesión, que vive en el
  // dispositivo. El inventario se actualiza solo al cerrar el conteo, en
  // un paso aparte y con respaldo previo.

  const S = () => window.BarStockCountSession;
  const P = () => window.BarStockBottleProfiles;

  let _row = null;         // artículo de state.master
  let _sealed = 0;
  let _opens = [];         // fracciones, 0..1
  let _active = -1;        // índice de la abierta que está editando
  let _onNext = null;
  let _dragging = false;

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // Sin forma asignada se cae a 'generic', que es una botella. Antes se
  // caia a 'cylinder', que es un rectangulo perfecto: la forma de control
  // del banco de pruebas. Por eso el deslizador salia cuadrado.
  // El perfil PROPIO del producto manda sobre el arquetipo de su familia:
  // la botella de Patron no es la de Casamigos aunque las dos sean
  // tequila. Si no hay perfil propio, se cae al arquetipo, y si tampoco,
  // a generic.
  function shapeOf(row) {
    if (row && row.bottleProfile && P() && P().isValidProfile(row.bottleProfile)) {
      return row.bottleProfile;
    }
    const k = row && row.bottleShape;
    return (P() && P().get(k)) ? k : 'generic';
  }

  function shapeIsSet(row) {
    if (row && row.bottleProfile) return true;
    return !!(row && row.bottleShape && P() && P().get(row.bottleShape));
  }

  function pourable(row) {
    const p = P() && P().get(shapeOf(row));
    return p ? p.pourable !== false : true;
  }

  function total() {
    return _sealed + _opens.reduce((a, b) => a + b, 0);
  }

  // ── Estructura ───────────────────────────────────────────────────────
  function build() {
    if ($('cpPanel')) return;
    const el = document.createElement('div');
    el.id = 'cpPanel';
    el.className = 'cp-panel';
    el.innerHTML = `
      <div class="cp-head">
        <button class="sc-x" id="cpBack" type="button" aria-label="Back">
          <i class="ti ti-arrow-left" aria-hidden="true"></i>
        </button>
        <div class="cp-title">
          <div class="cp-name" id="cpName"></div>
          <div class="cp-sub" id="cpSub"></div>
        </div>
      </div>

      <div class="cp-body">
        <div class="cp-block" id="cpOpenBlock">
          <div class="cp-label">Open bottle</div>
          <div class="cp-open" id="cpOpen"></div>
          <div class="cp-opens" id="cpOpens"></div>
          <button type="button" class="cp-add" id="cpAdd">
            <i class="ti ti-plus" aria-hidden="true"></i> Add another open bottle
          </button>
        </div>
      </div>

      <div class="cp-sealed">
        <div class="cp-label">Sealed bottles</div>
        <div class="cp-step">
          <button type="button" id="cpMinus" aria-label="One less">−</button>
          <div class="cp-num" id="cpSealed">0</div>
          <button type="button" id="cpPlus" aria-label="One more">+</button>
        </div>
      </div>

      <div class="cp-foot">
        <div class="cp-total">
          <span>Total</span>
          <b id="cpTotal">0</b>
        </div>
        <button type="button" class="cp-next" id="cpNext">
          Next <i class="ti ti-arrow-right" aria-hidden="true"></i>
        </button>
      </div>`;
    document.body.appendChild(el);

    $('cpBack').onclick  = () => finish(false);
    $('cpNext').onclick  = () => finish(true);
    $('cpMinus').onclick = () => { _sealed = Math.max(0, _sealed - 1); paintNums(); };
    $('cpPlus').onclick  = () => { _sealed++; paintNums(); };
    $('cpAdd').onclick   = () => {
      _opens.push(0.5);
      _active = _opens.length - 1;
      paintAll();
    };
  }

  // ── La botella ───────────────────────────────────────────────────────
  //
  // El SVG NO lleva colores. Van por clase y se definen en el CSS, que es
  // el unico sitio donde el modo claro puede alcanzarlos.
  //
  // Estaban escritos aqui dentro —rgba(255,255,255,.32) para el
  // contorno— y en modo claro eso es blanco sobre fondo claro: la
  // botella no existia hasta que el liquido azul, que si tenia color
  // propio, empezaba a subir. Un color dentro de un SVG generado por
  // JavaScript es un color que el tema no puede cambiar.
  const VB = { w: 200, h: 260, pad: 12 };

  // El trazado vive en bottle-profiles y lo comparten el panel y la
  // parrilla de revision: la silueta que apruebas es la misma que cuenta.
  function bottlePath(key) {
    return P().pathFor(key, VB.w, VB.h, VB.pad);
  }

  function yToPx(y) { return VB.h - VB.pad - y * (VB.h - VB.pad * 2); }

  function paintBottle() {
    const host = $('cpOpen');
    if (!host) return;


    const key = shapeOf(_row);
    const prof = P().get(key);
    const frac = _opens[_active];
    const y = P().heightFor(key, frac);
    const ml = Math.round(frac * (_row.bottleSizeMl || 750));

    host.innerHTML = `
      <div class="cp-stage" id="cpStage">
        <svg viewBox="0 0 ${VB.w} ${VB.h}" preserveAspectRatio="xMidYMid meet">
          <defs><clipPath id="cpClip"><path d="${bottlePath(key)}"/></clipPath></defs>
          <path class="cp-glass" d="${bottlePath(key)}" stroke-width="2"/>
          <g clip-path="url(#cpClip)">
            <rect class="cp-liquid" x="0" y="${yToPx(y)}" width="${VB.w}" height="${VB.h}"/>
          </g>
          <line class="cp-fullline" x1="14" y1="${yToPx(prof.yFull)}"
                x2="${VB.w - 14}" y2="${yToPx(prof.yFull)}"
                stroke-width="1" stroke-dasharray="3 4"/>
        </svg>
        <div class="cp-line" id="cpLine"><span></span><i></i></div>
      </div>
      <div class="cp-read">
        <b>${frac.toFixed(2)}</b>
        <small>${ml} ml of ${_row.bottleSizeMl || 750} · drag the line</small>
      </div>
      <button type="button" class="cp-trace" id="cpTrace">
        <i class="ti ti-camera" aria-hidden="true"></i>
        ${_row.bottleProfile ? 'Retrace from a photo' : 'Trace this bottle from a photo'}
      </button>
      ${shapeIsSet(_row) ? '' :
        `<div class="cp-hint">Bottle shape not set — using a generic one.</div>`}`;

    const tb = $('cpTrace');
    if (tb) tb.onclick = () => {
      if (!window.BarStockBottleTrace) return;
      window.BarStockBottleTrace.open(_row, () => paintAll());
    };

    positionLine(y);
    bindDrag();
  }

  function positionLine(y) {
    const stage = $('cpStage'), line = $('cpLine');
    if (!stage || !line) return;
    const svg = stage.querySelector('svg');
    const r = svg.getBoundingClientRect();
    const scale = r.height / VB.h;
    const offset = (stage.clientHeight - r.height) / 2;
    line.style.top = (offset + yToPx(y) * scale) + 'px';
  }

  function bindDrag() {
    const stage = $('cpStage');
    if (!stage) return;
    const move = (clientY) => {
      const svg = stage.querySelector('svg');
      const r = svg.getBoundingClientRect();
      const scale = r.height / VB.h;
      const usable = (VB.h - VB.pad * 2) * scale;
      const base = r.bottom - VB.pad * scale;
      const key = shapeOf(_row);
      const prof = P().get(key);
      let y = (base - clientY) / usable;
      y = Math.max(0, Math.min(prof.yFull, y));
      _opens[_active] = P().fractionAt(key, y);
      paintBottle();
      paintNums();
    };
    stage.addEventListener('pointerdown', (e) => {
      _dragging = true;
      stage.setPointerCapture(e.pointerId);
      move(e.clientY);
    });
    stage.addEventListener('pointermove', (e) => { if (_dragging) move(e.clientY); });
    stage.addEventListener('pointerup',   () => { _dragging = false; });
    stage.addEventListener('pointercancel', () => { _dragging = false; });
  }

  // ── Lista de abiertas ────────────────────────────────────────────────
  function paintOpens() {
    const host = $('cpOpens');
    if (!host) return;
    if (_opens.length < 2) { host.innerHTML = ''; return; }

    // La lista solo aparece con dos o más. Con una sola, el deslizador ya
    // lo dice todo y una fila repitiendo el mismo número sobra.
    host.innerHTML = _opens.map((f, i) => `
      <div class="cp-openrow${i === _active ? ' on' : ''}" data-i="${i}">
        <span>Bottle ${i + 1}</span>
        <b>${f.toFixed(2)}</b>
        <button type="button" data-del="${i}" aria-label="Remove">
          <i class="ti ti-trash" aria-hidden="true"></i>
        </button>
      </div>`).join('');

    host.querySelectorAll('.cp-openrow').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('[data-del]')) return;
        _active = Number(el.dataset.i);
        paintAll();
      };
    });
    host.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        _opens.splice(Number(b.dataset.del), 1);
        if (!_opens.length) _opens = [0];
        _active = Math.max(0, Math.min(_active, _opens.length - 1));
        paintAll();
      };
    });
  }

  function paintNums() {
    if ($('cpSealed')) $('cpSealed').textContent = _sealed;
    if ($('cpTotal'))  $('cpTotal').textContent = total().toFixed(2).replace(/\.00$/, '');
    paintOpens();
  }

  function paintAll() { paintBottle(); paintNums(); }

  // ── Abrir y cerrar ───────────────────────────────────────────────────
  function open(row, onNext) {
    build();
    _row = row;
    _onNext = onNext || null;
    _active = -1;

    // Si este artículo ya se contó en esta sesión, se recupera tal cual
    // en vez de empezar de cero. Reescanear un artículo pasa, y perder lo
    // que ya se había contado sería el peor castigo posible por hacerlo.
    const prev = S().get(row.item);
    if (prev) {
      _sealed = Number(prev.sealed) || 0;
      _opens = (prev.opens || []).slice();
    } else {
      _sealed = 0;
      _opens = [];
    }
    // Siempre hay una abierta en pantalla, aunque valga cero. Un
    // deslizador que aparece solo despues de pulsar un boton obliga a
    // decidir antes de mirar, y lo natural es mirar la botella y ajustar.
    // Una abierta en cero no se guarda: el filtro de la sesion la
    // descarta, asi que no tocarla equivale a decir que no hay parcial.
    if (!_opens.length) _opens = [0];
    _active = 0;

    const size = row.bottleSizeMl ? row.bottleSizeMl + ' ml' : 'size not set';
    const was = (row.onHand === 0 || row.onHand) ? ' · was ' + row.onHand : '';
    $('cpName').textContent = row.item || '';
    $('cpSub').innerHTML = esc(size) + esc(was) +
      (prev ? ' · <b class="cp-again">already counted</b>' : '');

    // Cerveza, latas y mixers no se cuentan por nivel. Enseñar un
    // deslizador ahi seria pedir que se estime la fraccion de algo que
    // nunca esta a medias.
    $('cpOpenBlock').style.display = pourable(row) ? '' : 'none';

    $('cpPanel').classList.add('on');
    paintAll();
  }

  function finish(save) {
    if (save && _row) {
      S().set(_row.item, _sealed, _opens);
    }
    $('cpPanel').classList.remove('on');
    const cb = _onNext;
    _row = null; _onNext = null;
    if (cb) cb(save);
  }

  function close() {
    const el = $('cpPanel');
    if (el) el.classList.remove('on');
    _row = null; _onNext = null;
  }

  window.addEventListener('resize', () => { if ($('cpPanel')?.classList.contains('on')) paintBottle(); });

  window.BarStockCountPanel = { open, close };
})();
