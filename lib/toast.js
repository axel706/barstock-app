const { createClient } = require('@supabase/supabase-js');
const { resumir } = require('./resumir');

// ── Toast, sólo lectura ──────────────────────────────────────────────
//
// Fase 1 de la integración (ver docs/integrations-plan.md): conectar y
// MIRAR. Esta función no escribe nada, ni en Supabase ni en Toast. Pide
// y devuelve lo que llega, resumido, para ver la forma real de los
// datos antes de construir encima de suposiciones. Es el mismo camino
// que se siguió con MarginEdge, y por la misma razón.
//
// El navegador nunca habla con Toast. Habla con esta función, y la
// función pone la credencial. El repositorio es público.
//
// ── Por qué no hay página de OAuth ───────────────────────────────────
//
// Toast da a los restaurantes "Standard API access": un clientId y un
// clientSecret que se cambian por un token servidor con servidor
// (userAccessType TOAST_MACHINE_CLIENT). No hay inicio de sesión ni
// redirección, así que no hace falta un callback.
//
// ── Variables de entorno ─────────────────────────────────────────────
//
//   TOAST_CLIENT_ID         Secret
//   TOAST_CLIENT_SECRET     Secret
//   TOAST_API_HOST          p. ej. ws-api.toasttab.com
//   TOAST_RESTAURANT_GUID   el de Crown, para esta prueba
//
// El GUID en una variable vale para probar con UNA locación. No es el
// diseño final: BarStock es multi-locación, y con MarginEdge ya se
// aprendió que el restaurante va por locación en `location_settings`
// (ver la cabecera de src/settings-integrations.js). Cuando se conecten
// las demás, el GUID se muda allí.
//
// ── Vive en lib/, no en api/ ─────────────────────────────────────────
//
// El plan de Vercel admite 12 funciones y la doce se liberó a propósito
// (ver api/notify.js) para UNA función de integraciones compartida por
// Toast y TripleSeat. Esa es api/integrations.js, que sólo reparte por
// `provider`; la lógica de cada una vive aquí, en lib/, que no cuenta.
// La primera versión fue un api/toast.js y se comía la ranura entera:
// lo cazó test-correo-merge.

// Lo que Toast devuelve es de un restaurante entero. No se devuelve
// tal cual: un menú puede pesar varios MB, y un día de órdenes más.
const LIMITE_MUESTRA = 3;
const LIMITE_CRUDO = 20000;     // caracteres de cada muestra en crudo
const PAGINA_ORDENES = 100;     // el máximo que acepta ordersBulk
// Hobby corta a los 10 s. Cada petición a Toast tiene su propio tope
// para que una que se cuelga no se lleve la respuesta entera.
const TIMEOUT_MS = 7000;

function host() {
  // Se acepta con o sin https:// y con o sin barra final: es lo
  // primero que se equivoca al copiarlo de Toast Web.
  return String(process.env.TOAST_API_HOST || '')
    .trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

// Ayer en Nueva York, como fecha de negocio de Toast (yyyymmdd). Ayer y
// no hoy: el día de hoy todavía no está cerrado.
function ayer() {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(Date.now() - 24 * 3600 * 1000));
  return f.replace(/-/g, '');
}

async function pedir(url, opciones) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, Object.assign({}, opciones, { signal: ctl.signal }));
    const texto = await r.text();
    let cuerpo = null;
    try { cuerpo = JSON.parse(texto); } catch (e) { /* se devuelve el texto */ }
    return { ok: r.ok, status: r.status, cuerpo, texto };
  } catch (e) {
    const msg = e && e.name === 'AbortError'
      ? 'Toast no contestó en ' + (TIMEOUT_MS / 1000) + ' s.'
      : String((e && e.message) || e);
    return { ok: false, status: 0, cuerpo: null, texto: msg };
  } finally {
    clearTimeout(t);
  }
}

const recortar = (x) => {
  const s = typeof x === 'string' ? x : JSON.stringify(x);
  return s && s.length > LIMITE_CRUDO ? s.slice(0, LIMITE_CRUDO) + '… (recortado)' : s;
};

// El token NUNCA sale de esta función. Se devuelve sólo si el login
// funcionó, cuándo caduca y qué permisos trae.
async function login() {
  const r = await pedir('https://' + host() + '/authentication/v1/authentication/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: process.env.TOAST_CLIENT_ID,
      clientSecret: process.env.TOAST_CLIENT_SECRET,
      userAccessType: 'TOAST_MACHINE_CLIENT'
    })
  });
  const tok = r.cuerpo && r.cuerpo.token;
  if (!r.ok || !tok || !tok.accessToken) {
    // Lo que dijo Toast, tal cual. Nada de adivinar la causa.
    return { ok: false, status: r.status, respuesta: recortar(r.cuerpo || r.texto) };
  }
  return {
    ok: true,
    accessToken: tok.accessToken,
    expiraEnSegundos: tok.expiresIn,
    permisos: tok.scope || null
  };
}

function cabeceras(token) {
  return {
    Authorization: 'Bearer ' + token,
    'Toast-Restaurant-External-ID': String(process.env.TOAST_RESTAURANT_GUID || '').trim()
  };
}

