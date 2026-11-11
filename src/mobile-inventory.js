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

        <!-- ── La MISMA cabecera que la ficha de búsqueda ──────────
             Eran dos pantallas distintas para el mismo producto: la
             de Home con silueta, número grande y color de estado; y
             ésta con dos renglones de texto. Nadie debería aprender
             dos veces de qué le están hablando.
             Lo que NO cambia es que esto sigue siendo una hoja que
             sube desde abajo: el "Save and next" es lo que convierte
             118 correcciones en una sesión, y una pantalla completa
             por artículo se lo cargaría.
             El subtítulo lleva el CÓDIGO, que en la ficha de búsqueda
             no va: aquí sí importa, es con lo que casan las
             facturas. -->
        ${hero(r, p)}

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

        <div class="m-sheet-t">Bottle</div>
        <button type="button" class="m-botrow" id="miBottle">${filaBotella(r)}</button>

        <div class="m-acts">
          <button type="button" class="m-act" id="miCancel">Cancel</button>
          <button type="button" class="m-act" id="miSave">Save</button>
        </div>
        ${sig ? `<button type="button" class="m-next" id="miNext">
                   Save and next · ${esc(String(sig.item).slice(0, 26))}
                   <i class="ti ti-arrow-right" aria-hidden="true"></i></button>` : ''}
      </div>`;
    document.body.appendChild(h);
    // El asa dice "arrastrame para cerrar". Que lo diga de verdad.
    if (window.BarStockSheet) window.BarStockSheet.enganchar(h, () => h.remove());

    // La forma se guarda en el selector, al elegirla, no con el Save de
    // esta hoja: es el mismo guardado que el del conteo. Al volver se
    // repintan la fila y la cabecera, sin cerrar la hoja.
    const bot = h.querySelector('#miBottle');
    if (bot) bot.onclick = () => {
      const BP = window.BarStockBottlePicker;
      if (!BP || !BP.open) return;
      BP.open(r, () => {
        const f = h.querySelector('#miBottle');
        if (f) f.innerHTML = filaBotella(r);
        const fic = h.querySelector('.m-fic');
        if (fic) fic.outerHTML = hero(r, p);
      });
    };

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
    // de #miPegado: al bajar, "Inventory" pasa al header en el sitio del
    // logo y ese bloque se queda pegado debajo, con el desenfoque
    // empezando bajo el filtro (Axel, 2026-11-09). Lo hace band-dock.js;
    // sin él, los dos envoltorios no cambian nada.
    host.innerHTML = `
      <div id="miScroll">
      <div class="m-inv-h">
        <span class="m-inv-t">Inventory</span>
        <span class="m-inv-c" id="miTotal"></span>
      </div>

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
    const tot = host.querySelector('#miTotal');
    if (tot) tot.textContent = master().length ? master().length + ' items' : '…';
    pintarCabecera(host);
    pintarLista(host);
    const D = window.BarStockBandDock;
    const sc = host.querySelector('#miScroll'), blo = host.querySelector('#miPegado');
    if (D && sc && blo) {
      D.enganchar({ pantalla: host, scroll: sc, pegado: blo,
        titulo: host.querySelector('.m-inv-h'), nombre: 'Inventory' });
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

  window.BarStockMobileInventory = { refresh, abrirCon };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      id: 'inventory', icon: 'ti-package', label: 'Inventory',
      tab: true, orden: 30,
      mount,
      show(host) {
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
