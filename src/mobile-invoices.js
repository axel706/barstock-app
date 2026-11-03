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
  // Lo que NO se enseña, por motivo. Que algo falte es aceptable; que
  // no haya forma de saber por qué, no.
  let _fuera = { comida: 0, ocultas: 0, sinFecha: 0 };
  let _antes = 0;
  // Las líneas descartadas, no sólo cuántas. Un contador dice que
  // falta algo; la lista dice QUÉ, y es la diferencia entre media
  // hora de preguntas y cinco segundos.
  let _descartadas = { comida: [], ocultas: [] };
  let _verFuera = '';   // '' | 'comida' | 'ocultas' | 'antes'
  let _viejas = null;   // facturas de ciclos anteriores, bajo demanda
  let _ciclos = null;   // aperturas registradas, de la mas nueva a la mas vieja
  let _enlaceOrden = null;  // { porFactura: Map, ordenes: [...] } o null
  // Los conjuntos que deciden QUE se enseña: proveedores ocultos,
  // facturas ocultas, que product_id es bebida, de quien es cada uno.
  // Se guardan porque los necesitan DOS vistas —la del ciclo y la de
  // ciclos anteriores— y montarlos dos veces fue justo el fallo: la
  // segunda lista salia con todos los proveedores.
  let _ctx = null;
  let _viejasFac = [];      // las facturas de antes, ya montadas
  let _verAjenas = false;   // enseñar tambien las que no son de barra
  let _eligiendoOrden = false;
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

  // El mismo criterio de "mismo nombre" que el resto de la app. Los
  // nombres de proveedor llegan con puntuación distinta según el día.
  function norm(x) {
    const M = window.BarStockMarginEdgeMatch;
    if (M && M._norm) { try { return M._norm(x); } catch (e) {} }
    return String(x == null ? '' : x)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/['\u2018\u2019\u00b4`]/g, '')
      .replace(/[^A-Z0-9]+/g, ' ').trim();
  }

  // ── Los ciclos que hubo ─────────────────────────────────────────
  //
  // `cycle_periods` guarda una fila por apertura. El FIN de un ciclo
  // es el inicio del siguiente, asi que no se guarda: se deduce.
  //
  // Si la tabla no existe todavia —su SQL se corre a mano— se
  // devuelve lista vacia y la pantalla se comporta como antes, con un
  // solo cajon. Que falte una migracion no puede tumbar una vista.
  async function ciclos() {
    if (_ciclos) return _ciclos;
    const { url, key } = cfg();
    const nombre = (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '';
    if (!url || !key || !nombre) { _ciclos = []; return _ciclos; }
    try {
      const r = await fetch(
        `${url}/rest/v1/cycle_periods?location_name=eq.${encodeURIComponent(nombre)}` +
        `&select=started_at&order=started_at.desc&limit=200`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      const filas = await r.json();
      if (!Array.isArray(filas)) {
        console.warn('[facturas] falta la tabla cycle_periods. Corre la migracion 021.');
        _ciclos = [];
      } else {
        _ciclos = filas.map(f => f.started_at).filter(Boolean);
      }
    } catch (e) {
      console.warn('[facturas] no se pudieron leer los ciclos', e);
      _ciclos = [];
    }
    return _ciclos;
  }

  // Fecha local 'YYYY-MM-DD' de una marca de tiempo. La misma cuenta
  // que `fechaInicioLocal()` del ciclo: cortar el ISO da la fecha UTC,
  // y un ciclo abierto el 26 por la tarde en Pensilvania es el 27 en
  // UTC. Las facturas traen fecha sin hora, o sea local.
  function ymdLocal(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // 'Oct 26'
  function corto(ymd) {
    const t = dia(ymd);
    if (!t.t) return ymd || '';
    return new Date(t.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // ── Las facturas, con su cabecera de ciclo ──────────────────────
  //
  // `agrupar` en false para las otras dos vistas —comida y ocultas—,
  // donde el ciclo no es la pregunta: ahi se listan seguidas, como
  // siempre.
  // Un BOTÓN, no un div. Eran divs y por eso no se podía entrar al
  // detalle de una factura de un ciclo anterior — ni enlazarla a una
  // orden, que es justo para lo que se mira esa lista.
  function tarjetaFactura(f) {
    return '<button type="button" class="m-hcard" data-vieja="' + esc(String(f.id)) + '">' +
      '<span class="m-hcard-l">' +
        '<span class="m-hcard-v">' + esc(f.vendor || 'Unknown vendor') + '</span>' +
        '<span class="m-hcard-m">' +
          (f.numero ? esc(f.numero) + ' · ' : '') +
          (f.fecha ? esc(dia(f.fecha).txt) + ' · ' : '') +
          f.n + (f.n === 1 ? ' line' : ' lines') +
        '</span>' +
      '</span>' +
      '<span class="m-hcard-r"><span class="m-hcard-a">' +
        dinero(f.total) + '</span></span>' +
      '<i class="ti ti-chevron-right m-hcard-go" aria-hidden="true"></i>' +
    '</button>';
  }

  function pintarGrupos(grupos, agrupar) {
    if (!agrupar) {
      return grupos.reduce((a, g) => a.concat(g.facturas), [])
                   .map(tarjetaFactura).join('');
    }
    let html = '';
    for (const g of grupos) {
      // Un ciclo sin facturas no se anuncia. La cabecera esta para
      // separar lo que hay, no para listar semanas vacias.
      if (!g.facturas.length) continue;

      const total = g.facturas.reduce((a, f) => a + (Number(f.total) || 0), 0);
      const n = g.facturas.length;

      let titulo, meta;
      if (g.sinRegistro) {
        titulo = g.hasta ? 'Before ' + corto(g.hasta) : 'No date';
        // Se dice POR QUE no tiene rango. La alternativa —enseñar una
        // fecha inventada— es peor que decir que no se sabe.
        meta = 'cycles not recorded yet';
      } else {
        titulo = corto(g.desde) + ' – ' + corto(g.hasta);
        const d = Math.max(1, Math.round(
          (dia(g.hasta).t - dia(g.desde).t) / 86400000));
        meta = d + (d === 1 ? ' day' : ' days');
      }

      html += '<div class="m-iciclo">' +
          '<span class="m-iciclo-t">' + esc(titulo) + '</span>' +
          '<span class="m-iciclo-s">' + esc(meta) + ' · ' +
            n + (n === 1 ? ' invoice' : ' invoices') + ' · ' +
            esc(dinero(total)) + '</span>' +
        '</div>' +
        g.facturas.map(tarjetaFactura).join('');
    }
    return html;
  }

  // ── Enlazar una factura con su orden, a mano ────────────────────
  //
  // El emparejamiento automatico va por PRODUCTO dentro del ciclo y
  // funciona casi siempre. Casi: en Crown se pide en el portal de
  // LOOP, se va a la tienda, y la factura llega a nombre de Fine Wine
  // & Good Spirits. Son el mismo pedido y la app no tiene como
  // saberlo.
  //
  // Esto no afina el automatico: lo deja en paz y anade una forma de
  // que la persona que estuvo ahi lo diga. Un enlace a mano gana
  // sobre cualquier regla — ver `src/mobile-history.js`.
  async function cargarEnlaceOrden() {
    if (_enlaceOrden) return _enlaceOrden;
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) { _enlaceOrden = { porFactura: new Map(), ordenes: [] }; return _enlaceOrden; }

    let links = [], ordenes = [];
    try {
      links = await leerPaginado(url, key,
        `invoice_order_links?location_id=eq.${locId}` +
        `&select=order_id,vendor_order_id&order=order_id.asc`);
    } catch (e) {
      // Tabla opcional: su SQL se corre a mano. Sin ella no se puede
      // enlazar, pero la pantalla no se cae.
      console.warn('[facturas] falta invoice_order_links. Corre la migracion 022.');
    }
    try {
      // Solo las del ciclo abierto y un poco antes: enlazar una
      // factura a una orden de hace tres meses no es un caso real, y
      // una lista de trescientas no se puede mirar en un telefono.
      const desde = new Date(dia(desdeCiclo()).t - 30 * 86400000).toISOString();
      ordenes = await leerPaginado(url, key,
        `vendor_orders?location_id=eq.${locId}&created_at=gte.${desde}` +
        `&select=id,app_order_id,vendor,po_number,created_at,subtotal` +
        `&order=created_at.desc`);
    } catch (e) {
      console.warn('[facturas] no se pudieron leer las ordenes', e);
    }

    _enlaceOrden = {
      porFactura: new Map(links.map(l => [String(l.order_id), String(l.vendor_order_id)])),
      ordenes: ordenes
    };
    return _enlaceOrden;
  }

  async function guardarEnlaceOrden(facturaId, ordenId) {
    const { url, key } = cfg();
    const locId = await locationId();
    // ── `on_conflict` no es opcional ─────────────────────────────────
    //
    // `resolution=merge-duplicates` sin más resuelve contra la LLAVE
    // PRIMARIA, y aquí la primaria es `id`, el autonumérico, que nunca
    // choca. La restricción de verdad es `unique (location_id,
    // order_id)` de la migración 022.
    //
    // Sin esto el primer enlace entraba y el segundo —reenlazar una
    // factura, que es justo para lo que existe esta pantalla— chocaba
    // con el unique y devolvía 409. El mensaje de ese 409 nombra la
    // tabla, y el catch de ahí arriba lo convertía en "falta la tabla,
    // corre la migración 022". Una migración que ya estaba corrida.
    const res = await fetch(
      `${url}/rest/v1/invoice_order_links?on_conflict=location_id,order_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key, Authorization: `Bearer ${key}`,
        // Una factura pertenece a UNA orden: volver a enlazarla
        // reemplaza en vez de acumular filas.
        Prefer: 'return=minimal,resolution=merge-duplicates'
      },
      body: JSON.stringify({
        location_id: locId,
        order_id: String(facturaId),
        vendor_order_id: Number(ordenId)
      })
    });
    if (!res.ok) {
      // El estado viaja con el error. Sin él, quien lo recoge sólo
      // tiene un texto donde sale el nombre de la tabla, y adivinar a
      // partir de ahí fue exactamente el problema.
      const e = new Error(await res.text());
      e.status = res.status;
      throw e;
    }
    (await cargarEnlaceOrden()).porFactura.set(String(facturaId), String(ordenId));
  }

  async function quitarEnlaceOrden(facturaId) {
    const { url, key } = cfg();
    const locId = await locationId();
    const res = await fetch(
      `${url}/rest/v1/invoice_order_links?location_id=eq.${locId}` +
      `&order_id=eq.${encodeURIComponent(String(facturaId))}`,
      { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(await res.text());
    (await cargarEnlaceOrden()).porFactura.delete(String(facturaId));
  }

  function desdeCiclo() {
    // La fecha del reinicio en LOCAL, no cortando el ISO: `resetAt()`
    // es UTC y un ciclo reiniciado el 26 por la tarde en Pensilvania
    // es el 27 en UTC. Las facturas traen fecha sin hora —fecha
    // local—, así que comparar contra la UTC se comía el día entero
    // del reinicio. Faltaban dos facturas del 26 por esto.
    const W = window.BarStockWeeklyCycle;
    const t = (W && W.fechaInicioLocal) ? W.fechaInicioLocal() : '';
    if (t) return t;
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

  // Conteo sin descargar filas: el número viene en la cabecera.
  async function contar(url, key, ruta) {
    try {
      const r = await fetch(`${url}/rest/v1/${ruta}&limit=0`, {
        headers: {
          apikey: key, Authorization: `Bearer ${key}`,
          Prefer: 'count=exact', Range: '0-0'
        }
      });
      const n = Number(String(r.headers.get('content-range') || '').split('/')[1]);
      return isFinite(n) ? n : 0;
    } catch (e) { return 0; }
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

    const [lineas, enlaces, fuera, bebida, ocultos] = await Promise.all([
      // ── Y las que no traen fecha ────────────────────────────────
      //
      // MarginEdge manda `invoiceDate` nula en algunas, y entonces se
      // guarda nula. Un filtro `>= fecha` EXCLUYE los nulos, así que
      // esas facturas desaparecían para siempre sin que nada lo
      // dijera. Entran, y se agrupan aparte.
      leerPaginado(url, key,
        `marginedge_invoice_lines?location_id=eq.${locId}` +
        `&or=(invoice_date.gte.${d},invoice_date.is.null)` +
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
        `&type=in.(BEER,LIQUOR,WINE,NA_BEVERAGES)&select=product_id&order=product_id.asc`),
      // Proveedores y facturas que dijiste que no son de la barra. El
      // servidor ya no los guarda; esto es para que desaparezcan al
      // instante, sin esperar al siguiente sync.
      opcional(`marginedge_hidden?location_id=eq.${locId}&select=kind,clave&order=clave.asc`)
    ]);

    const ocultoVendor = new Set(
      ocultos.filter(o => o.kind === 'vendor').map(o => String(o.clave)));
    const ocultoFactura = new Set(
      ocultos.filter(o => o.kind === 'invoice').map(o => String(o.clave)));

    // Sin catálogo guardado no se puede distinguir bebida de comida.
    // En ese caso se enseña todo: es peor esconder una factura real
    // que colar una de lechuga.
    // Cuántas líneas quedaron fuera por ser anteriores al ciclo. Sólo
    // el número: sirve para explicar un hueco, no para enseñarlas.
    _antes = await contar(url, key,
      `marginedge_invoice_lines?location_id=eq.${locId}&invoice_date=lt.${d}&select=order_id`);

    const esBebida = bebida.length
      ? new Set(bebida.map(p => String(p.product_id)))
      : null;

    const dueno = new Map(enlaces.map(e => [String(e.product_id), e.item_name || '']));
    const descartado = new Set(fuera.map(e => String(e.product_id)));

    _fuera = { comida: 0, ocultas: 0, sinFecha: 0 };
    _descartadas = { comida: [], ocultas: [] };

    // El contexto, para que la vista de ciclos anteriores filtre con
    // EXACTAMENTE el mismo criterio. Sin esto montaba su propia lista
    // en crudo y salian todos los proveedores, incluidos los que
    // marcaste como no tuyos y las facturas que no son de barra.
    _ctx = { ocultoFactura, ocultoVendor, esBebida, dueno, descartado };

    const todas = armar(lineas, _ctx, true);
    sugerir(todas);
    _facturas = todas;
    return todas;
  }

  // ── De lineas sueltas a facturas ────────────────────────────────
  //
  // Lo usan la lista del ciclo y la de ciclos anteriores. Estaba
  // escrito solo en la primera, y la segunda se monto aparte: por eso
  // una filtraba proveedores ocultos y comida, y la otra no.
  //
  // `contar` solo en la del ciclo: los contadores del pie —"6 no son
  // bebida", "3 de proveedores ocultos"— explican huecos de ESA
  // lista.
  function armar(lineas, ctx, contar) {
    const { ocultoFactura, ocultoVendor, esBebida, dueno, descartado } = ctx;
    const porOrden = new Map();
    for (const l of lineas) {
      const id = String(l.order_id);
      if (ocultoFactura.has(id) || ocultoVendor.has(norm(l.vendor_name))) {
        if (contar) { _fuera.ocultas++; _descartadas.ocultas.push(l); }
        continue;
      }
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
      // Comida fuera, pero sólo cuando se SABE que lo es.
      //
      // `esBebida` son los product_id del catálogo actual de
      // MarginEdge. Una línea sin product_id, o de un producto que ya
      // no está en ese catálogo —cosa normal en facturas viejas— no
      // se puede clasificar: no es prueba de que sea comida.
      // Descartarla sería hacer desaparecer una factura real sin
      // decirlo, que es el fallo que llevamos todo el día persiguiendo.
      if (esBebida && pid && !esBebida.has(pid)) {
        f.ocultas++;
        if (contar) { _fuera.comida++; _descartadas.comida.push(l); }
        continue;
      }

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
    for (const f of todas) {
      f.ts = dia(f.fecha).t;
      if (!f.fecha) { f.sinFecha = true; if (contar) _fuera.sinFecha++; }
    }
    // Las sin fecha al final: no se pueden ordenar con las demás, pero
    // tampoco pueden desaparecer.
    todas.sort((a, b) =>
      (a.sinFecha ? 1 : 0) - (b.sinFecha ? 1 : 0) ||
      b.ts - a.ts || String(a.vendor).localeCompare(String(b.vendor)));

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
      // El pie va TAMBIEN aqui, y es donde mas falta hace: el dia
      // despues de abrir un ciclo no hay ni una factura propia, y sin
      // el pie la unica puerta a las anteriores no existe. Justo lo
      // que ve quien acaba de reiniciar la semana.
      //
      // Estaba fuera por el return temprano de arriba. Es el mismo
      // patron que ya mordio en settings-integrations.js y en el panel
      // de admin: codigo que decide lo que el usuario ve, colocado
      // donde no se ejecuta en el camino que importa.
      host.innerHTML = cabecera() +
        '<div class="m-ivacio"><b>No invoices yet this cycle.</b><br>' +
        'They show up on their own as MarginEdge closes them.</div>' +
        pieHuecos();
      enlacesDelPie(host);
      salirDeLaRaiz(host);
      return;
    }

    let html = cabecera();
    let ultimoDia = '';

    for (let i = 0; i < n; i++) {
      const f = _facturas[i];
      const d = f.sinFecha ? 'No date from MarginEdge' : dia(f.fecha).txt;
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

    html += pieHuecos();

    host.innerHTML = html;
    salirDeLaRaiz(host);
    host.querySelectorAll('[data-inv]').forEach(b => {
      b.onclick = () => { _abierta = _facturas[Number(b.dataset.inv)].id; pintar(host); cambioDeNivel(); };
    });
    enlacesDelPie(host);
  }

  // Los enlaces del pie, en su propia funcion: los pintan DOS caminos
  // —la lista con facturas y la lista vacia— y engancharlos solo en
  // uno es como el de arriba se quedo sin ellos.
  function enlacesDelPie(host) {
    host.querySelectorAll('[data-ver]').forEach(b => {
      b.onclick = () => { _verFuera = b.dataset.ver; pintar(host); cambioDeNivel(); };
    });
  }

  // ── Por qué no está aquí ───────────────────────────────────────────
  //
  // Hoy faltaban dos facturas de Fine Wine & Good Spirits y no había
  // manera de saber si era por el filtro de bebida, por el ciclo, por
  // estar ocultas o porque no se habían descargado. Media hora para
  // una respuesta que la pantalla podía dar sola.
  function pieHuecos() {
    const t = [];
    if (_fuera.comida)  t.push('<button type="button" class="m-ilink" data-ver="comida">' +
                               _fuera.comida + ' not beverages</button>');
    if (_fuera.ocultas) t.push('<button type="button" class="m-ilink" data-ver="ocultas">' +
                               _fuera.ocultas + ' from hidden vendors</button>');
    if (_antes)         t.push('<button type="button" class="m-ilink" data-ver="antes">' +
                               _antes + ' from earlier cycles</button>');
    if (!t.length) return '';
    return '<div class="m-ipie"><b>Not shown here:</b> ' + t.join(' · ') +
      '. Tap any of them to see what they are.</div>';
  }

  // ── Qué hay detrás de cada número ──────────────────────────────────
  //
  // Un contador dice que falta algo; sin la lista no se puede saber
  // si lo que falta es lechuga o la factura que estás buscando. Eso
  // costó varias rondas de preguntas, así que se enseña.
  async function pintarFuera(host) {
    const cual = _verFuera;
    const titulo = cual === 'comida' ? 'Not beverages'
                 : cual === 'ocultas' ? 'From hidden vendors'
                 : 'Earlier cycles';

    host.innerHTML =
      cab({ volverA: 'Invoices', titulo: titulo, sub: 'Reading…' });

    let lineas = [];
    try {
      if (cual === 'antes') {
        if (!_viejas) {
          const { url, key } = cfg();
          const locId = await locationId();
          // LAS MISMAS columnas que la lista del ciclo. Antes se pedian
          // cuatro campos sueltos, y por eso estas facturas no podian
          // abrirse: sin `product_id` ni `vendor_item_name` no hay
          // detalle que enseñar.
          _viejas = await leerPaginado(url, key,
            `marginedge_invoice_lines?location_id=eq.${locId}&invoice_date=lt.${desdeCiclo()}` +
            `&select=order_id,product_id,vendor_item_name,invoice_date,invoice_number,` +
            `vendor_name,unit_price,line_price,quantity,status` +
            `&order=invoice_date.desc`);
        }
        lineas = _viejas;
      } else {
        lineas = _descartadas[cual] || [];
      }
    } catch (e) {
      host.innerHTML =
        cab({ volverA: 'Invoices', titulo: titulo }) +
        '<div class="m-ivacio mal">' + esc(String(e && e.message || e)) + '</div>';
      volverCon(host, () => { _verFuera = ''; pintar(host); cambioDeNivel(); });
      return;
    }

    // ── Por FACTURA, y con EL MISMO criterio que la lista del ciclo ──
    //
    // Antes esto montaba su propia agrupacion en crudo: sin filtrar
    // proveedores ocultos ni lineas que no son bebida. El resultado
    // era una lista interminable con TODOS los proveedores, incluidos
    // los que marcaste como no tuyos.
    //
    // Ahora usa `armar()`, el mismo de la lista del ciclo. `contar` en
    // false: los contadores del pie explican huecos de aquella, no de
    // esta.
    // ── Con qué criterio se agrupa cada vista ───────────────────────
    //
    // "Earlier cycles" son facturas de verdad, así que pasan por el
    // MISMO filtro que la lista del ciclo: proveedores ocultos fuera,
    // comida fuera. Eso es lo que faltaba.
    //
    // Las otras dos enseñan justo lo que ese filtro descarta. Pasarlas
    // por él las dejaría vacías — que es exactamente lo que acabo de
    // hacer al unificarlas sin pensar. Ahí se agrupa sin excluir nada.
    const SIN_FILTRO = {
      ocultoFactura: new Set(), ocultoVendor: new Set(),
      esBebida: null, dueno: new Map(), descartado: new Set()
    };
    const ctx = cual === 'antes' ? (_ctx || SIN_FILTRO) : SIN_FILTRO;
    let facturas = armar(lineas, ctx, false);

    // ── Lo que no es una compra de barra ────────────────────────────
    //
    // En el ciclo abierto basta con el filtro de bebida: los productos
    // de esta semana estan en el catalogo de MarginEdge, asi que se
    // sabe cual es cual.
    //
    // En el historial no. Un producto de hace meses puede no estar ya
    // en ese catalogo, y descartar por eso haria desaparecer facturas
    // reales — por eso una linea con producto desconocido se conserva.
    // El efecto secundario fue que se colaron Target y la ferreteria.
    //
    // Asi que aqui la pregunta es por FACTURA, no por linea: es una
    // compra de barra si ALGUNA de sus lineas apunta a algo tuyo —una
    // botella enlazada, o un producto que el catalogo dice que es
    // bebida—. Una factura de Target no tiene ninguna.
    //
    // Y no se esconden en silencio: se cuentan y se pueden desplegar.
    // Esconder sin decirlo es el fallo que ya nos costo caro con los
    // productos "dormidos".
    let ajenas = 0;
    if (cual === 'antes' && _ctx) {
      const mia = (f) => f.lineas.some(l =>
        (_ctx.dueno && _ctx.dueno.has(l.pid)) ||
        (_ctx.esBebida && _ctx.esBebida.has(l.pid)));
      const dentro = facturas.filter(mia);
      ajenas = facturas.length - dentro.length;
      if (!_verAjenas) facturas = dentro;
    }
    for (const f of facturas) f.n = f.lineas.length;
    _viejasFac = cual === 'antes' ? facturas : _viejasFac;

    // ── Repartirlas por el ciclo en que cayeron ─────────────────────
    //
    // Era un cajon plano: en dos meses, cuatrocientas facturas
    // ordenadas por fecha y nada mas. Ahora cada una cae en el ciclo
    // que estaba abierto el dia que llego.
    //
    // El ultimo grupo es el de antes del primer registro. Esa historia
    // NO existe —`weekly_reset_at` solo recordaba el ciclo abierto— y
    // no hay de donde sacarla, asi que se dice con esas palabras en
    // vez de inventar una fecha.
    const aperturas = cual === 'antes' ? await ciclos() : [];
    const grupos = [];
    if (aperturas.length) {
      // De la mas nueva a la mas vieja: [inicio, fin) en fecha local.
      for (let i = 0; i < aperturas.length; i++) {
        grupos.push({
          desde: ymdLocal(aperturas[i]),
          hasta: i === 0 ? desdeCiclo() : ymdLocal(aperturas[i - 1]),
          facturas: []
        });
      }
    }
    // El cajon del final, siempre: recoge lo anterior al primer
    // registro, y tambien cualquier factura sin fecha legible.
    const primera = aperturas.length ? ymdLocal(aperturas[aperturas.length - 1]) : '';
    grupos.push({ desde: '', hasta: primera, facturas: [], sinRegistro: true });

    for (const f of facturas) {
      const d = String(f.fecha || '').slice(0, 10);
      const g = grupos.find(x => !x.sinRegistro && d >= x.desde && d < x.hasta);
      (g || grupos[grupos.length - 1]).facturas.push(f);
    }

    const sub = cual === 'comida'
      ? 'Invoices with lines whose product is not in a beverage category. ' +
        'The count is lines; this list is invoices.'
      : cual === 'ocultas'
        ? 'Invoices from vendors you marked as not yours.'
        : 'Invoices from cycles that are already closed. Nothing is deleted — ' +
          'the prices and matches they set are still in place.';

    host.innerHTML =
      cab({ volverA: 'Invoices', titulo: titulo }) +
      '<div class="m-isub">' + sub + '</div>' +
      (facturas.length ? pintarGrupos(grupos, cual === 'antes')
        : '<div class="m-ivacio"><b>Nothing here.</b><br>' +
          'The count came from a different query — tell me and I will look at it.</div>') +
      '<div class="m-ipie">' + facturas.length +
        (facturas.length === 1 ? ' invoice' : ' invoices') +
        (ajenas
          ? ' · <button type="button" class="m-ilink" id="miAjenas">' +
            (_verAjenas ? 'hide ' : 'show ') + ajenas +
            ' with nothing of yours</button>'
          : '') +
      '</div>';

    // Entrar al detalle desde aqui. Es lo que faltaba: sin esto la
    // lista de ciclos anteriores se podia mirar pero no abrir, y
    // enlazar una factura a su orden —que es para lo que se mira— era
    // imposible.
    const aj = host.querySelector('#miAjenas');
    if (aj) aj.onclick = () => { _verAjenas = !_verAjenas; pintar(host); };

    host.querySelectorAll('[data-vieja]').forEach(b => {
      b.onclick = () => {
        _abierta = b.dataset.vieja;
        pintar(host);
        cambioDeNivel();
      };
    });

    volverCon(host, () => { _verFuera = ''; pintar(host); cambioDeNivel(); });
  }

  // El encabezado lo arma el armazón: chevron a la izquierda del
  // título, en la misma fila. Esta pantalla se había quedado con el
  // patrón viejo porque usaba su propia clase, `m-iback`, y no salió
  // en el barrido de `m-back`.
  const cab = (o) => (window.BarStockMobile && window.BarStockMobile.cabecera)
    ? window.BarStockMobile.cabecera(o)
    : '<div class="m-inv-t">' + esc(o.titulo || '') + '</div>';
  const volverCon = (host, fn) => {
    if (window.BarStockMobile && window.BarStockMobile.alVolver) {
      window.BarStockMobile.alVolver(host, fn);
    }
  };

  // La raíz de esta pantalla NO tenía vuelta, y se entra a ella igual
  // que a Ajustes o al historial: desde More, donde ninguna pestaña
  // queda encendida. Sin flecha no había forma de salir salvo pulsar
  // otra pestaña — que es irse, no volver.
  // La raíz ya no pinta encabezado: el título, el subtítulo y el
  // segmentado los pone la pantalla de Orders, que es donde vive
  // esta sección desde la mudanza.
  function cabecera() { return ''; }
  function salirDeLaRaiz() {}

  function ficha(r) {
    return [r.category, r.vendor, (Number(r.onHand) || 0) + ' on hand']
      .filter(Boolean).join(' · ');
  }

  // ── "Esta factura es de esta orden" ─────────────────────────────
  //
  // Va justo debajo de los totales y encima de las lineas: es una
  // afirmacion sobre la factura entera, no sobre un producto.
  //
  // Cuando ya esta enlazada se dice a cual y se puede soltar. El
  // enlace equivocado tiene que poder quitarse sin obligarte a elegir
  // otro para salir del paso — el mismo criterio que el `Unlink` de
  // las botellas.
  function bloqueOrden(f) {
    const d = _enlaceOrden;
    if (!d) return '';
    const atada = d.porFactura.get(String(f.id)) || '';

    if (_eligiendoOrden) {
      const lista = d.ordenes.length
        ? d.ordenes.map(o =>
            '<button type="button" class="m-iord" data-ord="' + esc(String(o.id)) + '">' +
              '<span class="m-iord-l">' +
                '<b>' + esc(o.vendor || 'Unknown vendor') + '</b>' +
                '<small>' + esc(o.po_number || o.app_order_id || '') + ' · ' +
                  esc(dia(o.created_at).txt) + '</small>' +
              '</span>' +
              '<span class="m-iord-r">' + dinero(o.subtotal) + '</span>' +
            '</button>').join('')
        : '<div class="m-ivacio">No orders in the last weeks.</div>';
      return '<div class="m-iatar">' +
        '<div class="m-iask">Which order is this invoice for?</div>' +
        lista +
        '<button type="button" class="m-ino" id="miOrdX">Cancel</button>' +
      '</div>';
    }

    if (atada) {
      const o = d.ordenes.find(x => String(x.id) === atada);
      return '<div class="m-iatar on">' +
        '<div class="m-iatar-t"><i class="ti ti-link" aria-hidden="true"></i> ' +
          'Counts toward ' + esc(o ? (o.po_number || o.app_order_id || o.vendor) : 'an order') +
          (o ? ' · ' + esc(o.vendor || '') : '') + '</div>' +
        '<button type="button" class="m-ialt" id="miOrdOff">Unlink</button>' +
      '</div>';
    }

    return '<div class="m-iatar">' +
      '<button type="button" class="m-ialt" id="miOrdOn">' +
        '<i class="ti ti-link" aria-hidden="true"></i> Link to an order</button>' +
      '<div class="m-iatar-s">For when the invoice comes from a different ' +
        'vendor than the order — a store run, say.</div>' +
    '</div>';
  }

  function pintarDetalle(host, f) {
    let html =
      cab({
        volverA: 'Invoices',
        titulo: f.vendor || 'Unknown vendor',
        sub: (f.numero ? 'invoice ' + f.numero + ' \u00b7 ' : '') +
             dia(f.fecha).txt +
             (f.status ? ' \u00b7 ' + String(f.status).toLowerCase() : '')
      }) +
      // Los tres totales existen para una sola cosa: cuadrar contra el
      // papel que tienes en la mano.
      '<div class="m-itot">' +
        '<div><b>' + dinero(f.total) + '</b><span>total</span></div>' +
        '<div><b>' + f.lineas.length + '</b><span>' +
          (f.lineas.length === 1 ? 'line' : 'lines') + '</span></div>' +
        '<div><b>' + n1(f.unidades) + '</b><span>units</span></div>' +
      '</div>' +
      bloqueOrden(f);

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

    // ── Descartar ───────────────────────────────────────────────────
    //
    // Al final y separado del resto: borrar historial no puede estar a
    // la misma distancia del pulgar que enlazar una botella.
    html +=
      '<div class="m-idanger">' +
        '<div class="m-idlab">Not a bar purchase?</div>' +
        '<div class="m-idrow">' +
          '<button type="button" class="m-idbtn" id="mInvHideV">Hide ' +
            esc(f.vendor || 'this vendor') + '</button>' +
          '<button type="button" class="m-idbtn soft" id="mInvHideI">Hide this invoice</button>' +
        '</div>' +
        '<div class="m-idnote">MarginEdge marks juice, soda and cream as beverages, so a ' +
          'food distributor slips through the category filter. Hiding a vendor is how you ' +
          'tell the app which ones are yours.</div>' +
      '</div>';

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
    volverCon(host, () => { _abierta = null; pintar(host); cambioDeNivel(); });

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
    // ── Los botones del enlace con la orden ───────────────────────
    const on = host.querySelector('#miOrdOn');
    if (on) on.onclick = () => { _eligiendoOrden = true; pintar(host); };
    const x = host.querySelector('#miOrdX');
    if (x) x.onclick = () => { _eligiendoOrden = false; pintar(host); };

    host.querySelectorAll('[data-ord]').forEach(b => {
      b.onclick = async () => {
        b.disabled = true;
        try {
          await guardarEnlaceOrden(_abierta, b.dataset.ord);
          _eligiendoOrden = false;
          // El historial de órdenes lee esta tabla al pintar, así que
          // en cuanto vuelva se recalcula solo. Aquí sólo se repinta
          // lo de delante.
          pintar(host);
          const T = window.BarStockToast;
          if (T && T.show) T.show('Linked. The order will count it.');
        } catch (e) {
          b.disabled = false;
          const D = window.BarStockDialog;
          // ── El error dice lo que paso, no lo que uno supone ────────
          //
          // Esto decia "falta la tabla, corre la migracion 022" ante
          // CUALQUIER error que mencionara la tabla, y PostgREST la
          // menciona en todos: en un 409 por el unique, en una columna
          // que no cuadra, en un permiso. La migracion estaba corrida y
          // el mensaje mandaba a correrla otra vez.
          //
          // Ahora solo se dice eso cuando de verdad falta la relacion:
          // un 404, o el 42P01 de Postgres. Lo demas se enseña tal
          // cual, feo pero cierto.
          const txt = String((e && e.message) || e);
          const falta = e && e.status === 404 || /42P01|does not exist/i.test(txt);
          if (D && D.avisar) {
            D.avisar({
              titulo: 'Could not link',
              cuerpo: falta ? 'The table is missing. Run migration 022.' : txt
            });
          }
        }
      };
    });

    const off = host.querySelector('#miOrdOff');
    if (off) off.onclick = async () => {
      off.disabled = true;
      try { await quitarEnlaceOrden(_abierta); pintar(host); }
      catch (e) {
        // Antes esto se tragaba el error: el boton volvia a estar
        // disponible, el enlace seguia ahi, y la pantalla no decia
        // nada. Quitar un enlace equivocado y que no pase nada, sin
        // aviso, es como no tener el boton.
        off.disabled = false;
        const D = window.BarStockDialog;
        if (D && D.avisar) {
          D.avisar({ titulo: 'Could not unlink',
                     cuerpo: String((e && e.message) || e) });
        }
      }
    };

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

    // ── Ocultar ─────────────────────────────────────────────────────
    //
    // Se pregunta con las consecuencias EXACTAS, incluidas cuántas
    // facturas se van a borrar. "¿Ocultar proveedor?" no deja decidir
    // nada; "se borran las 14 que ya están guardadas" sí.
    const hv = host.querySelector('#mInvHideV');
    if (hv) hv.onclick = async () => {
      const nom = f.vendor || '';
      const cuantas = _facturas.filter(x => norm(x.vendor) === norm(nom)).length;
      const ok = await preguntar({
        titulo: 'Hide ' + nom + '?',
        cuerpo: 'From now on this vendor is treated as not yours:\n' +
                '· its invoices stop being saved when MarginEdge syncs\n' +
                '· nothing in your inventory, orders or prices changes\n' +
                '\nYou can bring it back from Settings › Connections.',
        aviso: 'The ' + cuantas + ' invoice' + (cuantas === 1 ? '' : 's') +
               ' already stored ' + (cuantas === 1 ? 'is' : 'are') + ' deleted.',
        ok: 'Hide it', cancelar: 'Cancel', peligro: true
      });
      if (!ok) return;
      hv.disabled = true;
      try {
        await ocultar('vendor', norm(nom), nom);
        await borrarDe({ vendor: nom });
        _abierta = null;
        await montar(host);
      } catch (e) {
        hv.disabled = false;
        fallo(e);
      }
    };

    const hi = host.querySelector('#mInvHideI');
    if (hi) hi.onclick = async () => {
      const ok = await preguntar({
        titulo: 'Hide this invoice?',
        cuerpo: 'Other invoices from ' + (f.vendor || 'this vendor') +
                ' keep coming in.',
        aviso: 'It stops being saved and the lines already stored are deleted.',
        ok: 'Hide it', cancelar: 'Cancel', peligro: true
      });
      if (!ok) return;
      hi.disabled = true;
      try {
        await ocultar('invoice', f.id, (f.vendor || '') + ' · ' + (f.numero || f.id));
        await borrarDe({ orderId: f.id });
        _abierta = null;
        await montar(host);
      } catch (e) {
        hi.disabled = false;
        fallo(e);
      }
    };
  }

  // ── Escribir el descarte ─────────────────────────────────────────

  // El diálogo de la app en vez de los del navegador. El respaldo es
  // por si esto corriera sin `dialog.js`: ocultar un proveedor borra
  // facturas, así que seguir adelante sin preguntar no es una opción.
  function preguntar(o) {
    const D = window.BarStockDialog;
    if (D && D.confirmar) return D.confirmar(o);
    return Promise.resolve(window.confirm(o.titulo));
  }

  // Un fallo al ocultar deja el botón vivo para reintentar, así que lo
  // único que hace falta es contarlo.
  function fallo(e) {
    const texto = String((e && e.message) || e);
    const D = window.BarStockDialog;
    if (D && D.avisar) D.avisar({ titulo: 'It could not be hidden.', cuerpo: texto, peligro: true });
    else window.alert(texto);
  }

  async function ocultar(kind, clave, label) {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) throw new Error('No location.');

    const r = await fetch(
      `${url}/rest/v1/marginedge_hidden?on_conflict=location_id,kind,clave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key, Authorization: `Bearer ${key}`,
          Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify({
          location_id: locId, kind, clave: String(clave), label: String(label || '')
        })
      });
    if (!r.ok) {
      const t = await r.text();
      // El caso que de verdad va a pasar: falta la tabla.
      if (/marginedge_hidden/.test(t) || /does not exist|PGRST205/.test(t)) {
        throw new Error('Run docs/sql/marginedge-hidden.sql in Supabase first.');
      }
      throw new Error(t);
    }
    return true;
  }

  // Borrar lo ya guardado. Ocultar sin borrar dejaría la tabla
  // creciendo con comida y la pantalla mintiendo sobre el tamaño del
  // historial.
  async function borrarDe(q) {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) throw new Error('No location.');

    const filtro = q.orderId
      ? `&order_id=eq.${encodeURIComponent(String(q.orderId))}`
      : `&vendor_name=eq.${encodeURIComponent(String(q.vendor || ''))}`;

    const r = await fetch(
      `${url}/rest/v1/marginedge_invoice_lines?location_id=eq.${locId}${filtro}`, {
        method: 'DELETE',
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      });
    if (!r.ok) throw new Error(await r.text());
    return true;
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

  // Un fallo aquí dejaba la pantalla en blanco, que es indistinguible
  // de "no hay nada". Se enseña, con la forma de volver.
  function pintar(host) {
    if (!host || !_facturas) return;
    try {
      // El DETALLE manda sobre la lista, venga de donde venga.
      //
      // Antes `_verFuera` cortaba antes de llegar aqui, asi que una
      // factura de un ciclo anterior no podia abrirse: pulsarla
      // repintaba la misma lista. Se busca en las dos, y al volver
      // `_verFuera` sigue puesto, asi que se regresa a la lista de
      // ciclos anteriores y no a la del ciclo.
      const f = _abierta &&
        (_facturas.find(x => x.id === _abierta) ||
         _viejasFac.find(x => x.id === _abierta));
      if (f) { pintarDetalle(host, f); return; }
      if (_abierta) _abierta = null;

      if (_verFuera) {
        const p = pintarFuera(host);
        if (p && p.catch) p.catch(e => falloAlPintar(host, e));
        return;
      }
      pintarLista(host);
    } catch (e) {
      falloAlPintar(host, e);
    }
  }

  function falloAlPintar(host, e) {
    console.error('[facturas]', e);
    host.innerHTML =
      cab({ volverA: 'Invoices', titulo: 'Something broke' }) +
      '<div class="m-ivacio mal">' + esc(String((e && (e.stack || e.message)) || e)) + '</div>';
    volverCon(host, () => { _verFuera = ''; _abierta = null; pintar(host); cambioDeNivel(); });
  }

  // Ver el comentario gemelo en mobile-history.js: `aviso` es lo que
  // hace que el marco de Orders sepa que esta sección entró o salió
  // de un detalle.
  let _aviso = null;
  const cambioDeNivel = () => { if (_aviso) _aviso(); };

  async function montar(host, aviso) {
    if (typeof aviso === 'function') _aviso = aviso;
    _verFuera = '';
    _viejas = null;
    _eligiendoOrden = false;
    _enlaceOrden = null;
    _verAjenas = false;
    // Sin título propio: lo pone el contenedor.
    host.innerHTML = '<div class="m-isub">Reading…</div>';
    try {
      await cargar();
      // Los enlaces a mano, antes de pintar: el detalle de una factura
      // tiene que saber de salida si ya está atada a una orden.
      await cargarEnlaceOrden();
      pintar(host);
    } catch (e) {
      host.innerHTML = '<div class="m-ivacio mal">' + esc(String(e.message || e)) + '</div>';
    }
  }

  // ── El resumen que usa la tarjeta del Home ─────────────────────────
  //
  // La tarjeta leía las líneas por su cuenta y SIN el filtro de
  // bebida: decía 24 facturas y 15.424 dólares, que es el restaurante
  // entero —lechuga, marisco y limpieza de ventanas— mientras esta
  // pantalla enseñaba cuatro facturas de licor. Dos lectores de los
  // mismos datos con reglas distintas, que es el fallo que más veces
  // ha mordido este proyecto.
  //
  // Ahora sale de aquí: una sola lectura, una sola respuesta.
  async function resumen() {
    const fs_ = await cargar();

    // ── ¿Está conectada esta locación? ──────────────────────────────
    //
    // Sin catálogo copiado no hay conexión: lo que falta no son
    // facturas, es dar de alta la locación. La tarjeta del Home
    // necesita distinguirlo o dice "nothing new yet" sobre algo que
    // nadie ha conectado nunca — mentira por omisión.
    const { url, key } = cfg();
    const locId = await locationId();
    const prods = await contar(url, key,
      `marginedge_products?location_id=eq.${locId}&select=product_id`);
    let unidades = 0, dinero = 0, sueltas = 0, ultima = '';
    for (const f of fs_) {
      unidades += f.unidades;
      dinero += f.total;
      sueltas += f.sueltas;
      if (f.fecha && f.fecha > ultima) ultima = f.fecha;
    }
    return { n: fs_.length, unidades: Math.round(unidades), dinero, sueltas, ultima,
             conectado: prods > 0 };
  }

  // ── Ya no es una pantalla, es una SECCIÓN de Orders ──────────────
  //
  // Misma idea que el historial: el contenedor le pasa un `host`
  // propio y esta pantalla pinta sobre él como siempre.
  //
  // `enDetalle` cuenta las DOS formas de estar dentro: una factura
  // abierta, o una de las listas de "no mostrado aquí".
  window.BarStockMobileInvoices = {
    montar, resumen, _cargar: cargar, _sugerir: sugerir,
    enDetalle: () => !!_abierta || !!_verFuera,
    cerrarDetalle(host) {
      if (_verFuera) { _verFuera = ''; pintar(host); cambioDeNivel(); return; }
      _abierta = null; pintar(host); cambioDeNivel();
    },
    reiniciar() { _abierta = null; _verFuera = ''; }
  };

  // Sin `register`: desde que vive dentro de Orders, no es una
  // pantalla del armazón. Quien la pinta es `mobile-orders.js`.
})();
