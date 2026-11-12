#!/usr/bin/env node
/*
 * ── El correo de la mañana (lib/morning-report.js) ───────────────────
 *
 * Axel, 2026-11-12, sobre lámina: el molde del correo de órdenes, con
 * una o dos frases en palabras encima de cada bloque. Lo que se protege:
 *
 *   1. Ayer en dinero y en botellas, cada uno contra lo de siempre de ese
 *      día de la semana, y una frase que lo dice ("a good night", "a slow
 *      night", "a normal night"). Sin la lista de lo más vendido.
 *   2. Lo que no llega al domingo, en UNA sección, ordenado por el día en
 *      que se acaba, con su "Order N" hasta el domingo. Un día sin nada,
 *      la sección no sale y el saludo lo dice.
 *   3. Sin "What stood out" y sin la etiqueta "from LOOP".
 *   4. Si ayer no se cargó, se dice, no se pinta un cero.
 *   5. El domingo, la meta es "through today".
 *   6. Todo lo que viene de fuera va escapado.
 *   7. Se manda SÓLO al correo de quien tiene la sesión: aunque la
 *      petición traiga otro destinatario, no se usa. Y sin RESEND_API_KEY
 *      se dice eso, no "no se pudo".
 *
 *   node tools/test-correo-manana.js
 */
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const texto = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ');

// Supabase de mentira: sólo valida la sesión, con su correo.
const rutaSb = require.resolve('@supabase/supabase-js', { paths: [RAIZ] });
require.cache[rutaSb] = { id: rutaSb, filename: rutaSb, loaded: true, exports: {
  createClient: () => ({ auth: { getUser: async (t) => (t === 'sesion-buena'
    ? { data: { user: { id: 'u1', email: 'axel@crown.test' } }, error: null }
    : { data: {}, error: { message: 'bad' } }) } })
} };
// Resend de mentira: apunta lo que se le manda.
const enviados = [];
const rutaRs = require.resolve('resend', { paths: [RAIZ] });
require.cache[rutaRs] = { id: rutaRs, filename: rutaRs, loaded: true, exports: {
  Resend: class { constructor(k) { this.k = k; this.emails = { send: async (p) => { enviados.push(p); return { data: { id: 'm1' } }; } }; } }
} };

const M = require(path.join(RAIZ, 'lib/morning-report.js'));
const handler = require(path.join(RAIZ, 'api/integrations.js'));

const AYER = { fecha: '2026-11-11', dia: 'Wed', cargado: true,
  dinero: 3717, licor: 2144, vino: 1573, normalDinero: 3177, normalLicor: 1757, normalVino: 1417,
  botellas: 40.5, botLicor: 22.1, botVino: 18.4, normalBotellas: 24.7, normalBotLicor: 12.9, normalBotVino: 11.8 };
const AGOTAN = [
  { producto: 'Casamigos Blanco', queda: 1.9, agota: '2026-11-13', vende: 3.3, llega: 0, pedir: 2 },
  { producto: "Tito's Handmade Vodka", queda: 0.6, agota: '2026-11-12', vende: 8.3, llega: 0, pedir: 8 },
  { producto: 'Aperol Aperitivo', queda: 0.4, agota: '2026-11-12', vende: 3.8, llega: 0, pedir: 4 }
];
const BASE = { local: 'The Crown Tavern', hoy: '2026-11-12', ayer: AYER, agotan: AGOTAN };

async function llamar(o) {
  const res = { code: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ query: { provider: 'report' }, method: 'POST',
    headers: { authorization: o.token === undefined ? 'Bearer sesion-buena' : o.token },
    body: { action: o.accion, params: o.params || {} } }, res);
  return res;
}

