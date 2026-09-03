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

// ── El icono en círculo, centrado ────────────────────────────────────
//
// Un emoji dentro de un círculo de color, con el titular debajo.
//
// Emoji y no un icono de fuente ni un SVG: Gmail elimina los SVG y
// Outlook no carga tipografías externas. Tampoco una imagen alojada,
// porque medio mundo tiene las imágenes bloqueadas por defecto y el
// icono desaparecería justo en la primera impresión. El emoji lo pinta
// el sistema operativo y llega siempre.
//
// El círculo se construye con una <table> de una celda y no con un div:
// es lo único que respeta ancho, alto y centrado en Outlook. Aun así
// Outlook de escritorio ignora border-radius y lo verá cuadrado — se
// degrada a un cuadrado de color, que sigue funcionando.
function badge(emoji, title, sub, bg) {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="56" height="56" align="center" valign="middle"
            style="width:56px;height:56px;background:${bg || '#e0f2fe'};border-radius:28px;font-size:26px;line-height:56px">${emoji}</td>
      </tr></table>
      <p style="margin:16px 0 6px;font-size:19px;font-weight:700;color:#0f172a">${escapeHtml(title)}</p>
      ${sub ? `<p style="margin:0;font-size:14px;color:#64748b">${escapeHtml(sub)}</p>` : ''}
    </td></tr>
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

// ── Un bloque con algo que hacer ─────────────────────────────────────
//
// Titular, una línea de contexto y un botón. Es el `callout` cuando
// además hay que actuar.
//
// El botón es un <a> con relleno y no un <button>: fuera del navegador
// no hay JavaScript ni formularios, y un <button> en un correo no hace
// absolutamente nada. Lo único que funciona en los cincuenta clientes de
// correo que existen es un enlace disfrazado de botón.
//
// Outlook de escritorio ignora border-radius, así que ahí sale con las
// esquinas rectas. Sigue siendo un botón oscuro con texto blanco.
function action(title, text, label, href, tone) {
  const c = tone === 'warn'
    ? { bg: '#fffbeb', bd: '#fcd34d', tx: '#92400e' }
    : { bg: '#f0f9ff', bd: '#7dd3fc', tx: '#075985' };
  return `<div style="background:${c.bg};border:1px solid ${c.bd};border-radius:10px;padding:16px 18px;margin:0 0 20px">
    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${c.tx}">${escapeHtml(title)}</p>
    <p style="margin:0 0 14px;font-size:13px;color:${c.tx}">${escapeHtml(text)}</p>
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#0b1220;color:#ffffff;font-size:13px;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none">${escapeHtml(label)}</a>
  </div>`;
}

// ── El adjunto, dentro del cuerpo ────────────────────────────────────
//
// El PDF ya viaja adjunto; esto no lo sustituye, lo anuncia. Los
// clientes de correo colocan los adjuntos al final del mensaje, lejos
// del párrafo que los menciona, y en el móvil hay que bajar hasta el
// fondo para comprobar que llegó algo. Esta fila lo pone donde se está
// leyendo.
//
// El tamaño no aparece a propósito. El servidor recibe el PDF en
// base64, que abulta un tercio más que el archivo real, y el número que
// podría calcular aquí no sería el que va a ver quien lo reciba. Vale
// más una línea que diga qué contiene que un peso que miente.
//
// Con <table> y no con flex, por lo de siempre: Outlook no hace flex.
function attachment(filename, note) {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;margin:0 0 22px">
    <tr>
      <td width="46" align="center" valign="middle" style="padding:12px 0 12px 14px;font-size:22px;line-height:1">📄</td>
      <td valign="middle" style="padding:12px 14px 12px 0">
        <span style="display:block;font-size:13px;font-weight:700;color:#0f172a;word-break:break-all">${escapeHtml(filename)}</span>
        ${note ? `<span style="display:block;font-size:12px;color:#64748b">${escapeHtml(note)}</span>` : ''}
      </td>
    </tr>
  </table>`;
}

// ── Una tabla de datos ───────────────────────────────────────────────
//
// `head` son los encabezados; el primero se alinea a la izquierda y el
// resto a la derecha, porque la primera columna siempre es el nombre de
// algo y las demás siempre son cifras. `rows` son arrays de celdas; una
// celda puede ser texto o {v, bold, color} cuando hay que destacarla.
function table(head, rows) {
  const th = head.map((h, i) => `<th style="padding:9px 10px;text-align:${i ? 'right' : 'left'};color:#1e3a5f;font-size:13px">${escapeHtml(h)}</th>`).join('');
  const tr = rows.map(cells => '<tr>' + cells.map((c, i) => {
    const o = (c && typeof c === 'object') ? c : { v: c };
    const st = `padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:${i ? 'right' : 'left'}`
      + (o.bold || i === 0 ? ';font-weight:600' : '')
      + (o.color ? `;color:${o.color}` : '');
    return `<td style="${st}">${escapeHtml(o.v)}</td>`;
  }).join('') + '</tr>').join('');

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 20px">
    <thead><tr style="background:#f1f5fb">${th}</tr></thead>
    <tbody>${tr}</tbody>
  </table>`;
}

// La despedida: una línea de separación y la firma de quien manda.
function signoff(name) {
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px">
    <p style="margin:0;font-size:15px;color:#0f172a">Thank you,<br><strong>${escapeHtml(name)}</strong></p>`;
}

module.exports = { shell, escapeHtml, facts, heading, callout, badge, action, attachment, table, signoff };
