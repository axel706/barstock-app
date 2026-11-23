#!/usr/bin/env node
/*
 * ── Saltar el conteo de una semana (src/count-skip.js) ───────────────
 *
 * Axel, 2026-11-22/23, sobre lámina (opción A): una locación que no puede
 * contar salta la semana. Lo que se protege:
 *
 *   1. El LIVE no se mueve con el salto: el ciclo de pedidos se abre,
 *      pero el LIVE sigue contando desde el inicio de antes (y desde el
 *      de antes de ése si se saltaron dos semanas). Uno deshecho no
 *      cuenta. Sin la tabla, todo como antes.
 *   2. Saltar NO toca el on hand. Primero guarda el salto y sólo
 *      después abre el ciclo: si el salto no se puede guardar, no se
 *      mueve nada (sin él, el LIVE perdería la semana).
 *   3. Undo sólo mientras no haya salido una orden del ciclo saltado, y
 *      devuelve el ciclo al inicio de antes.

 *   5. En la semana saltada, Open pide con el LIVE o con el estante
 *      vacío (el interruptor de arriba, lámina A); lo puesto a mano
 *      sigue mandando, y sin salto nada cambia.
 *   4. Lo pide "Count inventory", no "Close the count, restart the
 *      cycle"; el correo de la mañana también sigue el salto.
 *
 *   node tools/test-saltar-conteo.js
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

const DOM_15 = '2026-11-16T01:30:00.000Z';   // el conteo del domingo 15, de noche
const SALTO = '2026-11-22T22:00:00.000Z';    // el salto del domingo 22

function entorno({ saltos = [], resetAt = SALTO, sesion = DOM_15, sinTabla = false, ordenes = [] } = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k', LOCATION_NAME: 'The Crown Tavern', ACCOUNT_ID: 'wjm' };
  w.console = { log() {}, warn() {}, error() {} };
  const llamadas = [];
  let inicio = resetAt ? new Date(resetAt) : null;
  w.fetch = async (url, opt = {}) => {
    const metodo = opt.method || 'GET';
    llamadas.push({ url: String(url), metodo, cuerpo: opt.body ? JSON.parse(opt.body) : null });
    const res = (b, st = 200) => ({ ok: st < 300, status: st, json: async () => b, text: async () => JSON.stringify(b) });
    if (/count_skips/.test(url)) {
      if (sinTabla) return res({ message: 'relation "count_skips" does not exist' }, 404);
      if (metodo === 'POST') { const b = JSON.parse(opt.body); saltos.unshift(Object.assign({ id: saltos.length + 1, undone_at: null }, b)); return res(null, 201); }
      if (metodo === 'PATCH') { const id = /id=eq\.(\d+)/.exec(url)[1]; saltos.filter(f => String(f.id) === id).forEach(f => Object.assign(f, JSON.parse(opt.body))); return res(null, 204); }
      return res(saltos.map(f => Object.assign({}, f)));
    }
    return res([]);
  };
  w.state = { master: [{ item: "Tito's", onHand: 3, orderOverride: '2' }], orderHistory: ordenes };
  w.saveState = () => {};
  w.BarStockCycle = {
    load: async () => inicio, startedAt: () => inicio, isLoaded: () => true, invalidate() {}
  };
  w.BarStockInventoryCloud = {
    fetchLocationId: async () => 'loc-1',
    touchWeeklyReset: async (iso) => { llamadas.push({ url: 'touchWeeklyReset', cuerpo: iso }); inicio = new Date(iso); },
    clearAllOrderOverrides: async () => { llamadas.push({ url: 'clearAllOrderOverrides' }); }
  };
  w.BarStockCycleOpen = { prepare() {}, settle: async (o) => { llamadas.push({ url: 'settle', cuerpo: o }); } };
  w.BarStockRest = { leerTodo: async (q) => /^count_sessions/.test(q) ? [{ finished_at: sesion }] : [] };
  for (const f of ['count-skip', 'toast-usage']) {
    new Function('window', 'fetch', 'console', 'document', 'state', leer('src/' + f + '.js'))(w, w.fetch, w.console, w.document, w.state);
  }
  return { w, llamadas, saltos, inicio: () => inicio };
}
const fila = (o) => Object.assign({ id: 1, skipped_at: SALTO, prev_reset_at: DOM_15, undone_at: null }, o);

(async () => {
  grupo('el LIVE no se mueve con el salto');
  {
    const { w } = entorno({ saltos: [fila()] });
    const t = await w.BarStockToastUsage.ultimoConteo();
    prueba('cuenta desde el conteo del 15, no desde el salto', t && t.toISOString() === DOM_15, t && t.toISOString());
  }
  {
    // Dos semanas sin contar: el salto del 29 apunta al del 22, que apunta al 15.
    const S29 = '2026-11-29T22:00:00.000Z';
    const { w } = entorno({ resetAt: S29, saltos: [fila({ id: 2, skipped_at: S29, prev_reset_at: SALTO }), fila()] });
    const a = await w.BarStockCountSkip.ancla(new Date(S29));
    prueba('dos saltos seguidos: sigue hasta el inicio de verdad', a && a.toISOString() === DOM_15, a && a.toISOString());
  }
  {
    const { w } = entorno({ saltos: [fila({ undone_at: '2026-11-22T23:00:00Z' })] });
    const a = await w.BarStockCountSkip.ancla(new Date(SALTO));
    prueba('uno deshecho no cuenta', a && a.toISOString() === SALTO, a && a.toISOString());
  }
  {
    const { w } = entorno({ sinTabla: true });
    const t = await w.BarStockToastUsage.ultimoConteo();
    prueba('sin la tabla (047 sin correr), como antes', t && t.toISOString() === SALTO, t && t.toISOString());
  }

  grupo('saltar');
  {
    const { w, llamadas, saltos, inicio } = entorno({ resetAt: DOM_15 });
    const r = await w.BarStockCountSkip.saltar();
    prueba('sale bien', r.ok, JSON.stringify(r));
    prueba('guarda el salto con el inicio de antes', saltos[0] && saltos[0].prev_reset_at === DOM_15 && saltos[0].location_name === 'The Crown Tavern');
    const iPost = llamadas.findIndex(l => /count_skips/.test(l.url) && l.metodo === 'POST');
    const iTouch = llamadas.findIndex(l => l.url === 'touchWeeklyReset');
    prueba('primero el salto, después el ciclo', iPost >= 0 && iTouch > iPost, iPost + ' / ' + iTouch);
    prueba('el ciclo nuevo empieza en el salto', inicio().toISOString() === saltos[0].skipped_at);
    prueba('el on hand no se toca', w.state.master[0].onHand === 3);
    prueba('los ajustes a mano de la orden de antes se van', w.state.master[0].orderOverride === '' && llamadas.some(l => l.url === 'clearAllOrderOverrides'));
    prueba('queda registrado como ciclo abierto por un salto', llamadas.some(l => l.url === 'settle' && l.cuerpo === 'skip'));
    const t = await w.BarStockToastUsage.ultimoConteo();
    prueba('y el LIVE sigue desde el conteo de antes', t && t.toISOString() === DOM_15, t && t.toISOString());
  }
  {
    const { w, llamadas } = entorno({ resetAt: DOM_15, sinTabla: true });
    const r = await w.BarStockCountSkip.saltar();
    prueba('si el salto no se guarda, no se mueve nada', !r.ok && !llamadas.some(l => l.url === 'touchWeeklyReset'), JSON.stringify(r));
    prueba('y dice lo que contestó el servidor', /count_skips/.test(r.error || ''), r.error);
  }

  grupo('undo');
  {
    const { w, saltos, inicio } = entorno({ saltos: [fila()] });
    await w.BarStockCountSkip.leer();
    prueba('la tarjeta lo encuentra', !!w.BarStockCountSkip.actualYa());
    const r = await w.BarStockCountSkip.deshacer();
    prueba('vuelve al inicio de antes', r.ok && inicio().toISOString() === DOM_15, JSON.stringify(r));
    prueba('y la fila queda marcada, no borrada', saltos.length === 1 && !!saltos[0].undone_at);
  }
  {
    const { w, inicio } = entorno({ saltos: [fila()], ordenes: [{ id: 'o1', createdAt: '2026-11-23T15:00:00Z' }] });
    const s = await w.BarStockCountSkip.actual();
    prueba('con una orden ya mandada, no se puede', !w.BarStockCountSkip.puedeDeshacer(s));
    const r = await w.BarStockCountSkip.deshacer();
    prueba('y deshacer no mueve el ciclo', !r.ok && inicio().toISOString() === SALTO, JSON.stringify(r));
  }
  {
    const { w } = entorno({ saltos: [fila()], ordenes: [{ id: 'o0', createdAt: '2026-11-17T15:00:00Z' }] });
    const s = await w.BarStockCountSkip.actual();
    prueba('las órdenes de la semana de antes no lo impiden', w.BarStockCountSkip.puedeDeshacer(s));
  }

  grupo('el interruptor de Open: Live o Empty shelf');
  {
    // getEffectiveOrder y autoOrder tal cual están en index.html.
    const html = leer('index.html');
    const trozo = (n) => { const m = new RegExp('function ' + n + '\\(row\\)\\{[\\s\\S]*?\\n\\}').exec(html); return m ? m[0] : ''; };
    const fuente = trozo('getEffectiveOrder') + '\n' + trozo('autoOrder');
    prueba('index.html tiene autoOrder y getEffectiveOrder la usa', /autoOrder\(row\)/.test(trozo('getEffectiveOrder')) && !!trozo('autoOrder'));
    const { w } = entorno({ saltos: [fila()] });
    await w.BarStockCountSkip.leer();
    let listo = true;
    w.BarStockLiveCache = { listo: () => listo, cuanto: (r) => r.item === "Tito's" ? 4.2 : Number(r.onHand),
      vivo: (r) => r.item === "Tito's" ? { live: 4.2 } : null };
    w.computeToOrder = (o, sug) => Math.max(0, Number(sug) - Math.round(o));
    const efectivo = new Function('window', 'supportsManualFinalOrder', 'parseNum', fuente + '; return { getEffectiveOrder, autoOrder };')(
      w, () => true, (x) => Number(x) || 0);
    const tito = { item: "Tito's", vendor: 'SOUTHERN', onHand: 9, suggested: 12, toOrder: 3, orderOverride: '' };
    prueba('de entrada, Live: par − el LIVE (12 − ≈4.2 = 8)', efectivo.getEffectiveOrder(tito) === 8, efectivo.getEffectiveOrder(tito));
    prueba('y su línea lo dice', w.BarStockCountSkip.deDonde(tito) === '≈4.2 on the shelf', w.BarStockCountSkip.deDonde(tito));
    const aperol = { item: 'Aperol', vendor: 'SOUTHERN', onHand: 4, suggested: 6, toOrder: 2, orderOverride: '' };
    prueba('lo que Toast no vende, con lo contado', efectivo.getEffectiveOrder(aperol) === 2 && w.BarStockCountSkip.deDonde(aperol) === 'counted 4');
    listo = false;
    prueba('sin el LIVE leído todavía, con lo contado', efectivo.getEffectiveOrder(tito) === 3, efectivo.getEffectiveOrder(tito));
    listo = true;
    w.BarStockCountSkip.fijarModo('vacio');
    prueba('Empty shelf: el par entero', efectivo.getEffectiveOrder(tito) === 12 && w.BarStockCountSkip.deDonde(tito) === 'empty shelf');
    prueba('lo puesto a mano sigue mandando', efectivo.getEffectiveOrder(Object.assign({}, tito, { orderOverride: '5' })) === 5);
    w.BarStockCountSkip.fijarModo('live');
    prueba('y vuelve a Live', efectivo.getEffectiveOrder(tito) === 8);
  }
  {
    // Sin semana saltada, nada cambia: ni interruptor ni cantidades.
    const { w } = entorno({ resetAt: DOM_15, saltos: [] });
    await w.BarStockCountSkip.leer();
    prueba('sin salto, no hay modo y Open pide como siempre', w.BarStockCountSkip.modo() === null &&
      w.BarStockCountSkip.aPedir({ item: 'x', onHand: 1, suggested: 4 }) === null);
  }
  {
    const mo = leer('src/mobile-orders.js');
    prueba('el interruptor va arriba de Open y del detalle', (mo.match(/\$\{baseHtml\(\)\}/g) || []).length === 2);
    prueba('"Auto was" y "auto wanted" dicen lo mismo que la cantidad',
      /Auto was \$\{n2\(auto\(r\)\)\}/.test(mo) && /auto wanted \$\{n2\(auto\(r\)\)\}/.test(mo) && !/n2\(r\.toOrder\)/.test(mo));
    prueba('con el cristal de las pestañas del Home', /:is\(#mhTabs, #moBase\) button\.on/.test(leer('styles/mobile-app.css')));
  }

  grupo('saltar no infla el LIVE: las facturas de la semana no se cuentan dos veces');
  {
    // Axel, 2026-11-22, Will's & Bill's: tras el salto On the shelf pasó
    // de ~$11–12 mil a $15 mil. Una compra de LOOP facturada el martes 17
    // y apuntada el jueves 19: dentro del ciclo la orden se queda con su
    // factura de antes; con el inicio del salto ya no, y la orden contaba
    // lo pedido Y la factura contaba otra vez "sin orden".
    const { w } = entorno({ saltos: [fila()] });
    for (const f of ['order-receipts', 'live-stock']) {
      new Function('window', 'fetch', 'console', 'document', 'state', leer('src/' + f + '.js'))(w, w.fetch, w.console, w.document, w.state);
    }
    const RC = w.BarStockOrderReceipts, L = w.BarStockLive;
    const ordenes = [{ id: 'o1', vendor: 'LOOP', po_number: 'WB-1', created_at: '2026-11-19T18:00:00Z', arrives_at: '2026-11-19T18:00:00Z' }];
    const lineas = [{ vendor_order_id: 'o1', item_name: "Tito's", quantity: 12, unit_price: 20 }];
    const llego = (ini) => {
      const recibos = RC.recibosDe([{ order_id: 'f1', product_id: 'p1', quantity: 12, unit_price: 20, invoice_date: '2026-11-17', invoice_number: 'F1' }],
        [{ product_id: 'p1', item_name: "Tito's" }], new Map());
      const rep = RC.repartir({ recortadas: ordenes, lineas, recibos, inicioCiclo: ini });
      const f = L.calcular({ master: [{ item: "Tito's", onHand: 5 }], ordenes, repartido: rep, recibos,
        conteo: Date.parse(DOM_15), diaConteo: '2026-11-15', vendido: [], ahora: Date.parse('2026-11-23T02:00:00Z') });
      return f.find(x => x.producto === "Tito's").llego;
    };
    prueba('el mecanismo: con el inicio del salto se cuenta dos veces', llego(Date.parse(SALTO)) === 24, llego(Date.parse(SALTO)));
    await w.BarStockCountSkip.leer();
    const real = await w.BarStockCountSkip.inicioReal();
    prueba('inicioReal es el de antes del salto', real && real.toISOString() === DOM_15, real && real.toISOString());
    prueba('inicioRealYa, lo mismo sin esperar', (w.BarStockCountSkip.inicioRealYa() || {}).toISOString && w.BarStockCountSkip.inicioRealYa().toISOString() === DOM_15);
    prueba('y con él llegan 12, una vez', llego(real.getTime()) === 12, llego(real.getTime()));

    // Lo que pasa el LIVE al reparto (live-stock.ahora), con el reparto
    // de mentira para ver qué inicio recibe.
    let recibido = null;
    w.BarStockToastUsage = Object.assign(w.BarStockToastUsage, {
      desdeElConteo: async () => ({ estado: 'listo', conteo: DOM_15, desde: '2026-11-15', dias: [], productos: [] })
    });
    w.BarStockOrderReceipts = { leer: async () => ({ manuales: [], facturas: [], enlaces: [], recortadas: [], lineas: [] }),
      recibosDe: () => [], repartir: (o) => { recibido = o.inicioCiclo; return new Map(); }, mismoNombre: (a, b) => a === b };
    await w.BarStockLive.ahora();
    prueba('el LIVE reparte desde el inicio de verdad, no desde el salto', recibido === Date.parse(DOM_15),
      recibido && new Date(recibido).toISOString());
    prueba('Sent también (mobile-history)', /SK\.inicioReal\(\)/.test(leer('src/mobile-history.js')));
    // Pero Sent AGRUPA por el ciclo de pedidos: "This cycle" son las
    // órdenes desde el salto; las de la semana saltada van a su mes
    // (Axel: "se van a confundir con el ciclo anterior").
    const mh = leer('src/mobile-history.js');
    prueba('Sent: "This cycle" empieza en el salto, no en el conteo',
      /cortes\.push\(\{ id: 'abierto', titulo: 'This cycle', desde: iniPedidos\.getTime\(\) \}\)/.test(mh));
    prueba('y el reparto y el enlace automático siguen desde el conteo',
      /inicioCiclo: ini \? ini\.getTime\(\) : 0/.test(mh) && /desde: ini \? ini\.toISOString\(\) : ''/.test(mh));
    prueba('y las llegadas calculadas (order-receipts)', /SK\.inicioRealYa\(\)/.test(leer('src/order-receipts.js')));
  }

  grupo('quién, y dónde se carga');
  {
    const css = leer('styles/mobile-app.css');
    prueba('sin "restart the cycle" el botón de saltar se queda',
      /bs-sin-cerrar_ciclo[^{]*m-hero-b2:not\(\.m-hero-b2-saltar\)/.test(css));
    const home = leer('src/mobile-home.js');
    prueba('la tarjeta sólo lo ofrece a quien puede contar', /G\.puede\('contar'\)/.test(home) && /btn2Tono: 'saltar'/.test(home));
    const html = leer('index.html');
    const p = (f) => html.indexOf('src/' + f + '.js?v=');
    prueba('count-skip carga antes que toast-usage y mobile-home', p('count-skip') > 0 && p('count-skip') < p('toast-usage') && p('count-skip') < p('mobile-home'));
    prueba('el correo de la mañana también sigue el salto', /'count-skip'/.test(leer('lib/morning-cron.js')));
  }

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
