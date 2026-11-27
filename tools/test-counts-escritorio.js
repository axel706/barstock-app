#!/usr/bin/env node
/*
 * ── Reports › Counts en el escritorio (desk-counts.js; Axel 2026-11-27) ──
 *
 * Lo que no puede volver a pasar:
 *
 *   1. Counts es una sección de la barra lateral (ya no "Soon"): la lista
 *      de conteos (opción B, tiempo y Live vs count) y, al tocar uno, su
 *      reporte. Las cuentas son de count-report.js, no de aquí.
 *   2. La tabla de productos tiene SU scroll: la página no crece con los
 *      190 (Axel: "scroll interno para no irnos a una pantalla nueva").
 *   3. La verificación de la semana va en la MISMA línea del producto, en
 *      su columna (Axel: "en un renglón extra está mal").
 *   4. El porqué va bajo el producto, dentro de su fila, como en la lámina
 *      que eligió.
 *   5. Nada promete lo que no hace: sin "Recount" (no hay panel de botella
 *      fuera de un conteo). Sólo lee.
 *
 *   node tools/test-counts-escritorio.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const existe = f => fs.existsSync(path.join(RAIZ, f));

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = (ms) => new Promise(r => setTimeout(r, ms || 0));

const DC = existe('src/desk-counts.js') ? leer('src/desk-counts.js') : '';
const CSS = existe('styles/desk-counts.css') ? leer('styles/desk-counts.css') : '';
const INDEX = leer('index.html');

(async () => {
  grupo('1. La sección, su sitio y su orden de carga');
  prueba('desk-counts.js existe', !!DC);
  prueba('Counts ya no es "Soon": abre su sección', /id: 'counts', label: 'Counts', icon: 'ti-clock-hour-4', sec: 'counts'/.test(leer('src/desk-shell.js')));
  const i = (f) => INDEX.indexOf(f);
  prueba('desk-counts antes de desk-shell (vigila las secciones al montar)', i('src/desk-counts.js') > 0 && i('src/desk-counts.js') < i('src/desk-shell.js'));
  prueba('y después de count-report (sus cuentas)', i('src/count-report.js') > 0 && i('src/count-report.js') < i('src/desk-counts.js'));
  prueba('su hoja de estilos', i('styles/desk-counts.css') > 0);
  prueba('las cuentas no se hacen aquí (count-report)', !/seAleja|difference\s*[-+]/.test(DC) && /CR\(\)\.lista\(\)/.test(DC) && /CR\(\)\.reporte\(/.test(DC));

  const dom = new JSDOM('<!doctype html><body class="dk"><div class="wrap"></div></body>', { url: 'https://x.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, D = w.document;
  w.BARSTOCK_CONFIG = { LOCATION_NAME: 'Crown' };
  w.scrollTo = () => {};
  w.BarStockCountFinish = { MINIMO_PARA_COMPARAR: 300000, comparar: (a, b) => (a < b ? Math.round((b - a) / 60000) + ' min faster' : Math.round((a - b) / 60000) + ' min slower') };
  w.BarStockCountSession = { fmtDur: (ms) => Math.round(ms / 60000) + ' min' };
  const refrescos = [];
  w.BarStockDeskHeader = {
    registrar: (s, spec) => { w.__spec = spec; }, refrescar: (s) => refrescos.push(s), menu: () => {},
    campo: () => '<span class="campo"></span>', boton: (o) => `<span data-acc="${o.acc}"></span>`, vacio: () => '<span></span>'
  };
  const fin = (d) => new Date(Date.parse(d + 'T02:30:00Z')).toISOString();
  const SES = [{ id: 1, week_key: '2026-11-16', finished_at: fin('2026-11-17'), active_ms: 78 * 60000, items: 188 },
    { id: 2, week_key: '2026-11-23', finished_at: fin('2026-11-24'), active_ms: 72 * 60000, items: 190 }];
  const CIC = [{ id: 'c1', cycle_start: fin('2026-11-17'), cycle_end: fin('2026-11-24'), end_day: '2026-11-23', status: 'final', unconverted: [] }];
  const F = [{ cycle_id: 'c1', item_name: "Tito's", start_count: 8, arrived: 12, sold: 9.4, counted: 8, expected: 10.6, difference: -2.6, unit_price: 24, in_toast: true,
    checked: { n: 9, at: '2026-11-20T18:00:00Z', by: 'Mia' } },
  { cycle_id: 'c1', item_name: 'Aperol', start_count: 3, arrived: 6, sold: 4.1, counted: 4.9, expected: 4.9, difference: 0, unit_price: 20, in_toast: true, checked: null }];
  const FO = [{ week_start: '2026-11-16', item_name: "Tito's", on_hand_start: 8 }, { week_start: '2026-11-23', item_name: "Tito's", on_hand_start: 8 },
    { week_start: '2026-11-16', item_name: 'Aperol', on_hand_start: 3 }, { week_start: '2026-11-23', item_name: 'Aperol', on_hand_start: 4.9 }];
  const rutas = [];
  w.BarStockRest = { leerTodo: async (r) => { rutas.push(r); return r.startsWith('count_sessions') ? SES.slice().reverse() : r.startsWith('live_expected_cycles') ? CIC : r.startsWith('live_expected?') ? F : r.startsWith('inventory_snapshots') ? FO : []; } };
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'L1' };
  w.state = { master: [{ item: "Tito's", value: 24, suggested: 6 }, { item: 'Aperol', value: 20, suggested: 4 }] };
  const fetches = [];
  w.fetch = (...a) => { fetches.push(a); return Promise.resolve({ ok: true, text: async () => '[]' }); };
  for (const f of ['src/live-diagnostico.js', 'src/count-report.js', 'src/desk-counts.js']) w.eval(leer(f));

  const sec = D.getElementById('countsSection');
  prueba('crea #countsSection con el estándar de las secciones', !!sec && sec.classList.contains('dk-pantalla'));
  prueba('se registra en el header de sitios fijos', !!w.__spec && w.__spec.busca === false);

  grupo('2. La lista: tiempo y Live vs count de cada conteo');
  sec.classList.add('bs-active-section');
  await esperar(30);
  const filas = [...D.querySelectorAll('#dkCnt [data-cnt]')];
  prueba('un renglón por conteo, el más nuevo primero', filas.length === 2 && filas[0].dataset.cnt === '2026-11-23', filas.map(f => f.dataset.cnt).join(','));
  prueba('con su comparación de tiempo', /6 min faster/.test(filas[0].textContent));
  prueba('y su Live vs count', /\$62/.test(filas[0].textContent), filas[0].textContent.replace(/\s+/g, ' '));
  prueba('el que no guardó Live vs count lo dice', /not saved/.test(filas[1].textContent));

  grupo('3. El reporte de un conteo');
  filas[0].click();
  await esperar(30);
  const caja = D.getElementById('dkCnt');
  prueba('abre el reporte', caja.dataset.vista === 'rep' && !!caja.querySelector('.dkn-tb'));
  prueba('el título lleva Counts como enlace de vuelta', JSON.stringify(w.__spec.titulo()).includes('"miga":"lista"'));
  prueba('la tabla rueda POR DENTRO (su caja con alto máximo y scroll)', !!caja.querySelector('.dkn-tb .dkn-sc') && /\.dkn-sc \{[^}]*max-height:[^}]*overflow-y: auto/.test(CSS));
  prueba('los títulos de las columnas, pegados arriba al rodar', /\.dkn-th \{[^}]*position: sticky; top: 0/.test(CSS));
  const tito = [...caja.querySelectorAll('.dkn-tr')].find(e => /Tito/.test(e.textContent));
  prueba('la verificación, en la MISMA fila y en su columna', !!tito && !!tito.querySelector(':scope > span > .dkn-ck') && /9 · /.test(tito.querySelector('.dkn-ck').textContent));
  prueba('el porqué, bajo el producto y dentro de su fila', !!tito.querySelector(':scope > .dkn-wy.gx'), tito.innerHTML.slice(0, 300));
  prueba('la diferencia en su píldora y el dinero aparte', /−2\.6/.test(tito.querySelector('.dkn-dif').textContent) && /−\$62/.test(tito.querySelector('.usd').textContent));
  const aperol = [...caja.querySelectorAll('.dkn-tr')].find(e => /Aperol/.test(e.textContent));
  prueba('lo que cuadra: "even" y sin franja', /even/.test(aperol.textContent) && !aperol.querySelector('.dkn-wy'));
  prueba('el resumen y a dónde se fue el dinero', !!caja.querySelector('.dkn-verd') && !!caja.querySelector('.dkn-cas'));
  prueba('las tres tarjetas y semana tras semana', caja.querySelectorAll('.dkn-tres > .dkn-car').length === 3 && /Week after week/.test(caja.textContent));
  prueba('sin "Recount" (no hay panel de botella fuera de un conteo)', !/Recount/.test(caja.textContent) && !/Recount/.test(DC.replace(/\/\/.*$/gm, '')));

  grupo('4. Volver y sólo leer');
  w.__spec.alClic({}, { dataset: { dkc: 'miga' } });
  await esperar(10);
  prueba('"Counts" del título vuelve a la lista', caja.dataset.vista === 'lista');
  prueba('sólo lee: nada se escribe', fetches.length === 0 && rutas.every(r => !/method/.test(r)));

  console.log(mal ? `\n${mal} MAL de ${ok + mal}` : `\ntodo bien   ·   ${ok} comprobaciones`);
  process.exit(mal ? 1 : 0);
})();