// Las líneas de venta de un montón de órdenes, aplanadas. Es lo que hay
// que entender: qué es una "selección", cuánto vale `quantity`, cómo
// vienen los modificadores (shot, doble, copa).
function lineas(ordenes) {
  const out = [];
  for (const o of ordenes || []) {
    for (const c of (o && o.checks) || []) {
      for (const s of (c && c.selections) || []) out.push(s);
    }
  }
  return out;
}

function contarMenu(menus) {
  let grupos = 0, articulos = 0;
  const muestra = [];
  const recorrer = (g) => {
    grupos++;
    for (const it of g.menuItems || []) {
      articulos++;
      if (muestra.length < 25) muestra.push({ name: it.name, guid: it.guid, group: g.name });
    }
    for (const sub of g.menuGroups || []) recorrer(sub);
  };
  for (const m of menus || []) for (const g of m.menuGroups || []) recorrer(g);
  return { grupos, articulos, muestra };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Sesión válida de la app ANTES que nada. Esto devuelve las ventas
    // de un restaurante, y el diagnóstico lista nombres de variables:
    // ninguna de las dos cosas puede quedar abierta a quien sepa la URL.
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ ok: false, error: 'Missing token' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // "Falta la credencial" tiene varias causas: el nombre no coincide,
    // se guardó en otro entorno, o después del último despliegue. Se
    // dice cuál falta y qué hay parecido. Nombres, nunca valores.
    const NECESARIAS = ['TOAST_CLIENT_ID', 'TOAST_CLIENT_SECRET', 'TOAST_API_HOST', 'TOAST_RESTAURANT_GUID'];
    const faltan = NECESARIAS.filter(k => !String(process.env[k] || '').trim());
    const { action, params } = req.body || {};
    // `ping` sólo necesita las tres primeras: así se puede probar el
    // login antes de tener el GUID.
    const faltanAqui = action === 'ping' ? faltan.filter(k => k !== 'TOAST_RESTAURANT_GUID') : faltan;
    if (faltanAqui.length) {
      return res.status(200).json({
        ok: false,
        error: 'Esta función no ve ' + faltanAqui.join(', ') + ' en este despliegue.',
        diagnostico: {
          variablesParecidas: Object.keys(process.env).filter(k => /toast/i.test(k)),
          entorno: process.env.VERCEL_ENV || 'desconocido'
        }
      });
    }

    const ACCIONES = ['ping', 'restaurant', 'menu', 'orders'];
    if (!ACCIONES.includes(action)) {
      return res.status(400).json({ ok: false, error: 'Acción desconocida. Usa: ' + ACCIONES.join(', ') });
    }

    const l = await login();
    if (!l.ok) {
      return res.status(200).json({ ok: false, paso: 'login', error: 'Toast no aceptó el login.', toast: l });
    }
    if (action === 'ping') {
      return res.status(200).json({
        ok: true, accion: 'ping', host: host(),
        expiraEnSegundos: l.expiraEnSegundos, permisos: l.permisos
      });
    }

    const base = 'https://' + host();
    const h = cabeceras(l.accessToken);

    if (action === 'restaurant') {
      const guid = String(process.env.TOAST_RESTAURANT_GUID).trim();
      const r = await pedir(base + '/restaurants/v1/restaurants/' + encodeURIComponent(guid), { headers: h });
      const g = r.cuerpo && r.cuerpo.general;
      return res.status(200).json({
        ok: r.ok, accion: 'restaurant', status: r.status,
        nombre: g ? (g.locationName || g.name || null) : null,
        crudo: recortar(r.cuerpo || r.texto)
      });
    }

    if (action === 'menu') {
      const r = await pedir(base + '/menus/v2/menus', { headers: h });
      if (!r.ok) {
        return res.status(200).json({ ok: false, accion: 'menu', status: r.status, crudo: recortar(r.cuerpo || r.texto) });
      }
      const menus = (r.cuerpo && r.cuerpo.menus) || [];
      return res.status(200).json({
        ok: true, accion: 'menu', status: r.status,
        menus: menus.map(m => m.name),
        ...contarMenu(menus)
      });
    }

    // orders: un solo día de negocio, la primera página. Para mirar la
    // forma, no para traer la semana.
    const p = params || {};
    const dia = /^\d{8}$/.test(String(p.businessDate || '')) ? String(p.businessDate) : ayer();
    const u = base + '/orders/v2/ordersBulk?businessDate=' + dia + '&pageSize=' + PAGINA_ORDENES + '&page=1';
    const r = await pedir(u, { headers: h });
    if (!r.ok || !Array.isArray(r.cuerpo)) {
      return res.status(200).json({ ok: false, accion: 'orders', businessDate: dia, status: r.status, crudo: recortar(r.cuerpo || r.texto) });
    }
    const sel = lineas(r.cuerpo);
    return res.status(200).json({
      ok: true, accion: 'orders', businessDate: dia, status: r.status,
      ordenes: r.cuerpo.length,
      // Si llega justo a la página entera, hay más ese día. Se dice
      // para que el resumen no se lea como el día completo.
      hayMas: r.cuerpo.length === PAGINA_ORDENES,
      lineas: sel.length,
      campos: resumir(sel),
      muestra: recortar(sel.slice(0, LIMITE_MUESTRA))
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
