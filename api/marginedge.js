const { createClient } = require('@supabase/supabase-js');

// ── MarginEdge, sólo lectura ─────────────────────────────────────────
//
// El navegador NUNCA habla con MarginEdge. Habla con esta función, y la
// función pone la clave. El repositorio es público: una clave en
// `src/config.js` quedaría en el historial de git para siempre.
//
// Esta primera versión no escribe nada en Supabase. Sólo pregunta y
// devuelve lo que llega, para que podamos ver la forma real de los datos
// antes de construir encima de suposiciones.
//
// ── Por qué hay varias rutas candidatas por acción ──────────────────
//
// La documentación oficial de MarginEdge no es pública; lo que se sabe
// de la API viene de catálogos de terceros. En vez de adivinar una ruta
// y fallar con un 404 sin explicación, cada acción lleva una lista de
// rutas plausibles: se prueban en orden y se informa de lo que contestó
// cada una. La primera vez que esto corra vamos a saber cuáles son las
// buenas, y entonces la lista se reduce a una.

const BASE = 'https://api.marginedge.com/public';

const RUTAS = {
  units:      ['/restaurantUnits', '/restaurant-units', '/units'],
  categories: ['/categories'],
  vendors:    ['/vendors'],
  products:   ['/products'],
  invoices:   ['/orders', '/invoices']
};

// Sólo estos parámetros pasan del navegador a MarginEdge. Una lista
// blanca y no un reenvío ciego: esta función lleva una credencial, y
// lo que lleva credencial no reenvía lo que le den sin mirar.
const PARAMS_OK = ['restaurantUnitId', 'startDate', 'endDate', 'nextPage', 'limit'];

const LIMITE_MUESTRA = 3;      // objetos completos de ejemplo
const LIMITE_CRUDO   = 20000;  // caracteres del cuerpo que devolvemos

function construirUrl(ruta, params) {
  const u = new URL(BASE + ruta);
  for (const k of PARAMS_OK) {
    const v = params[k];
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  }
  return u.toString();
}

// MarginEdge puede devolver el array suelto o envuelto en algún campo.
// No sabemos cuál todavía, así que se busca el primer array que haya.
function sacarLista(cuerpo) {
  if (Array.isArray(cuerpo)) return cuerpo;
  if (cuerpo && typeof cuerpo === 'object') {
    for (const k of Object.keys(cuerpo)) {
      if (Array.isArray(cuerpo[k])) return cuerpo[k];
    }
  }
  return null;
}

async function pedir(url, apiKey) {
  const r = await fetch(url, {
    method: 'GET',
    headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
  });

  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch (e) { /* no era JSON */ }

  return {
    status: r.status,
    ok: r.ok,
    cuerpo,
    texto: cuerpo ? null : texto.slice(0, 600)  // sólo si no se pudo parsear
  };
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
    // Sesión válida de la app, ANTES que nada. Esto devuelve lo que se
    // compra y a qué precio, y además el diagnóstico de abajo lista
    // nombres de variables de entorno: ni una cosa ni la otra puede
    // quedar abierta a quien conozca la URL.
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ ok: false, error: 'Missing token' });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // ── Por qué este diagnóstico ───────────────────────────────────
    //
    // "Falta la clave" tiene al menos cuatro causas distintas: el
    // nombre no coincide, se guardó en otro proyecto, se guardó en un
    // entorno que este despliegue no usa, o se guardó después del
    // último despliegue. Sin saber cuál es, se arregla a ciegas.
    //
    // Se devuelven NOMBRES de variables, nunca valores. Y sólo a una
    // sesión válida.
    const apiKey = process.env.MARGINEDGE_API_KEY;
    if (!apiKey) {
      const parecidos = Object.keys(process.env).filter(k => /margin|edge/i.test(k));
      return res.status(200).json({
        ok: false,
        error: 'La función no ve MARGINEDGE_API_KEY en este despliegue.',
        diagnostico: {
          variablesParecidas: parecidos.length ? parecidos : 'ninguna',
          otrasClavesPresentes: ['ANTHROPIC_API_KEY', 'RESEND_API_KEY', 'SUPABASE_URL']
            .filter(k => !!process.env[k]),
          entorno: process.env.VERCEL_ENV || 'desconocido',
          totalVariables: Object.keys(process.env).length
        }
      });
    }

    const { action, params } = req.body || {};
    const candidatas = RUTAS[action];
    if (!candidatas) {
      return res.status(400).json({
        ok: false,
        error: 'Acción desconocida: ' + action,
        acciones: Object.keys(RUTAS)
      });
    }

    const intentos = [];

    for (const ruta of candidatas) {
      const url = construirUrl(ruta, params || {});
      let r;
      try {
        r = await pedir(url, apiKey);
      } catch (e) {
        intentos.push({ ruta, error: String(e && e.message || e) });
        continue;
      }

      intentos.push({ ruta, status: r.status });

      // 404 significa "esta ruta no existe", así que seguimos probando.
      // Cualquier otra cosa —200, 401, 403, 500— es una respuesta de
      // verdad y hay que enseñarla, no esconderla tras el siguiente
      // intento.
      if (r.status === 404) continue;

      if (!r.ok) {
        return res.status(200).json({
          ok: false,
          action,
          ruta,
          status: r.status,
          error: r.cuerpo?.message || r.cuerpo?.error || r.texto || ('HTTP ' + r.status),
          intentos
        });
      }

      const lista = sacarLista(r.cuerpo);
      return res.status(200).json({
        ok: true,
        action,
        ruta,
        status: r.status,
        total: lista ? lista.length : null,
        campos: lista && lista.length && typeof lista[0] === 'object'
          ? Object.keys(lista[0])
          : null,
        muestra: lista ? lista.slice(0, LIMITE_MUESTRA) : null,
        nextPage: r.cuerpo?.nextPage || null,
        crudo: JSON.stringify(r.cuerpo).slice(0, LIMITE_CRUDO),
        intentos
      });
    }

    return res.status(200).json({
      ok: false,
      action,
      error: 'Ninguna de las rutas candidatas existe. Hay que mirar la documentación del portal.',
      intentos
    });

  } catch (err) {
    console.error('marginedge endpoint error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};
