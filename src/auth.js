(() => {
  const CONFIG = window.BARSTOCK_CONFIG || {};
  const SUPABASE_URL = CONFIG.SUPABASE_URL;
  const SUPABASE_KEY = CONFIG.SUPABASE_KEY;

  let authClient = null;

  function getAuthClient(){
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('BarStock config is missing Supabase credentials');
    }

    authClient = authClient || window.supabaseAuth || window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
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

  async function checkAuth(){
    try{
      if (!window.supabase) throw new Error('Supabase JS not loaded');
      authClient = getAuthClient();

      const { data, error } = await authClient.auth.getUser();
      if (error || !data?.user) {
        showOverlay();
        return false;
      }

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

    if (logoutBtn) logoutBtn.onclick = logout;
    if (btn) btn.onclick = login;
    if (password) {
      password.addEventListener('keydown', e => {
        if (e.key === 'Enter') login();
      });
    }

    setTimeout(checkAuth, 100);
  });
})();
