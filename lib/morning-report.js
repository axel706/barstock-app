// ── El correo de la mañana ───────────────────────────────────────────
//
// Axel, 2026-11-12, sobre lámina (CLAUDE.md, "El correo de la mañana"):
// el molde del correo de órdenes (lib/email-shell.js), con una o dos
// frases en palabras encima de cada bloque: ni lista seca ni carta.
//
//   · El saludo, con una línea que resume el día.
//   · Yesterday: el Net de Toast en dinero (total, licor con cócteles,
//     vino) y luego en botellas, cada uno contra lo de siempre de ese día
//     de la semana. Sin la lista de lo más vendido: le sobraba.
//   · Won't make it to Sunday: lo que se acaba antes del domingo, en una
//     sola sección, por el día en que se acaba, cada uno con cuánto pedir
//     para llegar al domingo (run-out.js, cuantoPedir). Sin "What stood
//     out" y sin la etiqueta "from LOOP": las dos se quitaron.
//
// Las frases salen de plantillas que eligen los números, no de una IA:
// nunca dicen nada que los datos no digan.
//
// Aquí se ESCRIBE y se MANDA; los números se calculan en la app
// (src/morning-report.js), con los mismos módulos que enseñan el Home y
// la ficha. Así un número no se calcula en dos sitios. La carga
// automática de cada mañana, cuando se haga, tendrá que calcularlos en
// el servidor: es lo que queda pendiente.
//
// Se manda al correo de quien tiene la sesión (api/integrations.js la
// comprueba y deja el usuario en req.usuario) o a la lista de la
// locación, que se lee aquí de la base (Settings › Emails, migración
// 035). Aunque la petición traiga otros destinatarios, no se usan: esta
// función no puede servir para mandar correos a cualquiera.

const { shell, escapeHtml: esc } = require('./email-shell');
const Permisos = require('../src/permisos.js');

const D3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fecha = (d) => new Date(String(d) + 'T12:00:00Z');
const dow = (d) => fecha(d).getUTCDay();
const esFecha = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
const dinero = (n) => '$' + Math.round(n).toLocaleString('en-US');
const uno = (n) => (Math.round(n * 10) / 10).toFixed(1);
// Cuánto se aleja de lo de siempre, en %, o null si no hay con qué
// comparar (sin historia, o lo de siempre es cero).
const pct = (v, n) => (num(v) === null || !(num(n) > 0) ? null : Math.round((v - n) / n * 100));
const nombres = (xs) => xs.length < 2 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];

// ── Lo que viene de la app, limpio ────────────────────────────────────
// Números finitos o null; textos con tope; como mucho 40 productos.
function limpiar(d) {
  d = d && typeof d === 'object' ? d : {};
  const a = d.ayer && typeof d.ayer === 'object' ? d.ayer : {};
  const N = ['dinero', 'licor', 'vino', 'normalDinero', 'normalLicor', 'normalVino',
    'botellas', 'botLicor', 'botVino', 'normalBotellas', 'normalBotLicor', 'normalBotVino'];
  const ayer = { fecha: esFecha(a.fecha) ? a.fecha : null, cargado: a.cargado === true };
  for (const k of N) ayer[k] = num(a[k]);
  const agotan = (Array.isArray(d.agotan) ? d.agotan : []).slice(0, 40)
    .filter(x => x && typeof x === 'object' && esFecha(x.agota) && num(x.pedir) > 0)
    .map(x => ({ producto: String(x.producto || '').slice(0, 120), agota: x.agota,
      queda: Math.max(0, num(x.queda) || 0), vende: num(x.vende) || 0, llega: num(x.llega) || 0,
      pedir: Math.ceil(num(x.pedir)) }));
  // Si la app no pudo saber qué se acaba, dice por qué. Sin esto, una
  // lista vacía se leería "nothing runs out", que sería mentira.
  const prevision = ['counting', 'history', 'error'].includes(d.prevision) ? d.prevision : 'ok';
  return { local: String(d.local || '').slice(0, 80), hoy: esFecha(d.hoy) ? d.hoy : null, ayer, agotan, prevision,
    detalle: String(d.detalle || '').slice(0, 160), semanal: limpiarSemana(d.semanal) };
}

// El resumen de la semana (src/morning-report.js, semanal): o entero y
// limpio, o null y el correo es el de cada día.
function limpiarSemana(s) {
  if (!s || typeof s !== 'object' || !esFecha(s.lunes)) return null;
  const t = s.total && typeof s.total === 'object' ? s.total : {};
  const total = {};
  for (const k of ['dinero', 'licor', 'vino', 'botellas', 'botLicor', 'botVino',
    'normalDinero', 'normalLicor', 'normalVino', 'normalBotellas', 'normalBotLicor', 'normalBotVino']) total[k] = num(t[k]);
  const prod = (x) => x && typeof x === 'object' && num(x.botellas) > 0
    ? { nombre: String(x.nombre || '').slice(0, 120), botellas: x.botellas } : null;
  const dm = s.domingo && typeof s.domingo === 'object' ? s.domingo : {};
  return {
    lunes: s.lunes, cargados: Math.max(0, Math.min(7, Math.round(num(s.cargados) || 0))), total,
    mejor: s.mejor && esFecha(s.mejor.fecha) && num(s.mejor.dinero) > 0 ? { fecha: s.mejor.fecha, dinero: s.mejor.dinero } : null,
    top: (Array.isArray(s.top) ? s.top : []).slice(0, 3).map(prod).filter(Boolean),
    domingo: esFecha(dm.fecha) ? { fecha: dm.fecha, cargado: dm.cargado === true, dinero: num(dm.dinero),
      normalDinero: num(dm.normalDinero), top: prod(dm.top) } : null,
    plan: (Array.isArray(s.plan) ? s.plan : []).slice(0, 7).filter(x => x && esFecha(x.fecha))
      .map(x => ({ fecha: x.fecha, dinero: num(x.dinero), botellas: num(x.botellas) })),
    conteo: limpiarConteo(s.conteo)
  };
}

