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
        '<button type="button" id="mepPrev" class="ui-control">Apply to cycle…</button>' +
        '</div>';
      const b = document.getElementById('mepVer');
      if (b) b.onclick = () => abrir();
      const g = document.getElementById('mepPrev');
      if (g) g.onclick = () => previsualizar();
      const rc = document.getElementById('mepRec');
      if (rc) rc.onclick = () => verConciliacion();
    }
    abrir();
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

  async function leerOrdenes(url, key, locId, desdeISO) {
    const cab = { apikey: key, Authorization: `Bearer ${key}` };

    const r = await fetch(
      `${url}/rest/v1/vendor_orders?location_id=eq.${locId}` +
      `&created_at=gte.${desdeISO}&select=id,vendor,po_number,created_at&limit=500`,
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

  async function conciliar() {
    const { url, key } = cfg();
    const locId = await locationId();
    const C = window.BarStockCycle;
    if (!url || !key || !locId) throw new Error('No location.');
    if (!C || !C.startedAt || !C.startedAt()) throw new Error('No open cycle. Start one first.');

    const ini = C.startedAt();
    const desdeFecha = new Date(ini.getTime() - ini.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);

    const [{ items: pedidos }] = await Promise.all([
      leerOrdenes(url, key, locId, ini.toISOString())
    ]);

    // Las líneas de factura del ciclo, ya agrupadas por artículo.
    await cargar(desdeFecha, null);

    // Las del día del reinicio van aparte.
    const dudosas = await leerTodo(url, key,
      `marginedge_invoice_lines?location_id=eq.${locId}` +
      `&invoice_date=eq.${desdeFecha}&select=vendor_item_name,vendor_name,quantity,invoice_number` +
      `&order=order_id.asc`);

    const porItem = new Map();
    for (const p of pedidos) {
      const k = p.item_name || '';
      if (!porItem.has(k)) porItem.set(k, { item: k, pedido: 0, recibido: 0, vendor: p.vendor || '' });
      porItem.get(k).pedido += Number(p.quantity) || 0;
    }
    for (const f of _filas) {
      const k = f.item;
      if (!porItem.has(k)) porItem.set(k, { item: k, pedido: 0, recibido: 0, vendor: '' });
      porItem.get(k).recibido += Number(f.unidades) || 0;
    }

    const filas = Array.from(porItem.values()).map(r => {
      r.dif = r.recibido - r.pedido;
      r.tipo = r.pedido === 0 ? 'sin-orden'
             : r.recibido === 0 ? 'nada'
             : Math.abs(r.dif) < 0.001 ? 'cuadra'
             : r.dif < 0 ? 'falta' : 'sobra';
      return r;
    }).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));

    return { desde: desdeFecha, filas, dudosas };
  }

  function pintarConciliacion(res) {
    const host = document.getElementById('mepBody');
    if (!host) return;

    const n = t => res.filas.filter(f => f.tipo === t).length;
    const problemas = res.filas.filter(f => f.tipo !== 'cuadra');

    const etiqueta = {
      falta: ['short', 'mem-conf mid'],
      sobra: ['over', 'mem-conf mid'],
      nada: ['nothing arrived', 'mem-conf mid'],
      'sin-orden': ['no order placed', 'mem-conf taken']
    };

    host.innerHTML =
      '<div class="mem-leg" style="margin-bottom:14px">' +
        '<span><b>' + n('cuadra') + '</b> match</span>' +
        '<span><b>' + n('falta') + '</b> short</span>' +
        '<span><b>' + n('sobra') + '</b> over</span>' +
        '<span><b>' + n('nada') + '</b> nothing arrived</span>' +
        '<span><b>' + n('sin-orden') + '</b> no order</span>' +
      '</div>' +

      (res.dudosas.length
        ? '<div class="mem-note"><b>' + res.dudosas.length + ' invoice lines are dated ' +
          esc(res.desde) + ', the day the cycle restarted.</b> Invoices carry a date but no ' +
          'time, so there is no way to tell whether those arrived before the count — ' +
          'already inside on hand — or after it. They are left out of the figures below ' +
          'for you to decide.</div>'
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
                  (Math.round(f.dif * 100) / 100) + '</b><span>' + esc(e[0]) + '</span></div>' +
              '</div></div>';
          }).join('')
        : '<div class="mem-empty" style="color:#15803d"><b>Everything matches.</b><br>' +
          'What you ordered this cycle is what arrived.</div>') +

      '<div class="mem-note" style="margin-top:14px">Read-only. Nothing here changes an ' +
      'order or your inventory.</div>';
  }

  async function verConciliacion() {
    const host = document.getElementById('mepBody');
    if (host) host.innerHTML = '<div class="mem-empty">Comparing orders against invoices…</div>';
    try {
      pintarConciliacion(await conciliar());
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

  window.BarStockMarginEdgePurchases = { montar, abrir, previsualizar, verConciliacion };

  window.__settingsHooks = window.__settingsHooks || {};
  window.__settingsHooks.mePurchases = montar;
})();
