#!/usr/bin/env node
/*
 * ── Toast · Developer tools, en Settings → Connections ──────────────
 *
 * Axel, 2026-11-10: "¿la única forma de probarlo es en consola?". Lo era:
 * las ventas en dinero (acción sales) y cómo cuenta Toast los tragos
 * (drinks) sólo se podían ver pegando código en la consola del
 * ordenador. Y para ligar las recetas de los cócteles hace falta ver los
 * nombres exactos de los artículos y los modificadores de Toast, desde
 * el teléfono. Eligió verlo "desde la app".
 *
 * Es el mismo patrón que el panel de TripleSeat (src/tripleseat-panel.js),
 * con la llamada y el copiar sacados a src/dev-panel.js para no tener
 * dos copias.
 *
 * Lo que se protege:
 *   1. Sólo lee. Las acciones salen de una lista cerrada y `sync`, la
 *      única de Toast que escribe, no está en ella.
 *   2. El dinero se enseña como dinero, con su total, y dice si el día
 *      sigue abierto, si no se leyó entero o si hubo líneas sin precio:
 *      un número a medias no se da por el total.
 *   3. Un fallo enseña lo que dijo Toast, no una suposición.
 *   4. Lo que se copia sale de una lista cerrada de claves.
 *   5. Un fallo dentro del botón no lo deja muerto.
 *
 *   node tools/test-toast-panel.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const INDEX = leer('index.html');
const existe = f => fs.existsSync(path.join(RAIZ, f));

function entorno(contesta) {
  const w = new JSDOM('<!doctype html><body><div id="settingsPanel-integrations">' +
    '<details id="toastDiag"><summary>Toast · Developer tools</summary>' +
    '<div id="tpCajas"></div><div id="tpBotones"></div><div id="tpSalida"></div></details></div></body>',
    { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.BarStockSupabase = { getClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok-sesion' } } }) } }) };
  w.__copiado = null;
  Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { w.__copiado = t; } } });
  w.console.error = () => {};
  w.__llamadas = [];
  w.fetch = async (u, op) => {
    const cuerpo = JSON.parse((op && op.body) || '{}');
    w.__llamadas.push({ url: u, metodo: op && op.method, auth: op && op.headers && op.headers.Authorization, cuerpo });
    const r = contesta ? contesta(cuerpo) : { ok: true, accion: cuerpo.action };
    if (r instanceof Error) throw r;
    return { json: async () => r };
  };
  for (const f of ['src/dev-panel.js', 'src/toast-panel.js']) {
    if (!existe(f)) continue;
    try { w.eval(leer(f)); } catch (e) { console.log('  (no carga ' + f + ': ' + e.message + ')'); }
  }
  return w;
}
function abrir(w) {
  const d = w.document.getElementById('toastDiag');
  d.open = true;
  d.dispatchEvent(new w.Event('toggle'));
}
const boton = (w, a) => w.document.querySelector('[data-tp="' + a + '"]');
const salida = w => ((w.document.getElementById('tpSalida') || {}).textContent || '').replace(/\s+/g, ' ');
async function pulsar(w, a) { const b = boton(w, a); if (b) b.click(); await esperar(20); }

const VENTAS = {
  ok: true, accion: 'sales', businessDate: '20261111', ordenes: 87, diaCompleto: true, cerrado: false, categoriasDeVenta: 6,
  porCategoria: [
    { categoria: 'Food', lineas: 120, unidades: 131, bruto: 2410.5, descuentos: 60, neto: 2350.5, impuesto: 208.6, modificadores: 44, sinPrecio: 0 },
    { categoria: 'Liquor', lineas: 58, unidades: 64, bruto: 1240, descuentos: 36, neto: 1204, impuesto: 106.85, modificadores: 30, sinPrecio: 0 }
  ],
  total: { lineas: 178, unidades: 195, bruto: 3650.5, descuentos: 96, neto: 3554.5, impuesto: 315.45, modificadores: 74, sinPrecio: 0 }
};

(async () => {

grupo('está en index.html');
{
  const i = INDEX.indexOf('id="settingsPanel-integrations"');
  const j = INDEX.indexOf('<details id="toastDiag"');
  const k = INDEX.indexOf('id="settingsPanel-toastWine"');
  prueba('el plegable, dentro de Connections', i > 0 && j > i && j < k, [i, j, k].join(','));
  const d = INDEX.indexOf('src/dev-panel.js?v='), t = INDEX.indexOf('src/toast-panel.js?v='), s = INDEX.indexOf('src/tripleseat-panel.js?v=');
  prueba('lo compartido carga antes que los dos paneles', d > 0 && d < t && d < s, [d, t, s].join(','));
}

grupo('lo compartido no está escrito dos veces');
{
  const ts = leer('src/tripleseat-panel.js');
  const tp = existe('src/toast-panel.js') ? leer('src/toast-panel.js') : '';
  prueba('el panel de TripleSeat usa la llamada y el copiar comunes', /BarStockDevPanel/.test(ts) && !/execCommand/.test(ts));
  prueba('y el de Toast también', /BarStockDevPanel/.test(tp) && !/execCommand/.test(tp) && !/auth\.getSession/.test(tp));
}

grupo('sólo se dibuja al abrirlo, y sólo lee');
{
  const w = entorno();
  prueba('cerrado, sin botones', !boton(w, 'sales'));
  abrir(w);
  prueba('abierto: Ping, Sales y Drinks', !!boton(w, 'ping') && !!boton(w, 'sales') && !!boton(w, 'drinks'));
  // Para traer Will's & Bill's (2026-11-12): qué restaurantes abre el login.
  prueba('y Restaurants', !!boton(w, 'restaurants'));
  // Un GUID opcional para preguntar por otro restaurante (W&B).
  const rg = w.document.getElementById('tpRest');
  prueba('un campo para el GUID de otro restaurante, vacío', !!rg && rg.value === '');
  prueba('sin botón para sync, que es la que escribe', !boton(w, 'sync') && !/sync/i.test((w.document.getElementById('tpBotones') || {}).innerHTML || ''));
  const f = w.document.getElementById('tpFecha');
  const hoy = new Date(), p = n => String(n).padStart(2, '0');
  prueba('la fecha arranca en hoy', !!f && f.value === hoy.getFullYear() + '-' + p(hoy.getMonth() + 1) + '-' + p(hoy.getDate()), f && f.value);

  for (const a of ['ping', 'sales', 'drinks']) await pulsar(w, a);
  prueba('sin GUID, no se manda ninguno', w.__llamadas.every(l => !('restaurante' in ((l.cuerpo || {}).params || {}))));
  prueba('todo va a la función de integraciones, por Toast', w.__llamadas.length === 3 &&
    w.__llamadas.every(l => /\/api\/integrations\?provider=toast$/.test(l.url) && l.auth === 'Bearer tok-sesion'),
    JSON.stringify(w.__llamadas.map(l => l.url)));
  prueba('y ninguna acción es sync', w.__llamadas.every(l => ['ping', 'sales', 'drinks'].includes(l.cuerpo.action)),
    w.__llamadas.map(l => l.cuerpo.action).join(','));
  w.document.getElementById('tpRest').value = ' 11111111-2222-3333-4444-555555555555 ';
  const antes = w.__llamadas.length;
  await pulsar(w, 'sales'); await pulsar(w, 'ping');
  const [ls, lp] = w.__llamadas.slice(antes);
  prueba('con GUID, Sales lo manda (sin espacios)', ls && ls.cuerpo.params.restaurante === '11111111-2222-3333-4444-555555555555', JSON.stringify(ls && ls.cuerpo));
  prueba('Ping no: sólo prueba el login', lp && !('restaurante' in (lp.cuerpo.params || {})));
  w.__llamadas.splice(antes);
  // Aunque alguien llame a mano con otra acción: no sale de la lista.
  let pasada = false;
  try { await w.BarStockToastPanel.correr('sync'); } catch (e) {}
  pasada = w.__llamadas.some(l => l.cuerpo.action === 'sync');
  prueba('ni pidiéndola a mano', !pasada);
}

grupo('Sales: el dinero del día, por categoría');
{
  const w = entorno((c) => (c.action === 'sales' ? VENTAS : { ok: true }));
  abrir(w);
  w.document.getElementById('tpFecha').value = '2026-11-11';
  w.document.getElementById('tpCategoria').value = 'liquor';
  await pulsar(w, 'sales');
  const l = w.__llamadas[0] || { cuerpo: {} };
  prueba('pide el día de la caja, como lo quiere Toast', l.cuerpo.params && l.cuerpo.params.businessDate === '20261111', JSON.stringify(l.cuerpo.params));
  prueba('y la categoría escrita', l.cuerpo.params && l.cuerpo.params.categoria === 'liquor');
  const t = salida(w);
  prueba('una fila por categoría', /Liquor/.test(t) && /Food/.test(t));
  prueba('el dinero como dinero', /\$1,204\.00/.test(t) && /\$1,240\.00/.test(t) && /\$36\.00/.test(t), t.slice(0, 300));
  prueba('con el total del día', /Total/.test(t) && /\$3,554\.50/.test(t));
  prueba('y dice que el día sigue abierto', /still open/i.test(t));
  const filas = w.document.querySelectorAll('#tpSalida table tbody tr');
  prueba('en una tabla', filas.length === 2, String(filas.length));
}
{
  const w = entorno(() => Object.assign({}, VENTAS, { cerrado: true, diaCompleto: false,
    total: Object.assign({}, VENTAS.total, { sinPrecio: 3 }) }));
  abrir(w); await pulsar(w, 'sales');
  const t = salida(w);
  prueba('un día sin leer entero se dice: no es el total', /not the full day/i.test(t), t.slice(0, 200));
  prueba('y las líneas sin precio también', /3 lines came without a price/i.test(t));
  prueba('cerrado: no dice que sigue abierto', !/still open/i.test(t));
}

grupo('Drinks: cómo llama Toast a cada trago y a sus modificadores');
{
  const w = entorno(() => ({ ok: true, accion: 'drinks', businessDate: '20261111', ordenes: 87, diaCompleto: true,
    porCategoria: [{ categoria: 'Liquor', lineas: 40, unidades: 44, articulosDistintos: 2, articulos: [
      { nombre: "Tito's", unidades: 30, grupo: 'DRINKS › Vodka', modificadores: ['Double ×6', 'Rocks ×4'] },
      { nombre: 'HH Martini', unidades: 14, grupo: 'HAPPY HOUR › HH Cocktails', modificadores: ['Triage ×9', 'Dirty ×5'] }] }] }));
  abrir(w); await pulsar(w, 'drinks');
  const t = salida(w);
  prueba('el nombre del artículo, tal como lo escribe Toast', /Tito's/.test(t) && /HH Martini/.test(t));
  prueba('con cuántos se vendieron', /30/.test(t) && /14/.test(t));
  prueba('el grupo del menú', /HAPPY HOUR › HH Cocktails/.test(t));
  prueba('y sus modificadores', /Double ×6/.test(t) && /Triage ×9/.test(t) && /Dirty ×5/.test(t));
}

grupo('un fallo dice lo que pasó');
{
  const w = entorno(() => ({ ok: false, accion: 'sales', businessDate: '20261111', status: 429, crudo: '{"message":"Too many requests"}' }));
  abrir(w); await pulsar(w, 'sales');
  const t = salida(w);
  prueba('dice que falló', /failed/i.test(t));
  prueba('con lo que contestó Toast, tal cual', /429/.test(t) && /Too many requests/.test(t), t.slice(0, 200));
}
{
  const w = entorno(() => new Error('sin red'));
  abrir(w); await pulsar(w, 'sales');
  prueba('si se rompe en el navegador, también lo dice', /sin red/.test(salida(w)), salida(w).slice(0, 160));
  w.fetch = async () => ({ json: async () => VENTAS });
  await pulsar(w, 'sales');
  prueba('y el botón sigue vivo después', /\$1,204\.00/.test(salida(w)));
}

grupo('lo que se copia sale de una lista cerrada');
{
  const w = entorno(() => Object.assign({}, VENTAS, { crudo: 'NO-COPIAR', algoNuevo: { cliente: 'Juan Perez' } }));
  abrir(w); await pulsar(w, 'sales');
  const b = w.document.querySelector('#tpSalida [data-copiar="todo"]');
  prueba('hay un botón para copiar el resultado', !!b);
  if (b) { b.click(); await esperar(20); }
  const c = w.__copiado || '';
  prueba('copia las cifras', /"neto": 1204/.test(c) && /"businessDate": "20261111"/.test(c), c.slice(0, 120));
  prueba('y nada que no esté en la lista', !/NO-COPIAR|Juan Perez|algoNuevo/.test(c));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
