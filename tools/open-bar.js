/* ── ¿Lo que falta en la casa es el open bar? ─────────────────────────
 *
 * SÓLO LECTURA. Lee lo vendido en Toast con la misma lectura del LIVE
 * (toast-usage.ventasDesde: las botellas de cada producto por día, y
 * las filas de "Banquet Beverage") y lo usado de cada semana según los
 * conteos (inventory_snapshots, con la regla de product-weeks.usadoDe).
 * No escribe nada.
 *
 *   1. Abre app.barstockpro.com en la locación.
 *   2. Consola. Pega este archivo entero y Enter.
 *   3. (async () => { await bsOpenBar(); })();
 *      (async () => { await bsOpenBar(['Tito', 'Triage Vodka']); })();
 *
 * Por qué existe (Axel, 2026-11-19): con botellas de 1 L, a los licores
 * de la casa les faltan 2–4 botellas por semana entre lo que restan sus
 * recetas y lo que dicen los conteos (Kentucky Tavern 5.9 contra 9.6,
 * Pedro Morales 2.0 contra 5.2…). Axel confirmó que el open bar los usa,
 * y Toast cobra el open bar como "Banquet Beverage", por persona, sin
 * decir qué se sirvió: el LIVE no lo resta. Pero lo que falta podría
 * ser también servir de más o merma. Se distinguen así:
 *
 *   · si es el open bar, lo que falta sube y baja con los invitados de
 *     open bar de cada semana;
 *   · si es servir de más o merma, falta más o menos lo mismo cada
 *     semana, haya eventos o no.
 *
 * Por producto, una recta por las semanas: falta = base + por invitado ×
 * invitados. "Base" es lo que falta sin open bar; "por invitado", las
 * botellas de ese producto que se lleva cada invitado de open bar; "r",
 * cuánto se parecen las dos columnas (cerca de 1: van juntas; cerca de
 * 0: no tienen que ver). Con pocas semanas, un evento raro la tuerce:
 * mira la tabla de semanas antes de creerla.
 *
 * Las semanas: la de un lunes M va del lunes M al domingo M+6 (el
 * conteo del domingo por la noche la cierra; cycleWeekFor). Sólo las
 * semanas cerradas (con `used`) y con sus siete días de Toast cargados.
 * Las semanas marcadas de evento ENTRAN aquí (Pour·IQ las deja fuera),
 * porque son justo las que importan.
 */