// Live vs count (src/live-diagnostico.js): lo que encontró el conteo y lo
// que podría ser. Una causa que no se conoce no entra: no hay plantilla
// que la diga.
const CAUSAS = ['receta', 'caja', 'conteo', 'merma', 'pronto'];
function limpiarConteo(c) {
  if (!c || typeof c !== 'object') return null;
  if (c.error) return { error: String(c.error).slice(0, 200) };
  if (c.hay !== true) return { hay: false };
  if (c.invalido === true) return { hay: true, invalido: true, fin: esFecha(c.fin) ? c.fin : null, horas: Math.max(0, Math.round(num(c.horas) || 0)), lista: [], mas: 0, corto: 0, sobra: 0, sinConvertir: [] };
  const ent = (x, a, b) => Math.max(a, Math.min(b, Math.round(num(x) || 0)));
  return {
    hay: true, fin: esFecha(c.fin) ? c.fin : null, provisional: c.provisional === true,
    mas: ent(c.mas, 0, 999), corto: Math.abs(num(c.corto) || 0), sobra: Math.abs(num(c.sobra) || 0),
    lista: (Array.isArray(c.lista) ? c.lista : []).slice(0, 6)
      .filter(x => x && typeof x === 'object' && CAUSAS.includes(x.causa) && num(x.dif) !== null && x.dif !== 0)
      .map(x => ({ item: String(x.item || '').slice(0, 120), esperado: num(x.esperado) || 0, contado: num(x.contado) || 0,
        dif: x.dif, vendido: num(x.vendido) || 0, parte: num(x.parte), dinero: num(x.dinero),
        proveedor: String(x.proveedor || '').slice(0, 60), causa: x.causa,
        semanas: ent(x.semanas, 0, 52), desvio: ent(x.desvio, 0, 1000), caja: ent(x.caja, 0, 48),
        antes: num(x.antes), cuadro: ent(x.cuadro, 0, 52) })),
    sinConvertir: (Array.isArray(c.sinConvertir) ? c.sinConvertir : []).slice(0, 4)
      .filter(x => x && x.nombre).map(x => ({ nombre: String(x.nombre).slice(0, 80), unidades: ent(x.unidades, 0, 1e6) }))
  };
}

// ── Los bloques (los mismos de la lámina) ─────────────────────────────
const P = (t, m) => `<p style="margin:${m || '0 0 14px'};font-size:15px;line-height:1.65;color:#1f2937">${t}</p>`;
const b = (t) => `<strong style="color:#0f172a">${t}</strong>`;
const rotulo = (t, color) => `<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${color || '#64748b'}">${t}</p>`;
const flecha = (p) => p === null ? '&nbsp;'
  : `<span style="color:${p >= 0 ? '#15803d' : '#b91c1c'};font-weight:700">${p >= 0 ? '↗' : '↘'} ${Math.abs(p)}%</span>`;

// Las tarjetas son las CELDAS mismas, no una caja dentro de cada celda:
// en una tabla todas las celdas de una fila miden lo mismo, así que las
// tres quedan iguales aunque una línea sea más larga (Axel: "asegúrate de
// que tengan el mismo tamaño"). Ancho fijo (table-layout: fixed) y el
// hueco en su propia columna de 8 px: un padding sólo en la segunda y la
// tercera las dejaba más estrechas que la primera. Debajo del número sólo
// la flecha: "vs usual" se partía en dos líneas en pantallas estrechas,
// y se dice una vez debajo de las tarjetas.
const tarjetas = (xs) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;margin:0 0 12px"><tr>` +
  xs.map((x, i) => (i ? '<td width="8" style="width:8px;font-size:0;line-height:0">&nbsp;</td>' : '') +
    `<td valign="top" style="border:1px solid #e2e8f0;border-radius:10px;padding:11px 12px 10px;background:#f8fafc">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b">${x.k}</p>
      <p style="margin:3px 0 1px;font-size:21px;font-weight:800;color:#0f172a;letter-spacing:-.02em">${x.v}</p>
      <p style="margin:0;font-size:12px;color:#64748b">${flecha(x.p)}</p></td>`).join('') + `</tr></table>`;

