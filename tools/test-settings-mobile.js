// Ajustes en el teléfono.
//
// El modal del escritorio usa rejillas de dos columnas y filas de
// botones a la derecha: en un móvil los campos salen a media anchura y
// "Guardar" cae fuera del pulgar. Esta pantalla pinta su propio
// marcado pero guarda con las MISMAS funciones, porque dos formas de
// escribir el mismo ajuste es como se desincronizan.

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'mobile-settings.js'), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, extra) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  FALLA ' + n + (extra ? '   → ' + extra : '')); }
}
function grupo(t) { console.log('\n' + t); }
const esperar = ms => new Promise(r => setTimeout(r, ms));

function entorno(guardado) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test' });
  const w = dom.window;
  global.window = w; global.document = w.document; global.localStorage = w.localStorage;

  const reg = [];
  guardado.volvio = false;
  // cabecera/alVolver DE VERDAD, del armazon. Ver tools/lib-cabecera.js.
  w.BarStockMobile = Object.assign({
    register: x => reg.push(x), ir: () => {},
    volver: () => { guardado.volvio = true; },
    nombreAnterior: () => 'More'
  }, require('./lib-cabecera'));
  w.BARSTOCK_CONFIG = { LOCATION_NAME: 'The Crown Tavern' };
  w.getActiveVendors = () => ['LOOP', 'SOUTHERN', 'UNKNOWN'];
  w.BarStockSenderProfile = {
    getProfile: async () => ({ name: 'Axel Torres', title: 'GM' }),
    saveProfile: async f => { guardado.sender = f; return true; }
  };
  w.BarStockLocationSettings = {
    getSettings: async () => ({ reply_to_email: 'a@b.c', report_recipients: 'x@y.z, q@w.e' }),
    saveSettings: async f => { guardado.emails = f; return true; }
  };
  w.BarStockZones = {
    cargar: async () => ['Main Bar', 'Wine Cellar'],
    porDefecto: () => 'Main Bar',
    guardarLista: async (l, d) => { guardado.zones = { l, d }; return true; }
  };
  w.BarStockVendorDefaults = {
    getDefaults: async () => ({ vendor_email: 'o@loop.com' }),
    saveDefaults: async (v, f) => { guardado.delivery = { v, f }; return true; }
  };
  w.BarStockTypeface = {
    FONTS: [{ id: 'manrope', name: 'Manrope', note: 'La original' },
            { id: 'inter', name: 'Inter', note: 'Neutra' }],
    current: () => 'manrope', set: id => { guardado.font = id; }
  };

  new Function(SRC)();
  return { w, reg };
}

(async () => {
  const g = {};
  const { w, reg } = entorno(g);
  await esperar(40);

  const S = reg.find(r => r.id === 'settings');
  grupo('la pantalla existe y no es una pestaña');
  prueba('registrada', !!S);
  prueba('fuera de la barra', S && S.tab === false);

  const host = w.document.createElement('div');
  S.mount(host);
  await esperar(60);

  grupo('el menú');
  const items = [...host.querySelectorAll('.m-item-t')]
    .map(e => e.firstChild.textContent.trim());
  prueba('seis entradas', items.length === 6, items.join(', '));
  prueba('y son las acordadas',
    items.join(',') === 'Sender,Emails,Delivery,Zones,Typeface,Text size',
    items.join(','));
  prueba('cada una enseña su valor', /Axel Torres/.test(host.textContent) &&
    /2 recipients/.test(host.textContent));
  prueba('dice qué se queda en escritorio', /wide tables/i.test(host.textContent));

  grupo('guardar usa las funciones de siempre');
  host.querySelector('[data-p="sender"]').click();
  await esperar(40);
  host.querySelector('#ms_name').value = 'Axel T';
  host.querySelector('#msSave').click();
  await esperar(60);
  prueba('sender llama a saveProfile', !!g.sender && g.sender.name === 'Axel T',
    JSON.stringify(g.sender));
  prueba('y vuelve al menú al guardar', !!host.querySelector('[data-p="emails"]'));

  grupo('delivery son dos pasos, no siete pestañas');
  host.querySelector('[data-p="delivery"]').click();
  await esperar(40);
  const vs = [...host.querySelectorAll('[data-v]')].map(b => b.dataset.v);
  prueba('lista de proveedores', vs.length === 2, vs.join(','));
  prueba('sin UNKNOWN', !vs.includes('UNKNOWN'));

  host.querySelector('[data-v="LOOP"]').click();
  await esperar(40);
  prueba('la ficha trae lo guardado',
    host.querySelector('#ms_vemail') &&
    host.querySelector('#ms_vemail').value === 'o@loop.com');

  host.querySelector('#msSave').click();
  await esperar(60);
  prueba('guarda contra ese proveedor', !!g.delivery && g.delivery.v === 'LOOP');

  grupo('el tamaño del texto mueve la escala entera');
  // Toda la escala del móvil cuelga de --m-base. Tres ajustes la
  // mueven y los ocho pasos se recolocan solos.
  host.querySelector('[data-p="size"]').click();
  await esperar(40);
  host.querySelector('[data-size="lg"]').click();
  await esperar(20);
  prueba('large marca el body', w.document.body.classList.contains('m-txt-lg'));
  host.querySelector('[data-size="sm"]').click();
  await esperar(20);
  prueba('y cambiar a small quita la anterior',
    w.document.body.classList.contains('m-txt-sm') &&
    !w.document.body.classList.contains('m-txt-lg'));
  prueba('queda recordado', w.localStorage.getItem('bs_m_txt') === 'sm');

  grupo('la salida de la raíz');
  // Se entra a Ajustes desde More o desde el engranaje, y sin flecha
  // no hay forma de volver: ninguna pestaña está encendida.
  S.show(host);
  await esperar(60);
  const out = host.querySelector('#mAtras');
  prueba('hay flecha en la raíz', !!out);
  // El destino ya no se escribe al lado de la flecha: ese renglón
  // costaba más de lo que informaba. Sigue estando para quien usa
  // lector de pantalla.
  prueba('y dice de dónde vienes',
    !!out && /More/.test(out.getAttribute('aria-label')),
    out && out.getAttribute('aria-label'));
  out.click();
  prueba('al pulsarla se vuelve', g.volvio === true);
  g.volvio = false;
  prueba('el gesto del borde también sale', S.atras(host, true) === true && g.volvio === true);

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
