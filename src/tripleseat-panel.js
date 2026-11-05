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

  // ── Copiar sin seleccionar ───────────────────────────────────────────
  //
  // Seleccionar a mano un <pre> de 300 líneas que hace scroll es el paso
  // que sobraba. Lo que se copia sale de `seguro`: lo mismo que se ve
  // arriba, y nunca los ejemplos crudos, que llevan datos de clientes. Se
  // arma aparte, sin leer el DOM, para que un bloque nuevo que se pinte
  // mañana no entre en lo copiado sin que nadie lo decida.
  let seguro = null;

  const SEGUROS_OK = ['accion', 'ruta', 'registros', 'intentos', 'envoltorio', 'cabeceras', 'bebidas', 'campos', 'forma',
    'permisos', 'expiraEnSegundos'];
  const SEGUROS_MAL = ['accion', 'paso', 'error', 'intentos', 'tripleseat', 'diagnostico'];

  function armarSeguro(res) {
    const out = {};
    for (const k of (res && res.ok ? SEGUROS_OK : SEGUROS_MAL)) {
      if (res && res[k] !== undefined && res[k] !== null) out[k] = res[k];
    }
    return out;
  }

  async function copiar(texto) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(texto); return true; }
    } catch (e) { /* sin permiso: se prueba a la antigua */ }
    try {
      const t = document.createElement('textarea');
      t.value = texto; t.setAttribute('readonly', '');
      t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch (e) { return false; }
  }

  async function alCopiar(b) {
    if (!seguro) return;
    const clave = b.dataset.copiar;
    const dato = clave === 'todo' ? seguro : seguro[clave];
    if (dato === undefined) return;
    const ok = await copiar(typeof dato === 'string' ? dato : JSON.stringify(dato, null, 2));
    const antes = b.dataset.texto || b.textContent;
    b.dataset.texto = antes;
    b.textContent = ok ? 'Copied' : 'Could not copy';
    setTimeout(() => { b.textContent = antes; }, 1500);
  }

  function botonCopiar(clave, texto) {
    return '<button type="button" class="ts-copiar" data-copiar="' + esc(clave) + '">' + esc(texto || 'Copy') + '</button>';
  }

  function bloque(titulo, dato, clave) {
    if (dato == null) return '';
    if (typeof dato === 'object' && !Object.keys(dato).length) return '';
    return '<div class="ts-tit">' + esc(titulo) + (clave ? botonCopiar(clave) : '') + '</div>' +
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

    res = res || {};
    seguro = armarSeguro(Object.assign({ accion: action }, res));

    if (!res.ok) {
      el.innerHTML =
        '<div class="ts-mal">' + esc(action) + ' · failed' + (res.paso ? ' at ' + esc(res.paso) : '') +
          botonCopiar('todo', 'Copy result') + '</div>' +
        '<div class="small">' + esc(res.error || 'Unknown error') + '</div>' +
        (intentos(res) ? '<div class="small muted ts-rutas">' + esc(intentos(res)) + '</div>' : '') +
        bloque('What TripleSeat said', res.tripleseat, 'tripleseat') +
        bloque('Diagnosis', res.diagnostico, 'diagnostico');
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
      '<div class="ts-bien">' + esc(action) + ' · ok' + (linea.length ? ' · ' + esc(linea.join(' · ')) : '') +
        botonCopiar('todo', 'Copy results') + '</div>' +
      (res.ruta ? '<div class="small muted">Route: <b>' + esc(res.ruta) + '</b></div>' : '') +
      (intentos(res) ? '<div class="small muted ts-rutas">' + esc(intentos(res)) + '</div>' : '') +
      bloque('Bar packages · from the online planner', res.bebidas, 'bebidas') +
      bloque('Values per field', res.campos, 'campos') +
      bloque('Nested fields · names only', res.forma, 'forma') +
      bloque('Around the list', res.envoltorio, 'envoltorio') +
      bloque('Paging headers', res.cabeceras, 'cabeceras') +
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
    // Un solo escuchador para los botones de copiar: el resultado se
    // repinta entero con cada pregunta y engancharlos uno a uno sería
    // volver a hacerlo cada vez.
    const sal = $('tsSalida');
    if (sal) sal.addEventListener('click', e => {
      const b = e.target && e.target.closest && e.target.closest('[data-copiar]');
      if (b) alCopiar(b);
    });

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
