#!/usr/bin/env node
/*
 * ── El suelo que desenfoca ───────────────────────────────────────────
 *
 * Es la banda de arriba, espejada: seis capas, cada una con más
 * desenfoque que la anterior y recortada a su franja.
 *
 * Lo que hay que proteger son las dos cosas que ya salieron mal:
 *
 *   1. SIN TINTE. Un velo oscuro encima del borde de abajo se lee
 *      como una barra negra pegada. Lo oscuro de esa zona lo pone
 *      `.m-tabs::before`, que tampoco se puede quitar.
 *   2. Que no suba. 118px llevaban el desenfoque hasta media
 *      pantalla y la franja se veía en todas las pantallas.
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
  w.matchMedia = () => ({ matches: !!movil, addEventListener() {}, removeEventListener() {},
                          addListener() {}, removeListener() {} });
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
  const grados = capas.map(c => Number(/blur\((\d+)px\)/.exec(c)[1]));
  prueba('el desenfoque crece capa a capa',
    grados.every((g, i) => i === 0 || g > grados[i - 1]), grados.join(' · '));
}

grupo('las dos cosas que ya salieron mal');
{
  const regla = (/\.m-floor\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
  const capas = css.match(/\.m-floor > i:nth-child\(\d\)\s*\{[^}]*\}/g) || [];
  prueba('ninguna capa lleva tinte', capas.length === 6 &&
    capas.every(c => !/background/.test(c)));
  prueba('ni el suelo entero', !/background/.test(regla), regla.trim());

  const alto = Number((/height:\s*calc\((\d+)px/.exec(regla) || [])[1] || 999);
  prueba('se queda pegado a la barra', alto <= 80, alto + 'px');
  prueba('por debajo de ella en z-index', /z-index:\s*8990/.test(regla));
  prueba('el borde lo sigue pintando la barra',
    /\.m-tabs::before\s*\{[^}]*height:\s*calc\(16px \+ env\(safe-area-inset-bottom/.test(css));
}

grupo('y no toca nada más del armazón');
{
  // Esto es SÓLO el suelo. Ni contenedor fijo, ni recorte del eje X,
  // ni reglas en el <html>: eso va aparte y se prueba aparte.
  prueba('el body no se fija',
    !/body\.m-shell\.m-on\s*\{[^}]*position:\s*fixed/.test(css));
  prueba('el raíz no se toca',
    !/html:has\(body\.m-shell\.m-on\)/.test(css));
  prueba('#mScreens sigue como estaba',
    !/body\.m-shell\.m-on\s*>\s*\.m-screens/.test(css));
}

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
