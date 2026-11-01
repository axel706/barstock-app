#!/usr/bin/env node
/*
 * ── Dar y quitar locaciones a un usuario que ya existe ───────────────
 *
 * En "Edit access" las fichas de locación no se marcaban. Buscabas al
 * usuario, pulsabas una locación nueva y no pasaba nada; tampoco se
 * podía quitar una que ya tuviera. El único camino era borrar la cuenta
 * y volverla a crear.
 *
 * La causa: el panel repartía los `onclick` con un
 * `querySelectorAll('.adm-loc')` al final de `render()`, bajo un
 * comentario que decía "se marcan con delegacion". No lo era.
 *
 *   · "Create user" dibuja su cuadrícula DENTRO de render(), así que
 *     sus botones ya existían y funcionaban. Por eso nunca se notó.
 *   · "Edit access" la dibuja en `drawEdit()`, DESPUÉS, cuando ya se
 *     buscó al usuario. Esos botones nacían sin manejador.
 *
 * Es el mismo patrón que ya mordió en `settings-integrations.js`:
 * código que decide lo que el usuario ve, colocado donde no se ejecuta
 * en el camino que importa.
 *
 * Lo que se protege:
 *
 *   1. Marcar una locación NUEVA en un usuario existente.
 *   2. Quitarle una que ya tenía.
 *   3. Que lo que se guarda sea exactamente lo marcado.
 *   4. Que crear usuario —el camino que sí funcionaba— siga igual.
 *   5. Que el listener no se duplique al redibujar.
 *
 *   node tools/test-admin-acceso.js
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

const LOCS = [
  { id: 'l-dev',    name: 'DEVELOP' },
  { id: 'l-harv',   name: 'Harvest Seasonal' },
  { id: 'l-crown',  name: 'The Crown Tavern' },
  { id: 'l-jockey', name: 'The Jockey Tavern' },
  { id: 'l-wills',  name: "Will's & Bill's" }
];

// Alexis, tal cual la captura: sólo Will's & Bill's.
const USUARIO = {
  id: 'u-1', email: 'alexis@jockeytavern.com', name: 'Alexis',
  lastSignIn: '2026-10-26T12:00:00Z',
  access: [{ locationId: 'l-wills', role: 'staff' }]
};

function entorno() {
  const dom = new JSDOM('<!doctype html><body><div id="adminRoot"></div></body>',
    { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;

  w.__enviado = [];
  // El servidor, de mentira pero con la MISMA forma de respuesta.
  w.BarStockAuth = { getAuthClient: async () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) }
  }) };
  global.fetch = w.fetch = async (url, o) => {
    const b = JSON.parse(o.body);
    w.__enviado.push(b);
    if (b.action === 'listLocations') return { json: async () => ({ ok: true, locations: LOCS }) };
    if (b.action === 'list')          return { json: async () => ({ ok: true, requests: [] }) };
    if (b.action === 'findUser')      return { json: async () => ({ ok: true, user: USUARIO }) };
    if (b.action === 'setAccess')     return { json: async () => ({ ok: true, count: (b.locationIds || []).length }) };
    return { json: async () => ({ ok: true }) };
  };

  new Function(fs.readFileSync(path.join(RAIZ, 'src/admin-panel.js'), 'utf8'))();
  return w;
}

const ficha = (w, nombre) => Array.from(w.document.querySelectorAll('.adm-loc'))
  .find(b => b.textContent.trim() === nombre);
const marcadas = (w) => Array.from(w.document.querySelectorAll('.adm-loc.on'))
  .map(b => b.textContent.trim()).sort();

// Deja el panel en "Edit access" con el usuario ya buscado.
async function enEditar(w) {
  await w.BarStockAdmin.render();
  Array.from(w.document.querySelectorAll('.adm-tab'))
    .find(b => /Edit access/.test(b.textContent)).click();
  await esperar(10);
  w.document.getElementById('admFindEmail').value = USUARIO.email;
  w.document.getElementById('admFindBtn').onclick();
  await esperar(10);
}

(async () => {

grupo('el estado de partida es el que tiene el usuario');
{
  const w = entorno();
  await enEditar(w);
  prueba('la cuadrícula está', w.document.querySelectorAll('.adm-loc').length === 5,
    String(w.document.querySelectorAll('.adm-loc').length));
  prueba('sólo Will\'s & Bill\'s viene marcada',
    marcadas(w).join('|') === "Will's & Bill's", marcadas(w).join(' · '));
}

grupo('darle una locación que NO tenía');
{
  const w = entorno();
  await enEditar(w);
  const b = ficha(w, 'The Jockey Tavern');
  b.click();
  prueba('la ficha se marca', b.classList.contains('on'));
  prueba('y cambia el icono a la palomita',
    /ti-check/.test(b.querySelector('i').className), b.querySelector('i').className);
  prueba('ahora hay dos marcadas',
    marcadas(w).join('|') === "The Jockey Tavern|Will's & Bill's", marcadas(w).join(' · '));

  w.document.getElementById('admSaveAccess').onclick();
  await esperar(10);
  const env = w.__enviado.filter(x => x.action === 'setAccess').pop();
  prueba('se guarda la lista completa, no sólo la nueva',
    env.locationIds.slice().sort().join('|') === 'l-jockey|l-wills',
    JSON.stringify(env.locationIds));
}

grupo('quitarle una que sí tenía');
{
  const w = entorno();
  await enEditar(w);
  const b = ficha(w, "Will's & Bill's");
  b.click();
  prueba('la ficha se desmarca', !b.classList.contains('on'));
  prueba('y el icono vuelve al pin',
    /ti-map-pin/.test(b.querySelector('i').className), b.querySelector('i').className);

  w.document.getElementById('admSaveAccess').onclick();
  await esperar(10);
  const env = w.__enviado.filter(x => x.action === 'setAccess').pop();
  prueba('se guarda la lista vacía', env.locationIds.length === 0,
    JSON.stringify(env.locationIds));
}

grupo('cambiar de pestaña y volver no rompe nada');
{
  // El listener vive en la raíz, que NO se destruye con los innerHTML.
  // Si se pusiera uno por render(), cada vuelta añadiría otro y un
  // click contaría dos veces: marcar y desmarcar en el mismo toque.
  const w = entorno();
  await enEditar(w);
  Array.from(w.document.querySelectorAll('.adm-tab'))
    .find(b => /Create user/.test(b.textContent)).click();
  await esperar(10);
  await enEditar(w);

  const b = ficha(w, 'The Crown Tavern');
  b.click();
  prueba('un click sigue siendo un cambio', b.classList.contains('on'));
  prueba('y no se marcó nada de más',
    marcadas(w).join('|') === "The Crown Tavern|Will's & Bill's", marcadas(w).join(' · '));
}

grupo('crear usuario, que es el camino que sí funcionaba, sigue igual');
{
  const w = entorno();
  await w.BarStockAdmin.render();
  Array.from(w.document.querySelectorAll('.adm-tab'))
    .find(b => /Create user/.test(b.textContent)).click();
  await esperar(10);
  prueba('arranca sin ninguna marcada', marcadas(w).length === 0, marcadas(w).join(' · '));
  ficha(w, 'Harvest Seasonal').click();
  ficha(w, 'The Crown Tavern').click();
  prueba('se marcan las dos',
    marcadas(w).join('|') === 'Harvest Seasonal|The Crown Tavern', marcadas(w).join(' · '));
  ficha(w, 'Harvest Seasonal').click();
  prueba('y se puede desmarcar',
    marcadas(w).join('|') === 'The Crown Tavern', marcadas(w).join(' · '));
}

grupo('y el manejador no vuelve a repartirse botón por botón');
{
  const src = fs.readFileSync(path.join(RAIZ, 'src/admin-panel.js'), 'utf8');
  prueba('nada de querySelectorAll(.adm-loc).onclick',
    !/querySelectorAll\('\.adm-loc'\)/.test(src));
  prueba('hay un listener delegado en la raíz',
    /addEventListener\('click'/.test(src) && /closest\('\.adm-loc'\)/.test(src));
  prueba('y con guardia para no duplicarlo', /locDeleg/.test(src));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
