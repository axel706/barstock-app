(() => {
  if (window.BarStockFondo) return;

  // ── Aplicar, cargar y guardar el fondo de la app ─────────────────────
  //
  // Vivía dentro de un `<script>` del index ("BACKGROUND SELECTOR"), y
  // desde ahí sólo lo podía usar el selector del escritorio. El teléfono
  // va a tener su propio fondo (columna `mobile_background_src`), y sin
  // esto la única forma de aplicarlo era copiar estas funciones, que es
  // como empiezan dos versiones que un día pintan cosas distintas.
  //
  // Se mudó TAL CUAL: mismo comportamiento, mismas claves, misma columna.
  // Este paso no cambia nada de lo que se ve. El catálogo de imágenes no
  // vive aquí: está en `src/backgrounds.js`.
  //
  // El fondo es de la LOCACIÓN, no del navegador: se guarda en
  // `locations.background_src` y el localStorage es sólo la copia para no
  // esperar a la red al abrir.

  const STORAGE_KEY = 'bs_background';

  function nombreLocacion() {
    return localStorage.getItem('barstock.activeLocationName') ||
           (window.BARSTOCK_CONFIG && window.BARSTOCK_CONFIG.LOCATION_NAME) || null;
  }

  function claveLocal() {
    const loc = (nombreLocacion() || 'default').replace(/\s+/g, '_').toLowerCase();
    return STORAGE_KEY + '_' + loc;
  }

  function aplicar(src) {
    const layer = document.getElementById('bgLayer');
    if (!layer) return;
    if (!src || src === 'default') {
      layer.style.backgroundImage = '';
      layer.classList.remove('active');
      document.body.classList.remove('has-custom-bg');
    } else {
      layer.style.backgroundImage = `url('${src}')`;
      layer.classList.add('active');
      document.body.classList.add('has-custom-bg');
    }
  }

  async function locationId() {
    try {
      const client = window.BarStockSupabase?.getClient();
      if (!client) return null;
      const locName = nombreLocacion();
      if (!locName) return null;
      const { data } = await client.from('locations').select('id').eq('name', locName)
        .eq('account_id', window.BARSTOCK_CONFIG?.ACCOUNT_ID || 'wjm-hospitality').single();
      return data?.id || null;
    } catch (e) { return null; }
  }

  async function cargar() {
    // Primero Supabase, que es donde vive de verdad.
    try {
      const client = window.BarStockSupabase?.getClient();
      const id = await locationId();
      if (client && id) {
        const { data } = await client.from('locations').select('background_src').eq('id', id).single();
        if (data?.background_src) {
          localStorage.setItem(claveLocal(), data.background_src);
          aplicar(data.background_src);
          return;
        }
      }
    } catch (e) {}
    // Sin red, o sin fondo en la nube: la copia local.
    const guardado = localStorage.getItem(claveLocal());
    if (guardado) aplicar(guardado);
  }

  async function guardar(src) {
    if (!src || src === 'default') {
      localStorage.removeItem(claveLocal());
      aplicar(null);
    } else {
      localStorage.setItem(claveLocal(), src);
      aplicar(src);
    }
    try {
      const client = window.BarStockSupabase?.getClient();
      const id = await locationId();
      if (client && id) {
        await client.from('locations').update({ background_src: src || null }).eq('id', id);
      }
    } catch (e) { console.warn('Could not sync background to Supabase:', e); }
  }

  // El fondo elegido ahora en esta locación, de la copia local.
  const actual = () => localStorage.getItem(claveLocal()) || '';

  window.BarStockFondo = { aplicar, cargar, guardar, actual, claveLocal, locationId };
})();
