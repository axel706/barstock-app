/*
 * ── Confirmar un transfer desde la otra locación (lámina C) ──────────
 *
 * docs/plan-transfer.md. La otra locación "sin mover un dedo, sólo lo
 * confirma": la tarjeta del Home (primera), la campana y el bloque de la
 * ficha. Lo que no puede volver a pasar:
 *
 *   1. Confirmar con el producto equivocado: el de la pareja recordada,
 *      el que se llama igual, o se elige; nunca uno a ciegas.
 *   2. Que quien no puede hacer órdenes vea botones para confirmar.
 *   3. Que un "Not right" se pierda: quien lo mandó lo ve en su campana.
 *   4. Que la tarjeta no vaya primera.
 *
 *   node tools/test-transfer-confirm.js
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
const esperar = ms => new Promise(r => setTimeout(r, ms || 0));

const CROWN = 'c-1', WB = 'w-2';
const PEND = { id: 'tr-9', from_location: WB, to_location: CROWN, from_item: 'Triage House Vodka', to_item: null, qty: 12,
  moved_at: '2026-11-18T19:10:00Z', created_at: '2026-11-18T19:10:00Z', before_count: false, started_at: WB, status: 'pending', created_by: 'Mia' };

function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  w.state = { master: (o.master || ['Triage Vodka', 'Tito']).map(item => ({ item })) };
  w.BarStockInventoryCloud = { fetchLocationId: async () => o.loc || CROWN };
  w.BarStockGuest = { puede: (k) => !(o.sin || []).includes(k), nombre: () => 'Axel' };
  w.__conf = []; w.__rech = []; w.__toast = [];
  w.BarStockToast = { show: (t) => w.__toast.push(t) };
  w.BarStockDialog = { preguntar: async () => true };
  w.BarStockLiveCache = { conteo: () => o.conteo || '2026-11-16T02:30:00Z', caducar: () => { w.__cad = (w.__cad || 0) + 1; } };
  w.eval(leer('src/transfers.js'));
  const T = w.BarStockTransfers;
  T.leer = async () => (o.filas || [PEND]).map(x => Object.assign({}, x));
  T.locaciones = async () => [{ id: CROWN, name: 'The Crown Tavern' }, { id: WB, name: "Will's & Bill's" }];
  T.confirmar = async (t, item, por) => { w.__conf.push({ id: t.id, item, por }); return { ok: true }; };
  T.rechazar = async (t, nota, por) => { w.__rech.push({ id: t.id, nota, por }); return { ok: true }; };
  if (existe('src/transfer-confirm.js')) w.eval(leer('src/transfer-confirm.js'));
  return w;
}
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

(async () => {

grupo('1 · la tarjeta del Home');
{
  const w = entorno({ filas: [PEND, Object.assign({}, PEND, { id: 'tr-1', status: 'confirmed', to_item: 'Triage Vodka', moved_at: '2026-11-01T19:00:00Z' })] });
  const TC = w.BarStockTransferConfirm;
  prueba('existe', !!TC && typeof TC.tarjeta === 'function');
  if (TC) {
    prueba('antes de leer, nada', TC.tarjeta() === null);
    await TC.cargar();
    const c = TC.tarjeta();
    prueba('"⇄ Transfer to confirm": cuántas, de dónde, quién', !!c && c.k === '⇄ Transfer to confirm' && c.tt === '12 Triage Vodka' &&
      /^from Will's & Bill's · Wed 2:10 PM · Mia$/.test(c.sub), JSON.stringify(c && [c.tt, c.sub]));
    prueba('su producto y el mío (la pareja recordada)', c.filas[0].v === 'Triage House Vodka' && c.filas[1].v === 'Triage Vodka');
    prueba('Confirm 12, Not right y Change', c.btn === 'Confirm 12' && c.btn2 === 'Not right' && c.btn3 === 'Change');
    await c.go();
    prueba('confirma con MI producto y quién', w.__conf.length === 1 && w.__conf[0].item === 'Triage Vodka' && w.__conf[0].por === 'Axel', JSON.stringify(w.__conf));
    prueba('y el LIVE se rehace', w.__cad === 1);
    await c.go2();
    prueba('"Not right" pregunta y lo marca, diciendo dónde', w.__rech.length === 1 && /Not right at The Crown Tavern/.test(w.__rech[0].nota));
  }
}

grupo('2 · mi producto: pareja, mismo nombre, o se elige');
{
  const w = entorno({ master: ['Triage House Vodka', 'Tito'] });
  await w.BarStockTransferConfirm.cargar();
  prueba('sin pareja pero con el mismo nombre aquí: ése', w.BarStockTransferConfirm.tarjeta().filas[1].v === 'Triage House Vodka');
  const w2 = entorno({ master: ['Triage Vodka 1L', 'Tito'] });
  const TC = w2.BarStockTransferConfirm;
  await TC.cargar();
  const c = TC.tarjeta();
  prueba('sin pareja ni nombre igual: "Choose yours", sin confirmar a ciegas', c.btn === 'Choose yours' && c.filas[1].v === 'Choose' && !c.btn3);
  await c.go();
  const hoja = w2.document.getElementById('mSheet');
  prueba('abre la lista de mis productos, el parecido primero', !!hoja && /Which is yours/.test(txt(hoja)) &&
    hoja.querySelector('[data-item]').dataset.item === 'Triage Vodka 1L', txt(hoja));
  prueba('no confirmó nada todavía', w2.__conf.length === 0);
  const inp = hoja.querySelector('.m-tr-buscar');
  prueba('el buscador no hace zoom en iOS (16 px)', /\.m-tr-buscar \{[^}]*font-size: max\(16px/.test(leer('styles/mobile-app.css')));
  inp.value = 'tito'; inp.oninput();
  prueba('busca', hoja.querySelectorAll('[data-item]').length === 1);
  inp.value = ''; inp.oninput();
  hoja.querySelector('[data-item="Triage Vodka 1L"]').click();
  await esperar(10);
  prueba('elegido: confirma con ése', w2.__conf.length === 1 && w2.__conf[0].item === 'Triage Vodka 1L', JSON.stringify(w2.__conf));
}

grupo('3 · quién la ve');
{
  const w = entorno();
  await w.BarStockTransferConfirm.cargar();
  prueba('en W+B, que lo mandó, no hay tarjeta', (await (async () => { const v = entorno({ loc: WB }); await v.BarStockTransferConfirm.cargar(); return v.BarStockTransferConfirm.tarjeta(); })()) === null);
  const s = entorno({ sin: ['ordenes'] });
  await s.BarStockTransferConfirm.cargar();
  prueba('sin "Make and send orders", ni tarjeta ni campana ni botones', s.BarStockTransferConfirm.tarjeta() === null && s.BarStockTransferConfirm.avisos().length === 0);
  prueba('con permiso, en la campana con su botón', w.BarStockTransferConfirm.avisos().length === 1 &&
    /12 Triage House Vodka from Will's & Bill's/.test(w.BarStockTransferConfirm.avisos()[0].titulo));
}

grupo('4 · "Not right" llega a quien lo mandó');
{
  const no = Object.assign({}, PEND, { status: 'rejected', status_by: 'Axel', status_at: new Date().toISOString() });
  const w = entorno({ loc: WB, filas: [no] });
  await w.BarStockTransferConfirm.cargar();
  const r = w.BarStockTransferConfirm.rechazados();
  prueba('en su campana: "Crown Tavern says the transfer is not right"', r.length === 1 && /Crown Tavern says the transfer is not right/.test(r[0].titulo) &&
    /does not count in either location/.test(r[0].sub), JSON.stringify(r));
  const w2 = entorno({ loc: CROWN, filas: [no] });
  await w2.BarStockTransferConfirm.cargar();
  prueba('a quien lo rechazó, no', w2.BarStockTransferConfirm.rechazados().length === 0);
}

grupo('5 · el bloque "Transfers" de la ficha');
{
  const mio = Object.assign({}, PEND, { id: 'tr-5', from_location: CROWN, to_location: WB, from_item: 'Tito', to_item: null, started_at: CROWN, qty: 2 });
  // Con la pareja recordada (un transfer confirmado de antes): sin ella
  // no se sabe de qué producto mío es, y no sale en ninguna ficha (sí en
  // el Home y en la campana).
  const viejo = Object.assign({}, PEND, { id: 'tr-1', status: 'confirmed', to_item: 'Triage Vodka', moved_at: '2026-11-01T19:00:00Z', created_at: '2026-11-01T19:00:00Z' });
  const w = entorno({ filas: [PEND, mio, viejo] });
  const TC = w.BarStockTransferConfirm;
  await TC.cargar();
  const d = w.document.createElement('div');
  d.innerHTML = TC.ficha('Triage Vodka');
  prueba('lo que me toca: "12 coming from W+B · Confirm · Not right"', /12 coming from Will's & Bill's/.test(txt(d)) && !!d.querySelector('[data-trf-ok]') && !!d.querySelector('[data-trf-no]'), txt(d));
  d.innerHTML = TC.ficha('Tito');
  prueba('lo que mandé: "−2 to W+B · waiting for W+B" y Undo', /−2 to Will's & Bill's/.test(txt(d)) && /waiting for Will's & Bill's/.test(txt(d)) && !!d.querySelector('[data-trf-undo]'), txt(d));
  prueba('un producto sin nada, sin bloque', TC.ficha('Otro') === '');
  d.innerHTML = TC.ficha('Triage Vodka');
  TC.enganchar(d, () => {});
  d.querySelector('[data-trf-ok]').click();
  await esperar(10);
  prueba('Confirm desde la ficha confirma', w.__conf.length === 1);
}

grupo('6 · conectado');
{
  const mh = leer('src/mobile-home.js'), mn = leer('src/mobile-notif.js'), ms = leer('src/mobile-search.js');
  prueba('el Home la pone delante de todo', /const ct = TC\.tarjeta\(\);\s*if \(ct\) t\.unshift\(ct\)/.test(mh) &&
    mh.indexOf('t.unshift(ct)') > mh.indexOf('iFoco > 0'));
  prueba('y repinta cuando llega', /BarStockTransferConfirm\.alCambiar\(\(\) => refresh\(\)\)/.test(mh));
  prueba('la campana: arriba, con Confirm y Not right, y los "Not right" de vuelta', /TC\.avisos\(\)/.test(mn) && /data-tc=/.test(mn) && /data-tn=/.test(mn) && /TC\.rechazados\(\)/.test(mn));
  prueba('la ficha: su bloque', /id="msTrfs"/.test(ms) && /pintarTransfers\(caja, r\.item\)/.test(ms));
  const idx = leer('index.html');
  const pos = (f) => idx.indexOf('src/' + f + '?');
  prueba('transfer-confirm después de transfers, antes de Home, Buscar y la campana',
    pos('transfer-confirm.js') > pos('transfers.js') && pos('transfer-confirm.js') < pos('mobile-home.js') &&
    pos('transfer-confirm.js') < pos('mobile-search.js') && pos('transfer-confirm.js') < pos('mobile-notif.js'));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
