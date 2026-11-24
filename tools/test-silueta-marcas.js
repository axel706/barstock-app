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

console.log('\nlas que las llevan');
// Las tres de la lámina A2·7, la tanda 1 (aprobada por Axel el
// 2026-11-22) y la tanda 2 (pendiente de su lámina): las mismas reglas
// para todas.
const TANDA1 = ['jameson', 'buffalo_trace', 'bulleit', 'fireball', 'red_label', 'dewars', 'bacardi', 'campari', 'aperol', 'baileys'];
const TANDA2 = ['grey_goose', 'ketel_one', 'captain_morgan', 'malibu', 'cointreau', 'disaronno', 'patron', 'don_julio_blanco', 't1800'];
// La tanda 3 (2026-11-23, en develop pendiente de su lámina).
const TANDA3 = ['casa_noble', 'glenfiddich', 'chivas', 'monkey_shoulder', 'ciroc', 'empress', 'buchanans', 'tullamore', 'blantons'];
for (const k of ['woodford', 'elijah_craig', 'basil_hayden'].concat(TANDA1, TANDA2, TANDA3)) {
  const P = B.PROFILES[k];
  const ms = P && P.marcas;
  prueba(k + ': lleva marcas', Array.isArray(ms) && ms.length >= 3, ms && ms.length);
  prueba(k + ': bien formadas (alturas dentro de la botella, de abajo arriba)', Array.isArray(ms) && ms.every(m =>
    (m.x === undefined || (typeof m.x === 'number' && Math.abs(m.x) < 1)) &&
    (m.tipo === 'dibujo' ? (Array.isArray(m.puntos) && m.puntos.length >= 3 && m.puntos.every(([px, py]) => Math.abs(px) <= 1 && py > 0 && py < 1))
      : m.tipo === 'sello' ? (m.y > 0 && m.y < 1 && m.r > 0 && m.r < 0.2)
      : (Array.isArray(m.y) && m.y[0] >= 0 && m.y[1] <= 1 && m.y[0] < m.y[1] && m.ancho > 0 && m.ancho <= (m.tipo === 'etiqueta' && m.rot ? 2 : 1.1))) &&
    (m.tipo === 'dibujo' || Array.isArray(m.renglones)) && (m.renglones || []).every(r => r.g > 0 && r.g < 0.1 && r.largo > 0 && r.largo <= 1 &&
      Array.isArray(r.palabras) && r.palabras.length >= 1 && r.palabras.every(n => Number.isInteger(n) && n > 0))));
  prueba(k + ': en los datos no hay palabras, sólo cuántas letras', Array.isArray(ms) &&
    !JSON.stringify(ms).match(/[A-Za-z]{3,}/g).some(w => !['tipo', 'etiqueta', 'sello', 'texto', 'ancho', 'renglones', 'largo', 'palabras', 'rot', 'arco', 'forma', 'ovalo', 'roto', 'pend', 'dibujo', 'puntos'].includes(w)),
    String(JSON.stringify(ms)).slice(0, 120));
}

