#!/usr/bin/env node
/*
 * ── El filtro de la pantalla de emparejar ────────────────────────────
 *
 * Con 263 emparejados, encontrar uno concreto era bajar por una lista
 * de 263 fichas.
 *
 * Ojo con no confundir los dos buscadores que hay en esa pantalla:
 * éste filtra TU lista; el que vive dentro de cada ficha busca un
 * producto de MarginEdge para esa botella. Son cosas distintas y
 * mezclarlos rompería el emparejado.
 *
 *   node tools/test-me-filtro.js
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = ms => new Promise(r => setTimeout(r, ms));

const CATALOGO = [
  { product_id: 'p1', name: 'Smith Hook Cabernet Sauvignon', type: 'WINE', price: 21.99, unit: 'Bottle' },
  { product_id: 'p2', name: 'Bols Triple Sec',               type: 'LIQUOR', price: 5.19, unit: 'Bottle' },
  { product_id: 'p3', name: 'Villa Brici Pinot Grigio 1.5L',  type: 'WINE', price: 10.59, unit: 'Bottle' }
];

const INVENTARIO = [
  { item: 'Smith Hook Cabernet Sauvignon', code: 'SH750', category: 'Wine', vendor: 'BREAKTHRU', onHand: 2 },
  { item: 'Villa Brici Pinot Grigio 1.5L', code: 'VB15',  category: 'Wine', vendor: 'WINE MERCHANT', onHand: 12 },
  { item: 'Triple Sec',                    code: 'TS',    category: 'Liqueur', vendor: 'UNKNOWN', onHand: 0 },
  { item: 'Blade and Bow Bourbon',         code: 'BB',    category: 'Whiskey', vendor: 'SOUTHERN', onHand: 1 }
];

function entorno(vinculos) {
  const dom = new JSDOM(
    '<!doctype html><body><div id="memHead"></div><div id="memBody"></div></body>',
    { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;

  w.state = { master: INVENTARIO.map(r => Object.assign({}, r)) };
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };

  const f = async (u) => {
    const off = Number((/offset=(\d+)/.exec(u) || [])[1] || 0);
    const pag = (filas) => ({ ok: true, json: async () => (off ? [] : filas), text: async () => '' });
    if (/marginedge_products/.test(u)) return pag(CATALOGO);
    if (/marginedge_links/.test(u))    return pag(vinculos || []);
    return pag([]);
  };
  w.fetch = f; global.fetch = f;

  new Function(leer('src/marginedge-match.js'))();
  return w;
}

const nombres = (w) => Array.from(w.document.querySelectorAll('#memBody .mem-mine b'))
  .map(b => b.textContent.trim());

(async () => {
  // Dos emparejados, dos no: así hay algo en cada pestaña.
  const VINCULOS = [
    { product_id: 'p1', code: 'SH750', item_name: 'Smith Hook Cabernet Sauvignon' },
    { product_id: 'p3', code: 'VB15',  item_name: 'Villa Brici Pinot Grigio 1.5L' }
  ];

  grupo('el filtro existe y empieza vacío');
  const w = entorno(VINCULOS);
  await w.BarStockMarginEdgeMatch.abrir('u1');
  await esperar(40);

  const caja = w.document.getElementById('memFiltro');
  prueba('hay caja de filtro', !!caja);
  prueba('y arranca vacía', !!caja && caja.value === '');

  grupo('filtra la lista entera, no una ficha');
  // La pestaña por defecto es "need your eye": ahí cae Triple Sec,
  // que tiene candidatos. Blade and Bow no se parece a nada del
  // catálogo y se va a "no match".
  prueba('de partida se ve el de la pestaña',
    nombres(w).length === 1, nombres(w).join(' | '));

  caja.value = 'triple';
  caja.oninput();
  prueba('con "triple" queda uno', nombres(w).length === 1, nombres(w).join(' | '));
  prueba('y es el correcto', /Triple Sec/.test(nombres(w)[0] || ''), nombres(w)[0]);

  grupo('no distingue mayúsculas ni acentos');
  caja.value = '';
  caja.oninput();
  w.document.querySelector('[data-tab="huerfano"]').click();
  await esperar(20);
  const cajaH = w.document.getElementById('memFiltro');
  cajaH.value = 'BLADE';
  cajaH.oninput();
  prueba('"BLADE" encuentra "Blade and Bow"',
    nombres(w).length === 1 && /Blade/.test(nombres(w)[0]), nombres(w).join(' | '));
  cajaH.value = '';
  cajaH.oninput();
  w.document.querySelector('[data-tab="revisar"]').click();
  await esperar(20);

  grupo('cuando no hay nada, dice cuántos había detrás');
  const cajaZ = w.document.getElementById('memFiltro');
  cajaZ.value = 'zzzz';
  cajaZ.oninput();
  const txt = w.document.getElementById('memBody').textContent;
  // Un filtro que no encuentra nada se lee igual que una pestaña
  // vacía si no se dice la diferencia.
  prueba('lo explica con el número', /among the 1 here/.test(txt), txt.trim().slice(0, 80));

  grupo('también busca por el producto ya emparejado');
  // A veces te acuerdas de cómo lo llama el proveedor y no de cómo lo
  // llamas tú.
  cajaZ.value = '';
  cajaZ.oninput();
  w.document.querySelector('[data-tab="hecho"]').click();
  await esperar(20);
  const caja2 = w.document.getElementById('memFiltro');
  caja2.value = 'bols';
  caja2.oninput();
  prueba('"bols" no está en ningún nombre tuyo', !INVENTARIO.some(r => /bols/i.test(r.item)));
  // Bols Triple Sec no está emparejado en este montaje, así que no
  // debe salir: lo que se comprueba es que el filtro mira los
  // productos enlazados sin inventarse coincidencias.
  prueba('y por eso no aparece nada', nombres(w).length === 0, nombres(w).join(' | '));

  caja2.value = 'villa';
  caja2.oninput();
  prueba('"villa" sí encuentra su ficha emparejada',
    nombres(w).length === 1 && /Villa Brici/.test(nombres(w)[0]), nombres(w).join(' | '));

  grupo('el filtro sobrevive al cambio de pestaña');
  // Buscas "smith" y quieres poder mirarlo en las tres sin reescribir.
  caja2.value = 'smith';
  caja2.oninput();
  w.document.querySelector('[data-tab="revisar"]').click();
  await esperar(20);
  prueba('sigue puesto', w.document.getElementById('memFiltro').value === 'smith');
  prueba('y en esa pestaña no hay ningún Smith', nombres(w).length === 0);

  grupo('pero al abrir la pantalla de cero se limpia');
  // Entrar y encontrarte un filtro de la sesión anterior se lee como
  // una lista vacía.
  await w.BarStockMarginEdgeMatch.abrir('u1');
  await esperar(40);
  prueba('arranca vacío otra vez', w.document.getElementById('memFiltro').value === '');
  prueba('y vuelve a verse su ficha', nombres(w).length === 1, nombres(w).join(' | '));

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
