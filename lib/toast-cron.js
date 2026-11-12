// ── Toast · la carga diaria, sin que nadie abra la app ───────────────
//
// Axel, 2026-11-11, opción A: cada madrugada Vercel llama sola a la
// función de integraciones y se cargan las ventas de Toast. Hasta ahora
// sólo se cargaban pegando bsToastHistoria en la consola, y el "deberías
// tener" que se calcule sobre ellas mentiría el día que nadie lo haga.
// El correo de la mañana va a necesitar lo mismo.
//
// ── Un día por llamada ───────────────────────────────────────────────
//
// Un día de Crown (login, categorías, menú, las páginas de órdenes y
// cuatro escrituras) son varios segundos: por eso va un día por llamada,
// y bsToastHistoria también. Cada llamada carga, en CADA locación
// enlazada a Toast, el día MÁS RECIENTE que le falte de la última semana
// (vercel.json le da a la función hasta 60 s).
// vercel.json programa dos llamadas: la primera carga ayer y la segunda,
// si algún día anterior quedó sin cargar (Toast contestó 500 el 9 de
// octubre en la carga de la historia), lo recupera. Hoy no se carga: el
// día sigue abierto.
//
// ── Quién puede llamarla ─────────────────────────────────────────────
//
// No hay sesión de la app: la llama Vercel. Vercel manda
// `Authorization: Bearer <CRON_SECRET>` si esa variable existe en el
// proyecto, y aquí se exige. Sin la variable NO se abre: se contesta que
// falta, que es lo que pasó, y no se carga nada.
//
// La carga misma es la acción `sync` de lib/toast.js, la de siempre: se
// llama a su handler con una petición armada aquí, para que no haya dos
// maneras de guardar un día.

const { pedir, recortar, valor, cronAutorizado } = require('./integracion');

const SEMANA = 7;

// Las fechas de negocio en Nueva York, como las cuenta Toast.
const fechaNY = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

// El handler de Toast contesta con res.status().json(); aquí se recoge
// lo que contestaría, sin pasar por la red.
function llamar(handler, cuerpo) {
  return new Promise((resolver, fallar) => {
    let code = 200;
    const res = {
      setHeader() {},
      status(c) { code = c; return res; },
      json(o) { resolver({ code, body: o }); return res; },
      end() { resolver({ code, body: null }); return res; }
    };
    Promise.resolve(handler({ method: 'POST', headers: {}, query: {}, body: cuerpo }, res)).catch(fallar);
  });
}

async function cronToast(req, res, toastHandler, ahora) {
  const no = cronAutorizado(req, 'the daily Toast load');
  if (no) return res.status(no.code).json({ ok: false, error: no.error });

  const sbUrl = valor('SUPABASE_URL').replace(/\/+$/, '') + '/rest/v1/';
  const llave = valor('SUPABASE_SERVICE_ROLE_KEY');
  const sbH = { apikey: llave, Authorization: 'Bearer ' + llave };
  // ── Cada locación enlazada, con su restaurante ─────────────────────
  //
  // Axel, 2026-11-12, para traer Will's & Bill's: se cargan TODAS las
  // locaciones con toast_restaurant_guid, cada una con el suyo (la
  // acción sync lo lee de la locación). Antes se buscaba LA locación del
  // GUID de Vercel, y con dos se paraba. Si una falla, las demás se
  // cargan igual; la llamada sale como fallo (502) en los registros de
  // Vercel, con lo que dijo cada una.
  const rl = await pedir(sbUrl + 'locations?toast_restaurant_guid=not.is.null&select=id,name,toast_restaurant_guid', { headers: sbH }, 'Supabase');
  if (!rl.ok || !Array.isArray(rl.cuerpo)) {
    return res.status(502).json({ ok: false, paso: 'location', status: rl.status, crudo: recortar(rl.cuerpo || rl.texto) });
  }
  const locs = rl.cuerpo.filter(l => l && l.id && String(l.toast_restaurant_guid || '').trim());
  if (!locs.length) return res.status(500).json({ ok: false, paso: 'location', error: 'No location is linked to a Toast restaurant (locations.toast_restaurant_guid).' });

  // De ayer hacia atrás, una semana. Lo que ya está completo y cerrado no
  // se vuelve a pedir; lo que no tiene fila, o quedó incompleto o abierto
  // (se cargó a medio día), sí. Un día por locación y por llamada.
  const t = ahora == null ? Date.now() : ahora;
  const dias = [];
  for (let i = 1; i <= SEMANA; i++) dias.push(fechaNY(t - i * 864e5));
  const cargas = [];
  for (const l of locs) {
    const rd = await pedir(sbUrl + 'toast_sales_days?location_id=eq.' + l.id +
      '&business_date=gte.' + dias[dias.length - 1] + '&select=business_date,complete,closed', { headers: sbH }, 'Supabase');
    if (!rd.ok || !Array.isArray(rd.cuerpo)) {
      cargas.push({ location: l.id, nombre: l.name, ok: false, paso: 'days', status: rd.status, crudo: recortar(rd.cuerpo || rd.texto) });
      continue;
    }
    const hecho = new Set(rd.cuerpo.filter(d => d.complete && d.closed).map(d => d.business_date));
    const dia = dias.find(d => !hecho.has(d));
    if (!dia) { cargas.push({ location: l.id, nombre: l.name, ok: true, cargado: null }); continue; }
    const r = await llamar(toastHandler, { action: 'sync', params: { businessDate: dia.replace(/-/g, ''), locationId: l.id } });
    const b = r.body || {};
    cargas.push({ location: l.id, nombre: l.name, ok: !!b.ok, cargado: dia, resultado: b });
  }
  const todo = cargas.every(c => c.ok);
  return res.status(todo ? 200 : 502).json({ ok: todo, cargas });
}

module.exports = { cronToast, fechaNY, SEMANA };
