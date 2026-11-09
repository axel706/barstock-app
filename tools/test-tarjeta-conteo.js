#!/usr/bin/env node
/*
 * ── La tarjeta del conteo a medias ───────────────────────────────────
 *
 * Tenía una línea de texto y dos renglones de aire: mucha tarjeta para
 * muy poco. La plantilla reserva tres renglones a TODAS, así que lo que
 * había que arreglar no era el alto —ése es fijo a propósito— sino que
 * no le estábamos metiendo nada.
 *
 * Lo que se protege:
 *
 *   1. El cuerpo lleva SIEMPRE tres renglones. Es lo que hacía que la
 *      tarjeta se viera vacía, y es lo primero que se volvería a
 *      perder.
 *   2. La estimación NO sale al principio. Con seis contadas en dos
 *      minutos el ritmo se calcula sobre dos minutos: el número baila
 *      y un número que baila se deja de creer.
 *   3. Cuando sale, el cálculo es el correcto: tiempo activo por
 *      botella, por las que faltan.
 *   4. Nunca se enseñan prosa y renglones a la vez. El cuerpo son tres
 *      renglones y punto: las dos cosas juntas desbordan y la tarjeta
 *      crece, que es el fallo que la plantilla vino a resolver.
 *
 *   node tools/test-tarjeta-conteo.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const SRC = fs.readFileSync(path.join(RAIZ, 'src/mobile-home.js'), 'utf8');
const MIN = 60 * 1000;

// `onHand` es lo de la ULTIMA vez: durante el conteo no se toca (sólo
// lo escribe el cierre). Por defecto 4 botellas por producto.
const inv = (n, ultima) => Array.from({ length: n }, (_, i) => ({
  item: 'ITEM ' + i, code: 'C' + i, vendor: 'ACME', bottleSizeMl: 750,
  onHand: ultima === undefined ? 4 : ultima, toOrder: 1
}));

// o: { total, contadas, ms, zona, zonas, usadas, viejo, pausado, hace }
function entorno(o) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  w.state = { master: inv(o.total, o.ultima) };

  w.BarStockWeeklyCycle = {
    estado: () => 'counting',
    resetAt: () => '2026-10-25T08:00:00Z',
    fmtDate: () => 'Oct 25',
    edadCiclo: () => 2 * 86400000,
    cicloViejo: () => false,
    pausado: () => !!o.pausado,
    abandonado: () => !!o.viejo,
    hace: (ms) => Math.round(ms / MIN) + ' min'
  };

  // La sesión de verdad no hace falta: lo que la tarjeta pregunta es
  // esto, y con esto se cubren todos los estados sin montar un conteo.
  w.BarStockCountSession = {
    progress: () => ({ counted: o.contadas, total: o.total }),
    size: () => o.contadas,
    // Lo de las botellas lo calcula la sesión (bottleProgress). Aquí se
    // simula con la misma regla: cada producto contado lleva `porProd`
    // botellas (3 por defecto) y lo que falta va producto por producto.
    bottleProgress: () => {
      const por = o.porProd === undefined ? 3 : o.porProd;
      const ult = o.ultima === undefined ? 4 : o.ultima;
      const contadas = o.contadas * por;
      const faltan = o.contadas * Math.max(0, ult - por) + (o.total - o.contadas) * ult;
      return { contadas, faltan, antes: o.total * ult };
    },
    activeMs: () => o.ms || 0,
    fmtDur: (ms) => {
      const s = Math.max(0, Math.round(Number(ms) || 0) / 1000);
      if (s < 60) return Math.round(s) + ' s';
      const m = Math.round(s / 60);
      if (m < 60) return m + ' min';
      const h = Math.floor(m / 60), r = m % 60;
      return r ? h + ' h ' + r + ' min' : h + ' h';
    },
    updatedAt: () => new Date(Date.now() - (o.hace == null ? 2 * MIN : o.hace)).toISOString(),
    cronoDesde: () => new Date(Date.now() - (o.ms || 0)).toISOString(),
    zonesUsed: () => o.usadas || [],
    missingRows: () => inv(Math.max(0, o.total - o.contadas))
  };

  w.BarStockZones = {
    lista: () => o.zonas || [],
    activas: () => (o.zonas || []).length > 0,
    paraPasada: () => o.zona || ''
  };

  w.getActiveVendors = () => [];
  w.getOrderRowsForVendor = () => [];
  w.computeOrderSubtotal = () => 0;
  w.isRowPlaced = () => false;
  w.BARSTOCK_CONFIG = {};
  w.BarStockToast = { show() {} };

  new Function(SRC)();
  return w;
}

function tarjeta(w) {
  const host = w.document.createElement('div');
  host.className = 'm-screen on';
  host.setAttribute('data-screen', 'home');
  w.document.body.appendChild(host);
  w.BarStockMobileHome.render(host);
  return Array.from(host.querySelectorAll('.m-hero'))
    .find(c => /Count paused|Counting|Count abandoned/.test(c.textContent));
}

const renglones = (c) => Array.from(c.querySelectorAll('.m-hero-ln .m-hln'))
  .map(f => ({
    n: (f.querySelector('.n') || {}).textContent || '',
    v: (f.querySelector('.v') || {}).textContent || ''
  }));

const BASE = { total: 162, zona: 'Closet', zonas: ['Closet', 'Bar 1', 'Cellar', 'Patio'],
               usadas: ['Closet'] };

grupo('el cuerpo nunca se queda vacío');
{
  const c = tarjeta(entorno(Object.assign({}, BASE, { contadas: 6, ms: 2 * MIN, pausado: true })));
  prueba('la tarjeta está', !!c);
  const r = renglones(c);
  prueba('con tres renglones, no uno', r.length === 3, r.length + ': ' + JSON.stringify(r));
  prueba('y sin la línea de prosa suelta', !c.querySelector('.m-hero-s'));
}

grupo('al principio no se estima nada');
{
  // Seis contadas en dos minutos. El ritmo sale de dos minutos.
  const c = tarjeta(entorno(Object.assign({}, BASE, { contadas: 6, ms: 2 * MIN })));
  const r = renglones(c);
  const texto = JSON.stringify(r);
  prueba('no promete un tiempo restante', !/Left at this pace/.test(texto), texto);
  // Nada de repetir lo contado ni el tiempo: eso ya esta en el titulo
  // y en la cifra grande. Aqui va lo que no esta en ningun sitio.
  prueba('dice a que hora empezaste', r.some(x => /Started/.test(x.n) && /\d/.test(x.v)), texto);
  prueba('sin repetir lo contado', !/Counted/.test(texto), texto);
  prueba('y las zonas donde no has entrado',
    r.some(x => /Not started/.test(x.n) && /Bar 1/.test(x.v) && /Cellar/.test(x.v)), texto);
  prueba('sin contar la que ya tocaste',
    !r.some(x => /Not started/.test(x.n) && /Closet/.test(x.v)), texto);
}

grupo('con suficientes, sí, y por BOTELLAS');
{
  // Axel, 2026-11-09: "125 de 174" en 37 min daba "18 s a bottle" y
  // "15 min" que no eran verdad. Era tiempo entre PRODUCTOS, y suponía
  // que los que faltan estaban en fila esperando. Lo que falta son
  // botellas, muchas de productos ya escaneados en otra zona.
  //
  // 40 productos × 3 botellas = 120 botellas en 20 min = 10 s cada una.
  // Faltan: de los 40 contados, 1 cada uno (tenían 4) = 40; de los 122
  // sin tocar, 4 cada uno = 488. Total 528 × 10 s = 88 min.
  const c = tarjeta(entorno(Object.assign({}, BASE, { contadas: 40, ms: 20 * MIN })));
  const r = renglones(c);
  const texto = JSON.stringify(r);
  prueba('la estimación sale', r.some(x => /Left at this pace/.test(x.n)), texto);
  prueba('calculada por botellas, producto por producto',
    r.some(x => /Left at this pace/.test(x.n) && /1 h 28 min/.test(x.v)), texto);
  prueba('sin el renglón de ritmo "a bottle" que era por producto', !/a bottle/.test(texto), texto);
  prueba('los productos bajan a un renglón', r.some(x => /Products/.test(x.n) && /40 of 162/.test(x.v)), texto);
  const tit = (c.querySelector('.m-hero-t') || {}).textContent || '';
  prueba('el titular son las botellas', /120/.test(tit) && /bottles/.test(tit) && !/of 162/.test(tit), tit);
  const pie = (c.querySelector('.m-hero-vs') || {}).textContent || '';
  prueba('el pie dice las botellas que faltan', /≈528 bottles left/.test(pie), pie);
  const tr = c.querySelectorAll('.m-tramos i');
  prueba('diez tramos', tr.length === 10, String(tr.length));
  // 120 de 648 (lo que llevas más lo que falta) = 19 %: dos tramos.
  prueba('encendidos por lo que llevas de lo esperado', c.querySelectorAll('.m-tramos i.on').length === 2,
    String(c.querySelectorAll('.m-tramos i.on').length));
  prueba('con la raya al final', !!c.querySelector('.m-tramos b'));
  prueba('y sin la barra fina de antes', !c.querySelector('.m-prog'));
  prueba('y el último escaneo con su zona',
    r.some(x => /Last scan/.test(x.n) && /Closet/.test(x.v)), texto);
  prueba('siguen siendo tres', r.length === 3, String(r.length));
}

grupo('cerca del final salen los nombres');
{
  // Con doce o menos pendientes, "7 left" no manda a nadie a ningun
  // estante y los NOMBRES si. Un renglon por botella y no una lista
  // separada por comas: la lista era prosa, y la prosa dejaba los
  // otros dos renglones en blanco — justo lo que esta tarjeta venia a
  // dejar de hacer.
  const c = tarjeta(entorno(Object.assign({}, BASE, { contadas: 155, ms: 70 * MIN })));
  const r = renglones(c);
  prueba('tres renglones, uno por botella', r.length === 3, JSON.stringify(r));
  prueba('con sus nombres', /ITEM 0/.test((r[0] || {}).n || ''), JSON.stringify(r));
  // El resto se cuenta en el ULTIMO renglon y no en `mas`: `mas` va
  // entre el cuerpo y el pie, y con `vs` puesto son dos renglones
  // donde solo cabe uno. Hay una prueba vieja que lo vigila.
  prueba('y el resto en el ultimo renglon', /\+5 more/.test((r[2] || {}).n || ''), JSON.stringify(r));
  prueba('sin usar `mas`', !c.querySelector('.m-hero-mas'));
  prueba('sin prosa suelta', !c.querySelector('.m-hero-s'));

  // El tiempo total es la CIFRA GRANDE, en todos los estados: es el
  // dato que se mira a mitad de conteo. El porcentaje baja al pie,
  // donde ya estaba lo que falta — y de todas formas la barra y el
  // titulo ya lo dicen.
  prueba('la cifra grande es el tiempo total',
    /1:10/.test((c.querySelector('.m-hero-amt') || {}).textContent || ''),
    (c.querySelector('.m-hero-amt') || {}).textContent);
  const pie = (c.querySelector('.m-hero-vs') || {}).textContent || '';
  prueba('y el pie lleva las botellas que faltan', /bottles left/.test(pie), pie);
}

grupo('si hoy hay más que la última vez');
{
  // Todo contado y con más botellas que la última vez: no hay "lo que
  // falta". La barra llega a la raya y el pie dice cuánto de más.
  const c = tarjeta(entorno(Object.assign({}, BASE, { contadas: 162, ms: 60 * MIN, porProd: 5 })));
  const pie = (c.querySelector('.m-hero-vs') || {}).textContent || '';
  prueba('los diez tramos encendidos', c.querySelectorAll('.m-tramos i.on').length === 10);
  prueba('el pie dice cuánto de más', /162 more than last time/.test(pie), pie);
  prueba('y no promete tiempo', !/Left at this pace[^"]*min/.test(JSON.stringify(renglones(c))), JSON.stringify(renglones(c)));
}

grupo('una locación sin conteo anterior');
{
  // Sin lo de la última vez no hay nada que esperar: ni raya ni "left".
  const c = tarjeta(entorno(Object.assign({}, BASE, { contadas: 40, ms: 20 * MIN, ultima: 0 })));
  prueba('sin tramos', !c.querySelector('.m-tramos'));
  const pie = (c.querySelector('.m-hero-vs') || {}).textContent || '';
  prueba('sin inventar lo que falta', !/left/.test(pie), pie);
  prueba('ni un tiempo restante', !/Left at this pace/.test(JSON.stringify(renglones(c))));
  prueba('pero el titular sigue en botellas', /120/.test((c.querySelector('.m-hero-t') || {}).textContent));
}

grupo('abandonado dice desde cuándo');
{
  const c = tarjeta(entorno(Object.assign({}, BASE,
    { contadas: 40, ms: 20 * MIN, viejo: true, hace: 3 * 24 * 60 * MIN })));
  const r = renglones(c);
  const texto = JSON.stringify(r);
  prueba('lo primero es el abandono', /Untouched/.test((r[0] || {}).n || ''), texto);
  prueba('la cifra grande sigue siendo el tiempo total',
    /20/.test((c.querySelector('.m-hero-amt') || {}).textContent || ''),
    (c.querySelector('.m-hero-amt') || {}).textContent);
  prueba('no la estimación — ahí no sirve de nada',
    !/Left at this pace/.test(texto), texto);
  prueba('y siguen siendo tres', r.length === 3, String(r.length));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
