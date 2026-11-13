#!/usr/bin/env node
/*
 * ── El bartender invitado, en las pantallas del teléfono ─────────────
 *
 * Axel, 2026-11-12, opción 1: "Guest · Billie" bajo el logo, y lo que
 * edita no sale. Lo que impide escribir es src/guest.js (test-invitado);
 * aquí, que lo que se ve no prometa lo que no hace:
 *
 *   1. La píldora sale en la banda para un invitado, con su nombre, y
 *      para nadie más.
 *   2. Settings le enseña sólo lo de Toast (con Recipes, que sí edita) y
 *      lo de su teléfono (letra y tamaño); People, a nadie más que Axel.
 *   3. Los dos toques que mezclaban mirar y editar: la fila de Inventory
 *      abre la ficha, y la tarjeta del ciclo del Home va marcada.
 *   4. El CSS esconde cada control que edita, y nada de Recipes.
 *
 *   node tools/test-invitado-pantallas.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = ms => new Promise(r => setTimeout(r, ms));

function ventana(rol, nombre) {
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  if (rol) w.localStorage.setItem('sb-x-auth-token', JSON.stringify({ user: { id: 'u',
    app_metadata: { role: rol }, user_metadata: { first_name: nombre || '' } } }));
  w.eval(leer('src/bartender-id.js'));
  w.eval(leer('src/guest.js'));
  return w;
}

(async () => {
  grupo('1 · la píldora en la banda');
  {
    const src = leer('src/mobile-shell.js');
    const f = /function pildoraInvitado\(\) \{[\s\S]*?\n  \}/.exec(src);
    prueba('la banda la pinta', !!f && /'<span class="m-band-ico"><\/span>' \+[\s\S]{0,400}pildoraInvitado\(\)/.test(src));
    const con = (w) => { w.eval('window.__p = (' + f[0].replace('function pildoraInvitado()', 'function ()') + ')();'); return w.__p; };
    const b = con(ventana('bartender', 'Billie'));
    // Axel, 2026-11-13: "en lugar de guest puede decir Bartender Mode".
    prueba('un invitado: "Bartender Mode"', /m-guest-pill/.test(b) && /Bartender Mode/.test(b) && !/Guest/.test(b), b);
    prueba('cualquier otro: nada', con(ventana('staff', 'Sam')) === '' && con(ventana()) === '');
  }

  grupo('1a · la marca va DENTRO de la banda (opción A, 2026-11-13)');
  {
    const css = leer('styles/mobile-app.css');
    const r = /\n  \.m-guest-pill \{([\s\S]*?)\n  \}/.exec(css);
    prueba('anclada al fondo de la banda, no colgando por debajo', !!r && /bottom: 4px/.test(r[1]) && !/top:\s*calc\(100%/.test(r[1]), r && r[1]);
    prueba('lo de en medio sube para dejarle sitio', /html\.bs-guest \.m-band \{ padding-bottom: 10px; \}/.test(css) &&
      /html\.bs-guest :is\(\.m-band-titulo, \.m-band-seccion\) \{ bottom: 10px; height: 42px; line-height: 42px; \}/.test(css));
  }

  grupo('1b · el saludo y el botón verde');
  {
    // El saludo, de verdad: soloNombre y saludo de mobile-home.js.
    const home = leer('src/mobile-home.js');
    const sn = /function soloNombre\(n\) \{[\s\S]*?\n  \}/.exec(home)[0];
    const sa = /function saludo\(\) \{[\s\S]*?\n  \}/.exec(home)[0];
    const hola = (w) => { w.eval('window.__s = (function(){ const hoy = () => "Thursday"; let _nombre = "Axel"; const cargarNombre = () => {}; ' +
      sn + sa + ' return saludo(); })();'); return w.__s; };
    prueba('Billie: "Hello, Billie", no el remitente de la locación', hola(ventana('bartender', 'Billie Jean')) === 'Hello, Billie');
    prueba('los demás: el de siempre', hola(ventana('staff')) === 'Hello, Axel');
    // El botón verde: escaneo() de mobile-shell.js.
    const sh = leer('src/mobile-shell.js');
    const es = /function escaneo\(\) \{[\s\S]*?\n  \}/.exec(sh)[0];
    const esc = (w) => { w.BarStockMobileCycle = { escaneo: () => ({ activo: true }) }; w.eval('window.__e = (' + es.replace('function escaneo()', 'function ()') + ')();'); return w.__e; };
    const e = esc(ventana('bartender', 'Billie'));
    prueba('Billie: el escáner apagado, con un aviso que dice por qué', e.activo === false && e.dialogo.soloAviso === true && /Bartender Mode/.test(e.dialogo.titulo));
    prueba('los demás: lo que diga el ciclo', esc(ventana('staff')).activo === true);
  }

  grupo('2 · Settings');
  {
    async function menu(w) {
      const reg = [];
      w.BarStockMobile = Object.assign({ register: x => reg.push(x), ir: () => {}, volver: () => {}, nombreAnterior: () => 'More' },
        require('./lib-cabecera'));
      w.BARSTOCK_CONFIG = { LOCATION_NAME: 'Crown', ADMIN_EMAIL: 'axel@x.com' };
      w.eval(leer('src/admin-api.js'));
      w.eval(leer('src/mobile-settings.js'));
      // jsdom sigue "loading" al evaluar: el módulo espera a DOMContentLoaded.
      if (!reg.length) await new Promise(r => w.document.addEventListener('DOMContentLoaded', r));
      const host = w.document.createElement('div'); w.document.body.appendChild(host);
      reg.find(r => r.id === 'settings').mount(host);
      await esperar(30);
      return [...host.querySelectorAll('.m-item-t')].map(e => e.firstChild.textContent.trim()).join(',');
    }
    const inv = await menu(ventana('bartender', 'Billie'));
    prueba('el invitado ve lo de Toast y lo de su teléfono', inv === 'Wine from Toast,Liquor from Toast,Recipes,Morning email,Typeface,Text size', inv);
    const w = ventana(); w.__bsUserEmail = 'axel@x.com';
    const ax = await menu(w);
    prueba('Axel ve todo, con People › Bartenders', /Sender/.test(ax) && /Bartenders/.test(ax) && /Background/.test(ax), ax);
    const sam = ventana('staff'); sam.__bsUserEmail = 'sam@x.com';
    prueba('Sam (staff) lo de siempre, sin People', !/Bartenders/.test(await menu(sam)));
  }

  grupo('3 · mirar y editar no son el mismo toque');
  {
    const inv = leer('src/mobile-inventory.js');
    prueba('Inventory: para un invitado la fila abre la ficha (abrirItem)', /invitado\s*\n?\s*\? \(\) => \{ const r = master\(\)\[Number\(b\.dataset\.i\)\]; if \(r\) S\.abrirItem\(r\.item\); \}/.test(inv));
    prueba('y para los demás, la hoja de editar como siempre', /: \(\) => hoja\(host, Number\(b\.dataset\.i\)\)/.test(inv));
    const home = leer('src/mobile-home.js');
    prueba('Home: la tarjeta del ciclo se marca, y ninguna otra', /\[Object\.assign\(tarjetaCiclo\(\), \{ ciclo: true \}\)\]/.test(home) &&
      (home.match(/ciclo: true/g) || []).length === 1 && /\$\{c\.ciclo \? ' data-kind="cycle"' : ''\}/.test(home));
  }

  grupo('4 · el CSS');
  {
    const css = leer('styles/mobile-app.css');
    const i = css.indexOf('/* ── El bartender invitado: lo que edita, fuera de la vista');
    const bloque = i >= 0 ? css.slice(i) : '';
    prueba('el bloque existe, dentro del teléfono', /@media \(max-width: 640px\) \{/.test(bloque));
    const escondidos = ['#mcGo', '#mcDrop', '#miNuevo', '.m-ficha .m-acts', '#msIQ', '#moRun', '#moSend', '#moAdd', '.m-ord-x', '.m-ord-q [data-q]',
      '#mhPrec', '.m-hacc', '#miOrdOn', '.m-ichg', '.m-idanger', '[data-unlink]', '#mnfGo', '.m-nf-x', '#mTwTodas', '.m-tl-todas', '#mrSend', '#mrListaCaja',
      '.m-hero[data-kind="cycle"] :is(.m-hero-b, .m-hero-b2)', '.m-hero-x:has(.ti-trash)', '#mcfSync', '.m-cf-b[data-cf="ayer"]'];
    const faltan = escondidos.filter(x => bloque.indexOf(x) < 0);
    prueba('esconde cada control que edita', !faltan.length, faltan.join(' '));
    prueba('todo bajo html.bs-guest', bloque.split('{')[1] && !/\n  #mScreens|\n  #mSheet/.test(bloque.split('@media (max-width: 640px) {')[1] || ''));
    prueba('nada de Recipes: ni .m-rc, ni .m-re, ni sus botones', !/\.m-rc\b|\.m-re\b|#reSave|#rcNueva/.test(bloque.replace(/\/\*[\s\S]*?\*\//g, '').replace(/:not\(\.m-rc\)/g, '')));
    prueba('lo compartido va acotado: la hoja de botellas no se toca', !/\.m-tl-hoja|\.m-tl-res|\.m-set-save/.test(bloque.replace(/\/\*[\s\S]*?\*\//g, '')));
    prueba('la fila de licor queda quieta, no escondida (enseña la botella)', /html\.bs-guest #mScreens \.m-tl \.m-tl-fila \{?[\s\S]{0,40}/.test(bloque) &&
      /\.m-tl \.m-tl-fila \{\s*pointer-events: none;/.test(bloque));
  }

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
