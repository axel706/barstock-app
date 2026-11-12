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
      // fetch a través de window en cada llamada, y no el que había al
      // crear el cliente: supabase-js guarda su fetch al nacer, y el
      // candado del invitado (src/guest.js) envuelve window.fetch. Si el
      // cliente se creara con el de antes, sus escrituras pasarían por
      // fuera del candado.
      client = window.supabase.createClient(url, key, {
        global: { fetch: (...a) => window.fetch(...a) }
      });
      window.supabaseAuth = client;
    }

    return client;
  }

  window.BarStockSupabase = {
    getClient
  };
})();
