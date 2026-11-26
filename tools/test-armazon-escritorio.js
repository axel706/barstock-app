#!/usr/bin/env node
/*
 * ── El armazón del escritorio (Axel, 2026-11-25, opción A1) ──────────
 *
 * Barra lateral con las secciones y el header de siempre en una fila.
 * Paso 1: las secciones de hoy, tal cual, dentro. Lo que se protege:
 *
 *   1. La barra lleva cada sección de hoy, y cada una apunta a una
 *      sección que EXISTE en index.html (un id renombrado no deja un
 *      botón muerto).
 *   2. Lo que aún no hay (Running out, Transfers, Sales, Counts) sale
 *      "Soon" y NO es un botón: un botón que no hace nada miente.
 *   3. Tocar una sección llama a bsOpenSection; Home a bsCloseSection;
 *      Settings al modal; Count al "Take inventory" de siempre (con su
 *      comprobación del ciclo). Ninguna función compartida se reemplaza.
 *   4. Lo encendido sigue a .bs-active-section, la abra quien la abra.
 *   5. Admin sale sólo si auth.js enseña su pastilla de siempre.
 *   6. El estado del maestro y el BUILD se mueven al pie con su id.
 *   7. Ninguna función del header se esconde: Import, Export, More, el
 *      ciclo, la locación, el tema y Logout siguen a la vista.
 *   8. En el teléfono no existe: la hoja sólo actúa por encima de 640.
 *   9. El orden de carga: el módulo va después de quien define
 *      bsOpenSection, y la hoja después de app.css y toolbar-pills.css.
 *
 *   node tools/test-armazon-escritorio.js
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
const espera = () => new Promise(r => setTimeout(r, 0));

const INDEX = leer('index.html');
const CSS = leer('styles/desk-shell.css');

const html = `<!doctype html><body>
<div class="wrap">
  <div class="bs-header card">
    <div class="bs-header-line1">
      <div class="brand-logo-type" id="headerLogo">Bar<b>Stock</b></div>
      <div class="bs-loc-wrap"><select id="headerLocationSelect"></select></div>
      <div class="bs-header-controls"><button id="themeToggle"></button><button id="settingsBtn"></button><button id="authLogoutBtn"></button></div>
    </div>
    <div class="bs-header-line3">
      <button id="cycleBtn"></button>
      <div class="bs-toolbar-group"><button id="importMenuBtn"></button></div>
      <div class="bs-toolbar-group"><button id="exportMenuBtn"></button></div>
      <div class="bs-status-row" id="bsStatusRow"><span id="masterStatus">No master loaded</span></div>
      <div style="margin-left:auto"><span id="buildBadge">BUILD-1</span><div class="bs-toolbar-group"><button id="bsMoreBtn"></button></div></div>
    </div>
    <div class="bs-header-line4"><button id="bsAdminNavTab" style="display:none" data-section="admin"></button></div>
  </div>
  <button id="takeInventoryBtn"></button>
  ${['inventory', 'vendor', 'history', 'noMatch', 'costReport', 'consumption', 'pourIq', 'admin']
    .map(s => `<div class="card section-card" id="${s}Section"></div>`).join('')}
</div></body>`;

const dom = new JSDOM(html, { url: 'https://x.test/', runScripts: 'outside-only' });
const w = dom.window;
const llamadas = [];
w.bsOpenSection = n => {
  llamadas.push('open:' + n);
  w.document.querySelectorAll('.section-card').forEach(e => e.classList.remove('bs-active-section'));
  w.document.getElementById(n + 'Section').classList.add('bs-active-section');
};
w.bsCloseSection = () => {
  llamadas.push('close');
  w.document.querySelectorAll('.section-card').forEach(e => e.classList.remove('bs-active-section'));
};
w.openSettingsModal = () => llamadas.push('settings');
let nombre = '';
const oyentesMH = [];
w.BarStockMobileHome = { saludo: () => nombre ? 'Hello, ' + nombre : 'Wednesday', alCambiar: (fn) => oyentesMH.push(fn) };
let clicsCiclo = 0;
w.document.getElementById('cycleBtn').addEventListener('click', () => clicsCiclo++);
w.document.getElementById('takeInventoryBtn').addEventListener('click', () => llamadas.push('contar'));
w.eval(leer('src/desk-shell.js'));
const D = w.document;
let lado = null;
const item = id => lado && lado.querySelector(`[data-dk="${id}"]`);

(async () => {
  // El módulo se monta al terminar de cargar el documento, como en la app.
  if (D.readyState === 'loading') await new Promise(r => D.addEventListener('DOMContentLoaded', r));
  lado = D.getElementById('dkLado');
  grupo('1. La barra lleva las secciones de hoy, y existen');
  prueba('la barra lateral se monta', !!lado);
  prueba('el body lleva la marca dk', D.body.classList.contains('dk'));
  const S = w.BarStockDeskShell;
  for (const id of ['home', 'inventory', 'noMatch', 'vendor', 'history', 'pourIq', 'consumption', 'costReport', 'settings', 'admin']) {
    prueba('lleva ' + id, !!item(id));
  }
  prueba('Running out ya no es "Soon": es un botón que abre su sección', !!item('runningOut') && item('runningOut').tagName === 'BUTTON' && !/Soon/.test(item('runningOut').textContent));
  // Las secciones de hoy están en index.html; las que se rehacen para el
  // escritorio las crea su módulo (Running out: desk-running-out.js).
  const PROPIAS = { runningOut: 'src/desk-running-out.js', sales: 'src/desk-sales.js' };
  for (const it of S.ITEMS.filter(x => x.sec)) {
    const donde = PROPIAS[it.sec];
    prueba(`${it.label} apunta a una sección (#${it.sec}Section)` + (donde ? ' de ' + donde : ' de index.html'),
      donde ? leer(donde).includes(`'${it.sec}Section'`) : INDEX.includes(`id="${it.sec}Section"`));
  }

  grupo('2. Lo que aún no hay sale "Soon" y no es un botón');
  for (const id of ['transfers', 'counts']) {
    const e = item(id);
    prueba(id + ' sale con "Soon"', !!e && /Soon/.test(e.textContent));
    prueba(id + ' no es un botón', !!e && e.tagName !== 'BUTTON');
  }
  llamadas.length = 0;
  item('transfers') && item('transfers').click();
  S.ir('counts');
  prueba('tocar un "Soon" no hace nada', llamadas.length === 0, llamadas.join(','));

  grupo('3. Cada renglón llama a lo de siempre');
  llamadas.length = 0;
  item('inventory').click();
  prueba('Inventory → bsOpenSection("inventory")', llamadas[0] === 'open:inventory', llamadas.join(','));
  item('history').click();
  prueba('History → bsOpenSection("history")', llamadas[1] === 'open:history', llamadas.join(','));
  item('home').click();
  prueba('Home → bsCloseSection()', llamadas[2] === 'close', llamadas.join(','));
  item('settings').click();
  prueba('Settings → el modal de siempre', llamadas[3] === 'settings', llamadas.join(','));
  D.getElementById('dkContar').click();
  prueba('Count → el "Take inventory" de siempre', llamadas[4] === 'contar', llamadas.join(','));
  prueba('bsOpenSection no se reemplazó', !/bsOpenSection\s*=(?!=)/.test(leer('src/desk-shell.js')));

  grupo('4. Lo encendido sigue a la sección abierta');
  w.bsOpenSection('costReport');   // la abre otro, no la barra
  await espera();
  prueba('abrir Costs desde fuera enciende Costs', item('costReport').classList.contains('on'));
  prueba('y sólo Costs', lado.querySelectorAll('.dk-nav.on').length === 1);
  w.bsCloseSection();
  await espera();
  prueba('sin sección abierta, Home', item('home').classList.contains('on'));

  grupo('5. Admin, sólo si auth.js enseña su pastilla');
  prueba('nace escondido', item('admin').style.display === 'none');
  D.getElementById('bsAdminNavTab').style.display = '';
  await espera();
  prueba('aparece cuando auth.js la enseña', item('admin').style.display !== 'none');
  D.getElementById('bsAdminNavTab').style.display = 'none';
  await espera();
  prueba('y se va si la vuelve a esconder', item('admin').style.display === 'none');

  grupo('6. El estado y el BUILD, al pie con su id');
  prueba('#buildBadge vive en la barra', !!lado.querySelector('#buildBadge'));
  prueba('#bsStatusRow vive en la barra', !!lado.querySelector('#bsStatusRow'));
  prueba('sólo hay uno de cada', D.querySelectorAll('#buildBadge').length === 1 && D.querySelectorAll('#bsStatusRow').length === 1);

  grupo('7. Nada del header se esconde');
  const escondidos = [...CSS.matchAll(/([^{}]+)\{[^{}]*display:\s*none/g)].map(m => m[1]).join(',');
  for (const id of ['importMenuBtn', 'exportMenuBtn', 'bsMoreBtn', 'cycleBtn', 'headerLocationSelect', 'themeToggle', 'authLogoutBtn', 'importMenu', 'exportMenu', 'bsMoreMenu']) {
    // Lo escondido es el elemento mismo cuando el selector TERMINA en él;
    // "#cycleBtn .cyc-again" esconde un icono de dentro, no el botón.
    const partes = escondidos.split(',').map(x => x.trim());
    prueba(`#${id} no lleva display:none`, !partes.some(x => new RegExp('#' + id + '$').test(x)));
  }
  prueba('Settings del header se esconde porque está en la barra', /#settingsBtn/.test(escondidos) && !!item('settings'));
  prueba('los grupos de Import, Export y More llevan su marca',
    !!D.querySelector('.dk-imp #importMenuBtn') && !!D.querySelector('.dk-exp #exportMenuBtn') && !!D.querySelector('.dk-mas #bsMoreBtn'));

  grupo('8. En el teléfono no existe');
  const fuera = CSS.split('@media')[0];
  prueba('fuera de las media queries, #dkLado y #dkMarco van escondidos', /#dkLado, #dkMarco\s*\{\s*display:\s*none/.test(fuera));
  prueba('fuera de las media queries sólo se esconde (la barra, el marco y su botón)', fuera.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/#dkLado, #dkMarco\s*\{\s*display:\s*none;\s*\}/, '').replace(/body\.dk \.bs-header #dkMenu \{ display: none; \}/, '').trim() === '');
  prueba('la barra se enseña sólo desde 641 px', /@media \(min-width: 641px\)\s*\{[\s\S]*body\.dk #dkLado\s*\{\s*display:\s*flex/.test(CSS));

  grupo('8b. Vidrio en los dos modos (Axel, 2026-11-25: "TODO necesita blur")');
  const regla = (sel) => { const m = CSS.match(new RegExp(sel.replace(/[.#]/g, c => '\\' + c) + '\\s*\\{([^}]*)\\}')); return m ? m[1] : ''; };
  // UN vidrio para las dos barras (Axel, 2026-11-25: "el blur debe
  // integrar ambos blur como uno mismo"): el desenfoque es de #dkMarco, y
  // ni la barra ni el header llevan uno propio (dos se veían como dos).
  prueba('el marco lleva desenfoque', /backdrop-filter:\s*blur\(\d+px\)/.test(regla('body.dk #dkMarco')));
  prueba('la barra lateral NO lleva uno propio', /backdrop-filter:\s*none/.test(regla('body.dk #dkLado')) && !/blur\(/.test(regla('body.dk #dkLado')));
  prueba('el header tampoco', /backdrop-filter:\s*none !important/.test(regla('body.dk .wrap > .bs-header')) && !/blur\(/.test(regla('body.dk .wrap > .bs-header')));
  prueba('el marco tiene su claro', /background:[^;]*rgba\((?:24\d|25\d), (?:24\d|25\d), (?:25\d)/.test(regla('body.light.dk #dkMarco')));
  prueba('el marco es una L: hasta el alto del header y el ancho de la barra',
    /clip-path: polygon\(0 0, 100% 0, 100% var\(--dk-alto\), var\(--dk-x\) var\(--dk-alto\), var\(--dk-x\) 100%, 0 100%\)/.test(regla('body.dk #dkMarco')));
  prueba('escondida la barra, la L se vuelve sólo la franja de arriba', /body\.dk\.dk-sin-lado \{ --dk-x: 0px; \}/.test(CSS));
  prueba('la línea de la barra empieza bajo el header (en la esquina no hay línea)',
    /background: linear-gradient\(var\(--dk-linea\), var\(--dk-linea\)\) right var\(--dk-alto\)/.test(regla('body.dk #dkLado')) && /border: 0/.test(regla('body.dk #dkLado')));
  prueba('el header sin sombra (caía sobre la barra)', /box-shadow: none !important/.test(regla('body.dk .wrap > .bs-header')));
  prueba('el logo lleva su color en cada modo', /body\.light #dkLado \.dk-logo \{ color: #0f172a/.test(CSS) && /#dkLado \.dk-logo \{[^}]*color: #f8fafc/.test(CSS));
  prueba('ningún renglón de la barra se apaga con opacidad', !/#dkLado[^{]*\{[^}]*opacity:\s*\.[0-4]/.test(CSS));

  grupo('8c. Saludo a la izquierda, locación al centro, ciclo en la barra lateral');
  const ciclo = D.getElementById('cycleBtn');
  prueba('el botón del ciclo vive en la barra lateral', !!lado.querySelector('#cycleBtn'));
  prueba('bajo el logo y antes de las secciones', (() => {
    const hijos = [...lado.children];
    const iLogo = hijos.findIndex(e => e.classList.contains('dk-logo'));
    const iCiclo = hijos.findIndex(e => e.contains(ciclo));
    const iLista = hijos.findIndex(e => e.classList.contains('dk-lista'));
    return iLogo >= 0 && iLogo < iCiclo && iCiclo < iLista;
  })());
  prueba('sólo hay uno', D.querySelectorAll('#cycleBtn').length === 1);
  ciclo.click();
  prueba('y conserva su clic (el de weekly-cycle)', clicsCiclo === 1);
  const hdr = D.querySelector('.bs-header');
  const sal = D.getElementById('dkSaludo');
  // Entre el botón y el saludo va la ruta (#dkMiga), que sólo se ve dentro
  // de una sección (lámina C): en el Home el saludo es lo primero que se ve.
  prueba('el saludo va al principio de la barra de arriba (tras el botón del panel y la ruta)', !!sal && hdr.firstElementChild.id === 'dkMenu' && hdr.children[1].id === 'dkMiga' && hdr.children[2] === sal);
  prueba('sin nombre, la fecha entera', /day/.test(sal.textContent) && !/Hello/.test(sal.textContent), sal.textContent);
  nombre = 'Axel';
  oyentesMH.forEach(f => f());
  // Axel, 2026-11-26: "en el saludo elimina la fecha y hazlo más grande".
  {
    const CS = fs.readFileSync(path.join(__dirname, '..', 'styles', 'desk-shell.css'), 'utf8');
    prueba('el saludo, grande y con el degradado del logo', /\.dk-saludo b \{[^}]*font-size: 28px;[^}]*background: var\(--bs-stock-grad[^}]*background-clip: text;/.test(CS));
  }
  prueba('con nombre, "Hello, Axel" sin la fecha al lado', sal.textContent === 'Hello, Axel' && !sal.querySelector('span'), sal.textContent);
  prueba('la locación, al centro de la barra', /\.bs-loc-wrap \{\s*position: absolute; left: 50%;[^}]*translate\(-50%, -50%\)/.test(CSS));

  grupo('8d. La barra de estado del iPad (app instalada)');
  prueba('el viewport es cover y la barra de estado translúcida (la razón de lo de abajo)',
    /viewport-fit=cover/.test(INDEX) && /status-bar-style" content="black-translucent"/.test(INDEX));
  prueba('la barra lateral empieza bajo el velo de iOS', /body\.dk #dkLado \{[^}]*padding: calc\(16px \+ var\(--dk-velo\)\)/.test(CSS));
  prueba('también en la barra de iconos', /body\.dk #dkLado \{\s*padding: calc\(14px \+ var\(--dk-velo\)\)/.test(CSS));
  prueba('el header empieza bajo el velo de iOS', /body\.dk \.wrap > \.bs-header \{[^}]*padding: calc\(12px \+ var\(--dk-velo\)\)/.test(CSS));
  prueba('el velo mide dos zonas seguras (y 0 en el navegador)', /--dk-velo: calc\(env\(safe-area-inset-top\) \* 2\)/.test(CSS));

  grupo('8e. Esconder la barra lateral (opción A)');
  const menu = D.getElementById('dkMenu');
  prueba('el botón va antes de la ruta y el saludo', !!menu && menu.nextElementSibling === D.getElementById('dkMiga') && menu.nextElementSibling.nextElementSibling === D.getElementById('dkSaludo'));
  prueba('de entrada, la barra se ve', !D.body.classList.contains('dk-sin-lado'));
  menu.click();
  prueba('tocarlo la esconde', D.body.classList.contains('dk-sin-lado'));
  prueba('y se recuerda en este dispositivo', w.localStorage.getItem('bs-dk-lado-oculto') === '1');
  prueba('el botón dice lo que hará', menu.getAttribute('aria-label') === 'Show the sidebar' && menu.getAttribute('aria-expanded') === 'false');
  prueba('la barra escondida no se lee', lado.getAttribute('aria-hidden') === 'true');
  menu.click();
  prueba('otra vez la saca', !D.body.classList.contains('dk-sin-lado') && w.localStorage.getItem('bs-dk-lado-oculto') === '0');
  prueba('escondida, la barra sale de la pantalla', /body\.dk\.dk-sin-lado #dkLado \{ transform: translateX\(-100%\); visibility: hidden; \}/.test(CSS));
  prueba('y el contenido ocupa el ancho', /body\.dk\.dk-sin-lado \.wrap \{ margin-left: 0; \}/.test(CSS));
  prueba('sin animación con reducir movimiento', /prefers-reduced-motion: reduce\)\s*\{\s*body\.dk #dkLado, body\.dk \.wrap, body\.dk #dkMarco, body\.dk \.wrap > \.bs-header \{ transition: none; \}/.test(CSS));

  grupo('8f. La franja de la hora, integrada (sin el brillo)');
  const franja = (sel) => new RegExp(sel + ' \\{[^}]*background: linear-gradient\\(to bottom,[^;]*var\\(--dk-velo\\),[^;]*calc\\(var\\(--dk-velo\\) \\+ \\d+px\\)').test(CSS);
  prueba('el marco espesa su vidrio bajo la hora', franja('body\\.dk #dkMarco'));
  prueba('y en el claro', franja('body\\.light\\.dk #dkMarco'));
  prueba('el header le gana al !important de .card en app.css (transparente)', /body\.dk \.wrap > \.bs-header \{[^}]*background: transparent !important;/.test(CSS));

  grupo('8g. Un solo marco, y cada renglón con su icono');
  const JS = leer('src/desk-shell.js');
  const marcoEl = D.getElementById('dkMarco');
  prueba('el marco existe y no se lee', !!marcoEl && marcoEl.getAttribute('aria-hidden') === 'true');
  // .wrap lleva z-index 1: colgado del body, el marco tapaba el header.
  prueba('cuelga de .wrap, no del body', !!marcoEl && marcoEl.parentElement === D.querySelector('.wrap'));
  prueba('va bajo el header (39 contra 40)', /z-index: 39;/.test(regla('body.dk #dkMarco')));
  prueba('su alto se mide del header, no al rodar', /ResizeObserver\(medirAlto\)\.observe\(header\)/.test(JS) && !/addEventListener\('scroll'[^)]*medirAlto/.test(JS));
  prueba('Unmatched e History con su icono, del mismo tamaño', !/\.dk-sub i \{ display: none/.test(CSS) && !/\.dk-nav\.dk-sub \{[^}]*font-size/.test(CSS)
    && !!D.querySelector('.dk-nav.dk-sub i.ti'));

  grupo('8h. El header no se separa de su vidrio al tirar (iPad)');
  // En el rebote de iOS lo sticky baja con la página y lo fijo se queda:
  // el header tiene que ser fijo como la barra lateral y el marco.
  prueba('el header va fijo', /position: fixed;\s*top: 0; left: var\(--dk-x\); right: 0;/.test(regla('body.dk .wrap > .bs-header')));
  prueba('la página deja su hueco arriba (alto medido + 18)', /padding-top: calc\(var\(--dk-alto\) \+ 18px\) !important/.test(regla('body.dk .wrap')));
  prueba('sin margen propio (ya no está en el flujo)', /margin: 0 !important/.test(regla('body.dk .wrap > .bs-header')));
  prueba('sigue a la barra al esconderla, sin animar con reducir movimiento',
    /transition: left \.22s ease/.test(regla('body.dk .wrap > .bs-header')) && /body\.dk \.wrap > \.bs-header \{ transition: none; \}/.test(CSS));

  grupo('8k. La forma de las secciones (el estándar, lámina "Section screens" A)');
  prueba('.dk-pantalla: sin caja, pegada a la barra y del alto de la pantalla',
    /\.section-card\.dk-pantalla \{[^}]*margin: -18px -24px 0 !important;[^}]*min-height: calc\(100vh - var\(--dk-alto\)\);[^}]*border-radius: 0 !important/.test(CSS));
  prueba('su vidrio es una capa fija detrás (no se ve la foto nítida al bajar)',
    /\.dk-pantalla::before \{[^}]*position: fixed; z-index: -1;[^}]*top: var\(--dk-alto\); right: 0; bottom: 0; left: var\(--dk-x\);[^}]*backdrop-filter: blur/.test(CSS)
    && /\.section-card\.dk-pantalla \{[^}]*position: relative; z-index: 0;[^}]*backdrop-filter: none !important/.test(CSS));
  prueba('CLAUDE.md lo dice como el estándar', /EL ESTÁNDAR DE LAS SECCIONES DEL ESCRITORIO/.test(leer('CLAUDE.md')));

  grupo('8i. Sin el renglón de estado de antes');
  prueba('"Orders loaded" y compañía no salen en el escritorio (ya son avisos)', /body\.dk #statusBar \{ display: none !important; \}/.test(CSS));
  prueba('setStatus lo sigue escribiendo y toast.js lo enseña', /function setStatus\(msg\)\{\s*const bar = document\.getElementById\('statusBar'\)/.test(INDEX) && /window\.setStatus = function \(msg\)[\s\S]{0,200}show\(msg\)/.test(leer('src/toast.js')));

  grupo('8j. Dónde estás y cómo volver (lámina C)');
  {
    const miga = D.getElementById('dkMiga');
    const tecla = (key, en) => (en || D.body).dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const espera = () => new Promise(r => setTimeout(r, 20));
    S.ir('home'); await espera();
    prueba('la ruta existe y va antes del saludo', !!miga && miga.nextElementSibling === D.getElementById('dkSaludo'));
    prueba('en el Home no se ve: el saludo de siempre', !D.body.classList.contains('dk-en-seccion') && miga.textContent === '');
    S.ir('pourIq'); await espera();
    prueba('en una sección: "Home › Pour·IQ"', D.body.classList.contains('dk-en-seccion') && /^Home\s*›\s*Pour·IQ$/.test(miga.textContent.trim()), miga.textContent);
    prueba('el saludo se esconde en las secciones', /body\.dk\.dk-en-seccion \.bs-header \.dk-saludo \{ display: none; \}/.test(CSS));
    llamadas.length = 0;
    D.getElementById('dkMigaHome').click(); await espera();
    prueba('Home lleva al Home', llamadas.includes('close') && !D.body.classList.contains('dk-en-seccion'), llamadas.join(','));
    S.ir('noMatch'); await espera();
    prueba('una subsección, con su nombre', /Unmatched/.test(miga.textContent));
    const hoja = D.createElement('div'); hoja.id = 'mSheet'; D.body.appendChild(hoja);
    tecla('Escape'); await espera();
    prueba('Esc con una hoja abierta encima no se va', D.body.classList.contains('dk-en-seccion'));
    hoja.remove();
    const campo = D.createElement('input'); D.body.appendChild(campo); campo.focus();
    tecla('Escape', campo); await espera();
    prueba('Esc escribiendo en un campo no se va', D.body.classList.contains('dk-en-seccion'));
    campo.remove();
    tecla('Escape'); await espera();
    prueba('Esc vuelve al Home', !D.body.classList.contains('dk-en-seccion'));
    prueba('el buscador mide la ruta (no se mete bajo la locación)', /getElementById\('dkMiga'\)\]\.forEach/.test(leer('src/desk-search.js')) && /#dkMiga b/.test(leer('src/desk-search.js')));
  }

  grupo('9. El orden de carga');
  const iMod = INDEX.indexOf('src/desk-shell.js');
  const iOpen = INDEX.indexOf('window.bsOpenSection = function');
  prueba('desk-shell.js carga', iMod > 0);
  prueba('después de quien define bsOpenSection', iOpen > 0 && iMod > iOpen);
  const iCss = INDEX.indexOf('styles/desk-shell.css');
  prueba('la hoja va después de app.css', iCss > INDEX.indexOf('styles/app.css'));
  prueba('y después de toolbar-pills.css', iCss > INDEX.indexOf('styles/toolbar-pills.css'));

  console.log(`\n${ok} ok, ${mal} mal`);
  process.exit(mal ? 1 : 0);
})();
