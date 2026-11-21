#!/usr/bin/env node
/*
 * ── Las marcas de la botella (Axel, 2026-11-21, opción A2·7) ────────
 *
 * Cada silueta puede llevar dónde van sus etiquetas, su sello y sus
 * renglones de texto, para que quien cuenta piense "llega al nombre" en
 * vez de adivinar un porcentaje. Se dibujan en el panel de conteo:
 * etiquetas y sello como contorno punteado y tenue, sin relleno; cada
 * renglón de texto, el nombre incluido, como barras del grueso de sus
 * letras, cortadas donde se cortan sus palabras.
 *
 * Lo que se protege:
 *
 *   1. NINGUNA palabra real (Axel: "no dejes eso como palabra real"):
 *      ni <text>, ni el nombre en los datos.
 *   2. Las marcas no cuentan: el volumen y la línea de llena son los
 *      mismos con y sin ellas.
 *   3. Una silueta sin marcas se dibuja igual que antes (cadena vacía).
 *   4. Woodford, Elijah Craig y Basil Hayden las llevan, bien formadas y
 *      dentro de la botella.
 *   5. El grueso de cada barra es el de sus letras (g de los datos), y
 *      cada renglón tiene una barra por palabra.
 *   6. El panel de conteo las pinta dentro del vidrio, y el CSS las pone
 *      punteadas, tenues y sin relleno.
 *
 *   node tools/test-silueta-marcas.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d !== undefined ? '   → ' + d : '')); }
}

global.window = {};
new Function(leer('src/bottle-profiles.js'))();
const B = window.BarStockBottleProfiles;
const W = 200, H = 260, PAD = 12;

console.log('\nlas tres que las llevan');
for (const k of ['woodford', 'elijah_craig', 'basil_hayden']) {
  const P = B.PROFILES[k];
  const ms = P && P.marcas;
  prueba(k + ': lleva marcas', Array.isArray(ms) && ms.length >= 3, ms && ms.length);
  prueba(k + ': bien formadas (alturas dentro de la botella, de abajo arriba)', Array.isArray(ms) && ms.every(m =>
    (m.tipo === 'sello' ? (m.y > 0 && m.y < 1 && m.r > 0 && m.r < 0.2)
      : (Array.isArray(m.y) && m.y[0] >= 0 && m.y[1] <= 1 && m.y[0] < m.y[1] && m.ancho > 0 && m.ancho <= 1.1)) &&
    Array.isArray(m.renglones) && m.renglones.every(r => r.g > 0 && r.g < 0.1 && r.largo > 0 && r.largo <= 1 &&
      Array.isArray(r.palabras) && r.palabras.length >= 1 && r.palabras.every(n => Number.isInteger(n) && n > 0))));
  prueba(k + ': en los datos no hay palabras, sólo cuántas letras', Array.isArray(ms) &&
    !JSON.stringify(ms).match(/[A-Za-z]{3,}/g).some(w => !['tipo', 'etiqueta', 'sello', 'texto', 'ancho', 'renglones', 'largo', 'palabras'].includes(w)),
    String(JSON.stringify(ms)).slice(0, 120));
}

console.log('\nse dibujan, sin palabras');
const svg = B.marcasFor ? B.marcasFor('woodford', W, H, PAD) : '';
prueba('marcasFor existe y dibuja Woodford', typeof B.marcasFor === 'function' && svg.length > 0);
prueba('ni un <text>', !/<text/i.test(svg));
const contornos = (svg.match(/class="cp-marca"/g) || []).length;
const barras = (svg.match(/class="cp-barra"/g) || []).length;
const M = B.PROFILES.woodford.marcas;
prueba('un contorno por etiqueta y por sello', contornos === M.filter(m => m.tipo !== 'texto').length, contornos);
prueba('una barra por palabra', barras === M.reduce((s, m) => s + m.renglones.reduce((t, r) => t + r.palabras.length, 0), 0), barras);
prueba('el texto suelto (el nombre) no lleva contorno', M.some(m => m.tipo === 'texto'));
{
  // El grueso es el de las letras: g de la altura útil.
  const box = B.boxFor('woodford', W, H, PAD);
  const nombre = M.find(m => m.tipo === 'texto').renglones[0];
  const alto = (nombre.g * box.usable).toFixed(2);
  prueba('la barra del nombre tiene el grueso de sus letras', new RegExp('class="cp-barra"[^>]*height="' + alto.replace('.', '\\.') + '"').test(svg), alto);
  // Dentro de la botella: ninguna barra se sale del ancho de su altura.
  const xs = [...svg.matchAll(/class="cp-barra" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)].map(m => [Number(m[1]), Number(m[1]) + Number(m[2])]);
  prueba('todas las barras caben en el ancho de la botella', xs.length > 0 && xs.every(([a, b]) => a >= box.cx - box.maxR && b <= box.cx + box.maxR), JSON.stringify(xs.slice(0, 3)));
}

console.log('\nno cuentan');
{
  const sin = Object.assign({}, B.PROFILES.woodford); delete sin.marcas;
  prueba('el volumen es el mismo con y sin marcas', [0.2, 0.5, 0.66].every(y => B.fractionAt(B.PROFILES.woodford, y) === B.fractionAt(sin, y)));
  prueba('una silueta sin marcas no dibuja nada', B.marcasFor('whiskey', W, H, PAD) === '');
  prueba('y sigue siendo válida', B.isValidProfile(B.PROFILES.woodford));
}

console.log('\nen el panel de conteo');
{
  const cp = leer('src/count-panel.js');
  prueba('el panel las pinta dentro del vidrio, sobre el líquido', /<g clip-path="url\(#cpClip\)">[\s\S]*cp-liquid[\s\S]*marcasFor\(key, VB\.w, VB\.h, VB\.pad\)[\s\S]*<\/g>/.test(cp));
  const css = leer('styles/count-panel.css');
  const regla = (/\.cp-marca\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
  prueba('contorno punteado, tenue y sin relleno', /fill:\s*none/.test(regla) && /stroke-dasharray/.test(regla) && /stroke-opacity:\s*\.3/.test(regla), regla.trim());
  prueba('las barras tienen su color', /\.cp-barra\s*\{[^}]*fill:/.test(css));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
