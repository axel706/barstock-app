(() => {
  if (window.BarStockBackgrounds) return;

  // ── Las imágenes de fondo, en un solo sitio ──────────────────────────
  //
  // Había DOS listas: la del selector de fondo de la app, escrita dentro
  // de un `<script>` del index, y la del fondo de la pantalla de entrada,
  // en `login-background.js`. Nadie las sincronizaba, así que habían
  // divergido sin que nadie lo decidiera: las dos "neon" existían sólo en
  // una y "midnight" sólo en la otra.
  //
  // Añadir una imagen significaba acordarse de las dos. Ahora el catálogo
  // es éste y los dos selectores lo leen.
  //
  // Lo que NO vive aquí es lo propio de cada selector: el "Default" del
  // fondo de la app —que no es una imagen, es quitarla— y el botón de
  // subir una tuya en la pantalla de entrada. Eso lo pone cada uno.
  //
  // Este archivo se carga en el `<head>`, antes que nadie: el fondo de la
  // entrada se pinta antes de iniciar sesión y no puede esperar.

  const IMAGENES = [
    { id: 'wills-bills',  label: "Will's & Bill's",   src: 'assets/backgrounds/wills-bills.jpg' },
    { id: 'jockey-bar',   label: 'The Jockey Tavern', src: 'assets/backgrounds/jockey-bar.jpg' },
    { id: 'crown-dining', label: 'Crown Dining',      src: 'assets/backgrounds/crown-dining.jpg' },
    { id: 'crown-lounge', label: 'Crown Lounge',      src: 'assets/backgrounds/crown-lounge.jpg' },
    { id: 'midnight',     label: 'Midnight',          src: 'assets/backgrounds/midnight.svg' },

    // ── El patrón de marca ─────────────────────────────────────────
    //
    // Las dos primeras son el mismo dibujo en dos proporciones: el
    // fondo se pinta con `cover`, así que la vertical llena un teléfono
    // sin recortar y la apaisada hace lo propio en el escritorio.
    //
    // Las dos últimas son el mismo patrón con otro degradado detrás.
    // Van sólo en apaisado porque el dibujo se repite: recortarlo en un
    // teléfono no deja fuera nada que no esté también dentro.
    { id: 'neon-tall',    label: 'Neon',              src: 'assets/backgrounds/neon-tall.jpg' },
    { id: 'neon-wide',    label: 'Neon wide',         src: 'assets/backgrounds/neon-wide.jpg' },
    { id: 'neon-plum',    label: 'Neon plum',         src: 'assets/backgrounds/neon-plum.jpg' },
    { id: 'neon-fade',    label: 'Neon fade',         src: 'assets/backgrounds/neon-fade.jpg' }
  ];

  // Se devuelve una COPIA. Quien la use puede añadirle su "Default" o su
  // "Upload" sin ensuciar el catálogo del otro.
  window.BarStockBackgrounds = {
    lista: () => IMAGENES.map(x => Object.assign({}, x)),
    tiene: (src) => IMAGENES.some(x => x.src === src)
  };
})();
