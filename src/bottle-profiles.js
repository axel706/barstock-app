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

  // ── Interpolación entre los puntos del perfil ────────────────────────
  //
  // Antes era LINEAL, y ese era el motivo de que las siluetas salieran
  // cuadradas: el hombro de una botella es una curva y se estaba
  // dibujando como dos rectas que se cortan en ángulo. Con nueve puntos
  // de control, cada unión se veía como una esquina.
  //
  // Ahora es un spline cúbico MONÓTONO (Fritsch–Carlson). Se eligió ese
  // y no un Catmull-Rom normal por un motivo concreto: un spline
  // corriente se pasa de largo en los cambios bruscos, y en un hombro
  // eso inventaría una panza que la botella no tiene. Monótono garantiza
  // que entre dos puntos la curva no se sale del rango de esos dos
  // puntos: donde el perfil es plano, sale plano; donde baja, solo baja.
  //
  // Y como el dibujo y la integral comparten esta función, la silueta
  // que se ve sigue siendo exactamente la que se calcula.

  // ── Arquetipo o perfil propio ───────────────────────────────────────
  //
  // Todo lo de abajo acepta indistintamente la clave de un arquetipo
  // ('tequila') o un perfil propio del artículo ({ yFull, p }), que es
  // lo que genera la IA para cada producto concreto. Así el panel de
  // conteo, la parrilla de revisión y la integral comparten un solo
  // motor y no puede haber dos geometrías distintas conviviendo.
  function profOf(x) {
    if (x && typeof x === 'object' && Array.isArray(x.p) && x.p.length >= 2) return x;
    return PROFILES[x] || PROFILES.generic;
  }

  // Las tangentes se calculan una vez por perfil y se guardan. Recalcular
  // en cada consulta serían miles de veces por arrastre. Los arquetipos
  // se cachean por clave; los perfiles propios, por objeto, para que el
  // caché se libere solo cuando el perfil deja de usarse.
  const _tangents = {};
  const _tangentsObj = new WeakMap();

  function tangentsFor(key, p) {
    const isObj = (typeof key === 'object' && key !== null);
    if (isObj && _tangentsObj.has(key)) return _tangentsObj.get(key);
    if (!isObj && _tangents[key]) return _tangents[key];
    const n = p.length;
    const d = new Array(n - 1);      // pendientes de cada tramo
    for (let i = 0; i < n - 1; i++) {
      const dy = p[i + 1][0] - p[i][0];
      d[i] = dy === 0 ? 0 : (p[i + 1][1] - p[i][1]) / dy;
    }
    const m = new Array(n);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      // Un cambio de signo es un pico: la tangente va a cero para que la
      // curva no se pase de largo.
      m[i] = (d[i - 1] * d[i] <= 0) ? 0 : (d[i - 1] + d[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i];
      const h = Math.hypot(a, b);
      if (h > 3) { m[i] = (3 / h) * a * d[i]; m[i + 1] = (3 / h) * b * d[i]; }
    }
    if (isObj) _tangentsObj.set(key, m); else _tangents[key] = m;
    return m;
  }

  function radiusAt(key, y) {
    const prof = profOf(key);
    const p = prof.p;
    if (p.length < 3) {
      // Dos puntos son una recta y no hay nada que suavizar.
      if (y <= p[0][0]) return p[0][1];
      if (y >= p[p.length - 1][0]) return p[p.length - 1][1];
      const t = (y - p[0][0]) / (p[1][0] - p[0][0]);
      return p[0][1] + (p[1][1] - p[0][1]) * t;
    }
    if (y <= p[0][0]) return p[0][1];
    if (y >= p[p.length - 1][0]) return p[p.length - 1][1];

    const m = tangentsFor(key, p);
    for (let i = 1; i < p.length; i++) {
      if (y <= p[i][0]) {
        const [y0, r0] = p[i - 1], [y1, r1] = p[i];
        const h = y1 - y0;
        if (h === 0) return r1;
        const t = (y - y0) / h;
        const t2 = t * t, t3 = t2 * t;
        return (2*t3 - 3*t2 + 1) * r0
             + (t3 - 2*t2 + t) * h * m[i - 1]
             + (-2*t3 + 3*t2) * r1
             + (t3 - t2) * h * m[i];
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
    const prof = profOf(key);
    const full = volumeTo(key, prof.yFull);
    if (!full) return 0;
    return Math.max(0, Math.min(1, volumeTo(key, Math.min(y, prof.yFull)) / full));
  }

  // Camino inverso: dada una fracción, a qué altura hay que poner la
  // línea. Se busca por bisección sobre la misma integral, así el dibujo
  // y el número nunca pueden discrepar.
  function heightFor(key, fraction) {
    const prof = profOf(key);
    const target = Math.max(0, Math.min(1, fraction));
    let lo = 0, hi = prof.yFull;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fractionAt(key, mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // El trazado vive AQUI y no en el panel, para que la silueta que se
  // revisa y la que se cuenta salgan de la misma linea de codigo.
  function pathFor(x, w, h, pad) {
    pad = pad == null ? 12 : pad;
    const cx = w / 2, usable = h - pad * 2, maxR = w * 0.30;
    const X = (r) => cx + r * maxR;
    const Y = (y) => h - pad - y * usable;
    const pts = [];
    for (let i = 0; i <= 120; i++) pts.push([i / 120, radiusAt(x, i / 120)]);
    let d = `M ${X(pts[0][1])} ${Y(pts[0][0])}`;
    for (const [y, r] of pts) d += ` L ${X(r)} ${Y(y)}`;
    for (let i = pts.length - 1; i >= 0; i--) d += ` L ${cx - pts[i][1] * maxR} ${Y(pts[i][0])}`;
    return d + ' Z';
  }

  // Un perfil de la IA entra a la base de datos y de ahi al calculo, asi
  // que se valida antes de creerselo. Un perfil mal formado no da error:
  // da un numero plausible y equivocado.
  function isValidProfile(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.p)) return false;
    if (o.p.length < 4 || o.p.length > 16) return false;
    const yf = Number(o.yFull);
    if (!(yf > 0.4 && yf < 0.97)) return false;
    let lastY = -1;
    for (const q of o.p) {
      if (!Array.isArray(q) || q.length !== 2) return false;
      const [y, r] = q.map(Number);
      if (!isFinite(y) || !isFinite(r)) return false;
      if (y < 0 || y > 1 || r <= 0 || r > 1) return false;
      if (y < lastY) return false;          // los puntos van de base a boca
      lastY = y;
    }
    if (Number(o.p[0][0]) !== 0) return false;
    if (Number(o.p[o.p.length - 1][0]) !== 1) return false;
    if (!o.p.some(q => Number(q[1]) >= 0.98)) return false;   // algo tiene que ser el ancho maximo
    return true;
  }

  function keys() { return Object.keys(PROFILES); }
  function get(key) { return PROFILES[key] || null; }

  window.BarStockBottleProfiles = {
    PROFILES, keys, get, profOf, pathFor, isValidProfile,
    radiusAt, volumeTo, fractionAt, heightFor
  };
})();
