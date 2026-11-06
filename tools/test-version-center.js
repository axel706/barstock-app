#!/usr/bin/env node
/*
 * ── El centro de versiones, en More ──────────────────────────────────
 *
 * Una tarjeta entre Settings y Log out, con la plantilla de las del
 * carrusel, para saber qué build tiene el teléfono —el mismo número del
 * escritorio, que en el teléfono va escondido— y qué trae. Diseño que
 * Axel aprobó sobre su captura de More.
 *
 * Lo que se protege:
 *
 *   1. Va entre Settings y Log out.
 *   2. Al día: tu build, cuándo salió, sus notas, "Up to date".
 *   3. Con una versión nueva: "New version ready", la tuya y la que
 *      espera, lo que trae, y "Update now", que recarga.
 *   4. Sin notas (sin red, o una build sin entrada) lo DICE: no enseña
 *      las notas de otra build como si fueran de ésta.
 *   5. "Earlier versions": las últimas 5, o 10, nunca más; la tuya
 *      marcada.
 *
 *   node tools/test-version-center.js
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = ms => new Promise(r => setTimeout(r, ms));

const MIA = '20261106-131106';
const NOTAS = [];
for (let i = 0; i < 12; i++) {
  const h = String(14 - i).padStart(2, '0');
  NOTAS.push({ build: '20261106-' + h + '0000', items: ['Change number ' + i] });
}
NOTAS.splice(2, 0, { build: MIA, items: ['Update notice drops from the bell', 'Change a bottle right from Inventory'] });

function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body class="m-shell"><span id="buildBadge">BUILD-' + (o.mia || MIA) + '</span></body>',
    { url: 'https://app.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.__pedidos = [];
  global.fetch = w.fetch = async (u) => {
    w.__pedidos.push(String(u));
    if (o.sinRed) throw new Error('offline');
    if (/changelog\.json/.test(u)) return { ok: true, json: async () => (o.notas || NOTAS) };
    return { ok: true, text: async () => '<span id="buildBadge">BUILD-' + (o.servidor || o.mia || MIA) + '</span>' };
  };
  w.__recargas = 0;
  new Function(leer('src/version-check.js'))();
  w.BarStockVersion._recargar = () => { w.__recargas++; };
  new Function(leer('src/version-center.js'))();
  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {} };
  new Function(leer('src/mobile-tabs.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'more';
  w.document.body.appendChild(host);
  return { w, host, montar: () => def && def.mount(host) };
}

(async () => {

grupo('va entre Settings y Log out');
{
  const { w, host, montar } = entorno();
  montar();
  await esperar(20);
  const set = host.querySelector('#mMoreSet'), card = host.querySelector('#mVerCard'), out = host.querySelector('#mMoreOut');
  prueba('esta la tarjeta', !!card);
  const orden = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & w.Node.DOCUMENT_POSITION_FOLLOWING));
  prueba('despues de Settings', orden(set, card));
  prueba('antes de Log out', orden(card, out));
  prueba('con la plantilla de las tarjetas', !!card && card.classList.contains('m-hero'));
}

grupo('al dia');
{
  const { w, host, montar } = entorno();
  montar();
  await esperar(20);
  const card = host.querySelector('#mVerCard');
  const t = card ? card.textContent.replace(/\s+/g, ' ') : '';
  prueba('el build que tienes', /BUILD-20261106-131106/.test(t), t.slice(0, 120));
  prueba('cuando salio', /Nov 6 · 1:11 PM/.test(t), t.slice(0, 160));
  prueba('sus notas', /Update notice drops from the bell/.test(t) && /Change a bottle right from Inventory/.test(t));
  prueba('Up to date', /Up to date/.test(t) && !/Update now/.test(t));
  prueba('y Earlier versions', !!card && /Earlier versions/.test(t));
}

grupo('hay una version nueva');
{
  const nueva = NOTAS[0].build;
  const { w, host, montar } = entorno({ servidor: nueva });
  await w.BarStockVersion.comprobar(true);
  montar();
  await esperar(20);
  const card = host.querySelector('#mVerCard');
  const t = card ? card.textContent.replace(/\s+/g, ' ') : '';
  prueba('New version ready', /New version ready/.test(t), t.slice(0, 200));
  prueba('dice la tuya', /BUILD-20261106-131106/.test(t) && /yours/.test(t));
  prueba('y la que espera', new RegExp('Ready: BUILD-' + nueva).test(t), t);
  prueba('con lo que trae', /Change number 0/.test(t), t);
  const b = card && Array.from(card.querySelectorAll('button')).find(x => /Update now/.test(x.textContent));
  prueba('Update now', !!b);
  if (b) b.click();
  prueba('que recarga', w.__recargas === 1, String(w.__recargas));
}
{
  // La version nueva se descubre con la tarjeta ya pintada: se repinta.
  const { w, host, montar } = entorno({ servidor: NOTAS[0].build });
  montar();
  await esperar(20);
  await w.BarStockVersion.comprobar(true);
  await esperar(20);
  const t = (host.querySelector('#mVerCard') || {}).textContent || '';
  prueba('si la descubre con la tarjeta abierta, se repinta', /New version ready/.test(t));
}

grupo('sin notas, lo dice');
for (const [n, o] of [['sin red', { sinRed: true }], ['una build sin entrada', { mia: '20261106-171717' }]]) {
  const { host, montar } = entorno(o);
  montar();
  await esperar(20);
  const t = (host.querySelector('#mVerCard') || {}).textContent || '';
  prueba(n + ': lo dice', /not available/i.test(t), t.replace(/\s+/g, ' ').slice(0, 200));
  prueba(n + ': y no pone las notas de otra build', !/Change number|Update notice/.test(t));
}

grupo('Earlier versions: 5, o 10, nunca mas');
{
  const { w, host, montar } = entorno();
  montar();
  await esperar(20);
  const b = Array.from(host.querySelectorAll('#mVerCard button')).find(x => /Earlier versions/.test(x.textContent));
  if (b) b.click();
  await esperar(20);
  const hoja = w.document.getElementById('mSheet');
  prueba('abre una hoja', !!hoja);
  const filas = () => hoja ? hoja.querySelectorAll('.m-vc-v').length : 0;
  prueba('las ultimas 5', filas() === 5, String(filas()));
  const diez = hoja && Array.from(hoja.querySelectorAll('button')).find(x => /Last 10/.test(x.textContent));
  if (diez) diez.click();
  prueba('o 10', filas() === 10, String(filas()));
  prueba('nunca mas de 10, aunque haya 13', NOTAS.length === 13 && filas() === 10);
  const mia = hoja && hoja.querySelector('.m-vc-v.es-mia');
  prueba('la tuya marcada', !!mia && /BUILD-20261106-131106/.test(mia.textContent) && /YOURS/.test(mia.textContent));
}

grupo('esta en index.html, antes de More');
{
  const html = leer('index.html');
  const c = html.indexOf('src/version-center.js?v='), t = html.indexOf('src/mobile-tabs.js'), v = html.indexOf('src/version-check.js');
  prueba('cargado despues de version-check y antes de mobile-tabs', c > 0 && c > v && c < t, [v, c, t].join(' / '));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
