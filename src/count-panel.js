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
  let _again = false;      // si este artículo ya se contó en esta sesión
  let _upc = null;         // el código que abrió este panel, si vino de un escaneo

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // ── Qué botella se dibuja ────────────────────────────────────────────
  //
  // La familia (whiskey, bordeaux…) más el TAMAÑO. No son dos datos
  // sueltos: el cuello de una botella es una pieza normalizada de unos
  // 29 mm, la misma en un botellín y en un garrafón, así que cuanto más
  // ancho el cuerpo, más fino se ve el cuello en proporción. La forma
  // sale de combinar los dos.
  //
  // Sin forma asignada se cae a 'generic', que es una botella. Antes se
  // caía a 'cylinder', que es un rectángulo perfecto: la forma de control
  // del banco de pruebas. Por eso el deslizador salía cuadrado.
  //
  // Aquí vivía también el perfil PROPIO del producto, trazado desde una
  // foto. Se retiró: prometía la botella exacta de cada marca y entregaba
  // un contorno aproximado que había que corregir a mano producto por
  // producto. Doscientas sesenta veces. Una familia bien medida acierta
  // más que un trazado a ojo, y no cuesta trabajo a nadie.
  function shapeOf(row) {
    const k = row && row.bottleShape;
    return (P() && P().get(k)) ? k : 'generic';
  }

  function sizeOf(row) {
    return Number(row && row.bottleSizeMl) || 750;
  }

  // El perfil ya ajustado al formato. Es lo que se dibuja y lo que se
  // integra: una sola geometría, como siempre.
  function profileOf(row) {
    return (P() && P().forSize) ? P().forSize(shapeOf(row), sizeOf(row)) : shapeOf(row);
  }

  function shapeIsSet(row) {
    return !!(row && row.bottleShape && P() && P().get(row.bottleShape));
  }

  function pourable(row) {
    const p = P() && P().get(shapeOf(row));
    return p ? p.pourable !== false : true;
  }

  function total() {
    return _sealed + _opens.reduce((a, b) => a + b, 0);
  }

  // La línea bajo el nombre. Estaba escrita dentro de open(), y al poder
  // cambiar la silueta sin cerrar el panel había que poder rehacerla: si
  // se cambia el tamaño de 750 a 1000, la cabecera tiene que decirlo sin
  // esperar a la siguiente apertura.
  function subText(row, again) {
    const size = row.bottleSizeMl ? row.bottleSizeMl + ' ml' : 'size not set';
    const was = (row.onHand === 0 || row.onHand) ? ' · was ' + row.onHand : '';
    return esc(size) + esc(was) +
      (again ? ' · <b class="cp-again">already counted</b>' : '');
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

      <!-- ── La botella manda ────────────────────────────────────────
           Esta pantalla se abre una vez por artículo: en un conteo
           completo, 261 veces. Antes tenía tres etiquetas —"Open bottle",
           "Sealed bottles", "Total"— y a la décima botella esas palabras
           ya no informan, solo ocupan. Ahora la silueta se lleva todo el
           alto que sobra y la cifra vive justo debajo, que es donde va a
           estar mirando el ojo después de arrastrar la línea. -->
      <div class="cp-body">
        <div class="cp-block" id="cpOpenBlock">
          <div class="cp-open" id="cpOpen"></div>
          <div class="cp-opens" id="cpOpens"></div>
          <div class="cp-chips">
            <button type="button" class="cp-chip" id="cpAdd">
              <i class="ti ti-plus" aria-hidden="true"></i> another open
            </button>
            <button type="button" class="cp-chip" id="cpShape">
              not this bottle?
            </button>
          </div>
        </div>
      </div>

      <div class="cp-sealed">
        <span class="cp-sealed-lab">Sealed</span>
        <div class="cp-step">
          <button type="button" id="cpMinus" aria-label="One less">−</button>
          <div class="cp-num" id="cpSealed">0</div>
          <button type="button" id="cpPlus" aria-label="One more">+</button>
        </div>
      </div>

      <!-- El código que trajo hasta aquí, y la salida si está mal. Va
           abajo y pequeño a propósito: casi nunca hace falta, pero cuando
           hace falta no hay ningún otro sitio donde buscarlo. Hoy, un
           código mal aprendido no tenía arreglo desde ninguna pantalla. -->
      <div class="cp-upc" id="cpUpc" hidden>
        <i class="ti ti-barcode" aria-hidden="true"></i>
        <span id="cpUpcTxt"></span>
        <button type="button" id="cpUpcFix">wrong product?</button>
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
    // El botón de la silueta vive ya en la estructura y no se vuelve a
    // crear en cada repintado: antes se generaba dentro del HTML de la
    // botella, así que cada arrastre lo destruía y lo rehacía.
    $('cpShape').onclick = () => {
      if (!window.BarStockBottlePicker || !_row) return;
      window.BarStockBottlePicker.open(_row, () => {
        $('cpSub').innerHTML = subText(_row, _again);
        $('cpOpenBlock').style.display = pourable(_row) ? '' : 'none';
        paintAll();
      });
    };
    $('cpUpcFix').onclick = () => {
      if (!_upc || !window.BarStockBarcodeFix || !_row) return;
      window.BarStockBarcodeFix.open(_upc, _row, (nuevoRow) => {
        // El código apunta ya a otro producto. Si además se movió lo
        // contado, este panel está mirando un artículo que ya no es el
        // que se estaba contando: se cierra y se vuelve al escáner.
        finish(false);
        if (nuevoRow && window.BarStockCountPanel) {
          setTimeout(() => open(nuevoRow, _onNext, null), 60);
        }
      });
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

  // El encuadre sale de bottle-profiles, no de aquí. Ahora que cada forma
  // tiene su propia esbeltez, la botella ya no ocupa siempre el mismo
  // rectángulo, y una fórmula local se habría separado del dibujo en
  // cuanto alguna silueta necesitara reducirse para caber.
  function yToPx(key, y) { return P().yToPx(key, y, VB.w, VB.h, VB.pad); }

  function paintBottle() {
    const host = $('cpOpen');
    if (!host) return;


    // `key` es aquí un perfil YA ajustado al formato, no una clave. Todas
    // las funciones de BottleProfiles aceptan lo uno o lo otro, así que
    // el dibujo y la integral siguen saliendo de la misma geometría.
    const key = profileOf(_row);
    const prof = P().profOf(key);
    const frac = _opens[_active];
    const y = P().heightFor(key, frac);
    const ml = Math.round(frac * sizeOf(_row));

    host.innerHTML = `
      <div class="cp-stage" id="cpStage">
        <svg viewBox="0 0 ${VB.w} ${VB.h}" preserveAspectRatio="xMidYMid meet">
          <defs><clipPath id="cpClip"><path d="${bottlePath(key)}"/></clipPath></defs>
          <path class="cp-glass" d="${bottlePath(key)}" stroke-width="2"/>
          <g clip-path="url(#cpClip)">
            <rect class="cp-liquid" x="0" y="${yToPx(key, y)}" width="${VB.w}" height="${VB.h}"/>
          </g>
          <line class="cp-fullline" x1="14" y1="${yToPx(key, prof.yFull)}"
                x2="${VB.w - 14}" y2="${yToPx(key, prof.yFull)}"
                stroke-width="1" stroke-dasharray="3 4"/>
        </svg>
        <div class="cp-line" id="cpLine"><span></span><i></i></div>
      </div>
      <div class="cp-read">
        <b>${frac.toFixed(2)}</b>
        <small>${ml} ml · drag the line</small>
      </div>
      ${shapeIsSet(_row) ? '' :
        `<div class="cp-hint">Bottle shape not set — using a generic one.</div>`}`;

    positionLine(y);
    bindDrag();
  }

  // ── Cambiar la silueta ───────────────────────────────────────────────
  //
  // El botón vive en la estructura (cpShape) y se conecta una sola vez en
  // build(). El momento en que se descubre que la forma está mal es
  // escaneando y viendo el dibujo, no antes.
  //
  // La fracción NO se recalcula al cambiar de forma, a propósito. Lo que
  // se guardó es "esta botella está al 40%", y eso lo dijo una persona
  // mirando el vidrio; sigue siendo verdad con la silueta nueva. Lo que
  // cambia es a qué ALTURA se dibuja esa misma fracción, que es
  // precisamente lo que se estaba corrigiendo.

  function positionLine(y) {
    const stage = $('cpStage'), line = $('cpLine');
    if (!stage || !line) return;
    const svg = stage.querySelector('svg');
    const r = svg.getBoundingClientRect();
    const scale = r.height / VB.h;
    const offset = (stage.clientHeight - r.height) / 2;
    line.style.top = (offset + yToPx(profileOf(_row), y) * scale) + 'px';
  }

  function bindDrag() {
    const stage = $('cpStage');
    if (!stage) return;
    const move = (clientY) => {
      const svg = stage.querySelector('svg');
      const r = svg.getBoundingClientRect();
      const scale = r.height / VB.h;
      const key = profileOf(_row);
      const prof = P().profOf(key);
      // El mismo encuadre que dibuja la botella, no una copia. Con
      // esbelteces distintas por forma, calcularlo aparte era garantizar
      // que algún día el dedo y el vidrio dejaran de coincidir.
      const box = P().boxFor(key, VB.w, VB.h, VB.pad);
      const usable = box.usable * scale;
      const base = r.top + box.base * scale;
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
  function open(row, onNext, upc) {
    build();
    _row = row;
    _onNext = onNext || null;
    _upc = upc || null;
    _active = -1;

    // Si este artículo ya se contó en esta sesión, se recupera tal cual
    // en vez de empezar de cero. Reescanear un artículo pasa, y perder lo
    // que ya se había contado sería el peor castigo posible por hacerlo.
    const prev = S().get(row.item);
    _again = !!prev;
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

    $('cpName').textContent = row.item || '';
    $('cpSub').innerHTML = subText(row, _again);

    // La fila del código solo existe si se llegó aquí escaneando. Buscar
    // el artículo por nombre no deja código que corregir.
    $('cpUpc').hidden = !_upc;
    if (_upc) $('cpUpcTxt').textContent = _upc;

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
    _row = null; _onNext = null; _upc = null;
    if (cb) cb(save);
  }

  function close() {
    const el = $('cpPanel');
    if (el) el.classList.remove('on');
    _row = null; _onNext = null; _upc = null;
  }

  window.addEventListener('resize', () => { if ($('cpPanel')?.classList.contains('on')) paintBottle(); });

  window.BarStockCountPanel = { open, close };
})();
