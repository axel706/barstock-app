#!/usr/bin/env node
/*
 * ── Cuánto se tarda en contar ────────────────────────────────────────
 *
 * No hay cronómetro corriendo: el tiempo se reconstruye de los huecos
 * entre botellas. Un hueco corto es que estabas contando y suma; uno
 * largo es que te fuiste y no suma nada.
 *
 * Lo que se protege:
 *
 *   1. Arranca con el PRIMER PRODUCTO, no al abrir el escáner. Abrirlo
 *      y mirarlo no es contar.
 *   2. Los huecos largos no suman. Es lo que se pidió: bajar al sótano
 *      no es tiempo de conteo.
 *   3. Los cortos sí. Si se perdieran, el número saldría absurdo.
 *   4. Lo guardado está siempre al día hasta la última botella, así que
 *      una recarga o un cierre sucio no inflan ni pierden el total.
 *      Es la razón de que no haya un `desde` vivo que se quede colgado.
 *   5. Cerrar el conteo lo pone a cero. Arrastrarlo a la semana
 *      siguiente sumaría dos conteos en uno.
 *   6. El formato es el mismo en los dos sitios que lo enseñan.
 *
 *   node tools/test-cronometro.js
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

let pasa = 0, falla = 0;
function ok(n, c, d) {
  if (c) { pasa++; console.log('  ok   ' + n); }
  else { falla++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}

const MIN = 60 * 1000;

// El reloj se controla desde fuera: medir tiempo con tiempo de verdad
// haría una prueba lenta y además mentirosa, porque los huecos que
// importan son de minutos.
const CLAVE = 'bs_count_acc1__The Crown Tavern';

function montar(guardado) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  global.localStorage = w.localStorage;

  w.BARSTOCK_CONFIG = { ACCOUNT_ID: 'acc1', LOCATION_NAME: 'The Crown Tavern' };
  // Cada JSDOM trae su propio localStorage, así que "recargar" hay que
  // simularlo sembrando lo que había. Sin esto la segunda ventana
  // arrancaba vacía y la prueba daba por bueno un total de cero: habría
  // pasado igual con el bug puesto.
  if (guardado) { try { w.localStorage.setItem(CLAVE, guardado); } catch (e) {} }
  w.state = { master: [] };
  // Sin red: `marcarNube` sale por aquí y una prueba no debe salir a
  // internet.
  const red = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
  w.fetch = red; global.fetch = red;

  let ahora = Date.parse('2026-11-02T09:00:00Z');
  const RealDate = w.Date;
  const Falso = function (...a) {
    return a.length ? new RealDate(...a) : new RealDate(ahora);
  };
  Falso.now = () => ahora;
  Falso.parse = RealDate.parse;
  Falso.UTC = RealDate.UTC;
  Falso.prototype = RealDate.prototype;
  w.Date = Falso; global.Date = Falso;

  new Function(fs.readFileSync(path.join(RAIZ, 'src/count-session.js'), 'utf8'))();

  return {
    w,
    S: w.BarStockCountSession,
    volcado: () => w.localStorage.getItem(CLAVE),
    avanzar: (ms) => { ahora += ms; },
    restaurar: () => { w.Date = RealDate; global.Date = RealDate; }
  };
}

// Una botella contada, sin pasar por el escáner: es el mismo camino que
// usa el panel manual.
const botella = (S, item) => S.addPass(item, 1, [], 750, '');

console.log('\narranca con el primer producto, no al abrir');
{
  const { S, avanzar, restaurar } = montar();

  // Abrir el escáner llama a `resume()`. Eso no es contar.
  S.resume();
  avanzar(10 * MIN);
  S.resume();
  ok('abrir y mirar no cuenta', S.activeMs() === 0, String(S.activeMs()));
  ok('y no hay hora de arranque', S.cronoDesde() === null);

  botella(S, "Tito's Vodka");
  ok('la primera botella arranca el reloj', !!S.cronoDesde());
  ok('pero todavia no lleva tiempo', S.activeMs() === 0, String(S.activeMs()));
  restaurar();
}

console.log('\nlos huecos cortos suman y los largos no');
{
  const { S, avanzar, restaurar } = montar();

  botella(S, 'A');
  avanzar(30 * 1000);  botella(S, 'B');
  avanzar(45 * 1000);  botella(S, 'C');
  ok('dos huecos cortos suman', S.activeMs() === 75 * 1000, String(S.activeMs()));

  // Te vas al sótano. Cuarenta minutos.
  avanzar(40 * MIN);   botella(S, 'D');
  ok('el hueco largo no suma', S.activeMs() === 75 * 1000, String(S.activeMs()));

  avanzar(20 * 1000);  botella(S, 'E');
  ok('y despues se sigue sumando normal', S.activeMs() === 95 * 1000, String(S.activeMs()));
  restaurar();
}

console.log('\nel umbral');
{
  const { S, avanzar, restaurar } = montar();
  const U = S.CRONO_HUECO_MS;
  ok('son cinco minutos', U === 5 * MIN, String(U));

  botella(S, 'A');
  avanzar(U);          botella(S, 'B');
  ok('justo en el umbral todavia cuenta', S.activeMs() === U, String(S.activeMs()));
  avanzar(U + 1000);   botella(S, 'C');
  ok('un segundo mas y ya no', S.activeMs() === U, String(S.activeMs()));
  restaurar();
}

console.log('\nlo que se enseña mientras cuentas');
{
  const { S, avanzar, restaurar } = montar();
  botella(S, 'A');
  avanzar(40 * 1000); botella(S, 'B');   // 40 s confirmados
  avanzar(20 * 1000);
  // Sin registrar nada: el número ya tiene que haber avanzado, o
  // parecería congelado mientras buscas la siguiente botella.
  ok('avanza entre botellas', S.activeMs() === 60 * 1000, String(S.activeMs()));

  avanzar(10 * MIN);
  // Pasado el umbral, el hueco en curso deja de contar y se vuelve a
  // lo confirmado. Es a proposito y es el MISMO criterio que decide lo
  // que se guarda: si el numero en pantalla siguiera subiendo, lo que
  // ves y lo que acaba en la tabla serian distintos.
  ok('pasado el umbral vuelve a lo confirmado',
     S.activeMs() === 40 * 1000, String(S.activeMs()));
  restaurar();
}

console.log('\nuna recarga no infla ni pierde el total');
{
  // ── Por que esto importa ─────────────────────────────────────────
  //
  // El diseño evidente seria guardar "corriendo desde las 9:14". Si el
  // navegador se muere, eso se queda puesto y al volver el reloj ha
  // corrido toda la noche. Aqui lo guardado es un acumulado cerrado,
  // asi que recargar no puede inventarse tiempo.
  const a = montar();
  botella(a.S, 'A');
  a.avanzar(60 * 1000); botella(a.S, 'B');
  const antes = a.S.activeMs();
  a.restaurar();

  // Misma locacion y lo que habia guardado: es lo que pasa al recargar.
  const b = montar(a.volcado());
  // Se adelanta el reloj como si hubieran pasado horas con la pestaña
  // cerrada.
  b.avanzar(3 * 60 * MIN);
  ok('al volver, el total es el mismo', b.S.activeMs() === antes,
     b.S.activeMs() + ' vs ' + antes);

  botella(b.S, 'C');
  ok('y la botella siguiente no arrastra las tres horas',
     b.S.activeMs() === antes, String(b.S.activeMs()));
  b.restaurar();
}

console.log('\ncerrar el conteo lo pone a cero');
{
  const { S, avanzar, restaurar, w } = montar();
  botella(S, 'A');
  avanzar(60 * 1000); botella(S, 'B');
  ok('habia tiempo', S.activeMs() > 0);

  const s = S.summary();
  ok('el resumen lo lleva, para poder guardarlo antes de borrar',
     s.activeMs === S.activeMs() && !!s.countingSince);

  S.clear(w.BARSTOCK_CONFIG.LOCATION_NAME);
  ok('despues de cerrar, cero', S.activeMs() === 0, String(S.activeMs()));
  ok('y sin hora de arranque', S.cronoDesde() === null);
  restaurar();
}

console.log('\nel formato');
{
  const { S, restaurar } = montar();
  ok('segundos', S.fmtDur(40 * 1000) === '40 s', S.fmtDur(40 * 1000));
  ok('minutos', S.fmtDur(24 * MIN) === '24 min', S.fmtDur(24 * MIN));
  ok('horas y minutos', S.fmtDur(92 * MIN) === '1 h 32 min', S.fmtDur(92 * MIN));
  ok('una hora justa no dice 0 min', S.fmtDur(60 * MIN) === '1 h', S.fmtDur(60 * MIN));
  ok('cero no revienta', S.fmtDur(0) === '0 s', S.fmtDur(0));
  restaurar();
}

console.log('\nlos dos sitios que lo enseñan preguntan, no calculan');
{
  // Si la tarjeta del Home o la pantalla de cierre se hicieran su
  // propia cuenta, habria dos reglas de "que cuenta como tiempo
  // activo" y se desincronizarian a la primera.
  const home = fs.readFileSync(path.join(RAIZ, 'src/mobile-home.js'), 'utf8');
  const fin = fs.readFileSync(path.join(RAIZ, 'src/count-finish.js'), 'utf8');

  ok('la tarjeta pregunta el tiempo', /activeMs\(\)/.test(home));
  ok('y el formato tambien', /fmtDur/.test(home));
  ok('la pantalla de cierre usa el del resumen', /s\.activeMs/.test(fin));
  ok('y guarda antes de vaciar la sesion',
     fin.indexOf('guardarTiempo(s)') < fin.indexOf("S().clear("));

  // La tabla tiene que existir en el repo para que alguien pueda
  // correrla. Sin ella el cierre funciona igual, pero no guarda nada.
  const sql = path.join(RAIZ, 'database', 'migrations', '020_count_sessions.sql');
  ok('la migracion esta escrita', fs.existsSync(sql));
  if (fs.existsSync(sql)) {
    const t = fs.readFileSync(sql, 'utf8');
    ok('con RLS encendido', /enable row level security/i.test(t));
    // Historial al que solo se añade: sin update ni delete no se puede
    // falsear borrando la semana mala.
    ok('sin politica de borrado', !/for\s+delete/i.test(t));
    ok('ni de modificacion', !/for\s+update/i.test(t));
  }
}

console.log('\n' + (falla ? falla + ' MAL' : 'todo bien') +
            '   ·   ' + (pasa + falla) + ' comprobaciones');
process.exit(falla ? 1 : 0);
