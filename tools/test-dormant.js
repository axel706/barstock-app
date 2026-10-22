#!/usr/bin/env node
/*
 * ── Que se esconde y que no ──────────────────────────────────────────
 *
 * La regla tiene cuatro condiciones Y, y cada una esta ahi por un caso
 * concreto. Quitar cualquiera esconde algo que no debia esconderse, y
 * esconder un producto vivo no da error: solo desaparece.
 *
 * Lo que mas se prueba aqui es el fallo: si la vista no carga, no se
 * esconde NADA. "Se ve todo como siempre" es un mal dia; "desaparecio
 * medio inventario" es una llamada a las once de la noche.
 *
 *   node tools/test-dormant.js
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

const haceSemanas = (n) => new Date(Date.now() - n * 7 * 86400000).toISOString().slice(0, 10);

// `actividad` null simula que la vista fallo o no existe.
function montar(actividad) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;

  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://x.test', SUPABASE_KEY: 'k', LOCATION_NAME: 'T' };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };
  w.fetch = global.fetch = async () => ({
    ok: true, status: actividad === null ? 404 : 200,
    json: async () => actividad === null
      ? { code: '42P01', message: 'relation "item_activity" does not exist' }
      : actividad
  });

  new Function(fs.readFileSync(path.join(RAIZ, 'src/dormant-items.js'), 'utf8'))();
  return w;
}

const ACT = [
  { item_name: 'Tito\'s Vodka',  last_moved: haceSemanas(1) },
  { item_name: 'Amaro Invierno', last_moved: haceSemanas(10) },
  { item_name: 'Fantasma',       last_moved: haceSemanas(30) }
];

const row = (o) => Object.assign({
  item: 'Fantasma', onHand: 0, suggested: 0, createdAt: haceSemanas(40)
}, o);

(async () => {

console.log('\nla regla');
{
  const w = montar(ACT);
  await w.BarStockDormant.cargar();
  const D = w.BarStockDormant;

  ok('sin stock, sin par, quieto 30 semanas y viejo → se esconde',
     D.estaQuieto(row({})));

  ok('con stock NO se esconde, aunque lleve 30 semanas quieto',
     !D.estaQuieto(row({ onHand: 3 })),
     'eso es inventario muerto: es dinero y hay que verlo');

  ok('con par NO se esconde: si le pusiste par lo quieres',
     !D.estaQuieto(row({ suggested: 2 })));

  ok('recien creado NO se esconde aunque no tenga nada',
     !D.estaQuieto(row({ createdAt: haceSemanas(1) })),
     'un articulo dado de alta hoy desapareceria en el acto');

  ok('diez semanas quieto pasa el liston de ocho y se esconde',
     D.estaQuieto(row({ item: 'Amaro Invierno' })));

  ok('movido la semana pasada se ve',
     !D.estaQuieto(row({ item: "Tito's Vodka" })));

  // Esta es la que distingue 8 de 4: un estacional parado dos meses.
  const w2 = montar([{ item_name: 'Amaro Invierno', last_moved: haceSemanas(6) }]);
  await w2.BarStockDormant.cargar();
  ok('seis semanas quieto NO basta: el estacional sobrevive',
     !w2.BarStockDormant.estaQuieto(row({ item: 'Amaro Invierno' })));
}

console.log('\nel que nunca se movio');
{
  const w = montar(ACT);
  await w.BarStockDormant.cargar();
  // No esta en item_activity: nunca registro consumo.
  ok('un articulo sin ninguna fila de actividad se esconde',
     w.BarStockDormant.estaQuieto(row({ item: 'Nunca Existio' })));
  ok('pero no si tiene stock',
     !w.BarStockDormant.estaQuieto(row({ item: 'Nunca Existio', onHand: 1 })));
}

console.log('\ncuando la vista no carga');
{
  const w = montar(null);
  const m = await w.BarStockDormant.cargar();
  const D = w.BarStockDormant;

  eq('la carga devuelve null', m, null);
  ok('y NO se esconde absolutamente nada', !D.estaQuieto(row({})),
     'un error de red no puede parecerse a una limpieza');
  eq('el contador dice cero, no un numero inventado', D.cuantos([row({}), row({})]), 0);
  ok('el chip no se pinta', !D.listo());
}

console.log('\nel interruptor de ver todo');
{
  const w = montar(ACT);
  await w.BarStockDormant.cargar();
  const D = w.BarStockDormant;
  const r = row({});

  ok('por omision esta oculto', D.oculto(r));
  D.verTodo(true);
  ok('con "Showing all" deja de estarlo', !D.oculto(r));
  ok('pero sigue estando quieto: el boton cambia la VISTA, no el hecho',
     D.estaQuieto(r),
     'count-session usa estaQuieto justo por esto');
  D.verTodo(false);
}

console.log('\ninventario muerto');
{
  const w = montar(ACT);
  await w.BarStockDormant.cargar();
  const filas = [
    row({ item: 'Fantasma', onHand: 0 }),
    row({ item: 'Fantasma', onHand: 4 }),
    row({ item: "Tito's Vodka", onHand: 9 })
  ];
  eq('solo los que tienen botellas y llevan quietos',
     w.BarStockDormant.stockMuerto(filas).map(r => r.onHand), [4]);
}

console.log('\n' + (falla ? falla + ' FALLO(S)' : 'todo bien') + '   ·   ' + pasa + ' comprobaciones');
process.exit(falla ? 1 : 0);
})();
