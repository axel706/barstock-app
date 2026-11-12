(() => {
  if (window.BarStockInventoryRow) return;
  // ── Una fila de inventory_items → una de state.master ───────────────
  //
  // Vivía dentro de inventory-realtime.js, la carga del inventario en la
  // app. El correo de la mañana la necesita también en el servidor
  // (lib/morning-cron.js), y escribirla dos veces es como empiezan dos
  // versiones que un día dicen cosas distintas. Se sacó tal cual: mismos
  // campos, mismos valores por defecto.
  //
  // Pura: no lee ni escribe nada. `normalizeName` y `computeToOrder` son
  // del escritorio; donde no están (el servidor), se usa lo de siempre.

  // Las columnas que se leen. Cada una que se use abajo tiene que estar aquí.
  const COLS = 'code,item_name,vendor,on_hand,suggested,value,category,' +
               'order_override,par_adjusted_week,bottle_size_ml,bottle_shape,' +
               'created_at,last_opens';

  function deNube(r) {
    const onHand = Number(r.on_hand || 0);
    const suggested = Number(r.suggested || 0);
    // El override ahora viene de la nube. Antes se intentaba "rescatar" del
    // state.master en memoria comparando nombre + vendor con igualdad exacta
    // de texto y sin usar el codigo; cualquier diferencia minima, o dos
    // articulos con el mismo nombre, hacia que se perdiera en silencio.
    const override = (r.order_override === null || r.order_override === undefined)
      ? ''
      : Math.max(0, Number(r.order_override) || 0);
    return {
      code: r.code || '',
      item: r.item_name || '',
      itemNorm: typeof normalizeName === 'function' ? normalizeName(r.item_name || '') : (r.item_name || ''),
      vendor: String(r.vendor || 'UNKNOWN').trim().toUpperCase(),
      onHand,
      suggested,
      value: Number(r.value || 0),
      category: r.category || null,
      // Describen la BOTELLA, no el conteo. Se leen aqui y se reescriben
      // en replaceInventoryMaster para que el import semanal no los
      // borre, igual que category.
      bottleSizeMl: r.bottle_size_ml || null,
      bottleShape: r.bottle_shape || null,
      // Semana en que Pour-IQ ya ajusto este articulo. Se escribia desde
      // hace tiempo pero nunca se leia, por eso los articulos ajustados
      // reaparecian como pendientes de inmediato.
      parAdjustedWeek: r.par_adjusted_week || null,
      // Para la gracia de los recien creados en BarStockDormant: un
      // articulo dado de alta hoy no tiene stock ni par y se
      // escondería en el acto sin esto.
      createdAt: r.created_at || null,
      // Como quedaron las abiertas en el ultimo conteo. Referencia
      // para el siguiente, no dato de calculo.
      lastOpens: Array.isArray(r.last_opens) ? r.last_opens.map(Number) : null,
      toOrder: typeof computeToOrder === 'function' ? computeToOrder(onHand, suggested) : 0,
      orderOverride: override
    };
  }

  window.BarStockInventoryRow = { COLS, deNube };
})();
