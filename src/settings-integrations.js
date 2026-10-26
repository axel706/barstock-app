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
    { id: 'packaging',  nombre: 'Empaques',     nota: 'Qué es una unidad' }
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
      '</div>';
  }

  function rango() {
    const d = document.getElementById('meDesde');
    const h = document.getElementById('meHasta');
    return { startDate: d && d.value, endDate: h && h.value };
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
      bloque('Ejemplos', res.muestra != null ? res.muestra : res.crudo);
  }

  async function correr(action) {
    const el = document.getElementById('meSalida');
    if (el) el.innerHTML = '<div class="small muted">Preguntando a MarginEdge…</div>';

    let res;
    try {
      const params = {};
      const u = unidad();
      if (u && action !== 'units') params.restaurantUnitId = u;
      if (action === 'invoices') Object.assign(params, rango());
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

    cont.querySelectorAll('[data-me]').forEach(b => {
      b.onclick = () => correr(b.dataset.me);
    });

    pintarFechas();
    pintarEstado();
    cargarUnidad().then(() => pintarEstado());
  }

  window.BarStockIntegrations = { render, correr };

  // El index es el único dueño de showSettingsPanel; los módulos se
  // apuntan aquí en vez de envolverla.
  window.__settingsHooks = window.__settingsHooks || {};
  window.__settingsHooks.integrations = render;
})();
