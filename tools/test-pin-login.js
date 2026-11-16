#!/usr/bin/env node
/*
 * ── Entrar como bartender: nombre y teclado (opción C) ───────────────
 *
 * Axel, 2026-11-12. Lo que no puede volver a pasar:
 *
 *   1. El login de siempre sigue igual, y arriba las pestañas "Email |
 *      PIN" (Axel, 2026-11-13, opción A: "no preguntar si eres
 *      bartender", con roles el PIN es de todos). PIN cambia la tarjeta
 *      al nombre y el teclado; en Sign up y Reset, no hay pestañas.
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
  const w = new JSDOM('<!doctype html><body>' + TARJETA + '</body>', { url: o.url || 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  if (o.modo) w.localStorage.setItem('barstock.loginMode', o.modo);
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k' };
  w.__entradas = []; w.__avisos = []; w.__recargas = 0;
  // /api/admin sin sesión (alta sin PIN): Nia tiene el código 482913.
  w.__altas = []; w.__pinNia = null;
  w.fetch = async (u, op) => {
    w.__avisos.push(String(u));
    if (/\/api\/admin$/.test(String(u))) {
      const b = JSON.parse(op.body); w.__altas.push(b);
      const casa = String(b.name || '').trim().toLowerCase() === 'nia' && b.code === '482913' && !w.__pinNia;
      const j = !casa ? { ok: false, error: 'That name and code don\u2019t match.' }
        : b.action === 'altaReclamar' ? (w.__pinNia = b.pin, { ok: true }) : { ok: true, name: 'Nia' };
      return { ok: true, status: 200, json: async () => j };
    }
    return { ok: true, json: async () => ({}) };
  };
  w.supabase = {};
  w.supabaseAuth = { auth: {
    signInWithPassword: async (c) => {
      w.__entradas.push(c);
      // Supabase mira el bloqueo ANTES que la contraseña: con cualquier PIN.
      if (/^leo@/.test(c.email)) return { error: { message: 'User is banned', code: 'user_banned', status: 400 } };
      if (/^nia@/.test(c.email)) return w.__pinNia && c.password === w.__pinNia ? { error: null } : { error: { message: 'Invalid login credentials' } };
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
    const tabs = d.getElementById('authPinTabs');
    prueba('arriba, antes del título, las pestañas Email | PIN', !!tabs && tabs.nextElementSibling === d.getElementById('authTitle') &&
      [...tabs.querySelectorAll('[data-modo]')].map(b => b.textContent.trim()).join('|') === 'Email|PIN' &&
      tabs.querySelector('[data-modo="email"]').classList.contains('on'));
    prueba('y ya no se pregunta si eres bartender', !/Bartender/i.test(d.getElementById('authCard').textContent));
    tabs.querySelector('[data-modo="pin"]').click();
    prueba('PIN cambia la tarjeta, sin "Bartender"', d.documentElement.classList.contains('auth-pin') &&
      d.getElementById('authTitle').textContent === 'Welcome back' && /name and the PIN you were given/.test(d.getElementById('authSub').textContent) &&
      tabs.querySelector('[data-modo="pin"]').classList.contains('on') && !/Bartender/i.test(d.getElementById('authCard').textContent));
    prueba('nombre, seis casillas y el teclado del 0 al 9 con borrar', !!d.getElementById('authPinName') &&
      d.querySelectorAll('#authPinBoxes i').length === 6 &&
      [...d.querySelectorAll('[data-k]')].map(b => b.dataset.k).sort().join() === '0,1,2,3,4,5,6,7,8,9,del');
    prueba('el PIN no es un campo: no sale el teclado del teléfono', !d.querySelector('#authPin input[type="password"], #authPin input[inputmode="numeric"]'));
    tabs.querySelector('[data-modo="email"]').click();
    prueba('Email la devuelve', !d.documentElement.classList.contains('auth-pin') && d.getElementById('authTitle').textContent === 'Welcome back' &&
      /Access your inventory/.test(d.getElementById('authSub').textContent));
    prueba('y lo recuerda', w.localStorage.getItem('barstock.loginMode') === 'email');
    // En Sign up y Reset password se usa el correo: elegir PIN ahí no
    // tiene sentido. auth.js marca <html> y el CSS esconde las pestañas.
    // Los enlaces del pie se enganchan en `load` (auth.js).
    w.dispatchEvent(new w.Event('load'));
    d.getElementById('authFootAction').click();
    prueba('en Sign up, <html> lo dice (sin pestañas)', d.documentElement.classList.contains('auth-no-login'));
    d.getElementById('authFootAction').click();
    prueba('de vuelta en login, sí', !d.documentElement.classList.contains('auth-no-login'));
    prueba('el CSS las esconde fuera de login', /html\.auth-no-login #authPinTabs\s*\{\s*display:\s*none/.test(leer('styles/auth.css')));
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

  grupo('3b · el acceso pausado (Axel, 2026-11-15, opción 1)');
  {
    const w = entorno({ modo: 'pin' });
    const d = w.document;
    d.getElementById('authPinName').value = 'Leo';
    '111111'.split('').forEach(x => d.querySelector('[data-k="' + x + '"]').click());
    await esperar(30);
    const t = d.getElementById('authPinPausa');
    prueba('la tarjeta sustituye al teclado', d.documentElement.classList.contains('auth-pin-pausa') && !!t, d.getElementById('authMsg').textContent);
    prueba('con su nombre y qué hacer', !!t && /Hi Leo, your access is paused/.test(t.textContent) && /manager/.test(t.textContent), t && t.textContent);
    prueba('sin "User is banned" ni el error rojo', !/banned/i.test(d.getElementById('authMsg').textContent) && !/don.t match/.test(d.getElementById('authMsg').textContent), d.getElementById('authMsg').textContent);
    prueba('no entra', w.__recargas === 0 && !w.__loc);
    const otro = t && t.querySelector('[data-pausa-otro]');
    prueba('"Not Leo?" para que entre otra persona', !!otro && /Not Leo\?/.test(otro.textContent));
    if (otro) otro.click();
    prueba('y vuelve el teclado, con el nombre vacío', !d.documentElement.classList.contains('auth-pin-pausa') && d.getElementById('authPinName').value === '' &&
      d.querySelectorAll('#authPinBoxes i.on').length === 0);
    d.getElementById('authPinName').value = 'Billie';
    '324324'.split('').forEach(x => d.querySelector('[data-k="' + x + '"]').click());
    await esperar(30);
    prueba('Billie entra como siempre después', w.__loc === "Will's & Bill's");
    const css = leer('styles/auth.css');
    prueba('el CSS esconde las casillas y el teclado con la tarjeta', /auth-pin-pausa[^{]*auth-pin-pad|auth-pin-pausa[^{]*#authPinBoxes/.test(css));
  }

  grupo('3c · alta sin PIN: nombre + código, y crea el suyo (Axel, 2026-11-16, C)');
  {
    const w = entorno({ modo: 'pin' });
    const d = w.document;
    const teclea = (t) => t.split('').forEach(x => d.querySelector('[data-k="' + x + '"]').click());
    d.getElementById('authPinName').value = 'Nia';
    teclea('482913'); await esperar(40);
    prueba('con el código en las casillas, pasa a crear su PIN', d.documentElement.classList.contains('auth-pin-crear') &&
      /Hi Nia/.test(d.getElementById('authTitle').textContent) && /Create your PIN/.test(d.getElementById('authSub').textContent),
      d.getElementById('authTitle').textContent + ' | ' + d.getElementById('authMsg').textContent);
    prueba('lo comprobó sin sesión, con nombre y código', w.__altas.length === 1 && w.__altas[0].action === 'altaVerificar' && w.__altas[0].code === '482913');
    teclea('135790'); await esperar(20);
    prueba('pide repetirlo', /again/i.test(d.getElementById('authSub').textContent) && d.querySelectorAll('#authPinBoxes i.on').length === 0);
    teclea('135791'); await esperar(20);
    prueba('si no son iguales, lo dice y vuelve a empezar', /didn.t match/i.test(d.getElementById('authMsg').textContent) && /Create your PIN/.test(d.getElementById('authSub').textContent));
    teclea('135790'); await esperar(20); teclea('135790'); await esperar(60);
    const rec = w.__altas.find(x => x.action === 'altaReclamar');
    prueba('lo guarda con su código', !!rec && rec.pin === '135790' && rec.code === '482913' && rec.name === 'Nia');
    prueba('y entra con él', w.__loc === "Will's & Bill's" && !d.documentElement.classList.contains('auth-pin-crear'));

    const w2 = entorno({ modo: 'pin' });
    w2.document.getElementById('authPinName').value = 'Billie';
    '777777'.split('').forEach(x => w2.document.querySelector('[data-k="' + x + '"]').click());
    await esperar(40);
    prueba('un PIN malo de alguien con PIN: lo de siempre, nada más', /name and PIN don.t match/.test(w2.document.getElementById('authMsg').textContent) &&
      !w2.document.documentElement.classList.contains('auth-pin-crear'));

    const w3 = entorno({ url: 'https://app.barstockpro.com/?alta=Nia&c=482913' });
    await esperar(60);
    prueba('el QR abre directo en crear su PIN, con su nombre', w3.document.documentElement.classList.contains('auth-pin-crear') &&
      w3.document.getElementById('authPinName').value === 'Nia' && /Hi Nia/.test(w3.document.getElementById('authTitle').textContent));
    prueba('y el código sale de la dirección', !/c=482913/.test(w3.location.href) && !/alta=/.test(w3.location.href), w3.location.href);
    const w4 = entorno({ url: 'https://app.barstockpro.com/?alta=Nia&c=000000' });
    await esperar(60);
    prueba('un QR viejo lo dice y deja el login normal', /ask your manager for a new one/i.test(w4.document.getElementById('authMsg').textContent) &&
      !w4.document.documentElement.classList.contains('auth-pin-crear') && w4.document.documentElement.classList.contains('auth-pin'));
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
