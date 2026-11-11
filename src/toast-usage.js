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
  // enlaces:  [{ toast_item_guid, item_name, pour_oz, status, kind }]
  // recetas:  las de BarStockToastRecipes.recetas()
  // tamanos:  { producto: ml }
  function calcular(ventas, enlaces, recetas, tamanos) {
    const porGuid = new Map((enlaces || []).map(e => [e.toast_item_guid, e]));
    const cocteles = new Map(), mods = new Map();
    for (const R of recetas || []) (R.tipo === 'modifier' ? mods : cocteles).set(norm(R.nombre), R);

    const productos = new Map();
    const sinConvertir = new Map();
    const ml = (p) => Number((tamanos || {})[p]) || ML_SIN_TAMANO;

    const sumar = (producto, fecha, botellas, de) => {
      if (!productos.has(producto)) productos.set(producto, { producto, botellas: 0, porDia: {}, de: {} });
      const P = productos.get(producto);
      P.botellas += botellas;
      P.porDia[fecha] = (P.porDia[fecha] || 0) + botellas;
      P.de[de] = (P.de[de] || 0) + botellas;
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
        sumar(p, v.business_date, q * l.oz * ML_POR_OZ / ml(p), v.toast_item_name);
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
        const oz = e.pour_oz == null ? null : Number(e.pour_oz);
        sumar(e.item_name, v.business_date, oz == null ? q : q * oz * ML_POR_OZ / ml(e.item_name), v.toast_item_name);
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

  async function desdeElConteo() {
    const W = window.BarStockWeeklyCycle;
    if (W && W.estado && W.estado() === 'counting') return { estado: 'contando' };
    const conteo = await ultimoConteo();
    if (!conteo) return { estado: 'sinConteo' };
    const desde = diaDeNegocio(conteo);
    const loc = await window.BarStockInventoryCloud.fetchLocationId();
    const [ventas, enlaces] = await Promise.all([
      R().leerTodo('toast_sales?location_id=eq.' + loc + '&business_date=gt.' + desde +
        '&select=business_date,toast_item_guid,toast_item_name,toast_group,mods,quantity&order=id.asc'),
      R().leerTodo('toast_item_links?location_id=eq.' + loc + '&select=toast_item_guid,item_name,pour_oz,status,kind&order=id.asc')
    ]);
    const TR = window.BarStockToastRecipes;
    if (TR && (!TR.datos() || TR.datos().estado !== 'listo')) await TR.cargar();
    const recetas = TR ? TR.recetas() : [];
    const tamanos = {};
    for (const r of (window.state && window.state.master) || []) if (r && r.item) tamanos[r.item] = r.bottleSizeMl;
    // Los días que se cargaron, para decir hasta cuándo llega la cuenta.
    const dias = await R().leerTodo('toast_sales_days?location_id=eq.' + loc + '&business_date=gt.' + desde +
      '&select=business_date,complete,closed&order=business_date.asc');
    return Object.assign({ estado: 'listo', conteo: conteo.toISOString(), desde, dias },
      calcular(ventas, enlaces, recetas, tamanos));
  }

  window.BarStockToastUsage = { calcular, desdeElConteo, diaDeNegocio, ML_POR_OZ, ML_SIN_TAMANO, CORTE_H };
})();
