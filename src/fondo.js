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
  // La copia local del fondo del TELÉFONO, aparte de la del escritorio.
  const STORAGE_MOVIL = 'bs_background_mobile';

  function nombreLocacion() {
    return localStorage.getItem('barstock.activeLocationName') ||
           (window.BARSTOCK_CONFIG && window.BARSTOCK_CONFIG.LOCATION_NAME) || null;
  }

  const sufijo = () => (nombreLocacion() || 'default').replace(/\s+/g, '_').toLowerCase();

  function claveLocal() { return STORAGE_KEY + '_' + sufijo(); }
  function claveMovil() { return STORAGE_MOVIL + '_' + sufijo(); }

  // ¿Se está viendo la app del teléfono? La decide el armazón móvil, que
  // se monta antes de que se cargue el fondo.
  const esMovil = () => !!(window.BarStockMobile && window.BarStockMobile.montado &&
                           window.BarStockMobile.montado());

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

  // El fondo de la locación y, encima, el del teléfono si estamos en él
  // y la locación tiene uno. En el escritorio, sólo lo primero: igual
  // que antes de que existiera el del teléfono.
  async function cargar() {
    await cargarLocacion();
    if (esMovil()) await cargarMovil();
  }

  async function cargarLocacion() {
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

  // ── El fondo del teléfono ────────────────────────────────────────────
  //
  // Por locación, en `locations.mobile_background_src` (migración 026):
  // todos los teléfonos de una locación ven el mismo, y el escritorio
  // sigue con el suyo. Vacío quiere decir "el mismo que el escritorio".
  //
  // Lo que NO hace nunca: escribir `background_src`. Ésa es la del
  // escritorio, y elegir en el teléfono no puede cambiarle el fondo al
  // ordenador de la barra.
  async function cargarMovil() {
    // La copia local primero, para no esperar a la red al abrir.
    const local = localStorage.getItem(claveMovil());
    if (local) aplicar(local);
    try {
      const client = window.BarStockSupabase?.getClient();
      const id = await locationId();
      if (!client || !id) return;
      const { data, error } = await client.from('locations')
        .select('mobile_background_src').eq('id', id).single();
      // Si la lectura falla —sin red, o una columna que no está— el
      // teléfono se queda con lo que ya tiene: el suyo de la copia local
      // o el de la locación. Nunca un fondo vacío por un error.
      if (error) return;
      const src = data && data.mobile_background_src;
      if (src) {
        localStorage.setItem(claveMovil(), src);
        aplicar(src);
      } else if (local) {
        // Otro teléfono lo quitó: vuelve el de la locación.
        localStorage.removeItem(claveMovil());
        aplicar(localStorage.getItem(claveLocal()) || null);
      }
    } catch (e) {}
  }

  // Devuelve { ok, error } para que la pantalla diga lo que pasó si no se
  // pudo guardar. `null` es "el mismo que el escritorio".
  async function guardarMovil(src) {
    const v = (src && src !== 'default') ? src : null;
    if (v) {
      localStorage.setItem(claveMovil(), v);
      aplicar(v);
    } else {
      localStorage.removeItem(claveMovil());
      aplicar(localStorage.getItem(claveLocal()) || null);
    }
    try {
      const client = window.BarStockSupabase?.getClient();
      const id = await locationId();
      if (!client || !id) return { ok: false, error: 'Could not reach the cloud. It is set on this phone only.' };
      const r = await client.from('locations').update({ mobile_background_src: v }).eq('id', id);
      if (r && r.error) return { ok: false, error: r.error.message || String(r.error) };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  }

  const actualMovil = () => localStorage.getItem(claveMovil()) || '';

  // Si la ventana cruza el ancho del teléfono —un ordenador con la ventana
  // estrecha—, el armazón se monta o se desmonta y el fondo tiene que
  // seguirle. Se le PREGUNTA al armazón si está montado en vez de copiar
  // aquí su ancho: ese número vive en mobile-shell.js (ANCHO), y una
  // segunda copia es la que se queda atrás el día que cambie.
  let _eraMovil = null;
  window.addEventListener('resize', () => setTimeout(() => {
    const ahora = esMovil();
    if (_eraMovil !== null && ahora !== _eraMovil) cargar();
    _eraMovil = ahora;
  }, 0));
  window.addEventListener('load', () => { _eraMovil = esMovil(); });

  window.BarStockFondo = { aplicar, cargar, guardar, actual, claveLocal, locationId,
                           cargarMovil, guardarMovil, actualMovil, claveMovil };
})();
