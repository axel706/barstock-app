#!/usr/bin/env node
/*
 * ── Las recetas de Crown (migración 029) ─────────────────────────────
 *
 * Las recetas salen de las hojas de Axel y de sus respuestas
 * (2026-11-10 y 11). Lo que se protege:
 *   1. Ninguna línea nace con botella: la elige una persona en la app.
 *      Un LIKE no sabe si "Triage" es la vodka, la de vainilla o la de
 *      naranja.
 *   2. Una receta sin líneas lleva `pending`: "no se sabe" nunca puede
 *      leerse como "no gasta nada".
 *   3. Las onzas son positivas y los modificadores (Martini, Cosmo…)
 *      llevan el licor que elige el cliente.
 *   4. Los cócteles de Toast que tienen receta en la hoja están todos,
 *      con el nombre que usa Toast ("Tito's + Berries", no "Vodka Soda").
 *   5. Correrla dos veces no pisa nada (on conflict do nothing).
 *
 *   node tools/test-recetas.js
 */
const fs = require('fs');
const path = require('path');
const SQL = fs.readFileSync(path.join(__dirname, '..', 'database/migrations/029_toast_recipes.sql'), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}

const m = /\$recetas\$([\s\S]*?)\$recetas\$/.exec(SQL);
let R = [];
try { R = JSON.parse(m[1]); } catch (e) { prueba('el bloque de recetas es JSON válido', false, e.message); }
prueba('hay recetas', R.length > 30, R.length);

const lineas = R.flatMap(r => (r.lines || []).map(l => ({ r, l })));
prueba('ninguna línea trae botella', lineas.every(({ l }) => !l[2] || !('item_name' in l[2])) && !/item_name\s*=|insert into[^;]*item_name/i.test(SQL));
prueba('onzas positivas', lineas.every(({ l }) => typeof l[1] === 'number' && l[1] > 0),
  lineas.filter(({ l }) => !(l[1] > 0)).map(({ r }) => r.toast).join(','));
prueba('sin líneas = pending', R.every(r => (r.lines || []).length || r.pending),
  R.filter(r => !(r.lines || []).length && !r.pending).map(r => r.toast).join(','));
prueba('con pending no hay líneas a medias', R.every(r => !r.pending || !(r.lines || []).length));
prueba('cada modificador lleva el licor del cliente',
  R.filter(r => r.tipo === 'modifier').every(r => r.lines.some(l => l[2] && l[2].chosen)));
prueba('el licor del cliente sólo en modificadores',
  lineas.every(({ r, l }) => !(l[2] && l[2].chosen) || r.tipo === 'modifier'));
prueba('sin repetidos', new Set(R.map(r => r.tipo + '|' + r.toast)).size === R.length);

// Los de Toast (DRINKS › Cocktails y HAPPY HOUR › HH Liquor, del día que
// pegó Axel) que tienen receta en la hoja.
const TOAST = ['Thai Basil Gimlet', 'Golden Vesper', 'Honey & Fig Margarita', 'Hugo 75', 'Rosemary Negroni',
  'Proper Perry', 'Her Majesty', 'Blood Orange Cosmo', 'Wimbledon Cup', 'Mustique Margarita', 'Smoky Old Fashioned',
  "Tito's + Berries", 'Pistachio Martini', "S'mores Martini", 'Seasonal Espresso Martini', 'Espresso Martini',
  'Hugo Spritz', 'HH Cosmopolitan', 'HH Vodka Martini', 'HH Gin Martini', 'HH Titos Martini',
  'HH Lemon Drop Martini', 'HH House Manhattan', 'HH Espresso Martini', 'Vodka', 'Gin'];
const con = new Set(R.filter(r => r.tipo === 'cocktail' && r.lines.length).map(r => r.toast));
prueba('los de Toast con receta, por su nombre de Toast', TOAST.every(t => con.has(t)), TOAST.filter(t => !con.has(t)).join(','));
prueba('"Vodka Soda" va como "Tito\'s + Berries"', !R.some(r => r.toast === 'Vodka Soda'));

const esp = R.find(r => r.toast === 'Espresso Martini');
prueba('Espresso Martini: Dark no lleva Baileys', !!esp && esp.lines.some(l => /baileys/i.test(l[0]) && l[2] && (l[2].not_with || []).includes('Dark')));
const mt = R.find(r => r.tipo === 'modifier' && r.toast === 'Martini');
prueba('Martini: Dirty no lleva vermouth', !!mt && mt.lines.some(l => /vermouth/i.test(l[0]) && l[2] && (l[2].not_with || []).includes('Dirty')));

prueba('se puede correr dos veces', /on conflict \(location_id, tipo, toast_name\) do nothing/.test(SQL) && /if rid is null then continue/.test(SQL));
prueba('sólo en la locación de Toast, una', /if n <> 1 then\s+raise exception/.test(SQL));

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
