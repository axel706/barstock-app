#!/usr/bin/env node
/*
 * ── El dinero del estante sube cuando llega mercancia ───────────────
 *
 * "On the shelf" es `on hand × precio`, y `on hand` es lo que alguien
 * conto. Entre un conteo y el siguiente no se mueve: ni Received ni
 * una factura lo tocan, A PROPOSITO, porque es el ancla de la
 * matematica de consumo (inicio + entradas − final = usado). Si una
 * factura lo subiera, Pour·IQ calcularia los pares con basura.
 *
 * Pero el DINERO si tiene que moverse: llega una factura de $2,000 y
 * las botellas estan ahi.
 *
 * Lo que se protege:
 *
 *   1. El titular del Home suma lo contado mas lo llegado.
 *   2. `total` de compute() sigue siendo LO CONTADO: es lo que suman
 *      las categorias del panel, y un titular que no cuadra con sus
 *      partes es peor que un titular viejo.
 *   3. El numero vive en UN sitio. Si el Home dijera $12,030 y el
 *      panel del escritorio $9,990 sobre el mismo estante, estariamos
 *      en el fallo que mas veces ha mordido este proyecto.
 *   4. Nada de esto escribe on_hand.
 *   5. Si la consulta de facturas fallo, se deposita cero, no el de
 *      antes: un numero viejo presentado como fresco es peor.
 *
 *   node tools/test-estante-dinero.js
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

function cargar(master) {
  const w = { state: { master: master || [] }, console: { warn() {} } };
  w.parseNum = (x) => Number(x) || 0;
  global.window = w;
  // `state` a secas, no `window.state`: el modulo lo usa sin prefijo,
  // como en el navegador, donde es una global de index.html.
  new Function('window', 'parseNum', 'state',
    fs.readFileSync(path.join(RAIZ, 'src/inventory-value.js'), 'utf8'))(w, w.parseNum, w.state);
  return w.BarStockInventoryValue;
}

const art = (item, onHand, value, category) => ({ item, onHand, value, category });

(() => {

grupo('lo contado sigue siendo lo contado');
{
  const V = cargar([art('Tito', 10, 27, 'Vodka'), art('Bombay', 5, 22, 'Gin')]);
  const d = V.compute();
  prueba('suma on hand por precio', d.total === 380, String(d.total));
  prueba('y sin facturas, nada llegado', d.llegado === 0, String(d.llegado));
  // Lo que suman las categorias tiene que ser el titular del panel.
  const cats = d.cats.reduce((s, c) => s + c.value, 0);
  prueba('el total cuadra con sus categorias', Math.abs(cats - d.total) < 0.001,
    cats + ' vs ' + d.total);
}

grupo('y lo llegado se guarda aparte');
{
  const V = cargar([art('Tito', 10, 27, 'Vodka')]);
  V.recordarLlegado(2040);
  const d = V.compute();
  prueba('se recuerda', d.llegado === 2040, String(d.llegado));
  // ESTO es lo que no puede cambiar: el total del panel no se infla,
  // porque es la suma de las categorias de abajo.
  prueba('pero el total NO se infla', d.total === 270, String(d.total));
  const cats = d.cats.reduce((s, c) => s + c.value, 0);
  prueba('y sigue cuadrando con sus partes', Math.abs(cats - d.total) < 0.001);
}
{
  const V = cargar([art('Tito', 10, 27, 'Vodka')]);
  V.recordarLlegado('no es un numero');
  prueba('una basura se guarda como cero', V.compute().llegado === 0);
  V.recordarLlegado(null);
  prueba('y null tambien', V.compute().llegado === 0);
}

grupo('el Home suma los dos, y dice de donde salen');
{
  const src = fs.readFileSync(path.join(RAIZ, 'src/mobile-home.js'), 'utf8');
  const f = src.match(/function estante\(\)[\s\S]*?\n  \}/);
  prueba('estante() existe', !!f);
  const cuerpo = f ? f[0] : '';
  prueba('el titular suma lo llegado',
    /total: d\.total \+ llego/.test(cuerpo), cuerpo.slice(-160));
  prueba('y conserva lo contado aparte', /contado: d\.total/.test(cuerpo));
  // Si el titular sube solo y el pie no lo explica, no hay forma de
  // saber si es mercancia nueva o un fallo.
  // Desde las tres cifras (2026-11-12) el desglose ya no va en el pie:
  // lo dice "Details", que abre el aviso con lo contado y lo facturado.
  prueba('Details dice el desglose',
    /k: 'Counted', v: money\(e\.contado\)/.test(src) && /k: 'Invoiced since', v: '\+' \+ money\(e\.llego\)/.test(src));
  // Y NO se calcula aqui: lo lee de inventory-value, que es el dueño.
  prueba('no se calcula en el Home',
    /Number\(d\.llegado\)/.test(cuerpo) && !/_entregas\.dinero/.test(cuerpo));
}

grupo('el numero vive en UN sitio');
{
  const home = fs.readFileSync(path.join(RAIZ, 'src/mobile-home.js'), 'utf8');
  const iv   = fs.readFileSync(path.join(RAIZ, 'src/inventory-value.js'), 'utf8');
  prueba('inventory-value lo guarda', /function recordarLlegado/.test(iv));
  prueba('y lo exporta', /render, compute, recordarLlegado/.test(iv));
  prueba('el Home lo deposita', /V\.recordarLlegado\(/.test(home));
  // El panel del escritorio tiene que decirlo tambien, o los dos
  // numeros se contradicen sin explicacion.
  prueba('el panel del escritorio lo menciona',
    /arrived since the count/.test(iv));
}

grupo('si la consulta fallo, cero y no el de antes');
{
  const home = fs.readFileSync(path.join(RAIZ, 'src/mobile-home.js'), 'utf8');
  const f = home.match(/function depositarLlegado[\s\S]*?\n  \}/);
  prueba('depositarLlegado existe', !!f);
  prueba('un error deposita cero',
    !!f && /!e\.error && Number\(e\.dinero\)\) \|\| 0/.test(f[0]), f && f[0]);
}

grupo('y NADA de esto escribe on_hand');
{
  const iv = fs.readFileSync(path.join(RAIZ, 'src/inventory-value.js'), 'utf8');
  prueba('inventory-value no escribe', !/PATCH|POST|method:/.test(iv));
  // Received tampoco lo hace, y por el mismo motivo: suma a `ordered`
  // del snapshot semanal. Si un dia alguien lo cambia, el consumo se
  // rompe en silencio.
  const si = fs.readFileSync(path.join(RAIZ, 'src/stock-in.js'), 'utf8');
  prueba('Received sigue sumando a ordered, no a on_hand',
    /ordered: antes \+ qty/.test(si) && !/on_hand:/.test(si));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
