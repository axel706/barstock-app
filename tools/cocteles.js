/* ── ¿En qué cócteles va cada producto? ──────────────────────────────
 *
 * SÓLO LECTURA. Lee las recetas que ya carga la app
 * (BarStockToastRecipes) y lo vendido en Toast los últimos 30 días
 * (toast_sales, con GETs paginados). No escribe nada.
 *
 *   1. Abre app.barstockpro.com en la locación.
 *   2. Consola. Pega este archivo entero y Enter.
 *   3. (async () => { await bsCocteles(); })();
 *      (async () => { await bsCocteles(['Kamora', 'Triple Sec']); })();
 *
 * Por qué existe (Axel, 2026-11-19): bsDemanda enseñó productos en los
 * que Toast ve mucho menos de lo que dicen los conteos (Kamora 4.1
 * contra 11.3 a la semana, Kentucky Tavern 4.4 contra 9.6, Cinzano Sweet
 * 0.7 contra 3.4…) y uno al revés (Cinzano Dry 1.4 contra 0.3). Casi
 * todos son ingredientes de cóctel. El LIVE resta sólo lo que Toast ve:
 * una receta que falta, una línea sin botella o unas onzas cortas hacen
 * que la alerta llegue tarde. Esto dice, por producto:
 *
 *   A. Las recetas que lo usan: onzas por trago, cuántos vendió Toast
 *      en 30 días y las onzas que eso suma.
 *   B. Las líneas de receta SIN botella elegida: esas onzas no se
 *      restan de ningún producto (un "Coffee liqueur" sin Kamora).
 *   C. Lo que Toast vendió como cóctel SIN receta (lo de From Toast),
 *      del más vendido al menos: lo que no se resta de nada.
 *
 * Sólo cuenta por el nombre con el que Toast vende cada receta (y sus
 * "Same as…"). Las condiciones de una línea (sólo con / sin un
 * modificador) no se aplican aquí: las onzas son las de la receta.
 */
(() => {
  const POR_DEFECTO = ['Kamora', 'Kentucky Tavern', 'Cinzano Sweet', 'Pedro Morales', 'Empress',
    'Triple Sec', 'Smirnoff Vanilla', 'Cinzano Dry'];
  const DIAS = 30;
  const n1 = (x) => (Math.round((Number(x) || 0) * 10) / 10).toFixed(1).replace(/\.0$/, '');

  window.bsCocteles = async function (lista) {
    const T = window.BarStockToastRecipes, L = window.BarStockToastLinks, R = window.BarStockRest;
    if (!T || !L || !R) { console.log('Faltan módulos (¿app sin recargar?): ToastRecipes, ToastLinks o Rest.'); return; }
    const norm = (s) => L.norm(String(s || '')).replace(/[^a-z0-9]+/g, ' ').trim();
    await T.cargar();
    const d = T.datos();
    if (!d || d.estado !== 'listo') { console.log('No se pudieron leer las recetas: ' + ((d && d.error) || 'sin datos')); return; }
    const recetas = T.recetas();

    // Lo vendido en 30 días por nombre de Toast (licor: cócteles y licor solo).
    const desde = new Date(Date.now() - DIAS * 864e5).toISOString().slice(0, 10);
    const ventas = await R.leerTodo('toast_sales?location_id=eq.' + d.locationId + '&business_date=gte.' + desde +
      '&sales_category=ilike.*liquor*&select=toast_item_name,quantity&order=id.asc');
    const vendido = new Map();
    for (const v of ventas) { const k = L.norm(String(v.toast_item_name || '').trim()); vendido.set(k, (vendido.get(k) || 0) + (Number(v.quantity) || 0)); }
    const vendidoDe = (Rc) => [Rc.nombre].concat(Rc.tambien || []).reduce((a, n) => a + (vendido.get(L.norm(n)) || 0), 0);

    const buscar = (lista && lista.length ? lista : POR_DEFECTO);
    console.log('Recetas: ' + recetas.length + ' · ventas de Toast desde ' + desde + ' (' + DIAS + ' días)');

    // A. Por producto.
    for (const q of buscar) {
      const qn = norm(q);
      const filas = [];
      for (const Rc of recetas) {
        for (const l of Rc.lineas) {
          if (!l.producto || !norm(l.producto).includes(qn)) continue;
          const n = vendidoDe(Rc);
          filas.push({ receta: Rc.titulo, toast: Rc.nombre !== Rc.titulo ? Rc.nombre : '', 'Happy Hour': Rc.hh ? 'sí' : '',
            botella: l.producto, oz: n1(l.oz), 'vendidos 30d': n1(n), 'oz 30d': n1(n * l.oz),
            condicion: l.soloCon ? 'sólo con ' + l.soloCon : (l.sinCon && l.sinCon.length ? 'sin ' + l.sinCon.join(', ') : '') });
        }
      }
      console.log('━━ ' + q + ' ━━  ' + (filas.length ? filas.length + ' líneas de receta' : 'NINGUNA receta lo usa'));
      if (filas.length) {
        filas.sort((a, b) => Number(b['oz 30d']) - Number(a['oz 30d']));
        console.table(filas);
        const oz = filas.reduce((a, x) => a + Number(x['oz 30d']), 0);
        console.log('  Total: ' + n1(oz) + ' oz en 30 días ≈ ' + n1(oz / 25.36) + ' botellas de 750 ml (' + n1(oz / 25.36 / DIAS * 7) + ' a la semana)');
      }
    }

    // B. Líneas sin botella.
    const sinBotella = [];
    for (const Rc of recetas) for (const l of Rc.lineas) if (!l.producto) sinBotella.push({ receta: Rc.titulo, ingrediente: l.etiqueta, oz: n1(l.oz), 'vendidos 30d': n1(vendidoDe(Rc)) });
    console.log('━━ Líneas de receta SIN botella: ' + sinBotella.length + ' (sus onzas no se restan de nada) ━━');
    if (sinBotella.length) console.table(sinBotella.sort((a, b) => Number(b['vendidos 30d']) - Number(a['vendidos 30d'])));

    // C. Cócteles sin receta (los de From Toast).
    const sin = await T.sinReceta();
    console.log('━━ Vendido como cóctel SIN receta en ' + DIAS + ' días: ' + sin.length + ' ━━');
    if (sin.length) console.table(sin.slice(0, 40).map(x => ({ 'en Toast': x.nombre, grupo: x.grupo || '', vendidos: n1(x.vendidos) })));
  };
  console.log('Listo');
})();
