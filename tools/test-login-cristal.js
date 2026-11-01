#!/usr/bin/env node
/*
 * ── El cristal del login, UNA capa ──────────────────────────────────
 *
 * En el teléfono se veían dos rayas finas en la tarjeta de entrada: una
 * por todo el borde izquierdo y otra en la esquina superior derecha.
 *
 * La causa: `#authCardBrand` y `#authCardBody` pintaban cada uno su
 * propio cristal —mismo `background`, mismo `border`, mismo
 * `box-shadow` interior y su propio `backdrop-filter`— y se unían
 * quitando el borde que se tocaba.
 *
 * Dos `backdrop-filter` hermanos son dos capas de desenfoque
 * independientes: cada una muestrea el fondo por su cuenta, así que en
 * la juntura queda costura, y contra el borde redondeado del padre el
 * desenfoque no llega al último subpíxel y el fondo se cuela como una
 * raya clara.
 *
 * Los dos lados eran idénticos en los dos temas. Nunca fueron dos
 * superficies: eran una, dibujada dos veces.
 *
 * Lo que se protege:
 *
 *   1. El cristal lo pinta SÓLO #authCard.
 *   2. Los hijos no vuelven a tener fondo, borde ni desenfoque.
 *   3. El color del borde está en una variable, no repetido por tema.
 *   4. Ya no hay malabar de bordes en la media query del móvil.
 *
 *   node tools/test-login-cristal.js
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

const auth = fs.readFileSync(path.join(RAIZ, 'styles/auth.css'), 'utf8');
const movil = fs.readFileSync(path.join(RAIZ, 'styles/mobile.css'), 'utf8');

// El cuerpo de una regla, por su selector exacto.
function bloque(css, selector) {
  const re = new RegExp('(^|[\\n}])\\s*' +
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm');
  const m = re.exec(css);
  return m ? m[2] : null;
}

grupo('el cristal vive en el contenedor');
{
  const card = bloque(auth, '#authCard');
  prueba('#authCard existe', !!card);
  prueba('y lleva el fondo', /background:/.test(card), card);
  prueba('el borde', /border:\s*1px solid/.test(card));
  prueba('el brillo interior', /inset 0 1px 0/.test(card));
  prueba('y el desenfoque', /backdrop-filter:/.test(card));
}

grupo('los hijos sólo colocan contenido');
{
  for (const sel of ['#authCardBrand', '#authCardBody']) {
    const b = bloque(auth, sel);
    prueba(sel + ' existe', !!b);
    prueba(sel + ' sin fondo',      !/background/.test(b), b);
    prueba(sel + ' sin borde',      !/border(?!-radius)/.test(b), b);
    prueba(sel + ' sin desenfoque', !/backdrop-filter/.test(b), b);
    prueba(sel + ' sin sombra',     !/box-shadow/.test(b), b);
  }
}

grupo('y no vuelve a haber un segundo backdrop-filter en la tarjeta');
{
  // Cualquier hijo con su propio desenfoque reabre el mismo fallo.
  const hijos = (auth.match(/#authCard\w+[^{]*\{[^}]*backdrop-filter[^}]*\}/g) || []);
  prueba('ningún #authCard* hijo lo lleva', hijos.length === 0, hijos.join(' / '));
}

grupo('el color del borde está en una variable, no repetido por tema');
{
  prueba('se define --auth-linea', /--auth-linea:/.test(auth));
  prueba('y el borde la usa', /border:\s*1px solid var\(--auth-linea\)/.test(auth));
  // El tema claro cambia la variable, no tres reglas con tres valores.
  const claro = bloque(auth, 'body.light #authCard');
  prueba('body.light sólo redefine variables', !!claro && !/border:|background:\s*rgba/.test(claro), claro);
}

grupo('la media query del móvil ya no hace malabares con los bordes');
{
  prueba('nada de border-right-style en la marca',
    !/#authCardBrand\s*\{[^}]*border-right-style/.test(movil));
  prueba('nada de border-left-style en el cuerpo',
    !/#authCardBody\s*\{[^}]*border-left-style/.test(movil));
  // La raya bajo la marca sí se queda, pero pedida a propósito y con
  // la variable, no de rebote del box-shadow del cuerpo.
  prueba('la raya bajo la marca se pide con la variable',
    /#authCardBody\s*\{[^}]*border-top:\s*1px solid var\(--auth-linea\)/.test(movil));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
