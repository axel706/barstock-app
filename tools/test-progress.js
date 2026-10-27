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

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
