/*
 * ── Transfers entre locaciones: los datos (src/transfers.js) ──────────
 *
 * docs/plan-transfer.md. Lo que no puede volver a pasar:
 *
 *   1. Que la otra locación cuente botellas que nadie ha visto: hasta
 *      confirmar, sólo cuenta en la que lo registró.
 *   2. Que dos confirmaciones lo apliquen dos veces (sólo si sigue
 *      pendiente).
 *   3. Que "antes del conteo" quede DESPUÉS del conteo (sumaría otra vez).
 *   4. Que lo registre quien no puede hacer órdenes.
 *   5. Que se pierda el rastro: nada se borra.
 *
 *   node tools/test-transfers.js
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

const CROWN = '11111111-1111-1111-1111-111111111111', WB = '22222222-2222-2222-2222-222222222222';

function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k', ACCOUNT_ID: 'wjm-hospitality' };
  w.BarStockInventoryCloud = { fetchLocationId: async () => o.loc || CROWN };
  w.BarStockGuest = { puede: (k) => !(o.sin || []).includes(k), nombre: () => 'Axel' };
  w.__pet = []; w.__filas = (o.filas || []).slice(); w.__ev = [];
  w.BarStockEvents = { emit: (e) => w.__ev.push(e) };
  w.fetch = async (url, op) => {
    const u = String(url), m = (op && op.method) || 'GET';
    const cuerpo = op && op.body ? JSON.parse(op.body) : null;
    w.__pet.push({ url: u, metodo: m, cuerpo, prefer: op && op.headers && op.headers.Prefer });
    if (m === 'POST' && /location_transfers/.test(u)) {
      const hechas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map(c => {
        const f = Object.assign({ id: 'tr-' + (w.__filas.length + 1), status: 'pending', created_at: new Date().toISOString() }, c);
        w.__filas.push(f); return f;
      });
      return { ok: true, status: 201, text: async () => JSON.stringify(hechas) };
    }
    if (m === 'PATCH' && /inventory_snapshots/.test(u)) {
      const id = decodeURIComponent((u.match(/id=eq\.([^&]+)/) || [])[1] || '');
      (w.__snaps || []).filter(x => x.id === id).forEach(x => Object.assign(x, cuerpo));
      return { ok: true, status: 204, text: async () => '' };
    }
    if (m === 'DELETE') return { ok: true, status: 204, text: async () => '' };
    if (m === 'PATCH') {
      const uno = decodeURIComponent((u.match(/[?&]id=eq\.([^&]+)/) || [])[1] || '');
      const varios = ((u.match(/[?&]id=in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean);
      const ids = uno ? [uno] : varios;
      const solo = (u.match(/status=(eq|in)\.([^&]+)/) || [])[2];
      const vale = (s) => !solo || (solo.startsWith('(') ? solo.slice(1, -1).split(',').includes(s) : s === solo);
      const hechas = w.__filas.filter(f => ids.includes(f.id) && vale(f.status));
      hechas.forEach(f => Object.assign(f, cuerpo));
      return { ok: true, status: 200, text: async () => JSON.stringify(hechas) };
    }
    return { ok: true, status: 200, text: async () => '[]' };
  };
  w.BarStockRest = { leerTodo: async (ruta) => {
    w.__pet.push({ url: ruta, metodo: 'GET' });
    if (/^location_transfers/.test(ruta)) return w.__filas.slice();
    if (/^locations/.test(ruta)) return [{ id: CROWN, name: 'The Crown Tavern' }, { id: WB, name: "Will's & Bill's" }];
    if (/^inventory_items/.test(ruta)) return [{ item_name: 'Triage House Vodka' }, { item_name: 'Tito' }, { item_name: 'Tito' }];
    if (/^inventory_snapshots/.test(ruta)) {
      const loc = (ruta.match(/location_id=eq\.([^&]+)/) || [])[1];
      const item = decodeURIComponent((ruta.match(/item_name=eq\.([^&]+)/) || [])[1] || '');
      const cerrada = /on_hand_end=not\.is\.null/.test(ruta);
      return (w.__snaps || []).filter(x => x.loc === loc && x.item === item && (cerrada ? x.on_hand_end != null : x.on_hand_end == null))
        .sort((a, b) => (a.week_start < b.week_start ? 1 : -1));
    }
    return [];
  } };
  w.__snaps = (o.snaps || []).map(x => Object.assign({}, x));
  w.__ordenes = [];
  w.state = { master: [{ item: 'Triage Vodka', code: 'TV1', value: 5.5 }] };
  w.BarStockQuickOrder = { save: async (d) => { w.__ordenes.push(d); return { entrada: { id: 'ord_' + w.__ordenes.length } }; } };
  w.loadOrdersFromCloud = async () => { w.__recargas = (w.__recargas || 0) + 1; };
  if (existe('src/transfers.js')) w.eval(leer('src/transfers.js'));
  return w;
}

(async () => {

grupo('1 · registrar');
{
  const w = entorno();
  const T = w.BarStockTransfers;
  prueba('existe', !!T && typeof T.crear === 'function');
  if (T) {
    let r = await T.crear({ otra: WB, entra: true, item: 'Triage Vodka', otroItem: 'Triage House Vodka', qty: 12, por: 'Axel' });
    const p = w.__pet.find(x => x.metodo === 'POST');
    prueba('escribe en location_transfers', r.ok && !!p && /\/rest\/v1\/location_transfers$/.test(p.url), JSON.stringify(r));
    prueba('entra en Crown: de W+B a Crown, cada lado con su producto', p && p.cuerpo.from_location === WB && p.cuerpo.to_location === CROWN &&
      p.cuerpo.from_item === 'Triage House Vodka' && p.cuerpo.to_item === 'Triage Vodka' && p.cuerpo.qty === 12, JSON.stringify(p && p.cuerpo));
    prueba('lo registró Crown, con la cuenta y quién', p && p.cuerpo.started_at === CROWN && p.cuerpo.account_id === 'wjm-hospitality' && p.cuerpo.created_by === 'Axel');
    prueba('"Now": ahora y no antes del conteo', p && Math.abs(Date.parse(p.cuerpo.moved_at) - Date.now()) < 5000 && p.cuerpo.before_count === false);
    prueba('avisa', w.__ev.includes('transfersUpdated'));
    w.__pet.length = 0;
    r = await T.crear({ otra: WB, entra: false, item: 'Tito', qty: 2 });
    const s = w.__pet.find(x => x.metodo === 'POST');
    prueba('sale de Crown: de Crown a W+B, el producto de W+B lo pondrá W+B', s && s.cuerpo.from_location === CROWN && s.cuerpo.to_location === WB &&
      s.cuerpo.from_item === 'Tito' && s.cuerpo.to_item === null);
    w.__pet.length = 0;
    const conteo = '2026-11-16T02:30:00.000Z';
    r = await T.crear({ otra: WB, entra: true, item: 'Triage Vodka', qty: 12, antes: true, conteo });
    const a = w.__pet.find(x => x.metodo === 'POST');
    prueba('"Before the count": un minuto ANTES del conteo, y marcado', a && Date.parse(a.cuerpo.moved_at) === Date.parse(conteo) - 60000 && a.cuerpo.before_count === true, a && a.cuerpo.moved_at);
    prueba('sin conteo no hay "antes"', (await T.crear({ otra: WB, item: 'X', qty: 1, antes: true })).ok === false);
    prueba('sin producto, sin otra locación o sin cantidad, no', (await T.crear({ otra: WB, qty: 1 })).ok === false &&
      (await T.crear({ item: 'X', qty: 1 })).ok === false && (await T.crear({ otra: WB, item: 'X', qty: 0 })).ok === false);
    prueba('a la misma locación, no', (await T.crear({ otra: CROWN, item: 'X', qty: 1 })).ok === false);
  }
  const w2 = entorno({ sin: ['ordenes'] });
  prueba('sin "Make and send orders", no', (await w2.BarStockTransfers.crear({ otra: WB, item: 'X', qty: 1 })).ok === false && !w2.__pet.some(x => x.metodo === 'POST'));
}

const BASE = { id: 'tr-9', account_id: 'wjm-hospitality', from_location: WB, to_location: CROWN, from_item: 'Triage House Vodka', to_item: null,
  qty: 12, moved_at: '2026-11-18T19:10:00Z', before_count: false, started_at: WB, status: 'pending', created_at: '2026-11-18T19:10:00Z' };

grupo('2 · lo que pregunta la pantalla, sin red');
{
  const w = entorno();
  const T = w.BarStockTransfers;
  const t = Object.assign({}, BASE);
  prueba('en Crown, lo que mandó W+B está por confirmar', T.porConfirmar([t], CROWN).length === 1);
  prueba('en W+B, que lo registró, no', T.porConfirmar([t], WB).length === 0);
  prueba('hasta confirmar cuenta sólo en W+B', T.cuentaAqui(t, WB) === true && T.cuentaAqui(t, CROWN) === false);
  prueba('confirmado, en las dos', T.cuentaAqui(Object.assign({}, t, { status: 'confirmed' }), CROWN) && T.cuentaAqui(Object.assign({}, t, { status: 'confirmed' }), WB));
  prueba('rechazado o deshecho, en ninguna', ['rejected', 'undone'].every(s => !T.cuentaAqui(Object.assign({}, t, { status: s }), WB) && !T.cuentaAqui(Object.assign({}, t, { status: s }), CROWN)));
  const viejo = Object.assign({}, BASE, { id: 'tr-1', status: 'confirmed', to_item: 'Triage Vodka', moved_at: '2026-11-01T19:00:00Z' });
  prueba('la pareja se recuerda: en Crown, Triage Vodka ↔ Triage House Vodka', T.pareja([viejo], CROWN, WB, 'Triage Vodka') === 'Triage House Vodka' &&
    T.miPareja([viejo], CROWN, WB, 'Triage House Vodka') === 'Triage Vodka' && T.pareja([viejo], WB, CROWN, 'Triage House Vodka') === 'Triage Vodka');
  prueba('sin transfers pasados, sin pareja', T.pareja([], CROWN, WB, 'Triage Vodka') === null);
  prueba('se deshace mientras no haya un conteo después', T.deshacible(t, '2026-11-16T02:30:00Z') && !T.deshacible(t, '2026-11-22T02:30:00Z'));
}

grupo('3 · confirmar, "Not right" y deshacer');
{
  const w = entorno({ filas: [Object.assign({}, BASE)] });
  const T = w.BarStockTransfers;
  let r = await T.confirmar(w.__filas[0], 'Triage Vodka', 'Axel');
  const p = w.__pet.find(x => x.metodo === 'PATCH');
  prueba('confirma con SU producto, quién y cuándo', r.ok && w.__filas[0].status === 'confirmed' && w.__filas[0].to_item === 'Triage Vodka' && w.__filas[0].status_by === 'Axel', JSON.stringify(w.__filas[0]));
  prueba('sólo si sigue pendiente', p && /status=eq\.pending/.test(p.url));
  r = await T.confirmar(Object.assign({}, BASE), 'Triage Vodka', 'Mia');
  prueba('la segunda confirmación no hace nada y lo dice', r.ok === false && /already/.test(r.error) && w.__filas[0].status_by === 'Axel');
  prueba('confirmar sin elegir producto, no', (await T.confirmar(Object.assign({}, BASE), '', 'Axel')).ok === false);

  const w2 = entorno({ filas: [Object.assign({}, BASE)] });
  r = await w2.BarStockTransfers.rechazar(w2.__filas[0], 'Only 10 came', 'Axel');
  prueba('"Not right": rejected, con la nota, sin borrar', r.ok && w2.__filas[0].status === 'rejected' && w2.__filas[0].note === 'Only 10 came' &&
    !w2.__pet.some(x => x.metodo === 'DELETE'));

  const w3 = entorno({ loc: WB, filas: [Object.assign({}, BASE)] });
  r = await w3.BarStockTransfers.deshacer(w3.__filas[0], 'Axel', '2026-11-16T02:30:00Z');
  prueba('deshacer: undone, sin borrar', r.ok && w3.__filas[0].status === 'undone' && !w3.__pet.some(x => x.metodo === 'DELETE'));
  const w4 = entorno({ loc: WB, filas: [Object.assign({}, BASE)] });
  r = await w4.BarStockTransfers.deshacer(w4.__filas[0], 'Axel', '2026-11-22T02:30:00Z');
  prueba('con un conteo después, ya no se deshace', r.ok === false && w4.__filas[0].status === 'pending');
  const w5 = entorno({ sin: ['ordenes'], filas: [Object.assign({}, BASE)] });
  prueba('confirmar pide "Make and send orders"', (await w5.BarStockTransfers.confirmar(w5.__filas[0], 'Triage Vodka')).ok === false && w5.__filas[0].status === 'pending');
}

grupo('4 · leer');
{
  const w = entorno({ filas: [Object.assign({}, BASE)] });
  const T = w.BarStockTransfers;
  const f = await T.leer();
  const g = w.__pet.find(x => /^location_transfers/.test(x.url));
  prueba('lo de las dos direcciones de la locación abierta, de los últimos días', f.length === 1 && g &&
    /or=\(from_location\.eq\.1111.*,to_location\.eq\.1111.*\)/.test(g.url) && /moved_at=gte\./.test(g.url), g && g.url);
  const prods = await T.productosDe(WB);
  prueba('los productos de la otra, sin repetir', prods.join(',') === 'Triage House Vodka,Tito');
  const locs = await T.locaciones();
  prueba('las locaciones de la cuenta', locs.length === 2 && w.__pet.some(x => /^locations\?account_id=eq\.wjm-hospitality/.test(x.url)));
}

grupo('4b · las cuentas: Pour·IQ, la orden en Sent, deshacer (fase 3)');
{
  const SN = [
    { id: 's-c-abierta', loc: CROWN, item: 'Triage Vodka', week_start: '2026-11-16', ordered: null, used: null, on_hand_end: null },
    { id: 's-c-cerrada', loc: CROWN, item: 'Triage Vodka', week_start: '2026-11-09', ordered: null, used: 8.85, on_hand_end: 21.95 },
    { id: 's-w-abierta', loc: WB, item: 'Triage House Vodka', week_start: '2026-11-16', ordered: null, used: null, on_hand_end: null },
    { id: 's-w-cerrada', loc: WB, item: 'Triage House Vodka', week_start: '2026-11-09', ordered: null, used: 14.4, on_hand_end: 55.5 }
  ];
  const snap = (w, id) => w.__snaps.find(x => x.id === id);
  // Crown lo registra "Into Crown, Now": su lado se aplica ya.
  let w = entorno({ snaps: SN });
  let T = w.BarStockTransfers;
  let r = await T.crear({ otra: WB, entra: true, item: 'Triage Vodka', otroItem: 'Triage House Vodka', qty: 12, por: 'Axel' });
  prueba('Now: +12 a lo pedido de la semana ABIERTA de Crown (used sale al cerrarla)', snap(w, 's-c-abierta').ordered === 12 && snap(w, 's-c-abierta').used == null &&
    snap(w, 's-c-cerrada').ordered == null, JSON.stringify(w.__snaps.slice(0, 2)));
  prueba('W+B no se toca hasta que confirme', snap(w, 's-w-abierta').ordered == null);
  const o = w.__ordenes[0];
  prueba('en Crown, una orden TRANSFER que llega a la hora del transfer (Orders › Sent)', !!o && o.vendor === 'TRANSFER' &&
    o.arrivesAt === w.__filas[0].moved_at && o.items.length === 1 && o.items[0].item === 'Triage Vodka' && o.items[0].qty === 12 &&
    o.items[0].value === 5.5 && !('vendor' in o.items[0]) && /Transfer from Will's & Bill's/.test(o.note), JSON.stringify(o));
  prueba('y el transfer apunta a su orden', w.__filas[0].vendor_order_id === 'ord_1');
  // W+B confirma: su lado (la que da) se aplica.
  const w2 = entorno({ loc: WB, snaps: SN, filas: [Object.assign({}, w.__filas[0])] });
  r = await w2.BarStockTransfers.confirmar(w2.__filas[0], 'Triage House Vodka', 'Mia');
  prueba('al confirmar W+B: −12 en su semana abierta, y ninguna orden (la que da no espera factura)', r.ok && snap(w2, 's-w-abierta').ordered === -12 && !w2.__ordenes.length);

  // "Before the count", registrado en Crown: la semana que cerró el conteo, y su used.
  w = entorno({ snaps: SN });
  r = await w.BarStockTransfers.crear({ otra: WB, entra: true, item: 'Triage Vodka', qty: 12, antes: true, conteo: '2026-11-16T02:30:00Z' });
  prueba('Before the count: +12 a lo pedido y a lo usado de la semana CERRADA (8.85 → 20.85)', snap(w, 's-c-cerrada').ordered === 12 &&
    snap(w, 's-c-cerrada').used === 20.85 && snap(w, 's-c-abierta').ordered == null, JSON.stringify(snap(w, 's-c-cerrada')));
  prueba('su orden llega antes del conteo (el LIVE no la suma)', w.__ordenes[0] && Date.parse(w.__ordenes[0].arrivesAt) < Date.parse('2026-11-16T02:30:00Z'));

  // Deshacer un confirmado: los dos lados vuelven, y la orden se borra.
  w = entorno({ snaps: SN.map(x => Object.assign({}, x, { ordered: x.id === 's-c-abierta' ? 12 : x.id === 's-w-abierta' ? -12 : x.ordered })),
    filas: [Object.assign({}, BASE, { status: 'confirmed', to_item: 'Triage Vodka', vendor_order_id: 'ord_7', created_at: new Date().toISOString() })] });
  r = await w.BarStockTransfers.deshacer(w.__filas[0], 'Axel', '2026-11-16T02:30:00Z');
  const borra = w.__pet.filter(x => x.metodo === 'DELETE').map(x => x.url);
  prueba('Undo de un confirmado: los dos lados a 0 y su orden borrada', r.ok && snap(w, 's-c-abierta').ordered === 0 && snap(w, 's-w-abierta').ordered === 0 &&
    borra.some(u => /vendor_orders\?app_order_id=eq\.ord_7/.test(u)) && borra.some(u => /vendor_order_items\?app_order_id=eq\.ord_7/.test(u)), JSON.stringify([w.__snaps, borra]));

  // "Not right" de un pendiente: sólo se quita lo de quien lo registró (W+B).
  w = entorno({ snaps: SN.map(x => Object.assign({}, x, { ordered: x.id === 's-w-abierta' ? -12 : x.ordered })), filas: [Object.assign({}, BASE)] });
  r = await w.BarStockTransfers.rechazar(w.__filas[0], 'no', 'Axel');
  prueba('"Not right": W+B (que lo registró) vuelve a 0; Crown no se toca', r.ok && snap(w, 's-w-abierta').ordered === 0 && snap(w, 's-c-abierta').ordered == null);

  // Sin semana de Pour·IQ: el transfer queda, y se dice.
  w = entorno({ snaps: [] });
  r = await w.BarStockTransfers.crear({ otra: WB, entra: false, item: 'Tito', qty: 2 });
  prueba('si Pour·IQ no se pudo, el transfer queda y lo dice', r.ok && /Pour·IQ/.test(r.aviso || ''), JSON.stringify(r));
}

grupo('4d · un transfer, varias líneas (migración 046)');
{
  const SN = [
    { id: 's-tv', loc: CROWN, item: 'Triage Vodka', week_start: '2026-11-16', ordered: null, used: null, on_hand_end: null },
    { id: 's-ti', loc: CROWN, item: 'Tito', week_start: '2026-11-16', ordered: null, used: null, on_hand_end: null },
    { id: 's-wtv', loc: WB, item: 'Triage House Vodka', week_start: '2026-11-16', ordered: null, used: null, on_hand_end: null },
    { id: 's-wti', loc: WB, item: "Tito's", week_start: '2026-11-16', ordered: null, used: null, on_hand_end: null }
  ];
  let w = entorno({ snaps: SN });
  w.state.master.push({ item: 'Tito', code: 'T1', value: 20 });
  let r = await w.BarStockTransfers.crear({ otra: WB, entra: true, por: 'Axel',
    lineas: [{ item: 'Triage Vodka', otroItem: 'Triage House Vodka', qty: 12 }, { item: 'Tito', qty: 4 }] });
  const p = w.__pet.find(x => x.metodo === 'POST' && /location_transfers/.test(x.url));
  prueba('dos líneas: dos filas en UN POST, con el mismo group_id', r.ok && Array.isArray(p.cuerpo) && p.cuerpo.length === 2 &&
    p.cuerpo[0].group_id && p.cuerpo[0].group_id === p.cuerpo[1].group_id, JSON.stringify(p && p.cuerpo));
  prueba('UNA orden en Sent con las dos líneas', w.__ordenes.length === 1 && w.__ordenes[0].items.length === 2 &&
    w.__ordenes[0].items[1].item === 'Tito' && w.__ordenes[0].items[1].value === 20, JSON.stringify(w.__ordenes));
  prueba('las dos filas apuntan a esa orden', w.__filas.every(f => f.vendor_order_id === 'ord_1'));
  prueba('y Pour·IQ, cada producto en su semana', w.__snaps.find(x => x.id === 's-tv').ordered === 12 && w.__snaps.find(x => x.id === 's-ti').ordered === 4);
  const un = entorno({ snaps: SN });
  await un.BarStockTransfers.crear({ otra: WB, entra: true, item: 'Triage Vodka', qty: 1 });
  const p1 = un.__pet.find(x => x.metodo === 'POST' && /location_transfers/.test(x.url));
  prueba('un producto va solo, sin group_id (entra aunque falte la 046)', p1 && !Array.isArray(p1.cuerpo) && !('group_id' in p1.cuerpo));
  prueba('grupos() los junta por group_id, y lo de antes va solo', w.BarStockTransfers.grupos(w.__filas.concat([{ id: 'x-1' }])).map(g => g.length).join(',') === '2,1');

  // W+B confirma el grupo: cada una con SU producto, una sola vez.
  const w2 = entorno({ loc: WB, snaps: SN, filas: w.__filas.map(f => Object.assign({}, f)) });
  r = await w2.BarStockTransfers.confirmar(w2.__filas, { [w2.__filas[0].id]: 'Triage House Vodka', [w2.__filas[1].id]: "Tito's" }, 'Mia');
  prueba('confirmar el grupo: las dos, cada una con su producto, y −qty en cada semana de W+B',
    r.ok && w2.__filas.every(f => f.status === 'confirmed') && w2.__filas[1].from_item === "Tito's" &&
    w2.__snaps.find(x => x.id === 's-wtv').ordered === -12 && w2.__snaps.find(x => x.id === 's-wti').ordered === -4 && !w2.__ordenes.length, JSON.stringify(w2.__filas));
  prueba('sin producto para alguna, no confirma ninguna', (await entorno({ loc: WB, filas: w.__filas.map(f => Object.assign({}, f)) })
    .BarStockTransfers.confirmar(w.__filas, { [w.__filas[0].id]: 'Triage House Vodka' }, 'Mia')).ok === false);

  // Deshacer el grupo confirmado: todo a 0 y la orden borrada UNA vez.
  const w3 = entorno({ snaps: SN.map(x => Object.assign({}, x, { ordered: { 's-tv': 12, 's-ti': 4, 's-wtv': -12, 's-wti': -4 }[x.id] })),
    filas: w2.__filas.map(f => Object.assign({}, f, { created_at: new Date().toISOString() })) });
  r = await w3.BarStockTransfers.deshacer(w3.__filas, 'Axel', '2026-11-16T02:30:00Z');
  const borra = w3.__pet.filter(x => x.metodo === 'DELETE' && /vendor_orders\?/.test(x.url));
  prueba('Undo del grupo: los cuatro a 0 y su orden borrada una sola vez', r.ok && w3.__snaps.every(x => x.ordered === 0) && borra.length === 1, JSON.stringify([w3.__snaps, borra.length]));
}

grupo('4c · el LIVE de la que da (live-stock.js)');
{
  const v = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
  v.console = { log() {}, warn() {}, error() {} };
  v.eval(leer('src/order-receipts.js'));
  v.eval(leer('src/live-stock.js'));
  const L = v.BarStockLive;
  const base = { master: [{ item: 'Tito', onHand: 10 }], ordenes: [], repartido: new Map(), recibos: [], vendido: [],
    conteo: Date.parse('2026-11-16T02:30:00Z'), diaConteo: '2026-11-15', ahora: Date.parse('2026-11-18T20:00:00Z') };
  const f = (o) => L.calcular(Object.assign({}, base, o)).find(x => x.producto === 'Tito');
  const sal = f({ salidas: [{ item: 'Tito', n: 2, cuando: '2026-11-17T18:00:00Z', a: "Will's & Bill's" }] });
  prueba('lo que salió después del conteo resta (10 − 2 = 8)', sal.live === 8 && sal.llego === -2 && sal.movimiento === true, JSON.stringify(sal));
  prueba('y queda dicho de dónde', sal.de.some(x => /transfer to Will's & Bill's −2/.test(x)) && sal.llegadas.some(x => x.n === -2));
  prueba('lo de antes del conteo, no', f({ salidas: [{ item: 'Tito', n: 2, cuando: '2026-11-15T20:00:00Z' }] }).live === 10);
  const ls = leer('src/live-stock.js');
  prueba('armarFilas lee las salidas que cuentan aquí, sin las de antes del conteo', /salidas = filas\.filter\(t => t\.from_location === locId && TR\.cuentaAqui\(t, locId\) && !t\.before_count/.test(ls));
  const idx = leer('index.html');
  prueba('transfers.js antes de live-stock.js', idx.indexOf('src/transfers.js?') > 0 && idx.indexOf('src/transfers.js?') < idx.indexOf('src/live-stock.js?'));
  prueba('y el correo del servidor lo carga antes también', (() => { const m = require(path.join(RAIZ, 'lib/morning-cron.js')).MODULOS; return m.indexOf('transfers') >= 0 && m.indexOf('transfers') < m.indexOf('live-stock'); })());
}

grupo('5 · la sección Transfers (src/mobile-transfers.js, lámina B)');
{
  const w = entorno({ snaps: [] });
  w.BarStockLiveCache = { conteo: () => '2026-11-16T02:30:00Z', caducar: () => { w.__cad = (w.__cad || 0) + 1; } };
  w.BarStockToast = { show: (t) => { w.__toast = t; } };
  w.BarStockDialog = { preguntar: async () => true };
  w.state.master.push({ item: 'Tito', code: 'T1', value: 20 });
  let def = null;
  w.BarStockMobile = { register: (d) => { def = d; }, enBanda: (t) => { w.__banda = t; return true; },
    alVolverBanda: (f) => { w.__atras = f; }, volver: () => { w.__volvio = true; }, ir: (id) => { w.__ido = id; } };
  // El teclado de iOS: la parte visible es 300 px de alto y la página
  // se ha desplazado 40 px (visualViewport, como en el iPhone).
  const vvOyentes = {};
  Object.defineProperty(w, 'visualViewport', { configurable: true, value: { offsetTop: 40, height: 300,
    addEventListener: (e, f) => { (vvOyentes[e] = vvOyentes[e] || []).push(f); },
    removeEventListener: (e, f) => { vvOyentes[e] = (vvOyentes[e] || []).filter(x => x !== f); } } });
  w.eval(leer('src/sheet.js'));
  w.eval(leer('src/bottle-search.js'));
  w.eval(leer('src/transfer-confirm.js'));
  if (existe('src/mobile-transfers.js')) w.eval(leer('src/mobile-transfers.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  prueba('existe y se registra como pantalla (no pestaña)', !!def && def.id === 'transfers' && def.tab === false);
  if (def) {
    const host = w.document.createElement('div');
    host.className = 'm-screen on'; w.document.body.appendChild(host);
    def.mount(host);
    await new Promise(r => setTimeout(r, 30));
    const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
    prueba('"Transfers" en la banda, con atrás, y "New transfer" arriba', w.__banda === 'Transfers' && !!w.__atras && !!host.querySelector('#mTxNew'));
    prueba('sin nada esta semana, lo dice', /No transfers this week/.test(txt(host)), txt(host));
    host.querySelector('#mTxNew').click();
    prueba('"New transfer" en la banda; con una sola otra locación, ya elegida', w.__banda === 'New transfer' && !!host.querySelector('[data-loc].on'));
    const dirs = [...host.querySelectorAll('[data-dir]')];
    prueba('"Out of" a la izquierda y elegido de entrada; "Into" a la derecha (Axel, 2026-11-18)',
      dirs.length === 2 && dirs[0].dataset.dir === 'out' && dirs[0].classList.contains('on') && dirs[1].dataset.dir === 'in');
    prueba('"Transfer N bottles" es el botón de Done (mismo cristal, fijo en su sitio), al final',
      !!host.querySelector('#mTxGo') && host.lastElementChild === host.querySelector('#mTxGo') &&
      /#mScreens :is\(#mRoDone, #mTxGo[^)]*\),\n\s*body\.m-shell #mTabs \.m-tab\.on \{/.test(leer('styles/mobile-app.css')) &&
      /#mScreens :is\(#mTxGo[^)]*\) \{\s*position: fixed;[^}]*bottom: calc\(env\(safe-area-inset-bottom, 0px\) \+ 110px - var\(--m-base\) \* 2\.7\)/.test(leer('styles/mobile-app.css')));
    host.querySelector('[data-dir="in"]').click();
    prueba('sin productos no deja transferir', host.querySelector('#mTxGo').disabled && /Add a product/.test(txt(host.querySelector('#mTxGo'))));
    host.querySelector('#mTxAdd').click();
    let hoja = w.document.getElementById('mSheet');
    // Axel, 2026-11-18, lámina A: el buscador de toda la app a pantalla
    // completa (bottle-search.js), no una hoja propia que se movía.
    prueba('"Add a product" abre el buscador a pantalla completa, con mis productos', !!hoja && hoja.classList.contains('m-bus') &&
      !!hoja.querySelector('.m-bus-in') && hoja.querySelectorAll('.m-bus-lista [data-p]').length === 2, hoja && hoja.textContent.slice(0, 90));
    // Axel, 2026-11-18: medir sólo lo de encima del teclado dejaba un
    // hueco. Ocupa la pantalla entera; el teclado va encima y la lista
    // deja al final el aire de lo que tapa.
    const alto = w.innerHeight;
    prueba('ocupa la pantalla entera, sin hueco sobre el teclado; la lista sabe cuánto tapa',
      hoja.style.top === '40px' && hoja.style.height === alto + 'px' && hoja.style.getPropertyValue('--teclado') === (alto - 300) + 'px',
      hoja.style.top + ' ' + hoja.style.height + ' ' + hoja.style.getPropertyValue('--teclado'));
    w.visualViewport.offsetTop = 0; w.visualViewport.height = alto;
    (vvOyentes.resize || []).forEach(f => f());
    prueba('y lo sigue cuando el teclado se va', hoja.style.getPropertyValue('--teclado') === '0px', hoja.style.getPropertyValue('--teclado'));
    const inp = hoja.querySelector('.m-bus-in');
    inp.value = 'triag'; inp.dispatchEvent(new w.Event('input'));
    prueba('escribir filtra', hoja.querySelectorAll('.m-bus-lista [data-p]').length === 1);
    hoja.querySelector('[data-p="Triage Vodka"]').click();
    prueba('elegir lo cierra y lo añade', !w.document.getElementById('mSheet') && /Triage Vodka/.test(txt(host)));
    host.querySelector('#mTxAdd').click();
    hoja = w.document.getElementById('mSheet');
    prueba('lo ya puesto no vuelve a salir', hoja.querySelectorAll('.m-bus-lista [data-p]').length === 1);
    hoja.querySelector('[data-p="Tito"]').click();
    for (let k = 0; k < 11; k++) host.querySelector('[data-q="0"][data-d="1"]').click();
    host.querySelector('[data-q="1"][data-d="1"]').click();
    host.querySelector('[data-cuando="antes"]').click();
    prueba('el botón dice el total ("Transfer 14 bottles")', /Transfer 14 bottles/.test(txt(host.querySelector('#mTxGo'))), txt(host.querySelector('#mTxGo')));
    host.querySelector('#mTxGo').click();
    await new Promise(r => setTimeout(r, 40));
    const p = w.__pet.find(x => x.metodo === 'POST' && /location_transfers/.test(x.url));
    prueba('guarda UN transfer de dos líneas, de W+B a Crown, antes del conteo', p && Array.isArray(p.cuerpo) && p.cuerpo.length === 2 &&
      p.cuerpo[0].to_item === 'Triage Vodka' && p.cuerpo[0].qty === 12 && p.cuerpo[1].to_item === 'Tito' && p.cuerpo[1].qty === 2 &&
      p.cuerpo.every(x => x.before_count && x.from_location === WB), JSON.stringify(p && p.cuerpo));
    prueba('y vuelve a la lista, avisando', w.__banda === 'Transfers' && /Transfer saved/.test(w.__toast || ''));
  }
  {
    const css = leer('styles/mobile-app.css');
    prueba('el buscador es un velo transparente sobre el fondo de la app: lo de debajo se esconde',
      /#mSheet\.m-bus \{ background: none; \}/.test(css) && /#mSheet \.m-bus-box \{[^}]*background: none;/.test(css) &&
      // Salvo mientras sale de un botón (.m-bus-sale, el + de una orden):
      // entonces la página sigue detrás, desenfocada por el buscador.
      /body:has\(#mSheet\.m-bus:not\(\.m-bus-sale\)\) :is\(#mScreens, #mBand, #mTabs, #mFloor, #mDock, #mPull\) \{ visibility: hidden; \}/.test(css));
    prueba('la lista deja al final el aire del teclado', /\.m-bus-lista \{[^}]*padding-bottom: calc\(var\(--teclado, 0px\) \+ 12px\)/.test(css));
  }
  prueba('"Which is yours?" al confirmar usa el mismo buscador', /BarStockBottleSearch/.test(leer('src/transfer-confirm.js')) &&
    /pantalla: true/.test(leer('src/transfer-confirm.js')) && !/m-tr-buscar/.test(leer('src/transfer-confirm.js') + leer('src/mobile-transfers.js')));
  {
    // Cerrar la hoja suelta el teclado: nada sigue escuchando.
    const antes = (vvOyentes.resize || []).length;
    const hh = w.document.createElement('div'); w.document.body.appendChild(hh);
    if (w.BarStockSheet.alTeclado) w.BarStockSheet.alTeclado(hh); hh.remove();
    (vvOyentes.resize || []).slice().forEach(f => f());
    prueba('una hoja cerrada deja de escuchar al teclado', (vvOyentes.resize || []).length <= antes, (vvOyentes.resize || []).length + ' vs ' + antes);
  }
  const ms = leer('src/mobile-search.js'), tabs = leer('src/mobile-tabs.js');
  prueba('la ficha ya no lleva "⇄ Transfer" (Axel: fuera de Do we have)', !/id="msTrf"/.test(ms) && !/BarStockMobileTransfer\./.test(ms) && !existe('src/mobile-transfer.js'));
  prueba('More lleva "Transfers" con su número, sólo con permiso de órdenes', /id="mMoreTrf"/.test(tabs) && /id="mMoreTrfN"/.test(tabs) &&
    /BarStockTransfers\.puede\(\)/.test(tabs) && /ir\('transfers'\)/.test(tabs));
  const idx = leer('index.html');
  const pos = (f) => idx.indexOf('src/' + f + '?');
  prueba('transfers → transfer-confirm → mobile-transfers → mobile-tabs', pos('transfers.js') > 0 && pos('transfers.js') < pos('transfer-confirm.js') &&
    pos('transfer-confirm.js') < pos('mobile-transfers.js') && pos('mobile-transfers.js') < pos('mobile-tabs.js') && pos('mobile-transfer.js') === -1);
}

grupo('6 · la factura (fase 4)');
{
  const v = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
  v.console = { log() {}, warn() {}, error() {} };
  v.eval(leer('src/order-receipts.js'));
  v.eval(leer('src/invoice-order-auto.js'));
  const A = v.BarStockInvoiceOrderAuto;
  // El ciclo abrió el domingo 15 por la noche; la factura del lunes 16.
  const d = (ordenes) => ({
    desde: '2026-11-16T02:30:00Z',
    lineas: [{ order_id: 'METF_1116', product_id: 'p-tv', quantity: 12, unit_price: 5.5, invoice_date: '2026-11-16', vendor_name: 'McKenzie Brew House - GFS - Internal Transfers' }],
    enlaces: [{ product_id: 'p-tv', item_name: 'Triage Vodka' }],
    ordenes, lineasOrden: ordenes.map(o => ({ vendor_order_id: o.id, item_name: 'Triage Vodka' })), yaEnlazadas: []
  });
  const antes = '2026-11-16T02:29:00Z';
  let r = A.proponer(d([{ id: 'o-tr', vendor: 'TRANSFER', subtotal: 66, created_at: antes, po_number: 'CT-0230' }]));
  prueba('la orden TRANSFER de antes del conteo se queda con la factura de "Internal Transfers"', r[0] && r[0].enlaza === 'o-tr', JSON.stringify(r));
  r = A.proponer(d([{ id: 'o-loop', vendor: 'LOOP', subtotal: 66, created_at: antes, po_number: 'CT-0229' }]));
  prueba('una orden normal de antes del ciclo, no (el pasado no se mueve)', r[0] && r[0].enlaza === null, JSON.stringify(r));

  const mi = leer('src/mobile-invoices.js');
  prueba('en la factura sin enlazar: "It arrived before the count", con permiso, conteo y líneas con producto',
    /id="miAntes"/.test(mi) && /TR\.puede\(\) && LC && LC\.conteo && LC\.conteo\(\) && f\.lineas\.some\(l => l\.item && l\.qty > 0\)/.test(mi));
  prueba('crea UN transfer "antes del conteo" con todas las líneas, desde la locación elegida', /TR\.crear\(\{ otra, entra: true, antes: true, conteo, por[^}]*\n?\s*lineas: lineas\.map/.test(mi));
  prueba('y enlaza la factura a la orden del transfer', /guardarEnlaceOrden\(f\.id, ord\[0\]\.id\)/.test(mi));
  prueba('lo que no se pudo, se dice', /Fixed, but not everything/.test(mi));
  {
    const css = leer('styles/mobile-app.css');
    prueba('los dos de la factura, de cristal (lámina B): en la regla del cristal y con su reflejo',
      /:is\([^)]*#miOrdOn, #miAntes[^)]*\),\n/.test(css) && /:is\([^)]*#miOrdOn, #miAntes[^)]*\)::before,/.test(css));
    prueba('"Link to an order" azul (el de Done) y "It arrived before the count" violeta',
      /:is\(#mRoDone, #mTxGo, #miOrdOn[^)]*\),\n\s*body\.m-shell #mTabs \.m-tab\.on \{/.test(css) &&
      /#mScreens #miAntes \{[^}]*rgba\(139, 92, 246/.test(css));
    prueba('centrados en la tarjeta', /\.m-iatar \{ text-align: center; \}/.test(css));
  }
  prueba('el segundo botón no va pegado a la nota del primero (Axel: "están encimados")',
    /\.m-iatar \.m-iatar-s \+ \.m-ialt \{ margin-top: 16px; \}/.test(leer('styles/mobile-app.css')));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
