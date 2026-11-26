#!/usr/bin/env node
/*
 * ── Los fondos animados del teléfono (src/fondo-vivo.js) ─────────────
 *
 * Axel, 2026-11-22: "¿podemos generar uno animado? Colores que se muevan
 * detrás del blur". Sobre lámina, los tres: Aurora, Liquid y Bokeh ("al
 * final del día, si hay mucho lag, pongo uno estático y listo").
 *
 * Lo que se protege:
 *   1. Están en el selector del teléfono (y no en el del escritorio),
 *      con una miniatura propia: no son una imagen.
 *   2. Se guardan como un nombre ("anim:aurora") en la misma columna, y
 *      aplicarlos pinta la capa por dentro, sin background-image; volver
 *      a una foto lo quita todo.
 *   3. Lo que NO puede pasar: que el velo siga desenfocando
 *      (backdrop-filter) un fondo que se mueve. Eso es volver a
 *      desenfocar la pantalla entera en cada fotograma: el lag que ya
 *      costó quitar de las listas. Con un fondo animado, el velo va sin
 *      backdrop-filter: los colores ya son suaves de por sí.
 *   4. Sólo se anima transform (lo mueve la tarjeta gráfica), se pausa
 *      con la app escondida y se queda quieto con "reducir movimiento".
 *
 *   node tools/test-fondo-vivo.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

function entorno() {
  const dom = new JSDOM('<!doctype html><body><div id="bgLayer"></div></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document; global.localStorage = w.localStorage;
  w.BARSTOCK_CONFIG = { LOCATION_NAME: 'The Crown Tavern', ACCOUNT_ID: 'wjm-hospitality' };
  w.BarStockMobile = { montado: () => true };
  for (const f of ['backgrounds', 'fondo-vivo', 'fondo']) {
    if (!fs.existsSync(path.join(RAIZ, 'src/' + f + '.js'))) continue;
    new Function('window', 'localStorage', 'document', leer('src/' + f + '.js'))(w, w.localStorage, w.document);
  }
  return w;
}
// El dibujo vive en su hoja, compartida con el escritorio (2026-11-26);
// el velo del teléfono, en mobile-app.css.
const css = leer('styles/fondo-vivo.css') + '\n' + leer('styles/mobile-app.css');
const cssDibujo = leer('styles/fondo-vivo.css');

grupo('en el selector del teléfono');
{
  const w = entorno();
  const movil = w.BarStockBackgrounds.listaMovil();
  const vivos = movil.filter(b => b.anim);
  prueba('los tres: Aurora, Liquid y Bokeh', vivos.map(b => b.label).join() === 'Aurora,Liquid,Bokeh', vivos.map(b => b.label).join());
  prueba('guardados como un nombre, no como una imagen', vivos.every(b => /^anim:[a-z]+$/.test(b.src)), vivos.map(b => b.src).join());
  prueba('cada uno con su miniatura propia', vivos.every(b => /gradient\(/.test(b.mini || '')));
  // Desde el 2026-11-26 también en el escritorio (Axel: "agrega versión de
  // los fondos animados del teléfono para escritorio"); la pantalla de
  // entrada, que pinta una imagen, sigue sin ellos.
  const esc = w.BarStockBackgrounds.listaEscritorio ? w.BarStockBackgrounds.listaEscritorio() : [];
  prueba('el selector del escritorio ofrece los mismos tres', esc.filter(b => b.anim).map(b => b.src).join() === vivos.map(b => b.src).join(), esc.filter(b => b.anim).map(b => b.label).join());
  prueba('la pantalla de entrada (lista) no', !w.BarStockBackgrounds.lista().some(b => b.anim));
}

grupo('aplicarlos');
{
  const w = entorno();
  const capa = w.document.getElementById('bgLayer');
  const body = w.document.body;
  w.BarStockFondo.aplicar('anim:aurora');
  prueba('la capa pinta sus manchas, sin imagen', !!capa.querySelector('.fv-aurora') && !capa.style.backgroundImage, capa.innerHTML.slice(0, 120));
  prueba('activa, y el body marcado como fondo vivo', capa.classList.contains('active') && body.classList.contains('fondo-vivo'));
  w.BarStockFondo.aplicar('anim:bokeh');
  prueba('cambiar a otro animado no deja el anterior', !capa.querySelector('.fv-aurora') && !!capa.querySelector('.fv-bokeh'));
  w.BarStockFondo.aplicar('assets/backgrounds/movil-wood-bar.jpg');
  prueba('volver a una foto lo quita todo', !capa.children.length && !body.classList.contains('fondo-vivo') &&
    /movil-wood-bar/.test(capa.style.backgroundImage));
  w.BarStockFondo.aplicar('anim:liquid');
  w.BarStockFondo.aplicar('default');
  prueba('y "default" también', !capa.children.length && !body.classList.contains('fondo-vivo'));
  w.BarStockFondo.aplicar('anim:inventado');
  prueba('un nombre que no existe no pinta nada ni marca el body', !capa.children.length && !body.classList.contains('fondo-vivo'));
}

grupo('se pausa con la app escondida');
{
  const w = entorno();
  w.BarStockFondo.aplicar('anim:aurora');
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => true });
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  prueba('escondida: en pausa', w.document.body.classList.contains('fondo-pausa'));
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => false });
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  prueba('a la vista: sigue', !w.document.body.classList.contains('fondo-pausa'));
}

grupo('lo que no puede volver: el velo desenfocando algo que se mueve');
{
  const regla = (/body\.m-shell\.fondo-vivo::after\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
  prueba('con un fondo vivo, el velo va sin backdrop-filter', /backdrop-filter:\s*none/.test(regla) && /-webkit-backdrop-filter:\s*none/.test(regla), regla.trim());
  const pausa = /\.fondo-pausa\s+#bgLayer\s+\*[^{]*\{[^}]*animation-play-state:\s*paused/.test(css);
  prueba('la pausa detiene las animaciones', pausa);
  prueba('con "reducir movimiento", quietos', /prefers-reduced-motion:\s*reduce\)\s*\{[^}]*#bgLayer \.fv-[^}]*animation:\s*none/.test(css));
  // Sólo transform en los fotogramas de los fondos vivos.
  const fotogramas = [...css.matchAll(/@keyframes\s+(fv-[\w-]+)\s*\{([\s\S]*?)\}\s*\}/g)];
  prueba('tienen sus fotogramas', fotogramas.length >= 3, fotogramas.map(m => m[1]).join());
  prueba('y en ellos sólo se mueve transform', fotogramas.length && fotogramas.every(m => {
    const props = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map(x => x[1]);
    return props.length && props.every(p => p === 'transform');
  }), fotogramas.map(m => m[1] + ': ' + [...m[2].matchAll(/([a-z-]+)\s*:/g)].map(x => x[1]).join('/')).join(' · '));
}

grupo('en el escritorio');
{
  prueba('el dibujo es UNO, fuera del @media del teléfono (styles/fondo-vivo.css, sin media)', /#bgLayer \.fv-a1 \{/.test(cssDibujo) && !/@media \(max-width/.test(cssDibujo) && !/#bgLayer \.fv-a1 \{/.test(leer('styles/mobile-app.css')));
  const dk = leer('styles/desk-shell.css');
  prueba('con uno puesto, los vidrios grandes del escritorio no desenfocan', /body\.dk\.fondo-vivo :is\(#dkMarco, #dkVidrio, #dkHome \.dkh-cf, #dkHome \.dkh-card[^)]*\) \{\s*backdrop-filter: none !important;/.test(dk));
  const html = leer('index.html');
  prueba('el selector del escritorio usa su lista y la miniatura de los animados', /BarStockBackgrounds\.listaEscritorio/.test(html) && /\$\{bg\.anim \? `background:\$\{bg\.mini\};`/.test(html));
  prueba('la hoja carga', /styles\/fondo-vivo\.css\?v=/.test(html));
}

grupo('la miniatura en Settings');
{
  const js = leer('src/mobile-settings.js');
  prueba('un fondo vivo usa su miniatura, no url()', /f\.anim\s*\?/.test(js) && /f\.mini/.test(js));
}

grupo('el orden de carga');
{
  const html = leer('index.html');
  const p = (f) => html.indexOf('src/' + f + '.js?v=');
  prueba('fondo-vivo carga antes que fondo, que lo usa', p('fondo-vivo') > 0 && p('fondo-vivo') < p('fondo'));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
