#!/usr/bin/env node
/*
 * ── La nota para el proveedor ───────────────────────────────────────
 *
 * Al mandar una orden se puede escribir una nota ("deliver before
 * Thursday", "back door"). Va en el correo, arriba, en ámbar, firmada.
 * NO va en el PDF ni se guarda en la orden (History): Axel lo pidió así.
 * Se llama `vendorNote` y no `note` porque `note` ya existe: es la
 * etiqueta interna de una orden rápida, que sí se guarda.
 *
 * Lo que se protege aquí:
 *   1. El correo la enseña arriba, antes del saludo, y sin nota queda
 *      exactamente como antes.
 *   2. Lo que se escribe no se cuela como HTML en el correo.
 *   3. No toca el PDF.
 *   4. El escritorio la manda, y al abrir la ventana otra vez empieza
 *      vacía y cerrada: la nota de una orden no se hereda en la siguiente.
 *
 * La pantalla del teléfono se prueba en test-orders-screen.js.
 *
 *   node tools/test-nota-proveedor.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

// Resend de mentira: se queda con lo que se le pidió mandar.
let enviados = [];
const rutaResend = require.resolve('resend', { paths: [RAIZ] });
require.cache[rutaResend] = {
  id: rutaResend, filename: rutaResend, loaded: true,
  exports: { Resend: class { constructor() { this.emails = { send: async (p) => { enviados.push(p); return { data: { id: 'm1' } }; } }; } } }
};
const handler = require(path.join(RAIZ, 'api/send-order.js'));

async function mandar(extra) {
  enviados = [];
  const res = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ method: 'POST', body: Object.assign({
    to: 'orders@southern.com', vendor: 'SOUTHERN', items: [{ item: "Tito's", finalOrder: 2 }],
    totalUnits: 2, locationName: 'The Crown Tavern', senderName: 'Axel Torres',
    pdfBase64: 'JVBERi0xLjQK', filename: 'southern_order.pdf'
  }, extra || {}) }, res);
  return { res, p: enviados[0] };
}

(async () => {

grupo('1 · el correo');
{
  const { p } = await mandar({ vendorNote: 'Please deliver before Thursday.\nUse the back door.' });
  const h = (p && p.html) || '';
  prueba('sale el correo', !!p);
  prueba('con la nota', h.includes('Please deliver before Thursday.'));
  prueba('firmada por quien la manda', /Note from Axel Torres/i.test(h), (h.match(/Note from[^<]*/i) || [''])[0]);
  prueba('arriba: antes del saludo', h.indexOf('Please deliver') > 0 && h.indexOf('Please deliver') < h.indexOf('Hello,'));
  prueba('y despues del titular', h.indexOf('New order for SOUTHERN') < h.indexOf('Please deliver'));
  prueba('los saltos de linea se respetan', /Thursday\.<br\s*\/?>\s*Use the back door/.test(h));
  prueba('en ambar, como la opcion A', /#fffbeb/i.test(h) && /#fcd34d/i.test(h));
}
{
  const { p } = await mandar({});
  const h = (p && p.html) || '';
  prueba('sin nota, no hay bloque', !/Note from/i.test(h) && !/#fffbeb/i.test(h));
  const { p: p2 } = await mandar({ vendorNote: '   \n  ' });
  prueba('una nota de puros espacios cuenta como ninguna', !/Note from/i.test(p2.html));
}
{
  const { p } = await mandar({ senderName: '', vendorNote: 'Back door.' });
  prueba('sin nombre de quien manda, firma la locacion', /Note from The Crown Tavern/i.test(p.html));
}

grupo('2 · lo escrito no se cuela como HTML');
{
  const { p } = await mandar({ vendorNote: '<img src=x onerror=alert(1)> & <b>now</b>' });
  prueba('las etiquetas salen como texto', !p.html.includes('<img src=x') && p.html.includes('&lt;img src=x'));
  prueba('y el & tambien', p.html.includes('&amp; &lt;b&gt;now'));
}
{
  const { p } = await mandar({ vendorNote: 'x'.repeat(5000) });
  prueba('una nota enorme se corta (1000)', !p.html.includes('x'.repeat(1001)) && p.html.includes('x'.repeat(1000)));
  const { p: p2 } = await mandar({ vendorNote: { raro: true } });
  prueba('algo que no es texto se ignora', p2 && !/Note from/i.test(p2.html));
}

grupo('3 · no toca el PDF ni el asunto');
{
  const { p } = await mandar({ vendorNote: 'Back door.' });
  prueba('el PDF viaja igual', p.attachments && p.attachments.length === 1 && p.attachments[0].content === 'JVBERi0xLjQK');
  prueba('el asunto no cambia', !/back door/i.test(p.subject), p.subject);
}

grupo('4 · el escritorio');
{
  // La ventana de verdad, sacada de index.html.
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const i = html.indexOf('<div id="emailOrderModalBg"');
  let j = i, prof = 0;
  const re = /<\/?div\b[^>]*>/g; re.lastIndex = i;
  let m;
  while ((m = re.exec(html))) { prof += m[0][1] === '/' ? -1 : 1; if (!prof) { j = re.lastIndex; break; } }
  const w = new JSDOM('<!doctype html><body>' + html.slice(i, j) + '</body>',
    { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error: (e) => { w.__err = e; } };
  w.alert = (t) => { w.__alerta = t; };
  w.state = { orderHistory: [{ id: 'h1', vendor: 'SOUTHERN', items: [{ item: "Tito's", finalOrder: 2 }], totalUnits: 2, createdAt: Date.now() }] };
  w.generateVendorJpgCanvas = async () => ({ toDataURL: () => 'data:image/jpeg;base64,AAA' });
  const nada = () => {};
  const pdf = new Proxy({}, { get: (o, k) => k === 'internal' ? { pageSize: { getWidth: () => 612, getHeight: () => 792 } }
    : k === 'getTextWidth' ? () => 0 : k === 'splitTextToSize' ? (t) => [t] : k === 'getNumberOfPages' ? () => 1
    : k === 'output' ? () => 'data:application/pdf;base64,UERG' : nada });
  w.jspdf = { jsPDF: function () { return pdf; } };
  w.BarStockBrandLogo = { enPdf() {} };
  w.__payloads = [];
  w.fetch = async (u, op) => { w.__payloads.push(JSON.parse(op.body)); return { json: async () => ({ ok: true }) }; };
  w.eval(fs.readFileSync(path.join(RAIZ, 'src/email-order.js'), 'utf8'));
  const $ = (id) => w.document.getElementById(id);

  await w.openEmailOrderModal('h1');
  prueba('hay un boton para anadir la nota', !!$('emailOrderNoteAdd'));
  prueba('y el campo nace cerrado', $('emailOrderNoteBox') && $('emailOrderNoteBox').hidden === true);
  $('emailOrderNoteAdd').click();
  prueba('al pulsarlo se abre', $('emailOrderNoteBox').hidden === false);
  prueba('y el boton se va', $('emailOrderNoteAdd').hidden === true);
  $('emailOrderTo').value = 'orders@southern.com';
  $('emailOrderNote').value = 'Deliver before Thursday.';
  await w.sendEmailOrder();
  const pl = w.__payloads[0] || {};
  prueba('el envio sale', !!w.__payloads[0], w.__alerta);
  prueba('la nota va en el envio', pl.vendorNote === 'Deliver before Thursday.', JSON.stringify(pl.vendorNote));
  prueba('como vendorNote, no como note', w.__payloads[0] && !('note' in pl));

  await w.openEmailOrderModal('h1');
  prueba('al abrir otra orden la nota empieza vacia', $('emailOrderNote').value === '');
  prueba('y cerrada', $('emailOrderNoteBox').hidden === true && $('emailOrderNoteAdd').hidden === false);
  $('emailOrderTo').value = 'orders@southern.com';
  await w.sendEmailOrder();
  prueba('sin nota no se manda nada', !!w.__payloads[1] && !('vendorNote' in w.__payloads[1]), JSON.stringify(w.__payloads[1] && w.__payloads[1].vendorNote));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
