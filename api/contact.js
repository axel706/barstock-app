const { Resend } = require('resend');
const { shell, facts, badge, callout, escapeHtml } = require('../lib/email-shell');
const { LEADS, HELLO, NOREPLY } = require('../lib/inboxes');

const resend = new Resend(process.env.RESEND_API_KEY);

// ── El formulario de la landing ──────────────────────────────────────
//
// Hasta ahora no iba a ningún sitio: el <form> no tenía `action` ni
// `name` en los campos, así que pulsar "Send request" recargaba la
// página y tiraba lo escrito. Cada persona que rellenó ese formulario se
// perdió sin dejar rastro.
//
// Salen dos correos, y los dos importan:
//
//   1. El aviso, a Axel. Con `replyTo` puesto al correo de quien
//      escribió, para que contestar sea pulsar Responder y no copiar la
//      dirección a mano.
//
//   2. El acuse, a quien escribió. Un formulario que no responde nada
//      deja a la persona sin saber si llegó, y a los dos días vuelve a
//      enviarlo o se olvida. Decir "lo tenemos y te contestamos" es la
//      mitad del trabajo de un formulario de contacto.
//
// ── Esta es la función 12 de 12 ──────────────────────────────────────
//
// Vercel Hobby permite doce funciones serverless y con esta se llenan.
// Lo siguiente que necesite servidor tendrá que colgarse de un endpoint
// existente, como ya hace Consumption Match con el informe de Usage.
// Los archivos de lib/ no cuentan, que es por lo que el marco de correo
// vive ahí.

// La landing y la app son dos despliegues distintos, así que esto es una
// petición entre orígenes. Se listan los que pueden llamar en vez de
// abrir a `*`: un endpoint que manda correo con texto de fuera invita a
// que lo usen de trampolín para mandar correo desde tu dominio.
const ORIGINS = [
  'https://barstockpro.com',
  'https://www.barstockpro.com'
];

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const b = req.body || {};

    // ── El cepo ──────────────────────────────────────────────────────
    //
    // Un campo escondido que una persona no ve y por tanto no rellena.
    // Los robots rellenan todo lo que encuentran. Si viene con algo, se
    // responde 200 y no se manda nada: devolver un error le diría al
    // robot que hay un cepo y merece la pena esquivarlo.
    if (String(b.website || '').trim()) return res.status(200).json({ ok: true });

    const cap = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
    const name     = cap(b.name, 120);
    const email    = cap(b.email, 160);
    const business = cap(b.business, 160);
    const places   = cap(b.locations, 40);
    const message  = cap(b.message, 2000);

    if (!name || !email) {
      return res.status(400).json({ ok: false, error: 'Name and email are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'That email address does not look right.' });
    }

    const when = new Date().toLocaleString('en-US', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York'
    }) + ' ET';

    // ── 1. El aviso ──────────────────────────────────────────────────
    const quien = business ? `${name}, from ${business}` : name;

    const adminBody =
      badge('📬', 'New lead from the site', quien, '#dcfce7') +
      facts([
        ['Name', name],
        ['Email', email],
        ['Business', business],
        ['Locations', places],
        ['When', when]
      ]) +
      (message ? callout('<b>What they wrote</b><br>' + escapeHtml(message)) : '') +
      `<p style="margin:0;font-size:13px;color:#64748b;text-align:center">Hit reply to answer them directly.</p>`;

    await resend.emails.send({
      from: NOREPLY,
      to: LEADS,
      // Contestar es pulsar Responder. Sin esto habría que copiar la
      // dirección del cuerpo del correo, que es justo la fricción que
      // hace que un contacto se quede sin contestar hasta mañana.
      replyTo: email,
      subject: `New lead — ${business || name}`,
      html: shell({ right: 'New lead', footer: 'Website enquiries', body: adminBody })
    });

    // ── 2. El acuse ──────────────────────────────────────────────────
    //
    // Corto a propósito. Lo único que esta persona necesita saber es que
    // llegó y que alguien va a escribirle; todo lo demás es relleno que
    // se lee como automático — que lo es, pero no hace falta subrayarlo.
    const nombre = name.split(/\s+/)[0] || 'there';

    const userBody =
      badge('🙌', `Thanks, ${nombre}`,
            'We got your request and we will be in touch shortly.', '#e0f2fe') +
      (message ? callout('<b>What you sent us</b><br>' + escapeHtml(message)) : '') +
      `<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.75">
         Someone from BarStock Pro will reach out within one business day.
         If anything else comes to mind before then, just reply to this
         email — it reaches us directly.
       </p>
       <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px">
       <p style="margin:0;font-size:15px;color:#0f172a">Talk soon,<br><strong>The BarStock Pro team</strong></p>`;

    await resend.emails.send({
      from: HELLO,
      to: email,
      replyTo: LEADS,
      subject: 'We got your request — BarStock Pro',
      html: shell({ right: 'BarStock Pro', footer: 'Thanks for reaching out', body: userBody })
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact error:', err);
    return res.status(500).json({ ok: false, error: 'Could not send that. Please try again.' });
  }
};
