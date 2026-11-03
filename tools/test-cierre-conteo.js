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
  prueba('no se compara contra un conteo de prueba',
    /antes\.active_ms >= MINIMO_PARA_COMPARAR/.test(src));

  const css = fs.readFileSync(path.join(RAIZ, 'styles/count-panel.css'), 'utf8');
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

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
