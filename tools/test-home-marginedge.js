#!/usr/bin/env node
/*
 * ── MarginEdge en el Home: la cifra "Spent this cycle" y su hoja ──────
 *
 * La tarjeta de MarginEdge salió del carrusel con el rediseño del Home
 * (Axel, 2026-11-12). Lo que hacía vive ahora en la cifra "Spent this
 * cycle" (su botón Sync) y en la hoja que abre. Estas son las reglas que
 * protegía test-ciclo-tarjeta.js sobre la tarjeta, pasadas a la hoja:
 *
 *   1. Sync gira mientras busca, no se puede pulsar dos veces, pide las
 *      facturas una vez y DICE qué pasó, también "nada nuevo" y el error.
 *   2. La cifra está sea cual sea el estado del conteo.
 *   3. Sin conectar no es lo mismo que sin facturas: lo dice, manda a
 *      Settings › Connections y no ofrece Sync, que no haría nada.
 *   4. Conectada y con cero facturas, Sync sí está.
 *   5. Si la lectura falla, se dice con su error y se puede reintentar.
 *   6. "synced" es cuándo se habló con MarginEdge (la hora de la nube),
 *      no cuándo se leyó la copia; sin sincronizar nunca, se dice.
 *   7. Sincronizar sin novedades también mueve el "synced".
 *   8. Mientras busca, dice por dónde va ("24 of 48").
 *
 *   node tools/test-home-marginedge.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'mobile-home.js'), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = ms => new Promise(r => setTimeout(r, ms));

function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.state = { master: [] };
  w.BarStockWeeklyCycle = { estado: () => o.estado || 'done', resetAt: () => '2026-10-25T08:00:00Z',
    fmtDate: () => 'Oct 25', edadCiclo: () => 2 * 864e5, cicloViejo: () => false };
  if (o.estado === 'counting') w.BarStockCountSession = { progress: () => ({ counted: 5, total: 10 }), size: () => 5 };
  w.BarStockSpend = { compute: () => ({ now: { total: 900 }, prev: { total: 800 }, totalDelta: 100 }) };
  w.__toast = '';
  w.BarStockToast = { show: (t) => { w.__toast = t; } };
  if (o.entregas !== undefined) w.BarStockMobileInvoices = { resumen: async () => o.entregas };
  if (o.resumenFalla) w.BarStockMobileInvoices = { resumen: async () => { throw new Error(o.resumenFalla); } };
  w.BarStockIntegrations = { ultimoSync: async () => (o.sync === undefined ? null : o.sync) };
  w.__llamado = 0;
  w.BarStockMarginEdgeConnect = { buscarFacturas: async (cb) => {
    w.__llamado++;
    if (o.buscar) return o.buscar(cb);
    return { facturas: 1, lineas: 0 };
  } };
  new Function(SRC)();
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.setAttribute('data-screen', 'home');
  w.document.body.appendChild(host);
  w.BarStockMobileHome.render(host);
  return { w, host };
}
const cifra = (h) => [...h.querySelectorAll('#mhCifras .m-cf-c')].find(c => /Spent this cycle/.test(c.textContent));
const boton = (h) => cifra(h).querySelector('.m-cf-b');
const hoja = (w) => w.document.querySelector('#mSheet .m-cfh');
const txt = (el) => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
const ENT = { n: 2, unidades: 22, dinero: 58, sueltas: 0, ultima: '2026-10-27' };

(async () => {

grupo('Sync busca, gira y dice qué pasó');
{
  const { w, host } = entorno({ entregas: ENT, buscar: async () => ({ facturas: 1, lineas: 3 }) });
  await esperar(60);
  boton(host).click();
  await esperar(5);
  const sync = hoja(w).querySelector('#mcfSync');
  prueba('abre la hoja y sincroniza', !!sync && w.__llamado === 1, String(w.__llamado));
  prueba('gira mientras busca', sync.classList.contains('girando'));
  prueba('y no se puede pulsar otra vez', sync.disabled);
  sync.click();
  await esperar(1300);   // el mínimo en pantalla es de 1000 ms
  prueba('pide las facturas una vez', w.__llamado === 1, String(w.__llamado));
  prueba('y dice qué pasó', /new lines? from MarginEdge/.test(w.__toast), w.__toast);
  // El MISMO botón que se pulsó: al terminar la hoja se repinta con uno
  // nuevo, y mirar el nuevo daría por bueno un giro que no para.
  prueba('ese botón deja de girar al terminar', !sync.classList.contains('girando') && !sync.disabled);
}
{
  const { w, host } = entorno({ entregas: ENT, buscar: async () => ({ facturas: 2, lineas: 0 }) });
  await esperar(60);
  boton(host).click();
  await esperar(1300);
  prueba('sin nada nuevo, lo dice con palabras', /up to date/i.test(w.__toast), w.__toast);
  prueba('y deja de girar', !hoja(w).querySelector('#mcfSync').classList.contains('girando'));
}
{
  const { w, host } = entorno({ entregas: ENT, buscar: async () => { throw new Error('MarginEdge rate limit (429)'); } });
  await esperar(60);
  boton(host).click();
  await esperar(120);
  prueba('si falla, enseña el error', /429/.test(w.__toast), w.__toast);
  prueba('y se puede volver a pulsar', !hoja(w).querySelector('#mcfSync').disabled);
}

grupo('una sincronización que no contesta no deja el botón mudo (Axel, 2026-11-18: "no pasa nada, no gira")');
{
  // MarginEdge (o la sesión) no contesta nunca. Antes, el primer toque
  // giraba para siempre y los siguientes salían sin hacer ni decir nada.
  const { w, host } = entorno({ entregas: ENT, buscar: () => new Promise(() => {}) });
  w.BarStockSyncEspera = 300;
  await esperar(60);
  boton(host).click();
  await esperar(20);
  prueba('el primer toque busca y gira', w.__llamado === 1 && hoja(w).querySelector('#mcfSync').classList.contains('girando'));
  // Se cierra la hoja y se vuelve a abrir mientras sigue buscando.
  w.document.getElementById('mSheet').remove();
  boton(host).click();
  await esperar(20);
  const b2 = hoja(w).querySelector('#mcfSync');
  prueba('otro toque mientras busca: gira también y lo dice', b2.classList.contains('girando') && /already syncing/i.test(w.__toast), w.__toast);
  prueba('y no lanza otra búsqueda encima', w.__llamado === 1, String(w.__llamado));
  await esperar(500);
  prueba('sin respuesta, se para y dice lo que pasó', /did not answer/i.test(w.__toast), w.__toast);
  const b3 = hoja(w).querySelector('#mcfSync');
  prueba('el botón deja de girar y se puede volver a pulsar', !b3.classList.contains('girando') && !b3.disabled);
  b3.click();
  await esperar(20);
  prueba('y vuelve a buscar de verdad', w.__llamado === 2, String(w.__llamado));
}

grupo('el logo de MarginEdge encima de "Spent this cycle" (Axel, 2026-11-18, opción B)');
{
  const { host } = entorno({ entregas: ENT });
  await esperar(60);
  const c = cifra(host);
  const img = c.querySelector('img.m-cf-logo');
  prueba('el logo va primero, del archivo de assets/brands', !!img && /assets\/brands\/marginedge\.png/.test(img.getAttribute('src')) &&
    img.alt === 'MarginEdge' && c.querySelector('.m-cf-cab').firstElementChild === img);
  prueba('y el título, en una sola línea', c.querySelector('.m-cf-k').classList.contains('m-cf-k1'));
  const css = require('fs').readFileSync(require('path').join(__dirname, '../styles/mobile-app.css'), 'utf8');
  prueba('en blanco y el título sin partirse', /\.m-cf-logo \{[^}]*filter: brightness\(0\) invert\(1\)/.test(css) && /\.m-cf-k\.m-cf-k1 \{[^}]*white-space: nowrap/.test(css));
  prueba('el archivo existe', require('fs').existsSync(require('path').join(__dirname, '../assets/brands/marginedge.png')));
}

grupo('la cifra no depende del estado del conteo');
for (const estado of ['step1', 'step2', 'counting', 'done']) {
  const { host } = entorno({ entregas: ENT, estado });
  await esperar(60);
  prueba('con el ciclo en "' + estado + '" la cifra está', !!cifra(host));
}

grupo('sin conectar no es lo mismo que sin facturas');
{
  const { w, host } = entorno({ entregas: { n: 0, unidades: 0, dinero: 0, sueltas: 0, ultima: '', conectado: false } });
  await esperar(60);
  prueba('el botón de la cifra no dice Sync', !/Sync/.test(txt(boton(host))), txt(boton(host)));
  boton(host).click();
  await esperar(20);
  const t = txt(hoja(w));
  prueba('la hoja lo dice', /Not connected yet/.test(t), t);
  prueba('y no finge que no llegó nada', !/Nothing new yet/.test(t));
  prueba('manda a Settings › Connections', /Settings . Connections/.test(t));
  prueba('sin Sync now, que no haría nada', !hoja(w).querySelector('#mcfSync'));
  prueba('y no intentó sincronizar', w.__llamado === 0, String(w.__llamado));
}
{
  const { w, host } = entorno({ entregas: { n: 0, unidades: 0, dinero: 0, sueltas: 0, ultima: '', conectado: true },
    buscar: async () => ({ facturas: 0, lineas: 0 }) });
  await esperar(60);
  boton(host).click();
  await esperar(1300);
  prueba('conectada y sin facturas: lo dice', /Nothing new yet/.test(txt(hoja(w))), txt(hoja(w)));
  prueba('con su Sync now', !!hoja(w).querySelector('#mcfSync'));
}

grupo('si la lectura falla, se dice en vez de esconderse');
{
  const { w, host } = entorno({ resumenFalla: 'relation does not exist' });
  await esperar(80);
  prueba('la cifra avisa (ámbar, Review)', cifra(host).classList.contains('m-cf-am') && /Review/.test(txt(boton(host))));
  boton(host).click();
  await esperar(20);
  const t = txt(hoja(w));
  prueba('la hoja dice qué pasó, con el error', /Could not read invoices/.test(t) && /relation does not exist/.test(t), t);
  prueba('y deja reintentar', !!hoja(w).querySelector('#mcfSync'));
}

grupo('"synced" es cuándo se habló con MarginEdge');
{
  const hace2h = new Date(Date.now() - 2 * 3600000).toISOString();
  let { w, host } = entorno({ entregas: ENT, sync: hace2h, buscar: async () => ({ facturas: 0, lineas: 0 }) });
  await esperar(60);
  boton(host).click();
  const vs0 = txt(hoja(w).querySelector('#mcfVs'));
  prueba('con la hora de la nube, no la de ahora', /synced 2 h/.test(vs0) || /looking/.test(vs0), vs0);
  await esperar(1300);
  const vs1 = txt(hoja(w).querySelector('#mcfVs'));
  prueba('sincronizar sin novedades lo mueve', /just now/.test(vs1), vs1);
  prueba('aunque no entrara ni una línea', /nothing new/i.test(w.__toast), w.__toast);
}
{
  const { w, host } = entorno({ entregas: Object.assign({}, ENT, { sueltas: 1 }), sync: null });
  await esperar(60);
  boton(host).click();   // con algo que arreglar es Review: abre sin sincronizar
  await esperar(20);
  const vs = txt(hoja(w).querySelector('#mcfVs'));
  prueba('sin sincronizar nunca, lo dice', /never synced/.test(vs), vs);
  prueba('sin inventarse una hora', !/just now/.test(vs), vs);
}

grupo('mientras busca, dice por dónde va');
{
  let avisar = null;
  const { w, host } = entorno({ entregas: ENT, buscar: async (cb) => {
    avisar = cb;
    cb(48, 0); await esperar(10);
    cb(48, 24); await esperar(10);
    return { facturas: 48, lineas: 120 };
  } });
  await esperar(60);
  boton(host).click();
  await esperar(3);
  const vs = hoja(w).querySelector('#mcfVs');
  prueba('le pasa un avisador de verdad', typeof avisar === 'function');
  prueba('dice cuántas facturas encontró', /48 invoices found/.test(vs.textContent), vs.textContent);
  await esperar(15);
  prueba('y por cuál va', /24 of 48/.test(vs.textContent), vs.textContent);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
