#!/usr/bin/env node
/*
 * ── Ningún campo por debajo de 16px ──────────────────────────────────
 *
 * Safari en iOS hace zoom al enfocar un campo cuyo texto mida menos de
 * 16px. Y como la app bloquea el zoom, **no hay forma de volver**: la
 * pantalla se queda ampliada hasta que cierras la app.
 *
 * Ha pasado tres veces:
 *
 *   1. Dos campos de Ajustes, encontrados por casualidad.
 *   2. Los campos nuevos de Quick order, cazados al escribirlos.
 *   3. El buscador de emparejar una línea de factura, a 12,46px, con
 *      dos locaciones usando la app en vivo.
 *
 * Y había seis más a 15,96px —`--m-strong` es 14 × 1.14— que se
 * quedaban a cuatro centésimas de ser seguros. Entre ellos el buscador
 * principal.
 *
 * ── Por qué este test mira en dos sitios ────────────────────────────
 *
 * El escaneo obvio —buscar reglas cuyo selector diga `input`— se perdió
 * el que de verdad mordió, porque `.m-ibuscar` es una clase y no
 * menciona la palabra. Así que también se recorre el JS, se sacan las
 * clases de cada `<input>` y se miran ESAS reglas.
 *
 *   node tools/test-zoom-ios.js
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

const CSS = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// La escala, tal como está en :root de mobile-app.css. Si cambia allí
// y no aquí, los números de abajo dejan de valer — por eso se comprueba.
const BASE = 14;
const ESCALA = {
  '--m-meta': 0.79, '--m-small': 0.89, '--m-eyebrow': 0.89,
  '--m-body': 1, '--m-strong': 1.14, '--m-title': 1.36,
  '--m-head': 1.57, '--m-screen': 1.79, '--m-figure': 2.07
};

function px(valor) {
  const v = String(valor).trim();
  // `max(16px, …)` es la forma correcta: el suelo está puesto.
  if (/max\(\s*16px/.test(v)) return 99;
  const mv = /var\((--m-[a-z]+)\)/.exec(v);
  if (mv && ESCALA[mv[1]] !== undefined) {
    return BASE * ESCALA[mv[1]];
  }
  const mp = /^([\d.]+)px/.exec(v);
  return mp ? Number(mp[1]) : null;
}

function reglas() {
  const out = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(CSS))) out.push({ sel: m[1].trim(), cuerpo: m[2] });
  return out;
}
const TODAS = reglas();

function tamañoDe(filtro) {
  for (const r of TODAS) {
    if (!filtro(r.sel)) continue;
    const fs2 = /font-size:\s*([^;]+);/.exec(r.cuerpo);
    if (fs2) return { px: px(fs2[1]), valor: fs2[1].trim(), sel: r.sel };
  }
  return null;
}

grupo('la escala no ha cambiado por debajo de los pies');
{
  // 15,96 no es 16. Seis reglas se apoyaban en `--m-strong` creyendo
  // que bastaba, y les faltaban cuatro centésimas.
  const root = /:root\s*\{([^}]*)\}/.exec(CSS);
  prueba('--m-base sigue siendo 14px',
    !!root && /--m-base:\s*14px/.test(root[1]));
  prueba('y --m-strong sigue sin llegar a 16',
    BASE * ESCALA['--m-strong'] < 16,
    (BASE * ESCALA['--m-strong']).toFixed(2) + 'px');
}

grupo('ninguna regla de input baja de 16px');
{
  const malos = [];
  for (const r of TODAS) {
    if (!/\b(input|textarea|select)\b/.test(r.sel)) continue;
    const fs2 = /font-size:\s*([^;]+);/.exec(r.cuerpo);
    if (!fs2) continue;
    const n = px(fs2[1]);
    if (n !== null && n < 16) {
      malos.push(r.sel.replace(/\s+/g, ' ').slice(0, 54) + ' → ' + fs2[1].trim());
    }
  }
  prueba('por selector', malos.length === 0, malos.join(' | '));
}

grupo('ni las clases que el JS pone a un input');
{
  // ── El escaneo que faltaba ───────────────────────────────────────
  //
  // `.m-ibuscar` no dice "input" en su selector, así que el barrido de
  // arriba no lo veía. Es justo el que dejó la app ampliada sin
  // salida, emparejando una línea de factura con dos locaciones
  // dentro.
  const dir = path.join(RAIZ, 'src');
  const clases = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!/\.js$/.test(f)) continue;
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    const re = /<(input|textarea|select)\b[^>]*/g;
    let m;
    while ((m = re.exec(t))) {
      const c = /class="([^"$]*)/.exec(m[0]);
      if (!c) continue;
      for (const cl of c[1].split(/\s+/).filter(Boolean)) {
        if (!clases.has(cl)) clases.set(cl, new Set());
        clases.get(cl).add(f);
      }
    }
  }
  prueba('se encontraron clases que mirar', clases.size > 0, String(clases.size));

  const malos = [];
  for (const [cl, archivos] of clases) {
    const t = tamañoDe(sel => new RegExp('\\.' + cl.replace(/[-]/g, '\\-') + '\\b').test(sel));
    if (t && t.px !== null && t.px < 16) {
      malos.push('.' + cl + ' (' + t.px.toFixed(2) + 'px, ' +
                 Array.from(archivos).join(',') + ')');
    }
  }
  prueba('por clase', malos.length === 0, malos.join(' | '));
}

