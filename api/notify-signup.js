const { Resend } = require('resend');
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

    const escapeHtml = s => String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

    await resend.emails.send({
      from: 'BarStock Pro <noreply@barstockpro.com>',
      to: 'axeltorressalgado@icloud.com',
      subject: `New sign up request — ${businessName || email}`,
      html: `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;line-height:1.6;max-width:680px;margin:0 auto;padding:20px">
<p><strong>New sign up request</strong></p>
<p>
<strong>Name:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)}<br>
<strong>Business:</strong> ${escapeHtml(businessName)}<br>
<strong>Email:</strong> ${escapeHtml(email)}<br>
<strong>Phone:</strong> ${escapeHtml(phone) || '—'}<br>
<strong>Address:</strong> ${escapeHtml(address) || '—'}<br>
<strong>Time:</strong> ${new Date().toISOString()}
</p>
<p><strong>Message:</strong><br>${escapeHtml(message) || '—'}</p>
<p style="color:#64748b;font-size:13px">Approve or deny this request from the Admin panel in BarStock Pro.</p>
</body></html>`
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('notify-signup error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
