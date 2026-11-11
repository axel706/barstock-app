(() => {
  if (window.BarStockToastWine) return;

  // ── El vino de Toast, emparejado con el inventario ───────────────────
  //
  // Cada artículo de vino de Toast apunta a un vino del inventario (tabla
  // toast_item_links, migración 027). La pintan dos vistas, la tabla del
  // escritorio (toast-wine-panel.js) y las tarjetas del teléfono
  // (mobile-toast-wine.js); Axel pidió las dos.
  //
  // El motor —leer Toast, sugerir, guardar, deshacer— vivía aquí entero.
  // Cuando llegó el licor hacía falta el mismo, y está en toast-links.js
  // para no tenerlo dos veces. Aquí queda sólo lo que es del vino.

  // Axel: "es de 6 oz todo el tiempo". Una botella vendida es una botella
  // (pour vacío, como dice la migración 027).
  const COPA_OZ = 6;

  const E = window.BarStockToastLinks.crear({
    kind: 'wine',
    accion: 'wine',
    pour: (f) => (f.servicio === 'bottle' ? null : COPA_OZ)
  });

  // Lo que se enseña de cómo se sirve, igual en las dos vistas.
  const servicioTexto = (f) => f.servicio === 'bottle' ? 'Bottle · 1' : 'Glass · ' + COPA_OZ + ' oz';

  window.BarStockToastWine = Object.assign({}, E, { servicioTexto, COPA_OZ });
})();
