#!/usr/bin/env node
/*
 * ── El asistente de alta sale cuando hace falta ──────────────────────
 *
 * El asistente de conexión existe para una locación que NO está
 * conectada. Y se pintaba sólo en las que ya lo estaban.
 *
 * El motivo: `pintarCifras()` es lo único que lo monta, y estaba al
 * final de `pintarAccion()`, detrás del `return` de "sin restaurante
 * elegido". Una locación nueva no tiene restaurante elegido —ésa es
 * justo su situación— así que la función se iba antes de llegar.
 * Resultado: The Jockey Tavern, sin catálogo y sin conectar, no
 * enseñaba absolutamente nada.
 *
 * Es la TERCERA vez que este archivo tropieza con el mismo corte: sus
 * propios comentarios ya avisan dos veces de que los `onclick` van
 * antes de los returns. La regla era más amplia de lo que decía.
 *
 * Lo que se protege:
 *
 *   1. Sin restaurante elegido, el asistente se monta. Es su único
 *      motivo de existir.
 *   2. Con catálogo ya copiado, no: ahí estorba, y en su sitio van
 *      las cifras.
 *   3. Nada que decida QUÉ SE VE queda por debajo de ese corte.
 *
 *   node tools/test-asistente-alta.js
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

const src = fs.readFileSync(path.join(RAIZ, 'src/settings-integrations.js'), 'utf8');

grupo('lo que decide qué se ve va antes del corte');
{
  // El corte: `if (!unidad()) { cont.innerHTML = ''; return; }`. Todo
  // lo que pinte pantalla tiene que quedar POR ENCIMA.
  const cuerpo = /function pintarAccion\(\)\s*\{([\s\S]*?)\n  \}/.exec(src);
  prueba('la función existe', !!cuerpo);

  const t = cuerpo ? cuerpo[1] : '';
  const corte = t.indexOf("if (!unidad())");
  prueba('el corte sigue ahí', corte > 0);

  const antes = t.slice(0, corte);
  const despues = t.slice(corte);

  prueba('el asistente se monta antes', /pintarCifras\(\)/.test(antes),
    'pintarCifras es lo único que monta el asistente de conexión');
  prueba('y no después', !/pintarCifras\(\)/.test(despues));

  // Las otras dos del mismo bloque, por el mismo motivo: avisan de
  // cosas que no dependen de tener restaurante elegido.
  prueba('los avisos también', /pintarAtencion\(\)/.test(antes));
  prueba('y los ocultos', /pintarOcultos\(\)/.test(antes));

  // Lo que SÍ puede ir debajo: lo que de verdad necesita el
  // restaurante elegido.
  prueba('debajo sólo quedan los accesos', /meIrMatch/.test(despues));
}

grupo('el asistente depende del catálogo, no del restaurante');
{
  // Una locación puede tener restaurante elegido y quedarse a medias
  // —se cortó el catálogo— y entonces el asistente tiene que volver.
  // Y una sin restaurante lo necesita más que nadie.
  const t = /async function pintarCifras\(\)([\s\S]*?)\n  \}/.exec(src);
  prueba('pintarCifras existe', !!t);
  const cuerpo = t ? t[1] : '';
  prueba('decide por el catálogo', /sinCatalogo\s*=\s*prods === 0/.test(cuerpo),
    'no por unidad(), que es lo que lo escondía');
  prueba('y monta el asistente cuando no lo hay',
    /sinCatalogo\s*&&\s*C\s*\)\s*\{\s*C\.montar\(\)/.test(cuerpo));
}

grupo('sin id de locación no se queda en blanco a medias');
{
  // `pintarCifras` se va pronto si no resuelve la locación. Eso deja
  // las cifras vacías, que está bien — pero no puede dejar también el
  // asistente sin montar, porque entonces no hay NADA en pantalla y
  // una integración invisible es el fallo que este panel ya pagó una
  // vez.
  const t = /async function pintarCifras\(\)([\s\S]*?)\n  \}/.exec(src);
  const cuerpo = t ? t[1] : '';
  const salida = cuerpo.indexOf('if (!id)');
  const monta = cuerpo.indexOf('C.montar()');
  prueba('la salida temprana está', salida > 0);
  // Si algún día se quiere montar el asistente también sin id, esto
  // es lo que hay que mover. Por ahora se documenta dónde está.
  prueba('y el montaje viene después', monta > salida,
    'sin id tampoco hay catálogo que leer, así que no se puede decidir');
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
