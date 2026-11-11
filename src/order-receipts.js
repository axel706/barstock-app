(() => {
  if (window.BarStockOrderReceipts) return;

  // ── Cuánto llegó de cada pedido: el reparto factura ↔ pedido ─────────
  //
  // Vivía dentro de Orders → Sent (mobile-history.js), que es quien dice
  // "short", "waiting" o "all in". El LIVE necesita exactamente lo mismo
  // —cuánto llegó de lo ordenado— y, si lo calculara aparte, Sent y el
  // LIVE acabarían diciendo cosas distintas sobre si una botella llegó
  // (Axel, 2026-11-11: "lo ordenado no cambia nunca; cambia cuánto llegó
  // al casar contra la factura"). Por eso está aquí, una vez, y lo usan
  // los dos. El reparto no se ha tocado al moverlo: sus comentarios de
  // por qué es así siguen con él.
  //
  // tools/diagnostico-waiting.js tiene su propia copia, porque se pega en
  // la consola y no carga módulos.

  const PAGINA = 1000;
  // Las órdenes que se reparten: las más recientes. El LIVE sólo mira
  // las de desde el último conteo, que caben de sobra.
  const MAX_ORDENES = 300;

  // Se usa la misma normalización que el emparejado —sin acentos, sin
  // apóstrofes, sin signos— para que una sola definición de "el mismo
  // nombre" valga en toda la app.
  function norm(x) {
    const M = window.BarStockMarginEdgeMatch;
    if (M && M._norm) { try { return M._norm(x); } catch (e) {} }
    return String(x == null ? '' : x)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/['‘’´`]/g, '')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  }
  const mismoNombre = (a, b) => norm(a) === norm(b);

  // PostgREST corta en 1000 filas sin avisar.
  async function leerTodo(url, key, ruta) {
    let todas = [];
    for (let desde = 0; desde < 40000; desde += PAGINA) {
      const r = await fetch(`${url}/rest/v1/${ruta}&limit=${PAGINA}&offset=${desde}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!r.ok) throw new Error(await r.text());
      const t = await r.json();
      if (!Array.isArray(t) || !t.length) break;
      todas = todas.concat(t);
      if (t.length < PAGINA) break;
    }
    return todas;
  }

  // ── Leer lo que hace falta para repartir ─────────────────────────────
  //
  // Sólo lee. El enlace automático (invoice-order-auto.js), que sí
  // escribe, lo sigue llamando Sent con lo que esto devuelve; el LIVE no
  // lo llama: mirar no puede cambiar nada.
  async function leer({ url, key, locId }) {
    // Con la llegada (033). Si la base aún no la tiene, se pide sin ella:
    // Sent no puede quedarse vacío por eso. Sólo si Supabase nombra la
    // columna (orders-cloud.js decide eso); con otro error, se dice.
    const BASE = 'id,app_order_id,vendor,po_number,created_at,subtotal,status';
    const pedirOrdenes = (cols) => leerTodo(url, key,
      `vendor_orders?location_id=eq.${locId}` +
      `&select=${cols}` +
      `&order=created_at.desc`);
    let ordenes;
    try { ordenes = await pedirOrdenes(BASE + ',arrives_at'); }
    catch (e) {
      const falta = window.BarStockOrdersFaltaColumna;
      if (!(falta && falta(e && e.message))) throw e;
      ordenes = await pedirOrdenes(BASE);
    }

    const recortadas = ordenes.slice(0, MAX_ORDENES);
    await completarLlegadas(recortadas);
    const ids = recortadas.map(o => o.id).filter(Boolean);

    const lineas = ids.length ? await leerTodo(url, key,
      `vendor_order_items?vendor_order_id=in.(${ids.join(',')})` +
      `&select=vendor_order_id,item_name,quantity,unit_price&order=item_name.asc`) : [];

    // Lo recibido. Si MarginEdge no está conectado esto viene vacío y
    // todo queda en "waiting", que es la verdad: no sabemos.
    let facturas = [], enlaces = [];
    try {
      facturas = await leerTodo(url, key,
        `marginedge_invoice_lines?location_id=eq.${locId}` +
        `&select=order_id,product_id,quantity,unit_price,invoice_date,invoice_number,vendor_name` +
        `&order=order_id.asc`);
      enlaces = await leerTodo(url, key,
        `marginedge_links?location_id=eq.${locId}` +
        `&select=product_id,item_name&order=product_id.asc`);
    } catch (e) { /* sin MarginEdge el historial sigue en pie */ }

    // ── Las facturas que alguien enlazó a mano ──────────────────────
    //
    // Tabla opcional: su SQL se corre a mano (migración 022). Si no
    // está, esto queda vacío y todo casa como siempre.
    let manuales = [];
    try {
      manuales = await leerTodo(url, key,
        `invoice_order_links?location_id=eq.${locId}` +
        `&select=order_id,vendor_order_id&order=order_id.asc`);
    } catch (e) { /* sin la tabla, sólo el emparejamiento automático */ }

    return { ordenes, recortadas, lineas, facturas, enlaces, manuales };
  }

  // ── La llegada de los pedidos que no la guardaron ────────────────────
  //
  // arrives_at se guarda desde 2026-11-11 (033). Los pedidos de antes no
  // la tienen, y el LIVE los trataba como de un proveedor SIN horario:
  // sólo sumaban con su factura. Axel recogió el pedido de LOOP el martes
  // por la mañana, su factura aún no había entrado, y el LIVE decía que
  // no había llegado nada: "loop ya llegó, sólo falta su factura".
  //
  // Si el proveedor SÍ tiene horario, la llegada se calcula al leer, con
  // la misma regla que al guardar (la siguiente entrega después de
  // colocarlo). No se escribe: es lo que se habría guardado. Sólo para
  // pedidos recientes —este ciclo y la semana anterior—: a uno de hace
  // meses no se le aplica el horario de hoy, que pudo ser otro.
  //
  // Sin horario del proveedor se queda sin llegada, y entonces sí vale la
  // regla de la opción a.
  async function completarLlegadas(ordenes) {
    const VD = window.BarStockVendorDelivery, V = window.BarStockVendorDefaults;
    const C = window.BarStockCycle;
    const ini = C && C.startedAt && C.startedAt();
    const desde = (ini ? ini.getTime() : Date.now()) - 7 * 864e5;
    const faltan = (ordenes || []).filter(o => !o.arrives_at && new Date(o.created_at).getTime() >= desde);
    if (!faltan.length || !VD || !VD.siguienteEntrega || !V || !V.getAllDefaults) return;
    let horarios = [];
    try { horarios = (await V.getAllDefaults()) || []; } catch (e) { return; }
    const de = new Map(horarios.filter(Boolean).map(f => [String(f.vendor || '').trim().toUpperCase(), f]));
    for (const o of faltan) {
      const t = VD.siguienteEntrega(de.get(String(o.vendor || '').trim().toUpperCase()), o.created_at);
      if (t) { o.arrives_at = t; o.llegadaCalculada = true; }
    }
  }

  // factura → recibos por artículo. `dueno` es factura → orden (los
  // enlaces a mano y los automáticos).
  function recibosDe(facturas, enlaces, dueno) {
    const deQuien = new Map((enlaces || []).map(e => [String(e.product_id), e.item_name || '']));
    // Recibido por artículo y por día. La orden reclama lo recibido
    // desde su fecha en adelante: una factura anterior pertenece a una
    // orden anterior.
    const recibos = [];
    for (const f of facturas || []) {
      const item = deQuien.get(String(f.product_id));
      if (!item) continue;
      recibos.push({
        item,
        // De qué factura sale, y si esa factura está reservada para una
        // orden concreta. Sin esto el reparto no puede distinguir "este
        // recibo es de cualquiera" de "este es de esa orden y de nadie
        // más".
        factId: String(f.order_id || ''),
        reservado: (dueno && dueno.get(String(f.order_id || ''))) || '',
        qty: Number(f.quantity) || 0,
        // Lo que de verdad costó. Sin esto, "Received" multiplicaba lo
        // recibido por el precio de TU catálogo: una orden de $55.78
        // en la factura aparecía como $71.98 recibidos.
        precio: Number(f.unit_price) || 0,
        fecha: f.invoice_date ? new Date(f.invoice_date).getTime() : 0,
        factura: f.invoice_number || ''
      });
    }
    return recibos;
  }

  // ── El reparto ───────────────────────────────────────────────────────
  //
  // `recortadas`: de la más NUEVA a la más vieja (así llegan de leer()).
  // Devuelve un Map orden.id → sus líneas con lo recibido. Marca en cada
  // recibo `usado`: los que quedan sin usar son entregas que ninguna
  // orden reclamó (lo comprado sin pedido).
  function repartir({ recortadas, lineas, recibos, inicioCiclo }) {
    const porOrden = new Map();
    for (const l of lineas || []) {
      const k = String(l.vendor_order_id);
      if (!porOrden.has(k)) porOrden.set(k, []);
      porOrden.get(k).push(l);
    }

    // ── El suelo es el CICLO, no la fecha de la orden ───────────────
    //
    // Antes una orden sólo reclamaba entregas posteriores a su propia
    // fecha, con un día de margen. Y eso da por supuesto que primero
    // se pide y después llega, que no es como funciona:
    //
    // Con LOOP se pide en su portal, la mercancía llega, y la orden se
    // registra en la app cuando toca. Una factura del 30 con la orden
    // apuntada el 1 se quedaba fuera por dos días, y la orden decía
    // "waiting" con la factura delante.
    //
    // Dentro de una semana los documentos no se ordenan. El criterio
    // es el mismo que usa la conciliación del escritorio: por artículo
    // DENTRO DEL CICLO.
    //
    // ── El reparto sigue yendo de la más NUEVA a la más vieja ───────
    //
    // Lo cambié a "de la más vieja a la más nueva" pensando en que dos
    // órdenes del mismo artículo no se pisaran, y rompí el historial
    // entero: una orden de hace meses conserva su suelo viejo —su
    // fecha menos un día— así que puede reclamar CUALQUIER factura
    // posterior. Al pasar primero, se comió las de este mes y todo lo
    // reciente quedó en "waiting".
    //
    // `recortadas` viene de la más nueva a la más vieja y así se
    // queda: las recientes eligen primero, que es lo que hacía que
    // esto funcionara.
    const resultado = new Map();
    for (const o of recortadas || []) {
      const ls = porOrden.get(String(o.id)) || [];
      const t0 = new Date(o.created_at).getTime();
      // Lo ÚNICO que cambia respecto a siempre: dentro del ciclo
      // abierto el suelo es su arranque, para que una factura anterior
      // a la orden —una ida a la tienda apuntada después— también
      // cuente. Fuera del ciclo, el criterio de siempre.
      const suelo = (inicioCiclo && t0 >= inicioCiclo) ? inicioCiclo : (t0 - 86400000);

      const items = ls.map(l => {
        const pedido = Number(l.quantity) || 0;
        let llegado = 0;
        let dinero = 0;
        let conPrecio = false;
        let precioFactura = 0;
        let factura = '';
        for (const r of recibos) {
          if (r.usado) continue;
          if (!mismoNombre(r.item, l.item_name)) continue;

          // ── Un enlace a mano gana sobre todas las reglas ──────────
          //
          // Lo dijo quien estuvo ahí: esta factura es de esta orden.
          // Así que ni el proveedor ni la fecha pueden desmentirlo, y
          // ninguna otra orden puede llevarse estos recibos aunque
          // pase antes por ser más nueva.
          //
          // Es el caso de Crown: se pide en el portal de LOOP, se va a
          // la tienda, y la factura llega a nombre de Fine Wine. Son
          // el mismo pedido y la app no tiene cómo saberlo sola.
          if (r.reservado) {
            if (r.reservado !== String(o.id)) continue;   // de otra orden
          } else if (r.fecha && r.fecha < suelo) {
            continue;   // sin enlace, el criterio de siempre
          }

          if (llegado >= pedido) break;
          llegado += r.qty;
          // El dinero sale de la FACTURA, no del catálogo. Si una
          // línea viene sin precio se cae al tuyo para esa línea: un
          // cero ahí restaría del total y diría que llegó más barato
          // de lo que llegó.
          if (r.precio > 0) { dinero += r.qty * r.precio; conPrecio = true; precioFactura = r.precio; }
          else { dinero += r.qty * (Number(l.unit_price) || 0); }
          if (!factura && r.factura) factura = r.factura;
          r.usado = true;
        }
        return {
          item: l.item_name || '',
          pedido,
          recibido: llegado,
          precio: Number(l.unit_price) || 0,
          dinero,
          conPrecio,
          precioFactura,
          factura
        };
      });
      resultado.set(String(o.id), items);
    }
    return resultado;
  }

  window.BarStockOrderReceipts = { leer, recibosDe, repartir, leerTodo, norm, mismoNombre, MAX_ORDENES, PAGINA };
})();
