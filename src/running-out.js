(() => {
  if (window.BarStockRunningOut) return;

  // ── Lo que se acaba esta semana, una vez para toda la app ────────────
  //
  // Lo enseñan dos sitios: la tarjeta "Running out first" del Home y, al
  // tocar su "See them", Inventory filtrado a esos productos. Vivía
  // dentro de mobile-home.js, y "See them" abría Inventory con su propio
  // orden ("Closest to empty", lo que queda contra el par): con quince
  // productos en cero empatados, salían en el orden del inventario y la
  // lista no se parecía a la tarjeta (Axel, 2026-11-11: "me muestra la
  // lista de inventario sin un orden específico, no los productos que me
  // dice que se van a terminar"). Ahora los dos leen esta lista: si la
  // tarjeta dice 18, Inventory enseña esos 18 en el mismo orden.
  //
  // Qué entra, y sólo lo que tiene PAR: Axel, 2026-11-11, "si no tienen
  // par es porque no los ordeno, ¿qué punto hay en que me diga que se me
  // va a terminar algo QUE NO ORDENO?". Salían quince "Out now" de
  // productos con "no par" (un vodka de la casa, vermouths que ya no se
  // piden) porque Pour·IQ conservaba su historia de consumo. La tarjeta
  // es para lo que se vende Y se pide: saber si se acaba esta semana,
  // mañana o en los próximos días.
  //   · Lo que Toast vende, por el día en que se acaba según run-out.js
  //     (el LIVE de hoy menos lo que se suele gastar cada día de la
  //     semana): sólo lo de los próximos siete días.
  //   · Lo que Toast no vende (la cerveza), con Pour·IQ sobre el número
  //     que enseña Inventory (el LIVE si se movió): siete días o menos.
  //
  // El orden: lo que está fuera primero —es otro estado—, después el que
  // se acaba antes y, a igual día, el que más se mueve. Con todo a cero
  // gana el que más se mueve (test-tarjeta-pronto.js).
  //
  // Sólo lee (lo fijado, de este teléfono: ver fijar()).

  // Con menos de cuatro semanas de historia el promedio de Pour·IQ no
  // significa nada todavía. El mismo mínimo que el resto del Home.
  const SEMANAS_MIN = 4;

  // ── Lo que cada quien fija arriba (Axel, 2026-11-15, lámina B) ──────
  //
  // "Edit order" en la pantalla de Running out: arrastrar a "Pinned"
  // pone un producto primero, en el orden que uno quiera; el resto sigue
  // debajo con el orden de la app. Es de CADA PERSONA (Axel): se guarda
  // en su teléfono, por locación, no en la base. Lo que deja de acabarse
  // sale de la lista y su fijado se conserva: si vuelve, vuelve a su
  // sitio. Vale para la tarjeta del Home y la pantalla de revisión (y el
  // filtro de Inventory), que leen esta lista; el correo de la mañana no
  // la usa y no cambia. Sin localStorage (el servidor, un navegador
  // privado), no hay fijados y todo sigue como antes.
  const CLAVE = 'bs_ro_fijados_';
  const sufijo = () => {
    let n = null;
    try { n = localStorage.getItem('barstock.activeLocationName'); } catch (e) {}
    n = n || (window.BARSTOCK_CONFIG && window.BARSTOCK_CONFIG.LOCATION_NAME) || 'default';
    return String(n).replace(/\s+/g, '_').toLowerCase();
  };
  function fijados() {
    try {
      const v = JSON.parse(localStorage.getItem(CLAVE + sufijo()) || '[]');
      return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x) : [];
    } catch (e) { return []; }
  }
  function fijar(nombres) {
    const unicos = [];
    for (const n of nombres || []) if (typeof n === 'string' && n && unicos.indexOf(n) < 0) unicos.push(n);
    try { localStorage.setItem(CLAVE + sufijo(), JSON.stringify(unicos)); } catch (e) { return false; }
    if (window.BarStockEvents && window.BarStockEvents.emit) window.BarStockEvents.emit('runningOutOrder', {});
    return true;
  }

  // Lo de Pour·IQ dice el día, como lo de Toast ("Out Fri", la regla de
  // live-cache.agota): el Laurent Perrier decía "6 days" en una lista que
  // decía "Out Fri" (Axel, 2026-11-18). Los días cuentan desde hoy en
  // Nueva York; dentro de la semana, el nombre; más allá, la fecha.
  function diaTxt(dias) {
    if (!dias) return 'Out today';
    if (dias === 1) return 'Out tomorrow';
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const f = new Date(hoy + 'T12:00:00Z');
    f.setUTCDate(f.getUTCDate() + dias);
    const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return dias < 7 ? 'Out ' + D[f.getUTCDay()] : 'Out ' + M[f.getUTCMonth()] + ' ' + f.getUTCDate();
  }

  // `o.porFecha`: el orden de la app, sin lo fijado (lo usa "Edit order"
  // para enseñar lo de debajo como lo pondría la app).
  function lista(o) {
    const LC = window.BarStockLiveCache;
    const parM = window.parAdjustments;
    const master = (window.state && window.state.master) || [];
    const out = [];
    for (const r of master) {
      if (!r || !r.item) continue;
      if (!((Number(r.suggested) || 0) > 0)) continue;   // sin par: no se pide
      const vivo = !!(LC && LC.vivo(r));
      if (LC && LC.toastLoVende(r)) {
        const a = LC.agota(r);
        if (!a || a.enDias >= 7) continue;
        out.push({ r, item: r.item, dias: a.enDias, out: a, vivo, fuera: LC.cuanto(r) <= 0, avg: 0 });
        continue;
      }
      const p = parM && parM.get ? parM.get(r.item + '||' + (r.code || '')) : null;
      if (!p || p.status !== 'active') continue;
      const avg = Number(p.avgUsed) || 0;
      if (avg <= 0 || (p.normalWeeks || 0) < SEMANAS_MIN) continue;
      const queda = LC ? LC.cuanto(r) : (Number(r.onHand) || 0);
      // Sin margen: lo que Toast no descuenta enseña lo contado, no un
      // estimado. Con la media botella de run-out.js, lo que casi no se
      // mueve salía aquí ("Don Julio, 19 days") y su fila decía otra cosa.
      const dias = Math.max(0, Math.round(queda / avg * 7));
      if (dias > 7) continue;
      // `fuera` mira el estante, no el redondeo: media botella de algo
      // que se mueve mucho también da "0 days", y decir que está fuera
      // cuando queda media es mentira.
      const fuera = queda <= 0;
      out.push({ r, item: r.item, dias, avg, vivo, fuera,
        out: { txt: fuera ? 'Out now' : diaTxt(dias),
               tono: dias <= 2 ? 'r' : dias < 7 ? 'a' : 'g' } });
    }
    out.sort((a, b) => (b.fuera - a.fuera) || (a.dias - b.dias) || (b.avg - a.avg));
    if (o && o.porFecha) return out;
    // Lo fijado primero, en su orden; lo demás como estaba (sort estable).
    const fij = fijados();
    if (!fij.length) return out;
    const pos = new Map(fij.map((n, i) => [n, i]));
    for (const x of out) x.fijado = pos.has(x.item);
    return out.map((x, i) => [x, i])
      .sort((a, b) => ((pos.has(a[0].item) ? pos.get(a[0].item) : Infinity) - (pos.has(b[0].item) ? pos.get(b[0].item) : Infinity)) || (a[1] - b[1]))
      .map(p => p[0]);
  }

  window.BarStockRunningOut = { lista, fijados, fijar, SEMANAS_MIN };
})();
