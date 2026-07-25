const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { to, cc, replyTo, vendor, items, totalUnits, subtotal, locationName, jpgBase64, pdfBase64, filename, fromName, senderName: senderNameFromBody, senderEmail } = req.body || {};

    if (!to || !vendor || !items?.length) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    // Normaliza destinatarios: acepta string ("a@x.com, b@y.com") o array -> array limpio
    const normalizeEmails = (val) => {
      if (!val) return [];
      const arr = Array.isArray(val) ? val : String(val).split(',');
      return arr.map(e => String(e).trim()).filter(Boolean);
    };
    const toList = normalizeEmails(to);
    const ccList = normalizeEmails(cc);

    const subject = `Order for ${vendor} - ${new Date().toLocaleDateString()}`;
    const safeFilename = filename || `${vendor.toLowerCase().replace(/\s+/g, '_')}_order.pdf`;
    const loc = locationName || 'BarStock';
    const senderName = senderNameFromBody || fromName || loc;

    const escapeHtml = s => String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

    const htmlBody = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;line-height:1.6;margin:0;padding:0;background:#f8fafc">
<div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06)">

  <!-- HEADER -->
  <div style="background:#0b1220;padding:24px 36px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:baseline">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">BarStock</span><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#38bdf8;margin:0 2px;vertical-align:-1px"></span><span style="font-size:10px;font-weight:700;color:#475569;letter-spacing:0.1em;text-transform:uppercase;margin-left:3px">PRO</span>
      </td>
      <td style="text-align:right;vertical-align:middle">
        <span style="font-size:13px;color:#475569;font-weight:500">${escapeHtml(loc)}</span>
      </td>
    </tr></table>
  </div>

  <!-- BODY -->
  <div style="padding:36px">
    <p style="margin:0 0 20px;font-size:15px;color:#0f172a">Hello there,</p>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.75">This email confirms a new order request from <strong style="color:#0f172a">${escapeHtml(loc)}</strong>. The details for <strong style="color:#0f172a">${escapeHtml(vendor)}</strong> are attached as a PDF document for your review.</p>
    <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.75">Kindly confirm receipt and expected delivery date at your earliest convenience. If you have any questions, feel free to reply directly to this email.</p>

    <!-- DIVIDER -->
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px">

    <p style="margin:0;font-size:15px;color:#0f172a">Thank you,<br><strong>${escapeHtml(senderName || loc)}</strong></p>
  </div>

  <!-- FOOTER -->
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 36px;display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:11px;color:#94a3b8">Sent via BarStock Pro · Automated ordering system</span>
    <span style="font-size:11px;color:#94a3b8">${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
  </div>

</div>
</body></html>`;

    const payload = {
      from: `${loc} <orders@barstockpro.com>`,
      to: toList,
      subject,
      html: htmlBody,
    };

    if (ccList.length) payload.cc = ccList;
    if (senderEmail) payload.bcc = [senderEmail];
    if (replyTo) payload.replyTo = replyTo;

    if (pdfBase64) {
      payload.attachments = [{
        filename: safeFilename,
        content: pdfBase64,
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
