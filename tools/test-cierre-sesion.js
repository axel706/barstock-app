#!/usr/bin/env node
/*
 * ── Cuándo se cierra la sesión sola ─────────────────────────────────
 *
 * Axel, 2026-11-09: la sesión se cerraba a los 30 minutos sin tocar la
 * app, y en el iPhone eso era impredecible (el temporizador se congela
 * con la app en segundo plano). La regla nueva:
 *
 *   - se cierra a medianoche, hora de Nueva York, todos los días;
 *   - si alguien usó la app en los 30 minutos ANTES del corte, el corte
 *     se recorre 2 horas (2:00), y otra vez (4:00) mientras se siga
 *     usando antes de cada corte;
 *   - nada más: sin cierre por inactividad.
 *
 * No depende de un temporizador: guarda el próximo corte y la última
 * actividad antes de él, y lo resuelve cada vez que mira. Lo que se
 * protege aquí es esa resolución, con noches de verdad.
 *
 *   node tools/test-cierre-sesion.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const w = new JSDOM('<!doctype html><body></body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
let SRC = '';
try { SRC = fs.readFileSync(path.join(RAIZ, 'src/session-cutoff.js'), 'utf8'); } catch (e) {}
if (SRC) w.eval(SRC);
const C = w.BarStockSessionCutoff || {};

// Una hora de Nueva York escrita a mano, en UTC. Noviembre 2026 ya es
// horario de invierno (UTC-5) desde el 1; octubre es UTC-4.
const ny = (s) => {
  const [f, h] = s.split(' ');
  const [y, mo, d] = f.split('-').map(Number);
  const [hh, mm] = h.split(':').map(Number);
  const off = (mo > 11 || (mo === 11 && d >= 1 && !(d === 1 && hh < 2))) ? 5 : 4;
  return Date.UTC(y, mo - 1, d, hh + off, mm);
};
const MIN = 60000;

// Simula un día: empieza la sesión, pasan actividades, y al final mira.
function noche(inicio, actividades, mira) {
  let e = C.empezar(ny(inicio));
  for (const a of actividades) {
    const r = C.resolver(e, ny(a));
    if (r.cerrar) return { cerrada: true, en: a };
    e = C.actividad(r.estado, ny(a));
  }
  const r = C.resolver(e, ny(mira));
  return { cerrada: r.cerrar, corte: r.estado.corte };
}

grupo('el corte es la medianoche de Nueva York');
prueba('el módulo existe', typeof C.empezar === 'function' && typeof C.resolver === 'function' && typeof C.actividad === 'function');
if (typeof C.empezar === 'function') {
  prueba('empezando a las 3 pm, el corte es esa medianoche', C.empezar(ny('2026-11-09 15:00')).corte === ny('2026-11-10 00:00'));
  prueba('empezando a las 0:20, la medianoche siguiente, no ésta', C.empezar(ny('2026-11-10 00:20')).corte === ny('2026-11-11 00:00'));
  // Cambio de horario: el 1 de noviembre a las 2:00 vuelve a la 1:00.
  prueba('con el cambio de horario, la medianoche correcta', C.empezar(ny('2026-10-31 15:00')).corte === Date.UTC(2026, 10, 1, 4, 0));
}

grupo('sin uso antes del corte, se cierra a medianoche');
if (typeof C.empezar === 'function') {
  prueba('nadie la tocó: a las 0:01, cerrada', noche('2026-11-09 15:00', [], '2026-11-10 00:01').cerrada === true);
  prueba('usada a las 10 pm, nada más: cerrada', noche('2026-11-09 15:00', ['2026-11-09 22:00'], '2026-11-10 00:01').cerrada === true);
  prueba('un minuto antes del corte, abierta', noche('2026-11-09 15:00', [], '2026-11-09 23:59').cerrada === false);
  prueba('dejada abierta toda la noche y abierta a las 9 am: cerrada', noche('2026-11-09 15:00', ['2026-11-09 21:00'], '2026-11-10 09:00').cerrada === true);
  // Tocarla DESPUÉS del corte no la salva: lo que cuenta es antes.
  prueba('tocada a las 0:05 tras no usarla antes: cerrada', noche('2026-11-09 15:00', ['2026-11-09 22:00', '2026-11-10 00:05'], '2026-11-10 00:06').cerrada === true);
}

grupo('usada en los 30 minutos antes, se recorre a las 2');
if (typeof C.empezar === 'function') {
  const r = noche('2026-11-09 15:00', ['2026-11-09 23:45'], '2026-11-10 00:01');
  prueba('a las 11:45 pm: a las 0:01 sigue abierta', r.cerrada === false);
  prueba('y el corte pasa a las 2:00', r.corte === ny('2026-11-10 02:00'), new Date(r.corte).toISOString());
  prueba('justo a las 11:30 también cuenta', noche('2026-11-09 15:00', ['2026-11-09 23:30'], '2026-11-10 00:01').cerrada === false);
  prueba('a las 11:29 ya no', noche('2026-11-09 15:00', ['2026-11-09 23:29'], '2026-11-10 00:01').cerrada === true);
  prueba('si nadie la toca después, a las 2:01 cerrada', noche('2026-11-09 15:00', ['2026-11-09 23:45'], '2026-11-10 02:01').cerrada === true);
}

grupo('mientras se siga usando antes de cada corte, se sigue recorriendo');
if (typeof C.empezar === 'function') {
  const r = noche('2026-11-09 15:00', ['2026-11-09 23:45', '2026-11-10 01:40'], '2026-11-10 02:01');
  prueba('usada 11:45 y 1:40: a las 2:01 abierta', r.cerrada === false);
  prueba('y el corte pasa a las 4:00', r.corte === ny('2026-11-10 04:00'));
  prueba('usada 11:45 y 1:00 (fuera de 1:30-2:00): a las 2:01 cerrada',
    noche('2026-11-09 15:00', ['2026-11-09 23:45', '2026-11-10 01:00'], '2026-11-10 02:01').cerrada === true);
}

grupo('auth.js usa esto y ya no cierra por inactividad');
{
  const auth = fs.readFileSync(path.join(RAIZ, 'src/auth.js'), 'utf8');
  prueba('sin el temporizador de 30 minutos', !/INACTIVITY_LIMIT_MS/.test(auth));
  prueba('usa BarStockSessionCutoff', /BarStockSessionCutoff/.test(auth));
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const i = html.indexOf('src/session-cutoff.js'), j = html.indexOf('src/auth.js');
  prueba('el módulo carga antes que auth.js', i > 0 && i < j);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
