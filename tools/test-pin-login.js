#!/usr/bin/env node
/*
 * ── Entrar como bartender: nombre y teclado (opción C) ───────────────
 *
 * Axel, 2026-11-12. Lo que no puede volver a pasar:
 *
 *   1. El login de siempre sigue igual, y "Bartender? Sign in with your
 *      PIN" cambia la tarjeta al nombre y el teclado.
 *   2. Seis teclas entran solas, con el correo que sale del nombre
 *      (src/bartender-id.js, el mismo que usa api/admin.js) y el PIN.
 *   3. Entrar es el MISMO camino que con correo (BarStockAuth.login): la
 *      locación, el aviso de entrada y recargar. Y "Invalid login
 *      credentials" se dice como lo que es: nombre y PIN no casan.
 *   4. El teléfono recuerda el modo: el de Billie abre en el PIN.
 *   5. Billie en dos locaciones: el paso de elegirla aparece.
 *
 *   node tools/test-pin-login.js
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

// La tarjeta de entrada de verdad, sacada de index.html.
const IDX = leer('index.html');
const TARJETA = IDX.slice(IDX.indexOf('<div id="authOverlay">'), IDX.indexOf('<div id="locCurtain"'));

function entorno(o) {
  o = o || {};
  const w = new JSDOM('<!doctype html><body>' + TARJETA + '</body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  if (o.modo) w.localStorage.setItem('barstock.loginMode', o.modo);
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k' };
  w.__entradas = []; w.__avisos = []; w.__recargas = 0;
  w.fetch = async (u, op) => { w.__avisos.push(String(u)); return { ok: true, json: async () => ({}) }; };
  w.supabase = {};
  w.supabaseAuth = { auth: {
    signInWithPassword: async (c) => {
      w.__entradas.push(c);
      return c.password === '324324' ? { error: null } : { error: { message: 'Invalid login credentials' } };
    },
    signOut: async () => ({}),
    getUser: async () => ({ data: {}, error: null })
  } };
  w.BarStockLocationAccess = {
    getAllowedLocations: async () => o.locs || [{ name: "Will's & Bill's", locationId: 'wb' }],
    setActiveLocationName: (n) => { w.__loc = n; }
  };
  w.eval(leer('src/bartender-id.js'));
  w.eval(leer('src/auth.js'));
  w.eval(leer('src/pin-login.js'));
  // En jsdom el documento sigue "loading" al evaluar: el módulo espera a
  // DOMContentLoaded. Montar ya es lo mismo (montar no se repite).
  w.BarStockPinLogin.montar();
  return w;
}

(async () => {
  grupo('1 · el login de siempre, y el enlace');
  {
    const w = entorno();
    const d = w.document;
    prueba('sin modo guardado: el de correo, sin la clase', !d.documentElement.classList.contains('auth-pin'));
    prueba('debajo, "Bartender? Sign in with your PIN"', /Bartender\? Sign in with your PIN/.test(d.getElementById('authPinGo').textContent));
    d.getElementById('authPinOpen').click();
    prueba('al tocarlo, la tarjeta pasa al PIN', d.documentElement.classList.contains('auth-pin') && d.getElementById('authTitle').textContent === 'Bartender sign in');
    prueba('nombre, seis casillas y el teclado del 0 al 9 con borrar', !!d.getElementById('authPinName') &&
      d.querySelectorAll('#authPinBoxes i').length === 6 &&
      [...d.querySelectorAll('[data-k]')].map(b => b.dataset.k).sort().join() === '0,1,2,3,4,5,6,7,8,9,del');
    prueba('el PIN no es un campo: no sale el teclado del teléfono', !d.querySelector('#authPin input[type="password"], #authPin input[inputmode="numeric"]'));
    d.getElementById('authPinEmail').click();
    prueba('"Sign in with email" la devuelve', !d.documentElement.classList.contains('auth-pin') && d.getElementById('authTitle').textContent === 'Welcome back');
    prueba('y lo recuerda', w.localStorage.getItem('barstock.loginMode') === 'email');
  }

  grupo('2 · seis teclas entran solas');
  {
    const w = entorno({ modo: 'pin' });
    const d = w.document;
    prueba('el teléfono de Billie abre ya en el PIN', d.documentElement.classList.contains('auth-pin'));
    const k = (x) => d.querySelector('[data-k="' + x + '"]').click();
    k('3'); k('2');
    prueba('sin nombre, al sexto dígito lo pide', (k('4'), k('3'), k('2'), k('4'), true) && /Enter your name/.test(d.getElementById('authMsg').textContent) && !w.__entradas.length);
    d.getElementById('authPinName').value = '  Billie ';
    k('del');
    prueba('borrar quita un dígito', d.querySelectorAll('#authPinBoxes i.on').length === 5);
    k('4'); await esperar(30);
    prueba('al sexto, entra con el correo del nombre y el PIN', w.__entradas.length === 1 &&
      w.__entradas[0].email === 'billie@bartenders.barstockpro.com' && w.__entradas[0].password === '324324', JSON.stringify(w.__entradas));
    prueba('y sigue el camino de siempre: locación y aviso de entrada', w.__loc === "Will's & Bill's" && w.__avisos.some(u => /notify\?type=login/.test(u)));
  }

  grupo('3 · un PIN equivocado');
  {
    const w = entorno({ modo: 'pin' });
    const d = w.document;
    d.getElementById('authPinName').value = 'Billie';
    '111111'.split('').forEach(x => d.querySelector('[data-k="' + x + '"]').click());
    await esperar(30);
    prueba('dice que no casan, no "Invalid login credentials"', /name and PIN don.t match/.test(d.getElementById('authMsg').textContent), d.getElementById('authMsg').textContent);
    prueba('y las casillas se vacían para volver a probar', d.querySelectorAll('#authPinBoxes i.on').length === 0);
    prueba('el login de correo no cambia su mensaje', /Invalid login credentials/.test(leer('src/auth.js')) && /conPin && \/invalid login credentials\/i/.test(leer('src/auth.js')));
  }

  grupo('4 · Billie en dos locaciones');
  {
    const w = entorno({ modo: 'pin', locs: [{ name: 'Crown', locationId: 'c' }, { name: "Will's & Bill's", locationId: 'wb' }] });
    const d = w.document;
    d.getElementById('authPinName').value = 'Billie';
    '324324'.split('').forEach(x => d.querySelector('[data-k="' + x + '"]').click());
    await esperar(30);
    prueba('aparece el paso de elegir locación, con su botón', d.getElementById('authLocationStep').style.display === 'block' &&
      d.documentElement.classList.contains('auth-pin-loc') && d.getElementById('authLocationSelect').options.length === 2);
    const css = leer('styles/auth.css');
    prueba('el CSS enseña ese botón y aparta el teclado', /html\.auth-pin\.auth-pin-loc #authLoginBtn\{\s*display:block !important;/.test(css) &&
      /html\.auth-pin\.auth-pin-loc #authPin\{\s*display:none;/.test(css));
  }

  grupo('5 · el orden y las trampas de siempre');
  {
    const pos = f => IDX.indexOf('src="src/' + f);
    prueba('pin-login.js después de auth.js y de bartender-id.js', pos('auth.js') < pos('pin-login.js') && pos('bartender-id.js') < pos('pin-login.js'));
    prueba('las teclas le ganan al radio de 999px con el ID delante', /#authCard \.auth-pin-key\{[^}]*border-radius:14px !important/.test(leer('styles/auth.css')));
  }

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
