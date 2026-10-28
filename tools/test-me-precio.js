// Qué línea de factura puede fijar el precio de una botella.
//
// La regla de Axel: no se borra nada. Sólo cambia el precio de lo que
// aparece en una factura; lo demás conserva lo que se tecleó.
//
// Y dentro de las facturas, no todas las líneas valen. Un flete o un
// abono pondrían una botella a cero, y un cero en el coste no se nota
// mirando: se nota meses después, cuando el valor del estante no
// cuadra y nadie sabe desde cuándo.

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test' });
global.window = dom.window;
global.document = dom.window.document;
new Function(fs.readFileSync(
  path.join(__dirname, '..', 'src', 'marginedge-purchases.js'), 'utf8'))();

const precio = dom.window.BarStockMarginEdgePurchases._precioDeLinea;

let ok = 0, mal = 0;
function prueba(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  FALLA ' + n + (extra ? '   → ' + extra : '')); }
}
function grupo(t) { console.log('\n' + t); }

grupo('una compra normal fija el precio');
prueba('precio y cantidad positivos',
  precio({ unit_price: 38.94, quantity: 2 }) === 38.94);
prueba('se redondea a céntimos',
  precio({ unit_price: 10.5949, quantity: 12 }) === 10.59);

grupo('lo que NO puede fijar un precio');
prueba('una línea a cero', precio({ unit_price: 0, quantity: 1 }) === null);
prueba('sin precio', precio({ unit_price: null, quantity: 1 }) === null);
prueba('precio vacío', precio({ quantity: 1 }) === null);
prueba('un abono o devolución',
  precio({ unit_price: 38.94, quantity: -2 }) === null);
prueba('un precio negativo', precio({ unit_price: -5, quantity: 1 }) === null);

grupo('cantidad cero sí vale');
// Una línea de cantidad cero con precio es rara pero no es un abono:
// el precio sigue siendo el que cobra ese proveedor.
prueba('no se descarta', precio({ unit_price: 12.5, quantity: 0 }) === 12.5);

grupo('el porcentaje del cambio');
// Es lo que contesta «¿subió un 10 % o bajó un 30 %?». Se calcula
// sobre el precio ANTERIOR, que es contra lo que se compara al
// negociar con el proveedor.
const pct = dom.window.BarStockMarginEdgePurchases._pct;
prueba('una subida', pct(10, 11) === 10);
prueba('una bajada', pct(10, 7) === -30);
prueba('sin cambio', pct(26.99, 26.99) === 0);
prueba('un decimal basta', pct(38.94, 42.10) === 8.1, String(pct(38.94, 42.10)));
// Sin precio anterior no hay porcentaje que calcular: un artículo que
// nunca tuvo coste no "subió", simplemente ahora tiene uno.
prueba('desde cero no hay porcentaje', pct(0, 12) === null);
prueba('ni desde nada', pct(null, 12) === null);

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
