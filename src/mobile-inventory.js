(() => {
  if (window.BarStockMobileInventory) return;

  // ── Inventario en el teléfono ────────────────────────────────────────
  //
  // Hasta ahora esta pestaña abría la tabla del escritorio: ocho
  // columnas escondiendo la mitad por CSS. Eso no es una pantalla de
  // teléfono, es una tabla encogida.
  //
  // Lo que se hace aquí de verdad es CORREGIR. De 270 artículos hay 94
  // sin proveedor y 66 sin precio, y hasta hoy no había ninguna
  // pantalla que lo pusiera delante. Así que esto no es "mirar el
  // estante": es una lista de trabajo.
  //
  // ── Lo que NO hace ───────────────────────────────────────────────────
  //
  // No escribe el on hand. La existencia sale del escáner y de recibir
  // mercancía, y de ningún otro sitio. Un inventario donde cualquier
  // pantalla puede escribir la existencia es un inventario del que no
  // te puedes fiar, y ahí se apoyan el par, el consumo y las órdenes.
  //
  // No busca productos tipo "¿tenemos Tito's?" — eso es la pestaña de
  // Buscar. Aquí el campo FILTRA lo que ya estás viendo, y por eso dice
  // "Filter 270 items" y no "Do we have…".
  //
  // No coloca órdenes ni renombra artículos. Renombrar arrastra alias,
  // normalizaciones y el histórico; vive en el modal del escritorio.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const num = (x) => Number(x) || 0;
  const n2 = (x) => String(Math.round(num(x) * 100) / 100);

  // El mismo listón que Pour·IQ: por debajo, "te alcanza para X días"
  // es una corazonada con aspecto de dato.
  const SEMANAS_PARA_FIAR = 4;

  let _q = '';
  let _solo = 'fix';     // fix | todo
  let _vendor = 'ALL';
  let _orden = 'valor';  // valor | nombre | falta
  let _verDormidos = false;

  function master() { return (window.state && window.state.master) || []; }

  function parDe(r) {
    const m = window.parAdjustments;
    if (!m || !m.size) return null;
    return m.get(r.item + '||' + (r.code || '')) || null;
  }

  function norm(s) {
    return typeof window.normalizeName === 'function'
      ? window.normalizeName(s || '')
      : String(s || '').trim().toLowerCase();
  }

  // ── Qué está incompleto ──────────────────────────────────────────────
  //
  // Sin proveedor, sin precio o sin par. La categoría NO cuenta: casi
  // ningún artículo la tiene, así que meterla aquí metería a todo el
  // mundo en la lista y la dejaría sin servir para nada.
  function faltas(r) {
    const f = [];
    if (!r.vendor || String(r.vendor).toUpperCase() === 'UNKNOWN') f.push('no vendor');
    if (!(num(r.value) > 0)) f.push('no price');
    if (!(num(r.suggested) > 0)) f.push('no par');
    return f;
  }

  const TONO = { 'no vendor': 'amber', 'no price': 'red', 'no par': 'gris' };

  // ── Cuánto hay contra su par ─────────────────────────────────────────
  function salud(r) {
    const oh = num(r.onHand), par = num(r.suggested);
    if (par <= 0) return { c: '#94a3b8', pct: null };
    const ratio = oh / par;
    if (oh <= 0) return { c: '#f87171', pct: 0 };
    if (ratio <= 0.25) return { c: '#f87171', pct: Math.round(ratio * 100) };
    if (ratio <= 0.60) return { c: '#fbbf24', pct: Math.round(ratio * 100) };
    return { c: '#4ade80', pct: Math.min(100, Math.round(ratio * 100)) };
  }

  function dias(r) {
    const p = parDe(r);
    if (!p) return null;
    const avg = Number(p.avgUsed) || 0;
    if (avg <= 0 || (p.normalWeeks || 0) < SEMANAS_PARA_FIAR) return null;
    return Math.round(num(r.onHand) / avg * 7);
  }

  // ── La lista ─────────────────────────────────────────────────────────

  function visibles() {
    const D = window.BarStockDormant;
    const t = norm(_q);

    let filas = master().filter(r => {
      // Los dormidos siguen escondidos, igual que en escritorio.
      // Esconder cosas sin decirlo es el error que ya evitamos una vez,
      // y por eso el interruptor está en el cajón de filtros con su
      // número al lado.
      if (!_verDormidos && D && D.estaQuieto && D.estaQuieto(r)) return false;

      if (_vendor !== 'ALL' && String(r.vendor || 'UNKNOWN').toUpperCase() !== _vendor) return false;
      if (_solo === 'fix' && !faltas(r).length) return false;
      if (t.length >= 2 && !(norm(r.item).includes(t) || norm(r.code).includes(t))) return false;
      return true;
    });

    // Por valor en el estante y de mayor a menor: arreglar el precio de
    // un producto de $38 que se mueve importa más que el de uno de $6.
    if (_orden === 'valor') {
      filas.sort((a, b) => (num(b.value) * num(b.onHand)) - (num(a.value) * num(a.onHand))
                           || String(a.item).localeCompare(String(b.item)));
    } else if (_orden === 'falta') {
      const r0 = (r) => { const par = num(r.suggested); return par > 0 ? num(r.onHand) / par : 99; };
      filas.sort((a, b) => r0(a) - r0(b));
    } else {
      filas.sort((a, b) => String(a.item).localeCompare(String(b.item)));
    }
    return filas;
  }

  function cuantos(pred) {
    const D = window.BarStockDormant;
    return master().filter(r => {
      if (!_verDormidos && D && D.estaQuieto && D.estaQuieto(r)) return false;
      return pred(r);
    }).length;
  }

  function pintarLista(host) {
    const caja = host.querySelector('#miList');
    if (!caja) return;

    const filas = visibles();
    if (!filas.length) {
      const nada = (ico, bien, t, s) => `
        <div class="m-nada">
          <span class="m-nada-i${bien ? ' bien' : ''}"><i class="ti ti-${ico}" aria-hidden="true"></i></span>
          <b>${t}</b><small>${s}</small>
        </div>`;

      caja.innerHTML = !master().length
        ? nada('package', false, 'No inventory yet',
               'Import a count or scan the shelf, and every product shows up here.')
        : _solo === 'fix'
          ? nada('circle-check', true, 'Nothing left to fix',
                 'Every product has a vendor, a price and a par. Switch to Everything to see the rest.')
          : nada('search-off', false, 'Nothing matches',
                 'No product fits the filter and the search together.');
      return;
    }

    // Se guarda el índice del maestro, no el de la lista filtrada: al
    // guardar, la lista se repinta y las posiciones cambian.
    caja.innerHTML = filas.map(r => {
      const i = master().indexOf(r);
      const s = salud(r);
      const f = faltas(r);
      const d = dias(r);
      const pedir = num(r.toOrder);

      const meta = [];
      if (!f.includes('no vendor')) meta.push(esc(r.vendor));
      if (d !== null) meta.push(d + (d === 1 ? ' day' : ' days'));
      if (pedir > 0) meta.push('order ' + n2(pedir));

      return `
        <!-- La cifra es su propia columna, centrada en el alto del
             renglón. Antes vivía en la primera línea junto al nombre y
             quedaba colgada arriba: es el dato que se viene a mirar y
             parecía una nota al margen. -->
        <button type="button" class="m-inv" data-i="${i}">
          <span class="m-inv-l">
            <span class="m-inv-n">${esc(r.item)}</span>
            <span class="m-inv-meta">
              ${f.map(x => `<em class="m-flag m-flag-${TONO[x]}">${x}</em>`).join('')}
              ${meta.length ? `<span>${meta.join(' · ')}</span>` : ''}
            </span>
          </span>
          <span class="m-inv-v">
            <b style="color:${s.c}">${n2(r.onHand)}</b><i>/${num(r.suggested) > 0 ? n2(r.suggested) : '—'}</i>
          </span>
          ${s.pct !== null ? `<span class="m-inv-bar" style="width:${s.pct}%;background:${s.c}"></span>` : ''}
        </button>`;
    }).join('');

    caja.querySelectorAll('.m-inv').forEach(b => {
      b.onclick = () => hoja(host, Number(b.dataset.i));
    });
  }

  function pintarCabecera(host) {
    const nFix = cuantos(r => faltas(r).length);
    const nTodo = cuantos(() => true);

    const seg = host.querySelector('#miSeg');
    if (seg) {
      seg.innerHTML = `
        <button type="button" class="${_solo === 'fix' ? 'on' : ''}" data-s="fix">
          Needs fixing <b>${nFix}</b></button>
        <button type="button" class="${_solo === 'todo' ? 'on' : ''}" data-s="todo">
          Everything <b>${nTodo}</b></button>`;
      seg.querySelectorAll('button').forEach(b => {
        b.onclick = () => { _solo = b.dataset.s; pintarCabecera(host); pintarLista(host); };
      });
    }

    const inp = host.querySelector('#miInput');
    if (inp) inp.placeholder = 'Filter ' + nTodo + ' items';

    const aj = host.querySelector('#miAdj');
    if (aj) aj.classList.toggle('on', _vendor !== 'ALL' || _orden !== 'valor' || _verDormidos);
  }

  // ── El cajón de filtros ──────────────────────────────────────────────

  function cajon(host) {
    const D = window.BarStockDormant;
    const nQuietos = D && D.cuantos ? D.cuantos(master()) : 0;
    const vendors = typeof window.getVendorsForFilter === 'function'
      ? window.getVendorsForFilter() : ['ALL'];

    const hoja_ = document.createElement('div');
    hoja_.className = 'm-sheet';
    // El id no es decoracion: las reglas de esta hoja se apoyan en el
    // para ganarle en especificidad al radio de app.css. Ver la
    // cabecera de mobile-app.css.
    hoja_.id = 'mSheet';
    hoja_.innerHTML = `
      <div class="m-sheet-bg"></div>
      <div class="m-sheet-box" role="dialog" aria-label="Filters">
        <div class="m-sheet-grip"></div>

        <div class="m-sheet-t">Vendor</div>
        <div class="m-chips">
          ${vendors.map(v => `<button type="button" class="m-chip${_vendor === v ? ' on' : ''}"
                                      data-v="${esc(v)}">${esc(v === 'ALL' ? 'All' : v)}</button>`).join('')}
        </div>

        <div class="m-sheet-t">Sort by</div>
        <div class="m-chips">
          <button type="button" class="m-chip${_orden === 'valor' ? ' on' : ''}" data-o="valor">Money on the shelf</button>
          <button type="button" class="m-chip${_orden === 'falta' ? ' on' : ''}" data-o="falta">Closest to empty</button>
          <button type="button" class="m-chip${_orden === 'nombre' ? ' on' : ''}" data-o="nombre">Name</button>
        </div>

        <button type="button" class="m-sheet-op${_verDormidos ? ' on' : ''}" id="miDorm">
          <span>Show ${nQuietos} dormant item${nQuietos === 1 ? '' : 's'}</span>
          <i class="ti ti-${_verDormidos ? 'eye' : 'eye-off'}" aria-hidden="true"></i>
        </button>
      </div>`;
    document.body.appendChild(hoja_);

    const cerrar = () => hoja_.remove();
    hoja_.querySelector('.m-sheet-bg').onclick = cerrar;

    const repintar = () => { pintarCabecera(host); pintarLista(host); };

    hoja_.querySelectorAll('[data-v]').forEach(b => {
      b.onclick = () => { _vendor = b.dataset.v; cerrar(); repintar(); };
    });
    hoja_.querySelectorAll('[data-o]').forEach(b => {
      b.onclick = () => { _orden = b.dataset.o; cerrar(); repintar(); };
    });
    const dm = hoja_.querySelector('#miDorm');
    if (dm) dm.onclick = () => { _verDormidos = !_verDormidos; cerrar(); repintar(); };
  }

  // ── La hoja de producto ──────────────────────────────────────────────
  //
  // Lo que se puede tocar y nada más. El "Next" de abajo es lo que
  // convierte 118 correcciones en una sesión en vez de 118 viajes a la
  // lista.

  function hoja(host, idx) {
    const r = master()[idx];
    if (!r) return;

    const p = parDe(r);
    const vendors = typeof window.getVendorsWithUnknown === 'function'
      ? window.getVendorsWithUnknown() : [];
    const actual = String(r.vendor || 'UNKNOWN').toUpperCase();

    // El siguiente de la lista TAL COMO SE VE ahora. Si se recalculara
    // al guardar, arreglar un artículo lo sacaría del filtro y el
    // "siguiente" saltaría dos.
    const lista = visibles();
    const pos = lista.indexOf(r);
    const sig = pos >= 0 && pos + 1 < lista.length ? lista[pos + 1] : null;

    const h = document.createElement('div');
    h.className = 'm-sheet';
    // El id no es decoracion: las reglas de esta hoja se apoyan en el
    // para ganarle en especificidad al radio de app.css. Ver la
    // cabecera de mobile-app.css.
    h.id = 'mSheet';
    h.innerHTML = `
      <div class="m-sheet-bg"></div>
      <div class="m-sheet-box m-edit" role="dialog" aria-label="Edit item">
        <div class="m-sheet-grip"></div>
        <div class="m-edit-n">${esc(r.item)}</div>
        <div class="m-edit-s">${r.code ? esc(r.code) + ' · ' : ''}${n2(r.onHand)} on hand${
          num(r.suggested) > 0 ? ' of ' + n2(r.suggested) : ''}</div>

        <div class="m-sheet-t">Vendor</div>
        <div class="m-chips" id="miVend">
          ${vendors.map(v => `<button type="button" class="m-chip${actual === v ? ' on' : ''}"
                                      data-nv="${esc(v)}">${esc(v)}</button>`).join('')}
        </div>

        <div class="m-sheet-t">Par</div>
        <div class="m-step">
          <button type="button" id="miLess" aria-label="Lower the par">−</button>
          <input id="miPar" type="number" inputmode="decimal" step="1" min="0"
                 value="${num(r.suggested)}" aria-label="Par">
          <button type="button" id="miMore" aria-label="Raise the par">+</button>
        </div>
        ${p && p.suggestedOptimal != null && Number(p.suggestedOptimal) !== num(r.suggested)
          ? `<button type="button" class="m-iqline" id="miIq">
               <i class="ti ti-brain" aria-hidden="true"></i>
               Pour·IQ says ${esc(String(p.suggestedOptimal))} — use it</button>`
          : ''}

        <div class="m-sheet-t">Unit price</div>
        <div class="m-money">
          <span>$</span>
          <input id="miVal" type="number" inputmode="decimal" step="0.01" min="0"
                 value="${num(r.value) || ''}" placeholder="0.00" aria-label="Unit price">
        </div>

        <div class="m-acts">
          <button type="button" class="m-act" id="miCancel">Cancel</button>
          <button type="button" class="m-act" id="miSave">Save</button>
        </div>
        ${sig ? `<button type="button" class="m-next" id="miNext">
                   Save and next · ${esc(String(sig.item).slice(0, 26))}
                   <i class="ti ti-arrow-right" aria-hidden="true"></i></button>` : ''}
      </div>`;
    document.body.appendChild(h);

    let vend = actual;
    h.querySelectorAll('[data-nv]').forEach(b => {
      b.onclick = () => {
        vend = b.dataset.nv;
        h.querySelectorAll('[data-nv]').forEach(x => x.classList.toggle('on', x === b));
      };
    });

    const par = h.querySelector('#miPar');
    const mas = (d) => { par.value = Math.max(0, (Number(par.value) || 0) + d); };
    h.querySelector('#miLess').onclick = () => mas(-1);
    h.querySelector('#miMore').onclick = () => mas(1);
    const iq = h.querySelector('#miIq');
    if (iq && p) iq.onclick = () => { par.value = Number(p.suggestedOptimal); };

    const cerrar = () => h.remove();
    h.querySelector('.m-sheet-bg').onclick = cerrar;
    h.querySelector('#miCancel').onclick = cerrar;

    async function guardar() {
      if (typeof window.bsSaveItemFields !== 'function') return false;
      const ok = await window.bsSaveItemFields(idx, {
        vendor: vend,
        suggested: Number(par.value) || 0,
        value: Number(h.querySelector('#miVal').value) || 0
      });
      if (ok) { pintarCabecera(host); pintarLista(host); }
      return ok;
    }

    h.querySelector('#miSave').onclick = async () => {
      const b = h.querySelector('#miSave');
      b.disabled = true;
      if (await guardar()) cerrar(); else b.disabled = false;
    };

    const nx = h.querySelector('#miNext');
    if (nx && sig) nx.onclick = async () => {
      nx.disabled = true;
      if (!(await guardar())) { nx.disabled = false; return; }
      cerrar();
      const j = master().indexOf(sig);
      if (j >= 0) hoja(host, j);
    };
  }

  // ── La pantalla ──────────────────────────────────────────────────────

  function mount(host) {
    host.innerHTML = `
      <div class="m-inv-h">
        <span class="m-inv-t">Inventory</span>
        <span class="m-inv-c" id="miTotal"></span>
      </div>

      <div class="m-inv-bar2">
        <div class="m-searchbar on">
          <i class="ti ti-filter" aria-hidden="true"></i>
          <input id="miInput" type="search" inputmode="search" autocomplete="off"
                 placeholder="Filter items" aria-label="Filter items">
        </div>
        <button type="button" class="m-adj" id="miAdj" aria-label="Filters and sorting">
          <i class="ti ti-adjustments-horizontal" aria-hidden="true"></i>
        </button>
      </div>

      <div class="m-seg" id="miSeg"></div>
      <div id="miList"></div>`;

    const inp = host.querySelector('#miInput');
    inp.oninput = () => { _q = inp.value; pintarLista(host); };
    host.querySelector('#miAdj').onclick = () => cajon(host);

    show(host);
  }

  function show(host) {
    const tot = host.querySelector('#miTotal');
    if (tot) tot.textContent = master().length ? master().length + ' items' : '…';
    pintarCabecera(host);
    pintarLista(host);
  }

  function refresh() {
    const host = document.querySelector('.m-screen[data-screen="inventory"]');
    if (host && host.classList.contains('on')) show(host);
  }

  window.BarStockMobileInventory = { refresh };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      id: 'inventory', icon: 'ti-package', label: 'Inventory',
      tab: true, orden: 30,
      mount, show,
      // show() reajusta el total y repinta; los filtros y la búsqueda
      // viven en el módulo, así que un refresco no los pierde.
      refrescar: show
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
