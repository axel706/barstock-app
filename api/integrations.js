// ── Integraciones: UNA función para todas ────────────────────────────
//
// El plan de Vercel admite 12 funciones. La doce se liberó a propósito al
// mudar `contact` a lib/ (ver api/notify.js), y era para esto: una sola
// función que atiende a las integraciones externas. Cada una vive en
// lib/ (que no cuenta) y aquí se reparte por `provider`.
//
// Hoy: Toast (lib/toast.js) y TripleSeat (lib/tripleseat.js). Si un día
// una integración pide su propio api/*.js, la trece no despliega: tiene
// que entrar aquí.
//
// `provider` llega por la ruta (?provider=toast) o en el cuerpo. Sin
// rewrites en vercel.json a propósito: cambiar el enrutado de producción
// para conservar una URL que nadie usaba no valía el riesgo.
//
// ── La sesión se comprueba AQUÍ, una vez ─────────────────────────────
//
// Cada integración devuelve datos de un restaurante, y el diagnóstico de
// "falta una variable" lista nombres de variables: nada de eso puede
// quedar abierto a quien sepa la URL. Antes lo comprobaba cada
// integración por su cuenta; con dos, una se lo podía saltar. Ahora no
// se llega a ninguna sin pasar por aquí.

const { sesion } = require('../lib/integracion');
const toast = require('../lib/toast');
const tripleseat = require('../lib/tripleseat');
// El correo de la mañana no es una integración, pero vive aquí por lo
// mismo que ellas: el tope de 12 funciones está lleno, y aquí la sesión
// ya se comprueba una vez antes de repartir.
const report = require('../lib/morning-report');
const { cronToast } = require('../lib/toast-cron');

const PROVEEDORES = { toast, tripleseat, report };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const p = String((req.query && req.query.provider) || (req.body && req.body.provider) || '').toLowerCase();
  const h = Object.prototype.hasOwnProperty.call(PROVEEDORES, p) ? PROVEEDORES[p] : null;
  if (!h) {
    return res.status(404).json({ ok: false, error: 'Unknown integration. Use: ' + Object.keys(PROVEEDORES).join(', ') });
  }
  // La carga diaria de Toast (lib/toast-cron.js). La llama Vercel con un
  // GET, sin sesión de la app: en su lugar exige el CRON_SECRET, que
  // comprueba toast-cron.js. Es la ÚNICA puerta sin sesión, y sólo hace
  // la acción `sync` del día que falte; cualquier otro GET sigue en 405.
  if (req.method === 'GET' && p === 'toast' && req.query && req.query.cron === 'sync') {
    try { return await cronToast(req, res, h); }
    catch (e) { return res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    const no = await sesion(req);
    if (no) return res.status(no.code).json({ ok: false, error: no.error });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
  return h(req, res);
};
