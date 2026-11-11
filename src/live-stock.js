(() => {
  if (window.BarStockLive) return;

  // ── El LIVE: lo que debería haber en la estantería ahora ─────────────
  //
  // Axel, 2026-11-11:
  //
  //   LIVE = contado + lo que llegó − lo vendido en Toast desde el conteo
  //
  // Es un número aparte que se calcula al vuelo: NUNCA se escribe en
  // on_hand, que es lo que alguien contó. Vuelve a empezar en cada conteo.
  // Este módulo sólo lee (tools/test-toast-no-toca-conteo.js lo vigila).
  //
  // ── Lo que llegó ─────────────────────────────────────────────────────
  //
  // "Lo ordenado no cambia nunca; cambia cuánto llegó al casar contra la
  // factura." Cuánto llegó de cada pedido lo decide el MISMO reparto que
  // Orders → Sent (order-receipts.js): si los dos lo calcularan por su
  // lado, uno diría "short" y el otro sumaría la botella entera.
  //
  //   · Un pedido cuya llegada (arrives_at, la siguiente entrega de su
  //     proveedor) cae entre el conteo y ahora: hasta que entra su
  //     factura cuenta lo ordenado; desde la factura, lo que dice ella
  //     (corto, nada o de más). Antes de su hora de llegada, nada.
  //   · Un pedido SIN llegada (su proveedor no tenía horario): sólo lo de
  //     su factura, y sólo si se colocó después del conteo (Axel, opción
  //     a: "no cuenta botellas que quizá no están").
  //   · Un pedido que llegó ANTES del conteo ya estaba en la estantería
  //     al contar: no suma, o se contaría dos veces.
  //   · Lo facturado sin pedido —los recibos que ninguna orden reclamó—
  //     también llegó: suma si la factura es de después del día del
  //     conteo.

  const RC = () => window.BarStockOrderReceipts;

  // ── El cálculo, sin red ──────────────────────────────────────────────
  //
  // o = { master, ordenes, repartido, recibos, conteo, diaConteo, ahora, vendido }
  //   master     [{ item, onHand }]
  //   ordenes    las de order-receipts (con arrives_at y created_at)
  //   repartido  Map orden.id → líneas con pedido / recibido
  //   recibos    los de recibosDe(), ya marcados `usado` por repartir()
  //   conteo     el instante del último conteo (ms)
  //   diaConteo  su día de negocio 'AAAA-MM-DD'
  //   vendido    [{ producto, botellas }] de toast-usage.js
  function calcular(o) {
    const igual = (a, b) => RC().mismoNombre(a, b);
    const ahora = o.ahora == null ? Date.now() : o.ahora;
    const filas = new Map();
    const fila = (item) => {
      let f = filas.get(item);
      if (!f) {
        const m = (o.master || []).find(r => r && igual(r.item, item));
        const nombre = m ? m.item : item;
        f = filas.get(nombre);
        if (!f) {
          f = { producto: nombre, enInventario: !!m, contado: m ? Number(m.onHand) || 0 : 0,
                llego: 0, vendido: 0, de: [], viene: [], llegadas: [] };
          filas.set(nombre, f);
        }
      }
      return f;
    };

    // Todos los productos del inventario, se hayan movido o no: el que
    // no se movió vale lo contado. Inventory los enseña todos.
    for (const m of o.master || []) if (m && m.item) fila(m.item);

    for (const ord of o.ordenes || []) {
      const items = (o.repartido && o.repartido.get(String(ord.id))) || [];
      if (!items.length) continue;
      const conFactura = items.some(i => i.recibido > 0);
      // Su factura es del día del conteo o de antes: llegó antes de
      // contar y ya estaba en la estantería, diga lo que diga su llegada
      // (un pedido que llegó antes de lo previsto, o uno viejo). Sumarlo
      // es contarlo dos veces: el Baileys de la semana pasada salía en
      // "llegó" (Axel, 2026-11-11).
      const ultima = Math.max(0, ...items.map(i => i.ultimaFactura || 0));
      if (conFactura && ultima && new Date(ultima).toISOString().slice(0, 10) <= o.diaConteo) continue;
      const llega = ord.arrives_at ? new Date(ord.arrives_at).getTime() : null;
      const colocada = new Date(ord.created_at).getTime();
      let cuenta;
      if (llega != null) {
        // Todavía no ha llegado: no suma, pero se apunta cuándo llega,
        // para que "cuándo se acaba" lo sume ese día (run-out.js).
        if (llega > ahora && !conFactura) {
          for (const i of items) if (i.pedido) fila(i.item).viene.push({ cuando: new Date(llega).toISOString(), n: i.pedido });
          continue;
        }
        if (!(llega > o.conteo && llega <= ahora)) continue;
        cuenta = conFactura ? 'factura' : 'pedido';
      } else {
        if (!(colocada > o.conteo) || !conFactura) continue;
        cuenta = 'factura';
      }
      // Cuándo llegó: su hora de entrega; sin ella, el día de su factura.
      const cuando = llega != null ? llega : (ultima || colocada);
      for (const i of items) {
        const n = cuenta === 'factura' ? i.recibido : i.pedido;
        if (!n) continue;
        const f = fila(i.item);
        f.llego += n;
        f.de.push((ord.po_number || ord.vendor || 'order') + (cuenta === 'factura' ? ' (invoice)' : ' (ordered)') + ' +' + n);
        // Lo mismo que `de`, para pintarlo: la ficha dice "+5 Arrived ·
        // arrived Tue, LOOP order" y no puede sacarlo de un texto.
        f.llegadas.push({ n, cuando, de: ord.vendor || '' });
      }
    }

    for (const r of o.recibos || []) {
      if (r.usado || !r.qty) continue;
      const dia = r.fecha ? new Date(r.fecha).toISOString().slice(0, 10) : '';
      if (!dia || !(dia > o.diaConteo)) continue;
      const f = fila(r.item);
      f.llego += r.qty;
      f.de.push('invoice ' + (r.factura || '') + ' without order +' + r.qty);
      // Sin pedido no se sabe de qué proveedor: la factura no lo trae.
      f.llegadas.push({ n: r.qty, cuando: r.fecha, de: '' });
    }

    for (const v of o.vendido || []) {
      if (!v || !v.botellas) continue;
      const f = fila(v.producto);
      f.vendido += v.botellas;
    }

    const r2 = (n) => Math.round(n * 100) / 100;
    return [...filas.values()].map(f => Object.assign(f, {
      llego: r2(f.llego), vendido: r2(f.vendido),
      live: r2(f.contado + f.llego - f.vendido),
      // La marca "Live" sólo con algo sumado o restado detrás: si no, es
      // lo contado y decir "Live" sería una afordancia que miente.
      movimiento: f.llego !== 0 || f.vendido !== 0
    })).sort((a, b) => a.producto.localeCompare(b.producto));
  }

  // ── Leer y calcular ──────────────────────────────────────────────────
  async function ahora() {
    const U = window.BarStockToastUsage;
    if (!U) return { estado: 'error', error: 'The Toast usage module is not loaded.' };
    const uso = await U.desdeElConteo();
    // Con un conteo activo se enseña lo contado; sin conteo conocido no
    // hay desde dónde empezar. Se dice tal cual.
    if (uso.estado !== 'listo') return { estado: uso.estado };
    const c = window.BARSTOCK_CONFIG || {};
    const locId = await window.BarStockInventoryCloud.fetchLocationId();
    const datos = await RC().leer({ url: c.SUPABASE_URL, key: c.SUPABASE_KEY, locId });
    const dueno = new Map(datos.manuales.map(m => [String(m.order_id), String(m.vendor_order_id)]));
    const recibos = RC().recibosDe(datos.facturas, datos.enlaces, dueno);
    const C = window.BarStockCycle;
    const ini = C && C.startedAt && C.startedAt();
    const repartido = RC().repartir({ recortadas: datos.recortadas, lineas: datos.lineas, recibos,
      inicioCiclo: ini ? ini.getTime() : 0 });
    const filas = calcular({
      master: (window.state && window.state.master) || [],
      ordenes: datos.recortadas, repartido, recibos,
      conteo: new Date(uso.conteo).getTime(), diaConteo: uso.desde,
      vendido: uso.productos
    });
    return { estado: 'listo', conteo: uso.conteo, desde: uso.desde, dias: uso.dias,
      filas, sinConvertir: uso.sinConvertir };
  }

  window.BarStockLive = { calcular, ahora };
})();
