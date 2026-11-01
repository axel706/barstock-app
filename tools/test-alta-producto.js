#!/usr/bin/env node
/*
 * ── Dar de alta un producto desde el teléfono ───────────────────────
 *
 * Hasta ahora sólo se podía desde el escritorio, y de rebote:
 * resolviendo un "no match" de un conteo importado. Si entraba una
 * botella nueva en la barra, desde el teléfono no había forma.
 *
 * Y la pantalla abría en "Needs fixing", que contesta una pregunta de
 * mantenimiento. La de todos los días es "¿qué tengo?".
 *
 * Lo que se protege:
 *
 *   1. Se entra por "Everything", y va a la izquierda.
 *   2. El alta NO pide on hand. Un producto nuevo nace en cero, como
 *      todos: la existencia viene del escáner y de recibir mercancía.
 *      Ésa es la regla que hace que cada número se pueda rastrear, y
 *      la primera excepción es como deja de valer.
 *   3. Un duplicado no entra. Dos filas para la misma botella reparten
 *      el conteo, calculan el par sobre media historia y hacen que las
 *      facturas casen con la que no es.
 *   4. La fila local se añade DESPUÉS de que la nube conteste. El
 *      escritorio lo hace al revés y por eso puede quedarse con un
 *      producto que sólo existe en ese navegador.
 *   5. Si la nube falla, se dice en la hoja y no se añade nada.
 *
 *   node tools/test-alta-producto.js
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
const esperar = ms => new Promise(r => setTimeout(r, ms || 0));

const ITEMS = [
  ["Tito's Vodka",     'LOOP',      7.3, 18, 27.99, 'Vodka'],
  ['Absolut Citron',   'LOOP',      0,   6,  19.5,  'Vodka'],
  ['Averna Amaro',     'UNKNOWN',   0,   0,  0,     '']
];

function pantalla(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  w.state = { master: ITEMS.map(([item, vendor, onHand, suggested, value, category], i) => ({
    item, vendor, onHand, suggested, value, category,
    code: i === 0 ? '2153' : '', itemNorm: item.toLowerCase(),
    toOrder: Math.max(0, suggested - onHand)
  })) };
  w.normalizeName = (s) => String(s || '').trim().toLowerCase();
  w.computeToOrder = (oh, sug) => Math.max(0, (Number(sug) || 0) - (Number(oh) || 0));
  w.saveState = () => { w.__guardado = true; };
  w.render = () => {};
  w.getVendorsForFilter = () => ['ALL', 'LOOP', 'UNKNOWN'];
  w.getVendorsWithUnknown = () => ['BREAKTHRU', 'LOOP', 'SOUTHERN', 'UNKNOWN'];
  w.parAdjustments = new Map();
  w.BarStockToast = { show(t) { w.__toast = t; } };
  w.scrollTo = () => {};

  w.__creados = [];
  w.BarStockInventoryCloud = {
    createInventoryItem: async (d) => {
      if (o.falla) throw new Error('cloud down');
      w.__creados.push(d);
      return true;
    }
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

// Abre la hoja y rellena lo que se le pase.
function abrir(w, host, campos) {
  host.querySelector('#miNuevo').onclick();
  const h = w.document.querySelector('.m-sheet');
  campos = campos || {};
  if (campos.nombre !== undefined) h.querySelector('#mnName').value = campos.nombre;
  if (campos.code !== undefined) h.querySelector('#mnCode').value = campos.code;
  if (campos.par !== undefined) h.querySelector('#mnPar').value = String(campos.par);
  if (campos.precio !== undefined) h.querySelector('#mnVal').value = String(campos.precio);
  if (campos.vendor) {
    Array.from(h.querySelectorAll('[data-nv]'))
      .find(b => b.dataset.nv === campos.vendor).onclick();
  }
  return h;
}

const err = (h) => h.querySelector('#mnErr').textContent.trim();

(async () => {

grupo('se entra por Everything, y va primero');
{
  const { host } = pantalla();
  const bs = Array.from(host.querySelectorAll('#miSeg button'))
    .map(b => b.textContent.trim().replace(/\s+/g, ' '));
  prueba('Everything es el primero', /^Everything/.test(bs[0]), bs.join(' | '));
  prueba('y Needs fixing el segundo', /^Needs fixing/.test(bs[1]), bs.join(' | '));
  prueba('arranca en Everything',
    host.querySelector('#miSeg button').classList.contains('on'), bs.join(' | '));
  // Los tres, no sólo los incompletos.
  prueba('y enseña los tres', host.querySelectorAll('[data-i]').length === 3,
    String(host.querySelectorAll('[data-i]').length));
}

grupo('el botón de añadir está a la derecha del de filtros');
{
  const { host } = pantalla();
  const fila = host.querySelector('.m-inv-bar2');
  const ids = Array.from(fila.children).map(e => e.id || e.className);
  prueba('el botón existe', !!host.querySelector('#miNuevo'));
  prueba('y va después del de filtros',
    ids.indexOf('miNuevo') > ids.indexOf('miAdj'), ids.join(' | '));
  prueba('dice lo que hace', /Add a product/.test(
    host.querySelector('#miNuevo').getAttribute('aria-label')));
}

grupo('el alta no pide on hand');
{
  const { w, host } = pantalla();
  const h = abrir(w, host);
  const ids = Array.from(h.querySelectorAll('input')).map(i => i.id).sort();
  prueba('los campos son nombre, código, par y precio',
    ids.join('|') === 'mnCode|mnName|mnPar|mnVal', ids.join('|'));
  prueba('y la hoja lo explica', /starts at zero on hand/i.test(h.textContent));
  prueba('con el proveedor en UNKNOWN de salida',
    h.querySelector('[data-nv="UNKNOWN"]').classList.contains('on'));
}

grupo('dar de alta uno nuevo');
{
  const { w, host } = pantalla();
  const h = abrir(w, host, { nombre: 'Fernet Branca', code: '9981',
                             vendor: 'BREAKTHRU', par: 4, precio: 31.5 });
  h.querySelector('#mnSave').onclick();
  await esperar(20);

  prueba('se mandó a la nube', w.__creados.length === 1, JSON.stringify(w.__creados));
  const d = w.__creados[0] || {};
  prueba('con el nombre', d.item === 'Fernet Branca', d.item);
  prueba('el código', d.code === '9981', d.code);
  prueba('el proveedor', d.vendor === 'BREAKTHRU', d.vendor);
  prueba('el par', Number(d.suggested) === 4, String(d.suggested));
  prueba('el precio', Number(d.value) === 31.5, String(d.value));
  // Lo que nunca es otra cosa.
  prueba('y on hand en CERO', Number(d.onHand) === 0, String(d.onHand));

  prueba('la hoja se cerró', !w.document.querySelector('.m-sheet'));
  prueba('está en el catálogo local',
    w.state.master.some(r => r.item === 'Fernet Branca'));
  prueba('ordenado por nombre',
    w.state.master.map(r => r.item).join('|') ===
    ['Absolut Citron', 'Averna Amaro', 'Fernet Branca', "Tito's Vodka"].join('|'),
    w.state.master.map(r => r.item).join('|'));
  prueba('y se guardó', w.__guardado === true);
  prueba('con su toOrder calculado',
    w.state.master.find(r => r.item === 'Fernet Branca').toOrder === 4);
  prueba('la lista ya lo enseña', /Fernet Branca/.test(host.textContent));
}

grupo('sin nombre no hay producto');
{
  const { w, host } = pantalla();
  const h = abrir(w, host, { nombre: '   ' });
  h.querySelector('#mnSave').onclick();
  await esperar(20);
  prueba('lo dice', /name/i.test(err(h)), err(h));
  prueba('y no se mandó nada', w.__creados.length === 0);
  prueba('la hoja sigue abierta', !!w.document.querySelector('.m-sheet'));
}

grupo('un duplicado no entra');
{
  // Por NOMBRE, con el mismo criterio del resto de la app: mayúsculas
  // y espacios de más no hacen que sea otro producto.
  const { w, host } = pantalla();
  const h = abrir(w, host, { nombre: "  tito's VODKA " });
  h.querySelector('#mnSave').onclick();
  await esperar(20);
  prueba('avisa de cuál es', /Tito/.test(err(h)), err(h));
  prueba('y no lo crea', w.__creados.length === 0);
}
{
  // Y por CÓDIGO: el nombre puede escribirse de otra forma, pero el
  // código del proveedor es el que casa las facturas.
  const { w, host } = pantalla();
  const h = abrir(w, host, { nombre: 'Titos Vodka 1L', code: '2153' });
  h.querySelector('#mnSave').onclick();
  await esperar(20);
  prueba('el código repetido también para', /already in the catalogue/.test(err(h)), err(h));
  prueba('y no lo crea', w.__creados.length === 0);
}

grupo('si la nube falla, no se inventa un producto local');
{
  const { w, host } = pantalla({ falla: true });
  const h = abrir(w, host, { nombre: 'Fernet Branca' });
  h.querySelector('#mnSave').onclick();
  await esperar(20);
  prueba('se dice en la hoja', /cloud down/.test(err(h)), err(h));
  prueba('la hoja sigue abierta para reintentar', !!w.document.querySelector('.m-sheet'));
  prueba('el botón se vuelve a poder pulsar',
    !w.document.querySelector('#mnSave').disabled);
  // Lo importante: nada a medias. El escritorio escribe local primero
  // y por eso puede dejar un producto que sólo existe en ese navegador.
  prueba('y NO quedó en el catálogo local',
    !w.state.master.some(r => r.item === 'Fernet Branca'),
    w.state.master.map(r => r.item).join('|'));
}

grupo('el ritmo de la hoja lo pone un solo sitio');
{
  // "VENDOR" salia pegado a la tarjeta del producto, y las distancias
  // entre bloques eran tres distintas sin querer: los proveedores
  // dejaban 14px debajo, el contador 4 y el precio 4. Cada control
  // traia su propio margen.
  //
  // Se invirtio: separa el TITULO del bloque siguiente por arriba, y
  // los controles no ponen nada debajo. Si uno vuelve a poner su
  // margen, el acordeon vuelve.
  const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8');

  const bloque = (sel) => {
    const re = new RegExp('(^|[\\n}])\\s*' +
      sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm');
    const m = re.exec(css);
    return m ? m[2] : null;
  };

  const titulo = bloque('.m-edit .m-sheet-t');
  prueba('el titulo separa por arriba', !!titulo && /margin-top:\s*20px/.test(titulo), titulo);

  const ceros = bloque('.m-edit .m-money');
  prueba('y los controles no separan por abajo',
    !!ceros && /margin-bottom:\s*0/.test(ceros), ceros);
  prueba('los tres a la vez, no uno por uno',
    /\.m-edit \.m-chips,\s*\n\s*\.m-edit \.m-step,\s*\n\s*\.m-edit \.m-money/.test(css));

  // Los botones separan MAS que los titulos: no se pulsa de paso lo
  // que se iba a ajustar.
  const acts = bloque('.m-edit .m-acts');
  prueba('y los botones se separan mas', !!acts && /margin-top:\s*24px/.test(acts), acts);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
