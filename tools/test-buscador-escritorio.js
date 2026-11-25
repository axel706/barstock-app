#!/usr/bin/env node
/*
 * ── "Do we have" en el escritorio (Axel, 2026-11-25, lámina A) ─────────
 *
 * Lo que se protege:
 *
 *   1. Lo que se ve es del teléfono: desk-search no busca, no pinta
 *      tarjetas ni fichas por su cuenta; usa buscar, tarjetaResultado,
 *      engancharResultados y llenarFicha de mobile-search, que el
 *      teléfono usa también (fallo nº 1: lo mismo escrito en dos sitios).
 *   2. Los estilos de la tarjeta y de la ficha se GENERAN de los del
 *      teléfono: styles/desk-ficha.css tiene que estar al día con
 *      tools/compartir-ficha.js.
 *   3. El campo va justo después del saludo; con 2 letras se abre el
 *      panel, con menos se cierra; tocar una tarjeta llena la ficha.
 *   4. Esc y el velo cierran; "/" y Ctrl+K llevan al campo, "/" no
 *      escribiendo en otro campo; con la hoja del teclado abierta, Esc
 *      es de la hoja.
 *   5. El campo no pasa por debajo de la locación (ancho medido).
 *   6. Orden de carga y versiones.
 *
 *   node tools/test-buscador-escritorio.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const espera = (ms) => new Promise(r => setTimeout(r, ms || 0));

const INDEX = leer('index.html');
const MS = leer('src/mobile-search.js');
const DS = leer('src/desk-search.js');
const CSS = leer('styles/desk-search.css');

grupo('1. Lo que se ve es del teléfono');
prueba('mobile-search exporta buscar, tarjetaResultado, engancharResultados y llenarFicha',
  /window\.BarStockMobileSearch\s*=\s*\{[^}]*buscar[^}]*tarjetaResultado[^}]*engancharResultados[^}]*llenarFicha/.test(MS));
prueba('el teléfono pinta su lista con tarjetaResultado y engancharResultados',
  /function pintarLista[\s\S]{0,4000}tarjetaResultado\(r\)[\s\S]{0,400}engancharResultados\(/.test(MS));
prueba('la ficha del teléfono se llena con llenarFicha',
  /function ficha\(host, idx\)[\s\S]{0,4000}llenarFicha\(/.test(MS));
prueba('desk-search no pinta product-hero ni lee el maestro por su cuenta',
  !/BarStockProductHero|state\.master|\.html\(r\s*,/.test(DS));
prueba('desk-search usa las cuatro del teléfono',
  /M\.buscar\(/.test(DS) && /M\.tarjetaResultado\(/.test(DS) && /M\.engancharResultados\(/.test(DS) && /M\.llenarFicha\(/.test(DS));

grupo('2. Los estilos de la ficha salen generados');
let alDia = true, salida = '';
try { salida = execFileSync('node', [path.join(RAIZ, 'tools/compartir-ficha.js'), '--check'], { encoding: 'utf8' }); }
catch (e) { alDia = false; salida = String(e.stdout || e.message); }
prueba('styles/desk-ficha.css está al día con mobile-app.css', alDia, salida.trim());
const GEN = leer('styles/desk-ficha.css');
prueba('el generado lo dice en su cabecera', /GENERADO por tools\/compartir-ficha\.js/.test(GEN));
prueba('todas sus reglas cuelgan de #dkBuscar, #dkRo (Running out), #dkVentas (Toast) o de la hoja del escritorio',
  GEN.split('\n').filter(l => /^\s{2}[^\s/@}].*[{,]$/.test(l)).every(l => /^\s{2}(#dkBuscar |#dkRo |#dkVentas |body\.dk)/.test(l)));
prueba('lo de dentro de la hoja cuelga de #mSheet (no toca nada más del escritorio)',
  GEN.split('\n').filter(l => /^\s{2}body\.dk /.test(l)).every(l => /^\s{2}body\.dk (#mSheet|\.m-sheet)/.test(l)));
prueba('van dentro de @media (min-width: 641px)', /^@media \(min-width: 641px\) \{/m.test(GEN));
// Que el check muerda: con el archivo cambiado, tiene que fallar.
const { generar } = require(path.join(RAIZ, 'tools/compartir-ficha.js'));
prueba('generar() da exactamente el archivo', generar() === GEN);
prueba('un cambio en la tarjeta del teléfono cambiaría lo generado',
  /#dkBuscar \.m-res/.test(GEN) && /#dkBuscar \.m-fic/.test(GEN));

// ── El escenario ────────────────────────────────────────────────────
const dom = new JSDOM(`<!doctype html><body class="dk"><div class="wrap">
  <div class="bs-header card"><div class="bs-header-line1"><button id="dkMenu"></button><div id="dkSaludo" class="dk-saludo"><b>Hello</b></div>
  <div class="bs-loc-wrap">Crown</div></div></div>
  <input id="otroCampo">
</div></body>`, { url: 'https://x.test/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
const D = w.document;

const llamadas = [];
const MAESTRO = [{ item: "Tito's Vodka" }, { item: "Tito's Handmade" }, { item: 'Aperol' }];
w.BarStockMobileSearch = {
  buscar: (q) => { llamadas.push(['buscar', q]); return MAESTRO.map((r, i) => Object.assign({ _i: i }, r)).filter(r => r.item.toLowerCase().includes(q.toLowerCase())); },
  tarjetaResultado: (r) => `<div class="m-res" data-i="${r._i}">${r.item}</div>`,
  engancharResultados: (caja, abrir) => {
    llamadas.push(['enganchar']);
    caja.querySelectorAll('.m-res').forEach(t => t.addEventListener('click', () => abrir(Number(t.dataset.i))));
  },
  llenarFicha: (caja, i, rehacer, asa) => { llamadas.push(['ficha', i, asa]); caja.innerHTML = '<div class="m-fic">' + MAESTRO[i].item + '</div>'; }
};
w.ResizeObserver = class { observe() {} };
w.eval(DS);

(async () => {
  await espera(30);
  const campo = D.getElementById('dkBuscaIn');
  const panel = D.getElementById('dkBuscar');
  const escribir = (v) => { campo.value = v; campo.dispatchEvent(new w.Event('input')); };
  const tecla = (key, extra, en) => (en || D.body).dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, extra || {})));

  grupo('3. El campo, el panel y la ficha');
  prueba('el campo existe', !!campo);
  prueba('va justo después del saludo', D.getElementById('dkSaludo').nextElementSibling === D.getElementById('dkBusca'));
  prueba('el panel empieza cerrado', panel && panel.hidden);
  escribir('t');
  prueba('con una letra no se abre', panel.hidden);
  escribir('tit');
  prueba('con tres letras se abre', !panel.hidden);
  prueba('busca con lo escrito', llamadas.some(l => l[0] === 'buscar' && l[1] === 'tit'));
  const tarjetas = panel.querySelectorAll('#dkbLista .m-res');
  prueba('pinta las tarjetas del teléfono', tarjetas.length === 2);
  prueba('y las engancha con las del teléfono', llamadas.some(l => l[0] === 'enganchar'));
  prueba('el contador dice cuántas', /2 matches/.test(D.getElementById('dkbCnt').textContent));
  prueba('sin elegir, la ficha invita a elegir', /Choose a product/.test(D.getElementById('dkbFicha').textContent));
  tarjetas[1].click();
  prueba('tocar una tarjeta llena la ficha con llenarFicha', /Handmade/.test(D.getElementById('dkbFicha').textContent));
  prueba('sin el asa de la hoja del teléfono', llamadas.some(l => l[0] === 'ficha' && l[1] === 1 && l[2] === false));
  prueba('la tarjeta elegida se marca', panel.querySelector('#dkbLista .m-res[data-i="1"]').classList.contains('dkb-elegida'));
  escribir('zzz');
  prueba('sin resultados, lo dice con lo escrito', /Nothing called “zzz”/.test(D.getElementById('dkbLista').textContent));
  escribir('ape');
  tecla('Enter', null, campo);
  prueba('Enter abre la ficha del primero', /Aperol/.test(D.getElementById('dkbFicha').textContent));
  escribir('a');
  prueba('borrando hasta una letra se cierra', panel.hidden);

  grupo('4. Cerrar y llegar al campo');
  escribir('tit');
  tecla('Escape');
  prueba('Esc cierra', panel.hidden);
  campo.dispatchEvent(new w.Event('focus'));
  prueba('volver al campo con algo escrito lo reabre', !panel.hidden);
  panel.querySelector('.dkb-velo').click();
  prueba('tocar fuera (el velo) cierra', panel.hidden);
  escribir('tit');
  const hoja = D.createElement('div'); hoja.id = 'mSheet'; D.body.appendChild(hoja);
  tecla('Escape');
  prueba('con la hoja del teclado abierta, Esc no cierra el panel', !panel.hidden);
  hoja.remove();
  tecla('Escape');
  campo.blur();
  tecla('/');
  prueba('"/" lleva al campo', D.activeElement === campo);
  const otro = D.getElementById('otroCampo');
  otro.focus();
  tecla('/', null, otro);
  prueba('"/" escribiendo en otro campo no se lo lleva', D.activeElement === otro);
  tecla('k', { ctrlKey: true }, otro);
  prueba('Ctrl+K lleva al campo desde cualquier sitio', D.activeElement === campo);
  escribir('tit');
  D.querySelector('.wrap').classList.add('bs-active-section');
  await espera(10);
  prueba('abrir una sección cierra el panel', panel.hidden);

  grupo('4b. Detrás del panel no rueda nada (Axel, en el iPad)');
  escribir('tit');
  const rueda = (en, dy) => { const e = new w.WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true }); en.dispatchEvent(e); return e.defaultPrevented; };
  prueba('la rueda sobre el velo se para', rueda(panel.querySelector('.dkb-velo'), 300));
  prueba('sobre la cabecera de la caja también', rueda(D.getElementById('dkbCnt'), 300));
  const lista = D.getElementById('dkbLista');
  Object.defineProperty(lista, 'scrollHeight', { value: 2000, configurable: true });
  Object.defineProperty(lista, 'clientHeight', { value: 500, configurable: true });
  prueba('una lista con recorrido rueda', !rueda(lista.querySelector('.m-res') || lista, 300));
  lista.scrollTop = 0;
  prueba('arriba del todo, hacia arriba se para', rueda(lista, -300));
  Object.defineProperty(lista, 'scrollHeight', { value: 400, configurable: true });
  prueba('una lista corta no le pasa el gesto a la página', rueda(lista, 300));
  prueba('el dedo, igual que la rueda (touchmove sin pasivo)', /addEventListener\('touchmove'[\s\S]{0,300}preventDefault[\s\S]{0,120}passive: false/.test(DS));
  prueba('el velo no deja gestos al navegador', /\.dkb-velo \{[^}]*touch-action: none/.test(CSS));
  prueba('no se fija el html (rompió la barra de pestañas del teléfono)', !/documentElement\.style\.overflow|html\.[\w-]*\{[^}]*overflow: hidden/.test(DS + CSS));

  grupo('4c. Sin el "/" en el campo, y la ventana centrada');
  prueba('el campo no enseña la tecla', !D.querySelector('#dkBusca kbd') && !/kbd/.test(CSS));
  prueba('la caja se centra (left y right, max-width y margin auto)',
    /\.dkb-caja \{[\s\S]{0,600}left: 24px; right: 24px[\s\S]{0,80}max-width: 1180px; margin-inline: auto/.test(CSS));

  grupo('5. El campo no pasa bajo la locación');
  prueba('el ancho se mide contra la locación', /function ajustarAncho[\s\S]{0,600}bs-loc-wrap[\s\S]{0,400}getBoundingClientRect\(\)\.left/.test(DS));
  prueba('el CSS usa el ancho medido', /#dkBusca \{[\s\S]{0,200}width: var\(--dkb-ancho/.test(CSS));
  prueba('no mide al escribir', !/function alEscribir[\s\S]{0,700}ajustarAncho/.test(DS));

  grupo('6. Carga y versiones');
  const pos = s => INDEX.indexOf(s);
  prueba('desk-search va después de mobile-search y del armazón',
    pos('src/desk-search.js') > pos('src/mobile-search.js') && pos('src/desk-search.js') > pos('src/desk-shell.js') && pos('src/desk-search.js') > 0);
  prueba('las dos hojas con su versión', /styles\/desk-ficha\.css\?v=/.test(INDEX) && /styles\/desk-search\.css\?v=/.test(INDEX));
  prueba('desk-ficha.css va antes que desk-search.css', pos('styles/desk-ficha.css') < pos('styles/desk-search.css'));

  console.log('\n' + ok + ' ok · ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
})();
