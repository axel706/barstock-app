#!/usr/bin/env node
/*
 * ── Los fondos ───────────────────────────────────────────────────────
 *
 * Había DOS listas de imágenes escritas a mano: la del selector de
 * fondo de la app, dentro de un `<script>` del index, y la del fondo de
 * la pantalla de entrada, en `login-background.js`. Nadie las
 * sincronizaba, así que habían divergido sin que nadie lo decidiera —
 * las dos "neon" estaban sólo en una y "midnight" sólo en la otra—.
 *
 * Lo que se protege:
 *
 *   1. Hay UN catálogo y los dos selectores lo leen. Una lista escrita
 *      a mano que no sea el respaldo es la divergencia volviendo.
 *   2. Cada imagen del catálogo existe de verdad. Un `src` con una
 *      letra de más no se ve hasta que alguien elige ese fondo.
 *   3. Ninguna pesa de más. Esto se carga en un teléfono con 5G en la
 *      barra, antes de iniciar sesión.
 *   4. Las etiquetas están en inglés, como toda la interfaz.
 *
 *   node tools/test-fondos.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let pasa = 0, falla = 0;
function ok(n, c, d) {
  if (c) { pasa++; console.log('  ok   ' + n); }
  else { falla++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}

// El catálogo de verdad, ejecutado tal cual.
const w = {};
new Function('window', fs.readFileSync(path.join(RAIZ, 'src/backgrounds.js'), 'utf8'))(w);
const lista = w.BarStockBackgrounds.lista();

console.log('\nel catalogo');
{
  ok('existe', Array.isArray(lista) && lista.length > 0);

  const ids = lista.map(x => x.id);
  ok('sin ids repetidos', new Set(ids).size === ids.length,
     ids.filter((x, i) => ids.indexOf(x) !== i).join(','));

  ok('estan las dos nuevas',
     ids.includes('neon-plum') && ids.includes('neon-fade'), ids.join(','));
  ok('y las dos de antes siguen',
     ids.includes('neon-tall') && ids.includes('neon-wide'));

  // Devolver el array de dentro dejaría que un selector le metiera su
  // "Default" al del otro.
  w.BarStockBackgrounds.lista().push({ id: 'colado' });
  ok('la lista se entrega en copia',
     w.BarStockBackgrounds.lista().length === lista.length);
}

console.log('\ncada imagen existe y no pesa de mas');
{
  const TOPE_KB = 400;
  lista.forEach(b => {
    const f = path.join(RAIZ, b.src);
    const hay = fs.existsSync(f);
    ok(b.id + ' esta en el disco', hay, b.src);
    if (hay) {
      const kb = Math.round(fs.statSync(f).size / 1024);
      ok(b.id + ' pesa ' + kb + ' KB', kb <= TOPE_KB, 'tope ' + TOPE_KB + ' KB');
    }
  });
}

console.log('\nla interfaz va en ingles');
{
  // "Medianoche" estuvo meses en el selector de la entrada. Es la unica
  // forma de que no vuelva sin que nadie lo note.
  const raros = lista.filter(b => /[áéíóúñ¿¡]/i.test(b.label));
  ok('ninguna etiqueta en español', raros.length === 0,
     raros.map(b => b.label).join(','));
}

console.log('\nlos dos selectores leen el catalogo, no su propia lista');
{
  const login = fs.readFileSync(path.join(RAIZ, 'src/login-background.js'), 'utf8');
  const index = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

  ok('la pantalla de entrada lo lee',
     /PRESETS\s*=\s*\(window\.BarStockBackgrounds/.test(login));
  ok('el selector de la app tambien',
     /BACKGROUNDS\s*=\s*\(\(window\.BarStockBackgrounds/.test(index));

  // El catálogo tiene que cargarse ANTES que quien lo lee. El fondo de
  // la entrada se pinta sin sesión y no espera a nadie.
  const iCat = index.indexOf('src/backgrounds.js');
  const iLog = index.indexOf('src/login-background.js');
  ok('y el catalogo se carga antes', iCat > 0 && iCat < iLog,
     'catalogo en ' + iCat + ', entrada en ' + iLog);

  // ── La guarda de verdad ──────────────────────────────────────────
  //
  // Un respaldo esta bien; una lista que vuelva a ser la fuente, no.
  // Se cuenta cuantas rutas a assets/backgrounds hay escritas fuera del
  // catalogo: las del respaldo de cada selector y ninguna mas.
  const cuenta = (s) => (s.match(/assets\/backgrounds\//g) || []).length;
  ok('la entrada solo tiene su respaldo', cuenta(login) <= 5, String(cuenta(login)));
  ok('y el index solo el suyo', cuenta(index) <= 5, String(cuenta(index)));
}

console.log('\n' + (falla ? falla + ' MAL' : 'todo bien') +
            '   ·   ' + (pasa + falla) + ' comprobaciones');
process.exit(falla ? 1 : 0);
