#!/usr/bin/env node
/*
 * ── Los pours de cada restaurante ────────────────────────────────────
 *
 * Axel, 2026-11-13: "necesito que los restaurantes puedan configurar sus
 * pours, pueden ser distintos entre restaurante". Opción A (Settings ›
 * Toast › Pours), y "sí recalcula": cambiar una medida cambia la cuenta
 * de todo lo vendido así, también de lo ya emparejado.
 *
 *   1. Las medidas: las de siempre por defecto, las de la locación
 *      encima, "2oz"/"3oz" por su nombre, y la medida de un grupo de
 *      Toast con la regla de lib/toast.js.
 *   2. Guardar toca SÓLO la columna pours de location_settings (no el
 *      reply-to ni las listas de correo), y no acepta 0 ni locuras.
 *   3. El cálculo de botellas usa el pour de la locación AHORA, no el
 *      guardado al emparejar; sin medida conocida y sin guardado, lo dice.
 *   4. Una medida propia (Neat) deja emparejar los licores que la usan.
 *   5. La pantalla: lo que falta arriba, − / +, Save; y un fallo se dice.
 *   6. Settings, el orden de carga, el correo de la mañana y la 037.
 *
 *   node tools/test-pours.js
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
const esperar = ms => new Promise(r => setTimeout(r, ms));

function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k', LOCATION_NAME: "Will's & Bill's" };
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-wb' };
  w.__pet = [];
  w.__pours = o.pours === undefined ? null : o.pours;
  w.fetch = async (url, op) => {
    op = op || {};
    const u = String(url), m = op.method || 'GET';
    w.__pet.push({ url: u, metodo: m, cuerpo: op.body ? JSON.parse(op.body) : null });
    const resp = (status, body) => ({ ok: status < 400, status, text: async () => typeof body === 'string' ? body : JSON.stringify(body), json: async () => body });
    if (/location_settings/.test(u)) {
      if (o.sinColumna) return resp(400, '{"code":"42703","message":"column location_settings.pours does not exist"}');
      if (o.falla && m !== 'GET') return resp(403, '{"message":"permission denied for table location_settings"}');
      if (m === 'GET') return resp(200, w.__pours ? [{ pours: w.__pours }] : []);
      w.__pours = JSON.parse(op.body)[0].pours;
      return resp(201, '');
    }
    return resp(404, {});
  };
  w.eval(leer('src/toast-pours.js'));
  return w;
}

(async () => {
  grupo('1 · las medidas');
  {
    const P = entorno().BarStockToastPours;
    prueba('las de siempre: Single 1.5, Double 2.5, UP/RX 3, Shot 1.5, Mix 1.5',
      P.ozDe('Single') === 1.5 && P.ozDe('Double') === 2.5 && P.ozDe('UP/RX') === 3 && P.ozDe('Up/Rx') === 3 && P.ozDe('Shot') === 1.5 && P.ozDe('Mix') === 1.5);
    prueba('"2oz" y "3 oz" por su nombre', P.ozDe('2oz') === 2 && P.ozDe('3 oz') === 3);
    prueba('una medida desconocida no se adivina', P.ozDe('Neat') === undefined && P.ozDe('Flight') === undefined && P.ozDe(null) === undefined);
    prueba('la medida de un grupo, con la regla de lib/toast.js', P.medidaDeGrupo('DRINKS › Liquor › Vodka › UP/RX') === 'UP/RX' &&
      P.medidaDeGrupo('DRINKS › Liquor › Vodka') === null && P.medidaDeGrupo('DRINKS › Cocktails') === null && P.medidaDeGrupo('') === null);

    const w = entorno({ pours: { double: 2, neat: 2 } });
    await w.BarStockToastPours.cargar();
    const Q = w.BarStockToastPours;
    prueba('las de la locación mandan: Double 2 en Will\'s & Bill\'s', Q.ozDe('Double') === 2 && Q.ozDe('double') === 2);
    prueba('y añaden las suyas: Neat 2', Q.ozDe('Neat') === 2);
    prueba('lo que no cambió sigue con las de siempre', Q.ozDe('Single') === 1.5);
    prueba('lee la de su locación', w.__pet.some(p => /location_settings\?location_id=eq\.loc-wb&select=pours/.test(p.url)));

    const wc = entorno({ sinColumna: true });
    let err = '';
    try { await wc.BarStockToastPours.cargar(); } catch (e) { err = e.message; }
    prueba('sin la columna: dice que falta la 037, con lo que dijo Supabase', /migration 037/.test(err) && /42703/.test(err), err);
  }

  grupo('2 · guardar');
  {
    const w = entorno({ pours: { neat: 2 } });
    const P = w.BarStockToastPours;
    await P.cargar();
    await P.guardar({ Double: 2, Single: 1.5 });
    const post = w.__pet.find(p => p.metodo === 'POST');
    prueba('upsert por location_id', !!post && /on_conflict=location_id/.test(post.url));
    prueba('SÓLO pours: ni reply-to ni listas de correo', post && Object.keys(post.cuerpo[0]).sort().join() === 'location_id,pours,updated_at', post && JSON.stringify(post.cuerpo));
    prueba('con lo que ya tenía, lo cambiado, y sin repetir las de siempre', JSON.stringify(post.cuerpo[0].pours) === JSON.stringify({ neat: 2, double: 2 }), JSON.stringify(post.cuerpo[0].pours));
    prueba('y al momento cuenta con ellas', P.ozDe('Double') === 2);
    let e1 = '', e2 = '';
    try { await P.guardar({ Double: 0 }); } catch (e) { e1 = e.message; }
    try { await P.guardar({ Double: 40 }); } catch (e) { e2 = e.message; }
    prueba('0 o 40 oz no se guardan', /more than 0/.test(e1) && /12 oz/.test(e2) && P.ozDe('Double') === 2);
    const wf = entorno({ falla: true });
    let e3 = '';
    try { await wf.BarStockToastPours.guardar({ Double: 2 }); } catch (e) { e3 = e.message; }
    prueba('un fallo se dice tal cual, sin mandar a correr migraciones', /403/.test(e3) && /permission denied/.test(e3) && !/037/.test(e3), e3);
  }

  grupo('3 · recalcula lo ya emparejado');
  {
    const w = entorno({ pours: { double: 2 } });
    w.eval(leer('src/toast-usage.js'));
    const P = w.BarStockToastPours;
    await P.cargar();
    const U = w.BarStockToastUsage;
    const pourDe = (g) => P.ozDe(P.medidaDeGrupo(g));
    // Grey Goose Double, emparejado cuando el Double era 2.5 (pour_oz).
    const ventas = [
      { business_date: '2026-11-12', toast_item_guid: 'gg2', toast_item_name: 'Grey Goose', toast_group: 'DRINKS › Liquor › Vodka › Double', quantity: 10, sales_category: 'Liquor' },
      { business_date: '2026-11-12', toast_item_guid: 'xx', toast_item_name: 'Rare Pour', toast_group: 'DRINKS › Liquor › Whiskey › Flight', quantity: 4, sales_category: 'Liquor' },
      { business_date: '2026-11-12', toast_item_guid: 'w1', toast_item_name: 'House Red', toast_group: 'DRINKS › Wine › Red', quantity: 5, sales_category: 'Wine' }
    ];
    const enlaces = [
      { toast_item_guid: 'gg2', item_name: 'Grey Goose', pour_oz: 2.5, status: 'confirmed', kind: 'liquor', toast_group: 'DRINKS › Liquor › Vodka › Double' },
      { toast_item_guid: 'xx', item_name: 'Rare Whiskey', pour_oz: null, status: 'confirmed', kind: 'liquor', toast_group: 'DRINKS › Liquor › Whiskey › Flight' },
      { toast_item_guid: 'w1', item_name: 'House Red', pour_oz: 6, status: 'confirmed', kind: 'wine', toast_group: 'DRINKS › Wine › Red' }
    ];
    const tam = { 'Grey Goose': 750 * 1, 'Rare Whiskey': 750, 'House Red': 750 };
    const con = U.calcular(ventas, enlaces, [], tam, pourDe);
    const sin = U.calcular(ventas, enlaces, [], tam);
    const gg = (r) => (r.productos.find(p => p.producto === 'Grey Goose') || {}).botellas;
    // 10 × 2 oz × 29.5735 / 750 = 0.789; con 2.5 sería 0.986.
    prueba('el Double cuenta con 2 oz, aunque se emparejó con 2.5', Math.abs(gg(con) - 0.789) < 0.002, gg(con));
    prueba('sin las de la locación, con lo guardado (como antes)', Math.abs(gg(sin) - 0.986) < 0.002, gg(sin));
    prueba('una medida sin onzas y sin guardado: se dice, no se cuenta como botella entera',
      !con.productos.some(p => p.producto === 'Rare Whiskey') && con.sinConvertir.some(x => /No pour for its size/.test(x.motivo) && x.unidades === 4), JSON.stringify(con.sinConvertir));
    prueba('el vino no cambia: su pour_oz', (con.productos.find(p => p.producto === 'House Red') || {}).botellas === (sin.productos.find(p => p.producto === 'House Red') || {}).botellas);
    const u = leer('src/toast-usage.js');
    prueba('la lectura trae el grupo de cada enlace', /select=toast_item_guid,item_name,pour_oz,status,kind,toast_group/.test(u));
  }

  grupo('4 · una medida propia deja emparejar');
  {
    const w = entorno();
    w.BarStockToastLinks = { crear: () => ({ datos: () => null, cargar: async () => {}, alCambiar: () => {}, DIAS: 7 }), norm: s => String(s).toLowerCase() };
    w.eval(leer('src/toast-liquor.js'));
    const antes = w.BarStockToastLiquor.ozDe('Neat');
    w.__pours = { neat: 2 };
    await w.BarStockToastPours.cargar(true);
    prueba('Neat: sin onzas no se puede guardar; con las de la locación, sí', antes === undefined && w.BarStockToastLiquor.ozDe('Neat') === 2);
    prueba('Liquor from Toast ya no lleva su propia tabla', !/MEDIDAS\s*=/.test(leer('src/toast-liquor.js')) && /BarStockToastPours/.test(leer('src/toast-liquor.js')));
    prueba('y su línea de arriba dice las de la locación', /oz\('Double'\)/.test(leer('src/mobile-toast-liquor.js')) && /Settings › Toast › Pours/.test(leer('src/mobile-toast-liquor.js')));
  }

  grupo('5 · la pantalla');
  {
    const w = entorno({ pours: {} });
    const filas = [['Single', 3], ['Double', 2], ['Neat', 1], ['3oz', 1]].flatMap(([m, n]) => Array.from({ length: n }, (_, i) => ({ guid: m + i, medida: m })));
    w.BarStockToastLiquor = { datos: () => ({ estado: 'listo', filas }), cargar: async () => {} };
    w.__avisos = [];
    w.BarStockToast = { show: t => w.__avisos.push(t) };
    w.eval(leer('src/mobile-toast-pours.js'));
    const host = w.document.createElement('div'); w.document.body.appendChild(host);
    await w.BarStockMobileToastPours.montar(host, () => '<div class="cab"></div>', () => {});
    await esperar(20);
    const txt = host.textContent.replace(/\s+/g, ' ');
    prueba('lo que falta, arriba y en ámbar: "Needs a pour · 1", Neat', /Needs a pour · 1/.test(txt) && /Neat/.test(host.querySelector('.m-po-lab.falta + .m-po').textContent));
    prueba('las que usa Toast aquí, con cuántos licores', /Single/.test(txt) && /3 liquors sold this way/.test(txt) && /Double/.test(txt));
    prueba('"3oz" va aparte, por su nombre, sin − / +', /3oz/.test(txt) && /Their size is in the name/.test(txt) && !host.querySelector('[data-mas="3oz"]'));
    prueba('Save apagado mientras no hay cambios', host.querySelector('#poSave').disabled);
    host.querySelector('[data-mas="neat"]').click();
    prueba('el primer + de una medida sin onzas pone 1.5', /1\.5 oz/.test(host.querySelector('[data-mas="neat"]').parentNode.textContent) && !/Needs a pour/.test(host.textContent));
    host.querySelector('[data-menos="double"]').click(); host.querySelector('[data-menos="double"]').click();
    prueba('− baja de 0.25 en 0.25', /2 oz/.test(host.querySelector('[data-menos="double"]').parentNode.textContent));
    host.querySelector('#poSave').click(); await esperar(30);
    prueba('Save guarda lo cambiado, por su nombre en Toast', w.__pours && w.__pours.neat === 1.5 && w.__pours.double === 2 && Object.keys(w.__pours).length === 2, JSON.stringify(w.__pours));
    prueba('y dice que recalcula', /recounts|now counts with the new pours/.test(host.textContent) && w.__avisos.includes('Pours saved'));

    const wf = entorno({ pours: {}, falla: true });
    wf.BarStockToastLiquor = { datos: () => ({ estado: 'listo', filas }), cargar: async () => {} };
    wf.eval(leer('src/mobile-toast-pours.js'));
    const h2 = wf.document.createElement('div'); wf.document.body.appendChild(h2);
    await wf.BarStockMobileToastPours.montar(h2, () => '', () => {});
    h2.querySelector('[data-mas="single"]').click();
    h2.querySelector('#poSave').click(); await esperar(30);
    prueba('un fallo al guardar se dice, y el cambio se queda en pantalla', /Not saved: Supabase answered 403/.test(h2.textContent) && /1\.75 oz/.test(h2.textContent));
  }

  grupo('6 · Settings, el orden, el correo y la migración');
  {
    const ms = leer('src/mobile-settings.js');
    prueba('Settings › Toast › Pours', /id: 'toastpours'/.test(ms) && /BarStockMobileToastPours\.montar/.test(ms));
    prueba('el bartender invitado no la ve (es configuración)', !/PARA_INVITADO = \[[^\]]*toastpours/.test(ms));
    const idx = leer('index.html');
    const p = f => idx.indexOf('src="src/' + f);
    prueba('toast-pours.js antes que quien lo usa', p('toast-pours.js') > 0 && p('toast-pours.js') < p('toast-liquor.js') && p('toast-pours.js') < p('toast-usage.js'));
    prueba('su pantalla antes que Settings', p('mobile-toast-pours.js') > 0 && p('mobile-toast-pours.js') < p('mobile-settings.js'));
    const { MODULOS } = require(path.join(RAIZ, 'lib/morning-cron.js'));
    prueba('el correo de la mañana calcula con los mismos pours', MODULOS.indexOf('toast-pours') >= 0 && MODULOS.indexOf('toast-pours') < MODULOS.indexOf('toast-usage'));
    const sql = fs.existsSync(path.join(RAIZ, 'database/migrations/037_location_pours.sql')) ? leer('database/migrations/037_location_pours.sql') : '';
    prueba('037 añade pours a location_settings', /alter table public\.location_settings\s+add column if not exists pours jsonb/i.test(sql));
  }

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
