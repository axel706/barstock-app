#!/usr/bin/env node
/*
 * ── Conectar una locación de una ─────────────────────────────────────
 *
 * Dar de alta un restaurante eran SEIS pasos, cuatro dentro de un
 * panel de diagnóstico, y al final 265 botellas por emparejar a mano.
 * Nada de eso es una decisión humana salvo una: cuál de los
 * restaurantes que ve la clave es esta locación.
 *
 * Lo que protege este test, por orden de lo que más duele si se
 * rompe:
 *
 *   1. El emparejado automático SÓLO toca lo que no admite duda.
 *      Un vínculo equivocado carga las compras de un producto a otra
 *      botella y nadie lo nota hasta que los costes no cuadran.
 *      · nombre idéntico ya normalizado, y
 *      · el tamaño no se contradice, y
 *      · ningún otro producto comparte ese nombre.
 *   2. El catálogo se reanuda solo. El servidor corta a los 6,5s; si
 *      el bucle no vuelve a llamar, la conexión queda a medias y
 *      parece terminada.
 *   3. Lo ya emparejado no se pisa.
 *
 *   node tools/test-conectar.js
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

function entorno(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body><div id="meConectar"></div></body>',
    { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;

  w.state = { master: o.master || [] };
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k',
                        LOCATION_NAME: "Will's & Bill's" };
  w.showSettingsPanel = () => {};

  w.__links = [];
  const f = async (u, init) => {
    if (init && init.method === 'POST') {
      w.__links = w.__links.concat(JSON.parse(init.body));
      return { ok: true, json: async () => [], text: async () => '' };
    }
    const off = Number((/offset=(\d+)/.exec(u) || [])[1] || 0);
    const pag = (x) => ({ ok: true, json: async () => (off ? [] : x), text: async () => '' });
    if (/marginedge_products/.test(u)) return pag(o.catalogo || []);
    if (/marginedge_links/.test(u))    return pag(o.enlaces || []);
    return pag([]);
  };
  w.fetch = f; global.fetch = f;

  // El módulo de integraciones, simulado: aquí se prueba el
  // orquestador, no la API.
  w.__llamadas = [];
  w.BarStockIntegrations = {
    locationId: async () => 'loc-2',
    unidad: () => o.unidadGuardada || '',
    nombreUnidad: () => '',
    guardarUnidad: async () => true,
    guardarNombreUnidad: () => {},
    idYNombre: (x) => ({ id: String(x.id || ''), nombre: String(x.name || '') }),
    render: () => {},
    llamar: async (action, params) => {
      w.__llamadas.push({ action, params });
      if (action === 'units') return { ok: true, muestra: o.units || [] };
      if (action === 'sync-catalog') {
        const n = w.__llamadas.filter(x => x.action === 'sync-catalog').length;
        const tope = o.vueltasCatalogo || 1;
        return { ok: true, guardados: 1000, nextPage: n < tope ? 'cur' + n : null };
      }
      if (action === 'sync-invoices') {
        if (!Array.isArray(params.orderIds)) {
          return { ok: true, pedidos: o.pedidos || [], nextPage: null };
        }
        return { ok: true, hechos: params.orderIds.length, lineas: params.orderIds.length * 3 };
      }
      return { ok: true };
    }
  };

  new Function(leer('src/marginedge-match.js'))();
  new Function(leer('src/marginedge-connect.js'))();
  return w;
}

const P = (id, name) => ({ product_id: id, name, type: 'LIQUOR' });
const B = (item, code) => ({ item, code: code || '', category: 'Liquor', vendor: 'X', onHand: 1 });

(async () => {
  grupo('empareja lo idéntico, ignorando mayúsculas, acentos y apóstrofes');
  {
    const w = entorno({
      master: [B("Tito's Vodka 1.75L"), B('Jose Cuervo Gold'), B('Baileys Irish Cream')],
      catalogo: [P('p1', 'TITOS VODKA 1.75L'), P('p2', 'José Cuervo Gold'),
                 P('p3', "Bailey's Irish Cream")]
    });
    const r = await w.BarStockMarginEdgeConnect._emparejar('loc-2', () => {});
    prueba('los tres', r.hechos === 3, JSON.stringify(r));
    prueba('ninguno queda en duda', r.dudosos === 0, String(r.dudosos));
    prueba('y escribe el nombre de TU botella',
      w.__links.some(l => l.item_name === "Tito's Vodka 1.75L"),
      JSON.stringify(w.__links.map(l => l.item_name)));
  }

  grupo('no empareja lo que no es idéntico');
  {
    const w = entorno({
      master: [B('Smith Hook Cabernet Sauvignon')],
      catalogo: [P('p1', 'Smith & Hook Reserve Cabernet Sauvignon')]
    });
    const r = await w.BarStockMarginEdgeConnect._emparejar('loc-2', () => {});
    // Se parece muchísimo y son dos productos distintos. Es
    // exactamente el caso que costó media hora encontrar.
    prueba('lo deja para tu ojo', r.hechos === 0 && r.dudosos === 1, JSON.stringify(r));
    prueba('y no escribe nada', w.__links.length === 0);
  }

  grupo('el tamaño no puede contradecir');
  {
    const w = entorno({
      master: [B("Tito's Vodka 750")],
      catalogo: [P('p1', "Tito's Vodka 750"), P('p2', "Tito's Vodka 1.75L")]
    });
    const r = await w.BarStockMarginEdgeConnect._emparejar('loc-2', () => {});
    prueba('empareja el del mismo tamaño', r.hechos === 1, JSON.stringify(r));
    prueba('y es el de 750', w.__links[0] && w.__links[0].product_id === 'p1',
      JSON.stringify(w.__links));
  }

  grupo('un nombre que comparten dos productos no es obvio');
  {
    const w = entorno({
      master: [B('House Red')],
      catalogo: [P('p1', 'House Red'), P('p2', 'HOUSE RED')]
    });
    const r = await w.BarStockMarginEdgeConnect._emparejar('loc-2', () => {});
    // Elegir uno al azar es justo el error que esto evita.
    prueba('no elige ninguno', r.hechos === 0 && r.dudosos === 1, JSON.stringify(r));
  }

  grupo('lo ya emparejado no se pisa');
  {
    const w = entorno({
      master: [B('Jameson Irish Whiskey')],
      catalogo: [P('p9', 'Jameson Irish Whiskey')],
      enlaces: [{ item_name: 'Jameson Irish Whiskey' }]
    });
    const r = await w.BarStockMarginEdgeConnect._emparejar('loc-2', () => {});
    prueba('se deja como está', r.hechos === 0, JSON.stringify(r));
    prueba('y no se escribe nada', w.__links.length === 0);
  }

  grupo('el catálogo se reanuda solo hasta terminar');
  {
    // El servidor corta a los 6,5 segundos y dice dónde se quedó. Si
    // el bucle no vuelve a llamar, la conexión queda a medias y
    // parece terminada.
    // El simulador devuelve cursor en las tres primeras y corta en la
    // cuarta: cuatro llamadas en total, mil productos cada una.
    const w = entorno({ vueltasCatalogo: 4 });
    const total = await w.BarStockMarginEdgeConnect._catalogo('u1', 'loc-2', () => {});
    const n = w.__llamadas.filter(x => x.action === 'sync-catalog').length;
    prueba('vuelve a llamar mientras haya cursor', n === 4, String(n));
    prueba('y suma todo lo guardado', total === 4000, String(total));
  }

  grupo('las facturas: cabeceras y luego líneas en tandas');
  {
    const w = entorno({ pedidos: Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1) })) });
    const r = await w.BarStockMarginEdgeConnect._facturas('u1', 'loc-2', () => {});
    prueba('las trae todas', r.facturas === 30, JSON.stringify(r));
    const tandas = w.__llamadas.filter(x => Array.isArray(x.params.orderIds)).length;
    prueba('en varias tandas, no de golpe', tandas >= 3, String(tandas));
  }

  grupo('con un solo restaurante no pregunta');
  {
    const w = entorno({ units: [{ id: '216', name: "Will's + Bill's" }] });
    const el = w.document.getElementById('meConectar');
    w.BarStockMarginEdgeConnect.montar();
    prueba('sale el botón', !!el.querySelector('#mecGo'), el.textContent.slice(0, 60));
    el.querySelector('#mecGo').click();
    await esperar(80);
    prueba('no enseña la pregunta', !el.querySelector('[data-u]'));
    prueba('y arranca el proceso', /Setting up|connected/i.test(el.textContent),
      el.textContent.slice(0, 80));
  }

  grupo('con dos, pregunta una sola vez');
  {
    const w = entorno({
      units: [{ id: '216', name: "Will's + Bill's" }, { id: '639', name: 'The Crown Tavern' }]
    });
    const el = w.document.getElementById('meConectar');
    w.BarStockMarginEdgeConnect.montar();
    el.querySelector('#mecGo').click();
    await esperar(60);
    prueba('enseña los dos', el.querySelectorAll('[data-u]').length === 2);
    prueba('con sus nombres', /Crown Tavern/.test(el.textContent), el.textContent.slice(0, 120));
    el.querySelectorAll('[data-u]')[0].click();
    await esperar(80);
    prueba('al elegir, arranca', /Setting up|connected/i.test(el.textContent),
      el.textContent.slice(0, 80));
  }

  grupo('al terminar dice lo que queda por hacer');
  {
    const w = entorno({
      units: [{ id: '216', name: "Will's + Bill's" }],
      master: [B('Jameson Irish Whiskey'), B('Smith Hook Cabernet')],
      catalogo: [P('p1', 'Jameson Irish Whiskey'), P('p2', 'Smith & Hook Reserve Cabernet')],
      pedidos: [{ id: '1' }]
    });
    const el = w.document.getElementById('meConectar');
    w.BarStockMarginEdgeConnect.montar();
    el.querySelector('#mecGo').click();
    await esperar(200);
    const t = el.textContent.replace(/\s+/g, ' ');
    prueba('dice que está conectada', /is connected/.test(t), t.slice(0, 100));
    prueba('con las tres cifras', /products/.test(t) && /matched/.test(t) && /invoices/.test(t));
    // Sin esto, terminas la conexión sin saber que falta trabajo.
    prueba('y avisa de lo que necesita tu ojo', /needs? your eye/.test(t), t.slice(-160));
  }

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
