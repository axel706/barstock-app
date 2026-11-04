(() => {
  if (window.BarStockRest) return;

  // ── Leer una tabla entera de PostgREST ───────────────────────────────
  //
  // PostgREST corta en 1000 filas y no avisa: la respuesta llega con
  // 200 y parece completa. Una lectura corta que se tomó por completa
  // ya borró un producto del inventario de verdad (Baileys).
  //
  // Este bucle ya estaba escrito dos veces, igual, en
  // `mobile-history.js` y en `marginedge-purchases.js`. La tercera
  // pantalla que lo necesitaba (Time Machine) lo saca aquí en vez de
  // copiarlo otra vez. Las otras dos siguen con su copia: moverlas es
  // otro cambio y se hace aparte.
  //
  // `ruta` es lo que va después de /rest/v1/, ya con su `?`:
  //   'count_sessions?location_name=eq.X&select=*&order=finished_at.desc'
  //
  // Sin `order` la paginación no es estable: PostgREST no promete el
  // mismo orden entre dos peticiones y una fila podría salir dos veces
  // o ninguna. Quien llama tiene que ponerlo.

  const PAGINA = 1000;
  // El tope es un cinturón contra un bucle infinito si el servidor
  // ignorara el offset, no un límite de datos: 40 páginas son 40.000
  // filas, y si se llega aquí se lanza en vez de devolver una lista
  // corta como si fuera la entera.
  const MAX_PAGINAS = 40;

  async function leerTodo(ruta) {
    const c = window.BARSTOCK_CONFIG || {};
    if (!c.SUPABASE_URL || !c.SUPABASE_KEY) throw new Error('No Supabase settings on this device.');
    const sep = ruta.indexOf('?') >= 0 ? '&' : '?';
    let todas = [];
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const r = await fetch(
        c.SUPABASE_URL + '/rest/v1/' + ruta + sep + 'limit=' + PAGINA + '&offset=' + (p * PAGINA),
        { headers: { apikey: c.SUPABASE_KEY, Authorization: 'Bearer ' + c.SUPABASE_KEY } });
      if (!r.ok) throw new Error(await r.text());
      const t = await r.json();
      if (!Array.isArray(t)) throw new Error('Unexpected answer from the server.');
      todas = todas.concat(t);
      if (t.length < PAGINA) return todas;
    }
    throw new Error('More than ' + (PAGINA * MAX_PAGINAS) + ' rows: stopped instead of showing a partial list.');
  }

  window.BarStockRest = { leerTodo, PAGINA };
})();
