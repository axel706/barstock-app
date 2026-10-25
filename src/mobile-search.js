(() => {
  if (window.BarStockMobileSearch) return;

  // ── Buscar un producto desde el teléfono ─────────────────────────────
  //
  // El caso real: Axel no está en el restaurante, le escriben "no hay St
  // Germain", y necesita contestar en diez segundos. Hoy eso son cuatro
  // toques y una tabla de ocho columnas pensada para una pantalla de 27
  // pulgadas.
  //
  // Dos niveles a propósito:
  //
  //   LISTA   la respuesta corta — cuánto hay, dónde, y ya. La mayoría
  //           de las veces no hace falta abrir nada.
  //   FICHA   al tocar uno: para cuántos días alcanza, el par, cuándo
  //           se pidió. Lo que hace falta para DECIDIR, no sólo para
  //           contestar.
  //
  // ── Los que están en cero también salen ──────────────────────────────
  //
  // "No aparece en la búsqueda" y "no hay existencias" son dos
  // respuestas distintas, y si el producto en cero se escondiera se
  // verían igual. El que no tiene sale, en rojo, diciéndolo.
  //
  // ── Y los escondidos también ─────────────────────────────────────────
  //
  // La regla de esconder lo que no se mueve vale para la lista de
  // inventario, no para una búsqueda: buscar algo por su nombre es la
  // prueba de que lo quieres ver.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const n2 = (x) => String(Math.round((Number(x) || 0) * 100) / 100);

  // Cuatro semanas es el listón que ya usa Pour-IQ para dejar de
  // "observar". Por debajo de eso el promedio es una corazonada, y
  // "te alcanza para 6 días" calculado sobre una corazonada es
  // justamente el tipo de dato que se cree y no se debería.
  const SEMANAS_PARA_FIAR = 4;

  let _q = '';

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

  function buscar(q) {
    const t = norm(q);
    if (t.length < 2) return [];
    return master()
      .filter(r => norm(r.item).includes(t) || norm(r.code).includes(t))
      .sort((a, b) => {
        // Primero los que empiezan por lo que escribiste: con "cas",
        // Casamigos antes que "Delicias del Cascabel".
        const ea = norm(a.item).startsWith(t) ? 0 : 1;
        const eb = norm(b.item).startsWith(t) ? 0 : 1;
        if (ea !== eb) return ea - eb;
        return String(a.item).localeCompare(String(b.item));
      })
      .slice(0, 40);
  }

  // ── El color del numero es la respuesta rapida ───────────────────────
  function tono(r) {
    const oh = Number(r.onHand) || 0;
    if (oh <= 0) return { c: '#f87171', t: 'out of stock' };
    const sug = Number(r.suggested) || 0;
    if (sug > 0 && oh / sug <= 0.25) return { c: '#fbbf24', t: 'running low' };
    return { c: '#4ade80', t: '' };
  }

  // ── Lista ────────────────────────────────────────────────────────────

  function pintarLista(host) {
    const caja = host.querySelector('#msList');
    const cnt = host.querySelector('#msCount');
    if (!caja) return;

    if (norm(_q).length < 2) {
      caja.innerHTML = '<div class="m-empty">Type at least two letters.</div>';
      if (cnt) cnt.textContent = '';
      return;
    }

    const res = buscar(_q);
    if (cnt) cnt.textContent = res.length ? res.length + ' match' + (res.length === 1 ? '' : 'es') : '';

    if (!res.length) {
      caja.innerHTML = `<div class="m-empty">Nothing called “${esc(_q)}”.<br>
        <small>If it is on the shelf, it is not in the inventory yet.</small></div>`;
      return;
    }

    caja.innerHTML = res.map((r, i) => {
      const k = tono(r);
      const mi = master().indexOf(r);
      return `
        <button type="button" class="m-card m-res" data-i="${mi}">
          <span class="m-res-l">
            <span class="m-res-n">${esc(r.item)}</span>
            <span class="m-res-s" data-zonas="${mi}">${esc(r.vendor || '')}</span>
          </span>
          <span class="m-res-r">
            <b style="color:${k.c}">${n2(r.onHand)}</b>
            <small>${esc(k.t)}</small>
          </span>
          <i class="ti ti-chevron-right m-chev" aria-hidden="true"></i>
        </button>`;
    }).join('');

    caja.querySelectorAll('.m-res').forEach(b => {
      b.onclick = () => ficha(host, Number(b.dataset.i));
    });

    // Las zonas llegan despues: son una consulta por producto y no
    // pueden retrasar la lista, que es lo que se vino a ver.
    pintarZonasEnLista(caja, res);
  }

  async function pintarZonasEnLista(caja, res) {
    const Z = window.BarStockZones;
    if (!Z) return;
    try { if (!Z.lista().length) await Z.cargar(); } catch (e) {}
    if (!Z.activas()) return;

    // Solo los primeros: con cuarenta resultados serian cuarenta
    // consultas, y nadie mira mas alla del quinto.
    for (const r of res.slice(0, 6)) {
      const mi = master().indexOf(r);
      const el = caja.querySelector('[data-zonas="' + mi + '"]');
      if (!el) continue;
      try {
        const d = await Z.donde(r.item);
        if (!d || !d.zonas.length) continue;
        el.innerHTML = esc(r.vendor || '') + ' · ' +
          d.zonas.filter(z => z.botellas > 0)
                 .map(z => '<b>' + n2(z.botellas) + '</b> ' + esc(z.zona)).join(' · ');
      } catch (e) {}
    }
  }

  // ── Ficha ────────────────────────────────────────────────────────────

  function ficha(host, idx) {
    const r = master()[idx];
    if (!r) return;
    const par = parDe(r);
    const k = tono(r);

    const avg = par && par.avgUsed != null ? Number(par.avgUsed) : null;
    const semanas = par && par.normalWeeks ? par.normalWeeks : 0;

    // "Te alcanza para X dias" solo cuando el promedio se sostiene.
    // Con dos semanas de historia ese numero es una corazonada con
    // aspecto de dato, y es de los que se creen.
    const fiable = avg !== null && avg > 0 && semanas >= SEMANAS_PARA_FIAR;
    const dias = fiable ? Math.round((Number(r.onHand) || 0) / avg * 7) : null;

    const caja = host.querySelector('#msFicha');
    caja.innerHTML = `
      <button type="button" class="m-back" id="msBack">
        <i class="ti ti-chevron-left" aria-hidden="true"></i> Back to results
      </button>

      <div class="m-card m-fic">
        <div class="m-fic-n">${esc(r.item)}</div>
        <div class="m-fic-s">${esc(r.vendor || '')}${r.code ? ' · ' + esc(r.code) : ''}${r.category ? ' · ' + esc(r.category) : ''}</div>
        <div class="m-fic-big">
          <b style="color:${k.c}">${n2(r.onHand)}</b>
          <span>bottles on hand</span>
        </div>
        <div id="msZonas"></div>
      </div>

      <div class="m-card m-rows">
        <div class="m-row"><span>Uses per week</span><b style="color:#38bdf8">${avg !== null ? avg : '—'}</b></div>
        <div class="m-row"><span>Lasts about</span><b>${
          dias !== null ? dias + ' days'
            : `<span class="m-soft">needs ${SEMANAS_PARA_FIAR} weeks · has ${semanas}</span>`
        }</b></div>
        <div class="m-row"><span>Par</span><b>${n2(r.suggested)}${
          par && par.suggestedOptimal != null && par.suggestedOptimal !== Number(r.suggested)
            ? ' <span class="m-iq">· Pour·IQ says ' + par.suggestedOptimal + '</span>' : ''
        }</b></div>
        <div class="m-row m-row-end"><span>Unit price</span><b>${
          Number(r.value) > 0 ? '$' + Number(r.value).toFixed(2) : '—'
        }</b></div>
      </div>

      <div class="m-acts">
        <button type="button" class="m-act" id="msAdd"><i class="ti ti-plus" aria-hidden="true"></i> Add to order</button>
        <button type="button" class="m-act" id="msRecv"><i class="ti ti-truck-delivery" aria-hidden="true"></i> Received</button>
      </div>`;

    host.classList.add('ficha');
    caja.querySelector('#msBack').onclick = () => { host.classList.remove('ficha'); };

    const add = caja.querySelector('#msAdd');
    if (add) add.onclick = () => {
      // Con el proveedor del propio producto: sin el, el dialogo mira
      // la pestaña del escritorio y se cierra sin abrir nada.
      if (!window.BarStockAddToOrder) return;
      if (!window.BarStockAddToOrder.open(r.vendor)) {
        window.alert('This vendor does not take manual order lines.');
      }
    };
    const recv = caja.querySelector('#msRecv');
    if (recv) recv.onclick = () => {
      if (window.BarStockStockIn) window.BarStockStockIn.open(r, () => ficha(host, idx));
    };

    pintarZonasFicha(caja, r.item);
  }

  async function pintarZonasFicha(caja, item) {
    const Z = window.BarStockZones;
    if (!Z || !caja.querySelector('#msZonas')) return;
    try { await Z.pintarEn('msZonas', item); } catch (e) {}
  }

  // ── La pantalla ──────────────────────────────────────────────────────

  function mount(host) {
    host.innerHTML = `
      <!-- Sin encabezado propio: el logo lo pinta el armazón, fijo y en
           todas las pantallas. Dos logos era uno de más. -->
      <div class="m-searchbar on">
        <i class="ti ti-search" aria-hidden="true"></i>
        <input id="msInput" type="search" inputmode="search" autocomplete="off"
               placeholder="Do we have…" aria-label="Search products">
        <button type="button" id="msClear" aria-label="Clear"><i class="ti ti-x" aria-hidden="true"></i></button>
      </div>
      <div class="m-cnt" id="msCount"></div>

      <div id="msList"></div>
      <div id="msFicha"></div>`;

    const inp = host.querySelector('#msInput');
    inp.oninput = () => { _q = inp.value; host.classList.remove('ficha'); pintarLista(host); };
    host.querySelector('#msClear').onclick = () => {
      _q = ''; inp.value = ''; host.classList.remove('ficha'); pintarLista(host); inp.focus();
    };

    pintarLista(host);
  }

  function show(host) {
    host.classList.remove('ficha');
    pintarLista(host);

    // ── El foco va SIN setTimeout ──────────────────────────────────
    //
    // iOS sólo abre el teclado si el focus() ocurre dentro del gesto
    // que lo pidió. Con un setTimeout de 60ms el gesto ya terminó, así
    // que el teclado no salía: el primer toque entraba en Buscar sin
    // teclado y hacía falta un segundo toque sobre el campo.
    //
    // Esto funciona porque `ir()` es síncrono de principio a fin —monta
    // la pantalla y llama a show() dentro del mismo click—, así que
    // aquí seguimos dentro del gesto.
    const inp = host.querySelector('#msInput');
    if (inp) { try { inp.focus(); } catch (e) {} }
  }

  // Lo llama el Home al tocar un producto de Top movers: se entra a
  // Buscar y se abre su ficha directamente, sin teclear.
  function abrirItem(nombre) {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.ir('search');
    const host = document.querySelector('.m-screen[data-screen="search"]');
    if (!host) return;
    const i = master().findIndex(r => r.item === nombre);
    if (i >= 0) ficha(host, i);
  }

  window.BarStockMobileSearch = { mount, show, abrirItem };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      // Sin pestaña propia: su sitio lo ocupa el ciclo. Buscar no se
      // pierde — es lo primero del Home, grande y fijo, que es desde
      // donde se entra de verdad. Una pestaña para algo que ya tiene un
      // campo enorme dos dedos más arriba era un hueco desperdiciado en
      // la única barra que no se puede hacer más larga.
      id: 'search', icon: 'ti-search', label: 'Search', tab: false, orden: 20,
      mount, show
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
