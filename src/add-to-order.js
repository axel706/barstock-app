(() => {
  if (window.BarStockAddToOrder) return;

  // ── Agregar un producto a la orden en curso ──────────────────────────
  //
  // El problema: la tabla de ordenes solo enseña filas con
  // getEffectiveOrder(r) > 0. Un producto con TO ORDER en 0 no sale, asi
  // que para pedirlo habia que colocar la orden y luego hacer un Quick
  // Order aparte. Dos ordenes para una sola compra.
  //
  // Esto NO inventa nada nuevo: escribe `orderOverride`, que es
  // exactamente lo que hace teclear en la casilla FINAL ORDER. La fila
  // aparece, el boton Auto la devuelve a su sitio, y la orden se coloca
  // por el mismo camino de siempre.
  //
  // ── Los dos casos que no se pueden dejar en silencio ─────────────────
  //
  // 1. `supportsManualFinalOrder` solo acepta SOUTHERN, BREAKTHRU, WINE
  //    MERCHANT y LOOP. En otro proveedor, escribir orderOverride no
  //    hace nada: getEffectiveOrder lo ignora y se cae al toOrder. Por
  //    eso el boton se deshabilita en ALL y UNKNOWN en vez de aceptar el
  //    clic y no hacer nada.
  //
  // 2. Si el producto YA se coloco en este ciclo, isRowPlaced lo saca de
  //    la tabla pase lo que pase el override. Agregarlo se veria como
  //    exito y la fila nunca apareceria. Esos salen en gris, marcados.

  const $ = (id) => document.getElementById(id);

  let _sel = null;      // indice en state.master
  let _qty = 1;
  let _q = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function num(n) { return Number(n) || 0; }

  function fmt(n) {
    const x = Math.round(num(n) * 100) / 100;
    return String(x);
  }

  // index.html declara activeVendorTab con `let`, asi que no esta en
  // window. Lee por el getter en vez de por una copia: una copia se
  // desincroniza en cuanto alguien cambie la pestaña por otro camino.
  function vendorActivo() {
    const f = window.getActiveVendorTab;
    return String((typeof f === 'function' ? f() : '') || '').toUpperCase();
  }

  function vendorSirve(v) {
    return typeof window.supportsManualFinalOrder === 'function' &&
           window.supportsManualFinalOrder(v);
  }

  // ── El boton de la barra ─────────────────────────────────────────────

  function sync() {
    const btn = $('addToOrderBtn');
    if (!btn) return;
    const v = vendorActivo();
    const ok = !!v && v !== 'ALL' && v !== 'UNKNOWN' && vendorSirve(v);
    btn.disabled = !ok;
    btn.title = ok
      ? `Add a product to the ${v} order`
      : 'Pick a vendor tab first — this only works on an order you can place.';
    const lbl = btn.querySelector('.tb-label');
    if (lbl) lbl.textContent = ok ? 'Add product' : 'Pick a vendor';
  }

  // ── Candidatos ───────────────────────────────────────────────────────
  //
  // Del proveedor activo, ordenados por lo que falta: primero lo que no
  // tienes. Lo que ya esta en la orden y lo ya colocado se quedan en la
  // lista pero bloqueados, porque verlos ahi contesta la pregunta
  // "¿ya lo pedi?" sin salir del panel.
  function candidatos() {
    const v = vendorActivo();
    const master = (window.state && window.state.master) || [];
    const q = _q.trim().toLowerCase();

    const out = [];
    for (let i = 0; i < master.length; i++) {
      const r = master[i];
      if (!r || String(r.vendor || '').toUpperCase() !== v) continue;

      if (q) {
        const heno = (String(r.item || '') + ' ' + String(r.code || '')).toLowerCase();
        if (!heno.includes(q)) continue;
      }

      const colocado = typeof window.isRowPlaced === 'function' && window.isRowPlaced(r);
      const yaVa = !colocado &&
        typeof window.getEffectiveOrder === 'function' &&
        num(window.getEffectiveOrder(r)) > 0;

      out.push({ idx: i, row: r, colocado, yaVa });
    }

    out.sort((a, b) => {
      const libreA = (a.colocado || a.yaVa) ? 1 : 0;
      const libreB = (b.colocado || b.yaVa) ? 1 : 0;
      if (libreA !== libreB) return libreA - libreB;
      const fa = num(a.row.suggested) - num(a.row.onHand);
      const fb = num(b.row.suggested) - num(b.row.onHand);
      if (fb !== fa) return fb - fa;
      return String(a.row.item || '').localeCompare(String(b.row.item || ''));
    });

    return out.slice(0, 60);
  }

  // ── Pintado ──────────────────────────────────────────────────────────

  function build() {
    if ($('atoBg')) return;
    const el = document.createElement('div');
    el.id = 'atoBg';
    el.className = 'modalbg hidden';
    el.innerHTML = '<div class="ato-modal"><div id="atoBody"></div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) cerrar(); });
  }

  function paint() {
    const body = $('atoBody');
    if (!body) return;
    const v = vendorActivo();

    body.innerHTML = `
      <div class="ato-head">
        <i class="ti ti-plus" aria-hidden="true"></i>
        Add to this order
        <span class="ato-vendor">${esc(v)}</span>
      </div>
      <input class="ato-search ui-control" id="atoSearch" type="text"
             autocomplete="off" placeholder="Search by name or code"
             aria-label="Search products" value="${esc(_q)}">
      <div class="ato-list" id="atoList"></div>
      <div class="ato-foot">
        <span class="ato-qty-label">Bottles</span>
        <div class="ato-step">
          <button type="button" id="atoMinus" class="ui-control" aria-label="One less">−</button>
          <input class="ui-control" id="atoQty" type="text" inputmode="numeric"
                 pattern="[0-9]*" autocomplete="off" aria-label="Bottles" value="${_qty}">
          <button type="button" id="atoPlus" class="ui-control" aria-label="One more">+</button>
        </div>
        <button type="button" class="ato-cancel ui-control" id="atoX">Cancel</button>
        <button type="button" class="ato-add" id="atoGo">Add</button>
      </div>
      <div class="ato-note">
        Sets the final order for that product. The suggested quantity stays
        untouched — <b>Auto</b> still puts it back.
      </div>`;

    paintList();

    const s = $('atoSearch');
    s.oninput = () => { _q = s.value; _sel = null; paintList(); };
    s.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (_sel === null) {
          const libres = candidatos().filter(c => !c.colocado && !c.yaVa);
          if (libres.length) { _sel = libres[0].idx; paintList(); }
        } else {
          guardar();
        }
      }
    };

    const q = $('atoQty');
    $('atoMinus').onclick = () => { _qty = Math.max(1, _qty - 1); q.value = _qty; };
    $('atoPlus').onclick  = () => { _qty = Math.min(999, _qty + 1); q.value = _qty; };
    q.onfocus = () => { try { q.select(); } catch (e) {} };
    q.oninput = () => {
      let limpio = q.value.replace(/[^0-9]/g, '');
      if (limpio && Number(limpio) > 999) limpio = '999';
      if (limpio !== q.value) q.value = limpio;
      _qty = Number(limpio) || 0;
    };
    q.onblur = () => { _qty = Math.max(1, Number(q.value) || 1); q.value = _qty; };
    $('atoX').onclick = cerrar;
    $('atoGo').onclick = guardar;

    try { s.focus(); } catch (e) {}
  }

  function paintList() {
    const list = $('atoList');
    if (!list) return;
    const cands = candidatos();

    if (!cands.length) {
      list.innerHTML = `<div class="ato-empty">${
        _q ? 'Nothing matches that.' : 'No products for this vendor.'
      }</div>`;
      syncGo();
      return;
    }

    list.innerHTML = cands.map(c => {
      const r = c.row;
      const off = c.colocado || c.yaVa;
      const sel = !off && _sel === c.idx;
      let flag = '', sub;
      if (c.colocado) {
        flag = ' <span class="ato-flag">· already ordered this cycle</span>';
        sub = `${esc(r.code || '—')} · on hand ${fmt(r.onHand)}`;
      } else if (c.yaVa) {
        flag = ' <span class="ato-flag">· already in this order</span>';
        sub = `${esc(r.code || '—')} · final order ${fmt(window.getEffectiveOrder(r))}`;
      } else {
        sub = `${esc(r.code || '—')} · on hand ${fmt(r.onHand)} · suggested ` +
              `${fmt(r.suggested)} · to order ${fmt(r.toOrder)}`;
      }
      return `<div class="ato-row${off ? ' off' : ''}${sel ? ' sel' : ''}"
                   data-idx="${c.idx}" data-off="${off ? 1 : 0}">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;min-width:0">
            <div class="ato-name">${esc(r.item)}${flag}</div>
            <div class="ato-sub">${sub}</div>
          </div>
          ${sel ? '<span class="ato-pick">Selected</span>' : ''}
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.ato-row').forEach(el => {
      el.onclick = () => {
        if (el.dataset.off === '1') return;
        _sel = Number(el.dataset.idx);
        paintList();
      };
    });

    syncGo();
  }

  function syncGo() {
    const go = $('atoGo');
    if (go) go.disabled = _sel === null;
  }

  // ── Guardar ──────────────────────────────────────────────────────────

  function guardar() {
    if (_sel === null) return;
    const master = (window.state && window.state.master) || [];
    const row = master[_sel];
    if (!row) return cerrar();

    const qty = Math.max(1, Number(_qty) || 1);

    // Repetir la comprobacion aqui, no solo al pintar: entre que se abrio
    // el panel y el clic pudo entrar una sincronizacion de la nube.
    if (!vendorSirve(row.vendor)) {
      const n = $('atoBody') && $('atoBody').querySelector('.ato-note');
      if (n) n.innerHTML = `<span class="ato-bad">'${esc(row.vendor)}' doesn't take a manual final order.</span>`;
      return;
    }
    if (typeof window.isRowPlaced === 'function' && window.isRowPlaced(row)) {
      const n = $('atoBody') && $('atoBody').querySelector('.ato-note');
      if (n) n.innerHTML = `<span class="ato-bad">That one was already placed this cycle. Use Quick Order for an extra run.</span>`;
      _sel = null;
      paintList();
      return;
    }

    window.updateFinalOrder(_sel, qty);
    cerrar();
  }

  function cerrar() {
    const bg = $('atoBg');
    if (bg) bg.classList.add('hidden');
    _sel = null; _qty = 1; _q = '';
  }

  function open() {
    const v = vendorActivo();
    if (!v || v === 'ALL' || v === 'UNKNOWN' || !vendorSirve(v)) return;
    build();
    _sel = null; _qty = 1; _q = '';
    $('atoBg').classList.remove('hidden');
    paint();
  }

  function init() {
    const btn = $('addToOrderBtn');
    if (btn && !btn._ato) { btn._ato = true; btn.addEventListener('click', open); }
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.BarStockAddToOrder = { open, sync, init };
})();
