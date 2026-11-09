// El progreso del conteo cuenta sólo lo que se va a pedir.
//
// Con los 260 artículos del maestro la barra nunca llegaba al 100 %:
// los UNKNOWN no se cuentan porque no se piden, así que el conteo
// terminaba al 85 % y el número dejaba de significar nada. Llegar al
// 95 % y parar sí dice algo: o faltan cinco cosas, o esas cinco no hay.

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test' });
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;

new Function(fs.readFileSync(
  path.join(__dirname, '..', 'src', 'count-session.js'), 'utf8'))();

const S = dom.window.BarStockCountSession;

dom.window.state = { master: [
  { item: 'Titos',      vendor: 'LOOP' },
  { item: 'Grey Goose', vendor: 'SOUTHERN' },
  { item: 'Bombay',     vendor: 'BREAKTHRU' },
  { item: 'Mystery A',  vendor: 'UNKNOWN' },
  { item: 'Mystery B',  vendor: '' },
  { item: 'Mystery C' }
] };

let ok = 0, mal = 0;
function prueba(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  FALLA ' + n + (extra ? '   → ' + extra : '')); }
}
function grupo(t) { console.log('\n' + t); }

grupo('el total son los que se piden, no el maestro entero');
let p = S.progress();
prueba('tres de seis', p.total === 3, 'dio ' + p.total);
prueba('sin contar nada, 0 %', p.pct === 0);

grupo('contar mueve la barra');
S.set('Titos', 1, [], 750);
p = S.progress();
prueba('uno de tres es 33 %', p.pct === 33, 'dio ' + p.pct);
prueba('y faltan dos', p.missing === 2);

grupo('escanear algo que no se pide no cuenta');
S.set('Mystery A', 1, [], 750);
prueba('la barra no se mueve', S.progress().pct === 33);
prueba('ni aparece en lo que falta',
  !S.missingRows().some(r => r.item === 'Mystery A'));

grupo('el conteo puede terminar de verdad');
S.set('Grey Goose', 1, [], 750);
S.set('Bombay', 1, [], 750);
p = S.progress();
prueba('cien por cien alcanzable', p.pct === 100, 'dio ' + p.pct);
prueba('y nada pendiente', p.missing === 0 && S.missingRows().length === 0);

grupo('las botellas: lo que llevas y lo que falta, producto por producto');
// Para la tarjeta del Home (Axel, 2026-11-09): lo que falta en un conteo
// son BOTELLAS, y muchas son de productos ya escaneados en otra zona.
// `onHand` es lo de la última vez: durante el conteo no lo toca nadie.
// Lo de los grupos de arriba fuera: `clear()` exige el nombre de la
// locación y aquí no hay ninguna configurada.
for (const it of S.countedItems()) S.remove(it);
dom.window.state = { master: [
  { item: 'Titos',   vendor: 'LOOP',     bottleSizeMl: 1000, onHand: 10 },
  { item: 'Jameson', vendor: 'SOUTHERN', bottleSizeMl: 750,  onHand: 4 },
  { item: 'Bombay',  vendor: 'BREAKTHRU', bottleSizeMl: 750, onHand: 2 },
  { item: 'Nuevo',   vendor: 'LOOP',     bottleSizeMl: 750,  onHand: 0 }
] };
let b = S.bottleProgress();
prueba('sin contar nada, lo que falta es todo lo de la última vez', b.contadas === 0 && b.faltan === 16 && b.antes === 16, JSON.stringify(b));
// Tito's: 6 en el Closet y 1 abierta a medias en la barra.
S.addPass('Titos', 6, [], 1000, 'Closet');
S.addPass('Titos', 0, [0.5], 1000, 'Main Bar');
// Jameson: 7, más de los 4 de la última vez.
S.addPass('Jameson', 7, [], 750, 'Closet');
b = S.bottleProgress();
prueba('lleva las botellas de todas las zonas', Math.abs(b.contadas - 13.5) < 1e-9, String(b.contadas));
// Tito's 10 − 6.5 = 3.5 · Jameson 0 (no baja de cero) · Bombay 2 · Nuevo 0
prueba('falta lo de cada producto, sin bajar de cero', Math.abs(b.faltan - 5.5) < 1e-9, String(b.faltan));
prueba('un producto con más que la última vez no se come lo que falta de otro', b.faltan > 0);
prueba('y lo de la última vez, entero', b.antes === 16, String(b.antes));
// Una pasada en otro formato se pasa al tamaño del producto (ml), no se
// suma como botella suelta: 1 de 1.75 L de Tito's son 1.75 de 1 L.
S.addPass('Titos', 1, [], 1750, 'Wine Cellar');
b = S.bottleProgress();
prueba('otro formato se cuenta en el tamaño del producto', Math.abs(b.faltan - 3.75) < 1e-9, String(b.faltan));

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
