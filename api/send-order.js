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

    const boundary = '----barstock_boundary_' + Date.now();
    const nl = '\r\n';

    const headerLines = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : null,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`
    ].filter(Boolean);

    let message = headerLines.join(nl) + nl + nl;

    // Text part
    message += `--${boundary}` + nl;
    message += `Content-Type: text/plain; charset="UTF-8"` + nl;
    message += `Content-Transfer-Encoding: 7bit` + nl + nl;
    message += emailBody + nl + nl;

    // Attachment part
    if (jpgBase64) {
      const wrapped = jpgBase64.replace(/\s/g, '').match(/.{1,76}/g).join(nl);
      message += `--${boundary}` + nl;
      message += `Content-Type: image/jpeg; name="${safeFilename}"` + nl;
      message += `Content-Disposition: attachment; filename="${safeFilename}"` + nl;
      message += `Content-Transfer-Encoding: base64` + nl + nl;
      message += wrapped + nl + nl;
    }

    message += `--${boundary}--`;

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
