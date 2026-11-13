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

  async function entrar() {
    if (_ocupado) return;
    const nombre = ($('authPinName') && $('authPinName').value) || '';
    const ID = window.BarStockBartenderId;
    if (!ID || !ID.nombreValido(nombre)) { decir('Enter your name.'); return; }
    if (_pin.length !== LARGO) return;
    _ocupado = true;
    raiz().classList.add('auth-pin-busy');
    decir('Signing in…');
    try {
      await window.BarStockAuth.login({ email: ID.correo(nombre), password: _pin, pin: true });
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

  function tecla(d) {
    if (_ocupado) return;
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
      '</div>';
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
    n.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); n.blur(); } });
    pintarCasillas();
    if (modoGuardado() === 'pin') abrir();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();

  window.BarStockPinLogin = { montar, abrir, cerrar, tecla, LARGO };
})();
