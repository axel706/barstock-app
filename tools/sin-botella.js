/* ── ¿Qué vende Toast que no se resta de ninguna botella? ─────────────
 *
 * SÓLO LECTURA. No cambia el motor ni escribe nada. Lee lo vendido con
 * la MISMA cuenta del LIVE (toast-usage.ventasDesde) y enseña lo que
 * esa cuenta no pudo pasar a botellas, con su motivo, y lo marcado como
 * "no es del inventario" (toast_item_links con status 'ignored'), con lo
 * que vendió.
 *
 *   1. Abre app.barstockpro.com en la locación.
 *   2. Consola. Pega este archivo entero y Enter.
 *   3. (async () => { await bsSinBotella(); })();
 *
 * Por qué existe (Axel, 2026-11-19): a Kentucky Tavern, Pedro Morales y
 * Cinzano Sweet les faltan unas 3 botellas CADA semana entre lo que
 * dicen los conteos y lo que resta Toast, haya open bar o no
 * (bsOpenBar: r ≈ 0; bsOpenBarDias: los tragos del open bar sí entran,
 * ~2.2 de más por invitado). Una diferencia fija apunta a algo que se
 * vende siempre y no se resta: un "Well Bourbon" o un "Tequila Shot" sin
 * botella. La lista de "From Toast" de Recipes no lo enseña: deja fuera
 * lo que cuelga del grupo "Liquor" (el licor solo).
 */
(() => {
  const DIAS = 30;
  const n1 = (x) => (Math.round((Number(x) || 0) * 10) / 10).toFixed(1).replace(/\.0$/, '');
  const masDias = (d, k) => new Date(Date.parse(d + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10);

  window.bsSinBotella = async function () {
    const U = window.BarStockToastUsage, R = window.BarStockRest;
    if (!U || !R) { console.log('Faltan módulos (¿app sin recargar?): ToastUsage o Rest.'); return; }
    const desde = masDias(new Date().toISOString().slice(0, 10), -DIAS);
    const h = await U.ventasDesde(desde);
    // De cada nombre de Toast, su categoría de venta y su grupo del menú.
    const info = new Map();
    for (const v of h.ventas || []) {
      const n = String(v.toast_item_name || '').trim();
      if (n && !info.has(n)) info.set(n, { cat: v.sales_category || '', grupo: v.toast_group || '' });
    }

    // A. Lo que la cuenta del LIVE no pudo convertir (sin el paquete de
    //    open bar, que son personas y no tragos: ya se sabe).
    const sin = (h.sinConvertir || []).filter(x => !/banquet/i.test((info.get(x.nombre) || {}).cat || ''));
    const licor = (x) => /liquor|spirit|cocktail/i.test((info.get(x.nombre) || {}).cat || '');
    const fila = (x) => ({ 'en Toast': x.nombre, vendidos: n1(x.unidades), categoria: (info.get(x.nombre) || {}).cat || '',
      grupo: (info.get(x.nombre) || {}).grupo || '', motivo: x.motivo });
    const deLicor = sin.filter(licor), otros = sin.filter(x => !licor(x));
    console.log('Toast desde ' + desde + ' (' + DIAS + ' días)');
    console.log('━━ A. Licor y cócteles que NO se restan de ninguna botella: ' + deLicor.length + ' ━━');
    if (deLicor.length) console.table(deLicor.map(fila));
    console.log('━━ A2. Lo demás que no se resta (vino, cerveza…): ' + otros.length + ' ━━');
    if (otros.length) console.table(otros.slice(0, 30).map(fila));

    // B. Lo marcado como "no es del inventario", con lo que vendió.
    const loc = await window.BarStockInventoryCloud.fetchLocationId();
    const ign = await R.leerTodo('toast_item_links?location_id=eq.' + loc + '&status=eq.ignored&select=toast_item_guid,kind&order=id.asc');
    const guids = new Map(ign.map(e => [e.toast_item_guid, e.kind]));
    const por = new Map();
    for (const v of h.ventas || []) {
      if (!guids.has(v.toast_item_guid)) continue;
      const n = String(v.toast_item_name || '').trim();
      const x = por.get(n) || { nombre: n, unidades: 0, cat: v.sales_category || '', grupo: v.toast_group || '', kind: guids.get(v.toast_item_guid) };
      x.unidades += Number(v.quantity) || 0;
      por.set(n, x);
    }
    const marcados = [...por.values()].sort((a, b) => b.unidades - a.unidades);
    console.log('━━ B. Marcado "no es del inventario" (Not in inventory / Not a drink) y vendido: ' + marcados.length + ' ━━');
    if (marcados.length) console.table(marcados.map(x => ({ 'en Toast': x.nombre, vendidos: n1(x.unidades), categoria: x.cat, grupo: x.grupo, marcado: x.kind })));
  };
  console.log('Listo');
})();
