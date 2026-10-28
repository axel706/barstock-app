#!/usr/bin/env node
/*
 * ── El suelo que desenfoca ───────────────────────────────────────────
 *
 * Es la banda de arriba, espejada. Lo que hay que proteger son las
 * dos cosas que ya salieron mal una vez:
 *
 *   1. SIN TINTE. Un velo oscuro encima del borde de abajo se lee
 *      como una barra negra pegada, y eso fue lo que se vio en toda
 *      la app. Lo oscuro de esa zona lo pone `.m-tabs::before`.
 *   2. Que no suba. 118px llevaban el desenfoque hasta media
 *      pantalla. Va pegado a la barra y de ahí no pasa.
 *
 *   node tools/test-suelo-blur.js
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const css = leer('styles/mobile-app.css');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

function montar(movil) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({
    matches: !!movil,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}
  });
  w.scrollTo = () => {};
  w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&') };
  w.BarStockEvents = { _h: {}, on(n, f) { (this._h[n] = this._h[n] || []).push(f); },
                       emit(n, d) { (this._h[n] || []).forEach(f => f(d || {})); } };
  w.bsOpenSection = () => {};
  w.bsCloseSection = () => {};
  new Function(leer('src/mobile-shell.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return w;
}

grupo('se monta con el armazón');
{
  const w = montar(true);
  const suelo = w.document.getElementById('mFloor');
  prueba('existe', !!suelo);
  prueba('con seis capas, como la banda de arriba',
    !!suelo && suelo.querySelectorAll('i').length === 6,
    suelo && String(suelo.querySelectorAll('i').length));
  prueba('ni se lee ni se toca',
    !!suelo && suelo.getAttribute('aria-hidden') === 'true');
  // Antes que la barra: dos elementos con el mismo contexto se pintan
  // en orden de documento, y la barra no puede desenfocarse a sí misma.
  const hijos = Array.from(w.document.body.children).map(c => c.id);
  prueba('antes que la barra en el DOM',
    hijos.indexOf('mFloor') < hijos.indexOf('mTabs'), hijos.join(','));

  prueba('y en escritorio no existe', !montar(false).document.getElementById('mFloor'));
}

grupo('es la escalera de arriba, al revés');
{
  const capas = css.match(/\.m-floor > i:nth-child\(\d\)\s*\{[^}]*\}/g) || [];
  prueba('seis capas en la hoja', capas.length === 6, String(capas.length));
  prueba('todas desenfocan', capas.every(c => /backdrop-filter:\s*blur\(/.test(c)));
  prueba('todas llevan máscara, que es lo que lo hace progresivo',
    capas.every(c => /mask-image/.test(c)));
  prueba('y la máscara va hacia abajo, no hacia arriba',
    capas.every(c => /linear-gradient\(to bottom/.test(c)));

  // Cada una el doble que la anterior, como arriba.
  const grados = capas.map(c => Number(/blur\((\d+)px\)/.exec(c)[1]));
  prueba('el desenfoque crece capa a capa',
    grados.every((g, i) => i === 0 || g > grados[i - 1]), grados.join(' · '));
}

grupo('las dos cosas que ya salieron mal');
{
  const regla = (/\.m-floor\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
  // Un velo oscuro aquí ES la barra negra.
  const capas = css.match(/\.m-floor > i:nth-child\(\d\)\s*\{[^}]*\}/g) || [];
  prueba('ninguna capa lleva tinte',
    capas.every(c => !/background/.test(c)));
  prueba('ni el suelo entero', !/background/.test(regla), regla.trim());
  // 118px subían el desenfoque hasta media pantalla.
  const alto = Number((/height:\s*calc\((\d+)px/.exec(regla) || [])[1] || 999);
  prueba('se queda pegado a la barra', alto <= 100, alto + 'px');
  prueba('por debajo de ella en z-index', /z-index:\s*8990/.test(regla));
  // Y lo que pinta el borde de abajo sigue siendo la barra, no esto.
  prueba('el borde lo sigue pintando la barra',
    /\.m-tabs::before\s*\{[^}]*height:\s*calc\(16px \+ env\(safe-area-inset-bottom/.test(css));
}

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
