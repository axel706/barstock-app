const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { to, cc, vendor, items, totalUnits, subtotal, locationName } = req.body || {};

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

    const itemRows = items.map(item =>
      `  - ${item.item} (${item.code || 'N/A'}) - Qty: ${item.finalOrder}`
    ).join('\n');

    const emailBody = [
      `Order from: ${locationName || 'BarStock'}`,
      `Vendor: ${vendor}`,
      `Date: ${new Date().toLocaleDateString()}`,
      ``,
      `Items:`,
      itemRows,
      ``,
      `Total units: ${totalUnits}`,
      `Subtotal: $${Number(subtotal || 0).toFixed(2)}`,
      ``,
      `Sent via BarStock Pro`
    ].join('\n');

    const subject = `Order for ${vendor} - ${new Date().toLocaleDateString()}`;

    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      emailBody
    ].join('\n');

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
