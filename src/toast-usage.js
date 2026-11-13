(() => {
  if (window.BarStockToastUsage) return;

  // ── Lo vendido en Toast desde el conteo, en botellas ─────────────────
  //
  // El motor del "deberías tener" (Axel, 2026-11-08): contado + lo que
  // llegó − lo vendido en Toast desde el conteo. Este módulo hace la
  // última parte y nada más: de las ventas guardadas (toast_sales, que
  // carga sola la tarea de Vercel) a botellas por producto. NO escribe
  // nada: on_hand es lo que alguien contó y sólo lo escribe un conteo.
  //
  // De una venta a botellas, en este orden:
  //   1. El artículo tiene emparejamiento (toast_item_links): el vino y
  //      el licor solo. Su pour; vacío es una botella entera (el vino
  //      por botella). Si es licor y la venta trae un modificador con
  //      receta (Martini, Cosmo, Manhattan, Old Fashioned), manda la
  //      receta: un Martini de Grey Goose son 2.5 de Grey Goose y 0.5 de
  //      vermouth, no el 3 del UP/RX.
  //   2. Si no, una receta de cóctel por el nombre de Toast ("Golden
  //      Vesper", "HH Cosmopolitan"), con sus líneas según los
  //      modificadores de la venta ("Dirty", "Creamy").
  //   3. Si no, no se convierte, y se DICE: va a `sinConvertir` con el
  //      motivo. Una venta que se pierde en silencio haría que el
  //      estimado pareciera exacto sin serlo.
  //
  // ── Desde cuándo ─────────────────────────────────────────────────────
  //
  // Desde el último conteo: lo más reciente entre la apertura del ciclo
  // (locations.weekly_reset_at, el "Cycle open · Nov 8") y el cierre del
  // último conteo (count_sessions.finished_at, que también apunta los
  // recuentos). Axel, 2026-11-11: "el conteo se hace poco antes de cerrar,
  // a veces después de cerrar". Por eso el día del conteo NO se descuenta:
  // lo vendido ese día ya no estaba en la estantería al contar. Se cuenta
  // desde el día de negocio siguiente. Un conteo pasada la medianoche
  // sigue siendo del día que cerró: el día de negocio cambia a las 4 de
  // la mañana (CORTE_H), no a las 12. Lo poco que se venda después de
  // contar ese día se pierde, y el estimado queda apenas por encima.
  //
  // Durante un conteo activo no se calcula nada: se enseña lo contado
  // (Axel, 2026-11-08).

  const ML_POR_OZ = 29.5735;
  // La misma regla que count-finish.js al pasar mililitros a botellas: un
  // producto sin tamaño es de 750. Dos reglas distintas darían dos
  // números distintos para la misma botella.
  const ML_SIN_TAMANO = 750;
  const CORTE_H = 4;

  const L = () => window.BarStockToastLinks;
  const norm = (t) => L() ? L().norm(t) : String(t || '').toLowerCase().trim();
  const bajo = (t) => String(t || '').trim().toLowerCase();

  // El día de negocio de un instante, en Nueva York.
  function diaDeNegocio(instante) {
    const t = new Date(instante).getTime() - CORTE_H * 3600e3;
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
  }

  // ¿Cuenta esta línea de receta con estos modificadores?
  function vale(l, mods) {
    if (l.soloCon && !mods.has(bajo(l.soloCon))) return false;
    if ((l.sinCon || []).some(m => mods.has(bajo(m)))) return false;
    return true;
  }

  // ── El cálculo, sin red ──────────────────────────────────────────────
  //
  // ventas:   [{ business_date, toast_item_guid, toast_item_name, mods, quantity }]
  // enlaces:  [{ toast_item_guid, item_name, pour_oz, status, kind, toast_group }]
  // recetas:  las de BarStockToastRecipes.recetas()
  // tamanos:  { producto: ml }
  // pourDe:   (grupo de Toast) → onzas, o undefined. Las de la locación
  //           (toast-pours.js). Sin ella, el pour_oz guardado al emparejar.
  function calcular(ventas, enlaces, recetas, tamanos, pourDe) {
    const porGuid = new Map((enlaces || []).map(e => [e.toast_item_guid, e]));
    const cocteles = new Map(), mods = new Map();
    // Cada receta por su nombre de Toast y por los de "Same as…" (also):
    // el mismo trago vendido con otro nombre gasta lo mismo.
    for (const R of recetas || []) {
      const m = R.tipo === 'modifier' ? mods : cocteles;
      m.set(norm(R.nombre), R);
      for (const a of R.tambien || []) m.set(norm(a), R);
    }

    const productos = new Map();
    const sinConvertir = new Map();
    const ml = (p) => Number((tamanos || {})[p]) || ML_SIN_TAMANO;

    // `cat` es la categoría de venta de la fila, tal cual la dice Toast
    // (Liquor, Wine…). catPorDia la guarda por día para partir las
    // botellas en licor y vino (el correo de la mañana, toast-sales.js);
    // quién es licor y quién vino se decide allí, en un solo sitio. Una
    // fila sin categoría no se apunta en ninguna: no se le inventa una.
    const sumar = (producto, fecha, botellas, de, cat) => {
      if (!productos.has(producto)) productos.set(producto, { producto, botellas: 0, porDia: {}, de: {}, catPorDia: {} });
      const P = productos.get(producto);
      P.botellas += botellas;
      P.porDia[fecha] = (P.porDia[fecha] || 0) + botellas;
      P.de[de] = (P.de[de] || 0) + botellas;
      if (cat) {
        const c = P.catPorDia[fecha] || (P.catPorDia[fecha] = {});
        c[cat] = (c[cat] || 0) + botellas;
      }
    };
    const perder = (nombre, motivo, q) => {
      const k = nombre + '|' + motivo;
      if (!sinConvertir.has(k)) sinConvertir.set(k, { nombre, motivo, unidades: 0 });
      sinConvertir.get(k).unidades += q;
    };
    const aplicar = (R, v, q, eleccion) => {
      const m = new Set(String(v.mods || '').split(' · ').map(bajo).filter(Boolean));
      for (const l of R.lineas) {
        if (!vale(l, m)) continue;
        const p = l.eleccion ? eleccion : l.producto;
        if (!p) { perder(v.toast_item_name, 'No bottle chosen for "' + l.etiqueta + '" in ' + R.nombre, q); continue; }
        sumar(p, v.business_date, q * l.oz * ML_POR_OZ / ml(p), v.toast_item_name, v.sales_category);
      }
    };

    for (const v of ventas || []) {
      const q = Number(v.quantity) || 0;
      if (!q) continue;
      const e = porGuid.get(v.toast_item_guid);
      if (e && e.status === 'ignored') continue;   // no es del inventario
      if (e && e.status === 'confirmed' && e.item_name) {
        const ms = String(v.mods || '').split(' · ').map(norm).filter(Boolean);
        const R = e.kind === 'liquor' ? ms.map(x => mods.get(x)).find(Boolean) : null;
        if (R && !R.pendiente) { aplicar(R, v, q, e.item_name); continue; }
        // El licor solo, con el pour de la locación AHORA, por la medida de
        // su grupo de Toast (Axel, 2026-11-13: cambiar una medida
        // recalcula también lo ya emparejado). pour_oz, el que se guardó
        // al emparejar, sólo si la medida no se puede sacar del grupo.
        // Una medida que la locación dejó sin onzas no se cuenta como
        // botella entera: se dice.
        let oz = e.pour_oz == null ? null : Number(e.pour_oz);
        if (e.kind === 'liquor' && pourDe) {
          const g = e.toast_group || v.toast_group;
          const m = g ? pourDe(g) : undefined;
          if (m !== undefined) oz = m;
          else if (oz == null) { perder(v.toast_item_name, 'No pour for its size (' + (g || 'no group') + ')', q); continue; }
        }
        sumar(e.item_name, v.business_date, oz == null ? q : q * oz * ML_POR_OZ / ml(e.item_name), v.toast_item_name, v.sales_category);
        continue;
      }
      const R = cocteles.get(norm(v.toast_item_name));
      if (R) {
        if (R.pendiente || !R.lineas.length) { perder(v.toast_item_name, 'Recipe missing', q); continue; }
        aplicar(R, v, q, null);
        continue;
      }
      perder(v.toast_item_name, v.toast_group ? 'Not matched (' + v.toast_group + ')' : 'Not matched', q);
    }
    const r2 = (n) => Math.round(n * 1000) / 1000;
    return {
      productos: [...productos.values()].map(P => Object.assign(P, { botellas: r2(P.botellas) }))
        .sort((a, b) => b.botellas - a.botellas),
      sinConvertir: [...sinConvertir.values()].sort((a, b) => b.unidades - a.unidades)
    };
  }

  // ── Leer y calcular ──────────────────────────────────────────────────
  const cfg = () => window.BARSTOCK_CONFIG || {};
  const R = () => window.BarStockRest;

  // El instante del último conteo, o null si no se sabe.
  async function ultimoConteo() {
    const C = window.BarStockCycle;
    const ciclo = C && C.load ? await C.load() : null;
    const filas = await R().leerTodo('count_sessions?location_name=eq.' + encodeURIComponent(cfg().LOCATION_NAME || '') +
      '&select=finished_at&order=finished_at.desc');
    // Sin `limit=1`: leerTodo pone el suyo para paginar, y dos `limit` en
    // la misma petición es pedirle a PostgREST que elija. Son pocas filas
    // (una por conteo) y con order desc la primera es la última.
    const sesion = filas[0] && filas[0].finished_at ? new Date(filas[0].finished_at) : null;
    const t = [ciclo, sesion].filter(d => d && !isNaN(d.getTime())).sort((a, b) => b - a)[0];
    return t || null;
  }

  // ── Lo vendido en botellas, por producto y por día, desde un día ─────
  //
  // `desde` es un día de negocio 'AAAA-MM-DD' y NO entra (gt): así lo
  // pide el LIVE, para quien el día del conteo no se descuenta. Lo usan
  // el LIVE (desde el conteo) y "cuándo se acaba" (los últimos 90 días),
  // y por eso vive aquí una vez. `dias` son los días que se cargaron:
  // un día sin fila no es un día sin ventas, es un día que no se sabe.
  async function ventasDesde(desde) {
    const loc = await window.BarStockInventoryCloud.fetchLocationId();
    const [ventas, enlaces, dias] = await Promise.all([
      // net y sales_category los usa la tarjeta Toast Sales del Home
      // (toast-sales.js): la misma lectura, para no pedir dos veces lo
      // mismo. net es el Net sales de Toast (migración 034).
      R().leerTodo('toast_sales?location_id=eq.' + loc + '&business_date=gt.' + desde +
        '&select=business_date,toast_item_guid,toast_item_name,toast_group,mods,quantity,net,sales_category&order=id.asc'),
      R().leerTodo('toast_item_links?location_id=eq.' + loc + '&select=toast_item_guid,item_name,pour_oz,status,kind,toast_group&order=id.asc'),
      R().leerTodo('toast_sales_days?location_id=eq.' + loc + '&business_date=gt.' + desde +
        '&select=business_date,complete,closed,fetched_at&order=business_date.asc')
    ]);
    const TR = window.BarStockToastRecipes;
    if (TR && (!TR.datos() || TR.datos().estado !== 'listo')) await TR.cargar();
    const recetas = TR ? TR.recetas() : [];
    const tamanos = {};
    for (const r of (window.state && window.state.master) || []) if (r && r.item) tamanos[r.item] = r.bottleSizeMl;
    // Los pours de la locación. Si no se pueden leer (la migración 037 sin
    // correr, un fallo), se sigue con los guardados al emparejar: el LIVE
    // no se queda en blanco por esto.
    const P = window.BarStockToastPours;
    let pourDe = null;
    if (P) {
      try { await P.cargar(); pourDe = (g) => P.ozDe(P.medidaDeGrupo(g)); }
      catch (e) { pourDe = null; }
    }
    return Object.assign({ desde, dias, ventas }, calcular(ventas, enlaces, recetas, tamanos, pourDe));
  }

  async function desdeElConteo() {
    const W = window.BarStockWeeklyCycle;
    if (W && W.estado && W.estado() === 'counting') return { estado: 'contando' };
    const conteo = await ultimoConteo();
    if (!conteo) return { estado: 'sinConteo' };
    const r = await ventasDesde(diaDeNegocio(conteo));
    return Object.assign({ estado: 'listo', conteo: conteo.toISOString() }, r);
  }

  window.BarStockToastUsage = { calcular, ventasDesde, desdeElConteo, diaDeNegocio, ML_POR_OZ, ML_SIN_TAMANO, CORTE_H };
})();
