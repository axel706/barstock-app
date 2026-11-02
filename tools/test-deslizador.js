#!/usr/bin/env node
/*
 * ── El deslizador de la botella abierta ─────────────────────────────
 *
 * Al arrastrar, el dibujo parpadeaba y "se hacía pequeño y grande", y
 * clavar la marca punteada del conteo anterior costaba muchísimo.
 *
 * Tres causas, todas la misma raíz: `paintBottle()` rehacía el
 * `innerHTML` entero en cada `pointermove`.
 *
 *   1. El SVG se destruía y se volvía a parsear 60 veces por segundo
 *      — eso era el parpadeo.
 *   2. El texto de abajo cambiaba de alto —"0.6" a "0.60", y la
 *      comparación apareciendo y desapareciendo al pasar por el valor
 *      exacto de la semana pasada—, así que el bloque se movía.
 *   3. Y `encuadre()` medía esa caja en CADA movimiento, así que el
 *      mapa dedo→nivel se recalculaba bajo el dedo. Perseguías la
 *      marca y la marca se escapaba.
 *
 * Lo que se protege:
 *
 *   1. Arrastrar NO reconstruye el SVG. El mismo nodo, movido.
 *   2. El encuadre se congela al apoyar el dedo.
 *   3. La línea acaba donde tiene que acabar — el arreglo no puede
 *      salir a costa de la precisión.
 *   4. Y el renglón de la comparación reserva su sitio.
 *
 *   node tools/test-deslizador.js
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

const ROW = { item: "Tito's Vodka", code: '2153', vendor: 'LOOP',
              onHand: 2, suggested: 18, bottleSizeMl: 750, bottleShape: '' };

// El visor, con una caja de verdad: jsdom devuelve ceros si no se le
// dice, y entonces `encuadre()` se rinde y no se prueba nada.
const CAJA = { top: 100, left: 0, width: 300, height: 230, bottom: 330, right: 300 };

function panel(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  // count-session.js lee `localStorage` a pelo, sin `window.` delante.
  // En el navegador da igual; aqui el IIFE corre en el global de Node.
  global.localStorage = w.localStorage;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.state = { master: [ROW] };
  w.BarStockToast = { show() {} };
  w.navigator.vibrate = () => {};

  // La sesión de conteo DE VERDAD. Un stub a medias ya me hizo perder
  // un rato aquí, y además es la que decide el paso de redondeo.
  w.BARSTOCK_CONFIG = { ACCOUNT_ID: 'a1', LOCATION_NAME: 'The Crown Tavern' };

  // La marca del conteo anterior vive en la fila, no en la sesión.
  const fila = Object.assign({}, ROW);
  if (opts.antes !== undefined) fila.lastOpens = [opts.antes];
  w.state.master = [fila];

  for (const f of ['src/bottle-profiles.js', 'src/count-session.js',
                   'src/count-panel.js']) {
    new Function(fs.readFileSync(path.join(RAIZ, f), 'utf8'))();
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

  w.BarStockCountPanel.open(fila, () => {}, '0123456789012', 750);

  // Todo elemento del visor devuelve la misma caja.
  const stage = w.document.getElementById('cpStage');
  if (stage) {
    stage.getBoundingClientRect = () => CAJA;
    const svg = stage.querySelector('svg');
    if (svg) svg.getBoundingClientRect = () => CAJA;
  }
  return { w, stage };
}

function tocar(w, stage, tipo, clientY) {
  const ev = new w.Event(tipo, { bubbles: true });
  ev.clientY = clientY; ev.pointerId = 1;
  stage.setPointerCapture = () => {};
  stage.dispatchEvent(ev);
}

(() => {

grupo('el panel abre con su deslizador');
{
  const { w, stage } = panel({ antes: 0.6 });
  prueba('hay visor', !!stage);
  prueba('con el SVG', !!stage.querySelector('svg'));
  prueba('la línea de arrastre', !!w.document.getElementById('cpDrag'));
  prueba('el líquido', !!w.document.getElementById('cpLiquid'));
  prueba('y el tirador', !!w.document.getElementById('cpGrip'));
}

grupo('arrastrar NO reconstruye el dibujo');
{
  // Es lo que causaba el parpadeo. Si el nodo del SVG cambia de
  // identidad, se destruyó y se rehizo.
  const { w, stage } = panel({ antes: 0.6 });
  const svg0 = stage.querySelector('svg');
  const liq0 = w.document.getElementById('cpLiquid');

  tocar(w, stage, 'pointerdown', 200);
  for (let y = 200; y > 140; y -= 4) tocar(w, stage, 'pointermove', y);

  prueba('el SVG es el MISMO nodo', stage.querySelector('svg') === svg0);
  prueba('y el líquido también', w.document.getElementById('cpLiquid') === liq0);
}

grupo('pero la línea sí se mueve');
{
  const { w, stage } = panel({ antes: 0.6 });
  const drag = w.document.getElementById('cpDrag');
  const liq = w.document.getElementById('cpLiquid');
  const grip = w.document.getElementById('cpGrip');

  tocar(w, stage, 'pointerdown', 300);
  const y0 = Number(drag.getAttribute('y1'));
  tocar(w, stage, 'pointermove', 150);
  const y1 = Number(drag.getAttribute('y1'));

  prueba('la línea cambió de sitio', y1 !== y0, y0 + ' → ' + y1);
  prueba('subir el dedo sube el nivel', y1 < y0, y0 + ' → ' + y1);
  prueba('el líquido la sigue', Number(liq.getAttribute('y')) === y1,
    liq.getAttribute('y') + ' vs ' + y1);
  prueba('y el tirador también', Number(grip.getAttribute('y')) === y1 - 10,
    grip.getAttribute('y'));
  prueba('la cifra se actualiza',
    Number(w.document.getElementById('cpFrac').textContent) > 0,
    w.document.getElementById('cpFrac').textContent);
}

grupo('el encuadre se congela al apoyar el dedo');
{
  // Lo que hacía imposible clavar la marca: el layout se movía a
  // media pulsación y con él el mapa dedo→nivel. Aquí se simula ese
  // movimiento y el resultado no puede cambiar por eso.
  const a = panel({ antes: 0.6 });
  tocar(a.w, a.stage, 'pointerdown', 300);
  tocar(a.w, a.stage, 'pointermove', 180);
  const sinMover = a.w.document.getElementById('cpFrac').textContent;

  const b = panel({ antes: 0.6 });
  tocar(b.w, b.stage, 'pointerdown', 300);
  // La caja se desplaza 40px a media pulsación.
  const movida = Object.assign({}, CAJA, { top: 140, bottom: 370 });
  b.stage.getBoundingClientRect = () => movida;
  b.stage.querySelector('svg').getBoundingClientRect = () => movida;
  tocar(b.w, b.stage, 'pointermove', 180);
  const conMovida = b.w.document.getElementById('cpFrac').textContent;

  prueba('el resultado es el mismo', sinMover === conMovida,
    sinMover + ' vs ' + conMovida);
}

grupo('y la precisión no se perdió por el camino');
{
  // Arriba del todo es lleno, abajo del todo es vacío. Si el arreglo
  // hubiera roto el mapa, esto se vería aquí.
  const { w, stage } = panel({});
  tocar(w, stage, 'pointerdown', 1000);   // muy por debajo
  prueba('abajo del todo, vacío',
    Number(w.document.getElementById('cpFrac').textContent) === 0,
    w.document.getElementById('cpFrac').textContent);

  tocar(w, stage, 'pointerup', 1000);
  tocar(w, stage, 'pointerdown', -1000);  // muy por encima
  prueba('arriba del todo, lleno',
    Number(w.document.getElementById('cpFrac').textContent) >= 0.99,
    w.document.getElementById('cpFrac').textContent);
}

grupo('la marca del conteo anterior sigue ahí');
{
  const { w } = panel({ antes: 0.6 });
  prueba('se dibuja la punteada', !!w.document.querySelector('.cp-lastline'));
  prueba('y se dice cuánto había', /last count|same as last/.test(
    w.document.getElementById('cpCmp').textContent),
    w.document.getElementById('cpCmp').textContent);
}
{
  const { w } = panel({});
  prueba('sin conteo anterior, no se inventa', !w.document.querySelector('.cp-lastline'));
}

grupo('el renglón de la comparación reserva su sitio');
{
  // Al pasar por el valor exacto de la semana pasada el texto cambia
  // de "last count 0.60 −0.05" a "same as last count". Sin sitio
  // reservado eso movía el dibujo justo donde querías pararte.
  const css = fs.readFileSync(path.join(RAIZ, 'styles/count-panel.css'), 'utf8');
  prueba('tiene alto mínimo', /#cpCmp\{[^}]*min-height/.test(css));
}

grupo('y no vuelve a repintarse entero al arrastrar');
{
  const src = fs.readFileSync(path.join(RAIZ, 'src/count-panel.js'), 'utf8');
  const i = src.indexOf('const move = (clientY)');
  const j = src.indexOf('stage.addEventListener', i);
  const dentro = src.slice(i, j);
  prueba('move() usa el camino barato', /moverLinea\(\)/.test(dentro), dentro.slice(-200));
  prueba('y sólo cae a paintBottle si falta algo',
    /if \(!moverLinea\(\)\) paintBottle\(\)/.test(dentro));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
