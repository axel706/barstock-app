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
        '</div>';
      const b = document.getElementById('mepVer');
      if (b) b.onclick = () => abrir();
    }
    abrir();
  }

  window.BarStockMarginEdgePurchases = { montar, abrir };

  window.__settingsHooks = window.__settingsHooks || {};
  window.__settingsHooks.mePurchases = montar;
})();
