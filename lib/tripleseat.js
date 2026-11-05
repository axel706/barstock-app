const { resumir } = require('./resumir');
// La sesión ya la comprobó api/integrations.js. Lo demás que comparte
// con Toast vive en lib/integracion.js.
const { pedir: pedirComun, recortar, revisar, valor, faltan } = require('./integracion');

// ── TripleSeat, sólo lectura ─────────────────────────────────────────
//
// Fase 1: conectar y MIRAR la forma real de los datos (eventos, sus
// invitados, el paquete de bebidas) antes de construir nada encima. No
// escribe nada, ni en Supabase ni en TripleSeat. La credencial además
// sólo tiene scopes de lectura (events, bookings, locations, menus...),
// así que aunque lo intentara, TripleSeat no le dejaría.
//
// ── Sin página de OAuth ──────────────────────────────────────────────
//
// TripleSeat acepta `grant_type=client_credentials`: el UID y el secret
// de la app se cambian por un token servidor con servidor. Axel lo probó
// con curl y devolvió un token de 2 horas. No hace falta redirección ni
// callback.
//
// ── Por qué varias rutas por acción ──────────────────────────────────
//
// La documentación de TripleSeat no se pudo abrir desde donde se
// escribió esto. En vez de adivinar UNA ruta y fallar con un 404 sin
// explicación, cada acción prueba las candidatas en orden y dice qué
// contestó cada una. La primera vez que esto corra se sabrá cuál es la
// buena, y entonces la lista se queda en una. Es lo mismo que se hizo
// con MarginEdge.
//
// ── Variables de entorno ─────────────────────────────────────────────
//
//   TRIPLESEAT_CLIENT_ID       el UID de la app, Secret
//   TRIPLESEAT_CLIENT_SECRET   el secret de la app, Secret

const BASE = 'https://api.tripleseat.com';
const TOKEN_URL = BASE + '/oauth2/token';

const RUTAS = {
  locations: ['/v1/locations.json', '/v1/sites.json'],
  events:    ['/v1/events.json'],
  bookings:  ['/v1/bookings.json']
};

// Sólo estos parámetros pasan del navegador a TripleSeat, y sólo con
// cifras. Una lista blanca y no un reenvío ciego: esta función lleva una
// credencial.
const PARAMS_OK = ['site_id', 'location_id', 'page'];

const LIMITE_MUESTRA = 2;

const pedir = (url, opciones) => pedirComun(url, opciones, 'TripleSeat');

// El token NUNCA sale de esta función. Se devuelve sólo si el login
// funcionó, cuándo caduca y qué permisos trae.
async function login() {
  const cuerpo = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: valor('TRIPLESEAT_CLIENT_ID'),
    client_secret: valor('TRIPLESEAT_CLIENT_SECRET')
  });
  const r = await pedir(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: cuerpo.toString()
  });
  const c = r.cuerpo || {};
  if (!r.ok || !c.access_token) {
    // Lo que dijo TripleSeat, tal cual, más cómo es la credencial sin
    // enseñarla. Nada de adivinar la causa.
    return {
      ok: false, status: r.status, respuesta: recortar(r.cuerpo || r.texto),
      revision: { TRIPLESEAT_CLIENT_ID: revisar('TRIPLESEAT_CLIENT_ID'),
                  TRIPLESEAT_CLIENT_SECRET: revisar('TRIPLESEAT_CLIENT_SECRET') }
    };
  }
  return { ok: true, accessToken: c.access_token, expiraEnSegundos: c.expires_in, permisos: c.scope || null };
}

