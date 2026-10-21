#!/usr/bin/env node
/*
 * ── Los <select> de proveedor ────────────────────────────────────────
 *
 * Habia cinco listas de proveedores escritas a mano en el HTML con los
 * cuatro de siempre, mientras la lista real vivia en vendor_mappings.
 * Un proveedor nuevo salia en las pestañas y no existia en ningun
 * desplegable.
 *
 * Y el fallo era mudo por partida doble:
 *
 *   · asignar select.value a algo que no esta entre sus <option> no
 *     lanza error, simplemente no hace nada → el filtro no filtraba;
 *   · al abrir "editar" un articulo de un proveedor sin <option>, el
 *     navegador deja el select en la PRIMERA opcion, asi que guardar
 *     sin tocar nada le cambiaba el proveedor al articulo.
 *
 * El segundo es el caro: no es una pantalla que no filtra, es un dato
 * que se corrompe solo.
 *
 * La funcion se toma del propio index.html, no se copia aqui.
 *
 *   node tools/test-vendors.js
 */

const path = require('path');
const fs = require('fs');

const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let pasa = 0, falla = 0;
function ok(n, c, d) {
  if (c) { pasa++; console.log('  ok   ' + n); }
  else { falla++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const eq = (n, got, esp) =>
  ok(n, JSON.stringify(got) === JSON.stringify(esp),
     'dio ' + JSON.stringify(got) + ', esperaba ' + JSON.stringify(esp));

const HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

function sacar(nombre) {
  const re = new RegExp('\\nfunction ' + nombre + '\\([\\s\\S]*?\\n\\}', 'm');
  const m = HTML.match(re);
  if (!m) throw new Error('no se encontro function ' + nombre + ' en index.html');
  return m[0];
}

function montar(vendors) {
  const dom = new JSDOM(`<!doctype html><body>
    <select id="vendorFilter"><option value="ALL">All Vendors</option></select>
    <select id="editVendor"><option value="LOOP">LOOP</option><option value="UNKNOWN">UNKNOWN</option></select>
  </body>`, { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;

  w.escapeHtml = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  w.getActiveVendors = () => vendors.slice();
  w.getVendorsWithUnknown = () => {
    const l = vendors.slice();
    if (!l.includes('UNKNOWN')) l.push('UNKNOWN');
    return l;
  };
  w.getVendorsForFilter = () => ['ALL', ...w.getVendorsWithUnknown()];

  // La funcion se saca tal cual del index y se le inyectan solo sus
  // dependencias. Si alla cambia, esta prueba usa la version nueva: no
  // hay una copia aqui que se pueda quedar atras.
  const src = sacar('fillVendorSelect');
  w.fillVendorSelect = new w.Function(
    'escapeHtml', 'getVendorsWithUnknown', 'getVendorsForFilter',
    src + '; return fillVendorSelect;'
  )(w.escapeHtml, w.getVendorsWithUnknown, w.getVendorsForFilter);
  return w;
}

const vals = (w, id) => Array.from(w.document.getElementById(id).options).map(o => o.value);

console.log('\nel proveedor nuevo');
{
  const w = montar(['LOOP', 'SOUTHERN', 'EL NUEVO']);

  w.fillVendorSelect('editVendor');
  ok('aparece entre las opciones de editar', vals(w, 'editVendor').includes('EL NUEVO'),
     vals(w, 'editVendor').join(', '));

  w.fillVendorSelect('vendorFilter', { conAll: true, valor: 'ALL' });
  eq('y en el filtro, con ALL al principio y UNKNOWN al final',
     vals(w, 'vendorFilter'), ['ALL', 'LOOP', 'SOUTHERN', 'EL NUEVO', 'UNKNOWN']);

  // Esto es lo que no pasaba: sin <option>, asignar el value no hacia
  // nada y la pantalla seguia mostrandolo todo.
  const el = w.document.getElementById('vendorFilter');
  el.value = 'EL NUEVO';
  eq('y ahora el filtro si se puede poner en el', el.value, 'EL NUEVO');
}

console.log('\nel proveedor que ya no esta en la lista');
{
  // Un articulo guardado como SOUTHERN cuando SOUTHERN se quito del
  // mapeo. Antes el select caia a la primera opcion y guardar sin tocar
  // nada reasignaba el articulo.
  const w = montar(['LOOP', 'EL NUEVO']);
  w.fillVendorSelect('editVendor', { valor: 'SOUTHERN' });

  const el = w.document.getElementById('editVendor');
  eq('el valor del articulo se respeta', el.value, 'SOUTHERN');
  ok('y se marca como fuera de la lista, no se esconde',
     /not in vendor list/i.test(el.options[el.selectedIndex].textContent),
     el.options[el.selectedIndex].textContent);
  ok('nunca cae a la primera opcion', el.value !== 'LOOP');
}

console.log('\ndetalles');
{
  const w = montar(['LOOP', 'EL NUEVO']);
  w.fillVendorSelect('editVendor', { valor: 'el nuevo' });
  eq('el proveedor se normaliza a mayusculas', w.document.getElementById('editVendor').value, 'EL NUEVO');

  // Llamarla dos veces no debe ir acumulando opciones repetidas.
  w.fillVendorSelect('editVendor');
  w.fillVendorSelect('editVendor');
  eq('llamarla varias veces no duplica opciones', vals(w, 'editVendor'), ['LOOP', 'EL NUEVO', 'UNKNOWN']);

  w.fillVendorSelect('noExiste');
  ok('un id que no existe no revienta', true);
}

console.log('\n' + (falla ? falla + ' FALLO(S)' : 'todo bien') + '   ·   ' + pasa + ' comprobaciones');
process.exit(falla ? 1 : 0);
