// ── El correo de la mañana ───────────────────────────────────────────
//
// Axel, 2026-11-12, sobre lámina (CLAUDE.md, "El correo de la mañana"):
// el molde del correo de órdenes (lib/email-shell.js), con una o dos
// frases en palabras encima de cada bloque: ni lista seca ni carta.
//
//   · El saludo, con una línea que resume el día.
//   · Yesterday: el Net de Toast en dinero (total, licor con cócteles,
//     vino) y luego en botellas, cada uno contra lo de siempre de ese día
//     de la semana. Sin la lista de lo más vendido: le sobraba.
//   · Won't make it to Sunday: lo que se acaba antes del domingo, en una
//     sola sección, por el día en que se acaba, cada uno con cuánto pedir
//     para llegar al domingo (run-out.js, cuantoPedir). Sin "What stood
//     out" y sin la etiqueta "from LOOP": las dos se quitaron.
//
// Las frases salen de plantillas que eligen los números, no de una IA:
// nunca dicen nada que los datos no digan.
//
// Aquí se ESCRIBE y se MANDA; los números se calculan en la app
// (src/morning-report.js), con los mismos módulos que enseñan el Home y
// la ficha. Así un número no se calcula en dos sitios. La carga
// automática de cada mañana, cuando se haga, tendrá que calcularlos en
// el servidor: es lo que queda pendiente.
//
// Se manda SÓLO al correo de quien tiene la sesión (api/integrations.js
// la comprueba y deja el usuario en req.usuario). Aunque la petición
// traiga otro destinatario, no se usa: esta función no puede servir
// para mandar correos a cualquiera.

const { shell, escapeHtml: esc } = require('./email-shell');

const D3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fecha = (d) => new Date(String(d) + 'T12:00:00Z');
const dow = (d) => fecha(d).getUTCDay();
const esFecha = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
const dinero = (n) => '$' + Math.round(n).toLocaleString('en-US');
const uno = (n) => (Math.round(n * 10) / 10).toFixed(1);
// Cuánto se aleja de lo de siempre, en %, o null si no hay con qué
// comparar (sin historia, o lo de siempre es cero).
const pct = (v, n) => (num(v) === null || !(num(n) > 0) ? null : Math.round((v - n) / n * 100));
const nombres = (xs) => xs.length < 2 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];

// ── Lo que viene de la app, limpio ────────────────────────────────────
// Números finitos o null; textos con tope; como mucho 40 productos.
function limpiar(d) {
  d = d && typeof d === 'object' ? d : {};
  const a = d.ayer && typeof d.ayer === 'object' ? d.ayer : {};
  const N = ['dinero', 'licor', 'vino', 'normalDinero', 'normalLicor', 'normalVino',
    'botellas', 'botLicor', 'botVino', 'normalBotellas', 'normalBotLicor', 'normalBotVino'];
  const ayer = { fecha: esFecha(a.fecha) ? a.fecha : null, cargado: a.cargado === true };
  for (const k of N) ayer[k] = num(a[k]);
  const agotan = (Array.isArray(d.agotan) ? d.agotan : []).slice(0, 40)
    .filter(x => x && typeof x === 'object' && esFecha(x.agota) && num(x.pedir) > 0)
    .map(x => ({ producto: String(x.producto || '').slice(0, 120), agota: x.agota,
      queda: Math.max(0, num(x.queda) || 0), vende: num(x.vende) || 0, llega: num(x.llega) || 0,
      pedir: Math.ceil(num(x.pedir)) }));
  // Si la app no pudo saber qué se acaba, dice por qué. Sin esto, una
  // lista vacía se leería "nothing runs out", que sería mentira.
  const prevision = ['counting', 'history', 'error'].includes(d.prevision) ? d.prevision : 'ok';
  return { local: String(d.local || '').slice(0, 80), hoy: esFecha(d.hoy) ? d.hoy : null, ayer, agotan, prevision,
    detalle: String(d.detalle || '').slice(0, 160) };
}