const ROJO = { bg: '#fee2e2', tx: '#b91c1c' }, AMBAR = { bg: '#fef3c7', tx: '#92400e' };
const filas = (xs, hoy, meta, rango) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px">` +
  xs.map(x => {
    const c = x.agota <= hoy ? ROJO : AMBAR;
    const tag = x.agota <= hoy ? 'Out today' : 'Out ' + D3[dow(x.agota)];
    const sub = uno(x.queda) + ' left · ' + rango + ' usually sells ' + uno(x.vende) +
      (x.llega > 0 ? ' · ' + uno(x.llega) + ' on the way' : '');
    return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid #f1f5f9"><span style="font-size:14px;font-weight:600;color:#0f172a">${esc(x.producto)}</span>
      <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:${c.bg};color:${c.tx};vertical-align:1px">${tag}</span><br>
      <span style="font-size:12px;color:#64748b">${esc(sub)}</span></td>
    <td style="padding:9px 0;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:top;white-space:nowrap">
      <span style="display:block;font-size:15px;font-weight:800;color:#0369a1">Order ${x.pedir}</span><span style="display:block;font-size:11px;color:#64748b">${meta}</span></td></tr>`;
  }).join('') + `</table>`;

// ── Las frases ────────────────────────────────────────────────────────
//
// Axel, 2026-11-15: "el correo necesita distintas variaciones, no decir
// siempre todos los días lo mismo". Cada situación tiene VARIAS frases
// que dicen lo mismo con otras palabras, y la del día sale de la fecha
// (`semilla`): el mismo día siempre dice lo mismo (una vista previa y el
// automático coinciden, y las pruebas no bailan), pero cambia de un día
// a otro. Cada hueco suma su propio desplazamiento (`k`) para que no
// roten todos a la vez. Siguen siendo plantillas que eligen los números,
// no una IA: ninguna dice nada que los datos no digan.
const una = (lista, semilla, k) => lista[((semilla + (k || 0)) % lista.length + lista.length) % lista.length];
const semillaDe = (d) => (esFecha(d) ? Math.round(fecha(d).getTime() / 864e5) : 0);

// Cómo fue ayer: ±10% de lo de siempre es "normal".
function comoFue(a, semilla) {
  const dl = DL[dow(a.fecha)];
  if (!a.cargado) return { corta: null, larga: `${dl}'s sales from Toast haven't loaded yet.` };
  if (!(a.dinero > 0) && !(a.normalDinero > 0)) return { corta: `${dl} was closed`, larga: `${dl} was closed.` };
  const p = pct(a.dinero, a.normalDinero);
  const $ = b(dinero(a.dinero));
  if (p === null) return { corta: `Here's ${dl}`, larga: `You did ${$} in drinks.` };
  const corta = p >= 10
    ? una([`${dl} was a good night`, `${dl} came in strong`, `${dl} beat a usual ${dl}`, `${dl} was a busy one`], semilla, 1)
    : p <= -10
      ? una([`${dl} was a slow night`, `${dl} came in light`, `${dl} was quieter than usual`], semilla, 1)
      : una([`${dl} was a normal night`, `${dl} was right on pace`, `${dl} looked like a usual ${dl}`], semilla, 1);
  const cuanto = b(Math.abs(p) + '%');
  const larga = Math.abs(p) < 10
    ? una([`You did ${$} in drinks, right around a usual ${dl}.`,
           `Drinks came to ${$}, about what a ${dl} usually does.`,
           `${$} in drinks, in line with a usual ${dl}.`], semilla, 2)
    : p > 0
      ? una([`You did ${$} in drinks, ${cuanto} more than a usual ${dl}.`,
             `Drinks came to ${$}, ${cuanto} above a usual ${dl}.`,
             `${$} in drinks: ${cuanto} over what a ${dl} usually brings.`], semilla, 2)
      : una([`You did ${$} in drinks, ${cuanto} less than a usual ${dl}.`,
             `Drinks came to ${$}, ${cuanto} below a usual ${dl}.`,
             `${$} in drinks: ${cuanto} under what a ${dl} usually brings.`], semilla, 2);
  return { corta, larga, p };
}
function quienLlevo(a, semilla) {
  const t = (a.licor || 0) + (a.vino || 0);
  if (!(t > 0)) return '';
  const l = (a.licor || 0) / t;
  return l >= 0.55
    ? una([' Liquor, cocktails included, carried most of it.', ' Most of it was liquor, cocktails included.', ' Liquor led the way, cocktails included.'], semilla, 3)
    : l <= 0.45
      ? una([' Wine carried most of it.', ' Most of it was wine.', ' Wine led the way.'], semilla, 3)
      : una([' Liquor and wine came in close to even.', ' Liquor and wine split it almost evenly.'], semilla, 3);
}

// "Tito's and Aperol run out today. Casamigos goes on Friday; …"
function fraseAgotan(xs, hoy) {
  const porDia = new Map();
  for (const x of xs) {
    const k = x.agota <= hoy ? hoy : x.agota;
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k).push(x.producto);
  }
  const partes = [];
  let hoyTexto = '';
  for (const [d, ns] of porDia) {
    const n = nombres(ns.map(esc));
    if (d === hoy) hoyTexto = b(n + (ns.length > 1 ? ' run out today.' : ' runs out today.'));
    else partes.push(n + (ns.length > 1 ? ' go on ' : ' goes on ') + DL[dow(d)]);
  }
  return [hoyTexto, partes.length ? partes.join('; ') + '.' : ''].filter(Boolean).join(' ');
}

// Lo que se acaba, o por qué no se sabe. El mismo bloque en el correo de
// cada día y en el del lunes.
function agotanHtml(d, ag) {
  const hoy = d.hoy;
  const domingo = hoy && dow(hoy) === 0;
  const meta = domingo ? 'through today' : 'through Sunday';
  const rango = domingo ? 'Sun' : D3[dow(hoy)] + '–Sun';
  let html = '';
  // Sin previsión: se dice por qué, en el sitio de la sección.
  if (d.prevision !== 'ok') {
    const porque = d.prevision === 'counting'
      ? "A count is in progress, so there's no live stock to work from yet. This comes back once the count is closed."
      : d.prevision === 'history'
        ? "There's not enough Toast history yet to know what a usual day sells, so there's no forecast."
        : 'Could not work out what runs out this morning' + (d.detalle ? ': ' + esc(d.detalle) : '') + '.';
    return rotulo('What runs out') + P(porque, '0 0 26px');
  }
  // Won't make it to Sunday
  if (ag.length) {
    html += rotulo(domingo ? "Won't make it through today" : "Won't make it to Sunday", '#b91c1c') +
      P(fraseAgotan(ag, hoy) + ` This is what it would take to get ${domingo ? 'through today' : 'through Sunday'}:`) +
      filas(ag, hoy, meta, rango) +
      `<p style="margin:-10px 0 22px;font-size:12px;line-height:1.6;color:#64748b">How much to order: what each day from today to Sunday usually sells (the median of the last 13 weeks in Toast), minus what's left and what's already on its way, rounded up to whole bottles.</p>`;
  }
  return html;
}
const ordenAgotan = (xs) => xs.slice().sort((x, y) => (x.agota < y.agota ? -1 : x.agota > y.agota ? 1 : y.pedir - x.pedir));
const boton = `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
  <a href="https://app.barstockpro.com" style="display:inline-block;background:#0b1220;color:#ffffff;font-size:14px;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none">Open BarStock</a></td></tr></table>`;
