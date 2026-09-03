const { Resend } = require('resend');
const { shell, badge, table, attachment, signoff, callout } = require('../lib/email-shell');

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

    // ── El COGS por encima del objetivo se marca ──────────────────────
    //
    // En una tabla de cinco columnas de cifras, la única que importa de
    // verdad es si el porcentaje real superó al objetivo. En rojo se ve
    // sin leer la fila entera.
    const cogsCell = (real, target) => ({
      v: fmtPct(real),
      bold: true,
      color: (Number(real) || 0) > (Number(target) || 0) ? '#D85A30' : '#1D9E75'
    });

    const htmlBody = shell({
  right: loc,
  footer: 'Wine & Liquor Cost Reporting',
  body:
    badge('🍷', 'Cost report is ready', `${periodFrom} – ${periodTo}`, '#f3e8ff') +
    table(
      ['Category', 'Cost', 'Sales', 'COGS%', 'Target%'],
      [
        ['Wine',   fmt(totalWine),   fmt(wineSales),   cogsCell(wineCogs, wineTarget),     fmtPct(wineTarget)],
        ['Liquor', fmt(totalLiquor), fmt(liquorSales), cogsCell(liquorCogs, liquorTarget), fmtPct(liquorTarget)]
      ]
    ) +
    (notes ? callout('<b>Notes</b><br>' + escapeHtml(notes)) : '') +
    (pdfBase64 ? attachment(safeFilename, 'Full breakdown by vendor and category') : '') +
    `<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.75">Questions about any of the figures? Just reply to this email.</p>` +
    signoff(senderName || loc)
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