(() => {
  const POR_DEFECTO = ['Kentucky Tavern', 'Pedro Morales', 'Triple Sec', 'Cinzano Sweet',
    'Smirnoff Vanilla', 'Kamora'];
  const n1 = (x) => x == null || !isFinite(x) ? '—' : (Math.round(x * 10) / 10).toFixed(1);
  const n2 = (x) => x == null || !isFinite(x) ? '—' : (Math.round(x * 100) / 100).toFixed(2);
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const masDias = (d, k) => new Date(Date.parse(d + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10);

  // Recta por mínimos cuadrados: y = a + b·x, y la correlación.
  function recta(xs, ys) {
    const n = xs.length;
    if (n < 3) return null;
    const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    if (!(sxx > 0)) return { a: my, b: null, r: null, n };
    const b = sxy / sxx;
    return { a: my - b * mx, b, r: syy > 0 ? sxy / Math.sqrt(sxx * syy) : null, n };
  }

  window.bsOpenBar = async function (lista) {
    const U = window.BarStockToastUsage, R = window.BarStockRest, PW = window.BarStockProductWeeks, W = window.BarStockWeek;
    if (!U || !R || !PW || !PW.usadoDe || !W) { console.log('Faltan módulos (¿app sin recargar?): ToastUsage, Rest, ProductWeeks.usadoDe o Week.'); return; }
    const master = ((window.state && window.state.master) || []).filter(r => r && r.item);
    const buscar = lista && lista.length ? lista : POR_DEFECTO;
    const productos = [];
    for (const q of buscar) {
      const hay = master.filter(r => norm(r.item).includes(norm(q)));
      if (!hay.length) console.log('Ningún producto contiene "' + q + '".');
      else { if (hay.length > 1) console.log('"' + q + '": varios, uso el primero:', hay.map(r => r.item)); productos.push(hay[0].item); }
    }
    if (!productos.length) return;

    // Toast: 13 semanas, la misma lectura que el LIVE.
    const desde = masDias(new Date().toISOString().slice(0, 10), -95);
    const h = await U.ventasDesde(desde);
    const cargado = new Set((h.dias || []).filter(d => d && d.complete && d.closed).map(d => d.business_date));
    const porProd = new Map((h.productos || []).map(p => [p.producto, p]));
    // El open bar de cada día: invitados (quantity) y dinero (net).
    const banq = {};
    for (const v of h.ventas || []) {
      if (!/banquet/i.test(String(v.sales_category || ''))) continue;
      const b = banq[v.business_date] || (banq[v.business_date] = { inv: 0, net: 0 });
      b.inv += Number(v.quantity) || 0;
      b.net += Number(v.net) || 0;
    }

    // Los conteos: lo usado de cada semana cerrada.
    const loc = await window.BarStockInventoryCloud.fetchLocationId();
    const fotos = await R.leerTodo('inventory_snapshots?location_id=eq.' + loc + '&week_start=gte.' + desde +
      '&item_name=in.(' + productos.map(p => '"' + p.replace(/"/g, '\\"') + '"').map(encodeURIComponent).join(',') + ')' +
      '&used=not.is.null&select=week_start,item_name,used,on_hand_start,ordered,on_hand_end_adjusted,is_event_week&order=week_start.asc');

    // Las semanas que se pueden comparar: cerradas y con los 7 días de Toast.
    const semanas = [...new Set(fotos.map(f => f.week_start))].sort()
      .filter(ws => [0, 1, 2, 3, 4, 5, 6].every(k => cargado.has(masDias(ws, k))));
    if (!semanas.length) { console.log('No hay semanas cerradas con los siete días de Toast cargados.'); return; }
    const evento = new Set(fotos.filter(f => f.is_event_week).map(f => f.week_start));
    const invDe = (ws) => [0, 1, 2, 3, 4, 5, 6].reduce((s, k) => s + ((banq[masDias(ws, k)] || {}).inv || 0), 0);
    const netDe = (ws) => [0, 1, 2, 3, 4, 5, 6].reduce((s, k) => s + ((banq[masDias(ws, k)] || {}).net || 0), 0);

    console.log('━━ Open bar por semana (Toast "Banquet Beverage") ━━');
    console.table(semanas.map(ws => ({ semana: ws, invitados: n1(invDe(ws)), '$ open bar': Math.round(netDe(ws)), 'marcada evento': evento.has(ws) ? 'sí' : '' })));

    const resumen = [];
    for (const item of productos) {
      const P = porProd.get(item);
      const filas = [];
      for (const ws of semanas) {
        const f = fotos.find(x => x.week_start === ws && x.item_name === item);
        if (!f) continue;
        const usado = PW.usadoDe(f);
        const toast = [0, 1, 2, 3, 4, 5, 6].reduce((s, k) => s + ((P && P.porDia && P.porDia[masDias(ws, k)]) || 0), 0);
        filas.push({ semana: ws, invitados: invDe(ws), conteos: usado, toast, falta: usado - toast });
      }
      console.log('━━ ' + item + ' ━━');
      if (!filas.length) { console.log('  Sin semanas comparables.'); continue; }
      console.table(filas.map(x => ({ semana: x.semana, invitados: n1(x.invitados), 'conteos (usado)': n1(x.conteos), 'Toast (recetas)': n1(x.toast), falta: n1(x.falta) })));
      const ajuste = recta(filas.map(x => x.invitados), filas.map(x => x.falta));
      const media = filas.reduce((s, x) => s + x.falta, 0) / filas.length;
      resumen.push({ producto: item, semanas: filas.length, 'falta/sem': n1(media),
        base: ajuste ? n1(ajuste.a) : '—', 'por invitado': ajuste && ajuste.b != null ? n2(ajuste.b) : '—',
        'por 100 invitados': ajuste && ajuste.b != null ? n1(ajuste.b * 100) : '—', r: ajuste && ajuste.r != null ? n2(ajuste.r) : '—' });
    }
    console.log('━━ Resumen: falta = base + por invitado × invitados ━━');
    console.table(resumen);
  };
  console.log('Listo');
})();
