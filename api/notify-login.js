const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { email, location, userAgent, timestamp } = req.body || {};

    await resend.emails.send({
      from: 'BarStock Pro <noreply@barstockpro.com>',
      to: 'axeltorressalgado@icloud.com',
      subject: `Login — ${email}`,
      html: `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;line-height:1.6;max-width:680px;margin:0 auto;padding:20px">
<p><strong>New login detected</strong></p>
<p><strong>User:</strong> ${email}<br>
<strong>Location:</strong> ${location || 'Unknown'}<br>
<strong>Time:</strong> ${timestamp || new Date().toISOString()}<br>
<strong>Device:</strong> ${userAgent || 'Unknown'}</p>
</body></html>`
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('notify-login error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
