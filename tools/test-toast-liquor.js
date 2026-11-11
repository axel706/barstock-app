#!/usr/bin/env node
/*
 * ── Liquor from Toast: cada marca de Toast con su botella ────────────
 *
 * Axel, 2026-11-11: para el "deberías tener" en vivo, cada licor que
 * Toast vende solo tiene que apuntar a su botella del inventario. En
 * Toast el licor solo es la MARCA y la medida la dice el grupo del menú
 * (Grey Goose Single, Grey Goose UP/RX). Eligió la pantalla "la que creas
 * correcta": la opción C, por tipo de licor y una fila por marca.
 *
 * Lo que se protege:
 *   1. Las medidas de la casa, como las escribió Axel: Single 1.5,
 *      Double 2.5, Up/Rocks 3, Shot 1.5, y "3oz" son 3.
 *   2. Una medida desconocida NO se guarda: con pour_oz vacío la fila
 *      contaría como una botella entera por venta.
 *   3. Una marca es una fila y una decisión: elegir la botella la guarda
 *      para todas sus medidas, cada una con su pour.
 *   4. Se guarda como 'liquor', no como vino, y en la locación abierta.
 *   5. "Confirm N" de una sección sólo confirma las seguras de ESA
 *      sección.
 *   6. Ignorar y deshacer van por marca.
 *   7. La pantalla está en Settings → Toast del teléfono y carga en orden.
 *
 *   node tools/test-toast-liquor.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const existe = f => fs.existsSync(path.join(RAIZ, f));

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const CROWN = 'crown-guid';

const INVENTARIO = ['Grey Goose Vodka 750', "Tito's Handmade Vodka 1L", "Maker's Mark Bourbon 1L", 'Beefeater Gin 1L', 'Ketel One Vodka 1L'];

// Como lo devuelve lib/toast.js (acción liquor).
const ARTICULOS = [
  { guid: 'gg-up', nombre: 'Grey Goose', grupo: 'DRINKS › Liquor › Vodka › UP/RX', tipo: 'Vodka', medida: 'UP/RX', marca: 'Grey Goose' },
  { guid: 'gg-1', nombre: 'Grey Goose', grupo: 'DRINKS › Liquor › Vodka › Single', tipo: 'Vodka', medida: 'Single', marca: 'Grey Goose' },
  { guid: 'gg-2', nombre: 'Grey Goose', grupo: 'DRINKS › Liquor › Vodka › Double', tipo: 'Vodka', medida: 'Double', marca: 'Grey Goose' },
  { guid: 'tito', nombre: 'Titos vodka', grupo: 'DRINKS › Liquor › Vodka › Single', tipo: 'Vodka', medida: 'Single', marca: 'Titos vodka' },
  { guid: 'mm3', nombre: "3oz Maker's Mark", grupo: 'DRINKS › Liquor › Bourbon + Rye › 3oz', tipo: 'Bourbon + Rye', medida: '3oz', marca: "Maker's Mark" },
  { guid: 'mm-x', nombre: "Maker's Mark Flight", grupo: 'DRINKS › Liquor › Bourbon + Rye › Flight', tipo: 'Bourbon + Rye', medida: 'Flight', marca: "Maker's Mark" },
  { guid: 'gin', nombre: 'Gin UP/RX', grupo: 'DRINKS › Liquor › Gin › Up/Rx', tipo: 'Gin', medida: 'Up/Rx', marca: 'Gin' }
];

function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>',
    { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k' };
  w.state = { master: INVENTARIO.map(item => ({ item })) };
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-crown' };
  w.BarStockSupabase = { getClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 's' } } }) } }) };
  w.__peticiones = [];
  w.fetch = async (url, op) => {
    op = op || {};
    const u = String(url);
    w.__peticiones.push({ url: u, metodo: op.method || 'GET', cuerpo: op.body ? JSON.parse(op.body) : null });
    const resp = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body });
    if (u.includes('/rest/v1/locations')) return resp(200, [{ toast_restaurant_guid: CROWN }]);
    if (u.includes('/api/integrations')) {
      const b = JSON.parse(op.body);
      w.__acciones = (w.__acciones || []).concat(b.action);
      const vendido = { 'gg-up': 3, 'gg-1': 1, tito: 2, mm3: 1 };
      if (Array.isArray(b.params.guids)) return resp(200, { ok: true, restaurante: CROWN, diaCompleto: true, articulos: [], vendido });
      return resp(200, { ok: true, restaurante: CROWN, diaCompleto: true, articulos: ARTICULOS, vendido });
    }
    if (u.includes('/rest/v1/toast_item_links')) {
      if ((op.method || 'GET') === 'GET') return resp(200, o.enlaces || []);
      return resp(201, {});
    }
    return resp(404, {});
  };
  for (const f of ['src/toast-links.js', 'src/toast-liquor.js', 'src/mobile-toast-liquor.js']) if (existe(f)) w.eval(leer(f));
  return w;
}
const escritas = (w) => w.__peticiones.filter(p => p.metodo === 'POST' && p.url.includes('toast_item_links')).map(p => p.cuerpo);

(async () => {

grupo('las medidas de la casa');
{
  const w = entorno();
  const T = w.BarStockToastLiquor || {};
  const oz = T.ozDe || (() => 'x');
  prueba('Single 1.5, Double 2.5, Shot 1.5', oz('Single') === 1.5 && oz('Double') === 2.5 && oz('Shot') === 1.5);
  prueba('UP/RX y Up/Rx son 3, como Up y Rocks', oz('UP/RX') === 3 && oz('Up/Rx') === 3 && oz('Up') === 3 && oz('Rocks') === 3);
  prueba('"3oz" y "2oz" dicen su medida', oz('3oz') === 3 && oz('2oz') === 2 && oz('2 oz') === 2);
  prueba('lo desconocido no se adivina', oz('Flight') === undefined && oz(null) === undefined);
}

grupo('una fila por marca, por tipo');
{
  const w = entorno();
  const T = w.BarStockToastLiquor;
  await T.cargar();
  prueba('pide la acción liquor', (w.__acciones || []).every(a => a === 'liquor') && (w.__acciones || []).length === 7, (w.__acciones || []).join(','));
  const M = T.marcas();
  const gg = M.find(m => m.marca === 'Grey Goose');
  prueba('Grey Goose es UNA marca con sus tres medidas', !!gg && gg.filas.length === 3 && M.filter(m => m.marca === 'Grey Goose').length === 1);
  prueba('"3oz Maker\'s Mark" y "Maker\'s Mark Flight" son la misma marca', M.filter(m => m.marca === "Maker's Mark").length === 1);
  prueba('lo vendido de la marca suma sus medidas (7 días × 4)', gg && gg.vendido === 28, gg && gg.vendido);
  prueba('sugiere la botella por la marca', gg && gg.producto === 'Grey Goose Vodka 750', gg && gg.producto);
  const tipos = T.porTipo(M).map(s => s.tipo);
  prueba('agrupadas por tipo, lo más vendido primero', tipos[0] === 'Vodka' && tipos.includes('Gin') && tipos.includes('Bourbon + Rye'), tipos.join(','));
}

grupo('elegir la botella la guarda para todas sus medidas');
{
  const w = entorno();
  const T = w.BarStockToastLiquor;
  await T.cargar();
  const gg = T.marcas().find(m => m.marca === 'Grey Goose');
  const r = await T.confirmarMarca(gg.clave, 'Grey Goose Vodka 750');
  const e = escritas(w);
  prueba('tres filas, una por medida', r.hechas === 3 && e.length === 3, JSON.stringify(r));
  const pour = {}; for (const x of e) pour[x.toast_item_guid] = x.pour_oz;
  prueba('cada una con su pour', pour['gg-1'] === 1.5 && pour['gg-2'] === 2.5 && pour['gg-up'] === 3, JSON.stringify(pour));
  prueba('como licor, confirmado, en la locación abierta',
    e.every(x => x.kind === 'liquor' && x.status === 'confirmed' && x.item_name === 'Grey Goose Vodka 750' && x.location_id === 'loc-crown'));
  prueba('y la marca pasa a hechas', T.marcas().find(m => m.marca === 'Grey Goose').estado === 'confirmed');
}

grupo('una medida desconocida no se guarda como botella entera');
{
  const w = entorno();
  const T = w.BarStockToastLiquor;
  await T.cargar();
  const mm = T.marcas().find(m => m.marca === "Maker's Mark");
  const r = await T.confirmarMarca(mm.clave, "Maker's Mark Bourbon 1L");
  const e = escritas(w);
  prueba('se guarda la de 3oz', e.length === 1 && e[0].toast_item_guid === 'mm3' && e[0].pour_oz === 3, JSON.stringify(e));
  prueba('la "Flight" no, y se dice', r.sinMedida.length === 1 && r.sinMedida[0] === 'Flight', JSON.stringify(r));
  prueba('ninguna fila de licor con pour vacío', e.every(x => x.pour_oz != null));
  prueba('la marca sigue por revisar: le queda una medida', T.marcas().find(m => m.marca === "Maker's Mark").estado === 'review');
}

grupo('"Confirm N" de una sección, sólo las seguras de esa sección');
{
  const w = entorno();
  const T = w.BarStockToastLiquor;
  await T.cargar();
  const antes = T.marcas().filter(m => m.nivel === 'high').map(m => m.marca);
  const n = await T.confirmarSugeridas('Vodka');
  const e = escritas(w);
  prueba('sólo marcas de Vodka', e.length > 0 && e.every(x => ['gg-up', 'gg-1', 'gg-2', 'tito'].includes(x.toast_item_guid)), e.map(x => x.toast_item_guid).join(','));
  prueba('y sólo las seguras', T.marcas().filter(m => m.tipo === 'Vodka' && m.estado === 'confirmed').every(m => antes.includes(m.marca)), antes.join(','));
  prueba('cuenta marcas, no filas', n === T.marcas().filter(m => m.tipo === 'Vodka' && m.estado === 'confirmed').length, String(n));
}

grupo('ignorar y deshacer, por marca');
{
  const w = entorno({ enlaces: [{ toast_item_guid: 'gg-up', item_name: 'Grey Goose Vodka 750', status: 'confirmed', pour_oz: 3 }] });
  const T = w.BarStockToastLiquor;
  await T.cargar();
  const gin = T.marcas().find(m => m.marca === 'Gin');
  await T.ignorarMarca(gin.clave);
  const e = escritas(w);
  prueba('ignorar escribe la marca como no inventario', e.length === 1 && e[0].status === 'ignored' && e[0].item_name === null);
  const gg = T.marcas().find(m => m.marca === 'Grey Goose');
  prueba('una marca con una medida hecha y otras nuevas vuelve a revisar, con su botella',
    gg.estado === 'review' && gg.producto === 'Grey Goose Vodka 750', gg.estado + ' ' + gg.producto);
  await T.deshacerMarca(gg.clave);
  const borradas = w.__peticiones.filter(p => p.metodo === 'DELETE').map(p => p.url);
  prueba('deshacer borra sólo lo decidido de esa marca', borradas.length === 1 && /toast_item_guid=eq\.gg-up/.test(borradas[0]), borradas.join(' | '));
}

grupo('la pantalla');
{
  const w = entorno();
  const host = w.document.getElementById('host');
  w.BarStockMobileToastLiquor.montar(host, () => '<div class="cab">Liquor from Toast</div>', () => {});
  await esperar(30);
  const secs = [...host.querySelectorAll('.m-tl-sec-h b')].map(b => b.textContent);
  prueba('secciones por tipo', secs.includes('Vodka') && secs.includes('Gin'), secs.join(','));
  const filas = host.querySelectorAll('.m-tl-fila');
  prueba('una fila por marca (4 marcas, 7 artículos)', filas.length === 4, String(filas.length));
  // Por el nombre de la marca, no por el texto de la fila: el selector de
  // cada fila lleva los nombres de todas las botellas.
  const deMarca = (m) => [...filas].find(f => (f.querySelector('.m-tl-izq b') || {}).textContent === m);
  const gg = deMarca('Grey Goose');
  prueba('la fila dice sus medidas con su pour', !!gg && /Single · 1.5 oz/.test(gg.textContent) && /UP\/RX · 3 oz/.test(gg.textContent));
  const mm = deMarca("Maker's Mark");
  prueba('y marca la que no tiene pour', !!mm && !!mm.querySelector('.mal') && /Flight · \? oz/.test(mm.textContent));
  const s = gg && gg.querySelector('select');
  prueba('elegir es un select nativo con ignorar', !!s && [...s.options].some(o => o.textContent === 'Not in inventory'));
  if (s) { s.value = 'Grey Goose Vodka 750'; s.dispatchEvent(new w.Event('change')); }
  await esperar(30);
  prueba('elegir en la fila guarda la marca entera', escritas(w).length === 3, String(escritas(w).length));
}

grupo('está en la app');
{
  const html = leer('index.html');
  const p = f => html.indexOf('src/' + f + '?v=');
  prueba('el motor, el licor y su pantalla, en orden', p('toast-links.js') > 0 && p('toast-links.js') < p('toast-liquor.js') && p('toast-liquor.js') < p('mobile-toast-liquor.js'),
    [p('toast-links.js'), p('toast-liquor.js'), p('mobile-toast-liquor.js')].join(','));
  const ms = leer('src/mobile-settings.js');
  prueba('en Settings → Toast del teléfono', /id:\s*'toastliquor'/.test(ms) && /BarStockMobileToastLiquor\.montar/.test(ms));
  const tl = leer('src/toast-liquor.js');
  prueba('usa el motor, no otra copia', /BarStockToastLinks\(\)\.crear|BarStockToastLinks\.crear|L\(\)\.crear/.test(tl) && !/fetch\(/.test(tl));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
