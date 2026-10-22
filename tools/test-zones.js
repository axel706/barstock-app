#!/usr/bin/env node
/*
 * ── Zonas · donde esta cada botella ──────────────────────────────────
 *
 * La propiedad que hay que proteger por encima de todo:
 *
 *     la suma de las zonas == bottlesFor()
 *
 * Si no cuadra, el desglose contradice al total en la MISMA pantalla, y
 * el usuario no tiene forma de saber cual de los dos creer.
 *
 * Y la trampa es la de siempre en esta app: los formatos. Sumar botellas
 * por zona y juntarlas al final vuelve a mezclar 750 con litro, que es
 * el fallo que costo el conteo del 3.7 contra 4.2.
 *
 *   node tools/test-zones.js
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
const cerca = (n, got, esp) =>
  ok(n, Math.abs(got - esp) < 1e-9, 'dio ' + got + ', esperaba ' + esp);

function montar(zonas) {
  const dom = new JSDOM('<!doctype html><body><div id="h"></div></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  global.localStorage = w.localStorage;

  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://x.test', SUPABASE_KEY: 'k',
                        LOCATION_NAME: 'T', ACCOUNT_ID: 'a' };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };

  w.__req = [];
  w.fetch = global.fetch = async (u, o) => {
    w.__req.push({ u: String(u), m: (o && o.method) || 'GET', b: o && o.body ? JSON.parse(o.body) : null });
    if (String(u).includes('/locations')) {
      if (o && o.method === 'PATCH') return { ok: true, status: 204, json: async () => [], text: async () => '' };
      return { ok: true, status: 200, json: async () => [{ zones: zonas, id: 'loc-1' }] };
    }
    if (String(u).includes('count_zones')) {
      return { ok: true, status: 200, json: async () => (w.__zonasDevueltas || []), text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => [], text: async () => '' };
  };

  for (const f of ['count-session.js', 'zones.js']) {
    new Function(fs.readFileSync(path.join(RAIZ, 'src/' + f), 'utf8'))();
  }
  return w;
}

(async () => {

console.log('\nla suma de las zonas es el total');
{
  const w = montar(['Main bar', 'Closet']);
  const S = w.BarStockCountSession;
  // No hay start(): la sesion se crea sola en la primera pasada.

  // El caso que costo un conteo real: mismo producto en dos formatos.
  // 1.5 de 750 ml en la barra  +  1.5 de litro en el closet
  //   = 1125 + 1500 = 2625 ml = 3.5 botellas de 750.
  S.addPass("Hendrick's", 1, [0.5], 750,  'Main bar');
  S.addPass("Hendrick's", 1, [0.5], 1000, 'Closet');

  const total = S.bottlesFor("Hendrick's", 750);
  const porZona = S.bottlesByZone("Hendrick's", 750);
  const suma = Object.values(porZona).reduce((a, b) => a + b, 0);

  cerca('el total sigue siendo el de siempre', total, 3.5);
  cerca('la barra lleva 1.5 botellas de 750', porZona['Main bar'], 1.5);
  cerca('el closet lleva 2 (1.5 de litro son 2 de 750)', porZona['Closet'], 2);
  cerca('y la suma de las zonas ES el total', suma, total);
}

console.log('\nvarias pasadas en la misma zona');
{
  const w = montar(['Main bar', 'Closet']);
  const S = w.BarStockCountSession;
  // No hay start(): la sesion se crea sola en la primera pasada.
  S.addPass('Tito\'s', 2, [], 750, 'Main bar');
  S.addPass('Tito\'s', 3, [], 750, 'Main bar');
  S.addPass('Tito\'s', 1, [], 750, 'Closet');

  const z = S.bottlesByZone('Tito\'s', 750);
  cerca('se acumulan, no se reemplazan', z['Main bar'], 5);
  cerca('y la otra zona no se entera', z['Closet'], 1);
  eq('solo las zonas que se usaron', Object.keys(z).sort(), ['Closet', 'Main bar']);
}

console.log('\nsin zonas configuradas');
{
  const w = montar([]);
  await w.BarStockZones.cargar();
  const S = w.BarStockCountSession;
  // No hay start(): la sesion se crea sola en la primera pasada.

  eq('la funcion esta apagada', w.BarStockZones.activas(), false);
  eq('la pasada no lleva zona', w.BarStockZones.paraPasada(), '');

  S.addPass('Gin', 2, [], 750, w.BarStockZones.paraPasada());
  const p = S.passesOf('Gin')[0];
  ok('y no se guarda el campo', !('zona' in p), JSON.stringify(p));
  cerca('el total no cambia', S.bottlesFor('Gin', 750), 2);

  // Lo que mas importa: no se toca la nube si no hay zonas.
  w.__req.length = 0;
  const n = await w.BarStockZones.sincronizar();
  eq('y no se escribe nada en la nube', [n, w.__req.length], [0, 0]);
}

console.log('\ncorregir una pasada');
{
  const w = montar(['Main bar', 'Closet']);
  const S = w.BarStockCountSession;
  // No hay start(): la sesion se crea sola en la primera pasada.
  S.addPass('Rum', 2, [], 750, 'Closet');

  // Corregir el numero no debe mover la botella de sitio.
  S.replacePass('Rum', 0, 3, [], 750);
  eq('cambiar la cantidad conserva la zona', S.passesOf('Rum')[0].zona, 'Closet');
  cerca('y el numero cambia', S.bottlesByZone('Rum', 750)['Closet'], 3);

  // Pero si se pide explicitamente, se mueve. Es el caso de "escanee el
  // closet con la zona del bar puesta".
  S.replacePass('Rum', 0, 3, [], 750, 'Main bar');
  const z = S.bottlesByZone('Rum', 750);
  eq('y se puede mover a proposito', [z['Main bar'], z['Closet']], [3, undefined]);
}

console.log('\nlo que viaja a la nube');
{
  const w = montar(['Main bar', 'Closet']);
  await w.BarStockZones.cargar();
  w.state = { master: [{ item: 'Vodka', bottleSizeMl: 750 }] };
  const S = w.BarStockCountSession;
  // No hay start(): la sesion se crea sola en la primera pasada.
  S.addPass('Vodka', 2, [], 750, 'Main bar');
  S.addPass('Vodka', 1, [], 750, 'Closet');

  w.__req.length = 0;
  await w.BarStockZones.sincronizar();

  const del = w.__req.find(r => r.m === 'DELETE');
  const post = w.__req.find(r => r.m === 'POST');

  // Borrar y reinsertar, no upsert: una zona puede quedarse en CERO y un
  // upsert dejaria la fila vieja mandando gente al closet.
  ok('primero borra lo que habia de ese articulo', !!del && /count_zones/.test(del.u));
  ok('y solo de ese articulo', !!del && /item_name=in/.test(del.u));
  eq('luego inserta una fila por zona', post.b.length, 2);
  eq('con las botellas de cada una',
     post.b.map(r => [r.zone, r.bottles]).sort(), [['Closet', 1], ['Main bar', 2]]);
  ok('y todas con fecha', post.b.every(r => !!r.counted_at));
}

console.log('\nla fecha del dato');
{
  const w = montar(['Main bar']);
  await w.BarStockZones.cargar();
  const hace = d => new Date(Date.now() - d * 86400000).toISOString();

  w.__zonasDevueltas = [{ zone: 'Main bar', bottles: 2, counted_at: hace(1) }];
  await w.BarStockZones.pintarEn('h', 'Vodka');
  let html = w.document.getElementById('h').innerHTML;
  ok('un dato de ayer se dice sin alarma',
     /yesterday/.test(html) && !/zw-old/.test(html));

  w.__zonasDevueltas = [{ zone: 'Main bar', bottles: 2, counted_at: hace(9) }];
  await w.BarStockZones.pintarEn('h', 'Vodka');
  html = w.document.getElementById('h').innerHTML;
  ok('uno de hace nueve dias se marca como viejo', /zw-old/.test(html),
     'a esas alturas es una pista, no un hecho');
  ok('y siempre dice cuantos dias', /9 days ago/.test(html));

  // Una zona en cero no se esconde: "no hay en el closet" es justo la
  // respuesta que alguien vino a buscar.
  w.__zonasDevueltas = [
    { zone: 'Main bar', bottles: 0, counted_at: hace(1) }
  ];
  await w.BarStockZones.pintarEn('h', 'Vodka');
  html = w.document.getElementById('h').innerHTML;
  ok('una zona en cero se enseña, no se esconde', /zw-zero/.test(html) && />0</.test(html));
}

console.log('\nguardar la lista');
{
  const w = montar(['Main bar']);
  await w.BarStockZones.cargar();
  w.__req.length = 0;

  await w.BarStockZones.guardarLista(['  Closet  ', 'closet', '', 'Wine cellar']);
  const patch = w.__req.find(r => r.m === 'PATCH');
  eq('se limpian espacios, vacios y repetidos', patch.b.zones, ['Closet', 'Wine cellar']);
  eq('y la lista en memoria queda igual', w.BarStockZones.lista(), ['Closet', 'Wine cellar']);

  // La zona activa apuntaba a 'Main bar', que ya no existe.
  eq('la zona activa deja de apuntar a una que se borro',
     w.BarStockZones.paraPasada(), 'Closet');
}

console.log('\n' + (falla ? falla + ' FALLO(S)' : 'todo bien') + '   ·   ' + pasa + ' comprobaciones');
process.exit(falla ? 1 : 0);
})();
