#!/usr/bin/env node
/*
 * ── El registro de cambios no se queda atrás ─────────────────────────
 *
 * El centro de versiones (More) enseña qué trae cada build, y ese texto
 * lo escribe a mano quien sube la build, en changelog.json. Si se
 * olvida, la tarjeta dice el número nuevo con las notas de otro, o
 * ninguna: justo lo que existe para evitar.
 *
 * Lo que se protege:
 *
 *   1. La primera entrada es la build que lleva index.html. Subir el
 *      sello sin escribir su nota rompe la suite, igual que subir la
 *      app sin subir el sello rompe test-sello.
 *   2. Cada build una vez, de la más nueva a la más vieja.
 *   3. De una a tres líneas por build, cortas: la tarjeta tiene tres
 *      renglones, y esto lo lee el personal del bar, no un programador.
 *   4. El archivo no crece sin fin: la app enseña diez como mucho.
 *
 *   node tools/test-changelog.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}

const MAX_ENTRADAS = 30;
const MAX_LINEAS = 3;
const MAX_LARGO = 60;

console.log('\nel registro de cambios');
let lista = null;
try { lista = JSON.parse(fs.readFileSync(path.join(RAIZ, 'changelog.json'), 'utf8')); }
catch (e) { prueba('changelog.json existe y es JSON', false, e.message); }

if (lista) {
  prueba('es una lista', Array.isArray(lista));
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const m = /id="buildBadge">BUILD-(\d{8}-\d{6})</.exec(html);
  const sello = m && m[1];
  const primera = Array.isArray(lista) && lista[0];
  prueba('la primera entrada es la build de index.html', !!primera && primera.build === sello,
    (primera && primera.build) + ' vs ' + sello + ': escribe la nota de esta build en changelog.json');

  const builds = (lista || []).map(e => e && e.build);
  prueba('cada build con su forma', builds.every(b => /^\d{8}-\d{6}$/.test(String(b))), builds.join(', '));
  prueba('ninguna repetida', new Set(builds).size === builds.length);
  prueba('de la mas nueva a la mas vieja', builds.every((b, i) => i === 0 || builds[i - 1] > b));

  const malas = (lista || []).filter(e => !Array.isArray(e.items) || e.items.length < 1 || e.items.length > MAX_LINEAS ||
    e.items.some(t => typeof t !== 'string' || !t.trim() || t.length > MAX_LARGO));
  prueba('de una a ' + MAX_LINEAS + ' lineas por build, de ' + MAX_LARGO + ' caracteres como mucho',
    malas.length === 0, malas.map(e => e.build).join(', '));
  prueba('no mas de ' + MAX_ENTRADAS + ' entradas', (lista || []).length <= MAX_ENTRADAS, String((lista || []).length));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
