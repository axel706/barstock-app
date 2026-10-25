#!/usr/bin/env node
/*
 * ── La pantalla del ciclo en el teléfono ─────────────────────────────
 *
 * Lo que hay que proteger aquí es UNA cosa, y es la que puede borrar
 * trabajo:
 *
 *   El botón de arriba hace lo que toca EN ESE PASO, y nada más.
 *
 * "Start" pone todo el on hand a cero. Si esta pantalla dedujera el
 * paso por su cuenta y se desfasara con weekly-cycle, acabaría
 * ofreciendo "Start" encima de un conteo ya hecho y el primer toque se
 * llevaría el trabajo del día. Por eso aquí el estado NO se calcula: se
 * pregunta. Estas pruebas fijan esa frontera.
 *
 * Lo demás —que los tres pasos se pinten siempre, que Reiniciar no
 * aparezca antes de tiempo— es legibilidad, pero se comprueba igual
 * porque son las dos cosas que se rompen al tocar el render.
 *
 *   node tools/test-cycle-screen.js
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

// `cycle` es lo que contesta weekly-cycle. Esta pantalla no deduce
// nada, asi que con eso basta para fijarla entera.
function pintar(cycle, extra) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;

  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.state = { master: new Array((extra && extra.items) || 270).fill(0).map((_, i) => ({ item: 'x' + i })) };

  w.__hecho = [];
  w.BarStockWeeklyCycle = Object.assign({
    estado: () => 'step1',
    resetAt: () => null,
    pausado: () => false,
    abandonado: () => false,
    quietoDesdeHace: () => null,
    edadCiclo: () => null,
    cicloViejo: () => false,
    hace: (ms) => Math.round(ms / 60000) + ' min',
    cuantoLleva: (ms) => Math.round(ms / 86400000) + ' days',
    fmtDate: () => 'Oct 20',
    accion: () => w.__hecho.push('accion'),
    reiniciar: () => w.__hecho.push('reiniciar'),
    descartarConteo: () => w.__hecho.push('descartar')
  }, cycle);
  w.confirm = () => (extra && extra.confirma === false ? false : true);

  if (extra && extra.contados != null) {
    w.BarStockCountSession = {
      exists: () => extra.contados > 0,
      size: () => extra.contados
    };
  }

  w.BarStockMobile = { register() {}, refrescarBadges() {} };

  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-cycle.js'), 'utf8'))();

  const host = w.document.createElement('div');
  host.className = 'm-screen on';
  host.dataset.screen = 'cycle';
  w.document.body.appendChild(host);
  w.BarStockMobileCycle.render(host);
  return { w, host };
}

const txt = (host, sel) => {
  const e = host.querySelector(sel);
  return e ? e.textContent.replace(/\s+/g, ' ').trim() : null;
};
const boton = (host) => txt(host, '#mcGo');

console.log('\ncada paso ofrece lo suyo y nada mas');
{
  // El de verdad peligroso: "Start" pone el inventario a cero.
  const a = pintar({ estado: () => 'step1' });
  eq('sin ciclo, se ofrece empezarlo', boton(a.host), 'Start');

  const b = pintar({ estado: () => 'step2', resetAt: () => '2026-10-20T00:00:00Z' });
  eq('con el ciclo abierto, cargar el conteo', boton(b.host), 'Load it');
  ok('y ya NO se ofrece poner a cero', boton(b.host) !== 'Start');

  const c = pintar({ estado: () => 'counting', resetAt: () => '2026-10-20T00:00:00Z' },
                   { contados: 112 });
  eq('contando, se ofrece seguir', boton(c.host), 'Keep counting');
  ok('y tampoco se ofrece poner a cero', boton(c.host) !== 'Start');

  const d = pintar({ estado: () => 'done', resetAt: () => '2026-10-20T00:00:00Z' });
  // Con el conteo hecho no hay accion principal: lo unico que queda es
  // reiniciar, y eso vive abajo, separado y en rojo.
  ok('terminado, arriba no hay ningun boton', !d.host.querySelector('#mcGo'));
}

console.log('\nel estado NO se deduce aqui');
{
  // Si weekly-cycle dice 'done', esta pantalla dice 'done', aunque el
  // resto de las señales parezcan otra cosa. Una segunda deduccion es
  // la forma segura de que un dia discrepen.
  const { host } = pintar({ estado: () => 'done', resetAt: () => '2026-10-20T00:00:00Z' },
                          { contados: 0 });
  ok('manda lo que contesta weekly-cycle', /Cycle open/i.test(host.textContent));
  ok('y no se inventa un paso 1', !/Start a new cycle/i.test(host.textContent));
}

console.log('\nla accion es la del escritorio, no una copia');
{
  const { w, host } = pintar({ estado: () => 'step1' });
  host.querySelector('#mcGo').click();
  eq('el boton llama a la misma funcion', w.__hecho, ['accion']);
}

console.log('\nreiniciar');
{
  const a = pintar({ estado: () => 'step1' });
  ok('no aparece sin ciclo abierto', !a.host.querySelector('#mcReset'));

  const b = pintar({ estado: () => 'step2', resetAt: () => '2026-10-20T00:00:00Z' });
  ok('ni con el ciclo recien abierto y sin contar', !b.host.querySelector('#mcReset'));

  const c = pintar({ estado: () => 'done', resetAt: () => '2026-10-20T00:00:00Z' });
  ok('si con el conteo hecho', !!c.host.querySelector('#mcReset'));
  ok('y avisa de lo que hace', /back to zero/i.test(c.host.textContent));

  const { w, host } = pintar({ estado: () => 'done', resetAt: () => '2026-10-20T00:00:00Z' });
  host.querySelector('#mcReset').click();
  eq('y usa el reinicio de siempre', w.__hecho, ['reiniciar']);
}

console.log('\ndescartar el conteo');
{
  // Antes esto solo se podia hacer por accidente: era el "Cancel" del
  // aviso que sale a los tres dias de abandono. Para tirar un conteo
  // pausado a proposito —empezaste mal, contaste la zona equivocada—
  // habia que esperar tres dias a que la app preguntara.
  const c = pintar({ estado: () => 'counting', resetAt: () => '2026-10-20T00:00:00Z',
                     pausado: () => true }, { contados: 112 });
  ok('contando, se puede descartar', !!c.host.querySelector('#mcDrop'));
  ok('y dice cuantas botellas se van', /112 bottles counted/i.test(c.host.textContent));
  // Lo que lo hace seguro: tirar el conteo NO tira la semana.
  ok('deja claro que el ciclo sigue abierto', /cycle stays open/i.test(c.host.textContent));
  ok('y no se mezcla con reiniciar el ciclo', !c.host.querySelector('#mcReset'));

  c.host.querySelector('#mcDrop').click();
  eq('usa el descarte de weekly-cycle', c.w.__hecho, ['descartar']);

  const no = pintar({ estado: () => 'counting', resetAt: () => '2026-10-20T00:00:00Z' },
                    { contados: 112, confirma: false });
  no.host.querySelector('#mcDrop').click();
  eq('y si dices que no, no pasa nada', no.w.__hecho, []);

  const d = pintar({ estado: () => 'done', resetAt: () => '2026-10-20T00:00:00Z' });
  ok('sin conteo abierto no hay nada que descartar', !d.host.querySelector('#mcDrop'));
}

console.log('\nlos tres pasos se pintan siempre');
{
  const { host } = pintar({ estado: () => 'step1' });
  eq('tres, aunque no hayas empezado', host.querySelectorAll('.m-cyc-s').length, 3);
  eq('y ninguno tachado', host.querySelectorAll('.m-cyc-s.on').length, 0);

  const b = pintar({ estado: () => 'counting', resetAt: () => '2026-10-20T00:00:00Z' },
                   { contados: 112 });
  eq('contando, el primero ya esta hecho', b.host.querySelectorAll('.m-cyc-s.on').length, 1);

  const c = pintar({ estado: () => 'done', resetAt: () => '2026-10-20T00:00:00Z' });
  eq('terminado, los dos primeros', c.host.querySelectorAll('.m-cyc-s.on').length, 2);
}

console.log('\npausado y abandonado no se parecen');
{
  const p = pintar({ estado: () => 'counting', resetAt: () => '2026-10-20T00:00:00Z',
                     pausado: () => true, quietoDesdeHace: () => 40 * 60000 },
                   { contados: 112 });
  ok('pausado lo dice, y desde cuando', /Paused 40 min ago/i.test(p.host.textContent));
  eq('y se retoma sin drama', boton(p.host), 'Keep counting');

  const a = pintar({ estado: () => 'counting', resetAt: () => '2026-10-20T00:00:00Z',
                     abandonado: () => true, quietoDesdeHace: () => 4 * 86400000 },
                   { contados: 112 });
  ok('abandonado avisa de que hay que decidir', /discard it/i.test(a.host.textContent));
  eq('y el boton cambia', boton(a.host), 'Pick it up');
}

console.log('\nsin datos no se miente');
{
  // Se entra antes de que weekly-cycle conteste. Decir "Start a new
  // cycle" ahi seria ofrecer poner a cero sin saber si hay algo.
  const { host } = pintar({ estado: () => 'loading' });
  ok('mientras carga no ofrece nada', !host.querySelector('#mcGo'));
  ok('y lo dice', /Checking/i.test(host.textContent));
}

console.log('\n' + (falla ? falla + ' FALLO(S)' : 'todo bien') + '   ·   ' + pasa + ' comprobaciones');
process.exit(falla ? 1 : 0);
