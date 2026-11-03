#!/usr/bin/env node
/*
 * ── El asa de las hojas tiene que agarrar ───────────────────────────
 *
 * Las hojas de la app llevan un asa dibujada arriba. El asa dice
 * "arrástrame para cerrar", y no había nada detrás: al intentarlo, el
 * dedo movía la pantalla de atrás, que además no debería moverse
 * nunca con una hoja abierta.
 *
 * Una afordancia que miente es peor que no tener asa.
 *
 * Lo que se protege:
 *
 *   1. Arrastrar hacia abajo lo suficiente, cierra.
 *   2. Un roce corto NO cierra: desplazar una lista larga no puede
 *      tirarte la hoja.
 *   3. Un manotazo rápido también cierra aunque sea corto.
 *   4. Con la caja desplazada hacia abajo, tirar NO cierra: ahí lo que
 *      quieres es volver al principio de la ficha.
 *   5. El fondo no se mueve.
 *   6. Y lo enganchan LAS CUATRO pantallas que abren hojas, no una.
 *
 *   node tools/test-hojas.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = ms => new Promise(r => setTimeout(r, ms || 0));

// o: { alto, scroll }  — alto de contenido y cuánto está desplazada
function hoja(o) {
  o = o || {};
  const dom = new JSDOM(`<!doctype html><body>
    <div class="m-sheet" id="mSheet">
      <div class="m-sheet-bg"></div>
      <div class="m-sheet-box"><div class="m-sheet-grip"></div><p>contenido</p></div>
    </div></body>`);
  const w = dom.window;
  global.window = w; global.document = w.document;
  new Function(fs.readFileSync(path.join(RAIZ, 'src/sheet.js'), 'utf8'))();

  const h = w.document.getElementById('mSheet');
  const caja = h.querySelector('.m-sheet-box');
  // jsdom no hace layout: se declaran a mano.
  Object.defineProperty(caja, 'scrollTop', { value: o.scroll || 0, writable: true });
  Object.defineProperty(caja, 'scrollHeight', { value: o.alto || 300, writable: true });
  Object.defineProperty(caja, 'clientHeight', { value: 300, writable: true });

  w.__cerrado = 0;
  w.BarStockSheet.enganchar(h, () => { w.__cerrado++; h.remove(); });
  return { w, h, caja };
}

function toca(el, tipo, y) {
  const w = el.ownerDocument.defaultView;
  const e = new w.Event(tipo, { bubbles: true, cancelable: true });
  e.touches = [{ clientY: y }];
  e.target = el;
  el.dispatchEvent(e);
  return e;
}

// Un arrastre completo, con su duración.
async function arrastrar(caja, desde, hasta, ms) {
  toca(caja, 'touchstart', desde);
  toca(caja, 'touchmove', hasta);
  if (ms) await esperar(ms);
  toca(caja, 'touchend', hasta);
  await esperar(300);   // la animación de salida y su tope
}

(async () => {

grupo('arrastrar hacia abajo cierra');
{
  const { w, caja } = hoja();
  await arrastrar(caja, 100, 300, 0);   // 200px, de sobra
  prueba('se cerró', w.__cerrado === 1, String(w.__cerrado));
  prueba('y la hoja se fue del DOM', !w.document.getElementById('mSheet'));
}

grupo('pero un roce no');
{
  // Desplazar una lista larga no puede tirarte la hoja.
  const { w, caja } = hoja();
  await arrastrar(caja, 100, 140, 400);   // 40px y despacio
  prueba('sigue abierta', w.__cerrado === 0, String(w.__cerrado));
  prueba('y vuelve a su sitio', caja.style.transform === '', caja.style.transform);
}

grupo('un manotazo corto y rápido, sí');
{
  // 70px no llegan al umbral, pero a esa velocidad la intención es
  // inequívoca.
  const { w, caja } = hoja();
  toca(caja, 'touchstart', 100);
  toca(caja, 'touchmove', 170);
  toca(caja, 'touchend', 170);     // sin esperar: milisegundos
  await esperar(300);
  prueba('se cerró', w.__cerrado === 1, String(w.__cerrado));
}

grupo('hacia arriba no pasa nada');
{
  const { w, caja } = hoja();
  await arrastrar(caja, 300, 100, 0);
  prueba('no se cierra', w.__cerrado === 0);
  prueba('ni se estira', caja.style.transform === '' || caja.style.transform === 'none',
    caja.style.transform);
}

grupo('leyendo a media ficha, tirar NO cierra');
{
  // Con la caja desplazada, lo que quieres es volver arriba.
  const { w, caja } = hoja({ scroll: 120, alto: 900 });
  await arrastrar(caja, 100, 320, 0);
  prueba('sigue abierta', w.__cerrado === 0, String(w.__cerrado));
}

grupo('y el fondo no se mueve');
{
  const { h, caja } = hoja({ alto: 200 });   // contenido que NO desborda
  const fuera = toca(h.querySelector('.m-sheet-bg'), 'touchmove', 200);
  prueba('fuera de la caja, el gesto se cancela', fuera.defaultPrevented);

  const dentro = toca(caja, 'touchmove', 200);
  prueba('y dentro tambien si no hay nada que desplazar',
    dentro.defaultPrevented);
}
{
  const { caja } = hoja({ alto: 900 });   // contenido largo
  // Aquí sí se deja desplazar: el gesto es de la caja.
  toca(caja, 'touchstart', 100);
  const e = toca(caja, 'touchmove', 90);  // hacia ARRIBA, o sea leer
  prueba('con contenido largo, desplazar funciona', !e.defaultPrevented);
}

grupo('lo enganchan las cuatro pantallas que abren hojas');
{
  for (const f of ['mobile-search', 'mobile-inventory', 'mobile-home', 'mobile-history']) {
    const src = fs.readFileSync(path.join(RAIZ, 'src/' + f + '.js'), 'utf8');
    const n = (src.match(/BarStockSheet\.enganchar/g) || []).length;
    const hojas = (src.match(/document\.body\.appendChild\((?:h|hoja|hoja_)\)/g) || []).length;
    prueba(f + ': ' + n + ' de ' + hojas + ' hojas', n === hojas && n > 0, n + ' vs ' + hojas);
  }
}

grupo('y se carga antes que quien lo usa');
{
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const p = (f) => html.indexOf(f);
  prueba('sheet.js existe en el index', p('src/sheet.js') !== -1);
  for (const f of ['mobile-search', 'mobile-inventory', 'mobile-home', 'mobile-history']) {
    prueba('antes que ' + f, p('src/sheet.js') < p('src/' + f + '.js'));
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
