/* ── Toast: ¿qué contesta? ────────────────────────────────────────────
 *
 * SÓLO LECTURA. Llama a /api/integrations?provider=toast y escribe en la consola. No toca nada,
 * ni en Supabase ni en Toast.
 *
 * Cómo se usa:
 *   1. Abre app.barstockpro.com con tu sesión (cualquier locación).
 *   2. Consola del navegador.
 *   3. Pega este archivo entero y Enter.
 *   4. Llama, en este orden:
 *        await bsToast('ping')         ¿funciona el login?
 *        await bsToast('restaurant')   ¿el GUID es de verdad Crown?
 *        await bsToast('menu')         cuántos artículos y una muestra
 *        await bsToast('orders')       las ventas de ayer, resumidas
 *        await bsToast('orders', { businessDate: '20261101' })   otro día
 *        await bsToast('drinks')       lo vendido ayer, el día entero, por
 *                                      categoría de venta, con modificadores
 *        await bsToast('drinks', { categoria: 'liquor' })   una categoría,
 *                                      con más artículos
 *        await bsToast('drinks', { businessDate: '20261101' })   otro día
 *
 *   Y el DINERO vendido, por categoría de venta:
 *        await bsToastVentas()                  hoy, todas las categorías
 *        await bsToastVentas('liquor')          hoy, sólo licor
 *        await bsToastVentas('liquor', '20261109')   otro día
 *   Tres cifras por categoría: bruto (antes de descuentos), neto (después,
 *   sin impuesto) e impuesto. Los modificadores con precio van aparte:
 *   compara el neto con el informe de ventas de Toast para ver si ya los
 *   incluye. Hoy sigue abierto: la cifra crece mientras se vende.
 *
 *   Y para cargar lo vendido día por día (la base del inventario en vivo):
 *        await bsToastHistoria(7)      los últimos 7 días
 *        await bsToastHistoria(365)    el año entero, del más nuevo al
 *                                      más viejo; se salta lo ya cargado
 *        await bsToastHistoria(7, { otraVez: true })   vuelve a cargar
 *                                      también lo ya cargado
 *        bsToastParar = true           lo para después del día en curso
 *
 *        await bsLive()                el LIVE: contado + llegó − vendido
 *        await bsToastUso()            lo vendido desde el conteo, en
 *                                      botellas por producto (sólo lee)
 *   Ésta SÍ escribe, pero sólo en toast_sales y toast_sales_days, y lo
 *   hace la función de Vercel, no el navegador. Hay que estar en la
 *   locación ligada a Toast (Crown); en otra, Toast dice que no.
 *
 * Cada una devuelve el objeto y además lo imprime. Si algo falla, lo que
 * sale es lo que dijo Toast o lo que le falta a la función, tal cual.
 */
