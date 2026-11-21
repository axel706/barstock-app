#!/usr/bin/env node
/*
 * ── Las tarjetas del carrusel, cada una con su dibujo ────────────────
 *
 * Axel, 2026-11-21, sobre lámina ("una tarjeta para cada tarea"): las
 * tarjetas del Home dejan de ser la misma plantilla con otras palabras.
 * Los dibujos viven en src/home-cartas.js; los datos los sigue
 * calculando mobile-home.js con los módulos de siempre.
 *
 * Lo que se protege:
 *
 *   1. El orden de carga: los logos y las siluetas antes de los dibujos,
 *      los dibujos antes del Home.
 *   2. La tarjeta libre lleva el encabezado y la fila de botones de
 *      siempre, y su cuerpo mide lo mismo que la plantilla (el carril no
 *      crece).
 *   3. Los dibujos escapan lo que viene de fuera.
 *   4. Running out (R2): una botella por producto, con SU silueta, llena
 *      contra su par, y el día y el nombre; To buy y See them siguen.
 *
 *   node tools/test-carrusel-cartas.js
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d !== undefined ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

function entorno(items, extra) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.state = { master: items.map(x => ({
    item: x.item, code: x.item, vendor: x.vendor || 'SOUTHERN', category: 'Liquor',
    onHand: x.onHand, suggested: x.par == null ? 4 : x.par, bottleShape: x.forma || ''
  })) };
  w.parAdjustments = new Map(items.map(x => [x.item + '||' + x.item, { status: 'active', avgUsed: x.avg, normalWeeks: 8 }]));
  w.BarStockWeeklyCycle = {
    estado: () => 'done', resetAt: () => '2026-10-25T08:00:00Z',
    fmtDate: () => 'Oct 25', edadCiclo: () => 2 * 86400000, cicloViejo: () => false
  };
  w.BarStockMobile = { ir() {} };
  if (extra) extra(w);
  for (const f of ['src/home-orden.js', 'src/bottle-profiles.js', 'src/vendor-logo.js', 'src/running-out.js', 'src/home-cartas.js', 'src/mobile-home.js']) {
    if (fs.existsSync(path.join(RAIZ, f))) new Function(leer(f))();
  }
  return w;
}
function pintar(w) {
  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.setAttribute('data-screen', 'home');
  w.document.body.appendChild(host);
  w.BarStockMobileHome.render(host);
  return host;
}
const tarjeta = (h, re) => Array.from(h.querySelectorAll('.m-hero')).find(c => re.test(c.textContent));

grupo('el orden de carga');
{
  const idx = leer('index.html');
  const pos = (f) => idx.indexOf('src/' + f);
  prueba('siluetas y logos antes de los dibujos, los dibujos antes del Home y del transfer',
    pos('bottle-profiles.js') > 0 && pos('vendor-logo.js') > 0 && pos('home-cartas.js') > 0 &&
    pos('bottle-profiles.js') < pos('home-cartas.js') && pos('vendor-logo.js') < pos('home-cartas.js') &&
    pos('home-cartas.js') < pos('mobile-home.js') && pos('home-cartas.js') < pos('transfer-confirm.js'));
}

grupo('la tarjeta libre');
{
  const css = leer('styles/mobile-app.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const regla = (/\.m-hero-libre-c \{([^}]*)\}/.exec(css) || [])[1] || '';
  prueba('el cuerpo mide el título y los tres renglones de la plantilla',
    /height:\s*calc\(var\(--m-head\) \* 1\.25 \+ 4px \+ var\(--m-ren\) \* 3 \+ 9px\)/.test(regla), regla.trim());
  prueba('y no se sale', /overflow:\s*hidden/.test(regla));
  // La botella se queda con lo que sobra, no con un alto fijo: con la
  // letra del teléfono, el día y el nombre medían más que en Chromium y
  // el overflow del cuerpo los cortaba (Axel, 2026-11-21, captura).
  const bot = (/\.m-hc-bot \{([^}]*)\}/.exec(css) || [])[1] || '';
  const svg = (/\.m-hc-bot svg \{([^}]*)\}/.exec(css) || [])[1] || '';
  prueba('la botella cede su alto al texto', /grid-template-rows:\s*minmax\(0,\s*1fr\) auto auto/.test(bot) &&
    /height:\s*100%/.test(svg) && !/var\(--m-ren\)/.test(svg), bot.trim() + ' | ' + svg.trim());
  const bots = (/\.m-hc-bots \{([^}]*)\}/.exec(css) || [])[1] || '';
  prueba('y las columnas ocupan todo el alto del cuerpo', /min-height:\s*0/.test(bots) && !/align-items:\s*end/.test(bots), bots.trim());
}

grupo('los dibujos escapan lo que viene de fuera');
{
  const w = entorno([]);
  const HC = w.BarStockHomeCartas;
  prueba('existen', !!HC);
  if (HC) {
    const todo = [
      HC.botellas([{ forma: 'whiskey', lleno: 0.5, dia: 'Now', nombre: '<b>x</b>' }]),
      HC.proveedores({ total: '$1', botellas: '1', provs: [{ nombre: '<i>V</i>', dinero: '$1', detalle: 'a<b>' }] }),
      HC.llegadas({ dias: [{ u: 'Tue', provs: ['<b>'] }], siguiente: '<b>next</b>' }),
      HC.pista({ titulo: '<b>', sub: '<i>', dias: [{ u: '<b>' }] }),
      HC.pasos({ pasos: [{ u: '1', t: '<b>' }], linea: '<i>' }),
      HC.anillo({ pct: 0.5, centro: '<b>', filas: [['a', '<b>']], chips: ['<b>'] }),
      HC.traslado({ de: '<b>', a: '<i>', cantidad: '1', producto: '<b>' })
    ].join('');
    prueba('ningún nombre llega como HTML', !/<b>x|a<b>|<b>next/.test(todo));
    prueba('llegan escapados', /&lt;b&gt;x&lt;\/b&gt;/.test(todo) && /a&lt;b&gt;/.test(todo) && /&lt;b&gt;next&lt;\/b&gt;/.test(todo));
  }
}

grupo('Running out: las botellas (R2)');
{
  const w = entorno([
    { item: 'Red Schooner Malbec', onHand: 0, avg: 9, par: 4, forma: 'bordeaux' },
    { item: 'Casa Noble Blanco', onHand: 1, avg: 12, par: 4, forma: 'casa_noble' },
    { item: 'Crown Royal Regal Apple', onHand: 2, avg: 6, par: 4, forma: 'crown' }
  ]);
  const h = pintar(w);
  const c = tarjeta(h, /Running out/i);
  prueba('es libre', !!c && c.classList.contains('m-hero-libre'), c && c.className);
  const bots = c ? Array.from(c.querySelectorAll('.m-hc-bot')) : [];
  prueba('una botella por producto', bots.length === 3, bots.length);
  prueba('cada una con su silueta', bots.length === 3 && bots.every(b => !!b.querySelector('svg path.m-hc-vid')));
  const B = w.BarStockBottleProfiles;
  const d0 = B.pathFor('bordeaux', 40, 72, 3);
  prueba('la del Malbec es la de vino', !!bots[0] && bots[0].querySelector('path.m-hc-vid').getAttribute('d') === d0);
  // Llena contra su par: 0 de 4 casi vacía, 2 de 4 a la mitad.
  const yLiq = (b) => Number(b.querySelector('rect.m-hc-liq').getAttribute('y'));
  const yMitad = B.yToPx('crown', B.heightFor('crown', 0.5), 40, 72, 3);
  prueba('llena contra su par (2 de 4, a la mitad)', !!bots[2] && Math.abs(yLiq(bots[2]) - yMitad) < 0.2, bots[2] && yLiq(bots[2]) + ' vs ' + yMitad);
  prueba('el día y el nombre debajo', !!bots[0] && /Now/.test(bots[0].querySelector('b').textContent) && /Red Schooner/.test(bots[0].querySelector('small').textContent),
    bots[0] && bots[0].textContent);
  prueba('See them sigue', !!c && /See them/.test(c.querySelector('.m-hero-acts').textContent));
  prueba('el número a la derecha del encabezado', !!c && !!c.querySelector('.m-hero-kr'), c && c.querySelector('.m-hero-k').textContent);
}

grupo('Running out: el pie sólo dice lo que no cabe');
{
  const cinco = ['A', 'B', 'C', 'D', 'E'].map(x => ({ item: 'Prod ' + x, onHand: 0.5, avg: 10, par: 4, forma: 'whiskey' }));
  // Con tres, caben todas: el pie no repite el total del encabezado.
  let h = pintar(entorno(cinco.slice(0, 3)));
  let c = tarjeta(h, /Running out/i);
  const vs = (c) => { const e = c && c.querySelector('.m-hero-vs'); return e ? e.textContent : ''; };
  prueba('caben todas: pie vacío', !!c && vs(c) === '', vs(c));
  // Con cinco, se dibujan cuatro y el pie dice la quinta.
  h = pintar(entorno(cinco));
  c = tarjeta(h, /Running out/i);
  prueba('cuatro botellas', !!c && c.querySelectorAll('.m-hc-bot').length === 4);
  prueba('"and 1 more", contando desde cuatro', /^and 1 more/.test(vs(c)), vs(c));
}

grupo('Orders waiting: una columna por proveedor');
{
  // Cinco proveedores: se dibujan cuatro y el pie dice el quinto.
  const ords = {
    LOOP: [{ item: 'A', toOrder: 6, value: 20 }, { item: 'B', toOrder: 4, value: 0 }],
    SOUTHERN: [{ item: 'C', toOrder: 3, value: 30 }],
    BREAKTHRU: [{ item: 'D', toOrder: 2, value: 0 }],
    'WINE MERCHANT': [{ item: 'E', toOrder: 1, value: 15 }],
    BOTANERY: [{ item: 'F', toOrder: 1, value: 0 }]
  };
  const w = entorno([], (w) => {
    w.getActiveVendors = () => Object.keys(ords);
    w.getOrderRowsForVendor = (v) => ords[v] || [];
    w.computeOrderSubtotal = (fs) => fs.reduce((s, r) => s + (Number(r.value) || 0) * r.toOrder, 0);
  });
  const c = tarjeta(pintar(w), /Orders waiting/i);
  prueba('es libre', !!c && c.classList.contains('m-hero-libre'), c && c.className);
  const tot = c && c.querySelector('.m-hc-tot');
  prueba('el total arriba: dinero y botellas', !!tot && /\$225/.test(tot.textContent) && /17 bottles/.test(tot.textContent), tot && tot.textContent);
  const pv = c ? Array.from(c.querySelectorAll('.m-hc-pv')) : [];
  prueba('cuatro columnas, la que más botellas primero', pv.length === 4 && /\$120/.test(pv[0].textContent) && /10 btl/.test(pv[0].textContent),
    pv.map(x => x.textContent).join(' | '));
  prueba('cada una con su logo', pv.length === 4 && pv.every(x => !!x.querySelector('.m-vlogo')));
  prueba('sin precio, botellas y líneas (nunca "$0")', pv.some(x => /^2 btl1 line$/.test(x.textContent)) && !/\$0\b/.test(c.textContent),
    pv.map(x => x.textContent).join(' | '));
  prueba('"5 vendors" a la derecha', !!c && /5 vendors/.test((c.querySelector('.m-hero-kr') || {}).textContent || ''));
  prueba('el pie: "and 1 more"', !!c && ((c.querySelector('.m-hero-vs') || {}).textContent || '') === 'and 1 more');
}

grupo('Orders placed: la semana con cada llegada');
{
  const H = 3600e3;
  const ahora = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const fila = { item: 'A', code: 'A', vendor: 'LOOP', onHand: 4, suggested: 4 };
  const w = entorno([], (w) => {
    w.state.master = [fila];
    w.getActiveVendors = () => ['LOOP'];
    w.getOrderRowsForVendor = () => [];
    w.computeOrderSubtotal = () => 0;
    w.isRowPlaced = () => true;
    w.state.orderHistory = [
      { vendor: 'LOOP', arrivesAt: iso(ahora + 2 * 24 * H), totalUnits: 14 },
      { vendor: 'SOUTHERN', arrivesAt: iso(ahora + 3 * 24 * H), totalUnits: 9 },
      { vendor: 'TRANSFER', arrivesAt: iso(ahora + 1 * 24 * H), totalUnits: 3 },
      { vendor: 'BREAKTHRU', arrivesAt: iso(ahora + 20 * 24 * H), totalUnits: 5 }
    ];
  });
  const c = tarjeta(pintar(w), /Orders placed/i);
  prueba('es libre', !!c && c.classList.contains('m-hero-libre'), c && c.className);
  const d7 = c ? Array.from(c.querySelectorAll('.m-hc-d7')) : [];
  prueba('siete días, hoy el primero', d7.length === 7 && d7[0].classList.contains('hoy'));
  prueba('LOOP en su día y SOUTHERN en el suyo; el transfer y lo de dentro de 20 días no',
    d7.length === 7 && d7[2].classList.contains('on') && d7[3].classList.contains('on') &&
    !d7[1].classList.contains('on') && d7.filter(d => d.classList.contains('on')).length === 2,
    d7.map(d => d.className).join(','));
  const uno = c && c.querySelector('.m-hc-uno');
  prueba('"Next:" la primera que llega, con sus botellas', !!uno && /Next:\s*LOOP .* · 14 bottles/.test(uno.textContent), uno && uno.textContent);
  prueba('"all sent" a la derecha', !!c && /all sent/.test((c.querySelector('.m-hero-kr') || {}).textContent || ''));

  // Sin ninguna llegada en la semana: la plantilla de siempre.
  const w2 = entorno([], (w) => {
    w.state.master = [fila];
    w.getActiveVendors = () => ['LOOP'];
    w.getOrderRowsForVendor = () => [];
    w.computeOrderSubtotal = () => 0;
    w.isRowPlaced = () => true;
    w.state.orderHistory = [];
  });
  const c2 = tarjeta(pintar(w2), /Orders placed/i);
  prueba('sin llegadas, "You are up to date" de siempre', !!c2 && !c2.classList.contains('m-hero-libre') && /up to date/.test(c2.textContent));
}

grupo('Cycle open: la pista de la semana');
{
  const w = entorno([], (w) => {
    w.BarStockWeeklyCycle.resetAt = () => new Date(Date.now() - 2 * 864e5).toISOString();
    w.getActiveVendors = () => ['LOOP'];
    w.getOrderRowsForVendor = () => [];
    w.computeOrderSubtotal = () => 0;
  });
  const c = tarjeta(pintar(w), /Cycle open/i);
  prueba('es libre', !!c && c.classList.contains('m-hero-libre'), c && c.className);
  const seg = c ? Array.from(c.querySelectorAll('.m-hc-pista i')) : [];
  const et = c ? Array.from(c.querySelectorAll('.m-hc-pistal span')).map(x => x.textContent) : [];
  prueba('siete tramos, de lunes a domingo', seg.length === 7 && et[0] === 'Mon' && et[6] === 'Sun', et.join(','));
  const iHoy = seg.findIndex(x => x.classList.contains('hoy'));
  const hoyU = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date());
  // El domingo después del corte ya es la semana siguiente: hoy no sale.
  prueba('hoy marcado en su día, lo de antes lleno', iHoy === -1 ? hoyU === 'Sun' :
    et[iHoy] === hoyU && seg.slice(0, iHoy).every(x => x.classList.contains('on')) && seg.slice(iHoy + 1).every(x => !x.className),
    seg.map(x => x.className || '·').join(','));
  const big = c && c.querySelector('.m-hc-big');
  prueba('cuándo se cuenta', !!big && /^Count (today|tomorrow|Sunday)/.test(big.textContent) && /from 4 PM/.test(big.textContent), big && big.textContent);
  prueba('"since" a la derecha', !!c && /^since \w{3} \w{3} \d+$/.test((c.querySelector('.m-hero-kr') || {}).textContent || ''),
    c && (c.querySelector('.m-hero-kr') || {}).textContent);
  const vs = c ? ((c.querySelector('.m-hero-vs') || {}).textContent || '') : '';
  prueba('el pie: el día del ciclo', iHoy === -1 || new RegExp('^Day ' + (iHoy + 1) + ' of 7').test(vs), vs);
  prueba('Restart sigue', !!c && /Restart/.test(c.querySelector('.m-hero-acts').textContent));
}

grupo('Load the count: los tres pasos');
{
  const w = entorno([], (w) => { w.BarStockWeeklyCycle.estado = () => 'step2'; });
  const c = tarjeta(pintar(w), /Sunday count/i);
  prueba('es libre', !!c && c.classList.contains('m-hero-libre'), c && c.className);
  const ps = c ? Array.from(c.querySelectorAll('.m-hc-paso')) : [];
  prueba('tres pasos, el 1 hecho y el 2 ahora', ps.length === 3 && ps[0].classList.contains('ok') && ps[1].classList.contains('now'),
    ps.map(x => x.className).join(','));
  prueba('"step 2 of 3" a la derecha', !!c && /step 2 of 3/.test((c.querySelector('.m-hero-kr') || {}).textContent || ''));
  const acts = c ? c.querySelector('.m-hero-acts').textContent : '';
  prueba('Import y Count now (y Start over)', /Import/.test(acts) && /Count now/.test(acts) && /Start over/.test(acts), acts);

  const w1 = entorno([], (w) => { w.BarStockWeeklyCycle.estado = () => 'step1'; });
  const c1 = tarjeta(pintar(w1), /No cycle yet/i);
  const p1 = c1 ? Array.from(c1.querySelectorAll('.m-hc-paso')) : [];
  prueba('en el paso 1, el 1 es el de ahora', p1.length === 3 && p1[0].classList.contains('now') && !p1[1].classList.contains('now'));
}

grupo('Counting: el anillo');
{
  const sesion = (bp) => (w) => {
    w.BarStockWeeklyCycle.estado = () => 'counting';
    w.BarStockCountSession = {
      progress: () => ({ counted: 120, total: 170 }),
      bottleProgress: () => bp,
      activeMs: () => 40 * 60000,
      fmtDur: (ms) => Math.round(ms / 60000) + ' min',
      cronoDesde: () => '2026-11-21T00:12:00Z',
      updatedAt: () => new Date(Date.now() - 2 * 60000).toISOString(),
      zonesUsed: () => ['Front bar'],
      missingRows: () => []
    };
    w.BarStockZones = { activas: () => true, paraPasada: () => 'Front bar',
      lista: () => [{ nombre: 'Front bar' }, { nombre: 'Walk-in' }, { nombre: 'Back bar' }] };
  };
  let c = tarjeta(pintar(entorno([], sesion({ contadas: 612, faltan: 178, antes: 790 }))), /Counting/i);
  prueba('es libre', !!c && c.classList.contains('m-hero-libre'), c && c.className);
  const txt = (sel) => c ? Array.from(c.querySelectorAll(sel)).map(x => x.textContent).join(' | ') : '';
  prueba('el anillo con el porcentaje', /77%/.test(txt('.m-hc-ring text')) && !!(c && c.querySelector('.m-hc-ring .arco')), txt('.m-hc-ring text'));
  prueba('botellas contra lo esperado', /Bottles612 of ~790/.test(txt('.m-hc-dat > div')), txt('.m-hc-dat > div'));
  prueba('lo que queda a tu ritmo', /Leftabout 12 min/.test(txt('.m-hc-dat > div')), txt('.m-hc-dat > div'));
  prueba('las zonas sin pisar, en pastillas', txt('.m-hc-chip') === 'Walk-in | Back bar', txt('.m-hc-chip'));
  prueba('el pie: el último escaneo', /^Last scan: Front bar · 2 min ago$/.test(txt('.m-hero-vs')), txt('.m-hero-vs'));
  prueba('Continue', /Continue/.test(txt('.m-hero-acts')));
  // Sin conteo anterior: ni porcentaje ni arco inventados.
  c = tarjeta(pintar(entorno([], sesion({ contadas: 40, faltan: 0, antes: 0 }))), /Counting/i);
  prueba('sin conteo anterior, sin arco y las botellas dentro',
    !!c && !!c.querySelector('.m-hc-ring text') && !c.querySelector('.m-hc-ring .arco') && c.querySelector('.m-hc-ring text').textContent === '40' && !/%/.test(c.textContent),
    c && c.querySelector('.m-hc-ring') && c.querySelector('.m-hc-ring').outerHTML.slice(0, 200));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
