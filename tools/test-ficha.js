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

console.log('\nla botella es un medidor contra el par');
{
  // Antes dibujaba la parte decimal del on hand y debajo escribía
  // "+N full". Eso contesta cómo está la botella abierta, que no es lo
  // que se mira al buscar un producto. Ahora el par es la botella
  // llena y el on hand marca el nivel.
  const a = abrir({ onHand: 1.96, par: 18 });
  ok('ya no se cuentan botellas enteras aparte', !/full/.test(a.host.textContent));

  const b = abrir({ onHand: 5.3, par: 18 });
  ok('tampoco con decimales', !/full/.test(b.host.textContent));
}

console.log('\ny el nivel es on hand contra par');
{
  // El recorte marca la superficie: cuanto MÁS lleno, más arriba
  // empieza, o sea menor y.
  const lleno = rectoClip(abrir({ onHand: 18, par: 18 }).host);
  const medio = rectoClip(abrir({ onHand: 9,  par: 18 }).host);
  const poco  = rectoClip(abrir({ onHand: 2,  par: 18 }).host);
  ok('al par, lleno del todo', lleno < medio, lleno + ' vs ' + medio);
  ok('a la mitad del par, a media altura', medio < poco, medio + ' vs ' + poco);

  // Lo que el par cambia: el mismo on hand con otro par se dibuja
  // distinto. Antes 7.3 se veía igual tuviera par 18 o par 2.
  const parAlto = rectoClip(abrir({ onHand: 7.3, par: 18 }).host);
  const parBajo = rectoClip(abrir({ onHand: 7.3, par: 8 }).host);
  ok('el mismo stock con par menor se ve más lleno', parBajo < parAlto,
     parBajo + ' vs ' + parAlto);

  // 2 de 2 es lleno, igual que 18 de 18.
  eq('2 de 2 llena igual que 18 de 18',
     rectoClip(abrir({ onHand: 2, par: 2 }).host), lleno);

  // Por encima del par no se desborda.
  eq('pasarse del par no desborda',
     rectoClip(abrir({ onHand: 40, par: 18 }).host), lleno);

  const vacia = abrir({ onHand: 0, par: 18 });
  ok('en cero no se pinta líquido', !vacia.host.querySelector('.m-bot g[clip-path]'));
  ok('pero la botella sigue ahí', !!vacia.host.querySelector('.m-bot svg path'));

  const sinPar = abrir({ onHand: 5, par: 0 });
  ok('sin par no hay medidor', !sinPar.host.querySelector('.m-bot g[clip-path]'));
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
