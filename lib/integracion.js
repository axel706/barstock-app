const { createClient } = require('@supabase/supabase-js');
// Los permisos de cada persona: el mismo archivo que usa la app.
const P = require('../src/permisos.js');

// ── Lo que comparten las integraciones ───────────────────────────────
//
// Toast fue la primera y llevaba estas piezas dentro (lib/toast.js).
// TripleSeat necesita exactamente las mismas, y copiarlas era empezar
// dos versiones que un día dicen cosas distintas: una que sigue
// comprobando la sesión y otra que no, un límite de tiempo en una y no
// en otra.
//
// La SESIÓN no se comprueba aquí dentro de cada integración: la
// comprueba api/integrations.js una sola vez, antes de repartir. Así una
// integración nueva no puede olvidarse de hacerlo.

// Hobby corta las funciones a los 10 s. Cada petición lleva su propio
// tope para que una que se cuelga no se lleve la respuesta entera.
const TIMEOUT_MS = 7000;
const LIMITE_CRUDO = 20000;     // caracteres de una muestra en crudo

// Muchas APIs dicen cuántas páginas hay en las cabeceras y no en el
// cuerpo. Sólo éstas salen de la función: una lista blanca, porque las
// demás pueden llevar cookies o identificadores de sesión del servicio.
const CABECERAS_PAGINACION = ['link', 'x-total', 'x-total-count', 'x-total-pages',
  'x-page', 'x-per-page', 'x-next-page'];

// ¿Viene de una sesión válida de la app? Devuelve null si sí, o el
// código y el mensaje con que hay que contestar si no.
async function sesion(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return { code: 401, error: 'Missing token' };
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return { code: 401, error: 'Invalid session' };
  // Quién es, para lo que sólo puede hacerse a nombre de quien llama: el
  // correo de la mañana se manda a SU correo y a ningún otro.
  req.usuario = userData.user;
  // Lo que escribe en la base (sync de Toast) o manda un correo (send) se
  // niega AQUÍ, en el servidor, no sólo en el navegador, según los
  // permisos de quien llama (src/permisos.js, roles 2026-11-13). Vienen
  // de app_metadata, que sólo puede poner el servidor (api/admin.js).
  //   · sync: hace falta "Sync Toast and MarginEdge".
  //   · send: se niega a quien sólo puede editar recetas (el bartender de
  //     siempre), que es lo que se negaba antes de los roles.
  // Un usuario de correo sin rol lo puede todo, como hasta hoy.
  const perms = P.deUsuario(userData.user);
  const accion = req.body && req.body.action;
  if (accion === 'sync' && perms.indexOf('sincronizar') < 0) {
    return { code: 403, error: 'Your role can’t sync Toast.' };
  }
  if (accion === 'send' && P.soloRecetas(perms)) {
    return { code: 403, error: 'Your role can only edit recipes.' };
  }
  return null;
}

// fetch con tope de tiempo. Nunca lanza: devuelve lo que pasó, para que
// quien llama lo cuente tal cual. `quien` es el nombre del servicio para
// el mensaje de "no contestó".
async function pedir(url, opciones, quien) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, Object.assign({}, opciones, { signal: ctl.signal }));
    const texto = await r.text();
    let cuerpo = null;
    try { cuerpo = JSON.parse(texto); } catch (e) { /* se devuelve el texto */ }
    const cabeceras = {};
    if (r.headers && typeof r.headers.get === 'function') {
      for (const k of CABECERAS_PAGINACION) {
        const v = r.headers.get(k);
        if (v !== null && v !== undefined) cabeceras[k] = v;
      }
    }
    return { ok: r.ok, status: r.status, cuerpo, texto, cabeceras };
  } catch (e) {
    const msg = e && e.name === 'AbortError'
      ? (quien || 'El servicio') + ' no contestó en ' + (TIMEOUT_MS / 1000) + ' s.'
      : String((e && e.message) || e);
    return { ok: false, status: 0, cuerpo: null, texto: msg, cabeceras: {} };
  } finally {
    clearTimeout(t);
  }
}

const recortar = (x) => {
  const s = typeof x === 'string' ? x : JSON.stringify(x);
  return s && s.length > LIMITE_CRUDO ? s.slice(0, LIMITE_CRUDO) + '… (recortado)' : s;
};

// ── Lo que se puede decir de una credencial sin enseñarla ────────────
//
// Un servicio contesta lo mismo, "Unauthorized", a un id mal copiado, a
// un secreto viejo o a los dos cruzados. Aquí se dice cuánto mide cada
// valor y si llevaba espacios o saltos de línea: así se ve un pegado
// roto o un cruce (el secreto suele ser más largo que el id) sin que el
// valor salga nunca de la función.
function revisar(nombre) {
  const crudo = String(process.env[nombre] || '');
  return {
    largo: crudo.trim().length,
    espaciosAlrededor: crudo !== crudo.trim(),
    espaciosDentro: /\s/.test(crudo.trim())
  };
}

// Las credenciales se copian de páginas web y un espacio de más basta
// para un 401. Se limpian siempre; `revisar` sigue diciendo si los había.
const valor = (nombre) => String(process.env[nombre] || '').trim();

// "Falta la credencial" tiene varias causas: el nombre no coincide, se
// guardó en otro entorno, o después del último despliegue. Se dice cuál
// falta y qué hay parecido. Nombres, nunca valores.
function faltan(nombres, parecido) {
  const f = nombres.filter(k => !valor(k));
  if (!f.length) return null;
  return {
    ok: false,
    error: 'Esta función no ve ' + f.join(', ') + ' en este despliegue.',
    diagnostico: {
      variablesParecidas: Object.keys(process.env).filter(k => parecido.test(k)),
      entorno: process.env.VERCEL_ENV || 'desconocido'
    }
  };
}

// ── ¿Lo llama Vercel? ────────────────────────────────────────────────
// Las tareas diarias (la carga de Toast, el correo de la mañana) no
// tienen sesión de la app: las llama Vercel con `Authorization: Bearer
// <CRON_SECRET>`. Sin la variable NO se abre: se dice que falta, que es
// lo que pasó. Devuelve null si pasa, o el código y el mensaje.
function cronAutorizado(req, que) {
  const secreto = valor('CRON_SECRET');
  if (!secreto) return { code: 500, error: 'CRON_SECRET is not set in this deployment, so ' + que + ' does not run.' };
  if (String((req.headers && req.headers.authorization) || '') !== 'Bearer ' + secreto) return { code: 401, error: 'Unauthorized' };
  return null;
}

module.exports = { sesion, pedir, recortar, revisar, valor, faltan, cronAutorizado, TIMEOUT_MS, LIMITE_CRUDO };
