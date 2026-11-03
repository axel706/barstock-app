(() => {
  if (window.BarStockInvoiceOrderAuto) return;

  // ── Qué factura es de qué orden, decidido una sola vez ───────────────
  //
  // Hoy no existe la idea de "esta factura es de esta orden". El
  // reparto va LÍNEA POR LÍNEA: recorre las órdenes de la más nueva a
  // la más vieja y el primero que pide un recibo se lo queda. Funciona
  // casi siempre, pero no se sostiene:
  //
  //   Registras una orden nueva de Fine Wine. Por ser la más reciente
  //   pasa primera, se lleva los recibos de Tito's que tenía la
  //   anterior, y la anterior vuelve a decir "waiting". No se rompió
  //   nada: el reparto se recalculó y gano otra.
  //
  // Eso es lo que él describe como "se hace automáticamente, hacemos
  // cambios y se quita, se vuelve a hacer, se quita".
  //
  // ── Lo que hace esto, y lo que NO hace ───────────────────────────────
  //
  // NO toca el reparto. Ni una línea. Lo único que hace es ESCRIBIR
  // enlaces en `invoice_order_links` con `origen = 'auto'`, la misma
  // tabla donde ya se guardan los enlaces a mano, que el reparto ya
  // respeta por encima de todas sus reglas.
  //
  // Dos consecuencias que importan:
  //
  //   · El pasado no se mueve. Sólo se miran facturas del ciclo
  //     ABIERTO, así que los ciclos cerrados no tienen enlaces auto y
  //     se calculan con el mismo código y el mismo resultado de
  //     siempre. Él fue explícito: las pasadas ya están bien.
  //   · Una vez escrito deja de moverse. Registrar otra orden no se lo
  //     lleva, y al cerrar el ciclo el resultado queda congelado solo.
  //
  // Un enlace a mano SIEMPRE gana: no se sobrescribe nunca. Y un
  // 'auto' equivocado se suelta con el mismo botón que uno manual.
  //
  // ── Por qué no se compara el total, que es lo primero que uno piensa
  //
  // Él propuso casar por el importe: "si la factura es de 2000, busca
  // órdenes 150 o 200 por encima o por debajo". El instinto es bueno,
  // el criterio se rompe justo en sus casos:
  //
  //   · El total de la factura lleva impuesto, depósitos y entrega
  //     que el subtotal de la orden no tiene. La diferencia no es
  //     ruido, es un sesgo que siempre va en la misma dirección.
  //   · Una entrega corta baja el total legítimamente —por eso existe
  //     el estado `short`— y una ventana fija engancharía con la orden
  //     equivocada precisamente cuando algo salió mal.
  //   · Dos órdenes al mismo proveedor en la misma semana, que es EL
  //     caso ambiguo, suelen parecerse en tamaño.
  //
  // La señal fuerte es QUÉ PRODUCTOS trae la factura. El dinero entra,
  // pero como desempate y en proporción, no en dólares fijos: ±200 es
  // casi todo en una orden de 300 y casi nada en una de 3000.

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

  // ── Los números ──────────────────────────────────────────────────────
  //
  // Están aquí arriba y con nombre para que se puedan discutir. No
  // salieron de ninguna teoría: son un punto de partida, y por eso
  // existe `informe()`, que enseña qué haría sin escribir nada.
  const PESOS = {
    solape:     0.55,   // cuánto de la factura está en la orden
    cobertura:  0.20,   // cuánto de la orden está en la factura
    dinero:     0.12,   // qué tan cerca andan los importes
    dias:       0.08,   // qué tan cerca andan las fechas
    proveedor:  0.05    // mismo nombre de proveedor: un empujón, nunca un requisito
  };

  // Por debajo de esto no se escribe nada y la factura se queda como
  // está hoy. Él lo eligió así: el cambio AÑADE certeza donde la hay,
  // nunca quita nada.
  const MINIMO_SOLAPE = 0.60;   // al menos 3 de cada 5 productos
  const MINIMO_PUNTOS = 0.55;
  // Y si las dos mejores candidatas van parejas, tampoco. Elegir entre
  // dos empatadas es echarlo a suertes con cara de certeza.
  const MARGEN = 0.10;

  const DIAS_LEJOS = 14;        // a partir de aquí la fecha ya no dice nada

  const n = (x) => Number(x) || 0;

  function dias(a, b) {
    const ta = Date.parse(a || ''), tb = Date.parse(b || '');
    if (!isFinite(ta) || !isFinite(tb)) return DIAS_LEJOS;
    return Math.abs(ta - tb) / 86400000;
  }

  // ── Puntuar un par ───────────────────────────────────────────────────
  //
  // `f` y `o` traen ya sus productos normalizados en un Set.
  function puntuar(f, o) {
    let coinc = 0;
    f.items.forEach(k => { if (o.items.has(k)) coinc++; });

    const solape    = f.items.size ? coinc / f.items.size : 0;
    const cobertura = o.items.size ? coinc / o.items.size : 0;

    // En proporción al tamaño de la orden, no en dólares.
    const base   = Math.max(n(o.total), 1);
    const dinero = 1 - Math.min(1, Math.abs(n(f.total) - n(o.total)) / base);

    const d = 1 - Math.min(1, dias(f.fecha, o.fecha) / DIAS_LEJOS);

    // El proveedor NO es requisito, a propósito: el caso que origina
    // todo esto es pedir en el portal de LOOP y que la factura llegue
    // a nombre de Fine Wine. Si fuera requisito, ese caso —el único
    // que de verdad duele— nunca casaría solo.
    const prov = (f.proveedor && o.proveedor && f.proveedor === o.proveedor) ? 1 : 0;

    const puntos = PESOS.solape * solape
                 + PESOS.cobertura * cobertura
                 + PESOS.dinero * dinero
                 + PESOS.dias * d
                 + PESOS.proveedor * prov;

    return { puntos, solape, cobertura, dinero, dias: d, prov, coinc };
  }

  // ── Armar las dos listas ─────────────────────────────────────────────
  //
  // Una factura es un grupo de líneas de `marginedge_invoice_lines` con
  // el mismo `order_id` —que es el id de MarginEdge, no uno nuestro—.
  // Sus productos vienen por `product_id`, y el nombre sale de
  // `marginedge_links`. Una línea sin enlace no cuenta: no se sabe qué
  // botella es, y meterla bajaría el solape de una factura que podría
  // estar perfectamente identificada por las demás.
  function agruparFacturas(lineas, enlaces) {
    const nombre = new Map(enlaces.map(e => [String(e.product_id), e.item_name || '']));
    const out = new Map();
    for (const l of lineas) {
      const id = String(l.order_id || '');
      if (!id) continue;
      let f = out.get(id);
      if (!f) {
        f = { id, items: new Set(), total: 0, fecha: l.invoice_date || '',
              proveedor: norm(l.vendor_name), numero: l.invoice_number || '',
              sinEnlace: 0 };
        out.set(id, f);
      }
      // El total de la factura es lo que de verdad vino en ella,
      // incluidas las líneas que no sabemos qué son: para comparar
      // importes cuenta todo.
      f.total += n(l.quantity) * n(l.unit_price);
      const it = nombre.get(String(l.product_id));
      if (it) f.items.add(norm(it)); else f.sinEnlace++;
      if (!f.fecha && l.invoice_date) f.fecha = l.invoice_date;
    }
    return out;
  }

  function agruparOrdenes(ordenes, lineas) {
    const out = new Map();
    for (const o of ordenes) {
      out.set(String(o.id), {
        id: String(o.id), items: new Set(),
        total: n(o.subtotal), fecha: o.created_at || '',
        proveedor: norm(o.vendor), etiqueta: o.po_number || o.app_order_id || ''
      });
    }
    for (const l of lineas) {
      const o = out.get(String(l.vendor_order_id));
      if (o) o.items.add(norm(l.item_name));
    }
    return out;
  }

  // ── La propuesta ─────────────────────────────────────────────────────
  //
  // Pura: no lee ni escribe nada, sólo decide. Así se puede probar sin
  // base de datos y enseñar sin tocar nada.
  //
  // `yaEnlazadas` son las facturas que ya tienen dueño —a mano o de una
  // pasada anterior— y se dejan en paz.
  function proponer(d) {
    const facturas = agruparFacturas(d.lineas || [], d.enlaces || []);
    const ordenes  = agruparOrdenes(d.ordenes || [], d.lineasOrden || []);
    const ya = d.yaEnlazadas instanceof Set
      ? d.yaEnlazadas : new Set(d.yaEnlazadas || []);
    const desde = d.desde ? Date.parse(d.desde) : 0;

    const filas = [];
    facturas.forEach(f => {
      if (ya.has(f.id)) return;
      // Sólo el ciclo abierto. Lo de antes ya está bien y no se toca.
      if (desde && Date.parse(f.fecha || '') < desde) return;
      if (!f.items.size) return;   // ningún producto identificable

      const cands = [];
      ordenes.forEach(o => {
        if (!o.items.size) return;
        if (desde && Date.parse(o.fecha || '') < desde) return;
        cands.push(Object.assign({ orden: o.id, etiqueta: o.etiqueta }, puntuar(f, o)));
      });
      cands.sort((a, b) => b.puntos - a.puntos);

      const mejor = cands[0] || null;
      const otra  = cands[1] || null;
      // Las tres razones por las que NO se escribe, cada una con su
      // nombre: en el informe se lee por qué se dejo pasar una.
      const porQueNo =
        !mejor                                   ? 'no hay ordenes en el ciclo'
        : mejor.solape < MINIMO_SOLAPE           ? 'pocos productos en comun'
        : mejor.puntos < MINIMO_PUNTOS           ? 'puntuacion baja'
        : (otra && mejor.puntos - otra.puntos < MARGEN) ? 'dos candidatas empatadas'
        : '';

      filas.push({
        factura: f.id, numero: f.numero, fecha: f.fecha,
        total: Math.round(f.total * 100) / 100,
        productos: f.items.size, sinEnlace: f.sinEnlace,
        candidatas: cands.slice(0, 3),
        enlaza: porQueNo ? null : mejor.orden,
        porQueNo
      });
    });
    return filas;
  }

  window.BarStockInvoiceOrderAuto = {
    proponer, puntuar, agruparFacturas, agruparOrdenes,
    PESOS, MINIMO_SOLAPE, MINIMO_PUNTOS, MARGEN, DIAS_LEJOS
  };
})();
