#!/usr/bin/env node
/*
 * ── Orders › Invoices en el escritorio (lámina "Invoices · desktop", A:
 *    la misma forma que Sent; Axel 2026-11-26) ──
 *
 * Lo que no puede volver a pasar:
 *
 *   1. Invoices es una vista de Orders (Open · Sent · Invoices), y salir
 *      de ella la suelta.
 *   2. Es Invoices del TELÉFONO (mobile-invoices en modo escritorio): la
 *      lista y la factura a la vez, con el filtro en el header; nada de
 *      reescribir la lectura de MarginEdge ni el enlazar.
 *   3. "It arrived before the count" está también aquí (lleva a las
 *      órdenes de ciclos anteriores, la misma regla que el teléfono).
 *   4. Hide this invoice / Hide el proveedor, abajo y fijos.
 *   5. El buscador de botellas, en una ventana: elegir llama a alElegir y
 *      el pie ("Not mine") a alPie.
 *   6. Carga y estilos: desk-invoices antes de desk-orders; los del
 *      teléfono GENERADOS bajo #dkOrd[data-vista="inv"].
 *
 *   node tools/test-invoices-escritorio.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const INDEX = leer('index.html');
const CSS = leer('styles/desk-orders.css');
const GEN = leer('styles/desk-ficha.css');
const MI = leer('src/mobile-invoices.js');
const DO = leer('src/desk-orders.js');
const DV = fs.existsSync(path.join(RAIZ, 'src/desk-invoices.js')) ? leer('src/desk-invoices.js') : '';

grupo('1. Una vista de Orders');
prueba('Open · Sent · Invoices en el header', /\['open', 'Open'\], \['sent', 'Sent'\], \['inv', 'Invoices'\]/.test(DO));
prueba('la vista inv monta desk-invoices y las demás lo sueltan', /DV\(\)\.abrir\(_caja\)/.test(DO) && /DV\(\)\.cerrar\(\)/.test(DO));
prueba('el header de la vista es el de desk-invoices', /enInv\(\)[^\n]*DV\(\)\.CAB/.test(DO));
prueba('lo de Invoices se esconde en las otras vistas (CSS)', /#dkOrd:not\(\[data-vista="inv"\]\) :is\(\.dkv-col, ?\.dkv-det\) \{ ?display: none;? ?\}/.test(CSS));

grupo('2. Es Invoices del teléfono');
prueba('mobile-invoices tiene su modo escritorio', /abrirEscritorio/.test(MI) && /cerrarEscritorio/.test(MI) && /verEscritorio/.test(MI) && /estadoEscritorio/.test(MI));
prueba('desk-invoices lo usa con dos cajas (lista y factura)', /abrirEscritorio\(\{\s*lista:[^}]*detalle:/.test(DV));
prueba('sin la banda del teléfono en el escritorio (enBanda sólo fuera de _esc)', /_esc/.test(MI));

grupo('3. "It arrived before the count" también aquí');
prueba('el botón no depende del teléfono', !/if \(!_esc\)[^\n]*miAntes/.test(MI) && /id="miAntes"/.test(MI));

grupo('4. El pie');
prueba('Hide this invoice / Hide el proveedor se mueven al pie', /#mInvHideI, #mInvHideV/.test(DV) && /dkv-pie/.test(DV));

grupo('5. El buscador de botellas, en una ventana');
{
  const w = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
  if (DV) w.eval(DV);
  const D = w.BarStockDeskInvoices;
  prueba('desk-invoices existe', !!D);
  if (D) {
    let elegido = null, pie = null;
    D._buscar({ titulo: 'Cinzano', productos: ['Cinzano Sweet Vermouth', "Tito's Vodka"], pista: 'CINZANO SWEET 1L', pie: [{ id: 'not', texto: 'Not mine' }], alElegir: p => { elegido = p; }, alPie: id => { pie = id; } });
    const win = w.document.getElementById('dkvBus');
    prueba('sin escribir, primero lo que se parece a la línea', win && win.querySelector('[data-p]') && win.querySelector('[data-p]').dataset.p === 'Cinzano Sweet Vermouth');
    win.querySelector('[data-p]').click();
    prueba('elegir llama a alElegir y cierra', elegido === 'Cinzano Sweet Vermouth' && !w.document.getElementById('dkvBus'));
    D._buscar({ productos: [], pie: [{ id: 'not', texto: 'Not mine' }], alPie: id => { pie = id; } });
    w.document.querySelector('[data-pie]').click();
    prueba('el pie llama a alPie', pie === 'not');
  }
}

grupo('6. Carga y estilos');
const pos = s => INDEX.indexOf(s);
prueba('desk-invoices carga antes que desk-orders', pos('src/desk-invoices.js') > 0 && pos('src/desk-invoices.js') < pos('src/desk-orders.js'));
prueba('los estilos del teléfono, generados bajo la vista', /#dkOrd\[data-vista="inv"\] \.m-iln \{/.test(GEN) && /#dkOrd\[data-vista="inv"\] \.m-itot \{/.test(GEN));

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
