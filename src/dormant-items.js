(() => {
  if (window.BarStockDormant) return;

  // ── Lo que no se usa deja de estorbar ────────────────────────────────
  //
  // De 270 articulos, 187 se movieron en las ultimas cuatro semanas. De
  // los 83 restantes, 61 no tienen stock NI movimiento: filas que no
  // dicen nada, no se pueden pedir y encima inflan el aviso de "never
  // scanned" al cerrar un conteo.
  //
  // ── Regla calculada, no columna de archivado ─────────────────────────
  //
  // No hay un campo `archivado` que alguien tenga que mantener. Un
  // articulo se esconde cuando se cumple TODO:
  //
  //     sin stock          on hand <= 0
  //     sin par            suggested <= 0
  //     sin movimiento     nada en las ultimas SEMANAS_QUIETO semanas
  //     ya no es nuevo     creado hace mas de SEMANAS_GRACIA
  //
  // Las cuatro, no cualquiera. Y por eso se cura sola: en cuanto el
  // producto aparece en un conteo o se le pone par, vuelve a la lista sin
  // que nadie se acuerde de desarchivarlo. Un estado guardado se habria
  // quedado puesto.
  //
  // ── Las dos cifras ──────────────────────────────────────────────────
  //
  // OCHO semanas quieto, no cuatro: un amaro de invierno puede pasarse
  // septiembre entero sin moverse y no es basura. Cuatro escondia
  // producto estacional vivo.
  //
  // CUATRO semanas de gracia: es lo que tarda un producto recien dado de
  // alta en aparecer en un ciclo cerrado. Sin esto, un articulo creado a
  // mano —cero stock, cero historial— desapareceria en el acto, que es
  // la forma mas rapida de que esta funcion parezca un bug.
  //
  // ── Lo que esto NO hace ──────────────────────────────────────────────
  //
  // No borra, no toca el on hand, no toca el historial y no sale del
  // valor del inventario. Si esconder un articulo bajara tu inventario
  // valorado seria maquillaje contable, no limpieza. Solo decide que
  // filas se pintan.
  //
  // Los 22 que SI tienen stock y llevan quietos no se esconden: eso es
  // dinero parado en el estante y hay que verlo.

  const SEMANAS_QUIETO = 8;
  const SEMANAS_GRACIA = 4;
  const DIA = 86400000;

  let _ultimo = null;   // Map(item_name -> 'YYYY-MM-DD') o null si no cargo
  let _cargando = null;
  let _mostrarTodo = false;

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY };
  }

  function num(n) { return Number(n) || 0; }

  // ── Cargar la ultima fecha de movimiento ─────────────────────────────
  //
  // Una vista en la base (migracion 015) porque PostgREST no agrupa: sin
  // ella habria que bajarse el historial entero en cada carga para sacar
  // una fecha por articulo.
  //
  // Si la lectura falla, `_ultimo` se queda en null y NO se esconde
  // nada. Es a proposito: el fallo tiene que ser "se ve todo como
  // siempre", nunca "desaparecio medio inventario". Un error de red no
  // puede parecerse a una limpieza.
  async function cargar(force) {
    if (_ultimo && !force) return _ultimo;
    if (_cargando) return _cargando;

    _cargando = (async () => {
      const { url, key } = cfg();
      const P = window.BarStockParIntelligence;
      if (!url || !key || !P || typeof P.fetchLocationId !== 'function') {
        console.warn('[dormant] sin configuracion; no se esconde nada');
        return null;
      }
      try {
        const locationId = await P.fetchLocationId();
        if (!locationId) return null;
        const res = await fetch(
          `${url}/rest/v1/item_activity?location_id=eq.${locationId}&select=item_name,last_moved`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } });
        const filas = await res.json();

        // PostgREST devuelve un OBJETO de error, no un array, cuando la
        // vista no existe o una politica la bloquea. Tratarlo como "sin
        // datos" escondería todo el inventario de golpe.
        if (!Array.isArray(filas)) {
          console.warn('[dormant] item_activity no devolvio filas (HTTP ' + res.status + '). ' +
            '¿Corriste la migracion 015? No se escondera nada.',
            JSON.stringify(filas).slice(0, 300));
          return null;
        }

        const m = new Map();
        for (const f of filas) if (f && f.item_name) m.set(f.item_name, f.last_moved || null);
        _ultimo = m;
        return m;
      } catch (e) {
        console.warn('[dormant] no se pudo leer item_activity; no se esconde nada', e);
        return null;
      } finally {
        _cargando = null;
      }
    })();

    return _cargando;
  }

  function semanasDesde(fecha) {
    if (!fecha) return Infinity;
    const t = Date.parse(String(fecha).length <= 10 ? fecha + 'T00:00:00' : fecha);
    if (!isFinite(t)) return Infinity;
    return (Date.now() - t) / (7 * DIA);
  }

  // ── La regla ─────────────────────────────────────────────────────────
  function estaQuieto(row) {
    if (!row) return false;
    if (!_ultimo) return false;                       // sin datos no se esconde nada
    if (num(row.onHand) > 0) return false;            // hay botellas
    if (num(row.suggested) > 0) return false;         // tiene par: lo quieres

    // El recien creado se queda aunque no tenga nada. `createdAt` puede
    // no venir en masters cargados antes de la migracion 015; en ese caso
    // no se usa la gracia en vez de inventarse una fecha.
    if (row.createdAt && semanasDesde(row.createdAt) < SEMANAS_GRACIA) return false;

    return semanasDesde(_ultimo.get(row.item)) >= SEMANAS_QUIETO;
  }

  // ── API para render() ────────────────────────────────────────────────

  function listo() { return !!_ultimo; }
  function mostrandoTodo() { return _mostrarTodo; }
  function verTodo(v) { _mostrarTodo = !!v; }

  // Oculto DE VERDAD: quieto y el usuario no pidio verlo todo.
  function oculto(row) { return !_mostrarTodo && estaQuieto(row); }

  function cuantos(rows) {
    if (!_ultimo) return 0;
    let n = 0;
    for (const r of (rows || [])) if (estaQuieto(r)) n++;
    return n;
  }

  // Los 22 con stock y quietos: inventario muerto. No se esconden, pero
  // se pueden listar aparte con su valor.
  function stockMuerto(rows) {
    if (!_ultimo) return [];
    return (rows || []).filter(r =>
      num(r.onHand) > 0 && semanasDesde(_ultimo.get(r.item)) >= SEMANAS_QUIETO
    );
  }

  function invalidate() { _ultimo = null; }

  window.BarStockDormant = {
    cargar, oculto, estaQuieto, cuantos, stockMuerto,
    listo, verTodo, mostrandoTodo, invalidate,
    SEMANAS_QUIETO, SEMANAS_GRACIA
  };
})();
