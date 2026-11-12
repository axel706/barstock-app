(() => {
  if (window.BarStockMobileSales) return;

  // ── Las hojas de Toast Sales: "All products" y "Full report" ─────────
  //
  // Axel, 2026-11-12, sobre lámina. La tarjeta Toast Sales del Home sólo
  // enseña las tres más vendidas del día; "All products" abre una hoja
  // sobre el Home con TODO lo vendido ese día en botellas, del que más al
  // que menos, contra lo normal de ese producto ese día de la semana.
  //
  //   · Arriba, los mismos siete días que la tarjeta, en pastillas. Abre
  //     en el día que estaba elegido en la tarjeta.
  //   · El total del día y cómo va contra lo normal (el mismo de la
  //     tarjeta: sale de toast-sales.resumir).
  //   · Un filtro por nombre.
  //   · Cada producto, con su proveedor, una barrita de tamaño y la
  //     diferencia contra lo normal: la mediana de run-out para ese día
  //     de la semana (live-cache.medianas), el mismo número con que se
  //     calcula cuándo se acaba.
  //   · Tocar un producto abre su ficha.
  //
  // "Full report", desde la vista $: las mismas pastillas; el Net sales
  // del día partido en licor (con cócteles) y vino; y dos secciones con
  // cada artículo de Toast vendido ese día, cuántos y cuánto, y qué parte
  // del día es. Los cócteles salen como cócteles: su precio no se reparte
  // entre botellas (Axel). Al pie, lo que el dinero deja fuera —la
  // cerveza, el open bar— con su importe, para que no desaparezca en
  // silencio. Un artículo de Toast no es un producto del inventario:
  // sus filas no abren ficha.
  //
  // Los números los hace toast-sales.js; aquí sólo se pinta.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const b1 = (n) => String(Math.round((Number(n) || 0) * 10) / 10);
  const norm = (s) => typeof window.normalizeName === 'function'
    ? window.normalizeName(s || '') : String(s || '').toLowerCase().trim();
  const master = () => (window.state && window.state.master) || [];
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fechaCorta = (f) => { const d = new Date(f + 'T12:00:00Z'); return M[d.getUTCMonth()] + ' ' + d.getUTCDate(); };

  let _dia = 0, _q = '', _vista = 'botellas';
  const dinero0 = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

  function cerrar() {
    const h = document.getElementById('mSheet');
    if (h) h.remove();
  }

  // o = { vista: 'botellas' | 'dinero', dia: índice en la semana }
  function abrir(o) {
    o = o || {};
    const TS = window.BarStockToastSales;
    if (!TS) return;
    TS.ahora().then(V => {
      if (!V || !V.semana || !V.semana.length) return;
      _dia = o.dia == null || o.dia >= V.semana.length ? V.semana.length - 1 : o.dia;
      _q = '';
      _vista = o.vista === 'dinero' ? 'dinero' : 'botellas';
      const din = _vista === 'dinero';
      cerrar();
      const h = document.createElement('div');
      h.className = 'm-sheet';
      // El id no es decoración: las reglas de las hojas se apoyan en él
      // para ganarle en especificidad al radio de app.css.
      h.id = 'mSheet';
      h.innerHTML = `
        <div class="m-sheet-bg"></div>
        <div class="m-sheet-box m-vl" role="dialog" aria-label="${din ? 'Full report' : 'All products'}">
          <div class="m-sheet-grip"></div>
          <div class="m-vl-t">${din ? 'Full report' : 'All products'}</div>
          <div class="m-vl-s">${din ? 'Net sales in Toast · after discounts, before tax'
                                    : 'Bottles sold in Toast · from recipes and pours'}</div>
          <div class="m-vl-chips" id="mvChips"></div>
          <div class="m-vl-tot" id="mvTot"></div>
          ${din ? '<div class="m-ts-ley m-vl-ley" id="mvLey"></div>' : `
          <div class="m-searchbar on m-vl-bus">
            <i class="ti ti-search" aria-hidden="true"></i>
            <input id="mvQ" type="search" inputmode="search" autocomplete="off"
                   placeholder="Filter products" aria-label="Filter products">
          </div>`}
          <div id="mvLista"></div>
        </div>`;
      document.body.appendChild(h);
      h.querySelector('.m-sheet-bg').onclick = cerrar;
      if (window.BarStockSheet) window.BarStockSheet.enganchar(h, cerrar);
      const q = h.querySelector('#mvQ');
      if (q) q.oninput = () => { _q = q.value; pintar(h, V); };
      pintar(h, V);
    }).catch(e => console.warn('[ventas] All products', e));
  }

  function pintar(h, V) {
    const TS = window.BarStockToastSales, LC = window.BarStockLiveCache;
    const sem = V.semana;
    const d = sem[_dia];

    const chips = h.querySelector('#mvChips');
    chips.innerHTML = sem.map((x, k) => `
      <span class="m-vl-c${k === _dia ? ' on' : ''}" data-d="${k}" role="button" tabindex="0">
        ${x.dia}<small>${fechaCorta(x.fecha)}</small></span>`).join('');
    chips.querySelectorAll('[data-d]').forEach(c => {
      const elegir = () => { _dia = Number(c.dataset.d); pintar(h, V); };
      c.onclick = elegir;
      c.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); elegir(); } };
    });

    if (_vista === 'dinero') return pintarDinero(h, V, d);

    const todos = TS.masVendido(V.base, d.fecha, 'botellas');
    const n = d.normalBotellas;
    const cmp = !d.cargado ? 'No data for this day'
      : !d.botellas && !n ? 'Closed'
      : n ? ((d.botellas - n) / n * 100 >= 0 ? '↗ ' : '↘ ') + Math.abs(Math.round((d.botellas - n) / n * 100)) + '% vs usual ' + d.dia
      : '';
    h.querySelector('#mvTot').innerHTML = `
      <b>${b1(d.botellas)}</b><span>bottles · ${todos.length} product${todos.length === 1 ? '' : 's'} · ${d.dia}</span>
      <em class="${n && cmp ? (d.botellas >= n ? 'm-ts-up' : 'm-ts-dn') : ''}">${esc(cmp)}</em>`;

    const t = norm(_q);
    const filas = t.length >= 2 ? todos.filter(x => norm(x.nombre).includes(t)) : todos;
    const tope = Math.max(1e-9, ...todos.map(x => x.botellas));
    const lista = h.querySelector('#mvLista');
    if (!filas.length) {
      lista.innerHTML = `<div class="m-vl-nada">${todos.length ? 'Nothing matches.' : 'Nothing sold this day.'}</div>`;
      return;
    }
    const w = new Date(d.fecha + 'T12:00:00Z').getUTCDay();
    lista.innerHTML = filas.map(x => {
      const r = master().find(m => m && m.item === x.nombre);
      const med = r && LC && LC.medianas ? LC.medianas(r) : null;
      const dif = med ? x.botellas - med[w] : null;
      const txt = dif === null ? '' : Math.abs(dif) < 0.05 ? '— usual' : (dif > 0 ? '↗ ' : '↘ ') + b1(Math.abs(dif));
      const tono = dif === null || Math.abs(dif) < 0.05 ? 'eq' : dif > 0 ? 'up' : 'dn';
      return `
        <div class="m-vl-r" data-item="${esc(x.nombre)}" role="button" tabindex="0">
          <span class="n">${esc(x.nombre)}<small>${esc((r && r.vendor) || '')}</small>
            <i style="width:${(x.botellas / tope * 100).toFixed(1)}%"></i></span>
          <span class="v">${b1(x.botellas)}<small class="${tono}">${txt}</small></span>
        </div>`;
    }).join('');
    lista.querySelectorAll('[data-item]').forEach(f => {
      const ir = () => {
        cerrar();
        const S = window.BarStockMobileSearch;
        if (S && S.abrirItem) S.abrirItem(f.dataset.item);
      };
      f.onclick = ir;
      f.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ir(); } };
    });
  }

  function pintarDinero(h, V, d) {
    const TS = window.BarStockToastSales;
    const n = d.normalDinero;
    const cmp = !d.cargado ? 'No data for this day'
      : !d.dinero && !n ? 'Closed'
      : n ? ((d.dinero - n) / n * 100 >= 0 ? '↗ ' : '↘ ') + Math.abs(Math.round((d.dinero - n) / n * 100)) + '% vs usual ' + d.dia
      : '';
    h.querySelector('#mvTot').innerHTML = `
      <b>${dinero0(d.dinero)}</b><span>net · ${d.dia}</span>
      <em class="${n && cmp ? (d.dinero >= n ? 'm-ts-up' : 'm-ts-dn') : ''}">${esc(cmp)}</em>`;
    h.querySelector('#mvLey').innerHTML = `
      <span><i class="licor"></i>Liquor & cocktails ${dinero0(d.licor)}</span>
      <span><i class="vino"></i>Wine ${dinero0(d.vino)}</span>`;

    const todos = TS.masVendido(V.base, d.fecha, 'dinero');
    const lista = h.querySelector('#mvLista');
    const fuera = TS.fuera(V.base, d.fecha);
    const pieFuera = fuera.length
      ? `<div class="m-vl-pie">Not in this report: ${fuera.map(x => esc(x.categoria) + ' ' + dinero0(x.dinero)).join(' · ')}</div>` : '';
    // Una línea sin precio no suma como $0: se dice cuántas hubo.
    const pieSin = d.sinPrecio
      ? `<div class="m-vl-pie">${d.sinPrecio} line${d.sinPrecio === 1 ? '' : 's'} came without a price and ${d.sinPrecio === 1 ? 'is' : 'are'} not counted.</div>` : '';
    if (!todos.length) {
      lista.innerHTML = '<div class="m-vl-nada">Nothing sold this day.</div>' + pieFuera + pieSin;
      return;
    }
    const total = d.dinero || todos.reduce((a, x) => a + x.dinero, 0);
    const seccion = (cat, titulo, sub) => {
      const xs = todos.filter(x => x.categoria === cat);
      if (!xs.length) return '';
      const tope = Math.max(1e-9, ...xs.map(x => x.dinero));
      return `
        <div class="m-vl-sec"><span>${titulo}</span><b>${dinero0(sub)}</b></div>
        ${xs.map(x => `
          <div class="m-vl-r m-vl-r-din">
            <span class="n">${esc(x.nombre)}<small>${Math.round(x.unidades)} sold</small>
              <i class="${cat}" style="width:${(x.dinero / tope * 100).toFixed(1)}%"></i></span>
            <span class="v">${dinero0(x.dinero)}<small class="eq">${total ? (x.dinero / total * 100).toFixed(1) + '%' : ''}</small></span>
          </div>`).join('')}`;
    };
    lista.innerHTML = seccion('licor', 'Liquor & cocktails', d.licor) + seccion('vino', 'Wine', d.vino) + pieFuera + pieSin;
  }

  window.BarStockMobileSales = { abrir, cerrar };
})();
