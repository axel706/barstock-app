(() => {
  if (window.BarStockBottleProfiles) return;

  // ── Perfiles de botella ──────────────────────────────────────────────
  //
  // ESTE ES EL ÚNICO SITIO donde vive la geometría de las botellas.
  // Tanto el dibujo que se ve como el cálculo del volumen salen de aquí,
  // a propósito: si hubiera una silueta para enseñar y otros números para
  // calcular, una forma mal medida se escondería en el resultado en vez
  // de verse a simple vista.
  //
  // ── Cómo corregir una forma ─────────────────────────────────────────
  //
  // Cada perfil es una lista de puntos [y, r] con y de 0 en la base a 1
  // en la boca, y r el radio relativo (1 = la parte más ancha). yFull es
  // la altura a la que llega el líquido en una botella llena — no es 1,
  // porque encima quedan el cuello y el aire.
  //
  // Para calibrar contra una botella real: llénala con agua medida en
  // tramos (100 ml, 200, 300…), marca a qué altura queda cada uno, y
  // ajusta los puntos hasta que cuadren. Son tres o cuatro cifras por
  // forma. NO hace falta tocar código en ningún otro archivo.
  //
  // AVISO HONESTO: estos siete perfiles son plausibles pero NO están
  // medidos contra botellas reales. La matemática que los usa sí está
  // verificada. Una forma equivocada da un número preciso y falso, que
  // es peor que uno obviamente malo, así que conviene calibrarlos antes
  // de confiar del todo en el conteo.
  //
  // ── Por qué la sección puede tratarse como circular ─────────────────
  //
  // Lo que se muestra es una FRACCIÓN: volumen(h) / volumen(lleno). Si la
  // sección real es un rectángulo, su área es k·r² con k constante, y esa
  // k aparece arriba y abajo de la división: se cancela. Solo importaría
  // si la forma de la sección cambiara con la altura, cosa que en
  // botellas no pasa. Por eso una petaca cuadrada sale bien igual.

  const PROFILES = {
    bordeaux: {
      name: 'Wine · Bordeaux', pourable: true, yFull: 0.74,
      p: [[0,.98],[.05,1],[.55,1],[.62,.98],[.68,.55],[.72,.30],[.75,.27],[.97,.27],[1,.30]]
    },
    burgundy: {
      name: 'Wine · Burgundy', pourable: true, yFull: 0.80,
      p: [[0,.98],[.04,1],[.42,1],[.55,.92],[.68,.62],[.78,.34],[.84,.28],[.97,.28],[1,.31]]
    },
    champagne: {
      name: 'Sparkling', pourable: true, yFull: 0.82,
      p: [[0,.95],[.05,1],[.45,1],[.58,.94],[.70,.66],[.80,.36],[.86,.30],[.97,.30],[1,.34]]
    },
    whiskey: {
      name: 'Whiskey · square shoulder', pourable: true, yFull: 0.78,
      p: [[0,.97],[.04,1],[.60,1],[.66,.96],[.72,.62],[.76,.34],[.80,.30],[.97,.30],[1,.33]]
    },
    vodka: {
      name: 'Tall straight', pourable: true, yFull: 0.80,
      p: [[0,.97],[.04,1],[.58,1],[.64,.95],[.74,.60],[.82,.32],[.86,.28],[.97,.28],[1,.31]]
    },
    tequila: {
      name: 'Wide body · long neck', pourable: true, yFull: 0.66,
      p: [[0,.96],[.05,1],[.42,1],[.48,.94],[.56,.60],[.62,.33],[.66,.29],[.97,.29],[1,.32]]
    },
    liqueur: {
      name: 'Short and wide', pourable: true, yFull: 0.76,
      p: [[0,.95],[.06,1],[.50,1],[.58,.92],[.68,.58],[.74,.33],[.78,.30],[.97,.30],[1,.33]]
    },
    cylinder: {
      name: 'Straight cylinder', pourable: true, yFull: 0.90,
      p: [[0,1],[1,1]]
    },

    // El respaldo cuando un articulo todavia no tiene forma asignada.
    //
    // Antes ese papel lo hacia 'cylinder', y fue un error: el cilindro es
    // la forma de CONTROL del banco de pruebas, un rectangulo perfecto
    // con el que se comprobo que la integral reproducia el metodo lineal.
    // Como valor por defecto dibujaba un cuadrado y no una botella, que
    // es exactamente lo que se veia en pantalla.
    //
    // Esta es una botella de verdad, de hombros medios. No es exacta para
    // ningun producto concreto —para eso esta la asignacion— pero se
    // parece a una botella y su error es mucho menor que el de un
    // rectangulo.
    generic: {
      name: 'Generic bottle', pourable: true, yFull: 0.78,
      p: [[0,.97],[.04,1],[.56,1],[.63,.96],[.71,.58],[.78,.32],[.83,.29],[.97,.29],[1,.32]]
    },

    // No todo se cuenta por nivel. Una cerveza, una lata o un refresco se
    // cuentan enteros, y enseñarles un deslizador seria pedirle a alguien
    // que estime la fraccion de algo que nunca esta a medias. La pantalla
    // de conteo mira este campo para enseñar solo los +/-.
    none: {
      name: 'Counted whole · no slider', pourable: false, yFull: 1,
      p: [[0,1],[1,1]]
    }
  };

  // Radio a una altura dada, interpolando entre los puntos del perfil.
  function radiusAt(key, y) {
    const prof = PROFILES[key] || PROFILES.cylinder;
    const p = prof.p;
    if (y <= p[0][0]) return p[0][1];
    if (y >= p[p.length - 1][0]) return p[p.length - 1][1];
    for (let i = 1; i < p.length; i++) {
      if (y <= p[i][0]) {
        const [y0, r0] = p[i - 1], [y1, r1] = p[i];
        const t = (y1 - y0) === 0 ? 0 : (y - y0) / (y1 - y0);
        return r0 + (r1 - r0) * t;
      }
    }
    return p[p.length - 1][1];
  }

  // Volumen acumulado de la base hasta y, por Simpson. Se integra r² sin
  // el π porque cualquier constante se cancela al dividir.
  function volumeTo(key, y, N) {
    if (y <= 0) return 0;
    N = N || 400;
    const h = y / N;
    let s = 0;
    for (let i = 0; i < N; i++) {
      const a = i * h, b = a + h, m = (a + b) / 2;
      s += (h / 6) * (radiusAt(key, a) ** 2 + 4 * radiusAt(key, m) ** 2 + radiusAt(key, b) ** 2);
    }
    return s;
  }

  // Fracción de botella para una altura dada. Es lo único que consume la
  // pantalla de conteo: devuelve 0 en la base y 1 en la línea de lleno.
  function fractionAt(key, y) {
    const prof = PROFILES[key] || PROFILES.cylinder;
    const full = volumeTo(key, prof.yFull);
    if (!full) return 0;
    return Math.max(0, Math.min(1, volumeTo(key, Math.min(y, prof.yFull)) / full));
  }

  // Camino inverso: dada una fracción, a qué altura hay que poner la
  // línea. Se busca por bisección sobre la misma integral, así el dibujo
  // y el número nunca pueden discrepar.
  function heightFor(key, fraction) {
    const prof = PROFILES[key] || PROFILES.cylinder;
    const target = Math.max(0, Math.min(1, fraction));
    let lo = 0, hi = prof.yFull;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fractionAt(key, mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function keys() { return Object.keys(PROFILES); }
  function get(key) { return PROFILES[key] || null; }

  window.BarStockBottleProfiles = {
    PROFILES, keys, get, radiusAt, volumeTo, fractionAt, heightFor
  };
})();
