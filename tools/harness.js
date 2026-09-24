#!/usr/bin/env node
/*
 * ── Banco de pruebas del panel de conteo ─────────────────────────────
 *
 * Genera UNA página autocontenida que monta el panel de conteo con el
 * CSS y el JS de verdad, para poder MEDIRLO en un navegador en vez de
 * adivinar.
 *
 * El motivo concreto: el campo de selladas se comía los botones − y +
 * porque un <input> pide 20 caracteres de ancho por defecto. Nada de eso
 * se ve leyendo el código, y los bocetos que dibujo a mano nunca tienen
 * el bug — por eso salen bonitos y luego fallan en el teléfono.
 *
 * ── Lo que este banco SÍ atrapa ──────────────────────────────────────
 *
 *   · elementos con ancho o alto cero que deberían verse
 *   · cosas empujadas fuera del marco
 *   · elementos encimados que los dos son tocables
 *   · campos por debajo de 16px, que disparan el zoom de Safari
 *   · alturas que no caben en la pantalla del teléfono
 *
 * ── Lo que NO atrapa ─────────────────────────────────────────────────
 *
 * Rarezas del motor de Safari. El bug que lo motivó es una de ellas:
 * Chrome y Firefox encogen ese <input> sin protestar. Para eso hace
 * falta el iPhone, y no hay atajo.
 *
 * ── Por qué se genera y no se escribe a mano ─────────────────────────
 *
 * Una copia del CSS pegada aquí se desfasaría a la primera, y un banco
 * que miente es peor que no tenerlo: daría verde sobre estilos viejos.
 * Todo se lee de los archivos reales en cada corrida.
 *
 *   node tools/harness.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

// El artefacto corre con la red cerrada, asi que un @import de Google
// Fonts se queda colgando. Se quita y se deja la pila del sistema. Ojo
// con lo que eso implica: las medidas de TEXTO no son exactas a las del
// telefono. Lo que se mide aqui —tamaños cero, desbordes, solapes— no
// depende de la tipografia; el ancho justo de una etiqueta, si.
const sinFuentes = (css) => css.replace(/@import url\([^)]*\);?/g, '');

// El orden importa: es el mismo del index.html, y varias reglas dependen
// de cuál gana por llegar después.
const CSS = ['styles/theme.css', 'styles/count-panel.css'];
const JS  = ['src/bottle-profiles.js', 'src/count-session.js', 'src/count-panel.js'];

// De app.css solo interesa lo que de verdad pisa al panel: las reglas
// genéricas de formulario. Meter los 140 KB enteros traería medio
// producto y ensuciaría la medición.
function inputsGlobales() {
  const app = leer('styles/app.css');
  const trozos = [];
  const re = /(^|\n)\s*(input,select\{[\s\S]*?\}|input,select,textarea\{[\s\S]*?\})/g;
  let m;
  while ((m = re.exec(app))) trozos.push(m[2]);
  return trozos.join('\n');
}

// mobile.css vive dentro de una media query; se toma tal cual para que
// la regla de los 16px entre en juego igual que en el teléfono.
const css = [
  CSS.map(f => `/* ===== ${f} ===== */\n` + sinFuentes(leer(f))).join('\n\n'),
  `/* ===== app.css · solo formularios ===== */\n` + inputsGlobales(),
  `/* ===== styles/mobile.css ===== */\n` + leer('styles/mobile.css')
].join('\n\n');

const js = JS.map(f => `/* ===== ${f} ===== */\n` + leer(f)).join('\n\n');

const pagina = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Banco · panel de conteo</title>
<style>
:root{ color-scheme: light }
${css}

/* ── Andamio del banco. Nada de esto existe en la app. ───────────── */
body{ margin:0; font-family:"Manrope",system-ui,sans-serif; }
#bancoBar{
  position:fixed; inset:0 0 auto 0; z-index:99;
  display:flex; gap:6px; flex-wrap:wrap; align-items:center;
  padding:8px 10px; background:#0b1220; color:#e2e8f0;
  border-bottom:1px solid rgba(255,255,255,.12); font-size:12px;
}
#bancoBar button{
  font:inherit; padding:5px 9px; border-radius:7px; cursor:pointer;
  background:rgba(255,255,255,.08); color:#e2e8f0;
  border:1px solid rgba(255,255,255,.18);
}
#bancoBar button.on{ background:#38bdf8; color:#04263a; border-color:#38bdf8; }
#bancoBar .sep{ width:1px; height:20px; background:rgba(255,255,255,.18); margin:0 3px; }
#marco{
  position:fixed; top:46px; left:10px; z-index:50;
  border:2px solid #38bdf8; border-radius:14px; overflow:hidden;
  background:var(--bg);
}
/* El panel es position:fixed y se saldría del marco. Dentro del banco se
   le fuerza a quedarse dentro para poder medirlo contra un ancho de
   telefono concreto. */
#marco .cp-panel{ position:absolute !important; inset:0 !important; }
#informe{
  position:fixed; top:46px; right:10px; bottom:10px; width:min(430px,42vw);
  overflow:auto; z-index:60;
  background:#0b1220; color:#cbd5e1; border:1px solid rgba(255,255,255,.14);
  border-radius:12px; padding:11px 13px;
  font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;
  white-space:pre-wrap;
}
#informe b{ color:#f1f5f9; }
.ok{ color:#4ade80; } .mal{ color:#f87171; } .ojo{ color:#fbbf24; }
</style></head>
<body class="light">

<div id="bancoBar">
  <b>escenario</b>
  <button data-e="primero">1.er escaneo</button>
  <button data-e="tercero">3.er escaneo</button>
  <button data-e="corrige">corrigiendo</button>
  <button data-e="tresab">3 abiertas</button>
  <button data-e="grande">24 selladas</button>
  <span class="sep"></span>
  <b>ancho</b>
  <button data-w="320">320</button>
  <button data-w="375">375</button>
  <button data-w="390">390</button>
  <button data-w="430">430</button>
  <span class="sep"></span>
  <button id="tema">claro / oscuro</button>
  <button id="hoja">abrir la hoja</button>
  <button id="foco">enfocar selladas</button>
  <span class="sep"></span>
  <button id="medir">MEDIR</button>
  <button id="barrer">BARRER TODO</button>
</div>

<div id="marco"></div>
<div id="informe">Elige un escenario y pulsa MEDIR.</div>

<script>
${js}
</script>

<script>
/* ── El banco ─────────────────────────────────────────────────────── */
window.BARSTOCK_CONFIG = { ACCOUNT_ID:'banco', LOCATION_NAME:'Banco', SUPABASE_URL:'', SUPABASE_KEY:'' };
window.state = { master: [] };

const S  = window.BarStockCountSession;
const CP = window.BarStockCountPanel;
const $  = (id) => document.getElementById(id);

const FILA = { item:'House Vodka 1.75L', code:'HV', bottleSizeMl:1750,
               bottleShape:'vodka', onHand:3, vendor:'BREAKTHRU' };
window.state.master = [FILA];

let ANCHO = 390, ALTO = 780;

function marco(){
  const m = $('marco');
  m.style.width  = ANCHO + 'px';
  m.style.height = ALTO + 'px';
  const p = document.getElementById('cpPanel');
  if (p && p.parentElement !== m) m.appendChild(p);
}

function escenario(cual){
  S.clear('Banco');
  if (cual === 'tercero' || cual === 'corrige' || cual === 'tresab') {
    S.addPass(FILA.item, 1, [0.5]);
    S.addPass(FILA.item, 2, [0.7]);
  }
  CP.open(FILA, () => {}, '0085000000000');
  marco();

  if (cual === 'tresab') { $('cpAdd').click(); $('cpAdd').click(); }
  if (cual === 'grande') { $('cpSealed').value = '24';
                           $('cpSealed').dispatchEvent(new Event('input')); }
  if (cual === 'corrige') {
    $('cpTotalBtn').click();
    document.querySelector('[data-fix="0"]').click();
  }
  marco();
}

/* ── La medición ──────────────────────────────────────────────────
   revisar() DEVUELVE el resultado; medir() lo pinta. Separados porque
   el barrido automatico necesita los datos, no el HTML. */
function revisar(){
  const marcoEl = $('marco');
  const caja = marcoEl.getBoundingClientRect();
  const lineas = [];
  let fallos = 0, avisos = 0;
  const mal  = (t) => { fallos++; lineas.push({nivel:'mal', txt:t}); };
  const ojo  = (t) => { avisos++; lineas.push({nivel:'ojo', txt:t}); };
  const bien = (t) => lineas.push({nivel:'ok', txt:t});

  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (Number(cs.opacity) < .01) return false;
    return !el.closest('[hidden]');
  };
  const todos = [...marcoEl.querySelectorAll('*')].filter(vis);

  // 1 · con contenido pero sin tamaño
  const planos = todos.filter(el => {
    const r = el.getBoundingClientRect();
    const algo = (el.textContent || '').trim() || el.tagName === 'INPUT';
    return algo && (r.width < 1 || r.height < 1);
  });
  planos.length ? mal(planos.length + ' con tamaño cero: ' +
      planos.slice(0,4).map(señas).join(', '))
    : bien('nada con tamaño cero');

  // 2 · empujado fuera del ancho del telefono
  const fuera = todos.filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 1) return false;
    return r.right > caja.right + 1 || r.left < caja.left - 1;
  });
  fuera.length ? mal(fuera.length + ' se salen del ancho: ' +
      fuera.slice(0,4).map(el => {
        const r = el.getBoundingClientRect();
        return señas(el) + '(' + Math.round(r.left - caja.left) + '…' +
               Math.round(r.right - caja.left) + ')';
      }).join(', '))
    : bien('nada se sale del ancho');

  // 3 · zoom de Safari
  const campos = todos.filter(el => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
  const chicos = campos.filter(el => parseFloat(getComputedStyle(el).fontSize) < 16);
  chicos.length ? mal(chicos.length + ' campo(s) <16px, Safari hara zoom: ' +
      chicos.map(el => señas(el) + ' ' + getComputedStyle(el).fontSize).join(', '))
    : bien('ningun campo dispara el zoom de Safari (' + campos.length + ')');

  // 4 · zonas tocables menores de 40px
  const toca = todos.filter(el => /^(BUTTON|A)$/.test(el.tagName) ||
    el.getAttribute('role') === 'button');
  const mini = toca.filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && (r.width < 40 || r.height < 40);
  });
  mini.length ? ojo(mini.length + ' tocable(s) <40px: ' +
      mini.slice(0,4).map(el => {
        const r = el.getBoundingClientRect();
        return señas(el) + '(' + Math.round(r.width) + 'x' + Math.round(r.height) + ')';
      }).join(', '))
    : bien('todo lo tocable llega a 40px');

  // 5 · solapes entre cosas tocables
  const pares = [];
  for (let i = 0; i < toca.length; i++)
    for (let j = i + 1; j < toca.length; j++) {
      if (toca[i].contains(toca[j]) || toca[j].contains(toca[i])) continue;
      const a = toca[i].getBoundingClientRect(), b = toca[j].getBoundingClientRect();
      if (a.width < 1 || b.width < 1) continue;
      const w = Math.min(a.right,b.right) - Math.max(a.left,b.left);
      const h = Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top);
      if (w > 4 && h > 4) pares.push(señas(toca[i]) + '×' + señas(toca[j]));
    }
  pares.length ? mal(pares.length + ' par(es) encimados: ' + pares.slice(0,3).join(', '))
    : bien('nada tocable se encima');

  // 6 · ¿cabe de alto?
  const panel = document.getElementById('cpPanel');
  if (panel) {
    const sobra = panel.scrollHeight - panel.clientHeight;
    sobra > 2 ? ojo('el panel desborda ' + sobra + 'px de alto')
              : bien('cabe en ' + ALTO + 'px de alto');
  }

  return { fallos, avisos, lineas };
}

function medir(){
  const r = revisar();
  const color = { ok:'ok', mal:'mal', ojo:'ojo' };
  const icono = { ok:'✓', mal:'✗', ojo:'⚠' };
  let extra = '';
  const fila = document.querySelector('.cp-step');
  if (fila) extra = '\\n\\n<b>la fila del contador</b>\\n' +
    [...fila.children].map(el => {
      const b = el.getBoundingClientRect();
      return '  ' + señas(el).padEnd(24) + Math.round(b.width) + '×' + Math.round(b.height);
    }).join('\\n');

  $('informe').innerHTML =
    '<b>' + ANCHO + '×' + ALTO + ' · ' +
    (document.body.classList.contains('light') ? 'claro' : 'oscuro') + '</b>   ' +
    (r.fallos ? '<span class="mal">' + r.fallos + ' fallo(s)</span>'
              : '<span class="ok">sin fallos</span>') +
    (r.avisos ? '  <span class="ojo">' + r.avisos + ' aviso(s)</span>' : '') +
    '\\n\\n' + r.lineas.map(l =>
      '<span class="' + color[l.nivel] + '">' + icono[l.nivel] + ' ' + l.txt + '</span>'
    ).join('\\n') + extra;
  return r;
}

function señas(el){
  return el.tagName.toLowerCase() +
    (el.id ? '#' + el.id : '') +
    (el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '');
}

/* ── Botones del banco ────────────────────────────────────────────── */
document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-e]').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); escenario(b.dataset.e); medir();
});
document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-w]').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); ANCHO = Number(b.dataset.w); marco(); medir();
});
$('tema').onclick  = () => { document.body.classList.toggle('light'); medir(); };
$('hoja').onclick  = () => { $('cpTotalBtn').click(); medir(); };
$('foco').onclick  = () => { $('cpSealed').focus(); medir(); };
$('medir').onclick = medir;

/* ── Barrido automático ───────────────────────────────────────────
   Recorre cada escenario en cada ancho, en claro y en oscuro, y escupe
   el resultado por consola. Es lo que hace que esto sirva sin que nadie
   esté delante pulsando botones: el informe se puede leer desde fuera. */
function barrer(){
  const escenarios = ['primero','tercero','corrige','tresab','grande'];
  const anchos = [320, 375, 390, 430];
  const resumen = [];
  let fallosTotales = 0;

  for (const tema of ['light','dark']) {
    document.body.classList.toggle('light', tema === 'light');
    for (const w of anchos) {
      ANCHO = w;
      for (const e of escenarios) {
        escenario(e);
        const r = revisar();
        fallosTotales += r.fallos;
        if (r.fallos || r.avisos) {
          resumen.push('[' + tema + ' ' + w + 'px · ' + e + ']  ' +
            r.lineas.filter(l => l.nivel !== 'ok').map(l => l.txt).join(' | '));
        }
      }
    }
  }
  document.body.classList.add('light');

  console.log('BANCO ' + (fallosTotales ? ('· ' + fallosTotales + ' FALLO(S)') : '· TODO LIMPIO') +
    '  (' + (escenarios.length * anchos.length * 2) + ' combinaciones)');
  if (resumen.length) resumen.forEach(l => console.log('  ' + l));
  else console.log('  sin fallos ni avisos en ninguna combinacion');
  return fallosTotales;
}
$('barrer').onclick = () => {
  const n = barrer();
  $('informe').innerHTML = '<b>barrido completo</b>  ' +
    (n ? '<span class="mal">' + n + ' fallo(s)</span>' : '<span class="ok">limpio</span>') +
    '\\n\\nEl detalle esta en la consola.';
};

document.querySelector('[data-e="tercero"]').click();
document.querySelector('[data-w="390"]').classList.add('on');
barrer();
</script>
</body></html>`;

const destino = process.argv[2] || path.join(RAIZ, 'tools', 'harness.html');
fs.writeFileSync(destino, pagina);
console.log('banco escrito en ' + destino + '  (' + Math.round(pagina.length / 1024) + ' KB)');
