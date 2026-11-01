#!/usr/bin/env node
/*
 * ── La salida del ciclo atascado, la de verdad ───────────────────────
 *
 * `test-ciclo-sin-contar.js` prueba las PANTALLAS: que la tarjeta y la
 * pantalla del ciclo ofrezcan la salida cuando la app dice que hay un
 * callejón. Pero ahí `cicloSinContar()` es un stub, así que quien
 * decide CUÁNDO hay callejón no estaba probado por nadie.
 *
 * Y era justo lo que estaba mal. La até a `cicloViejo()` —más de siete
 * días— y en Will's & Bill's el ciclo se abrió el 26 y se miró el 1:
 * seis días. La salida habría aparecido el día DESPUÉS de hacer falta.
 * Él lo dijo en dos palabras: "no hay salida".
 *
 * Los días no eran la señal. La señal es que la app no tiene nada que
 * ofrecer: ciclo abierto, nada contado, y nada que pedir.
 *
 * Esto carga `src/weekly-cycle.js` DE VERDAD y le pregunta.
 *
 *   node tools/test-salida-ciclo.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

// o: { dias, contado, counting, porPedir, sinCiclo }
async function cargar(o) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  // Con la config a medias, `readCountingSince` se sale antes de
  // preguntar y el conteo en marcha nunca llegaría.
  w.BARSTOCK_CONFIG = {
    SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k',
    ACCOUNT_ID: 'a1', LOCATION_NAME: "Will's & Bill's"
  };
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  // Con stock = ya se contó; sin stock = el ciclo está a cero.
  w.state = { master: Array.from({ length: 30 }, (_, i) => ({
    item: 'I' + i, vendor: 'ACME', onHand: (o.contado && i < 20) ? 3 : 0
  })) };
  // El módulo lee `state.master` a pelo, sin `window.` delante. En el
  // navegador da igual; aquí el IIFE corre en el global de Node, así
  // que hay que dejarlo también ahí o explota al deducir el paso.
  global.state = w.state;

  const abierto = o.sinCiclo ? null : new Date(Date.now() - o.dias * 86400000);
  w.BarStockCycle = {
    load: async () => {},
    startedAt: () => abierto
  };

  // `readCountingSince` sale a la nube. Se le contesta con la señal.
  global.fetch = w.fetch = async () => ({
    ok: true,
    json: async () => (o.counting
      ? [{ counting_since: new Date().toISOString(), counting_touched_at: null, counting_paused_at: null }]
      : [{ counting_since: null, counting_touched_at: null, counting_paused_at: null }])
  });

  // Lo que queda por pedir. Es la mitad nueva de la condición.
  w.getActiveVendors = () => ['ACME'];
  w.getOrderRowsForVendor = () => (o.porPedir ? [{ item: 'I1', toOrder: 6 }] : []);

  new Function(fs.readFileSync(path.join(RAIZ, 'src/weekly-cycle.js'), 'utf8'))();
  const W = w.BarStockWeeklyCycle;
  await W.refresh();
  return { w, W };
}

(async () => {

grupo('Will\'s & Bill\'s: el caso que no tenía salida');
{
  // Abierto el 26, mirado el 1. Nada contado. Todo lo de esa semana ya
  // se pidió, así que Ordering está vacío.
  const { W } = await cargar({ dias: 6, porPedir: false });
  prueba('el paso es step2', W.estado() === 'step2', W.estado());
  prueba('a los 6 días ya hay salida', W.cicloSinContar() === true);
  // Y el viejo criterio sigue diciendo que no, que es el bug entero.
  prueba('aunque cicloViejo() todavía diga que no', W.cicloViejo() === false);
}

grupo('mientras quede algo que pedir, la respuesta es pedir');
{
  const { W } = await cargar({ dias: 6, porPedir: true });
  prueba('no se ofrece empezar de nuevo', W.cicloSinContar() === false);
}
{
  // Ni a los veinte días: si hay lista de pedido, el camino existe.
  const { W } = await cargar({ dias: 20, porPedir: true });
  prueba('ni a los 20 días', W.cicloSinContar() === false);
}

grupo('el suelo: no aparece el rato en que acabas de pedirlo todo');
{
  const { W } = await cargar({ dias: 0, porPedir: false });
  prueba('el mismo día, no', W.cicloSinContar() === false);
}
{
  const { W } = await cargar({ dias: 2, porPedir: false });
  prueba('al día siguiente tampoco', W.cicloSinContar() === false);
}
{
  const { W } = await cargar({ dias: 4, porPedir: false });
  prueba('a los 4 sí', W.cicloSinContar() === true);
}

grupo('y no se cruza con los estados que ya tienen su camino');
{
  const { W } = await cargar({ dias: 10, contado: true, porPedir: false });
  prueba('con el conteo cargado, no', W.cicloSinContar() === false, W.estado());
  prueba('porque ahí el paso es done', W.estado() === 'done', W.estado());
}
{
  const { W } = await cargar({ dias: 10, counting: true, porPedir: false });
  prueba('con un conteo en marcha, no', W.cicloSinContar() === false);
  prueba('porque ahí el paso es counting', W.estado() === 'counting', W.estado());
}
{
  const { W } = await cargar({ sinCiclo: true, porPedir: false });
  prueba('sin ciclo abierto, no', W.cicloSinContar() === false);
  prueba('porque ahí el paso es step1', W.estado() === 'step1', W.estado());
}

grupo('si no se puede leer lo que falta por pedir, no se ofrece');
{
  // Ofrecer reiniciar la semana por un fallo de lectura es peor que no
  // ofrecerlo: lo segundo molesta, lo primero borra.
  const { w, W } = await cargar({ dias: 10, porPedir: false });
  w.getOrderRowsForVendor = () => { throw new Error('boom'); };
  prueba('un error cuenta como "sí queda"', W.cicloSinContar() === false);
  delete w.getActiveVendors;
  prueba('y sin la función tampoco', W.cicloSinContar() === false);
}

grupo('el número vive en un solo sitio');
{
  const src = fs.readFileSync(path.join(RAIZ, 'src/weekly-cycle.js'), 'utf8');
  prueba('el suelo es una constante con nombre', /const SUELO_MS\s*=/.test(src));
  // El comentario es la mitad del arreglo: el próximo que lea esto tiene
  // que encontrarse por qué NO son siete días.
  prueba('y queda escrito por qué no son los 7 de cicloViejo',
    /no eran la señal|no son la señal|criterio equivocado/i.test(src));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