const etiquetaHoy = (hoy) => { const f = fecha(hoy); return `${DL[f.getUTCDay()]} · ${M3[f.getUTCMonth()]} ${f.getUTCDate()}`; };

// ── Live vs count: lo que encontró el conteo (Axel, 2026-11-17) ─────
//
// "Que no sólo ponga el dato sino que sugiera qué estuvo mal." Cada
// producto que se alejó, con si tuvo más o menos, cuánto, y "What it
// could be": la causa la eligen los números en src/live-diagnostico.js
// (la tabla de docs/plan-esperado.md); aquí sólo se escribe. Siempre
// "could be": la app señala, Axel decide.
const NUMS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
const cifra = (n) => (Math.round(n * 10) / 10).toString();
const dineroSigno = (n) => (n < 0 ? '−' : '+') + dinero(Math.abs(n));
function porQue(x) {
  const corto = x.dif < 0, item = esc(x.item);
  switch (x.causa) {
    case 'receta': return {
      que: `${x.semanas >= 3 ? 'very likely ' : ''}a recipe or pour. It's been ${corto ? 'short' : 'over'} by a similar share of what it sold ${x.semanas} weeks in a row: the bottles really used were about ${x.desvio}% ${corto ? 'more' : 'less'} than the recipes and pours say.`,
      luego: (x.semanas < 3 ? "If next Sunday is the same, it's very likely the recipe. " : '') + `Check the recipes and pours that use ${item} in Settings › Toast.` };
    case 'caja': return {
      que: `a case that arrived without an order or invoice. ${x.caja} is exactly one case.`,
      luego: `Check if ${x.proveedor ? esc(x.proveedor) : 'a vendor'} dropped off ${item} last week, and log it so the app counts it.` };
    case 'conteo': return {
      que: `a counting slip. Last week it came out ${cifra(Math.abs(x.antes || 0))} ${(x.antes || 0) < 0 ? 'short' : 'over'}, and this week about the same the other way: together they cancel out.`,
      luego: "Nothing is missing if the two add up. Worth checking where it's kept, so it's counted the same way every Sunday." };
    case 'merma': return {
      que: `a bottle that went missing, or one that wasn't counted. It came out close to what the app expected the ${x.cuadro} weeks before, and this week it's short.`,
      luego: 'Check other storage spots first.' + (x.dinero ? ` If it isn't there, that's ${dinero(Math.abs(x.dinero))} gone.` : '') };
    default: return {
      que: corto
        ? 'too early to tell. A short recipe or pour, a counting slip, or a bottle that went missing all look the same in one week.'
        : "too early to tell. A recipe or pour that subtracts too much, a counting slip, or a delivery that wasn't logged all look the same in one week.",
      luego: "We'll know next Sunday: a recipe repeats by a similar share, a counting slip comes back the other way, and a loss doesn't." };
  }
}
function conteoHtml(c) {
  const dia = c && c.fin ? DL[dow(c.fin)] : 'Sunday';
  let html = rotulo(`Live vs count · what ${dia}'s count found`);
  if (c.error) return html + P(`Couldn't read what the count found: ${esc(c.error)}`, '0 0 26px');
  if (!c.hay) return html + P("No count was closed last week, so there's nothing to compare yet.", '0 0 26px');
  // Un ciclo que no cubrió una semana no se compara: lo que diría sería
  // basura (src/live-diagnostico.js, MIN_HORAS).
  if (c.invalido) return html + P(`${dia}'s count can't be compared: the cycle it closed only covered ${c.horas} ${c.horas === 1 ? 'hour' : 'hours'}, not a week of sales. Next Sunday's will measure from this count.`, '0 0 26px');
  const n = c.lista.length + c.mas;
  if (!n) html += P('Everything Toast sells came out close to what the app expected.');
  else {
    const plata = [c.corto > 0 ? `<strong style="color:#b91c1c">${dinero(c.corto)} short</strong>` : '',
      c.sobra > 0 ? `<strong style="color:#0369a1">${dinero(c.sobra)} over</strong>` : ''].filter(Boolean);
    html += P(`${n < NUMS.length ? NUMS[n] : n} ${n === 1 ? 'product' : 'products'} came out far from what the app expected` +
      (plata.length ? ': ' + plata.join(' and ') : '') + `. Here's what ${n === 1 ? 'it' : 'each'} could be.`);
    for (const x of c.lista) {
      const corto = x.dif < 0, w = porQue(x);
      const cuanto = x.causa === 'caja' ? `exactly ${x.caja} more` : `${cifra(Math.abs(x.dif))} ${Math.abs(x.dif) === 1 ? 'bottle' : 'bottles'} ${corto ? 'short' : 'more'}`;
      const linea = `Expected ≈${cifra(x.esperado)}, counted ${cifra(x.contado)} · <strong style="color:#0f172a;white-space:nowrap">${cuanto}${x.dinero ? ' (' + dineroSigno(x.dinero) + ')' : ''}</strong>` +
        (x.parte !== null && x.vendido > 0 && x.causa !== 'caja' ? ` · about ${x.parte}% of the ${cifra(x.vendido)} it sold` : '');
      const c1 = corto ? { bg: '#fee2e2', tx: '#b91c1c', t: 'Less than expected' } : { bg: '#e0f2fe', tx: '#0369a1', t: 'More than expected' };
      html += `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;border:1px solid #e2e8f0;border-radius:12px"><tr><td style="padding:12px 14px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:14px;font-weight:700;color:#0f172a">${esc(x.item)}</td>
        <td align="right" style="white-space:nowrap"><span style="display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;background:${c1.bg};color:${c1.tx}">${c1.t}</span></td></tr></table>
        <p style="margin:4px 0 8px;font-size:13px;line-height:1.5;color:#475569">${linea}</p>
        <p style="margin:0;font-size:13px;line-height:1.55;color:#0f172a"><strong>What it could be:</strong> ${w.que}</p>
        <p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:#64748b">${w.luego}</p></td></tr></table>`;
    }
    if (c.mas) html += `<p style="margin:0 0 10px;font-size:13px;color:#64748b">And ${c.mas} smaller ${c.mas === 1 ? 'one' : 'ones'}.</p>`;
  }
  if (c.sinConvertir.length) {
    html += `<p style="margin:4px 0 10px;font-size:13px;line-height:1.55;color:#475569">Toast also sold drinks with no recipe yet: ` +
      c.sinConvertir.map(x => esc(x.nombre) + ' (' + x.unidades + ')').join(', ') +
      ". The bottles in them weren't subtracted, so anything that goes into them can look short until they have one (Settings › Toast › Recipes).</p>";
  }
  if (c.provisional) html += `<p style="margin:0 0 10px;font-size:12px;color:#94a3b8">${dia}'s Toast sales may not have been complete when the count closed, so these can still move a little.</p>`;
  return html + '<div style="height:16px"></div>';
}

