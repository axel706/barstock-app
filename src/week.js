(() => {
  if (window.BarStockWeek) return;

  // ── La semana, en un solo sitio ──────────────────────────────────────
  //
  // Había seis copias de este cálculo repartidas por la aplicación, en
  // dos variantes que no coincidían, y ninguna compartida. Este módulo
  // las sustituye a todas.
  //
  // ── Las DOS preguntas ───────────────────────────────────────────────
  //
  // No es una inconsistencia que hubiera dos fórmulas: son dos preguntas
  // distintas, y confundirlas es justo lo que pasaba.
  //
  //   weekOf(fecha)        ¿a qué semana PERTENECE esta fecha?
  //                        Para clasificar cosas que ya pasaron: una
  //                        orden, una venta, un gasto. Un domingo
  //                        pertenece a la semana que empezó el lunes
  //                        ANTERIOR, porque la semana va de lunes a
  //                        domingo y el domingo es su último día.
  //
  //   cycleWeekFor(fecha)  ¿qué ciclo ABRE una acción hecha en esta
  //                        fecha? Para nombrar la semana que empieza al
  //                        cerrar un conteo. Aquí un domingo cuenta como
  //                        el lunes SIGUIENTE: contar un domingo por la
  //                        noche es preparar la semana que entra, no
  //                        tomar una lectura a mitad de la que acaba.
  //
  // Las dos solo se diferencian en domingo. El resto de la semana dan lo
  // mismo, y por eso la discrepancia sobrevivió tanto tiempo.
  //
  // ── El fallo de la zona horaria ─────────────────────────────────────
  //
  // Éste es el gordo, y no tiene nada que ver con el domingo.
  //
  // Las copias antiguas formateaban la clave con `toISOString()`, que
  // convierte a UTC. En una zona con desfase negativo —toda Norteamérica—
  // una fecha local de por la tarde ya es el día siguiente en UTC. En
  // Chicago, cualquier operación a partir de las 19:00 producía:
  //
  //     miércoles 19:00 local  →  week_start 2026-09-15   (martes)
  //     miércoles 14:00 local  →  week_start 2026-09-14   (lunes)
  //
  // En un bar, las siete de la tarde no es una hora rara: es el turno.
  // Cerrar un conteo o meter una orden de noche escribía snapshots con la
  // clave de un martes, y como la restricción de unicidad incluye
  // `week_start`, eso no daba error: creaba filas nuevas. La misma semana
  // real quedaba partida en dos, y el consumo —que se calcula restando
  // extremos dentro de una semana— salía mal en las dos mitades.
  //
  // Aquí la clave se arma con los componentes LOCALES de la fecha. Nunca
  // pasa por UTC.

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  // 'YYYY-MM-DD' desde la fecha LOCAL. No `toISOString()`: esa era la
  // causa del fallo de arriba.
  function key(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // ¿A qué semana pertenece esta fecha? Lunes 00:00 local, hacia atrás.
  function weekOf(date) {
    const d = date ? new Date(date) : new Date();
    const day = d.getDay();                 // 0 domingo … 6 sábado
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ¿Qué ciclo abre una acción hecha en esta fecha? Domingo mira hacia
  // delante; el resto de días, hacia atrás.
  function cycleWeekFor(date) {
    const d = date ? new Date(date) : new Date();
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? 1 : 1 - day));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function weekKey(date)      { return key(weekOf(date)); }
  function cycleWeekKey(date) { return key(cycleWeekFor(date)); }

  // ¿Esta fecha cae dentro de la semana que contiene a la referencia?
  function sameWeek(a, b) { return weekKey(a) === weekKey(b); }

  window.BarStockWeek = { weekOf, weekKey, cycleWeekFor, cycleWeekKey, sameWeek, key };
})();