// ── Los bloques (los mismos de la lámina) ─────────────────────────────
const P = (t, m) => `<p style="margin:${m || '0 0 14px'};font-size:15px;line-height:1.65;color:#1f2937">${t}</p>`;
const b = (t) => `<strong style="color:#0f172a">${t}</strong>`;
const rotulo = (t, color) => `<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${color || '#64748b'}">${t}</p>`;
const flecha = (p) => p === null ? '&nbsp;'
  : `<span style="color:${p >= 0 ? '#15803d' : '#b91c1c'};font-weight:700">${p >= 0 ? '↗' : '↘'} ${Math.abs(p)}%</span>`;

// Las tarjetas son las CELDAS mismas, no una caja dentro de cada celda:
// en una tabla todas las celdas de una fila miden lo mismo, así que las
// tres quedan iguales aunque una línea sea más larga (Axel: "asegúrate de
// que tengan el mismo tamaño"). Ancho fijo (table-layout: fixed) y el
// hueco en su propia columna de 8 px: un padding sólo en la segunda y la
// tercera las dejaba más estrechas que la primera. Debajo del número sólo
// la flecha: "vs usual" se partía en dos líneas en pantallas estrechas,
// y se dice una vez debajo de las tarjetas.
const tarjetas = (xs) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;margin:0 0 12px"><tr>` +
  xs.map((x, i) => (i ? '<td width="8" style="width:8px;font-size:0;line-height:0">&nbsp;</td>' : '') +
    `<td valign="top" style="border:1px solid #e2e8f0;border-radius:10px;padding:11px 12px 10px;background:#f8fafc">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b">${x.k}</p>
      <p style="margin:3px 0 1px;font-size:21px;font-weight:800;color:#0f172a;letter-spacing:-.02em">${x.v}</p>
      <p style="margin:0;font-size:12px;color:#64748b">${flecha(x.p)}</p></td>`).join('') + `</tr></table>`;

const ROJO = { bg: '#fee2e2', tx: '#b91c1c' }, AMBAR = { bg: '#fef3c7', tx: '#92400e' };
const filas = (xs, hoy, meta, rango) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px">` +
  xs.map(x => {
    const c = x.agota <= hoy ? ROJO : AMBAR;
    const tag = x.agota <= hoy ? 'Out today' : 'Out ' + D3[dow(x.agota)];
    const sub = uno(x.queda) + ' left · ' + rango + ' usually sells ' + uno(x.vende) +
      (x.llega > 0 ? ' · ' + uno(x.llega) + ' on the way' : '');
    return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid #f1f5f9"><span style="font-size:14px;font-weight:600;color:#0f172a">${esc(x.producto)}</span>
      <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:${c.bg};color:${c.tx};vertical-align:1px">${tag}</span><br>
      <span style="font-size:12px;color:#64748b">${esc(sub)}</span></td>
    <td style="padding:9px 0;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:top;white-space:nowrap">
      <span style="display:block;font-size:15px;font-weight:800;color:#0369a1">Order ${x.pedir}</span><span style="display:block;font-size:11px;color:#64748b">${meta}</span></td></tr>`;
  }).join('') + `</table>`;

// ── Las frases ────────────────────────────────────────────────────────
// Cómo fue ayer: ±10% de lo de siempre es "normal".
function comoFue(a) {
  const dl = DL[dow(a.fecha)];
  if (!a.cargado) return { corta: null, larga: `${dl}'s sales from Toast haven't loaded yet.` };
  if (!(a.dinero > 0) && !(a.normalDinero > 0)) return { corta: `${dl} was closed`, larga: `${dl} was closed.` };
  const p = pct(a.dinero, a.normalDinero);
  if (p === null) return { corta: `Here's ${dl}`, larga: `You did ${b(dinero(a.dinero))} in drinks.` };
  const corta = p >= 10 ? `${dl} was a good night` : p <= -10 ? `${dl} was a slow night` : `${dl} was a normal night`;
  const larga = Math.abs(p) < 10
    ? `You did ${b(dinero(a.dinero))} in drinks, right around a usual ${dl}.`
    : `You did ${b(dinero(a.dinero))} in drinks, ${b(Math.abs(p) + '% ' + (p > 0 ? 'more' : 'less'))} than a usual ${dl}.`;
  return { corta, larga, p };
}
function quienLlevo(a) {
  const t = (a.licor || 0) + (a.vino || 0);
  if (!(t > 0)) return '';
  const l = (a.licor || 0) / t;
  return l >= 0.55 ? ' Liquor, cocktails included, carried most of it.'
    : l <= 0.45 ? ' Wine carried most of it.' : ' Liquor and wine came in close to even.';
}

// "Tito's and Aperol run out today. Casamigos goes on Friday; …"
function fraseAgotan(xs, hoy) {
  const porDia = new Map();
  for (const x of xs) {
    const k = x.agota <= hoy ? hoy : x.agota;
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k).push(x.producto);
  }
  const partes = [];
  let hoyTexto = '';
  for (const [d, ns] of porDia) {
    const n = nombres(ns.map(esc));
    if (d === hoy) hoyTexto = b(n + (ns.length > 1 ? ' run out today.' : ' runs out today.'));
    else partes.push(n + (ns.length > 1 ? ' go on ' : ' goes on ') + DL[dow(d)]);
  }
  return [hoyTexto, partes.length ? partes.join('; ') + '.' : ''].filter(Boolean).join(' ');
}

