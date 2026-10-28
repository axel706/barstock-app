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

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
