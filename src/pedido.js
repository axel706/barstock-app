(() => {
  if (window.BarStockPedido) return;

  // ── Cuánto pedir: de entrega a entrega (docs/plan-pedido.md) ─────────
  //
  // Axel, 2026-11-18: "que la app me enseñe a ordenar productos sin
  // overstock, que duren de orden a orden de proveedor". Fase 1: el
  // motor, sin pantalla. Funciones puras: reciben los números ya leídos
  // y no leen ni escriben nada.
  //
  //   pedir = lo que se va a usar desde que llega este pedido hasta que
  //           llega el siguiente del MISMO proveedor
  //         + un colchón (el que cubre ~80 % de las vueltas)
  //         − lo que habrá en la estantería cuando llegue
  //
  // ── De dónde sale lo que se usa ──────────────────────────────────────
  //
  //   · El total de la semana, de Pour·IQ (uso por conteo, EWMA, sin
  //     semanas de evento): el consumo de verdad, con merma y open bar.
  //   · La forma de la semana, de Toast: qué parte de lo semanal se va
  //     cada día de la semana. Sin ella no se puede contar "hasta el
  //     martes a las 4 PM".
  //   · Lo reciente, de Toast: la MEDIANA de las últimas 4 semanas
  //     enteras. Pour·IQ cuenta el pasado y llega tarde: el Nino Ardevi
  //     vendía 1.3 un miércoles en 13 semanas y 3.3 en las últimas 4, y la
  //     app lo daba por durar (2026-11-18). Mediana y no promedio: una
  //     semana de fiesta (el sábado de 19.7) no mueve sola lo que se pide.
  //   · Lo que se usa por semana es lo MAYOR de los dos. La primera
  //     versión MULTIPLICABA Pour·IQ por la tendencia de Toast (las 4
  //     últimas contra las 13), y eso la contaba dos veces: Pour·IQ ya
  //     pesa más lo reciente (EWMA). Con los datos de Crown el Nino salía
  //     a 42 por semana vendiendo ~25-30, y sugería 15 de más. Lo mayor
  //     de los dos no multiplica nada: si algo se dispara, Toast lo sube;
  //     si Toast no ve todo (open bar, merma), mandan los conteos.
  //     `tendencia` (4 contra 13, de ½ a 3×) queda como dato para decir
  //     el por qué, no entra en la cuenta.
  //   · Sin Pour·IQ (menos de 4 semanas), Toast solo; sin Toast, Pour·IQ
  //     repartido por igual en la semana.
  //
  // ── El colchón ───────────────────────────────────────────────────────
  //
  // 0.84 desviaciones: cubre ~80 % de las vueltas. Pour·IQ pide para el
  // 90 % y además multiplica por 1.35; con LOOP a mano el mismo día,
  // quedarse corto un viernes cuesta un viaje, no una venta. Axel lo
  // aceptó así ("80 % si consideras que es lo óptimo").
  //
  // ── El aviso ─────────────────────────────────────────────────────────
  //
  // Lo típico de cada día más el mismo colchón del 80 %, que crece con la
  // raíz de los días (z · σ · √(días/7)), y las entregas a SU hora: lo que
  // llega el jueves a las 4 PM no cubre lo que se vende al mediodía.
  // La primera versión restaba un día FUERTE (el 75 %) CADA día: siete
  // días fuertes seguidos no pasan, y el White Haven con 23 botellas y 20
  // a la semana salía "se acaba el domingo" (Crown, 2026-11-18).

  const Z = 0.84;               // ~80 % de las vueltas
  const SEMANAS_TOAST = 13;
  const SEMANAS_TENDENCIA = 4;
    const TENDENCIA_MIN = 0.5, TENDENCIA_MAX = 3;
  const MIN_SEMANAS_POURIQ = 4;
  const CORTE_H = 4;            // el día de negocio empieza a las 4 AM
  const DIA = 864e5;

  // ── Fechas, en días de negocio de Nueva York ─────────────────────────
  const sumarDias = (d, k) => new Date(Date.parse(d + 'T12:00:00Z') + k * DIA).toISOString().slice(0, 10);
  const dow = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
  const fmtNY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  const horaNY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' });
  const diaDe = (ms) => fmtNY.format(new Date(ms - CORTE_H * 3600e3));
  // Las 4:00 AM de ese día en Nueva York (invierno o verano).
  function inicio(d) {
    const g = Date.parse(d + 'T09:00:00Z');
    return g - (Number(horaNY.format(new Date(g))) - CORTE_H) * 3600e3;
  }
  // Qué parte del día de negocio `d` había pasado en `t`. Lineal: quien
  // llame puede pasar la curva de horas de la barra (toast-usage.
  // fraccionDia), que es más fiel.
  function fraccionLineal(d, t) {
    const a = inicio(d), b = inicio(sumarDias(d, 1));
    return Math.max(0, Math.min(1, (t - a) / (b - a)));
  }

  function mediana(xs) {
    if (!xs.length) return 0;
    const o = xs.slice().sort((a, b) => a - b), m = Math.floor(o.length / 2);
    return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
  }
  function percentil(xs, p) {
    if (!xs.length) return 0;
    const o = xs.slice().sort((a, b) => a - b), i = (o.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return o[lo] + (o[hi] - o[lo]) * (i - lo);
  }
  function desviacion(xs) {
    if (xs.length < 2) return 0;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
  }
  const lunesDe = (d) => sumarDias(d, -((dow(d) + 6) % 7));

  // ── La demanda de un producto ────────────────────────────────────────
  //
  // pouriq: { avg, sd, semanas } (par-intelligence: avgUsed, stdDev,
  //         normalWeeks) o null.
  // toast:  { porDia: { 'AAAA-MM-DD': botellas }, cargados: [fechas
  //         cerradas y completas] } o null.
  // hoy:    el día de negocio de hoy; sólo cuenta lo de ANTES.
  //
  // → { porDia: [7], semanal, sigma, tendencia, reciente, fuente }
  function demanda({ pouriq, toast, hoy }) {
    const cargados = ((toast && toast.cargados) || []).filter(d => d < hoy).sort();
    const v = (d) => Number((toast && toast.porDia && toast.porDia[d]) || 0);

    // Semanas enteras de lunes a domingo (los siete días cargados), de la
    // más vieja a la más nueva, las últimas 13.
    const set = new Set(cargados);
    const lunes = [...new Set(cargados.map(lunesDe))].sort();
    const semanas = lunes.filter(l => [0, 1, 2, 3, 4, 5, 6].every(k => set.has(sumarDias(l, k))))
      .slice(-SEMANAS_TOAST)
      .map(l => ({ lunes: l, total: [0, 1, 2, 3, 4, 5, 6].reduce((a, k) => a + v(sumarDias(l, k)), 0) }));

    // La forma: qué parte de la semana se va cada día de la semana.
    const porDow = [0, 0, 0, 0, 0, 0, 0];
    for (const s of semanas) for (let k = 0; k < 7; k++) { const d = sumarDias(s.lunes, k); porDow[dow(d)] += v(d); }
    const totForma = porDow.reduce((a, b) => a + b, 0);
    const forma = totForma > 0 ? porDow.map(x => x / totForma) : null;

    // La tendencia: mediana de las últimas 4 contra la de las 13.
    const totales = semanas.map(s => s.total);
    const m13 = mediana(totales), m4 = mediana(totales.slice(-SEMANAS_TENDENCIA));
    const tendencia = totales.length >= SEMANAS_TENDENCIA * 2 && m13 > 0
      ? Math.max(TENDENCIA_MIN, Math.min(TENDENCIA_MAX, m4 / m13)) : 1;

    let semanal = 0, sigma = 0, fuente = 'none';
    const reciente = totales.length >= SEMANAS_TENDENCIA ? m4 : 0;
    const conPouriq = pouriq && (pouriq.semanas || 0) >= MIN_SEMANAS_POURIQ && Number(pouriq.avg) > 0;
    if (conPouriq) {
      const avg = Number(pouriq.avg);
      semanal = Math.max(avg, reciente);
      // La variación de los conteos, a escala de lo que se usa ahora.
      sigma = (Number(pouriq.sd) || 0) * (semanal / avg);
      fuente = reciente > avg ? 'toast-recent' : 'pouriq';
    } else if (totales.length) {
      semanal = reciente || m13;
      sigma = desviacion(totales.slice(-SEMANAS_TENDENCIA * 2));
      fuente = 'toast';
    }

    const porDia = forma ? forma.map(f => f * semanal) : [0, 1, 2, 3, 4, 5, 6].map(() => semanal / 7);

    return { porDia, semanal, sigma, tendencia, reciente, fuente };
  }

  // Lo que se usa entre dos instantes, con lo de cada día de la semana y
  // los días de las puntas partidos (frac).
  function consumoEntre(porDia, a, b, frac) {
    if (!(b > a)) return 0;
    const f = frac || fraccionLineal;
    const d0 = diaDe(a), d1 = diaDe(b);
    let total = 0;
    for (let d = d0, i = 0; d <= d1 && i < 400; d = sumarDias(d, 1), i++) {
      const fa = d === d0 ? f(d, a) : 0, fb = d === d1 ? f(d, b) : 1;
      total += (Number(porDia[dow(d)]) || 0) * Math.max(0, fb - fa);
    }
    return total;
  }

  // Botellas, o múltiplos de 3 en el vino (Axel, 2026-11-18: "en los
  // vinos intentar que sean múltiplos de 3, en especial si son de Wine
  // Merchant"; Breakthru acepta cualquier número).
  const multiploPara = ({ vendor, vino }) => (vino || /wine\s*merchant/i.test(String(vendor || ''))) ? 3 : 1;

  // ── Cuánto pedir para una vuelta del proveedor ───────────────────────
  //
  // dem:      demanda()
  // stock:    el LIVE ahora (negativo cuenta como 0: es un conteo corto)
  // viene:    [{ cuando: ms, n }] lo que ya viene de otros pedidos
  // ahora, llegada, siguiente: instantes (ms). `llegada` es cuándo llega
  //           ESTE pedido; `siguiente`, el siguiente del mismo proveedor.
  function cuantoPedir({ dem, stock, viene, ahora, llegada, siguiente, multiplo, z, frac }) {
    const k = multiplo > 1 ? multiplo : 1;
    const antes = consumoEntre(dem.porDia, ahora, llegada, frac);
    let llegaAntes = 0, llegaDurante = 0;
    for (const x of viene || []) {
      const t = Number(x.cuando), n = Number(x.n) || 0;
      if (t <= llegada) llegaAntes += n; else if (t < siguiente) llegaDurante += n;
    }
    const queda = Math.max(0, Math.max(0, Number(stock) || 0) + llegaAntes - antes);
    const uso = consumoEntre(dem.porDia, llegada, siguiente, frac);
    const colchon = (z == null ? Z : z) * (dem.sigma || 0) * Math.sqrt(Math.max(0, siguiente - llegada) / (7 * DIA));
    const falta = uso + colchon - queda - llegaDurante;
    const pedir = falta > 1e-6 ? Math.ceil((falta - 1e-6) / k) * k : 0;
    return { pedir, uso, colchon, queda, antes, llegaAntes, llegaDurante, multiplo: k };
  }

  // ── Cuándo se acaba, para avisar ─────────────────────────────────────
  //
  // Lo típico de cada día más el colchón (z · σ · √(días/7)), con las
  // entregas a su hora. → { dia, enDias, en } o null.
  function seAcaba({ dem, stock, viene, ahora, dias, frac, z }) {
    const f = frac || fraccionLineal;
    const zz = z == null ? Z : z;
    if (!(dem.porDia || []).some(x => x > 0)) return null;
    let s = Math.max(0, Number(stock) || 0);
    const hoy = diaDe(ahora);
    if (s <= 1e-9) return { dia: hoy, enDias: 0, en: ahora };
    const llegadas = (viene || []).map(x => ({ t: Number(x.cuando), n: Number(x.n) || 0 }))
      .filter(x => x.t > ahora).sort((a, b) => a.t - b.t);
    const colchon = (t) => zz * (dem.sigma || 0) * Math.sqrt(Math.max(0, t - ahora) / (7 * DIA));
    for (let k = 0; k < (dias || 7); k++) {
      const d = sumarDias(hoy, k), q = Number(dem.porDia[dow(d)]) || 0;
      // Los cortes de este día: desde ahora (o el inicio del día), cada
      // llegada de ese día, y el final del día. Se mira justo ANTES de
      // cada llegada: lo que llega a las 4 PM no salva el mediodía.
      const desde = k === 0 ? ahora : inicio(d);
      const fin = inicio(sumarDias(d, 1));
      const puntos = [desde].concat(llegadas.filter(x => x.t > desde && x.t < fin).map(x => x.t), [fin]);
      for (let i = 0; i < puntos.length - 1; i++) {
        s -= q * Math.max(0, f(d, puntos[i + 1]) - f(d, puntos[i]));
        if (s - colchon(puntos[i + 1]) <= 1e-9) return { dia: d, enDias: k, en: puntos[i + 1] };
        for (const x of llegadas) if (x.t === puntos[i + 1]) s += x.n;
      }
    }
    return null;
  }

  window.BarStockPedido = { demanda, consumoEntre, cuantoPedir, seAcaba, multiploPara, fraccionLineal, inicio, diaDe,
    mediana, percentil, Z, SEMANAS_TENDENCIA, TENDENCIA_MIN, TENDENCIA_MAX };
})();
