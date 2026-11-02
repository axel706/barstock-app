#!/usr/bin/env node
/*
 * ── Las listas de inventario ya no esconden nada ────────────────────
 *
 * Había una regla —"dormido": sin stock, sin par y quieto ocho
 * semanas— que sacaba productos de la lista de Inventory, en el móvil
 * y en el escritorio, con un interruptor para volver a verlos.
 *
 * Lo que costó: contando de noche, tres botellas no aparecían al
 * buscarlas y parecía que el inventario se estaba borrando. Y la
 * pestaña decía "Everything 164" con 260 productos en la base — una
 * pestaña que se llama Everything no puede esconder 96.
 *
 * Y lo peor no era el filtro, era que PARPADEABA: `estaQuieto`
 * devuelve false mientras sus datos no han cargado, así que el mismo
 * producto estaba al entrar y desaparecía un segundo después.
 *
 * Lo que se protege:
 *
 *   1. La lista del móvil enseña TODO, pase lo que pase con la regla.
 *   2. Los números del segmentado cuadran con lo que se ve.
 *   3. Ya no hay interruptor de dormidos en ninguna de las dos.
 *   4. Pero el TOTAL DEL CONTEO sí los sigue dejando fuera: ahí no es
 *      mentir, es no pedirte que cuentes lo que no existe.
 *
 *   node tools/test-sin-dormidos.js
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

// Baileys es el caso real: sin proveedor, sin precio, sin par, cero
// botellas. Dormido de manual.
const ITEMS = [
  ['Baileys Irish Cream', 'UNKNOWN', 0, 0,  0,     ''],
  ['Averna Amaro',        'UNKNOWN', 0, 0,  0,     ''],
  ["Tito's Vodka",        'LOOP',    7, 18, 27.99, 'Vodka'],
  ['Absolut Citron',      'LOOP',    0, 6,  19.5,  'Vodka']
];
const DORMIDOS = new Set(['Baileys Irish Cream', 'Averna Amaro']);

function pantalla() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.state = { master: ITEMS.map(([item, vendor, onHand, suggested, value, category]) => ({
    item, vendor, onHand, suggested, value, category,
    code: '', itemNorm: item.toLowerCase(),
    toOrder: Math.max(0, suggested - onHand)
  })) };
  w.normalizeName = (s) => String(s || '').trim().toLowerCase();
  w.getVendorsForFilter = () => ['ALL', 'LOOP', 'UNKNOWN'];
  w.getVendorsWithUnknown = () => ['LOOP', 'UNKNOWN'];
  w.parAdjustments = new Map();
  w.BarStockToast = { show() {} };
  w.scrollTo = () => {};

  // La regla SIGUE EXISTIENDO y diciendo que sí. Lo que se prueba es
  // que a la lista ya le da igual: con un stub que escondiera nada,
  // esta prueba no probaría nada.
  w.BarStockDormant = {
    estaQuieto: (r) => DORMIDOS.has(r.item),
    oculto: (r) => DORMIDOS.has(r.item),
    cuantos: (rows) => (rows || []).filter(r => DORMIDOS.has(r.item)).length,
    listo: () => true, mostrandoTodo: () => false, verTodo() {},
    cargar: async () => new Map(), SEMANAS_QUIETO: 8
  };

  let def = null;
  w.BarStockMobile = { register(d) { def = d; }, ir() {}, refrescarBadges() {} };
  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-inventory.js'), 'utf8'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

  const host = w.document.createElement('div');
  host.className = 'm-screen on'; host.dataset.screen = 'inventory';
  w.document.body.appendChild(host);
  def.mount(host);
  return { w, host };
}

const nombres = (host) =>
  Array.from(host.querySelectorAll('.m-inv-n')).map(e => e.textContent.trim()).sort();

(() => {

grupo('Everything es everything');
{
  const { host } = pantalla();
  prueba('salen los cuatro', nombres(host).length === 4, nombres(host).join(' | '));
  prueba('Baileys entre ellos', nombres(host).includes('Baileys Irish Cream'),
    nombres(host).join(' | '));
}

grupo('y el número del segmentado cuadra con lo que se ve');
{
  // "Everything 164" con 260 en la base era la pestaña mintiendo.
  const { host } = pantalla();
  const seg = Array.from(host.querySelectorAll('#miSeg button'))
    .map(b => b.textContent.trim().replace(/\s+/g, ' '));
  prueba('Everything dice 4', /Everything 4$/.test(seg[0]), seg.join(' | '));
  prueba('y la lista tiene 4', nombres(host).length === 4, String(nombres(host).length));
  // Los incompletos también cuentan sobre todo el maestro: los dos
  // sin proveedor, sin precio y sin par — que son justo los que la
  // regla escondía.
  prueba('Needs fixing los cuenta todos', /Needs fixing 2$/.test(seg[1]), seg.join(' | '));
}

grupo('buscar encuentra lo que antes estaba escondido');
{
  const { host } = pantalla();
  const inp = host.querySelector('#miInput');
  inp.value = 'baileys'; inp.oninput();
  prueba('aparece', nombres(host).join('|') === 'Baileys Irish Cream',
    nombres(host).join(' | '));
}

grupo('ya no hay interruptor de dormidos');
{
  const { w, host } = pantalla();
  host.querySelector('#miAdj').onclick();
  const hoja = w.document.querySelector('.m-sheet');
  prueba('el cajón de filtros abre', !!hoja);
  prueba('sin el interruptor', !hoja.querySelector('#miDorm'));
  prueba('y sin mencionar dormidos', !/dormant/i.test(hoja.textContent),
    hoja.textContent.slice(0, 160));
  // Lo que sí sigue: proveedor y orden.
  prueba('proveedor sigue', !!hoja.querySelector('[data-v]'));
  prueba('y el orden también', !!hoja.querySelector('[data-o]'));
}

grupo('ni la lista del móvil ni la del escritorio lo consultan ya');
{
  const inv = fs.readFileSync(path.join(RAIZ, 'src/mobile-inventory.js'), 'utf8');
  const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  prueba('mobile-inventory no lo menciona', !/BarStockDormant/.test(inv));
  prueba('ni guarda el interruptor', !/_verDormidos/.test(inv));
  prueba('index.html tampoco', !/BarStockDormant/.test(idx));
  prueba('y se fue el chip de "N hidden"', !/toggleDormant|chipQuietos/.test(idx));
}

grupo('pero el TOTAL DEL CONTEO sí los sigue dejando fuera');
{
  // Ahí esconder no es mentir: un producto sin stock, sin par y quieto
  // ocho semanas no se contó porque no había nada que contar. Meterlo
  // en "faltan 96" entierra los que sí importan.
  const cs = fs.readFileSync(path.join(RAIZ, 'src/count-session.js'), 'utf8');
  prueba('count-session lo sigue usando', /BarStockDormant/.test(cs));
  prueba('en pedible()', /function pedible[\s\S]{0,320}estaQuieto/.test(cs));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
