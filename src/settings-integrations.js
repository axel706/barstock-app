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

  const LS_UNIT = 'bs_me_unit';

  const ACCIONES = [
    { id: 'units',      nombre: 'Restaurantes', nota: 'Qué ve la clave' },
    { id: 'vendors',    nombre: 'Proveedores',  nota: 'Con quién compras' },
    { id: 'products',   nombre: 'Productos',    nota: 'El catálogo' },
    { id: 'categories', nombre: 'Categorías',   nota: 'Cómo los agrupa' },
    { id: 'invoices',   nombre: 'Facturas',     nota: 'Qué entró y a qué precio' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function unidad() {
    try { return localStorage.getItem(LS_UNIT) || ''; } catch (e) { return ''; }
  }

  function guardarUnidad(id) {
    try { id ? localStorage.setItem(LS_UNIT, id) : localStorage.removeItem(LS_UNIT); } catch (e) {}
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
    cont.innerHTML =
      '<div class="small muted" style="margin:14px 0 7px">' +
      'Elige con cuál trabajamos. Se guarda en este navegador.</div>' +
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
      b.onclick = () => { guardarUnidad(b.dataset.unit); pintarUnidades(lista); pintarEstado(); };
    });
  }

  function pintarEstado() {
    const el = document.getElementById('meEstado');
    if (!el) return;
    const u = unidad();
    el.innerHTML = u
      ? 'Restaurante seleccionado: <b>' + esc(u) + '</b>'
      : 'Sin restaurante seleccionado. Empieza por <b>Restaurantes</b>.';
  }

  function pintarResultado(action, res) {
    const el = document.getElementById('meSalida');
    if (!el) return;

    const intentos = (res.intentos || [])
      .map(i => i.ruta + ' → ' + (i.status != null ? i.status : i.error))
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
        (res.nextPage ? ' · hay más páginas' : '') +
        (intentos ? '<br>' + esc(intentos) : '') +
      '</div>' +
      (campos
        ? '<div class="small" style="margin-bottom:10px">Campos: <b>' + esc(campos) + '</b></div>'
        : '') +
      '<pre style="max-height:320px;overflow:auto;font-size:11px;line-height:1.5;' +
        'background:rgba(0,0,0,.25);padding:12px;border-radius:10px;white-space:pre-wrap;' +
        'word-break:break-word">' +
        esc(JSON.stringify(res.muestra != null ? res.muestra : res.crudo, null, 2)) +
      '</pre>';
  }

  async function correr(action) {
    const el = document.getElementById('meSalida');
    if (el) el.innerHTML = '<div class="small muted">Preguntando a MarginEdge…</div>';

    let res;
    try {
      const params = {};
      const u = unidad();
      if (u && action !== 'units') params.restaurantUnitId = u;
      res = await llamar(action, params);
    } catch (e) {
      res = { ok: false, error: String(e && e.message || e) };
    }

    pintarResultado(action, res);

    if (action === 'units' && res.ok) pintarUnidades(res.muestra || []);
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

    pintarEstado();
  }

  window.BarStockIntegrations = { render, correr };

  // El index es el único dueño de showSettingsPanel; los módulos se
  // apuntan aquí en vez de envolverla.
  window.__settingsHooks = window.__settingsHooks || {};
  window.__settingsHooks.integrations = render;
})();
