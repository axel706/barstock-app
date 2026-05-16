const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { to, cc, vendor, items, totalUnits, subtotal, locationName, jpgBase64, filename } = req.body || {};

    if (!to || !vendor || !items?.length) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://barstock-app.vercel.app/api/auth/callback'
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const subject = `Order for ${vendor} - ${new Date().toLocaleDateString()}`;
    const safeFilename = filename || `${vendor.toLowerCase().replace(/\s+/g, '_')}_order.jpg`;

    const loc = locationName || 'BarStock';
    const emailBody = [
      `Hello there,`,
      ``,
      `This email confirms a new order request from ${loc}.`,
      `The details for ${vendor} are summarized below.`,
      ``,
      `ORDER SUMMARY`,
      `-------------`,
      `Location: ${loc}`,
      `Vendor: ${vendor}`,
      `Date: ${new Date().toLocaleDateString()}`,
      `Items: ${items.length}`,
      `Total units: ${totalUnits}`,
      ``,
      `Please find the complete order details attached as a JPG file.`,
      `Kindly confirm receipt and expected delivery date at your earliest convenience.`,
      ``,
      `If you have any questions or need clarification about this order,`,
      `please reply directly to this email.`,
      ``,
      `Thank you,`,
      `The ${loc} Team`,
      ``,
      `-----------------------------`,
      `Sent via BarStock Pro`,
      `Automated ordering system`
    ].join('\r\n');

    const nl = '\r\n';
    const mixedBoundary = '----barstock_mixed_' + Date.now();
    const relatedBoundary = '----barstock_related_' + Date.now();
    const cid = 'order_image_' + Date.now() + '@barstock';

    // Build HTML body with inline image
    const escapeHtml = s => String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
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
The ${escapeHtml(loc)} Team</p>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
<p style="color:#94a3b8;font-size:12px">Sent via BarStock Pro<br>Automated ordering system</p>
</body></html>`;

    const headerLines = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : null,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`
    ].filter(Boolean);

    let message = headerLines.join(nl) + nl + nl;

    // ---- Outer mixed: related (text+inline image) + attachment ----

    // Start related (HTML body + inline image)
    message += `--${mixedBoundary}` + nl;
    message += `Content-Type: multipart/related; boundary="${relatedBoundary}"` + nl + nl;

    // HTML body
    message += `--${relatedBoundary}` + nl;
    message += `Content-Type: text/html; charset="UTF-8"` + nl;
    message += `Content-Transfer-Encoding: 7bit` + nl + nl;
    message += htmlBody + nl + nl;

    // Inline image
    if (jpgBase64) {
      const cleanB64 = jpgBase64.replace(/\s/g, '');
      const wrapped = cleanB64.match(/.{1,76}/g).join(nl);
      message += `--${relatedBoundary}` + nl;
      message += `Content-Type: image/jpeg` + nl;
      message += `Content-Transfer-Encoding: base64` + nl;
      message += `Content-ID: <${cid}>` + nl;
      message += `Content-Disposition: inline; filename="${safeFilename}"` + nl + nl;
      message += wrapped + nl + nl;
    }

    message += `--${relatedBoundary}--` + nl + nl;

    // Attachment (downloadable JPG)
    if (jpgBase64) {
      const cleanB64 = jpgBase64.replace(/\s/g, '');
      const wrapped = cleanB64.match(/.{1,76}/g).join(nl);
      message += `--${mixedBoundary}` + nl;
      message += `Content-Type: image/jpeg; name="${safeFilename}"` + nl;
      message += `Content-Disposition: attachment; filename="${safeFilename}"` + nl;
      message += `Content-Transfer-Encoding: base64` + nl + nl;
      message += wrapped + nl + nl;
    }

    message += `--${mixedBoundary}--`;

    const encoded = Buffer.from(message).toString('base64url');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded }
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('send-order error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
