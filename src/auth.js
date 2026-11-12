(() => {
  const CONFIG = window.BARSTOCK_CONFIG || {};
  const SUPABASE_URL = CONFIG.SUPABASE_URL;
  const SUPABASE_KEY = CONFIG.SUPABASE_KEY;

  let authClient = null;

  function getAuthClient(){
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('BarStock config is missing Supabase credentials');
    }

    authClient = authClient || window.supabaseAuth || window.BarStockSupabase.getClient();
    window.supabaseAuth = authClient;
    return authClient;
  }

  // ── La pantalla de entrada está puesta de entrada ────────────────
  //
  // Antes nacía oculta y se mostraba al confirmar que NO había sesión.
  // Como esa confirmación es un viaje a Supabase, durante medio segundo
  // largo se veía la aplicación entera antes de que apareciera el login.
  //
  // Ahora el CSS la pinta desde el primer fotograma y estas dos
  // funciones solo ponen y quitan la clase que la aparta. Mostrarla no
  // es "abrirla": es dejarla donde ya estaba.
  // ── Levantar la cortina del cambio de locación ──────────────────
  //
  // La define el script en línea del <head> (index.html). Aquí solo se
  // llama, y se llama en LOS DOS lados: tanto si hay sesión como si no.
  // La cortina no dice "estás dentro", dice "estoy averiguando"; en
  // cuanto hay respuesta, sea cual sea, sobra.
  //
  // Si no existe, es que no había cortina que levantar. No es un fallo.
  function levantarCortina(){
    try { if (window.__bsLiftCurtain) window.__bsLiftCurtain(); } catch (e) {}
    // Lo mismo para la llegada de una versión nueva (el punto azul que
    // se abre): la define el <head> solo si se viene de actualizar.
    try { if (window.__bsUpdListo) window.__bsUpdListo(); } catch (e) {}
  }

  function showOverlay(){
    document.body.classList.add('auth-locked');
    document.body.style.pointerEvents = '';
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.classList.remove('auth-ok');
    levantarCortina();
  }

  function hideOverlay(){
    const logoutBtn = document.getElementById('authLogoutBtn');
    if (logoutBtn) {
      logoutBtn.style.display = 'block';
      logoutBtn.style.opacity = '1';
    }
    document.body.classList.remove('auth-locked');
    document.body.style.pointerEvents = '';
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.classList.add('auth-ok');
    levantarCortina();
    // Con la app a la vista: la primera vez en un teléfono apunta la
    // versión. What's new ya no sale aquí; lo saca el UPDATE de la
    // tarjeta del Home (version-center.js, alEntrar).
    try { if (window.BarStockVersionCenter && window.BarStockVersionCenter.alEntrar) window.BarStockVersionCenter.alEntrar(); } catch (e) {}
  }

  // ─── Cuándo se cierra la sesión sola ─────────────────────────────
  // A medianoche (Nueva York), recorriéndose 2 h mientras alguien use la
  // app en los 30 minutos antes del corte. La regla vive en
  // session-cutoff.js; aquí se guarda y se aplica.
  //
  // Antes era "30 minutos sin tocar la app" con un setTimeout. En el
  // iPhone el temporizador se congela con la app en segundo plano y el
  // cierre era impredecible (Axel, 2026-11-09). Ahora no hay temporizador
  // que congelar: se guarda el próximo corte y se mira al abrir, al
  // volver a la app y cada 30 s.
  //
  // Va ligado al correo y se borra al entrar y al salir: un corte viejo
  // de otra sesión cerraría la nueva nada más entrar.
  const CORTE_KEY = 'barstock.sesionCorte';
  let corteVigilado = false;

  function leerCorte(email){
    try {
      const e = JSON.parse(localStorage.getItem(CORTE_KEY) || 'null');
      if (e && e.email === email && typeof e.corte === 'number') return e;
    } catch (err) {}
    return null;
  }
  function guardarCorte(email, e){
    try { localStorage.setItem(CORTE_KEY, JSON.stringify({ email, corte: e.corte, ultimaAntes: e.ultimaAntes })); } catch (err) {}
  }
  function olvidarCorte(){
    try { localStorage.removeItem(CORTE_KEY); } catch (err) {}
  }

  function vigilarCorte(email){
    const C = window.BarStockSessionCutoff;
    if (!C || corteVigilado) return;
    corteVigilado = true;
    let estado = leerCorte(email) || C.empezar(Date.now());
    guardarCorte(email, estado);

    // true si cerró la sesión.
    const revisar = () => {
      const r = C.resolver(estado, Date.now());
      estado = r.estado;
      if (r.cerrar) {
        console.log('[Auth] Sesion cerrada: paso el corte de medianoche sin uso antes');
        olvidarCorte();
        logout();
        return true;
      }
      guardarCorte(email, estado);
      return false;
    };

    // El uso se anota como mucho cada 15 s: basta para la ventana de 30
    // minutos y no escribe en localStorage con cada movimiento.
    let anotado = 0;
    const alUsar = () => {
      const ahora = Date.now();
      if (ahora - anotado < 15000) return;
      anotado = ahora;
      if (revisar()) return;
      estado = C.actividad(estado, ahora);
      guardarCorte(email, estado);
    };
    ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(evt => {
      document.addEventListener(evt, alUsar, { passive: true });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
    window.addEventListener('pageshow', revisar);
    setInterval(revisar, 30000);
    revisar();
  }

  async function checkAuth(){
    try{
      if (!window.supabase) throw new Error('Supabase JS not loaded');
      authClient = getAuthClient();

      const { data, error } = await authClient.auth.getUser();
      if (error || !data?.user) {
        showOverlay();
        return false;
      }

      // El correo se publica para que otros modulos sepan quien entro sin
      // volver a preguntarle a Supabase. Lo usa el selector del fondo de
      // entrada, que solo debe verlo el admin.
      window.__bsUserEmail = data.user.email || '';
      const isAdmin = data.user.email === window.BARSTOCK_CONFIG?.ADMIN_EMAIL;

      // La pestana de la barra y el acceso del modo foco si se ocultan con
      // display: sus clases no llevan !important y el estilo en linea manda.
      ['bsAdminNavTab', 'bsAdminMiniCard', 'restoreBackupBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isAdmin ? '' : 'none';
      });

      // La tarjeta del menu no se oculta, se TRANSFORMA. Dos razones:
      // .bs-focus-card trae display:flex !important y le gana a cualquier
      // display en linea, y una tarjeta menos deja un hueco en la
      // cuadricula. Para los demas usuarios anuncia lo que viene.
      const adminCard = document.getElementById('bsAdminFocusCard');
      if (adminCard && isAdmin) {
        adminCard.classList.add('bs-admin-card');
        adminCard.onclick = () => { if (typeof bsOpenSection === 'function') bsOpenSection('admin'); };
        // Misma estructura centrada que el estado publico. Las otras siete
        // tarjetas llenan su alto con las mini-cards de datos en vivo;
        // esta no tiene datos que mostrar, asi que alineada arriba se veia
        // como si le faltara algo. Centrada se ve terminada.
        adminCard.innerHTML =
          '<div class="bs-soon">' +
            '<div class="bs-soon-icons">' +
              '<i class="ti ti-users" aria-hidden="true"></i>' +
              '<i class="ti ti-shield-lock" aria-hidden="true"></i>' +
              '<i class="ti ti-key" aria-hidden="true"></i>' +
            '</div>' +
            '<div class="bs-soon-title">Admin</div>' +
            '<div class="bs-soon-sub">Users and access</div>' +
          '</div>';
      }

      if (isAdmin && window.BarStockAdmin?.render) {
        window.BarStockAdmin.render();
      }

      vigilarCorte(data.user.email || '');
      hideOverlay();
      return true;
    } catch(err){
      console.error(err);
      showOverlay();
      return false;
    }
  }

  // `cred` lo pasa el login de bartender (src/pin-login.js): su correo
  // sale del nombre y su contraseña es el PIN. Todo lo de después de
  // entrar (la locación, el aviso, recargar) es el MISMO camino, para que
  // no haya dos logins que digan cosas distintas.
  async function login(cred){
    const conPin = !!(cred && cred.pin);
    const email = cred ? String(cred.email || '').trim() : (document.getElementById('authEmail')?.value?.trim() || '');
    const password = cred ? String(cred.password || '') : (document.getElementById('authPassword')?.value || '');
    const msg = document.getElementById('authMsg');
    const btn = document.getElementById('authLoginBtn');

    if (msg) msg.textContent = '';
    if (!email || !password) {
      if (msg) msg.textContent = conPin ? 'Enter your name and PIN.' : 'Enter email and password.';
      return;
    }

    try{
      if (!window.supabase) throw new Error('Supabase JS not loaded');
      authClient = getAuthClient();

      if (btn && !conPin) {
        btn.disabled = true;
        btn.textContent = 'Logging in...';
      }

      const { error } = await authClient.auth.signInWithPassword({ email, password });
      if (error) {
        // Para un bartender, "Invalid login credentials" es exactamente
        // esto: ese nombre con ese PIN no existe. Cualquier otro error se
        // dice tal cual.
        if (conPin && /invalid login credentials/i.test(error.message || '')) {
          throw new Error('That name and PIN don\u2019t match.');
        }
        throw error;
      }
      // Sesión nueva, corte nuevo: el de una sesión anterior la cerraría
      // nada más entrar.
      olvidarCorte();

      const locations = await window.BarStockLocationAccess.getAllowedLocations();

      if (locations.length === 0) {
        await authClient.auth.signOut();
        if (msg) msg.textContent = 'Your account is pending approval.';
        return;
      }

      if (locations.length > 1) {
        showLocationSelector(locations, email);
        return;
      }

      window.BarStockLocationAccess.setActiveLocationName(locations[0].name);
      notifyLogin(email, locations[0]);

      hideOverlay();
      location.reload();
    } catch(err){
      console.error(err);
      if (msg) msg.textContent = err.message || 'Login failed.';
    } finally {
      if (btn && !conPin) {
        btn.disabled = false;
        btn.textContent = 'Login';
      }
    }
  }

  // ── El aviso de que alguien ha entrado ───────────────────────────────
  //
  // Se manda DESPUÉS de saber en qué locación se ha entrado, no al
  // validar la contraseña. Antes salía justo tras el `signInWithPassword`,
  // cuando la locación todavía era la que quedó guardada de la última
  // vez: el correo llegaba diciendo "Wills and Bills" mientras la persona
  // acababa de abrir The Crown Tavern.
  //
  // `keepalive` porque la línea siguiente es un `location.reload()`. Sin
  // él, el navegador cancela las peticiones en vuelo al descargar la
  // página y el aviso se pierde: no fallaría, sencillamente no llegaría.
  function notifyLogin(email, loc){
    try {
      fetch('https://barstock-app.vercel.app/api/notify?type=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          type: 'login',
          email,
          location: loc?.name || 'Unknown',
          locationId: loc?.locationId || null,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        })
      }).catch(() => {});
    } catch (e) { /* el aviso nunca puede impedir entrar */ }
  }

  function showLocationSelector(locations, email){
    const step = document.getElementById('authLocationStep');
    const select = document.getElementById('authLocationSelect');
    const btn = document.getElementById('authLoginBtn');
    const msg = document.getElementById('authMsg');

    if (!step || !select || !btn) return;

    select.innerHTML = locations.map(location => (
      `<option value="${location.name}">${location.name}</option>`
    )).join('');

    step.style.display = 'block';
    if (msg) msg.textContent = 'Select a location to continue.';

    btn.textContent = 'Continue';
    btn.onclick = () => {
      const selected = select.value;
      window.BarStockLocationAccess.setActiveLocationName(selected);
      notifyLogin(email, locations.find(l => l.name === selected));
      hideOverlay();
      location.reload();
    };
  }

  async function logout(){
    olvidarCorte();
    try{
      authClient = getAuthClient();
      await authClient.auth.signOut();
    } catch(err){
      console.error(err);
    } finally {
      showOverlay();
      location.reload();
    }
  }

  let authMode = 'login';

  const MODE_TEXT = {
    login: {
      title: 'Welcome back',
      sub: 'Access your inventory and ordering workspace.',
      btn: 'Login',
      showPassword: true,
      showForgot: true,
      foot: 'Don\u2019t have an account?',
      footAction: 'Sign up'
    },
    signup: {
      title: 'Request access',
      sub: 'Create an account. Access is granted once approved.',
      btn: 'Request access',
      showPassword: true,
      showForgot: false,
      foot: 'Already have an account?',
      footAction: 'Log in'
    },
    forgot: {
      title: 'Reset password',
      sub: 'Enter your email to receive a reset link.',
      btn: 'Send reset link',
      showPassword: false,
      showForgot: false,
      foot: 'Remembered your password?',
      footAction: 'Log in'
    }
  };

  function renderAuthMode(){
    const cfg = MODE_TEXT[authMode];
    const title = document.getElementById('authTitle');
    const sub = document.getElementById('authSub');
    const passwordGroup = document.getElementById('authPasswordGroup');
    const forgot = document.getElementById('authForgot');
    const btn = document.getElementById('authLoginBtn');
    const footLead = document.getElementById('authFootLead');
    const footAction = document.getElementById('authFootAction');
    const msg = document.getElementById('authMsg');
    const locationStep = document.getElementById('authLocationStep');
    const signupFields = document.getElementById('authSignupFields');

    if (title) title.textContent = cfg.title;
    if (sub) sub.textContent = cfg.sub;
    if (passwordGroup) passwordGroup.style.display = cfg.showPassword ? '' : 'none';
    if (forgot) forgot.style.display = cfg.showForgot ? '' : 'none';
    if (signupFields) signupFields.style.display = authMode === 'signup' ? '' : 'none';
    if (btn) btn.textContent = cfg.btn;
    if (footLead) footLead.textContent = cfg.foot;
    if (footAction) footAction.textContent = cfg.footAction;
    if (msg) msg.textContent = '';
    if (locationStep) locationStep.style.display = 'none';
  }

  function setAuthMode(mode){
    authMode = mode;
    renderAuthMode();
  }

  async function signUp(){
    const email = document.getElementById('authEmail')?.value?.trim() || '';
    const password = document.getElementById('authPassword')?.value || '';
    const firstName = document.getElementById('authFirstName')?.value?.trim() || '';
    const lastName = document.getElementById('authLastName')?.value?.trim() || '';
    const businessName = document.getElementById('authBusinessName')?.value?.trim() || '';
    const address = document.getElementById('authAddress')?.value?.trim() || '';
    const phone = document.getElementById('authPhone')?.value?.trim() || '';
    const message = document.getElementById('authMessage')?.value?.trim() || '';
    const msg = document.getElementById('authMsg');
    const btn = document.getElementById('authLoginBtn');

    if (msg) msg.textContent = '';
    if (!email || !password) {
      if (msg) msg.textContent = 'Enter email and password.';
      return;
    }
    if (password.length < 6) {
      if (msg) msg.textContent = 'Password must be at least 6 characters.';
      return;
    }
    if (!firstName || !lastName || !businessName) {
      if (msg) msg.textContent = 'Enter your name and business name.';
      return;
    }

    try{
      if (!window.supabase) throw new Error('Supabase JS not loaded');
      authClient = getAuthClient();

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Submitting...';
      }

      const { data, error } = await authClient.auth.signUp({ email, password });
      if (error) throw error;

      const userId = data?.user?.id;
      if (userId) {
        fetch('/api/notify?type=signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'signup',
            email, userId, firstName, lastName, businessName, address, phone, message
          })
        }).catch(() => {});
      }

      await authClient.auth.signOut();

      if (msg) msg.textContent = 'Request received. You will get access once approved.';
      if (btn) btn.textContent = cfgBtnText();
    } catch(err){
      console.error(err);
      if (msg) msg.textContent = err.message || 'Sign up failed.';
    } finally {
      if (btn) {
        btn.disabled = false;
        if (authMode === 'signup') btn.textContent = MODE_TEXT.signup.btn;
      }
    }
  }

  function cfgBtnText(){
    return MODE_TEXT[authMode]?.btn || 'Login';
  }

  async function sendResetEmail(){
    const email = document.getElementById('authEmail')?.value?.trim() || '';
    const msg = document.getElementById('authMsg');
    const btn = document.getElementById('authLoginBtn');

    if (msg) msg.textContent = '';
    if (!email) {
      if (msg) msg.textContent = 'Enter your email.';
      return;
    }

    try{
      if (!window.supabase) throw new Error('Supabase JS not loaded');
      authClient = getAuthClient();

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending...';
      }

      const { error } = await authClient.auth.resetPasswordForEmail(email);
      if (error) throw error;

      if (msg) msg.textContent = 'Check your email for a reset link.';
    } catch(err){
      console.error(err);
      if (msg) msg.textContent = err.message || 'Could not send reset link.';
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = MODE_TEXT.forgot.btn;
      }
    }
  }

  // ── Llegar desde el botón del correo de seguridad ────────────────────
  //
  // El aviso de inicio de sesión lleva un "Change password" que apunta
  // aquí con ?reset=1&email=... Esto NO manda el correo de recuperación:
  // abre la pantalla de recuperación con la dirección ya escrita y espera
  // a que alguien pulse.
  //
  // La diferencia importa. Los antivirus de correo corporativo visitan
  // todos los enlaces que reciben para comprobar si son peligrosos, y lo
  // hacen antes de que el destinatario abra el mensaje. Si visitar este
  // enlace disparase el restablecimiento, se dispararía él solo cada vez.
  //
  // La dirección se borra de la barra en cuanto se ha usado: no tiene
  // por qué quedarse en el historial ni en lo que se copia y pega.
  function openedFromResetLink(){
    let p;
    try { p = new URLSearchParams(location.search); } catch (e) { return false; }
    if (p.get('reset') !== '1') return false;

    const email = p.get('email') || '';
    showOverlay();
    setAuthMode('forgot');

    const field = document.getElementById('authEmail');
    if (field && email) field.value = email;

    const msg = document.getElementById('authMsg');
    if (msg) msg.textContent = 'Send yourself a reset link to secure your account.';

    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    return true;
  }

  function handlePrimaryAction(){
    if (authMode === 'login') return login();
    if (authMode === 'signup') return signUp();
    if (authMode === 'forgot') return sendResetEmail();
  }

  function handleFootAction(){
    if (authMode === 'login') return setAuthMode('signup');
    return setAuthMode('login');
  }

  window.BarStockAuth = {
    getAuthClient,
    checkAuth,
    login,
    logout,
    showOverlay,
    hideOverlay
  };

  window.addEventListener('load', () => {
    const logoutBtn = document.getElementById('authLogoutBtn');
    const btn = document.getElementById('authLoginBtn');
    const password = document.getElementById('authPassword');
    const forgot = document.getElementById('authForgot');
    const footAction = document.getElementById('authFootAction');

    if (logoutBtn) logoutBtn.onclick = logout;
    if (btn) btn.onclick = handlePrimaryAction;
    if (password) {
      password.addEventListener('keydown', e => {
        if (e.key === 'Enter') handlePrimaryAction();
      });
    }
    if (forgot) forgot.onclick = () => setAuthMode('forgot');
    if (footAction) footAction.onclick = handleFootAction;

    if (openedFromResetLink()) return;

    setTimeout(checkAuth, 100);
  });
})();
