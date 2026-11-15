#!/usr/bin/env node
/*
 * ── Running out: fijar arriba, a mano ─────────────────────────────────
 *
 * Axel, 2026-11-15: "déjame poder ordenar manualmente el orden de los
 * productos en running out first". Elegido: fijar arriba (lo fijado
 * primero, en su orden; el resto por la app), de cada persona (en su
 * teléfono), y "Edit order" con arrastrar (lámina B). Lo que se protege:
 *   1. running-out.lista(): lo fijado primero y en su orden; lo demás
 *      como lo ordena la app; `porFecha` da el orden de la app.
 *   2. Lo fijado que deja de acabarse no aparece, y vuelve a su sitio
 *      si vuelve. Por locación. Sin localStorage, como antes.
 *   3. La pantalla: "Edit order" quita los botones y pone el asa;
 *      arrastrar por encima de "By date" fija, por debajo suelta;
 *      "Reset" suelta todo; "Done" vuelve.
 *   4. Con algo fijado, los títulos "Pinned" y "By date" fuera de la
 *      edición; sin nada, ni títulos.
 *
 *   node tools/test-orden-running-out.js
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
const txt = (el) => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';

// A se acaba antes que B, B antes que C, C antes que D.
const DIAS = { A: 1, B: 2, C: 3, D: 4 };
function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body><div id="mScreens"></div></body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  if (o.loc) w.localStorage.setItem('barstock.activeLocationName', o.loc);
  w.state = { master: Object.keys(DIAS).filter(k => !(o.sin || []).includes(k)).map(k => ({ item: k, suggested: 4, onHand: 1, vendor: 'LOOP' })) };
  w.BarStockLiveCache = {
    vivo: () => true, toastLoVende: () => true, cuanto: () => 1, pedir: () => 2,
    agota: (r) => ({ enDias: DIAS[r.item], txt: 'Out', tono: 'a' }), conteo: () => null, alCambiar: () => () => {}
  };
  w.BarStockGuest = { puede: () => true, nombre: () => 'Ana' };
  w.BarStockShoppingList = { leer: async () => [], sugerido: () => 2 };
  w.BarStockMobile = { enBanda() {}, alVolverBanda() {}, salirBanda() {}, alIrse: () => () => {} };
  for (const f of ['src/events.js', 'src/running-out.js', 'src/num-pad.js', 'src/mobile-running-out.js']) w.eval(leer(f));
  return w;
}
const orden = (w, op) => w.BarStockRunningOut.lista(op).map(x => x.item).join('');

// La geometría que jsdom no tiene: cada hijo de la lista mide 60 px y va
// en su sitio según su posición en el DOM (más el translate que lleve).
function geometria(w) {
  w.Element.prototype.getBoundingClientRect = function () {
    const p = this.parentElement;
    const i = p ? Array.from(p.children).indexOf(this) : 0;
    const m = /translateY\((-?\d+)px\)/.exec(this.style.transform || '');
    const top = i * 60 + (m ? Number(m[1]) : 0);
    return { top, height: 60, bottom: top + 60, left: 0, right: 300, width: 300 };
  };
}
function arrastrar(w, el, a) {
  const g = el.querySelector('[data-ro-grip]');
  const y0 = el.getBoundingClientRect().top + 30;
  g.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientY: y0 }));
  const pasos = 8;
  for (let k = 1; k <= pasos; k++) w.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientY: y0 + (a - y0) * k / pasos }));
  w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientY: a }));
}
const tarjetas = (w) => Array.from(w.document.querySelectorAll('.m-ro-orden > *')).map(e => e.dataset.item || '|');

(async () => {

grupo('1 · la lista: lo fijado primero, en su orden');
{
  const w = entorno();
  const R = w.BarStockRunningOut;
  prueba('sin nada fijado, el orden de la app', orden(w) === 'ABCD', orden(w));
  R.fijar(['D', 'B']);
  prueba('lo fijado primero y en su orden; lo demás como la app', orden(w) === 'DBAC', orden(w));
  prueba('cada uno sabe si está fijado', w.BarStockRunningOut.lista().filter(x => x.fijado).map(x => x.item).join('') === 'DB');
  prueba('porFecha: el de la app, sin lo fijado', orden(w, { porFecha: true }) === 'ABCD');
}

grupo('2 · lo que deja de acabarse, la locación, sin localStorage');
{
  let w = entorno();
  w.BarStockRunningOut.fijar(['C', 'A']);
  w.state.master = w.state.master.filter(r => r.item !== 'C');
  prueba('lo fijado que ya no se acaba no aparece', orden(w) === 'ABD', orden(w));
  w.state.master.push({ item: 'C', suggested: 4, onHand: 1, vendor: 'LOOP' });
  prueba('y si vuelve, vuelve a su sitio', orden(w) === 'CABD', orden(w));
  w.localStorage.setItem('barstock.activeLocationName', "Will's & Bill's");
  prueba('otra locación, otro orden', orden(w) === 'ABCD', orden(w));
  w = entorno();
  Object.defineProperty(w, 'localStorage', { get() { throw new Error('blocked'); } });
  prueba('sin localStorage: como antes, sin fallar', orden(w) === 'ABCD' && w.BarStockRunningOut.fijar(['B']) === false);
}

grupo('3 · Edit order: arrastrar');
{
  const w = entorno();
  geometria(w);
  await w.BarStockRunningOutReview.abrir(); await esperar(20);
  const el = w.document.querySelector('.m-ro');
  prueba('"Edit order" en la pantalla', !!el.querySelector('[data-ro-edit]'));
  el.querySelector('[data-ro-edit]').click();
  prueba('editando: sin botones, con asa, y los dos títulos', !el.querySelector('[data-ro-add], [data-ro-ok]') &&
    el.querySelectorAll('[data-ro-grip]').length === 4 && /Pinned · drag here/.test(txt(el)) && /By date/.test(txt(el)));
  prueba('empieza: | (Pinned) | (By date) A B C D', tarjetas(w).join('') === '||ABCD', tarjetas(w).join(''));
  // C (posición 4, y = 240..300) por encima de "By date" (posición 1).
  arrastrar(w, el.querySelector('.m-ro-orden [data-item="C"]'), 70);
  prueba('arrastrar C arriba la fija', w.BarStockRunningOut.fijados().join() === 'C', JSON.stringify(w.BarStockRunningOut.fijados()));
  prueba('y la pantalla lo dice', tarjetas(w).join('') === '|C|ABD' && /Pinned · 1/.test(txt(el)), tarjetas(w).join(''));
  // A por encima de C: fijado, primero.
  arrastrar(w, el.querySelector('.m-ro-orden [data-item="A"]'), 40);
  prueba('arrastrar A por encima de C: las dos, A primero', w.BarStockRunningOut.fijados().join() === 'A,C', JSON.stringify(w.BarStockRunningOut.fijados()));
  // C por debajo de "By date": se suelta.
  arrastrar(w, el.querySelector('.m-ro-orden [data-item="C"]'), 330);
  prueba('arrastrar C abajo la suelta, y vuelve a su sitio de la app', w.BarStockRunningOut.fijados().join() === 'A' && tarjetas(w).join('') === '|A|BCD', tarjetas(w).join(''));
  el.querySelector('[data-ro-done]').click();
  prueba('Done: vuelven los botones, con "Pinned" y "By date"', !!el.querySelector('[data-ro-add]') && /Pinned · 1/.test(txt(el)) && /By date/.test(txt(el)));
  prueba('y el orden es el fijado', Array.from(el.querySelectorAll('.m-ro-c')).map(c => c.dataset.item).join('') === 'ABCD');
  el.querySelector('[data-ro-edit]').click();
  el.querySelector('[data-ro-reset]').click();
  prueba('Reset suelta todo', w.BarStockRunningOut.fijados().length === 0 && /Pinned · drag here/.test(txt(el)));
  el.querySelector('[data-ro-done]').click();
  prueba('sin nada fijado, sin títulos', !/Pinned|By date/.test(txt(el)));
}

grupo('4 · un toque en el asa no hace nada fuera de la edición');
{
  const w = entorno();
  await w.BarStockRunningOutReview.abrir(); await esperar(20);
  prueba('fuera de la edición no hay asas', !w.document.querySelector('[data-ro-grip]'));
}

grupo('4b · "Done": abajo, de cristal (Axel, 2026-11-15)');
{
  const css = leer('styles/mobile-app.css');
  const r = (/#mScreens \.m-ro-done \{([^}]*)\}/.exec(css) || [])[1] || '';
  prueba('fijo, justo sobre la barra de pestañas: bottom negativo (con 100 px flotaba a media pantalla)', /position:\s*sticky/.test(r) && /bottom:\s*calc\(var\(--m-base\) \* -2\.7\)/.test(r), r.trim().slice(0, 80));
  prueba('en la regla del cristal, la misma de los botones de la app', /:is\([^)]*#mRoDone[^)]*\)\s*,\s*\n\s*body\.m-shell #mScreens :is\(#mhTabs/.test(css));
  prueba('teñido de azul, como el + verde', /#mScreens #mRoDone \{[^}]*rgba\(56, 189, 248/.test(css));
  prueba('el botón lleva su id', /id="mRoDone"/.test(leer('src/mobile-running-out.js')));
}

grupo('5 · el Home sigue el orden');
{
  const home = leer('src/mobile-home.js');
  prueba('el Home se repinta al cambiar el orden', /on\('runningOutOrder', refresh\)/.test(home));
  prueba('y lee la misma lista', /BarStockRunningOut[\s\S]{0,40}lista\(\)/.test(home));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
