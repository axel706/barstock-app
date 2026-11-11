#!/usr/bin/env node
/*
 * ── El horario de entrega de cada proveedor (Settings → Delivery) ────
 *
 * Axel, 2026-11-11, opción B: cada proveedor dice en la lista cuándo
 * llega su pedido, y tocarlo abre una hoja con dos ruedas (día y hora).
 * Es la hora desde la que lo ordenado cuenta en el LIVE. Lo que se
 * protege:
 *   1. La lista dice el horario de cada uno ("Arrives Tue · 7:00 AM") y
 *      el que no tiene, en rojo; nunca inventa uno.
 *   2. Guardar manda sólo el día y la hora, con on_conflict: la ficha
 *      del proveedor (correo, cuenta…) no se pisa.
 *   3. "No day" borra el horario entero: una hora sin día no dice nada.
 *   4. Un fallo de Supabase se dice tal cual, en la hoja, y no se da por
 *      guardado.
 *   5. La ficha sigue a mano, desde la misma hoja.
 *   6. La migración 032 sólo añade columnas.
 *
 *   node tools/test-entregas.js
 */
const path = require('path');
const fs = require('fs');
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

function montar(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/', runScripts: 'outside-only' });
  const w = dom.window;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  w.scrollTo = () => {};
  w.CSS = { escape: (s) => String(s) };
  w.BarStockEvents = { on() {}, emit() {} };
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k', ACCOUNT_ID: 'wjm', LOCATION_NAME: 'The Crown Tavern' };
  w.getActiveVendors = () => ['LOOP', 'WINE MERCHANT'];
  w.__peticiones = [];
  w.fetch = async (url, op) => {
    const u = String(url);
    w.__peticiones.push({ url: u, metodo: (op && op.method) || 'GET', cuerpo: op && op.body ? JSON.parse(op.body) : null });
    const r = (status, b) => ({ ok: status < 400, status, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.includes('/locations?')) return r(200, [{ id: 'loc-1' }]);
    if (u.includes('/vendor_defaults') && (!op || !op.method)) return r(200, o.filas || [{ vendor: 'LOOP', vendor_email: 'o@loop.com', delivery_day: 2, delivery_time: '07:00:00' }]);
    if (u.includes('/vendor_defaults')) return o.fallo ? r(400, { message: 'column "delivery_day" does not exist' }) : r(201, {});
    return r(404, {});
  };
  w.eval(leer('src/dialog.js'));
  w.eval(leer('src/mobile-shell.js'));
  w.eval(leer('src/vendor-defaults-cloud.js'));
  w.eval(leer('src/vendor-delivery.js'));
  w.eval(leer('src/mobile-settings.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.BarStockMobile.register({ id: 'home', icon: 'ti-home', label: 'Home', tab: true, orden: 1, mount(h) { h.innerHTML = 'Home'; } });
  return w;
}
async function aDelivery(w) {
  w.BarStockMobile.ir('home'); w.BarStockMobile.ir('settings'); await esperar(10);
  w.document.querySelector('[data-p="delivery"]').click(); await esperar(40);
  return w.document.querySelector('.m-screen[data-screen="settings"]');
}
const fila = (caja, v) => caja.querySelector('[data-v="' + v + '"]');
const escrituras = (w) => w.__peticiones.filter(p => p.metodo === 'POST');

(async () => {

grupo('los días y las horas');
{
  const w = montar();
  const D = w.BarStockVendorDelivery;
  prueba('"07:00:00" de PostgREST → "Tue · 7:00 AM"', D.texto({ delivery_day: 2, delivery_time: '07:00:00' }) === 'Tue · 7:00 AM');
  prueba('la tarde y la medianoche', D.hora('16:00') === '4:00 PM' && D.hora('00:30') === '12:30 AM' && D.hora('12:00') === '12:00 PM');
  prueba('sin día o sin hora no hay horario', D.texto({ delivery_day: null, delivery_time: '07:00' }) === '' && D.texto({ delivery_day: 3 }) === '');
  prueba('cada media hora, todo el día', D.HORAS.length === 48 && D.HORAS[14] === '07:00');
}

grupo('la lista');
{
  const w = montar();
  const caja = await aDelivery(w);
  prueba('el que tiene horario lo dice', /Arrives Tue · 7:00 AM/.test(fila(caja, 'LOOP').textContent) && !!fila(caja, 'LOOP').querySelector('.m-ent-on'));
  prueba('el que no, en rojo, sin inventar uno', /No delivery day yet/.test(fila(caja, 'WINE MERCHANT').textContent) && !!fila(caja, 'WINE MERCHANT').querySelector('.m-ent-no'));
  prueba('el nombre de la sección en la banda', /Delivery/.test(w.document.querySelector('.m-band-seccion').textContent));
}

grupo('la hoja: guardar');
{
  const w = montar();
  let caja = await aDelivery(w);
  fila(caja, 'LOOP').click(); await esperar(10);
  const h = w.document.getElementById('mSheet');
  prueba('se abre con lo guardado', !!h && h.querySelector('#msEntDia').value === '2' && h.querySelector('#msEntHora').value === '07:00');
  h.querySelector('#msEntDia').value = '4';
  h.querySelector('#msEntHora').value = '16:00';
  h.querySelector('#msEntOk').click(); await esperar(40);
  const e = escrituras(w);
  prueba('guarda en vendor_defaults con on_conflict', e.length === 1 && /vendor_defaults\?on_conflict=location_id,vendor$/.test(e[0].url), e.map(x => x.url).join(' | '));
  prueba('sólo el día y la hora: la ficha no se pisa', !!e[0] && e[0].cuerpo.delivery_day === 4 && e[0].cuerpo.delivery_time === '16:00' &&
    !('vendor_email' in e[0].cuerpo) && !('delivery_window' in e[0].cuerpo), JSON.stringify(e[0] && e[0].cuerpo));
  caja = w.document.querySelector('.m-screen[data-screen="settings"]');
  prueba('la hoja se cierra y la lista dice lo nuevo', !w.document.getElementById('mSheet') && /Arrives Thu · 4:00 PM/.test(fila(caja, 'LOOP').textContent));

  fila(caja, 'LOOP').click(); await esperar(10);
  w.document.querySelector('#msEntDia').value = '';
  w.document.querySelector('#msEntOk').click(); await esperar(40);
  const b = escrituras(w)[1];
  prueba('"No day" borra día y hora', !!b && b.cuerpo.delivery_day === null && b.cuerpo.delivery_time === null, JSON.stringify(b && b.cuerpo));
  caja = w.document.querySelector('.m-screen[data-screen="settings"]');
  prueba('y la lista vuelve al rojo', /No delivery day yet/.test(fila(caja, 'LOOP').textContent));
}

grupo('la hoja: cuando falla');
{
  const w = montar({ fallo: true });
  const caja = await aDelivery(w);
  fila(caja, 'WINE MERCHANT').click(); await esperar(10);
  w.document.querySelector('#msEntDia').value = '4';
  w.document.querySelector('#msEntOk').click(); await esperar(40);
  const h = w.document.getElementById('mSheet');
  const err = h && h.querySelector('.m-ent-err');
  prueba('dice lo que contestó Supabase, en la hoja', !!err && !err.hidden && /Supabase answered 400/.test(err.textContent) && /delivery_day/.test(err.textContent), err && err.textContent);
  prueba('y no lo da por guardado', /No delivery day yet/.test(fila(w.document.querySelector('.m-screen[data-screen="settings"]'), 'WINE MERCHANT').textContent));
}

grupo('la ficha, desde la hoja');
{
  const w = montar();
  const caja = await aDelivery(w);
  fila(caja, 'LOOP').click(); await esperar(10);
  w.document.querySelector('#msEntFicha').click(); await esperar(40);
  const c2 = w.document.querySelector('.m-screen[data-screen="settings"]');
  prueba('abre la ficha del proveedor', !w.document.getElementById('mSheet') && !!c2.querySelector('#ms_vemail') && c2.querySelector('#ms_vemail').value === 'o@loop.com');
  prueba('con su nombre en la banda', w.document.querySelector('.m-band-seccion').textContent === 'LOOP');
}

grupo('la migración y la carga');
{
  const sql = leer('database/migrations/032_vendor_delivery_day.sql').replace(/--.*$/gm, '');
  prueba('032 sólo añade columnas', /add column if not exists delivery_day smallint/.test(sql) && /add column if not exists delivery_time time/.test(sql) && !/\bdrop\b|\bdelete\b|\bupdate\b/i.test(sql));
  prueba('el día va de 0 a 6', /check \(delivery_day between 0 and 6\)/.test(sql));
  const html = leer('index.html');
  const p = f => html.indexOf('src/' + f + '?v=');
  prueba('el módulo del horario antes de Settings', p('vendor-delivery.js') > 0 && p('vendor-delivery.js') < p('mobile-settings.js'));
  prueba('vendor-defaults-cloud.js con su rompe-caché', p('vendor-defaults-cloud.js') > 0);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
