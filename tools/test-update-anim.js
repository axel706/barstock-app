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

grupo('9 · la pantalla de la barra no pasa de largo');
{
  // Con 700 ms Axel la vio pasar demasiado rápido. Lo de antes y lo de
  // después se quedaron igual: se protege solo esta pantalla.
  const w = entorno({});
  const T = w.BarStockUpdateAnim.T;
  // Axel, 2026-11-09: "que dure unos 2 o 3 segundos más, que se entienda
  // como un update de verdad". Era 1.8 s.
  prueba('el logo se ve entre 4 y 5 s en la pagina nueva', T.minimo >= 4000 && T.minimo <= 5000, T.minimo);
  prueba('la barra tarda en llenarse al menos 0.6 s', T.llena >= 600, T.llena);
  // Todo tiene que caber antes del tope de 10 s del <head>, o el overlay
  // se quitaría a medias.
  const total = T.minimo + T.llena + T.vuelve + T.pulso + T.abre;
  prueba('todo cabe con holgura antes del tope de 10 s', total < 8000, total);
  // La barra no puede llegar a su 90 % mucho antes de que acabe la
  // espera, o se queda parada y deja de parecer una carga.
  const cssA = leer('styles/auth.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const m = /#bsUpd\.bu-llega \.bu-barra i\{[^}]*animation:\s*buCarga\s+([\d.]+)(m?s)/.exec(cssA);
  const durCarga = m ? Number(m[1]) * (m[2] === 's' ? 1000 : 1) : 0;
  prueba('la barra avanza durante toda la espera', durCarga >= T.minimo, durCarga + ' vs ' + T.minimo);
  prueba('la contraccion y la apertura no cambiaron', T.cierra === 380 && T.abre === 480, T.cierra + ' / ' + T.abre);
}

grupo('10 · la pantalla del logo no brinca');
{
  // Axel lo grabó (2026-11-09): mientras se llenaba la barra, el logo,
  // el texto y la barra brincaban hacia arriba y bajaban deslizándose.
  // Medido fotograma a fotograma: +23 px a los 0.8 s, +47 px a los 1.2 s
  // y vuelta en 0.25 s. Es lo que hace iOS con una capa fija cuando la
  // página se desplaza por debajo: al recargar, Safari devuelve la página
  // al scroll que tenía la vieja (estaba en Inventory, con la lista
  // bajada), y al arrancar la app la página cambia de alto y vuelve
  // arriba. La página nueva tiene que nacer arriba y quedarse quieta.
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' });
  const w = dom.window;
  const scrolls = [];
  w.scrollTo = (x, y) => { scrolls.push([x, y]); };
  w.sessionStorage.setItem('barstock.updatingTo', BUILD);
  w.eval(HEAD);
  prueba('no recupera el scroll de la página vieja', w.history.scrollRestoration === 'manual', w.history.scrollRestoration);
  prueba('y arranca arriba', scrolls.some(([x, y]) => x === 0 && y === 0), JSON.stringify(scrolls));
  const css = leer('styles/auth.css').replace(/\/\*[\s\S]*?\*\//g, '');
  prueba('mientras dura, la página entera no se desplaza (html, no sólo body)',
    /html\.bs-upd\s*[,{][^{}]*\{[^}]*overflow\s*:\s*hidden/.test(css), (css.match(/html\.bs-upd[^{]*\{[^}]*\}/g) || []).join(' | '));
}
{
  // Sin actualización, nada de esto: un recargar normal recupera su scroll.
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' });
  const w = dom.window;
  w.scrollTo = () => {};
  w.eval(HEAD);
  prueba('sin actualización no toca el scroll', w.history.scrollRestoration !== 'manual', w.history.scrollRestoration);
}

grupo('11 · el rastro de la pantalla del logo (diagnóstico)');
{
  // TEMPORAL. Los saltos del logo siguieron después de quitar el scroll
  // (Axel, 2026-11-09). En vez de otro arreglo a ciegas, la pantalla
  // anota qué cambia en cada fotograma y lo manda al log de la app al
  // terminar. Se quita cuando se sepa la causa.
  const w = entorno({ marca: BUILD });
  prueba('el <head> empieza a anotar', !!w.__bsUpd && Array.isArray(w.__bsUpd.rastro), w.__bsUpd && typeof w.__bsUpd.rastro);
  const enviados = [];
  w.BarStockLogger = { log: (ev, p) => { enviados.push([ev, p]); } };
  w.__bsUpdListo();
  await esperar(300);
  const r = enviados.find(([ev]) => ev === 'update_anim_rastro');
  prueba('al terminar lo manda al log', !!r);
  prueba('con la build y la lista', !!r && r[1].build === BUILD && Array.isArray(r[1].rastro), r && JSON.stringify(r[1]).slice(0, 120));
}

grupo('12 · las dos causas de los saltos, según el rastro');
{
  // El rastro de producción (2026-11-09) enseñó dos cosas, y ninguna era
  // el scroll:
  //  1. A los 450 ms un campo de la pantalla de entrada (puesta debajo
  //     desde el primer fotograma) recibía el foco y se abría el teclado:
  //     lo visible bajaba de 894 a 541 px y el bloque, centrado, subía.
  //     Se cerraba a los 6.4 s, al esconderse la pantalla de entrada.
  //  2. En los primeros 200 ms el alto de la app instalada pasaba de 894
  //     a 956 px, y el bloque se recentraba.
  const w = entorno({ marca: BUILD });
  const o = w.document.getElementById('bsUpd');
  prueba('la altura del centro se fija una vez, en px', /^\d+(\.\d+)?px$/.test(o.style.getPropertyValue('--cy')), o.style.getPropertyValue('--cy'));
  const inp = w.document.createElement('input');
  w.document.body.appendChild(inp);
  inp.focus();
  prueba('mientras está, un campo no se queda con el foco (no se abre el teclado)', w.document.activeElement !== inp, w.document.activeElement && w.document.activeElement.tagName);
  prueba('y se anota cuál fue', w.__bsUpd.rastro.some(x => /\|foco\|/.test(x)), JSON.stringify(w.__bsUpd.rastro.slice(-2)));
  w.__bsUpdListo();
  await esperar(300);
  inp.focus();
  prueba('al terminar, los campos vuelven a funcionar', w.document.activeElement === inp);
  const css = leer('styles/auth.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const c of ['bu-grupo', 'bu-dot', 'bu-iris']) {
    const r = new RegExp('#bsUpd \\.' + c + '\\{([^}]*)\\}').exec(css);
    prueba(c + ' se coloca con --cy, no con 50%', !!r && /top:\s*var\(--cy/.test(r[1]), r && r[1].trim().slice(0, 80));
  }
  prueba('la salida también fija --cy', /--cy/.test(ANIM));
}

grupo('13 · iOS no ofrece la contraseña debajo de la animación');
{
  // El segundo video de Axel (2026-11-09) enseñó qué abría el teclado:
  // el aviso de contraseñas de iOS, "Sign In to barstockpro.com… Fill
  // Password", y luego el teclado "password for this website". La
  // pantalla de entrada está puesta desde el primer fotograma, debajo de
  // la animación, e iOS ve su campo de contraseña. Soltar el foco no
  // basta: el aviso sale porque iOS VE el formulario. Mientras dura, la
  // pantalla de entrada no está en la página (display:none, no sólo
  // invisible); al terminar vuelve a lo que fuera.
  const css = leer('styles/auth.css').replace(/\/\*[\s\S]*?\*\//g, '');
  prueba('con bs-upd, la pantalla de entrada fuera de la página',
    /html\.bs-upd\s+#authOverlay\s*\{[^}]*display\s*:\s*none\s*!important/.test(css),
    (css.match(/html\.bs-upd[^{]*#authOverlay[^{]*\{[^}]*\}/g) || []).join(' | '));
}

grupo('14 · sin destello blanco al recargar');
{
  // Tercer video de Axel (2026-11-09): un fotograma con una franja blanca
  // abajo, de ~62 px, justo en la recarga. En el primer fotograma de la
  // página nueva la app instalada todavía mide 894 de alto (luego 956):
  // lo que queda debajo lo pinta el fondo del documento, blanco por
  // defecto. Durante la actualización el documento es del color del fondo
  // desde el primer instante, y vuelve a lo suyo al terminar.
  const w = entorno({ marca: BUILD });
  const fondo = w.document.documentElement.style.backgroundColor;
  prueba('el documento nace del color del fondo', /rgb\(11,\s*18,\s*32\)|#0b1220/i.test(fondo), fondo);
  w.__bsUpdListo();
  await esperar(300);
  prueba('y al terminar se le devuelve el suyo', !w.document.documentElement.style.backgroundColor, w.document.documentElement.style.backgroundColor);
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
