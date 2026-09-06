const { Resend } = require('resend');
const { shell, badge, attachment, signoff } = require('../lib/email-shell');

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

    // ── Cuántos productos y cuántas unidades ──────────────────────────
    //
    // Va en el encabezado y no en una ficha aparte: es lo primero que
    // mira quien recibe un pedido, y repetirlo abajo solo alarga.
    const nProd = items.length;
    const nUnits = Number(totalUnits) || items.reduce((s, i) => s + (Number(i?.finalOrder) || 0), 0);
    const resumen = `${nProd} product${nProd === 1 ? '' : 's'}`
      + (nUnits ? ` · ${nUnits} unit${nUnits === 1 ? '' : 's'}` : '');

    // ── El único correo que sale de la empresa ────────────────────────
    //
    // Los otros cuatro los lee gente que usa la aplicación. Este lo abre
    // un comercial que no sabe qué es BarStock, en un Outlook
    // corporativo, entre cuarenta pedidos más. De ahí la caja y no un
    // carrito: un carrito sugiere que alguien está comprando en una web;
    // una caja es lo que este señor tiene que preparar.
    //
    // El texto es el que ya se enviaba, palabra por palabra. Solo se ha
    // quitado "for ${vendor}" de la primera frase, porque el titular ya
    // lo dice dos líneas más arriba y quedaba dicho dos veces.
    const htmlBody = shell({
  right: loc,
  footer: 'Automated ordering system',
  body:
    badge('📦', `New order for ${vendor}`, resumen) +
    `<p style="margin:0 0 20px;font-size:15px;color:#0f172a">Hello,</p>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.75">This email confirms a new order request from <strong style="color:#0f172a">${escapeHtml(loc)}</strong>. The details are attached as a PDF document for your review.</p>` +
    // La fila del adjunto solo si de verdad hay adjunto: anunciar un PDF
    // que no viaja sería peor que no anunciarlo.
    (pdfBase64 ? attachment(safeFilename, 'The full order, item by item') : '') +
    `<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.75">Kindly confirm receipt and expected delivery date at your earliest convenience. If you have any questions, feel free to reply directly to this email.</p>` +
    signoff(senderName || loc)
});

    const payload = {
      from: `${loc} <orders@barstockpro.com>`,
      to: toList,
      subject,
      html: htmlBody,
    };

    if (ccList.length) payload.cc = ccList;
    if (senderEmail) payload.bcc = [senderEmail];
    // Si la locación no configuró un reply-to, se cae al correo de su
    // perfil. NO a una dirección global: `orders@barstockpro.com` no
    // tiene buzón, y aunque lo tuviera, en una app multi-locación
    // recogería las respuestas de los proveedores de todos los clientes
    // en la misma bandeja. La respuesta de un proveedor pertenece a la
    // locación que hizo el pedido.
    //
    // Sin esto, un `replyTo` vacío dejaba al proveedor contestando a una
    // dirección muerta: él ve su correo enviado, y nadie lo recibe.
    const responder = replyTo || senderEmail || null;
    if (responder) payload.replyTo = responder;

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
