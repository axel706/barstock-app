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
 *   2. Si son distintos, salta una tarjeta desde la campana. Tocarla
 *      recarga; la ✕ la cierra; sola, se recoge a los 8 s.
 *   3. Salta UNA vez por versión. Si no, cada vuelta a la app sería un
 *      aviso más hasta que actualizaras.
 *   4. Mismo build, sin red o con una respuesta rara: nada. Un aviso de
 *      versión nueva que no lo es, o un error en pantalla porque no hubo
 *      cobertura, es peor que no avisar.
 *   5. No se pregunta en cada vuelta: como mucho una vez por minuto.
 *   6. La campana lo lleva el primero, con su punto AZUL; el rojo sigue
 *      siendo sólo de las notificaciones de siempre.
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

grupo('hay version nueva: salta desde la campana');
{
  const { w, V } = entorno({ remoto: '20261106-120000' });
  if (V) {
    await V.comprobar(true);
    const u = (w.__pedidos[0] || {}).u || '';
    prueba('pide index.html sin cache', /index\.html/.test(u) && /[?&]_=\d+/.test(u) &&
      ((w.__pedidos[0] || {}).op || {}).cache === 'no-store', u);
    prueba('sabe que hay una nueva', V.nueva() === '20261106-120000', V.nueva());
    const t = w.document.getElementById('mVer');
    prueba('salta la tarjeta', !!t && /New version of BarStock/.test(t.textContent) && /Tap to update/.test(t.textContent));
    if (t) t.querySelector('.m-ver-msg').click();
    prueba('tocarla recarga', w.__recargas === 1, String(w.__recargas));
  }
}
{
  const { w, V } = entorno({ remoto: '20261106-120000' });
  if (V) {
    await V.comprobar(true);
    const x = w.document.querySelector('#mVer .m-ver-x');
    if (x) x.click();
    await esperar(260);
    prueba('la X la cierra', !w.document.getElementById('mVer'));
    prueba('sin recargar', w.__recargas === 0);
    prueba('y la version nueva sigue sabida, para la campana', V.nueva() === '20261106-120000');
  }
}
{
  const { w, V } = entorno({ remoto: '20261106-120000' });
  if (V) {
    V.DURACION = 30;
    await V.comprobar(true);
    prueba('esta', !!w.document.getElementById('mVer'));
    await esperar(320);
    prueba('sola, se recoge', !w.document.getElementById('mVer'));
    await V.comprobar(true);
    prueba('y no vuelve a saltar por la misma version', !w.document.getElementById('mVer'));
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

grupo('la campana lo lleva el primero, con su punto azul');
{
  const { w, V } = entorno({ remoto: '20261106-120000' });
  if (V) {
    w.BARSTOCK_CONFIG = {};
    new Function(leer('src/mobile-notif.js'))();
    await V.comprobar(true);
    const N = w.BarStockMobileNotif;
    const avisos = N ? await N._cargar() : [];
    prueba('el aviso de version, el primero', !!avisos[0] && avisos[0].clave === 'version' && /New version/.test(avisos[0].t),
      JSON.stringify(avisos[0]));
    await N.refrescar();
    const b = w.document.getElementById('mNotif');
    prueba('la campana lleva el punto azul', !!b && !!b.querySelector('.m-pip-ver'));
    prueba('y no el rojo: no hay otras notificaciones', !!b && !b.querySelector('.m-pip:not(.m-pip-ver)'));
    await N.abrir();
    await esperar(20);
    const fila = w.document.querySelector('.m-nf[data-k="version"]');
    prueba('esta dentro del panel', !!fila);
    const go = fila && fila.querySelector('[data-ver="version"]');
    prueba('con su accion, no una X: cerrarlo no es actualizar', !!go && !fila.querySelector('[data-x]'));
    if (go) go.click();
    prueba('y la accion recarga', w.__recargas === 1, String(w.__recargas));
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
