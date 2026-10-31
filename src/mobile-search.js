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
  // Qué ficha está abierta, para poder repintarla sin cerrarla.
  let _ficha = -1;

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
      caja.innerHTML = `
        <div class="m-nada">
          <span class="m-nada-i"><i class="ti ti-search-off" aria-hidden="true"></i></span>
          <b>Nothing called “${esc(_q)}”</b>
          <small>If it is on the shelf, it is not in the inventory yet.</small>
        </div>`;
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

  // ── La botella ───────────────────────────────────────────────────────
  //
  // La silueta real del producto, con la forma que tenga asignada, y
  // llena hasta donde está. El cálculo no es nuevo: heightFor es el
  // mismo que mueve el deslizador del conteo, así que lo que se dibuja
  // aquí y lo que se ve al contar no pueden discrepar.
  //
  // La botella dibujada es la PARCIAL. Con 1.96 hay una entera y una a
  // la mitad larga; dibujar una sola llena al 96% sería mentira si no
  // se dice que además hay otra. De ahí el "+1 full" de debajo.

  const BOT = { w: 52, h: 116, pad: 4 };

  function silueta(r, color) {
    const V = window.BarStockBottleProfiles;
    if (!V || !V.pathFor) return '';

    const key = (r.bottleShape && V.forSize)
      ? V.forSize(r.bottleShape, r.bottleSizeMl) : 'generic';

    let d = '';
    try { d = V.pathFor(key, BOT.w, BOT.h, BOT.pad); } catch (e) { return ''; }
    if (!d) return '';

    // ── La botella es un medidor, no una botella ───────────────────
    //
    // Antes dibujaba la parte decimal del on hand —de 7.3 pintaba el
    // 0.3— y debajo ponía "+7 full". Eso contesta "cómo está la
    // botella abierta", que no es lo que se mira al buscar un
    // producto: lo que importa es cuánto queda contra lo que debería
    // haber.
    //
    // Ahora el PAR es la botella llena y el on hand marca el nivel.
    // 7.3 de un par de 18 sale a poco menos de la mitad; 30 de 36 sale
    // casi llena; 2 de 2, llena del todo.
    //
    // El nivel es lineal, no por volumen. `heightFor` convierte
    // volumen de líquido en altura teniendo en cuenta el hombro, y eso
    // es correcto para una botella de verdad: aquí falsearía el
    // medidor, porque la mitad del par se dibujaría por debajo de la
    // mitad de la altura.
    //
    // Sin par no hay contra qué medir, así que la botella se queda
    // vacía. No se escribe nada: el par ya está en la ficha, y un
    // texto de más en el icono es ruido.
    const oh = Number(r.onHand) || 0;
    const par = Number(r.suggested) || 0;
    const ratio = par > 0 ? Math.max(0, Math.min(1, oh / par)) : null;

    let yPx = BOT.h - BOT.pad;
    if (ratio !== null && ratio > 0) {
      try { yPx = V.yToPx(key, ratio, BOT.w, BOT.h, BOT.pad); } catch (e) {}
    }
    const frac = ratio || 0;

    const id = 'ms' + Math.random().toString(36).slice(2, 8);
    return `
      <div class="m-bot">
        <svg viewBox="0 0 ${BOT.w} ${BOT.h}" width="${BOT.w}" height="${BOT.h}" aria-hidden="true">
          <defs>
            <clipPath id="${id}"><rect x="0" y="${yPx}" width="${BOT.w}" height="${BOT.h}"/></clipPath>
          </defs>
          <path d="${d}" fill="rgba(0,0,0,.22)" stroke="rgba(255,255,255,.38)" stroke-width="1.6"/>
          ${frac > 0 ? `<g clip-path="url(#${id})">
            <path d="${d}" fill="${color}" opacity=".78"/></g>` : ''}
          <path d="${d}" fill="none" stroke="rgba(255,255,255,.38)" stroke-width="1.6"/>
        </svg>
      </div>`;
  }

  // ── Dónde están ──────────────────────────────────────────────────────
  //
  // Sólo si las zonas están encendidas. Con la función apagada no se
  // dice nada: "Zones are off, turn them on in Settings" es un ajuste
  // metido en una ficha de producto, y en el teléfono estorba más de
  // lo que informa.

  // ── De qué factura vino este precio ──────────────────────────────────
  //
  // Después de que una factura actualice un precio, la ficha pone
  // $28.50 y no hay forma de saber si eso se tecleó en marzo o llegó
  // el martes. Esta línea lo dice, y de paso cuánto se movió.

  async function pintarOrigenPrecio(caja, item) {
    const el = caja.querySelector('#msPrecio');
    const P = window.BarStockMarginEdgePurchases;
    if (!el || !P || !P.leerHistorial) return;

    let h = null;
    try {
      const todo = await P.leerHistorial(200);
      h = todo.find(x => x.item_name === item) || null;
    } catch (e) { return; }
    if (!h) return;

    const p = P._pct ? P._pct(h.price_before, h.price_after) : null;
    // Subir un coste es malo y bajarlo es bueno: el color va con lo
    // que significa, no con el signo.
    const col = p === null ? '' : p > 0 ? '#fca5a5' : '#6ee7b7';
    const sig = p === null ? '' : (p > 0 ? '+' : '') + p + '%';

    el.innerHTML = '<div class="m-fuente">' +
      'from invoice ' + esc(h.invoice_number || '—') +
      (h.invoice_date ? ' · ' + esc(h.invoice_date) : '') +
      (sig ? ' · <b style="color:' + col + '">' + esc(sig) + '</b> vs ' +
             '$' + Number(h.price_before).toFixed(2) : '') +
      '</div>';
  }

  async function pintarZonas(caja, item) {
    const el = caja.querySelector('#msZonas');
    const Z = window.BarStockZones;
    if (!el || !Z) return;

    try { if (!Z.lista().length) await Z.cargar(); } catch (e) {}
    if (!Z.activas || !Z.activas()) return;

    el.innerHTML = '<div class="m-zon"><span class="m-zon-k">Where it is</span>' +
                   '<span class="m-zon-wait">Looking…</span></div>';
    let d = null;
    try { d = await Z.donde(item); } catch (e) {}

    if (!d || !d.zonas || !d.zonas.length) {
      // Hay zonas puestas pero este producto no se ha repartido. No es
      // lo mismo que no tener zonas, y se dice.
      el.innerHTML = '<div class="m-zon"><span class="m-zon-k">Where it is</span>' +
                     '<span class="m-zon-wait">Not counted by zone yet</span></div>';
      return;
    }

    el.innerHTML =
      '<div class="m-zon"><span class="m-zon-k">Where it is</span>' +
      '<div class="m-zon-s">' +
        d.zonas.map(z => `
          <span class="m-zon-t${Number(z.botellas) > 0 ? '' : ' cero'}">
            <b>${n2(z.botellas)}</b>${esc(z.zona)}
          </span>`).join('') +
      '</div></div>';
  }

  // ── Ficha ────────────────────────────────────────────────────────────

  function ficha(host, idx) {
    const r = master()[idx];
    if (!r) return;
    _ficha = idx;
    const par = parDe(r);
    const k = tono(r);

    const avg = par && par.avgUsed != null ? Number(par.avgUsed) : null;
    const semanas = par && par.normalWeeks ? par.normalWeeks : 0;

    // "Te alcanza para X dias" solo cuando el promedio se sostiene.
    // Con dos semanas de historia ese numero es una corazonada con
    // aspecto de dato, y es de los que se creen.
    const fiable = avg !== null && avg > 0 && semanas >= SEMANAS_PARA_FIAR;
    const dias = fiable ? Math.round((Number(r.onHand) || 0) / avg * 7) : null;

    // "1 days" era un fallo que llevaba ahi desde el principio.
    const cuantos = (n, u) => n + ' ' + u + (n === 1 ? '' : 's');

    // La tarjeta se tiñe segun como este el producto: lo primero que
    // se ve desde lejos es el color, no el numero.
    const par18 = n2(r.suggested);
    const aviso = Number(r.onHand) <= 0
      ? 'Out of stock'
      : dias !== null ? 'Runs out in ' + cuantos(dias, 'day')
      : (Number(r.suggested) > 0 && Number(r.onHand) / Number(r.suggested) <= 0.25
          ? 'Running low' : '');

    const caja = host.querySelector('#msFicha');
    caja.innerHTML = `
      <!-- Aquí no hay título al lado: la ficha del producto va justo
           debajo y ya dice de qué es. Solo el chevron, con el mismo
           tamaño de dedo que en las demás pantallas. -->
      <div class="m-cab m-cab-sola">
        <button type="button" class="m-atras" id="msBack" aria-label="Back to results">
          <i class="ti ti-chevron-left" aria-hidden="true"></i></button>
      </div>

      <div class="m-fic m-fic-${esc(k.t === 'out of stock' ? 'mal' : k.t === 'running low' ? 'ojo' : 'bien')}">
        ${silueta(r, k.c)}
        <div class="m-fic-d">
          <div class="m-fic-n">${esc(r.item)}</div>
          <div class="m-fic-s">${esc(r.vendor || '')}${r.category ? ' · ' + esc(r.category) : ''}${
            r.bottleSizeMl ? ' · ' + esc(String(r.bottleSizeMl)) + ' ml' : ''}</div>
          <div class="m-fic-big">
            <b style="color:${k.c}">${n2(r.onHand)}</b>
            <span>${Number(r.suggested) > 0 ? 'of ' + par18 : 'on hand'}</span>
          </div>
          ${aviso ? `<div class="m-fic-av" style="color:${k.c}">${esc(aviso)}</div>` : ''}
        </div>
      </div>

      <div id="msZonas"></div>

      <div class="m-card m-rows">
        <div class="m-row">
          <span><i class="ti ti-trending-up" aria-hidden="true"></i> Uses per week</span>
          <b>${avg !== null ? avg : '—'}</b></div>
        <div class="m-row">
          <span><i class="ti ti-brain" aria-hidden="true"></i> Par</span>
          <b>${par18}${
          par && par.suggestedOptimal != null && par.suggestedOptimal !== Number(r.suggested)
            ? ' <span class="m-iq">· Pour·IQ says ' + par.suggestedOptimal + '</span>' : ''
        }</b></div>
        <div class="m-row m-row-end">
          <span><i class="ti ti-tag" aria-hidden="true"></i> Unit price</span>
          <b>${Number(r.value) > 0 ? '$' + Number(r.value).toFixed(2) : '—'}</b></div>
        <!-- De dónde salió ese precio. Se rellena después, leyendo el
             registro: un precio que cambia solo tiene que poder decir
             de qué factura vino. Si nunca vino de una, no pone nada,
             que también es información. -->
        <div id="msPrecio"></div>
        ${dias === null ? `<div class="m-row m-row-end">
          <span><i class="ti ti-hourglass" aria-hidden="true"></i> Lasts about</span>
          <b><span class="m-soft">needs ${SEMANAS_PARA_FIAR} weeks · has ${semanas}</span></b></div>` : ''}
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

    pintarZonas(caja, r.item);
    pintarOrigenPrecio(caja, r.item);
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
    _ficha = -1;
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
      mount, show,
      // Sin tocar dónde estás: en la lista repinta la lista, y con una
      // ficha abierta repinta ESA ficha. show() te sacaría de ella.
      refrescar(host) {
        if (host.classList.contains('ficha')) { if (_ficha >= 0) ficha(host, _ficha); }
        else pintarLista(host);
      },
      // De la ficha a los resultados. En la lista no hay vuelta atrás.
      atras(host, hacerlo) {
        if (!host.classList.contains('ficha')) return false;
        if (hacerlo) { host.classList.remove('ficha'); _ficha = -1; }
        return true;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