(() => {
  window.bsToast = async function (accion, params) {
    const S = window.BarStockSupabase;
    if (!S || !S.getClient) {
      console.warn('No encuentro la sesión de la app. ¿Estás en app.barstockpro.com y con la sesión iniciada?');
      return null;
    }
    const { data } = await S.getClient().auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) {
      console.warn('No hay sesión iniciada. Entra en la app y vuelve a probar.');
      return null;
    }

    const r = await fetch('/api/integrations?provider=toast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action: accion || 'ping', params: params || {} })
    });
    let j;
    try { j = await r.json(); }
    catch (e) { j = { ok: false, status: r.status, error: 'La función no devolvió JSON (¿está desplegada?).' }; }

    console.log('%cToast · ' + (accion || 'ping') + (j.ok ? ' · ok' : ' · falló'),
      'font-weight:bold;color:' + (j.ok ? '#16a34a' : '#dc2626'));
    console.log(j);
    return j;
  };

  // El dinero vendido en un día, por categoría de venta. Sin fecha, HOY:
  // es lo que pidió Axel (2026-11-10), "las ventas de licor del día, en
  // dinero". En tabla, que es como se lee una cuenta.
  window.bsToastVentas = async function (categoria, fecha) {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
    const params = { businessDate: /^\d{8}$/.test(String(fecha || '')) ? String(fecha) : hoy };
    if (categoria) params.categoria = String(categoria);
    const j = await window.bsToast('sales', params);
    if (!j || !j.ok) return j;
    const fila = (c) => ({ categoria: c.categoria || 'TOTAL', unidades: c.unidades, bruto: c.bruto,
      descuentos: c.descuentos, neto: c.neto, impuesto: c.impuesto, modificadores: c.modificadores });
    console.table(j.porCategoria.map(fila).concat([fila(j.total)]));
    if (!j.cerrado) console.log('El día ' + j.businessDate + ' sigue abierto: esto es lo vendido hasta ahora.');
    if (!j.diaCompleto) console.warn('OJO: el día tiene más órdenes de las que se leyeron. Esto NO es el total.');
    if (j.total.sinPrecio) console.warn(j.total.sinPrecio + ' líneas vinieron sin precio y no están sumadas.');
    return j;
  };

  // Un día por llamada: un día de Crown son varias páginas de órdenes, y
  // Vercel corta la función que tarda demasiado. Uno detrás de otro, no
  // en paralelo: Toast limita la velocidad.
  // `{ otraVez: true }` vuelve a cargar también lo ya cargado: si cambia
  // qué se guarda, los días viejos se quedarían sin lo nuevo.
  window.bsToastHistoria = async function (dias, op) {
    op = op || {};
    dias = Math.max(1, Math.min(400, Number(dias) || 7));
    window.bsToastParar = false;
    const C = window.BarStockInventoryCloud;
    const locationId = C && C.fetchLocationId ? await C.fetchLocationId() : null;
    if (!locationId) { console.warn('No encuentro la locación abierta.'); return null; }

    // Los días de negocio, de ayer hacia atrás, más hoy (que sigue abierto).
    const fmt = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
    const lista = [];
    for (let i = 0; i <= dias; i++) lista.push(fmt(Date.now() - i * 864e5));

    // Lo que ya está cargado, completo y cerrado no se vuelve a pedir.
    const { data, error } = await window.BarStockSupabase.getClient()
      .from('toast_sales_days').select('business_date,complete,closed')
      .eq('location_id', locationId).gte('business_date', lista[lista.length - 1]).limit(1000);
    if (error) { console.warn('Supabase dijo:', error.message); return null; }
    const hecho = new Set((data || []).filter(d => d.complete && d.closed).map(d => d.business_date));
    const faltan = op.otraVez ? lista : lista.filter(d => !hecho.has(d));
    console.log(faltan.length + ' días por cargar de ' + lista.length + ' (' + hecho.size + ' ya estaban).');

    // Las categorías se juntan de TODOS los días: la primera versión
    // enseñaba sólo las del primero, y así no salió "Banquet Beverage",
    // que sólo aparece los días con evento.
    const guardadas = new Set(), fuera = new Set();
    const res = { cargados: 0, filas: 0, incompletos: [], categorias: null };
    for (let i = 0; i < faltan.length; i++) {
      if (window.bsToastParar) { console.log('Parado. Lo cargado se queda.'); break; }
      const d = faltan[i];
      const S = window.BarStockSupabase;
      const { data: ses } = await S.getClient().auth.getSession();
      const token = ses && ses.session && ses.session.access_token;
      const r = await fetch('/api/integrations?provider=toast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'sync', params: { businessDate: d.replace(/-/g, ''), locationId } })
      });
      let j; try { j = await r.json(); } catch (e) { j = { ok: false, error: 'HTTP ' + r.status + ' sin JSON' }; }
      if (!j.ok) {
        console.warn('Se paró en ' + d + '. Lo de antes quedó guardado. Toast o la base dijeron:', j);
        break;
      }
      res.cargados++; res.filas += j.filas;
      if (!j.diaCompleto) res.incompletos.push(d);
      for (const c of (j.categorias && j.categorias.guardadas) || []) guardadas.add(c);
      for (const c of (j.categorias && j.categorias.fuera) || []) fuera.add(c);
      console.log((i + 1) + '/' + faltan.length + '  ' + d + '  · ' + j.ordenes + ' órdenes · ' + j.filas + ' filas' +
        (j.diaCompleto ? '' : ' · INCOMPLETO (demasiadas órdenes)'));
    }
    res.categorias = { guardadas: [...guardadas].sort(), fuera: [...fuera].sort() };
    console.log('Se guardó como bebida: ' + (res.categorias.guardadas.join(', ') || '(nada)') +
      '  ·  Fuera: ' + (res.categorias.fuera.join(', ') || '(nada)'));
    console.log('%cHistoria de Toast', 'font-weight:bold');
    console.log(res);
    return res;
  };

  // Lo vendido en Toast desde el último conteo, en botellas por producto
  // (src/toast-usage.js, el motor del "deberías tener"). Sólo lee. Es para
  // compararlo con la barra antes de enseñarlo en la app.
  window.bsToastUso = async function () {
    const U = window.BarStockToastUsage;
    if (!U) { console.warn('Esta versión de la app no tiene el motor. Recarga la página.'); return null; }
    const r = await U.desdeElConteo();
    if (r.estado === 'contando') { console.log('Hay un conteo activo: no se estima nada hasta cerrarlo.'); return r; }
    if (r.estado === 'sinConteo') { console.log('No encuentro cuándo fue el último conteo.'); return r; }
    console.log('Último conteo: ' + new Date(r.conteo).toLocaleString() + '  ·  se descuenta desde el ' + r.desde +
      ' (el día del conteo no)  ·  días cargados: ' + (r.dias.map(d => d.business_date).join(', ') || 'ninguno'));
    console.table(r.productos.map(p => ({ producto: p.producto, botellas: Math.round(p.botellas * 100) / 100,
      desde: Object.keys(p.de).join(', ') })));
    if (r.sinConvertir.length) {
      console.log('%cLo que no se pudo convertir:', 'font-weight:bold');
      console.table(r.sinConvertir);
    }
    return r;
  };

  // El LIVE por producto (src/live-stock.js): contado + lo que llegó −
  // lo vendido en Toast desde el conteo. Sólo lee. Enseña sólo lo que se
  // movió; `todos` enseña el inventario entero.
  window.bsLive = async function (todos) {
    const L = window.BarStockLive;
    if (!L) { console.warn('Esta versión de la app no tiene el LIVE. Recarga la página.'); return null; }
    const r = await L.ahora();
    if (r.estado !== 'listo') { console.log(r.estado === 'contando' ? 'Hay un conteo activo: se enseña lo contado.' : 'Sin LIVE: ' + (r.error || r.estado)); return r; }
    console.log('Último conteo: ' + new Date(r.conteo).toLocaleString() + '  ·  ventas desde el ' + r.desde + ' (el día del conteo no)');
    console.table(r.filas.filter(f => todos || f.movimiento).map(f => ({ producto: f.producto, contado: f.contado,
      llegó: f.llego, vendido: f.vendido, LIVE: f.live, de: f.de.join(' · ') })));
    return r;
  };

  // Cuándo se acaba cada producto (src/run-out.js). Sólo lee. Enseña lo
  // que se acaba en las próximas dos semanas, lo más pronto arriba.
  window.bsSeAcaba = async function () {
    const R = window.BarStockRunOut;
    if (!R) { console.warn('Esta versión de la app no tiene "cuándo se acaba". Recarga la página.'); return null; }
    const r = await R.ahora();
    if (r.estado !== 'listo') { console.log('Sin cálculo: ' + (r.error || r.estado)); return r; }
    const D = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    console.log('Hoy ' + r.hoy + ' · días cargados por día de la semana: ' + r.muestras.map((n, i) => D[i] + ' ' + n).join(', ') +
      (r.suficiente ? '' : ' · NO hay historia suficiente (4 de cada día)'));
    console.table(r.filas.filter(f => f.agota).sort((a, b) => a.enDias - b.enDias).map(f => ({ producto: f.producto, LIVE: f.live,
      'se acaba': f.agota, 'en días': f.enDias, 'gasto dom→sáb': f.med.map(x => Math.round(x * 10) / 10).join(' '),
      viene: f.viene.map(v => v.n + ' el ' + v.cuando.slice(0, 10)).join(', ') })));
    return r;
  };

  console.log('Listo. Empieza por:  await bsToast("ping")');
})();
