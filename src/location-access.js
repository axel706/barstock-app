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
    localStorage.setItem('barstock.activeLocationName', name);
    if (window.BARSTOCK_CONFIG) {
      window.BARSTOCK_CONFIG.LOCATION_NAME = name;
    }
  }



  const initialLocation = getActiveLocationName();

  if (window.BARSTOCK_CONFIG && initialLocation) {
    window.BARSTOCK_CONFIG.LOCATION_NAME = initialLocation;
  }

  window.BarStockLocationAccess = {
    getAllowedLocations,
    getActiveLocationName,
    setActiveLocationName
  };
})();
