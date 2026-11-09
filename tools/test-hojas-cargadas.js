#!/usr/bin/env node
/*
 * ── Que cada hoja de estilos siga cargada ───────────────────────────
 *
 * 2026-11-09: al subir el ?v= de mobile-app.css, un sed se comió la
 * línea entera del <link> en index.html. Se vio a ojo en el diff antes
 * del commit. Ninguna prueba lo habría cazado: el teléfono se habría
 * quedado sin estilos y las 108 suites en verde.
 *
 * Lo que se protege:
 *   1. Cada hoja de styles/ se carga en index.html, y una sola vez (dos
 *      veces con versiones distintas haría que mandara la segunda).
 *   2. Cada hoja que index.html carga existe en styles/.
 *
 *   node tools/test-hojas-cargadas.js
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}

const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '');   // un <link> comentado no carga nada
const enlazadas = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="styles\/([^"?]+)(\?[^"]*)?"/g)].map(m => m[1]);
const hojas = fs.readdirSync(path.join(RAIZ, 'styles')).filter(f => /\.css$/.test(f));

console.log('\ncada hoja de styles/ se carga, una vez');
const faltan = hojas.filter(f => !enlazadas.includes(f));
prueba('no falta ninguna', faltan.length === 0, faltan.join(', '));
const dobles = enlazadas.filter((f, i) => enlazadas.indexOf(f) !== i);
prueba('ninguna dos veces', dobles.length === 0, dobles.join(', '));
prueba('la del teléfono, en concreto', enlazadas.includes('mobile-app.css'));

console.log('\ncada hoja que se carga existe');
const fantasmas = enlazadas.filter(f => !hojas.includes(f));
prueba('ninguna apunta a un archivo que no está', fantasmas.length === 0, fantasmas.join(', '));

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
