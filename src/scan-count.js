(() => {
  if (window.BarStockScanCount) return;

  // ── Conteo por escaneo · lectura y aprendizaje de codigos ────────────
  //
  // Esto NO es todavia la funcion de conteo: no ajusta cantidades ni
  // toca inventory_items. Lo que si hace es APRENDER, y por eso ya no es
  // solo una prueba.
  //
  // Escribe en UNA tabla: item_barcodes. Cuando aparece un codigo que
  // nadie ha enseñado, se para y pregunta de que articulo es; la
  // respuesta queda guardada para siempre y para todas las locaciones.
  // Cada escaneo durante las pruebas deja valor permanente en vez de
  // tirarse a la basura.
  //
  // El inventario sigue sin tocarse.
  //
  // ── Lo que se aprendio en la primera prueba ─────────────────────────
  //
  // Con decodeFromStream el bucle corria a 27 intentos por segundo y no
  // leia ni un codigo. Esa velocidad ERA el sintoma: 27 fps decodificando
  // 1280x720 en un telefono es imposible, asi que la libreria estaba
  // analizando un lienzo mucho mas pequeño. Y un UPC tiene barras de
  // fracciones de milimetro: al reducir la imagen se funden en un gris
  // uniforme. Legible para el ojo en la pantalla, ilegible para el
  // decodificador.
  //
  // Por eso aqui NO se usa el ayudante de la libreria. Se hace a mano:
  //
  //   1. Se recorta la banda del recuadro guia
  //   2. Se copia al lienzo A TAMAÑO NATIVO, sin reducir ni un pixel
  //   3. Se decodifica ese recorte
  //
  // Menos intentos por segundo, pero cada uno sobre una imagen que de
  // verdad contiene las barras. Es el intercambio correcto: no sirve de
  // nada analizar treinta veces por segundo algo que no se puede leer.
  //
  // Y si el navegador trae lector nativo (BarcodeDetector), se usa ese y
  // no ZXing: va en codigo compilado y es mucho mejor. Safari no lo ha
  // tenido historicamente, pero se comprueba en vez de darlo por hecho.

  const CDN = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm';
  const REPEAT_MS = 2500;   // relecturas del mismo codigo = un solo intento
  const FPS = 8;            // intentos por segundo sobre el recorte grande

  // Fraccion del fotograma que ocupa el recuadro guia. Tiene que
  // coincidir con .sc-guide > i en el CSS, o se decodificaria una zona
  // distinta de la que la persona esta apuntando.
  //
  // Casi cuadrado, y no una banda ancha, porque MUCHAS BOTELLAS LLEVAN
  // EL CODIGO EN VERTICAL. Una botella abierta no se puede voltear ni
  // inclinar, asi que el lector tiene que apañarselas con el codigo tal
  // como esta. En una banda baja un codigo vertical ni siquiera cabe
  // entero dentro del recorte.
  const CROP_W = 0.80;
  const CROP_H = 0.52;

  let ZX = null;
  let coreReader = null;
  let nativeDetector = null;
  let stream = null;
  let running = false;
  let loopId = null;
  let tStart = 0;
  let lastCode = '';
  let lastAt = 0;
  let times = [];
  let frames = 0;
  let hudTimer = null;
  let markTimer = null;
  let canvas = null;
  let ctx = null;
  let rotCanvas = null;
  let rotCtx = null;
  let audio = null;
  let learned = new Map();   // upc -> { item_name, code }
  let pausedFor = null;      // upc a la espera de que alguien diga que es

  const $ = (id) => document.getElementById(id);
  const fmt = (ms) => (ms / 1000).toFixed(1) + ' s';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  function build() {
    if ($('scOverlay')) return;
    const el = document.createElement('div');
    el.id = 'scOverlay';
    el.className = 'sc-overlay';
    el.innerHTML = `
      <div class="sc-top">
        <button class="sc-x" id="scClose" type="button" aria-label="Close">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
        <span class="sc-lab">Scan</span>
        <span class="sc-n" id="scN">0</span>
      </div>

      <div class="sc-stage" id="scStage">
        <video id="scVid" playsinline muted autoplay></video>
        <div class="sc-guide"><i></i></div>
        <div class="sc-timer" id="scTimer">0.0 s</div>
      </div>

      <div class="sc-panel">
        <div class="sc-diag" id="scDiag"></div>
        <div class="sc-hit" id="scHit"></div>
        <div class="sc-stats">
          <div><b id="scMed">—</b><span>median</span></div>
          <div><b id="scMax">—</b><span>worst</span></div>
          <div><b id="scTot">0</b><span>bottles</span></div>
          <div><b id="scFrames">0</b><span>frames</span></div>
        </div>
        <div class="sc-btns">
          <button class="sc-ghost" id="scTorch" type="button">Flashlight</button>
          <button class="sc-ghost" id="scReset" type="button">Reset</button>
        </div>
        <div class="sc-note">Doesn't change inventory. Learns codes only.</div>
      </div>

      <div class="sc-assign" id="scAssign">
        <div class="sc-assign-head">
          <div>
            <div class="sc-assign-t">Which item is this?</div>
            <div class="sc-code" id="scAssignCode"></div>
          </div>
          <button class="sc-x" id="scAssignX" type="button" aria-label="Skip">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <input id="scAssignSearch" type="text" placeholder="Search by name" autocomplete="off">
        <div class="sc-picks" id="scPicks"></div>
        <div class="sc-note">Saved once. Works across every location.</div>
      </div>`;
    document.body.appendChild(el);

    $('scClose').addEventListener('click', close);
    $('scAssignX').addEventListener('click', closeAssign);
    $('scAssignSearch').addEventListener('input', (e) => renderPicks(e.target.value));
    $('scReset').addEventListener('click', () => {
      times = []; lastCode = ''; frames = 0;
      clearTimeout(markTimer);
      $('scHit').innerHTML = '';
      stats(); mark();
    });
  }

  function diag(html, cls) {
    const d = $('scDiag');
    if (d) d.innerHTML = `<div class="${cls || ''}">${html}</div>`;
  }

  function mark() { tStart = performance.now(); }

  // ── Códigos aprendidos ──────────────────────────────────────────────
  //
  // inventory_items.code guarda el codigo del PROVEEDOR, que no tiene
  // nada que ver con el UPC impreso en la botella. Asi que escanear no
  // encuentra nada, y la unica salida es que el sistema aprenda la
  // correspondencia preguntando una vez por codigo.
  //
  // La tabla va por CUENTA: una botella de Casamigos es la misma en
  // todos los bares, asi que enseñarla en uno la deja enseñada en todos.

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY, account: c.ACCOUNT_ID || 'wjm-hospitality' };
  }

  async function loadLearned() {
    const { url, key, account } = cfg();
    if (!url || !key) return;
    try {
      const res = await fetch(
        `${url}/rest/v1/item_barcodes?account_id=eq.${encodeURIComponent(account)}&select=upc,item_name,code`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const rows = await res.json();
      learned = new Map();
      if (Array.isArray(rows)) rows.forEach(r => learned.set(String(r.upc), r));
    } catch (e) {
      // Sin la lista, todo codigo se vera como nuevo. Molesto, pero no
      // rompe nada: peor seria no dejar escanear.
      learned = new Map();
      console.warn('scan: no se pudieron leer los codigos aprendidos', e);
    }
  }

  // Primero lo aprendido; si no, se prueba contra el codigo de proveedor
  // por si en alguna locacion coincidieran de casualidad.
  function resolve(upc) {
    const master = (window.state && state.master) || [];
    const rec = learned.get(String(upc));
    if (rec) {
      const m = master.find(r => r.item === rec.item_name);
      return { item: rec.item_name, row: m || null };
    }
    const byCode = master.find(r => String(r.code || '') === String(upc));
    return byCode ? { item: byCode.item, row: byCode } : null;
  }

  // ── Preguntar de qué artículo es ────────────────────────────────────
  function askAssign(upc) {
    pausedFor = upc;
    running = false;              // no tiene sentido decodificar mientras elige
    clearTimeout(loopId);

    const box = $('scAssign');
    box.classList.add('on');
    $('scAssignCode').textContent = upc;
    $('scAssignSearch').value = '';
    renderPicks('');
    setTimeout(() => $('scAssignSearch').focus(), 50);
  }

  function renderPicks(q) {
    const master = (window.state && state.master) || [];
    const needle = String(q || '').trim().toLowerCase();

    // Ordenado por nombre. Antes salian los primeros 30 en el orden que
    // trajera la nube, que para quien busca es orden aleatorio: la lista
    // no servia ni para leerla ni para descartarla.
    let list = master.slice().sort((a, b) =>
      String(a.item || '').localeCompare(String(b.item || '')));

    if (needle) {
      // Las palabras se buscan por separado, asi "casa blanco" encuentra
      // "Casamigos Tequila Blanco". Escribiendo con una mano y en un
      // almacen, exigir el orden exacto es exigir demasiado.
      const words = needle.split(/\s+/).filter(Boolean);
      list = list.filter(r => {
        const hay = (String(r.item || '') + ' ' + String(r.vendor || '')).toLowerCase();
        return words.every(w => hay.includes(w));
      });
    }

    const shown = list.slice(0, 60);
    const head = needle
      ? `${list.length} match${list.length === 1 ? '' : 'es'}`
      : `${master.length} items · type to narrow`;

    $('scPicks').innerHTML =
      `<div class="sc-picks-head">${head}</div>` +
      (shown.length
        ? shown.map(r => `
            <button type="button" class="sc-pick" data-item="${esc(r.item)}" data-code="${esc(r.code || '')}">
              <span>${esc(r.item)}</span>
              <small>${esc(r.vendor || '')}${r.code ? ' · ' + esc(r.code) : ''}</small>
            </button>`).join('')
        : '<div class="sc-empty">No items match</div>') +
      (list.length > shown.length
        ? `<div class="sc-empty">${list.length - shown.length} more · keep typing</div>`
        : '');

    $('scPicks').querySelectorAll('.sc-pick').forEach(b => {
      b.onclick = () => saveAssignment(pausedFor, b.dataset.item, b.dataset.code);
    });
  }

  async function saveAssignment(upc, itemName, code) {
    const { url, key, account } = cfg();
    const box = $('scAssign');
    $('scPicks').innerHTML = '<div class="sc-empty">Saving…</div>';

    try {
      // upsert sobre (account_id, upc): si alguien reasigna un codigo mal
      // puesto, se corrige en vez de fallar por el indice unico.
      const res = await fetch(
        `${url}/rest/v1/item_barcodes?on_conflict=account_id,upc`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: key,
            Authorization: `Bearer ${key}`,
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify([{
            account_id: account,
            upc: String(upc),
            item_name: itemName,
            code: code || null,
            created_by: window.__bsUserEmail || null
          }])
        }
      );
      if (!res.ok) throw new Error(res.status + ' · ' + (await res.text()).slice(0, 180));

      learned.set(String(upc), { upc, item_name: itemName, code });
      $('scHit').innerHTML =
        `<div class="sc-found">
           <div class="sc-code">${esc(upc)}</div>
           <div class="sc-item">${esc(itemName)}</div>
           <div class="sc-meta">learned · works across every location</div>
         </div>`;
      closeAssign();
    } catch (e) {
      // No se cierra el panel: el codigo sigue en pantalla y se puede
      // reintentar sin volver a escanear la botella.
      //
      // Y se enseña el error DE VERDAD, no un "no se pudo guardar". Un
      // 401 o un 42501 dicen que falta una politica en la tabla; un
      // fallo de red dice otra cosa. En un telefono no hay consola, asi
      // que si el mensaje no sale aqui, no sale en ningun sitio.
      $('scPicks').innerHTML =
        `<div class="sc-empty sc-bad">Could not save</div>
         <div class="sc-err">${esc(e.message)}</div>
         <button type="button" class="sc-ghost" id="scRetry">Try again</button>`;
      const rb = $('scRetry');
      if (rb) rb.onclick = () => saveAssignment(upc, itemName, code);
      console.warn('scan: fallo al guardar el codigo', e);
    }
  }

  function closeAssign() {
    $('scAssign').classList.remove('on');
    pausedFor = null;
    running = true;
    mark();
    tick();
  }

  function onHit(text, format) {
    const now = performance.now();
    if (text === lastCode && (now - lastAt) < REPEAT_MS) { lastAt = now; return; }

    const ms = now - tStart;
    lastCode = text; lastAt = now;
    times.push(ms);

    feedback();
    stats();

    const found = resolve(text);
    if (found) {
      $('scHit').innerHTML =
        `<div class="sc-found">
           <div class="sc-code">${esc(text)}</div>
           <div class="sc-item">${esc(found.item)}</div>
           <div class="sc-meta">${esc(format)} · ${fmt(ms)}</div>
         </div>`;

      // Se para la camara y se abre el panel del articulo. Seguir
      // decodificando por detras solo puede colar otra lectura encima de
      // la que se esta contando.
      if (found.row && window.BarStockCountPanel) {
        running = false;
        clearTimeout(loopId);
        window.BarStockCountPanel.open(found.row, () => {
          running = true;
          mark();
          tick();
        });
      }
    } else {
      // Codigo que nadie ha enseñado todavia. Se para el bucle y se
      // pregunta: es la unica forma de que la app aprenda, y cada
      // respuesta vale para siempre y para todas las locaciones.
      $('scHit').innerHTML =
        `<div class="sc-new">
           <div class="sc-code">${esc(text)}</div>
           <div class="sc-item">New code</div>
           <div class="sc-meta">${esc(format)} · ${fmt(ms)}</div>
         </div>`;
      askAssign(text);
      return;
    }

    // El cronometro de la siguiente botella NO arranca aqui, arranca
    // cuando termina la ventana de bloqueo. Si arrancara ya, midiendo
    // con la misma botella repetida cada lectura llevaria dentro los
    // 2.5 s de espera obligatoria, y la mediana saldria inflada por el
    // propio instrumento. Con botellas distintas da igual; con una sola,
    // era la diferencia entre 5.8 s y 3.3 s.
    clearTimeout(markTimer);
    markTimer = setTimeout(mark, REPEAT_MS);
  }

  // ── Aviso de lectura ────────────────────────────────────────────────
  // navigator.vibrate NO existe en Safari de iOS. No es que falle: la
  // API no esta, asi que en un iPhone no hay vibracion posible desde la
  // web. Se avisa con un pitido y un destello.
  //
  // El pitido es ademas mejor aviso que la vibracion para esto: mientras
  // escaneas estas mirando la botella, no la pantalla. Es lo que hace
  // cualquier lector de supermercado.
  function feedback() {
    try {
      if (audio) {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, audio.currentTime);
        g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.10);
        o.connect(g); g.connect(audio.destination);
        o.start(); o.stop(audio.currentTime + 0.11);
      }
    } catch (e) {}

    const st = $('scStage');
    if (st) {
      st.classList.add('sc-flash');
      setTimeout(() => st.classList.remove('sc-flash'), 180);
    }
    if (navigator.vibrate) navigator.vibrate(40);   // Android sí lo tiene
  }

  function stats() {
    const n = times.length;
    if ($('scTot')) $('scTot').textContent = n;
    if ($('scN')) $('scN').textContent = n;
    if ($('scFrames')) $('scFrames').textContent = frames;
    if (!n) {
      if ($('scMed')) $('scMed').textContent = '—';
      if ($('scMax')) $('scMax').textContent = '—';
      return;
    }
    const s = [...times].sort((a, b) => a - b);
    const med = s.length % 2 ? s[(s.length - 1) / 2]
                             : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    if ($('scMed')) $('scMed').textContent = fmt(med);
    if ($('scMax')) $('scMax').textContent = fmt(s[s.length - 1]);
  }

  // ── Decodificar un lienzo ───────────────────────────────────────────
  async function tryDecode(cv) {
    try {
      if (nativeDetector) {
        const found = await nativeDetector.detect(cv);
        if (found && found.length) return { text: found[0].rawValue, format: found[0].format || 'nativo' };
        return null;
      }
      const src = new ZX.HTMLCanvasElementLuminanceSource(cv);
      const bmp = new ZX.BinaryBitmap(new ZX.HybridBinarizer(src));
      const res = coreReader.decode(bmp);
      if (!res) return null;
      const f = res.getBarcodeFormat?.();
      return { text: res.getText(), format: (ZX.BarcodeFormat && ZX.BarcodeFormat[f]) || 'barcode' };
    } catch (e) {
      // NotFoundException en cada intento sin codigo es el caso normal.
      // Cualquier otro error tampoco debe matar el bucle.
      return null;
    } finally {
      // El lector conserva estado entre llamadas y con el tiempo empieza
      // a fallar lecturas validas.
      if (coreReader && coreReader.reset) coreReader.reset();
    }
  }

  // Gira el recorte un cuarto de vuelta. El lienzo girado se reutiliza
  // entre fotogramas: crear uno nuevo ocho veces por segundo daria
  // trabajo al recolector de basura en mitad del escaneo.
  function rotate90(src, w, h) {
    if (!rotCanvas) { rotCanvas = document.createElement('canvas'); rotCtx = rotCanvas.getContext('2d'); }
    if (rotCanvas.width !== h || rotCanvas.height !== w) { rotCanvas.width = h; rotCanvas.height = w; }
    rotCtx.save();
    rotCtx.translate(h / 2, w / 2);
    rotCtx.rotate(Math.PI / 2);
    rotCtx.drawImage(src, -w / 2, -h / 2);
    rotCtx.restore();
    return rotCanvas;
  }

  // ── El bucle ────────────────────────────────────────────────────────
  async function tick() {
    if (!running) return;
    const vid = $('scVid');

    if (vid && vid.videoWidth) {
      const vw = vid.videoWidth, vh = vid.videoHeight;

      // El recuadro azul esta dibujado sobre el ELEMENTO, y el elemento
      // muestra el video recortado por object-fit:cover. Calcular el
      // recorte sobre las dimensiones del video da una zona distinta de
      // la que la persona esta apuntando: con una camara vertical de
      // 1080x1920 salia una region alta y estrecha en vez de la banda
      // ancha y baja que se ve. Funcionaba por casualidad, porque el
      // recorte era mas grande y acababa incluyendo el codigo.
      //
      // cover escala por el lado que mas haga falta y recorta el resto,
      // asi que la parte visible del video mide ew/escala por eh/escala.
      const ew = vid.clientWidth || vw;
      const eh = vid.clientHeight || vh;
      const scale = Math.max(ew / vw, eh / vh);
      const visW = ew / scale;
      const visH = eh / scale;

      const sw = Math.round(visW * CROP_W);
      const sh = Math.round(visH * CROP_H);
      const sx = Math.round((vw - sw) / 2);
      const sy = Math.round((vh - sh) / 2);

      if (canvas.width !== sw || canvas.height !== sh) {
        canvas.width = sw; canvas.height = sh;
        diag('Crop ' + sw + '×' + sh + ' px · aim at the barcode', 'sc-ok');
      }
      // 1:1. El recorte se copia a tamaño nativo: reducir aqui es
      // exactamente el error que hacia ilegibles las barras.
      ctx.drawImage(vid, sx, sy, sw, sh, 0, 0, sw, sh);

      frames++;

      // Primero tal cual. Si no hay nada, se gira el recorte 90 grados y
      // se vuelve a intentar: los lectores 1D barren lineas
      // HORIZONTALES, asi que un codigo vertical es invisible para ellos
      // por muy nitido que este. Girar la imagen es la unica forma de
      // que lo vean, y es lo que hay que hacer porque la botella abierta
      // no se puede girar.
      //
      // El segundo intento solo ocurre cuando el primero falla, asi que
      // un codigo horizontal no paga nada por esto.
      let out = await tryDecode(canvas);
      if (!out) out = await tryDecode(rotate90(canvas, sw, sh));
      if (out) onHit(out.text, out.format);
    }

    loopId = setTimeout(tick, 1000 / FPS);
  }

  // ── Abrir y cerrar ──────────────────────────────────────────────────
  async function open() {
    build();
    $('scOverlay').classList.add('on');
    document.body.classList.add('sc-locked');
    times = []; lastCode = ''; frames = 0; stats();
    loadLearned();   // sin await: que la camara no espere a la red

    if (!window.isSecureContext) return diag('Connection is not secure, the camera cannot start.', 'sc-bad');
    if (!navigator.mediaDevices?.getUserMedia) return diag('This browser gives no camera access.', 'sc-bad');

    if (!canvas) { canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }

    // El audio se crea AQUI y no al leer el primer codigo: iOS solo deja
    // arrancar un AudioContext dentro de un gesto del usuario, y abrir
    // este panel es un toque. Creado mas tarde nacería suspendido y no
    // sonaria nunca.
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { audio = audio || new AC(); if (audio.state === 'suspended') audio.resume(); }
    } catch (e) { audio = null; }

    // Lector nativo si existe: va en codigo compilado y no hay libreria
    // en JavaScript que se le acerque.
    if ('BarcodeDetector' in window) {
      try {
        nativeDetector = new window.BarcodeDetector({ formats: ['upc_a','upc_e','ean_13','ean_8'] });
      } catch (e) { nativeDetector = null; }
    }

    if (!nativeDetector) {
      diag('Loading reader…');
      if (!ZX) {
        try { ZX = await import(/* webpackIgnore: true */ CDN); }
        catch (e) { return diag('Could not load the reader: ' + esc(e.message), 'sc-bad'); }
      }
      if (!coreReader) {
        // Restringir los formatos no es cosmetico: sin esto se prueba
        // tambien QR, Code128 y PDF417 en cada intento.
        const F = ZX.BarcodeFormat;
        const hints = new Map();
        hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [F.UPC_A, F.UPC_E, F.EAN_13, F.EAN_8]);
        hints.set(ZX.DecodeHintType.TRY_HARDER, true);
        coreReader = new ZX.MultiFormatReader();
        coreReader.setHints(hints);
      }
    }

    try {
      // Resolucion alta y enfoque continuo. En un UPC las barras miden
      // fracciones de milimetro: sin resolucion y sin foco no hay nada
      // que decodificar por mucho que se vea bien en la pantalla.
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: 'continuous' }]
        },
        audio: false
      });
    } catch (e) {
      return diag('No camera permission (' + esc(e.name) + '). Enable it in Safari settings.', 'sc-bad');
    }

    const track = stream.getVideoTracks()[0];
    const st = track.getSettings ? track.getSettings() : {};

    const vid = $('scVid');
    vid.srcObject = stream;
    await vid.play().catch(() => {});

    diag((nativeDetector ? 'Native reader' : 'ZXing') + ' · camera ' +
         (st.width || '?') + '×' + (st.height || '?'), 'sc-ok');

    running = true;
    mark();
    hudTimer = setInterval(() => {
      if (running && $('scTimer')) $('scTimer').textContent = fmt(performance.now() - tStart);
      stats();
    }, 200);
    tick();

    // La linterna cambia mucho las cosas en una bodega. El soporte en
    // iOS es irregular, asi que se ofrece y si falla se dice.
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    const tb = $('scTorch');
    if (!('torch' in caps)) {
      tb.disabled = true;
      tb.textContent = 'No flashlight';
    } else {
      let on = false;
      tb.onclick = async () => {
        on = !on;
        try {
          await track.applyConstraints({ advanced: [{ torch: on }] });
          tb.textContent = on ? 'Turn off' : 'Flashlight';
        } catch (e) { tb.disabled = true; tb.textContent = 'No flashlight'; }
      };
    }
  }

  function close() {
    running = false;
    clearTimeout(loopId);
    clearTimeout(markTimer);
    clearInterval(hudTimer);
    loopId = null; hudTimer = null; markTimer = null;
    // Soltar las pistas es obligatorio: sin esto la camara se queda
    // encendida gastando bateria con el panel ya cerrado.
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    pausedFor = null;
    const a = $('scAssign');
    if (a) a.classList.remove('on');
    const o = $('scOverlay');
    if (o) o.classList.remove('on');
    document.body.classList.remove('sc-locked');
  }

  window.addEventListener('pagehide', close);

  window.BarStockScanCount = { open, close };
})();
