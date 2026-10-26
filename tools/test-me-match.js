// Emparejado con MarginEdge: tamaños y puntuación.
//
// Lo que se comprueba aquí no es cosmético. Un tamaño mal leído empareja
// el Tito's de 750 con el de 1.75 — dos artículos distintos del estante—
// y a partir de ahí todas las compras de uno se le cargan al otro.

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test' });
global.window = dom.window;
global.document = dom.window.document;

new Function(fs.readFileSync(
  path.join(__dirname, '..', 'src', 'marginedge-match.js'), 'utf8'))();

const M = dom.window.BarStockMarginEdgeMatch;
const tam = M._tamanoDe;
const pts = M._puntuar;

let ok = 0, mal = 0;
function prueba(nombre, cond) {
  if (cond) { ok++; console.log('  ok   ' + nombre); }
  else { mal++; console.log('  FALLA ' + nombre); }
}
function grupo(t) { console.log('\n' + t); }

grupo('los tamaños, todos a mililitros');
prueba('750ml', tam('Canyon Oaks Chardonnay 750ml') === 750);
prueba('1.75L', tam("Tito's Handmade Vodka 1.75L") === 1750);
prueba('1.75 suelto son litros', tam('TITOS 1.75') === 1750);
prueba('750 suelto son mililitros', tam('TITOS 750') === 750);
prueba('1750ML es lo mismo que 1.75L', tam('TITOS 1750ML') === 1750);
prueba('medio barril', tam('Bud Light 1/2 BBL') === 58674);
prueba('un sexto de barril', tam('Yuengling Sixtel') === 19550);
prueba('sin tamaño, nada', tam('Bar Napkins') === null);
prueba('1.75 y 1.75L son el mismo', tam('TITOS 1.75') === tam("Tito's 1.75L"));

grupo('la puntuación');
prueba('la taquigrafía empareja con el nombre largo',
  pts('TITOS 1.75', "Tito's Handmade Vodka 1.75L") > 0.8);
prueba('el apóstrofe no estorba',
  pts("TITO'S 1.75", 'Titos Handmade Vodka 1.75L') > 0.8);
prueba('un tamaño distinto hunde la nota',
  pts('TITOS 1.75', "Tito's Handmade Vodka 750ml") < 0.5);
prueba('y queda por debajo del mismo tamaño',
  pts('TITOS 1.75', "Tito's Handmade Vodka 750ml") <
  pts('TITOS 1.75', "Tito's Handmade Vodka 1.75L"));
prueba('dos productos sin relación no emparejan',
  pts('TITOS 1.75', 'Bar Napkins 30ft') < 0.3);
prueba('el nombre largo del candidato no castiga',
  pts('BLADE AND BOW', 'Blade and Bow Kentucky Straight Bourbon Whiskey 750ml') > 0.7);
prueba('idéntico da de lleno',
  pts('Grey Goose 750ml', 'Grey Goose 750ml') > 0.9);
prueba('vacío no revienta', pts('', 'Algo') === 0);

// ── Que los módulos carguen ──────────────────────────────────────────
//
// Un error al cargar un IIFE no se nota donde se escribió. Un día el
// gancho de meMatch se puso antes de crear `window.__settingsHooks`:
// reventó el módulo entero y el síntoma fue que NINGÚN botón del panel
// de integraciones respondía. Media hora buscando en el sitio
// equivocado.
grupo('los módulos cargan y se registran');

new Function(fs.readFileSync(
  path.join(__dirname, '..', 'src', 'settings-integrations.js'), 'utf8'))();

prueba('settings-integrations se define', !!dom.window.BarStockIntegrations);
prueba('registra el gancho de integrations',
  typeof (dom.window.__settingsHooks || {}).integrations === 'function');
prueba('registra el gancho de meMatch',
  typeof (dom.window.__settingsHooks || {}).meMatch === 'function');
prueba('marginedge-match se define', !!M && typeof M.abrir === 'function');

// ── La clave del artículo ────────────────────────────────────────────
//
// El fallo que más caro salió: la clave se construía con `code +
// item_name`, el código de proveedor no coincidía entre la tabla y el
// inventario en memoria, y el vínculo guardado no se volvía a
// encontrar. La pantalla pedía emparejar lo ya emparejado y, al
// hacerlo, avisaba de que el artículo se lo robaba a sí mismo.
//
// Lo que hay que garantizar es que escribir y leer dan la misma clave.
grupo('la clave del artículo sobrevive a la ida y vuelta');

const K = M._clave;

prueba('el mismo nombre da la misma clave',
  K({ item: "Bailey's Irish Cream" }) === K({ item: "Bailey's Irish Cream" }));
prueba('el código de proveedor no influye',
  K({ item: 'TITOS 1.75', code: 'ABC' }) === K({ item: 'TITOS 1.75', code: '' }));
prueba('ni que falte el código',
  K({ item: 'TITOS 1.75' }) === K({ item: 'TITOS 1.75', code: null }));
prueba('los espacios de más no cuentan',
  K({ item: '  Grey  Goose 750 ' }) === K({ item: 'Grey Goose 750' }));
prueba('mayúsculas y minúsculas son lo mismo',
  K({ item: 'grey goose' }) === K({ item: 'GREY GOOSE' }));
prueba('dos artículos distintos no colisionan',
  K({ item: 'TITOS 750' }) !== K({ item: 'TITOS 1.75' }));

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
