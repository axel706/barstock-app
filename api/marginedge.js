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
  invoices:   ['/orders', '/invoices'],

  // `/orders` devuelve cabeceras: proveedor, número, fecha, total. Las
  // líneas —qué producto y cuántos— tienen que estar en otro sitio, y
  // son las que de verdad alimentan el cálculo de consumo. El `{id}` se
  // sustituye por el orderId.
  invoice:    ['/orders/{id}', '/orders/{id}/items', '/orders/{id}/lineItems', '/orders/{id}/products']
};

// Sólo estos parámetros pasan del navegador a MarginEdge. Una lista
// blanca y no un reenvío ciego: esta función lleva una credencial, y
// lo que lleva credencial no reenvía lo que le den sin mirar.
const PARAMS_OK = ['restaurantUnitId', 'startDate', 'endDate', 'nextPage', 'limit'];

const LIMITE_MUESTRA = 3;      // objetos completos de ejemplo
const LIMITE_CRUDO   = 20000;  // caracteres del cuerpo que devolvemos
const MAX_PAGINAS    = 25;     // tope de seguridad al seguir nextPage
const MAX_DISTINTOS  = 40;     // más allá de esto, el campo es texto libre

// ── Por qué un resumen y no una muestra ──────────────────────────────
//
// Tres filas de ejemplo no dicen qué valores puede tomar un campo, y
// justo eso es lo que hay que saber antes de construir nada:
// `categoryType` decide qué categorías son de bebida, y `reportByUnit`
// decide si `latestPrice` es el precio de la botella o el de la caja.
// Equivocarse en el segundo mete un coste falso en el inventario, que
// es el tipo de error que no se nota hasta que la cifra de pérdida deja
// de cuadrar meses después.
//
// Así que para cada campo escalar con pocos valores distintos se
// devuelve la lista con su frecuencia. Si tiene muchos, es texto libre
// y sólo se dice cuántos hay.
function resumir(lista) {
  const conteo = {};

  for (const fila of lista) {
    if (!fila || typeof fila !== 'object') continue;
    for (const [k, v] of Object.entries(fila)) {
      if (v !== null && typeof v === 'object') continue;  // arrays y objetos, fuera
      const clave = v === null ? '(null)' : String(v);
      (conteo[k] = conteo[k] || {});
      conteo[k][clave] = (conteo[k][clave] || 0) + 1;
    }
  }

  const out = {};
  for (const [campo, valores] of Object.entries(conteo)) {
    const distintos = Object.keys(valores).length;
    if (distintos > MAX_DISTINTOS) {
      out[campo] = distintos + ' valores distintos (texto libre)';
    } else {
      out[campo] = Object.fromEntries(
        Object.entries(valores).sort((a, b) => b[1] - a[1])
      );
    }
  }
  return out;
}

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

    // El id va en la RUTA, no en la query, así que no puede pasar por
    // la lista blanca de parámetros. Sólo dígitos: lo que viaja en una
    // URL que lleva credencial no se construye con texto sin mirar.
    let rutas = candidatas;
    if (candidatas.some(r => r.includes('{id}'))) {
      const id = String((params || {}).orderId || '');
      if (!/^\d+$/.test(id)) {
        return res.status(400).json({ ok: false, error: 'Hace falta un orderId numérico.' });
      }
      rutas = candidatas.map(r => r.replace('{id}', id));
    }

    const intentos = [];

    for (const ruta of rutas) {
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

      let lista = sacarLista(r.cuerpo);

      // Seguir las páginas. La primera página de 100 no sirve para saber
      // qué valores existen: los de bebida pueden estar en la cuarta.
      let paginas = 1;
      let cursor = r.cuerpo?.nextPage || null;
      while (cursor && lista && paginas < MAX_PAGINAS) {
        const sig = await pedir(
          construirUrl(ruta, Object.assign({}, params || {}, { nextPage: cursor })),
          apiKey);
        if (!sig.ok) break;
        const trozo = sacarLista(sig.cuerpo);
        if (!trozo || !trozo.length) break;
        lista = lista.concat(trozo);
        cursor = sig.cuerpo?.nextPage || null;
        paginas++;
      }

      return res.status(200).json({
        ok: true,
        action,
        ruta,
        status: r.status,
        total: lista ? lista.length : null,
        paginas,
        incompleto: !!cursor,
        campos: lista && lista.length && typeof lista[0] === 'object'
          ? Object.keys(lista[0])
          : null,
        resumen: lista ? resumir(lista) : null,
        muestra: lista ? lista.slice(0, LIMITE_MUESTRA) : null,
        // Para una factura suelta el objeto entero importa: `sacarLista`
        // devolvería sólo el array de líneas y perderíamos la cabecera.
        crudo: (!lista || action === 'invoice')
          ? JSON.stringify(r.cuerpo).slice(0, LIMITE_CRUDO)
          : null,
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
