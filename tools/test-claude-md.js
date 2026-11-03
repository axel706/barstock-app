#!/usr/bin/env node
/*
 * ── Que CLAUDE.md no envejezca mal ──────────────────────────────────
 *
 * CLAUDE.md es lo que lee una sesion que arranca en frio —en la nube,
 * en otra maquina, dentro de un mes— y es lo unico que la separa de
 * repetir los errores que ya costaron caro.
 *
 * Pero es un documento, y los documentos mienten en cuanto el codigo
 * se mueve. Un comentario que dice lo contrario del codigo es el
 * fallo numero dos de su propia lista; seria ridiculo que el archivo
 * que lo enumera fuera el que lo comete.
 *
 * Asi que aqui no se comprueba la prosa. Se comprueban los NUMEROS y
 * las afirmaciones concretas, las que se pueden contrastar contra el
 * repo:
 *
 *   node tools/test-claude-md.js
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

const md = fs.readFileSync(path.join(RAIZ, 'CLAUDE.md'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));

// El numero que aparece justo antes de una frase. El documento va
// ajustado a 76 columnas, asi que la frase puede partirse en dos
// lineas: los espacios de la busqueda valen por cualquier blanco,
// salto incluido.
function cifraAntesDe(frase) {
  const pat = frase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  const m = md.match(new RegExp('(\\d+)\\s+' + pat));
  return m ? Number(m[1]) : null;
}

(() => {

grupo('existe y se carga solo');
{
  prueba('CLAUDE.md esta en la raiz', fs.existsSync(path.join(RAIZ, 'CLAUDE.md')));
  prueba('y no esta ignorado por git',
    !/^CLAUDE\.md$/m.test(fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8')));
}

grupo('los numeros cuadran con el repo');
{
  const suites = (pkg.scripts.test.match(/node tools\/test-/g) || []).length;
  prueba('las suites que dice son las que hay',
    cifraAntesDe('suites') === suites,
    cifraAntesDe('suites') + ' en el doc vs ' + suites + ' en package.json');

  const api = fs.readdirSync(path.join(RAIZ, 'api')).filter(f => f.endsWith('.js')).length;
  prueba('las funciones de api tambien',
    cifraAntesDe('funciones en `api/`') === api,
    cifraAntesDe('funciones en `api/`') + ' vs ' + api);
  // El tope de Vercel. Si se llega a 12, esto avisa antes que Vercel.
  prueba('y todavia caben', api < 12, api + ' de 12');

  const src = fs.readdirSync(path.join(RAIZ, 'src')).filter(f => f.endsWith('.js')).length;
  const dice = (md.match(/~(\d+) m[oó]dulos/) || [])[1];
  prueba('los modulos, con su tilde de aproximado',
    dice && Math.abs(Number(dice) - src) <= 3, dice + ' vs ' + src);

  const css = fs.readdirSync(path.join(RAIZ, 'styles')).filter(f => f.endsWith('.css')).length;
  prueba('y las hojas de estilo',
    cifraAntesDe('hojas en') === css, cifraAntesDe('hojas en') + ' vs ' + css);
}

grupo('las trampas que describe siguen siendo ciertas');
{
  // Si alguna deja de serlo, el doc manda a protegerse de algo que ya
  // no existe, que es tan malo como no avisar.
  const app = fs.readFileSync(path.join(RAIZ, 'styles/app.css'), 'utf8');
  prueba('app.css sigue forzando el radio de pastilla',
    /border-radius:\s*999px\s*!important/.test(app));

  const mob = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8');
  prueba('la escala sigue colgando de --m-base', /--m-base:\s*14px/.test(mob));
  prueba('y el prefijo de ID sigue siendo el truco',
    /:is\(#mScreens, #mTabs, #mBand, #mSheet\)/.test(mob));

  const inv = fs.readFileSync(path.join(RAIZ, 'src/inventory-cloud.js'), 'utf8');
  prueba('replaceInventoryMaster sigue existiendo',
    /function replaceInventoryMaster/.test(inv));

  const w = fs.readFileSync(path.join(RAIZ, 'src/product-weeks.js'), 'utf8');
  prueba('el tope del par sigue siendo 2', /const TOPE = 2;/.test(w));
}

grupo('las herramientas que menciona existen');
{
  for (const t of ['diagnostico-waiting.js', 'forense.js', 'existe.js', 'ensayo-auto.js']) {
    prueba(t, fs.existsSync(path.join(RAIZ, 'tools', t)));
  }
}

grupo('y no se le escapa ninguna credencial');
{
  // El repo es publico. Un ejemplo copiado de una clave real dentro
  // del documento que explica que nunca se ponen claves seria el
  // final perfecto.
  prueba('ninguna clave de Supabase', !/eyJ[A-Za-z0-9_-]{20,}/.test(md));
  prueba('ningun secreto con pinta de tal',
    !/(client_secret|api[_-]?key|password)\s*[:=]\s*["'][^"']{8,}/i.test(md));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
