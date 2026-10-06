#!/usr/bin/env node
/*
 * ── Pruebas del conteo ───────────────────────────────────────────────
 *
 * Monta la sesión y el panel en un DOM de verdad y comprueba lo que de
 * otra forma solo se puede ver contando botellas a mano.
 *
 * Vive en el repo y no en /tmp porque las pruebas que se borran entre
 * sesiones no son pruebas: la primera vez que hizo falta una regresión,
 * no estaban.
 *
 *   npm i jsdom           (una vez)
 *   node tools/test-count.js
 *
 * Lo que cubre, en el orden en que fueron apareciendo los bugs:
 *
 *   · sumar pasadas en vez de reemplazarlas  (0.5 del closet se perdía)
 *   · corregir y borrar una pasada
 *   · el contador de selladas escrito a mano
 *   · formatos distintos del mismo producto  (1.5 + 1.5 ≠ 3)
 */

const path = require('path');
const fs = require('fs');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  try { ({ JSDOM } = require('/tmp/node_modules/jsdom')); }
  catch (e2) { console.error('Falta jsdom:  npm i jsdom'); process.exit(2); }
}

const RAIZ = path.join(__dirname, '..');

let pasa = 0, falla = 0;
function ok(nombre, cond, detalle) {
  if (cond) { pasa++; console.log('  ok   ' + nombre); }
  else { falla++; console.log('  MAL  ' + nombre + (detalle ? '   → ' + detalle : '')); }
}
function eq(nombre, got, esperado) {
  ok(nombre, got === esperado, 'dio ' + JSON.stringify(got) + ', esperaba ' + JSON.stringify(esperado));
}
function casi(nombre, got, esperado, tol) {
  ok(nombre, Math.abs(got - esperado) <= (tol || 1e-6),
     'dio ' + got + ', esperaba ' + esperado);
}

