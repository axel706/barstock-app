#!/usr/bin/env node
/*
 * ── La tarjeta y la ficha del teléfono, para el buscador del escritorio ──
 *
 * El buscador "Do we have" del escritorio (src/desk-search.js, Axel,
 * 2026-11-25, lámina A) pinta LAS MISMAS tarjetas y LA MISMA ficha que el
 * teléfono (product-hero.html, mobile-search.llenarFicha). Sus estilos
 * viven en styles/mobile-app.css, dentro de @media (max-width: 640px): en
 * el escritorio no existen.
 *
 * Copiarlos a mano sería el fallo número 1 del proyecto (lo mismo escrito
 * en dos sitios, y un día dejan de decir lo mismo). Así que se GENERAN:
 * este script toma de mobile-app.css las reglas de las clases de la
 * tarjeta y de la ficha, las cuelga de #dkBuscar (el panel del escritorio;
 * el id además le gana al radio que app.css fuerza en los <button>) y las
 * escribe en styles/desk-ficha.css. tools/test-buscador-escritorio.js lo
 * vuelve a generar y falla si el archivo no es igual: tocar la tarjeta del
 * teléfono sin regenerar no pasa la suite.
 *
 *   node tools/compartir-ficha.js           (escribe styles/desk-ficha.css)
 *   node tools/compartir-ficha.js --check   (sólo compara; sale 1 si difiere)
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

// Las clases de la tarjeta de resultado (product-hero), de su pie
// ("Tell the team it's low", el lápiz de check-shelf) y de la ficha
// (mobile-search.llenarFicha: zonas, ventas de Toast, semanas, Pour·IQ,
// filas y botones).
const CLASES = [
  'm-fic', 'm-bot', 'm-dad', 'm-live', 'm-low', 'm-res', 'm-card', 'm-rows', 'm-row',
  'm-acts', 'm-act', 'm-zon', 'm-vt', 'm-ts-b', 'm-ts-d', 'm-ts-g', 'm-iqb',
  'm-fuente', 'm-soft', 'm-nada', 'm-cnt', 'm-empty', 'm-out'
];
const reClase = new RegExp('\\.(' + CLASES.map(c => c.replace(/-/g, '\\-')).join('|') + ')(?![A-Za-z0-9_])|\\.(' +
  CLASES.map(c => c.replace(/-/g, '\\-')).join('|') + ')-[A-Za-z0-9_-]+');

// Lo que en el teléfono acota una regla a su armazón; en el escritorio lo
// sustituye #dkBuscar.
const ARMAZON = [
  /^body\.m-shell(\.[\w-]+)*\s+/, /^:is\(#mScreens,\s*#mSheet\)\s+/, /^:is\(#mSheet,\s*#mScreens\)\s+/,
  /^:is\([^)]*\)\s+/, /^#mScreens\s+/, /^#mSheet\s+/, /^\.m-screen(\[[^\]]*\])?\s+/, /^\.m-sheet-box(\.[\w-]+)*\s+/
];

function trozos(css) {
  // Devuelve las reglas planas de dentro de los bloques @media (max-width: 640px).
  const out = [];
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /@media\s*\(max-width:\s*640px\)\s*\{/g;
  let m;
  while ((m = re.exec(limpio))) {
    let i = m.index + m[0].length, prof = 1, ini = i;
    const cuerpo = [];
    // Recorre el bloque y saca cada regla de primer nivel.
    let sel = '', j = i;
    while (i < limpio.length && prof > 0) {
      const ch = limpio[i];
      if (ch === '{') {
        if (prof === 1) { sel = limpio.slice(j, i).trim(); ini = i + 1; }
        prof++;
      } else if (ch === '}') {
        prof--;
        if (prof === 1) { cuerpo.push({ sel, decl: limpio.slice(ini, i) }); j = i + 1; }
      }
      i++;
    }
    out.push(...cuerpo);
  }
  return out;
}

// Running out (desk-running-out.js, lámina A del 2026-11-25): la pantalla
// de revisión del teléfono (mobile-running-out.js) dentro de su sección,
// en #dkRo. Todas sus clases empiezan por m-ro-; el contenedor del
// teléfono (.m-ro, fijo a pantalla completa) no entra: en el escritorio
// es .m-ro-dk, dentro de la sección.
const reRo = /\.m-ro-[A-Za-z0-9_-]+/;

// Las ventas de Toast del Home (desk-home.js, lámina A del 2026-11-25): la
// tarjeta del teléfono (mobile-home.ventas) en #dkVentas. Sus clases son
// m-ts y m-ts-*.
const reTs = /\.m-ts(?![A-Za-z0-9_-])|\.m-ts-[A-Za-z0-9_-]+/;

// El teclado numérico de ✎ Check the shelf y 📣 Tell the team it's low
// (num-pad.js): una hoja #mSheet colgada del body, con sus clases m-kp.
// Y la hoja de "All products" / "Full report" (mobile-sales.js), que en el
// escritorio sale en la misma ventana centrada: m-vl, su buscador
// (m-searchbar) y la leyenda de licor y vino (m-ts-ley).
const TECLADO = ['m-sheet', 'm-kp', 'm-ro-b', 'm-ro-go', 'm-vl', 'm-searchbar', 'm-ts-ley'];
const reTeclado = new RegExp('\\.(' + TECLADO.map(c => c.replace(/-/g, '\\-')).join('|') + ')(?![A-Za-z0-9_])|\\.(' +
  TECLADO.map(c => c.replace(/-/g, '\\-')).join('|') + ')-[A-Za-z0-9_-]+');

function partir(sel) {
  // Por comas de primer nivel: un :is(a, b) no se parte.
  const out = [];
  let prof = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(') prof++;
    if (ch === ')') prof--;
    if (ch === ',' && prof === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Para el teclado: lo del armazón del teléfono pasa a ser del escritorio
// (body.dk) y la hoja conserva su id.
function aTeclado(s) {
  if (!reTeclado.test(s)) return null;
  if (/m-txt-|bs-guest|bs-sin-|m-on\b|fondo-vivo|m-ficha|m-cfh|m-nf|m-tl|m-ed|m-tbs/.test(s)) return null;
  // El buscador del teléfono en sus pantallas (acoplado, de cristal): no es
  // el de la hoja.
  if (/#mScreens|#mDock|m-vidrio|m-dock/.test(s)) return null;
  s = s.replace(/^body\.m-shell\s+:where\([^)]*\)\s+/, 'body.dk #mSheet ')
       .replace(/^body\.m-shell(\.[\w-]+)*\s+/, 'body.dk ')
       .replace(/^:is\(#mScreens,\s*#mSheet\)\s+/, 'body.dk #mSheet ')
       .replace(/^:is\(#mSheet,\s*#mScreens\)\s+/, 'body.dk #mSheet ');
  if (/^:is\(|^#mScreens|^\.m-screen/.test(s)) return null;
  // Lo que sigue hablando del armazón del teléfono no es de la hoja.
  if (/m-shell|\.m-screens|\.m-tabs/.test(s)) return null;
  // La hoja misma (.m-sheet, .m-sheet-box…) cuelga del body; lo de dentro
  // (el teclado, la lista, su buscador), de la hoja: así no puede tocar
  // nada más del escritorio que se llame igual.
  if (!/^body\.dk/.test(s)) s = 'body.dk ' + s;
  if (!/^body\.dk (#mSheet|\.m-sheet)/.test(s)) s = s.replace(/^body\.dk /, 'body.dk #mSheet ');
  return s;
}

function generar() {
  const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8');
  const reglas = [], teclado = [], ro = [], ts = [];
  for (const r of trozos(css)) {
    if (!r.sel || r.sel.startsWith('@')) continue;          // las @media de dentro (reducir movimiento) se quedan fuera
    if (/\{/.test(r.decl)) continue;                          // nada anidado
    const partes = r.sel.split(',').map(s => s.trim()).filter(Boolean);
    // Selectores con paréntesis (:is(a, b)) se partirían mal por la coma:
    // se rehacen respetando paréntesis.
    const sel = [];
    let prof = 0, cur = '';
    for (const ch of r.sel) {
      if (ch === '(') prof++;
      if (ch === ')') prof--;
      if (ch === ',' && prof === 0) { sel.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) sel.push(cur.trim());
    const nuevos = [], deRo = [], deTs = [];
    for (let s of sel) {
      if (reTs.test(s) && !/:has\(|m-txt-|bs-guest|bs-sin-|fondo-vivo|m-vl/.test(s)) {
        let t = s, q = true;
        while (q) { q = false; for (const a of ARMAZON) { if (a.test(t)) { t = t.replace(a, ''); q = true; } } }
        if (!/^(html|body)\b/.test(t)) deTs.push('#dkVentas ' + t);
      }
      if (reRo.test(s) && !/:has\(|m-txt-|bs-guest|bs-sin-|fondo-vivo/.test(s)) {
        let t = s, q = true;
        while (q) { q = false; for (const a of ARMAZON) { if (a.test(t)) { t = t.replace(a, ''); q = true; } } }
        if (!/^(html|body)\b/.test(t)) deRo.push('#dkRo ' + t);
      }
      if (!reClase.test(s)) continue;
      // Lo que depende del tamaño de letra del teléfono o del modo invitado
      // no aplica en el escritorio.
      if (/m-txt-|bs-guest|bs-sin-|m-on\b|fondo-vivo/.test(s)) continue;
      let quitado = true;
      while (quitado) {
        quitado = false;
        for (const a of ARMAZON) {
          if (a.test(s)) { s = s.replace(a, ''); quitado = true; }
        }
      }
      if (/^(html|body)\b/.test(s)) continue;               // otras raíces: no son de la ficha
      // La misma ficha vive en el buscador (#dkBuscar) y en el panel del
      // producto de Inventory (#dkiPanel, desk-inventory.js).
      nuevos.push('#dkBuscar ' + s, '#dkiPanel ' + s);
    }
    const decl = r.decl.split(';').map(d => d.trim()).filter(Boolean).map(d => '    ' + d + ';').join('\n');
    if (!decl) continue;
    if (nuevos.length) reglas.push('  ' + nuevos.join(',\n  ') + ' {\n' + decl + '\n  }');
    if (deRo.length) ro.push('  ' + deRo.join(',\n  ') + ' {\n' + decl + '\n  }');
    if (deTs.length) ts.push('  ' + deTs.join(',\n  ') + ' {\n' + decl + '\n  }');
    const tec = sel.map(aTeclado).filter(Boolean);
    if (tec.length) teclado.push('  ' + tec.join(',\n  ') + ' {\n' + decl + '\n  }');
  }
  return '/* GENERADO por tools/compartir-ficha.js desde styles/mobile-app.css.\n' +
    ' * No se edita a mano: se cambia la regla del teléfono y se vuelve a correr\n' +
    ' * `node tools/compartir-ficha.js`. test-buscador-escritorio falla si no\n' +
    ' * está al día. Son la tarjeta y la ficha de "Do we have", colgadas del\n' +
    ' * panel del buscador del escritorio (#dkBuscar) y del producto de\n' +
    ' * Inventory (#dkiPanel), y la pantalla de\n' +
    ' * Running out, en su sección (#dkRo), y las ventas de Toast del Home\n' +
    ' * (#dkVentas). */\n' +
    '@media (min-width: 641px) {\n' + reglas.join('\n') + '\n\n' +
    '  /* Running out (mobile-running-out.js), en la sección del escritorio. */\n' +
    ro.join('\n') + '\n\n' +
    '  /* Las ventas de Toast (mobile-home.ventas), en el Home del escritorio. */\n' +
    ts.join('\n') + '\n\n' +
    '  /* El teclado numérico (num-pad.js), en la hoja #mSheet del body. */\n' +
    teclado.join('\n') + '\n}\n';
}

const DESTINO = path.join(RAIZ, 'styles/desk-ficha.css');
if (require.main === module) {
  const nuevo = generar();
  if (process.argv.includes('--check')) {
    const viejo = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf8') : '';
    if (viejo !== nuevo) { console.log('styles/desk-ficha.css no está al día: node tools/compartir-ficha.js'); process.exit(1); }
    console.log('al día');
  } else {
    fs.writeFileSync(DESTINO, nuevo);
    console.log('escrito ' + path.relative(RAIZ, DESTINO) + ' · ' + (nuevo.match(/\{\n/g) || []).length + ' reglas');
  }
}
module.exports = { generar, DESTINO };
