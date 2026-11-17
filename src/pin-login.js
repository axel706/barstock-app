(() => {
  if (window.BarStockPinLogin) return;
  // ── Entrar con nombre y PIN ──────────────────────────────────────────
  //
  // Axel, 2026-11-12, opción C sobre lámina: el nombre y un teclado
  // numérico grande, "como un datáfono", más rápido en la barra. Nació
  // para el bartender; desde los roles (2026-11-13) entra así cualquiera
  // con PIN: owner, manager o bartender.
  //
  // Cómo se elige (Axel, 2026-11-13, opción A): arriba de la tarjeta,
  // antes del título, las pestañas "Email | PIN", las mismas de People y
  // de la tarjeta de Toast. Antes era un enlace abajo, "Bartender? Sign
  // in with your PIN", y Axel: "no preguntar si eres bartender". En Sign
  // up y Reset password no salen: ahí se usa el correo (auth.js marca
  // <html> con auth-no-login). El teléfono recuerda el último modo: quien
  // entra con PIN abre ya en el PIN.
  //
  // Aquí sólo se reúnen nombre y PIN. Entrar lo hace el login de
  // siempre (BarStockAuth.login), con el correo que sale del nombre
  // (src/bartender-id.js, el mismo archivo que usa api/admin.js al
  // crearlo) y el PIN de contraseña.
  //
  // El PIN se mete con las teclas, no con un <input>: así no sale el
  // teclado del teléfono tapando la tarjeta, y no hay campo por debajo
  // de 16px que haga zoom en iOS. El nombre sí es un campo.

  const MODO = 'barstock.loginMode';
  const LARGO = 6;
  let _pin = '';
  let _ocupado = false;

  const $ = (id) => document.getElementById(id);
  const raiz = () => document.documentElement;

  function guardarModo(m) { try { localStorage.setItem(MODO, m); } catch (e) {} }
  function modoGuardado() { try { return localStorage.getItem(MODO) || ''; } catch (e) { return ''; } }

  function pintarCasillas() {
    const c = $('authPinBoxes');
    if (!c) return;
    c.innerHTML = Array.from({ length: LARGO }, (_, i) =>
      '<i class="' + (i < _pin.length ? 'on' : '') + '"></i>').join('');
    c.setAttribute('aria-label', _pin.length + ' of ' + LARGO + ' digits');
  }

  function decir(t) { const m = $('authMsg'); if (m) m.textContent = t || ''; }

  // La pestaña encendida, la del modo.
  function marcarTabs(modo) {
    const t = $('authPinTabs');
    if (!t) return;
    t.querySelectorAll('[data-modo]').forEach(b => {
      const on = b.dataset.modo === modo;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  function abrir() {
    raiz().classList.add('auth-pin');
    raiz().classList.remove('auth-pin-loc');
    guardarModo('pin');
    marcarTabs('pin');
    _pin = ''; pintarCasillas(); decir('');
    const t = $('authTitle'), s = $('authSub');
    if (t) t.textContent = 'Welcome back';
    if (s) s.textContent = 'Your name and the PIN you were given.';
  }

  function cerrar() {
    raiz().classList.remove('auth-pin', 'auth-pin-loc');
    guardarModo('email');
    marcarTabs('email');
    _pin = ''; decir('');
    const t = $('authTitle'), s = $('authSub');
    if (t) t.textContent = 'Welcome back';
    if (s) s.textContent = 'Access your inventory and ordering workspace.';
  }

  // ── Alta sin PIN: el código y crear el suyo (Axel, 2026-11-16, C) ───
  //
  // Quien la creó en People le dio un código de 6 dígitos (o el QR, que
  // lo trae). Se escribe en las MISMAS casillas del PIN: si el login
  // normal falla, auth.js prueba esos 6 dígitos como código. Así nada en
  // la pantalla dice qué nombres existen o esperan su PIN: con un código
  // malo sale el "That name and PIN don't match" de siempre. Con uno
  // bueno, "Hi Nia · Create your PIN", dos veces, y entra con él.
  // /api/admin contesta esto sin sesión (altaVerificar / altaReclamar).
  let _alta = null;   // { nombre, code, paso: 1 | 2, primero }

  async function llamarAlta(cuerpo) {
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      return await r.json();
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  }
  function titulos(t, sub) {
    const a = $('authTitle'), b = $('authSub');
    if (a) a.textContent = t;
    if (b) b.textContent = sub;
  }
  async function probarAlta(nombre, code) {
    nombre = String(nombre || '').trim();
    if (!nombre || !/^\d{6}$/.test(String(code || ''))) return false;
    const r = await llamarAlta({ action: 'altaVerificar', name: nombre, code: String(code) });
    if (!r || !r.ok) return false;
    _alta = { nombre: r.name || nombre, code: String(code), paso: 1, primero: '' };
    raiz().classList.add('auth-pin-crear');
    titulos('Hi ' + _alta.nombre, 'Create your PIN · 6 digits');
    _pin = ''; pintarCasillas(); decir('');
    return true;
  }
  function salirAlta() {
    _alta = null;
    raiz().classList.remove('auth-pin-crear');
    titulos('Welcome back', 'Your name and the PIN you were given.');
  }
  async function pasoAlta() {
    const a = _alta;
    if (a.paso === 1) {
      // El código no vale como PIN: Drew (2026-11-17) lo escribió otra
      // vez creyendo que se lo volvían a pedir, y su PIN quedó igual al
      // código del correo. El servidor también lo rechaza.
      if (_pin === a.code) {
        _pin = ''; pintarCasillas();
        decir('That\u2019s your code. Choose a different PIN.');
        return;
      }
      a.primero = _pin; a.paso = 2; _pin = ''; pintarCasillas();
      titulos('Hi ' + a.nombre, 'Type it again to confirm'); decir('');
      return;
    }
    if (_pin !== a.primero) {
      a.paso = 1; a.primero = ''; _pin = ''; pintarCasillas();
      titulos('Hi ' + a.nombre, 'Create your PIN · 6 digits');
      decir('They didn\u2019t match. Create your PIN again.');
      return;
    }
    const pin = _pin, nombre = a.nombre;
    _ocupado = true; raiz().classList.add('auth-pin-busy'); decir('Saving your PIN…');
    const r = await llamarAlta({ action: 'altaReclamar', name: nombre, code: a.code, pin });
    _ocupado = false; raiz().classList.remove('auth-pin-busy');
    _pin = ''; pintarCasillas();
    if (!r || !r.ok) { salirAlta(); decir('Your PIN was not saved: ' + ((r && r.error) || 'no answer')); return; }
    salirAlta();
    _pin = pin;
    await entrar();
  }

  async function entrar() {
    if (_alta) return pasoAlta();
    if (_ocupado) return;
    const nombre = ($('authPinName') && $('authPinName').value) || '';
    const ID = window.BarStockBartenderId;
    if (!ID || !ID.nombreValido(nombre)) { decir('Enter your name.'); return; }
    if (_pin.length !== LARGO) return;
    _ocupado = true;
    raiz().classList.add('auth-pin-busy');
    decir('Signing in…');
    try {
      await window.BarStockAuth.login({ email: ID.correo(nombre), password: _pin, pin: true, nombre: nombre.trim() });
    } finally {
      _ocupado = false;
      raiz().classList.remove('auth-pin-busy');
      // Si el login se quedó en "elige locación" (Billie en dos bares),
      // ese paso es el del login de siempre: se enseña su selector y su
      // botón, y el teclado se aparta.
      const paso = $('authLocationStep');
      if (paso && paso.style.display === 'block') raiz().classList.add('auth-pin-loc');
      else { _pin = ''; pintarCasillas(); }
    }
  }

  // ── El acceso pausado (Axel, 2026-11-15, opción 1 sobre lámina) ────
  //
  // Quien lo pausó desde People no la borró: Supabase la bloquea y
  // contesta "User is banned". En vez de ese texto o de un error rojo, la
  // tarjeta con su nombre y qué hacer. Supabase mira el bloqueo ANTES que
  // la contraseña, así que sale con cualquier PIN para ese nombre: decir
  // "That name and PIN don't match" sería mentir (fallo nº 6 de
  // CLAUDE.md). La llama auth.js; "Not Leo?" deja entrar a otra persona.
  function pausado(nombre) {
    const t = $('authPinPausa');
    if (!t) return;
    const n = String(nombre || '').trim();
    const esc = (x) => x.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    t.innerHTML = '<i class="ti ti-lock" aria-hidden="true"></i>' +
      '<b>Hi ' + esc(n) + ', your access is paused</b>' +
      '<p>Talk to a manager to get back in. Your PIN will work again as soon as they turn it on.</p>' +
      '<button type="button" data-pausa-otro>Not ' + esc(n) + '? Sign in as someone else</button>';
    t.querySelector('[data-pausa-otro]').onclick = () => {
      quitarPausa();
      const c = $('authPinName');
      if (c) { c.value = ''; c.focus(); }
    };
    raiz().classList.add('auth-pin-pausa');
    decir('');
  }
  function quitarPausa() {
    raiz().classList.remove('auth-pin-pausa');
    _pin = ''; pintarCasillas(); decir('');
  }

  function tecla(d) {
    if (_ocupado || raiz().classList.contains('auth-pin-pausa')) return;
    if (d === 'del') _pin = _pin.slice(0, -1);
    else if (_pin.length < LARGO) _pin += d;
    pintarCasillas();
    if (_pin.length === LARGO) entrar();
  }

  function montar() {
    const msg = $('authMsg'), titulo = $('authTitle');
    if (!msg || !titulo || $('authPin')) return;
    const bloque = document.createElement('div');
    bloque.id = 'authPin';
    bloque.innerHTML =
      '<label class="auth-label" for="authPinName">Name</label>' +
      '<div class="auth-field"><input id="authPinName" type="text" autocomplete="username" autocapitalize="words" ' +
        'spellcheck="false" placeholder="Your name"></div>' +
      '<div id="authPinBoxes" class="auth-pin-boxes" role="status"></div>' +
      '<div class="auth-pin-pad">' +
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(k => k === ''
          ? '<span></span>'
          : '<button type="button" class="auth-pin-key' + (k === 'del' ? ' del' : '') + '" data-k="' + k + '"' +
            (k === 'del' ? ' aria-label="Delete"><i class="ti ti-backspace" aria-hidden="true"></i>' : '>' + k) + '</button>').join('') +
      '</div>' +
      // El acceso pausado: sale en lugar de las casillas y el teclado.
      '<div id="authPinPausa" role="status"></div>';
    msg.parentNode.insertBefore(bloque, msg.nextSibling);

    // Las pestañas, arriba, antes del título.
    const tabs = document.createElement('div');
    tabs.id = 'authPinTabs';
    tabs.className = 'auth-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.innerHTML =
      '<button type="button" role="tab" data-modo="email" class="on" aria-selected="true">Email</button>' +
      '<button type="button" role="tab" data-modo="pin" aria-selected="false">PIN</button>';
    titulo.parentNode.insertBefore(tabs, titulo);

    bloque.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => tecla(b.dataset.k); });
    tabs.querySelector('[data-modo="email"]').onclick = cerrar;
    tabs.querySelector('[data-modo="pin"]').onclick = abrir;
    // Con teclado físico (o el de un iPad), los números también valen.
    document.addEventListener('keydown', (e) => {
      if (!raiz().classList.contains('auth-pin') || e.target === $('authPinName')) return;
      if (/^\d$/.test(e.key)) tecla(e.key);
      else if (e.key === 'Backspace') tecla('del');
    });
    const n = $('authPinName');
    // Cambiar el nombre quita la tarjeta: es otra persona.
    n.addEventListener('input', () => {
      if (raiz().classList.contains('auth-pin-pausa')) quitarPausa();
      if (_alta) { salirAlta(); _pin = ''; pintarCasillas(); decir(''); }
    });
    n.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); n.blur(); } });
    pintarCasillas();
    if (modoGuardado() === 'pin') abrir();

    // El QR de People: ?alta=Nombre&c=código. Se borra de la dirección
    // en cuanto se lee, para que no quede en el historial ni en una
    // captura, y se prueba como si se hubiera tecleado.
    let qs = null;
    try { qs = new URLSearchParams(window.location.search); } catch (e) {}
    const an = qs && qs.get('alta');
    if (an) {
      const ac = qs.get('c') || '';
      try {
        qs.delete('alta'); qs.delete('c');
        const resto = qs.toString();
        window.history.replaceState(null, '', window.location.pathname + (resto ? '?' + resto : '') + window.location.hash);
      } catch (e) {}
      abrir();
      n.value = an;
      probarAlta(an, ac).then(ok => {
        if (!ok) decir('This code doesn\u2019t work anymore. Ask your manager for a new one.');
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();

  window.BarStockPinLogin = { montar, abrir, cerrar, tecla, pausado, probarAlta, LARGO };
})();