grupo('y el suelo se escribe siempre igual');
{
  // `max(16px, …)` y no un 16px pelado: así el campo sigue creciendo
  // con la preferencia de "Text size" del usuario en vez de quedarse
  // clavado.
  const sueltos = TODAS.filter(r =>
    /\b(input|textarea|select)\b/.test(r.sel) &&
    /font-size:\s*16px\s*;/.test(r.cuerpo));
  prueba('nadie clava un 16px pelado', sueltos.length === 0,
    sueltos.map(r => r.sel).join(' | '));
}

grupo('y NINGUNA hoja de estilos esconde otro campo pequeño');
{
  // Este test miraba SOLO `mobile-app.css`. Por eso se le escapó el
  // buscador de "Finish count", que vive en `count-panel.css` — la
  // hoja del escáner y del panel de botella, de lo más usado en el
  // teléfono.
  //
  // Ahora se barren todas. Los que ya estaban mal el día que se amplió
  // el barrido quedan en la lista de abajo: no se arreglan a ciegas
  // —varios son de escritorio y cambiarles el cuerpo mueve
  // maquetación— pero la lista NO PUEDE CRECER. Cualquier campo nuevo
  // por debajo de 16px hace fallar esto.
  const PENDIENTES = new Set([
    'add-to-order.css .ato-step input',
    'admin.css .adm-input',
    'app.css .history-controls-top input,.history-controls-top select',
    'app.css .vendor-code-row input[type="text"]',
    'app.css .bs-loc-select',
    'app.css .ac-row select',
    'app.css .lb-url input',
    'auth.css .auth-field input, .auth-field select',
    'auth.css .auth-field textarea',
    'consumption-match.css .cmr-note textarea',
    'cost-report.css .cr-cat-input > span',
    'cost-report.css .cr-cat-input.sm input',
    'cost-report.css .cr-section input, .cr-section textarea',
    'cost-report.css .cr-card-input input',
    'cost-report.css .cr-invoice-input::before',
    'cost-report.css .cr-target-input::after',
    'count-panel.css .bf-search input',
    'marginedge-match.css .mem-find input',
    'mobile.css .scan-toolbar select',
    'mobile.css .ac-row select',
    'mobile.css .lb-url input',
    'mobile.css .cr-card-input input',
    'scan-count.css .sc-assign input',
    'mobile.css .bs-loc-select',
    'mobile.css .cr-cat-input.sm input',
    'mobile.css .auth-field input, .auth-field select, .auth-field textarea'
  ]);

  const dir = path.join(RAIZ, 'styles');
  const nuevos = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.css')).sort()) {
    const css = fs.readFileSync(path.join(dir, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      const sel = m[1].trim().replace(/\s+/g, ' ');
      if (!/\b(input|textarea|select)\b/.test(sel)) continue;
      const fz = /font-size:\s*([^;]+);/.exec(m[2]);
      if (!fz) continue;
      const p = px(fz[1]);
      if (p >= 16) continue;
      const clave = f + ' ' + sel;
      if (PENDIENTES.has(clave)) continue;
      nuevos.push(clave + '  (' + Math.round(p * 100) / 100 + 'px)');
    }
  }

  prueba('ningún campo nuevo por debajo de 16px',
    nuevos.length === 0, nuevos.join('  |  '));

  // El que mordió hoy. Si vuelve a bajar, salta por su nombre.
  const cp = fs.readFileSync(path.join(RAIZ, 'styles/count-panel.css'), 'utf8');
  prueba('el buscador de "Finish count" tiene su suelo',
    /\.cf-missing input\{[^}]*max\(16px/s.test(cp));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
