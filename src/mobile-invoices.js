(() => {
  if (window.BarStockMobileInvoices) return;

  // ── Las facturas de este ciclo ───────────────────────────────────────
  //
  // Hasta ahora las compras sólo se podían mirar por ARTÍCULO del
  // estante —"What came in", en el escritorio—. Sirve para conciliar,
  // pero no se parece a nada que tengas en la mano. Una factura sí: es
  // el papel que te dio el repartidor, con su número y su total.
  //
  // Esta pantalla existe para dos cosas que hoy no se pueden hacer:
  //
  //   1. Cuadrar contra el papel. Total, líneas y unidades arriba.
  //   2. Ver A QUÉ BOTELLA alimenta cada línea. Que "Daou Paso Robles
  //      Cabernet Sauvignon" esté cargando al Daou y no a otro no se
  //      podía comprobar en ningún sitio.
  //
  // Y la tercera, que es la que de verdad cambia el día a día: la
  // línea que no tiene botella se arregla AQUÍ, en el momento en que
  // la ves. Pedirte que te acuerdes y vayas a otra pantalla es el
  // paso que sobra.
  //
  // ── Sólo el ciclo abierto ────────────────────────────────────────
  //
  // Con las 82 facturas históricas, el primer día salen cuarenta cosas
  // de meses pasados y se abandona. Lo que importa es lo que todavía
  // no está contado en esta semana. Recién reiniciado el ciclo la
  // pantalla sale vacía, y eso se dice con palabras.
  //
  // ── Lo que NO hace ───────────────────────────────────────────────
  //
  // No escribe en el inventario. Enlazar una línea sólo dice qué
  // botella es; lo recibido y los precios se aplican desde la tarjeta
  // del Home, que es una decisión aparte y con su propio botón.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const dinero = (n) => '$' + (Math.round((Number(n) || 0) * 100) / 100)
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const n1 = (n) => String(Math.round((Number(n) || 0) * 100) / 100);

  // PostgREST corta en 1000 filas y no avisa.
  const PAGINA = 1000;
  const MAX_PAGINAS = 40;

  let _facturas = null;   // [{ id, vendor, numero, fecha, total, lineas[] }]
  let _abierta = null;    // order_id de la que se está mirando
  let _busy = new Set();

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY };
  }

  async function locationId() {
    const P = window.BarStockParIntelligence;
    return P && P.fetchLocationId ? await P.fetchLocationId() : null;
  }

  function master() { return (window.state && window.state.master) || []; }

  function desdeCiclo() {
    const W = window.BarStockWeeklyCycle;
    const t = W && W.resetAt ? W.resetAt() : null;
    if (t) return String(t).slice(0, 10);
    return new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  }

  // 'YYYY-MM-DD' con new Date() se lee en UTC: al oeste de Greenwich
  // una factura del 27 se enseñaría como del 26.
  function dia(ymd) {
    const p = String(ymd || '').slice(0, 10).split('-');
    if (p.length !== 3) return { t: 0, txt: '' };
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return {
      t: d.getTime(),
      txt: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    };
  }

  async function leerPaginado(url, key, ruta) {
    let todo = [];
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const r = await fetch(`${url}/rest/v1/${ruta}&limit=${PAGINA}&offset=${p * PAGINA}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!r.ok) throw new Error(await r.text());
      const trozo = await r.json();
      if (!Array.isArray(trozo) || !trozo.length) break;
      todo = todo.concat(trozo);
      if (trozo.length < PAGINA) break;
    }
    return todo;
  }

  // ── Leer ───────────────────────────────────────────────────────────

  async function cargar() {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) throw new Error('No location.');

    const d = desdeCiclo();

    // ── Una tabla que falte no puede tumbar la pantalla ─────────────
    //
    // La primera versión leía las tres con un `Promise.all` pelado.
    // Si `marginedge_not_mine` todavía no existe —su SQL se corre a
    // mano— la lectura falla y se lleva por delante TODA la vista: no
    // ves tus facturas por una tabla que sólo sirve para descartar
    // papel de cocina.
    //
    // Las facturas son obligatorias: sin ellas no hay nada que
    // enseñar y el error sí tiene que verse. Las otras dos degradan:
    // sin vínculos todo sale como "sin botella", y sin descartados no
    // hay nada descartado. Las dos cosas son ciertas y se entienden.
    const opcional = async (ruta) => {
      try { return await leerPaginado(url, key, ruta); }
      catch (e) { console.warn('[facturas] tabla opcional', ruta, e); return []; }
    };

    const [lineas, enlaces, fuera, bebida] = await Promise.all([
      leerPaginado(url, key,
        `marginedge_invoice_lines?location_id=eq.${locId}&invoice_date=gte.${d}` +
        `&select=order_id,line_no,invoice_date,invoice_number,vendor_name,status,` +
        `product_id,vendor_item_name,unit_price,quantity,line_price` +
        `&order=order_id.asc,line_no.asc`),
      opcional(`marginedge_links?location_id=eq.${locId}&select=product_id,item_name&order=product_id.asc`),
      opcional(`marginedge_not_mine?location_id=eq.${locId}&select=product_id&order=product_id.asc`),
      // ── Sólo bebida ─────────────────────────────────────────────
      //
      // MarginEdge manda el restaurante ENTERO. La primera versión
      // enseñaba todo y la pantalla se llenó de J. Ambrogi Foods,
      // cebolla, marisco, Amazon y "Fish Window Cleaning", con cada
      // línea diciendo "no bottle claims this" — claro que no: no son
      // botellas. Eso no es una lista de trabajo, es ruido.
      //
      // Se piden sólo los ids de categoría de bebida, que son unos
      // pocos miles de los diez mil y pico del catálogo, y se filtra
      // contra ellos. Es la misma familia de tipos que usa la
      // pantalla de emparejar.
      opcional(`marginedge_products?location_id=eq.${locId}` +
        `&type=in.(BEER,LIQUOR,WINE,NA_BEVERAGES)&select=product_id&order=product_id.asc`)
    ]);

    // Sin catálogo guardado no se puede distinguir bebida de comida.
    // En ese caso se enseña todo: es peor esconder una factura real
    // que colar una de lechuga.
    const esBebida = bebida.length
      ? new Set(bebida.map(p => String(p.product_id)))
      : null;

    const dueno = new Map(enlaces.map(e => [String(e.product_id), e.item_name || '']));
    const descartado = new Set(fuera.map(e => String(e.product_id)));

    const porOrden = new Map();
    for (const l of lineas) {
      const id = String(l.order_id);
      let f = porOrden.get(id);
      if (!f) {
        f = { id, vendor: l.vendor_name || '', numero: l.invoice_number || '',
              fecha: l.invoice_date || '', status: l.status || '',
              total: 0, unidades: 0, sueltas: 0, ocultas: 0, lineas: [] };
        porOrden.set(id, f);
      }
      const pid = String(l.product_id || '');

      // La comida se cuenta pero no se enseña: hay que poder decir
      // "y 6 líneas más que no son bebida" en vez de que los totales
      // no cuadren con el papel sin explicación.
      if (esBebida && !esBebida.has(pid)) { f.ocultas++; continue; }

      const item = dueno.get(pid) || '';
      // Descartado no es lo mismo que suelto: dijiste que no es tuyo,
      // así que no vuelve a pedir atención.
      const suelto = !item && !descartado.has(pid);
      if (suelto) f.sueltas++;
      f.total += Number(l.line_price) || 0;
      f.unidades += Number(l.quantity) || 0;
      f.lineas.push({
        pid,
        nombre: l.vendor_item_name || pid,
        qty: Number(l.quantity) || 0,
        unit: Number(l.unit_price) || 0,
        total: Number(l.line_price) || 0,
        item, suelto
      });
    }

    // Una factura sin una sola línea de bebida no pinta nada aquí.
    // "Fish Window Cleaning" no es una compra de barra.
    const todas = Array.from(porOrden.values()).filter(f => f.lineas.length);
    for (const f of todas) f.ts = dia(f.fecha).t;
    todas.sort((a, b) => b.ts - a.ts || String(a.vendor).localeCompare(String(b.vendor)));

    sugerir(todas);
    _facturas = todas;
    return todas;
  }

  // El mismo motor de parecido de la pantalla de emparejar, importado.
  // Dos motores darían dos respuestas distintas a la misma pregunta
  // según por dónde entraras.
  function sugerir(facturas) {
    const M = window.BarStockMarginEdgeMatch;
    const filas = master();
    if (!M || !M._puntuar || !filas.length) return;
    if (M._idf) { try { M._idf(filas.map(r => r.item)); } catch (e) {} }

    for (const f of facturas) {
      for (const l of f.lineas) {
        if (!l.suelto) continue;
        let mejor = null, mejorS = 0;
        for (const r of filas) {
          const s = M._puntuar(r.item, l.nombre);
          if (s > mejorS) { mejorS = s; mejor = r; }
        }
        // Por debajo de esto no se propone: más vale preguntar que
        // adivinar, porque un enlace equivocado mueve dinero a la
        // botella que no es.
        if (mejor && mejorS >= 0.42) l.sugerida = mejor;
      }
    }
  }

  // ── Pintar ─────────────────────────────────────────────────────────

  function pintarLista(host) {
    const n = _facturas.length;

    if (!n) {
      host.innerHTML = cabecera() +
        '<div class="m-ivacio"><b>No invoices yet this cycle.</b><br>' +
        'They show up on their own as MarginEdge closes them.</div>';
      return;
    }

    let html = cabecera();
    let ultimoDia = '';

    for (let i = 0; i < n; i++) {
      const f = _facturas[i];
      const d = dia(f.fecha).txt;
      if (d !== ultimoDia) { html += '<div class="m-iday">' + esc(d) + '</div>'; ultimoDia = d; }

      // `m-hcard` es la tarjeta que ya usan el historial de órdenes y
      // las filas de inventario. Se reusa en vez de inventar otra: la
      // primera versión eran filas sueltas con una rayita, y al lado
      // del resto de la app se veían de otro programa.
      html +=
        '<button type="button" class="m-hcard" data-inv="' + i + '">' +
          '<span class="m-hcard-l">' +
            '<span class="m-hcard-v">' + esc(f.vendor || 'Unknown vendor') + '</span>' +
            '<span class="m-hcard-m">' +
              (f.numero ? esc(f.numero) + ' &middot; ' : '') +
              f.lineas.length + (f.lineas.length === 1 ? ' line' : ' lines') +
              // La pastilla es lo que te hace abrirla: sin ella una
              // factura completa y una a la que le falta una botella
              // se ven igual.
              (f.sueltas ? ' <i class="m-iflag">' + f.sueltas + ' unlinked</i>' : '') +
            '</span>' +
          '</span>' +
          '<span class="m-hcard-r"><span class="m-hcard-a">' + dinero(f.total) + '</span></span>' +
          '<i class="ti ti-chevron-right m-chev" aria-hidden="true"></i>' +
        '</button>';
    }

    host.innerHTML = html;
    host.querySelectorAll('[data-inv]').forEach(b => {
      b.onclick = () => { _abierta = _facturas[Number(b.dataset.inv)].id; pintar(host); };
    });
  }

  function cabecera() {
    const W = window.BarStockWeeklyCycle;
    const f = (W && W.resetAt && W.fmtDate) ? W.fmtDate(W.resetAt()) : '';
    return '<div class="m-inv-t">Invoices</div>' +
      '<div class="m-isub">What MarginEdge has received' +
      (f ? ' since the cycle opened on ' + esc(f) : ' this cycle') + '.</div>';
  }

  function ficha(r) {
    return [r.category, r.vendor, (Number(r.onHand) || 0) + ' on hand']
      .filter(Boolean).join(' · ');
  }

  function pintarDetalle(host, f) {
    let html =
      '<button type="button" class="m-iback" id="mInvBack">' +
        '<i class="ti ti-chevron-left" aria-hidden="true"></i> Invoices</button>' +
      '<div class="m-inv-t">' + esc(f.vendor || 'Unknown vendor') + '</div>' +
      '<div class="m-isub">' +
        (f.numero ? 'invoice ' + esc(f.numero) + ' &middot; ' : '') +
        esc(dia(f.fecha).txt) + (f.status ? ' &middot; ' + esc(String(f.status).toLowerCase()) : '') +
      '</div>' +
      // Los tres totales existen para una sola cosa: cuadrar contra el
      // papel que tienes en la mano.
      '<div class="m-itot">' +
        '<div><b>' + dinero(f.total) + '</b><span>total</span></div>' +
        '<div><b>' + f.lineas.length + '</b><span>' +
          (f.lineas.length === 1 ? 'line' : 'lines') + '</span></div>' +
        '<div><b>' + n1(f.unidades) + '</b><span>units</span></div>' +
      '</div>';

    f.lineas.forEach((l, k) => {
      const cuerpo =
        '<span class="q">' + n1(l.qty) + '&times;</span>' +
        '<span class="co">' +
          '<span class="n">' + esc(l.nombre) + '</span>' +
          (l.item ? '<span class="who">&rarr; ' + esc(l.item) + '</span>' : '') +
        '</span>' +
        '<span class="v">' + dinero(l.total) +
          '<small>' + dinero(l.unit) + ' ea</small></span>';

      // ── Una línea enlazada también se puede corregir ──────────────
      //
      // Antes el enlace era de ida y sin vuelta: si una línea apuntaba
      // a la botella equivocada, desde aquí no había nada que hacer y
      // había que irse a la pantalla de emparejar a buscarla entre
      // doscientas sesenta.
      //
      // `Change` abre el mismo picker que una línea sin dueño, más la
      // salida de soltarla del todo.
      if (!l.suelto && !l.editando) {
        html +=
          '<div class="m-iln m-icard">' + cuerpo +
            '<button type="button" class="m-ichg" data-chg="' + k + '" ' +
              'aria-label="Change the bottle">' +
              '<i class="ti ti-pencil" aria-hidden="true"></i></button>' +
          '</div>';
        return;
      }

      if (l.editando) {
        html +=
          '<div class="m-isin" data-sin="' + k + '">' +
            '<div class="m-iln" style="padding-top:0">' + cuerpo + '</div>' +
            '<div class="m-iask">Pick the right bottle</div>' +
            '<input type="search" class="m-ibuscar" data-q="' + k + '" ' +
              'placeholder="Search your bottles…" autocomplete="off">' +
            '<div class="m-ires" data-res="' + k + '"></div>' +
            '<div class="m-irow2">' +
              (l.item
                ? '<button type="button" class="m-ialt" data-unlink="' + k + '">Unlink</button>'
                : '') +
              '<button type="button" class="m-ino" data-cancel="' + k + '">Cancel</button>' +
            '</div>' +
            '<div class="m-iav" data-av="' + k + '"></div>' +
          '</div>';
        return;
      }

      // La línea sin botella se queda EN SU SITIO, dentro de la
      // factura. Sacarla a otra pantalla es perder el contexto que la
      // explica: de quién vino, en qué factura y por cuánto.
      html +=
        '<div class="m-isin" data-sin="' + k + '">' +
          '<div class="m-iln" style="padding-top:0">' + cuerpo + '</div>' +
          '<div class="m-iask">No bottle claims this</div>' +
          (l.sugerida
            ? '<button type="button" class="m-isug" data-pick="' + k + '">' +
                '<span class="tick">&#10003;</span>' +
                '<span class="t">' + esc(l.sugerida.item) +
                  '<small>' + esc(ficha(l.sugerida)) + '</small></span>' +
              '</button>' +
              '<div class="m-irow2">' +
                '<button type="button" class="m-ialt" data-otra="' + k + '">Another bottle</button>' +
                '<button type="button" class="m-ino" data-no="' + k + '">Not mine</button>' +
              '</div>'
            : '<input type="search" class="m-ibuscar" data-q="' + k + '" ' +
                'placeholder="Search your bottles…" autocomplete="off">' +
              '<div class="m-ires" data-res="' + k + '"></div>' +
              '<div class="m-irow2">' +
                '<button type="button" class="m-ino" data-no="' + k + '">Not mine</button>' +
              '</div>') +
          '<div class="m-iav" data-av="' + k + '"></div>' +
        '</div>';
    });

    const ocultas = f.ocultas
      ? '<b>' + f.ocultas + (f.ocultas === 1 ? ' line is' : ' lines are') +
        '</b> not beverages and are hidden — MarginEdge sends the whole restaurant, ' +
        'food and all. The totals above are the beverage part of this invoice. '
      : '';

    html += '<div class="m-ipie">' + ocultas +
      'These are <b>purchase units</b>, not bottles: a 2 might be ' +
      'two bottles or two cases of twelve. What gets written to your stock comes from the ' +
      'confirmed packaging, not from here.</div>';

    host.innerHTML = html;
    enganchar(host, f);
  }

  function avisar(k, texto, malo) {
    const el = document.querySelector('[data-av="' + k + '"]');
    if (!el) return;
    el.className = 'm-iav' + (malo ? ' mal' : '');
    el.textContent = texto || '';
  }

  // Bloqueo POR LÍNEA, nunca global: un candado global se traga los
  // clics en silencio y se pierden enlaces sin que nada lo diga.
  async function conBloqueo(k, fn) {
    if (_busy.has(k)) return;
    _busy.add(k);
    try { await fn(); }
    catch (e) { avisar(k, String(e && e.message || e), true); }
    finally { _busy.delete(k); }
  }

  function U() { return window.BarStockMarginEdgeUnclaimed || null; }

  function enganchar(host, f) {
    const atras = host.querySelector('#mInvBack');
    if (atras) atras.onclick = () => { _abierta = null; pintar(host); };

    const tras = (k, item) => {
      // Se refleja en memoria y se repinta: volver a leer la base
      // entera por un enlace es lento y además perdería el sitio.
      f.lineas[k].item = item;
      f.lineas[k].suelto = false;
      f.sueltas = f.lineas.filter(x => x.suelto).length;
      pintarDetalle(host, f);
    };

    host.querySelectorAll('[data-pick]').forEach(b => {
      b.onclick = () => {
        const k = Number(b.dataset.pick);
        const l = f.lineas[k];
        if (!l || !l.sugerida) return;
        conBloqueo(k, async () => {
          b.disabled = true;
          avisar(k, 'Linking…');
          const u = U();
          if (!u || !u.asignar) throw new Error('Linking is not available right now.');
          await u.asignar(l.pid, l.sugerida, l.nombre);
          tras(k, l.sugerida.item);
        });
      };
    });

    host.querySelectorAll('[data-no]').forEach(b => {
      b.onclick = () => {
        const k = Number(b.dataset.no);
        const l = f.lineas[k];
        if (!l) return;
        conBloqueo(k, async () => {
          b.disabled = true;
          avisar(k, 'Dismissing…');
          const u = U();
          if (!u || !u.noEsMio) throw new Error('Not available right now.');
          await u.noEsMio(l.pid, l.nombre);
          l.suelto = false;
          f.sueltas = f.lineas.filter(x => x.suelto).length;
          pintarDetalle(host, f);
        });
      };
    });

    // La sugerencia estaba mal: se cambia por el buscador.
    host.querySelectorAll('[data-otra]').forEach(b => {
      b.onclick = () => {
        const k = Number(b.dataset.otra);
        if (!f.lineas[k]) return;
        f.lineas[k].sugerida = null;
        pintarDetalle(host, f);
        const inp = document.querySelector('[data-q="' + k + '"]');
        if (inp) inp.focus();
      };
    });

    // Corregir una línea ya enlazada: abre el picker en su sitio.
    host.querySelectorAll('[data-chg]').forEach(b => {
      b.onclick = () => {
        const k = Number(b.dataset.chg);
        if (!f.lineas[k]) return;
        f.lineas[k].editando = true;
        pintarDetalle(host, f);
        const inp = document.querySelector('[data-q="' + k + '"]');
        if (inp) inp.focus();
      };
    });

    host.querySelectorAll('[data-cancel]').forEach(b => {
      b.onclick = () => {
        const k = Number(b.dataset.cancel);
        if (!f.lineas[k]) return;
        f.lineas[k].editando = false;
        pintarDetalle(host, f);
      };
    });

    // Soltarla del todo. Hace falta para deshacer: un enlace
    // equivocado tiene que poder quitarse sin obligarte a elegir una
    // botella cualquiera para salir del paso.
    host.querySelectorAll('[data-unlink]').forEach(b => {
      b.onclick = () => {
        const k = Number(b.dataset.unlink);
        const l = f.lineas[k];
        if (!l) return;
        conBloqueo(k, async () => {
          b.disabled = true;
          avisar(k, 'Unlinking…');
          const u = U();
          if (!u || !u.desenlazar) throw new Error('Not available right now.');
          await u.desenlazar(l.pid);
          l.item = '';
          l.suelto = true;
          l.editando = false;
          l.sugerida = null;
          f.sueltas = f.lineas.filter(x => x.suelto).length;
          sugerir([f]);
          pintarDetalle(host, f);
        });
      };
    });

    host.querySelectorAll('[data-q]').forEach(inp => {
      inp.oninput = () => buscar(host, f, Number(inp.dataset.q), inp.value);
    });
  }

  function buscar(host, f, k, q) {
    const caja = document.querySelector('[data-res="' + k + '"]');
    if (!caja) return;
    const t = String(q || '').trim().toUpperCase();
    if (t.length < 2) { caja.innerHTML = ''; return; }

    const hits = master()
      .filter(r => String(r.item || '').toUpperCase().includes(t))
      .slice(0, 6);

    if (!hits.length) { caja.innerHTML = '<div class="m-ivacio2">Nothing matches.</div>'; return; }

    caja.innerHTML = hits.map((r, i) =>
      '<button type="button" class="m-ihit" data-h="' + i + '">' +
        '<span class="t">' + esc(r.item) +
          '<small>' + esc(ficha(r)) + '</small></span></button>').join('');

    caja.querySelectorAll('[data-h]').forEach(b => {
      b.onclick = () => {
        const r = hits[Number(b.dataset.h)];
        const l = f.lineas[k];
        if (!r || !l) return;
        conBloqueo(k, async () => {
          b.disabled = true;
          avisar(k, 'Linking…');
          const u = U();
          if (!u || !u.asignar) throw new Error('Linking is not available right now.');
          await u.asignar(l.pid, r, l.nombre);
          l.item = r.item;
          l.suelto = false;
          l.editando = false;
          f.sueltas = f.lineas.filter(x => x.suelto).length;
          pintarDetalle(host, f);
        });
      };
    });
  }

  function pintar(host) {
    if (!host || !_facturas) return;
    const f = _abierta && _facturas.find(x => x.id === _abierta);
    if (f) pintarDetalle(host, f);
    else { _abierta = null; pintarLista(host); }
  }

  async function montar(host) {
    host.innerHTML = '<div class="m-inv-t">Invoices</div>' +
                     '<div class="m-isub">Reading…</div>';
    try {
      await cargar();
      pintar(host);
    } catch (e) {
      host.innerHTML = '<div class="m-inv-t">Invoices</div>' +
        '<div class="m-ivacio mal">' + esc(String(e.message || e)) + '</div>';
    }
  }

  window.BarStockMobileInvoices = { montar, _cargar: cargar, _sugerir: sugerir };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      id: 'invoices', icon: 'ti-receipt', label: 'Invoices',
      tab: false,
      mount: montar,
      // Entrar siempre por la lista: caer dentro de la factura que
      // miraste ayer desorienta.
      show(host) { _abierta = null; montar(host); },
      // Deslizar desde el borde cierra la factura antes de salir.
      atras(host, hacerlo) {
        if (!_abierta) {
          if (hacerlo && window.BarStockMobile) window.BarStockMobile.volver();
          return true;
        }
        if (hacerlo) { _abierta = null; pintar(host); }
        return true;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
