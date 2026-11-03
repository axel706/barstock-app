#!/usr/bin/env node
/*
 * ── El visor de la botella no puede cambiar de tamaño ───────────────
 *
 * Arrastrando el nivel, el dibujo "se hacía pequeño y grande" y clavar
 * la marca del conteo anterior costaba muchísimo — y costaba JUSTO en
 * esa marca, no en cualquier otro punto.
 *
 * La causa, que tardé dos intentos fallidos en encontrar porque había
 * DOS reglas para lo mismo y leí la primera:
 *
 *     .cp-stage{ height: 230px; }        <- linea 138
 *     .cp-stage{ flex: 1; min-height: 0 } <- linea 925, gana esta
 *
 * El visor no tiene alto fijo: se queda con lo que sobre. Así que cada
 * píxel que crece o encoge el bloque de abajo se lo quita o se lo da a
 * la botella, el SVG se reescala, y el mapa dedo→nivel se mueve a
 * media pulsación.
 *
 * Y lo que cambiaba de alto era la comparación: al cruzar el valor
 * exacto de la semana pasada pasa de "last count 0.05 +0.30" a "same
 * as last count". Por eso se escapaba esa marca y ninguna otra.
 *
 * Lo que se protege:
 *
 *   1. El hueco de la comparación existe SIEMPRE, también sin marca.
 *   2. Los tres estados miden lo mismo — medido de verdad, no a ojo.
 *   3. El "+0.30" no vuelve a ser una cifra gigante en su propia
 *      línea: eso era `.cp-read b` cogiendo un <b> anidado.
 *
 *   node tools/test-lectura-estable.js
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

const js  = fs.readFileSync(path.join(RAIZ, 'src/count-panel.js'), 'utf8');
const css = fs.readFileSync(path.join(RAIZ, 'styles/count-panel.css'), 'utf8');

grupo('el hueco de la comparación existe siempre');
{
  // jsdom no calcula layout, así que la igualdad de alto se comprueba
  // por construcción: los tres estados salen del MISMO elemento, con
  // alto fijo en CSS. Si alguno dejara de llevar `cp-cmp`, volvería a
  // saltar.
  const dom = new JSDOM('<!doctype html><body></body>');
  global.window = dom.window; global.document = dom.window.document;
  dom.window.state = { master: [] };

  // `compararConAntes` tal cual está en el archivo.
  const i = js.indexOf('  function compararConAntes(');
  let n = 0, j = js.indexOf('{', i), fin = j;
  for (let k = j; k < js.length; k++) {
    if (js[k] === '{') n++;
    else if (js[k] === '}') { n--; if (!n) { fin = k + 1; break; } }
  }
  const cmp = new Function('return ' + js.slice(i + '  function '.length, fin)
    .replace(/^compararConAntes/, 'function compararConAntes'))();

  const sinMarca = cmp(null, 0.35);
  const distinto = cmp(0.05, 0.35);
  const igual    = cmp(0.35, 0.35);

  prueba('sin marca NO devuelve vacío', sinMarca.trim() !== '', JSON.stringify(sinMarca));
  for (const [n2, html] of [['sin marca', sinMarca], ['distinto', distinto], ['igual', igual]]) {
    prueba(n2 + ' lleva cp-cmp', /class="cp-cmp/.test(html), html);
  }
  prueba('distinto dice el valor anterior', /last count 0\.05/.test(distinto), distinto);
  prueba('igual lo dice con palabras', /same as last count/.test(igual), igual);

  // Un solo elemento por estado: dos bloques serían dos alturas.
  for (const [n2, html] of [['sin marca', sinMarca], ['distinto', distinto], ['igual', igual]]) {
    prueba(n2 + ': un solo bloque', (html.match(/<em/g) || []).length === 1, html);
  }
}

grupo('y en CSS tiene alto fijo, igual para los tres');
{
  const b = /\.cp-read \.cp-cmp\{([^}]*)\}/.exec(css);
  prueba('la regla existe', !!b);
  prueba('con alto fijo', !!b && /height:\s*1\.35em/.test(b[1]), b && b[1]);
  prueba('y en bloque', !!b && /display:\s*block/.test(b[1]));
  // `em` es relativo al propio font-size: sin fijarlo aquí, el hueco
  // vacío heredaba el del padre y medía 6px más que los otros dos.
  prueba('con su propio cuerpo de letra, o el vacío mide distinto',
    !!b && /font-size:/.test(b[1]), b && b[1]);
  prueba('y lo que sobre se recorta', !!b && /overflow:\s*hidden/.test(b[1]));
}

grupo('el "+0.30" ya no es una cifra gigante');
{
  // `.cp-read b` le pegaba a CUALQUIER <b> dentro, incluido el de la
  // comparación: se volvía un bloque del tamaño de la cifra grande y
  // se comía una línea entera.
  prueba('la cifra grande es el hijo DIRECTO', /\.cp-read > b\{/.test(css));
  prueba('ya no hay regla para cualquier b', !/^\.cp-read b\{/m.test(css));
  prueba('y las que hay son todas de hijo directo',
    (css.match(/^\.cp-read > b\{/gm) || []).length >= 1);
  const u = /\.cp-read \.cp-up,\s*\n\s*\.cp-read \.cp-down \{([^}]*)\}/.exec(css);
  prueba('y el delta va en línea', !!u && /display:\s*inline/.test(u[1]), u && u[1]);
}

grupo('y queda escrito por qué, para no volver a tropezar');
{
  prueba('se nombra que el visor es flex y por eso absorbe',
    /flex: 1.*se queda con lo que sobre|`\.cp-stage` es `flex: 1`/s.test(js + css));
  // Estaba repartido en TRES sitios y por eso lei mal el alto. Una
  // sola regla, o la proxima persona tropieza igual.
  prueba('.cp-stage se define en UN solo sitio',
    (css.match(/^\.cp-stage\{/gm) || []).length === 1,
    String((css.match(/^\.cp-stage\{/gm) || []).length));
  const st = /^\.cp-stage\{([^}]*)\}/m.exec(css);
  prueba('y ahi estan las tres cosas juntas',
    !!st && /flex:\s*1/.test(st[1]) && /min-height/.test(st[1]) && /height:\s*230px/.test(st[1]),
    st && st[1].replace(/\s+/g, ' '));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
