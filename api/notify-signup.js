const { Resend } = require('resend');
const { shell, facts, badge, callout } = require('../lib/email-shell');
const { createClient } = require('@supabase/supabase-js');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { email, userId, firstName, lastName, businessName, address, phone, message } = req.body || {};

    if (!email || !userId) {
      return res.status(400).json({ ok: false, error: "Missing email or userId" });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error: insertError } = await supabase
      .from('signup_requests')
      .insert({
        user_id: userId,
        email,
        status: 'pending',
        first_name: firstName || null,
        last_name: lastName || null,
        business_name: businessName || null,
        address: address || null,
        phone: phone || null,
        message: message || null
      });

    if (insertError) throw insertError;

    // Este correo pide una acción: hay alguien esperando aprobación. Por
    // eso el mensaje del solicitante va destacado y el recordatorio de
    // dónde se aprueba va al final, no perdido entre los datos.
    const when = new Date().toLocaleString('en-US', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York'
    }) + ' ET';

    const name = [firstName, lastName].filter(Boolean).join(' ');

    // El titular dice quién y de dónde, que es lo que decide si esto se
    // mira ahora o después. "Someone is waiting for access" no distingue
    // una solicitud de otra cuando llegan tres seguidas.
    const quien = [name, businessName].filter(Boolean).join(', from ')
      || email || 'Someone new';

    const body =
      badge('🙋', 'Someone wants in', quien, '#fef3c7') +
      facts([
        ['Name', name],
        ['Business', businessName],
        ['Email', email],
        ['Phone', phone],
        ['Address', address],
        ['When', when]
      ]) +
      (message
        ? callout('<b>Their message</b><br>' + String(message).replace(/[&<>"]/g, c =>
            ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])))
        : '') +
      `<p style="margin:0;font-size:13px;color:#64748b;text-align:center">Approve or deny from the <b>Admin</b> panel in BarStock Pro.</p>`;

    await resend.emails.send({
      from: 'BarStock Pro <noreply@barstockpro.com>',
      to: 'axeltorressalgado@icloud.com',
      subject: `New sign up request — ${businessName || email}`,
      html: shell({
        right: 'Access request',
        footer: 'Account requests',
        body
      })
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('notify-signup error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