// ── El correo del lunes: la semana (Axel, 2026-11-17, sobre lámina) ──
//
// El lunes no se abre, así que el correo del lunes es la semana pasada
// (de lunes a domingo; el domingo, que es "ayer", en su propia caja), lo
// que suele dar esta semana día por día, y lo que no llega al domingo.
// Un solo correo: el del lunes sustituye al de cada día, no se suma.
// Lleva dentro "Live vs count" (conteoHtml, más arriba).
function armarSemana(d) {
  const s = d.semanal, t = s.total, hoy = d.hoy;
  const semilla = semillaDe(hoy);
  const ag = d.prevision === 'ok' ? ordenAgotan(d.agotan) : [];
  const fin = new Date(fecha(s.lunes).getTime() + 6 * 864e5);
  const ini = fecha(s.lunes);
  const corto = (f) => `${M3[f.getUTCMonth()]} ${f.getUTCDate()}`;
  const rangoSemana = `Mon ${corto(ini)} – Sun ${corto(fin)}`;
  const p = pct(t.dinero, t.normalDinero);
  const $ = b(dinero(t.dinero || 0));
  const comparada = p === null ? '' : Math.abs(p) < 5 ? ', right around a usual week'
    : `, ${Math.abs(p)}% ${p > 0 ? 'more' : 'less'} than a usual week`;
  const media = s.cargados < 7
    ? ` Toast has only ${s.cargados} of its 7 days loaded, so the totals are short.` : '';

  let html =
    `<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#64748b">${esc(etiquetaHoy(hoy))} · Weekly</p>` +
    `<p style="margin:0 0 4px;font-size:21px;font-weight:800;color:#0f172a;letter-spacing:-.01em">${una(['Good morning ☀️', 'Morning ☕', 'Good morning 👋', 'Rise and shine ☀️'], semilla, 0)}</p>` +
    P(`Last week did ${$} in drinks${comparada}.${media} Here's how it went${s.conteo && s.conteo.hay ? `, what ${s.conteo.fin ? DL[dow(s.conteo.fin)] : 'Sunday'}'s count found,` : ''} and what to plan for this week.`, '0 0 26px').replace('color:#1f2937', 'color:#475569');

  // Last week
  html += rotulo('Last week · ' + rangoSemana);
  const dm = s.domingo;
  if (dm) {
    const ayer = hoy && fecha(hoy).getTime() - fecha(dm.fecha).getTime() === 864e5;
    let frase;
    if (!dm.cargado) frase = "Sunday's sales from Toast haven't loaded yet.";
    else if (!(dm.dinero > 0) && !(dm.normalDinero > 0)) frase = 'Sunday was closed.';
    else {
      const pd = pct(dm.dinero, dm.normalDinero);
      frase = b('Sunday did ' + dinero(dm.dinero || 0)) +
        (pd === null ? '.' : Math.abs(pd) < 5 ? ', right around a usual Sunday.'
          : `, ${Math.abs(pd)}% ${pd > 0 ? 'more' : 'less'} than a usual Sunday.`) +
        (dm.top ? ` Top seller: ${esc(dm.top.nombre)} (${Math.round(dm.top.botellas)}).` : '');
    }
    html += `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px"><tr><td style="padding:12px 14px">
      <p style="margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#64748b">${ayer ? 'Yesterday · Sunday' : 'Sunday'}</p>
      <p style="margin:0;font-size:14px;line-height:1.55;color:#0f172a">${frase}</p></td></tr></table>`;
  }
  const tot = (t.licor || 0) + (t.vino || 0);
  const partes = [];
  if (s.mejor) partes.push(`${DL[dow(s.mejor.fecha)]} carried it with ${b(dinero(s.mejor.dinero))}`);
  if (tot > 0) {
    const l = Math.round((t.licor || 0) / tot * 100);
    partes.push(l >= 50 ? `liquor, cocktails included, was ${l}% of it` : `wine was ${100 - l}% of it`);
  }
  if (partes.length) html += P('The whole week: ' + partes.join(', and ') + '.');
  if (t.dinero > 0 || t.botellas > 0) {
    html += tarjetas([
      { k: 'Total', v: dinero(t.dinero || 0), p: pct(t.dinero, t.normalDinero) },
      { k: 'Liquor', v: dinero(t.licor || 0), p: pct(t.licor, t.normalLicor) },
      { k: 'Wine', v: dinero(t.vino || 0), p: pct(t.vino, t.normalVino) }]) +
      tarjetas([
      { k: 'Bottles', v: String(Math.round(t.botellas || 0)), p: pct(t.botellas, t.normalBotellas) },
      { k: 'Liquor', v: String(Math.round(t.botLicor || 0)), p: pct(t.botLicor, t.normalBotLicor) },
      { k: 'Wine', v: String(Math.round(t.botVino || 0)), p: pct(t.botVino, t.normalBotVino) }]);
    const nota = [pct(t.dinero, t.normalDinero), pct(t.botellas, t.normalBotellas)].some(x => x !== null)
      ? 'Arrows compare with a usual week (the median of the full weeks before it).' : '';
    if (nota) html += `<p style="margin:0 0 10px;font-size:12px;color:#64748b">${nota}</p>`;
  }
  if (s.top.length) {
    html += `<p style="margin:0 0 26px;font-size:13px;color:#64748b">Top sellers: ` +
      s.top.map((x, i) => esc(x.nombre) + ' (' + Math.round(x.botellas) + (i ? '' : ' btl') + ')').join(', ') + '.</p>';
  } else html += '<div style="height:16px"></div>';

  // Live vs count: lo que encontró el conteo del domingo
  if (s.conteo) html += conteoHtml(s.conteo);

  // This week
  const plan = s.plan.filter(x => x.dinero !== null);
  if (plan.length) {
    const sum = (k) => plan.reduce((a, x) => a + (x[k] || 0), 0);
    const redondo = (n) => Math.round(n / 100) * 100;
    const max = Math.max(1, ...plan.map(x => x.dinero || 0));
    html += rotulo('This week · what to plan for') +
      P(`A usual week like this one does about ${b(dinero(redondo(sum('dinero'))))} and ${b(Math.round(sum('botellas')) + ' bottles')}.`) +
      `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;margin:0 0 6px"><tr>` +
      s.plan.map(x => {
        const cerrado = x.dinero === 0;
        const alto = x.dinero > 0 ? Math.max(4, Math.round(x.dinero / max * 96)) : 2;
        return `<td valign="bottom" align="center" style="padding:0 3px">
        <div style="height:${alto}px;background:${x.dinero > 0 ? '#38bdf8' : '#e2e8f0'};border-radius:4px 4px 0 0;font-size:0;line-height:0">&nbsp;</div>
        <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#0f172a">${D3[dow(x.fecha)]}</p>
        <p style="margin:0;font-size:11px;color:#64748b">${x.dinero === null ? '—' : cerrado ? 'closed' : dinero(x.dinero)}</p></td>`;
      }).join('') + `</tr></table>` +
      `<p style="margin:0 0 26px;font-size:12px;color:#94a3b8">Based on the median of the last 13 weeks in Toast for each day.</p>`;
  }

  html += agotanHtml(d, ag);
  html += `<p style="margin:4px 0 18px;font-size:15px;color:#1f2937">Have a great week.</p>` + boton;

  const asuntoAg = d.prevision !== 'ok' ? '' : ag.length ? ` · ${ag.length} won't make it to Sunday` : ' · nothing runs out';
  const rangoAsunto = ini.getUTCMonth() === fin.getUTCMonth() ? `${corto(ini)}–${fin.getUTCDate()}` : `${corto(ini)}–${corto(fin)}`;
  return { asunto: (d.local || 'BarStock') + ' · Weekly · ' + rangoAsunto + (t.dinero > 0 ? ' ' + dinero(t.dinero) : '') + asuntoAg,
    html: shell({ right: d.local, footer: 'Weekly report', body: html }) };
}

// ── El correo ─────────────────────────────────────────────────────────
function armar(datos) {
  const d = limpiar(datos);
  if (d.semanal) return armarSemana(d);
  const hoy = d.hoy;
  const domingo = hoy && dow(hoy) === 0;
  // El conteo es el domingo al cerrar: la meta es el domingo entero, o
  // "hoy" si ya es domingo.
  const meta = domingo ? 'through today' : 'through Sunday';
  const llegar = domingo ? 'make it through today' : 'make it to Sunday';
  const rango = domingo ? 'Sun' : D3[dow(hoy)] + '–Sun';
  const ag = d.agotan.slice().sort((x, y) => (x.agota < y.agota ? -1 : x.agota > y.agota ? 1 : y.pedir - x.pedir));
  const a = d.ayer;
  const semilla = semillaDe(hoy);
  const fue = a.fecha ? comoFue(a, semilla) : { corta: null, larga: '' };

  const sabe = d.prevision === 'ok';
  const cuantos = !sabe ? null : ag.length
    ? `${ag.length} ${ag.length === 1 ? "thing won't" : "things won't"} ${llegar}`
    : (domingo ? 'nothing runs out today' : 'nothing runs out before Sunday');
  const hoyF = fecha(hoy);
  // La fecha de HOY va sola, arriba, como etiqueta: pegada a la frase de
  // ayer ("Sunday, Nov 15. Saturday was a good night…") se leía como una
  // sola cosa y confundía qué día era cuál (Axel, 2026-11-15).
  const fechaHoy = `${DL[hoyF.getUTCDay()]} · ${M3[hoyF.getUTCMonth()]} ${hoyF.getUTCDate()}`;
  const cabeza = !cuantos ? (fue.corta ? fue.corta + '.' : '')
    : fue.corta ? `${fue.corta}, and ${cuantos}.` : cuantos.charAt(0).toUpperCase() + cuantos.slice(1) + '.';
  const saludo = una(['Good morning ☀️', 'Morning ☕', 'Good morning 👋', 'Rise and shine ☀️'], semilla, 0);

  let html =
    `<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#64748b">${esc(fechaHoy)}</p>` +
    `<p style="margin:0 0 4px;font-size:21px;font-weight:800;color:#0f172a;letter-spacing:-.01em">${saludo}</p>` +
    (cabeza ? P(cabeza, '0 0 26px').replace('color:#1f2937', 'color:#475569') : '<div style="height:22px"></div>');

  // Yesterday
  if (a.fecha) {
    const af = fecha(a.fecha);
    html += rotulo(`Yesterday · ${D3[af.getUTCDay()]}, ${M3[af.getUTCMonth()]} ${af.getUTCDate()}`);
    const hayCifras = a.cargado && (a.dinero > 0 || a.normalDinero > 0);
    html += P(fue.larga + (hayCifras ? quienLlevo(a, semilla) : ''), hayCifras ? '0 0 14px' : '0 0 26px');
    if (hayCifras) {
      html += tarjetas([
        { k: 'Total', v: dinero(a.dinero || 0), p: pct(a.dinero, a.normalDinero) },
        { k: 'Liquor', v: dinero(a.licor || 0), p: pct(a.licor, a.normalLicor) },
        { k: 'Wine', v: dinero(a.vino || 0), p: pct(a.vino, a.normalVino) }]) +
        tarjetas([
        { k: 'Bottles', v: uno(a.botellas || 0), p: pct(a.botellas, a.normalBotellas) },
        { k: 'Liquor', v: uno(a.botLicor || 0), p: pct(a.botLicor, a.normalBotLicor) },
        { k: 'Wine', v: uno(a.botVino || 0), p: pct(a.botVino, a.normalBotVino) }]);
      const algunaFlecha = [pct(a.dinero, a.normalDinero), pct(a.botellas, a.normalBotellas)].some(x => x !== null);
      html += algunaFlecha
        ? `<p style="margin:0 0 26px;font-size:12px;color:#64748b">Arrows compare with a usual ${DL[af.getUTCDay()]}.</p>`
        : '<div style="height:14px"></div>';
    }
  }

  html += agotanHtml(d, ag);

  html += `<p style="margin:4px 0 18px;font-size:15px;color:#1f2937">${una(['Have a good shift.', 'Have a great service.', 'Good luck tonight.'], semilla, 4)}</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
  <a href="https://app.barstockpro.com" style="display:inline-block;background:#0b1220;color:#ffffff;font-size:14px;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none">Open BarStock</a></td></tr></table>`;

  const asuntoAyer = a.cargado && a.fecha && a.dinero > 0 ? ` · ${D3[dow(a.fecha)]} ${dinero(a.dinero)}` : '';
  const asuntoAg = !sabe ? '' : ag.length ? ` · ${ag.length} won't ${llegar}` : ' · nothing runs out';
  return { asunto: (d.local || 'BarStock') + asuntoAyer + asuntoAg,
    html: shell({ right: d.local, footer: 'Morning report', body: html }) };
}

// ── Por api/integrations.js ───────────────────────────────────────────
// preview: devuelve el correo para verlo en la app; send: lo manda, a
// mano. Con para 'replyto' (el botón "Send a test"), al reply-to de la
// locación con "[Test]" en el asunto: es donde llega el automático, y
// ahí lo buscaba Axel (2026-11-15) cuando la prueba se iba al correo con
// el que inicia sesión. Con 'lista', a la lista. Sin nada, al de la
// sesión, como antes.
async function handler(req, res) {
  const body = req.body || {};
  const action = String(body.action || '');
  const params = body.params || {};
  if (action !== 'preview' && action !== 'send') {
    return res.status(400).json({ ok: false, error: 'Unknown action. Use: preview, send' });
  }
  if (!params.datos || typeof params.datos !== 'object') {
    return res.status(400).json({ ok: false, error: 'Missing params.datos: the numbers the report is written from.' });
  }
  const { asunto, html } = armar(params.datos);
  if (action === 'preview') return res.status(200).json({ ok: true, asunto, html });

  const local = limpiar(params.datos).local || 'BarStock';
  // ¿A quién? Al reply-to (la prueba), a la lista de la locación
  // (Settings › Emails, migración 035, que se LEE aquí de la base), o a
  // las direcciones escritas en la pantalla ("Send to…", Axel,
  // 2026-11-17, lámina B). Éstas son lo único que llega de la petición:
  // sólo con el permiso de ajustes de la locación, todas válidas y como
  // mucho MAX_OTROS, para que esta función no sirva para mandar correos a
  // cualquiera. Un usuario de correo sin rol lo puede todo, como siempre.
  let para;
  const aLista = params.para === 'lista', aOtros = params.para === 'otros';
  if (aOtros) {
    if (Permisos.deUsuario(req.usuario).indexOf('ajustes_locacion') < 0) {
      return res.status(403).json({ ok: false, error: 'Your role can’t send the morning email to other addresses.' });
    }
    const crudo = (Array.isArray(params.to) ? params.to : []).map(x => String(x || '').trim()).filter(Boolean);
    const malos = crudo.filter(x => !CORREO.test(x));
    if (malos.length) return res.status(400).json({ ok: false, error: 'Not an email address: ' + malos.slice(0, 3).join(', ') });
    para = sinRepetir(crudo);
    if (!para.length) return res.status(400).json({ ok: false, error: 'Add at least one email address.' });
    if (para.length > MAX_OTROS) return res.status(400).json({ ok: false, error: 'At most ' + MAX_OTROS + ' addresses at a time.' });
  } else if (aLista) {
    const l = await leerLista(String(params.cuenta || 'wjm-hospitality'), local);
    if (l.error) return res.status(l.code).json({ ok: false, error: l.error });
    para = l.para;
  } else if (params.para === 'replyto') {
    const a = await ajustesDe(String(params.cuenta || 'wjm-hospitality'), local, 'reply_to_email');
    if (a.error) return res.status(a.code).json({ ok: false, error: a.error });
    const rt = String(a.valor || '').trim();
    if (!CORREO.test(rt)) return res.status(400).json({ ok: false, error: 'No reply-to email saved for ' + local + '. Add it in Settings › Emails.' });
    para = [rt];
  } else {
    const yo = req.usuario && req.usuario.email;
    if (!yo) return res.status(400).json({ ok: false, error: 'This session has no email to send the report to.' });
    para = [yo];
  }
  if (!String(process.env.RESEND_API_KEY || '').trim()) {
    return res.status(500).json({ ok: false, error: 'RESEND_API_KEY is not set in this deployment.' });
  }
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const r = await resend.emails.send({
    from: `${local} <reports@barstockpro.com>`,
    to: para,
    // Al reply-to o a ti es una prueba; a la lista o a quien escribiste,
    // el correo de verdad.
    subject: (aLista || aOtros ? '' : '[Test] ') + asunto,
    html
  });
  if (r && r.error) return res.status(502).json({ ok: false, error: 'Resend: ' + (r.error.message || 'it did not send') });
  return res.status(200).json({ ok: true, to: para.join(', '), id: r && r.data && r.data.id });
}

// La lista de la locación, de location_settings.morning_recipients. Sólo
// lee. Direcciones separadas por comas o punto y coma, sin repetir (sin
// mirar mayúsculas), sólo las que parecen un correo, y como mucho 20.
const CORREO = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
// Una columna de location_settings de la locación (por cuenta y nombre).
// Sólo lee. La usan la lista y el reply-to.
async function ajustesDe(cuenta, local, col) {
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const loc = await sb.from('locations').select('id').eq('account_id', cuenta).eq('name', local).limit(1);
  if (loc.error) return { code: 500, error: 'Could not read the location: ' + (loc.error.message || loc.error.code) };
  const id = loc.data && loc.data[0] && loc.data[0].id;
  if (!id) return { code: 400, error: 'There is no location called "' + local + '" in this account.' };
  const st = await sb.from('location_settings').select(col).eq('location_id', id).limit(1);
  if (st.error) {
    // Sólo si dice que falta ESA columna se nombra la migración.
    const m = String(st.error.message || '');
    if (col === 'morning_recipients' && (st.error.code === '42703' || st.error.code === 'PGRST204') && /morning_recipients/.test(m)) {
      return { code: 500, error: 'The morning_recipients column is not in the database yet: run migration 035. (' + m + ')' };
    }
    return { code: 500, error: 'Could not read the location settings: ' + (m || st.error.code) };
  }
  return { valor: st.data && st.data[0] && st.data[0][col] };
}

const MAX_OTROS = 10;
// Sin repetir, sin mirar mayúsculas: el primero que aparece se queda.
function sinRepetir(xs) {
  const vistos = new Set(), out = [];
  for (const x of xs) { const k = x.toLowerCase(); if (vistos.has(k)) continue; vistos.add(k); out.push(x); }
  return out;
}
// La lista guardada (texto con comas o punto y coma) → los que parecen
// un correo, sin repetir y como mucho 20. La usa también el automático
// (morning-cron.js): una sola regla para leerla.
function partirLista(crudo) {
  return sinRepetir(String(crudo || '').split(/[,;]/).map(t => t.trim()).filter(x => x && CORREO.test(x))).slice(0, 20);
}

async function leerLista(cuenta, local) {
  const a = await ajustesDe(cuenta, local, 'morning_recipients');
  if (a.error) return a;
  const crudo = String(a.valor || '');
  const para = partirLista(crudo);
  if (!para.length) {
    return { code: 400, error: crudo.trim()
      ? 'None of the saved morning email recipients looks like an email address. Check them in Settings › Emails.'
      : 'No morning email recipients saved for this location. Add them in Settings › Emails.' };
  }
  return { para };
}

module.exports = handler;
module.exports.armar = armar;
module.exports.limpiar = limpiar;
module.exports.partirLista = partirLista;
module.exports.sinRepetir = sinRepetir;
module.exports.MAX_OTROS = MAX_OTROS;