function montar() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
                        { pretendToBeVisual: true, url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  global.localStorage = w.localStorage; global.confirm = () => true;
  w.BARSTOCK_CONFIG = { ACCOUNT_ID: 'test', LOCATION_NAME: 'Test' };
  w.state = { master: [] };
  global.fetch = w.fetch = async () => ({ ok: true });
  for (const f of ['bottle-profiles.js', 'count-session.js', 'count-panel.js']) {
    new w.Function(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'))();
  }
  return w;
}

const w = montar();
const S = w.BarStockCountSession, CP = w.BarStockCountPanel;
const $ = (id) => w.document.getElementById(id);

// ── 1 · Sumar pasadas ────────────────────────────────────────────────
//
// Contar el mismo producto en el closet y en la barra tiene que SUMAR.
// Antes el panel abría con lo del closet puesto como valores editables y
// ajustarlos a la botella que se tenía delante borraba lo anterior.
console.log('\nsumar pasadas');
const TIT = { item: "Tito's", bottleSizeMl: 750, bottleShape: 'vodka', onHand: 3 };
w.state.master = [TIT];
S.clear('Test');
S.addPass(TIT.item, 1, [0.5]);
S.addPass(TIT.item, 2, [0.7]);
casi('closet 1.5 + barra 2.7 = 4.2', S.bottlesFor(TIT.item, 750), 4.2, 1e-9);
eq('quedan dos pasadas', S.passesOf(TIT.item).length, 2);
S.addPass(TIT.item, 0, []);
eq('una pasada vacía no se guarda', S.passesOf(TIT.item).length, 2);

// ── 2 · El panel abre en blanco ──────────────────────────────────────
console.log('\nel panel no carga lo ya contado');
CP.open(TIT, () => {}, '0123');
eq('contador en cero', $('cpSealed').value, '0');
eq('el total es el del artículo', $('cpTotal').textContent, '4.2');
eq('dice cuántos escaneos hay', $('cpPasses').textContent.trim(), '2 scans');
ok('el total es una puerta', $('cpTotalBtn').classList.contains('cp-total-on'));

// ── 3 · Corregir y cancelar ──────────────────────────────────────────
console.log('\ncorregir una pasada');
$('cpTotalBtn').click();
w.document.querySelector('[data-fix="0"]').click();
eq('carga la pasada guardada', $('cpSealed').value, '1');
eq('el botón reemplaza, no suma', $('cpNextTxt').textContent, 'Save');
ok('se pinta distinto', $('cpPanel').classList.contains('cp-fixing-on'));
$('cpTotalBtn').click();
eq('la hoja ofrece marcha atrás', $('cpSheetX').textContent, 'Cancel fix');
$('cpSheetX').click();
eq('cancelar vuelve a sumar', $('cpNextTxt').textContent, 'Next');
eq('y no toca lo guardado', S.passesOf(TIT.item).length, 2);

// ── 4 · Borrar ───────────────────────────────────────────────────────
console.log('\nborrar');
CP.open(TIT, () => {}, '0123');
$('cpTotalBtn').click();
w.document.querySelector('[data-del="1"]').click();
casi('borrada la segunda queda 1.5', S.bottlesFor(TIT.item, 750), 1.5, 1e-9);
$('cpTotalBtn').click();
w.document.querySelector('[data-del="0"]').click();
eq('sin pasadas, vuelve a NO contado', S.has(TIT.item), false);

// ── 5 · El contador se escribe ───────────────────────────────────────
//
// Con el vodka de la casa son 20 y pico de toques al +.
console.log('\nel contador de selladas');
S.clear('Test');
CP.open(TIT, () => {}, '0123');
const teclear = (t) => {
  const el = $('cpSealed');
  el.focus(); el.value = t;
  el.dispatchEvent(new w.Event('input'));
};
teclear('24');  eq('teclear 24', $('cpTotal').textContent, '24');
teclear('1-2'); eq('fuera los guiones del teclado de iOS', $('cpSealed').value, '12');
teclear('999999'); eq('el tope se aplica al campo', $('cpSealed').value, '9999');
teclear('3');
$('cpSealed').value = '31';
$('cpSealed').dispatchEvent(new w.Event('input'));
eq('no se pisa mientras escribes', $('cpSealed').value, '31');

// ── 6 · Formatos distintos ───────────────────────────────────────────
//
// Hendrick's se ordena en litro. Se acaba, alguien trae un 750 de la
// tienda, y ese 750 tiene su propio código. 1.5 + 1.5 no son 3.
console.log('\nformatos distintos del mismo producto');
const HEN = { item: "Hendrick's Gin", bottleSizeMl: 1000, bottleShape: 'vodka', onHand: 0 };
w.state.master = [HEN];
S.clear('Test');
S.addPass(HEN.item, 1, [0.5], null);   // el del litro
S.addPass(HEN.item, 1, [0.5], 750);    // el de emergencia
eq('suma en mililitros', S.mlFor(HEN.item, 1000), 2625);
casi('on_hand en botellas de litro', S.bottlesFor(HEN.item, 1000), 2.625, 1e-9);
ok('y NO son 3', Math.abs(S.bottlesFor(HEN.item, 1000) - 3) > 0.3);

CP.open(HEN, () => {}, '0449', 750);
eq('el total sale en equivalentes', $('cpTotal').textContent, '2.63');
eq('y enseña los mililitros', $('cpMl').textContent, '2,625 ml');
ok('marca el formato que no es el que se ordena',
   $('cpSub').innerHTML.includes('cp-otro'));
$('cpTotalBtn').click();
const tallas = [...w.document.querySelectorAll('.cp-pass-sz')].map(e => e.textContent.trim());
eq('el desglose dice el tamaño de cada escaneo', tallas.join(' · '), '1 L · 750 ml');

// ── 7 · Sin mezcla no cambia nada ────────────────────────────────────
console.log('\nsin mezcla, igual que siempre');
const VOD = { item: 'House Vodka', bottleSizeMl: 1750, bottleShape: 'vodka', onHand: 0 };
w.state.master = [VOD];
S.clear('Test');
S.addPass(VOD.item, 2, [0.25], null);
casi('on_hand', S.bottlesFor(VOD.item, 1750), 2.25, 1e-9);
CP.open(VOD, () => {}, '1', null);
eq('los mililitros ni aparecen', $('cpMl').textContent, '');

// ── 8 · Sesiones del formato viejo ───────────────────────────────────
console.log('\npasadas sin tamaño, de antes del cambio');
S.clear('Test');
S.addPass('Viejo', 1, [0.5], null);
casi('usan el tamaño del producto', S.bottlesFor('Viejo', 750), 1.5, 1e-9);

console.log('\n' + (falla ? falla + ' FALLO(S)' : 'todo bien') + '   ·   ' + pasa + ' comprobaciones');
process.exit(falla ? 1 : 0);
