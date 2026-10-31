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
    // La marca de cuándo se sincronizó por última vez. Es la que
    // decide si el refresco pide 45 días o sólo la última semana.
    if (/location_settings/.test(u)) {
      return { ok: true, text: async () => '',
               json: async () => (o.syncedAt
                 ? [{ marginedge_invoices_synced_at: o.syncedAt }] : []) };
    }
    return pag([]);
  };
  w.fetch = f; global.fetch = f;

  // El módulo de integraciones, simulado: aquí se prueba el
  // orquestador, no la API.
  w.__llamadas = [];
  w.BarStockIntegrations = {
    locationId: async () => 'loc-2',
    unidad: () => o.unidadGuardada || '',
    // La copia de la nube, que es la que vale cuando el navegador no
    // tiene nada guardado.
    cargarUnidad: async () => o.unidadNube || o.unidadGuardada || '',
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
    // Con inventario: conectar antes de cargarlo empareja contra una
    // lista vacia, y el asistente ahora lo impide.
    const w = entorno({ master: [P('x', 'Algo')], units: [{ id: '216', name: "Will's + Bill's" }] });
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
      master: [P('x', 'Algo')],
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

  grupo('el restaurante puede estar sólo en la nube');
  {
    // `unidad()` sale de localStorage, que es por navegador. Lo
    // eliges en el escritorio y el teléfono no se entera: el botón
    // del Home decía "not connected yet" en una locación que llevaba
    // semanas conectada.
    const w = entorno({ unidadGuardada: '', unidadNube: '639', pedidos: [{ id: '1' }] });
    let error = '';
    let r = null;
    try { r = await w.BarStockMarginEdgeConnect.buscarFacturas(); }
    catch (e) { error = String(e.message || e); }
    prueba('no dice que no está conectada', !/not connected/i.test(error), error);
    prueba('y trae las facturas', !!r && r.facturas === 1, JSON.stringify(r));
    // Con el restaurante en el navegador, igual.
    const w2 = entorno({ unidadGuardada: '216', pedidos: [{ id: '1' }] });
    const r2 = await w2.BarStockMarginEdgeConnect.buscarFacturas();
    prueba('y si está en el navegador, también', r2.facturas === 1, JSON.stringify(r2));
  }

  grupo('sin restaurante en ningún sitio, sí lo dice');
  {
    const w = entorno({ unidadGuardada: '', unidadNube: '' });
    let error = '';
    try { await w.BarStockMarginEdgeConnect.buscarFacturas(); }
    catch (e) { error = String(e.message || e); }
    prueba('avisa con el nombre de la integración',
      /MarginEdge/.test(error), error);
  }

  grupo('el sync corre al arrancar la app, no al abrir Ajustes');
  {
    const src = leer('src/marginedge-connect.js');
    // Estaba en `render()` del panel de Conexiones: sólo corría si
    // entrabas a Ajustes, que es la pantalla que no deberías
    // necesitar abrir. En la práctica no corría nunca.
    prueba('se engancha a la carga de la página',
      /DOMContentLoaded', programarArranque/.test(src));
    prueba('con retraso, que al cargar no hay sesión ni locación',
      /ESPERA_MS/.test(src));
    prueba('una vez por hora como mucho', /CADA_MS/.test(src));
    // La marca vive en la nube: abrir la app en el móvil y en el
    // ordenador no puede disparar dos recorridos de una API que
    // contesta 429 a la segunda petición por segundo.
    prueba('y la marca se lee de la nube',
      /marginedge_invoices_synced_at/.test(src));
    prueba('sin restaurante no pide nada', /if \(!unitId\) return;/.test(src));

    const panel = leer('src/settings-integrations.js');
    prueba('y ya no vive en el panel de Ajustes', !/autoSync/.test(panel));
  }

  grupo('un refresco manual no vuelve a pedir cuarenta y cinco dias');
{
  // ── Por que importa ──────────────────────────────────────────────
  //
  // El recorrido son viajes ENCADENADOS a MarginEdge: cabeceras
  // paginadas, y despues las lineas en tandas de doce. Con 45 dias de
  // facturas eso son minutos, y el boton del Home parece colgado.
  //
  // 45 dias es lo correcto al dar de alta una locacion. Para un
  // refresco, desde el ultimo sync basta.
  const hoy = new Date();
  const ymd = (ms) => {
    const d = new Date(ms), z = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  };

  let w = entorno({ unidadGuardada: 'u1', pedidos: [] });
  await w.BarStockMarginEdgeConnect.buscarFacturas();
  let inv = w.__llamadas.filter(x => x.action === 'sync-invoices')[0];
  prueba('sin sync previo pide la ventana larga',
    inv && inv.params.startDate <= ymd(Date.now() - 44 * 86400000),
    inv && inv.params.startDate);

  // Sincronizado hace dos horas: basta con la ultima semana.
  w = entorno({ unidadGuardada: 'u1', pedidos: [],
                syncedAt: new Date(Date.now() - 2 * 3600000).toISOString() });
  await w.BarStockMarginEdgeConnect.buscarFacturas();
  inv = w.__llamadas.filter(x => x.action === 'sync-invoices')[0];
  prueba('con sync reciente pide solo la ultima semana',
    inv && inv.params.startDate >= ymd(Date.now() - 8 * 86400000),
    inv && inv.params.startDate);

  // ── El colchon no es por si acaso ────────────────────────────────
  //
  // MarginEdge publica una factura dias despues de la fecha que lleva
  // impresa, y la ventana filtra por ESA fecha. Pedir desde el ultimo
  // sync a secas perderia para siempre la factura del lunes que
  // aparece el jueves.
  prueba('con una semana de colchon, no desde el minuto del ultimo sync',
    inv && inv.params.startDate <= ymd(Date.now() - 6 * 86400000),
    inv && inv.params.startDate);
}

grupo('el recorrido dice por donde va');
{
  // Una espera de minutos sin cifras se lee como un cuelgue: se pulsa
  // otra vez, y cada pulsacion son mas peticiones a una API que ya
  // nos frena.
  const w = entorno({ unidadGuardada: 'u1',
    pedidos: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }] });
  const visto = [];
  await w.BarStockMarginEdgeConnect.buscarFacturas((pedidos, hechos) => {
    visto.push([pedidos, hechos]);
  });
  prueba('avisa durante el recorrido', visto.length > 0, JSON.stringify(visto));
  prueba('con cuantas facturas hay', visto.some(x => x[0] === 3), JSON.stringify(visto));
  prueba('y cuantas lleva', visto.some(x => x[1] === 3), JSON.stringify(visto));

  // Sin callback no puede reventar: lo llaman dos sitios y uno de
  // ellos —el sync al arrancar— no quiere saber nada.
  const w2 = entorno({ unidadGuardada: 'u1', pedidos: [{ id: 'o1' }] });
  let revento = false;
  try { await w2.BarStockMarginEdgeConnect.buscarFacturas(); } catch (e) { revento = true; }
  prueba('y sin callback sigue funcionando', !revento);
}