// ── El correo ─────────────────────────────────────────────────────────
function armar(datos) {
  const d = limpiar(datos);
  const hoy = d.hoy;
  const domingo = hoy && dow(hoy) === 0;
  // El conteo es el domingo al cerrar: la meta es el domingo entero, o
  // "hoy" si ya es domingo.
  const meta = domingo ? 'through today' : 'through Sunday';
  const llegar = domingo ? 'make it through today' : 'make it to Sunday';
  const rango = domingo ? 'Sun' : D3[dow(hoy)] + '–Sun';
  const ag = d.agotan.slice().sort((x, y) => (x.agota < y.agota ? -1 : x.agota > y.agota ? 1 : y.pedir - x.pedir));
  const a = d.ayer;
  const fue = a.fecha ? comoFue(a) : { corta: null, larga: '' };

  const sabe = d.prevision === 'ok';
  const cuantos = !sabe ? null : ag.length
    ? `${ag.length} ${ag.length === 1 ? "thing won't" : "things won't"} ${llegar}`
    : (domingo ? 'nothing runs out today' : 'nothing runs out before Sunday');
  const hoyF = fecha(hoy);
  const cabeza = `${DL[hoyF.getUTCDay()]}, ${M3[hoyF.getUTCMonth()]} ${hoyF.getUTCDate()}. ` +
    (!cuantos ? (fue.corta ? fue.corta + '.' : '')
      : fue.corta ? `${fue.corta}, and ${cuantos}.` : cuantos.charAt(0).toUpperCase() + cuantos.slice(1) + '.');

  let html =
    `<p style="margin:0 0 4px;font-size:21px;font-weight:800;color:#0f172a;letter-spacing:-.01em">Good morning ☀️</p>` +
    P(cabeza, '0 0 26px').replace('color:#1f2937', 'color:#475569');

  // Yesterday
  if (a.fecha) {
    const af = fecha(a.fecha);
    html += rotulo(`Yesterday · ${D3[af.getUTCDay()]}, ${M3[af.getUTCMonth()]} ${af.getUTCDate()}`);
    const hayCifras = a.cargado && (a.dinero > 0 || a.normalDinero > 0);
    html += P(fue.larga + (hayCifras ? quienLlevo(a) : ''), hayCifras ? '0 0 14px' : '0 0 26px');
    if (hayCifras) {
      html += tarjetas([
        { k: 'Total', v: dinero(a.dinero || 0), p: pct(a.dinero, a.normalDinero) },
        { k: 'Liquor', v: dinero(a.licor || 0), p: pct(a.licor, a.normalLicor) },
        { k: 'Wine', v: dinero(a.vino || 0), p: pct(a.vino, a.normalVino) }]) +
        tarjetas([
        { k: 'Bottles', v: uno(a.botellas || 0), p: pct(a.botellas, a.normalBotellas) },
        { k: 'Liquor', v: uno(a.botLicor || 0), p: pct(a.botLicor, a.normalBotLicor) },
        { k: 'Wine', v: uno(a.botVino || 0), p: pct(a.botVino, a.normalBotVino) }]);
      const algunaFlecha = [pct(a.dinero, a.normalDinero), pct(a.botellas, a.normalBotellas)].some(x => x !== null);
      html += algunaFlecha
        ? `<p style="margin:0 0 26px;font-size:12px;color:#64748b">Arrows compare with a usual ${DL[af.getUTCDay()]}.</p>`
        : '<div style="height:14px"></div>';
    }
  }

  // Sin previsión: se dice por qué, en el sitio de la sección.
  if (!sabe) {
    const porque = d.prevision === 'counting'
      ? "A count is in progress, so there's no live stock to work from yet. This comes back once the count is closed."
      : d.prevision === 'history'
        ? "There's not enough Toast history yet to know what a usual day sells, so there's no forecast."
        : 'Could not work out what runs out this morning' + (d.detalle ? ': ' + esc(d.detalle) : '') + '.';
    html += rotulo('What runs out') + P(porque, '0 0 26px');
  }

  // Won't make it to Sunday
  if (sabe && ag.length) {
    html += rotulo(domingo ? "Won't make it through today" : "Won't make it to Sunday", '#b91c1c') +
      P(fraseAgotan(ag, hoy) + ` This is what it would take to get ${domingo ? 'through today' : 'through Sunday'}:`) +
      filas(ag, hoy, meta, rango) +
      `<p style="margin:-10px 0 22px;font-size:12px;line-height:1.6;color:#64748b">How much to order: what each day from today to Sunday usually sells (the median of the last 13 weeks in Toast), minus what's left and what's already on its way, rounded up to whole bottles.</p>`;
  }

  html += `<p style="margin:4px 0 18px;font-size:15px;color:#1f2937">Have a good shift.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
  <a href="https://app.barstockpro.com" style="display:inline-block;background:#0b1220;color:#ffffff;font-size:14px;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none">Open BarStock</a></td></tr></table>`;

  const asuntoAyer = a.cargado && a.fecha && a.dinero > 0 ? ` · ${D3[dow(a.fecha)]} ${dinero(a.dinero)}` : '';
  const asuntoAg = !sabe ? '' : ag.length ? ` · ${ag.length} won't ${llegar}` : ' · nothing runs out';
  return { asunto: (d.local || 'BarStock') + asuntoAyer + asuntoAg,
    html: shell({ right: d.local, footer: 'Morning report', body: html }) };
}

