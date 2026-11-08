(() => {
  if (window.BarStockToastWine) return;

  // ── El vino de Toast, emparejado con el inventario ───────────────────
  //
  // Las ventas que usan Theoretical Usage y Consumption Match vienen de un
  // CSV de MarginEdge, ya en BOTELLAS. Toast da copas. Para pasar de unas
  // a otras, cada artículo de vino de Toast apunta a un vino del
  // inventario (tabla toast_item_links, migración 027). Esto es la lógica
  // de ese emparejamiento; la pintan dos vistas, la tabla del escritorio
  // (toast-wine-panel.js) y las tarjetas del teléfono
  // (mobile-toast-wine.js). Axel pidió las dos. Vive en UN sitio porque
  // dos copias de "qué se sugiere" o "qué se guarda" acabarían diciendo
  // cosas distintas.
  //
  // ── La locación ──────────────────────────────────────────────────────
  //
  // En Vercel hay UN restaurante de Toast. Si la locación abierta no es
  // ese restaurante (locations.toast_restaurant_guid), no se deja tocar
  // nada: emparejar el vino de Crown con el inventario de Will's sería
  // peor que no emparejarlo.

  // Axel: "es de 6 oz todo el tiempo".
  const COPA_OZ = 6;
  const DIAS = 7;

  const cfg = () => window.BARSTOCK_CONFIG || {};
  const H = () => ({ apikey: cfg().SUPABASE_KEY, Authorization: 'Bearer ' + cfg().SUPABASE_KEY });

  let _d = null;          // lo cargado: { estado, filas, productos, ... }
  let _cargando = null;
  const _oyentes = new Set();
  const avisar = () => _oyentes.forEach(f => { try { f(_d); } catch (e) {} });

  // ── Llamar a Toast, por la función del servidor ──────────────────────
  async function toast(action, params) {
    const S = window.BarStockSupabase;
    const client = S && S.getClient && S.getClient();
    const { data } = client ? await client.auth.getSession() : { data: null };
    const token = (data && data.session && data.session.access_token) || '';
    const r = await fetch('/api/integrations?provider=toast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action, params: params || {} })
    });
    try { return await r.json(); }
    catch (e) { return { ok: false, error: 'The server answered ' + r.status + ' without data.' }; }
  }

  // Los días de negocio de la semana que acaba ayer, en Nueva York. Ayer y
  // no hoy: el día de hoy todavía no está cerrado.
  function diasAtras(n, ahora) {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    const out = [];
    for (let k = 1; k <= n; k++) out.push(fmt.format(new Date((ahora || Date.now()) - k * 86400000)).replace(/-/g, ''));
    return out;
  }

  // ── Sugerir el vino del inventario por el nombre ─────────────────────
  //
  // Toast escribe "Sauv Blanc - Whitehaven"; el inventario, "Whitehaven
  // Sauvignon Blanc". Se comparan palabras, no el texto entero, y una
  // palabra corta casa con la larga que empieza igual ("sauv" con
  // "sauvignon", "grando" con "grande"). Las palabras que dicen cómo se
  // sirve, y no qué vino es, no cuentan.
  const VACIAS = new Set(['btl', 'bottle', 'glass', 'gls', 'hh', 'wine', 'by', 'the', 'house', 'of', 'and', 'de', 'la', 'le', 'les']);
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const palabras = (t) => norm(t).replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter(w => w && !VACIAS.has(w) && !/^\d+(ml|l|oz)?$/.test(w));
  const casan = (a, b) => a === b ||
    (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) ||
    (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));

  function sugerir(nombreToast, productos) {
    const t = palabras(nombreToast);
    if (!t.length) return { producto: null, nivel: 'none' };
    const puntos = productos.map(p => {
      const w = palabras(p);
      const hits = t.filter(x => w.some(y => casan(x, y))).length;
      // También desde el producto: "Red Blend - The Arborist" sólo tiene
      // una de sus tres palabras en "The Arborist" (1/3, no llegaba), pero
      // "The Arborist" está ENTERO en el nombre de Toast. Esto sólo decide
      // qué se ofrece; "seguro" (abajo) sigue mirando el lado de Toast.
      const delProducto = w.length ? w.filter(y => t.some(x => casan(x, y))).length / w.length : 0;
      const st = hits / t.length;
      return { p, s: Math.max(st, delProducto), st, hits };
    }).sort((a, b) => b.s - a.s || b.st - a.st);
    const [uno, dos] = puntos;
    if (!uno || uno.s < 0.4) return { producto: null, nivel: 'none' };
    // Claro solo si casa casi todo, con al menos DOS palabras, y no hay
    // otro igual de bueno. Con una sola palabra "HH Prosecco" salía seguro
    // de ser el Nino Ardevi, y puede ser otro prosecco más barato. Dos
    // vinos de la misma bodega empatan, y eso lo decide una persona.
    const claro = uno.st >= 0.75 && uno.hits >= 2 && !(dos && dos.s === uno.s && dos.st === uno.st);
    return { producto: uno.p, nivel: claro ? 'high' : 'mid' };
  }

  // Todo el inventario, no sólo lo que tiene categoría Wine. Se filtraba
  // por categoría y en Crown The Arborist no salía en la lista: casi
  // ningún artículo tiene categoría (mobile-inventory.js lo dice en
  // `faltas`), así que el filtro dejaba fuera a casi todos los vinos sin
  // avisar. El proveedor tampoco sirve: "WINE MERCHANT" es un proveedor,
  // no una forma de saber qué es vino.
  function productosDelInventario() {
    const m = (window.state && window.state.master) || [];
    return [...new Set(m.filter(r => r && r.item).map(r => r.item))]
      .sort((a, b) => norm(a).localeCompare(norm(b)));
  }

  // ── Cargar ───────────────────────────────────────────────────────────
  async function cargar(op) {
    op = op || {};
    if (_cargando) return _cargando;
    if (_d && _d.estado === 'listo' && !op.otraVez) return _d;
    _cargando = (async () => {
      try {
        _d = { estado: 'cargando', progreso: 0, total: DIAS };
        avisar();

        const locationId = await window.BarStockInventoryCloud.fetchLocationId();
        const rl = await fetch(cfg().SUPABASE_URL + '/rest/v1/locations?id=eq.' + locationId + '&select=toast_restaurant_guid', { headers: H() });
        const tl = await rl.text();
        if (!rl.ok) {
          // Lo que dijo Supabase, tal cual: si es que falta la columna, lo
          // dirá él. No se adivina la causa.
          _d = { estado: 'error', donde: 'location', error: 'Supabase answered ' + rl.status + ': ' + tl.slice(0, 200) };
          return _d;
        }
        const guidLoc = String(((JSON.parse(tl) || [])[0] || {}).toast_restaurant_guid || '').trim();

        // El primer día va solo y trae el menú: de ahí salen los vinos.
        // Los otros seis piden sólo lo vendido de esos vinos, sin menú.
        // Antes cada día leía el menú, tres a la vez, y Toast, que limita
        // esas lecturas, contestó 429 la primera vez que se abrió en Crown.
        const dias = diasAtras(DIAS, op.ahora);
        const res = new Array(dias.length);
        const contar = (r) => { _d.progreso++; avisar(); return r; };
        res[0] = contar(await toast('wine', { businessDate: dias[0] }));
        if (res[0] && res[0].ok) {
          const guids = (res[0].articulos || []).map(a => a.guid);
          // De dos en dos: cada día son varias páginas de órdenes, y
          // Toast también limita esas.
          let i = 1;
          async function obrero() {
            while (i < dias.length) {
              const k = i++;
              res[k] = contar(await toast('wine', { businessDate: dias[k], guids }));
            }
          }
          await Promise.all([obrero(), obrero()]);
        }

        const malo = res.find(r => !r || !r.ok);
        if (malo) {
          _d = { estado: 'error', donde: 'toast', error: (malo && (malo.error || ('Toast answered ' + (malo.status || '?') + (malo.paso ? ' at ' + malo.paso : '')))) || 'No answer from Toast.' };
          return _d;
        }
        const restaurante = res[0].restaurante;
        if (!guidLoc) { _d = { estado: 'sinRestaurante', restaurante }; return _d; }
        if (guidLoc !== restaurante) { _d = { estado: 'otroRestaurante', restaurante, guidLoc }; return _d; }

        const articulos = new Map();
        for (const r of res) for (const a of r.articulos || []) articulos.set(a.guid, a);
        const vendido = {};
        for (const r of res) for (const [g, q] of Object.entries(r.vendido || {})) vendido[g] = (vendido[g] || 0) + q;

        const rk = await fetch(cfg().SUPABASE_URL + '/rest/v1/toast_item_links?location_id=eq.' + locationId +
          '&kind=eq.wine&select=toast_item_guid,item_name,status,pour_oz', { headers: H() });
        const tk = await rk.text();
        if (!rk.ok) { _d = { estado: 'error', donde: 'links', error: 'Supabase answered ' + rk.status + ': ' + tk.slice(0, 200) }; return _d; }
        const enlaces = new Map((JSON.parse(tk) || []).map(e => [e.toast_item_guid, e]));

        const productos = productosDelInventario();
        const filas = [...articulos.values()].map(a => {
          const e = enlaces.get(a.guid);
          const base = { guid: a.guid, nombre: a.nombre, grupo: a.grupo, servicio: a.servicio, vendido: vendido[a.guid] || 0 };
          if (e && e.status === 'confirmed') return Object.assign(base, { estado: 'confirmed', producto: e.item_name, nivel: null });
          if (e && e.status === 'ignored') return Object.assign(base, { estado: 'ignored', producto: null, nivel: null });
          const s = sugerir(a.nombre, productos);
          return Object.assign(base, { estado: 'review', producto: s.producto, nivel: s.nivel });
        }).sort((x, y) => (y.vendido - x.vendido) || norm(x.nombre).localeCompare(norm(y.nombre)));

        _d = { estado: 'listo', locationId, restaurante, productos, filas, dias, completo: res.every(r => r.diaCompleto) };
        return _d;
      } catch (e) {
        _d = { estado: 'error', donde: 'app', error: String((e && e.message) || e) };
        return _d;
      } finally {
        _cargando = null;
        avisar();
      }
    })();
    return _cargando;
  }

  // ── Guardar: primero la nube, luego la memoria ───────────────────────
  //
  // Al revés, un fallo de red dejaría la pantalla diciendo "confirmado" y
  // la base de datos sin la fila.
  async function escribir(fila, cambios) {
    const cuerpo = Object.assign({
      location_id: _d.locationId, toast_item_guid: fila.guid, toast_item_name: fila.nombre,
      toast_group: fila.grupo, kind: 'wine', updated_at: new Date().toISOString()
    }, cambios);
    const r = await fetch(cfg().SUPABASE_URL + '/rest/v1/toast_item_links?on_conflict=location_id,toast_item_guid', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, H()),
      body: JSON.stringify(cuerpo)
    });
    if (!r.ok) throw new Error('Supabase answered ' + r.status + ': ' + (await r.text()).slice(0, 200));
  }

  const fila = (guid) => (_d && _d.filas || []).find(f => f.guid === guid);
  const listo = () => _d && _d.estado === 'listo';

  async function confirmar(guid, producto) {
    const f = fila(guid);
    if (!listo() || !f || !producto) return false;
    await escribir(f, { item_name: producto, pour_oz: f.servicio === 'bottle' ? null : COPA_OZ, status: 'confirmed' });
    Object.assign(f, { estado: 'confirmed', producto, nivel: null });
    avisar();
    return true;
  }

  async function ignorar(guid) {
    const f = fila(guid);
    if (!listo() || !f) return false;
    await escribir(f, { item_name: null, pour_oz: null, status: 'ignored' });
    Object.assign(f, { estado: 'ignored', producto: null, nivel: null });
    avisar();
    return true;
  }

  // Deshacer borra la fila: el artículo vuelve a "por revisar", con su
  // sugerida otra vez.
  async function deshacer(guid) {
    const f = fila(guid);
    if (!listo() || !f) return false;
    const r = await fetch(cfg().SUPABASE_URL + '/rest/v1/toast_item_links?location_id=eq.' + _d.locationId +
      '&toast_item_guid=eq.' + encodeURIComponent(guid), { method: 'DELETE', headers: H() });
    if (!r.ok) throw new Error('Supabase answered ' + r.status + ': ' + (await r.text()).slice(0, 200));
    const s = sugerir(f.nombre, _d.productos);
    Object.assign(f, { estado: 'review', producto: s.producto, nivel: s.nivel });
    avisar();
    return true;
  }

  // Solo las claras ("Suggested"). Las dudosas las mira una persona.
  async function confirmarSugeridas() {
    const claras = (_d && _d.filas || []).filter(f => f.estado === 'review' && f.nivel === 'high' && f.producto);
    let n = 0;
    for (const f of claras) { await confirmar(f.guid, f.producto); n++; }
    return n;
  }

  // Lo que se enseña de cómo se sirve, igual en las dos vistas.
  const servicioTexto = (f) => f.servicio === 'bottle' ? 'Bottle · 1' : 'Glass · ' + COPA_OZ + ' oz';

  window.BarStockToastWine = {
    cargar, confirmar, ignorar, deshacer, confirmarSugeridas,
    datos: () => _d,
    alCambiar: (f) => { _oyentes.add(f); return () => _oyentes.delete(f); },
    servicioTexto, COPA_OZ, DIAS,
    _sugerir: sugerir, _diasAtras: diasAtras, _reset: () => { _d = null; _cargando = null; }
  };
})();
