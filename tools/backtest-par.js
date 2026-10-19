#!/usr/bin/env node
/*
 * ── ¿Qué promedio predice mejor la semana que viene? ─────────────────
 *
 * El par sale de un promedio de consumo. Hoy ese promedio mira TODO el
 * historial con el mismo peso, y por eso un producto que despega tarda
 * meses en reflejarse: diez semanas de 0.5 pesan más que dos de 6.
 *
 * Esto lo mide en vez de opinarlo. Para cada producto y cada semana se
 * calcula el par con lo que se sabía hasta la semana ANTERIOR, y se
 * compara contra lo que de verdad se consumió:
 *
 *   quiebre   el par no alcanzó  →  te quedaste sin producto
 *   sobrante  cuánto sobró       →  dinero parado en el estante
 *
 *   node tools/backtest-par.js <csv>
 *
 * El CSV sale de Supabase: una fila por producto, con la serie de
 * consumo semanal separada por "|".
 */

const fs = require('fs');

const med = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd  = a => { const m = med(a); return Math.sqrt(med(a.map(v => (v - m) ** 2))); };

// Media y desviación ponderadas: la semana pasada pesa mucho, la de hace
// dos meses casi nada, pero sigue contando. Las DOS tienen que ponderar
// igual, o las dos mitades de la fórmula del par hablan de épocas
// distintas y el resultado no significa nada.
function ewma(a, al) { let s = a[0]; for (let i = 1; i < a.length; i++) s = al * a[i] + (1 - al) * s; return s; }
function ewmsd(a, al) {
  let m = a[0], v = 0;
  for (let i = 1; i < a.length; i++) { const d = a[i] - m; m = al * a[i] + (1 - al) * m; v = al * d * d + (1 - al) * v; }
  return Math.sqrt(v);
}

// La fórmula real de la app.
const par = (avg, dev) => Math.ceil(Math.max(avg * 1.35, avg + 1.28 * dev));

const metodos = {
  'todo el historial': a => par(med(a), sd(a)),
  'ultimas 4':         a => { const u = a.slice(-4); return par(med(u), sd(u)); },
  'ultimas 8':         a => { const u = a.slice(-8); return par(med(u), sd(u)); },
  'ewma 0.2':          a => par(ewma(a, 0.2), ewmsd(a, 0.2)),
  'ewma 0.3':          a => par(ewma(a, 0.3), ewmsd(a, 0.3)),
  'ewma 0.4':          a => par(ewma(a, 0.4), ewmsd(a, 0.4)),
  'ewma 0.5':          a => par(ewma(a, 0.5), ewmsd(a, 0.5)),
};

// ── Leer el CSV ──────────────────────────────────────────────────────
//
// Parseo de verdad y no una expresion regular: los nombres llevan comas
// ("Jack Daniel's, Old No. 7") y comillas, y una regex hecha a ojo se
// comio 85 de 86 filas en silencio — dando un veredicto sobre UN
// producto como si fueran todos.
function parseCSV(txt) {
  const out = []; let fila = [], campo = '', dentro = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (dentro) {
      if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else dentro = false; }
      else campo += c;
    } else if (c === '"') dentro = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); out.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || fila.length) { fila.push(campo); out.push(fila); }
  return out;
}

const todo = parseCSV(fs.readFileSync(process.argv[2], 'utf8').trim());
const cab = todo[0].map(h => h.trim());
const iN = cab.indexOf('item_name'), iS = cab.indexOf('serie');
if (iN < 0 || iS < 0) { console.error('faltan columnas item_name/serie'); process.exit(2); }

const filas = [];
for (const f of todo.slice(1)) {
  if (!f[iS]) continue;
  // Un consumo negativo significa que entro mercancia sin registrar. No
  // es consumo: se acota a cero, igual que hace el par.
  const serie = f[iS].split('|').map(v => Math.max(0, Number(v) || 0));
  if (serie.length) filas.push({ nombre: f[iN], serie });
}
if (filas.length < todo.length - 2) {
  console.warn('OJO: se leyeron ' + filas.length + ' de ' + (todo.length - 1) + ' filas');
}

