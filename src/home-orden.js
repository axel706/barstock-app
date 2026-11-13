(() => {
  if (window.BarStockHomeOrden) return;

  // ── Qué tarjeta del carrusel va primera, según la semana ─────────────
  //
  // Axel, 2026-11-13: el carrusel sigue la semana de trabajo.
  //
  //   · Desde el domingo a las 4:00 PM (Nueva York), mientras no se
  //     cierre un conteo después de esa hora: el CICLO. Es la hora de
  //     contar.
  //   · Cerrado el conteo, con órdenes sin colocar: las ÓRDENES.
  //   · Colocadas (o si el conteo no dejó ninguna): RUNNING OUT, el resto
  //     de la semana, hasta el domingo siguiente a las 4 PM.
  //
  // Los casos que la regla no decía, acordados con él:
  //   · Sin nada que se acabe no hay tarjeta de Running out: va el ciclo.
  //   · Un conteo que se hace otro día (el lunes, porque el domingo no se
  //     pudo) cuenta igual: el ciclo sigue primero desde el domingo a las
  //     4 hasta que se cierra, y al cerrarlo siguen las órdenes.
  //   · Un conteo a medias va primero (mobile-home, por `foco`), y la
  //     tarjeta de la versión nueva va delante de todo, siempre.
  //
  // "Cerrado" es que el ciclo se abrió (resetAt de weekly-cycle, el
  // momento en que se cerró el conteo) en o después del último domingo a
  // las 4 PM. Aquí no se lee nada: recibe los datos y decide, para poder
  // probarlo con cualquier hora.

  const ZONA = 'America/New_York';
  const HORA = 16;

  // Las piezas de una fecha en Nueva York.
  function partes(ms) {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', {
      timeZone: ZONA, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(ms))) p[x.type] = x.value;
    const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second, dow: dias[p.weekday] };
  }

  // Una hora de Nueva York (y, m, d, h) en milisegundos UTC. El desfase se
  // mide en esa fecha, no se supone: cambia con el horario de verano.
  function nyAUtc(y, m, d, h) {
    const guess = Date.UTC(y, m - 1, d, h);
    const p = partes(guess);
    const comoUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    return guess - (comoUtc - guess);
  }

  // El último domingo a las 4 PM de Nueva York en o antes de `ahora`.
  function corte(ahora) {
    const p = partes(ahora);
    // El domingo de esta semana, en el calendario de Nueva York.
    const base = new Date(Date.UTC(p.y, p.m - 1, p.d) - p.dow * 864e5);
    let c = nyAUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), HORA);
    if (c > ahora) {
      const ant = new Date(base.getTime() - 7 * 864e5);
      c = nyAUtc(ant.getUTCFullYear(), ant.getUTCMonth() + 1, ant.getUTCDate(), HORA);
    }
    return c;
  }

  // o = { ahora (ms), resetAt (ISO o null), hayOrdenes, hayAgota }
  // → 'ciclo' | 'ordenes' | 'agota'
  function primera(o) {
    const c = corte(o.ahora);
    const r = o.resetAt ? new Date(o.resetAt).getTime() : NaN;
    const cerrado = !isNaN(r) && r >= c;
    if (!cerrado) return 'ciclo';
    if (o.hayOrdenes) return 'ordenes';
    if (o.hayAgota) return 'agota';
    return 'ciclo';
  }

  window.BarStockHomeOrden = { primera, corte, HORA };
})();
