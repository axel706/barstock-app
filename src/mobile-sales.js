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

  // _dia: un día de la semana (0 = lunes … 6 = domingo) o 'sem' (la
  // semana entera). _atras: qué semana (0 = la de hoy). Los dos llegan de
  // la tarjeta del Home: la hoja abre en lo mismo que estaba elegido.
  let _dia = 0, _atras = 0, _q = '', _vista = 'botellas';
  // Hoy se llama "Today" y la semana entera, por sus fechas, como en la
  // tarjeta del Home.
  const nomDia = (x) => x.semana ? x.dia : x.esHoy ? 'Today' : x.dia;
  const dinero0 = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

  // ── Las cuentas que comparten la hoja y la pantalla Sales del
  // escritorio (desk-sales.js, Axel 2026-11-25, lámina A) ────────────────
  //
  // Cómo va un día (o la semana) contra lo normal. Hoy cargado a medias,
  // o la semana en curso, no están cerrados: compararlos en % contra uno
  // entero mentiría. Devuelve { txt, tono } (tono: 'up', 'dn' o '').
  function comparar(d, vista) {
    const din = vista === 'dinero';
    const v = din ? d.dinero : d.botellas;
    const n = din ? d.normalDinero : d.normalBotellas;
    const txt = d.semana && d.parcial ? 'So far this week'
      : d.parcial ? 'So far today'
      : d.esHoy && !d.cargado ? 'Not synced yet today'
      : !d.cargado ? (d.semana ? 'No data for this week' : 'No data for this day')
      : !v && !n ? 'Closed'
      : n ? ((v - n) / n * 100 >= 0 ? '↗ ' : '↘ ') + Math.abs(Math.round((v - n) / n * 100)) + '% vs usual' + (d.semana ? '' : ' ' + d.dia)
      : '';
    return { txt, tono: n && txt && !d.parcial && d.cargado ? (v >= n ? 'up' : 'dn') : '' };
  }

  // Un producto contra lo normal: la mediana de run-out para ese día de la
  // semana (live-cache.medianas), o la suma de las siete para la semana
  // entera; la semana en curso no se compara. { txt, tono, usual, r }.
  function vsUsual(nombre, botellas, d) {
    const LC = window.BarStockLiveCache;
    const r = master().find(m => m && m.item === nombre);
    const med = r && LC && LC.medianas ? LC.medianas(r) : null;
    const w = new Date(d.fecha + 'T12:00:00Z').getUTCDay();
    const usual = !med ? null : d.semana ? (d.parcial ? null : med.reduce((a, b) => a + (Number(b) || 0), 0)) : med[w];
    const dif = usual === null || usual === undefined ? null : botellas - usual;
    const txt = dif === null ? '' : Math.abs(dif) < 0.05 ? '— usual' : (dif > 0 ? '↗ ' : '↘ ') + b1(Math.abs(dif));
    const tono = dif === null || Math.abs(dif) < 0.05 ? 'eq' : dif > 0 ? 'up' : 'dn';
    return { txt, tono, usual, dif, r };
  }

  // Lo que el dinero deja fuera (la cerveza, el open bar) y las líneas sin
  // precio, en palabras: no desaparecen en silencio.
  function pies(V, fechas, d) {
    const TS = window.BarStockToastSales;
    const fuera = TS && TS.fuera ? TS.fuera(V.base, fechas) : [];
    const out = [];
    if (fuera.length) out.push('Not in this report: ' + fuera.map(x => x.categoria + ' ' + dinero0(x.dinero)).join(' · '));
    if (d.sinPrecio) out.push(d.sinPrecio + ' line' + (d.sinPrecio === 1 ? '' : 's') + ' came without a price and ' + (d.sinPrecio === 1 ? 'is' : 'are') + ' not counted.');
    return out;
  }

  function cerrar() {
    const h = document.getElementById('mSheet');
    if (h) h.remove();
  }

  // o = { vista: 'botellas' | 'dinero', atras: semana, dia: 0–6 | 'sem' }
  function abrir(o) {
    o = o || {};
    // En el escritorio, su pantalla (desk-sales.js), no la hoja del
    // teléfono metida en una ventana (Axel, 2026-11-25: "no tiene una
    // pantalla dedicada de escritorio"). El escritorio es donde no está el
    // armazón del teléfono (body.m-shell).
    const DS = window.BarStockDeskSales;
    if (DS && DS.abrir && document.body && !document.body.classList.contains('m-shell')) return DS.abrir(o);
    const TS = window.BarStockToastSales;
    if (!TS) return;
    TS.ahora().then(V => {
      // La misma semana de lunes a domingo que la tarjeta del Home
      // (2026-11-14): llega por cuántas semanas atrás y el día por su
      // posición, así que es el mismo día.
      _atras = Math.max(0, Number(o.atras) || 0);
      const W = TS.semanaCal(V, _atras);
      if (!W) return;
      _dia = o.dia === 'sem' ? 'sem' : o.dia == null || o.dia > 6 || W.dias[o.dia].futuro ? 'sem' : o.dia;
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
    const W = TS.semanaCal(V, _atras);
    const sem = W.dias;
    const esSem = _dia === 'sem';
    const d = esSem ? W.total : sem[_dia];
    // Lo que entra en las listas: el día elegido, o lo ya pasado de la semana.
    const fechas = esSem ? W.fechas : d.fecha;

    // La semana entera primero, y sus siete días; lo que aún no llega, sin
    // poder elegirse.
    const chips = h.querySelector('#mvChips');
    chips.innerHTML = `
      <span class="m-vl-c${esSem ? ' on' : ''}" data-d="sem" role="button" tabindex="0">Week<small>${esc(W.etiqueta)}</small></span>` +
      sem.map((x, k) => x.futuro
        ? `<span class="m-vl-c fut" aria-disabled="true">${nomDia(x)}<small>${fechaCorta(x.fecha)}</small></span>`
        : `<span class="m-vl-c${k === _dia ? ' on' : ''}" data-d="${k}" role="button" tabindex="0">
        ${nomDia(x)}<small>${fechaCorta(x.fecha)}</small></span>`).join('');
    chips.querySelectorAll('[data-d]').forEach(c => {
      const elegir = () => { _dia = c.dataset.d === 'sem' ? 'sem' : Number(c.dataset.d); pintar(h, V); };
      c.onclick = elegir;
      c.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); elegir(); } };
    });

    if (_vista === 'dinero') return pintarDinero(h, V, d, fechas);

    const todos = TS.masVendido(V.base, fechas, 'botellas');
    const n = d.normalBotellas;
    const cmp = comparar(d, 'botellas').txt;
    h.querySelector('#mvTot').innerHTML = `
      <b>${b1(d.botellas)}</b><span>bottles · ${todos.length} product${todos.length === 1 ? '' : 's'} · ${esc(nomDia(d))}</span>
      <em class="${n && cmp ? (d.botellas >= n ? 'm-ts-up' : 'm-ts-dn') : ''}">${esc(cmp)}</em>`;

    const t = norm(_q);
    const filas = t.length >= 2 ? todos.filter(x => norm(x.nombre).includes(t)) : todos;
    const tope = Math.max(1e-9, ...todos.map(x => x.botellas));
    const lista = h.querySelector('#mvLista');
    if (!filas.length) {
      lista.innerHTML = `<div class="m-vl-nada">${todos.length ? 'Nothing matches.' : d.semana ? 'Nothing sold this week.' : 'Nothing sold this day.'}</div>`;
      return;
    }
    // Lo normal de cada producto (vsUsual, la cuenta que usa también la
    // pantalla Sales del escritorio).
    lista.innerHTML = filas.map(x => {
      const { txt, tono, r } = vsUsual(x.nombre, x.botellas, d);
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

  function pintarDinero(h, V, d, fechas) {
    const TS = window.BarStockToastSales;
    const n = d.normalDinero;
    const cmp = comparar(d, 'dinero').txt;
    h.querySelector('#mvTot').innerHTML = `
      <b>${dinero0(d.dinero)}</b><span>net · ${esc(nomDia(d))}</span>
      <em class="${n && cmp ? (d.dinero >= n ? 'm-ts-up' : 'm-ts-dn') : ''}">${esc(cmp)}</em>`;
    h.querySelector('#mvLey').innerHTML = `
      <span><i class="licor"></i>Liquor & cocktails ${dinero0(d.licor)}</span>
      <span><i class="vino"></i>Wine ${dinero0(d.vino)}</span>`;

    const todos = TS.masVendido(V.base, fechas, 'dinero');
    const lista = h.querySelector('#mvLista');
    // Lo que el dinero deja fuera y las líneas sin precio (pies, también
    // del escritorio).
    const [pieFuera, pieSin] = (() => {
      const ps = pies(V, fechas, d);
      const fuera = ps.find(x => /^Not in this report/.test(x));
      const sin = ps.find(x => /without a price/.test(x));
      return [fuera ? `<div class="m-vl-pie">${esc(fuera)}</div>` : '', sin ? `<div class="m-vl-pie">${esc(sin)}</div>` : ''];
    })();
    if (!todos.length) {
      lista.innerHTML = '<div class="m-vl-nada">' + (d.semana ? 'Nothing sold this week.' : 'Nothing sold this day.') + '</div>' + pieFuera + pieSin;
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

  window.BarStockMobileSales = { abrir, cerrar, comparar, vsUsual, pies, nomDia, fechaCorta };
})();
