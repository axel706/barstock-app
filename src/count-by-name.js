(() => {
  if (window.BarStockCountByName) return;

  // ── Contar por nombre, sin cámara ────────────────────────────────────
  //
  // Axel, 2026-11-23: "necesito una opción para hacer conteo sin
  // escanear, no abrir cámara, solo buscar item"; con la cámara abierta
  // el teléfono se calentaba toda la noche. Elegido sobre lámina ("Count
  // without the camera", opción B; "Count by name", orden 2,
  // 2026-11-25): al empezar el conteo se pregunta escanear o por nombre,
  // y por nombre es ESTA pantalla, dentro del mismo marco del escáner
  // (arriba el progreso y las zonas, abajo la hoja con Finish count):
  // donde iba la cámara, el buscador y la lista. Nunca se abre la cámara.
  //
  //   · Lo que falta arriba, lo contado abajo con su número.
  //   · Con zonas, primero lo que la última vez se contó en la zona donde
  //     estás ("In the Cellar last time"), después todo lo demás: al
  //     recorrer el estante, la siguiente botella suele ser la siguiente
  //     fila. Sin zonas (o sin reparto guardado), de la A a la Z.
  //   · Escribir filtra por palabras en cualquier orden, lo contado
  //     incluido (la misma regla que "Find by name" del escáner).
  //   · Tocar una botella abre el MISMO panel de conteo; al volver la
  //     búsqueda se limpia, la botella pasa a Counted y un aviso lo dice
  //     con Undo un momento. Undo sólo para lo que no estaba contado: lo
  //     recontado no tiene un "antes" que devolver sin inventarlo.
  //
  // El escáner (scan-count.js) le cede su visor con abrir(host) y lo
  // recupera con cerrar(). Esto no sabe nada de cámaras.

  const AVISO_MS = 5000;
  let _host = null;
  let _q = '';
  let _ult = null;          // Map producto → Set de zonas, o null
  let _aviso = null;        // { item, n, undo }
  let _avisoT = null;
  let _alCerrar = null;

  const esc = (x) => String(x == null ? '' : x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const S = () => window.BarStockCountSession;
  const Z = () => window.BarStockZones;
  const master = () => (window.state && window.state.master) || [];
  const az = (a, b) => String(a.item || '').localeCompare(String(b.item || ''));
  const num = (n) => {
    const x = Math.round((Number(n) || 0) * 10) / 10;
    return String(x);
  };

  // La zona en la que estás, o '' si no hay zonas.
  function zonaActiva() {
    const z = Z();
    return z && z.activas && z.activas() ? (z.paraPasada() || '') : '';
  }

  // Lo que falta, partido en "la zona donde estás" y "lo demás". Pura,
  // para la prueba: recibe lo que falta, la zona y el reparto.
  function ordenar(faltan, zona, ult) {
    const lista = (faltan || []).slice().sort(az);
    if (!zona || !ult) return { aqui: [], resto: lista };
    const aqui = [], resto = [];
    for (const r of lista) (ult.get(r.item) && ult.get(r.item).has(zona) ? aqui : resto).push(r);
    return { aqui, resto };
  }

  // Palabras en cualquier orden, en el nombre o el proveedor.
  function buscar(q) {
    const palabras = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!palabras.length) return null;
    return master().slice().sort(az).filter(r => {
      const hay = (String(r.item || '') + ' ' + String(r.vendor || '')).toLowerCase();
      return palabras.every(w => hay.includes(w));
    });
  }

  function contadas(item, row) {
    const s = S();
    if (!s || !s.has(item)) return null;
    return s.bottlesFor(item, (row && row.bottleSizeMl) || 750);
  }

  // Del tamaño de una fila de Inventory (Axel, 2026-11-25, en el
  // teléfono: "los resultados están muy chicos"): el nombre grande en
  // negrita, el proveedor en una línea chica debajo y, en lo contado, la
  // cifra grande a la derecha.
  function fila(r) {
    const n = contadas(r.item, r);
    return `<button type="button" class="sc-bn-it${n == null ? '' : ' hecho'}" data-item="${esc(r.item)}">
      <span class="sc-bn-l"><b class="sc-bn-nm">${esc(r.item)}</b>` +
      (r.vendor ? `<span class="sc-bn-m">${esc(r.vendor)}</span>` : '') + `</span>` +
      (n == null ? '' : `<b class="sc-bn-n">✓ ${esc(num(n))}</b>`) +
      `</button>`;
  }

  function bloque(titulo, n, filas) {
    if (!filas.length) return '';
    return `<div class="sc-bn-k"><span>${esc(titulo)}</span><u>${n}</u></div>` + filas.map(fila).join('');
  }

  function pintarLista() {
    const host = _host && _host.querySelector('.sc-bn-lista');
    const s = S();
    if (!host || !s) return;
    const hallado = buscar(_q);
    let html;
    if (hallado) {
      html = `<div class="sc-bn-k"><span>${hallado.length} match${hallado.length === 1 ? '' : 'es'}</span></div>` +
        (hallado.length ? hallado.map(fila).join('') : '<div class="sc-bn-vacio">No bottles match</div>');
    } else {
      const zona = zonaActiva();
      const { aqui, resto } = ordenar(s.missingRows(), zona, _ult);
      const porNombre = new Map(master().map(r => [r.item, r]));
      const hechas = s.countedItems().map(i => porNombre.get(i) || { item: i }).sort(az);
      html = (aqui.length
          ? bloque('In the ' + zona + ' last time', aqui.length, aqui) +
            bloque('Everything else left', resto.length, resto)
          : bloque('Left to count', resto.length, resto)) +
        (aqui.length + resto.length ? '' : '<div class="sc-bn-vacio">Everything counted.</div>') +
        bloque('Counted', hechas.length, hechas);
    }
    host.innerHTML = html;
    host.querySelectorAll('.sc-bn-it').forEach(b => {
      b.onclick = () => contar(b.dataset.item);
    });
    pintarAviso();
  }

  function pintarAviso() {
    const el = _host && _host.querySelector('.sc-bn-aviso');
    if (!el) return;
    if (!_aviso) { el.classList.remove('on'); el.innerHTML = ''; return; }
    el.innerHTML = `<span>✓ ${esc(_aviso.item)} · ${esc(num(_aviso.n))}</span>` +
      (_aviso.undo ? '<button type="button" class="sc-bn-undo">Undo</button>' : '');
    el.classList.add('on');
    const u = el.querySelector('.sc-bn-undo');
    if (u) u.onclick = () => {
      const s = S();
      if (s && _aviso) s.remove(_aviso.item);
      _aviso = null;
      clearTimeout(_avisoT);
      pintarLista();
      if (_alCerrar) _alCerrar();
    };
  }

  function contar(item) {
    const row = master().find(r => r.item === item);
    const s = S();
    const CP = window.BarStockCountPanel;
    if (!row || !s || !CP) return;
    const habia = s.has(item);
    const antes = JSON.stringify(s.get(item) || null);
    // Si se llegó buscando, al volver el buscador recupera el foco y el
    // teclado sigue arriba (Axel: "hay que estar tocando la barra de
    // búsqueda todo el tiempo"). Elegida bajando por la lista, no: el
    // teclado taparía la lista que se estaba recorriendo.
    const buscaba = !!String(_q || '').trim();
    CP.open(row, () => {
      // Se compara la sesión: el panel avisa al cerrarse, haya guardado
      // o no ("Back" también llama). Sólo un cambio de verdad lleva aviso.
      if (JSON.stringify(s.get(item) || null) !== antes && s.has(item)) {
        _aviso = { item, n: contadas(item, row), undo: !habia };
        clearTimeout(_avisoT);
        _avisoT = setTimeout(() => { _aviso = null; pintarAviso(); }, AVISO_MS);
      }
      _q = '';
      const inp = _host && _host.querySelector('.sc-bn-q');
      if (inp) inp.value = '';
      pintarLista();
      // AQUÍ, sin setTimeout: este aviso llega dentro del toque con el
      // que se cierra el panel, y iOS sólo abre el teclado con un focus()
      // que ocurra dentro de un toque. Diferido, el campo quedaría
      // enfocado sin teclado.
      if (buscaba && inp) { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }
      if (_alCerrar) _alCerrar();
    }, null, null);
  }

  function enZona() { if (_host) pintarLista(); }

  function abrir(host, opts) {
    _host = host;
    _alCerrar = (opts && opts.alCerrar) || null;
    _q = '';
    _aviso = null;
    host.innerHTML = `
      <label class="sc-bn-busca">
        <i class="ti ti-search" aria-hidden="true"></i>
        <input class="sc-bn-q" type="search" placeholder="Search a bottle…"
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        <!-- Escanear UNA botella sin dejar de contar por nombre (Axel,
             2026-11-25, lámina "Scan from the list", A: "¿y si dentro de
             esa pantalla necesito ESCANEAR una botella?"). La cámara la
             pone el escáner, y sólo mientras lee. -->
        ${opts && opts.escanear ? `<button type="button" class="sc-bn-esc" aria-label="Scan a bottle">
          <i class="ti ti-barcode" aria-hidden="true"></i></button>` : ''}
      </label>
      <div class="sc-bn-aviso" role="status"></div>
      <div class="sc-bn-lista"></div>`;
    host.querySelector('.sc-bn-q').addEventListener('input', (e) => { _q = e.target.value; pintarLista(); });
    const be = host.querySelector('.sc-bn-esc');
    if (be) be.addEventListener('click', (e) => { e.preventDefault(); opts.escanear(); });
    window.addEventListener('barstock-zona', enZona);
    pintarLista();
    // El reparto llega después: primero la lista de la A a la Z, y en
    // cuanto llega, la zona arriba. Esperarlo dejaría la pantalla vacía
    // en un almacén con mala señal.
    // Las zonas pueden no estar cargadas todavía (el escáner las pide al
    // abrir, sin esperarlas): primero la lista, después el reparto.
    const z = Z();
    if (z && z.ultimas) {
      Promise.resolve(z.cargar ? z.cargar() : null)
        .then(() => (z.activas() ? z.ultimas() : null))
        .then(m => { _ult = m; if (_host === host) pintarLista(); })
        .catch(() => {});
    }
  }

  function cerrar() {
    window.removeEventListener('barstock-zona', enZona);
    clearTimeout(_avisoT);
    _aviso = null;
    _host = null;
    _alCerrar = null;
  }

  window.BarStockCountByName = { abrir, cerrar, refrescar: () => _host && pintarLista(), ordenar };
})();
