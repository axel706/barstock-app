#!/usr/bin/env node
/*
 * ── El esperado: la migración 040 ────────────────────────────────────
 *
 * El plan en docs/plan-esperado.md. Lo que esta prueba protege de la
 * base (la SQL se probó además contra un Postgres 16 de verdad el
 * 2026-11-14: cuenta, congelado, renombrar, duplicado, borrado):
 *
 *   1. El esperado vive APARTE: la 040 no toca inventory_items (salvo su
 *      trigger de renombrar), ni inventory_snapshots, ni on_hand.
 *   2. La cuenta vive en un solo sitio: expected y difference los
 *      calcula Postgres a partir de sus piezas.
 *   3. Lo final no se mueve: un trigger lo impide, y renombrar sí pasa.
 *   4. El historial sigue al producto al renombrarlo.
 *   5. Sin borrado desde la app, y el mismo cierre no se guarda dos veces.
 *
 *   node tools/test-esperado.js
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

grupo('1 · la migración 040, aparte de lo contado');
const F = 'database/migrations/040_live_expected.sql';
const sql = fs.existsSync(path.join(RAIZ, F)) ? leer(F) : '';
const c = sql.replace(/--.*$/gm, '');
prueba('existe la 040', !!sql);
prueba('crea live_expected_cycles y live_expected',
  /create table if not exists public\.live_expected_cycles/.test(c) && /create table if not exists public\.live_expected \(/.test(c));
prueba('no escribe en inventory_snapshots', !/inventory_snapshots/.test(c));
prueba('no toca on_hand', !/on_hand/i.test(c));
prueba('en inventory_items sólo el trigger de renombrar',
  (c.match(/inventory_items/g) || []).length === 2 && /after update of item_name on public\.inventory_items/.test(c));

grupo('2 · la cuenta, en un solo sitio');
prueba('expected = contado al abrir + llegó − vendido, calculado por Postgres',
  /expected\s+numeric\s+generated always as \(start_count \+ arrived - sold\) stored/.test(c));
prueba('difference = contado − esperado, calculado por Postgres',
  /difference\s+numeric\s+generated always as \(counted - \(start_count \+ arrived - sold\)\) stored/.test(c));
prueba('lo contado y el precio se COPIAN (un ajuste después no mueve el pasado)',
  /counted\s+numeric\s+not null/.test(c) && /unit_price\s+numeric/.test(c));
prueba('cada ciclo dice qué días de Toast entran', /start_day\s+date\s+not null/.test(c) && /end_day\s+date\s+not null/.test(c));
prueba('y qué no se pudo pasar a botellas', /unconverted\s+jsonb/.test(c));

grupo('3 · lo final no se mueve');
prueba('provisional o final, nada más', /check \(status in \('provisional', 'final'\)\)/.test(c));
const fn = (/function public\.live_expected_congelado\(\)[\s\S]*?\$\$;/.exec(c) || [''])[0];
prueba('un ciclo final no vuelve a provisional', /old\.status = 'final'/.test(fn) && /new\.status <> 'final'/.test(fn));
prueba('sus filas no cambian cantidades', ['start_count', 'arrived', 'sold', 'counted'].every(k => new RegExp('new\\.' + k + ' <> old\\.' + k).test(fn)));
prueba('pero el nombre sí (renombrar)', !/new\.item_name/.test(fn));
prueba('el trigger está puesto en las dos tablas',
  /before update on public\.live_expected\s/.test(c) && /before update on public\.live_expected_cycles/.test(c));

grupo('4 · el historial sigue al producto');
prueba('al renombrar en inventory_items, cambia aquí', /update public\.live_expected set item_name = new\.item_name/.test(c));

grupo('5 · lo que no se puede hacer');
prueba('el mismo cierre no se guarda dos veces', /unique \(location_id, cycle_end\)/.test(c));
prueba('una fila por producto y ciclo', /unique \(cycle_id, item_name\)/.test(c));
prueba('sin política de borrado', !/for delete/.test(c));
prueba('se puede correr dos veces', !/create table public\./.test(c) && (c.match(/drop policy if exists/g) || []).length === 6);

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
