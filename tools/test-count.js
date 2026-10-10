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
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
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

// ── 9 · Como se escriben los tamaños ─────────────────────────────────
console.log('\nformato de los tamaños');
{
  const w2 = montar();
  const CPx = w2.BarStockCountPanel;
  // fmtSize no esta expuesto, asi que se comprueba por lo que se ve.
  const prod = (ml) => ({ item: 'X', bottleSizeMl: ml, bottleShape: 'vodka', onHand: 0 });
  const sub = (ml) => {
    w2.state = { master: [prod(ml)] };
    CPx.open(prod(ml), () => {}, null, null);
    return w2.document.getElementById('cpSub').textContent.split(' · ')[0];
  };
  eq('750 ml', sub(750), '750 ml');
  eq('un litro se escribe 1 L', sub(1000), '1 L');
  eq('la magnum, 1.5 L y no 1500 ml', sub(1500), '1.5 L');
  eq('el handle, 1.75 L', sub(1750), '1.75 L');
  eq('la mini sigue en ml', sub(50), '50 ml');
}

// ── 10 · Preguntar el tamaño al asignar un código nuevo ──────────────
//
// Solo cuando el producto YA tiene otro código: esa es la situación del
// 750 de emergencia. Con el primero no hay nada que elegir.
console.log('\npreguntar el tamaño solo cuando puede cambiar');
(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
                        { pretendToBeVisual: true, url: 'https://x.test/' });
  const w3 = dom.window;
  global.window = w3; global.document = w3.document; global.localStorage = w3.localStorage;
  w3.BARSTOCK_CONFIG = { ACCOUNT_ID: 'acct', LOCATION_NAME: 'Test',
                         SUPABASE_URL: 'https://s.test', SUPABASE_KEY: 'k' };
  let enviado = null;
  global.fetch = w3.fetch = async (u, o) => {
    if (o && o.method === 'POST') enviado = JSON.parse(o.body)[0];
    return { ok: true, status: 200, json: async () => [], text: async () => '' };
  };
  w3.state = { master: [{ item: 'Campari', code: 'CAM', bottleSizeMl: 750,
                          bottleShape: 'vodka', onHand: 0, vendor: 'LOOP' }] };
  w3.eval('var state = window.state');
  for (const f of ['bottle-profiles.js', 'count-session.js', 'count-panel.js', 'scan-count.js']) {
    new w3.Function(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'))();
  }
  const SC = w3.BarStockScanCount;
  const $$ = (id) => w3.document.getElementById(id);
  const esperar = () => new Promise(r => setTimeout(r, 30));
  const elegir = (n) => [...w3.document.querySelectorAll('.sc-pick')]
    .find(x => x.dataset.item === n).click();

  await SC.open();

  SC.__askAssign('0111'); elegir('Campari'); await esperar();
  eq('el primer código no pregunta', enviado.size_ml, null);

  enviado = null;
  SC.__askAssign('0222'); elegir('Campari'); await esperar();
  eq('el segundo sí pregunta',
     $$('scAssign').querySelector('.sc-assign-t').textContent, 'What size is this one?');
  eq('y esconde la búsqueda', $$('scAssignFind').style.display, 'none');
  eq('viene marcado el que se ordena',
     [...w3.document.querySelectorAll('.sc-sz')].find(c => c.classList.contains('on'))
       .textContent.trim(), '750 ml');

  [...w3.document.querySelectorAll('.sc-sz')].find(c => c.dataset.ml === '1500').click();
  ok('avisa de que es otro tamaño',
     $$('scPicks').querySelector('.sc-sz-note').textContent.includes('1.5 L'));
  $$('scSzOk').click(); await esperar();
  eq('guarda el tamaño elegido', enviado.size_ml, 1500);

  enviado = null;
  SC.__askAssign('0333'); elegir('Campari'); await esperar();
  $$('scSzOk').click(); await esperar();
  eq('si coincide con el que ordenas, se guarda null', enviado.size_ml, null);

  SC.__askAssign('0444'); elegir('Campari'); await esperar();
  $$('scAssignX').click();
  eq('atrás vuelve a la lista',
     $$('scAssign').querySelector('.sc-assign-t').textContent, 'Which item is this?');
  ok('y no cierra el panel', $$('scAssign').classList.contains('on'));

  // ── 11 · Corregir el tamaño de un código YA aprendido ───────────────
  //
  // Los códigos de antes de este cambio no tienen tamaño, así que cuentan
  // como la botella que se ordena. "Wrong product?" es el único sitio
  // desde donde se pueden arreglar.
  console.log('\ncorregir el tamaño de un código aprendido');
  {
    const dom2 = new JSDOM('<!doctype html><html><body></body></html>',
                           { pretendToBeVisual: true, url: 'https://x.test/' });
    const w4 = dom2.window;
    global.window = w4; global.document = w4.document; global.localStorage = w4.localStorage;
    w4.BARSTOCK_CONFIG = { ACCOUNT_ID: 'acct', LOCATION_NAME: 'Test',
                           SUPABASE_URL: 'https://s.test', SUPABASE_KEY: 'k' };
    let env = null;
    global.fetch = w4.fetch = async (u, o) => {
      if (o && o.method === 'POST') env = JSON.parse(o.body)[0];
      return { ok: true, status: 200, json: async () => [], text: async () => '' };
    };
    const HEN = { item: "Hendrick's Gin", code: 'HEN', bottleSizeMl: 1000,
                  bottleShape: 'vodka', onHand: 0 };
    w4.state = { master: [HEN] };
    w4.eval('var state = window.state');
    for (const f of ['bottle-profiles.js', 'count-session.js', 'count-panel.js', 'barcode-fix.js']) {
      new w4.Function(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'))();
    }
    let puesto = null;
    w4.BarStockScanCount = { learnedSize: () => null,
                             setLearnedSize: (u, m) => { puesto = [u, m]; } };
    const BF = w4.BarStockBarcodeFix;
    const $$ = (id) => w4.document.getElementById(id);
    const chips = () => [...w4.document.querySelectorAll('.bf-sz')];

    BF.open('0886', HEN, () => {}, null);
    ok('dice con qué tamaño cuenta hoy',
       $$('bfBody').querySelector('.bf-warn').textContent.includes('1 L'));
    eq('viene marcado el del producto',
       chips().find(c => c.classList.contains('on')).textContent.trim(), '1 L');
    ok('no deja guardar sin cambiar nada', $$('bfSaveSize').disabled);
    eq('siguen las otras dos salidas',
       [...w4.document.querySelectorAll('.bf-opt > b')].length, 2);
    ok('y la de olvidar', !!$$('bfForget'));

    chips().find(c => c.dataset.ml === '750').click();
    ok('al elegir otro, deja guardar', !$$('bfSaveSize').disabled);
    $$('bfSaveSize').click();
    await new Promise(r => setTimeout(r, 30));
    eq('guarda el tamaño', env.size_ml, 750);
    eq('y no cambia el producto', env.item_name, "Hendrick's Gin");
    eq('avisa al mapa del escáner', JSON.stringify(puesto), JSON.stringify(['0886', 750]));

    env = null;
    BF.open('0886', HEN, () => {}, 750);
    chips().find(c => c.dataset.ml === '1000').click();
    $$('bfSaveSize').click();
    await new Promise(r => setTimeout(r, 30));
    eq('volver al que ordenas guarda null', env.size_ml, null);
  }

  console.log('\n' + (falla ? falla + ' FALLO(S)' : 'todo bien') + '   ·   ' + pasa + ' comprobaciones');
  process.exit(falla ? 1 : 0);
})();

