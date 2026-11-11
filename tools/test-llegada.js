#!/usr/bin/env node
/*
 * ── La llegada de cada pedido (vendor_orders.arrives_at, migración 033) ─
 *
 * Axel, 2026-11-11: cada pedido pertenece al ciclo en el que LLEGA y
 * cuenta en el LIVE desde que llega. La llegada se fija al colocarlo: la
 * siguiente entrega de su proveedor (Settings → Delivery). Lo que se
 * protege:
 *   1. El cálculo: la siguiente vez que toca el día y la hora del
 *      proveedor DESPUÉS de colocarlo, en hora de Nueva York (también el
 *      día del cambio de horario). Sin horario, null: "no se sabe", no
 *      "ahora".
 *   2. Lo que se guarda: un pedido normal, su llegada; un quick order, su
 *      propia hora y la marca is_quick (antes se perdía al recargar); una
 *      orden que ya traía su llegada, la conserva.
 *   3. Si la 033 no está corrida, guardar y cargar siguen funcionando
 *      sin las columnas nuevas; con cualquier OTRO error no se repite a
 *      ciegas.
 *   4. Al cargar, la llegada y la marca vuelven al historial.
 *
 *   node tools/test-llegada.js
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

const HORARIOS = { LOOP: { delivery_day: 2, delivery_time: '07:00:00' }, BREAKTHRU: { delivery_day: 2, delivery_time: '16:00:00' } };

function ventana(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k', ACCOUNT_ID: 'wjm', LOCATION_NAME: 'The Crown Tavern' };
  w.state = { orderHistory: [] };
  w.__pet = [];
  w.fetch = async (url, op) => {
    const u = String(url), m = (op && op.method) || 'GET';
    const cuerpo = op && op.body ? JSON.parse(op.body) : null;
    w.__pet.push({ url: u, metodo: m, cuerpo });
    const r = (status, b) => ({ ok: status < 400, status, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.includes('/locations?')) return r(200, [{ id: 'loc-1', name: 'The Crown Tavern', weekly_reset_at: null }]);
    if (u.includes('/rpc/')) return r(200, 231);
    if (u.includes('/vendor_defaults')) {
      const v = decodeURIComponent((/vendor=eq\.([^&]+)/.exec(u) || [])[1] || '');
      return r(200, HORARIOS[v] ? [Object.assign({ vendor: v }, HORARIOS[v])] : []);
    }
    if (u.includes('/vendor_orders') && m === 'POST') {
      if (o.sinColumnas && ('arrives_at' in cuerpo || 'is_quick' in cuerpo)) return r(400, { code: 'PGRST204', message: "Could not find the 'arrives_at' column of 'vendor_orders' in the schema cache" });
      if (o.otroError) return r(400, { code: '23502', message: 'null value in column "vendor" violates not-null constraint' });
      return r(201, [{ id: 'uuid-1' }]);
    }
    if (u.includes('/vendor_orders') && m === 'GET') {
      if (o.sinColumnas && /arrives_at/.test(u)) return r(400, { code: '42703', message: 'column vendor_orders.arrives_at does not exist' });
      return r(200, o.filas || []);
    }
    if (u.includes('/vendor_order_items') && m === 'GET') return r(200, []);
    return r(m === 'DELETE' ? 204 : 201, []);
  };
  for (const f of ['src/vendor-defaults-cloud.js', 'src/vendor-delivery.js', 'src/orders-cloud.js']) w.eval(leer(f));
  return w;
}
const insertado = (w) => (w.__pet.filter(p => p.metodo === 'POST' && /\/vendor_orders$/.test(p.url)).pop() || {}).cuerpo;
const pedido = (x) => Object.assign({ id: 'o-' + Math.random(), vendor: 'LOOP', items: [{ item: "Tito's", finalOrder: 2, value: 20 }], subtotal: 40, totalUnits: 2 }, x);

(async () => {

grupo('el cálculo');
{
  const D = ventana().BarStockVendorDelivery;
  const L = HORARIOS.LOOP, B = HORARIOS.BREAKTHRU;
  prueba('LOOP pedido el domingo por la tarde: el martes 7 AM', D.siguienteEntrega(L, '2026-11-15T23:00:00Z') === '2026-11-17T12:00:00.000Z');
  prueba('Breakthru pedido el miércoles: el martes SIGUIENTE (pedido tarde)', D.siguienteEntrega(B, '2026-11-18T17:00:00Z') === '2026-11-24T21:00:00.000Z');
  prueba('el mismo martes, antes de las 4: ese día', D.siguienteEntrega(B, '2026-11-17T20:30:00Z') === '2026-11-17T21:00:00.000Z');
  prueba('el mismo martes, después de las 4: el siguiente', D.siguienteEntrega(B, '2026-11-17T21:30:00Z') === '2026-11-24T21:00:00.000Z');
  prueba('el día del cambio de horario cae a su hora', D.siguienteEntrega({ delivery_day: 0, delivery_time: '10:00' }, '2027-03-13T20:00:00Z') === '2027-03-14T14:00:00.000Z');
  prueba('sin horario: null, no "ahora"', D.siguienteEntrega({ delivery_day: null }, '2026-11-15T23:00:00Z') === null && D.siguienteEntrega(null) === null);
  prueba('se dice en hora de Nueva York', D.fecha('2026-11-17T12:00:00.000Z') === 'Tue Nov 17 · 7:00 AM');
}

grupo('lo que se guarda');
{
  let w = ventana();
  await w.persistOrderToSupabase(pedido({ createdAt: '2026-11-15T23:00:00.000Z' }));
  let c = insertado(w);
  prueba('un pedido normal: la siguiente entrega de su proveedor', c.arrives_at === '2026-11-17T12:00:00.000Z' && c.is_quick === false, JSON.stringify(c));

  w = ventana();
  await w.persistOrderToSupabase(pedido({ vendor: 'SOUTHERN', createdAt: '2026-11-15T23:00:00.000Z' }));
  prueba('un proveedor sin horario: sin llegada (no se inventa)', insertado(w).arrives_at === null);

  w = ventana();
  await w.persistOrderToSupabase(pedido({ createdAt: '2026-11-12T22:40:00.000Z', quickOrder: true }));
  c = insertado(w);
  prueba('un quick order: su propia hora, y la marca en la nube', c.arrives_at === '2026-11-12T22:40:00.000Z' && c.is_quick === true, JSON.stringify(c));

  w = ventana();
  await w.persistOrderToSupabase(pedido({ createdAt: '2026-11-15T23:00:00.000Z', arrivesAt: '2026-11-20T15:00:00.000Z' }));
  prueba('una orden que ya traía su llegada la conserva', insertado(w).arrives_at === '2026-11-20T15:00:00.000Z');
  w = ventana();
  await w.persistOrderToSupabase(pedido({ createdAt: '2026-11-15T23:00:00.000Z', arrivesAt: null }));
  prueba('y si se miró y no se sabía, no se recalcula', insertado(w).arrives_at === null);
}

grupo('sin la migración 033');
{
  let w = ventana({ sinColumnas: true });
  let falla = null;
  try { await w.persistOrderToSupabase(pedido({ createdAt: '2026-11-15T23:00:00.000Z' })); } catch (e) { falla = e; }
  const posts = w.__pet.filter(p => p.metodo === 'POST' && /\/vendor_orders$/.test(p.url));
  prueba('guardar funciona: se repite sin las columnas nuevas', !falla && posts.length === 2 && !('arrives_at' in posts[1].cuerpo) && !('is_quick' in posts[1].cuerpo), falla && falla.message);

  w = ventana({ otroError: true });
  falla = null;
  try { await w.persistOrderToSupabase(pedido({ createdAt: '2026-11-15T23:00:00.000Z' })); } catch (e) { falla = e; }
  prueba('con otro error no se repite a ciegas: se dice', !!falla && /not-null/.test(falla.message) &&
    w.__pet.filter(p => p.metodo === 'POST' && /\/vendor_orders$/.test(p.url)).length === 1, falla && falla.message);

  w = ventana({ sinColumnas: true, filas: [{ app_order_id: 'a1', vendor: 'LOOP', created_at: '2026-11-15T23:00:00Z', subtotal: 40 }] });
  await w.loadOrdersFromCloud();
  prueba('cargar funciona: se vuelve a pedir sin ellas', w.state.orderHistory.length === 1 &&
    w.__pet.some(p => /vendor_orders\?/.test(p.url) && !/arrives_at/.test(p.url)));
  prueba('y la llegada queda sin saber, para calcularse si se vuelve a guardar', w.state.orderHistory[0].arrivesAt === undefined);
}

grupo('al cargar');
{
  const w = ventana({ filas: [
    { app_order_id: 'a1', vendor: 'LOOP', created_at: '2026-11-15T23:00:00Z', subtotal: 40, arrives_at: '2026-11-17T12:00:00+00:00', is_quick: false },
    { app_order_id: 'a2', vendor: 'LOOP', created_at: '2026-11-12T22:40:00Z', subtotal: 9, arrives_at: '2026-11-12T22:40:00+00:00', is_quick: true },
    { app_order_id: 'a3', vendor: 'LOOP', created_at: '2026-11-01T22:40:00Z', subtotal: 9, arrives_at: null, is_quick: false }
  ] });
  await w.loadOrdersFromCloud();
  const h = w.state.orderHistory;
  const sel = w.__pet.find(p => /vendor_orders\?/.test(p.url) && p.metodo === 'GET');
  prueba('pide la llegada y la marca', !!sel && /select=[^&]*arrives_at,is_quick/.test(sel.url));
  prueba('la llegada vuelve al historial', h[0].arrivesAt === '2026-11-17T12:00:00+00:00');
  prueba('la marca de quick order sobrevive a la recarga', h[1].quickOrder === true && h[0].quickOrder === false);
  prueba('un pedido de antes de esto, sin llegada', h[2].arrivesAt === null);
}

grupo('la migración y la carga');
{
  const sql = leer('database/migrations/033_vendor_orders_llegada.sql').replace(/--.*$/gm, '');
  prueba('033 sólo añade columnas', /add column if not exists arrives_at timestamptz/.test(sql) && /add column if not exists is_quick boolean not null default false/.test(sql) && !/\bdrop\b|\bdelete\b|\bupdate\b/i.test(sql));
  const html = leer('index.html');
  const p = f => html.indexOf('src/' + f + '?v=');
  prueba('la ficha del proveedor, el horario y las órdenes, en ese orden', p('vendor-defaults-cloud.js') > 0 && p('vendor-defaults-cloud.js') < p('vendor-delivery.js') && p('vendor-delivery.js') < p('orders-cloud.js'));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
