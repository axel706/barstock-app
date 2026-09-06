const { Resend } = require('resend');
const { shell, facts, badge, action, escapeHtml } = require('../lib/email-shell');
const { ALERTS, NOREPLY } = require('../lib/inboxes');

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Aviso de inicio de sesión ────────────────────────────────────────
//
// Salen DOS correos distintos, y son distintos a propósito:
//
//   1. La copia de vigilancia, siempre a la misma dirección. Es un
//      registro: quién entró, dónde, cuándo, con qué. Da igual quién
//      haya entrado, esta copia siempre saluda a Axel, porque siempre
//      la lee Axel.
//
//   2. La copia para quien entró, al correo del perfil de esa locación.
//      No es un registro, es un aviso de seguridad: "esto acaba de
//      pasar; si no fuiste tú, actúa". Por eso lleva menos datos y un
//      botón.
//
// Antes solo existía la primera, y saludaba con el trozo de correo
// anterior a la arroba —"Hey Axeltorressalgado"—. El nombre de verdad
// está en `sender_profile`, que es de donde se saca ahora.

// La copia de vigilancia va al buzón de operación, no al personal. Estos
// llegan en CADA inicio de sesión, y mezclados con los leads del
// formulario acaban sepultando lo que sí hay que contestar.
const ADMIN = ALERTS;
const APP = 'https://barstock-app.vercel.app';

// ── Por qué solo hay un botón ────────────────────────────────────────
//
// La tentación era poner dos: "cerrar sesión en todas partes" y
// "cambiar contraseña". Pero en Supabase cambiar la contraseña YA
// revoca las demás sesiones, así que el primer botón no protegería de
// nada que el segundo no cubra: sería un camino distinto al mismo
// sitio, y encima el único que necesita implementación de servidor.
//
// Un botón que hace lo que dice vale más que dos donde uno adorna.
//
// ── Por qué el enlace no restablece nada por sí solo ─────────────────
//
// Lleva a la app, no a un endpoint que dispare el correo de
// recuperación. Los filtros de seguridad de Outlook y compañía abren
// los enlaces de los correos antes de que nadie los toque, para
// comprobar que no son maliciosos. Un enlace que actúa con solo
// visitarlo se dispararía él solo en cuanto llegue. Aterriza en la
// pantalla de recuperación con el correo ya escrito, y hace falta una
// persona pulsando un botón.
function resetLink(email) {
  return `${APP}/?reset=1&email=${encodeURIComponent(email || '')}`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { email, location, locationId, userAgent, timestamp } = req.body || {};

    // La hora, legible. Un ISO en crudo obliga a descifrar la zona
    // horaria mentalmente cada vez que llega uno de estos.
    const when = (() => {
      try {
        const d = new Date(timestamp || Date.now());
        const opt = { timeZone: 'America/New_York' };
        const hoy = new Date().toLocaleDateString('en-US', opt) === d.toLocaleDateString('en-US', opt);
        const hora = d.toLocaleTimeString('en-US',
          Object.assign({ hour: 'numeric', minute: '2-digit' }, opt));
        if (hoy) return `Today at ${hora} ET`;
        return d.toLocaleString('en-US',
          Object.assign({ dateStyle: 'medium', timeStyle: 'short' }, opt)) + ' ET';
      } catch (e) { return timestamp || new Date().toISOString(); }
    })();

    // El navegador entero es ilegible y lo que importa cabe en dos
    // palabras: en qué aparato y con qué navegador. La cadena completa
    // se conserva debajo, en la copia interna, por si hace falta.
    const device = (() => {
      const ua = String(userAgent || '');
      if (!ua) return 'Unknown';
      const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
        : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac'
        : /Windows/.test(ua) ? 'Windows' : 'Other';
      const br = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox'
        : /Edg/.test(ua) ? 'Edge' : /Safari/.test(ua) ? 'Safari' : '';
      return br ? `${os} · ${br}` : os;
    })();

    const donde = location || 'Unknown';
    const aparato = device.split(' · ')[0];

    // ── 1. La copia de vigilancia ────────────────────────────────────
    //
    // "Hey Axel" fijo. No se deduce de nada: esta copia siempre va a la
    // misma persona, así que deducir el nombre solo sería una manera de
    // equivocarse.
    const adminBody =
      badge('👋', 'Hey Axel',
            `Someone just opened the bar at ${donde}.`) +
      facts([
        ['Who', email],
        ['Where', donde],
        ['When', when],
        ['Device', device]
      ]) +
      `<p style="margin:0;font-size:12px;color:#94a3b8;word-break:break-all">${
        escapeHtml(userAgent || '')
      }</p>`;

    await resend.emails.send({
      from: NOREPLY,
      to: ADMIN,
      subject: `Login — ${email}`,
      html: shell({ right: donde, footer: 'Security notification', body: adminBody })
    });

    // ── 2. La copia para quien entró ─────────────────────────────────
    const perfil = await senderProfile(locationId);
    const destino = (perfil?.email || '').trim();

    // Si no hay perfil, si no tiene correo, o si el correo del perfil es
    // el de administración, no hay segunda copia que enviar: sería la
    // misma bandeja recibiendo lo mismo dos veces.
    if (destino && destino.toLowerCase() !== ADMIN.toLowerCase()) {
      const nombre = firstName(perfil?.name) || firstName(nameFromEmail(destino)) || 'there';

      const userBody =
        badge('👋', `Hey ${nombre}`,
              `You signed in to ${donde} ${lower(when)} from your ${aparato}.`) +
        facts([
          ['Where', donde],
          ['When', when],
          ['Device', device]
        ]) +
        action(
          "Wasn't you?",
          'Change your password now. It also signs out every other device.',
          'Change password',
          resetLink(destino),
          'warn'
        );

      await resend.emails.send({
        from: NOREPLY,
        to: destino,
        subject: `You signed in to ${donde}`,
        html: shell({ right: donde, footer: 'Security notification', body: userBody })
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('notify-login error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── El nombre de verdad ──────────────────────────────────────────────
//
// `sender_profile` es la tabla donde cada locación guarda quién firma
// sus correos: nombre, correo, teléfono y cargo. Es el único sitio de
// toda la aplicación donde consta cómo se llama una persona; la cuenta
// de acceso solo tiene una dirección de correo.
//
// Si la consulta falla, se devuelve null y el segundo correo
// sencillamente no sale. Un aviso de inicio de sesión no puede tumbar
// un inicio de sesión.
async function senderProfile(locationId) {
  if (!locationId) return null;
  try {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/sender_profile?location_id=eq.${encodeURIComponent(locationId)}&select=name,email`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0] || null;
  } catch (e) {
    console.warn('notify-login: sender_profile lookup failed:', e.message);
    return null;
  }
}

function firstName(full) {
  const s = String(full || '').trim().split(/\s+/)[0] || '';
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function nameFromEmail(email) {
  return String(email || '').split('@')[0].split(/[._-]/)[0];
}

// "Today at 2:22 PM ET" en mitad de una frase tiene que ir en
// minúscula: "you signed in today at 2:22 PM ET". La hora y las siglas
// de la zona no se tocan.
function lower(s) {
  return String(s).replace(/^Today/, 'today').replace(/^([A-Z][a-z]+ \d)/, m => m);
}
