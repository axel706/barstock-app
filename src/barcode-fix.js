(() => {
  if (window.BarStockBarcodeFix) return;

  // ── Un código mal asignado ───────────────────────────────────────────
  //
  // Escaneas una botella nueva, la app pregunta de qué es, y pulsas Tito's
  // cuando en la mano tienes un Maker's. A partir de ahí ese código dice
  // Tito's para siempre y para todas las locaciones, porque así es como se
  // guarda: una sola tabla `item_barcodes` compartida.
  //
  // No había forma de deshacerlo desde ninguna pantalla. Esto es esa
  // forma.
  //
  // ── Lo que no es obvio: el conteo ya hecho ──────────────────────────
  //
  // Si te diste cuenta después de contar tres botellas, corregir solo el
  // código deja el número mal igual: hay 3.42 apuntados bajo Tito's que en
  // realidad son Maker's. Arreglar una cosa y no la otra es peor que no
  // arreglar nada, porque el código ya está bien y el error se vuelve
  // invisible.
  //
  // Por eso hay un segundo paso, y solo aparece cuando hace falta.
  //
  // ── Sumar y no reemplazar ───────────────────────────────────────────
  //
  // Si el destino ya tenía algo contado, los dos se suman. Es lo que
  // habría pasado si hubieras escaneado bien las dos veces: las selladas
  // se suman y las abiertas se añaden a la lista, cada una por separado,
  // igual que dos botellas abiertas de la barra y de la bodega.

  const S = () => window.BarStockCountSession;
  const $ = (id) => document.getElementById(id);

  let _upc = null;
  let _rowActual = null;
  let _onDone = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY, account: c.ACCOUNT_ID || '' };
  }

  // ── Elegir el producto correcto ──────────────────────────────────────
  function paintPick(q) {
    const master = (window.state && window.state.master) || [];
    const filtro = String(q || '').trim().toLowerCase();
    const lista = (filtro
      ? master.filter(r => String(r.item || '').toLowerCase().includes(filtro))
      : master
    ).slice(0, 60);

    $('bfList').innerHTML = lista.length
      ? lista.map(r => `
          <button type="button" class="bf-row" data-item="${esc(r.item)}"
                  ${r.item === (_rowActual && _rowActual.item) ? 'disabled' : ''}>
            <span>${esc(r.item)}</span>
            ${r.item === (_rowActual && _rowActual.item)
              ? '<small>current</small>'
              : (S() && S().has(r.item) ? '<small>counted</small>' : '')}
          </button>`).join('')
      : '<div class="bf-empty">Nothing matches</div>';

    $('bfList').querySelectorAll('[data-item]').forEach(b => {
      b.onclick = () => elegir(b.dataset.item);
    });
  }

  function paintStep1() {
    body(`
      <div class="bf-warn">
        <b>${esc(_upc)}</b> is saved as
        <b>${esc(_rowActual ? _rowActual.item : '—')}</b>.
        Picking another one replaces it everywhere, for every location.
      </div>
      <div class="bf-search">
        <i class="ti ti-search" aria-hidden="true"></i>
        <input type="text" id="bfSearch" placeholder="Search by name" autocomplete="off">
      </div>
      <div class="bf-list" id="bfList"></div>
      <button type="button" class="bf-forget" id="bfForget">
        <i class="ti ti-trash" aria-hidden="true"></i> Forget this barcode
      </button>`);

    $('bfSearch').oninput = (e) => paintPick(e.target.value);
    $('bfForget').onclick = olvidar;
    paintPick('');
    try { $('bfSearch').focus({ preventScroll: true }); } catch (e) {}
  }

  // ── Guardar el cambio ────────────────────────────────────────────────
  async function escribir(itemName, code) {
    const { url, key, account } = cfg();
    if (!url || !key) throw new Error('No cloud config');

    // ── La misma escritura que hace el aprendizaje, no una parecida ────
    //
    // Esto estaba escrito aparte y se separo en dos puntos, los dos
    // fatales:
    //
    //   on_conflict=upc    La clave unica de la tabla es (account_id,
    //                      upc), no upc a secas. PostgREST no encuentra
    //                      indice que case con ese ON CONFLICT y
    //                      responde 42P10. O sea que reasignar un codigo
    //                      mal puesto fallaba SIEMPRE.
    //
    //   sin account_id     Aunque el upsert hubiera pasado, la fila
    //                      quedaba sin cuenta, y loadLearned filtra por
    //                      account_id: el codigo corregido no lo habria
    //                      encontrado nadie.
    //
    // Es el mismo upsert que scan-count.js usa al aprender un codigo. La
    // copia divergio porque se escribio dos veces en vez de una.
    const res = await fetch(`${url}/rest/v1/item_barcodes?on_conflict=account_id,upc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key, Authorization: `Bearer ${key}`,
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify([{
        account_id: account,
        upc: String(_upc),
        item_name: itemName,
        code: code || null,
        created_by: window.__bsUserEmail || null
      }])
    });
    if (!res.ok) throw new Error(res.status + ' · ' + (await res.text()).slice(0, 180));
  }

  async function elegir(itemName) {
    const master = (window.state && window.state.master) || [];
    const destino = master.find(r => r.item === itemName);
    if (!destino) return;

    body(`<div class="bf-status"><i class="ti ti-loader" aria-hidden="true"></i> Saving…</div>`, true);
    try {
      await escribir(destino.item, destino.code || '');
      window.BarStockScanCount?.forget?.(_upc, destino);
    } catch (e) {
      body(`<div class="bf-status bf-bad">Could not save the change.</div>
            <div class="bf-err">${esc(e.message || String(e))}</div>
            <button type="button" class="bf-forget" id="bfBack">Back</button>`, true);
      $('bfBack').onclick = paintStep1;
      return;
    }

    // ¿Hay algo contado bajo el producto equivocado? Si no, esto termina
    // aquí: preguntar por un conteo que no existe es una pantalla de más.
    const prev = S() && S().get(_rowActual ? _rowActual.item : '');
    if (!prev) { cerrar(destino); return; }

    paintStep2(destino, prev);
  }

  function paintStep2(destino, prev) {
    const total = S().totalFor(_rowActual.item);
    const sell = Number(prev.sealed) || 0;
    const abiertas = (prev.opens || []);
    const yaTenia = S().get(destino.item);

    body(`
      <div class="bf-ok">The barcode now points to <b>${esc(destino.item)}</b>.</div>

      <div class="bf-card">
        <div class="bf-lab">Already counted here</div>
        <div class="bf-big">${total.toFixed(2).replace(/\.00$/, '')}
          <span>under ${esc(_rowActual.item)}</span></div>
        <div class="bf-sub">${sell} sealed${
          abiertas.length ? ' · ' + abiertas.length + ' open at ' +
            abiertas.map(n => Number(n).toFixed(2)).join(', ') : ''}</div>
      </div>

      ${yaTenia ? `
        <div class="bf-note">
          ${esc(destino.item)} already has
          ${S().totalFor(destino.item).toFixed(2).replace(/\.00$/, '')} counted.
          Moving adds to it — the same as if you had scanned both.
        </div>` : ''}

      <button type="button" class="bf-go" id="bfMove">
        <i class="ti ti-arrow-right" aria-hidden="true"></i> Move it to ${esc(destino.item)}
      </button>
      <button type="button" class="bf-forget" id="bfLeave">
        Leave it on ${esc(_rowActual.item)}
      </button>
      <div class="bf-foot">
        Only what you counted in this session moves. Nothing already closed is touched.
      </div>`, true);

    $('bfMove').onclick = () => mover(destino, prev);
    $('bfLeave').onclick = () => cerrar(destino);
  }

  // ── Mover el conteo ──────────────────────────────────────────────────
  function mover(destino, prev) {
    const s = S();

    // ── Las pasadas viajan enteras ─────────────────────────────────────
    //
    // Sumar y no reemplazar: eso ya estaba bien. Lo que cambia es CÓMO.
    //
    // Antes esto sumaba las selladas y concatenaba las abiertas en un
    // solo `set()`. Con el modelo de pasadas eso aplastaba la historia:
    // el destino podía tener dos pasadas —el closet y la barra— y salía
    // con una sola, sumada. El desglose dejaba de poder corregirse por
    // partes, que es justo para lo que existe.
    //
    // Ahora cada pasada del producto equivocado se añade como pasada al
    // destino. Lo que se contó en tres sitios sigue siendo tres líneas.
    const pasadas = (prev && prev.passes) || [];
    if (pasadas.length) {
      pasadas.forEach(p => s.addPass(destino.item, p.sealed, p.opens));
    } else {
      // Sin pasadas —una sesión vieja ya migrada no debería llegar aquí,
      // pero si llega— se mueve lo que haya como una sola.
      s.addPass(destino.item, prev.sealed, prev.opens);
    }
    s.remove(_rowActual.item);

    if (typeof window.setStatus === 'function') {
      window.setStatus(`Count moved to '${destino.item}'.`);
    }
    cerrar(destino);
  }

  async function olvidar() {
    if (!confirm(
      `Forget ${_upc}?\n\n` +
      `The next time this bottle is scanned, the app will ask what it is again. ` +
      `Nothing you counted is touched.`)) return;

    body(`<div class="bf-status"><i class="ti ti-loader" aria-hidden="true"></i> Removing…</div>`, true);
    const { url, key } = cfg();
    try {
      const res = await fetch(
        `${url}/rest/v1/item_barcodes?upc=eq.${encodeURIComponent(_upc)}`,
        { method: 'DELETE',
          headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' } });
      if (!res.ok) throw new Error(res.status + ' · ' + (await res.text()).slice(0, 180));
      window.BarStockScanCount?.forget?.(_upc, null);
    } catch (e) {
      body(`<div class="bf-status bf-bad">Could not remove it.</div>
            <div class="bf-err">${esc(e.message || String(e))}</div>
            <button type="button" class="bf-forget" id="bfBack">Back</button>`, true);
      $('bfBack').onclick = paintStep1;
      return;
    }
    cerrar(null);
  }

  // ── Abrir y cerrar ───────────────────────────────────────────────────
  function open(upc, rowActual, onDone) {
    if (!upc) return;
    _upc = String(upc);
    _rowActual = rowActual || null;
    _onDone = onDone || null;
    build();
    $('bfBg').classList.remove('hidden');
    paintStep1();
  }

  function cerrar(destino) {
    const bg = $('bfBg');
    if (bg) bg.classList.add('hidden');
    const cb = _onDone;
    _upc = null; _rowActual = null; _onDone = null;
    if (typeof window.render === 'function') window.render();
    if (cb) cb(destino || null);
  }

  function build() {
    if ($('bfBg')) return;
    const bg = document.createElement('div');
    bg.id = 'bfBg';
    bg.className = 'bf-bg hidden';
    bg.innerHTML = `
      <div class="bf-panel">
        <div class="bf-head">
          <button class="sc-x" id="bfX" type="button" aria-label="Back">
            <i class="ti ti-arrow-left" aria-hidden="true"></i>
          </button>
          <span>Wrong product?</span>
        </div>
        <div class="bf-body" id="bfBody"></div>
      </div>`;
    document.body.appendChild(bg);
    $('bfX').onclick = () => cerrar(null);
  }

  // `scroll` = este paso NO lleva lista, asi que el cuerpo entero es el
  // que scrollea. Con lista, el unico scroller es la lista: dos regiones
  // de scroll anidadas se rompen en cuanto el teclado recorta el
  // viewport, y las filas se comprimen unas sobre otras.
  //
  // Va como clase y no con :has() en CSS porque Safari no lo soportó
  // hasta hace poco y esto corre en iPhones de bodega.
  function body(html, scroll) {
    const el = $('bfBody');
    if (!el) return;
    el.innerHTML = html;
    el.classList.toggle('bf-scroll', !!scroll);
  }

  window.BarStockBarcodeFix = { open };
})();
