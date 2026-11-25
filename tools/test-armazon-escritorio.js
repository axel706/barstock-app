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
  for (const it of S.ITEMS.filter(x => x.sec)) {
    prueba(`${it.label} apunta a una sección de index.html (#${it.sec}Section)`,
      INDEX.includes(`id="${it.sec}Section"`));
  }

  grupo('2. Lo que aún no hay sale "Soon" y no es un botón');
  for (const id of ['runningOut', 'transfers', 'sales', 'counts']) {
    const e = item(id);
    prueba(id + ' sale con "Soon"', !!e && /Soon/.test(e.textContent));
    prueba(id + ' no es un botón', !!e && e.tagName !== 'BUTTON');
  }
  llamadas.length = 0;
  item('runningOut') && item('runningOut').click();
  S.ir('sales');
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
  const escondidos = [...CSS.matchAll(/([^{}]+)\{[^}]*display:\s*none/g)].map(m => m[1]).join(' ');
  for (const id of ['importMenuBtn', 'exportMenuBtn', 'bsMoreBtn', 'cycleBtn', 'headerLocationSelect', 'themeToggle', 'authLogoutBtn', 'importMenu', 'exportMenu', 'bsMoreMenu']) {
    prueba(`#${id} no lleva display:none`, !new RegExp('#' + id + '\\b').test(escondidos));
  }
  prueba('Settings del header se esconde porque está en la barra', /#settingsBtn/.test(escondidos) && !!item('settings'));
  prueba('los grupos de Import, Export y More llevan su marca',
    !!D.querySelector('.dk-imp #importMenuBtn') && !!D.querySelector('.dk-exp #exportMenuBtn') && !!D.querySelector('.dk-mas #bsMoreBtn'));

  grupo('8. En el teléfono no existe');
  const fuera = CSS.split('@media')[0];
  prueba('fuera de las media queries, #dkLado va escondido', /#dkLado\s*\{\s*display:\s*none/.test(fuera));
  prueba('fuera de las media queries no hay más reglas', fuera.replace(/\/\*[\s\S]*?\*\//g, '').replace(/#dkLado\s*\{\s*display:\s*none;\s*\}/, '').trim() === '');
  prueba('la barra se enseña sólo desde 641 px', /@media \(min-width: 641px\)\s*\{[\s\S]*body\.dk #dkLado\s*\{\s*display:\s*flex/.test(CSS));

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
