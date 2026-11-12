(() => {
  if (window.BarStockMobileHistory) return;

  // ── Historial de órdenes ─────────────────────────────────────────────
  //
  // No es un registro, es la respuesta a "¿me llegó lo que pedí?".
  //
  // Cada orden se cruza con las facturas de MarginEdge que ya están
  // copiadas en `marginedge_invoice_lines`, y de ahí sale su estado. Si
  // no hay facturas todavía —o si un proveedor no está en MarginEdge—
  // las órdenes salen igual, con el estado "waiting". El historial
  // funciona desde el primer día y se vuelve más útil cuando llegan los
  // datos; no depende de ellos.
  //
  // ── Esta pantalla NO ESCRIBE NADA ───────────────────────────────────
  //
  // Ni órdenes, ni inventario, ni ciclos. Todo lo que muestra se calcula
  // al leer. Un histórico que se puede reescribir deja de ser histórico,
  // y los estados derivados de un dato guardado se desincronizan del
  // dato en cuanto uno de los dos cambia.

  let _orden = null;     // la orden abierta, si hay
  let _filtro = 'all';   // all | short | waiting
  // Meses abiertos. Arranca vacío y el más reciente se abre solo: con
  // ciento y pico órdenes, desplegarlo todo es una lista infinita.
  let _abiertos = null;
  let _busca = '';
  let _datos = null;     // { ciclos: [...], porOrden: Map }

  // "El mismo nombre" (sin acentos, apóstrofes ni signos: "Bailey's" y
  // "Baileys" son el mismo producto) vive en order-receipts.js, con el
  // reparto que lo usa: una sola definición en toda la app.
  const mismoNombre = (a, b) => window.BarStockOrderReceipts.mismoNombre(a, b);

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  function money(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    return '$' + v.toFixed(2).replace(/\.00$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY };
  }

  async function locationId() {
    const P = window.BarStockParIntelligence;
    return P && P.fetchLocationId ? await P.fetchLocationId() : null;
  }

  function mesDe(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { id: 'x', txt: 'Undated' };
    return {
      id: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      txt: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    };
  }

  function dia(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  // ── Agrupar por ciclo ────────────────────────────────────────────────
  //
  // Por ciclo y no por mes: es como trabajas y como piensa el resto de
  // la app. El ciclo abierto se saca de BarStockCycle; los anteriores,
  // de las semanas que ya tienen snapshot. Sin esa lista, todo cae en
  // un único grupo y la pantalla sigue siendo legible.
  function cicloDe(iso, cortes) {
    const t = new Date(iso).getTime();
    for (let i = 0; i < cortes.length; i++) {
      if (t >= cortes[i].desde) return cortes[i];
    }
    return null;
  }

  async function cargar() {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) throw new Error('No location.');

    // Leer y repartir viven en order-receipts.js, que comparte con el
    // LIVE: los dos tienen que decir lo mismo sobre cuánto llegó.
    const RC = window.BarStockOrderReceipts;
    const { recortadas, lineas, facturas, enlaces, manuales } = await RC.leer({ url, key, locId });

    // factura -> orden a la que pertenece.
    const dueno = new Map(manuales.map(m => [String(m.order_id), String(m.vendor_order_id)]));

    // El arranque del ciclo abierto. Se lee aquí arriba y no más abajo
    // —donde se armaban los cortes— porque el enlace automático lo
    // necesita antes: es su frontera, lo que deja el pasado fuera.
    // Calcularlo dos veces sería tener dos respuestas posibles a
    // "cuándo empezó esta semana".
    const C = window.BarStockCycle;
    const ini = C && C.startedAt && C.startedAt();

    // ── Y las que decide la app sola ────────────────────────────────
    //
    // El reparto de abajo va LÍNEA POR LÍNEA: el primero que pide un
    // recibo se lo queda, recorriendo las órdenes de la más nueva a la
    // más vieja. Por eso registrar una orden nueva le quita los
    // recibos a una anterior, y esa vuelve a decir "waiting" con la
    // factura delante.
    //
    // Esto decide, UNA sola vez, de qué orden es cada factura, y lo
    // escribe en la misma tabla del enlace a mano. A partir de ahí
    // deja de moverse: ni otra orden más nueva se lo lleva, ni se
    // recalcula al repintar.
    //
    // Tres cosas que NO hace, y las tres son deliberadas:
    //
    //   · No toca el reparto. Ni una línea de lo de abajo cambia: sólo
    //     le llegan más enlaces, que ya sabía respetar.
    //   · No mira el pasado. Sólo facturas y órdenes del ciclo
    //     abierto, porque los cerrados ya están bien y reasignarlos
    //     sería estropear lo que funciona.
    //   · No adivina. Si ninguna orden comparte suficientes productos,
    //     o si las dos mejores van empatadas, no escribe nada y esa
    //     factura se reparte como siempre.
    //
    // Si falla, no escribe y aquí no pasa nada: la pantalla sigue
    // igual que hoy.
    const A = window.BarStockInvoiceOrderAuto;
    if (A && A.escribir) {
      const nuevos = await A.escribir({
        url, key, locId,
        lineas: facturas, enlaces,
        ordenes: recortadas, lineasOrden: lineas,
        yaEnlazadas: new Set(dueno.keys()),
        desde: ini ? ini.toISOString() : ''
      });
      // Se meten en el mapa en vez de releer la tabla: acaban de
      // escribirse y ya se sabe qué dicen.
      for (const f of nuevos) dueno.set(String(f.order_id), String(f.vendor_order_id));
    }

    const recibos = RC.recibosDe(facturas, enlaces, dueno);

    // Cortes de ciclo, del más reciente al más viejo. `C` e `ini` se
    // leyeron arriba: el enlace automático los necesitaba antes.
    const cortes = [];
    if (ini) cortes.push({ id: 'abierto', titulo: 'This cycle', desde: ini.getTime() });

    // El reparto, línea por línea (order-receipts.js: por qué va de la
    // orden más nueva a la más vieja y por qué el suelo es el ciclo).
    const repartido = RC.repartir({ recortadas, lineas, recibos, inicioCiclo: ini ? ini.getTime() : 0 });

    const detalles = recortadas.map(o => {
      const items = repartido.get(String(o.id)) || [];

      const conDato = items.some(i => i.recibido > 0);
      const cortos = items.filter(i => i.recibido < i.pedido).length;
      const sobras = items.filter(i => i.recibido > i.pedido).length;

      const estado = !conDato ? 'waiting'
                   : cortos ? 'short'
                   : sobras ? 'over'
                   : 'ok';

      const pedidoDinero   = items.reduce((s, i) => s + i.pedido * i.precio, 0);
      // Lo que costó de verdad. `i.dinero` ya viene de la factura
      // cuando la hay.
      const recibidoDinero = items.reduce((s, i) => s + i.dinero, 0);
      // ¿Alguna línea trae precio de factura? Si no, lo que se enseña
      // es una estimación con tus precios y hay que decirlo.
      const precioReal = items.some(i => i.conPrecio);

      return {
        // DOS ids, y no son intercambiables:
        //   `id`     es la fila de `vendor_orders`, y sirve para unir
        //            con sus líneas en esta misma pantalla.
        //   `appId`  es `app_order_id`, el que genera la app. Es el que
        //            usan `state.orderHistory`, `deleteOrderFromSupabase`
        //            y el escritorio entero.
        //
        // Usar el primero donde va el segundo hacía que "reabrir" no
        // encontrara nunca la orden y dijera que era demasiado vieja.
        id: String(o.id),
        appId: String(o.app_order_id || ''),
        vendor: o.vendor || '',
        po: o.po_number || '',
        fecha: o.created_at,
        // Cuándo llega (033). Null en los pedidos de antes, o si el
        // proveedor no tenía horario: entonces no se dice nada.
        llegada: o.arrives_at || null,
        // Colocado en el ciclo anterior y llega en éste: lleva la nota.
        delAnterior: !!(ini && o.arrives_at && new Date(o.created_at).getTime() < ini.getTime() &&
          new Date(o.arrives_at).getTime() >= ini.getTime()),
        items, estado, cortos, sobras,
        pedidoDinero, recibidoDinero, precioReal,
        factura: (items.find(i => i.factura) || {}).factura || '',
        // Cada pedido es del ciclo en el que LLEGA (Axel, 2026-11-11):
        // uno colocado el jueves para el jueves siguiente sale en el
        // ciclo de su llegada. Sin llegada, el de siempre: su fecha.
        ciclo: cicloDe(o.arrives_at || o.created_at, cortes)
      };
    });

    _datos = { ordenes: detalles };
    return _datos;
  }

  // ── Pintar la lista ──────────────────────────────────────────────────

  const ETIQ = {
    ok:      ['all in',  'bien'],
    short:   ['short',   'corto'],
    over:    ['over',    'sobra'],
    waiting: ['waiting', 'espera'],
    coming:  ['coming',  'viene']
  };

  // ── La llegada en la tarjeta (Axel, 2026-11-11, opción A) ────────────
  //
  // Antes de su hora de llegada un pedido "viene": todavía no se espera
  // su factura, y decir "waiting" lo mezclaba con los que ya llegaron y
  // esperan. Su línea dice cuándo llega. Llegado y sin factura, vuelve a
  // "waiting" y la línea dice cuándo llegó. Con factura, nada: el
  // estado ya lo dice todo.
  const VD = () => window.BarStockVendorDelivery;
  const fechaLlegada = (iso) => VD() && VD().fecha ? VD().fecha(iso) : dia(iso);
  const viene = (o, ahora) => o.estado === 'waiting' && !!o.llegada &&
    new Date(o.llegada).getTime() > (ahora == null ? Date.now() : ahora);

  function etiqueta(o) {
    const [txt, cls] = viene(o) ? ETIQ.coming : (ETIQ[o.estado] || ETIQ.waiting);
    const n = o.estado === 'short' ? o.cortos : o.estado === 'over' ? o.sobras : 0;
    return '<span class="m-hs m-hs-' + cls + '">' +
           (n ? n + ' ' : '') + esc(txt) + '</span>';
  }

  function fila(o, i) {
    // El dinero que se enseña es lo RECIBIDO cuando ya se sabe. Una
    // orden no puede vivir diciendo que gastaste 1.422 si llegaron
    // 1.208.
    const importe = o.estado === 'waiting' ? o.pedidoDinero : o.recibidoDinero;
    return '<button type="button" class="m-hcard" data-o="' + i + '">' +
      '<span class="m-hcard-l">' +
        '<span class="m-hcard-v">' + esc(o.vendor) + '</span>' +
        '<span class="m-hcard-m">' +
          // Mientras viene, la fecha que importa es la de llegada, en
          // su línea; la de colocación sólo estorbaría.
          (o.po ? esc(o.po) + ' · ' : '') + (viene(o) ? '' : esc(dia(o.fecha)) + ' · ') +
          o.items.length + ' item' + (o.items.length === 1 ? '' : 's') +
        '</span>' +
        (o.llegada && viene(o)
          ? '<span class="m-hcard-arr">Arrives ' + esc(fechaLlegada(o.llegada)) + '</span>'
          : o.llegada && o.estado === 'waiting'
            ? '<span class="m-hcard-m">Arrived ' + esc(fechaLlegada(o.llegada)) + '</span>'
            : '') +
        (o.delAnterior
          ? '<span class="m-hcard-leg">Placed ' + esc(dia(o.fecha)) + ' \u00b7 last cycle</span>'
          : '') +
      '</span>' +
      '<span class="m-hcard-r">' +
        '<span class="m-hcard-a">' + money(importe) + '</span>' +
        etiqueta(o) +
      '</span></button>';
  }

  function pintarLista(host) {
    const todas = _datos ? _datos.ordenes : [];

    if (!todas.length) {
      // Sin título: lo pone el contenedor de Orders.
      host.innerHTML = '<div class="m-hsub">Orders you place show up here ' +
        'with what actually arrived against them.</div>';
      return;
    }

    // Las cuentas de las pastillas respetan la búsqueda: con "titos"
    // escrito, "Short · 3" son tres órdenes de Tito's, no tres del
    // total. Un contador que ignora el filtro de al lado miente.
    const enBusca = todas.filter(o => {
      if (!_busca.trim()) return true;
      const t = _busca.trim().toUpperCase();
      return String(o.vendor).toUpperCase().includes(t) ||
             o.items.some(i => String(i.item).toUpperCase().includes(t));
    });
    const cuenta = {
      all: enBusca.length,
      short: enBusca.filter(o => o.estado === 'short').length,
      // Lo que todavía viene no "espera" factura: la tarjeta dice
      // "coming", y el contador no puede decir otra cosa.
      waiting: enBusca.filter(o => o.estado === 'waiting' && !viene(o)).length
    };
    // Los nombres de los filtros, para el botón y para la hoja.
    const NOMBRE = { all: 'All', short: 'Short', waiting: 'Waiting' };

    // ── Buscar por proveedor O por producto ───────────────────────
    //
    // Lo segundo es lo que de verdad usas: "¿cuándo pedí Tito's y
    // cuánto llegó?". Buscar sólo por proveedor obligaría a abrir
    // órdenes una por una hasta dar con la que lo lleva.
    const q = _busca.trim().toUpperCase();
    const coincide = o => {
      if (!q) return true;
      if (String(o.vendor).toUpperCase().includes(q)) return true;
      return o.items.some(i => String(i.item).toUpperCase().includes(q));
    };

    const pasa = o => (_filtro === 'all' || (o.estado === _filtro && !(_filtro === 'waiting' && viene(o)))) && coincide(o);
    const visibles = todas.filter(pasa);

    const importe = o => o.estado === 'waiting' ? o.pedidoDinero : o.recibidoDinero;

    // El ciclo abierto va suelto arriba: es lo que está pasando ahora y
    // no debería esconderse detrás de un mes.
    const abiertas = visibles.filter(o => o.ciclo && o.ciclo.id === 'abierto');
    const resto = visibles.filter(o => !o.ciclo || o.ciclo.id !== 'abierto');

    // ── El resto, por mes y plegado ────────────────────────────────
    //
    // Con ciento y pico órdenes una lista continua no se puede leer ni
    // recorrer. Por mes y cerrados, salvo el más reciente: así la
    // pantalla cabe de un vistazo y bajar a marzo son dos toques, no
    // treinta segundos de scroll.
    const meses = [];
    const porMes = new Map();
    for (const o of resto) {
      const m = mesDe(o.fecha);
      if (!porMes.has(m.id)) { porMes.set(m.id, { ...m, ordenes: [] }); meses.push(m.id); }
      porMes.get(m.id).ordenes.push(o);
    }
    if (_abiertos === null) {
      _abiertos = new Set(meses.length ? [meses[0]] : []);
    }

    const M = window.BarStockMobile;

    // Sin subtítulo: lo pone el contenedor de Orders, justo encima del
    // segmentado. Decía casi lo mismo —"what you sent, and what
    // actually arrived"— y salía dos veces seguidas.
    // ── La misma fila que Inventory ─────────────────────────────────
    //
    // Buscador y botón de filtros en una línea. Las tres pastillas
    // —All, Short, Waiting— se mudan dentro de ese botón: ocupaban un
    // renglón entero para una elección que se hace de vez en cuando.
    //
    // El botón se enciende cuando hay un filtro puesto, para que no se
    // pueda estar filtrando sin verlo.
    let html =
      '<div class="m-inv-bar2">' +
        '<label class="m-searchbar on m-hfind">' +
          '<i class="ti ti-search" aria-hidden="true"></i>' +
          '<input type="search" id="mhQ" placeholder="Vendor or product\u2026" ' +
            'autocomplete="off" value="' + esc(_busca) + '">' +
        '</label>' +
        '<button type="button" class="m-adj' + (_filtro === 'all' ? '' : ' on') + '" ' +
          'id="mhAdj" aria-label="Filters">' +
          '<i class="ti ti-adjustments-horizontal" aria-hidden="true"></i>' +
        '</button>' +
      '</div>' +
      // Cuando hay filtro puesto se dice CUÁL, y se puede quitar sin
      // abrir la hoja. Un icono encendido avisa de que algo está
      // filtrando, pero no de qué.
      (_filtro === 'all' ? ''
        : '<button type="button" class="m-hfiltro" id="mhClr">' +
            esc(NOMBRE[_filtro] || _filtro) + ' &middot; ' + cuenta[_filtro] +
            ' <i class="ti ti-x" aria-hidden="true"></i></button>');

    if (abiertas.length) {
      const gasto = abiertas.reduce((t, o) => t + importe(o), 0);
      html += '<div class="m-lab">This cycle · ' + money(gasto) + '</div>' +
              abiertas.map(o => fila(o, todas.indexOf(o))).join('');
    }

    for (const id of meses) {
      const m = porMes.get(id);
      const abierto = _abiertos.has(id);
      const gasto = m.ordenes.reduce((t, o) => t + importe(o), 0);
      const cortos = m.ordenes.filter(o => o.estado === 'short').length;

      html +=
        '<button type="button" class="m-hmes' + (abierto ? ' on' : '') +
          '" data-m="' + esc(id) + '">' +
          '<i class="ti ti-chevron-right m-hmes-v" aria-hidden="true"></i>' +
          '<span class="m-hmes-t">' + esc(m.txt) + '</span>' +
          '<span class="m-hmes-m">' + m.ordenes.length + ' · ' + money(gasto) +
            (cortos ? ' · ' + cortos + ' short' : '') +
          '</span>' +
        '</button>' +
        (abierto
          ? '<div class="m-hmes-c">' +
            m.ordenes.map(o => fila(o, todas.indexOf(o))).join('') + '</div>'
          : '');
    }

    if (!abiertas.length && !meses.length) {
      html += '<div class="m-empty">' +
        (q ? 'No order has that vendor or product.' : 'Nothing with that status.') +
        '</div>';
    }

    host.innerHTML = html;

    // Buscar abre todos los meses: si lo que buscas está en marzo, no
    // sirve de nada que marzo siga plegado.
    const inp = host.querySelector('#mhQ');
    if (inp) {
      inp.oninput = () => {
        _busca = inp.value;
        // Al borrar la búsqueda se vuelve al estado de siempre: sólo
        // el mes más reciente abierto.
        if (_busca.trim()) _abiertos = new Set(meses); else _abiertos = null;
        pintarLista(host);
        const n = host.querySelector('#mhQ');
        if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
      };
    }


    // Las pastillas ya no están en la pantalla: viven en el cajón.
    const aj = host.querySelector('#mhAdj');
    if (aj) aj.onclick = () => cajon(host, cuenta);
    const clr = host.querySelector('#mhClr');
    if (clr) clr.onclick = () => { _filtro = 'all'; pintarLista(host); };

    host.querySelectorAll('[data-m]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.m;
        if (_abiertos.has(id)) _abiertos.delete(id); else _abiertos.add(id);
        pintarLista(host);
      };
    });
    host.querySelectorAll('[data-o]').forEach(b => {
      b.onclick = () => { _orden = todas[Number(b.dataset.o)]; pintar(host); cambioDeNivel(); };
    });
  }

  // ── Pintar el detalle ────────────────────────────────────────────────

  // El encabezado lo arma el armazón: chevron a la izquierda del
  // título, en la misma fila. Si por lo que sea no estuviera, se cae
  // a un título suelto en vez de dejar la pantalla sin cabecera.
  const cab = (o) => (window.BarStockMobile && window.BarStockMobile.cabecera)
    ? window.BarStockMobile.cabecera(o)
    : '<div class="m-inv-t">' + esc(o.titulo || '') + '</div>';
  // Con el nombre en la banda, la página no tiene chevron: el atrás es
  // el botón de la banda (como Settings).
  const volverCon = (host, fn) => {
    const M = window.BarStockMobile;
    if (!M) return false;
    if (M.alVolver && M.alVolver(host, fn)) return true;
    if (M.alVolverBanda) { M.alVolverBanda(fn); return true; }
    return false;
  };

  function pintarDetalle(host) {
    const o = _orden;
    const faltan = o.items.filter(i => i.recibido < i.pedido);

    // ── Dos causas distintas, dos cuentas distintas ───────────────
    //
    // Desde que "Received" sale de la factura, la resta entre pedido y
    // recibido mezcla dos cosas: mercancía que no llegó y mercancía
    // que llegó a otro precio. Decir que todo "never arrived" acusa a
    // la segunda de ser la primera.
    //
    // Lo que falta se cuenta con TU precio: es lo que no llegó, y de
    // lo que no llegó no hay factura.
    const diferencia = faltan.reduce(
      (s, i) => s + (i.pedido - i.recibido) * i.precio, 0);

    // ── Los que llegaron a un precio distinto del de tu CATÁLOGO ─────
    //
    // Se comparaba con `i.precio`, que es el precio de la línea de la
    // orden: lo que valía la botella el día que se pidió, congelado. El
    // botón de abajo cambia el catálogo, no la orden, así que ese número
    // no se movía nunca y la tarjeta seguía pidiendo lo mismo después de
    // actualizar, cada vez que se volvía a entrar.
    //
    // La pregunta es "¿tu catálogo dice lo que dice esta factura?", y se
    // contesta contra el catálogo de ahora, igual que la campana
    // (`calcularPrecios` en marginedge-purchases.js).
    //
    // Del catálogo se toma también el NOMBRE: el PATCH busca por nombre
    // exacto, y la orden puede escribirlo con otro apóstrofo. Con el de la
    // orden la fila no aparecía y no se actualizaba nada, sin error.
    //
    // Un artículo que ya no está en el catálogo no se propone: no hay
    // precio que cambiar.
    const CAMBIO_MIN = 0.005;
    const master = (window.state && window.state.master) || [];
    const cambios = o.items
      .filter(i => i.recibido > 0 && i.precioFactura > 0)
      .map(i => {
        const fila = master.find(r => mismoNombre(r.item, i.item));
        return fila ? {
          item: fila.item,
          actual: Number(fila.value) || 0,
          // Al céntimo, como la campana: es lo que se va a escribir.
          factura: Math.round(i.precioFactura * 100) / 100
        } : null;
      })
      .filter(c => c && Math.abs(c.factura - c.actual) > CAMBIO_MIN);

    const lineas = o.items.map(i => {
      const mal = i.recibido !== i.pedido;
      return '<div class="m-hln' + (mal ? ' mal' : '') + '">' +
        '<span class="m-hln-n">' + esc(i.item) + '</span>' +
        '<span class="m-hln-q">' + i.pedido +
          '<em>→</em>' +
          (o.estado === 'waiting' ? '—' : i.recibido) +
        '</span></div>';
    }).join('');

    // ── El nombre en el header, los dos botones pegados ──────────
    //
    // Axel, 2026-11-12, sobre su captura ("la misma historia para Sent
    // e Invoices"): el proveedor ocupa el sitio del logo y el botón de
    // la izquierda pasa a ser atrás, como Settings. Resend / Reopen son
    // lo primero y se quedan pegados bajo el header desde que entras; la
    // línea del PO va debajo y se va con la lista (eligió esa de tres).
    //
    // Una orden vieja no tiene botones, sólo una nota: ésa no se pega.
    // Sin banda (fuera del armazón) queda la cabecera de antes.
    const M = window.BarStockMobile;
    const sub = (o.po ? 'PO ' + o.po + ' · ' : '') + 'sent ' + dia(o.fecha) +
                (o.factura ? ' · invoice ' + o.factura : '');
    const enBanda = !!(M && M.enBanda && M.enBanda(o.vendor));
    const conBotones = !!laDelEscritorio(o.appId);
    host.innerHTML =
      (enBanda
        ? acciones(o, conBotones) +
          '<div class="m-hsub">' + esc(sub) + '</div>'
        : cab({ volverA: 'Order history', titulo: o.vendor, sub }) + acciones(o)) +

      '<div class="m-hlist">' + lineas + '</div>' +

      (o.estado === 'waiting'
        ? '<div class="m-hnote espera">No invoice has come through for this order ' +
          'yet, so the figure below is what you ordered, not what arrived.</div>'
        : faltan.length
          ? '<div class="m-hnote">' + faltan.length +
            (faltan.length === 1 ? ' item came' : ' items came') + ' up short. ' +
            money(diferencia) + ' of this order never arrived — the received ' +
            'figure below already reflects that.</div>'
          : '') +

      // ── Los precios de esta factura ────────────────────────────
      //
      // Aquí es donde se ve: tienes la orden delante y el papel al
      // lado. La campana ya avisa de todos los precios del ciclo,
      // pero esto es el de ESTA entrega, y aprobarlo aquí ahorra ir a
      // buscarlo.
      //
      // Se aplica con `aplicarPrecios` del módulo de compras, el
      // mismo que usa la campana: una sola forma de escribir un
      // precio.
      (cambios.length
        ? '<div class="m-hprec">' +
            '<div class="m-hprec-h">' + cambios.length +
              (cambios.length === 1 ? ' price is different' : ' prices are different') +
              ' on this invoice</div>' +
            cambios.map(c =>
              '<div class="m-hprec-l"><span class="n">' + esc(c.item) + '</span>' +
                '<span class="v ' + (c.factura > c.actual ? 'up' : 'dn') + '">' +
                  money(c.actual) + ' → <b>' + money(c.factura) + '</b></span>' +
              '</div>').join('') +
            '<button type="button" class="m-hprec-go" id="mhPrec">Update ' +
              cambios.length + (cambios.length === 1 ? ' price' : ' prices') + '</button>' +
            '<div class="m-hprec-n">Changes what each bottle is worth from now on. ' +
              'It does not touch this order.</div>' +
          '</div>'
        : '') +

      '<div class="m-htot"><span>Ordered</span><b>' + money(o.pedidoDinero) + '</b></div>' +
      (o.estado !== 'waiting'
        ? '<div class="m-htot"><span>Received' +
          // Sin precio de factura, lo que se enseña es una estimación
          // con los tuyos. Decirlo: un número que parece dato y es
          // cálculo es peor que no darlo.
          (o.precioReal ? '' : ' <small>at your prices</small>') +
          '</span><b>' + money(o.recibidoDinero) + '</b></div>'
        : '');

    volverCon(host, () => { _orden = null; pintar(host); cambioDeNivel(); });
    engancharAcciones(host, o);
    // En cada pintado: confirmar Reopen repinta aquí sin pasar por el
    // marco de Orders, y el bloque es otro elemento.
    const fijo = host.querySelector(':scope > .m-det-fijo');
    if (fijo && window.BarStockBandDock && window.BarStockBandDock.fijar) window.BarStockBandDock.fijar(fijo);

    const bp = host.querySelector('#mhPrec');
    if (bp) bp.onclick = async () => {
      const P = window.BarStockMarginEdgePurchases;
      if (!P || !P.aplicarPrecios) return;
      bp.disabled = true;
      try {
        const r = await P.aplicarPrecios(
          cambios.map(c => ({ item: c.item, precio: c.factura, antes: c.actual,
                              factura: o.factura, vendor: o.vendor })),
          (n, tot) => { bp.textContent = 'Updating… ' + n + ' of ' + tot; });
        bp.textContent = r.ok + ' updated';
        // Se relee el catálogo y se repinta la orden: así la tarjeta se
        // va en cuanto el catálogo dice lo mismo que la factura, sin
        // salir y volver a entrar.
        //
        // `recargar` y no `refresh`: el módulo exporta `recargar`, y
        // `refresh` no existe. Como la llamada iba dentro de un `if`, no
        // fallaba: no hacía nada.
        const RT = window.BarStockInventoryRealtime;
        if (RT && RT.recargar) {
          try { await RT.recargar(); } catch (e) { console.warn('[historial] no se pudo releer el catálogo', e); }
        }
        if (_orden === o) pintarDetalle(host);
        // Y la campana deja de pedir lo que ya se hizo.
        if (window.BarStockMobileNotif) window.BarStockMobileNotif.refrescar();
      } catch (e) {
        // El botón vuelve. Un "Updating…" eterno no dice si funcionó.
        bp.disabled = false;
        bp.textContent = 'Update ' + cambios.length + ' prices';
        if (window.BarStockToast) window.BarStockToast.show(String(e && e.message || e));
      }
    };
  }

  // ── El cajón de filtros ──────────────────────────────────────────
  //
  // Misma forma que el de Inventory: una hoja desde abajo con las
  // opciones en pastillas. No se inventa otro patrón — con dos, el día
  // que uno cambie el otro se queda viejo.
  function cajon(host, cuenta) {
    const NOMBRE = { all: 'All', short: 'Short', waiting: 'Waiting' };
    const PIE = {
      all: 'Every order this cycle and before.',
      short: 'Something you ordered never arrived.',
      waiting: 'No invoice has come through yet.'
    };

    const hoja_ = document.createElement('div');
    hoja_.className = 'm-sheet';
    // El id no es decoración: las reglas de la hoja se apoyan en él
    // para ganarle en especificidad al radio de app.css.
    hoja_.id = 'mSheet';
    hoja_.innerHTML =
      '<div class="m-sheet-bg"></div>' +
      '<div class="m-sheet-box" role="dialog" aria-label="Filters">' +
        '<div class="m-sheet-grip"></div>' +
        '<div class="m-sheet-t">Show</div>' +
        ['all', 'short', 'waiting'].map(id =>
          '<button type="button" class="m-sheet-op' + (_filtro === id ? ' on' : '') + '" ' +
            'data-f="' + id + '">' +
            '<span>' + NOMBRE[id] + ' &middot; ' + cuenta[id] + '<br>' +
            '<small>' + PIE[id] + '</small></span>' +
            (_filtro === id ? '<i class="ti ti-check" aria-hidden="true"></i>' : '') +
          '</button>').join('') +
      '</div>';
    document.body.appendChild(hoja_);
    // El asa de arriba dice "arrastrame para cerrar". Que lo diga
    // de verdad, y que el fondo no se mueva mientras tanto.
    if (window.BarStockSheet) window.BarStockSheet.enganchar(hoja_, () => hoja_.remove());

    const cerrar = () => hoja_.remove();
    hoja_.querySelector('.m-sheet-bg').onclick = cerrar;
    hoja_.querySelectorAll('[data-f]').forEach(b => {
      b.onclick = () => { _filtro = b.dataset.f; cerrar(); pintarLista(host); };
    });
  }

  // ── Reenviar y reabrir ───────────────────────────────────────────────
  //
  // Aquí y no en Órdenes. Una orden colocada DESAPARECE de Órdenes —sus
  // líneas dejan de estar pendientes—, así que éste es el único sitio
  // donde esa orden existe para poder tocarla.
  //
  // Sólo si sigue en `state.orderHistory`. Esa lista es la que carga el
  // escritorio desde la nube y la que tiene las líneas con la forma que
  // necesita el correo; las de esta pantalla vienen de otra consulta y
  // están cruzadas contra facturas, que es otra cosa.

  let _confirmando = false;   // el Reopen pide un segundo toque
  let _trabajando = '';       // '' | 'enviar' | 'reabrir'

  function laDelEscritorio(id) {
    const h = (window.state && window.state.orderHistory) || [];
    return h.find(x => String(x.id) === String(id)) || null;
  }

  // `fijo`: el bloque va pegado bajo el header (el detalle con su nombre
  // en la banda). La marca va en el MISMO bloque, no en una caja
  // alrededor: con caja, su margen de arriba la atravesaba y en reposo
  // los botones iban 14 px más abajo de donde se pegan (medido en
  // Chromium, 121 → 107 al primer scroll).
  function acciones(o, fijo) {
    const f = fijo ? 'm-det-fijo ' : '';
    if (!laDelEscritorio(o.appId)) {
      // Órdenes viejas que ya no están cargadas. Decirlo es mejor que
      // dos botones que fallarían al pulsarlos.
      return '<div class="m-hacc-no">This order is older than what the app keeps ' +
             'loaded. Resend it from a computer.</div>';
    }
    if (_trabajando) {
      return '<div class="' + f + 'm-hacc"><div class="m-hacc-busy">' +
        (_trabajando === 'enviar' ? 'Building the PDF and sending…' : 'Reopening…') +
        '</div></div>';
    }
    if (_confirmando) {
      return '<div class="' + f + 'm-hacc-conf">' +
        '<b>Reopen deletes this order.</b> Its lines come back to Ordering ' +
        'and the vendor keeps whatever you already sent them.' +
        '<div class="m-hacc"><button type="button" id="mhNo">Cancel</button>' +
        '<button type="button" id="mhSi" class="mal">Delete and reopen</button></div></div>';
    }
    return '<div class="' + f + 'm-hacc">' +
      '<button type="button" id="mhRe">Resend</button>' +
      '<button type="button" id="mhAbrir" class="mal">Reopen</button></div>';
  }

  function engancharAcciones(host, o) {
    const avisar = (t) => { if (window.BarStockToast) window.BarStockToast.show(t); };
    const re = host.querySelector('#mhRe');
    const ab = host.querySelector('#mhAbrir');
    const no = host.querySelector('#mhNo');
    const si = host.querySelector('#mhSi');

    if (ab) ab.onclick = () => { _confirmando = true; pintar(host); };
    if (no) no.onclick = () => { _confirmando = false; pintar(host); };

    if (re) re.onclick = async () => {
      const orden = laDelEscritorio(o.appId);
      const M = window.BarStockMobileOrders;
      if (!orden || !M || typeof M.enviarCorreo !== 'function') {
        return avisar('The order mailer is not available right now.');
      }
      let para = [];
      try {
        if (window.BarStockVendorDefaults) {
          const d = await window.BarStockVendorDefaults.getDefaults(orden.vendor);
          para = String((d && d.vendor_email) || '').split(',')
            .map(x => x.trim()).filter(Boolean);
        }
      } catch (e) {}
      if (!para.length) {
        return avisar('No saved address for ' + orden.vendor + '. Add one in Settings.');
      }

      _trabajando = 'enviar';
      pintar(host);
      try {
        const fueron = await M.enviarCorreo(orden, para);
        avisar(orden.vendor + ' order sent again to ' + fueron.join(', '));
      } catch (e) {
        avisar('It did not go out: ' + (e && e.message ? e.message : String(e)));
        console.error('[history] reenviar falló', e);
      }
      _trabajando = '';
      pintar(host);
    };

    if (si) si.onclick = async () => {
      const orden = laDelEscritorio(o.appId);
      if (typeof window.deleteOrderFromSupabase !== 'function') {
        return avisar('Not connected right now. Try again in a moment.');
      }
      _trabajando = 'reabrir';
      _confirmando = false;
      pintar(host);
      try {
        // Con el id de la APP: la función consulta por `app_order_id`.
        await window.deleteOrderFromSupabase(o.appId);
        // Devolver lo que esta orden apuntó como pedido, o Par
        // Intelligence seguiría creyendo que esas botellas se pidieron.
        // Envuelto, y comprobando que la función exista. La orden YA
        // está borrada a estas alturas: si esto lanzara, el `catch` de
        // abajo diría "no se pudo reabrir" sobre una orden que sí se
        // reabrió. Es el mismo fallo que tuvimos con el correo.
        try {
          const PI = window.BarStockParIntelligence;
          if (orden && PI && typeof PI.reverseSnapshotOrdered === 'function') {
            Promise.resolve(PI.reverseSnapshotOrdered(orden))
              .catch(e => console.warn('[ParIntelligence] reverse', e));
          }
        } catch (e) { console.warn('[ParIntelligence] reverse', e); }
        if (typeof window.loadOrdersFromCloud === 'function') {
          await window.loadOrdersFromCloud();
        }
        _trabajando = '';
        _orden = null;
        _datos = null;           // la lista se relee: esta orden ya no está
        avisar((orden ? orden.vendor : 'The') + ' order reopened · its lines are back in Ordering');
        await montar(host);
        if (window.BarStockMobileOrders) window.BarStockMobileOrders.refresh();
      } catch (e) {
        _trabajando = '';
        pintar(host);
        avisar('Could not reopen it: ' + (e && e.message ? e.message : String(e)));
        console.error('[history] reabrir falló', e);
      }
    };
  }

  function pintar(host) {
    if (!host) return;
    if (_orden) pintarDetalle(host); else pintarLista(host);
  }

  // `aviso` lo pasa el contenedor de Orders. Hay que llamarlo cada vez
  // que esta sección CAMBIA DE NIVEL —abre o cierra un detalle— porque
  // es lo único que hace que el marco de arriba se entere.
  //
  // Sin esto, el detalle se pintaba dentro y el segmentado seguía
  // puesto encima: dos salidas compitiendo, una que te saca del
  // detalle y otra que te manda a otra sección.
  let _aviso = null;
  const cambioDeNivel = () => { if (_aviso) _aviso(); };

  async function montar(host, aviso) {
    if (typeof aviso === 'function') _aviso = aviso;
    // Sin título propio: lo pone el contenedor.
    host.innerHTML = '<div class="m-hsub">Reading orders…</div>';
    try {
      await cargar();
      pintar(host);
    } catch (e) {
      host.innerHTML = '<div class="m-hsub">' + esc(String(e.message || e)) + '</div>';
    }
  }

  // ── Ya no es una pantalla, es una SECCIÓN de Orders ──────────────
  //
  // El contenedor le pasa un `host` propio —un div dentro de la
  // pantalla de Orders— y esta pantalla sigue pintando `innerHTML`
  // sobre él exactamente igual que antes. No se entera de la mudanza.
  //
  // Lo que sí tiene que exponer es su estado de navegación: el
  // contenedor necesita saber si está en un detalle para esconder el
  // segmentado, y poder cerrarlo desde el gesto del borde.
  window.BarStockMobileHistory = {
    montar,
    enDetalle: () => !!_orden,
    cerrarDetalle(host) { _orden = null; pintar(host); cambioDeNivel(); },
    // Volver a entrar arranca siempre en la lista: caer dentro de la
    // orden que miraste ayer desorienta.
    reiniciar() { _orden = null; }
  };

  // Sin `register`: desde que vive dentro de Orders, no es una
  // pantalla del armazón. Quien la pinta es `mobile-orders.js`.
})();
