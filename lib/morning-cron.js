// ── El correo de la mañana, solo, cada día ───────────────────────────
//
// Axel, 2026-11-12: "hagámoslo automático, pero sólo para mí por ahora,
// al correo registrado en reply-to". Vercel llama aquí una vez al día
// (vercel.json, 13 UTC: después de las dos cargas de Toast de las 10 y
// las 12), y el correo va a location_settings.reply_to_email. La lista de
// Settings › Emails NO se usa todavía: es para cuando él lo diga.
//
// Desde el 2026-11-15 ("también necesitamos ya configurarlo para Will's &
// Bill's") va a CADA locación enlazada a Toast, como la carga diaria, cada
// una con sus números y a su reply-to. Antes buscaba sólo la del
// TOAST_RESTAURANT_GUID de Vercel (Crown). Una locación sin reply-to o con
// un fallo se salta y se dice cuál; las demás salen igual.
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
  'vendor-defaults-cloud', 'vendor-delivery', 'order-receipts', 'transfers', 'live-stock', 'week', 'par-intelligence', 'pedido', 'run-out', 'toast-sales', 'live-diagnostico',
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
  // Pour·IQ, como en la app (refreshParAdjustments): cuándo se acaba y
  // cuánto pedir usan lo MAYOR de Pour·IQ y lo reciente de Toast
  // (pedido.demanda). Si falla, sigue con Toast solo: el correo sale.
  try { ctx.parAdjustments = await ctx.BarStockParIntelligence.getPendingAdjustments(ctx.state.master); }
  catch (e) { console.warn('[morning] Pour·IQ', (e && e.message) || e); }
  return ctx.BarStockMorningReport.datos();
}

const sinVentas = (d) => !!(d && d.ayer && d.ayer.cargado === true && !(d.ayer.dinero > 0) && !(d.ayer.botellas > 0));

// Una locación: a quién, sus números y el envío. Devuelve lo que pasó,
// sin lanzar: un fallo aquí no puede dejar sin correo a las otras.
async function unaLocacion(loc, sbUrl, llave, sbH, resend) {
  const local = loc.name;
  // select=* y no las columnas por nombre: sin la migración 035 pedir
  // morning_recipients haría fallar la lectura entera, y el reply-to
  // dejaría de recibir el suyo.
  const ra = await pedir(sbUrl + '/rest/v1/location_settings?location_id=eq.' + loc.id + '&select=*', { headers: sbH }, 'Supabase');
  if (!ra.ok || !Array.isArray(ra.cuerpo)) return { local, ok: false, paso: 'settings', status: ra.status, crudo: recortar(ra.cuerpo || ra.texto) };
  const st = ra.cuerpo[0] || {};
  const rt = String(st.reply_to_email || '').trim();
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(rt)) {
    return { local, ok: false, paso: 'settings', error: 'No reply-to email saved for ' + local + ' (Settings › Emails), so its morning email was not sent.' };
  }
  // Y a la lista "Every morning" (Axel, 2026-11-17: "configurar algunos
  // a los que siempre se envía"), con la misma regla de lectura que el
  // envío a mano, sin repetir el reply-to.
  const para = report.sinRepetir([rt].concat(report.partirLista(st.morning_recipients)));
  let d;
  try { d = await datosDe(loc, sbUrl, llave); }
  catch (e) { return { local, ok: false, paso: 'numbers', error: String((e && e.message) || e) }; }
  // Ayer cargado y sin una sola venta: el bar no abrió (el lunes), y un
  // correo que sólo dice "Monday was closed" no le sirve a nadie (Axel,
  // 2026-11-17). Se mira lo que pasó, no un calendario: un lunes abierto
  // por una ocasión especial tiene ventas y su correo sale. Sin cargar
  // no se sabe, y se manda: mejor un correo de más que uno perdido.
  if (sinVentas(d)) return { local, ok: true, omitido: 'yesterday had no sales (' + d.ayer.fecha + '), so no email' };
  const { asunto, html } = report.armar(d);
  let r;
  try {
    r = await resend.emails.send({ from: (local || 'BarStock') + ' <reports@barstockpro.com>', to: para, subject: asunto, html });
  } catch (e) { return { local, ok: false, paso: 'send', error: 'Resend: ' + String((e && e.message) || e) }; }
  if (r && r.error) return { local, ok: false, paso: 'send', error: 'Resend: ' + (r.error.message || 'it did not send') };
  // Lo que se mandó, para los registros de Vercel: sin el correo entero.
  return { local, ok: true, to: para.join(', '), asunto, prevision: d.prevision, agotan: d.agotan.length, id: r && r.data && r.data.id };
}

async function cronManana(req, res) {
  const no = cronAutorizado(req, 'the morning email');
  if (no) return res.status(no.code).json({ ok: false, error: no.error });
  const sbUrl = valor('SUPABASE_URL').replace(/\/+$/, '');
  const llave = valor('SUPABASE_SERVICE_ROLE_KEY');
  const sbH = { apikey: llave, Authorization: 'Bearer ' + llave };
  if (!valor('RESEND_API_KEY')) return res.status(500).json({ ok: false, error: 'RESEND_API_KEY is not set in this deployment.' });

  // Las mismas locaciones que la carga diaria de Toast (lib/toast-cron.js).
  const rl = await pedir(sbUrl + '/rest/v1/locations?toast_restaurant_guid=not.is.null&select=id,name,account_id,toast_restaurant_guid&order=name.asc',
    { headers: sbH }, 'Supabase');
  if (!rl.ok || !Array.isArray(rl.cuerpo)) return res.status(502).json({ ok: false, paso: 'location', status: rl.status, crudo: recortar(rl.cuerpo || rl.texto) });
  const locs = rl.cuerpo.filter(l => l && l.id && String(l.toast_restaurant_guid || '').trim());
  if (!locs.length) return res.status(500).json({ ok: false, paso: 'location', error: 'No location is linked to a Toast restaurant (locations.toast_restaurant_guid).' });

  const { Resend } = require('resend');
  const resend = new Resend(valor('RESEND_API_KEY'));
  // Una tras otra: cada una carga los módulos y lee lo suyo, y en
  // paralelo competirían por los 60 s de la función sin ganar nada claro.
  const locaciones = [];
  for (const loc of locs) locaciones.push(await unaLocacion(loc, sbUrl, llave, sbH, resend));
  const enviados = locaciones.filter(x => x.ok && !x.omitido).length;
  const omitidos = locaciones.filter(x => x.omitido).length;
  const fallos = locaciones.filter(x => !x.ok);
  const cuerpo = { ok: !fallos.length, enviados, omitidos, locaciones };
  // Ninguno salió y alguno falló: 500, para que Vercel lo marque (uno
  // omitido por un día sin ventas no es un fallo). Con
  // alguno fuera, 200, y ok:false + la lista dicen cuál no.
  if (!enviados && fallos.length) return res.status(500).json(Object.assign(cuerpo, { error: fallos.map(x => x.local + ': ' + (x.error || x.paso)).join(' · ') }));
  return res.status(200).json(cuerpo);
}

module.exports = { cronManana, datosDe, sinVentas, MODULOS };
