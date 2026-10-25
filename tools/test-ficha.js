#!/usr/bin/env node
/*
 * ── La ficha de producto ─────────────────────────────────────────────
 *
 * Lo que de verdad hay que proteger aquí es la BOTELLA. Es un dibujo,
 * así que si miente no se nota: no da error, no cuadra mal una suma,
 * simplemente enseña un nivel que no es.
 *
 *   1. Se dibuja la botella PARCIAL y se dice cuántas enteras hay
 *      además. Con 1.96 se dibuja la de 0.96 y sobra una; con 2
 *      justas se dibuja una llena y sobra otra. Sin esa cuenta, dos
 *      botellas se veían como una.
 *   2. Una botella justa está llena, no vacía. La parte decimal de 2.0
 *      es cero y sin corregirlo se dibujaba al vacío.
 *   3. El nivel sale de heightFor, el mismo que mueve el deslizador
 *      del conteo. Si esta pantalla hiciera su propia cuenta, lo
 *      dibujado y lo contado acabarían discrepando.
 *   4. Las zonas sólo salen si están encendidas, y "no repartido" se
 *      distingue de "función apagada".
 *
 *   node tools/test-ficha.js
 */

const path = require('path');
const fs = require('fs');
const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let pasa = 0, falla = 0;
function ok(n, c, d) {
  if (c) { pasa++; console.log('  ok   ' + n); }
  else { falla++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const eq = (n, got, esp) =>
  ok(n, JSON.stringify(got) === JSON.stringify(esp),
     'dio ' + JSON.stringify(got) + ', esperaba ' + JSON.stringify(esp));

function abrir(opts) {
  const o = opts || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  new Function(fs.readFileSync(path.join(RAIZ, 'src/bottle-profiles.js'), 'utf8'))();

  w.state = { master: [{
    item: "Tito's Vodka", vendor: 'LOOP', code: '2153', category: 'Vodka',
    onHand: o.onHand != null ? o.onHand : 1.96, suggested: o.par != null ? o.par : 18,
    value: 26.99, bottleShape: o.shape !== undefined ? o.shape : 'vodka', bottleSizeMl: 750
  }] };
  w.normalizeName = (s) => String(s || '').toLowerCase();
  w.parAdjustments = new Map([["Tito's Vodka||2153",
    { avgUsed: o.avg != null ? o.avg : 14.4, normalWeeks: o.semanas != null ? o.semanas : 9,
      suggestedOptimal: 20 }]]);

  w.BarStockZones = o.zonas
    ? { lista: () => [{}], cargar: async () => {}, activas: () => true,
        donde: async () => (o.reparto === false ? null :
          { zonas: [{ zona: 'Back bar', botellas: 1.2 }, { zona: 'Storage', botellas: 0.76 }],
            at: Date.now() }) }
    : { lista: () => [], cargar: async () => {}, activas: () => false, donde: async () => null };

  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {} };
  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-search.js'), 'utf8'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

  const host = w.document.createElement('div');
  host.className = 'm-screen on';
  host.dataset.screen = 'search';
  w.document.body.appendChild(host);
  def.mount(host);
  host.querySelector('#msInput').value = 'tito';
  host.querySelector('#msInput').oninput();
  host.querySelector('.m-res').click();
  return { w, host };
}

const esperar = () => new Promise(r => setTimeout(r, 20));
const rectoClip = (host) => {
  const r = host.querySelector('.m-bot clipPath rect');
  return r ? Number(r.getAttribute('y')) : null;
};

async function main() {

console.log('\nla botella dice cuántas hay');
{
  // 1.96 -> se dibuja la de 0.96 y sobra UNA entera.
  const a = abrir({ onHand: 1.96 });
  ok('con 1.96 avisa de la entera que sobra', /\+1 full/.test(a.host.textContent));

  // 2 justas -> se dibuja una llena y sobra OTRA. Antes este caso
  // enseñaba una botella y nada mas: dos se veian como una.
  const b = abrir({ onHand: 2 });
  ok('con 2 justas también', /\+1 full/.test(b.host.textContent));

  const c = abrir({ onHand: 1 });
  ok('con 1 no sobra ninguna', !/full/.test(c.host.textContent));

  const d = abrir({ onHand: 0.5 });
  ok('con media tampoco', !/full/.test(d.host.textContent));

  const e = abrir({ onHand: 5.3 });
  ok('con 5.3 sobran cinco', /\+5 full/.test(e.host.textContent));
}

console.log('\ny la dibuja al nivel que es');
{
  // El recorte marca la superficie del liquido: cuanto MAS lleno,
  // mas arriba empieza, o sea menor y.
  const lleno = rectoClip(abrir({ onHand: 1 }).host);
  const medio = rectoClip(abrir({ onHand: 0.5 }).host);
  const poco  = rectoClip(abrir({ onHand: 0.1 }).host);
  ok('llena empieza más arriba que media', lleno < medio, lleno + ' vs ' + medio);
  ok('y media más arriba que casi vacía', medio < poco, medio + ' vs ' + poco);

  // Una botella justa esta LLENA. La parte decimal de 2.0 es cero y
  // sin corregirlo se dibujaba al vacio.
  eq('2.0 se dibuja igual que 1.0', rectoClip(abrir({ onHand: 2 }).host), lleno);

  const vacia = abrir({ onHand: 0 });
  ok('en cero no se pinta líquido', !vacia.host.querySelector('.m-bot g[clip-path]'));
  ok('pero la botella sigue ahí', !!vacia.host.querySelector('.m-bot svg path'));
}

console.log('\nsin forma asignada no se rompe');
{
  const sin = abrir({ shape: null });
  ok('se dibuja la genérica', !!sin.host.querySelector('.m-bot svg path'));
}

console.log('\nel color dice el estado antes que el número');
{
  eq('en cero, rojo', abrir({ onHand: 0 }).host.querySelector('.m-fic').className,
     'm-fic m-fic-mal');
  eq('por los suelos, ámbar', abrir({ onHand: 1.96, par: 18 }).host.querySelector('.m-fic').className,
     'm-fic m-fic-ojo');
  eq('bien, neutro', abrir({ onHand: 16, par: 18 }).host.querySelector('.m-fic').className,
     'm-fic m-fic-bien');
}

console.log('\n"1 day", no "1 days"');
{
  // avg 7/semana y 1 en mano = exactamente un dia.
  const uno = abrir({ onHand: 1, avg: 7, par: 18 });
  ok('singular', /Runs out in 1 day\b/.test(uno.host.textContent) &&
                 !/1 days/.test(uno.host.textContent));
  const varios = abrir({ onHand: 4, avg: 7, par: 18 });
  ok('y plural cuando toca', /Runs out in 4 days/.test(varios.host.textContent));
}

console.log('\nlos días sólo con historia suficiente');
{
  // Por debajo de cuatro semanas el promedio es una corazonada, y
  // "te alcanza para seis dias" calculado sobre eso es de los que se
  // creen.
  const poca = abrir({ semanas: 2 });
  ok('no se dice cuánto aguanta', !/Runs out in/.test(poca.host.textContent));
  ok('y se explica por qué', /needs 4 weeks · has 2/.test(poca.host.textContent));
}

console.log('\nlas zonas');
{
  const con = abrir({ zonas: true });
  await esperar();
  ok('encendidas, dice dónde está', /Where it is/i.test(con.host.textContent));
  ok('con el reparto', /Back bar/.test(con.host.textContent) && /Storage/.test(con.host.textContent));

  const sinReparto = abrir({ zonas: true, reparto: false });
  await esperar();
  // No es lo mismo que no tener zonas, y se dice.
  ok('sin reparto, lo dice', /Not counted by zone yet/i.test(sinReparto.host.textContent));

  const sin = abrir({ zonas: false });
  await esperar();
  // Apagadas no se dice NADA: eso es un ajuste, no un dato del
  // producto, y en el telefono estorba mas de lo que informa.
  eq('apagadas, ni una palabra', sin.host.querySelector('#msZonas').innerHTML, '');
}

console.log('\n' + (falla ? falla + ' FALLO(S)' : 'todo bien') + '   ·   ' + pasa + ' comprobaciones');
process.exit(falla ? 1 : 0);
}

main();
