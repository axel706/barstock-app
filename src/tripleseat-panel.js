(() => {
  if (window.BarStockTripleseatPanel) return;

  // ── TripleSeat · Developer tools ─────────────────────────────────────
  //
  // Lo mismo que el plegable de MarginEdge, para TripleSeat: botones que
  // preguntan a /api/integrations?provider=tripleseat y enseñan lo que
  // contesta. Existe porque la fase 1 se hizo pegando código en la
  // consola, y cada pregunta eran tres pasos y una revisión a mano de
  // que la salida no llevara datos de clientes.
  //
  // No escribe NADA, ni en Supabase ni en TripleSeat. La función tampoco
  // podría: la credencial sólo tiene permisos de lectura.
  //
  // Se dibuja al abrir el plegable y no con el gancho de `integrations`:
  // ese gancho es uno solo y es de MarginEdge. Apuntarse ahí era pisarlo.
  //
  // ── Los ejemplos crudos, plegados ────────────────────────────────────
  //
  // Un evento trae el contacto del cliente (nombre, correo, teléfono).
  // Lo de arriba —valores por campo, forma de lo anidado— se puede
  // enseñar o mandar en una captura; los ejemplos no, y por eso no se
  // abren solos.

  const ACCIONES = [
    { id: 'ping',      nombre: 'Ping',      nota: 'Does the login work' },
    { id: 'locations', nombre: 'Locations', nota: 'Restaurants and rooms' },
    { id: 'events',    nombre: 'Events',    nota: 'By creation, uses Page' },
    { id: 'search',    nombre: 'Search',    nota: 'By date, uses From/To' },
    { id: 'menu',      nombre: 'Menu',      nota: 'One event, uses Event id' },
    { id: 'bookings',  nombre: 'Bookings',  nota: 'Uses Page' }
  ];

  const DIAS_BUSQUEDA = 14;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // La fecha local, no la de toISOString: a las 9 de la noche en Nueva
  // York, UTC ya es mañana y "hoy" saldría corrido un día.
  function dia(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  const $ = id => document.getElementById(id);

  async function llamar(action, params) {
    const S = window.BarStockSupabase;
    const client = S && S.getClient && S.getClient();
    const { data } = client ? await client.auth.getSession() : { data: null };
    const token = (data && data.session && data.session.access_token) || '';
    const r = await fetch('/api/integrations?provider=tripleseat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action, params: params || {} })
    });
    return r.json();
  }

  function params(action) {
    const p = {};
    const pag = ($('tsPagina') || {}).value;
    if (pag && (action === 'events' || action === 'bookings' || action === 'search')) p.page = pag;
    if (action === 'search') {
      p.event_start_date = ($('tsDesde') || {}).value || '';
      p.event_end_date = ($('tsHasta') || {}).value || '';
    }
    if (action === 'menu') p.event_id = (($('tsEvento') || {}).value || '').trim();
    return p;
  }

  function bloque(titulo, dato) {
    if (dato == null) return '';
    if (typeof dato === 'object' && !Object.keys(dato).length) return '';
    return '<div class="ts-tit">' + esc(titulo) + '</div>' +
      '<pre class="ts-pre">' + esc(typeof dato === 'string' ? dato : JSON.stringify(dato, null, 2)) + '</pre>';
  }

  // La muestra llega como texto (la función la recorta). Si se puede
  // leer, se enseña con sangría; si no, tal cual.
  function legible(m) {
    if (typeof m !== 'string') return m;
    try { return JSON.parse(m); } catch (e) { return m; }
  }

  function intentos(res) {
    return (res.intentos || []).map(i =>
      i.ruta + ' → ' + i.status + (i.registros != null ? ' (' + i.registros + ')' : '')).join('  ·  ');
  }

  function pintar(action, res) {
    const el = $('tsSalida');
    if (!el) return;

    if (!res || !res.ok) {
      res = res || {};
      el.innerHTML =
        '<div class="ts-mal">' + esc(action) + ' · failed' + (res.paso ? ' at ' + esc(res.paso) : '') + '</div>' +
        '<div class="small">' + esc(res.error || 'Unknown error') + '</div>' +
        (intentos(res) ? '<div class="small muted ts-rutas">' + esc(intentos(res)) + '</div>' : '') +
        bloque('What TripleSeat said', res.tripleseat) +
        bloque('Diagnosis', res.diagnostico);
      return;
    }

    const env = res.envoltorio || {};
    const linea = [];
    if (res.registros != null) linea.push(res.registros + ' records');
    if (env.total_pages != null) linea.push(env.total_pages + ' pages');
    if (res.permisos) linea.push('scopes: ' + res.permisos);
    if (res.expiraEnSegundos) linea.push('token for ' + Math.round(res.expiraEnSegundos / 60) + ' min');

    const ejemplos = res.muestra != null ? res.muestra : res.crudo;

    el.innerHTML =
      '<div class="ts-bien">' + esc(action) + ' · ok' + (linea.length ? ' · ' + esc(linea.join(' · ')) : '') + '</div>' +
      (res.ruta ? '<div class="small muted">Route: <b>' + esc(res.ruta) + '</b></div>' : '') +
      (intentos(res) ? '<div class="small muted ts-rutas">' + esc(intentos(res)) + '</div>' : '') +
      bloque('Bar packages · from the online planner', res.bebidas) +
      bloque('Values per field', res.campos) +
      bloque('Nested fields · names only', res.forma) +
      bloque('Around the list', res.envoltorio) +
      bloque('Paging headers', res.cabeceras) +
      (ejemplos != null
        ? '<details class="ts-crudo"><summary>Raw examples · contain customer data</summary>' +
          bloque('', legible(ejemplos)) + '</details>'
        : '');

    // El id del primer evento queda puesto para Menu: copiarlo a mano
    // del bloque de ejemplos era justo el paso que sobraba.
    if (action === 'search' || action === 'events') {
      const lista = legible(res.muestra);
      const id = Array.isArray(lista) && lista[0] && lista[0].id;
      const caja = $('tsEvento');
      if (id && caja) caja.value = String(id);
    }
  }

  function fallo(action, e) {
    console.error('[tripleseat]', e);
    pintar(action, { ok: false, error: 'Something broke in the browser: ' + ((e && e.message) || String(e)) });
  }

  async function correr(action) {
    const el = $('tsSalida');
    if (!el) { console.error('[tripleseat] falta #tsSalida'); return; }
    el.innerHTML = '<div class="small muted">Asking TripleSeat…</div>';
    let res;
    try { res = await llamar(action, params(action)); }
    catch (e) { return fallo(action, e); }
    pintar(action, res);
  }

  function render() {
    const cont = $('tsBotones');
    if (!cont || cont.dataset.listo === '1') return;
    cont.dataset.listo = '1';

    const hoy = new Date();
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + DIAS_BUSQUEDA);
    const cajas = $('tsCajas');
    if (cajas) {
      cajas.innerHTML =
        '<label class="small muted">From <input type="date" id="tsDesde" value="' + dia(hoy) + '"></label>' +
        '<label class="small muted">To <input type="date" id="tsHasta" value="' + dia(fin) + '"></label>' +
        '<label class="small muted">Page <input type="number" id="tsPagina" min="1" placeholder="1" class="ts-corta"></label>' +
        '<label class="small muted">Event id <input type="text" id="tsEvento" inputmode="numeric" placeholder="from Search" class="ts-media"></label>';
    }

    cont.innerHTML = ACCIONES.map(a =>
      '<button type="button" class="ui-control ts-b" data-ts="' + a.id + '">' +
      '<span class="ts-bn">' + esc(a.nombre) + '</span>' +
      '<span class="small muted ts-bt">' + esc(a.nota) + '</span></button>').join('');

    // Un fallo dentro del manejador se traga el clic y el botón parece
    // muerto: es lo que ya pasó dos veces en el panel de MarginEdge.
    cont.querySelectorAll('[data-ts]').forEach(b => {
      b.onclick = () => {
        try {
          const p = correr(b.dataset.ts);
          if (p && p.catch) p.catch(e => fallo(b.dataset.ts, e));
        } catch (e) { fallo(b.dataset.ts, e); }
      };
    });
  }

  // `toggle` no burbujea, pero se ve en la fase de captura del
  // documento. Así da igual si el plegable ya existe cuando carga este
  // archivo: no depende del orden ni de DOMContentLoaded.
  document.addEventListener('toggle', e => {
    if (e.target && e.target.id === 'tsDiag' && e.target.open) render();
  }, true);

  window.BarStockTripleseatPanel = { render, correr, pintar };
})();
