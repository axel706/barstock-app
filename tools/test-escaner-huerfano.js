#!/usr/bin/env node
/*
 * ── El código aprendido cuyo producto ya no se encuentra ────────────
 *
 * Contando de noche, tres códigos seguidos hicieron lo mismo: la
 * pantalla decía "counted · tap if this is the wrong bottle", no se
 * abría el panel para meter la cantidad, y después el producto no
 * aparecía ni buscándolo. Parecía que el inventario se estaba
 * borrando.
 *
 * No se borraba nada. `resolve()` buscaba el producto del código con
 * igualdad exacta de texto:
 *
 *     master.find(r => r.item === rec.item_name)
 *
 * El código guardaba "Bailey’s Irish Cream" con apóstrofo tipográfico
 * y el catálogo dice "Baileys Irish Cream" sin él. Un carácter, y
 * `find` devuelve undefined.
 *
 * Y entonces la pantalla mentía: `hit()` pintaba "counted" igual, y
 * abrir el panel dependía de `found.row`, que era null. No se contaba
 * nada y no había forma de enterarse.
 *
 * Lo que se protege:
 *
 *   1. El nombre se compara con el MISMO criterio que el resto de la
 *      app, no con `===`.
 *   2. Sin fila NUNCA se dice "counted". Se trata como lo que es —un
 *      código sin dueño— y se pregunta de qué botella es.
 *   3. Lo que ya funcionaba sigue igual: código conocido abre el
 *      panel, código nuevo pregunta.
 *
 *   node tools/test-escaner-huerfano.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const src = fs.readFileSync(path.join(RAIZ, 'src/scan-count.js'), 'utf8');

// ── `resolve` y el camino de `onHit`, extraídos del archivo ─────────
//
// Se saca la función DEL ARCHIVO en vez de reescribirla aquí: una
// copia en la prueba mide la copia, no el escáner.
function sacar(nombre) {
  const i = src.indexOf('  function ' + nombre + '(');
  if (i < 0) throw new Error('no se encontro ' + nombre);
  let n = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (!n) return src.slice(i, k + 1); }
  }
  throw new Error('sin cerrar: ' + nombre);
}

function escenario(master, learned) {
  const w = {
    state: { master },
    normalizeName: (s) => String(s || '').trim().toLowerCase()
      .replace(/[‘’']/g, '').replace(/\s+/g, ' ')
  };
  const ctx = {
    window: w, state: w.state,
    learned: new Map(Object.entries(learned || {}))
  };
  const fn = new Function('window', 'state', 'learned',
    sacar('norm') + '\n' + sacar('resolve') + '\nreturn resolve;');
  return fn(ctx.window, ctx.state, ctx.learned);
}

const BAILEYS = { item: 'Baileys Irish Cream', code: '', vendor: 'UNKNOWN',
                  onHand: 0, suggested: 0 };
const TITOS   = { item: 'Tito’s Vodka', code: '2153', vendor: 'LOOP',
                  onHand: 7.3, suggested: 18 };

grupo('el apóstrofo ya no hace desaparecer una botella');
{
  // El codigo guarda el nombre CON apostrofo, el catalogo lo tiene sin.
  const resolve = escenario([BAILEYS, TITOS],
    { '0087000007215': { item_name: 'Bailey’s Irish Cream', size_ml: 750 } });
  const r = resolve('0087000007215');
  prueba('encuentra el producto', !!(r && r.row), JSON.stringify(r));
  prueba('y es el correcto', r && r.row && r.row.item === 'Baileys Irish Cream',
    r && r.row && r.row.item);
}

grupo('y al revés, y con mayúsculas y espacios de más');
{
  for (const [guardado, esperado] of [
    ['BAILEYS IRISH CREAM', 'Baileys Irish Cream'],
    ['  Baileys   Irish Cream ', 'Baileys Irish Cream'],
    ['Titos Vodka', 'Tito’s Vodka']
  ]) {
    const resolve = escenario([BAILEYS, TITOS], { '1': { item_name: guardado } });
    const r = resolve('1');
    prueba('«' + guardado + '»', !!(r && r.row && r.row.item === esperado),
      r && r.row && r.row.item);
  }
}

grupo('el nombre exacto sigue ganando');
{
  // Dos productos que normalizan igual: el que coincide tal cual es el
  // que vale, no el primero de la lista.
  const A = { item: 'Jose Cuervo', onHand: 1, suggested: 2 };
  const B = { item: 'JOSE CUERVO', onHand: 5, suggested: 6 };
  const resolve = escenario([A, B], { '9': { item_name: 'JOSE CUERVO' } });
  const r = resolve('9');
  prueba('coge el exacto', r && r.row && r.row.onHand === 5,
    r && r.row && r.row.item);
}

grupo('un código que de verdad no está, sigue sin estar');
{
  const resolve = escenario([TITOS], { '7': { item_name: 'Fernet Branca' } });
  const r = resolve('7');
  prueba('se reconoce el código', !!r && r.item === 'Fernet Branca', JSON.stringify(r));
  prueba('pero sin fila', r && r.row === null, JSON.stringify(r));
}

grupo('y en ese caso la pantalla NO dice que se contó');
{
  // Es lo que de verdad dolía: decir "counted" sin contar nada.
  const i = src.indexOf('const found = resolve(text);');
  const j = src.indexOf('counted · tap if this is the wrong bottle', i);
  const entre = src.slice(i, j);

  prueba('el caso sin fila se trata ANTES',
    /if \(found && !found\.row\)/.test(entre), entre.slice(0, 120));
  prueba('y se pregunta de qué botella es',
    /askAssign\(text\);[\s\S]{0,40}return;/.test(entre));
  prueba('sin pintar "counted"', !/counted ·/.test(entre));

  // Y lo que ya funcionaba, igual.
  prueba('con fila, se abre el panel',
    /if \(found\.row && window\.BarStockCountPanel\)/.test(src));
  prueba('y un código nuevo sigue preguntando',
    /New code<\/div>[\s\S]{0,80}askAssign\(text\)/.test(src));
}

grupo('y no vuelve la igualdad exacta a secas');
{
  // `find(r => r.item === ...)` puede quedarse como PRIMER intento,
  // pero nunca como el único.
  const resolveSrc = sacar('resolve');
  prueba('hay respaldo por nombre normalizado',
    /norm\(r\.item\) === norm\(rec\.item_name\)/.test(resolveSrc), resolveSrc);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
