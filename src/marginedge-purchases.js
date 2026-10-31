(() => {
  if (window.BarStockMarginEdgePurchases) return;

  // ── Qué entró, según MarginEdge ─────────────────────────────────────
  //
  // Cruza las líneas de factura guardadas con los emparejados y las
  // agrupa por artículo del estante. Es la vista previa del paso 3: lo
  // que las facturas dirían que entró, antes de que nada escriba en el
  // inventario.
  //
  // Esta pantalla NO escribe. Y no es prudencia de más: el número que
  // sale de aquí alimenta `used = inicial + recibido − final`, que es
  // de donde salen la varianza y la pérdida en dinero. Un error aquí no
  // se nota mirando, se nota tres meses después cuando las cifras dejan
  // de tener sentido.
  //
  // ── Lo que todavía no se puede resolver ────────────────────────────
  //
  // Una línea dice `quantity: 2` y `packagingId: 12345`, y MarginEdge no
  // expone ninguna tabla que diga qué es ese empaque. Dos botellas y dos
  // cajas de doce son el mismo número en pantalla y una diferencia de
  // 1200 % en el estante. Mientras un empaque no esté definido, su
  // cantidad se enseña en "unidades de compra" y se marca; convertirla a
  // botellas a ojo sería inventarse el dato.

  const PAGINA = 1000;
  const MAX_FILAS = 60000;

  let _filas = null;

  // La misma normalización que el emparejado: "Bailey's Irish Cream"
  // y "Baileys Irish Cream" son el mismo producto para cualquiera y
  // dos cadenas distintas para un `!==`. Comparar en crudo hacía que
  // una entrega no se encontrara y la orden saliera corta.
  function norm(x) {
    const M = window.BarStockMarginEdgeMatch;
    if (M && M._norm) { try { return M._norm(x); } catch (e) {} }
    return String(x == null ? '' : x)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/['\u2018\u2019\u00b4`]/g, '')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  }
  const mismoNombre = (a, b) => norm(a) === norm(b);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY };
  }

  async function locationId() {
    const P = window.BarStockParIntelligence;
    return P && P.fetchLocationId ? await P.fetchLocationId() : null;
  }

  // PostgREST corta a 1000 filas y no avisa. Ya nos costó una tarde.
  async function leerTodo(url, key, ruta) {
    let todas = [];
    for (let desde = 0; desde < MAX_FILAS; desde += PAGINA) {
      const r = await fetch(`${url}/rest/v1/${ruta}&limit=${PAGINA}&offset=${desde}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!r.ok) throw new Error(await r.text());
      const trozo = await r.json();
      if (!Array.isArray(trozo) || !trozo.length) break;
      todas = todas.concat(trozo);
      if (trozo.length < PAGINA) break;
    }
    return todas;
  }

  function dinero(n) {
    return '$' + (Math.round((Number(n) || 0) * 100) / 100)
      .toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  async function cargar(desde, hasta) {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) throw new Error('No location.');

    const filtro = [`location_id=eq.${locId}`];
    if (desde) filtro.push(`invoice_date=gte.${desde}`);
    if (hasta) filtro.push(`invoice_date=lte.${hasta}`);

    const [lineas, enlaces] = await Promise.all([
      leerTodo(url, key,
        `marginedge_invoice_lines?${filtro.join('&')}` +
        `&select=product_id,vendor_item_name,packaging_id,quantity,line_price,invoice_date,vendor_name` +
        `&order=order_id.asc`),
      leerTodo(url, key,
        `marginedge_links?location_id=eq.${locId}&select=product_id,item_name&order=product_id.asc`)
    ]);

    const deQuien = new Map();
    for (const e of enlaces) deQuien.set(String(e.product_id), e.item_name || '');

    // Por artículo del estante. Varios productos pueden caer en el
    // mismo —750 ml y 1.5 L del mismo vino—, que es justo para lo que
    // se hizo la tabla de vínculos.
    const porItem = new Map();
    let sueltas = 0, sueltasDinero = 0;

    for (const l of lineas) {
      const item = deQuien.get(String(l.product_id));
      if (!item) {
        sueltas++;
        sueltasDinero += Number(l.line_price) || 0;
        continue;
      }
      if (!porItem.has(item)) {
        porItem.set(item, { item, unidades: 0, dinero: 0, lineas: 0,
                            empaques: new Set(), vendors: new Set(), ultima: null });
      }
      const a = porItem.get(item);
      a.unidades += Number(l.quantity) || 0;
      a.dinero += Number(l.line_price) || 0;
      a.lineas++;
      if (l.packaging_id) a.empaques.add(String(l.packaging_id));
      if (l.vendor_name) a.vendors.add(l.vendor_name);
      if (l.invoice_date && (!a.ultima || l.invoice_date > a.ultima)) a.ultima = l.invoice_date;
    }

    _filas = Array.from(porItem.values()).sort((a, b) => b.dinero - a.dinero);
    return {
      lineas: lineas.length, enlaces: enlaces.length,
      articulos: _filas.length, sueltas, sueltasDinero
    };
  }

  function pintar(info, desde, hasta) {
    const host = document.getElementById('mepBody');
    if (!host) return;

    if (!info.lineas) {
      host.innerHTML = '<div class="mem-empty"><b>No invoice lines saved for that range.</b><br>' +
        'Go back to Integrations, set the dates and press <b>Sync invoices</b>.</div>';
      return;
    }

    const total = _filas.reduce((s, f) => s + f.dinero, 0);

    const cab =
      '<div class="mem-leg" style="margin-bottom:14px">' +
        '<span><b>' + info.lineas + '</b> invoice lines</span>' +
        '<span><b>' + info.articulos + '</b> of your items</span>' +
        '<span><b>' + dinero(total) + '</b> matched to the shelf</span>' +
      '</div>' +
      (info.sueltas
        ? '<div class="mem-note"><b>' + info.sueltas + '</b> lines (' +
          dinero(info.sueltasDinero) + ') are for products not matched to any item ' +
          'of yours. Most will be food and paper — but if a bottle is in there, ' +
          'match it in <b>Match products</b> and come back.</div>'
        : '');

    const filas = _filas.map(f =>
      '<div class="mem-row">' +
        '<div class="mem-mine"><b>' + esc(f.item) + '</b><span>' +
          esc(Array.from(f.vendors).slice(0, 2).join(' · ') || 'No vendor') +
          (f.ultima ? ' · last ' + esc(f.ultima) : '') +
        '</span></div>' +
        '<div class="mep-nums">' +
          '<div class="mep-n"><b>' + (Math.round(f.unidades * 100) / 100) + '</b>' +
            '<span>purchase units</span></div>' +
          '<div class="mep-n"><b>' + dinero(f.dinero) + '</b>' +
            '<span>' + f.lineas + ' line' + (f.lineas === 1 ? '' : 's') + '</span></div>' +
        '</div>' +
      '</div>').join('');

    host.innerHTML = cab + filas +
      '<div class="mem-note" style="margin-top:14px">' +
      '<b>These are purchase units, not bottles.</b> A line that says 2 might be two ' +
      'bottles or two cases of twelve, and MarginEdge has no endpoint that says which. ' +
      'Nothing is written to your inventory until each packaging is confirmed — ' +
      'that is the next step.</div>';
  }

  async function abrir() {
    const host = document.getElementById('mepBody');
    if (host) host.innerHTML = '<div class="mem-empty">Reading saved invoices…</div>';

    const d = document.getElementById('mepDesde');
    const h = document.getElementById('mepHasta');
    const desde = d && d.value, hasta = h && h.value;

    try {
      const info = await cargar(desde, hasta);
      pintar(info, desde, hasta);
    } catch (e) {
      if (host) host.innerHTML = '<div class="mem-empty">' + esc(String(e.message || e)) + '</div>';
    }
  }

  function montar() {
    const cont = document.getElementById('mepFechas');
    if (cont && cont.dataset.listo !== '1') {
      const hoy = new Date();
      const hace30 = new Date(hoy.getTime() - 30 * 86400000);
      const iso = x => x.toISOString().slice(0, 10);
      cont.dataset.listo = '1';
      cont.innerHTML =
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">' +
        '<input type="date" id="mepDesde" value="' + iso(hace30) + '">' +
        '<span class="small muted">to</span>' +
        '<input type="date" id="mepHasta" value="' + iso(hoy) + '">' +
        '<button type="button" id="mepVer" class="ui-control">Show</button>' +
        '<button type="button" id="mepRec" class="ui-control">Ordered vs received</button>' +
        '<button type="button" id="mepPrec" class="ui-control">Prices</button>' +
        '<button type="button" id="mepHist" class="ui-control">Price changes</button>' +
        '<button type="button" id="mepPrev" class="ui-control">Apply to cycle…</button>' +
        '</div>';
      const b = document.getElementById('mepVer');
      if (b) b.onclick = () => abrir();
      const g = document.getElementById('mepPrev');
      if (g) g.onclick = () => previsualizar();
      const rc = document.getElementById('mepRec');
      if (rc) rc.onclick = () => verConciliacion();
      const pr = document.getElementById('mepPrec');
      if (pr) pr.onclick = () => verPrecios();
      const hi = document.getElementById('mepHist');
      if (hi) hi.onclick = () => verHistorial();
    }
    abrir();
  }

  // ── El precio al día ────────────────────────────────────────────────
  //
  // La regla, y es la que evita el riesgo grande: **no se borra nada**.
  // Sólo cambia el precio de los productos que aparecen en una
  // factura. Lo que nunca has comprado por MarginEdge conserva el
  // precio que tecleaste.
  //
  // `inventory_items.value` es el COSTE de la botella, y de ahí salen
  // "money on the shelf" y la pérdida en dinero.
  //
  // Lo que NO actualiza un precio:
  //
  //   precio cero o nulo   — flete, depósitos, líneas de servicio
  //   cantidad negativa    — un abono o una devolución
  //
  // Cualquiera de las dos pondría una botella a cero, y un cero en el
  // coste no se nota mirando: se nota meses después, cuando el valor
  // del estante no cuadra y nadie sabe desde cuándo.

  function precioDeLinea(l) {
    const p = Number(l.unit_price);
    if (!(p > 0)) return null;
    if (Number(l.quantity) < 0) return null;
    return Math.round(p * 100) / 100;
  }

  async function calcularPrecios() {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) throw new Error('No location.');

    const [lineas, enlaces] = await Promise.all([
      leerTodo(url, key,
        `marginedge_invoice_lines?location_id=eq.${locId}` +
        `&select=product_id,unit_price,quantity,invoice_date,invoice_number,vendor_name` +
        `&order=invoice_date.asc`),
      leerTodo(url, key,
        `marginedge_links?location_id=eq.${locId}&select=product_id,item_name&order=product_id.asc`)
    ]);

    const deQuien = new Map(enlaces.map(e => [String(e.product_id), e.item_name || '']));

    // Orden ascendente por fecha, así que la última que escribe cada
    // artículo es la factura más reciente.
    const ultimo = new Map();
    for (const l of lineas) {
      const item = deQuien.get(String(l.product_id));
      if (!item) continue;
      const precio = precioDeLinea(l);
      if (precio === null) continue;
      ultimo.set(item, { item, precio, fecha: l.invoice_date || '',
                         factura: l.invoice_number || '', vendor: l.vendor_name || '' });
    }

    const master = (window.state && state.master) || [];
    const actual = new Map(master.map(r => [r.item, Number(r.value) || 0]));

    const cambios = [];
    for (const [item, d] of ultimo) {
      if (!actual.has(item)) continue;                    // ya no está en inventario
      const antes = actual.get(item);
      if (Math.abs(antes - d.precio) < 0.005) continue;   // ya es el mismo
      cambios.push(Object.assign({ antes }, d));
    }
    cambios.sort((a, b) => Math.abs(b.precio - b.antes) - Math.abs(a.precio - a.antes));

    return { cambios, conPrecio: ultimo.size,
             sinTocar: Math.max(0, master.length - ultimo.size) };
  }

  // ── De seis en seis, no de una en una ─────────────────────────────
  //
  // En serie, con cien precios eran casi dos minutos de botón en
  // "Updating…" sin decir nada. Y sin try dentro del bucle, una sola
  // petición fallida tiraba la excepción fuera del manejador y el
  // botón se quedaba deshabilitado para siempre — que es exactamente
  // lo que pasó.
  //
  // El tope de seis existe porque cien peticiones a la vez contra
  // Supabase es la otra forma de que esto se atasque.
  const A_LA_VEZ = 6;

  async function aplicarPrecios(cambios, avisar) {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) return { ok: 0, problemas: ['No location.'] };

    const cab = { 'Content-Type': 'application/json', apikey: key,
                  Authorization: `Bearer ${key}`, Prefer: 'return=minimal' };
    let ok = 0, hechos = 0;
    const problemas = [];
    const log = [];

    async function uno(c) {
      hechos++;
      if (avisar) avisar(hechos, cambios.length);
      let r;
      try {
        r = await fetch(
          `${url}/rest/v1/inventory_items?location_id=eq.${locId}` +
          `&item_name=eq.${encodeURIComponent(c.item)}`,
          { method: 'PATCH', headers: cab, body: JSON.stringify({ value: c.precio }) });
      } catch (e) {
        problemas.push(c.item + ': ' + (e && e.message || e));
        return;
      }
      if (!r.ok) {
        problemas.push(c.item + ': ' + r.status + ' ' + (await r.text()).slice(0, 70));
        return;
      }
      ok++;
      log.push({
        location_id: locId, item_name: c.item,
        price_before: c.antes, price_after: c.precio,
        invoice_number: c.factura || null,
        invoice_date: c.fecha || null,
        vendor_name: c.vendor || null
      });
    }

    for (let i = 0; i < cambios.length; i += A_LA_VEZ) {
      await Promise.all(cambios.slice(i, i + A_LA_VEZ).map(uno));
    }

    // El registro se escribe DESPUÉS y de una vez. Si fallara, los
    // precios ya están bien: se pierde el rastro, no el dato. Al revés
    // —apuntar antes— dejaría historial de cambios que no ocurrieron.
    if (log.length) {
      try {
        await fetch(`${url}/rest/v1/marginedge_price_log`, {
          method: 'POST', headers: cab, body: JSON.stringify(log) });
      } catch (e) { console.warn('[marginedge] no se pudo registrar el cambio', e); }
    }

    return { ok, problemas };
  }

  function pintarPrecios(res) {
    const host = document.getElementById('mepBody');
    if (!host) return;

    if (!res.cambios.length) {
      host.innerHTML = '<div class="mem-empty" style="color:#15803d">' +
        '<b>Every price is already current.</b><br>' + res.conPrecio +
        ' items have an invoice price and all of them match. ' + res.sinTocar +
        ' have never come through MarginEdge and keep the price you typed.</div>';
      return;
    }

    const flecha = c => c.precio > c.antes
      ? '<span style="color:#fca5a5">↑</span>'
      : '<span style="color:#6ee7b7">↓</span>';

    host.innerHTML =
      '<div class="mem-note">Only items that appear on an invoice change. The ' +
      'other <b>' + res.sinTocar + '</b> keep the price you typed — nothing ' +
      'is cleared.</div>' +
      res.cambios.map(c =>
        '<div class="mem-row"><div class="mem-mine"><b>' + esc(c.item) + '</b>' +
        '<span>' + esc(c.vendor || '') +
          (c.factura ? ' · invoice ' + esc(c.factura) : '') +
          (c.fecha ? ' · ' + esc(c.fecha) : '') + '</span></div>' +
        '<div class="mep-nums">' +
          '<div class="mep-n"><b>' + dinero(c.antes) + '</b><span>now</span></div>' +
          '<div class="mep-n"><b>' + flecha(c) + ' ' + dinero(c.precio) +
            '</b><span>invoice</span></div>' +
        '</div></div>').join('') +
      '<div style="margin-top:14px"><button type="button" id="mepPrecGo" ' +
      'class="success ui-control">Update ' + res.cambios.length + ' prices</button></div>';

    const b = document.getElementById('mepPrecGo');
    if (b) b.onclick = async () => {
      b.disabled = true;
      // Pase lo que pase, el botón vuelve. Un "Updating…" eterno no
      // dice si funcionó, si falló o si sigue trabajando.
      try {
        const r = await aplicarPrecios(res.cambios, (n, tot) => {
          b.textContent = 'Updating… ' + n + ' of ' + tot;
        });
        host.innerHTML =
          '<div class="small" style="color:' + (r.problemas.length ? '#b45309' : '#15803d') +
          ';font-weight:700">' + r.ok + ' prices updated' +
          (r.problemas.length ? ' · ' + r.problemas.length + ' failed' : '') + '.</div>' +
          (r.problemas.length
            ? '<div class="mem-note" style="margin-top:8px">' +
              esc(r.problemas.slice(0, 10).join(' · ')) + '</div>' : '');
        if (window.BarStockInventoryRealtime && window.BarStockInventoryRealtime.refresh) {
          try { window.BarStockInventoryRealtime.refresh(); } catch (e) {}
        }
      } catch (e) {
        b.disabled = false;
        b.textContent = 'Update ' + res.cambios.length + ' prices';
        host.insertAdjacentHTML('afterbegin',
          '<div class="mem-err">' + esc(String(e && e.message || e)) + '</div>');
      }
    };
  }

  // ── El historial de precios ─────────────────────────────────────────
  //
  // Lo que contesta «¿esto subió un 10 % o bajó un 30 %?». Se lee del
  // registro, así que sólo aparece lo que de verdad cambió y cuándo.

  async function leerHistorial(limite) {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) return [];
    const r = await fetch(
      `${url}/rest/v1/marginedge_price_log?location_id=eq.${locId}` +
      `&select=item_name,price_before,price_after,invoice_number,invoice_date,` +
      `vendor_name,applied_at&order=applied_at.desc&limit=${limite || 60}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return [];
    const filas = await r.json();
    return Array.isArray(filas) ? filas : [];
  }

  function pct(antes, despues) {
    const a = Number(antes), d = Number(despues);
    if (!(a > 0)) return null;
    return Math.round(((d - a) / a) * 1000) / 10;
  }

  function filaHistorial(h) {
    const p = pct(h.price_before, h.price_after);
    // Subir un coste es malo y bajarlo es bueno: al revés que en una
    // cotización. El color va con lo que significa, no con el signo.
    const col = p === null ? '#94a3b8' : p > 0 ? '#fca5a5' : '#6ee7b7';
    const sig = p === null ? '' : (p > 0 ? '+' : '') + p + '%';
    return '<div class="mem-row"><div class="mem-mine"><b>' + esc(h.item_name) + '</b>' +
      '<span>' + esc(h.vendor_name || '') +
        (h.invoice_number ? ' · invoice ' + esc(h.invoice_number) : '') +
        (h.invoice_date ? ' · ' + esc(h.invoice_date) : '') + '</span></div>' +
      '<div class="mep-nums">' +
        '<div class="mep-n"><b>' + dinero(h.price_before) + ' → ' +
          dinero(h.price_after) + '</b><span>was · now</span></div>' +
        '<div class="mep-n"><b style="color:' + col + '">' + esc(sig) +
          '</b><span>change</span></div>' +
      '</div></div>';
  }

  async function verHistorial() {
    const host = document.getElementById('mepBody');
    if (host) host.innerHTML = '<div class="mem-empty">Reading price history…</div>';
    const filas = await leerHistorial(80);
    if (!host) return;

    if (!filas.length) {
      host.innerHTML = '<div class="mem-empty"><b>No price changes recorded yet.</b><br>' +
        'Every time an invoice changes what a bottle costs, it lands here with ' +
        'the invoice it came from.</div>';
      return;
    }

    // Lo que más se movió primero: un 30 % en una botella de 9 dólares
    // importa menos que un 8 % en una de 90, pero el porcentaje es lo
    // que se mira para negociar con el proveedor.
    const grandes = filas.slice()
      .filter(h => Math.abs(pct(h.price_before, h.price_after) || 0) >= 10)
      .sort((a, b) => Math.abs(pct(b.price_before, b.price_after) || 0) -
                      Math.abs(pct(a.price_before, a.price_after) || 0));

    host.innerHTML =
      (grandes.length
        ? '<div class="mem-note"><b>' + grandes.length +
          (grandes.length === 1 ? ' price moved' : ' prices moved') +
          ' 10% or more.</b> Those are the ones worth a call.</div>' +
          grandes.slice(0, 12).map(filaHistorial).join('') +
          '<div class="m-lab" style="margin-top:16px">EVERYTHING ELSE</div>'
        : '') +
      filas.filter(h => grandes.indexOf(h) === -1).map(filaHistorial).join('');
  }

  async function verPrecios() {
    const host = document.getElementById('mepBody');
    if (host) host.innerHTML = '<div class="mem-empty">Comparing prices…</div>';
    try { pintarPrecios(await calcularPrecios()); }
    catch (e) {
      if (host) host.innerHTML = '<div class="mem-empty">' + esc(String(e.message || e)) + '</div>';
    }
  }

  // ── Conciliar: lo que pediste contra lo que llegó ───────────────────
  //
  // Por ARTÍCULO dentro del ciclo, no orden contra factura. Una orden
  // puede llegar en dos entregas, una factura puede cubrir dos órdenes,
  // y a veces se pide por teléfono sin orden en la app. Emparejar
  // documentos daría huérfanos por los dos lados; emparejar artículos
  // da la cifra que de verdad importa: pedí 6, llegaron 4.
  //
  // No escribe nada. Sólo mira y avisa.

  async function leerOrdenes(url, key, locId, desdeISO, hastaISO) {
    const cab = { apikey: key, Authorization: `Bearer ${key}` };

    const r = await fetch(
      `${url}/rest/v1/vendor_orders?location_id=eq.${locId}` +
      `&created_at=gte.${desdeISO}&created_at=lte.${hastaISO}` +
      `&select=id,vendor,po_number,created_at&limit=500`,
      { headers: cab });
    if (!r.ok) throw new Error(await r.text());
    const ordenes = await r.json();
    if (!Array.isArray(ordenes) || !ordenes.length) return { ordenes: [], items: [] };

    const ids = ordenes.map(o => o.id).filter(Boolean);
    const items = await leerTodo(url, key,
      `vendor_order_items?vendor_order_id=in.(${ids.join(',')})` +
      `&select=vendor_order_id,vendor,item_name,quantity,unit_price&order=item_name.asc`);

    return { ordenes, items };
  }

  // La costura del domingo. Las facturas traen fecha pero no hora, y el
  // ciclo arranca a una hora concreta. Una entrega fechada el mismo día
  // del reinicio pudo llegar antes del conteo —y entonces ya está
  // dentro de on_hand_start— o después. No hay dato que lo resuelva, así
  // que no se decide: se aparta y se pregunta.
  function mismoDia(fecha, inicio) {
    if (!fecha || !inicio) return false;
    const d = new Date(inicio);
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
    return String(fecha).slice(0, 10) === iso;
  }

  // ── La ventana es la misma para los dos lados ──────────────────────
  //
  // La primera versión comparaba las facturas del ciclo abierto contra
  // las órdenes del ciclo abierto, mientras "What came in" usaba las
  // fechas de arriba. Con el ciclo arrancado el 25 y una factura del
  // 22, una pantalla decía "llegaron 24" y la otra "no llegó nada".
  // Las dos tenían razón en su ventana, y juntas parecían un fallo.
  //
  // Ahora manda el rango que elige el usuario, y la pantalla dice cuál
  // está mirando.
  async function conciliar(desde, hasta) {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) throw new Error('No location.');
    if (!desde) throw new Error('Pick a start date first.');

    // Las órdenes se filtran por el MISMO rango. created_at es una
    // marca de tiempo, así que el final del rango incluye todo su día.
    const finISO = hasta ? hasta + 'T23:59:59' : new Date().toISOString();
    const { items: pedidos, ordenes } = await leerOrdenes(url, key, locId, desde + 'T00:00:00', finISO);

    await cargar(desde, hasta);

    // Sólo tiene sentido avisar de la costura si el reinicio del ciclo
    // cae DENTRO del rango que se está mirando.
    const C = window.BarStockCycle;
    const ini = C && C.startedAt && C.startedAt();
    let dudosas = [];
    let diaReinicio = null;
    if (ini) {
      const iso = new Date(ini.getTime() - ini.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 10);
      if (iso >= desde && (!hasta || iso <= hasta)) {
        diaReinicio = iso;
        dudosas = await leerTodo(url, key,
          `marginedge_invoice_lines?location_id=eq.${locId}` +
          `&invoice_date=eq.${iso}&select=vendor_item_name,vendor_name,quantity,invoice_number` +
          `&order=order_id.asc`);
      }
    }

    // ── Tres estados, no uno ───────────────────────────────────────
    //
    // Antes, cualquier artículo pedido y no recibido salía como
    // "nothing arrived". Pero eso cubre dos situaciones opuestas:
    //
    //   pediste ayer y el camión viene el jueves  →  normal
    //   la entrega ya pasó y ese producto no vino →  reclamo
    //
    // Con las dos bajo la misma etiqueta, de 104 órdenes 85 salían
    // marcadas por motivos normales, y el día que una fuera un
    // problema de verdad nadie la iba a ver.
    //
    // La señal que las separa no necesita configurar nada: mirar si el
    // RESTO de la orden llegó. Si de doce líneas llegaron diez, las
    // otras dos no están pendientes — la entrega ocurrió y esos dos
    // productos no venían. Si no llegó ninguna, la entrega aún no ha
    // pasado, y entonces decide el tiempo.
    const DIAS_TARDE = 7;

    const recibos = _filas.map(f => ({
      item: f.item, qty: Number(f.unidades) || 0,
      fecha: f.ultima ? new Date(f.ultima).getTime() : 0
    }));

    const fechaDe = new Map(ordenes.map(o => [String(o.id), o.created_at]));
    const porOrden = new Map();
    for (const p of pedidos) {
      const k = String(p.vendor_order_id);
      if (!porOrden.has(k)) porOrden.set(k, []);
      porOrden.get(k).push(p);
    }

    const hoy = Date.now();
    const porItem = new Map();

    for (const [id, lineas] of porOrden) {
      const f0 = fechaDe.get(id);
      const t0 = f0 ? new Date(f0).getTime() : 0;
      const dias = t0 ? Math.floor((hoy - t0) / 86400000) : 999;

      // Cada recibo se consume una sola vez y sólo lo reclaman órdenes
      // anteriores a su fecha: con dos órdenes del mismo artículo, la
      // primera se queda lo que llegó primero.
      const conLlegada = lineas.map(l => {
        const pedido = Number(l.quantity) || 0;
        let llegado = 0;
        for (const r of recibos) {
          if (r.usado || !mismoNombre(r.item, l.item_name)) continue;
          if (r.fecha && t0 && r.fecha + 86400000 < t0) continue;
          if (llegado >= pedido) break;
          llegado += r.qty;
          r.usado = true;
        }
        return { l, pedido, llegado };
      });

      // ¿Pasó ya la entrega de esta orden? Lo dice que alguna de sus
      // líneas haya llegado.
      const hubo = conLlegada.some(x => x.llegado > 0);

      for (const { l, pedido, llegado } of conLlegada) {
        const k = l.item_name || '';
        if (!porItem.has(k)) {
          porItem.set(k, { item: k, pedido: 0, recibido: 0,
                           vendor: l.vendor || '', dias, hubo });
        }
        const a = porItem.get(k);
        a.pedido += pedido;
        a.recibido += llegado;
        a.dias = Math.min(a.dias, dias);
        a.hubo = a.hubo || hubo;
      }
    }

    // Lo que llegó sin que nadie lo pidiera.
    for (const f of _filas) {
      if (porItem.has(f.item)) continue;
      porItem.set(f.item, { item: f.item, pedido: 0, recibido: f.unidades,
                            vendor: '', dias: 0, hubo: true });
    }

    const filas = Array.from(porItem.values()).map(r => {
      r.dif = r.recibido - r.pedido;
      r.tipo =
        r.pedido === 0          ? 'sin-orden'
      : Math.abs(r.dif) < 0.001 ? 'cuadra'
      : r.dif > 0               ? 'sobra'
      : r.hubo                  ? 'falta'
      : r.dias >= DIAS_TARDE    ? 'tarde'
      :                           'espera';
      return r;
    }).sort((a, b) => {
      // Lo accionable primero: reclamar, luego lo que se retrasa, y al
      // final lo que sólo está esperando su día.
      const peso = { falta: 0, tarde: 1, sobra: 2, 'sin-orden': 3, espera: 4, cuadra: 5 };
      const d = (peso[a.tipo] === undefined ? 9 : peso[a.tipo]) -
                (peso[b.tipo] === undefined ? 9 : peso[b.tipo]);
      return d || Math.abs(b.dif) - Math.abs(a.dif);
    });

    return { desde, hasta, filas, dudosas, diaReinicio };
  }

  function pintarConciliacion(res) {
    const host = document.getElementById('mepBody');
    if (!host) return;

    const n = t => res.filas.filter(f => f.tipo === t).length;
    // "Esperando" no es un problema: es lo normal entre que pides y
    // llega el camión. Cuenta en el resumen pero no entra en la lista,
    // o la lista se llena de ruido y deja de mirarse.
    const problemas = res.filas.filter(f => f.tipo !== 'cuadra' && f.tipo !== 'espera');

    const etiqueta = {
      falta: ['short', 'mem-conf mid'],
      tarde: ['overdue', 'mem-conf mid'],
      sobra: ['over', 'mem-conf mid'],
      espera: ['waiting', 'mem-conf taken'],
      'sin-orden': ['no order placed', 'mem-conf taken']
    };

    host.innerHTML =
      '<div class="mem-note" style="margin-bottom:12px">Orders placed and invoices ' +
      'received between <b>' + esc(res.desde) + '</b> and <b>' +
      esc(res.hasta || 'today') + '</b>. Both sides use this same window \u2014 change ' +
      'the dates above to move it.</div>' +
      '<div class="mem-leg" style="margin-bottom:14px">' +
        '<span><b>' + n('cuadra') + '</b> match</span>' +
        '<span><b>' + n('falta') + '</b> short</span>' +
        '<span><b>' + n('tarde') + '</b> overdue</span>' +
        '<span><b>' + n('sobra') + '</b> over</span>' +
        '<span><b>' + n('espera') + '</b> waiting</span>' +
        '<span><b>' + n('sin-orden') + '</b> no order</span>' +
      '</div>' +

      (res.dudosas.length
        ? '<div class="mem-note"><b>' + res.dudosas.length + ' invoice lines are dated ' +
          esc(res.diaReinicio) + ', the day the cycle restarted.</b> Invoices carry a date but no ' +
          'time, so there is no way to tell whether those arrived before the count — ' +
          'already inside on hand — or after it. They are left out of the figures below ' +
          'for you to decide.</div>'
        : '') +

      (n('espera')
        ? '<div class="mem-note" style="background:rgba(100,116,139,.12);' +
          'border-color:rgba(148,163,184,.26);color:#94a3b8"><b>' + n('espera') +
          ' items are just waiting.</b> Their order went out recently and no ' +
          'line of it has arrived, so the delivery has not happened yet. They ' +
          'are left out of the list below \u2014 what is there needs you.</div>'
        : '') +

      (problemas.length
        ? problemas.map(f => {
            const e = etiqueta[f.tipo] || ['', 'mem-conf'];
            return '<div class="mem-row"><div class="mem-mine"><b>' + esc(f.item) + '</b>' +
              '<span>' + esc(f.vendor || 'No vendor') + '</span></div>' +
              '<div class="mep-nums">' +
                '<div class="mep-n"><b>' + (Math.round(f.pedido * 100) / 100) + '</b><span>ordered</span></div>' +
                '<div class="mep-n"><b>' + (Math.round(f.recibido * 100) / 100) + '</b><span>received</span></div>' +
                '<div class="mep-n"><b>' + (f.dif > 0 ? '+' : '') +
                  (Math.round(f.dif * 100) / 100) + '</b><span>' + esc(e[0]) +
                  (f.tipo === 'tarde' ? ' \u00b7 ' + f.dias + 'd' : '') + '</span></div>' +
              '</div></div>';
          }).join('')
        : '<div class="mem-empty" style="color:#15803d"><b>Nothing needs you.</b><br>' +
          'What has been delivered matches what you ordered.</div>') +

      '<div class="mem-note" style="margin-top:14px">Read-only. Nothing here changes an ' +
      'order or your inventory.</div>';
  }

  async function verConciliacion() {
    const host = document.getElementById('mepBody');
    if (host) host.innerHTML = '<div class="mem-empty">Comparing orders against invoices…</div>';
    const d = document.getElementById('mepDesde');
    const h = document.getElementById('mepHasta');
    try {
      pintarConciliacion(await conciliar(d && d.value, h && h.value));
    } catch (e) {
      if (host) host.innerHTML = '<div class="mem-empty">' + esc(String(e.message || e)) + '</div>';
    }
  }

  // ── Meterlo en el ciclo ─────────────────────────────────────────────
  //
  // `inventory_snapshots.ordered` es acumulativo: `stock-in.js` le SUMA
  // lo que se registra a mano. Si esto sumara lo que ve, pulsar dos
  // veces duplicaría las entradas — y no se notaría, porque el número
  // sube de forma plausible y `used = inicial + recibido − final`
  // simplemente daría un consumo inflado sin explicación.
  //
  // Así que no se suma lo que hay, se suma la DIFERENCIA contra lo ya
  // aplicado, que vive en `marginedge_applied`. Pulsar diez veces deja
  // el mismo resultado que pulsar una.

  async function leerAplicado(url, key, locId, semana) {
    const r = await fetch(
      `${url}/rest/v1/marginedge_applied?location_id=eq.${locId}` +
      `&week_start=eq.${semana}&select=item_name,units&limit=5000`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return new Map();
    const filas = await r.json();
    if (!Array.isArray(filas)) return new Map();
    return new Map(filas.map(f => [f.item_name, Number(f.units) || 0]));
  }

  // Lo que entraría en el ciclo abierto: sólo las facturas fechadas
  // desde que arrancó, y sólo la parte que todavía no se ha aplicado.
  async function calcularAplicacion() {
    const { url, key } = cfg();
    const locId = await locationId();
    const C = window.BarStockCycle;
    const W = window.BarStockWeek;
    if (!url || !key || !locId) throw new Error('No location.');
    if (!C || !W) throw new Error('Cycle modules not loaded.');

    const ini = C.startedAt && C.startedAt();
    if (!ini) throw new Error('No open cycle. Start one first.');

    const desde = new Date(ini.getTime() - ini.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
    const semana = W.cycleWeekKey();

    await cargar(desde, null);
    const aplicado = await leerAplicado(url, key, locId, semana);

    const cambios = _filas.map(f => {
      const ya = aplicado.get(f.item) || 0;
      return { item: f.item, total: f.unidades, ya, delta: f.unidades - ya };
    }).filter(c => Math.abs(c.delta) > 0.0001);

    return { desde, semana, cambios, total: _filas.length };
  }

  async function aplicar(plan) {
    const { url, key } = cfg();
    const locId = await locationId();
    const cab = { apikey: key, Authorization: `Bearer ${key}` };
    let ok = 0;
    const problemas = [];

    for (const c of plan.cambios) {
      // La fila del ciclo tiene que existir: si no, no hay dónde
      // anotarlo y callarse sería peor que fallar.
      const r = await fetch(
        `${url}/rest/v1/inventory_snapshots?location_id=eq.${locId}` +
        `&week_start=eq.${plan.semana}&item_name=eq.${encodeURIComponent(c.item)}` +
        `&select=id,ordered`, { headers: cab });
      const snaps = await r.json();

      if (!Array.isArray(snaps) || !snaps.length) {
        problemas.push(c.item + ': no row in the open cycle');
        continue;
      }

      const antes = Number(snaps[0].ordered || 0);
      const patch = await fetch(`${url}/rest/v1/inventory_snapshots?id=eq.${snaps[0].id}`, {
        method: 'PATCH',
        headers: Object.assign({ 'Content-Type': 'application/json',
                                 Prefer: 'return=minimal' }, cab),
        body: JSON.stringify({ ordered: antes + c.delta })
      });
      if (!patch.ok) { problemas.push(c.item + ': ' + patch.status); continue; }

      // Se apunta DESPUÉS de que el patch haya ido bien. Al revés, un
      // fallo dejaría la entrada por aplicada y nunca entraría.
      const marca = await fetch(
        `${url}/rest/v1/marginedge_applied?on_conflict=location_id,week_start,item_name`, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal' }, cab),
        body: JSON.stringify({ location_id: locId, week_start: plan.semana,
                               item_name: c.item, units: c.total,
                               updated_at: new Date().toISOString() })
      });
      if (!marca.ok) { problemas.push(c.item + ': applied-mark ' + marca.status); continue; }

      ok++;
    }

    return { ok, problemas };
  }

  async function previsualizar() {
    const host = document.getElementById('mepBody');
    if (host) host.innerHTML = '<div class="mem-empty">Working out what would change…</div>';

    let plan;
    try { plan = await calcularAplicacion(); }
    catch (e) {
      if (host) host.innerHTML = '<div class="mem-empty">' + esc(String(e.message || e)) + '</div>';
      return;
    }

    if (!plan.cambios.length) {
      if (host) host.innerHTML = '<div class="mem-empty" style="color:#15803d">' +
        '<b>Nothing to apply.</b><br>Everything in this cycle since ' + esc(plan.desde) +
        ' is already in. Pressing again changes nothing.</div>';
      return;
    }

    host.innerHTML =
      '<div class="mem-note">This is what <b>Received</b> would change in the open ' +
      'cycle (' + esc(plan.semana) + '), counting invoices dated from ' + esc(plan.desde) +
      '. Only the difference against what was already applied goes in, so pressing ' +
      'twice does nothing the second time.</div>' +
      plan.cambios.map(c =>
        '<div class="mem-row"><div class="mem-mine"><b>' + esc(c.item) + '</b><span>' +
        (c.ya ? 'already in: ' + c.ya + ' · ' : '') + 'invoices total ' + c.total +
        '</span></div><div class="mep-nums"><div class="mep-n"><b>' +
        (c.delta > 0 ? '+' : '') + (Math.round(c.delta * 100) / 100) +
        '</b><span>to add</span></div></div></div>').join('') +
      '<div style="margin-top:14px"><button type="button" id="mepGo" ' +
      'class="success ui-control">Apply ' + plan.cambios.length + ' items to the cycle</button></div>';

    const b = document.getElementById('mepGo');
    if (b) b.onclick = async () => {
      b.disabled = true;
      b.textContent = 'Applying…';
      const res = await aplicar(plan);
      host.innerHTML =
        '<div class="small" style="color:' + (res.problemas.length ? '#b45309' : '#15803d') +
        ';font-weight:700">' + res.ok + ' items applied to the cycle.</div>' +
        (res.problemas.length
          ? '<div class="mem-note" style="margin-top:8px"><b>' + res.problemas.length +
            ' could not be applied:</b><br>' + esc(res.problemas.slice(0, 12).join(' · ')) +
            '</div>'
          : '');
      if (window.BarStockInventoryRealtime && window.BarStockInventoryRealtime.refresh) {
        try { window.BarStockInventoryRealtime.refresh(); } catch (e) {}
      }
    };
  }

  window.BarStockMarginEdgePurchases = {
    montar, abrir, previsualizar, verConciliacion, verPrecios, verHistorial,
    leerHistorial,
    // ── Lo que usan la campana y la tarjeta del Home ───────────────
    //
    // El cálculo de qué precios cambiaron vivía SOLO dentro de este
    // panel, en una de cuatro pestañas que hay que saber que existen.
    // Las facturas entraban solas y los precios se quedaban esperando
    // a que alguien se acordara — que es justo el dato que cuesta
    // dinero tener viejo.
    //
    // Se exporta en vez de copiarse: si mañana cambia qué precio
    // vale —el de la última factura, el medio, el del proveedor
    // habitual— cambia aquí y lo ven los tres sitios.
    calcularPrecios, aplicarPrecios,
    _precioDeLinea: precioDeLinea, _pct: pct
  };

  window.__settingsHooks = window.__settingsHooks || {};
  window.__settingsHooks.mePurchases = montar;
})();