console.log('\ninclinadas, curvas y con su forma (Axel: "hay botellas con etiquetas diagonales o textos curvos")');
{
  const dib = (k) => B.marcasFor(k, W, H, PAD);
  // Una banda inclinada cruza la botella de lado a lado (Red Label): puede
  // ser más ancha que ella, la silueta la recorta. Sólo las inclinadas.
  prueba('la banda de Red Label va inclinada (sube a la derecha), con sus renglones', /<g transform="rotate\(-\d+\.\d+ [^"]+">[\s\S]*cp-marca[\s\S]*<\/g>/.test(dib('red_label')));
  prueba('el nombre de Baileys va en arco (un trazo curvo, no una barra recta)', /class="cp-barra-arco"/.test(dib('baileys')));
  prueba('su ilustración es un óvalo', /<ellipse class="cp-marca"/.test(dib('baileys')));
  prueba('el papel rasgado de Buffalo Trace tiene el borde roto', /<path class="cp-marca" d="M[^"]*Z"/.test(dib('buffalo_trace')));
  prueba('la etiqueta de Jameson tiene el borde de arriba curvo', /<path class="cp-marca" d="M[^"]* Q/.test(dib('jameson')));
  prueba('lo que no lleva nada de eso se dibuja como antes (Woodford, sin giros ni arcos)', !/rotate|cp-barra-arco|<ellipse|<path/.test(dib('woodford')));
  // El medallón de Aperol va a la derecha del eje, no al centro (x).
  const box = B.boxFor('aperol', W, H, PAD);
  const sello = /<circle class="cp-marca" cx="([\d.]+)"/.exec(dib('aperol'));
  prueba('un sello puede ir corrido del eje (el medallón de Aperol, a la derecha)', !!sello && Number(sello[1]) > box.cx + 1, sello && sello[1] + ' vs ' + box.cx);
  // Un texto y una etiqueta también (tanda 2): TEQUILA / BLANCO de Don
  // Julio van a la derecha del sello, no al centro; dibujados en el eje
  // tapaban el sello y mentían dónde está el texto. Se prueba con una
  // silueta de mentira: una barra con x 0.5 va centrada a la derecha del
  // eje, y la misma sin x, en el eje.
  {
    const P = B.PROFILES;
    const base = { name: 'Prueba', asp: 3, yFull: 0.7, p: P.woodford.p };
    const barra = (x) => {
      P.__prueba_x = Object.assign({}, base, { marcas: [{ tipo: 'texto', y: [0.3, 0.32], ancho: 0.4, x, renglones: [{ g: 0.02, largo: 1, palabras: [5] }] },
                                                        { tipo: 'etiqueta', y: [0.2, 0.25], ancho: 0.3, x, renglones: [] }] });
      const s = B.marcasFor('__prueba_x', W, H, PAD);
      delete P.__prueba_x;
      const r = /class="cp-barra" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/.exec(s);
      const e = /class="cp-marca" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/.exec(s);
      return { texto: r ? Number(r[1]) + Number(r[2]) / 2 : NaN, etiqueta: e ? Number(e[1]) + Number(e[2]) / 2 : NaN, cx: B.boxFor('woodford', W, H, PAD).cx };
    };
    const corrida = barra(0.5), centrada = barra(undefined);
    prueba('un texto puede ir corrido del eje (x), como el sello', corrida.texto > corrida.cx + 5, corrida.texto + ' vs ' + corrida.cx);
    prueba('y una etiqueta también', corrida.etiqueta > corrida.cx + 5, corrida.etiqueta + ' vs ' + corrida.cx);
    prueba('sin x, en el eje', Math.abs(centrada.texto - centrada.cx) < 0.6 && Math.abs(centrada.etiqueta - centrada.cx) < 0.6, centrada.texto + ' / ' + centrada.etiqueta + ' vs ' + centrada.cx);
  }
  // Bordes con su propia inclinación (Axel, con trazos sobre la foto): la
  // etiqueta de Bulleit no es un rectángulo girado, sus bordes suben
  // distinto, y la tira oscura de encima es una cuña.
  const bul = B.PROFILES.bulleit.marcas.filter(m => Array.isArray(m.pend));
  prueba('Bulleit: la tira oscura es una cuña (un borde baja y el otro sube)', bul.some(m => m.pend[0] < 0 && m.pend[1] > 0));
  prueba('Bulleit: los bordes de su etiqueta suben distinto', bul.some(m => m.pend[0] > 0 && m.pend[1] > 0 && m.pend[0] !== m.pend[1]));
  prueba('…y se dibujan inclinados, no como un rectángulo', (dib('bulleit').match(/<path class="cp-marca" d="M[^"]* Q/g) || []).length >= 1);
  prueba("Dewar's: el borde de arriba de su etiqueta se hunde (∪)", B.PROFILES.dewars.marcas.some(m => Array.isArray(m.arco) && m.arco[0] < 0));
  prueba('el trazo curvo tiene su color en el panel', /\.cp-barra-arco\s*\{[^}]*stroke:/.test(leer('styles/count-panel.css')));
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

