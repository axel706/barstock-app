(() => {
  if (window.BarStockProductWeeks) return;

  // ── El consumo semanal de un producto, en UN sitio ───────────────────
  //
  // La gráfica de las últimas semanas existía sólo en el panel de
  // escritorio, escrita en línea dentro de `openInvPanel`. Al traerla al
  // teléfono había dos caminos: copiarla, o sacarla aquí. Copiarla
  // habría sido la séptima vez en este proyecto que lo mismo vive en
  // dos sitios —los márgenes de pantalla, el catálogo de fondos, el
  // dibujado del logo, la cabecera de producto, el armado de facturas,
  // el gesto de las hojas— y las seis anteriores acabaron igual: un día
  // se toca una y las dos dejan de decir lo mismo.
  //
  // Aquí va el DATO y la regla. El dibujo es de cada pantalla: el
  // escritorio tiene una rejilla fija y el teléfono una hoja que se
  // desplaza, y eso se pinta distinto.

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY, loc: c.LOCATION_NAME };
  }

  function cab(key) {
    return { apikey: key, Authorization: 'Bearer ' + key };
  }

  // La locación se resuelve una vez por sesión. Es el mismo id durante
  // toda la vida de la pantalla y cada ficha que se abría lo volvía a
  // pedir.
  let _loc = null, _locPara = null;

  async function locationId() {
    const { url, key, loc } = cfg();
    if (!url || !key || !loc) return null;
    if (_loc && _locPara === loc) return _loc;
    try {
      const res = await fetch(
        url + '/rest/v1/locations?name=eq.' + encodeURIComponent(loc) + '&select=id',
        { headers: cab(key) });
      if (!res.ok) return null;
      const d = await res.json();
      _loc = (d[0] && d[0].id) || null;
      _locPara = loc;
      return _loc;
    } catch (e) { return null; }
  }

  // ── Las últimas semanas ──────────────────────────────────────────────
  //
  // Devuelve de la más vieja a la más nueva: [{ semana, usado }].
  // Array vacío si no hay historia, y también si la consulta falla — el
  // que llama no puede distinguirlo, así que NO se dibuja una gráfica
  // vacía con pinta de "este producto no se mueve". Un fallo disfrazado
  // de dato es la trampa de siempre.
  //
  // Las semanas de evento quedan fuera: una boda de 300 personas no
  // dice nada del ritmo normal, y metida en la barra la dobla.
  async function semanas(item, cuantas) {
    const n = cuantas || 6;
    const { url, key } = cfg();
    if (!url || !key || !item) return [];

    const id = await locationId();
    if (!id) return [];

    let filas = [];
    try {
      const res = await fetch(
        url + '/rest/v1/inventory_snapshots' +
        '?location_id=eq.' + id +
        '&item_name=eq.' + encodeURIComponent(item) +
        '&is_event_week=eq.false&used=not.is.null' +
        '&order=week_start.desc&limit=' + n +
        '&select=week_start,used,on_hand_start,ordered,on_hand_end_adjusted',
        { headers: cab(key) });
      if (!res.ok) return [];
      filas = await res.json();
    } catch (e) {
      console.warn('[semanas] no se pudo leer el consumo', e);
      return [];
    }
    if (!Array.isArray(filas)) return [];

    // Si alguien corrigió el conteo de cierre de esa semana, el consumo
    // se recalcula: lo que había + lo que entró - lo corregido. Sin
    // esto la gráfica cuenta una historia y la columna Usage otra sobre
    // el mismo producto.
    return filas.map(x => {
      const adj = x.on_hand_end_adjusted;
      const usado = (adj !== null && adj !== undefined && x.on_hand_start !== null)
        ? Number(x.on_hand_start || 0) + Number(x.ordered || 0) - Number(adj)
        : Number(x.used || 0);
      return { semana: x.week_start, usado: Math.max(0, usado) };
    }).reverse();
  }

  // ── Hacia dónde va ───────────────────────────────────────────────────
  //
  // La mitad nueva contra la mitad vieja. Con menos de cuatro semanas no
  // se dice nada: dos puntos no son una tendencia, son dos puntos.
  function rumbo(serie) {
    if (!Array.isArray(serie) || serie.length < 4) return null;
    const m = Math.floor(serie.length / 2);
    const med = (a) => a.reduce((s, x) => s + Number(x.usado || 0), 0) / (a.length || 1);
    const antes = med(serie.slice(0, m));
    const ahora = med(serie.slice(m));
    const d = Math.round((ahora - antes) * 10) / 10;
    if (d === 0) return { d: 0, txt: 'Steady' };
    return { d, txt: d > 0 ? 'Picking up' : 'Slowing down' };
  }

  // ── El paso de Pour·IQ ───────────────────────────────────────────────
  //
  // Un par no salta de golpe: como mucho ±2 por vez. Un óptimo de 9
  // sobre un par de 1 puede venir de un mes raro, y aplicarlo entero
  // mete ocho botellas en la siguiente orden. Si resulta que el óptimo
  // era bueno, la semana que viene vuelve a ofrecer el salto.
  //
  // Devuelve null cuando no hay nada que aplicar, y ese null es la
  // diferencia entre enseñar el botón y no enseñarlo.
  const TOPE = 2;

  function paso(actual, optimo) {
    // `null` se comprueba a mano y no con isFinite: Number(null) es 0 y
    // cero es un optimo LEGITIMO —Pour·IQ puede decir que este producto
    // no hace falta—, asi que colarlo por isFinite convertia "todavia no
    // hay opinion" en "bajalo a cero". El boton aparecia solo.
    if (actual == null || optimo == null) return null;
    const a = Number(actual), o = Number(optimo);
    if (!isFinite(a) || !isFinite(o) || a === o) return null;
    return a > o ? Math.max(o, a - TOPE) : Math.min(o, a + TOPE);
  }

  // ── Aplicarlo ────────────────────────────────────────────────────────
  //
  // Escribe el par y nada más: no repinta, no cierra, no reabre. Cada
  // pantalla sabe qué hacer después, y el escritorio hacía las dos
  // cosas en la misma función.
  //
  // Lanza si falla. Un par que no se guardó y dice que sí es peor que
  // un error en pantalla: la siguiente orden sale con el número viejo.
  async function aplicarPar(r, destino) {
    const { url, key } = cfg();
    if (!url || !key || !r) throw new Error('sin configuracion');

    const id = await locationId();
    if (!id) throw new Error('no se pudo resolver la locacion');

    const res = await fetch(
      url + '/rest/v1/inventory_items?location_id=eq.' + id +
      '&item_name=eq.' + encodeURIComponent(r.item),
      {
        method: 'PATCH',
        headers: Object.assign(cab(key), {
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        }),
        body: JSON.stringify({
          suggested: destino,
          par_adjusted_week: new Date().toISOString().slice(0, 10)
        })
      });
    if (!res.ok) throw new Error('PATCH inventory_items ' + res.status);

    r.suggested = destino;
    if (typeof window.computeToOrder === 'function') {
      r.toOrder = window.computeToOrder(r.onHand, destino);
    }
    if (typeof window.saveState === 'function') window.saveState();
    return destino;
  }

  window.BarStockProductWeeks = { semanas, rumbo, paso, aplicarPar, TOPE };
})();
