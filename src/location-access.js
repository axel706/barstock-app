(() => {
  async function getClient(){
    if (!window.BarStockSupabase?.getClient) {
      throw new Error('Supabase client not available');
    }
    return window.BarStockSupabase.getClient();
  }

  async function getAllowedLocations(){
    const client = await getClient();

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData?.user) {
      throw userError || new Error('User not logged in');
    }

    const userId = userData.user.id;

    const { data, error } = await client
      .from('user_location_access')
      .select(`
        role,
        account_id,
        location_id,
        locations (
          id,
          name,
          weekly_reset_at
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || []).map(row => ({
      role: row.role,
      accountId: row.account_id,
      locationId: row.location_id,
      name: row.locations?.name || '',
      weeklyResetAt: row.locations?.weekly_reset_at || null
    })).filter(location => location.name);
  }

  function getActiveLocationName(){
    return localStorage.getItem('barstock.activeLocationName')
      || window.BARSTOCK_CONFIG?.LOCATION_NAME
      || 'The Crown Tavern';
  }

  function setActiveLocationName(name){
    if (!name) return;

    // ── La marca para la cortina ─────────────────────────────────────
    //
    // Cambiar de locación recarga la página entera, y al recargar la
    // pantalla de entrada se pinta desde el primer fotograma a propósito
    // (ver el comentario largo en styles/auth.css). Resultado: dos
    // segundos de login cada vez que cambias de bar, aunque tu sesión
    // esté perfectamente viva.
    //
    // En ESTE instante sí sabemos que hay sesión. Lo que falta es que
    // ese dato sobreviva al reload, y para eso sirve la marca: el script
    // en línea del <head> la lee antes de que se pinte nada y pone la
    // cortina por encima del login.
    //
    // Va aquí y no en quien llama porque por esta función pasan los tres
    // caminos: la hoja del móvil, el selector del escritorio y el paso
    // de locación del login. Uno solo.
    //
    // sessionStorage y no localStorage: si algo sale mal, la marca muere
    // al cerrar la pestaña en vez de dejar una cortina fantasma para
    // siempre.
    try { sessionStorage.setItem('barstock.switchingTo', name); } catch (e) {}

    localStorage.setItem('barstock.activeLocationName', name);
    if (window.BARSTOCK_CONFIG) {
      window.BARSTOCK_CONFIG.LOCATION_NAME = name;
    }
    // Recargar fondo de la locacion seleccionada
    if (window.BarStockBackground?.loadSavedBackground) {
      window.BarStockBackground.loadSavedBackground();
    }
  }



  const initialLocation = getActiveLocationName();

  if (window.BARSTOCK_CONFIG && initialLocation) {
    window.BARSTOCK_CONFIG.LOCATION_NAME = initialLocation;
  }


  async function renderActiveLocationControls(){
    const badge = document.getElementById('locationBadge');
    const select = document.getElementById('headerLocationSelect');
    const locName = document.getElementById('bsLocName');
    const locChip = document.getElementById('bsLocChip');

    const activeName = getActiveLocationName();

    if (badge) badge.textContent = '';
    if (locName) locName.textContent = activeName || 'Sin locación';

    if (!select) return;

    try {
      const locations = await getAllowedLocations();

      if (!locations || locations.length <= 1) {
        if (locChip) locChip.style.cursor = 'default';
        return;
      }

      select.innerHTML = locations.map(location => (
        `<option value="${location.name}">${location.name}</option>`
      )).join('');
      select.value = activeName;

      // Fix double-click issue — trigger mousedown on select when chip is clicked
      if (locChip) {
        locChip.onclick = function(e) {
          e.stopPropagation();
          var evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
          select.dispatchEvent(evt);
          select.focus();
          select.click();
        };
      }

      select.onchange = () => {
        setActiveLocationName(select.value);
        window.location.reload();
      };

      if (locChip) {
        locChip.style.cursor = 'pointer';
        locChip.onclick = (e) => {
          e.stopPropagation();
          const isOpen = select.style.pointerEvents === 'auto';
          if (isOpen) {
            select.style.opacity = '0';
            select.style.pointerEvents = 'none';
          } else {
            select.style.opacity = '1';
            select.style.pointerEvents = 'auto';
            select.focus();
          }
        };
        document.addEventListener('click', (e) => {
          if (!locChip.contains(e.target) && !select.contains(e.target)) {
            select.style.opacity = '0';
            select.style.pointerEvents = 'none';
          }
        });
      }
    } catch (error) {
      console.warn('Could not load header location selector', error);
    }
  }

  document.addEventListener('DOMContentLoaded', renderActiveLocationControls);

  window.BarStockLocationAccess = {
    getAllowedLocations,
    getActiveLocationName,
    setActiveLocationName
  };
})();
