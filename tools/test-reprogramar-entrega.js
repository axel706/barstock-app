#!/usr/bin/env node
/*
 * ── Cambiar el horario de entrega mueve lo que está en camino ─────────
 *
 * Axel, 2026-11-25: "cambiar la fecha y hora de entrega de un vendor no
 * lo cambia en la tarjeta running out ni en la tarjeta de pedidos". La
 * llegada de un pedido (arrives_at) se calculaba UNA vez, al enviarlo,
 * con el horario de ese momento; las dos tarjetas la leen del pedido, y
 * cambiar Settings › Delivery sólo valía para los pedidos siguientes.
 * Acordado: al guardar el horario, los pedidos de ese proveedor que
 * TODAVÍA NO HAN LLEGADO se recalculan desde la hora en que se enviaron,
 * con el horario nuevo.
 *
 * Lo que se protege:
 *   1. Un pedido en camino cambia a la llegada del horario nuevo,
 *      contada desde cuando se envió.
 *   2. Lo que ya llegó no se mueve (el pasado no se mueve); tampoco un
 *      quick order que se dio por llegado al enviarlo (su llegada ya pasó).
 *   3. Sin horario (se quitó el día) no se inventa nada: no se toca.
 *   4. Sólo ese proveedor, sin importar mayúsculas.
 *   5. Se escribe en la nube por app_order_id y locación, se cambia en
 *      memoria y se avisa ('ordersUpdated'): las tarjetas se rehacen.
 *   6. Settings › Delivery lo hace al guardar y dice cuántos movió.
 *
 *   node tools/test-reprogramar-entrega.js
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d !== undefined ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const w = { console: { log() {}, warn() {} } }; w.window = w;
new Function('window', leer('src/vendor-delivery.js'))(w);
const VD = w.BarStockVendorDelivery;

// Martes 2026-11-24, 12:00 en Nueva York (17:00 UTC).
const AHORA = Date.parse('2026-11-24T17:00:00Z');
const LUNES = '2026-11-23T15:00:00Z';                 // lunes 10 AM NY
const nuevo = { vendor: 'LOOP', delivery_day: 3, delivery_time: '16:00' };   // miércoles 4 PM

grupo('la cuenta (vendor-delivery.reprogramar)');
{
  const ordenes = [
    { id: 'A', vendor: 'LOOP', created_at: LUNES, arrives_at: '2026-11-25T12:00:00Z' },   // en camino
    { id: 'B', vendor: 'loop', created_at: LUNES, arrives_at: '2026-11-24T12:00:00Z' },   // ya llegó (7 AM)
    { id: 'Q', vendor: 'LOOP', created_at: '2026-11-24T16:00:00Z', arrives_at: '2026-11-24T16:00:00Z' }, // quick "ya llegó"
    { id: 'S', vendor: 'SOUTHERN', created_at: LUNES, arrives_at: '2026-11-25T21:00:00Z' }, // otro proveedor
    { id: 'Y', vendor: 'LOOP', created_at: LUNES, arrives_at: '2026-11-25T21:00:00.000Z' }  // ya es la del horario nuevo
  ];
  const r = VD.reprogramar ? VD.reprogramar(ordenes, nuevo, AHORA) : null;
  const ids = (r || []).map(x => x.id).join(',');
  prueba('mueve el pedido en camino', !!r && ids === 'A', ids);
  const a = (r || []).find(x => x.id === 'A');
  prueba('a la llegada del horario nuevo desde que se envió (miércoles 4 PM NY)', a && a.despues === '2026-11-25T21:00:00.000Z', a && a.despues);
  prueba('lo que ya llegó no se mueve', !ids.includes('B'));
  prueba('un quick order dado por llegado, tampoco', !ids.includes('Q'));
  prueba('otro proveedor, tampoco', !ids.includes('S'));
  prueba('lo que ya está en la llegada nueva no se reescribe', !ids.includes('Y'));
  prueba('sin horario no se inventa nada', VD.reprogramar && VD.reprogramar(ordenes, { vendor: 'LOOP', delivery_day: null, delivery_time: null }, AHORA).length === 0);
}

grupo('en la nube, en memoria y el aviso (orders-cloud.reprogramarLlegadas)');
(async () => {
  const llamadas = [];
  let aviso = null;
  const g = { console: { log() {}, warn() {} }, addEventListener() {}, removeEventListener() {} }; g.window = g;
  g.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://s.test', SUPABASE_KEY: 'k', ACCOUNT_ID: 'acct', LOCATION_NAME: 'Crown' };
  g.BarStockVendorDelivery = VD;
  g.BarStockVendorDefaults = { getDefaults: async () => nuevo };
  g.BarStockEvents = { emit: (ev) => { aviso = ev; }, on() {} };
  g.state = { orderHistory: [{ id: 'A', vendor: 'LOOP', arrivesAt: '2026-11-25T12:00:00Z' }, { id: 'S', vendor: 'SOUTHERN', arrivesAt: '2026-11-25T21:00:00Z' }] };
  g.Date = class extends Date { constructor(...a) { if (!a.length) super(AHORA); else super(...a); } static now() { return AHORA; } };
  g.fetch = async (u, o) => {
    llamadas.push({ u: String(u), o: o || {} });
    if (/\/locations\?/.test(u)) return { ok: true, json: async () => [{ id: 'loc1' }] };
    if (/vendor_orders\?/.test(u) && (!o || !o.method || o.method === 'GET')) return { ok: true, json: async () => [
      { app_order_id: 'A', vendor: 'LOOP', created_at: LUNES, arrives_at: '2026-11-25T12:00:00Z' },
      { app_order_id: 'S', vendor: 'SOUTHERN', created_at: LUNES, arrives_at: '2026-11-25T21:00:00Z' }] };
    return { ok: true, status: 204, json: async () => null, text: async () => '' };
  };
  try { new Function('window', 'fetch', 'state', 'Date', leer('src/orders-cloud.js'))(g, g.fetch, g.state, g.Date); } catch (e) { console.log(e); }
  const OC = g.BarStockOrdersCloud;
  const res = OC && OC.reprogramarLlegadas ? await OC.reprogramarLlegadas('LOOP') : null;
  prueba('dice cuántos movió', !!res && res.movidos === 1, JSON.stringify(res));
  const patch = llamadas.filter(c => c.o.method === 'PATCH');
  prueba('escribe UNA llegada, la de ese pedido, por app_order_id y locación',
    patch.length === 1 && /app_order_id=eq\.A/.test(patch[0].u) && /location_id=eq\.loc1/.test(patch[0].u), patch.map(p => p.u).join(' | '));
  prueba('con la llegada nueva', patch[0] && JSON.parse(patch[0].o.body).arrives_at === '2026-11-25T21:00:00.000Z');
  prueba('sólo pide lo que aún no llega', llamadas.some(c => /vendor_orders\?.*arrives_at=gt\./.test(c.u)));
  prueba('la cambia en memoria (la tarjeta de pedidos)', g.state.orderHistory[0].arrivesAt === '2026-11-25T21:00:00.000Z');
  prueba('y avisa: el LIVE y Running out se rehacen', aviso === 'ordersUpdated', aviso);

  grupo('Settings › Delivery lo hace al guardar');
  const ms = leer('src/mobile-settings.js');
  prueba('al guardar un horario llama a reprogramarLlegadas', /reprogramarLlegadas\(/.test(ms));
  prueba('y el aviso dice cuántos pedidos en camino movió', /on the way updated/.test(ms));

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
