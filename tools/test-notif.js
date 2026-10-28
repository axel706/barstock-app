// Centro de notificaciones del móvil.
//
// No guarda avisos: los deriva del registro de precios y de los
// fallos que dejó la app. Una tabla de avisos sería una segunda copia
// de datos que ya existen, y dos copias acaban diciendo cosas
// distintas. Lo único que se guarda es cuáles se cerraron.

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'mobile-notif.js'), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  FALLA ' + n + (extra ? '   → ' + extra : '')); }
}
function grupo(t) { console.log('\n' + t); }
const esperar = ms => new Promise(r => setTimeout(r, ms));

// Cambios de precio de mentira, con sus porcentajes exactos.
const LOG = [
  { id: 1, item_name: 'White Haven', price_before: 10, price_after: 11.2,
    vendor_name: 'BREAKTHRU', invoice_number: '468122', invoice_date: '2026-10-26',
    applied_at: '2026-10-26T10:00:00Z' },                       // +12 %
  { id: 2, item_name: 'Pedro Morales', price_before: 4.39, price_after: 4.09,
    vendor_name: 'PLCB', invoice_number: '2682410', invoice_date: '2026-10-20',
    applied_at: '2026-10-20T10:00:00Z' },                       // -6.8 %
  { id: 3, item_name: 'Canyon Oaks', price_before: 10, price_after: 10.2,
    vendor_name: 'WINE MERCHANT', invoice_number: '99', invoice_date: '2026-10-19',
    applied_at: '2026-10-19T10:00:00Z' }                        // +2 %, por debajo
];

function entorno(descartadas, guardado) {
  const dom = new JSDOM('<!doctype html><body><header id="mBand"></header></body>',
    { url: 'https://x.test' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true });
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://s.test', SUPABASE_KEY: 'k' };
  w.BarStockParIntelligence = { fetchLocationId: async () => 'loc-1' };

  // `global.fetch` y no `w.fetch`: el módulo llama a `fetch` a secas,
  // que en el navegador ES window.fetch pero aquí dentro resuelve al
  // global de Node. Mismo tropiezo que ya tuvimos con
  // requestAnimationFrame y localStorage.
  global.fetch = w.fetch = async (url, opt) => {
    if (/notif_descartadas/.test(url) && (!opt || opt.method !== 'POST')) {
      return { ok: true, json: async () => descartadas.map(c => ({ clave: c })) };
    }
    if (/notif_descartadas/.test(url)) {
      guardado.push(JSON.parse(opt.body).clave);
      return { ok: true, text: async () => '' };
    }
    if (/price_log/.test(url)) return { ok: true, json: async () => LOG };
    return { ok: true, json: async () => [] };
  };

  new Function(SRC)();
  return w;
}

(async () => {
  const guardado = [];
  const w = entorno([], guardado);
  await esperar(80);

  grupo('qué llega a ser un aviso');
  const avisos = await w.BarStockMobileNotif._cargar();
  prueba('los cambios por encima del umbral', avisos.length === 2,
    avisos.map(a => a.t).join(' | '));
  // Un 2 % es redondeo, no una subida: con cien facturas al mes el
  // centro se llenaría de céntimos y dejaría de mirarse.
  prueba('el 2% no avisa', !avisos.some(a => /Canyon/.test(a.t)));
  prueba('una subida se nombra como subida',
    avisos.some(a => /White Haven went up 12%/.test(a.t)),
    avisos.map(a => a.t).join(' | '));
  prueba('y una bajada como bajada',
    avisos.some(a => /Pedro Morales dropped/.test(a.t)));
  prueba('el color sigue al significado, no al signo',
    avisos.find(a => /went up/.test(a.t)).tono === 'up' &&
    avisos.find(a => /dropped/.test(a.t)).tono === 'dn');

  grupo('la campana');
  const b = w.document.querySelector('#mBand .m-ico-bell');
  prueba('existe', !!b);
  prueba('con punto rojo cuando hay algo', !!w.document.querySelector('.m-pip'));

  grupo('el panel');
  await w.BarStockMobileNotif.abrir();
  await esperar(40);
  prueba('es flotante, no una pantalla', !!w.document.getElementById('mNotifPanel'));
  prueba('y desenfoca el fondo', !!w.document.getElementById('mNotifBack'));

  grupo('el documento no se mueve detrás del panel');
  // Al llegar al final de la lista el gesto pasaba al documento: el
  // panel se quedaba fijo, la app se desplazaba por detrás, y volver
  // arriba movía la página en vez del panel.
  prueba('el body queda bloqueado', w.document.body.classList.contains('m-nf-abierto'));
  prueba('y recuerda dónde estaba', w.document.body.style.top !== '');

  grupo('descartar');
  const x = w.document.querySelector('[data-x]');
  x.click();
  await esperar(40);
  prueba('se guarda la clave', guardado.length === 1 && /^precio:/.test(guardado[0]),
    guardado.join(','));
  prueba('y desaparece de la lista',
    !w.document.getElementById('mNotifBody').textContent.includes('White Haven'));

  grupo('al cerrar se devuelve el documento');
  w.BarStockMobileNotif.cerrar();
  await esperar(40);
  prueba('el body se suelta', !w.document.body.classList.contains('m-nf-abierto'));
  prueba('y se le quita el desplazamiento fijado', w.document.body.style.top === '');

  // A partir de aquí se crea un segundo entorno, y eso reemplaza el
  // `document` global: los módulos lo leen en cada llamada, así que
  // tocar el primero después de esto manipularía el body del segundo.

  grupo('lo descartado no vuelve');
  // Es la razón de la tabla: si volviera en cada arranque, cerrar un
  // aviso no significaría nada.
  const w2 = entorno(['precio:1'], []);
  await esperar(60);
  const a2 = await w2.BarStockMobileNotif._cargar();
  prueba('ni al volver a entrar', !a2.some(a => /White Haven/.test(a.t)),
    a2.map(a => a.t).join(' | '));
  prueba('pero los demás siguen', a2.some(a => /Pedro Morales/.test(a.t)));

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
