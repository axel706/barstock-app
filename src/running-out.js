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
  // Sólo lee.

  // Con menos de cuatro semanas de historia el promedio de Pour·IQ no
  // significa nada todavía. El mismo mínimo que el resto del Home.
  const SEMANAS_MIN = 4;

  function lista() {
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
      const dias = Math.max(0, Math.round(queda / avg * 7));
      if (dias > 7) continue;
      // `fuera` mira el estante, no el redondeo: media botella de algo
      // que se mueve mucho también da "0 days", y decir que está fuera
      // cuando queda media es mentira.
      const fuera = queda <= 0;
      out.push({ r, item: r.item, dias, avg, vivo, fuera,
        out: { txt: fuera ? 'Out now' : dias + (dias === 1 ? ' day' : ' days'),
               tono: dias <= 2 ? 'r' : dias < 7 ? 'a' : 'g' } });
    }
    out.sort((a, b) => (b.fuera - a.fuera) || (a.dias - b.dias) || (b.avg - a.avg));
    return out;
  }

  window.BarStockRunningOut = { lista, SEMANAS_MIN };
})();
