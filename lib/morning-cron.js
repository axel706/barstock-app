// ── El correo de la mañana, solo, cada día ───────────────────────────
//
// Axel, 2026-11-12: "hagámoslo automático, pero sólo para mí por ahora,
// al correo registrado en reply-to". Vercel llama aquí una vez al día
// (vercel.json, 13 UTC: después de las dos cargas de Toast de las 10 y
// las 12), y el correo va a location_settings.reply_to_email de la
// locación de Toast. La lista de Settings › Emails NO se usa todavía: es
// para cuando él lo diga.
//
// ── Un solo cálculo ──────────────────────────────────────────────────
//
// Los números son los de la app: lo vendido ayer (toast-sales.js), el
// LIVE de cada producto (live-stock.js, con los pedidos y las facturas
// de order-receipts.js), cuándo se acaba y cuánto pedir (run-out.js).
// No se reescriben aquí: se cargan los MISMOS archivos de src/ en un
// contexto aparte (vm) con un `window` de mentira, y se llama a
// BarStockMorningReport.datos(), lo mismo que pulsa la app en Settings ›
// Toast › Morning email. Si la cuenta cambia en la app, cambia aquí.
//
// Lo que no se carga y se da hecho, a propósito:
//   · BarStockInventoryCloud: sólo se usa su fetchLocationId, y el
//     archivo trae también las funciones que BORRAN y reinsertan el
//     inventario. Aquí no tienen nada que hacer.
//   · BarStockWeeklyCycle: su estado de "contando" vive en el teléfono
//     de quien cuenta. Aquí se toma como "no se está contando".
//   · state.master: se lee de inventory_items con la misma conversión
//     que la app (src/inventory-row.js).
//
// Sólo LEE de Supabase, con la llave del servidor. No escribe nada.
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { pedir, recortar, valor, cronAutorizado } = require('./integracion');
const report = require('./morning-report');

// En el orden de index.html: lo compartido antes de quien lo usa.
const MODULOS = ['rest-paginado', 'inventory-row', 'cycle', 'toast-pours', 'toast-links', 'toast-recipes', 'toast-usage',
  'vendor-defaults-cloud', 'vendor-delivery', 'order-receipts', 'live-stock', 'run-out', 'toast-sales',
  'morning-report'];
const SRC = path.join(__dirname, '..', 'src');

// Un contexto nuevo en cada llamada: los módulos guardan lo leído un rato
// (toast-sales, 30 min), y una instancia caliente de Vercel no puede
// mandar los números de ayer.
async function datosDe(loc, sbUrl, llave) {
  const ctx = { console, setTimeout, clearTimeout, URL, URLSearchParams, Intl, Date, Math, JSON, Promise,
    fetch: (...a) => fetch(...a) };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.BARSTOCK_CONFIG = { SUPABASE_URL: sbUrl, SUPABASE_KEY: llave, LOCATION_NAME: loc.name, ACCOUNT_ID: loc.account_id };
  ctx.BarStockInventoryCloud = { fetchLocationId: async () => loc.id };
  ctx.BarStockWeeklyCycle = { estado: () => 'done' };
  ctx.state = { master: [] };
  vm.createContext(ctx);
  for (const m of MODULOS) {
    vm.runInContext(fs.readFileSync(path.join(SRC, m + '.js'), 'utf8'), ctx, { filename: 'src/' + m + '.js' });
  }
  const filas = await ctx.BarStockRest.leerTodo('inventory_items?location_id=eq.' + loc.id +
    '&select=' + ctx.BarStockInventoryRow.COLS + '&order=item_name.asc');
  ctx.state.master = filas.map(r => ctx.BarStockInventoryRow.deNube(r));
  return ctx.BarStockMorningReport.datos();
}

async function cronManana(req, res) {
  const no = cronAutorizado(req, 'the morning email');
  if (no) return res.status(no.code).json({ ok: false, error: no.error });
  const sbUrl = valor('SUPABASE_URL').replace(/\/+$/, '');
  const llave = valor('SUPABASE_SERVICE_ROLE_KEY');
  const sbH = { apikey: llave, Authorization: 'Bearer ' + llave };
  const restaurante = valor('TOAST_RESTAURANT_GUID');
  if (!restaurante) return res.status(500).json({ ok: false, error: 'TOAST_RESTAURANT_GUID is not set in this deployment.' });

  // La locación con ESTE restaurante de Toast, como la carga diaria. Si
  // hubiera cero o dos, no se adivina: se dice.
  const rl = await pedir(sbUrl + '/rest/v1/locations?toast_restaurant_guid=eq.' + encodeURIComponent(restaurante) +
    '&select=id,name,account_id', { headers: sbH }, 'Supabase');
  if (!rl.ok || !Array.isArray(rl.cuerpo)) return res.status(502).json({ ok: false, paso: 'location', status: rl.status, crudo: recortar(rl.cuerpo || rl.texto) });
  if (rl.cuerpo.length !== 1) return res.status(500).json({ ok: false, paso: 'location', error: 'Expected one location with this Toast restaurant, found ' + rl.cuerpo.length + '.' });
  const loc = rl.cuerpo[0];

  // A quién: el reply-to de la locación, y nadie más (de momento).
  const ra = await pedir(sbUrl + '/rest/v1/location_settings?location_id=eq.' + loc.id + '&select=reply_to_email', { headers: sbH }, 'Supabase');
  if (!ra.ok || !Array.isArray(ra.cuerpo)) return res.status(502).json({ ok: false, paso: 'settings', status: ra.status, crudo: recortar(ra.cuerpo || ra.texto) });
  const para = String((ra.cuerpo[0] && ra.cuerpo[0].reply_to_email) || '').trim();
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(para)) {
    return res.status(500).json({ ok: false, paso: 'settings', error: 'No reply-to email saved for ' + loc.name + ' (Settings › Emails), so the morning email was not sent.' });
  }

  let d;
  try { d = await datosDe(loc, sbUrl, llave); }
  catch (e) { return res.status(500).json({ ok: false, paso: 'numbers', error: String((e && e.message) || e) }); }
  const { asunto, html } = report.armar(d);

  if (!valor('RESEND_API_KEY')) return res.status(500).json({ ok: false, error: 'RESEND_API_KEY is not set in this deployment.' });
  const { Resend } = require('resend');
  const r = await new Resend(valor('RESEND_API_KEY')).emails.send({
    from: (loc.name || 'BarStock') + ' <reports@barstockpro.com>', to: [para], subject: asunto, html });
  if (r && r.error) return res.status(502).json({ ok: false, paso: 'send', error: 'Resend: ' + (r.error.message || 'it did not send') });
  // Lo que se mandó, para los registros de Vercel: sin el correo entero.
  return res.status(200).json({ ok: true, to: para, asunto, prevision: d.prevision, agotan: d.agotan.length, id: r && r.data && r.data.id });
}

module.exports = { cronManana, datosDe, MODULOS };