const MIN = 6;   // no se juzga a nadie sin algo de historia
const tot = {};
for (const n of Object.keys(metodos)) tot[n] = { q: 0, c: 0, s: 0, sobreQ: 0 };

for (const { serie } of filas) {
  for (let t = MIN; t < serie.length; t++) {
    const hasta = serie.slice(0, t), real = serie[t];
    for (const [mn, fn] of Object.entries(metodos)) {
      const p = fn(hasta);
      const r = tot[mn];
      r.c++;
      if (p < real) { r.q++; r.sobreQ += (real - p); }
      else r.s += (p - real);
    }
  }
}

console.log('\n' + filas.length + ' productos · ' + tot['ewma 0.4'].c + ' semanas evaluadas\n');
console.log('   metodo              quiebres   %      botellas que faltaron   sobrante medio');
for (const [n, v] of Object.entries(tot)) {
  console.log('   ' + n.padEnd(20) +
    String(v.q).padStart(5) + '   ' +
    ((v.q / v.c) * 100).toFixed(1).padStart(5) + '%  ' +
    v.sobreQ.toFixed(0).padStart(14) + '  ' +
    (v.s / v.c).toFixed(2).padStart(16));
}

// ── ¿Dónde importa el método? ────────────────────────────────────────
//
// El total mezcla peras con manzanas. En un producto que consume lo
// mismo todas las semanas da igual qué promedio uses: todos aciertan.
// La pregunta real es qué pasa en los que CAMBIAN, que es donde el
// sistema falla hoy.
//
// Se parte por cuánto se desvía lo reciente de la base histórica.
const seg = { 'despega  (x1.5 o más)': [], 'estable': [], 'se apaga (x0.6 o menos)': [] };
for (const f of filas) {
  const base = med(f.serie.slice(0, -4)), rec = med(f.serie.slice(-4));
  const r = base > 0.2 ? rec / base : 1;
  (r >= 1.5 ? seg['despega  (x1.5 o más)'] : r <= 0.6 ? seg['se apaga (x0.6 o menos)'] : seg['estable']).push(f);
}

for (const [nombre, grupo] of Object.entries(seg)) {
  if (!grupo.length) continue;
  const t = {};
  for (const n of Object.keys(metodos)) t[n] = { q: 0, c: 0, s: 0 };
  for (const { serie } of grupo) {
    for (let i = MIN; i < serie.length; i++) {
      const hasta = serie.slice(0, i), real = serie[i];
      for (const [mn, fn] of Object.entries(metodos)) {
        const p = fn(hasta); t[mn].c++;
        if (p < real) t[mn].q++; else t[mn].s += (p - real);
      }
    }
  }
  console.log('\n── ' + nombre + '  ·  ' + grupo.length + ' productos');
  for (const [n, v] of Object.entries(t)) {
    console.log('   ' + n.padEnd(20) + 'quiebres ' +
      ((v.q / v.c) * 100).toFixed(1).padStart(5) + '%    sobrante ' + (v.s / v.c).toFixed(2));
  }
}

// Los que más cambian de par, para poder mirarlos a ojo antes de aplicar
console.log('\n\n── Mayor cambio de par (hoy → ewma 0.3) ──');
const cambios = filas.map(f => {
  const hoy = metodos['todo el historial'](f.serie);
  const nuevo = metodos['ewma 0.3'](f.serie);
  return { n: f.nombre, hoy, nuevo, d: nuevo - hoy, ult: f.serie.slice(-4) };
}).filter(x => x.d !== 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 12);
for (const c of cambios) {
  console.log('   ' + (c.d > 0 ? '↑' : '↓') + ' ' + c.n.slice(0, 38).padEnd(40) +
    String(c.hoy).padStart(3) + ' → ' + String(c.nuevo).padEnd(4) +
    '  ultimas 4: ' + c.ult.map(v => v.toFixed(1)).join(', '));
}
