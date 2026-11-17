// ── El correo del código de alta ─────────────────────────────────────
//
// Axel, 2026-11-17, sobre lámina: quien crea a una persona en People
// con "They set it" puede ponerle un correo, y la app le manda su código
// en vez de copiarlo a mano. Texto de la versión 1 ("cálido y corto"),
// pasos en estilo B (números unidos por una línea) y, antes del código,
// lo que es su cuenta (YOUR ACCOUNT: tipo, locaciones y con qué entra).
//
// El código sólo existe en el momento de crearlo (el servidor guarda su
// huella, no el código): por eso este correo sale al crear la persona o
// al pedir uno nuevo, nunca después.
//
// El marco es el de todos los correos (email-shell.js). La línea entre
// los pasos es una celda de 2 px con fondo y no un degradado: una celda
// mide siempre el alto de su fila, y Outlook no pinta degradados (en la
// lámina, la primera versión con height:100% ni siquiera se veía).
const S = require('./email-shell');
const esc = S.escapeHtml;

const APP = 'https://app.barstockpro.com';

// "Tue, Nov 17 at 6:00 PM", en la hora de Nueva York, que es la de los bares.
function cuando(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (o) => new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: 'America/New_York' }, o)).format(d);
  return p({ weekday: 'short' }) + ', ' + p({ month: 'short', day: 'numeric' }) + ' at ' + p({ hour: 'numeric', minute: '2-digit' });
}

// La dirección del QR y del botón: el login la lee y la borra al entrar.
function enlace(nombre, code) {
  return APP + '/?alta=' + encodeURIComponent(nombre) + '&c=' + encodeURIComponent(code);
}

// d = { nombre, quien, rol, locaciones: [nombres], code, expira }
function armar(d) {
  const nombre = String(d.nombre || '').trim();
  const quien = String(d.quien || '').trim() || 'BarStock';
  const locs = (d.locaciones || []).filter(Boolean);
  const code = String(d.code || '');
  const derecha = locs[0] || 'BarStock';

  const saludo = S.heading('Hi ' + nombre + ', welcome to BarStock',
    quien + ' just set up your account' + (locs.length ? ' at ' + locs[0] : '') + '. It takes about 5 minutes to get in.');

  const cuenta = '<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#64748b">Your account</p>' +
    S.facts([
      ['Account type', d.rol || ''],
      ['Locations', locs.join(' · ')],
      ['Sign in with', 'Your name (' + nombre + ') and your own PIN']
    ]);

  const codigo = '<div style="text-align:center;background:#0b1220;border-radius:14px;padding:22px 16px;margin:0 0 8px">' +
      '<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#38bdf8">Your sign-in code</p>' +
      '<p style="margin:0;font-size:38px;font-weight:800;letter-spacing:.18em;color:#f8fafc;font-family:ui-monospace,Menlo,monospace">' +
        esc(code.slice(0, 3) + ' ' + code.slice(3)) + '</p></div>' +
    '<p style="margin:0 0 26px;font-size:13px;color:#64748b;text-align:center">Works once, until ' + esc(cuando(d.expira)) + '. Keep it to yourself.</p>';

  const pasos = [
    ['Add BarStock to your home screen', 'In Safari, open <b>app.barstockpro.com</b> and tap <b>⋯</b> › <b>Share</b> › <b>Add to Home Screen</b> › <b>Add</b>.'],
    ['Open it from the new icon', 'That’s how you’ll open it from now on.'],
    ['Enter your name and code', 'Tap <b>PIN</b>, type <b>' + esc(nombre) + '</b>, and enter the code above.'],
    ['Create your PIN', 'Pick 6 digits you’ll remember and type them twice. Done.']
  ];
  const vacia = '<td width="15" style="width:15px;font-size:0;line-height:0">&nbsp;</td>';
  const fila = ([t, txt], i) => {
    const ult = i === pasos.length - 1;
    return '<tr><td colspan="3" width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;border-radius:16px;background:#0b1220;color:#38bdf8;font-size:14px;font-weight:800">' + (i + 1) + '</td>' +
      '<td valign="middle" style="padding:0 0 0 14px"><p style="margin:0;font-size:14px;font-weight:700;color:#0f172a">' + t + '</p></td></tr>' +
      '<tr>' + vacia + '<td width="2" style="width:2px;' + (ult ? '' : 'background:#bae6fd;') + 'font-size:0;line-height:0">&nbsp;</td>' + vacia +
      '<td valign="top" style="padding:4px 0 ' + (ult ? 0 : 22) + 'px 14px"><p style="margin:0;font-size:13px;color:#475569">' + txt + '</p></td></tr>';
  };
  const lista = '<p style="margin:0 0 14px;font-size:15px;font-weight:700;color:#0f172a">Get in · 5 minutes</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:separate">' +
    pasos.map(fila).join('') + '</table>';

  const boton = S.action('On your phone right now?', 'Tap below to jump straight to creating your PIN.',
    'Set up my account', enlace(nombre, code));
  const firma = '<p style="margin:0;font-size:15px;color:#0f172a">See you in the app,<br><strong>' + esc(quien) + '</strong></p>';

  return {
    asunto: 'Your BarStock account is ready, ' + nombre,
    html: S.shell({ right: derecha, footer: 'Your account', body: saludo + cuenta + codigo + lista + boton + firma })
  };
}

module.exports = { armar, enlace, cuando, APP };
