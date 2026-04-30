(() => {
  if (window.BarStockSupabase) return;

  let client = null;

  function getClient() {
    const config = window.BARSTOCK_CONFIG || {};
    const url = config.SUPABASE_URL;
    const key = config.SUPABASE_KEY;

    if (!url || !key) {
      throw new Error('Missing Supabase config.');
    }

    if (!window.supabase) {
      throw new Error('Supabase JS not loaded.');
    }

    if (!client) {
      client = window.supabase.createClient(url, key);
      window.supabaseAuth = client;
    }

    return client;
  }

  window.BarStockSupabase = {
    getClient
  };
})();
