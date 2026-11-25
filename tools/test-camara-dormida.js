#!/usr/bin/env node
/*
 * ── La cámara sólo corre mientras puede leer ─────────────────────────
 *
 * Axel, 2026-11-23: contando por nombre "el dispositivo empieza a
 * calentarse aun cuando no se está usando". El escáner abría la cámara
 * a 1920×1080 al entrar y no la soltaba hasta cerrar: buscar por nombre
 * o tener abierto el panel de una botella sólo paraba la LECTURA
 * (stopLoop), y la cámara seguía capturando detrás. Una noche de conteo
 * era una noche de cámara encendida.
 *
 * Lo acordado sobre lámina ("Count without the camera", parte común a A
 * y B), lo que se protege:
 *
 *   1. Al abrir el escáner, la cámara se enciende (como siempre).
 *   2. "Find by name" la APAGA (sus pistas paradas), y al volver se
 *      enciende otra vez.
 *   3. El panel de una botella también la apaga, y al cerrarlo vuelve.
 *      Igual Finish count.
 *   4. 30 s sin leer nada: se duerme (apagada) y el visor dice "Tap to
 *      scan"; tocarlo la enciende.
 *   5. Leer un código reinicia esos 30 s.
 *   6. Cerrar el escáner la apaga y no queda ningún sueño pendiente.
 *
 *   node tools/test-camara-dormida.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d !== undefined ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { pretendToBeVisual: true, url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document; global.localStorage = w.localStorage;
  w.BARSTOCK_CONFIG = { ACCOUNT_ID: 'acct', LOCATION_NAME: 'Test', SUPABASE_URL: 'https://s.test', SUPABASE_KEY: 'k' };
  global.fetch = w.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => '' });
  w.state = { master: [{ item: 'Campari', code: 'CAM', bottleSizeMl: 750, bottleShape: 'vodka', onHand: 0, vendor: 'LOOP' }] };
  w.eval('var state = window.state');

  // Una cámara de mentira que lleva la cuenta de sus pistas vivas.
  const pistas = [];
  let pedidas = 0;
  Object.defineProperty(w, 'isSecureContext', { value: true });
  Object.defineProperty(w.navigator, 'mediaDevices', { value: {
    getUserMedia: async () => {
      pedidas++;
      const t = { vivo: true, stop() { this.vivo = false; }, getSettings: () => ({ width: 1920, height: 1080 }),
                  getCapabilities: () => ({}), applyConstraints: async () => {} };
      pistas.push(t);
      return { getTracks: () => [t], getVideoTracks: () => [t] };
    } } });
  // El módulo corre con los globales de Node (new w.Function), y Node
  // trae su propio `navigator`: sin esto mira el de Node, que no tiene
  // cámara, y la prueba no llegaría nunca a encenderla.
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
  w.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  // Los temporizadores largos se apuntan: el de 30 s es el sueño.
  // Los de Node: el módulo corre con los globales de Node, como el navigator.
  const largos = [];
  const st0 = globalThis.setTimeout, ct0 = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => {
    if (ms >= 20000) { const id = { largo: true }; largos.push({ id, ms, fn }); return id; }   // no se dispara solo: la prueba lo llama
    return st0(fn, ms, ...a);
  };
  globalThis.clearTimeout = (id) => {
    const i = largos.findIndex(x => x.id === id);
    if (i >= 0) largos.splice(i, 1); else ct0(id);
  };

  let alCerrarPanel = null;
  for (const f of ['bottle-profiles.js', 'count-session.js', 'count-panel.js', 'scan-count.js']) {
    new w.Function(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'))();
  }
  // El panel de conteo se sustituye: sólo importa que abre y cierra.
  w.BarStockCountPanel.open = (row, cb) => { alCerrarPanel = cb; };
  w.BarStockCountFinish = { open: (cb) => { alCerrarPanel = cb; } };

  const SC = w.BarStockScanCount;
  const $ = (id) => w.document.getElementById(id);
  const vivas = () => pistas.filter(t => t.vivo).length;
  const esperar = () => new Promise(r => st0(r, 30));
  const suenos = () => largos.filter(x => x.ms === 30000);

  grupo('al abrir, la cámara se enciende');
  await SC.open(); await esperar();
  prueba('una pista viva', vivas() === 1, vivas());
  prueba('y queda armado el sueño de 30 s', suenos().length === 1, largos.map(x => x.ms).join(','));

  grupo('"Find by name" la apaga, y al volver se enciende');
  $('scFind').click(); await esperar();
  prueba('buscando por nombre: ninguna pista viva', vivas() === 0, vivas());
  prueba('y sin sueño pendiente', suenos().length === 0);
  $('scAssignX').click(); await esperar();
  prueba('de vuelta al visor: una viva', vivas() === 1, vivas());

  grupo('el panel de una botella también');
  $('scFind').click(); await esperar();
  [...w.document.querySelectorAll('.sc-pick')].find(x => x.dataset.item === 'Campari').click(); await esperar();
  prueba('con el panel abierto: apagada', vivas() === 0, vivas());
  alCerrarPanel && alCerrarPanel(); await esperar();
  prueba('al cerrar el panel: encendida', vivas() === 1, vivas());

  grupo('y Finish count');
  $('scFinish').click(); await esperar();
  prueba('con Finish count abierto: apagada', vivas() === 0, vivas());
  alCerrarPanel && alCerrarPanel(); await esperar();
  prueba('al volver: encendida', vivas() === 1, vivas());

  grupo('30 s sin leer: se duerme, y un toque la despierta');
  const s = suenos();
  prueba('hay un sueño de 30 s armado', s.length === 1);
  if (s[0]) { s[0].fn(); await esperar(); }
  prueba('dormida: ninguna pista viva', vivas() === 0, vivas());
  const btn = $('scDormida');
  prueba('el visor dice "Tap to scan"', !!btn && /Tap to scan/.test(btn.textContent) && $('scStage').classList.contains('sc-zzz'));
  const antes = pedidas;
  btn && btn.click(); await esperar();
  prueba('tocarlo la enciende', vivas() === 1 && pedidas === antes + 1, vivas());
  prueba('y ya no está dormida', !$('scStage').classList.contains('sc-zzz'));

  grupo('leer un código reinicia los 30 s');
  const id0 = suenos()[0] && suenos()[0].id;
  SC.__leido && SC.__leido();
  prueba('el sueño se vuelve a armar', suenos().length === 1 && suenos()[0].id !== id0);
  {
    // __leido es armarSueno; lo que importa es que una lectura de verdad
    // (onHit) lo llame.
    const src = fs.readFileSync(path.join(RAIZ, 'src/scan-count.js'), 'utf8');
    const i = src.indexOf('function onHit('), j = src.indexOf('\n  }\n', i);
    prueba('y onHit lo llama al leer', i > 0 && /armarSueno\(\)/.test(src.slice(i, j)));
  }

  grupo('cerrar el escáner la apaga del todo');
  SC.close(); await esperar();
  prueba('ninguna pista viva', vivas() === 0, vivas());
  prueba('y ningún sueño pendiente', suenos().length === 0);

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
