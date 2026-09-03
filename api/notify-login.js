const { Resend } = require('resend');
const { shell, facts, badge } = require('../lib/email-shell');

const resend = new Resend(process.env.RESEND_API_KEY);

// Aviso interno: alguien ha entrado en la app.
//
// Antes era HTML pelado, sin cabecera ni pie, y no se parecía en nada a
// los correos que salen a proveedores y a dirección. Ahora usa el mismo
// marco: aunque solo lo lea una persona, un correo que llega con la cara
// de la marca se reconoce de un vistazo entre cincuenta.

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { email, location, userAgent, timestamp } = req.body || {};

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
    // se conserva debajo por si hace falta mirarla.
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

    // El nombre de pila, si se puede sacar del correo. "Hey Axel" es un
    // saludo; "Hey axel@wjmhospitality.com" es un robot fingiendo.
    const who = (() => {
      const local = String(email || '').split('@')[0].split(/[._-]/)[0];
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : '';
    })();

    const body =
      badge('👋', who ? `Hey ${who}` : 'Hey there',
            `Someone just opened the bar. It was you, from your ${device.split(' · ')[0]}.`) +
      facts([
        ['Who', email],
        ['Where', location || 'Unknown'],
        ['When', when],
        ['Device', device]
      ]) +
      `<p style="margin:0;font-size:12px;color:#94a3b8;word-break:break-all">${
        String(userAgent || '').replace(/[&<>"]/g, c =>
          ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]))
      }</p>`;

    await resend.emails.send({
      from: 'BarStock Pro <noreply@barstockpro.com>',
      to: 'axeltorressalgado@icloud.com',
      subject: `Login — ${email}`,
      html: shell({
        right: location || 'BarStock Pro',
        footer: 'Security notification',
        body
      })
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('notify-login error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
