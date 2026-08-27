(() => {
  if (window.BarStockScanCount) return;

  // ── Conteo por escaneo · PRUEBA DE LA CAMARA ─────────────────────────
  //
  // Esto NO es todavia la funcion de conteo. Es la pieza de riesgo del
  // diseño, metida dentro de la app para poder probarla en el entorno
  // real: mismo navegador, misma sesion, mismo telefono.
  //
  // Lo que hace: abre la camara, lee codigos UPC/EAN y MIDE cuanto tarda
  // cada botella. Lo que NO hace: tocar el inventario. No escribe nada,
  // ni en la nube ni en local. Se puede abrir y cerrar sin consecuencias.
  //
  // El numero que decide el diseño es la MEDIANA de segundos por botella.
  // Con 300 articulos, entre 1.5 y 4 segundos hay veinte minutos de
  // diferencia por conteo.
  //
  // ── Por que ZXing ───────────────────────────────────────────────────
  //
  // Safari de iOS no tiene BarcodeDetector, asi que no hay lector nativo
  // y hay que decodificar en JavaScript sobre los fotogramas del video.
  // Esa es justamente la incognita que esta prueba resuelve.
  //
  // La libreria se importa DE FORMA PEREZOSA, solo al abrir el panel. Son
  // unos cuantos cientos de kilobytes que nadie deberia descargar por
  // entrar a Inventory a mirar un precio.
  //
  // Y se carga como modulo ES por el endpoint /+esm de jsdelivr: el
  // paquete 0.21.3 no publica carpeta umd, asi que la ruta clasica
  // /umd/index.min.js da 404 y no deja ningun global.

  const CDN = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm';
  const REPEAT_MS = 2500;   // relecturas del mismo codigo = un solo intento

  let ZX = null;
  let reader = null;
  let stream = null;
  let running = false;
  let tStart = 0;
  let lastCode = '';
  let lastAt = 0;
  let times = [];
  let hudTimer = null;

  const $ = (id) => document.getElementById(id);
  const fmt = (ms) => (ms / 1000).toFixed(1) + ' s';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // ── El panel se construye al vuelo ──────────────────────────────────
  // No vive en index.html a proposito: es una prueba, y no tiene por que
  // engordar un monolito de 6400 lineas mientras se decide si sigue.
  function build() {
    if ($('scOverlay')) return;
    const el = document.createElement('div');
    el.id = 'scOverlay';
    el.className = 'sc-overlay';
    el.innerHTML = `
      <div class="sc-top">
        <button class="sc-x" id="scClose" type="button" aria-label="Cerrar">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
        <span class="sc-lab">Prueba de escaneo</span>
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
          <div><b id="scMed">—</b><span>mediana</span></div>
          <div><b id="scMax">—</b><span>la peor</span></div>
          <div><b id="scTot">0</b><span>botellas</span></div>
        </div>
        <button class="sc-ghost" id="scReset" type="button">Reiniciar medición</button>
        <div class="sc-note">No toca el inventario. Solo lee y mide.</div>
      </div>`;
    document.body.appendChild(el);

    $('scClose').addEventListener('click', close);
    $('scReset').addEventListener('click', () => {
      times = []; lastCode = '';
      $('scHit').innerHTML = '';
      stats(); mark();
    });
  }

  function diag(html, cls) {
    const d = $('scDiag');
    if (d) d.innerHTML = `<div class="${cls || ''}">${html}</div>`;
  }

  function mark() { tStart = performance.now(); }

  // ── Lectura ─────────────────────────────────────────────────────────
  function onHit(text, format) {
    const now = performance.now();

    // ZXing dispara varias veces sobre la misma etiqueta mientras siga
    // encuadrada. Sin esta ventana, la medicion saldria absurdamente
    // optimista: contaria como "botella nueva" cada fotograma acertado.
    if (text === lastCode && (now - lastAt) < REPEAT_MS) { lastAt = now; return; }

    const ms = now - tStart;
    lastCode = text; lastAt = now;
    times.push(ms);

    // Se busca el codigo en el inventario cargado. Se espera que NO
    // aparezca casi nunca: el campo `code` guarda el codigo del
    // proveedor, no el UPC impreso en la botella. Verlo en pantalla es
    // la demostracion de por que hace falta la tabla que asocie los dos.
    const master = (window.state && state.master) || [];
    const hit = master.find(r => String(r.code || '') === String(text));

    $('scHit').innerHTML = hit
      ? `<div class="sc-found">
           <div class="sc-code">${esc(text)}</div>
           <div class="sc-item">${esc(hit.item)}</div>
           <div class="sc-meta">${esc(format)} · ${fmt(ms)}</div>
         </div>`
      : `<div class="sc-new">
           <div class="sc-code">${esc(text)}</div>
           <div class="sc-item">Sin asignar a ningún artículo</div>
           <div class="sc-meta">${esc(format)} · ${fmt(ms)}</div>
         </div>`;

    if (navigator.vibrate) navigator.vibrate(35);
    stats();
    mark();
  }

  function stats() {
    const n = times.length;
    if ($('scTot')) $('scTot').textContent = n;
    if ($('scN')) $('scN').textContent = n;
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

  // ── Abrir y cerrar ──────────────────────────────────────────────────
  async function open() {
    build();
    $('scOverlay').classList.add('on');
    document.body.classList.add('sc-locked');
    times = []; lastCode = ''; stats();

    if (!window.isSecureContext) {
      return diag('La conexión no es segura, la cámara no puede arrancar.', 'sc-bad');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return diag('Este navegador no da acceso a la cámara.', 'sc-bad');
    }

    diag('Cargando el lector…');
    if (!ZX) {
      try {
        ZX = await import(/* webpackIgnore: true */ CDN);
      } catch (e) {
        return diag('No se pudo cargar el lector: ' + esc(e.message), 'sc-bad');
      }
    }

    if (!reader) {
      // Restringir los formatos a los de producto no es cosmetico: sin
      // esto la libreria prueba tambien QR, Code128, PDF417 y demas en
      // cada fotograma, y el escaneo se vuelve notablemente mas lento.
      const F = ZX.BarcodeFormat;
      const hints = new Map();
      hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS,
                [F.UPC_A, F.UPC_E, F.EAN_13, F.EAN_8]);
      hints.set(ZX.DecodeHintType.TRY_HARDER, true);
      reader = new ZX.BrowserMultiFormatReader(hints, 300);
    }

    try {
      // facingMode environment = camara trasera. Sin pedirlo, un iPhone
      // abre la frontal y no hay nada que escanear.
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' },
                 width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
    } catch (e) {
      return diag('Sin permiso de cámara (' + esc(e.name) + '). Actívalo en los ajustes de Safari.', 'sc-bad');
    }

    const track = stream.getVideoTracks()[0];
    const s = track.getSettings ? track.getSettings() : {};
    diag('Cámara ' + (s.width || '?') + '×' + (s.height || '?') + ' · apunta al código', 'sc-ok');

    const vid = $('scVid');
    vid.srcObject = stream;
    await vid.play().catch(() => {});

    running = true;
    mark();
    hudTimer = setInterval(() => {
      if (running && $('scTimer')) $('scTimer').textContent = fmt(performance.now() - tStart);
    }, 100);

    reader.decodeFromVideoElement(vid, (result) => {
      if (!running || !result) return;
      onHit(result.getText(), result.getBarcodeFormat?.() ?? 'código');
      // Los fallos de "no encontrado" llegan en cada fotograma sin
      // codigo. Son el caso normal y no se registran a proposito.
    });
  }

  function close() {
    running = false;
    clearInterval(hudTimer);
    hudTimer = null;
    try { if (reader) reader.reset(); } catch (e) {}
    // Soltar las pistas es obligatorio: sin esto la luz de la camara se
    // queda encendida y el telefono sigue gastando bateria con el panel
    // ya cerrado.
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    const o = $('scOverlay');
    if (o) o.classList.remove('on');
    document.body.classList.remove('sc-locked');
  }

  window.addEventListener('pagehide', close);

  window.BarStockScanCount = { open, close };
})();
