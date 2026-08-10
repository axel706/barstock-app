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

  function showOverlay(){
    document.body.classList.add('auth-locked');
    document.body.style.pointerEvents = '';
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.classList.add('show');
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
    if (overlay) overlay.classList.remove('show');
  }

  // ─── Cierre de sesion por inactividad ────────────────────────────
  // Tras 30 minutos sin actividad del usuario se cierra la sesion sola.
  // Cualquier movimiento de mouse, tecla, scroll, toque o click reinicia
  // la cuenta. El watcher se arranca una sola vez, ya autenticado.
  const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
  let inactivityTimer = null;
  let inactivityWatcherStarted = false;

  function resetInactivityTimer(){
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      console.log('[Auth] Sesion cerrada por inactividad');
      logout();
    }, INACTIVITY_LIMIT_MS);
  }

  function startInactivityWatcher(){
    if (inactivityWatcherStarted) return;
    inactivityWatcherStarted = true;
    ['mousemove','mousedown','keydown','scroll','touchstart','click'].forEach(evt => {
      document.addEventListener(evt, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();
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

      const isAdmin = data.user.email === window.BARSTOCK_CONFIG?.ADMIN_EMAIL;

      // La pestana de la barra y el acceso del modo foco si se ocultan con
      // display: sus clases no llevan !important y el estilo en linea manda.
      ['bsAdminNavTab', 'bsAdminMiniCard'].forEach(id => {
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

      startInactivityWatcher();
      hideOverlay();
      return true;
    } catch(err){
      console.error(err);
      showOverlay();
      return false;
    }
  }

  async function login(){
    const email = document.getElementById('authEmail')?.value?.trim() || '';
    const password = document.getElementById('authPassword')?.value || '';
    const msg = document.getElementById('authMsg');
    const btn = document.getElementById('authLoginBtn');

    if (msg) msg.textContent = '';
    if (!email || !password) {
      if (msg) msg.textContent = 'Enter email and password.';
      return;
    }

    try{
      if (!window.supabase) throw new Error('Supabase JS not loaded');
      authClient = getAuthClient();

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Logging in...';
      }

      const { error } = await authClient.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Notify login
      fetch('https://barstock-app.vercel.app/api/notify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          location: window.BARSTOCK_CONFIG?.LOCATION_NAME || 'Unknown',
          userAgent: navigator.userAgent,
          timestamp: new Date().toLocaleString()
        })
      }).catch(() => {});

      const locations = await window.BarStockLocationAccess.getAllowedLocations();

      if (locations.length === 0) {
        await authClient.auth.signOut();
        if (msg) msg.textContent = 'Your account is pending approval.';
        return;
      }

      if (locations.length > 1) {
        showLocationSelector(locations);
        return;
      }

      window.BarStockLocationAccess.setActiveLocationName(locations[0].name);

      hideOverlay();
      location.reload();
    } catch(err){
      console.error(err);
      if (msg) msg.textContent = err.message || 'Login failed.';
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Login';
      }
    }
  }

  function showLocationSelector(locations){
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
      hideOverlay();
      location.reload();
    };
  }

  async function logout(){
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
        fetch('/api/notify-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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

    setTimeout(checkAuth, 100);
  });
})();