(async () => {

grupo('un día movido');
{
  const { asunto, html } = M.armar(BASE);
  const t = texto(html);
  prueba('el asunto dice el día, el dinero y cuántos no llegan',
    asunto === "The Crown Tavern · Wed $3,717 · 3 won't make it to Sunday", asunto);
  prueba('el saludo cuenta el día', /Thursday, Nov 12\. Wednesday was a good night, and 3 things won't make it to Sunday\./.test(t), t.slice(0, 300));
  prueba('ayer, con palabras', /You did \$3,717 in drinks, 17% more than a usual Wednesday\./.test(t), t.slice(0, 500));
  prueba('quién lo llevó', /Liquor, cocktails included, carried most of it\./.test(t));
  prueba('las seis cifras', ['$3,717', '$2,144', '$1,573', '40.5', '22.1', '18.4'].every(x => t.includes(x)));
  prueba('con su comparación en cada una', /↗ 17%/.test(t) && /↗ 22%/.test(t) && /↗ 11%/.test(t) && /↗ 64%/.test(t) && /↗ 71%/.test(t) && /↗ 56%/.test(t), t.slice(0, 900));
  prueba('dicho una vez debajo', (t.match(/Arrows compare with a usual Wednesday/g) || []).length === 1);
  prueba('las seis tarjetas del mismo tamaño (celdas de ancho fijo)', (html.match(/table-layout:fixed/g) || []).length === 2);

  prueba('una sola sección para lo que no llega', /Won't make it to Sunday/.test(t) && !/Needs attention today|Later this week/.test(t));
  prueba('su frase, en orden', /Tito's Handmade Vodka and Aperol Aperitivo run out today\. Casamigos Blanco goes on Friday\./.test(t), t);
  const i1 = t.indexOf("Tito's Handmade Vodka Out today"), i2 = t.indexOf('Aperol Aperitivo Out today'), i3 = t.indexOf('Casamigos Blanco Out Fri');
  prueba('las filas por el día en que se acaban, y a igual día el que más pide', i1 > 0 && i1 < i2 && i2 < i3, [i1, i2, i3].join(','));
  prueba('cada una con lo que queda y lo que se suele vender', /0\.6 left · Thu–Sun usually sells 8\.3/.test(t));
  prueba('y cuánto pedir hasta el domingo', /Order 8 through Sunday/.test(t) && /Order 4 through Sunday/.test(t) && /Order 2 through Sunday/.test(t));
  prueba('con la cuenta explicada', /what each day from today to Sunday usually sells/.test(t));
  prueba('sin lo más vendido', !/Most sold|led again/.test(t));
  prueba('sin "What stood out"', !/stood out/i.test(t));
  prueba('sin la etiqueta "from LOOP"', !/from LOOP/.test(t));
  prueba('el molde del correo de órdenes', /Sent via BarStock Pro/.test(t) && /Open BarStock/.test(t) && /Have a good shift/.test(t));
}

grupo('un día tranquilo');
{
  const { asunto, html } = M.armar(Object.assign({}, BASE, { agotan: [],
    ayer: Object.assign({}, AYER, { dinero: 3000, licor: 1700, vino: 1300 }) }));
  const t = texto(html);
  prueba('el saludo lo dice', /Wednesday was a normal night, and nothing runs out before Sunday\./.test(t), t.slice(0, 300));
  prueba('sin la sección', !/Won't make it/.test(t) && !/Order \d/.test(t));
  prueba('el asunto también', /· nothing runs out$/.test(asunto), asunto);
  prueba('cerca de lo normal, se dice así', /right around a usual Wednesday/.test(t), t.slice(0, 500));
}
{
  const t = texto(M.armar(Object.assign({}, BASE, { ayer: Object.assign({}, AYER, { dinero: 2400, licor: 1300, vino: 1100 }) })).html);
  prueba('por debajo: a slow night', /Wednesday was a slow night/.test(t) && /24% less than a usual Wednesday/.test(t), t.slice(0, 500));
}

grupo('lo que no se sabe no se pinta');
{
  const t = texto(M.armar(Object.assign({}, BASE, { ayer: { fecha: '2026-11-11', dia: 'Wed', cargado: false } })).html);
  prueba('ayer sin cargar: se dice', /Wednesday's sales from Toast haven't loaded yet/.test(t), t.slice(0, 400));
  prueba('y no salen cifras de cero', !/\$0\b/.test(t) && !/table-layout:fixed/.test(t));
}
{
  const t = texto(M.armar(Object.assign({}, BASE, { ayer: Object.assign({}, AYER, { fecha: '2026-11-09', dia: 'Mon', dinero: 0, licor: 0, vino: 0,
    botellas: 0, botLicor: 0, botVino: 0, normalDinero: 0, normalLicor: 0, normalVino: 0, normalBotellas: 0, normalBotLicor: 0, normalBotVino: 0 }), hoy: '2026-11-10' })).html);
  prueba('el lunes cerrado: "Monday was closed", sin tarjetas', /Monday was closed/.test(t) && !/You did/.test(t), t.slice(0, 300));
}
{
  const t = texto(M.armar(Object.assign({}, BASE, { ayer: Object.assign({}, AYER, { normalDinero: null, normalLicor: null, normalVino: null,
    normalBotellas: null, normalBotLicor: null, normalBotVino: null }) })).html);
  prueba('sin historia suficiente: sin flechas ni comparación', !/↗|↘/.test(t) && !/Arrows compare/.test(t) && /You did \$3,717 in drinks\./.test(t), t.slice(0, 600));
}

grupo('sin previsión, no se dice "nothing runs out"');
{
  // Con un conteo a medias no hay LIVE, y con poca historia de Toast no
  // hay "lo de siempre": no se sabe qué se acaba. Decir "nothing runs
  // out" sería una afordancia que miente.
  for (const [prev, frase] of [['counting', /A count is in progress/], ['history', /not enough Toast history/], ['error', /Could not work out what runs out/]]) {
    const { asunto, html } = M.armar(Object.assign({}, BASE, { agotan: [], prevision: prev }));
    const t = texto(html);
    prueba(prev + ': lo dice', frase.test(t) && !/nothing runs out/.test(t) && !/nothing runs out/.test(asunto), t.slice(0, 400) + ' | ' + asunto);
  }
  const t = texto(M.armar(Object.assign({}, BASE, { prevision: 'ok' })).html);
  prueba('con previsión, la sección de siempre', /Won't make it to Sunday/.test(t));
}

grupo('el domingo');
{
  const { asunto, html } = M.armar(Object.assign({}, BASE, { hoy: '2026-11-15',
    ayer: Object.assign({}, AYER, { fecha: '2026-11-14', dia: 'Sat' }),
    agotan: [{ producto: "Tito's Handmade Vodka", queda: 0.5, agota: '2026-11-15', vende: 1.2, llega: 0, pedir: 1 }] }));
  const t = texto(html);
  prueba('la meta es hoy', /won't make it through today/.test(t) && /Order 1 through today/.test(t) && /Sun usually sells 1\.2/.test(t), t);
  prueba('y en el asunto', /1 won't make it through today/.test(asunto), asunto);
}

grupo('lo de fuera, escapado');
{
  const { html } = M.armar(Object.assign({}, BASE, { local: 'Crown <b>', agotan: [{ producto: '<img src=x onerror=alert(1)>', queda: 1, agota: '2026-11-12', vende: 3, llega: 0, pedir: 2 }] }));
  prueba('un nombre con etiquetas no entra como etiquetas', !/<img src=x/.test(html) && /&lt;img src=x/.test(html));
  prueba('la locación tampoco', !/Crown <b>/.test(html));
}

grupo('por la función de integraciones');
{
  let r = await llamar({ accion: 'preview', params: { datos: BASE } });
  prueba('preview: devuelve el correo sin mandarlo', r.body && r.body.ok && /Won't make it to Sunday/.test(texto(r.body.html)) && enviados.length === 0, JSON.stringify(r.body).slice(0, 200));
  prueba('sin sesión, nada', (await llamar({ accion: 'preview', token: '', params: { datos: BASE } })).code === 401);

  delete process.env.RESEND_API_KEY;
  r = await llamar({ accion: 'send', params: { datos: BASE } });
  prueba('sin RESEND_API_KEY lo dice, y no manda', r.code === 500 && /RESEND_API_KEY/.test(r.body.error) && enviados.length === 0, JSON.stringify(r.body));

  process.env.RESEND_API_KEY = 'k-test';
  r = await llamar({ accion: 'send', params: { datos: BASE, to: 'otro@fuera.test' } });
  const e = enviados[0] || {};
  prueba('send: lo manda', r.body && r.body.ok && enviados.length === 1, JSON.stringify(r.body));
  prueba('SÓLO al correo de la sesión, aunque pidan otro', JSON.stringify(e.to) === JSON.stringify(['axel@crown.test']), JSON.stringify(e.to));
  prueba('dice a quién se mandó', r.body.to === 'axel@crown.test');
  prueba('marcado como prueba en el asunto', /^\[Test\] The Crown Tavern · /.test(e.subject), e.subject);
  prueba('desde reports@barstockpro.com', /<reports@barstockpro\.com>$/.test(e.from), e.from);
  r = await llamar({ accion: 'nada', params: {} });
  prueba('una acción que no existe, 400', r.code === 400, String(r.code));
  r = await llamar({ accion: 'preview', params: {} });
  prueba('sin datos, 400 diciendo qué falta', r.code === 400 && /datos/.test(r.body.error), JSON.stringify(r.body));
}

grupo('en la app: los números salen de los mismos módulos');
{
  const { JSDOM } = require('jsdom');
  const fs = require('fs');
  const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
  async function app(ro) {
    const w = new JSDOM('<!doctype html><body class="m-shell"></body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
    w.BARSTOCK_CONFIG = { LOCATION_NAME: 'The Crown Tavern' };
    w.state = { master: [{ item: "Tito's", suggested: 4 }, { item: 'Sin par', suggested: 0 }, { item: 'Sobra', suggested: 4 }] };
    w.BarStockToastSales = { ahora: async () => ({ hoy: '2026-11-12', semana: [{ fecha: '2026-11-10' }, Object.assign({}, AYER)] }) };
    w.eval(leer('src/run-out.js'));
    const MED = [1.2, 0, 0.5, 0.8, 1.4, 2.6, 3.1];
    w.BarStockRunOut.ahora = typeof ro === 'function' ? ro : async () => (ro || { estado: 'listo', hoy: '2026-11-12', suficiente: true, filas: [
      { producto: "Tito's", live: 0.6, med: MED, viene: [], agota: '2026-11-12' },
      { producto: 'Sin par', live: 0.1, med: MED, viene: [], agota: '2026-11-12' },
      { producto: 'Sobra', live: 20, med: MED, viene: [], agota: null },
      { producto: 'Beer', live: 1, med: null, viene: [], agota: null }] });
    w.__llamadas = [];
    w.BarStockDevPanel = { esc: (x) => String(x), llamar: async (p, a, prm) => { w.__llamadas.push({ p, a, prm });
      return a === 'preview' ? { ok: true, asunto: 'S', html: '<p>vista</p>' } : { ok: true, to: 'axel@crown.test' }; } };
    w.BarStockToast = { show: (t) => { w.__toast = t; } };
    w.eval(leer('src/morning-report.js'));
    return w;
  }
  let w = await app();
  const d = await w.BarStockMorningReport.datos();
  prueba('ayer, tal cual lo da toast-sales', d.ayer && d.ayer.dinero === 3717 && d.ayer.botLicor === 22.1 && d.ayer.fecha === '2026-11-11', JSON.stringify(d.ayer));
  prueba('la locación y hoy', d.local === 'The Crown Tavern' && d.hoy === '2026-11-12' && d.prevision === 'ok');
  prueba('sólo lo que tiene par y no llega al domingo', d.agotan.length === 1 && d.agotan[0].producto === "Tito's", JSON.stringify(d.agotan));
  const t0 = d.agotan[0] || {};
  prueba('con cuánto pedir, de cuantoPedir', t0.pedir === 8 && Math.abs(t0.vende - 8.3) < 1e-9 && t0.queda === 0.6 && t0.agota === '2026-11-12', JSON.stringify(t0));

  for (const [ro, prev] of [[{ estado: 'contando' }, 'counting'], [{ estado: 'listo', hoy: '2026-11-12', suficiente: false, filas: [] }, 'history'],
    [async () => { throw new Error('cloud down'); }, 'error'], [{ estado: 'sinConteo' }, 'error']]) {
    w = await app(ro);
    const x = await w.BarStockMorningReport.datos();
    prueba('sin previsión (' + prev + '): se dice, no se manda una lista vacía', x.prevision === prev && x.agotan.length === 0, JSON.stringify(x).slice(0, 200));
  }
  w = await app(async () => { throw new Error('cloud down'); });
  prueba('y el error, con lo que pasó', /cloud down/.test((await w.BarStockMorningReport.datos()).detalle || ''));

  // El panel de Settings: la vista sale sola al entrar; "Send to me" la manda.
  w = await app();
  const host = w.document.createElement('div'); w.document.body.appendChild(host);
  await w.BarStockMorningReport.montar(host, () => '<div class="cab"></div>', () => {});
  await new Promise(r => setTimeout(r, 20));
  const fr = host.querySelector('iframe.m-mr-vista');
  prueba('al entrar, la vista del correo', !!fr && /vista/.test(fr.getAttribute('srcdoc') || '') && w.__llamadas[0].a === 'preview' && w.__llamadas[0].p === 'report',
    host.innerHTML.slice(0, 300));
  prueba('con los datos de la app', !!(w.__llamadas[0].prm && w.__llamadas[0].prm.datos && w.__llamadas[0].prm.datos.ayer));
  const bt = host.querySelector('#mrSend');
  prueba('el botón dice a quién va: a ti', !!bt && /Send to me/.test(bt.textContent));
  bt.click();
  await new Promise(r => setTimeout(r, 20));
  const env = w.__llamadas.find(x => x.a === 'send');
  prueba('Send to me lo manda, con los mismos datos', !!env && !!env.prm.datos && !('to' in env.prm), JSON.stringify(env && env.prm).slice(0, 120));
  prueba('y dice a dónde se mandó', /axel@crown\.test/.test(host.textContent + ' ' + (w.__toast || '')), host.textContent.slice(0, 200));

  const ms = leer('src/mobile-settings.js');
  prueba('Settings › Toast lo ofrece', /id: 'morning'[^}]*n: 'Morning email'/.test(ms) && /_panel === 'morning'[\s\S]{0,120}BarStockMorningReport/.test(ms));
  const html = leer('index.html');
  const pos = (f) => html.indexOf('src="src/' + f);
  prueba('se carga después de lo que usa y antes de Settings',
    pos('morning-report.js') > pos('run-out.js') && pos('morning-report.js') > pos('toast-sales.js') && pos('morning-report.js') > pos('dev-panel.js') &&
    pos('morning-report.js') < pos('mobile-settings.js') && pos('run-out.js') > 0, [pos('run-out.js'), pos('toast-sales.js'), pos('morning-report.js'), pos('mobile-settings.js')].join(','));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
