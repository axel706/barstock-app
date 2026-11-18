/*
 * ── "Check the shelf": el lápiz junto al número (2026-11-18, lámina C) ─
 *
 * Un transfer contado el domingo y facturado el lunes dejó Triage Vodka
 * con 12 de más en el LIVE, y no había dónde decir "aquí hay 19.8":
 * "I have enough" sólo sale en lo que se acaba. Lo que no puede volver a
 * pasar:
 *
 *   1. Que corregir el número dependa de que el producto "esté bajo": el
 *      lápiz va en la tarjeta de "Do we have" y en la ficha.
 *   2. Que sea otra cosa que la verificación de siempre: stock_checks,
 *      on_hand intacto, y NADA en la lista de compras.
 *   3. Dos teclados: Running out usa el mismo (check-shelf.js).
 *   4. Un lápiz para quien no puede contar, o dentro de una fila que ya
 *      es un botón (Inventory).
 *
 *   node tools/test-check-shelf.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const existe = f => fs.existsSync(path.join(RAIZ, f));

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

(async () => {

function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
  w.console = { log() {}, warn() {}, error() {} };
  w.__checks = []; w.__lista = []; w.__caducado = 0; w.__pad = null;
  w.BarStockStockChecks = { guardar: async (x) => { w.__checks.push(x); return { ok: true }; } };
  w.BarStockShoppingList = { anadir: async (x) => { w.__lista.push(x); return { ok: true }; } };
  w.BarStockNumPad = { abrir: (cfg) => { w.__pad = cfg; } };
  w.BarStockGuest = { puede: (k) => !(o.sin || []).includes(k), nombre: () => 'Axel' };
  w.BarStockLiveCache = {
    vivo: (r) => r.__v || null, cuanto: (r) => (r.__v ? r.__v.live : r.onHand),
    caducar: () => { w.__caducado++; }, toastLoVende: () => false, etiquetaAgota: () => '', semana: () => null
  };
  if (existe('src/check-shelf.js')) w.eval(leer('src/check-shelf.js'));
  w.eval(leer('src/product-hero.js'));
  return w;
}
const TRIAGE = { item: 'Triage Vodka', vendor: 'TRIAGE', onHand: 21.95, suggested: 12,
  __v: { live: 31.8, contado: 21.95, llego: 12, vendido: 2.2 } };

grupo('1 · el módulo (src/check-shelf.js)');
{
  const w = entorno();
  const CS = w.BarStockCheckShelf;
  prueba('existe', !!CS && typeof CS.abrir === 'function');
  if (CS) {
    CS.abrir(TRIAGE);
    prueba('abre el teclado con lo que cree la app', !!w.__pad && /Live says &asymp;31\.8/.test(w.__pad.sub), w.__pad && w.__pad.sub);
    const r = await w.__pad.guardar(19.8);
    prueba('guarda la verificación de siempre (stock_checks)', r.ok && w.__checks.length === 1 &&
      w.__checks[0].item === 'Triage Vodka' && w.__checks[0].n === 19.8 && w.__checks[0].decia === 31.8 && w.__checks[0].por === 'Axel',
      JSON.stringify(w.__checks));
    prueba('y NO añade nada a la lista de compras', w.__lista.length === 0);
    prueba('el LIVE se rehace', w.__caducado === 1);
    let visto = null;
    CS.abrir(TRIAGE, { alGuardar: (n, q) => { visto = [n, q]; } });
    await w.__pad.guardar(20);
    prueba('avisa a quien lo abrió (Running out lo apunta en su tarjeta)', visto && visto[0] === 20 && visto[1] === 31.8);
    w.BarStockStockChecks.guardar = async () => ({ ok: false, error: 'cloud down' });
    let otra = false;
    CS.abrir(TRIAGE, { alGuardar: () => { otra = true; } });
    const f = await w.__pad.guardar(5);
    prueba('si no se guarda, lo dice y no finge', f.ok === false && /cloud down/.test(f.error) && !otra);
  }
}

grupo('2 · la tarjeta: el lápiz y lo verificado (product-hero.js)');
{
  const w = entorno();
  const H = w.BarStockProductHero;
  const d = w.document.createElement('div');
  d.innerHTML = H.html(TRIAGE, { lapiz: 7 });
  const lap = d.querySelector('.m-fic-big [data-check]');
  prueba('junto al número grande, un lápiz', !!lap && lap.getAttribute('data-check') === '7' && lap.tagName === 'BUTTON');
  prueba('sin verificar, sin línea', !d.querySelector('.m-fic-chk'));
  d.innerHTML = H.html(TRIAGE, {});
  prueba('sin pedirlo (Inventory: la fila ya es un botón), sin lápiz', !d.querySelector('[data-check]'));
  const ver = Object.assign({}, TRIAGE, { __v: Object.assign({}, TRIAGE.__v, { live: 19.8,
    verificado: { n: 19.8, cuando: Date.parse('2026-11-18T15:30:00Z'), por: 'Axel' } }) });
  d.innerHTML = H.html(ver, { lapiz: 7 });
  const chk = d.querySelector('.m-fic-chk');
  prueba('verificado: "✓ Checked 19.8 · Wed 10:30 AM · Axel" y "Change"', !!chk &&
    /Checked 19\.8 · Wed 10:30 AM · Axel/.test(chk.textContent.replace(/\s+/g, ' ')) && /Change/.test(chk.textContent), chk && chk.textContent);
  w.BarStockLiveCache.semana = () => [{ fecha: '2026-11-15', queda: 21.9 }, { fecha: '2026-11-18', queda: 19.8 }];
  d.innerHTML = H.html(ver, { lapiz: 7, semana: true });
  prueba('y la semana lo dice ("checked 19.8")', /used 2\.2 · checked 19\.8/.test(d.querySelector('.m-dad-k').textContent), d.querySelector('.m-dad-k') && d.querySelector('.m-dad-k').textContent);
  const w2 = entorno({ sin: ['contar'] });
  d.innerHTML = w2.BarStockProductHero.html(ver, { lapiz: 7 });
  prueba('quien no puede contar no ve el lápiz ni "Change"', !d.querySelector('[data-check]') && !!d.querySelector('.m-fic-chk'));
}

grupo('3 · dónde va y en qué orden');
{
  const ms = leer('src/mobile-search.js');
  prueba('Do we have y la ficha piden el lápiz', /H\.html\(r, \{ par: parDe\(r\), semana: true, pie: bajo\(r, mi\), lapiz: mi \}\)/.test(ms) &&
    /H\.html\(r, \{ par, hueco: true, lapiz: master\(\)\.indexOf\(r\) \}\)/.test(ms));
  prueba('en la tarjeta, el toque no abre también la ficha', /querySelectorAll\('\[data-check\]'\)[\s\S]{0,120}stopPropagation/.test(ms));
  prueba('en la ficha, delegado (la cabecera se rehace con el LIVE)', /caja\.addEventListener\('click'[\s\S]{0,160}\[data-check\]/.test(ms));
  prueba('Running out usa el mismo teclado', /BarStockCheckShelf\.abrir\(r,/.test(leer('src/mobile-running-out.js')) &&
    !/SC\.guardar/.test(leer('src/mobile-running-out.js')));
  const idx = leer('index.html');
  const pos = (f) => idx.indexOf('src/' + f + '?');
  prueba('check-shelf.js después de stock-checks y num-pad, antes de product-hero y quien lo usa',
    pos('check-shelf.js') > pos('stock-checks.js') && pos('check-shelf.js') > pos('num-pad.js') &&
    pos('check-shelf.js') < pos('product-hero.js') && pos('check-shelf.js') < pos('mobile-running-out.js') && pos('check-shelf.js') < pos('mobile-search.js'));
  prueba('el lápiz vence el radio de app.css (con id)', /:is\(#mScreens, #mSheet\) \.m-fic-lapiz/.test(leer('styles/mobile-app.css')));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
