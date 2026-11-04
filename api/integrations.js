// ── Integraciones: UNA función para todas ────────────────────────────
//
// El plan de Vercel admite 12 funciones. La doce se liberó a propósito al
// mudar `contact` a lib/ (ver api/notify.js), y era para esto: una sola
// función que atiende a las integraciones externas. Cada una vive en
// lib/ (que no cuenta) y aquí sólo se reparte por `provider`.
//
// Hoy: Toast (lib/toast.js). Mañana: TripleSeat, en este mismo archivo.
// Si un día una integración pide su propio api/*.js, la trece no
// despliega: tiene que entrar aquí.
//
// `provider` llega por la ruta (?provider=toast) o en el cuerpo. Sin
// rewrites en vercel.json a propósito: cambiar el enrutado de producción
// para conservar una URL que nadie usaba no valía el riesgo.
//
// Cada integración hace su propia comprobación de sesión. Aquí no se
// hace nada antes de saber a quién se reparte, para no duplicarla.

const toast = require('../lib/toast');

const PROVEEDORES = { toast };

module.exports = async function handler(req, res) {
  const p = String((req.query && req.query.provider) || (req.body && req.body.provider) || '').toLowerCase();
  const h = Object.prototype.hasOwnProperty.call(PROVEEDORES, p) ? PROVEEDORES[p] : null;
  if (!h) {
    return res.status(404).json({ ok: false, error: 'Unknown integration. Use: ' + Object.keys(PROVEEDORES).join(', ') });
  }
  return h(req, res);
};
