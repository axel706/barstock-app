const { Resend } = require('resend');

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

    const vendorRows = (byVendor || []).map(v =>
      `<tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:8px 12px">${escapeHtml(v.name)}</td>
        <td style="padding:8px 12px;text-align:right">${fmt(v.wine)}</td>
        <td style="padding:8px 12px;text-align:right">${fmt(v.liquor)}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:600">${fmt((v.wine || 0) + (v.liquor || 0))}</td>
      </tr>`
    ).join('');

    const htmlBody = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;line-height:1.6;margin:0;padding:0;background:#f8fafc">
<div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06)">

  <!-- HEADER -->
  <div style="background:#0b1220;padding:24px 36px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:baseline">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">BarStock</span><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#38bdf8;margin:0 2px;vertical-align:-1px"></span><span style="font-size:9px;font-weight:700;color:#475569;letter-spacing:0.1em;text-transform:uppercase;margin-left:3px">PRO</span>
      </td>
      <td style="text-align:right;vertical-align:middle">
        <span style="font-size:13px;color:#475569;font-weight:500">${escapeHtml(loc)}</span>
      </td>
    </tr></table>
  </div>

  <!-- BODY -->
  <div style="padding:36px">
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

${vendorRows ? `<p style="font-weight:600;margin-bottom:8px">Vendor-level invoice breakdown:</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px">
  <thead>
    <tr style="background:#f1f5fb">
      <th style="padding:10px 12px;text-align:left;color:#1e3a5f">Vendor</th>
      <th style="padding:10px 12px;text-align:right;color:#1e3a5f">Wine</th>
      <th style="padding:10px 12px;text-align:right;color:#1e3a5f">Liquor</th>
      <th style="padding:10px 12px;text-align:right;color:#1e3a5f">Total</th>
    </tr>
  </thead>
  <tbody>${vendorRows}</tbody>
</table>` : ''}

${notes ? `<p><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}

<p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.75">If you have any questions about the figures, feel free to reply to this email.</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px">
    <p style="margin:0;font-size:15px;color:#0f172a">Thank you,<br><strong>${escapeHtml(senderName || loc)}</strong></p>
  </div>

  <!-- FOOTER -->
  <div style="background:#f8fafc;border-top:3px solid #0b1220;padding:20px 36px;text-align:center">
    <p style="margin:0 0 14px;font-size:12px;color:#64748b">Sent via BarStock Pro — Wine &amp; Liquor Cost Reporting.</p>
    <a href="https://barstockpro.com" style="display:inline-block;background:#0b1220;color:#38bdf8;font-size:12px;font-weight:700;padding:10px 22px;border-radius:999px;text-decoration:none;letter-spacing:0.03em">barstockpro.com</a>
  </div>

</div>
</body></html>`;

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
