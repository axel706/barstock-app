#!/usr/bin/env node
/*
 * ── Reiniciar el ciclo sin dos preguntas encimadas ───────────────────
 *
 * Reiniciar el ciclo pone a cero TODO el on hand y no tiene vuelta
 * atrás, así que se pregunta dos veces. En el teléfono, la segunda era
 * un confirm() del navegador que salía ENCIMA del diálogo de la app:
 * blanco, con otra tipografía, apilado sobre el primero.
 *
 * Lo que se protege:
 *
 *   1. El diálogo de la app hace los dos pasos en la MISMA caja, y sólo
 *      dice que sí cuando se confirma el último. Ni un Enter se salta el
 *      segundo.
 *   2. En el teléfono, resetOnHand no usa nunca el confirm() del
 *      navegador. En el escritorio, sí: allí no se cambió.
 *   3. Quien ya preguntó lo dice (`yaConfirmado`) y no se vuelve a
 *      preguntar.
 *   4. "Start over" promete "On hand stays where it is", pero por
 *      debajo pone todo a cero. Sólo se salta la pregunta si de verdad
 *      ya está todo a cero.
 *
 *   node tools/test-reinicio.js
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
const esperar = ms => new Promise(r => setTimeout(r, ms || 0));

function dom() {
  const d = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = d.window;
  global.window = w; global.document = w.document;
  new Function(fs.readFileSync(path.join(RAIZ, 'src/dialog.js'), 'utf8'))();
  return w;
}

// Una función del código tal cual está escrita, sacada por sus llaves.
function sacar(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('no encuentro ' + firma);
  let n = 0, fin = -1;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (!n) { fin = k + 1; break; } }
  }
  return src.slice(i, fin);
}

(async () => {

grupo('dos pasos en la misma caja');
{
  const w = dom();
  let respuesta = 'pendiente';
  w.BarStockDialog.confirmar({
    titulo: 'Restart the cycle?', ok: 'Restart', peligro: true,
    luego: { titulo: 'Are you sure?', ok: 'Reset to 0' }
  }).then(v => { respuesta = v; });
  await esperar();
  const bg = w.document.getElementById('dlgBg');
  prueba('empieza en el primero', /Restart the cycle\?/.test(bg.textContent));
  prueba('con los dos puntos, el primero encendido',
    bg.querySelectorAll('.dlg-pasos i').length === 2 && bg.querySelector('.dlg-pasos i').classList.contains('on'));

  bg.querySelector('#dlgSi').click();
  await esperar();
  prueba('el botón no contesta: pasa al segundo', respuesta === 'pendiente', String(respuesta));
  prueba('en la MISMA caja', w.document.querySelectorAll('#dlgBg').length === 1 &&
    /Are you sure\?/.test(bg.textContent) && !/Restart the cycle/.test(bg.textContent), bg.textContent.slice(0, 80));
  prueba('con su botón', bg.querySelector('#dlgSi').textContent.trim() === 'Reset to 0');
  prueba('y hereda el rojo de peligro', !!bg.querySelector('.dlg-modal.peligro'));

  bg.querySelector('#dlgSi').click();
  await esperar();
  prueba('confirmar el segundo dice que sí', respuesta === true, String(respuesta));
  prueba('y se cierra', bg.classList.contains('hidden'));
}
{
  const w = dom();
  let respuesta = 'pendiente';
  w.BarStockDialog.confirmar({ titulo: 'A', luego: { titulo: 'B', ok: 'Go' } }).then(v => { respuesta = v; });
  await esperar();
  const bg = w.document.getElementById('dlgBg');
  bg.querySelector('#dlgSi').click();
  await esperar();
  bg.querySelector('#dlgNo').click();
  await esperar();
  prueba('cancelar en el segundo dice que no', respuesta === false, String(respuesta));
}
{
  // Enter era "sí". Con dos pasos no puede saltarse el segundo.
  const w = dom();
  let respuesta = 'pendiente';
  w.BarStockDialog.confirmar({ titulo: 'A', luego: { titulo: 'B', ok: 'Go' } }).then(v => { respuesta = v; });
  await esperar();
  const enter = () => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  enter(); await esperar();
  prueba('un Enter pasa al segundo, no contesta', respuesta === 'pendiente' &&
    /B/.test(w.document.getElementById('dlgBg').textContent), String(respuesta));
  enter(); await esperar();
  prueba('el segundo Enter si', respuesta === true, String(respuesta));
}
{
  const w = dom();
  let respuesta = 'pendiente';
  w.BarStockDialog.confirmar({ titulo: 'Solo uno', ok: 'OK' }).then(v => { respuesta = v; });
  await esperar();
  const bg = w.document.getElementById('dlgBg');
  prueba('sin luego, no hay puntos', !bg.querySelector('.dlg-pasos'));
  bg.querySelector('#dlgSi').click(); await esperar();
  prueba('y contesta a la primera, como siempre', respuesta === true);
}

grupo('resetOnHand no usa el confirm() del navegador en el telefono');
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const fuente = sacar(html, 'async function resetOnHand(');
async function correr(o) {
  const w = dom();
  w.__nativo = 0; w.__dialogo = 0; w.__nube = 0;
  const confirmNativo = () => { w.__nativo++; return o.respuesta !== false; };
  if (o.movil) w.BarStockMobile = { montado: () => true };
  w.BarStockDialog.confirmar = async () => { w.__dialogo++; return o.respuesta !== false; };
  const state = { master: [{ item: 'A', onHand: 3, suggested: 2 }] };
  const cloud = {
    resetOnHandForItems: async () => { w.__nube++; },
    clearAllOrderOverrides: async () => {}, touchWeeklyReset: async () => {}
  };
  w.BarStockInventoryCloud = cloud;
  const f = new Function('state', 'confirm', 'computeToOrder', 'saveState', 'render', 'setStatus', 'alert',
    'compareSelection', 'window', fuente + '\nreturn resetOnHand;')(
    state, confirmNativo, () => 0, () => {}, () => {}, () => {}, () => {}, [], w);
  await f(o.opc);
  return w;
}
{
  const w = await correr({ movil: true });
  prueba('en el telefono pregunta con el dialogo de la app', w.__dialogo === 1, String(w.__dialogo));
  prueba('y no con el del navegador', w.__nativo === 0, String(w.__nativo));
  prueba('y si se confirma, pone a cero', w.__nube === 1);
}
{
  const w = await correr({ movil: true, respuesta: false });
  prueba('si se cancela, no toca nada', w.__nube === 0);
}
{
  const w = await correr({ movil: true, opc: { yaConfirmado: true } });
  prueba('si ya se pregunto, no vuelve a preguntar', w.__dialogo === 0 && w.__nativo === 0,
    w.__dialogo + ' / ' + w.__nativo);
  prueba('y pone a cero', w.__nube === 1);
}
{
  const w = await correr({ movil: false });
  prueba('en el escritorio, la alerta de siempre', w.__nativo === 1 && w.__dialogo === 0,
    w.__nativo + ' / ' + w.__dialogo);
}

grupo('"Start over" solo se salta la pregunta si de verdad esta todo a cero');
{
  const wc = fs.readFileSync(path.join(RAIZ, 'src/weekly-cycle.js'), 'utf8');
  const f = sacar(wc, 'async function empezarDeNuevo(');
  const probar = (onHands) => {
    let recibido = null;
    const window = { state: { master: onHands.map((h, i) => ({ item: 'i' + i, onHand: h })) } };
    const reiniciar = async (opc) => { recibido = opc; };
    return new Function('window', 'reiniciar', f + '\nreturn empezarDeNuevo;')(window, reiniciar)()
      .then(() => recibido);
  };
  const cero = await probar([0, 0, '', null]);
  prueba('con todo a cero, sin mas preguntas', cero && cero.yaConfirmado === true, JSON.stringify(cero));
  // Lo que el diálogo prometía ("stays where it is") sería mentira: se
  // pregunta, con el diálogo de la app, que dice que va a cero.
  const no = await probar([0, 4, 0]);
  prueba('con algo contado, resetOnHand vuelve a preguntar', no && no.yaConfirmado === false, JSON.stringify(no));
}

grupo('quien llama dice lo que ya pregunto');
{
  const home = fs.readFileSync(path.join(RAIZ, 'src/mobile-home.js'), 'utf8');
  const r = sacar(home, 'async function reiniciar(');
  prueba('Restart cycle pregunta en dos pasos', /luego:\s*\{/.test(r));
  prueba('y avisa de que ya esta confirmado', /W\.reiniciar\(\{\s*yaConfirmado:\s*true\s*\}\)/.test(r));
  const cyc = fs.readFileSync(path.join(RAIZ, 'src/mobile-cycle.js'), 'utf8');
  prueba('Start over del Home pasa por empezarDeNuevo', /W\.empezarDeNuevo\(\)/.test(sacar(home, 'async function empezarDeNuevo(')));
  prueba('y el de la pantalla del ciclo tambien', /w\.empezarDeNuevo\(\)/.test(cyc));
  const wc = fs.readFileSync(path.join(RAIZ, 'src/weekly-cycle.js'), 'utf8');
  prueba('el ciclo lo exporta', /reiniciar, empezarDeNuevo, descartarConteo/.test(wc));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
