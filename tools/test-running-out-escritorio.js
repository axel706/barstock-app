#!/usr/bin/env node
/*
 * ── Running out en el escritorio (Axel, 2026-11-25, lámina A) ─────────
 *
 * Lo que se protege:
 *
 *   1. Es la pantalla del teléfono, no una copia: desk-running-out abre
 *      BarStockRunningOutReview con { escritorio: true } dentro de su
 *      sección, y la suelta al salir.
 *   2. En el escritorio cada fila lleva su silueta (la de home-cartas) y
 *      su par junto al número; en el teléfono, nada de eso, y la banda
 *      sigue siendo la del teléfono.
 *   3. Las acciones son las del teléfono: Add N to list, I have enough
 *      (el teclado de check-shelf), Undo, Edit order.
 *   4. La sección existe antes que el armazón (que vigila las secciones
 *      al montar), la barra la abre y ya no dice "Soon"; "See all" de la
 *      tarjeta del Home lleva a ella.
 *   5. Sus estilos son los del teléfono, generados en desk-ficha.css bajo
 *      #dkRo, sin el contenedor fijo del teléfono; la fila ancha y la
 *      silueta en desk-running-out.css.
 *
 *   node tools/test-running-out-escritorio.js
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
const DRO = leer('src/desk-running-out.js');
const MRO = leer('src/mobile-running-out.js');
const SH = leer('src/desk-shell.js');
const DH = leer('src/desk-home.js');
const CSS = leer('styles/desk-running-out.css');
const GEN = leer('styles/desk-ficha.css');

function entorno(html) {
  const w = new JSDOM(html || '<!doctype html><body class="dk"><div class="wrap"></div><div id="mScreens"><div id="mHome"></div></div></body>',
    { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  w.__lista = [];
  w.__checks = [];
  w.__banda = null;
  const R = (item, on, par, txt2, pedir, forma) => ({ item, onHand: on, suggested: par, vendor: 'SOUTHERN', __pedir: pedir, __forma: forma, __out: { txt: txt2, tono: 'a' } });
  const filas = [R('Woodford Reserve', 1.6, 2, 'Out Sun', 1, 'woodford'), R("Tito's Vodka", 0.4, 6, 'Out Sat', 4, 'vodka')];
  w.state = { master: filas };
  w.BarStockRunningOut = { lista: () => filas.map(r => ({ r, item: r.item, out: r.__out, vivo: true })) };
  w.BarStockLiveCache = { cuanto: (r) => r.onHand, pedir: (r) => r.__pedir, agota: (r) => r.__out, vivo: () => true, conteo: () => null, alCambiar: () => () => {} };
  w.BarStockShoppingList = {
    vigentes: (x) => x, leer: async () => w.__lista.slice(), sugerido: (r) => r.__pedir,
    anadir: async (o) => { w.__lista.push({ id: 'l' + w.__lista.length, item_name: o.item, qty: o.qty, added_by: o.por, status: 'to_buy' }); return { ok: true }; },
    quitar: async (id) => { w.__lista = w.__lista.filter(x => x.id !== id); return { ok: true }; }
  };
  w.BarStockCheckShelf = { abrir: (r, o) => { w.__teclado = r.item; o.alGuardar(2, r.onHand); } };
  w.BarStockGuest = { puede: () => true, nombre: () => 'Ana' };
  w.BarStockMobile = { enBanda: (t) => { w.__banda = t; }, alVolverBanda: () => {}, salirBanda: () => {}, sinPestana: () => {}, alIrse: () => () => {} };
  w.__sil = [];
  w.BarStockBottleProfiles = { formaDe: (r) => r.__forma };
  w.BarStockHomeCartas = { silueta: (forma, lleno, id) => { w.__sil.push({ forma, lleno, id }); return `<svg class="sil-falsa" data-forma="${forma}"></svg>`; } };
  w.eval(MRO);
  return w;
}

(async () => {
  grupo('1. La pantalla del teléfono, en el escritorio');
  {
    const w = entorno();
    const host = w.document.createElement('div');
    host.id = 'dkRo';
    w.document.querySelector('.wrap').appendChild(host);
    await w.BarStockRunningOutReview.abrir(host, { escritorio: true });
    await esperar(20);
    const filas = [...host.querySelectorAll('.m-ro-c')];
    prueba('se monta dentro de la sección, no fija encima de todo', !!host.querySelector('.m-ro-dk') && !w.document.querySelector('.m-ro'));
    prueba('sin la banda del teléfono', w.__banda === null);
    prueba('una fila por producto, en el orden de la lista', filas.length === 2 && filas[0].dataset.item === 'Woodford Reserve');
    prueba('el resumen y los títulos de las columnas en el bloque que se pega', !!host.querySelector('.m-ro-pega > .m-ro-sumf') && /Product.*Left.*Next 5 days/.test(txt(host.querySelector('.m-ro-pega .m-ro-cols'))));
    prueba('cada una con su silueta (home-cartas + formaDe)', !!filas[0].querySelector('.m-ro-sil svg[data-forma="woodford"]') && !!filas[1].querySelector('svg[data-forma="vodka"]'));
    prueba('llena contra su par (1.6 de 2)', w.__sil.some(x => Math.abs(x.lleno - 0.8) < 1e-9));
    prueba('poca, con su tono (0.4 de 6)', !!filas[1].querySelector('.m-ro-sil-bajo') && !!filas[0].querySelector('.m-ro-sil-medio'));
    // Cada pintado rehace todas las siluetas: dentro de uno, ids distintos.
    const ult = w.__sil.slice(-filas.length).map(x => x.id);
    prueba('ids de recorte distintos en la página', new Set(ult).size === filas.length, ult.join(','));
    prueba('el número con su par', /≈1\.6\s*\/2/.test(txt(filas[0].querySelector('.m-ro-v b'))), txt(filas[0].querySelector('.m-ro-v')));
    prueba('Add N to list y I have enough', /Add 1 to list/.test(txt(filas[0])) && !!filas[0].querySelector('[data-ro-ok]'));
    filas[0].querySelector('[data-ro-add]').click();
    await esperar(20);
    let f0 = host.querySelector('.m-ro-c[data-item="Woodford Reserve"]');
    prueba('Add lo pone en la lista y la fila dice quién', w.__lista.length === 1 && /On the list · 1 by Ana/.test(txt(f0)) && !!f0.querySelector('[data-ro-undo]'), txt(f0));
    f0.querySelector('[data-ro-ok]').click();
    await esperar(20);
    f0 = host.querySelector('.m-ro-c[data-item="Woodford Reserve"]');
    prueba('I have enough abre el teclado de check-shelf', w.__teclado === 'Woodford Reserve' && /Checked: 2/.test(txt(f0)), txt(f0));
    host.querySelector('[data-ro-edit]').click();
    prueba('Edit order: las filas con su asa y su silueta', !!host.querySelector('.m-ro-ed [data-ro-grip]') && !!host.querySelector('.m-ro-ed .m-ro-sil'));
    host.querySelector('[data-ro-done]').click();
    w.BarStockRunningOutReview.cerrar();
    prueba('cerrar la suelta', !host.querySelector('.m-ro-dk') && !w.BarStockRunningOutReview.abierta());
  }

  grupo('2. En el teléfono, nada cambia');
  {
    const w = entorno();
    await w.BarStockRunningOutReview.abrir(w.document.getElementById('mHome'));
    await esperar(20);
    const f = w.document.querySelector('.m-ro .m-ro-c');
    prueba('su pantalla fija, con la banda', !!w.document.querySelector('.m-ro') && w.__banda === 'Running out');
    prueba('sin silueta', !f.querySelector('.m-ro-sil') && w.__sil.length === 0);
    prueba('sin bloque pegado ni títulos de columnas', !w.document.querySelector('.m-ro-pega') && !w.document.querySelector('.m-ro-cols') && !!w.document.querySelector('.m-ro > .m-ro-sumf'));
    prueba('el número sin su par', !f.querySelector('.m-ro-par') && /≈1\.6/.test(txt(f.querySelector('.m-ro-v b'))));
  }

  grupo('3. La sección y la barra');
  {
    const w = entorno();
    w.eval(DRO);
    const sec = w.document.getElementById('runningOutSection');
    prueba('crea su .section-card dentro de .wrap', !!sec && sec.classList.contains('section-card') && sec.parentElement === w.document.querySelector('.wrap'));
    prueba('con su título y su host', /Running out/.test(txt(sec.querySelector('.dk-ro-t'))) && !!sec.querySelector('#dkRo'));
    sec.classList.add('bs-active-section');
    await esperar(30);
    prueba('al abrirse, monta la pantalla en modo escritorio', !!sec.querySelector('#dkRo .m-ro-dk .m-ro-c .m-ro-sil'));
    sec.classList.remove('bs-active-section');
    await esperar(30);
    prueba('al salir, la suelta', !sec.querySelector('#dkRo').firstElementChild && !w.BarStockRunningOutReview.abierta());
    prueba('no se crea dos veces', (w.BarStockDeskRunningOut.montar(), w.document.querySelectorAll('#runningOutSection').length === 1));
  }
  const pos = (f) => INDEX.indexOf(f);
  prueba('se carga antes que desk-shell (que vigila las secciones al montar)', pos('src/desk-running-out.js') > 0 && pos('src/desk-running-out.js') < pos('src/desk-shell.js'));
  prueba('y después de la pantalla del teléfono y de home-cartas', pos('src/desk-running-out.js') > pos('src/mobile-running-out.js') && pos('src/mobile-running-out.js') > pos('src/home-cartas.js'));
  prueba('la barra la abre: sec runningOut, sin "Soon"', /id: 'runningOut', label: 'Running out', icon: '[\w-]+', sec: 'runningOut' \}/.test(SH));
  prueba('"See all" del Home lleva a ella', /data-ro-todo/.test(DH) && /S\.ir\('runningOut'\)/.test(DH));
  prueba('y sólo sale con la sección montada', /lista\.length && document\.getElementById\('runningOutSection'\)/.test(DH));

  grupo('4. Los estilos');
  prueba('los del teléfono, generados bajo #dkRo', /#dkRo \.m-ro-c \{/.test(GEN) && /#dkRo \.m-ro-dias \{/.test(GEN) && /#dkRo \.m-ro-b \{/.test(GEN));
  prueba('sin el contenedor fijo del teléfono (.m-ro)', !/#dkRo \.m-ro[ ,{]/.test(GEN) && !/:has\(/.test(GEN));
  prueba('la fila ancha: silueta, nombre, número, días, el por qué', /grid-template-columns: 48px minmax\(0, 1\.4fr\) 120px minmax\(0, 1\.3fr\) minmax\(0, 1\.7fr\)/.test(CSS));
  prueba('la cabecera del teléfono se abre en columnas', /\.m-ro-top \{ display: contents; \}/.test(CSS));
  prueba('con poco sitio se apila (por el ancho de la sección)', /@container dkro \(max-width: 900px\)/.test(CSS));
  // La forma de las secciones (el estándar, lámina "Section screens" A):
  // .dk-pantalla pone el vidrio, fijo detrás (desk-shell.css).
  prueba('es una pantalla del estándar (.dk-pantalla), no una caja', /'card section-card dk-ro-sec dk-pantalla'/.test(DRO) && !/#runningOutSection \{[^}]*(border-radius|background: rgba)/.test(CSS));
  prueba('el resumen, Edit order y las columnas, pegados bajo la barra al bajar', /#dkRo \.m-ro-pega \{[^}]*position: sticky; top: var\(--dk-alto\)/.test(CSS)
    && /_escritorio \? `<div class="m-ro-pega">\$\{sumf\}/.test(MRO) && /m-ro-cols/.test(MRO));
  prueba('las hojas, con su versión', /styles\/desk-running-out\.css\?v=/.test(INDEX) && /src\/desk-running-out\.js\?v=/.test(INDEX));

  console.log('\n' + ok + ' ok · ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
})();
