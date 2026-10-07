#!/usr/bin/env node
/*
 * ── Las cuentas que cuestan dinero ───────────────────────────────────
 *
 * Tres sitios donde un error no se ve pero se paga:
 *
 *   el cierre del ciclo   decide el consumo de la semana
 *   el par                decide cuanto se pide
 *   las ordenes           decide que llega al proveedor
 *
 * Esta semana salieron dos fallos de meses en esta zona, y ninguno daba
 * error: daban un numero plausible. Un numero plausible y equivocado no
 * lo caza nadie mirando la pantalla — lo caza un caso con el resultado
 * apuntado a mano.
 *
 * Cada prueba trae su cuenta hecha en el comentario. Si un dia el codigo
 * da otra cosa, hay que decidir cual de las dos esta mal; eso es
 * exactamente lo que no se podia hacer antes.
 *
 *   node tools/test-money.js
 */

const path = require('path');
const fs = require('fs');

const RAIZ = path.join(__dirname, '..');

// jsdom puede estar en el proyecto o fuera; se busca donde este.
let JSDOM_PATH = 'jsdom';
try { require.resolve('jsdom'); }
catch (e) { JSDOM_PATH = '/tmp/node_modules/jsdom'; }

let pasa = 0, falla = 0;
function ok(n, c, d) {
  if (c) { pasa++; console.log('  ok   ' + n); }
  else { falla++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const eq = (n, got, esp) =>
  ok(n, JSON.stringify(got) === JSON.stringify(esp),
     'dio ' + JSON.stringify(got) + ', esperaba ' + JSON.stringify(esp));

// ── Un mundo falso donde las respuestas las pongo yo ─────────────────
//
// `respuestas` es una lista de [trozo de url, lo que devuelve]. Asi cada
// prueba declara los datos que quiere sin tocar la base de verdad.
function montar(respuestas, capturas) {
  const g = {
    window: {
      BARSTOCK_CONFIG: {
        SUPABASE_URL: 'https://x.test', SUPABASE_KEY: 'k',
        ACCOUNT_ID: 'acct', LOCATION_NAME: 'Test'
      }
    }
  };
  g.window.window = g.window;
  g.fetch = async (url, opt) => {
    if (opt && opt.method && opt.method !== 'GET') {
      if (capturas) capturas.push({ url, method: opt.method, body: safeJson(opt.body) });
      return { ok: true, status: 200, json: async () => [], text: async () => '' };
    }
    for (const [trozo, data] of respuestas) {
      if (url.includes(trozo)) {
        return { ok: true, status: 200, json: async () => data,
                 headers: { get: () => null }, text: async () => JSON.stringify(data) };
      }
    }
    return { ok: true, status: 200, json: async () => [],
             headers: { get: () => null }, text: async () => '[]' };
  };
  g.window.fetch = g.fetch;
  // week.js primero: el cierre pregunta por la semana en curso, y sin el
  // revienta con un error que no tiene nada que ver con la cuenta.
  for (const f of ['week.js', 'par-intelligence.js']) {
    const src = fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8');
    new Function('window', 'fetch', 'console', src)(g.window, g.fetch, console);
  }
  return g.window.BarStockParIntelligence;
}
function safeJson(b) { try { return JSON.parse(b); } catch (e) { return b; } }

const LOC = [{ id: 'loc-1' }];

// ═════════════════════════════════════════════════════════════════════
// 1 · EL PAR · cuanto te dice que pidas
// ═════════════════════════════════════════════════════════════════════
//
// La cuenta es: promedio del consumo semanal x 1.35, redondeado hacia
// arriba. El 1.35 es el colchon: pedir justo el promedio deja sin stock
// la mitad de las semanas, porque la mitad estan por encima.
console.log('\nel par · cuanto pedir');
(async () => {
  {
    // used: 4, 6, 5, 5  →  promedio 5  →  5 x 1.35 = 6.75  →  7
    const P = montar([
      ['locations', LOC],
      ['inventory_snapshots', [
        { week_start: '2026-09-07', used: 4 },
        { week_start: '2026-09-14', used: 6 },
        { week_start: '2026-09-21', used: 5 },
        { week_start: '2026-09-28', used: 5 }
      ]]
    ]);
    const r = await P.calculateParOptimal('loc-1', "Tito's", '');
    eq('promedio 5 → par 7', r.suggestedOptimal, 7);
    eq('y lo dice', r.avgUsed, 5);
    eq('activo con cuatro semanas', r.status, 'active');
  }

  {
    // Con TRES semanas no alcanza: se queda observando. Un promedio de
    // tres datos sobre algo semanal no es un promedio, es una anecdota.
    const P = montar([
      ['locations', LOC],
      ['inventory_snapshots', [
        { week_start: '2026-09-14', used: 6 },
        { week_start: '2026-09-21', used: 5 },
        { week_start: '2026-09-28', used: 5 }
      ]]
    ]);
    const r = await P.calculateParOptimal('loc-1', "Tito's", '');
    eq('con tres semanas, observando', r.status, 'observing');
    eq('y no inventa un par', r.suggestedOptimal, undefined);
  }

  {
    // La misma semana repetida NO cuenta dos veces. Pasa de verdad: un
    // recuento a mitad de semana deja dos filas del mismo week_start, y
    // contarlas dobles inclinaria el promedio hacia ese dia.
    const P = montar([
      ['locations', LOC],
      ['inventory_snapshots', [
        { week_start: '2026-09-07', used: 4 },
        { week_start: '2026-09-07', used: 40 },   // duplicada, se ignora
        { week_start: '2026-09-14', used: 6 },
        { week_start: '2026-09-21', used: 5 },
        { week_start: '2026-09-28', used: 5 }
      ]]
    ]);
    const r = await P.calculateParOptimal('loc-1', "Tito's", '');
    eq('la semana repetida no cuenta dos veces', r.avgUsed, 5);
  }

  {
    // Una correccion manual gana sobre el `used` ya guardado. Ese valor
    // se calculo antes de la correccion, asi que es historia vieja.
    //
    // on_hand_start 10 + ordered 2 − on_hand_end_adjusted 4  =  8
    const P = montar([
      ['locations', LOC],
      ['inventory_snapshots', [
        { week_start: '2026-09-07', used: 99, on_hand_start: 10, ordered: 2, on_hand_end_adjusted: 4 },
        { week_start: '2026-09-14', used: 8 },
        { week_start: '2026-09-21', used: 8 },
        { week_start: '2026-09-28', used: 8 }
      ]]
    ]);
    const r = await P.calculateParOptimal('loc-1', "Tito's", '');
    eq('la correccion manual pisa el used viejo', r.avgUsed, 8);
    eq('y el par sale de la cuenta corregida', r.suggestedOptimal, 11);  // 8 x 1.35 = 10.8
  }

  {
    const P = montar([['locations', LOC], ['inventory_snapshots', []]]);
    const r = await P.calculateParOptimal('loc-1', 'Producto nuevo', '');
    eq('sin historial, sin par', r, null);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 2 · EL CIERRE DEL CICLO · de donde sale el consumo
  // ═══════════════════════════════════════════════════════════════════
  //
  // used = lo que habia al abrir + lo que entro − lo que queda.
  //
  // Es LA cuenta de la app: alimenta el par, el Usage y la varianza. Si
  // se equivoca aqui, se equivoca todo lo de arriba y nada avisa.
  console.log('\nel cierre del ciclo · el consumo de la semana');
  {
    const cap = [];
    const P = montar([
      ['locations', LOC],
      ['inventory_snapshots', [
        { id: 's1', item_name: "Tito's", code: 'T1', on_hand_start: 10, ordered: 6 },
        { id: 's2', item_name: 'Campari', code: 'C1', on_hand_start: 4,  ordered: 0 }
      ]]
    ], cap);

    await P.completeSnapshot([
      { item: "Tito's", code: 'T1', onHand: 3 },   // 10 + 6 − 3 = 13
      { item: 'Campari', code: 'C1', onHand: 4 }   //  4 + 0 − 4 = 0
    ]);

    const patches = cap.filter(c => c.method === 'PATCH');
    const titos  = patches.find(p => p.url.includes('s1'));
    const campari = patches.find(p => p.url.includes('s2'));
    eq('10 que habia + 6 que entraron − 3 que quedan = 13', titos.body.used, 13);
    eq('y guarda con cuanto se cerro', titos.body.on_hand_end, 3);
    eq('lo que no se movio consume cero', campari.body.used, 0);
    ok('no toca la marca de semana de evento',
       !('is_event_week' in titos.body),
       'escribio is_event_week, que la pone Axel a mano');
  }

  {
    // Un producto que NO se conto no se cierra. Cerrarlo suponiendo cero
    // le atribuiria un consumo enorme —todo lo que habia— y ese numero
    // entraria en el promedio del par para siempre.
    const cap = [];
    const P = montar([
      ['locations', LOC],
      ['inventory_snapshots', [
        { id: 's1', item_name: 'Amaro que nadie toca', code: 'A1', on_hand_start: 7, ordered: 0 }
      ]]
    ], cap);
    await P.completeSnapshot([]);   // el master no lo trae
    eq('un producto sin contar se queda abierto',
       cap.filter(c => c.method === 'PATCH').length, 0);
  }

  {
    // Mas inventario al final que al principio mas lo que entro. Pasa de
    // verdad: una entrega que no se registro como orden, o un traslado
    // desde otra barra.
    //
    //   5 que habia + 10 que entraron − 20 que quedan  =  −5
    //
    // Un consumo NEGATIVO no significa nada: nadie des-bebe. Y no se
    // queda en la fila: entra en el promedio del par y lo baja, asi que
    // la semana siguiente se pide de menos.
    const cap = [];
    const P = montar([
      ['locations', LOC],
      ['inventory_snapshots', [
        { id: 's1', item_name: 'Gin', code: 'G1', on_hand_start: 5, ordered: 10 }
      ]]
    ], cap);
    await P.completeSnapshot([{ item: 'Gin', code: 'G1', onHand: 20 }]);
    const p = cap.find(c => c.method === 'PATCH');
    // Se guarda tal cual, que es lo honesto: esa discrepancia existio.
    eq('el snapshot guarda el numero real, aunque sea negativo', p.body.used, -5);
  }

  {
    // Pero NO puede entrar en el promedio del par. Nadie des-bebe, y una
    // semana negativa tira la media hacia abajo: la semana siguiente se
    // pediria de menos por una entrega que alguien olvido apuntar.
    //
    //   semanas: −5, 6, 5, 5   →   acotado: 0, 6, 5, 5   →   media 4
    //   4 x 1.35 = 5.4  →  6
    //
    // Sin acotar la media seria 2.75 y el par 4: dos botellas menos cada
    // semana por un apunte que falto una vez.
    const P2 = montar([
      ['locations', LOC],
      ['inventory_snapshots', [
        { week_start: '2026-09-07', used: -5 },
        { week_start: '2026-09-14', used: 6 },
        { week_start: '2026-09-21', used: 5 },
        { week_start: '2026-09-28', used: 5 }
      ]]
    ]);
    const r2 = await P2.calculateParOptimal('loc-1', 'Gin', '');
    eq('una semana negativa cuenta como cero, no resta', r2.avgUsed, 4);
    eq('y el par no se desploma', r2.suggestedOptimal, 6);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3 · ENTRO SIN ORDEN · la compra de la tienda
  // ═══════════════════════════════════════════════════════════════════
  //
  // Si se acaba algo un viernes y alguien va por seis botellas, la app no
  // se entera y la resta cuenta esas seis como consumo que nunca ocurrio.
  console.log('\nentro sin orden · la compra de la tienda');
  {
    const { JSDOM } = require(JSDOM_PATH);
    const dom = new JSDOM('<!doctype html><html><body></body></html>',
                          { pretendToBeVisual: true, url: 'https://x.test/' });
    const w = dom.window;
    global.window = w; global.document = w.document;
    w.BARSTOCK_CONFIG = { ACCOUNT_ID: 'a', LOCATION_NAME: 'Test',
                          SUPABASE_URL: 'https://s.test', SUPABASE_KEY: 'k' };
    let snaps = [{ id: 's1', ordered: 2 }], patch = null;
    global.fetch = w.fetch = async (u, o) => {
      if (o && o.method === 'PATCH') { patch = JSON.parse(o.body); return { ok: true, status: 200, text: async () => '' }; }
      if (u.includes('locations')) return { ok: true, json: async () => [{ id: 'loc-1' }] };
      if (u.includes('inventory_snapshots')) return { ok: true, json: async () => snaps };
      return { ok: true, json: async () => [] };
    };
    w.setStatus = () => {};
    for (const f of ['week.js', 'par-intelligence.js', 'stock-in.js']) {
      new w.Function(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'))();
    }
    const SI = w.BarStockStockIn;
    const $$ = (id) => w.document.getElementById(id);
    const ROW = { item: "Bentley's Triple Sec", code: 'BTS', onHand: 14.43 };

    SI.open(ROW, () => {});
    const q = $$('siQty');
    q.value = '6'; q.dispatchEvent(new w.Event('input'));
    $$('siOk').click();
    await new Promise(r => setTimeout(r, 40));
    eq('suma a lo que ya habia entrado esta semana', patch.ordered, 8);  // 2 + 6
    ok('y NO toca el on hand', !('on_hand' in patch),
       'el on hand sale de contar; subirlo aqui lo contaria dos veces');

    // Sin ciclo abierto no hay donde anotarlo, y callarse dejaria al
    // usuario creyendo que quedo guardado.
    snaps = []; patch = null;
    SI.open(ROW, () => {});
    $$('siOk').click();
    await new Promise(r => setTimeout(r, 40));
    ok('sin semana abierta lo dice y no guarda nada',
       patch === null && /No open week/.test($$('siBody').textContent));
  }

  console.log('\n' + (falla ? falla + ' FALLO(S)' : 'todo bien') + '   ·   ' + pasa + ' comprobaciones');
  process.exit(falla ? 1 : 0);
})();
