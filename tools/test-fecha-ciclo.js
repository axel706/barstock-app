#!/usr/bin/env node
/*
 * ── La fecha del ciclo va en LOCAL ───────────────────────────────────
 *
 * `resetAt()` es una marca de tiempo UTC. Varias pantallas sacaban la
 * fecha cortándola:
 *
 *     String(resetAt()).slice(0, 10)
 *
 * Un ciclo reiniciado el 26 de octubre a las 20:00 en Pensilvania es
 * `2026-10-27T00:00:00Z`. Ese corte da "2026-10-27".
 *
 * Y las facturas de MarginEdge traen fecha SIN hora — o sea, fecha
 * local. Así que el filtro pedía desde el 27 y se comía el día entero
 * del reinicio: dos facturas de Fine Wine & Good Spirits del 26 no
 * aparecían, y nada decía por qué.
 *
 * Pedir un día de menos es gratis. Pedir uno de más pierde facturas.
 *
 *   node tools/test-fecha-ciclo.js
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

// La hora exacta del caso real: 26 de octubre, 20:00 en Pensilvania.
// En UTC ya es el 27.
const RESET_UTC = '2026-10-27T00:30:00.000Z';

function localDe(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function entorno(lineas) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  w.state = { master: [] };
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-2' };

  // El módulo del ciclo, con su fecha local de verdad.
  w.BarStockWeeklyCycle = {
    resetAt: () => RESET_UTC,
    fmtDate: () => 'Oct 26',
    fechaInicioLocal: () => localDe(RESET_UTC)
  };

  w.__pedidas = [];
  const f = async (u) => {
    w.__pedidas.push(String(u));
    const off = Number((/offset=(\d+)/.exec(u) || [])[1] || 0);
    const pag = (x) => ({ ok: true, headers: { get: () => '0-0/0' },
                          json: async () => (off ? [] : x), text: async () => '' });
    if (/marginedge_invoice_lines/.test(u)) return pag(lineas || []);
    return pag([]);
  };
  w.fetch = f; global.fetch = f;

  new Function(leer('src/marginedge-match.js'))();
  new Function(leer('src/marginedge-unclaimed.js'))();
  new Function(leer('src/mobile-invoices.js'))();
  return w;
}

(async () => {
  grupo('el helper del ciclo da la fecha local');
  {
    // Con el huso de la máquina que corre esto; lo que se comprueba
    // es que NO sea el corte del ISO cuando los dos difieren.
    const local = localDe(RESET_UTC);
    const utc = RESET_UTC.slice(0, 10);
    if (local === utc) {
      prueba('(esta máquina está en UTC, el caso no se puede reproducir aquí)', true);
    } else {
      prueba('local y UTC difieren en este caso', true, local + ' vs ' + utc);
      prueba('y la local es el día anterior', local < utc, local + ' < ' + utc);
    }
  }

  grupo('la pantalla de facturas pide desde la fecha LOCAL');
  {
    const w = entorno([]);
    const h = w.document.createElement('div');
    w.document.body.appendChild(h);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(40);

    const q = w.__pedidas.filter(u => /invoice_lines/.test(u) && /gte/.test(u))[0] || '';
    const esperado = localDe(RESET_UTC);
    prueba('usa la fecha local del reinicio',
      q.includes('invoice_date.gte.' + esperado), q);
    // Éste es el fallo concreto: pedía desde el 27 y las del 26 no
    // llegaban nunca.
    prueba('y NO la fecha UTC',
      !q.includes('invoice_date.gte.' + RESET_UTC.slice(0, 10)) ||
      localDe(RESET_UTC) === RESET_UTC.slice(0, 10), q);
  }

  grupo('una factura del día del reinicio aparece');
  {
    const dia = localDe(RESET_UTC);
    const w = entorno([{
      order_id: 'FW', line_no: 1, invoice_date: dia, invoice_number: '189780922',
      vendor_name: 'FINE WINE & GOOD SPIRITS', status: 'CLOSED',
      product_id: 'p1', vendor_item_name: 'Tito’s Vodka',
      unit_price: 25.49, quantity: 2, line_price: 50.97
    }]);
    const h = w.document.createElement('div');
    w.document.body.appendChild(h);
    await w.BarStockMobileInvoices.montar(h);
    await esperar(40);
    const t = h.textContent.replace(/\s+/g, ' ');
    prueba('se ve la factura', /FINE WINE/.test(t), t.slice(0, 160));
    prueba('con su número', /189780922/.test(t), t.slice(0, 160));
  }

  grupo('nadie vuelve a cortar el ISO para sacar una fecha');
  {
    // La regla, escrita donde falla si alguien la rompe.
    for (const f of ['src/mobile-invoices.js', 'src/marginedge-unclaimed.js',
                     'src/mobile-home.js']) {
      const s = leer(f);
      prueba(f.split('/').pop() + ' usa fechaInicioLocal', /fechaInicioLocal/.test(s));
      prueba(f.split('/').pop() + ' no corta resetAt a pelo',
        !/String\(\s*W\.resetAt\(\)\s*\)\.slice\(0, 10\)/.test(s) &&
        !/resetAt\(\)\s*\)\.slice\(0, 10\)/.test(s));
    }
    const wc = leer('src/weekly-cycle.js');
    prueba('weekly-cycle lo exporta', /fechaInicioLocal,/.test(wc));
  }

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
