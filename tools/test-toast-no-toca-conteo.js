#!/usr/bin/env node
/*
 * ── Nada de Toast toca el conteo ─────────────────────────────────────
 *
 * Axel, 2026-11-11, antes de mandar el motor a producción: "el conteo,
 * los datos actuales es lo que me preocupa, porque al final del día todo
 * esto va a requerir prueba y error". El "deberías tener" es un número
 * aparte que se calcula al vuelo: nunca se guarda en el conteo. Este test
 * hace que eso no dependa del cuidado de quien escriba la próxima pieza.
 *
 * Revisa TODO lo de Toast (las piezas de la app, las del servidor y la
 * herramienta de consola; las que se añadan con "toast" en el nombre
 * entran solas) y falla si alguna:
 *   1. escribe (POST, PATCH, PUT, DELETE, upsert) en una tabla del
 *      conteo: inventory_items, inventory_snapshots, count_sessions,
 *      cycle_periods, inventory_backups, item_barcodes, o en locations
 *      (ahí viven la apertura del ciclo y el conteo activo);
 *   2. llama a lo que escribe el inventario o abre un ciclo
 *      (replaceInventoryMaster, saveSnapshot, runCycle,
 *      marcarCicloAbierto, touchWeeklyReset...);
 *   3. asigna onHand / on_hand.
 * Leer sí puede: lo contado es el punto de partida del estimado.
 *
 *   node tools/test-toast-no-toca-conteo.js
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}

// src/toast.js son los avisos de la app (BarStockToast), no Toast el
// sistema de ventas: no entra.
const ARCHIVOS = [
  ...fs.readdirSync(path.join(RAIZ, 'src')).filter(f => /^(mobile-)?toast-.*\.js$/.test(f)).map(f => 'src/' + f),
  'src/bottle-search.js', 'src/dev-panel.js',
  ...fs.readdirSync(path.join(RAIZ, 'lib')).filter(f => /^toast.*\.js$/.test(f)).map(f => 'lib/' + f),
  'tools/toast.js'
];
// Para comprobar el propio test: `node tools/test-toast-no-toca-conteo.js archivo.js`
// revisa sólo ese archivo.
const lista = process.argv[2] ? [process.argv[2]] : ARCHIVOS;

const TABLAS = ['inventory_items', 'inventory_snapshots', 'count_sessions', 'cycle_periods', 'inventory_backups', 'item_barcodes', 'locations'];
const FUNCIONES = ['replaceInventoryMaster', 'updateInventoryItem', 'createInventoryItem', 'deleteInventoryItem', 'resetInventory',
  'saveSnapshot', 'completeSnapshot', 'runCycle', 'marcarCicloAbierto', 'touchWeeklyReset', 'rebuildPlacedOrdersFromHistory'];
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

prueba('revisa las piezas de Toast que hay', lista.length >= 10 || !!process.argv[2], lista.join(', '));

for (const f of lista) {
  const s = sinComentarios(fs.readFileSync(path.resolve(RAIZ, f), 'utf8'));
  const problemas = [];
  for (const t of TABLAS) {
    let i = -1;
    while ((i = s.indexOf(t, i + 1)) >= 0) {
      // La sentencia de la petición: desde el nombre de la tabla hasta el
      // cierre de la llamada. Si en ella hay un método que escribe, es una
      // escritura a esa tabla.
      const tramo = s.slice(i, i + 400).split(/\)\s*;/)[0];
      if (/method\s*:\s*['"`](POST|PATCH|PUT|DELETE)['"`]|\.(insert|update|upsert|delete)\s*\(/i.test(tramo)) problemas.push('escribe en ' + t);
    }
    if (new RegExp("\\.from\\(\\s*['\"`]" + t + "['\"`]\\s*\\)[\\s\\S]{0,200}?\\.(insert|update|upsert|delete)\\s*\\(").test(s)) problemas.push('escribe en ' + t + ' (cliente)');
  }
  for (const fn of FUNCIONES) if (new RegExp('\\b' + fn + '\\s*\\(').test(s)) problemas.push('llama a ' + fn);
  if (/\.onHand\s*=[^=]|\bon_hand\s*:/.test(s)) problemas.push('asigna onHand / on_hand');
  prueba(f + ': no toca el conteo', !problemas.length, [...new Set(problemas)].join(', '));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
