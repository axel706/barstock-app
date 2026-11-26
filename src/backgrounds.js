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

  // ── Sólo para el teléfono ──────────────────────────────────────────
  //
  // Dibujos (y desde el 2026-11-22 también fotos) en vertical que trajo
  // Axel para el fondo del teléfono. No
  // sirven en una pantalla apaisada, así que NO están en `lista()`: el
  // selector del escritorio y la pantalla de entrada siguen viendo
  // exactamente lo de antes.
  //
  // Reducidas a 1000 px de ancho y por debajo del tope de peso. Detrás
  // del velo del teléfono la reducción no se nota, y se cargan con la
  // app abierta en el móvil.
  const SOLO_MOVIL = [
    { id: 'movil-neon-doodles', label: 'Neon Doodles', src: 'assets/backgrounds/movil-neon-doodles.jpg' },
    { id: 'movil-pixel-bar',    label: 'Pixel Bar',    src: 'assets/backgrounds/movil-pixel-bar.jpg' },
    { id: 'movil-chalk',        label: 'Chalk',        src: 'assets/backgrounds/movil-chalk.jpg' },
    { id: 'movil-groovy',       label: 'Groovy',       src: 'assets/backgrounds/movil-groovy.jpg' },
    { id: 'movil-watercolor',   label: 'Watercolor',   src: 'assets/backgrounds/movil-watercolor.jpg' },
    { id: 'movil-happy-hour',   label: 'Happy Hour',   src: 'assets/backgrounds/movil-happy-hour.jpg' },
    { id: 'movil-last-call',    label: 'Last Call',    src: 'assets/backgrounds/movil-last-call.jpg' },
    // Cuatro fotos que mandó Axel el 2026-11-22, vistas antes bajo el velo
    // real del teléfono en una lámina. La del carrito trae la marca de agua
    // de un blog y etiquetas de marcas: se le dijo, y la quiso igual.
    { id: 'movil-red-shelf',    label: 'Red Shelf',    src: 'assets/backgrounds/movil-red-shelf.jpg' },
    { id: 'movil-bar-cart',     label: 'Bar Cart',     src: 'assets/backgrounds/movil-bar-cart.jpg' },
    { id: 'movil-wood-bar',     label: 'Wood Bar',     src: 'assets/backgrounds/movil-wood-bar.jpg' },
    { id: 'movil-spritz',       label: 'Spritz',       src: 'assets/backgrounds/movil-spritz.jpg' }
  ];

  // ── Los animados (Axel, 2026-11-22, sobre lámina: los tres) ─────────
  //
  // No son una imagen: `src` es un nombre ("anim:aurora") que guarda la
  // misma columna, y los pinta src/fondo-vivo.js dentro de #bgLayer.
  // `mini` es la miniatura del selector, un degradado quieto con sus
  // colores (no hay archivo que enseñar).
  const ANIMADOS = [
    { id: 'vivo-aurora', label: 'Aurora', src: 'anim:aurora', anim: true,
      mini: 'radial-gradient(circle at 25% 25%, rgba(56,189,248,.85), transparent 55%), radial-gradient(circle at 80% 55%, rgba(52,211,153,.7), transparent 55%), radial-gradient(circle at 35% 85%, rgba(168,85,247,.6), transparent 55%), #0b1220' },
    { id: 'vivo-liquid', label: 'Liquid', src: 'anim:liquid', anim: true,
      mini: 'conic-gradient(from 30deg, #0b1220, rgba(56,189,248,.8), #0e1a2e, rgba(52,211,153,.7), #0e1a2e, rgba(168,85,247,.65), #0b1220)' },
    { id: 'vivo-bokeh', label: 'Bokeh', src: 'anim:bokeh', anim: true,
      mini: 'radial-gradient(circle at 20% 70%, rgba(56,189,248,.8) 0 14%, transparent 15%), radial-gradient(circle at 70% 40%, rgba(52,211,153,.7) 0 18%, transparent 19%), radial-gradient(circle at 45% 20%, rgba(168,85,247,.6) 0 10%, transparent 11%), #0b1220' }
  ];

  // Las del catálogo general que tienen sentido en vertical. Fuera las
  // tres versiones apaisadas del patrón: en un teléfono se recortan y se
  // ven igual que "Neon".
  const APAISADAS = ['neon-wide', 'neon-plum', 'neon-fade'];

  // Se devuelve una COPIA. Quien la use puede añadirle su "Default" o su
  // "Upload" sin ensuciar el catálogo del otro.
  window.BarStockBackgrounds = {
    lista: () => IMAGENES.map(x => Object.assign({}, x)),
    // Lo que se ofrece en el teléfono: primero las suyas, luego los
    // animados, luego las generales que funcionan en vertical.
    listaMovil: () => SOLO_MOVIL.concat(ANIMADOS, IMAGENES.filter(x => !APAISADAS.includes(x.id)))
      .map(x => Object.assign({}, x)),
    // Lo que se ofrece en el escritorio (su selector de Settings ›
    // Appearance): las fotos y, desde el 2026-11-26, los mismos animados del
    // teléfono. `lista()` sigue sin ellos: la usa también la pantalla de
    // entrada, que pinta una imagen.
    listaEscritorio: () => IMAGENES.concat(ANIMADOS).map(x => Object.assign({}, x)),
    tiene: (src) => IMAGENES.some(x => x.src === src)
  };
})();