// Lo que Axel pidió al revisar la tanda 3 (2026-11-24): lo grande va
// aunque sea un dibujo o un relieve, y una etiqueta irregular va en piezas.
console.log('\ntanda 3, revisada: lo grande y lo irregular');
{
  const M = (k) => B.PROFILES[k].marcas;
  // El venado es un dibujo con su contorno (Axel, 2026-11-24: "una shape
  // más cercana al venado, en lugar de 2 óvalos"), sacado de la foto.
  const ven = M('glenfiddich').filter(m => m.tipo === 'dibujo');
  prueba('Glenfiddich: el venado es UN dibujo con su contorno (30 puntos o más)',
    ven.length === 1 && ven[0].puntos.length >= 30, ven.length && ven[0].puntos.length);
  prueba('Glenfiddich: sus puntos van entre 0.48 y 0.63 de alto', ven.length === 1 &&
    ven[0].puntos.every(([px, py]) => py >= 0.48 && py <= 0.63 && Math.abs(px) <= 1));
  prueba('Glenfiddich: ya no lleva los óvalos', !M('glenfiddich').some(m => m.forma === 'ovalo'));
  prueba('el dibujo se pinta: un trazo cerrado con todos sus puntos',
    (B.marcasFor('glenfiddich', W, H, PAD).match(/<path class="cp-marca cp-dibujo" d="M[^"]*Z"/g) || []).length === 1);
  // El texto de una cinta va en la cinta y sigue su línea media: medidos
  // aparte, cada uno con su curva, el texto quedaba pegado a un borde.
  const cintas = M('chivas').filter(m => m.tipo === 'etiqueta' && Array.isArray(m.arco) && (m.renglones || []).length);
  prueba('Chivas: las dos cintas llevan su texto dentro', cintas.length === 2, cintas.length);
  prueba('Chivas: ningún texto suelto encima de una cinta', !M('chivas').some(m => m.tipo === 'texto' && m.y[0] >= 0.2 && m.y[1] <= 0.35 && m.ancho > 0.5));
  {
    // Cada palabra, a la mitad entre los dos bordes de su cinta.
    const s = B.marcasFor('chivas', W, H, PAD);
    const num = (t) => t.match(/-?\d+\.?\d*/g).map(Number);
    const bandas = (s.match(/<path class="cp-marca" d="M[^"]*Q[^"]*Q[^"]*Z"/g) || []).map((d) => {
      const [l, ya, cx, ca, r, , , yb, , cb] = num(d);
      const q = (p0, c, p2, t) => (1 - t) * (1 - t) * p0 + 2 * t * (1 - t) * c + t * t * p2;
      // x es lineal en t (el control va al centro): t = (x − l) / (r − l).
      return { l, r, mitad: (x) => { const t = (x - l) / (r - l); return (q(ya, ca, ya, t) + q(yb, cb, yb, t)) / 2; } };
    });
    const palabras = (s.match(/<path class="cp-barra-arco" d="[^"]*"/g) || []).map((d) => {
      const n = num(d); const pts = []; for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]); return pts;
    });
    let peor = 0, vistas = 0;
    for (const b of bandas) for (const pts of palabras) {
      if (!pts.every(([x]) => x > b.l && x < b.r)) continue;
      const y0 = Math.min(...pts.map((p) => p[1])); if (Math.abs(y0 - b.mitad(pts[0][0])) > 12) continue;
      vistas++;
      for (const [x, y] of pts) peor = Math.max(peor, Math.abs(y - b.mitad(x)));
    }
    prueba('Chivas: el texto de las cintas va por su línea media (a medio px)', vistas >= 5 && peor < 0.5, vistas + ' palabras, ' + peor.toFixed(2) + ' px');
  }
  const chv = M('chivas').filter(m => m.tipo === 'etiqueta' && Array.isArray(m.arco) && m.y[0] >= 0.14 && m.y[1] <= 0.41);
  prueba('Chivas: el escudo y sus dos cintas, cada uno con su arco', chv.length === 3, chv.length);
  prueba('Chivas: la cinta de abajo se hunde (∪) y el escudo sube en cresta',
    chv.some(m => m.arco[0] < 0 && m.arco[1] < 0) && chv.some(m => m.arco[0] > 0.1));
  prueba('Chivas: ningún rectángulo tapa la etiqueta entera', !M('chivas').some(m => m.tipo === 'etiqueta' && !m.arco && !m.forma && m.y[1] - m.y[0] > 0.2));
  prueba('Tullamore: TULLAMORE / HEART of IRELAND, debajo de la etiqueta',
    M('tullamore').filter(m => m.tipo === 'texto' && m.y[1] < 0.24).length === 2);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
