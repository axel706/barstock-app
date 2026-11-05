#!/usr/bin/env node
/*
 * ── El sello del build no se queda atrás ─────────────────────────────
 *
 * `index.html` lleva un BUILD-AAAAMMDD-HHMMSS (hora de Nueva York) para
 * que Axel sepa qué versión está viendo. Es texto fijo y se pone a mano.
 * Durante días nadie lo tocó: producción enseñaba un build del 3 de
 * noviembre con cambios de días después, y así no había forma de saber
 * si el teléfono tenía la versión nueva.
 *
 * Lo que se protege: que el último commit que tocó la app no sea
 * bastante MÁS NUEVO que el sello. Si lo es, alguien hizo un commit sin
 * subir el sello.
 *
 * El margen existe porque el sello se pone antes de hacer el commit: en
 * el propio commit que lo sube, el sello es unos minutos más viejo que
 * el commit. Un olvido de verdad son horas o días.
 *
 * Sin git delante (una copia sin historial) no hay nada que comparar y
 * se dice, en vez de fallar.
 *
 *   node tools/test-sello.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}

const MARGEN_MIN = 120;

// AAAAMMDD-HHMMSS en Nueva York → instante. Se busca el desfase de esa
// fecha (horario de verano o no) con Intl, en vez de suponerlo.
function aInstante(sello) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(sello);
  if (!m) return null;
  const comoUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(comoUtc));
  const v = (t) => Number(partes.find(p => p.type === t).value);
  const nyComoUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'), v('second'));
  return comoUtc + (comoUtc - nyComoUtc);
}

console.log('\nel sello del build');
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const m = /id="buildBadge">BUILD-(\d{8}-\d{6})</.exec(html);
prueba('existe y tiene la forma de siempre', !!m, m ? m[1] : 'no encontrado');

let ultimo = null;
try {
  ultimo = Number(execSync('git log -1 --format=%ct -- src styles lib api index.html',
    { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()) * 1000 || null;
} catch (e) {}

if (m && ultimo) {
  const sello = aInstante(m[1]);
  const atras = Math.round((ultimo - sello) / 60000);
  prueba('no se queda atras del ultimo commit de la app', atras <= MARGEN_MIN,
    'el ultimo commit que toco la app es ' + atras + ' min mas nuevo que el sello: sube BUILD- en index.html');
} else if (m) {
  console.log('  --   sin historial de git: no hay commit con que comparar');
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