grupo('sin inventario no se puede conectar');
{
  // ── El orden importa y nadie lo decia ────────────────────────────
  //
  // Emparejar compara los productos de MarginEdge contra TUS
  // botellas. Con el inventario vacio empareja contra una lista
  // vacia: no rompe nada, simplemente no hace nada — y hay que
  // repetirlo despues sin que nadie te avise de que hizo falta.
  const vacio = entorno({ master: [], units: [{ id: '216', name: 'X' }] });
  const e1 = vacio.document.getElementById('meConectar');
  vacio.BarStockMarginEdgeConnect.montar();
  const b1 = e1.querySelector('#mecGo');
  prueba('el boton esta apagado', !!b1 && b1.disabled);
  prueba('y dice por que', /Load your inventory first/i.test(e1.textContent),
    e1.textContent.slice(0, 120));
  prueba('con donde hacerlo', /Import/.test(e1.textContent), e1.textContent.slice(0, 220));

  const lleno = entorno({ master: [P('x', 'Algo'), P('y', 'Otro')],
                          units: [{ id: '216', name: 'X' }] });
  const e2 = lleno.document.getElementById('meConectar');
  lleno.BarStockMarginEdgeConnect.montar();
  const b2 = e2.querySelector('#mecGo');
  prueba('con inventario, el boton vive', !!b2 && !b2.disabled);
  prueba('y dice cuantas botellas hay', /2 bottles/.test(e2.textContent),
    e2.textContent.slice(0, 160));
}

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
