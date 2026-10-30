#!/usr/bin/env node
/*
 * ── La plantilla de las tarjetas del carrusel ────────────────────────
 *
 * Las cuatro tarjetas del Home median distinto porque cada tipo de
 * contenido traia su propio alto de fila: la linea de tiempo uno, las
 * filas de una orden otro, y el indice de proveedores el DOBLE, porque
 * cada proveedor llevaba una barra de progreso debajo del nombre y un
 * chevron redondo de 30px al lado.
 *
 * Como el carril estira todas a la mas alta, la tarjeta de cuatro
 * proveedores agrandaba el Home entero.
 *
 * ── La regla, y por que esta escrita asi ────────────────────────────
 *
 * Lo que se clava es el CUERPO: tres renglones del mismo alto. NO el
 * total de la tarjeta.
 *
 * Clavar el total parece lo obvio y es una trampa: obliga a que la
 * suma de encabezado + titulo + cuerpo + pie quepa exacta en ese
 * numero, y esa suma depende de la altura de linea real de la fuente y
 * del ajuste de "Text size". Pasarse por dos pixeles recorta los
 * BOTONES, y eso se descubre en el telefono.
 *
 * Fijando solo el cuerpo todas las tarjetas miden lo mismo sin que
 * nadie escriba cuanto, porque todas tienen las mismas partes.
 *
 * Esta prueba vigila las seis cosas que lo sostienen:
 *
 *   1. El cuerpo mide exactamente 3 renglones.
 *   2. NO hay un alto total escrito a mano.
 *   3. El cuerpo recupera los 82px de la columna de la cifra, o lo
 *      alineado a la derecha se para antes del borde.
 *   4. Ninguna fila lleva divisoria: parecia papel de libreta.
 *   5. Las barras de progreso de proveedor no vuelven.
 *   6. Ninguna tarjeta emite `mas` Y `vs` a la vez: son dos lineas de
 *      pie donde solo cabe una.
 *
 *   node tools/test-plantilla-tarjeta.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const css = leer('styles/mobile-app.css');
const js = leer('src/mobile-home.js');

// Los comentarios de estas hojas hablan de pixeles al explicar de
// donde sale cada decision. Se quitan antes de buscar.
const cssLimpio = css.replace(/\/\*[\s\S]*?\*\//g, '');
const jsLimpio = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

// El selector va anclado al principio de su línea. Sin eso, buscar
// `.m-hero` encontraba primero `.m-rail > .m-hero`, que es otra regla
// y no lleva nada de lo que esta prueba busca.
const regla = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^\\s*' + esc + '\\s*\\{([^}]*)\\}', 'm');
  const m = re.exec(cssLimpio);
  return m ? m[1] : null;
};

grupo('el cuerpo mide tres renglones');
{
  const r = regla('.m-hero-cuerpo');
  prueba('la regla existe', !!r);

  prueba('su alto son 3 renglones',
    !!r && /height:\s*calc\(var\(--m-ren\)\s*\*\s*3\)/.test(r), (r || '').trim());

  // Si se desborda, mejor perder una fila que descuadrar el carril.
  prueba('recorta lo que sobre', !!r && /overflow:\s*hidden/.test(r));

  const hero = regla('.m-hero');
  prueba('el renglón sigue al ajuste de Text size',
    !!hero && /--m-ren:\s*calc\(var\(--m-base\)/.test(hero),
    'si va en px fijos, subir el texto aprieta las filas');
}

grupo('el total NO está escrito a mano');
{
  const hero = regla('.m-hero');
  prueba('la regla existe', !!hero);

  // Este es el error que esta prueba existe para impedir. Un alto
  // total en px obliga a que la suma de las partes quepa exacta, y
  // esa suma depende de la fuente. Dos pixeles de error = botones
  // recortados.
  prueba('sin height en píxeles',
    !!hero && !/(^|[^-\w])height:\s*\d+px/.test(hero), (hero || '').trim());
  prueba('tampoco una variable de alto total',
    !/--m-card-h/.test(cssLimpio));

  // Lo que SÍ iguala las tarjetas sin botones con las demás.
  const acts = regla('.m-hero-acts');
  prueba('el pie reserva su altura aunque no haya botones',
    !!acts && /min-height:/.test(acts), (acts || '').trim());
  prueba('y se pega al suelo de la tarjeta',
    !!acts && /margin-top:\s*auto/.test(acts));
}

grupo('el cuerpo llega al borde de la tarjeta');
{
  const r = regla('.m-hero-cuerpo');
  // La columna de la cifra reserva 82px en TODA la altura y debajo de
  // la cifra no los usa nadie. Sin recuperarlos, "out", "8.4/wk" y
  // "no price" se paran 82px antes del borde.
  prueba('recupera la columna de la cifra',
    !!r && /margin-right:\s*-8[02]px/.test(r), (r || '').trim());

  // Prosa no: una frase no es una tabla de dos columnas.
  prueba('la prosa no se desplaza',
    /\.m-hero-cuerpo\.es-prosa\s*\{[^}]*margin-right:\s*0/.test(cssLimpio));

  prueba('izquierda crece y recorta',
    /\.m-hero-cuerpo \.izq\s*\{[^}]*flex:\s*1[^}]*min-width:\s*0/.test(cssLimpio));
  prueba('derecha nunca encoge',
    /\.m-hero-cuerpo \.der\s*\{[^}]*flex:\s*0 0 auto/.test(cssLimpio));
}

grupo('las filas no parecen papel de libreta');
{
  prueba('las de una orden no llevan divisoria',
    /\.m-hero-ln \.m-hln \+ \.m-hln\s*\{\s*border-top:\s*0/.test(cssLimpio));
  prueba('las de proveedor tampoco',
    /\.m-hpv \+ \.m-hpv\s*\{\s*border-top:\s*0/.test(cssLimpio));

  // Todas las filas al mismo alto, que es lo que hace que tres sean
  // tres en cualquier tarjeta.
  for (const [q, sel] of [['una orden', '.m-hero-ln .m-hln'],
                          ['la línea de tiempo', '.m-hero-tl li'],
                          ['un proveedor', 'body.m-shell .m-hpv'],
                          ['la lista', '.m-hero-list > span']]) {
    const r = regla(sel);
    prueba('la fila de ' + q + ' mide un renglón',
      !!r && /height:\s*var\(--m-ren\)/.test(r), (r || '(sin regla)').trim().slice(0, 70));
  }
}

grupo('las barras de proveedor no vuelven');
{
  // Comparaban a los proveedores entre si, y eso no es una carrera:
  // el primero siempre llenaba la barra. Costaban el doble de alto
  // para no anadir una lectura.
  prueba('no hay barra en el CSS', !/\.m-hpv \.bar/.test(cssLimpio));
  prueba('ni se pinta en el HTML', !/class="bar"/.test(jsLimpio));
  prueba('ni se calcula el porcentaje', !/pct:\s*Math\.round\(x\.btl/.test(jsLimpio));

  // El chevron es un indicio, no un boton aparte.
  prueba('el chevron ya no es un círculo de 30px',
    !/\.m-hpv \.chev\s*\{[^}]*(30px|border-radius)/.test(cssLimpio));
}

grupo('el pie es una sola línea');
{
  // `mas` va entre el cuerpo y el pie; `vs` va dentro del pie. Las dos
  // a la vez son dos renglones donde solo cabe uno: antes la tarjeta
  // crecia y ya, ahora se comeria los botones.
  const tarjetas = jsLimpio.split(/\breturn Object\.assign\(base,|\bt\.push\(\{/);
  let conAmbas = [];
  tarjetas.forEach((t, i) => {
    const m = /mas:\s*(''|"")/.test(t);
    const tieneMas = /mas:\s*[^'"\s]/.test(t) || (/mas:\s*'[^']+'/.test(t));
    if (tieneMas && !m && /vs:\s*/.test(t)) conAmbas.push(i);
  });
  prueba('ninguna tarjeta emite `mas` y `vs` a la vez',
    conAmbas.length === 0, conAmbas.length + ' tarjetas');

  prueba('la de varios proveedores cuenta el resto en el pie',
    /vs:\s*\(v\.length > 3 \? 'and ' \+ \(v\.length - 3\) \+ ' more · ' : ''\) \+ pie/.test(jsLimpio));
}

grupo('tres filas donde antes cabían dos');
{
  prueba('Running out muestra 3', /const CUANTAS = 3;/.test(jsLimpio));
  prueba('una orden muestra 3', /u\.filas\.slice\(0, 3\)/.test(jsLimpio));
  prueba('y el pie cuenta a partir de la tercera',
    /u\.filas\.length > 3/.test(jsLimpio));
  prueba('proveedores sigue en 3', /v\.slice\(0, 3\)/.test(jsLimpio));
}

grupo('el cuerpo es un solo contenedor');
{
  // Que el alto viva en UN sitio es lo que impide que esto se vuelva
  // a desparramar.
  prueba('pintarTarjeta lo envuelve', /class="m-hero-cuerpo/.test(js));
  prueba('la prosa se marca aparte', /es-prosa/.test(js));

  // El margen de cada trozo lo pone el contenedor; tenerlo tambien
  // dentro lo sumaba dos veces.
  prueba('las filas no añaden margen propio',
    /\.m-hero-ln, \.m-hero-pv\s*\{\s*margin:\s*0/.test(cssLimpio));
  prueba('la línea de tiempo tampoco',
    /\.m-hero-tl\s*\{\s*margin:\s*0/.test(cssLimpio));
}

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
