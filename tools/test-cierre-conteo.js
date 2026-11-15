#!/usr/bin/env node
/*
 * ── La pantalla de cerrar el conteo ─────────────────────────────────
 *
 * Es la pantalla que ESCRIBE el inventario de una locación entera, así
 * que lo que se protege aquí no es que se vea bien:
 *
 *   1. El veredicto dice la CONSECUENCIA con el número correcto. Si
 *      dice "257 as zero" y son 9, alguien cierra creyendo otra cosa.
 *   2. La elección keep/zero aparece SÓLO cuando existe —viniendo de
 *      un reset las dos hacen lo mismo— y lo que se elige es lo que
 *      llega al commit.
 *   3. Cerrar sigue cerrando y "Keep scanning" sigue volviendo.
 *   4. Cada tarjeta abre su vista, y se vuelve al resumen.
 *   5. Una tarjeta sin datos no se pinta: sin zonas no hay tarjeta de
 *      zonas, sin avisos no hay tarjeta de avisos.
 *
 * Antes esto era una sola pantalla con todo apilado y sin un solo
 * test.
 *
 *   node tools/test-cierre-conteo.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = ms => new Promise(r => setTimeout(r, ms || 0));

// o: { contados, total, desdeCero, movers, raros, zonas }
function pantalla(o) {
  o = o || {};
  const total = o.total === undefined ? 260 : o.total;
  const contados = o.contados === undefined ? 3 : o.contados;
  const faltan = total - contados;

  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  global.localStorage = w.localStorage;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.BARSTOCK_CONFIG = { ACCOUNT_ID: 'a1', LOCATION_NAME: 'The Crown Tavern' };

  const master = Array.from({ length: total }, (_, i) => ({
    item: 'Item ' + i, vendor: 'LOOP', category: i % 2 ? 'Vodka' : 'Gin',
    // Los no contados: en cero si se viene de un reset.
    onHand: i < contados ? 2 : (o.desdeCero === false ? 4 : 0),
    suggested: 6, bottleSizeMl: 750
  }));
  w.state = { master };
  w.saveState = () => {};
  w.render = () => { w.__renderApp = (w.__renderApp || 0) + 1; };
  w.BarStockToast = { show() {} };

  const hechos = master.slice(0, contados).map(r => r.item);
  w.BarStockCountSession = {
    summary: () => ({ counted: contados, total, missing: faltan }),
    missingRows: () => master.slice(contados),
    countedItems: () => hechos,
    bottlesByZone: () => (o.zonas ? { Closet: 1, 'Main Bar': 2 } : {}),
    passesOf: () => [], bottlesFor: () => 1,
    clear() {}, get: () => null
  };
  w.BarStockZones = {
    activas: () => !!o.zonas,
    sincronizar: async () => (o.zonas ? 2 : 0)
  };
  w.BarStockCountInsight = {
    analizar: async () => ({
      listo: true, semanasCiclo: 1,
      faltan: (o.movers || []).map(([item, semanal]) => ({ item, semanal })),
      raros: (o.raros || []).map(([item, contado, esperado]) => ({ item, contado, esperado }))
    })
  };

  new Function(fs.readFileSync(path.join(RAIZ, 'src/count-finish.js'), 'utf8'))();
  return w;
}

async function abrir(o) {
  const w = pantalla(o);
  w.__volvio = 0;
  w.BarStockCountFinish.open(() => { w.__volvio++; }, () => {});
  // Las cargas van en segundo plano.
  await esperar(30);
  return { w, b: w.document.getElementById('cfBody') };
}

const txt = (b) => b.textContent.replace(/\s+/g, ' ');
const card = (b, v) => b.querySelector('[data-ir="' + v + '"]');

(async () => {

grupo('el veredicto dice la consecuencia, con su número');
{
  const { b } = await abrir({ contados: 3, total: 260 });
  prueba('el recuento', /3 of 260/.test(txt(b)), txt(b).slice(0, 80));
  prueba('y el porcentaje', /1%/.test(txt(b)), txt(b).slice(0, 110));
  // Lo que de verdad importa: cuántos se van a cero.
  prueba('dice cuántos quedan en cero',
    /257 items as zero/.test(txt(b)), txt(b).slice(0, 220));
}
{
  const { b } = await abrir({ contados: 251, total: 260 });
  prueba('con 9, dice 9', /9 items as zero/.test(txt(b)), txt(b).slice(0, 220));
  prueba('y no 257', !/257/.test(txt(b)));
}
{
  const { b } = await abrir({ contados: 260, total: 260 });
  prueba('contado entero, nada a cero',
    /Nothing will be saved as zero/.test(txt(b)), txt(b).slice(0, 160));
  prueba('y el veredicto se pone en verde',
    !!b.querySelector('.cf-vd.ok'));
}

grupo('la elección keep/zero sólo cuando existe');
{
  // Viniendo de un reset, todo está en cero: "dejarlos" y "ponerlos a
  // cero" hacen lo mismo. Una elección falsa es peor que ninguna.
  const { b } = await abrir({ contados: 3, desdeCero: true });
  prueba('desde un reset, no se pregunta', !b.querySelector('.cf-opt'));
}
{
  const { w, b } = await abrir({ contados: 3, desdeCero: false });
  const op = b.querySelectorAll('.cf-opt');
  prueba('si había cuenta previa, sí', op.length === 2, String(op.length));
  prueba('y arranca en "dejarlos"', op[0].classList.contains('on'));

  op[1].click();
  prueba('al elegir cero, se marca', op[1].classList.contains('on'));
  prueba('y se desmarca la otra', !op[0].classList.contains('on'));
  void w;
}

grupo('cada tarjeta abre su vista, y se vuelve');
{
  const { b } = await abrir({
    contados: 3, zonas: true,
    movers: [['Whatever Vodka', 12], ['La Crema', 4.4]],
    raros:  [['Tito’s Vodka', 9, 2]]
  });

  prueba('tarjeta de los que se mueven', !!card(b, 'movers'));
  prueba('tarjeta de los que no cuadran', !!card(b, 'raros'));
  prueba('tarjeta de los que faltan', !!card(b, 'faltan'));
  prueba('tarjeta de zonas', !!card(b, 'zonas'));

  card(b, 'movers').click();
  prueba('movers enseña el ritmo', /12.0\/wk/.test(txt(b)), txt(b).slice(0, 180));
  prueba('y los dos', /Whatever Vodka/.test(txt(b)) && /La Crema/.test(txt(b)));
  b.querySelector('#cfVolver').click();
  prueba('se vuelve al resumen', !!card(b, 'movers'));

  card(b, 'raros').click();
  prueba('raros enseña contado y esperado',
    /9/.test(txt(b)) && /vs 2/.test(txt(b)), txt(b).slice(0, 180));
  b.querySelector('#cfVolver').click();

  card(b, 'faltan').click();
  prueba('faltan trae su buscador', !!b.querySelector('#cfSearch'));
  prueba('y la lista agrupada', /Vodka|Gin/.test(txt(b)));
  b.querySelector('#cfVolver').click();

  card(b, 'zonas').click();
  prueba('zonas enseña el reparto', /Closet/.test(txt(b)) && /Main Bar/.test(txt(b)),
    txt(b).slice(0, 160));
}

grupo('el buscador de los que faltan filtra');
{
  const { b } = await abrir({ contados: 3, total: 20 });
  card(b, 'faltan').click();
  const inp = b.querySelector('#cfSearch');
  // El suelo de 16px vive en CSS; aquí se prueba que filtra.
  inp.value = 'Item 7'; inp.oninput({ target: inp });
  prueba('deja sólo lo que coincide',
    b.querySelectorAll('.cf-row').length === 1,
    String(b.querySelectorAll('.cf-row').length));
  inp.value = 'zzz'; inp.oninput({ target: inp });
  prueba('y lo dice cuando no hay nada', /Nothing matches/.test(txt(b)));
}

grupo('una tarjeta sin datos no se pinta');
{
  const { b } = await abrir({ contados: 3, zonas: false, movers: [], raros: [] });
  prueba('sin zonas, no hay tarjeta de zonas', !card(b, 'zonas'));
  prueba('sin avisos, no hay tarjeta de avisos', !card(b, 'movers'));
  prueba('sin cuentas raras, tampoco', !card(b, 'raros'));
  // Pero los que faltan siguen ahí.
  prueba('y la de los que faltan sí', !!card(b, 'faltan'));
}
{
  const { b } = await abrir({ contados: 260, total: 260, zonas: false });
  prueba('contado entero, ni la de los que faltan', !card(b, 'faltan'));
}

grupo('y las dos acciones siguen haciendo lo suyo');
{
  const { w, b } = await abrir({ contados: 3 });
  prueba('está el botón de cerrar', !!b.querySelector('#cfGo'));
  b.querySelector('#cfMore').click();
  prueba('"Keep scanning" devuelve al escáner', w.__volvio === 1, String(w.__volvio));
  prueba('y el panel se cierra',
    !w.document.getElementById('cfPanel').classList.contains('on'));
}

grupo('nada de esto se queda de una apertura a la otra');
{
  const { w, b } = await abrir({ contados: 3, zonas: true });
  card(b, 'faltan').click();
  prueba('se entró a una vista', !card(b, 'faltan'));
  w.BarStockCountFinish.close(true);
  w.BarStockCountFinish.open(() => {}, () => {});
  await esperar(30);
  prueba('al reabrir, se arranca en el resumen',
    !!card(w.document.getElementById('cfBody'), 'faltan'));
}

grupo('la pantalla de cierre dice que cambio, y que toca');
{
  // Antes era un acuse: un visto verde, lo importante —cuantos
  // articulos se tocaron de cuantos— en el texto mas pequeño de la
  // pantalla, el tiempo en el sitio de honor siendo lo menos
  // accionable, y media pantalla vacia debajo.
  const src = fs.readFileSync(path.join(RAIZ, 'src/count-finish.js'), 'utf8');

  prueba('los tres numeros del cierre', /class="cf-tres"/.test(src));
  prueba('lo tocado y lo no tocado, cada uno en el suyo',
    /cf-t1"><b class="ok">\$\{s\.counted\}/.test(src) &&
    /<b>\$\{s\.missing\}<\/b>/.test(src));
  // El parrafo gris ya no lleva el recuento: lo dicen las minicards.
  // La barra de estado del escritorio si lo sigue diciendo, y debe:
  // ahi no hay minicards, es una linea de texto y punto.
  prueba('el parrafo ya no repite el recuento',
    !/class="cf-note">\$\{s\.counted\}/.test(src));
  prueba('y dice si se abrio semana o se corrigio',
    /Corrected this week · no new cycle/.test(src) &&
    /A new week starts now/.test(src));

  prueba('la tarjeta del siguiente paso trae su numero',
    /cf-next-big">\$\{pedir\.n\}/.test(src));
  // La tilde y la linea de abajo no son adorno: el dinero sale de tu
  // catalogo, no de lo que te van a cobrar.
  prueba('el dinero va como estimacion', /· ~\$\{esc\(dinero\(pedir\.dinero\)\)\}/.test(src));
  prueba('y dice de donde sale', /at your catalogue prices/.test(src));

  // Un cero grande en una tarjeta destacada se lee como un fallo de
  // carga, no como "estas al dia".
  prueba('sin nada que pedir, no se enseña un cero', /pedir\.n \?/.test(src));
  prueba('y el paso que manda pasa a ser las ventas',
    /Nothing to order right now/.test(src));
  // Y entonces no existe el boton de ordenar: engancharlo a ciegas
  // reventaba la pantalla de un bar al dia con sus pedidos.
  prueba('los botones se enganchan solo si existen',
    /const al = \(id, fn\) => \{ const b = \$\(id\); if \(b\) b\.onclick = fn; \}/.test(src));

  // "22 min slower than last time" sobre un conteo de 22 minutos
  // significa que el anterior duro cero: una prueba, no un conteo.
  // Se exige a LOS DOS. Con el minimo solo en el anterior, un conteo
  // de 29 segundos contra uno de 22 minutos anunciaba "22 min faster
  // than last time": enhorabuena por no haber contado.
  prueba('no se compara contra un conteo de prueba',
    /antes\.active_ms >= MINIMO_PARA_COMPARAR/.test(src));
  prueba('ni desde uno', /s\.activeMs >= MINIMO_PARA_COMPARAR/.test(src));

  // El aire de esta columna va por ARRIBA. Con `.cf-next` separando
  // por abajo y la tarjeta azul por arriba, en la union el hueco era
  // cero y el boton tocaba la tarjeta de las ventas.
  const css = fs.readFileSync(path.join(RAIZ, 'styles/count-panel.css'), 'utf8');
  const bloque = (sel) => {
    const m = css.match(new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}'));
    return m ? m[1] : '';
  };
  for (const sel of ['.cf-tres', '.cf-next-card', '.cf-next']) {
    prueba(sel + ' separa por arriba', /margin-top:/.test(bloque(sel)), bloque(sel).trim().slice(0, 60));
    prueba(sel + ' y no por abajo', !/margin-bottom/.test(bloque(sel)));
  }
  prueba('el titulo va centrado bajo el visto',
    /\.cf-count\{[^}]*text-align: center/.test(css));

  prueba('las minicards se leen en modo claro', /body\.light \.cf-t1 b\{/.test(css));
  prueba('y la tarjeta azul tambien', /body\.light \.cf-next-card\{/.test(css));
  // El rotulo WHAT NOW lo sustituye el NEXT de dentro de la tarjeta.
  prueba('la regla del rotulo viejo se borro', !/^\.cf-next-t\{/m.test(css));
}

grupo('lo por pedir sale del estado, despues del commit');
{
  const { w } = await abrir({ contados: 3 });
  // El master del fixture: 260 articulos, suggested 6, on hand 2 o 0.
  // `toOrder` lo calcula la app; aqui se pone a mano para comprobar
  // que la cuenta es sobre `state.master` y no sobre otra cosa.
  w.state.master.forEach(r => { r.toOrder = 0; r.value = 10; });
  w.state.master[0].toOrder = 2;  w.state.master[0].vendor = 'LOOP';
  w.state.master[1].toOrder = 3;  w.state.master[1].vendor = 'LOOP';
  w.state.master[2].toOrder = 1;  w.state.master[2].vendor = 'Fine Wine';
  w.state.master[3].toOrder = 0;  w.state.master[3].vendor = 'Other';

  const p = w.BarStockCountFinish._porPedir();
  prueba('cuenta solo los que hay que pedir', p.n === 3, String(p.n));
  prueba('el dinero es cantidad por precio', p.dinero === 60, String(p.dinero));
  // Dos lineas del mismo proveedor son UN proveedor.
  prueba('los proveedores no se repiten', p.vendors === 2, String(p.vendors));
}

grupo('y el commit repinta la app, no este panel');
{
  // `render` a secas resolvía a la función LOCAL de este módulo, que le
  // hacía sombra a la de la app: tras cerrar un conteo, la pantalla
  // principal se quedaba con el on hand viejo.
  const src = fs.readFileSync(path.join(RAIZ, 'src/count-finish.js'), 'utf8');
  prueba('se llama window.render', /typeof window\.render === 'function'\) window\.render\(\)/.test(src));
  prueba('y ya no el local', !/typeof render === 'function'\) render\(\)/.test(src));
}

grupo('Open Ordering, en el telefono, lleva a Orders');
{
  // En el telefono Orders es una pantalla del shell movil, no la
  // seccion del escritorio. El boton llamaba a bsOpenSection('vendor'),
  // que abre una seccion que ahi no se ve, y la pantalla activa seguia
  // siendo el Home: el boton "llevaba al home".
  const { w, b } = await abrir({ contados: 3 });
  w.state.master.forEach((r, i) => { r.toOrder = i < 2 ? 2 : 0; r.value = 10; });
  w.BarStockInventoryCloud = { replaceInventoryMaster: async () => {} };
  // El modulo lee `state` a secas, y aqui corre con los globales de node.
  global.state = w.state;
  w.__irMovil = []; w.__seccion = [];
  w.BarStockMobile = { montado: () => true, ir: (id) => { w.__irMovil.push(id); } };
  w.bsOpenSection = (s) => { w.__seccion.push(s); };

  b.querySelector('#cfGo').click();
  await esperar(30);
  const boton = w.document.getElementById('cfGoOrder');
  prueba('tras cerrar, esta el boton de ordenar', !!boton, txt(b).slice(0, 120));
  if (boton) boton.click();
  prueba('abre la pantalla de Orders del telefono',
    w.__irMovil.length === 1 && w.__irMovil[0] === 'orders', JSON.stringify(w.__irMovil));
  prueba('y no la seccion del escritorio, que ahi no se ve',
    w.__seccion.length === 0, JSON.stringify(w.__seccion));
}
{
  // En el escritorio no hay shell movil montado: sigue la seccion.
  const { w, b } = await abrir({ contados: 3 });
  w.state.master.forEach((r, i) => { r.toOrder = i < 2 ? 2 : 0; r.value = 10; });
  w.BarStockInventoryCloud = { replaceInventoryMaster: async () => {} };
  // El modulo lee `state` a secas, y aqui corre con los globales de node.
  global.state = w.state;
  w.__irMovil = []; w.__seccion = [];
  w.BarStockMobile = { montado: () => false, ir: (id) => { w.__irMovil.push(id); } };
  w.bsOpenSection = (s) => { w.__seccion.push(s); };

  b.querySelector('#cfGo').click();
  await esperar(30);
  const boton = w.document.getElementById('cfGoOrder');
  if (boton) boton.click();
  prueba('en el escritorio, abre la seccion de ordenes',
    w.__seccion.length === 1 && w.__seccion[0] === 'vendor', JSON.stringify(w.__seccion));
  prueba('y no toca el shell movil', w.__irMovil.length === 0, JSON.stringify(w.__irMovil));
}

grupo('lo que se aleja del LIVE, antes y después de cerrar');
{
  // Axel, 2026-11-14, sobre lámina: (1) antes de cerrar, una tarjeta con
  // los conteos lejos de lo que esperaba el LIVE; (2) tocarla abre la
  // lista, cortos y sobrantes, y tocar uno lo recuenta; (C) después de
  // cerrar, los tres que más pesan y "See all" que despliega el resto.
  const preparar = async (o) => {
    o = o || {};
    const { w, b } = await abrir({ contados: 6, desdeCero: false });
    w.state.master.forEach(r => { r.value = 10; });
    global.state = w.state;
    new Function(fs.readFileSync(path.join(RAIZ, 'src/live-expected.js'), 'utf8'))();
    // Lo que esperaba el LIVE: el conteo pone 1 a cada contado.
    const filas = o.sinToast ? [{ producto: 'Item 0', live: 5, vendido: 0 }] : [
      { producto: 'Item 0', live: 5, vendido: 6 },     // −4 · $40
      { producto: 'Item 1', live: 7, vendido: 3 },     // −6 · $60
      { producto: 'Item 2', live: 1.2, vendido: 2 },   // 0.2: nada
      { producto: 'Item 3', live: 3.5, vendido: 4 },   // −2.5 · $25
      { producto: 'Item 4', live: 3, vendido: 1 },     // −2 · $20
      { producto: 'Item 5', live: -2, vendido: 8 }     // +3 · $30
    ];
    w.BarStockLiveExpected.previo = async () => ({ sincronizado: true, filas,
      precio: Object.fromEntries(w.state.master.map(r => [r.item, 10])),
      enToast: () => !o.sinToast });
    // Se reabre para que la carga pase con el previo de mentira.
    w.BarStockCountFinish.open(() => {}, () => {});
    await esperar(40);
    return { w, b: w.document.getElementById('cfBody') };
  };

  let { w, b } = await preparar();
  const card = b.querySelector('[data-ir="esperado"]');
  prueba('antes de cerrar: la tarjeta', !!card, txt(b).slice(0, 300));
  prueba('dice cuántos y de qué', card && /5 counts far from what Live expected/.test(card.textContent), card && card.textContent.replace(/\s+/g, ' '));
  prueba('con los dos que más pesan, y "Tap to recount" primero', card && /Tap to recount · Item 1 1 vs ≈7/.test(card.textContent.replace(/\s+/g, ' ')) && /Item 1 1 vs ≈7/.test(card.textContent.replace(/\s+/g, ' ')) && /Item 0 1 vs ≈5/.test(card.textContent.replace(/\s+/g, ' ')), card && card.textContent.replace(/\s+/g, ' '));
  prueba('y la tarjeta vieja de "do not look right" ya no', !b.querySelector('[data-ir="raros"]'));

  card.click();
  await esperar(10);
  b = w.document.getElementById('cfBody');
  const t = txt(b);
  prueba('la lista: primero lo que falta', /Less than expected/.test(t) && t.indexOf('Less than expected') < t.indexOf('More than expected'), t.slice(0, 300));
  const filasL = [...b.querySelectorAll('[data-esp]')];
  prueba('una fila por cada uno', filasL.length === 5, String(filasL.length));
  prueba('con lo contado, lo esperado, la diferencia y el dinero',
    filasL[0] && /Item 1/.test(filasL[0].textContent) && /counted 1/.test(filasL[0].textContent) && /expected ≈7/.test(filasL[0].textContent) &&
    /−6/.test(filasL[0].textContent) && /−\$60/.test(filasL[0].textContent), filasL[0] && filasL[0].textContent.replace(/\s+/g, ' '));
  prueba('lo que sobra, en verde y aparte', /More than expected[\s\S]*Item 5[\s\S]*\+3/.test(t) && !!b.querySelector('[data-esp] .pos'));
  let abierto = null;
  w.BarStockCountPanel = { open: (row, fin) => { abierto = row.item; } };
  filasL[0].click();
  prueba('tocar uno abre SU panel de conteo para recontarlo', abierto === 'Item 1', String(abierto));

  // Después de cerrar: los tres que más pesan y "See all".
  ({ w, b } = await preparar());
  w.BarStockInventoryCloud = { replaceInventoryMaster: async () => {} };
  w.BarStockMobile = { montado: () => false, ir() {} };
  w.bsOpenSection = () => {};
  b.querySelector('#cfGo').click();
  await esperar(60);
  b = w.document.getElementById('cfBody');
  const sec = b.querySelector('.cf-ex-sec');
  prueba('después de cerrar: la sección', !!sec, txt(b).slice(0, 400));
  prueba('con el total de la semana', sec && /Live vs count/.test(sec.textContent) && /−\$115 this week/.test(sec.textContent), sec && sec.textContent.replace(/\s+/g, ' '));
  const vis = sec ? [...sec.querySelectorAll('.cf-ex')].filter(x => !x.hidden) : [];
  prueba('los tres que más pesan, a la vista', vis.length === 3 && /Item 1/.test(vis[0].textContent), vis.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  prueba('cuántos faltan, cuántos sobran, y que es final mañana', sec && /4 short · 1 over/.test(sec.textContent) && /final tomorrow/i.test(sec.textContent), sec && sec.textContent.replace(/\s+/g, ' '));
  const mas = sec && sec.querySelector('.cf-ex-mas');
  prueba('"See all 5"', !!mas && /See all 5/.test(mas.textContent), mas && mas.textContent);
  if (mas) mas.click();
  const vis2 = sec ? [...sec.querySelectorAll('.cf-ex')].filter(x => !x.hidden) : [];
  prueba('que despliega el resto ahí mismo', vis2.length === 5 && !sec.querySelector('.cf-ex-mas:not([hidden])'), String(vis2.length));
  const sep = w.document.getElementById('cfExMasS');
  prueba('el separador se esconde con el botón (sin "· ·" al desplegar)', !!sep && sep.hidden === true && sep.contains(mas), String(sep && sep.hidden));
  prueba('y el siguiente paso sigue debajo', b.innerHTML.indexOf('cf-ex-sec') < b.innerHTML.indexOf('cf-next-card'));

  // Sin Toast (Jockey, Harvest): la tarjeta vieja sigue, nada nuevo.
  ({ w, b } = await preparar({ sinToast: true }));
  prueba('sin Toast: ni tarjeta nueva', !b.querySelector('[data-ir="esperado"]'));
}

grupo('el esperado no puede tumbar el cierre');
{
  // El esperado (live-expected.js) se toma antes del bucle que escribe el
  // on hand y se guarda sin esperarlo. Aquí: que falle de todas las
  // formas posibles y el conteo se cierre igual.
  const { w, b } = await abrir({ contados: 3, desdeCero: false });
  w.state.master.forEach((r, i) => { r.toOrder = i < 2 ? 2 : 0; r.value = 10; });
  let guardado = false;
  w.BarStockInventoryCloud = { replaceInventoryMaster: async () => { guardado = true; } };
  global.state = w.state;
  w.BarStockMobile = { montado: () => false, ir() {} };
  w.bsOpenSection = () => {};
  w.BarStockLiveExpected = {
    antes: async () => { throw new Error('sin red'); },
    guardar: () => Promise.reject(new Error('tampoco'))
  };
  b.querySelector('#cfGo').click();
  await esperar(60);
  prueba('con el esperado roto, el conteo se guarda', guardado);
  prueba('y la pantalla llega al final', !!w.document.getElementById('cfGoOrder'), txt(b).slice(0, 120));
}
{
  // Si tomar lo de antes se queda colgado (la red no contesta), el
  // cierre no puede quedarse esperando: hay un tope (ESPERA) y se sigue
  // sin el esperado. En la app son 5 s; aquí, 50 ms.
  const { w, b } = await abrir({ contados: 3, desdeCero: false });
  let guardado = false;
  w.BarStockInventoryCloud = { replaceInventoryMaster: async () => { guardado = true; } };
  global.state = w.state;
  w.BarStockMobile = { montado: () => false, ir() {} };
  w.bsOpenSection = () => {};
  w.BarStockLiveExpected = { ESPERA: 50, antes: () => new Promise(() => {}), guardar: async () => ({ ok: true }) };
  b.querySelector('#cfGo').click();
  await esperar(300);
  prueba('con lo de antes colgado, el conteo se guarda igual', guardado);
  prueba('y la pantalla llega al final', /Count closed/.test(txt(w.document.getElementById('cfBody'))));
}
{
  // Lo de antes se toma con los números viejos: el fixture tiene 2 en
  // los contados y bottlesFor devuelve 1 al cerrar.
  const { w, b } = await abrir({ contados: 3, desdeCero: false });
  w.BarStockInventoryCloud = { replaceInventoryMaster: async () => {} };
  global.state = w.state;
  w.BarStockMobile = { montado: () => false, ir() {} };
  w.bsOpenSection = () => {};
  let visto = null;
  w.BarStockLiveExpected = {
    antes: async (m) => { visto = m[0].onHand; return { desde: '2026-11-09T02:30:00.000Z', onHand: {}, precio: {} }; },
    guardar: async () => ({ ok: true })
  };
  b.querySelector('#cfGo').click();
  await esperar(60);
  prueba('lo de antes ve el on hand viejo (2), no el nuevo (1)', visto === 2, String(visto));
  prueba('y el nuevo sí quedó escrito', w.state.master[0].onHand === 1, String(w.state.master[0].onHand));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
