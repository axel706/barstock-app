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
// Hobby corta la función a los 10 s, y un día de Crown (login, categorías,
// menú, las páginas de órdenes y cuatro escrituras) se lleva casi todo
// ese tiempo: por eso bsToastHistoria va también un día por llamada.
// Cada llamada carga el día MÁS RECIENTE que falte de la última semana.
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

const { pedir, recortar, valor } = require('./integracion');

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
  const secreto = valor('CRON_SECRET');
  if (!secreto) {
    return res.status(500).json({ ok: false, error: 'CRON_SECRET is not set in this deployment, so the daily Toast load does not run.' });
  }
  if (String((req.headers && req.headers.authorization) || '') !== 'Bearer ' + secreto) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const sbUrl = valor('SUPABASE_URL').replace(/\/+$/, '') + '/rest/v1/';
  const llave = valor('SUPABASE_SERVICE_ROLE_KEY');
  const sbH = { apikey: llave, Authorization: 'Bearer ' + llave };
  const restaurante = valor('TOAST_RESTAURANT_GUID');
  if (!restaurante) return res.status(500).json({ ok: false, error: 'TOAST_RESTAURANT_GUID is not set in this deployment.' });

  // La locación es la que tiene ESTE restaurante de Toast. Si hubiera
  // cero o dos, no se adivina cuál: se dice.
  const rl = await pedir(sbUrl + 'locations?toast_restaurant_guid=eq.' + encodeURIComponent(restaurante) + '&select=id', { headers: sbH }, 'Supabase');
  if (!rl.ok || !Array.isArray(rl.cuerpo)) {
    return res.status(502).json({ ok: false, paso: 'location', status: rl.status, crudo: recortar(rl.cuerpo || rl.texto) });
  }
  if (rl.cuerpo.length !== 1) {
    return res.status(500).json({ ok: false, paso: 'location', error: 'Expected one location with this Toast restaurant, found ' + rl.cuerpo.length + '.' });
  }
  const locationId = rl.cuerpo[0].id;

  // De ayer hacia atrás, una semana. Lo que ya está completo y cerrado no
  // se vuelve a pedir; lo que no tiene fila, o quedó incompleto o abierto
  // (se cargó a medio día), sí.
  const t = ahora == null ? Date.now() : ahora;
  const dias = [];
  for (let i = 1; i <= SEMANA; i++) dias.push(fechaNY(t - i * 864e5));
  const rd = await pedir(sbUrl + 'toast_sales_days?location_id=eq.' + locationId +
    '&business_date=gte.' + dias[dias.length - 1] + '&select=business_date,complete,closed', { headers: sbH }, 'Supabase');
  if (!rd.ok || !Array.isArray(rd.cuerpo)) {
    return res.status(502).json({ ok: false, paso: 'days', status: rd.status, crudo: recortar(rd.cuerpo || rd.texto) });
  }
  const hecho = new Set(rd.cuerpo.filter(d => d.complete && d.closed).map(d => d.business_date));
  const dia = dias.find(d => !hecho.has(d));
  if (!dia) return res.status(200).json({ ok: true, cargado: null, nota: 'The last ' + SEMANA + ' days were already loaded.' });

  const r = await llamar(toastHandler, { action: 'sync', params: { businessDate: dia.replace(/-/g, ''), locationId } });
  const b = r.body || {};
  // Un fallo de Toast o de la base sale como fallo (502) en los registros
  // de Vercel, con lo que dijeron, no como un 200 que nadie mira.
  return res.status(b.ok ? 200 : 502).json({ ok: !!b.ok, cargado: dia, resultado: b });
}

module.exports = { cronToast, fechaNY, SEMANA };
