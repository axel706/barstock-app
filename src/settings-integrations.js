(() => {
  if (window.BarStockIntegrations) return;

  // ── Integraciones · paso 1: mirar sin tocar ──────────────────────────
  //
  // Un panel de diagnóstico, no una función del producto. Pregunta a
  // MarginEdge y enseña lo que contesta tal cual: la ruta que respondió,
  // cuántos registros vinieron, qué campos trae cada uno y tres de
  // ejemplo.
  //
  // No escribe NADA. Ni en Supabase ni en el inventario. Hasta que no
  // veamos la forma real de los datos, cualquier cosa que guardáramos
  // estaría construida sobre una suposición.
  //
  // El identificador del restaurante no se pide por adelantado: se
  // descubre preguntando a MarginEdge qué restaurantes ve la clave. Una
  // credencial que sólo abre una puerta ya sabe cuál es.

  // ── El restaurante se guarda POR LOCACIÓN, no por navegador ─────────
  //
  // La primera versión lo metía en localStorage como una elección única.
  // Está mal: BarStock es multi-locación y la clave de MarginEdge ve
  // varios restaurantes. The Crown Tavern va con The Crown Tavern y
  // Will's + Bill's con Will's + Bill's; una sola elección global
  // significaría que abrir la otra locación lee las facturas de la
  // primera. Eso no es un ajuste de preferencia, es parte de qué es
  // cada locación, así que vive en `location_settings`.
  //
  // El localStorage se queda sólo como caché por locación, para que el
  // panel no parpadee mientras llega la consulta.

  const LS_UNIT = 'bs_me_unit__';

  const ACCIONES = [
    { id: 'units',      nombre: 'Restaurantes', nota: 'Qué ve la clave' },
    { id: 'vendors',    nombre: 'Proveedores',  nota: 'Con quién compras' },
    { id: 'products',   nombre: 'Productos',    nota: 'El catálogo' },
    { id: 'categories', nombre: 'Categorías',   nota: 'Cómo los agrupa' },
    { id: 'invoices',   nombre: 'Facturas',     nota: 'Cabeceras del rango' },
    { id: 'invoice',    nombre: 'Una factura',  nota: 'Por dentro, con sus líneas' },
    { id: 'packaging',  nombre: 'Empaques',     nota: 'Qué es una unidad' },
    { id: 'find',       nombre: 'Buscar producto', nota: 'Crudo, sin filtros' },
    { id: 'guardado',   nombre: 'Qué hay guardado', nota: 'La copia local, en bruto' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return {
      url: c.SUPABASE_URL,
      key: c.SUPABASE_KEY,
      loc: c.LOCATION_NAME || ''
    };
  }

  function claveCache() {
    return LS_UNIT + (cfg().loc || 'loc');
  }

  async function locationId() {
    const P = window.BarStockParIntelligence;
    if (!P || typeof P.fetchLocationId !== 'function') return null;
    try { return await P.fetchLocationId(); } catch (e) { return null; }
  }

  // Lo que el panel pinta ahora mismo: la caché de esta locación.
  function unidad() {
    try { return localStorage.getItem(claveCache()) || ''; } catch (e) { return ''; }
  }

  async function cargarUnidad() {
    const { url, key } = cfg();
    const id = await locationId();
    if (!url || !key || !id) return unidad();

    try {
      const r = await fetch(
        `${url}/rest/v1/location_settings?location_id=eq.${id}&select=marginedge_unit_id`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      const filas = await r.json();
      const guardada = filas?.[0]?.marginedge_unit_id || '';
      try {
        guardada ? localStorage.setItem(claveCache(), guardada)
                 : localStorage.removeItem(claveCache());
      } catch (e) {}
      return guardada;
    } catch (e) {
      return unidad();
    }
  }

  async function guardarUnidad(unitId) {
    try {
      unitId ? localStorage.setItem(claveCache(), unitId)
             : localStorage.removeItem(claveCache());
    } catch (e) {}

    const { url, key } = cfg();
    const id = await locationId();
    if (!url || !key || !id) return false;

    // Se escribe SÓLO esta columna. Un upsert con el objeto entero
    // borraría el correo de respuesta y los destinatarios, que viven en
    // la misma fila y no tienen nada que ver con esto.
    const cab = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // `return=representation` no es cosmético: es cómo sabemos si el
      // PATCH encontró fila que tocar o no tocó nada.
      Prefer: 'return=representation,resolution=merge-duplicates'
    };

    try {
      const r = await fetch(
        `${url}/rest/v1/location_settings?location_id=eq.${id}`,
        { method: 'PATCH', headers: cab,
          body: JSON.stringify({ marginedge_unit_id: unitId || null }) });

      // Si la locación todavía no tiene fila de ajustes, PATCH no toca
      // nada y hay que crearla.
      if (r.ok) {
        const texto = await r.text();
        if (texto && texto !== '[]') return true;
      }

      const r2 = await fetch(`${url}/rest/v1/location_settings`, {
        method: 'POST', headers: cab,
        body: JSON.stringify({ location_id: id, marginedge_unit_id: unitId || null })
      });
      return r2.ok;
    } catch (e) {
      return false;
    }
  }

  async function llamar(action, params) {
    const client = window.BarStockSupabase.getClient();
    const { data } = await client.auth.getSession();
    const token = data?.session?.access_token || '';

    const r = await fetch('/api/marginedge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ action, params: params || {} })
    });

    return r.json();
  }

  // De un objeto cualquiera, saca el par (id, nombre) más probable. Sirve
  // para listar restaurantes sin saber todavía cómo se llaman sus campos.
  function idYNombre(o) {
    if (!o || typeof o !== 'object') return { id: '', nombre: '' };
    const claves = Object.keys(o);
    const kId = claves.find(k => /^(id|.*Id|uuid|guid)$/i.test(k)) || claves[0];
    const kNm = claves.find(k => /name|title|label/i.test(k)) || '';
    return { id: String(o[kId] ?? ''), nombre: kNm ? String(o[kNm] ?? '') : '' };
  }

  function pintarUnidades(lista) {
    const cont = document.getElementById('meUnits');
    if (!cont) return;

    if (!lista || !lista.length) { cont.innerHTML = ''; return; }

    const actual = unidad();
    const loc = cfg().loc || 'esta locación';
    cont.innerHTML =
      '<div class="small muted" style="margin:14px 0 7px">' +
      'Cuál de estos es <b>' + esc(loc) + '</b>. Se guarda en la locación, ' +
      'así que la otra lleva su propia elección.</div>' +
      '<div style="display:flex;gap:7px;flex-wrap:wrap">' +
      lista.map(o => {
        const { id, nombre } = idYNombre(o);
        const on = id && id === actual;
        return '<button type="button" class="ui-control" data-unit="' + esc(id) + '"' +
          ' style="' + (on ? 'outline:2px solid #38bdf8;' : '') + '">' +
          esc(nombre || id) + '</button>';
      }).join('') +
      '</div>';

    cont.querySelectorAll('[data-unit]').forEach(b => {
      b.onclick = async () => {
        const ok = await guardarUnidad(b.dataset.unit);
        pintarUnidades(lista);
        pintarEstado(ok ? null : 'Elegido, pero no se pudo guardar en la nube. ' +
          'Puede que falte la columna marginedge_unit_id en location_settings.');
      };
    });
  }

  function pintarEstado(aviso) {
    const el = document.getElementById('meEstado');
    if (!el) return;
    const u = unidad();
    const loc = cfg().loc || 'esta locación';
    el.innerHTML = (u
      ? esc(loc) + ' está emparejada con el restaurante <b>' + esc(u) + '</b> de MarginEdge.'
      : esc(loc) + ' no está emparejada todavía. Empieza por <b>Restaurantes</b>.') +
      (aviso ? '<div style="color:#fca5a5;margin-top:6px">' + esc(aviso) + '</div>' : '');
  }

  // ── Fechas ───────────────────────────────────────────────────────
  //
  // `/orders` no admite que no se le diga un rango: contesta 400. Se
  // arranca con los últimos 30 días, que es bastante para ver la forma
  // de una factura sin pedirle a la API medio año de historia.

  function iso(d) { return d.toISOString().slice(0, 10); }

  function pintarFechas() {
    const cont = document.getElementById('meFechas');
    if (!cont || cont.dataset.listo === '1') return;

    const hoy = new Date();
    const hace30 = new Date(hoy.getTime() - 30 * 86400000);

    cont.dataset.listo = '1';
    cont.innerHTML =
      '<div class="small muted" style="margin-bottom:6px">' +
      'Rango para Facturas. Los demás botones lo ignoran.</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      '<input type="date" id="meDesde" value="' + iso(hace30) + '">' +
      '<span class="small muted">a</span>' +
      '<input type="date" id="meHasta" value="' + iso(hoy) + '">' +
      '<input type="text" id="meOrderId" placeholder="orderId" ' +
      'style="width:120px" title="Para el botón Una factura">' +
      '<input type="text" id="meBuscar" placeholder="find a product…" ' +
      'style="width:190px" title="Para el botón Buscar producto">' +
      '</div>';
  }

  function rango() {
    const d = document.getElementById('meDesde');
    const h = document.getElementById('meHasta');
    return { startDate: d && d.value, endDate: h && h.value };
  }

  function mostrarFallo(e) {
    console.error('[marginedge]', e);
    const el = document.getElementById('meSalida');
    const txt = (e && (e.stack || e.message)) || String(e);
    if (el) {
      el.innerHTML = '<div style="color:#b91c1c;font-weight:700;margin-bottom:6px">' +
        'Something broke in the browser</div><pre style="font-size:11px;' +
        'white-space:pre-wrap;background:rgba(0,0,0,.08);padding:11px;' +
        'border-radius:9px">' + esc(txt) + '</pre>';
    }
  }

  function bloque(titulo, dato) {
    if (dato == null) return '';
    return '<div class="small" style="margin:12px 0 5px;font-weight:700">' + esc(titulo) + '</div>' +
      '<pre style="max-height:300px;overflow:auto;font-size:11px;line-height:1.5;' +
      'background:rgba(0,0,0,.25);padding:12px;border-radius:10px;white-space:pre-wrap;' +
      'word-break:break-word">' +
      esc(typeof dato === 'string' ? dato : JSON.stringify(dato, null, 2)) + '</pre>';
  }

  function pintarResultado(action, res) {
    const el = document.getElementById('meSalida');
    if (!el) return;

    const intentos = (res.intentos || [])
      .map(i => i.ruta + ' → ' + (i.status != null ? i.status : i.error) +
                (i.mensaje ? ' (' + i.mensaje + ')' : ''))
      .join('  ·  ');

    if (!res.ok) {
      el.innerHTML =
        '<div style="color:#fca5a5;font-weight:700;margin-bottom:6px">No funcionó</div>' +
        '<div class="small" style="margin-bottom:8px">' + esc(res.error || 'Error desconocido') + '</div>' +
        (res.diagnostico
          ? '<pre style="font-size:11px;line-height:1.5;background:rgba(0,0,0,.25);padding:12px;' +
            'border-radius:10px;white-space:pre-wrap;margin-bottom:8px">' +
            esc(JSON.stringify(res.diagnostico, null, 2)) + '</pre>'
          : '') +
        '<div class="small muted">' + esc(intentos) + '</div>';
      return;
    }

    const campos = (res.campos || []).join(', ');

    el.innerHTML =
      '<div style="color:#86efac;font-weight:700;margin-bottom:6px">' +
        esc(action) + ' · ' + (res.total != null ? res.total + ' registros' : 'respuesta recibida') +
      '</div>' +
      '<div class="small muted" style="margin-bottom:10px">' +
        'Ruta buena: <b>' + esc(res.ruta) + '</b>' +
        (res.paginas > 1 ? ' · ' + res.paginas + ' páginas' : '') +
        (res.incompleto ? ' · <b>cortado por el tope</b>' : '') +
        (intentos ? '<br>' + esc(intentos) : '') +
      '</div>' +
      (campos
        ? '<div class="small" style="margin-bottom:10px">Campos: <b>' + esc(campos) + '</b></div>'
        : '') +
      bloque('Valores por campo', res.resumen) +
      // La búsqueda cruda tiene su propia forma: lo que importa es el
      // registro entero y qué dice la lista de categorías de cada id
      // que trae, no un resumen de valores.
      (res.hits
        ? '<div class="small" style="margin:10px 0">' +
            '<b>' + (res.hits.length) + '</b> coincidencias entre ' + (res.vistos || 0) +
            ' productos recorridos · ' + (res.totalCategorias || 0) + ' categorías conocidas' +
            (res.nextPage ? ' · <b>quedaron páginas sin recorrer</b>' : ' · catálogo completo') +
          '</div>' + bloque('Lo que hay', res.hits)
        : bloque('Ejemplos', res.muestra != null ? res.muestra : res.crudo));
  }

  async function correr(action) {
    const el = document.getElementById('meSalida');

    // Si el div de salida no existe, el panel no está montado y
    // cualquier cosa que haga aquí se pierde sin ruido. Es exactamente
    // el fallo que parece "el botón no hace nada".
    if (!el) {
      if (window.setStatus) setStatus('Integrations: no output area on the page.');
      console.error('[marginedge] falta #meSalida');
      return;
    }

    el.innerHTML = '<div class="small muted">Asking MarginEdge…</div>';
    try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {}

    // ── Qué hay realmente en la copia ──────────────────────────────
    //
    // "Tito's no está en mi catálogo" puede significar tres cosas muy
    // distintas: que la copia esté vacía, que el catálogo guarde otros
    // nombres de los que el usuario reconoce, o que sí esté y la
    // búsqueda falle. Enseñar una muestra real de nombres las separa de
    // un vistazo, y es más rápido que seguir buscando a ciegas.
    if (action === 'guardado') {
      const { url, key } = cfg();
      const id = await locationId();
      if (!url || !key || !id) { el.innerHTML = '<div class="small">No location.</div>'; return; }

      // Por tramos: PostgREST corta a 1000 filas sin decirlo, y leer
      // sólo las mil primeras fue justo lo que hizo creer que el
      // catálogo no tenía ni licores ni vinos.
      const M = window.BarStockMarginEdgeMatch;
      if (!M || !M.leerTodas) { el.innerHTML = '<div class="small">Match module not loaded.</div>'; return; }
      const filas = await M.leerTodas(url, key, id);

      const porTipo = {};
      for (const f of filas) {
        const t = f.type || '(sin tipo)';
        (porTipo[t] = porTipo[t] || []).push(f.name || '(sin nombre)');
      }

      const resumen = {};
      const muestras = {};
      for (const [t, nombres] of Object.entries(porTipo)) {
        resumen[t] = nombres.length;
        muestras[t] = nombres.slice(0, 12);
      }

      pintarResultado('guardado', {
        ok: true, ruta: 'marginedge_products (Supabase)',
        total: filas.length, resumen, muestra: muestras, intentos: []
      });
      return;
    }

    // ── La búsqueda no cabe en una llamada ─────────────────────────
    //
    // El catálogo pasa de 1254 productos y la función se corta a los
    // pocos segundos. La primera versión hacía una sola llamada y
    // devolvía "0 coincidencias" habiendo mirado sólo el principio:
    // una respuesta en falso, que es peor que un error.
    //
    // Aquí se dan vueltas hasta llegar al final, enseñando el avance.
    if (action === 'find') {
      const campo = document.getElementById('meBuscar');
      const q = (campo && campo.value || '').trim();
      if (q.length < 2) { el.innerHTML = '<div class="small">Write at least two letters.</div>'; return; }

      const u = unidad();
      let cursor = null, todas = null, vistos = 0, vueltas = 0;
      const hits = [];

      do {
        const r = await llamar('find', {
          restaurantUnitId: u, q,
          nextPage: cursor || undefined,
          todas: todas || undefined
        });

        if (r.hits) hits.push(...r.hits);
        vistos += r.vistos || 0;
        if (r.todas) todas = r.todas;

        if (!r.ok && !hits.length) { pintarResultado('find', r); return; }

        cursor = r.nextPage || null;
        vueltas++;
        el.innerHTML = '<div class="small muted">Searching… ' + vistos +
          ' products so far, ' + hits.length + ' found.</div>';
      } while (cursor && vueltas < 40);

      pintarResultado('find', {
        ok: true, hits, vistos,
        totalCategorias: todas ? Object.keys(todas).length : 0,
        nextPage: cursor, intentos: []
      });
      return;
    }

    let res;
    try {
      const params = {};
      const u = unidad();
      if (u && action !== 'units') params.restaurantUnitId = u;
      if (action === 'invoices') Object.assign(params, rango());
      if (action === 'find') {
        const el = document.getElementById('meBuscar');
        params.q = (el && el.value || '').trim();
      }
      if (action === 'invoice') {
        const el = document.getElementById('meOrderId');
        params.orderId = (el && el.value || '').trim();
      }
      res = await llamar(action, params);
    } catch (e) {
      res = { ok: false, error: String(e && e.message || e) };
    }

    pintarResultado(action, res);

    if (action === 'units' && res.ok) pintarUnidades(res.muestra || []);

    // Rellenar el orderId con la primera factura que salga, para no
    // tener que copiarlo a mano del bloque de ejemplos.
    if (action === 'invoices' && res.ok) {
      const id = res.muestra?.[0]?.orderId;
      const el = document.getElementById('meOrderId');
      if (id && el && !el.value.trim()) el.value = id;
    }
  }

  function render() {
    const cont = document.getElementById('meBotones');
    if (!cont) return;

    cont.innerHTML = ACCIONES.map(a =>
      '<button type="button" class="ui-control" data-me="' + a.id + '" ' +
      'style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left">' +
      '<span style="font-weight:700">' + esc(a.nombre) + '</span>' +
      '<span class="small muted" style="font-size:11px">' + esc(a.nota) + '</span>' +
      '</button>').join('');

    // Un fallo dentro del manejador se traga el clic y el botón parece
    // muerto. Se enseña en pantalla: en este panel, que está para
    // diagnosticar, un error invisible es lo peor que puede pasar.
    cont.querySelectorAll('[data-me]').forEach(b => {
      b.onclick = () => {
        try {
          const p = correr(b.dataset.me);
          if (p && p.catch) p.catch(mostrarFallo);
        } catch (e) { mostrarFallo(e); }
      };
    });

    pintarFechas();
    pintarEstado();
    pintarAccion();
    cargarUnidad().then(() => { pintarEstado(); pintarAccion(); });
  }

  // El botón de emparejar sólo aparece cuando hay restaurante elegido:
  // sin él la pantalla no sabría qué catálogo pedir.
  function pintarAccion() {
    const cont = document.getElementById('meAccion');
    if (!cont) return;
    if (!unidad()) { cont.innerHTML = ''; return; }
    cont.innerHTML =
      '<div style="display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap">' +
        '<button type="button" id="meSync" class="ui-control">Sync catalog</button>' +
        '<button type="button" id="meSyncInv" class="ui-control">Sync invoices</button>' +
        '<button type="button" id="meIrMatch" class="success ui-control">Match products →</button>' +
        '<button type="button" id="meIrCompras" class="ui-control">What came in →</button>' +
        '<span id="meSyncNota" class="small muted"></span>' +
      '</div>';

    const b = document.getElementById('meIrMatch');
    if (b) b.onclick = () => window.showSettingsPanel('meMatch');

    const c = document.getElementById('meIrCompras');
    if (c) c.onclick = () => window.showSettingsPanel('mePurchases');

    const s = document.getElementById('meSync');
    if (s) s.onclick = () => sincronizar().catch(mostrarFallo);

    const si = document.getElementById('meSyncInv');
    if (si) si.onclick = () => sincronizarFacturas().catch(mostrarFallo);

    notaSync();
  }

  // Cuándo se copió el catálogo por última vez. Un dato que se llena
  // solo pide poder saber cuándo se llenó.
  async function notaSync() {
    const el = document.getElementById('meSyncNota');
    if (!el) return;
    const { url, key } = cfg();
    const id = await locationId();
    if (!url || !key || !id) return;
    try {
      const r = await fetch(
        `${url}/rest/v1/location_settings?location_id=eq.${id}&select=marginedge_synced_at`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      const f = await r.json();
      const t = f?.[0]?.marginedge_synced_at;
      el.textContent = t ? 'Last full sync ' + new Date(t).toLocaleString()
                         : 'Never finished a full sync';
    } catch (e) {}
  }

  // ── Copiar las facturas ──────────────────────────────────────────
  //
  // Dos fases: primero las cabeceras del rango, luego las líneas de
  // cada una. Antes de pedir líneas se mira qué facturas ya están
  // guardadas y se saltan — eso es lo que hace que la segunda pasada
  // traiga sólo lo nuevo, y lo que permitirá el sync nocturno.
  const TANDA = 12;

  async function idsGuardados(url, key, locId) {
    const vistos = new Set();
    for (let desde = 0; desde < 60000; desde += 1000) {
      const r = await fetch(
        `${url}/rest/v1/marginedge_invoice_lines?location_id=eq.${locId}` +
        `&select=order_id&order=order_id.asc&limit=1000&offset=${desde}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!r.ok) break;
      const filas = await r.json();
      if (!Array.isArray(filas) || !filas.length) break;
      for (const f of filas) vistos.add(String(f.order_id));
      if (filas.length < 1000) break;
    }
    return vistos;
  }

  async function sincronizarFacturas() {
    const el = document.getElementById('meSalida');
    const u = unidad();
    const id = await locationId();
    const { url, key } = cfg();
    if (!u) { if (el) el.innerHTML = '<div class="small">Pick a restaurant first.</div>'; return; }
    if (!id) { if (el) el.innerHTML = '<div class="small">No location.</div>'; return; }

    const { startDate, endDate } = rango();
    const paso = t => { if (el) el.innerHTML = '<div class="small muted">' + t + '</div>'; };

    paso('Reading invoice headers…');

    let cursor = null, vueltas = 0;
    let pedidos = [];
    do {
      const r = await llamar('sync-invoices', {
        restaurantUnitId: u, locationId: id, startDate, endDate,
        nextPage: cursor || undefined
      });
      if (r.pedidos) pedidos = pedidos.concat(r.pedidos);
      if (r.error) {
        if (el) el.innerHTML = '<div class="small" style="color:#b45309">' +
          'Stopped reading headers after ' + pedidos.length + ': ' + esc(r.error) + '</div>';
        return;
      }
      cursor = r.nextPage || null;
      vueltas++;
      paso('Reading invoice headers… <b>' + pedidos.length + '</b> closed invoices so far.');
    } while (cursor && vueltas < 40);

    const ya = await idsGuardados(url, key, id);
    const faltan = pedidos.filter(p => !ya.has(String(p.id)));

    if (!faltan.length) {
      if (el) el.innerHTML = '<div class="small" style="color:#15803d;font-weight:700">' +
        'Up to date · ' + pedidos.length + ' invoices in range, nothing new.</div>';
      notaSync();
      return;
    }

    const meta = {};
    for (const p of faltan) meta[p.id] = p;

    // Se recorre por posición y no con un for clásico: una tanda puede
    // quedarse a medias por el presupuesto de tiempo del servidor, y
    // entonces hay que volver a por lo que faltó, no saltárselo.
    let hechas = 0, lineas = 0, fallidas = 0, primerFallo = '';
    let pos = 0;

    while (pos < faltan.length) {
      const tanda = faltan.slice(pos, pos + TANDA).map(p => p.id);
      const r = await llamar('sync-invoices', {
        restaurantUnitId: u, locationId: id, orderIds: tanda, meta
      });

      const n = r.hechos || 0;
      hechas += n;
      lineas += (r.lineas || 0);

      for (const f of (r.fallidos || [])) {
        fallidas++;
        if (!primerFallo) primerFallo = 'HTTP ' + f.status + ' ' + (f.mensaje || '');
      }

      if (r.error) {
        if (el) el.innerHTML = '<div class="small" style="color:#b45309">' +
          'Paused after <b>' + hechas + '</b> of ' + faltan.length + ' invoices (' +
          lineas + ' lines saved): ' + esc(r.error) +
          '<br>Press <b>Sync invoices</b> again — the ones already saved are skipped.</div>';
        return;
      }

      // Sin avance no hay bucle que valga: parar y decirlo es mejor que
      // dar vueltas eternamente sin guardar nada.
      if (!n) {
        if (el) el.innerHTML = '<div class="small" style="color:#b91c1c">' +
          'Stopped: the server processed none of the batch. ' + esc(primerFallo) + '</div>';
        return;
      }

      pos += n;
      paso('Saving invoice lines… <b>' + hechas + '</b> of ' + faltan.length +
           ' invoices, ' + lineas + ' lines' +
           (fallidas ? ', ' + fallidas + ' failed' : '') + '.');
    }

    // Procesar facturas y no guardar ni una línea no es un éxito, por
    // mucho que no haya saltado ningún error: hay que decirlo.
    const tono = lineas ? '#15803d' : '#b91c1c';
    if (el) el.innerHTML = '<div class="small" style="color:' + tono + ';font-weight:700">' +
      hechas + ' invoices processed · <b>' + lineas + '</b> lines saved' +
      (fallidas ? ' · ' + fallidas + ' failed' : '') + '</div>' +
      (fallidas && primerFallo
        ? '<div class="small muted" style="margin-top:5px">First failure: ' +
          esc(primerFallo) + '</div>'
        : '') +
      (!lineas
        ? '<div class="small" style="margin-top:5px">No lines means every detail ' +
          'request failed. Nothing was saved.</div>'
        : '');
    notaSync();
  }

  // ── Copiar el catálogo ───────────────────────────────────────────
  //
  // Da tantas vueltas como haga falta: el servidor trae lo que le cabe
  // en su presupuesto de tiempo, con pausas entre páginas para no
  // disparar el 429, y devuelve el cursor. Son miles de productos, así
  // que tarda — por eso el contador.
  async function sincronizar() {
    const el = document.getElementById('meSalida');
    const u = unidad();
    const id = await locationId();
    if (!u) { if (el) el.innerHTML = '<div class="small">Pick a restaurant first.</div>'; return; }
    if (!id) { if (el) el.innerHTML = '<div class="small">No location.</div>'; return; }

    let cursor = null, tipos = null, total = 0, vueltas = 0;

    do {
      const r = await llamar('sync-catalog', {
        restaurantUnitId: u, locationId: id,
        nextPage: cursor || undefined,
        tipos: tipos || undefined
      });

      total += r.guardados || 0;
      if (r.tipos) tipos = r.tipos;

      // Un corte no es el final: el servidor dejó apuntado dónde iba,
      // así que volver a pulsar continúa en vez de empezar de cero.
      if (r.error) {
        if (el) el.innerHTML = '<div class="small" style="color:#b45309">' +
          'Paused after <b>' + total + '</b> products this run: ' + esc(r.error) +
          '<br>Press <b>Sync catalog</b> again — it picks up where it stopped.</div>';
        notaSync();
        return;
      }

      cursor = r.nextPage || null;
      vueltas++;
      if (el) el.innerHTML = '<div class="small muted">Copying the catalog… <b>' +
        total + '</b> products saved.</div>';
    } while (cursor && vueltas < 80);

    if (el) el.innerHTML = '<div class="small" style="color:#15803d;font-weight:700">' +
      'Catalog saved · ' + total + ' products.</div>';
    notaSync();
  }

  window.BarStockIntegrations = { render, correr, unidad };

  // El index es el único dueño de showSettingsPanel; los módulos se
  // apuntan aquí en vez de envolverla.
  //
  // Este objeto se crea ANTES de usarlo. Parece obvio y no lo fue: el
  // gancho de meMatch se escribió unas líneas más arriba, reventó el
  // IIFE entero al cargar, y el síntoma no fue "no abre el emparejado"
  // sino que ningún botón del panel respondía, porque el módulo nunca
  // llegaba a definirse.
  window.__settingsHooks = window.__settingsHooks || {};
  window.__settingsHooks.integrations = render;
  window.__settingsHooks.meMatch = () => {
    if (window.BarStockMarginEdgeMatch) window.BarStockMarginEdgeMatch.abrir(unidad());
  };
})();
