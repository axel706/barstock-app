#!/usr/bin/env node
/*
 * ── El panel de TripleSeat en Connections ────────────────────────────
 *
 * Existe porque la fase 1 de TripleSeat se hizo pegando código en la
 * consola: un bloque para definir la función, otra línea por pregunta,
 * y Axel copiando la salida a mano y revisando que no llevara datos de
 * clientes. MarginEdge tenía un panel con botones desde el principio;
 * TripleSeat no, y la pregunta justa fue por qué.
 *
 * Lo que se protege:
 *
 *   1. Cada botón pregunta a la función con la sesión, y con la acción
 *      que dice.
 *   2. Las fechas y el id del evento salen de las cajas, y las fechas
 *      ya vienen puestas (hoy y dentro de 14 días).
 *   3. Después de buscar, el id del primer evento queda puesto para
 *      Menu, para no tener que copiarlo.
 *   4. Lo que llega se ve: la ruta, los registros, las páginas. Los
 *      ejemplos crudos llevan datos de clientes y van PLEGADOS.
 *   5. Un fallo se ve en pantalla. Un botón que no responde se parece
 *      demasiado a "la API está lenta".
 *   6. Un botón copia el resultado sin tener que seleccionarlo, y lo que
 *      copia NUNCA lleva los ejemplos crudos: es lo que se pega en una
 *      conversación.
 *   7. Está en index.html, después del módulo de MarginEdge, y sólo se
 *      dibuja al abrir su plegable.
 *
 *   node tools/test-tripleseat-panel.js
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

const INDEX = leer('index.html');

// El plegable tal como lo trae index.html.
function sacarPanel() {
  const i = INDEX.indexOf('<details id="tsDiag"');
  if (i < 0) return null;
  return INDEX.slice(i, INDEX.indexOf('</details>', i) + '</details>'.length);
}

function entorno(contesta) {
  const panel = sacarPanel() || '<details id="tsDiag"></details>';
  const dom = new JSDOM('<!doctype html><body>' + panel + '</body>', { url: 'https://x.test/', runScripts: 'outside-only' });
  const w = dom.window;
  w.BarStockSupabase = { getClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok-sesion' } } }) } }) };
  w.__copiado = null;
  Object.defineProperty(w.navigator, 'clipboard', { configurable: true,
    value: { writeText: async (t) => { w.__copiado = t; } } });
  w.console.error = () => {};   // el fallo a propósito no ensucia la salida
  w.__llamadas = [];
  w.fetch = async (u, op) => {
    const cuerpo = JSON.parse((op && op.body) || '{}');
    w.__llamadas.push({ url: u, auth: op && op.headers && op.headers.Authorization, cuerpo });
    const r = contesta ? contesta(cuerpo) : { ok: true, accion: cuerpo.action };
    if (r instanceof Error) throw r;
    return { json: async () => r };
  };
  try { w.eval(leer('src/tripleseat-panel.js')); } catch (e) { console.log('  (no carga: ' + e.message + ')'); }
  return w;
}

function abrir(w) {
  const d = w.document.getElementById('tsDiag');
  d.open = true;
  d.dispatchEvent(new w.Event('toggle'));
}
const boton = (w, a) => w.document.querySelector('[data-ts="' + a + '"]');
const salida = w => (w.document.getElementById('tsSalida') || {}).textContent || '';

(async () => {

grupo('esta en index.html');
{
  prueba('el plegable, dentro de Connections', (() => {
    const i = INDEX.indexOf('id="settingsPanel-integrations"');
    const j = INDEX.indexOf('<details id="tsDiag"');
    const k = INDEX.indexOf('id="settingsPanel-mePurchases"');
    return i > 0 && j > i && j < k;
  })());
  const s = INDEX.indexOf('src/settings-integrations.js');
  const t = INDEX.indexOf('src/tripleseat-panel.js?v=');
  prueba('el script, con su version y despues de MarginEdge', t > s && s > 0, String(t));
}

grupo('solo se dibuja al abrirlo');
{
  const w = entorno();
  prueba('cerrado, sin botones', !boton(w, 'ping'));
  abrir(w);
  const acciones = ['ping', 'locations', 'events', 'search', 'menu', 'bookings'];
  prueba('abierto, un boton por accion', acciones.every(a => boton(w, a)),
    acciones.filter(a => !boton(w, a)).join(','));
  const hoy = new Date();
  const desde = w.document.getElementById('tsDesde'), hasta = w.document.getElementById('tsHasta');
  const dias = desde && hasta ? Math.round((new Date(hasta.value) - new Date(desde.value)) / 86400000) : null;
  prueba('las fechas ya vienen puestas, dos semanas', dias === 14, desde && desde.value + ' → ' + (hasta && hasta.value));
  abrir(w);
  prueba('abrirlo dos veces no duplica', w.document.querySelectorAll('[data-ts="ping"]').length === 1);
}

grupo('cada boton pregunta con la sesion');
{
  const w = entorno();
  abrir(w);
  (boton(w, 'ping') || { click() {} }).click();
  await esperar(20);
  const l = w.__llamadas[0] || {};
  prueba('a la funcion de integraciones', l.url === '/api/integrations?provider=tripleseat', l.url);
  prueba('con la sesion', l.auth === 'Bearer tok-sesion', l.auth);
  prueba('con la accion del boton', l.cuerpo && l.cuerpo.action === 'ping', JSON.stringify(l.cuerpo));
}
{
  const w = entorno(c => c.action === 'search'
    ? { ok: true, accion: 'search', ruta: '/v1/events/search.json', registros: 50, envoltorio: { total_pages: 2 },
        intentos: [{ ruta: '/v1/events/search.json', status: 200, registros: 50 }],
        campos: { status: { DEFINITE: 38 } }, bebidas: { conLinea: 9, paquetes: { 'Consumption bar': 9 } }, forma: { contact: { tipo: 'objeto', veces: 50, claves: ['email'] } },
        muestra: JSON.stringify([{ id: 4321, contact: { first_name: 'Clienta' } }]) }
    : c.action === 'events' ? { ok: true, accion: 'events', registros: 2, eventosConBebida: [777, 778],
        muestra: JSON.stringify([{ id: 4321 }]) }
    : { ok: true, accion: c.action, registros: 0 });
  abrir(w);
  w.document.getElementById('tsDesde').value = '2026-11-05';
  w.document.getElementById('tsHasta').value = '2026-11-19';
  (boton(w, 'search') || { click() {} }).click();
  await esperar(20);
  const c = (w.__llamadas[0] || {}).cuerpo || {};
  prueba('search lleva las fechas de las cajas', c.params && c.params.event_start_date === '2026-11-05' &&
    c.params.event_end_date === '2026-11-19', JSON.stringify(c));
  const txt = salida(w);
  prueba('se ve la ruta, los registros y las paginas', /search\.json/.test(txt) && /50/.test(txt) && /2 pages/.test(txt), txt.slice(0, 200));
  prueba('y los valores por campo', /DEFINITE/.test(txt));
  prueba('y el resumen del bar', /Bar packages/.test(txt) && /Consumption bar/.test(txt), txt.slice(0, 300));
  const crudo = w.document.querySelector('#tsSalida details');
  prueba('los ejemplos crudos van plegados', crudo && !crudo.open && /Clienta/.test(crudo.textContent));
  const id = w.document.getElementById('tsEvento');
  prueba('el id del primer evento queda puesto para Menu', id && id.value === '4321', id && id.value);
  (boton(w, 'menu') || { click() {} }).click();
  await esperar(20);
  const m = (w.__llamadas[1] || {}).cuerpo || {};
  prueba('y menu lo manda', m.action === 'menu' && m.params && String(m.params.event_id) === '4321', JSON.stringify(m));
}

grupo('el evento para Menu, mejor uno con bebida');
{
  const w = entorno(() => ({ ok: true, accion: 'events', registros: 2, eventosConBebida: [777, 778],
    muestra: JSON.stringify([{ id: 4321 }]) }));
  abrir(w);
  (boton(w, 'events') || { click() {} }).click();
  await esperar(20);
  const id = w.document.getElementById('tsEvento');
  prueba('pone el primero con Beverage, no el primero de la lista', id && id.value === '777', id && id.value);
}

grupo('copiar sin seleccionar');
{
  const w = entorno(() => ({ ok: true, accion: 'search', ruta: '/v1/events/search.json', registros: 50,
    envoltorio: { total_pages: 2 }, bebidas: { conLinea: 9, paquetes: { 'Consumption bar': 9 } },
    personalizados: { evento: { 'Bar Package': { veces: 3, valores: { 'Open bar': 3 } } } },
    campos: { status: { DEFINITE: 38 } }, forma: { contact: { tipo: 'objeto', veces: 50, claves: ['email'] } },
    muestra: JSON.stringify([{ id: 4321, contact: { first_name: 'Clienta', email: 'c@cliente.test' } }]) }));
  abrir(w);
  (boton(w, 'search') || { click() {} }).click();
  await esperar(20);
  const todo = w.document.querySelector('#tsSalida [data-copiar="todo"]');
  prueba('hay un boton para copiar el resultado', !!todo);
  if (todo) todo.click();
  await esperar(20);
  const c = w.__copiado || '';
  prueba('copia lo de arriba', /Consumption bar/.test(c) && /DEFINITE/.test(c) && /search\.json/.test(c) && /total_pages/.test(c), c.slice(0, 200));
  prueba('y nunca los ejemplos crudos', !/Clienta|c@cliente/.test(c), c);
  prueba('con los campos personalizados', /Bar Package/.test(c), c.slice(0, 300));
  prueba('que tambien se ven', /Custom fields/.test(salida(w)));
  prueba('dice que lo copio', /Copied/.test(todo ? todo.textContent : ''), todo && todo.textContent);
  const uno = w.document.querySelector('#tsSalida [data-copiar="bebidas"]');
  prueba('y cada bloque tiene el suyo', !!uno);
  if (uno) uno.click();
  await esperar(20);
  const c2 = w.__copiado || '';
  prueba('que copia solo ese bloque', /Consumption bar/.test(c2) && !/DEFINITE/.test(c2), c2);
  prueba('los ejemplos crudos no tienen boton de copiar', !w.document.querySelector('#tsSalida .ts-crudo [data-copiar]'));
}

grupo('un fallo se ve');
{
  const w = entorno(() => ({ ok: false, accion: 'events', error: 'Ninguna ruta contestó bien.',
    intentos: [{ ruta: '/v1/events.json', status: 404 }] }));
  abrir(w);
  (boton(w, 'events') || { click() {} }).click();
  await esperar(20);
  const txt = salida(w);
  prueba('lo que dijo la funcion', /Ninguna ruta/.test(txt) && /404/.test(txt), txt);
}
{
  const w = entorno(() => new Error('red caida'));
  abrir(w);
  (boton(w, 'locations') || { click() {} }).click();
  await esperar(20);
  prueba('y si revienta el navegador, tambien', /red caida/.test(salida(w)), salida(w));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
