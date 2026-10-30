const login = require('../lib/notify-login');
const signup = require('../lib/notify-signup');
const contact = require('../lib/mail-contact');

// ── Un solo buzón de correo ──────────────────────────────────────────
//
// Antes eran `api/notify-login.js` y `api/notify-signup.js`, dos
// funciones. El plan Hobby de Vercel permite doce por despliegue y ya
// estaban las doce, así que la primera integración que añadimos tumbaba
// el despliegue entero.
//
// Las funciones sólo cuentan si viven en `api/`. Los manejadores se
// mudan a `lib/` sin tocar una línea de su lógica y esta función decide
// cuál atiende. Mismo comportamiento, una ranura menos ocupada.
//
// El tipo se puede mandar por la ruta (`/api/notify?type=login`) o en el
// cuerpo. Por el cuerpo es lo normal; la ruta está para poder probarlo
// a mano.
//
// ── `contact` se suma aquí, y el archivo sigue llamándose notify ─────
//
// Era `api/contact.js`, la función doce de doce. Al mudarla a `lib/`
// queda libre la ranura que necesita `api/oauth.js` para Tripleseat y
// Toast. La URL pública no cambia: un rewrite en vercel.json manda
// /api/contact aquí con ?type=contact.
//
// El nombre del archivo CHIRRÍA —"notify" atendiendo el formulario de
// la landing— y es a propósito. Renombrarlo a `api/mail.js` obligaría a
// que /api/notify también pasara por un rewrite, y esta semana el
// objetivo era tocar lo mínimo: el camino de las órdenes del lunes no
// se roza. El rename llega cuando se sumen `send-order`, los dos
// informes y `weekly-briefing`, ya con los rewrites probados en
// producción por la ruta de contacto.
//
// Si estás leyendo esto y ya existe `api/mail.js`, este comentario
// sobra y este archivo no debería existir.

const MANEJADORES = { login, signup, contact };

module.exports = async function handler(req, res) {
  const tipo = (req.query && req.query.type) || (req.body && req.body.type) || '';
  const manejador = MANEJADORES[tipo];

  if (!manejador) {
    // El preflight llega sin cuerpo, así que no puede saber el tipo.
    // Se responde aquí mismo en vez de tratarlo como tipo inválido.
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(200).end();
    }
    return res.status(400).json({
      ok: false,
      error: 'Falta type. Valores: ' + Object.keys(MANEJADORES).join(', ')
    });
  }

  return manejador(req, res);
};
