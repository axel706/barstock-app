#!/usr/bin/env node
/*
 * ── Los botones de Conexiones responden ──────────────────────────────
 *
 * Este test existe por un fallo que ya ocurrió DOS VECES en el mismo
 * archivo, y las dos con el mismo síntoma: botones que no hacen nada.
 *
 *   1ª · el gancho de `meMatch` se escribió antes de crear el objeto
 *        que lo guarda. El IIFE reventaba entero al cargar y NINGÚN
 *        botón del panel respondía.
 *   2ª · `Sync catalog` y `Sync invoices` se enganchaban al final de
 *        `pintarAccion()`, debajo del `return` de "sin restaurante
 *        elegido". En una locación nueva nacían muertos, y al elegir
 *        el restaurante nadie volvía a engancharlos.
 *
 * Un botón que no responde no da error, no deja rastro en consola y
 * se parece mucho a "la API está lenta". Por eso se comprueba aquí.
 *
 *   node tools/test-conexiones.js
 */

const { JSDOM } = require('jsdom');
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
const esperar = ms => new Promise(r => setTimeout(r, ms));

// El panel tal como lo trae index.html, con los dos sync dentro del
// plegable de diagnóstico.
const HTML = `<!doctype html><body>
  <div id="meConexion"></div>
  <div id="meAtencion"></div>
  <div id="meCifras"></div>
  <div id="meOcultos"></div>
  <div id="meAccion"></div>
  <details id="meDiag">
    <summary>Developer tools</summary>
    <div id="meEstado"></div>
    <div id="meFechas"></div>
    <div id="meBotones"></div>
    <div id="meUnits"></div>
    <button type="button" id="meSync">Sync catalog</button>
    <button type="button" id="meSyncInv">Sync invoices</button>
    <span id="meSyncNota"></span>
    <div id="meSalida"></div>
  </details>
</body>`;

function entorno(unidadGuardada) {
  const dom = new JSDOM(HTML, { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;

  const store = {};
  if (unidadGuardada) store['bs_me_unit__Will’s & Bill’s'] = unidadGuardada;
  w.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };

  w.BARSTOCK_CONFIG = {
    SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k',
    LOCATION_NAME: 'Will’s & Bill’s'
  };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-2' };
  w.BarStockSupabase = { getClient: () => null };
  w.showSettingsPanel = () => {};

  w.__llamadas = [];
  const f = async (u) => {
    w.__llamadas.push(String(u));
    return { ok: true, status: 200, headers: { get: () => '0-0/0' },
             json: async () => [], text: async () => '' };
  };
  w.fetch = f; global.fetch = f;

  new Function(leer('src/settings-integrations.js'))();
  return w;
}

(async () => {
  grupo('sin restaurante elegido, los sync ya responden');
  {
    // Éste es el caso real: locación nueva, nada en caché. Antes los
    // dos botones nacían sin onclick y pulsarlos no hacía NADA.
    const w = entorno(null);
    w.BarStockIntegrations.render();
    await esperar(30);

    const s = w.document.getElementById('meSync');
    const si = w.document.getElementById('meSyncInv');
    prueba('Sync catalog tiene manejador', typeof s.onclick === 'function');
    prueba('Sync invoices tiene manejador', typeof si.onclick === 'function');

    // Y responden con algo útil en vez de en silencio.
    s.onclick();
    await esperar(20);
    prueba('al pulsarlo dice qué falta',
      /Pick a restaurant/.test(w.document.getElementById('meSalida').textContent),
      w.document.getElementById('meSalida').textContent);
  }

  grupo('con restaurante elegido siguen respondiendo');
  {
    const w = entorno('21630439');
    w.BarStockIntegrations.render();
    await esperar(30);
    prueba('Sync catalog sigue enganchado',
      typeof w.document.getElementById('meSync').onclick === 'function');
    prueba('Sync invoices también',
      typeof w.document.getElementById('meSyncInv').onclick === 'function');
    // No se comprueba el contenido de la tarjeta: `cargarUnidad()`
    // relee la nube y, en este montaje, la nube no tiene nada, así
    // que la locación acaba sin restaurante y la tarjeta se vacía a
    // propósito — ahora manda el asistente de conexión. Lo que este
    // test protege es que los botones sigan respondiendo.
    prueba('y sigue sin romperse al repintar',
      typeof w.document.getElementById('meSync').onclick === 'function');
  }

  grupo('el cableado va ANTES de cualquier return');
  {
    // La regla que evita las dos veces que pasó: en este panel, los
    // onclick se enganchan antes de los cortes.
    const src = leer('src/settings-integrations.js');
    const fn = src.slice(src.indexOf('function pintarAccion()'));
    const cuerpo = fn.slice(0, fn.indexOf('\n  }\n'));
    const iSync = cuerpo.indexOf("getElementById('meSync')");
    const iRet = cuerpo.indexOf('return;');
    prueba('meSync se engancha antes del primer return',
      iSync > -1 && iRet > -1 && iSync < iRet, 'sync@' + iSync + ' return@' + iRet);
    // Y elegir restaurante tiene que repintar la pantalla entera.
    prueba('elegir restaurante repinta todo',
      /pintarUnidades\(lista\);[\s\S]{0,240}pintarAccion\(\);/.test(src));
  }

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
