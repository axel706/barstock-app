#!/usr/bin/env node
/*
 * ── El seguro contra borrar medio inventario ────────────────────────
 *
 * `replaceInventoryMaster` BORRA la tabla entera y la reinserta desde
 * el array local. La llaman cinco sitios y todos dan por hecho que
 * `state.master` está completo.
 *
 * Una noche, contando, Baileys y otros dos dejaron de existir. Nunca
 * supimos cuál de los cinco fue — y eso es justo el problema: no había
 * forma de saberlo, porque borrar no avisaba de nada.
 *
 * Ahora se cuenta antes. Si lo que entra es mucho más pequeño que lo
 * que hay, se para y se dice. Un inventario no encoge un 20% solo.
 *
 * Lo que se protege:
 *
 *   1. Reemplazar con MENOS del 80% de lo que hay, revienta — y no
 *      borra nada.
 *   2. Reemplazar con la misma cantidad o más, pasa.
 *   3. `force: true` pasa igualmente: restaurar un respaldo sí puede
 *      traer menos, y es legítimo.
 *   4. Si no se puede contar, se sigue. Fallar por no escribir dejaría
 *      la app sin poder importar un conteo por una lectura perdida.
 *   5. Y el aviso dice los números, no "algo salió mal".
 *
 *   node tools/test-merma-inventario.js
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

// o: { hay, sinContar }
function entorno(o) {
  o = o || {};
  const w = {
    BARSTOCK_CONFIG: { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k',
                       ACCOUNT_ID: 'a1', LOCATION_NAME: 'The Crown Tavern' },
    __borrado: 0, __insertado: null
  };
  global.window = w;
  global.fetch = w.fetch = async (url, init) => {
    const u = String(url);
    const m = (init && init.method) || 'GET';

    if (/locations\?/.test(u)) {
      return { ok: true, json: async () => [{ id: 'loc-1' }] };
    }
    if (/inventory_items/.test(u) && m === 'GET') {
      if (o.sinContar) throw new Error('red caida');
      return { ok: true, headers: { get: () => '0-0/' + o.hay },
               json: async () => [] };
    }
    if (/inventory_items/.test(u) && m === 'DELETE') {
      w.__borrado++;
      return { ok: true, text: async () => '' };
    }
    if (/inventory_items/.test(u) && m === 'POST') {
      // Se inserta por lotes, asi que se acumula en vez de pisar.
      w.__insertado = (w.__insertado || []).concat(JSON.parse(init.body));
      return { ok: true, text: async () => '' };
    }
    return { ok: true, headers: { get: () => '' }, json: async () => [],
             text: async () => '' };
  };

  new Function(fs.readFileSync(path.join(RAIZ, 'src/inventory-cloud.js'), 'utf8'))();
  return w;
}

const filas = (n) => Array.from({ length: n }, (_, i) => ({
  code: 'C' + i, item: 'Item ' + i, vendor: 'LOOP',
  onHand: 0, suggested: 1, value: 1
}));

(async () => {

grupo('260 en la nube, y llegan 180: se para');
{
  const w = entorno({ hay: 260 });
  let err = null;
  try { await w.BarStockInventoryCloud.replaceInventoryMaster(filas(180)); }
  catch (e) { err = e; }
  prueba('revienta', !!err);
  prueba('y NO borró nada', w.__borrado === 0, String(w.__borrado));
  prueba('el aviso dice los números',
    err && /180/.test(err.message) && /260/.test(err.message), err && err.message);
  prueba('y cuántos se habrían perdido',
    err && /80/.test(err.message), err && err.message);
}

grupo('llegan los 260, o más: pasa');
{
  for (const n of [260, 300]) {
    const w = entorno({ hay: 260 });
    let err = null;
    try { await w.BarStockInventoryCloud.replaceInventoryMaster(filas(n)); }
    catch (e) { err = e; }
    prueba(n + ' entran', !err, err && err.message);
    prueba('  y se escribieron', w.__insertado && w.__insertado.length === n,
      String(w.__insertado && w.__insertado.length));
  }
}

grupo('una merma pequeña también pasa');
{
  // Borrar tres productos a mano es normal. El seguro es para el
  // desastre, no para el mantenimiento.
  const w = entorno({ hay: 260 });
  let err = null;
  try { await w.BarStockInventoryCloud.replaceInventoryMaster(filas(255)); }
  catch (e) { err = e; }
  prueba('255 de 260 entran', !err, err && err.message);
}

grupo('restaurar un respaldo pasa igualmente');
{
  // Es la vuelta atrás: traer menos es exactamente lo que se le pide.
  const w = entorno({ hay: 260 });
  let err = null;
  try { await w.BarStockInventoryCloud.replaceInventoryMaster(filas(40), { force: true }); }
  catch (e) { err = e; }
  prueba('con force, entra', !err, err && err.message);
  prueba('y escribe los 40', w.__insertado && w.__insertado.length === 40,
    String(w.__insertado && w.__insertado.length));
}

grupo('si no se puede contar, se sigue');
{
  // Fallar por el lado de no escribir dejaría la app sin poder cerrar
  // un conteo por una lectura perdida. Pero se avisa por consola.
  const w = entorno({ sinContar: true });
  let err = null;
  try { await w.BarStockInventoryCloud.replaceInventoryMaster(filas(10)); }
  catch (e) { err = e; }
  prueba('no revienta', !err, err && err.message);
  prueba('y escribe', w.__insertado && w.__insertado.length === 10,
    String(w.__insertado && w.__insertado.length));
}

grupo('y el respaldo se pide ANTES de los caminos destructivos');
{
  const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const cf = fs.readFileSync(path.join(RAIZ, 'src/count-finish.js'), 'utf8');
  prueba('el import de conteo respalda', /snapshot\('import-count'\)/.test(idx));
  prueba('el cierre de conteo respalda', /snapshot\(/.test(cf));
  prueba('y el import de respaldo también', /snapshot\('import-backup'\)/.test(idx));
  // El único que puede encoger a propósito es el de restaurar.
  prueba('sólo restaurar lleva force',
    (idx.match(/\{ force: true \}/g) || []).length === 1,
    String((idx.match(/\{ force: true \}/g) || []).length));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
