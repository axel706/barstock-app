const login = require('../lib/notify-login');
const signup = require('../lib/notify-signup');

// ── Un solo buzón de avisos ──────────────────────────────────────────
//
// Antes eran `api/notify-login.js` y `api/notify-signup.js`, dos
// funciones. El plan Hobby de Vercel permite doce por despliegue y ya
// estaban las doce, así que la primera integración que añadimos tumbaba
// el despliegue entero.
//
// Las funciones sólo cuentan si viven en `api/`. Los dos manejadores se
// mudaron a `lib/` sin tocar una línea de su lógica, y esta función
// decide cuál de los dos atiende. Mismo comportamiento, una ranura
// menos ocupada.
//
// El tipo se puede mandar por la ruta (`/api/notify?type=login`) o en el
// cuerpo. Por el cuerpo es lo normal; la ruta está para poder probarlo
// a mano.

const MANEJADORES = { login, signup };

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
