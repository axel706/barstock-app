#!/usr/bin/env node
/*
 * ── Los precios que esperan aprobación ───────────────────────────────
 *
 * El objetivo de toda la integración con MarginEdge son tres cosas:
 * traer facturas, emparejar productos y actualizar precios. Las dos
 * primeras pasaban solas o al menos se veían. La tercera no avisaba
 * de nada: el cálculo existía dentro de la cuarta pestaña de un panel
 * de Ajustes, con un botón que había que ir a pulsar.
 *
 * O sea que las facturas entraban solas y los precios se quedaban
 * viejos — y de ahí salen el valor del inventario y el coste de cada
 * orden.
 *
 * Lo que se protege:
 *
 *   1. El cálculo NO se repite. Lo hace el módulo de compras, que es
 *      su dueño. Dos reglas de "qué precio vale" dirían cosas
 *      distintas en la campana y en la lista.
 *   2. Un aviso, no doce. Doce renglones entierran todo lo demás y la
 *      acción es la misma para los doce.
 *   3. El umbral decide a quién se molesta, NO qué se actualiza. La
 *      lista enseña todos los cambios aunque el aviso sólo cuente los
 *      grandes.
 *   4. Un pendiente es una TAREA: lleva su acción, no una X. Cerrar
 *      algo que hay que hacer es esconderlo.
 *   5. Lo pendiente y lo ya aplicado no se mezclan. Uno es un recibo
 *      y el otro un encargo.
 *
 *   node tools/test-precios-aviso.js
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

const CAMBIO = (item, antes, precio, factura) =>
  ({ item, antes, precio, factura: factura || '88213',
     fecha: '2026-10-28', vendor: 'BREAKTHRU' });

function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.scrollTo = () => {};

  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };

  // Sin red: lo aplicado y los descartes se devuelven vacíos salvo
  // que la prueba diga otra cosa.
  const red = async (u) => ({
    ok: true, text: async () => '',
    json: async () => (/price_log/.test(u) ? (o.aplicados || []) : [])
  });
  w.fetch = red; global.fetch = red;

  // El dueño del cálculo. Aquí se prueba que la campana lo USA, no
  // que lo calcule bien — eso es de su propio módulo.
  w.__aplicados = null;
  w.__vecesCalculado = 0;
  w.BarStockMarginEdgePurchases = {
    calcularPrecios: async () => {
      w.__vecesCalculado++;
      return { cambios: o.cambios || [], conPrecio: 0, sinTocar: 0 };
    },
    aplicarPrecios: async (cambios) => {
      w.__aplicados = cambios;
      if (o.fallaAplicar) throw new Error('cloud down');
      return { ok: cambios.length, problemas: [] };
    }
  };

  new Function(fs.readFileSync(path.join(RAIZ, 'src/mobile-notif.js'), 'utf8'))();
  return w;
}

// Monta el panel y devuelve su cuerpo.
async function panel(w) {
  await w.BarStockMobileNotif.abrir();
  await esperar(30);
  return w.document.getElementById('mNotifBody');
}

(async () => {

grupo('un aviso, no doce');
{
  const w = entorno({ cambios: [
    CAMBIO("Tito's Vodka", 26.99, 31.85),    // +18%
    CAMBIO('Jameson', 34.50, 32.43, '88190'), //  −6%
    CAMBIO('Bulleit', 22.40, 25.09),          // +12%
    CAMBIO('Cointreau', 31.00, 31.10)         //  +0.3%, por debajo del umbral
  ] });
  const caja = await panel(w);
  const avisos = caja.querySelectorAll('.m-nf');
  prueba('solo uno', avisos.length === 1, String(avisos.length));

  const t = caja.textContent;
  prueba('con la cuenta de los que pasan el umbral', /3 prices changed/.test(t), t.slice(0, 90));
  prueba('y los dos mayores por nombre', /Tito/.test(t) && /Bulleit|Jameson/.test(t), t.slice(0, 140));
  prueba('dice de cuantas facturas vienen', /2 invoices/.test(t), t.slice(0, 160));
  prueba('el de 0,3% no se cuenta', !/4 prices/.test(t), t.slice(0, 90));
}

grupo('es una tarea, asi que lleva accion y no una X');
{
  const w = entorno({ cambios: [CAMBIO("Tito's Vodka", 26.99, 31.85)] });
  const caja = await panel(w);
  const fila = caja.querySelector('.m-nf');
  prueba('tiene boton de atender', !!fila.querySelector('[data-ver]'));
  prueba('y no boton de cerrar', !fila.querySelector('[data-x]'),
    'cerrar algo que hay que hacer es esconderlo');
}

grupo('el umbral decide a quien se molesta, no que se actualiza');
{
  const w = entorno({ cambios: [
    CAMBIO("Tito's Vodka", 26.99, 31.85),   // +18%, avisa
    CAMBIO('Cointreau', 31.00, 31.10)       // +0.3%, no avisa
  ] });
  const caja = await panel(w);
  caja.querySelector('[data-ver]').click();
  await esperar(10);

  const filas = caja.querySelectorAll('.m-nf-pr');
  prueba('la lista enseña los dos', filas.length === 2, String(filas.length));
  prueba('incluido el pequeño', /Cointreau/.test(caja.textContent));
  prueba('y el boton los actualiza todos',
    /Update 2 prices/.test((caja.querySelector('.m-nf-aplicar') || {}).textContent || ''),
    (caja.querySelector('.m-nf-aplicar') || {}).textContent);
}

grupo('aprobar todos de golpe');
{
  const w = entorno({ cambios: [
    CAMBIO("Tito's Vodka", 26.99, 31.85),
    CAMBIO('Bulleit', 22.40, 25.09)
  ] });
  const caja = await panel(w);
  caja.querySelector('[data-ver]').click();
  await esperar(10);
  caja.querySelector('.m-nf-aplicar').click();
  await esperar(40);

  prueba('se aplican por el modulo de compras', Array.isArray(w.__aplicados));
  prueba('los dos', (w.__aplicados || []).length === 2, String((w.__aplicados || []).length));
  prueba('y lo dice', /2 prices updated/.test(caja.textContent), caja.textContent.slice(0, 90));
}

grupo('si falla, no se traga el error');
{
  const w = entorno({ cambios: [CAMBIO("Tito's Vodka", 26.99, 31.85)], fallaAplicar: true });
  const caja = await panel(w);
  caja.querySelector('[data-ver]').click();
  await esperar(10);
  caja.querySelector('.m-nf-aplicar').click();
  await esperar(40);

  prueba('lo dice', /cloud down/.test(caja.textContent), caja.textContent.slice(0, 120));
  // Un botón deshabilitado para siempre no dice si funcionó, si falló
  // o si sigue trabajando. Ya pasó una vez en el panel del escritorio.
  const b = caja.querySelector('.m-nf-aplicar');
  prueba('y el boton vuelve, para reintentar', b && !b.disabled);
}

grupo('sin cambios no molesta');
{
  const w = entorno({ cambios: [] });
  const caja = await panel(w);
  prueba('no hay aviso de precios', !/prices changed/.test(caja.textContent),
    caja.textContent.slice(0, 80));
}

grupo('el calculo no se repite en la campana');
{
  // Si la campana se hiciera su propia cuenta, el dia que cambie que
  // precio vale —el de la ultima factura, el medio, el del proveedor
  // habitual— la campana y la lista dirian cosas distintas.
  const src = fs.readFileSync(path.join(RAIZ, 'src/mobile-notif.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  prueba('pregunta al modulo de compras', /calcularPrecios\(\)/.test(src));
  prueba('y no lee las lineas de factura por su cuenta',
    !/marginedge_invoice_lines/.test(src));
  prueba('ni los enlaces', !/marginedge_links/.test(src));
  prueba('ni escribe precios', !/aplicarPrecios\s*=\s*async/.test(src));

  // Y el modulo de compras lo expone, que es lo que lo hace posible.
  const compras = fs.readFileSync(path.join(RAIZ, 'src/marginedge-purchases.js'), 'utf8');
  prueba('compras exporta el calculo', /calcularPrecios,\s*aplicarPrecios/.test(compras));
}

grupo('lo pendiente y lo ya aplicado no se mezclan');
{
  // `marginedge_price_log` es un RECIBO: se escribe despues de
  // aplicar. Un recibo y un encargo en el mismo grupo se leen igual, y
  // entonces el encargo no se hace.
  const w = entorno({
    cambios: [CAMBIO("Tito's Vodka", 26.99, 31.85)],
    aplicados: [{ id: 9, item_name: 'Bulleit', price_before: 22.40, price_after: 25.09,
                  invoice_number: '88213', invoice_date: '2026-10-20',
                  vendor_name: 'BREAKTHRU', applied_at: '2026-10-20T10:00:00Z' }]
  });
  const caja = await panel(w);
  const labs = Array.from(caja.querySelectorAll('.m-nf-lab')).map(x => x.textContent);
  prueba('hay dos grupos', labs.length === 2, labs.join(' | '));
  prueba('y el pendiente va primero', /WAITING/.test(labs[0] || ''), labs.join(' | '));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