// ── Por api/integrations.js ───────────────────────────────────────────
// preview: devuelve el correo para verlo en la app; send: lo manda al
// correo de la sesión, con "[Test]" en el asunto (de momento sólo se
// manda a mano, para probar).
async function handler(req, res) {
  const body = req.body || {};
  const action = String(body.action || '');
  const params = body.params || {};
  if (action !== 'preview' && action !== 'send') {
    return res.status(400).json({ ok: false, error: 'Unknown action. Use: preview, send' });
  }
  if (!params.datos || typeof params.datos !== 'object') {
    return res.status(400).json({ ok: false, error: 'Missing params.datos: the numbers the report is written from.' });
  }
  const { asunto, html } = armar(params.datos);
  if (action === 'preview') return res.status(200).json({ ok: true, asunto, html });

  const para = req.usuario && req.usuario.email;
  if (!para) return res.status(400).json({ ok: false, error: 'This session has no email to send the report to.' });
  if (!String(process.env.RESEND_API_KEY || '').trim()) {
    return res.status(500).json({ ok: false, error: 'RESEND_API_KEY is not set in this deployment.' });
  }
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const local = limpiar(params.datos).local || 'BarStock';
  const r = await resend.emails.send({
    from: `${local} <reports@barstockpro.com>`,
    to: [para],
    subject: '[Test] ' + asunto,
    html
  });
  if (r && r.error) return res.status(502).json({ ok: false, error: 'Resend: ' + (r.error.message || 'it did not send') });
  return res.status(200).json({ ok: true, to: para, id: r && r.data && r.data.id });
}

module.exports = handler;
module.exports.armar = armar;
module.exports.limpiar = limpiar;
