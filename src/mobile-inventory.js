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
  // ── Se entra por "Everything", no por "Needs fixing" ─────────────
  //
  // Arrancaba en los 31 incompletos. Eso contesta una pregunta de
  // mantenimiento —"¿qué me falta por llenar?"— que se hace de vez en
  // cuando; la de todos los días es "¿qué tengo?". Entrar en una lista
  // filtrada sin haberlo pedido es como se concluye que faltan
  // productos.
  //
  // Y va a la IZQUIERDA por lo mismo: el primero de un segmentado se
  // lee como el estado normal y el segundo como la desviación.
  let _solo = 'todo';    // todo | fix
  let _vendor = 'ALL';
  let _orden = 'valor';  // valor | nombre | falta
  // ── "See them" del Home (Axel, 2026-11-11, opción B) ──────────────
  //
  // 'agota': sólo lo que la tarjeta "Running out first" dice que se
  // acaba, en su orden (running-out.js, la misma lista). Una pastilla
  // debajo del buscador lo dice y lo quita. Vale para esa entrada: se
  // pone al entrar desde la tarjeta y se borra al entrar de cualquier
  // otra forma, como el orden pedido. Un refresco de datos no lo quita.
  let _filtro = null;
  const agotan = () => window.BarStockRunningOut ? window.BarStockRunningOut.lista() : [];

  function master() { return (window.state && window.state.master) || []; }

  // ── La cabecera del producto ─────────────────────────────────────
  //
  // La dibuja `src/product-hero.js`, el mismo que usa la ficha de
  // búsqueda. Si el módulo no estuviera cargado se cae a los dos
  // renglones de texto de antes: perder el adorno es molesto, quedarse
  // sin saber qué producto estás editando no es aceptable.
  function hero(r, p) {
    const H = window.BarStockProductHero;
    const sub = (r.code ? r.code + ' · ' : '') + String(r.vendor || '') +
                (r.bottleSizeMl ? ' · ' + r.bottleSizeMl + ' ml' : '');
    if (H && H.html) return H.html(r, { par: p, sub });
    return `<div class="m-edit-n">${esc(r.item)}</div>
            <div class="m-edit-s">${esc(sub)} · ${n2(r.onHand)} on hand${
              num(r.suggested) > 0 ? ' of ' + n2(r.suggested) : ''}</div>`;
  }

  // ── La fila "Bottle" ───────────────────────────────────────────────
  //
  // La única puerta para cambiar la silueta era "not this bottle?" dentro
  // del conteo: para corregir una forma había que reiniciar el ciclo y
  // estar contando. Esta fila abre el MISMO selector (bottle-picker.js),
  // que guarda en la fila de la locación y en el mapa global de todas
  // (item-shapes.js). No hay un segundo camino de guardado que pueda
  // dejar de decir lo mismo que el del conteo.
  //
  // Dice qué forma tiene AHORA, no sólo "cambiar": sin eso, para saber si
  // está bien hay que abrir el selector.
  function filaBotella(r) {
    const B = window.BarStockBottleProfiles;
    const clave = B ? B.resolveKey(r.bottleShape) : (r.bottleShape || 'generic');
    const sinForma = !r.bottleShape || clave === 'generic';
    const prof = B && !sinForma ? B.get(clave) : null;
    const nombre = sinForma ? 'Not set' : (prof && prof.name) || String(r.bottleShape);
    const tam = clave !== 'none' && r.bottleSizeMl ? r.bottleSizeMl + ' ml · ' : '';
    const sub = sinForma ? 'generic bottle · tap to choose' : tam + 'tap to change';
    let dibujo = '';
    if (B && B.pathFor) {
      const k = sinForma ? 'generic' : clave;
      const asa = B.asaFor ? B.asaFor(k, 34, 48, 3) : '';
      dibujo = `<svg class="m-botrow-sil" viewBox="0 0 34 48" width="34" height="48" aria-hidden="true">
        <path d="${B.pathFor(k, 34, 48, 3)}"/>${asa ? `<path d="${asa}"/>` : ''}</svg>`;
    }
    return `${dibujo}
      <span class="m-botrow-t"><b>${esc(nombre)}</b><small>${esc(sub)}</small></span>
      <i class="ti ti-chevron-right" aria-hidden="true"></i>`;
  }

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
  // El color del número de cada fila lo decide product-hero.js, el
  // mismo que pinta la ficha al tocarla. Aquí había otra regla con sus
  // propios cortes, y Tito's salía ámbar en la lista y verde en la
  // ficha. Sin el módulo, gris: mejor sin color que con uno que diga
  // otra cosa que la ficha.
  //
  // Cada fila llevaba además una barra de color en el fondo, lo que hay
  // contra el par. Se quitó en todas (Axel, 2026-11-11: "ya sé que
  // indican visualmente cuánto hay pero no me gusta"). El color sigue en
  // el número.
  // ── El LIVE en la lista (Axel, 2026-11-11, opción A con decimal) ────
  //
  // El número grande es el LIVE con "≈" y un decimal, y la línea de abajo
  // empieza con "● Live"; "Out Sat" detrás, en vez de los "days" de
  // Pour·IQ. El LIVE, cuándo se acaba y cuándo se relee viven en
  // live-cache.js, que comparten todas las pantallas: aquí sólo se pinta.
  // El color, los días y el orden salen del mismo número que se enseña:
  // un "≈7.1/8" verde ordenado por lo contado diría dos cosas.
  const LC = () => window.BarStockLiveCache;
  const vivoDe = (r) => LC() ? LC().vivo(r) : null;
  const cuanto = (r) => LC() ? LC().cuanto(r) : num(r.onHand);
  const toastLoVende = (r) => !!(LC() && LC().toastLoVende(r));
  const etiquetaAgota = (r) => LC() ? LC().etiquetaAgota(r) : '';
  function cargarVivo() { if (LC()) LC().cargar(); }
  // Cuando el LIVE termina de leerse (o se relee por una factura), la
  // lista se repinta si está a la vista.
  if (window.BarStockLiveCache) {
    window.BarStockLiveCache.alCambiar(() => {
      const host = document.querySelector('.m-screen[data-screen="inventory"]');
      // La cabecera también: la pastilla cuenta lo que se acaba.
      if (host && host.classList.contains('on')) { pintarCabecera(host); pintarLista(host); }
    });
  }

  function salud(r) {
    const H = window.BarStockProductHero;
    if (H && H.tono) return { c: H.tono(r).c };
    return { c: '#94a3b8' };
  }

  function dias(r) {
    const p = parDe(r);
    if (!p) return null;
    const avg = Number(p.avgUsed) || 0;
    if (avg <= 0 || (p.normalWeeks || 0) < SEMANAS_PARA_FIAR) return null;
    return Math.max(0, Math.round(cuanto(r) / avg * 7));
  }

  // ── La lista ─────────────────────────────────────────────────────────

  // ── Aquí ya no se esconde nada ──────────────────────────────────
  //
  // Esta lista escondía los "dormidos" —sin stock, sin par y quietos
  // ocho semanas— con un interruptor en el cajón de filtros. La idea
  // era no llenar la pantalla de productos muertos.
  //
  // Lo que costó: contando de noche, tres botellas no aparecían al
  // buscarlas y parecía que el inventario se estaba borrando. Y la
  // pestaña decía "Everything 164" con 260 productos en la base, que
  // es una pestaña mintiendo.
  //
  // Peor todavía: `estaQuieto` devuelve false mientras sus datos no
  // han cargado, así que el mismo producto estaba a las 2 y no a las
  // 8. Un filtro que aparece solo al rato no es un filtro, es un
  // fantasma.
  //
  // Everything es everything. Si la lista es larga, para eso está el
  // buscador. La regla sigue viva donde sí tiene sentido: el total
  // del conteo, en `src/count-session.js` — ahí esconder un producto
  // muerto no es mentir, es no pedirte que cuentes lo que no existe.
  function visibles() {
    const t = norm(_q);

    // El filtro de la tarjeta manda sobre el resto: sus productos, en su
    // orden. Sólo la búsqueda lo acota; el proveedor y "Needs fixing" no,
    // o la lista dejaría de ser la de la tarjeta sin decirlo.
    if (_filtro === 'agota') {
      return agotan().map(x => x.r)
        .filter(r => !(t.length >= 2) || norm(r.item).includes(t) || norm(r.code).includes(t));
    }

    let filas = master().filter(r => {
      if (_vendor !== 'ALL' && String(r.vendor || 'UNKNOWN').toUpperCase() !== _vendor) return false;
      if (_solo === 'fix' && !faltas(r).length) return false;
      if (t.length >= 2 && !(norm(r.item).includes(t) || norm(r.code).includes(t))) return false;
      return true;
    });

    // Por valor en el estante y de mayor a menor: arreglar el precio de
    // un producto de $38 que se mueve importa más que el de uno de $6.
    if (_orden === 'valor') {
      filas.sort((a, b) => (num(b.value) * cuanto(b)) - (num(a.value) * cuanto(a))
                           || String(a.item).localeCompare(String(b.item)));
    } else if (_orden === 'falta') {
      const r0 = (r) => { const par = num(r.suggested); return par > 0 ? cuanto(r) / par : 99; };
      filas.sort((a, b) => r0(a) - r0(b));
    } else {
      filas.sort((a, b) => String(a.item).localeCompare(String(b.item)));
    }
    return filas;
  }

  // Los números del segmentado cuentan sobre TODO el maestro, que es
  // lo que ahora se enseña. "Everything 260" y 260 en la lista.
  function cuantos(pred) {
    return master().filter(pred).length;
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
        : _filtro === 'agota' && norm(_q).length < 2
          ? nada('circle-check', true, 'Nothing runs out this week',
                 'Tap the × above to see everything.')
        : _filtro === 'agota'
          ? nada('search-off', false, 'Nothing matches',
                 'None of the bottles running out fits the search.')
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
      const v = vivoDe(r);
      // El tono de la fila con el número que se enseña (el LIVE si lo hay).
      const s = salud(v ? Object.assign({}, r, { onHand: v.live }) : r);
      const f = faltas(r);
      const d = dias(r);

      // Sin "order N": la lista enseñaba lo que faltaba para el par
      // también después de colocar y recibir los pedidos, como si hubiera
      // que pedir otra vez. Axel, 2026-11-11: "las órdenes ya se colocaron;
      // ese tipo de alertas son EL EMAIL", el de cada mañana con lo que se
      // va a acabar. Lo que hay que pedir se ve en Orders.
      const meta = [];
      if (!f.includes('no vendor')) meta.push(esc(r.vendor));
      if (d !== null && !toastLoVende(r)) meta.push(d + (d === 1 ? ' day' : ' days'));

      return `
        <!-- La cifra es su propia columna, centrada en el alto del
             renglón. Antes vivía en la primera línea junto al nombre y
             quedaba colgada arriba: es el dato que se viene a mirar y
             parecía una nota al margen. -->
        <button type="button" class="m-inv" data-i="${i}">
          <span class="m-inv-l">
            <span class="m-inv-n">${esc(r.item)}</span>
            <span class="m-inv-meta">
              ${v ? '<span class="m-live"><i></i>Live</span>' : ''}
              ${etiquetaAgota(r)}
              ${f.map(x => `<em class="m-flag m-flag-${TONO[x]}">${x}</em>`).join('')}
              ${meta.length ? `<span>${meta.join(' · ')}</span>` : ''}
            </span>
          </span>
          <span class="m-inv-v">
            <b style="color:${s.c}">${v ? '\u2248' + v.live.toFixed(1) : n2(r.onHand)}</b><i>/${num(r.suggested) > 0 ? n2(r.suggested) : '—'}</i>
          </span>
        </button>`;
    }).join('');

    // El bartender invitado (src/guest.js) no edita: su toque abre la
    // ficha del producto, la misma que Buscar, que enseña todo y no
    // cambia nada. Sin esto se abriría la hoja de editar con sus
    // botones escondidos, una hoja vacía.
    const G = window.BarStockGuest;
    const S = window.BarStockMobileSearch;
    const invitado = !!(G && G.activo && G.activo() && S && S.abrirItem);
    caja.querySelectorAll('.m-inv').forEach(b => {
      b.onclick = invitado
        ? () => { const r = master()[Number(b.dataset.i)]; if (r) S.abrirItem(r.item); }
        : () => hoja(host, Number(b.dataset.i));
    });
  }

  function pintarCabecera(host) {
    const nFix = cuantos(r => faltas(r).length);
    const nTodo = cuantos(() => true);

    const seg = host.querySelector('#miSeg');
    if (seg) {
      seg.innerHTML = `
        <button type="button" class="${_solo === 'todo' ? 'on' : ''}" data-s="todo">
          Everything <b>${nTodo}</b></button>
        <button type="button" class="${_solo === 'fix' ? 'on' : ''}" data-s="fix">
          Needs fixing <b>${nFix}</b></button>`;
      seg.querySelectorAll('button').forEach(b => {
        b.onclick = () => { _solo = b.dataset.s; pintarCabecera(host); pintarLista(host); };
      });
    }

    const inp = host.querySelector('#miInput');
    if (inp) inp.placeholder = 'Filter ' + nTodo + ' items';

    const aj = host.querySelector('#miAdj');
    if (aj) aj.classList.toggle('on', _vendor !== 'ALL' || _orden !== 'valor');

    // La pastilla del filtro de la tarjeta, con el estilo de las del
    // cajón de filtros (.m-chip.on). Toda ella quita el filtro: una ✕ de
    // 22 px sola es un blanco pequeño para un dedo detrás de una barra.
    // Cuenta lo que hay en la lista, el mismo número que la tarjeta.
    const fil = host.querySelector('#miFiltro');
    if (fil) {
      fil.innerHTML = _filtro === 'agota'
        ? `<button type="button" class="m-chip on m-inv-filtro" id="miFiltroX" aria-label="Show everything">
             <i class="ti ti-flame" aria-hidden="true"></i>Running out first · ${agotan().length}
             <i class="ti ti-x" aria-hidden="true"></i></button>`
        : '';
      const x = fil.querySelector('#miFiltroX');
      // show() y no sólo repintar: el bloque pegado cambia de alto y
      // band-dock tiene que volver a medirlo.
      if (x) x.onclick = () => { _filtro = null; show(host); };
    }
  }

  // ── El cajón de filtros ──────────────────────────────────────────────

  function cajon(host) {
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

      </div>`;
    document.body.appendChild(hoja_);
    if (window.BarStockSheet) window.BarStockSheet.enganchar(hoja_, () => hoja_.remove());

    const cerrar = () => hoja_.remove();
    hoja_.querySelector('.m-sheet-bg').onclick = cerrar;

    const repintar = () => { pintarCabecera(host); pintarLista(host); };

    hoja_.querySelectorAll('[data-v]').forEach(b => {
      b.onclick = () => { _vendor = b.dataset.v; cerrar(); repintar(); };
    });
    hoja_.querySelectorAll('[data-o]').forEach(b => {
      b.onclick = () => { _orden = b.dataset.o; cerrar(); repintar(); };
    });
  }

  // ── Editar un producto: una pantalla, no una hoja ───────────────────
  //
  // Axel, 2026-11-13: "la tarjeta de un producto ya es muy larga, debe
  // ser pantalla en lugar de tarjeta… y que todo entre en la pantalla".
  // Sobre lámina eligió: la tarjeta del producto IGUAL que antes (hero),
  // el nombre una sola vez (una fila "Name & code · Rename" que se abre
  // ahí mismo), el proveedor como UNA fila con su color que abre la lista
  // (opción X; "el estilo de los vendors no me encanta"), par y precio
  // lado a lado, y Delete y Save en la misma línea. Sin "Save and next"
  // (Axel: "no es necesario") y sin Cancel: el atrás de la banda lo es.
  //
  // Va fija encima de la lista, dentro de la pantalla de Inventory, y no
  // en su lugar: la lista se queda donde estaba, con su scroll y su
  // filtro, y al volver se ve el mismo sitio. La banda dice "Edit item"
  // y su botón izquierdo es atrás, como en Settings.
  //
  // Lo que NO edita, a propósito: el on hand (sólo un conteo lo escribe).

  // El color de cada proveedor, el de la app (badge() del escritorio):
  // vendorDotColor() vive en index.html, junto a esos mismos colores.
  const colorProv = (v) => (typeof window.vendorDotColor === 'function' ? window.vendorDotColor(v) : '#94a3b8');

  // ── Lo usado cada semana, en la pantalla de editar ──────────────────
  //
  // Opción C (Axel, 2026-11-13), "que muestre el número al seleccionar
  // cada semana, no sólo la gráfica": tocar una barra dice su semana y
  // lo usado; de entrada, la última. Los datos son los de la ficha de
  // Buscar (BarStockProductWeeks.semanas: lo usado por semana del
  // historial, sin semanas de evento y con el conteo corregido); el
  // promedio que se enseña es el de Pour·IQ (avgUsed), no uno sacado
  // aquí: un número, en un sitio. La raya es el par, el que se está
  // poniendo arriba, para ver contra qué se mide.
  const SEMANAS_ED = 8;
  const fmtSem = (iso) => {
    const d = new Date(String(iso || '') + 'T12:00:00');
    return isNaN(d) ? String(iso || '') : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const uno = (n) => String(Math.round((Number(n) || 0) * 10) / 10);

  // "Pour·IQ: 6 · use it", en la cabecera de la gráfica. Sólo cuando
  // dice algo distinto del par que hay.
  function iqBoton(r, p) {
    return p && p.suggestedOptimal != null && Number(p.suggestedOptimal) !== num(r.suggested)
      ? '<button type="button" class="m-ed-iq" id="miIq">Pour·IQ: ' + esc(String(p.suggestedOptimal)) + ' · use it</button>'
      : '';
  }

  async function pintarSemanasEd(caja, r, p, parAhora, alPintar) {
    const W = window.BarStockProductWeeks;
    if (!caja || !W) return;
    let s = [];
    try { s = await W.semanas(r.item, SEMANAS_ED); } catch (e) { return; }
    if (!s.length || !caja.isConnected) return;
    let sel = s.length - 1;

    const pintar = () => {
      const par = parAhora();
      const tope = Math.max(par, ...s.map(x => Number(x.usado) || 0), 1);
      const x = s[sel];
      caja.innerHTML =
        '<div class="m-ed-sem-t"><span>Used per week</span>' + iqBoton(r, p) + '</div>' +
        '<div class="m-ed-sem-n"><b>' + esc(uno(x.usado)) + '</b> used · week of ' + esc(fmtSem(x.semana)) +
          (p && p.avgUsed != null ? ' · <em>Pour·IQ avg ' + esc(uno(p.avgUsed)) + '</em>' : '') + '</div>' +
        '<div class="m-ed-sem-g">' +
          (par > 0 ? '<span class="m-ed-sem-par" style="bottom:' + Math.round(par / tope * 100) + '%"><em>par ' + esc(uno(par)) + '</em></span>' : '') +
          s.map((w, i) => '<button type="button" data-w="' + i + '" class="' + (i === sel ? 'on' : '') + '" aria-label="Week of ' +
            esc(fmtSem(w.semana)) + ': ' + esc(uno(w.usado)) + ' used"><i style="height:' +
            Math.max(4, Math.round((Number(w.usado) || 0) / tope * 100)) + '%"></i></button>').join('') +
        '</div>' +
        '<div class="m-ed-sem-ax"><span>' + esc(fmtSem(s[0].semana)) + '</span><span>' + esc(fmtSem(s[s.length - 1].semana)) + '</span></div>';
      caja.querySelectorAll('[data-w]').forEach(b => { b.onclick = () => { sel = Number(b.dataset.w); pintar(); }; });
      if (alPintar) alPintar();
    };
    caja._par = pintar;
    caja.hidden = false;
    pintar();
  }

  // Tras renombrar se recarga la app (el nombre está en cachés de este
  // teléfono); esto la vuelve a dejar en la pantalla de editar de ese
  // producto, que es donde estaba quien guardó.
  const REABRIR = 'barstock.editarTrasRecargar';
  function reabrirTrasRecargar(intentos) {
    let nombre = null;
    try { nombre = sessionStorage.getItem(REABRIR); } catch (e) { return; }
    if (!nombre) return;
    const M = window.BarStockMobile;
    const i = master().findIndex(x => x && x.item === nombre);
    if (!M || !M.ir || i < 0) {
      // El maestro puede tardar un momento en estar: unos intentos, y si
      // no aparece, se olvida (mejor la lista que una pantalla vacía).
      if ((intentos || 0) < 10) setTimeout(() => reabrirTrasRecargar((intentos || 0) + 1), 300);
      else try { sessionStorage.removeItem(REABRIR); } catch (e) {}
      return;
    }
    try { sessionStorage.removeItem(REABRIR); } catch (e) {}
    M.ir('inventory');
    const host = document.querySelector('.m-screen[data-screen="inventory"]');
    if (host) hoja(host, i);
  }

  function cerrarEditor(host) {
    const ed = host && host.querySelector('.m-ed');
    if (ed) ed.remove();
    const M = window.BarStockMobile;
    if (M && M.salirBanda) M.salirBanda();
  }

  function hoja(host, idx) {
    // `let`: al guardar, bsSaveItemFields cambia la fila del maestro por
    // un objeto NUEVO. Como uno se queda en la pantalla tras guardar
    // (Axel, 2026-11-13), hay que volver a tomarla; con la vieja, un
    // Delete o un Rename después de guardar trabajaban sobre una copia.
    let r = master()[idx];
    if (!r) return;
    cerrarEditor(host);

    const p = parDe(r);
    const vendors = typeof window.getVendorsWithUnknown === 'function'
      ? window.getVendorsWithUnknown() : [];
    let vend = String(r.vendor || 'UNKNOWN').toUpperCase();

    const ed = document.createElement('div');
    ed.className = 'm-ed';
    ed.setAttribute('role', 'dialog');
    ed.setAttribute('aria-label', 'Edit item');
    ed.innerHTML = `
      <div class="m-ed-in">
        <div id="miHero">${hero(r, p)}</div>
        <i class="m-ed-aire" aria-hidden="true"></i>
        <div id="miRenCaja">
          <button type="button" class="m-ed-fila m-ed-ren" id="miRen">
            <span class="m-ed-k">Name &amp; code <small>· ${esc(r.code || 'No code')}</small></span>
            <span class="m-ed-a">Rename</span>
          </button>
        </div>

        <i class="m-ed-aire" aria-hidden="true"></i>
        <!-- "Vendor" va dentro de la fila y no encima: con la gráfica de
             semanas, una etiqueta más dejaba Delete y Save fuera de la
             pantalla en un iPhone (Axel: "que todo entre"). -->
        <button type="button" class="m-ed-fila m-ed-vend" id="miVendBtn">
          <span class="m-ed-pre">Vendor</span>
          <span class="m-ed-dot" id="miVendDot" style="background:${colorProv(vend)}"></span>
          <span class="m-ed-k" id="miVendN">${esc(vend)}</span>
          <span class="m-ed-a m-ed-mut">Change <i class="ti ti-chevron-right" aria-hidden="true"></i></span>
        </button>

        <i class="m-ed-aire" aria-hidden="true"></i>
        <div class="m-ed-dos">
          <div>
            <div class="m-ed-lab">Par</div>
            <div class="m-ed-paso">
              <button type="button" id="miLess" aria-label="Lower the par">−</button>
              <input id="miPar" type="number" inputmode="decimal" step="1" min="0"
                     value="${num(r.suggested)}" aria-label="Par">
              <button type="button" id="miMore" aria-label="Raise the par">+</button>
            </div>
          </div>
          <div>
            <div class="m-ed-lab">Unit price</div>
            <div class="m-ed-in1"><span>$</span>
              <input id="miVal" type="number" inputmode="decimal" step="0.01" min="0"
                     value="${num(r.value) || ''}" placeholder="0.00" aria-label="Unit price"></div>
          </div>
        </div>
        <i class="m-ed-aire" aria-hidden="true"></i>
        <!-- Las últimas semanas, junto al par (Axel, 2026-11-13, opción C):
             es para lo que sirve la gráfica, decidir el par. Se llena
             después, sin esperar a la consulta. Lo que dice Pour·IQ va en
             su cabecera: fuera, como línea propia, no cabía todo. Sin
             historia la tarjeta sale sólo con Pour·IQ, si tiene algo que
             decir; si tampoco, no sale. -->
        <div class="m-ed-sem" id="miSem"${p && p.suggestedOptimal != null && Number(p.suggestedOptimal) !== num(r.suggested) ? '' : ' hidden'}>
          ${iqBoton(r, p)}
        </div>

        <i class="m-ed-aire" aria-hidden="true"></i>
        <div class="m-ed-lab">Bottle</div>
        <button type="button" class="m-botrow" id="miBottle">${filaBotella(r)}</button>

        <i class="m-ed-aire" aria-hidden="true"></i>
        <div class="m-nerr" id="miErr"></div>
        <!-- Delete y Save en la misma línea (Axel). Delete pide dos
             toques y toma antes un respaldo de Time Machine. -->
        <div class="m-ed-acts">
          <button type="button" class="m-ed-del" id="miDel">Delete</button>
          <button type="button" class="m-ed-save" id="miSave">Save</button>
        </div>
      </div>`;
    host.appendChild(ed);

    const M = window.BarStockMobile;
    const cerrar = () => cerrarEditor(host);
    if (M && M.enBanda) M.enBanda('Edit item');
    if (M && M.alVolverBanda) M.alVolverBanda(cerrar);

    const q = (s) => ed.querySelector(s);
    const err = (t) => { const e = q('#miErr'); if (e) e.textContent = t || ''; };
    const aviso = (t) => { const T = window.BarStockToast; if (T && T.show) try { T.show(t); } catch (e) {} };

    // "Rename": la fila se vuelve los dos campos ahí mismo. Hasta
    // entonces el nombre sólo está en la tarjeta: una vez, no tres.
    q('#miRen').onclick = () => {
      q('#miRenCaja').innerHTML = `
        <div class="m-ed-dos m-ed-nom">
          <div><div class="m-ed-lab">Name</div>
            <div class="m-ed-in1"><input id="miName" type="text" autocomplete="off" autocapitalize="words"
              value="${esc(r.item)}" aria-label="Product name"></div></div>
          <div><div class="m-ed-lab">Code</div>
            <div class="m-ed-in1"><input id="miCode" type="text" autocomplete="off" autocapitalize="characters"
              value="${esc(r.code || '')}" placeholder="—" aria-label="Vendor code"></div></div>
        </div>`;
      const n = q('#miName'); if (n && n.focus) n.focus();
    };

    // Proveedor: la lista en una hoja, cada uno con su color y ✓ en el
    // actual. Tocar uno lo elige y cierra.
    q('#miVendBtn').onclick = () => {
      const h = document.createElement('div');
      h.className = 'm-sheet';
      h.id = 'mSheet';
      h.innerHTML = `<div class="m-sheet-bg"></div>
        <div class="m-sheet-box m-vend-hoja" role="dialog" aria-label="Vendor">
          <div class="m-sheet-grip"></div>
          <div class="m-edit-n">Vendor</div>
          ${vendors.map(v => `<button type="button" class="m-vend-op${v === vend ? ' on' : ''}" data-nv="${esc(v)}">
              <span class="m-ed-dot" style="background:${colorProv(v)}"></span>
              <span class="m-vend-n">${esc(v)}</span>
              ${v === vend ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}</button>`).join('')}
        </div>`;
      document.body.appendChild(h);
      const fuera = () => h.remove();
      if (window.BarStockSheet) window.BarStockSheet.enganchar(h, fuera);
      h.querySelector('.m-sheet-bg').onclick = fuera;
      h.querySelectorAll('[data-nv]').forEach(b => { b.onclick = () => {
        vend = b.dataset.nv;
        q('#miVendN').textContent = vend;
        q('#miVendDot').style.background = colorProv(vend);
        fuera();
      }; });
    };

    // La forma se guarda en el selector, al elegirla, no con Save: es el
    // mismo guardado que el del conteo. Al volver se repintan la fila y la
    // tarjeta.
    q('#miBottle').onclick = () => {
      const BP = window.BarStockBottlePicker;
      if (!BP || !BP.open) return;
      BP.open(r, () => {
        const f = q('#miBottle');
        if (f) f.innerHTML = filaBotella(r);
        const hz = q('#miHero');
        if (hz) hz.innerHTML = hero(r, p);
      });
    };

    // El botón de Pour·IQ vive en la cabecera de la gráfica, que se
    // repinta: se engancha cada vez.
    const engancharIq = () => {
      const iq = q('#miIq');
      if (iq && p) iq.onclick = () => { q('#miPar').value = Number(p.suggestedOptimal); semPar(); };
    };
    pintarSemanasEd(q('#miSem'), r, p, () => Number(q('#miPar').value) || 0, engancharIq);

    const par = q('#miPar');
    const mas = (d) => { par.value = Math.max(0, (Number(par.value) || 0) + d); semPar(); };
    // La raya del par en la gráfica sigue al par que se está poniendo.
    const semPar = () => { const f = q('#miSem') && q('#miSem')._par; if (f) f(); };
    par.addEventListener('input', semPar);
    q('#miLess').onclick = () => mas(-1);
    q('#miMore').onclick = () => mas(1);
    engancharIq();

    let recargar = false;
    async function guardar() {
      if (typeof window.bsSaveItemFields !== 'function') return false;
      err('');
      // Primero el nombre y el código (sólo si se abrió Rename): si la
      // base no puede renombrar, no se guarda nada más y se dice por qué.
      const nom = q('#miName'), cod = q('#miCode');
      const E = window.BarStockItemEdit;
      if (E && nom && cod && (nom.value.trim() !== String(r.item) || cod.value.trim() !== String(r.code || '').trim())) {
        let res;
        try { res = await E.renombrar(r, { nombre: nom.value, codigo: cod.value }); }
        catch (e) { err('Not saved: ' + ((e && e.message) || e)); return false; }
        if (res && res.renamed) {
          // El nombre está en cachés de este teléfono (Toast, recetas, el
          // LIVE): se recarga la app para que todas lo lean con el nuevo.
          recargar = true;
          if (res.compartidas && window.BarStockDialog && window.BarStockDialog.avisar) {
            await window.BarStockDialog.avisar({ titulo: 'Renamed at this location.',
              cuerpo: 'Another location still has an item with the old name, so the barcode and bottle shape they share stay with that one. Set them again here if they differ.',
              soloAviso: true });
          }
        }
      }
      const ok = await window.bsSaveItemFields(idx, {
        vendor: vend,
        suggested: Number(par.value) || 0,
        value: Number(q('#miVal').value) || 0
      });
      if (ok) { pintarCabecera(host); pintarLista(host); }
      if (ok && recargar) {
        // Tras recargar se vuelve a ESTA pantalla, con el nombre nuevo:
        // uno no sale de editar por guardar.
        try { sessionStorage.setItem(REABRIR, master()[idx].item); } catch (e) {}
        aviso('Renamed everywhere. Reloading…');
        setTimeout(() => { try { location.reload(); } catch (e) {} }, 900);
      }
      return ok;
    }

    // Guardar no saca de la pantalla (Axel, 2026-11-13: "al terminar de
    // editar un artículo no debería sacarte a la lista, deberías
    // permanecer en esa misma pantalla"). Se queda, con la fila nueva y
    // la tarjeta de arriba con lo guardado.
    function trasGuardar() {
      r = master()[idx] || r;
      // La caja #miHero y no .m-fic: sin el módulo de la tarjeta
      // (product-hero.js) la cabecera es otra, y se repinta igual.
      const hz = q('#miHero');
      if (hz) hz.innerHTML = hero(r, parDe(r));
      aviso('Saved');
    }

    q('#miSave').onclick = async () => {
      const b = q('#miSave');
      b.disabled = true;
      const ok = await guardar();
      b.disabled = false;
      if (ok && !recargar) trasGuardar();
    };

    const del = q('#miDel');
    let armado = false;
    del.onclick = async () => {
      if (!armado) {
        armado = true;
        del.textContent = 'Tap again';
        setTimeout(() => { if (armado && del.isConnected) { armado = false; del.textContent = 'Delete'; } }, 4000);
        return;
      }
      armado = false;
      del.disabled = true; del.textContent = 'Deleting…';
      try {
        await window.BarStockItemEdit.borrar(r);
        cerrar();
        pintarCabecera(host); pintarLista(host);
        aviso('Deleted ' + r.item + '. A backup is in Time Machine.');
      } catch (e) {
        del.disabled = false; del.textContent = 'Delete';
        err('Not deleted: ' + ((e && e.message) || e));
      }
    };
  }

  // ── Dar de alta un producto ──────────────────────────────────────────
  //
  // Hasta ahora sólo se podía desde el escritorio, y sólo de rebote:
  // resolviendo un "no match" de un conteo importado. Si una botella
  // nueva entraba en la barra y no estaba en el catálogo, no había
  // forma de meterla desde el teléfono.
  //
  // ── Lo que NO pide ──────────────────────────────────────────────
  //
  // El ON HAND. Un producto nuevo nace en cero, como todos: la
  // existencia viene del escáner y de recibir mercancía, y ésa es la
  // regla que hace que cada número se pueda rastrear. Meterlo aquí
  // sería la primera excepción, y la primera excepción es como esa
  // regla deja de valer.
  //
  // Tampoco el tamaño ni la forma de la botella: ésos los pone el
  // selector de botella la primera vez que se escanea, que es cuando
  // se sabe de verdad.

  function hojaNueva(host) {
    const vendors = typeof window.getVendorsWithUnknown === 'function'
      ? window.getVendorsWithUnknown() : [];

    const h = document.createElement('div');
    h.className = 'm-sheet';
    h.id = 'mSheet';
    h.innerHTML = `
      <div class="m-sheet-bg"></div>
      <div class="m-sheet-box m-edit" role="dialog" aria-label="Add a product">
        <div class="m-sheet-grip"></div>
        <div class="m-edit-n">Add a product</div>
        <div class="m-edit-s">It starts at zero on hand. Scan it or receive it
          to put bottles on the shelf.</div>

        <div class="m-sheet-t">Name</div>
        <div class="m-money m-money-txt">
          <input id="mnName" type="text" autocomplete="off" autocapitalize="words"
                 placeholder="Tito&rsquo;s Vodka" aria-label="Product name">
        </div>

        <!-- El codigo del proveedor. No es obligatorio, pero es con lo
             que casan las facturas de MarginEdge: sin el, el producto
             hay que emparejarlo a mano cada vez. -->
        <div class="m-sheet-t">Vendor code <span class="m-opt">optional</span></div>
        <div class="m-money m-money-txt">
          <input id="mnCode" type="text" autocomplete="off" autocapitalize="characters"
                 placeholder="2153" aria-label="Vendor code">
        </div>

        <div class="m-sheet-t">Vendor</div>
        <div class="m-chips" id="mnVend">
          ${vendors.map(v => `<button type="button" class="m-chip${v === 'UNKNOWN' ? ' on' : ''}"
                                      data-nv="${esc(v)}">${esc(v)}</button>`).join('')}
        </div>

        <div class="m-sheet-t">Par <span class="m-opt">optional</span></div>
        <div class="m-step">
          <button type="button" id="mnLess" aria-label="Lower the par">&minus;</button>
          <input id="mnPar" type="number" inputmode="decimal" step="1" min="0"
                 value="0" aria-label="Par">
          <button type="button" id="mnMore" aria-label="Raise the par">+</button>
        </div>

        <div class="m-sheet-t">Unit price <span class="m-opt">optional</span></div>
        <div class="m-money">
          <span>$</span>
          <input id="mnVal" type="number" inputmode="decimal" step="0.01" min="0"
                 placeholder="0.00" aria-label="Unit price">
        </div>

        <div class="m-nerr" id="mnErr"></div>

        <div class="m-acts">
          <button type="button" class="m-act" id="mnCancel">Cancel</button>
          <button type="button" class="m-act m-act-ok" id="mnSave">Add it</button>
        </div>
      </div>`;
    document.body.appendChild(h);
    // El asa dice "arrastrame para cerrar". Que lo diga de verdad.
    if (window.BarStockSheet) window.BarStockSheet.enganchar(h, () => h.remove());

    let vend = 'UNKNOWN';
    h.querySelectorAll('[data-nv]').forEach(b => {
      b.onclick = () => {
        vend = b.dataset.nv;
        h.querySelectorAll('[data-nv]').forEach(x => x.classList.toggle('on', x === b));
      };
    });

    const par = h.querySelector('#mnPar');
    const mas = (d) => { par.value = Math.max(0, (Number(par.value) || 0) + d); };
    h.querySelector('#mnLess').onclick = () => mas(-1);
    h.querySelector('#mnMore').onclick = () => mas(1);

    const cerrar = () => h.remove();
    h.querySelector('.m-sheet-bg').onclick = cerrar;
    h.querySelector('#mnCancel').onclick = cerrar;

    const err = (t) => { h.querySelector('#mnErr').textContent = t || ''; };

    h.querySelector('#mnSave').onclick = async () => {
      const nombre = String(h.querySelector('#mnName').value || '').trim();
      const code = String(h.querySelector('#mnCode').value || '').trim();
      if (!nombre) { err('Give it a name.'); return; }

      // ── El duplicado ──────────────────────────────────────────────
      //
      // Dos filas para la misma botella es el peor resultado posible:
      // el conteo se reparte entre las dos, el par se calcula sobre
      // media historia y las facturas casan con la que no es. Se
      // comprueba por el MISMO criterio de nombre que usa el resto de
      // la app, no por igualdad de cadena.
      const ya = master().find(r =>
        norm(r.item) === norm(nombre) ||
        (code && String(r.code || '').trim().toUpperCase() === code.toUpperCase()));
      if (ya) {
        err('“' + ya.item + '” is already in the catalogue.');
        return;
      }

      const b = h.querySelector('#mnSave');
      b.disabled = true; err('');
      try {
        if (!window.BarStockInventoryCloud) throw new Error('Cloud not available.');
        await window.BarStockInventoryCloud.createInventoryItem({
          code, item: nombre, vendor: vend,
          onHand: 0,
          suggested: Number(par.value) || 0,
          value: Number(h.querySelector('#mnVal').value) || 0
        });

        // La fila local, con la MISMA forma que arma el escritorio al
        // dar de alta. Se añade DESPUÉS de que la nube conteste, no
        // antes: el escritorio lo hace al revés y por eso puede
        // quedarse con un producto que sólo existe en ese navegador.
        const fila = {
          code, item: nombre,
          itemNorm: typeof window.normalizeName === 'function'
            ? window.normalizeName(nombre) : norm(nombre),
          vendor: String(vend || 'UNKNOWN').trim().toUpperCase(),
          onHand: 0,
          suggested: Number(par.value) || 0,
          value: Number(h.querySelector('#mnVal').value) || 0,
          orderOverride: ''
        };
        fila.toOrder = typeof window.computeToOrder === 'function'
          ? window.computeToOrder(0, fila.suggested)
          : Math.max(0, fila.suggested);

        master().push(fila);
        master().sort((a, b) =>
          String(a.item || '').localeCompare(String(b.item || '')));
        if (typeof window.saveState === 'function') window.saveState();
        if (typeof window.render === 'function') window.render();
        cerrar();
        show(host);
        const T = window.BarStockToast;
        if (T && T.show) T.show(nombre + ' added');
      } catch (e) {
        b.disabled = false;
        err(String((e && e.message) || e));
      }
    };
  }

  // ── La pantalla ──────────────────────────────────────────────────────

  function mount(host) {
    // ── La lista con su propio scroll ──────────────────────────────
    //
    // Todo va dentro de #miScroll, y las pestañas con el filtro dentro
    // de #miPegado, pegado bajo el header con el desenfoque empezando
    // bajo el filtro. Lo hace band-dock.js; sin él, los dos envoltorios
    // no cambian nada.
    //
    // Desde 2026-11-12 la pantalla entra YA acoplada (Axel, con dos
    // capturas): "Inventory" en el header en el sitio del logo y el
    // bloque fijo desde el principio. Antes había un título grande en la
    // página ("Inventory · 264 items") que se desvanecía al bajar; ya no
    // está, y el total lo dice "Everything 264".
    host.innerHTML = `
      <div id="miScroll">

      <!-- El segmentado ANTES del buscador, igual que en Orders.
           Primero eliges sobre qué conjunto trabajas —lo que hay que
           arreglar, o todo— y después lo acotas escribiendo. Al revés
           se buscaba dentro de un conjunto que aún no habías elegido.

           Y las dos pantallas con listas largas se ordenan igual, que
           es de lo que iba el cambio. -->
      <div id="miPegado">
      <div class="m-seg" id="miSeg"></div>

      <div class="m-inv-bar2">
        <div class="m-searchbar on">
          <!-- Lupa y no embudo: esto escribe para BUSCAR. El embudo es
               el icono de filtrar, y filtrar es lo que hace el botón
               de al lado — dos iconos distintos para dos cosas
               distintas. -->
          <i class="ti ti-search" aria-hidden="true"></i>
          <input id="miInput" type="search" inputmode="search" autocomplete="off"
                 placeholder="Filter items" aria-label="Filter items">
          <button type="button" id="miClear" aria-label="Clear"><i class="ti ti-x" aria-hidden="true"></i></button>
        </div>
        <button type="button" class="m-adj" id="miAdj" aria-label="Filters and sorting">
          <i class="ti ti-adjustments-horizontal" aria-hidden="true"></i>
        </button>
        <!-- Verde y redondo, como el de escanear: en esta app el verde
             es "esto añade existencia". Aquí no añade botellas —el on
             hand de un producto nuevo arranca en cero, como el de
             todos— pero sí añade el producto al catálogo, que es lo
             que faltaba poder hacer desde el teléfono. -->
        <button type="button" class="m-nuevo" id="miNuevo" aria-label="Add a product">
          <i class="ti ti-plus" aria-hidden="true"></i>
        </button>
      </div>
      <div id="miFiltro"></div>
      </div>

      <div id="miList"></div>
      </div>`;

    const inp = host.querySelector('#miInput');
    inp.oninput = () => { _q = inp.value; pintarLista(host); };
    // La misma X que "Do we have…" del Home, con el mismo estilo
    // compartido (.m-searchbar > button en mobile-app.css): borrar letra
    // a letra con el teclado del teléfono era el paso que sobraba. El
    // comentario va aquí y no dentro de la barra: test-mismo-nombre
    // busca la lupa en los primeros 700 caracteres de esa barra.
    host.querySelector('#miClear').onclick = () => {
      _q = ''; inp.value = ''; pintarLista(host); inp.focus();
    };
    host.querySelector('#miAdj').onclick = () => cajon(host);
    host.querySelector('#miNuevo').onclick = () => hojaNueva(host);

    show(host);
  }

  function show(host) {
    cargarVivo(host);
    pintarCabecera(host);
    pintarLista(host);
    const D = window.BarStockBandDock;
    const sc = host.querySelector('#miScroll'), blo = host.querySelector('#miPegado');
    if (D && sc && blo) {
      D.enganchar({ pantalla: host, scroll: sc, pegado: blo, nombre: 'Inventory', siempre: true });
    }
  }

  function refresh() {
    const host = document.querySelector('.m-screen[data-screen="inventory"]');
    if (host && host.classList.contains('on')) show(host);
  }

  // ── Entrar con un orden ya puesto ──────────────────────────────────
  //
  // "See them" en la tarjeta de lo que se está acabando llevaba aquí y
  // te dejaba con los 264 artículos ordenados por dinero: la lista que
  // acababas de leer no aparecía por ninguna parte y había que ir a
  // buscar el filtro.
  //
  // Esta pantalla ya sabe ordenar por "Closest to empty". Sólo había
  // que dejar que se pidiera desde fuera, en vez de inventar una
  // pantalla nueva que diría lo mismo.
  //
  // La petición se consume en `show()` y se borra: vale para esta
  // entrada y ninguna más. Entrar mañana por la pestaña y encontrarte
  // un orden que no pusiste es peor que no tener atajo.
  let _pedido = null;

  function abrirCon(orden) {
    _pedido = orden || null;
    if (window.BarStockMobile) window.BarStockMobile.ir('inventory');
  }

  window.BarStockMobileInventory = { refresh, abrirCon, reabrirTrasRecargar };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      id: 'inventory', icon: 'ti-package', label: 'Inventory',
      tab: true, orden: 30,
      mount,
      // El gesto del borde y el atrás: con la pantalla de editar abierta,
      // vuelven a la lista.
      atras(host, hacerlo) {
        if (!host || !host.querySelector('.m-ed')) return false;
        if (hacerlo) cerrarEditor(host);
        return true;
      },
      show(host) {
        // Al volver a Inventory, la lista: una pantalla de editar que
        // quedó abierta al irse a otra pestaña se cierra.
        cerrarEditor(host);
        // Si alguien pidió un orden concreto al entrar, se aplica
        // aquí y se olvida.
        // 'agota' no es un orden, es el filtro de la tarjeta. Cualquier
        // otra entrada lo quita.
        _filtro = _pedido === 'agota' ? 'agota' : null;
        if (_pedido && _pedido !== 'agota') _orden = _pedido;
        _pedido = null;
        return show(host);
      },
      // show() reajusta el total y repinta; los filtros y la búsqueda
      // viven en el módulo, así que un refresco no los pierde.
      refrescar: show
    });
  }

  // Lo de reabrir tras renombrar, cuando el armazón ya montó las
  // pantallas (también arranca en DOMContentLoaded).
  const arrancar = () => { registrar(); setTimeout(() => reabrirTrasRecargar(0), 800); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
