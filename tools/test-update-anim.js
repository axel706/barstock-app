#!/usr/bin/env node
/*
 * ── La animación de actualizar ───────────────────────────────────────
 *
 * Antes, "Update" hacía location.reload() en seco y la pantalla se iba a
 * negro ("el apagón"). Ahora la app se contrae en el punto azul, sale el
 * logo con "Updating to BUILD-…" y una barra, y en la página nueva el
 * punto vuelve al centro, pulsa y se abre; luego sube What's new.
 *
 * Lo que se protege:
 *
 *   1. El <head> pinta el fotograma de llegada desde el primer píxel, con
 *      la build, y borra la marca (un reload a mano no repite la
 *      animación). Sin marca o con una build rara, no pinta nada.
 *   2. El tope: el overlay se quita a los 10 s aunque update-anim.js no
 *      llegue a cargar. Un overlay atascado es peor que el apagón.
 *   3. El marcado del logo vive en UN sitio (el <head>), no copiado en
 *      update-anim.js: salida y llegada tienen que coincidir.
 *   4. auth.js avisa de que la app está lista (__bsUpdListo).
 *   5. "Update" pasa por la animación, y sin ella recarga igual.
 *   6. La salida deja la marca y recarga; la llegada quita el overlay y
 *      abre What's new con esa build.
 *   7. What's new enseña las notas de ESA build, o dice que no hay.
 *   8. El fallo que se vio en el teléfono simulado: con opacity 0 en el
 *      iris, su sombra dejaba de tapar y la app se veía detrás del logo.
 *
 *   node tools/test-update-anim.js
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
// jsdom no implementa location.reload() y lo grita en consola; aquí solo
// importa si se llamó, así que ese aviso se calla.
const consola = new VirtualConsole();
consola.on('jsdomError', (e) => { if (!/Not implemented: navigation/.test(e.message)) console.error(e); });
const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d !== undefined ? '   → ' + d : '')); }
}
function grupo(t) { console.log('\n' + t); }
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const html = leer('index.html');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const HEAD = scripts.find(s => s.includes('barstock.updatingTo'));
const ANIM = leer('src/update-anim.js');
const CHECK = leer('src/version-check.js');
const CENTRO = leer('src/version-center.js');
const BUILD = '20261107-001500';

function entorno({ marca, notas, sinModulo } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://app.barstockpro.com/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: consola
  });
  const w = dom.window;
  // Sin movimiento: update-anim no espera entre pasos y la prueba va rápida.
  w.matchMedia = (q) => ({ matches: /reduce/.test(q), addListener() {}, removeListener() {} });
  w.__recargas = 0;
  w.fetch = async (u) => ({ ok: true, json: async () => (notas || []) , text: async () => '' });
  if (marca !== undefined) w.sessionStorage.setItem('barstock.updatingTo', marca);
  w.eval(HEAD);
  if (!sinModulo) {
    w.eval(CENTRO);
    w.eval(ANIM);
  }
  return w;
}

(async () => {

grupo('1 · el <head> pinta la llegada');
prueba('el script en linea existe', !!HEAD);
{
  const w = entorno({ marca: BUILD, sinModulo: true });
  const o = w.document.getElementById('bsUpd');
  prueba('el overlay esta, colgado de <html>', !!o && o.parentNode === w.document.documentElement, o && o.parentNode && o.parentNode.nodeName);
  prueba('es el de llegada', !!o && o.classList.contains('bu-llega'));
  prueba('con la build a la que se actualiza', !!o && o.querySelector('.bu-build').textContent === 'BUILD-' + BUILD, o && o.querySelector('.bu-build').textContent);
  prueba('con el logo de la app (brand-logo-*)', !!o && !!o.querySelector('.brand-logo-type .bs-stock') && !!o.querySelector('.brand-logo-dot') && !!o.querySelector('.brand-logo-pro'));
  prueba('dice "Updating to"', !!o && /Updating to/.test(o.textContent));
  prueba('html lleva bs-upd', w.document.documentElement.classList.contains('bs-upd'));
  prueba('la marca se borro al leerla', w.sessionStorage.getItem('barstock.updatingTo') === null);
}
{
  const w = entorno({});
  prueba('sin marca: nada', !w.document.getElementById('bsUpd') && !w.document.documentElement.classList.contains('bs-upd'));
}
{
  const w = entorno({ marca: '<img src=x onerror=alert(1)>' });
  prueba('con una build rara: nada (ni se mete en el HTML)', !w.document.getElementById('bsUpd'));
}

grupo('2 · el tope');
{
  // Se adelanta el reloj: el tope son 10 s. Se cambia setTimeout por uno
  // que guarda las esperas para dispararlas a mano.
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' });
  const w = dom.window;
  const colas = [];
  w.setTimeout = (f, ms) => { colas.push([ms, f]); return colas.length; };
  w.sessionStorage.setItem('barstock.updatingTo', BUILD);
  w.eval(HEAD);
  const tope = colas.find(([ms]) => ms === 10000);
  prueba('hay un tope de 10 s', !!tope);
  if (tope) tope[1]();
  prueba('a los 10 s el overlay se quita aunque update-anim.js no haya cargado', !w.document.getElementById('bsUpd') && !w.document.documentElement.classList.contains('bs-upd'));
}

grupo('3 · el marcado del logo, en un solo sitio');
prueba('update-anim.js no lo copia', !/bu-grupo|Updating to/.test(ANIM.replace(/\/\/.*$/gm, '')));
prueba('update-anim.js usa el del <head>', /__bsUpdMarcado/.test(ANIM));

grupo('4 · auth.js avisa de que la app esta lista');
prueba('levantarCortina llama a __bsUpdListo', /function levantarCortina\(\)\{[\s\S]*?__bsUpdListo\(\)[\s\S]*?\n  \}/.test(leer('src/auth.js')));

grupo('5 · "Update" pasa por la animacion');
{
  const w = entorno({});
  w.eval(CHECK);
  const V = w.BarStockVersion;
  let llamada = null;
  w.BarStockUpdateAnim.salir = (b, f) => { llamada = [b, typeof f]; };
  // Sin version nueva sabida: recarga como antes.
  let recargo = 0;
  const orig = w.location.reload;
  try { Object.defineProperty(w.location, 'reload', { value: () => { recargo++; }, configurable: true }); } catch (e) {}
  V._recargar();
  prueba('sin version nueva sabida no anima', llamada === null);
  // Con version nueva: se la pide al servidor y luego Update.
  w.document.body.innerHTML = '<div id="buildBadge">BUILD-20261106-000000</div>';
  w.fetch = async () => ({ ok: true, text: async () => '<span id="buildBadge">BUILD-' + BUILD + '</span>' });
  await V.comprobar(true);
  V._recargar();
  prueba('con version nueva, salir() con su build', !!llamada && llamada[0] === BUILD && llamada[1] === 'function', llamada && llamada.join(' '));
}

grupo('6 · salida y llegada');
{
  const w = entorno({});
  let recargo = 0;
  await w.BarStockUpdateAnim.salir(BUILD, () => { recargo++; });
  const o = w.document.getElementById('bsUpd');
  prueba('la salida pinta el overlay', !!o && o.classList.contains('bu-sale'));
  prueba('pasa por cierra, punto, logo y en-logo', !!o && ['cierra', 'punto', 'logo', 'en-logo'].every(c => o.classList.contains(c)), o && o.className);
  prueba('deja la marca con la build', w.sessionStorage.getItem('barstock.updatingTo') === BUILD);
  prueba('y recarga una vez', recargo === 1, recargo);
}
{
  const w = entorno({});
  let recargo = 0;
  await w.BarStockUpdateAnim.salir('undefined', () => { recargo++; });
  prueba('sin build valida: recarga sin animar ni dejar marca', recargo === 1 && !w.document.getElementById('bsUpd') && w.sessionStorage.getItem('barstock.updatingTo') === null);
}
{
  const notas = [{ build: BUILD, items: ['Smooth update animation'] }];
  const w = entorno({ marca: BUILD, notas });
  prueba('antes de estar lista, el overlay sigue', !!w.document.getElementById('bsUpd'));
  w.__bsUpdListo();
  await esperar(300);
  prueba('lista: el overlay se quita', !w.document.getElementById('bsUpd'));
  prueba('y bs-upd tambien', !w.document.documentElement.classList.contains('bs-upd'));
  const h = w.document.getElementById('mSheet');
  prueba('sube What\'s new', !!h && /What's new/.test(h.textContent));
  prueba('con la build y sus notas', !!h && h.textContent.includes('BUILD-' + BUILD) && h.textContent.includes('Smooth update animation'), h && h.textContent.replace(/\s+/g, ' '));
  w.__bsUpdListo();
  await esperar(30);
  prueba('una sola vez aunque avisen dos', w.document.querySelectorAll('#mSheet').length === 1);
}
{
  // auth.js contesta ANTES de que update-anim.js cargue.
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: /reduce/.test(q) });
  w.fetch = async () => ({ ok: true, json: async () => [] });
  w.sessionStorage.setItem('barstock.updatingTo', BUILD);
  w.eval(HEAD);
  w.__bsUpdListo();
  w.eval(CENTRO); w.eval(ANIM);
  await esperar(300);
  prueba('si auth contesto antes de cargar el modulo, igual termina', !w.document.getElementById('bsUpd'));
}

grupo('7 · What\'s new sin notas de esa build');
{
  const w = entorno({ notas: [{ build: '20200101-000000', items: ['Otra cosa'] }] });
  await w.BarStockVersionCenter.novedades(BUILD);
  const h = w.document.getElementById('mSheet');
  prueba('lo dice, no ensena las de otra', !!h && /not available/.test(h.textContent) && !h.textContent.includes('Otra cosa'), h && h.textContent.replace(/\s+/g, ' '));
  h.querySelector('#mWnOk').click();
  prueba('Got it la cierra', !w.document.getElementById('mSheet'));
}

grupo('8 · el iris no se apaga con opacity');
{
  const css = leer('styles/auth.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const reglas = [...css.matchAll(/([^{}]*\.bu-iris[^{}]*)\{([^}]*)\}/g)];
  prueba('hay reglas del iris', reglas.length > 2);
  const conOpacity = reglas.filter(([, , cuerpo]) => /opacity/.test(cuerpo)).map(([, sel]) => sel.trim());
  prueba('ninguna le pone opacity (su sombra es lo que tapa la app)', conOpacity.length === 0, conOpacity.join(' | '));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
