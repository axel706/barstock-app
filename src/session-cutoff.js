(() => {
  if (window.BarStockSessionCutoff) return;

  // ── Cuándo se cierra la sesión sola ──────────────────────────────────
  //
  // Antes: a los 30 minutos sin tocar la app. En el iPhone eso era
  // impredecible, porque el temporizador se congela con la app en segundo
  // plano: a veces cerraba al volver y a veces no. Axel (2026-11-09):
  //
  //   - se cierra a medianoche, hora de Nueva York, todos los días;
  //   - si alguien usó la app en los 30 minutos ANTES del corte, el corte
  //     se recorre 2 horas, y otra vez mientras se siga usando antes de
  //     cada corte (quien cierra un conteo a las 11:50 no se queda fuera);
  //   - nada más.
  //
  // Por eso no hay temporizador que se pueda congelar: se guarda el
  // próximo corte y la última actividad ANTES de él, y se resuelve cada
  // vez que se mira (al abrir, al volver a la app, cada 30 s). Si la app
  // se quedó abierta a las 10 pm y se abre a las 9 am, se sabe que pasó
  // la medianoche sin nadie usándola.
  //
  // Aquí sólo la regla, sin Supabase ni localStorage, para poder probarla
  // con noches de verdad (tools/test-cierre-sesion.js). Lo guarda y lo
  // aplica auth.js.

  const ZONA = 'America/New_York';
  const ANTES = 30 * 60 * 1000;     // la ventana antes del corte
  const RECORRE = 2 * 3600 * 1000;  // cuánto se recorre

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  function enNY(t) {
    const p = {};
    for (const x of fmt.formatToParts(new Date(t))) p[x.type] = Number(x.value);
    return p;
  }

  // El instante (UTC) de una hora de pared en Nueva York. Se adivina con
  // -5 h y se corrige con lo que dice el reloj de Nueva York: dos vueltas
  // bastan también en los días de cambio de horario.
  function deNY(y, m, d, h) {
    let t = Date.UTC(y, m - 1, d, h + 5);
    for (let i = 0; i < 2; i++) {
      const p = enNY(t);
      const quiero = Date.UTC(y, m - 1, d, h);
      const tengo = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
      t += quiero - tengo;
    }
    return t;
  }

  // La medianoche de Nueva York que viene después de `t`.
  function proximaMedianoche(t) {
    const p = enNY(t);
    return deNY(p.year, p.month, p.day + 1, 0);
  }

  function empezar(ahora) {
    return { corte: proximaMedianoche(ahora), ultimaAntes: null };
  }

  // Pasa los cortes que ya llegaron. Cada uno se salva sólo si hubo uso
  // en los 30 minutos antes de él; si no, la sesión se cierra.
  function resolver(estado, ahora) {
    const e = { corte: estado.corte, ultimaAntes: estado.ultimaAntes };
    while (ahora >= e.corte) {
      const usada = e.ultimaAntes != null && e.ultimaAntes >= e.corte - ANTES && e.ultimaAntes < e.corte;
      if (!usada) return { cerrar: true, estado: e };
      e.corte += RECORRE;
    }
    return { cerrar: false, estado: e };
  }

  // Se llama DESPUÉS de resolver: así `t` es anterior al corte vigente y
  // un toque pasada la medianoche no salva un corte que ya pasó.
  function actividad(estado, t) {
    return { corte: estado.corte, ultimaAntes: t };
  }

  window.BarStockSessionCutoff = { empezar, resolver, actividad, proximaMedianoche, ANTES, RECORRE };
})();
