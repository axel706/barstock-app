/*
 * ── La cabecera DE VERDAD, para las pruebas ──────────────────────────
 *
 * `cabecera()` y `alVolver()` viven en `src/mobile-shell.js` y las usan
 * cuatro pantallas. Las pruebas de esas pantallas montan un
 * `BarStockMobile` de mentira, y si ahí se escribiera una cabecera
 * propia habría DOS implementaciones: el día que cambie el markup real,
 * los tests seguirían pasando mientras la app se rompe.
 *
 * Es exactamente lo que pasó con `loadOrdersFromCloud`, que en pruebas
 * no hacía nada y tapó un fallo que sí ocurría en el teléfono.
 *
 * Así que se toman del archivo real. Se extraen por su firma en vez de
 * cargar el armazón entero porque al cargarse se registra, monta la
 * banda y escucha eventos — nada de eso hace falta aquí.
 *
 *   const { cabecera, alVolver } = require('./lib-cabecera');
 *   w.BarStockMobile = { ..., cabecera, alVolver };
 */

const fs = require('fs');
const path = require('path');

function tomar() {
  const ruta = path.join(__dirname, '..', 'src', 'mobile-shell.js');
  const src = fs.readFileSync(ruta, 'utf8');

  const uno = /function cabecera\(o\) \{[\s\S]*?\n  \}/.exec(src);
  const dos = /function alVolver\(host, fn\) \{[\s\S]*?\n  \}/.exec(src);
  if (!uno || !dos) {
    throw new Error(
      'No se encontraron cabecera()/alVolver() en src/mobile-shell.js.\n' +
      'Si cambiaron de nombre o de forma, hay que actualizar tools/lib-cabecera.js —\n' +
      'y conviene, porque significa que los tests estaban probando otra cosa.');
  }

  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const fabricar = new Function('esc',
    uno[0] + '\n' + dos[0] + '\nreturn { cabecera: cabecera, alVolver: alVolver };');
  return fabricar(esc);
}

module.exports = tomar();
