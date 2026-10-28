// Burbujas de aviso en la banda del móvil.
//
// El fallo que esto evita: los tres avisos del arranque —conexión,
// órdenes, inventario— se disparan ANTES de que el shell monte la
// banda. La primera versión exigía que `#mBand` existiera, así que
// justo esos tres se iban al contenedor flotante de siempre. Eran los
// únicos que molestaban, y los únicos que seguían saliendo igual.

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'toast.js'), 'utf8');

function entorno(movil) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test' });
  global.window = dom.window;
  global.document = dom.window.document;
  dom.window.matchMedia = () => ({ matches: movil });
  new Function(SRC)();
  return dom.window;
}

let ok = 0, mal = 0;
function prueba(nombre, cond) {
  if (cond) { ok++; console.log('  ok   ' + nombre); }
  else { mal++; console.log('  FALLA ' + nombre); }
}
function grupo(t) { console.log('\n' + t); }
const esperar = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  grupo('en el teléfono, nada flota sobre el contenido');
  let w = entorno(true);
  w.BarStockToast.show('Live updates on');
  w.BarStockToast.show('Orders loaded');
  prueba('no se crea el contenedor flotante',
    !w.document.getElementById('bsToastContainer'));

  grupo('los avisos del arranque esperan a la banda');
  const banda = w.document.createElement('header');
  banda.id = 'mBand';
  w.document.body.appendChild(banda);
  await esperar(450);

  const slot = w.document.querySelector('#mBand .m-band-slot');
  prueba('aparece el hueco en la banda', !!slot);
  prueba('con el primer aviso dentro', !!slot && /Live updates on/.test(slot.textContent));
  prueba('y de uno en uno, no apilados', !!slot && slot.children.length === 1);

  grupo('lo importante deja rastro, lo informativo no');
  w = entorno(true);
  const b2 = w.document.createElement('header');
  b2.id = 'mBand';
  w.document.body.appendChild(b2);
  w.BarStockToast.show('Could not save the match');
  await esperar(2700);
  const s2 = w.document.querySelector('#mBand .m-band-slot');
  prueba('el hueco central queda vacío', !!s2 && s2.children.length === 0);
  // La campana la dibuja ahora el centro de notificaciones, no este
  // módulo: dos campanas en la misma banda era la forma segura de que
  // ninguna se mirase. Aquí sólo se comprueba que el error quede
  // disponible para que el centro lo recoja.
  prueba('el fallo queda pendiente para el centro',
    w.BarStockToast.pendientes().some(p => /Could not save/.test(p.text)));
  prueba('y se puede olvidar desde fuera',
    (w.BarStockToast.olvidar('Could not save the match'),
     w.BarStockToast.pendientes().length === 0));

  grupo('en escritorio sigue el comportamiento de siempre');
  const w3 = entorno(false);
  w3.BarStockToast.show('Saved');
  prueba('usa el contenedor flotante',
    !!w3.document.getElementById('bsToastContainer'));

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
