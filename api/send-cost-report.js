const { Resend } = require('resend');
const { shell } = require('../lib/email-shell');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const {
      to, cc, replyTo,
      locationName, periodFrom, periodTo,
      totalWine, totalLiquor, wineSales, liquorSales,
      wineTarget, liquorTarget, wineCogs, liquorCogs,
      byVendor, notes,
      senderName, senderEmail,
      pdfBase64, filename
    } = req.body || {};

    if (!to || !periodFrom || !periodTo) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    const normalizeEmails = (val) => {
      if (!val) return [];
      const arr = Array.isArray(val) ? val : String(val).split(',');
      return arr.map(e => String(e).trim()).filter(Boolean);
    };
    const toList = normalizeEmails(to);
    const ccList = normalizeEmails(cc);

    const loc = locationName || 'BarStock';
    const fmt = v => '$' + (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtPct = v => (Number(v) || 0).toFixed(1) + '%';
    const escapeHtml = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const subject = `Wine & Liquor Cost Report — ${periodFrom} to ${periodTo}`;
    const safeFilename = filename || `cost_report_${periodFrom}_to_${periodTo}.pdf`;

    // El desglose por vendor se quito del email a peticion de Axel.
    // Sigue estando en el PDF adjunto, que se arma del lado del cliente
    // y no pasa por aqui.

    const htmlBody = shell({
  right: loc,
  footer: 'Wine & Liquor Cost Reporting',
  body: `
    <p style="margin:0 0 20px;font-size:15px;color:#0f172a">Hello,</p>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.75">Please find attached the <strong style="color:#0f172a">Wine &amp; Liquor Cost Performance Report</strong> for <strong style="color:#0f172a">${escapeHtml(periodFrom)}</strong> through <strong style="color:#0f172a">${escapeHtml(periodTo)}</strong>. A summary is included below for quick reference.</p>

<table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px">
  <thead>
    <tr style="background:#f1f5fb">
      <th style="padding:10px 12px;text-align:left;color:#1e3a5f">Category</th>
      <th style="padding:10px 12px;text-align:right;color:#1e3a5f">Cost</th>
      <th style="padding:10px 12px;text-align:right;color:#1e3a5f">Sales</th>
      <th style="padding:10px 12px;text-align:right;color:#1e3a5f">COGS%</th>
      <th style="padding:10px 12px;text-align:right;color:#1e3a5f">Target%</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:8px 12px;font-weight:600">Wine</td>
      <td style="padding:8px 12px;text-align:right">${fmt(totalWine)}</td>
      <td style="padding:8px 12px;text-align:right">${fmt(wineSales)}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:600">${fmtPct(wineCogs)}</td>
      <td style="padding:8px 12px;text-align:right">${fmtPct(wineTarget)}</td>
    </tr>
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:8px 12px;font-weight:600">Liquor</td>
      <td style="padding:8px 12px;text-align:right">${fmt(totalLiquor)}</td>
      <td style="padding:8px 12px;text-align:right">${fmt(liquorSales)}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:600">${fmtPct(liquorCogs)}</td>
      <td style="padding:8px 12px;text-align:right">${fmtPct(liquorTarget)}</td>
    </tr>
  </tbody>
</table>

${notes ? `<p><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}

<p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.75">If you have any questions about the figures, feel free to reply to this email.</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px">
    <p style="margin:0;font-size:15px;color:#0f172a">Thank you,<br><strong>${escapeHtml(senderName || loc)}</strong></p>`
});

    const payload = {
      from: `${loc} <reports@barstockpro.com>`,
      to: toList,
      subject,
      html: htmlBody,
    };

    if (ccList.length) payload.cc = ccList;
    if (senderEmail) payload.bcc = [senderEmail];
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
    console.error('send-cost-report error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
