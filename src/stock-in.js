(() => {
  if (window.BarStockStockIn) return;

  // ── Entró mercancía sin orden ────────────────────────────────────────
  //
  // El consumo de la semana sale de una resta:
  //
  //     lo que había  +  lo que entró  −  lo que queda
  //
  // Y "lo que entró" solo se llenaba colocando la orden desde la app. Si
  // se acaba el triple sec un viernes y alguien va a la tienda por seis
  // botellas, la app no se entera y la resta cuenta esas seis como si no
  // existieran:
  //
  //     real     10 + 6 − 8  =  14 consumidas
  //     la app   10 + 0 − 8  =   2 consumidas
  //
  // Positivo, creíble, y corto por seis. Lo caro no es el número de esa
  // semana: es que ese número entra en el promedio del par, así que el
  // producto que más se acaba —el que te manda a la tienda— es
  // precisamente el que acaba con el par más bajo.
  //
  // En los casos extremos la resta se va a negativa y se ve. En los
  // normales no se ve nada, que es peor.
  //
  // ── Lo que NO hace ───────────────────────────────────────────────────
  //
  // No toca el on hand. El on hand sale de contar: si además lo subiera,
  // el siguiente conteo volvería a contar esas botellas y el inventario
  // saldría al doble. Esto solo anota la ENTRADA, que es el dato que
  // faltaba para que la resta cuadre.

  const $ = (id) => document.getElementById(id);

  let _row = null;
  let _qty = 1;
  let _onDone = null;

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  function fmt(n) {
    return Number(n || 0).toFixed(2).replace(/\.?0+$/, '') || '0';
  }

  function build() {
    if ($('siBg')) return;
    const el = document.createElement('div');
    el.id = 'siBg';
    el.className = 'modalbg hidden';
    el.innerHTML = `
      <div class="modal si-modal">
        <div class="si-head">
          <i class="ti ti-truck-delivery" aria-hidden="true"></i>
          Received without an order
        </div>
        <div id="siBody"></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) cerrar(); });
  }

  function body(html) { const el = $('siBody'); if (el) el.innerHTML = html; }

  function paint() {
    const semana = window.BarStockWeek ? window.BarStockWeek.cycleWeekKey() : '';
    body(`
      <div class="si-item">${esc(_row.item)}</div>
      <div class="si-meta">
        on hand ${esc(fmt(_row.onHand))}${_row.code ? ' · ' + esc(_row.code) : ''}
        ${semana ? ' · week of ' + esc(semana) : ''}
      </div>

      <div class="si-step">
        <button type="button" id="siMinus" aria-label="One less">−</button>
        <input class="si-num" id="siQty" type="text" size="3"
               inputmode="numeric" pattern="[0-9]*"
               autocomplete="off" aria-label="Bottles received" value="${_qty}">
        <button type="button" id="siPlus" aria-label="One more">+</button>
      </div>

      <div class="si-note">
        Adds to what came in this week, so the usage math adds up.
        <b>It does not change the on hand</b> — that comes from counting.
      </div>

      <div class="si-foot">
        <button type="button" class="si-cancel" id="siX">Cancel</button>
        <button type="button" class="si-go" id="siOk">Save</button>
      </div>`);

    const q = $('siQty');
    $('siMinus').onclick = () => { _qty = Math.max(1, _qty - 1); q.value = _qty; };
    $('siPlus').onclick  = () => { _qty = Math.min(9999, _qty + 1); q.value = _qty; };
    q.onfocus = () => { try { q.select(); } catch (e) {} };
    q.oninput = () => {
      let limpio = q.value.replace(/[^0-9]/g, '');
      if (limpio && Number(limpio) > 9999) limpio = '9999';
      if (limpio !== q.value) q.value = limpio;
      _qty = Number(limpio) || 0;
    };
    q.onblur = () => { _qty = Math.max(1, Number(q.value) || 1); q.value = _qty; };
    q.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); q.blur(); guardar(); } };
    $('siX').onclick = cerrar;
    $('siOk').onclick = guardar;
  }

  // ── Guardar ──────────────────────────────────────────────────────────
  //
  // Suma a `ordered` del snapshot de ESTA semana, que es exactamente lo
  // que hace colocar una orden. Para el cierre del ciclo las dos entradas
  // son lo mismo: mercancía que llegó.
  async function guardar() {
    const { url, key } = cfg();
    const qty = Math.max(1, Number(_qty) || 0);

    if (!url || !key || !window.BarStockParIntelligence) {
      return error('No cloud connection.');
    }

    body(`<div class="si-status"><i class="ti ti-loader" aria-hidden="true"></i> Saving…</div>`);

    try {
      const locationId = await window.BarStockParIntelligence.fetchLocationId();
      const week = window.BarStockWeek.cycleWeekKey();

      let u = `${url}/rest/v1/inventory_snapshots` +
              `?location_id=eq.${locationId}&week_start=eq.${week}` +
              `&item_name=eq.${encodeURIComponent(_row.item)}`;
      if (_row.code) u += `&code=eq.${encodeURIComponent(_row.code)}`;
      u += '&select=id,ordered';

      const res = await fetch(u, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      const snaps = await res.json();

      // Sin fila de esta semana no hay donde anotarlo, y callarse seria
      // dejar al usuario creyendo que quedo guardado. El caso real es un
      // ciclo que todavia no se ha abierto.
      if (!Array.isArray(snaps) || !snaps.length) {
        return error('No open week for this item yet. Start the cycle first.');
      }

      const antes = Number(snaps[0].ordered || 0);
      const patch = await fetch(`${url}/rest/v1/inventory_snapshots?id=eq.${snaps[0].id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: key, Authorization: `Bearer ${key}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ ordered: antes + qty })
      });
      if (!patch.ok) throw new Error(patch.status + ' · ' + (await patch.text()).slice(0, 180));

      if (typeof window.setStatus === 'function') {
        window.setStatus(`${qty} of '${_row.item}' recorded as received.`);
      }
      cerrar(true);
    } catch (e) {
      console.warn('[entrada] no se pudo registrar', e);
      error(e.message || String(e));
    }
  }

  function error(msg) {
    body(`
      <div class="si-item">${esc(_row ? _row.item : '')}</div>
      <div class="si-status si-bad">${esc(msg)}</div>
      <div class="si-foot">
        <button type="button" class="si-cancel" id="siX">Close</button>
        <button type="button" class="si-go" id="siBack">Back</button>
      </div>`);
    $('siX').onclick = cerrar;
    $('siBack').onclick = paint;
  }

  function cerrar(guardado) {
    const bg = $('siBg');
    if (bg) bg.classList.add('hidden');
    const cb = _onDone;
    _row = null; _onDone = null; _qty = 1;
    if (cb) cb(!!guardado);
  }

  function open(row, onDone) {
    if (!row) return;
    build();
    _row = row;
    _qty = 1;
    _onDone = onDone || null;
    $('siBg').classList.remove('hidden');
    paint();
  }

  window.BarStockStockIn = { open };
})();
