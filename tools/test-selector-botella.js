#!/usr/bin/env node
/*
 * ── El selector de botella ───────────────────────────────────────────
 *
 * En el teléfono era el modal del escritorio: una caja con su propio
 * scroll y los botones al fondo, ordenada de gorda a flaca y en español.
 * Con más de ochenta siluetas ya no se encontraba nada. Axel: "necesita
 * adaptarse a la versión móvil, una barra de búsqueda y orden
 * alfabético por default". Eligió sobre lámina la rejilla con sugeridas.
 *
 * Lo que se protege:
 *
 *   1. A–Z, con `none` al final.
 *   2. La búsqueda sin acentos: "bacardi" encuentra Bacardí.
 *   3. En el teléfono es una hoja (#bpSheet), con búsqueda, sugeridas
 *      (la actual y la de su categoría) y la rejilla; escribir filtra y
 *      quita las sugeridas.
 *   4. Guardar manda la forma y el tamaño elegidos, igual que antes.
 *   5. Se abre encima de la ficha de Inventory (#mSheet) y cerrarlo no se
 *      la lleva: por eso tiene id propio.
 *   6. En el escritorio sigue el modal, ya en inglés.
 *   7. Los tamaños, en una sola fila en el teléfono.
 *
 *   node tools/test-selector-botella.js
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d !== undefined ? '   → ' + d : '')); }
}
function grupo(t) { console.log('\n' + t); }
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

function entorno({ movil = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://app.barstockpro.com/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  if (movil) w.document.body.classList.add('m-shell');
  w.matchMedia = (q) => ({ matches: movil && /max-width/.test(q) });
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k' };
  w.BarStockInventoryCloud = { fetchLocationId: async () => 'loc-1' };
  w.__peticiones = [];
  w.fetch = async (u, o) => { w.__peticiones.push({ u, o }); return { ok: true, text: async () => '' }; };
  w.Element.prototype.scrollIntoView = function () {};
  for (const f of ['src/bottle-profiles.js', 'src/bottle-assign.js', 'src/bottle-picker.js']) w.eval(leer(f));
  return w;
}
const FILA = { item: 'Triage Blood Orange Vodka', category: 'Vodka', bottleShape: 'grey_goose', bottleSizeMl: 750 };

(async () => {

grupo('1 · A–Z, con none al final');
{
  const w = entorno();
  const V = w.BarStockBottleProfiles;
  const k = w.BarStockBottlePicker._ordenadas();
  const nombres = k.filter(x => x !== 'none').map(x => V.get(x).name);
  const norm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const enOrden = nombres.every((n, i) => i === 0 || norm(nombres[i - 1]).localeCompare(norm(n), 'en', { numeric: true }) <= 0);
  prueba('en orden alfabetico', enOrden, nombres.slice(0, 6).join(', '));
  prueba('none va al final', k[k.length - 1] === 'none', k[k.length - 1]);
  prueba('estan todas las que se ofrecen', k.length === V.pickable().length, k.length + ' de ' + V.pickable().length);
}

grupo('2 · la busqueda, sin acentos');
{
  const w = entorno();
  const V = w.BarStockBottleProfiles;
  const n = (q) => w.BarStockBottlePicker._filtradas(q).map(k => V.get(k).name);
  prueba('"bacardi" encuentra Bacardí', n('bacardi').includes('Bacardí'), n('bacardi').join(', '));
  prueba('"patron" encuentra Patrón', n('patron').includes('Patrón'), n('patron').join(', '));
  prueba('"DON" encuentra las tres de Don Julio', n('DON').filter(x => /Don Julio/.test(x)).length === 3, n('DON').join(', '));
  prueba('algo que no existe: ninguna', n('zzzz').length === 0);
}

grupo('3 · en el telefono es una hoja');
{
  const w = entorno();
  const d = w.document;
  w.BarStockBottlePicker.open(Object.assign({}, FILA));
  const h = d.getElementById('bpSheet');
  prueba('se abre la hoja #bpSheet', !!h && h.classList.contains('m-sheet'));
  prueba('y no el modal del escritorio', !d.getElementById('bpModalBg') || d.getElementById('bpModalBg').classList.contains('hidden'));
  prueba('con la busqueda', !!d.getElementById('bpQ'));
  const lbls = [...d.querySelectorAll('#bpRej .bp-lbl')].map(x => x.textContent);
  prueba('con sugeridas y luego todas', /Suggested/.test(lbls[0] || '') && /All bottles/.test(lbls[1] || ''), lbls.join(' | '));
  const sug = [...d.querySelectorAll('#bpRej .bp-rej')[0].querySelectorAll('.bp-c')].map(c => c.dataset.k + ':' + (c.querySelector('.bp-cs') || {}).textContent);
  prueba('la actual, marcada como Current', sug[0] === 'grey_goose:Current', sug.join(' '));
  prueba('y la de su categoria', sug.some(x => x.endsWith('Its category')), sug.join(' '));
  prueba('la actual sale marcada', !!d.querySelector('#bpRej .bp-c.on[data-k="grey_goose"]'));
  const q = d.getElementById('bpQ');
  q.value = 'don'; q.dispatchEvent(new w.Event('input'));
  const tras = [...d.querySelectorAll('#bpRej .bp-c')].map(c => c.dataset.k);
  prueba('escribir filtra', tras.length === 3 && tras.every(k => /don_julio/.test(k)), tras.join(' '));
  prueba('y quita las sugeridas', !/Suggested/.test(d.getElementById('bpRej').textContent));
  prueba('la busqueda sigue siendo el mismo campo (el teclado no se cierra)', d.getElementById('bpQ') === q);
  d.getElementById('bpClear').click();
  prueba('la X la borra y vuelven las sugeridas', q.value === '' && /Suggested/.test(d.getElementById('bpRej').textContent));
}

grupo('4 · guardar');
{
  const w = entorno();
  const d = w.document;
  const fila = Object.assign({}, FILA);
  let guardado = null;
  w.BarStockBottlePicker.open(fila, (s, t) => { guardado = [s, t]; });
  d.querySelector('#bpRej .bp-c[data-k="belvedere"]').click();
  d.querySelector('.bp-size[data-s="1000"]').click();
  d.getElementById('bpSave').click();
  await esperar(30);
  const p = w.__peticiones.find(x => x.o && x.o.method === 'PATCH');
  const cuerpo = p ? JSON.parse(p.o.body) : {};
  prueba('manda la forma y el tamano elegidos', cuerpo.bottle_shape === 'belvedere' && cuerpo.bottle_size_ml === 1000, JSON.stringify(cuerpo));
  prueba('avisa a quien lo abrio', !!guardado && guardado[0] === 'belvedere' && guardado[1] === 1000, guardado && guardado.join(' '));
  prueba('y la hoja se cierra', !d.getElementById('bpSheet'));
}

grupo('5 · encima de la ficha de Inventory');
{
  const w = entorno();
  const d = w.document;
  const ficha = d.createElement('div'); ficha.id = 'mSheet'; ficha.className = 'm-sheet'; d.body.appendChild(ficha);
  w.BarStockBottlePicker.open(Object.assign({}, FILA));
  prueba('las dos abiertas a la vez', !!d.getElementById('mSheet') && !!d.getElementById('bpSheet'));
  d.getElementById('bpCancel').click();
  prueba('Cancel cierra el selector y deja la ficha', !d.getElementById('bpSheet') && !!d.getElementById('mSheet'));
}

grupo('6 · en el escritorio, el modal, en ingles');
{
  const w = entorno({ movil: false });
  const d = w.document;
  w.BarStockBottlePicker.open(Object.assign({}, FILA));
  const m = d.getElementById('bpModalBg');
  prueba('se abre el modal', !!m && !m.classList.contains('hidden'));
  prueba('no la hoja', !d.getElementById('bpSheet'));
  const t = m ? m.textContent : '';
  prueba('Bottle shape, Cancel, Save', /Bottle shape/.test(t) && /Cancel/.test(t) && /Save/.test(t), t.slice(0, 80));
  prueba('sin espanol en el selector', !/Cancelar|Guardar|Silueta de la botella|sin deslizador/.test(t));
}
{
  const src = leer('src/bottle-picker.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  prueba('ni en el codigo que pinta', !/>Cancelar<|>Guardar<|Silueta de la botella|'sin deslizador'|No se pudo guardar/.test(src));
}

grupo('7 · los tamanos, en una fila en el telefono');
{
  const css = leer('styles/mobile-app.css').replace(/\/\*[\s\S]*?\*\//g, '');
  prueba('#bpSheet .bp-sizes sin saltar de renglon', /#bpSheet \.bp-sizes\s*\{[^}]*flex-wrap:\s*nowrap\s*!important/.test(css));
}

grupo('8 · por encima de todo lo que lo abre');
{
  const css = leer('styles/mobile-app.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const m = /#bpSheet\s*\{\s*z-index:\s*(\d+)/.exec(css);
  const z = m ? Number(m[1]) : 0;
  const cp = (leer('styles/count-panel.css').match(/z-index:\s*(\d+)/g) || []).map(x => Number(x.replace(/\D/g, '')));
  prueba('por encima del panel de conteo', z > Math.max(...cp), z + ' vs ' + Math.max(...cp));
  prueba('y por debajo de la animacion de actualizar', z < 1000001, z);
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