function url(ruta, params) {
  const u = new URL(BASE + ruta);
  for (const k of PARAMS_OK) {
    const v = params && params[k];
    if (v !== undefined && v !== null && /^\d+$/.test(String(v))) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

// TripleSeat puede devolver el array suelto o envuelto ({ events: [...] }),
// y cada elemento a su vez envuelto ({ event: {...} }). No se sabe
// todavía cuál: se busca el primer array y se desenvuelve lo de dentro.
function sacarLista(cuerpo) {
  let lista = null;
  if (Array.isArray(cuerpo)) lista = cuerpo;
  else if (cuerpo && typeof cuerpo === 'object') {
    for (const k of Object.keys(cuerpo)) if (Array.isArray(cuerpo[k])) { lista = cuerpo[k]; break; }
  }
  if (!lista) return null;
  return lista.map(x => {
    if (x && typeof x === 'object') {
      const ks = Object.keys(x);
      if (ks.length === 1 && x[ks[0]] && typeof x[ks[0]] === 'object' && !Array.isArray(x[ks[0]])) return x[ks[0]];
    }
    return x;
  });
}

// Lo que viene junto a la lista en el cuerpo ({ events: [...], total_pages: 12 }).
// La primera página de eventos resultó ser de 2021: sin saber cuántas
// hay, no se llega a las de ahora. Los valores sueltos se dicen tal
// cual; un objeto o una lista, sólo por los nombres que lleva.
function envoltorio(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return null;
  const out = {};
  let lista = false;
  for (const [k, v] of Object.entries(cuerpo)) {
    if (Array.isArray(v) && !lista) { lista = true; continue; }   // la lista, que ya va aparte
    if (v === null || typeof v !== 'object') out[k] = v;
    else out[k] = Array.isArray(v) ? '[' + v.length + ']' : Object.keys(v);
  }
  return Object.keys(out).length ? out : null;
}

// La forma de lo anidado: qué campos son objetos o listas, en cuántos
// registros vienen y qué NOMBRES llevan dentro. Nunca un valor: ahí va
// el contacto del cliente. `resumir` se los salta, y es justo donde
// estaría el menú o el paquete de bebidas, si TripleSeat lo da.
function forma(lista) {
  const out = {};
  const nombre = (k, v) => k + (Array.isArray(v) ? '[]' : (v && typeof v === 'object' ? '{}' : ''));
  for (const fila of lista || []) {
    if (!fila || typeof fila !== 'object') continue;
    for (const [k, v] of Object.entries(fila)) {
      if (!v || typeof v !== 'object') continue;
      const f = out[k] = out[k] || { tipo: Array.isArray(v) ? 'lista' : 'objeto', veces: 0, claves: new Set() };
      f.veces++;
      const dentro = Array.isArray(v) ? v : [v];
      for (const x of dentro) {
        if (x && typeof x === 'object' && !Array.isArray(x)) {
          for (const [k2, v2] of Object.entries(x)) f.claves.add(nombre(k2, v2));
        }
      }
    }
  }
  for (const f of Object.values(out)) f.claves = Array.from(f.claves).sort();
  return out;
}

async function probar(accion, token, params) {
  const intentos = [];
  for (const ruta of RUTAS[accion]) {
    const u = url(ruta, params);
    const r = await pedir(u, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
    const lista = r.ok ? sacarLista(r.cuerpo) : null;
    intentos.push({ ruta, status: r.status, registros: lista ? lista.length : null });
    if (r.ok && lista) {
      return {
        ok: true, accion, ruta, status: r.status,
        registros: lista.length,
        campos: resumir(lista),
        forma: forma(lista),
        envoltorio: envoltorio(r.cuerpo),
        cabeceras: r.cabeceras,
        muestra: recortar(lista.slice(0, LIMITE_MUESTRA)),
        intentos
      };
    }
    // Una ruta que contesta pero no es una lista se enseña tal cual, por
    // si es justo la buena con otra forma.
    if (r.ok) {
      return { ok: true, accion, ruta, status: r.status, registros: null, crudo: recortar(r.cuerpo || r.texto), intentos };
    }
    intentos[intentos.length - 1].respuesta = recortar(r.cuerpo || r.texto);
  }
  return { ok: false, accion, error: 'Ninguna ruta contestó bien.', intentos };
}

module.exports = async function handler(req, res) {
  try {
    const falta = faltan(['TRIPLESEAT_CLIENT_ID', 'TRIPLESEAT_CLIENT_SECRET'], /triple/i);
    if (falta) return res.status(200).json(falta);

    const { action, params } = req.body || {};
    const ACCIONES = ['ping'].concat(Object.keys(RUTAS));
    if (!ACCIONES.includes(action)) {
      return res.status(400).json({ ok: false, error: 'Acción desconocida. Usa: ' + ACCIONES.join(', ') });
    }

    const l = await login();
    if (!l.ok) {
      return res.status(200).json({ ok: false, paso: 'login', error: 'TripleSeat no aceptó el login.', tripleseat: l });
    }
    if (action === 'ping') {
      return res.status(200).json({ ok: true, accion: 'ping', expiraEnSegundos: l.expiraEnSegundos, permisos: l.permisos });
    }
    return res.status(200).json(await probar(action, l.accessToken, params || {}));
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
