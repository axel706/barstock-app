#!/usr/bin/env node
/*
 * ── Sales en el escritorio (Axel, 2026-11-25, lámina A) ────────────────
 *
 * Lo que se protege:
 *
 *   1. "Full report" / "All products" abren en el escritorio SU pantalla,
 *      no la hoja del teléfono en una ventana; en el teléfono, la hoja.
 *   2. Abre en la misma semana, día y vista que la tarjeta del Home.
 *   3. Dos tablas con un cambio: el dinero va por lo que vende Toast y las
 *      botellas por el producto del inventario (no caben en una fila).
 *      Las dos se ordenan y se filtran; en dinero, por licor o vino.
 *   4. Las cuentas son las de la hoja del teléfono (comparar, vsUsual,
 *      pies de mobile-sales): no se escriben otra vez.
 *   5. Un producto del inventario abre su ficha (Do we have); un artículo
 *      de Toast no.
 *   6. La sección existe antes que el armazón y la barra ya no dice
 *      "Soon".
 *
 *   node tools/test-sales-escritorio.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = (ms) => new Promise(r => setTimeout(r, ms || 0));
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

const INDEX = leer('index.html');
const MSL = leer('src/mobile-sales.js');
const DSL = leer('src/desk-sales.js');
const SH = leer('src/desk-shell.js');
const CSS = leer('styles/desk-sales.css');

function entorno(clase) {
  const w = new JSDOM(`<!doctype html><body class="${clase || 'dk'}"><div class="wrap"></div></body>`,
    { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  const mk = (dia, fecha, b, din, o) => Object.assign({ dia, fecha, botellas: b, dinero: din, licor: din * .6, vino: din * .4,
    normalBotellas: b || 1, normalDinero: din || 100, cargado: true, futuro: false, esHoy: false, parcial: false }, o || {});
  const semana = (k) => {
    const dias = [mk('Mon', '2026-11-23', 0, 0), mk('Tue', '2026-11-24', 9, 1500), mk('Wed', '2026-11-25', 6, 600, { esHoy: k === 0, parcial: k === 0, cargado: k !== 0 }),
      mk('Thu', '2026-11-26', 0, 0, { futuro: !k }), mk('Fri', '2026-11-27', 0, 0, { futuro: !k }), mk('Sat', '2026-11-28', 0, 0, { futuro: !k }), mk('Sun', '2026-11-29', 0, 0, { futuro: !k })];
    return { etiqueta: k ? 'Nov 16 – 22' : 'Nov 23 – 29', dias, fechas: dias.filter(x => !x.futuro).map(x => x.fecha),
      total: { semana: true, dia: 'Nov 23 – 29', fecha: '2026-11-23', botellas: 15, dinero: 2100, licor: 1260, vino: 840, normalBotellas: 60, normalDinero: 9000, cargado: true, parcial: !k } };
  };
  w.__pedidas = [];
  w.BarStockToastSales = {
    ahora: async () => ({ cargados: true, base: { dias: [] } }),
    semanaCal: (V, k) => semana(k), semanasAtras: () => 4,
    masVendido: (b, f, v) => { w.__pedidas.push({ f, v }); return v === 'dinero'
      ? [{ nombre: 'Espresso Martini', dinero: 342, unidades: 26, categoria: 'licor' }, { nombre: 'White Haven Glass', dinero: 254, unidades: 17, categoria: 'vino' }, { nombre: 'Blood Orange Cosmo', dinero: 118, unidades: 9, categoria: 'licor' }]
      : [{ nombre: 'Kahlua', botellas: 1.1 }, { nombre: "Tito's Vodka", botellas: 1.4 }, { nombre: 'Aperol', botellas: 0.6 }]; },
    fuera: () => [{ categoria: 'Banquet Beverage', dinero: 640 }],
    ultimaCarga: () => new Date(), cargaVieja: () => false, textoCarga: () => '3:06 PM'
  };
  w.state = { master: [{ item: 'Kahlua', vendor: 'SOUTHERN' }, { item: "Tito's Vodka", vendor: 'LOOP' }] };
  w.BarStockLiveCache = { medianas: (r) => r.item === "Tito's Vodka" ? [1, 1, 1, 1, 1, 1, 1] : null };
  w.__ir = [];
  w.BarStockDeskShell = { ir: (id) => { w.__ir.push(id); const s = w.document.getElementById(id + 'Section'); if (s) s.classList.add('bs-active-section'); } };
  w.__ficha = [];
  w.BarStockDeskSearch = { buscar: (q) => w.__ficha.push(['buscar', q]), elegir: (i) => w.__ficha.push(['elegir', i]) };
  w.eval(MSL);
  w.eval(DSL);
  return w;
}

(async () => {
  grupo('1. Full report abre la pantalla del escritorio, no la hoja');
  {
    const w = entorno('dk');
    w.BarStockMobileSales.abrir({ vista: 'dinero', atras: 1, dia: 6 });
    await esperar(30);
    prueba('no abre la hoja del teléfono', !w.document.getElementById('mSheet'));
    prueba('abre la sección Sales por la barra', w.__ir.includes('sales'));
    const s = w.document.getElementById('dkSales');
    prueba('en la misma semana', /Nov 16 – 22/.test(txt(s.querySelector('.dks-semana'))), txt(s.querySelector('.dks-semana')));
    prueba('en el mismo día (el domingo)', /Sun/.test(txt(s.querySelector('.dks-dia.on'))), txt(s.querySelector('.dks-dia.on')));
    prueba('en la misma vista (dinero)', /Money/.test(txt(s.querySelector('[data-vista].on'))));
  }
  {
    const w = entorno('dk m-shell');
    w.BarStockMobileSales.abrir({ vista: 'dinero', atras: 0, dia: 1 });
    await esperar(30);
    prueba('en el teléfono, la hoja de siempre', !!w.document.getElementById('mSheet') && !w.__ir.includes('sales'));
  }

  grupo('2. Arriba: la semana, cinco cifras y los días');
  const w = entorno('dk');
  w.BarStockDeskSales.abrir({ vista: 'dinero', atras: 0, dia: 'sem' });
  await esperar(30);
  const S = () => w.document.getElementById('dkSales');
  prueba('el logo de Toast y su sync', !!S().querySelector('img.dks-logo') && /synced 3:06 PM/.test(txt(S().querySelector('.dks-sync'))));
  prueba('cinco cifras', S().querySelectorAll('.dks-k').length === 5);
  prueba('neto, botellas, licor, vino y el mejor día', /Net/.test(txt(S().querySelector('.dks-cifras'))) && /Bottles/.test(txt(S().querySelector('.dks-cifras')))
    && /Liquor & cocktails/.test(txt(S().querySelector('.dks-cifras'))) && /Wine/.test(txt(S().querySelector('.dks-cifras'))) && /Best day[\s\S]*Tue/.test(txt(S().querySelector('.dks-cifras'))));
  prueba('la semana en curso dice "So far this week" (no compara a medias)', /So far this week/.test(txt(S().querySelector('.dks-cifras'))));
  prueba('la semana entera y sus siete días', S().querySelectorAll('.dks-dia').length === 8 && !!S().querySelector('.dks-dia.dks-sem.on'));
  prueba('lo que no ha llegado no se elige', S().querySelectorAll('.dks-dia.fut[disabled]').length === 4);
  // Hoy, cargado a medias con el Sync: no está cerrado, pero tiene ventas.
  prueba('hoy, a medias, enseña lo vendido (no "No data")', /Today\s*\$600/.test(txt(S().querySelector('[data-dia="2"]'))), txt(S().querySelector('[data-dia="2"]')));
  prueba('las barras de los días, altas (120 px)', /\.dks-g \{[^}]*height: 120px/.test(CSS));
  S().querySelector('[data-dia="1"]').click(); await esperar(10);
  prueba('tocar un día lo elige', /Tue/.test(txt(S().querySelector('.dks-dia.on'))) && /Net · Tue/.test(txt(S().querySelector('.dks-cifras'))));
  S().querySelector('[data-sem="1"]').click(); await esperar(10);
  prueba('‹ va a la semana anterior, entera', /Nov 16 – 22/.test(txt(S().querySelector('.dks-semana'))) && !!S().querySelector('.dks-dia.dks-sem.on'));
  S().querySelector('[data-sem="-1"]').click(); await esperar(10);

  grupo('3. Dos tablas con un cambio');
  const filas = () => [...S().querySelectorAll('.dks-tr')].map(f => txt(f.querySelector('.dks-n')));
  prueba('dinero: lo que vendió Toast, del que más al que menos', filas().join('|') === 'Espresso Martini|White Haven Glass|Blood Orange Cosmo', filas().join('|'));
  prueba('con su tipo, neto, vendidos y su parte', /Liquor & cocktails\s*\$342\s*26\s*16\.3%/.test(txt(S().querySelector('.dks-tr'))), txt(S().querySelector('.dks-tr')));
  prueba('al pie, lo que el dinero deja fuera', /Not in this report: Banquet Beverage \$640/.test(txt(S())));
  S().querySelector('[data-cat="vino"]').click(); await esperar(10);
  prueba('filtro Wine', filas().join('|') === 'White Haven Glass');
  S().querySelector('[data-cat="todo"]').click(); await esperar(10);
  S().querySelector('[data-col="nombre"]').click(); await esperar(10);
  prueba('ordenar por nombre (A→Z)', filas()[0] === 'Blood Orange Cosmo', filas().join('|'));
  S().querySelector('[data-col="nombre"]').click(); await esperar(10);
  prueba('otra vez, al revés', filas()[0] === 'White Haven Glass', filas().join('|'));
  const q = S().querySelector('#dksQ'); q.value = 'cosmo'; q.dispatchEvent(new w.Event('input')); await esperar(10);
  prueba('filtrar por nombre', filas().join('|') === 'Blood Orange Cosmo');
  prueba('el campo conserva lo escrito', S().querySelector('#dksQ').value === 'cosmo');
  const q2 = S().querySelector('#dksQ'); q2.value = ''; q2.dispatchEvent(new w.Event('input')); await esperar(10);
  prueba('un artículo de Toast no abre ficha', !S().querySelector('.dks-tr[data-item]'));
  S().querySelector('[data-vista="botellas"]').click(); await esperar(10);
  prueba('botellas: los productos del inventario', filas().join('|') === "Tito's Vodka|Kahlua|Aperol", filas().join('|'));
  prueba('la semana en curso no se compara (no está entera)', !/↗|↘/.test(txt(S().querySelector('.dks-tr'))), txt(S().querySelector('.dks-tr')));
  S().querySelector('[data-dia="1"]').click(); await esperar(10);
  prueba('un día cerrado: con su proveedor y contra lo de siempre', /LOOP\s*1\.4\s*↗ 0\.4/.test(txt(S().querySelector('.dks-tr'))), txt(S().querySelector('.dks-tr')));
  prueba('sin filtro de licor y vino (es por producto)', !S().querySelector('[data-cat]'));
  prueba('dice de dónde salen las botellas', /recipes and pours/.test(txt(S())));
  const tito = S().querySelector('.dks-tr[data-item="Tito\'s Vodka"]');
  tito.click();
  prueba('un producto del inventario abre su ficha (Do we have)', w.__ficha.length === 2 && w.__ficha[0][1] === "Tito's Vodka" && w.__ficha[1][1] === 1, JSON.stringify(w.__ficha));
  prueba('lo que no está en el inventario no se toca', !S().querySelector('.dks-tr[data-item="Aperol"]'));

  grupo('4. Las cuentas son las del teléfono');
  prueba('mobile-sales exporta comparar, vsUsual y pies', /BarStockMobileSales = \{[^}]*comparar[^}]*vsUsual[^}]*pies/.test(MSL));
  prueba('la hoja del teléfono las usa', /const cmp = comparar\(d, 'botellas'\)\.txt/.test(MSL) && /const cmp = comparar\(d, 'dinero'\)\.txt/.test(MSL) && /vsUsual\(x\.nombre, x\.botellas, d\)/.test(MSL));
  prueba('desk-sales no las escribe otra vez', /M\.comparar\(/.test(DSL) && /M\.vsUsual\(/.test(DSL) && /M\.pies\(/.test(DSL) && !/% vs usual|'— usual'/.test(DSL) && !/medianas/.test(DSL));

  grupo('5. La sección y la barra');
  prueba('crea #salesSection dentro de .wrap', !!w.document.querySelector('.wrap > #salesSection.section-card'));
  prueba('la barra la abre y ya no dice "Soon"', /id: 'sales', label: 'Sales', icon: '[\w-]+', sec: 'sales' \}/.test(SH));
  const pos = (f) => INDEX.indexOf(f);
  prueba('se carga antes que desk-shell y después de mobile-sales', pos('src/desk-sales.js') > pos('src/mobile-sales.js') && pos('src/desk-sales.js') < pos('src/desk-shell.js') && pos('src/desk-sales.js') > 0);
  prueba('su hoja, con versión', /styles\/desk-sales\.css\?v=/.test(INDEX));
  prueba('el panel con vidrio', /#salesSection \{[^}]*backdrop-filter: blur\(\d+px\)/.test(CSS));
  prueba('los colores sólo en barras y puntos (no pintan la tabla)', !/#dkSales \.(licor|vino|bot) \{/.test(CSS));
  prueba('con poco sitio se apila (por el ancho de la sección)', /@container dksales \(max-width: 900px\)/.test(CSS));

  console.log('\n' + ok + ' ok · ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
})();
