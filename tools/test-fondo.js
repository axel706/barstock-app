#!/usr/bin/env node
/*
 * ── Aplicar y guardar el fondo, en src/fondo.js ──────────────────────
 *
 * Aplicar, cargar y guardar el fondo vivían dentro de un `<script>` del
 * index y sólo los podía usar el selector del escritorio. Se mudaron a
 * `src/fondo.js` para que el teléfono pueda usarlos sin copiarlos.
 *
 * Fue una mudanza, no un cambio. Lo que se protege:
 *
 *   1. Hace lo mismo que hacía: la misma capa, la misma clase en el
 *      body, la misma clave local y la misma columna en la nube.
 *   2. El selector del escritorio, corrido tal cual está en el index,
 *      sigue guardando igual.
 *   3. No quedan dos copias: el index ya no define las suyas.
 *   4. Se carga antes que quien lo usa.
 *
 *   node tools/test-fondo.js
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

// Supabase de mentira, con la forma de consulta que usa el fondo:
// from().select().eq().eq().single()  y  from().update().eq().
function nube(o) {
  const reg = { selects: [], updates: [] };
  const cliente = {
    from(tabla) {
      const q = { tabla, filtros: [] };
      const cadena = {
        select(cols) { q.cols = cols; return cadena; },
        update(obj) { q.update = obj; return cadena; },
        eq(k, v) {
          q.filtros.push([k, v]);
          if (q.update && q.filtros.length === 1) { reg.updates.push(q); return Promise.resolve({ error: null }); }
          return cadena;
        },
        async single() {
          reg.selects.push(q);
          if (q.cols === 'id') return { data: o.locId ? { id: o.locId } : null };
          if (q.cols === 'background_src') return { data: { background_src: o.nube || null } };
          return { data: null };
        }
      };
      return cadena;
    }
  };
  return { cliente, reg };
}

function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body><div id="bgLayer"></div><div id="bgGrid"></div>' +
    '<button id="bgRemoveBtn"></button><input id="bgCustomUrl"><button id="bgCustomApply"></button></body>',
    { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document; global.localStorage = w.localStorage;
  w.BARSTOCK_CONFIG = { LOCATION_NAME: 'The Crown Tavern', ACCOUNT_ID: 'wjm-hospitality' };
  const n = nube(o);
  if (!o.sinNube) w.BarStockSupabase = { getClient: () => n.cliente };
  for (const f of ['backgrounds', 'fondo']) {
    new Function('window', 'localStorage', 'document',
      fs.readFileSync(path.join(RAIZ, 'src/' + f + '.js'), 'utf8'))(w, w.localStorage, w.document);
  }
  return { w, reg: n.reg };
}

const capa = (w) => w.document.getElementById('bgLayer');

(async () => {

grupo('aplicar pinta la misma capa que antes');
{
  const { w } = entorno();
  w.BarStockFondo.aplicar('assets/backgrounds/crown-lounge.jpg');
  prueba('la imagen en #bgLayer', /crown-lounge\.jpg/.test(capa(w).style.backgroundImage), capa(w).style.backgroundImage);
  prueba('la capa activa', capa(w).classList.contains('active'));
  prueba('y la marca en el body', w.document.body.classList.contains('has-custom-bg'));
  w.BarStockFondo.aplicar('default');
  prueba('"default" la quita', !capa(w).style.backgroundImage && !capa(w).classList.contains('active') &&
    !w.document.body.classList.contains('has-custom-bg'));
}

grupo('la misma clave local');
{
  const { w } = entorno();
  prueba('por locacion, como antes', w.BarStockFondo.claveLocal() === 'bs_background_the_crown_tavern',
    w.BarStockFondo.claveLocal());
  w.localStorage.setItem('barstock.activeLocationName', "Will's & Bill's");
  prueba('y sigue a la locacion activa', w.BarStockFondo.claveLocal() === "bs_background_will's_&_bill's",
    w.BarStockFondo.claveLocal());
}

grupo('cargar: primero la nube, luego la copia local');
{
  const { w } = entorno({ locId: 'loc-1', nube: 'assets/backgrounds/jockey-bar.jpg' });
  await w.BarStockFondo.cargar();
  prueba('aplica el de la nube', /jockey-bar\.jpg/.test(capa(w).style.backgroundImage));
  prueba('y lo deja en la copia local', w.localStorage.getItem('bs_background_the_crown_tavern') === 'assets/backgrounds/jockey-bar.jpg');
}
{
  const { w } = entorno({ sinNube: true });
  w.localStorage.setItem('bs_background_the_crown_tavern', 'assets/backgrounds/midnight.svg');
  await w.BarStockFondo.cargar();
  prueba('sin red, la copia local', /midnight\.svg/.test(capa(w).style.backgroundImage));
}

grupo('guardar: copia local y la columna de siempre');
{
  const { w, reg } = entorno({ locId: 'loc-1' });
  await w.BarStockFondo.guardar('assets/backgrounds/neon-tall.jpg');
  prueba('lo aplica', /neon-tall\.jpg/.test(capa(w).style.backgroundImage));
  prueba('lo guarda en local', w.BarStockFondo.actual() === 'assets/backgrounds/neon-tall.jpg');
  const u = reg.updates[0] || {};
  prueba('y en la nube, en locations.background_src', u.tabla === 'locations' &&
    JSON.stringify(u.update) === JSON.stringify({ background_src: 'assets/backgrounds/neon-tall.jpg' }), JSON.stringify(u));
  prueba('de su locacion', JSON.stringify(u.filtros) === JSON.stringify([['id', 'loc-1']]), JSON.stringify(u.filtros));

  await w.BarStockFondo.guardar(null);
  prueba('quitarlo borra la copia local', !w.localStorage.getItem('bs_background_the_crown_tavern'));
  prueba('y deja la columna vacia', JSON.stringify((reg.updates[1] || {}).update) === JSON.stringify({ background_src: null }));
}

grupo('el selector del escritorio, tal cual esta en el index');
{
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const i = html.indexOf('// ===== BACKGROUND SELECTOR =====');
  const fin = html.indexOf('</script>', i);
  const selector = html.slice(i, fin);
  prueba('se encuentra', i > 0 && fin > i);

  const { w, reg } = entorno({ locId: 'loc-1' });
  new Function('window', 'localStorage', 'document', selector)(w, w.localStorage, w.document);
  w.dispatchEvent(new w.Event('load'));
  await esperar(10);
  prueba('sigue publicando BarStockBackground', typeof (w.BarStockBackground || {}).loadSavedBackground === 'function' &&
    typeof w.BarStockBackground.renderBgGrid === 'function');

  w.BarStockBackground.renderBgGrid();
  const miniaturas = w.document.querySelectorAll('#bgGrid .bg-thumb');
  prueba('pinta las miniaturas del catalogo', miniaturas.length === w.BarStockBackgrounds.lista().length + 1,
    String(miniaturas.length));
  const lounge = Array.from(miniaturas).find(m => /crown-lounge/.test(m.dataset.src));
  lounge.click();
  await esperar(10);
  prueba('elegir una la aplica', /crown-lounge\.jpg/.test(capa(w).style.backgroundImage));
  prueba('y la guarda en la nube como siempre', reg.updates.some(u =>
    u.update && u.update.background_src === 'assets/backgrounds/crown-lounge.jpg'));
  w.BarStockBackground.renderBgGrid();
  const activa = w.document.querySelector('#bgGrid .bg-thumb-active');
  prueba('y la marca como elegida', activa && /crown-lounge/.test(activa.dataset.src));

  // Una sola copia: el index ya no define las suyas.
  prueba('el index no aplica el fondo por su cuenta', !/function applyBackground\(/.test(selector));
  prueba('ni lo guarda', !/function saveBackground\(/.test(selector) && !/async function saveBackground/.test(selector));
  prueba('ni lo carga', !/async function loadSavedBackground/.test(selector));
}

grupo('se carga antes que quien lo usa');
{
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const p = (s) => html.indexOf(s);
  prueba('despues del catalogo', p('src/backgrounds.js') < p('src/fondo.js'));
  prueba('y antes del selector del escritorio', p('src/fondo.js') > 0 && p('src/fondo.js') < p('// ===== BACKGROUND SELECTOR ====='));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
