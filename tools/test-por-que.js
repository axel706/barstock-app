/*
 * ── El por qué de lo que se acaba (fase 3 de docs/plan-pedido.md) ─────
 *
 * Axel, 2026-11-18, sobre lámina (opción E): bajo cada producto de
 * Running out, lo que quedará al final de cada día y una frase con el
 * por qué; en el correo, la frase. Lo que no puede volver a pasar:
 *
 *   1. Las barras y el "Out" con dos cuentas: el día del "Out" la barra
 *      tiene que estar en 0 (pedido.recorrido es seAcaba sin pararse).
 *   2. Una frase que dice lo que los datos no dicen: cada plantilla sale
 *      sólo con su número detrás.
 *   3. Barras inventadas para lo que Toast no vende (sin demanda).
 *   4. El correo sin la misma frase que la tarjeta.
 *
 *   node tools/test-por-que.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = ms => new Promise(r => setTimeout(r, ms || 0));

const w = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
w.eval(leer('src/toast-usage.js'));
w.eval(leer('src/pedido.js'));
w.eval(leer('src/run-out.js'));
const P = w.BarStockPedido, R = w.BarStockRunOut;
// Una hora de Nueva York (invierno, UTC−5) a milisegundos.
const NY = (s) => { const [d, h] = s.split(' '); return Date.parse(d + 'T' + h + ':00Z') + 5 * 3600e3; };

(async () => {

grupo('1 · las barras y el "Out", una sola cuenta (pedido.recorrido)');
{
  const dem = { porDia: [1, 0, 1, 1, 1, 1, 1], semanal: 6, sigma: 1 };   // el lunes cerrado
  const op = { dem, stock: 3, viene: [], ahora: NY('2026-11-18 10:00'), dias: 7 };
  const rec = P.recorrido && P.recorrido(op);
  const fin = P.seAcaba(op);
  prueba('existe y devuelve los días y el fin', !!rec && Array.isArray(rec.dias) && rec.dias.length === 7);
  prueba('el fin es el MISMO que seAcaba', !!rec && JSON.stringify(rec.fin) === JSON.stringify(fin), JSON.stringify([rec && rec.fin, fin]));
  const elDia = rec && fin ? rec.dias.find(d => d.dia === fin.dia) : null;
  prueba('el día del "Out", la barra está en 0', !!elDia && elDia.seguro === 0 && elDia.agotado, JSON.stringify(elDia));
  prueba('los días de antes, por encima de 0', !!rec && fin && rec.dias.filter(d => d.dia < fin.dia).every(d => d.seguro > 0));
  const conLlegada = P.recorrido({ dem, stock: 3, viene: [{ cuando: NY('2026-11-19 16:00'), n: 12 }], ahora: NY('2026-11-18 10:00'), dias: 6 });
  const jue = conLlegada.dias.find(d => d.dia === '2026-11-19');
  prueba('una entrega ya pedida sube su día y lo dice (+12)', jue && jue.llega === 12 && jue.seguro > 5, JSON.stringify(jue));
  const lun = conLlegada.dias.find(d => d.dia === '2026-11-23');
  prueba('el lunes cerrado va marcado', !!lun && lun.cerrado === true);
}

// Una fila como las de run-out.ahora(): miércoles 18 a las 3 PM.
const AHORA = NY('2026-11-18 15:00');
const base = (o) => Object.assign({
  producto: 'Nino', live: 3.1, margen: 0, viene: [], hoyVendido: 0, hoyFrac: null, hoySync: null, ahoraMs: AHORA,
  dem: { porDia: [3, 0, 2, 3.3, 3, 5, 8], semanal: 24.3, sigma: 2, tendencia: 1, reciente: 24 }
}, o || {});

grupo('2 · la frase: cada plantilla, sólo con su número detrás (run-out.porQue)');
{
  prueba('existen porQue y recorridoDe', typeof R.porQue === 'function' && typeof R.recorridoDe === 'function');
  let f = base({ agota: '2026-11-19' });
  let q = R.porQue(f);
  prueba('lo de siempre: lo que se usa hasta que se acaba, y nada en camino', q && q.tipo === 'normal' && q.texto === 'Wed–Thu usually use 6.3. Nothing on the way.', q && q.texto);
  f = base({ agota: '2026-11-18' });
  prueba('se acaba hoy: "A Wednesday uses 3.3."', /^A Wednesday uses 3\.3\./.test(R.porQue(f).texto), R.porQue(f).texto);
  f = base({ agota: '2026-11-19', viene: [{ cuando: new Date(NY('2026-11-19 16:00')).toISOString(), n: 12 }] });
  prueba('con algo en camino, cuánto y cuándo llega', / 12 arrive Thu 4 PM\.$/.test(R.porQue(f).texto), R.porQue(f).texto);
  f = base({ agota: '2026-11-18', dem: Object.assign({}, base().dem, { tendencia: 1.5 }) });
  q = R.porQue(f);
  prueba('se vende más que de costumbre (1.3× o más)', q.tipo === 'sube' && /^Selling 1\.5× its usual\. A Wednesday uses 3\.3\.$/.test(q.texto), q.texto);
  f = base({ agota: '2026-11-18', dem: Object.assign({}, base().dem, { tendencia: 1.2 }) });
  prueba('con 1.2× no se dice', R.porQue(f).tipo === 'normal');
  f = base({ agota: '2026-11-18', hoyVendido: 12.5, hoySync: new Date(NY('2026-11-18 15:00')).toISOString(), dem: Object.assign({}, base().dem, { tendencia: 1.5 }) });
  q = R.porQue(f);
  prueba('hoy muy por encima de un día normal: va primero y sola', q.tipo === 'hoy' && q.texto === '12.5 sold today by 3 PM. A Wednesday usually sells 3.3.', q.texto);
  f = base({ agota: '2026-11-18', hoyVendido: 3.5, hoySync: new Date(AHORA).toISOString() });
  prueba('hoy apenas por encima (3.5 contra 3.3) no es "muy por encima"', R.porQue(f).tipo !== 'hoy');
  prueba('sin demanda (lo que Toast no vende), ni frase ni barras', R.porQue(base({ dem: null })) === null && R.recorridoDe(base({ dem: null })) === null);
  const rd = R.recorridoDe(base({ agota: '2026-11-18' }));
  prueba('las barras son cinco días desde hoy', rd && rd.dias.length === R.DIAS_BARRAS && rd.dias[0].dia === '2026-11-18', JSON.stringify(rd && rd.dias.map(d => d.dia)));
}

grupo('3 · la tarjeta de Running out (opción E)');
{
  const t = new JSDOM('<!doctype html><body><div id="mScreens"><div id="mHome"></div></div></body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  t.console = { log() {}, warn() {}, error() {} };
  t.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k' };
  t.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-1' };
  t.fetch = async () => ({ ok: true, status: 200, text: async () => '[]' });
  t.BarStockRest = { leerTodo: async () => [] };
  t.eval(leer('src/toast-usage.js')); t.eval(leer('src/pedido.js')); t.eval(leer('src/run-out.js'));
  const filas = {
    Nino: base({ agota: '2026-11-18', viene: [{ cuando: new Date(NY('2026-11-19 16:00')).toISOString(), n: 12 }] }),
    Beam: null   // lo que Toast no vende: sin fila de run-out
  };
  const master = [{ item: 'Nino', vendor: 'WINE MERCHANT', onHand: 3 }, { item: 'Beam', vendor: 'LOOP', onHand: 1 }];
  t.state = { master };
  t.BarStockRunningOut = { lista: () => master.map(r => ({ r, item: r.item, dias: 0, out: { txt: 'Out today', tono: 'r', enDias: 0 }, vivo: true, fuera: false })) };
  t.BarStockLiveCache = { cuanto: (r) => (filas[r.item] ? 3.1 : 1), pedir: () => 6, agota: () => ({ txt: 'Out today', tono: 'r', enDias: 0 }),
    vivo: () => true, conteo: () => null, caducar() {}, alCambiar: () => () => {}, fila: (r) => filas[r.item] };
  t.BarStockGuest = { puede: () => true, nombre: () => 'Ana' };
  t.BarStockMobile = { enBanda: () => true, alVolverBanda() {}, salirBanda() {} };
  for (const f of ['src/shopping-list.js', 'src/stock-checks.js', 'src/num-pad.js', 'src/check-shelf.js', 'src/mobile-running-out.js']) t.eval(leer(f));
  await t.BarStockRunningOutReview.abrir(t.document.getElementById('mHome'));
  await esperar(20);
  const card = (n) => t.document.querySelector(`.m-ro-c[data-item="${n}"]`);
  const nino = card('Nino');
  const dias = nino ? [...nino.querySelectorAll('.m-ro-dia')] : [];
  prueba('bajo el nombre, los cinco días', dias.length === 5, String(dias.length));
  prueba('hoy primero, en 0 y en rojo (se acaba hoy)', dias[0] && dias[0].classList.contains('hoy') && dias[0].classList.contains('cero') &&
    /^0Today$/.test(dias[0].textContent.replace(/\s+/g, '')), dias[0] && dias[0].className + ' ' + dias[0].textContent);
  prueba('la entrega del jueves en azul con su +12', dias[1] && dias[1].classList.contains('llega') && /\+12/.test(dias[1].textContent), dias[1] && dias[1].textContent);
  prueba('se vuelve a acabar tras la entrega: ese 0 otra vez en rojo, y lo de después apagado',
    dias[3] && dias[3].classList.contains('cero') && dias[4] && dias[4].classList.contains('nada'), dias.map(d => d.className).join(' | '));
  const why = nino && nino.querySelector('.m-ro-why');
  prueba('debajo, la franja con la frase', !!why && /A Wednesday uses 3\.3\. 12 arrive Thu 4 PM\./.test(why.textContent), why && why.textContent);
  prueba('y antes de los botones', !!why && !!nino.querySelector('.m-ro-btns') &&
    (why.compareDocumentPosition(nino.querySelector('.m-ro-btns')) & t.Node.DOCUMENT_POSITION_FOLLOWING) > 0);
  const beam = card('Beam');
  prueba('lo que Toast no vende: sin barras ni frase', !!beam && !beam.querySelector('.m-ro-dias') && !beam.querySelector('.m-ro-why'));
}

grupo('4 · el correo: la misma frase');
{
  const mr = leer('src/morning-report.js');
  prueba('datos() lleva el por qué de la misma fila', /porque: pq \? pq\.texto/.test(mr) && /R\.porQue\(f\)/.test(mr));
  const M = require(path.join(RAIZ, 'lib/morning-report.js'));
  const AYER = { fecha: '2026-11-17', dia: 'Tue', cargado: true, dinero: 3000, licor: 1500, vino: 1500, normalDinero: 3000, normalLicor: 1500, normalVino: 1500,
    botellas: 30, botLicor: 15, botVino: 15, normalBotellas: 30, normalBotLicor: 15, normalBotVino: 15 };
  const { html } = M.armar({ local: 'The Crown Tavern', hoy: '2026-11-18', ayer: AYER,
    agotan: [{ producto: 'Nino', queda: 3.1, agota: '2026-11-18', vende: 3.3, llega: 0, pedir: 6, porque: 'Selling 1.5× its usual. A Wednesday uses 3.3.' }] });
  const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  prueba('bajo el producto, lo que queda y la frase', /3\.1 left · Selling 1\.5× its usual\. A Wednesday uses 3\.3\./.test(texto), texto.slice(texto.indexOf('Nino'), texto.indexOf('Nino') + 140));
  const sin = M.armar({ local: 'The Crown Tavern', hoy: '2026-11-18', ayer: AYER,
    agotan: [{ producto: 'Nino', queda: 3.1, agota: '2026-11-18', vende: 3.3, llega: 0, pedir: 6 }] }).html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  prueba('sin frase, como antes ("usually sells")', /usually sells 3\.3/.test(sin));
  const malo = M.armar({ local: 'X', hoy: '2026-11-18', ayer: AYER,
    agotan: [{ producto: 'Nino', queda: 3.1, agota: '2026-11-18', vende: 3.3, llega: 0, pedir: 6, porque: '<b>x</b>' + 'y'.repeat(400) }] }).html;
  prueba('la frase va escapada y recortada', !/<b>x<\/b>/.test(malo) && !/y{200}/.test(malo));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
