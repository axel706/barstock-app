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

    const emailBody = [
      `Hello,`,
      ``,
      `Please find attached the order from ${locationName || 'BarStock'} for ${vendor}.`,
      ``,
      `Summary:`,
      `  Items: ${items.length}`,
      `  Total units: ${totalUnits}`,
      ``,
      `Sent via BarStock Pro`
    ].join('\r\n');

    const boundary = '----barstock_boundary_' + Date.now();
    const headers = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : null,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``
    ].filter(Boolean).join('\r\n');

    const bodyPart = [
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      emailBody,
      ``
    ].join('\r\n');

    let attachmentPart = '';
    if (jpgBase64) {
      attachmentPart = [
        `--${boundary}`,
        `Content-Type: image/jpeg; name="${safeFilename}"`,
        `Content-Disposition: attachment; filename="${safeFilename}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        jpgBase64.match(/.{1,76}/g).join('\r\n'),
        ``
      ].join('\r\n');
    }

    const closing = `--${boundary}--`;
    const message = [headers, bodyPart, attachmentPart, closing].filter(Boolean).join('\r\n');

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
