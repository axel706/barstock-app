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

  const PAGINA = 1000;
  const MAX_ORDENES = 300;

  let _orden = null;     // la orden abierta, si hay
  let _filtro = 'all';   // all | short | waiting
  // Meses abiertos. Arranca vacío y el más reciente se abre solo: con
  // ciento y pico órdenes, desplegarlo todo es una lista infinita.
  let _abiertos = null;
  let _busca = '';
  let _datos = null;     // { ciclos: [...], porOrden: Map }

  // ── Comparar nombres como los lee una persona ──────────────────────
  //
  // Aquí se cruzaba el nombre guardado en el vínculo con el de la
  // línea de la orden CARÁCTER POR CARÁCTER. "Bailey's Irish Cream" y
  // "Baileys Irish Cream" son el mismo producto para cualquiera y dos
  // cadenas distintas para un `!==`: la entrega no se encontraba y la
  // orden salía corta aunque hubiera llegado.
  //
  // Se usa la misma normalización que el emparejado —sin acentos, sin
  // apóstrofes, sin signos— para que una sola definición de "el mismo
  // nombre" valga en toda la app.
  function norm(x) {
    const M = window.BarStockMarginEdgeMatch;
    if (M && M._norm) { try { return M._norm(x); } catch (e) {} }
    return String(x == null ? '' : x)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/['‘’´`]/g, '')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  }
  const mismoNombre = (a, b) => norm(a) === norm(b);

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

  // PostgREST corta a 1000 filas sin avisar. Ya costó una tarde.
  async function leerTodo(url, key, ruta) {
    let todas = [];
    for (let desde = 0; desde < 40000; desde += PAGINA) {
      const r = await fetch(`${url}/rest/v1/${ruta}&limit=${PAGINA}&offset=${desde}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!r.ok) throw new Error(await r.text());
      const t = await r.json();
      if (!Array.isArray(t) || !t.length) break;
      todas = todas.concat(t);
      if (t.length < PAGINA) break;
    }
    return todas;
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

    const ordenes = await leerTodo(url, key,
      `vendor_orders?location_id=eq.${locId}` +
      `&select=id,app_order_id,vendor,po_number,created_at,subtotal,status` +
      `&order=created_at.desc`);

    const recortadas = ordenes.slice(0, MAX_ORDENES);
    const ids = recortadas.map(o => o.id).filter(Boolean);

    const lineas = ids.length ? await leerTodo(url, key,
      `vendor_order_items?vendor_order_id=in.(${ids.join(',')})` +
      `&select=vendor_order_id,item_name,quantity,unit_price&order=item_name.asc`) : [];

    // Lo recibido. Si MarginEdge no está conectado esto viene vacío y
    // todo queda en "waiting", que es la verdad: no sabemos.
    let facturas = [], enlaces = [];
    try {
      facturas = await leerTodo(url, key,
        `marginedge_invoice_lines?location_id=eq.${locId}` +
        `&select=product_id,quantity,invoice_date,invoice_number,vendor_name` +
        `&order=order_id.asc`);
      enlaces = await leerTodo(url, key,
        `marginedge_links?location_id=eq.${locId}` +
        `&select=product_id,item_name&order=product_id.asc`);
    } catch (e) { /* sin MarginEdge el historial sigue en pie */ }

    const deQuien = new Map(enlaces.map(e => [String(e.product_id), e.item_name || '']));

    // Recibido por artículo y por día. La orden reclama lo recibido
    // desde su fecha en adelante: una factura anterior pertenece a una
    // orden anterior.
    const recibos = [];
    for (const f of facturas) {
      const item = deQuien.get(String(f.product_id));
      if (!item) continue;
      recibos.push({
        item,
        qty: Number(f.quantity) || 0,
        fecha: f.invoice_date ? new Date(f.invoice_date).getTime() : 0,
        factura: f.invoice_number || ''
      });
    }

    const porOrden = new Map();
    for (const l of lineas) {
      const k = String(l.vendor_order_id);
      if (!porOrden.has(k)) porOrden.set(k, []);
      porOrden.get(k).push(l);
    }

    // Cortes de ciclo, del más reciente al más viejo.
    const C = window.BarStockCycle;
    const cortes = [];
    const ini = C && C.startedAt && C.startedAt();
    if (ini) cortes.push({ id: 'abierto', titulo: 'This cycle', desde: ini.getTime() });

    const detalles = recortadas.map(o => {
      const ls = porOrden.get(String(o.id)) || [];
      const t0 = new Date(o.created_at).getTime();

      // ── Cómo se reparte lo recibido ─────────────────────────────
      //
      // Una orden sólo reclama entregas POSTERIORES a su fecha, y cada
      // recibo se consume una sola vez: con dos órdenes del mismo
      // artículo, la primera se queda lo que llegó primero. Sin este
      // reparto, las dos dirían "completa" con una sola entrega.
      const items = ls.map(l => {
        const pedido = Number(l.quantity) || 0;
        let llegado = 0;
        let factura = '';
        for (const r of recibos) {
          if (r.usado) continue;
          if (!mismoNombre(r.item, l.item_name)) continue;
          if (r.fecha && r.fecha + 86400000 < t0) continue;
          if (llegado >= pedido) break;
          llegado += r.qty;
          if (!factura && r.factura) factura = r.factura;
          r.usado = true;
        }
        return {
          item: l.item_name || '',
          pedido,
          recibido: llegado,
          precio: Number(l.unit_price) || 0,
          factura
        };
      });

      const conDato = items.some(i => i.recibido > 0);
      const cortos = items.filter(i => i.recibido < i.pedido).length;
      const sobras = items.filter(i => i.recibido > i.pedido).length;

      const estado = !conDato ? 'waiting'
                   : cortos ? 'short'
                   : sobras ? 'over'
                   : 'ok';

      const pedidoDinero   = items.reduce((s, i) => s + i.pedido * i.precio, 0);
      const recibidoDinero = items.reduce((s, i) => s + i.recibido * i.precio, 0);

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
        items, estado, cortos, sobras,
        pedidoDinero, recibidoDinero,
        factura: (items.find(i => i.factura) || {}).factura || '',
        ciclo: cicloDe(o.created_at, cortes)
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
    waiting: ['waiting', 'espera']
  };

  function etiqueta(o) {
    const [txt, cls] = ETIQ[o.estado] || ETIQ.waiting;
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
          (o.po ? esc(o.po) + ' · ' : '') + esc(dia(o.fecha)) +
          ' · ' + o.items.length + ' item' + (o.items.length === 1 ? '' : 's') +
        '</span>' +
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
      waiting: enBusca.filter(o => o.estado === 'waiting').length
    };
    const chip = (id, txt) =>
      '<button type="button" class="m-hchip' + (_filtro === id ? ' on' : '') +
      '" data-f="' + id + '">' + txt + ' · ' + cuenta[id] + '</button>';

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

    const pasa = o => (_filtro === 'all' || o.estado === _filtro) && coincide(o);
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

    let html =
      '<div class="m-hsub">What you sent, and what actually arrived.</div>' +
      '<label class="m-searchbar m-hfind">' +
        '<i class="ti ti-search" aria-hidden="true"></i>' +
        '<input type="search" id="mhQ" placeholder="Vendor or product\u2026" ' +
          'autocomplete="off" value="' + esc(_busca) + '">' +
      '</label>' +
      '<div class="m-hchips">' + chip('all', 'All') + chip('short', 'Short') +
        chip('waiting', 'Waiting') + '</div>';

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


    host.querySelectorAll('[data-f]').forEach(b => {
      b.onclick = () => { _filtro = b.dataset.f; pintarLista(host); };
    });
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
  const volverCon = (host, fn) => {
    if (window.BarStockMobile && window.BarStockMobile.alVolver) {
      return window.BarStockMobile.alVolver(host, fn);
    }
  };

  function pintarDetalle(host) {
    const o = _orden;
    const faltan = o.items.filter(i => i.recibido < i.pedido);
    const diferencia = o.pedidoDinero - o.recibidoDinero;

    const lineas = o.items.map(i => {
      const mal = i.recibido !== i.pedido;
      return '<div class="m-hln' + (mal ? ' mal' : '') + '">' +
        '<span class="m-hln-n">' + esc(i.item) + '</span>' +
        '<span class="m-hln-q">' + i.pedido +
          '<em>→</em>' +
          (o.estado === 'waiting' ? '—' : i.recibido) +
        '</span></div>';
    }).join('');

    host.innerHTML =
      cab({
        volverA: 'Order history',
        titulo: o.vendor,
        sub: (o.po ? 'PO ' + o.po + ' · ' : '') + 'sent ' + dia(o.fecha) +
             (o.factura ? ' · invoice ' + o.factura : '')
      }) +

      acciones(o) +

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

      '<div class="m-htot"><span>Ordered</span><b>' + money(o.pedidoDinero) + '</b></div>' +
      (o.estado !== 'waiting'
        ? '<div class="m-htot"><span>Received</span><b>' + money(o.recibidoDinero) + '</b></div>'
        : '');

    volverCon(host, () => { _orden = null; pintar(host); cambioDeNivel(); });
    engancharAcciones(host, o);
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

  function acciones(o) {
    if (!laDelEscritorio(o.appId)) {
      // Órdenes viejas que ya no están cargadas. Decirlo es mejor que
      // dos botones que fallarían al pulsarlos.
      return '<div class="m-hacc-no">This order is older than what the app keeps ' +
             'loaded. Resend it from a computer.</div>';
    }
    if (_trabajando) {
      return '<div class="m-hacc"><div class="m-hacc-busy">' +
        (_trabajando === 'enviar' ? 'Building the PDF and sending…' : 'Reopening…') +
        '</div></div>';
    }
    if (_confirmando) {
      return '<div class="m-hacc-conf">' +
        '<b>Reopen deletes this order.</b> Its lines come back to Ordering ' +
        'and the vendor keeps whatever you already sent them.' +
        '<div class="m-hacc"><button type="button" id="mhNo">Cancel</button>' +
        '<button type="button" id="mhSi" class="mal">Delete and reopen</button></div></div>';
    }
    return '<div class="m-hacc">' +
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
