const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { to, cc, vendor, items, totalUnits, subtotal, locationName, jpgBase64, filename, fromName } = req.body || {};

    if (!to || !vendor || !items?.length) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    const subject = `Order for ${vendor} - ${new Date().toLocaleDateString()}`;
    const safeFilename = filename || `${vendor.toLowerCase().replace(/\s+/g, '_')}_order.jpg`;
    const loc = locationName || 'BarStock';
    const senderName = fromName || loc;

    const escapeHtml = s => String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

    const cid = 'order_image_' + Date.now();

    const htmlBody = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;line-height:1.6;max-width:680px;margin:0 auto;padding:20px">
<p>Hello there,</p>
<p>This email confirms a new order request from <strong>${escapeHtml(loc)}</strong>.<br>
The details for <strong>${escapeHtml(vendor)}</strong> are summarized below.</p>
<h3 style="margin-top:20px;margin-bottom:8px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:6px">ORDER SUMMARY</h3>
<table style="border-collapse:collapse;margin-bottom:16px">
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Location:</td><td style="padding:4px 0;font-weight:600">${escapeHtml(loc)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Vendor:</td><td style="padding:4px 0;font-weight:600">${escapeHtml(vendor)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Date:</td><td style="padding:4px 0;font-weight:600">${new Date().toLocaleDateString()}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Items:</td><td style="padding:4px 0;font-weight:600">${items.length}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Total units:</td><td style="padding:4px 0;font-weight:600">${totalUnits}</td></tr>
</table>
<p>Please find the complete order details below and attached as a JPG file:</p>
${jpgBase64 ? `<div style="margin:16px 0;text-align:center"><img src="cid:${cid}" alt="Order details" style="max-width:100%;border:1px solid #e2e8f0;border-radius:8px"></div>` : ''}
<p>Kindly confirm receipt and expected delivery date at your earliest convenience.</p>
<p>If you have any questions or need clarification about this order, please reply directly to this email.</p>
<p>Thank you,<br>
${escapeHtml(loc)} Team</p>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
<p style="color:#94a3b8;font-size:12px">Sent via BarStock Pro<br>Automated ordering system</p>
</body></html>`;

    const payload = {
      from: `${senderName} <orders@barstockpro.com>`,
      to: [to],
      subject,
      html: htmlBody,
    };

    if (cc) payload.cc = [cc];

    if (jpgBase64) {
      payload.attachments = [{
        filename: safeFilename,
        content: jpgBase64,
        content_id: cid,
      }];
    }

    const result = await resend.emails.send(payload);

    if (result.error) {
      console.error('Resend error:', result.error);
      return res.status(500).json({ ok: false, error: result.error.message || 'Resend failed' });
    }

    return res.status(200).json({ ok: true, id: result.data?.id });

  } catch (err) {
    console.error('send-order error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
