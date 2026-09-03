// ── El marco de todos los correos ────────────────────────────────────
//
// Cabecera azul marino con el logo, cuerpo blanco, pie con la línea de
// acento y el botón. Lo que cambia entre un correo y otro es lo de
// dentro; el marco es siempre este.
//
// ── Por qué vive fuera de api/ ───────────────────────────────────────
//
// Vercel cuenta como función serverless cada archivo dentro de api/, y
// el plan Hobby permite doce. Van once. Un archivo aquí lo empaqueta
// junto a quien lo importa sin gastar el hueco que queda.
//
// ── Por qué estilos en línea y tablas ────────────────────────────────
//
// No es descuido. Outlook y Gmail descartan las hojas de estilo y buena
// parte de flexbox, así que en correo se maqueta como en 2005: atributos
// en cada etiqueta y <table> para poner dos cosas en la misma fila. Un
// `display:flex` aquí se vería bien en el móvil y roto en Outlook.
//
// ── El marco salió de send-theoretical-report ────────────────────────
//
// Está copiado carácter a carácter del que ya se enviaba, no rediseñado.
// Los cuatro correos que ya funcionaban tienen que seguir viéndose
// exactamente igual: esto es quitar duplicación, no cambiar el aspecto.

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// `right`  — lo que va a la derecha del logo: la locación, o un aviso
//            interno. Se escapa aquí; quien llama pasa texto plano.
// `footer` — la línea pequeña del pie, después de "Sent via BarStock Pro".
// `body`   — HTML ya montado. Es el único parámetro que NO se escapa,
//            porque es la parte que cada correo construye a su manera.
function shell({ right, footer, body }) {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;line-height:1.6;margin:0;padding:0;background:#f8fafc">
<div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06)">

  <!-- HEADER -->
  <div style="background:#0b1220;padding:24px 36px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:baseline">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">BarStock</span><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#38bdf8;margin:0 2px;vertical-align:-1px"></span><span style="font-size:10px;font-weight:700;color:#475569;letter-spacing:0.1em;text-transform:uppercase;margin-left:3px">PRO</span>
      </td>
      <td style="text-align:right;vertical-align:middle">
        <span style="font-size:13px;color:#475569;font-weight:500">${escapeHtml(right)}</span>
      </td>
    </tr></table>
  </div>

  <!-- BODY -->
  <div style="padding:36px">
${body}
  </div>

  <!-- FOOTER -->
  <div style="background:#f8fafc;border-top:3px solid #0b1220;padding:20px 36px;text-align:center">
    <p style="margin:0 0 12px;font-size:11px;color:#94a3b8">Sent via BarStock Pro · ${escapeHtml(footer)}</p>
    <p style="margin:0 0 14px;font-size:12px;color:#64748b">Get control of your bar's inventory.</p>
    <a href="https://barstockpro.com" style="display:inline-block;background:#0b1220;color:#38bdf8;font-size:12px;font-weight:700;padding:10px 22px;border-radius:999px;text-decoration:none;letter-spacing:0.03em">barstockpro.com</a>
  </div>

</div>
</body></html>`;
}

// ── Piezas para el cuerpo ──────────────────────────────────────────────

// Una ficha de datos: pares etiqueta/valor. La usan los avisos internos
// —quién entró, quién se registró— donde el contenido es una lista de
// campos y no un texto corrido.
//
// Con <table> y no con divs: es lo único que alinea dos columnas en
// Outlook sin que la etiqueta y el valor acaben en líneas distintas.
function facts(rows) {
  const body = rows
    .filter(r => r && r[0])
    .map(([label, value]) => `
      <tr>
        <td style="padding:7px 0;font-size:13px;color:#64748b;width:120px;vertical-align:top">${escapeHtml(label)}</td>
        <td style="padding:7px 0;font-size:13px;color:#0f172a;font-weight:600">${escapeHtml(value || '—')}</td>
      </tr>`).join('');

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin:0 0 20px">
    ${body}
  </table>`;
}

// El titular del correo. Va antes de todo lo demás.
function heading(text, sub) {
  return `<p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a">${escapeHtml(text)}</p>` +
    (sub ? `<p style="margin:0 0 20px;font-size:13px;color:#64748b">${escapeHtml(sub)}</p>` : '');
}

// Un bloque destacado, para lo que hay que hacer o mirar.
function callout(text, tone) {
  const c = tone === 'warn'
    ? { bg: '#fffbeb', bd: '#fcd34d', tx: '#92400e' }
    : { bg: '#f0f9ff', bd: '#7dd3fc', tx: '#075985' };
  return `<div style="background:${c.bg};border:1px solid ${c.bd};border-radius:10px;padding:12px 14px;margin:0 0 20px">
    <p style="margin:0;font-size:13px;color:${c.tx}">${text}</p>
  </div>`;
}

module.exports = { shell, escapeHtml, facts, heading, callout };
