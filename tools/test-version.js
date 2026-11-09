#!/usr/bin/env node
/*
 * ── El aviso de versión nueva ────────────────────────────────────────
 *
 * La app del teléfono va instalada en la pantalla de inicio: no tiene el
 * botón de recargar de Safari. Cada vez que algo se mandaba a main, Axel
 * tenía que cerrarla y volver a abrirla, y aun así no sabía si ya tenía
 * la versión nueva sin mirar la esquina del escritorio.
 *
 * Lo que se protege:
 *
 *   1. La versión se compara por el sello BUILD- de index.html: el que
 *      trae la página cargada contra el del servidor, leído sin caché.
 *   2. Si son distintos, se repinta el Home para que salga la tarjeta
 *      de versión nueva (mobile-home.js; la prueba de la tarjeta está en
 *      test-tarjeta-version.js). Ya no salta el aviso de 8 s de arriba,
 *      y la campana ya no lleva la versión nueva (Axel, 2026-11-09).
 *   3. Mismo build, sin red o con una respuesta rara: nada. Un aviso de
 *      versión nueva que no lo es, o un error en pantalla porque no hubo
 *      cobertura, es peor que no avisar.
 *   4. No se pregunta en cada vuelta: como mucho una vez por minuto.
 *
 *   node tools/test-version.js
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

const PAGINA = (b) => '<!doctype html><html><body><span id="buildBadge">BUILD-' + b + '</span></body></html>';

function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body class="m-shell"><header id="mBand"><div class="m-band-ico"></div></header>' +
    '<span id="buildBadge">BUILD-20261106-100000</span></body>', { url: 'https://app.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: o.escritorio ? false : true });
  w.__pedidos = [];
  global.fetch = w.fetch = async (u, op) => {
    w.__pedidos.push({ u: String(u), op });
    if (o.sinRed) throw new Error('offline');
    if (/index\.html/.test(u)) return { ok: o.status ? false : true, status: o.status || 200, text: async () => o.respuesta != null ? o.respuesta : PAGINA(o.remoto || '20261106-100000') };
    return { ok: true, json: async () => [] };
  };
  w.__recargas = 0;
  new Function(leer('src/version-check.js'))();
  const V = w.BarStockVersion;
  if (V) V._recargar = () => { w.__recargas++; };
  return { w, V };
}

(async () => {

grupo('compara el sello cargado contra el del servidor');
{
  const { V } = entorno({ remoto: '20261106-120000' });
  prueba('existe el modulo', !!V);
  prueba('lee el build cargado de la pagina', !!V && V.actual() === '20261106-100000', V && V.actual());
}

grupo('hay version nueva: la tarjeta del Home, no el aviso de arriba');
{
  // Axel, 2026-11-09: el aviso de 8 segundos de arriba se perdía fácil.
  // Ahora es una tarjeta en el carrusel del Home que se queda hasta que
  // actualizas (mobile-home.js).
  const { w, V } = entorno({ remoto: '20261106-120000' });
  if (V) {
    let repintados = 0;
    w.BarStockMobileHome = { refresh: () => { repintados++; } };
    await V.comprobar(true);
    const u = (w.__pedidos[0] || {}).u || '';
    prueba('pide index.html sin cache', /index\.html/.test(u) && /[?&]_=\d+/.test(u) &&
      ((w.__pedidos[0] || {}).op || {}).cache === 'no-store', u);
    prueba('sabe que hay una nueva', V.nueva() === '20261106-120000', V.nueva());
    prueba('ya no salta el aviso de arriba', !w.document.getElementById('mVer'));
    prueba('repinta el Home para que salga la tarjeta', repintados >= 1, String(repintados));
    // Axel, 2026-11-09: la tarjeta basta; la campana ya no lleva la
    // versión nueva (ni su entrada ni el punto azul).
    prueba('la campana ya no lleva la versión nueva', !(V.aviso && V.aviso()));
  }
}

grupo('cuando no hay que avisar, no avisa');
for (const [n, o] of [
  ['mismo build', { remoto: '20261106-100000' }],
  ['sin red', { sinRed: true }],
  ['el servidor contesta error', { status: 503 }],
  ['una pagina sin sello', { respuesta: '<html>mantenimiento</html>' }]
]) {
  const { w, V } = entorno(o);
  if (!V) { prueba(n, false); continue; }
  let fallo = null;
  try { await V.comprobar(true); } catch (e) { fallo = e; }
  prueba(n + ': nada', !fallo && !V.nueva() && !w.document.getElementById('mVer'), fallo && fallo.message);
}

grupo('no pregunta en cada vuelta');
{
  const { w, V } = entorno({ remoto: '20261106-100000' });
  if (V) {
    await V.comprobar();
    await V.comprobar();
    await V.comprobar();
    prueba('una sola peticion en menos de un minuto', w.__pedidos.length === 1, String(w.__pedidos.length));
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    await esperar(10);
    prueba('volver a la app tambien respeta el minuto', w.__pedidos.length === 1, String(w.__pedidos.length));
  }
}

grupo('la campana ya no lleva la versión nueva');
{
  // Antes llevaba la versión nueva la primera, con un punto azul. Axel,
  // 2026-11-09: la tarjeta del Home basta; fuera de la campana.
  const { w, V } = entorno({ remoto: '20261106-120000' });
  if (V) {
    w.BARSTOCK_CONFIG = {};
    new Function(leer('src/mobile-notif.js'))();
    await V.comprobar(true);
    const N = w.BarStockMobileNotif;
    const avisos = N ? await N._cargar() : [];
    prueba('ningún aviso de versión en la lista', !avisos.some(a => a && (a.clave === 'version' || /New version/.test(a.t || ''))), JSON.stringify(avisos));
    await N.refrescar();
    const b = w.document.getElementById('mNotif');
    prueba('la campana sin punto azul', !!b && !b.querySelector('.m-pip-ver'));
    prueba('ni rojo: no hay otras notificaciones', !!b && !b.querySelector('.m-pip'));
    await N.abrir();
    await esperar(20);
    prueba('ni dentro del panel', !w.document.querySelector('.m-nf[data-k="version"]'));
  }
}

grupo('esta en index.html, antes de la campana');
{
  const html = leer('index.html');
  const v = html.indexOf('src/version-check.js?v='), n = html.indexOf('src/mobile-notif.js');
  prueba('cargado y antes que mobile-notif', v > 0 && v < n, v + ' / ' + n);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();

