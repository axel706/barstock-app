(() => {
  if (window.BarStockGuest) return;
  // ── El bartender invitado: ve todo, sólo escribe recetas ─────────────
  //
  // Axel, 2026-11-12: "puede seguir viendo todo, absolutamente toda la
  // información, pero no puede editar nada que no son las recetas".
  //
  // Quién es invitado: quien sólo puede editar recetas (ver `activo`,
  // más abajo; hasta los roles era app_metadata.role === 'bartender').
  // Lo pone api/admin.js al crearlo, y app_metadata sólo lo puede
  // escribir el servidor (user_metadata lo podría cambiar el propio
  // Billie). Viene dentro de la sesión que supabase-js guarda en
  // localStorage, así que se sabe al instante, antes de pintar nada y
  // antes de la primera llamada, sin preguntarle a nadie.
  //
  // ── Por qué un candado en fetch y no en cada botón ──────────────────
  //
  // Hay 46 módulos que escriben con fetch y 15 con supabase-js. Ir botón
  // por botón deja siempre uno: el que no se vio. Aquí se mira CADA
  // escritura que sale del navegador, y sólo pasan las de recetas. Los
  // botones también se esconden (mobile-app.css, html.bs-guest), pero
  // eso es para que se vea limpio; lo que impide escribir es esto.
  //
  // Y lo que esto NO es: un candado de verdad. Con las políticas RLS en
  // `using (true)`, alguien con la sesión de Billie y conocimientos
  // podría escribir saltándose la app. Axel lo sabe (Fase 0). Lo que sí
  // se niega en el servidor: api/admin.js (sólo Axel) y las acciones de
  // api/integrations.js que escriben o mandan (lib/integracion.js).

  const MENSAJE = 'Guests can only edit recipes.';
  // Los permisos (src/permisos.js, cargado antes que esto).
  const P = window.BarStockPermisos;

  // La sesión guardada, leída sólo cuando cambia: fetch pasa por aquí en
  // cada llamada y localStorage es barato, JSON.parse de una sesión no.
  let _crudo = null, _usuario = null;
  function usuario() {
    let crudo = null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/^sb-.+-auth-token$/.test(k)) { crudo = localStorage.getItem(k); break; }
      }
    } catch (e) { crudo = null; }
    if (crudo === _crudo) return _usuario;
    _crudo = crudo;
    try {
      const s = crudo ? JSON.parse(crudo) : null;
      _usuario = (s && (s.user || (s.currentSession && s.currentSession.user))) || null;
    } catch (e) { _usuario = null; }
    return _usuario;
  }

  // ── Los roles (2026-11-13) ────────────────────────────────────────────
  //
  // Una persona de PIN lleva en su sesión su rol y lo que puede
  // (app_metadata, escrito por api/admin.js). Sin sesión, o un usuario de
  // correo sin rol: todo, como hasta hoy.
  function persona() {
    const u = usuario();
    if (P) return P.dePin(u);
    return !!(u && u.app_metadata && u.app_metadata.role === 'bartender');
  }
  // Sin permisos.js (no debería pasar: carga antes) no se adivina: null
  // es "no se sabe", y activo() vuelve a la regla de antes de los roles.
  // El id de quien entró: People no le deja cambiarse a sí mismo.
  function id() {
    const u = usuario();
    return (u && u.id) || null;
  }
  // La clave del rol de una persona de PIN ('owner', 'manager', …), o
  // null para un usuario de los de siempre.
  function rol() {
    const u = usuario();
    return persona() ? u.app_metadata.role : null;
  }
  function permisos() {
    const u = usuario();
    if (!P) return null;
    return u ? P.deUsuario(u) : P.TODOS.slice();
  }
  function puede(k) {
    const p = permisos();
    return !p || p.indexOf(k) >= 0;
  }

  // El candado (lo que sigue de aquí abajo) es para quien SÓLO puede
  // editar recetas: el bartender de siempre, o un rol hecho igual. Es la
  // única regla que se cumple de verdad en la app, porque las recetas
  // tienen sus propias tablas. Para los demás permisos, esconder es lo que
  // hay (hablado con Axel, 2026-11-13); un candado por permiso es la Fase 0.
  function activo() {
    if (!persona()) return false;
    const p = permisos();
    if (!p) { const u = usuario(); return u.app_metadata.role === 'bartender'; }
    return P.soloRecetas(p);
  }

  function nombre() {
    const u = usuario();
    const m = (u && u.user_metadata) || {};
    return String(m.first_name || '').trim();
  }

  // ── Lo que un invitado puede escribir ─────────────────────────────────
  const RECETAS = ['toast_recipes', 'toast_recipe_lines'];
  // De /api/ sólo lo que lee o avisa. integrations, menos lo que escribe
  // (sync) o manda correo (send); el servidor lo niega también.
  const API_SI = ['log', 'notify', 'weekly-briefing', 'integrations'];
  const ACCION_NO = ['sync', 'send'];

  function json(cuerpo) {
    if (cuerpo == null) return null;
    if (typeof cuerpo !== 'string') return undefined;   // FormData, Blob…: no se adivina
    try { return JSON.parse(cuerpo); } catch (e) { return undefined; }
  }

  // ¿Puede salir esta llamada? url (texto), metodo, cuerpo (lo que se
  // pasó a fetch). Exportada para la prueba: es la regla entera.
  function permitido(url, metodo, cuerpo) {
    const m = String(metodo || 'GET').toUpperCase();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
    let u;
    try { u = new URL(url, location.href); } catch (e) { return false; }
    const ruta = u.pathname;

    // La sesión: entrar, renovarla y salir. Cambiar la contraseña no:
    // el PIN lo da Axel, y si Billie lo cambiara Axel ya no sabría cuál es.
    if (/^\/auth\/v1\//.test(ruta)) return !(ruta === '/auth/v1/user' && m === 'PUT');

    const api = /^\/api\/([a-z-]+)/.exec(ruta);
    if (api) {
      if (API_SI.indexOf(api[1]) < 0) return false;
      if (api[1] !== 'integrations') return true;
      const b = json(cuerpo);
      return !!(b && typeof b === 'object' && ACCION_NO.indexOf(b.action) < 0);
    }

    const rest = /^\/rest\/v1\/([a-z0-9_]+)/.exec(ruta);
    if (!rest) return false;
    if (RECETAS.indexOf(rest[1]) >= 0) return true;
    // "Not a drink" en la pestaña From Toast de Recipes: una fila
    // 'ignored' de licor en toast_item_links. Nada más de esa tabla, que
    // es también el emparejamiento de vinos y licores.
    if (rest[1] === 'toast_item_links' && m === 'POST') {
      const b = json(cuerpo);
      const filas = Array.isArray(b) ? b : (b ? [b] : []);
      return filas.length > 0 && filas.every(f => f && f.status === 'ignored' && f.kind === 'liquor');
    }
    // Y su Restore (Not drinks, 2026-11-13): borrar SÓLO filas ignored de
    // licor. Quien puede marcar tiene que poder deshacerlo.
    if (rest[1] === 'toast_item_links' && m === 'DELETE') {
      const q = u.searchParams;
      return q.get('status') === 'eq.ignored' && q.get('kind') === 'eq.liquor' && /^eq\./.test(q.get('toast_item_guid') || '');
    }
    return false;
  }

  // Una respuesta como las de PostgREST: los módulos que leen
  // `message` de un error enseñan esto, no un "Failed to fetch".
  function negar() {
    return new Response(JSON.stringify({ ok: false, code: 'guest', message: MENSAJE, error: MENSAJE }), {
      status: 403, statusText: 'Forbidden', headers: { 'Content-Type': 'application/json' }
    });
  }

  const original = window.fetch && window.fetch.bind(window);
  if (original) {
    window.fetch = function (entrada, opciones) {
      if (!activo()) return original(entrada, opciones);
      const esReq = typeof Request !== 'undefined' && entrada instanceof Request;
      const url = esReq ? entrada.url : String(entrada);
      const metodo = (opciones && opciones.method) || (esReq ? entrada.method : 'GET');
      const cuerpo = opciones ? opciones.body : undefined;
      if (permitido(url, metodo, cuerpo)) return original(entrada, opciones);
      try { console.warn('[guest] blocked', String(metodo).toUpperCase(), url); } catch (e) {}
      return Promise.resolve(negar());
    };
  }

  // La marca en <html> desde el primer fotograma: el CSS esconde con
  // ella lo que edita, y así nunca se ve aparecer y desaparecer.
  // Y una marca por cada permiso que falta (`bs-sin-contar`, …): el CSS
  // esconde con ellas lo de cada permiso.
  function marcar() {
    try {
      const h = document.documentElement;
      h.classList.toggle('bs-guest', activo());
      const p = permisos();
      for (const k of (P ? P.TODOS : [])) h.classList.toggle('bs-sin-' + k, !!p && p.indexOf(k) < 0);
    } catch (e) {}
  }
  marcar();

  window.BarStockGuest = { activo, persona, id, rol, permisos, puede, nombre, permitido, marcar, MENSAJE };
})();
