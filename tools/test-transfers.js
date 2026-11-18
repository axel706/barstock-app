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
    if (m === 'POST') { const f = Object.assign({ id: 'tr-' + (w.__filas.length + 1), status: 'pending', created_at: new Date().toISOString() }, cuerpo); w.__filas.push(f); return { ok: true, status: 201, text: async () => JSON.stringify([f]) }; }
    if (m === 'PATCH') {
      const id = decodeURIComponent((u.match(/id=eq\.([^&]+)/) || [])[1] || '');
      const solo = (u.match(/status=(eq|in)\.([^&]+)/) || [])[2];
      const vale = (s) => !solo || (solo.startsWith('(') ? solo.slice(1, -1).split(',').includes(s) : s === solo);
      const hechas = w.__filas.filter(f => f.id === id && vale(f.status));
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
    return [];
  } };
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

grupo('5 · la hoja "⇄ Transfer" (src/mobile-transfer.js)');
{
  const w = entorno();
  w.BarStockLiveCache = { conteo: () => '2026-11-16T02:30:00Z', caducar: () => { w.__cad = (w.__cad || 0) + 1; } };
  w.BarStockToast = { show: (t) => { w.__toast = t; } };
  if (existe('src/mobile-transfer.js')) w.eval(leer('src/mobile-transfer.js'));
  const M = w.BarStockMobileTransfer;
  prueba('existe', !!M && typeof M.abrir === 'function');
  if (M) {
    let hecho = null;
    await M.abrir({ item: 'Triage Vodka' }, (t) => { hecho = t; });
    const hoja = w.document.getElementById('mSheet');
    const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
    prueba('"Into" y "Out of" con el nombre corto de la locación', /Into Crown Tavern/.test(txt(hoja)) && /Out of Crown Tavern/.test(txt(hoja)), txt(hoja));
    prueba('con una sola otra locación, ya elegida', !!hoja.querySelector('[data-loc].on') && !hoja.querySelector('#mTrGo').disabled);
    prueba('"Before the count" con el día del conteo', /Before the count · Sun Nov 15/.test(txt(hoja)), txt(hoja));
    hoja.querySelector('[data-n="12"]').click();
    hoja.querySelector('[data-cuando="antes"]').click();
    prueba('el botón dice cuántas', /Transfer 12/.test(txt(hoja.querySelector('#mTrGo'))));
    hoja.querySelector('#mTrGo').click();
    await new Promise(r => setTimeout(r, 20));
    const p = w.__pet.find(x => x.metodo === 'POST');
    prueba('guarda: 12 de W+B a Crown, antes del conteo', p && p.cuerpo.qty === 12 && p.cuerpo.from_location === WB && p.cuerpo.to_location === CROWN &&
      p.cuerpo.before_count === true && p.cuerpo.to_item === 'Triage Vodka' && p.cuerpo.created_by === 'Axel', JSON.stringify(p && p.cuerpo));
    prueba('cierra, avisa y vuelve a quien la abrió', !w.document.getElementById('mSheet') && /Transfer saved/.test(w.__toast || '') && !!hecho && w.__cad === 1);
  }
  const ms = leer('src/mobile-search.js');
  prueba('la ficha lleva "⇄ Transfer" en su propia fila y abre la hoja', /id="msTrf"/.test(ms) && /BarStockMobileTransfer\.abrir\(r, \(\) => ficha\(host, idx\)\)/.test(ms));
  const idx = leer('index.html');
  const pos = (f) => idx.indexOf('src/' + f + '?');
  prueba('transfers.js y mobile-transfer.js antes de mobile-search', pos('transfers.js') > 0 && pos('transfers.js') < pos('mobile-transfer.js') && pos('mobile-transfer.js') < pos('mobile-search.js'));
  prueba('quien no hace órdenes no lo ve (la fila es .m-acts, ya escondida)', /html\.bs-sin-ordenes #mSheet \.m-ficha \.m-acts/.test(leer('styles/mobile-app.css')) && /class="m-acts m-acts-trf"/.test(ms));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
