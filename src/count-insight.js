(() => {
  if (window.BarStockCountInsight) return;

  // ── Lo que la app ya sabía y no estaba usando ────────────────────────
  //
  // `inventory_snapshots` lleva una fila por producto y por semana con
  // `used`, `ordered`, `on_hand_start` y `on_hand_end`. Par Intelligence
  // la explota desde hace tiempo para calcular el par óptimo.
  //
  // El conteo, en cambio, trataba los 261 artículos como iguales. No lo
  // son: faltar el Tito's y faltar un amaro que no se toca desde marzo no
  // es el mismo problema, y cerrar sin distinguirlos es cerrar a ciegas.
  //
  // Este módulo no guarda nada ni escribe nada. Lee el historial una vez
  // y devuelve dos listas para la pantalla de cierre.
  //
  // ── Los dos avisos ──────────────────────────────────────────────────
  //
  //   1. FALTA Y SE MUEVE. De lo que nunca se escaneó, lo que sí se
  //      consume. Ordenado por rotación, no alfabético.
  //
  //   2. EL NÚMERO NO CUADRA. Se contó, pero se sale de lo normal.
  //
  // ── Por qué ninguno bloquea el cierre ───────────────────────────────
  //
  // El aviso 2 va a acusar en falso alguna vez: si entró mercancía sin
  // registrar la orden, catorce botellas es el número correcto y el aviso
  // está equivocado. No hay forma de distinguir "contaste mal" de "entró
  // producto sin apuntar" — solo de decir "esto no cuadra con lo que sé".
  //
  // Un aviso que se equivoca y además bloquea se aprende a saltar, y a
  // partir de ahí deja de leerse. Señala y deja pasar.

  const MIN_SEMANAS   = 3;    // menos historia que esto no es un promedio
  const ALTA_ROTACION = 2;    // botellas por semana, elegido por el usuario
  const DESVIO_ABS    = 2;    // botellas de diferencia…
  const DESVIO_REL    = 0.5;  // …Y además la mitad del esperado. Las dos.

  let _cache = null;          // { at, porItem }

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY };
  }

  // ── "Lo normal" se define UNA vez ────────────────────────────────────
  //
  // Aqui habia una mediana y en par-intelligence un promedio ponderado.
  // Dos ideas distintas de lo tipico en la misma app: el par podia haber
  // visto que un producto despego y esta pantalla seguir esperando lo de
  // siempre, sin que nada avisara de la discrepancia.
  //
  // La mediana estaba aqui para que una semana de fiesta no arrastrara el
  // promedio. Pero las semanas de evento ya se excluyen en la consulta
  // (is_event_week=eq.false), que era el motivo real. Lo que queda a
  // cambio es que esto ya se entera cuando un producto cambia de ritmo.
  function tipico(porSemana) {
    const P = window.BarStockParIntelligence;
    if (P && typeof P.ewmaStats === 'function') return P.ewmaStats(porSemana).avg;
    // Sin el modulo del par no hay ponderado; la media plana es peor pero
    // es un numero honesto, no un cero que parezca "no consume nada".
    const v = Array.from(porSemana.values());
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }

  // Misma corrección que usa par-intelligence: una fila vieja puede tener
  // `used` calculado antes de una corrección manual, y el valor bueno se
  // reconstruye desde on_hand_end_adjusted.
  function usedOf(r) {
    const adj = r.on_hand_end_adjusted;
    if (adj !== null && adj !== undefined && r.on_hand_start !== null && r.on_hand_start !== undefined) {
      return Number(r.on_hand_start || 0) + Number(r.ordered || 0) - Number(adj);
    }
    return Number(r.used || 0);
  }

  // ── El historial ─────────────────────────────────────────────────────
  //
  // Una sola lectura, paginada, y se guarda. Abrir la pantalla de cierre,
  // volver a escanear y abrirla otra vez es un gesto normal; releer
  // trescientas filas cada vez sería castigarlo.
  async function historial(force) {
    if (_cache && !force && (Date.now() - _cache.at) < 5 * 60 * 1000) return _cache.porItem;

    const { url, key } = cfg();
    if (!url || !key || !window.BarStockParIntelligence) return {};

    // Un fallo aqui dejaba el historial vacio y la pantalla de cierre
    // decia "esta es tu primera semana" — con diecisiete semanas en la
    // base. El catch mudo convertia un error de programacion en un bar
    // recien abierto, que es el mismo mensaje y problemas opuestos.
    let locationId;
    if (typeof window.BarStockParIntelligence.fetchLocationId !== 'function') {
      console.warn('[conteo] BarStockParIntelligence no expone fetchLocationId; ' +
                   'sin historial no hay avisos y el cierre dira que es la primera semana.');
      return {};
    }
    try { locationId = await window.BarStockParIntelligence.fetchLocationId(); }
    catch (e) { console.warn('[conteo] no se pudo resolver la locacion', e); return {}; }
    if (!locationId) { console.warn('[conteo] locacion sin id'); return {}; }

    // is_event_week=false: una semana de evento no dice nada del consumo
    // normal, y meterla en la mediana sube el listón para todo el año.
    const base = `${url}/rest/v1/inventory_snapshots` +
      `?location_id=eq.${locationId}&is_event_week=eq.false` +
      `&select=item_name,code,used,ordered,on_hand_start,on_hand_end,on_hand_end_adjusted,week_start`;

    let filas = [];
    try {
      const PAGE = 1000;
      for (let p = 0; p < 40; p++) {
        const res = await fetch(`${base}&order=id.asc&limit=${PAGE}&offset=${p * PAGE}`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } });
        const rows = await res.json();
        // ── Una respuesta que no es un array es un ERROR, no "no hay datos"
        //
        // PostgREST devuelve un objeto de error ante una columna que no
        // existe, una politica que bloquea o un filtro mal escrito. Esto
        // rompia el bucle en silencio, devolvia el historial vacio, y la
        // pantalla de cierre concluia "esta es tu primera semana".
        //
        // Costo tres semanas de conteos sin que nadie pudiera saber que
        // algo fallaba: diecisiete semanas de historial y el mismo
        // mensaje de bienvenida cada vez.
        if (!Array.isArray(rows)) {
          console.warn('[conteo] el historial no devolvio filas (HTTP ' + res.status + ')',
                       JSON.stringify(rows).slice(0, 300));
          break;
        }
        filas = filas.concat(rows);
        if (rows.length < PAGE) break;
      }
    } catch (e) {
      console.warn('[conteo] no se pudo leer el historial', e);
      return {};
    }
    if (!filas.length) {
      console.warn('[conteo] el historial vino vacio para location_id=' + locationId +
                   '. Sin el, la pantalla de cierre dira que es la primera semana.');
    }

    const porItem = {};
    for (const r of filas) {
      const k = r.item_name;
      if (!k) continue;
      // Un Map por semana, no un array suelto: la consulta pide
      // order=id.asc y el id es un UUID, asi que las filas llegan en
      // orden ALEATORIO. A una mediana le da igual; a un promedio
      // ponderado le cambia el resultado entero, y sin dar ningun error.
      const e = porItem[k] || (porItem[k] = { porSemana: new Map(), abierto: null });

      // Una semana solo cuenta una vez aunque haya filas repetidas.
      if (r.on_hand_end !== null && r.on_hand_end !== undefined && !e.porSemana.has(r.week_start)) {
        e.porSemana.set(r.week_start, Math.max(0, usedOf(r)));
      }

      // El ciclo abierto es el que no tiene cierre. De ahí sale lo que
      // deberíamos encontrar al contar. `desde` es la clave: un ciclo
      // abierto no dura necesariamente una semana.
      if (r.on_hand_end === null || r.on_hand_end === undefined) {
        e.abierto = {
          inicio: Number(r.on_hand_start || 0),
          pedido: Number(r.ordered || 0),
          desde: r.week_start || null
        };
      }
    }

    const out = {};
    for (const [k, e] of Object.entries(porItem)) {
      out[k] = {
        semanal: tipico(e.porSemana),
        semanas: e.porSemana.size,
        abierto: e.abierto
      };
    }

    _cache = { at: Date.now(), porItem: out };
    return out;
  }

  // ── Aviso 1 · falta y se mueve ───────────────────────────────────────
  function faltantesQueImportan(hist) {
    const S = window.BarStockCountSession;
    if (!S) return [];
    return S.missingRows()
      .map(r => ({ row: r, h: hist[r.item] }))
      .filter(x => x.h && x.h.semanas >= MIN_SEMANAS && x.h.semanal >= ALTA_ROTACION)
      .sort((a, b) => b.h.semanal - a.h.semanal)
      .map(x => ({ item: x.row.item, code: x.row.code || '', row: x.row, semanal: x.h.semanal }));
  }

  // ── Aviso 2 · el número no cuadra ────────────────────────────────────
  //
  // Esperado = lo que había al abrir el ciclo, más lo que se pidió, menos
  // el consumo típico de una semana. Es la misma cuenta que hace Par
  // Intelligence para cerrar un ciclo; aquí se usa al revés, para mirar
  // si lo contado se parece a lo previsible.
  //
  // Las dos condiciones son Y, no O. Solo con la relativa, un producto
  // que pasa de 0.5 a 2 botellas salta siempre aunque la diferencia sean
  // botella y media. Solo con la absoluta, no salta nada en los que se
  // mueven mucho.
  // ── Cuanto lleva abierto el ciclo ────────────────────────────────────
  //
  // Esto era un 1 implicito: se restaba SIEMPRE una semana de consumo,
  // durase lo que durase el ciclo. Desde que los ciclos se quedan
  // abiertos hasta que el usuario dice lo contrario, un ciclo de dos
  // semanas producia un esperado inflado al doble y toda la lista salia
  // como "contaste de menos".
  //
  // El suelo en 1 es porque un ciclo de tres dias no deberia esperar
  // medio consumo: el conteo se hace al final, con la semana ya corrida.
  // El techo en 8 es para que una fila abierta y olvidada hace meses no
  // lleve el esperado a cero y convierta cada producto en una alarma.
  const SEMANAS_MIN = 1;
  const SEMANAS_MAX = 8;

  function semanasAbierto(abierto) {
    if (!abierto || !abierto.desde) return SEMANAS_MIN;
    const t = Date.parse(abierto.desde + 'T00:00:00');
    if (!isFinite(t)) return SEMANAS_MIN;
    const sem = (Date.now() - t) / (7 * 86400000);
    if (!isFinite(sem)) return SEMANAS_MIN;
    return Math.min(SEMANAS_MAX, Math.max(SEMANAS_MIN, sem));
  }

  function conteosRaros(hist) {
    const S = window.BarStockCountSession;
    if (!S) return [];
    const out = [];

    // El historial esta en botellas del tamaño que se ordena, asi que lo
    // contado tiene que venir en la misma unidad o la comparacion no
    // significa nada. El tamaño sale de la fila del inventario.
    const tamaños = {};
    for (const r of (window.state && window.state.master) || []) {
      tamaños[r.item] = Number(r.bottleSizeMl) || 750;
    }

    for (const item of S.countedItems()) {
      const h = hist[item];
      if (!h || h.semanas < MIN_SEMANAS || !h.abierto) continue;

      const semanas = semanasAbierto(h.abierto);
      const esperado = Math.max(0, h.abierto.inicio + h.abierto.pedido - h.semanal * semanas);
      const contado = S.bottlesFor(item, tamaños[item] || 750);
      const dif = Math.abs(contado - esperado);

      if (dif < DESVIO_ABS) continue;
      if (esperado > 0 && (dif / esperado) < DESVIO_REL) continue;
      // Sin esperado, cualquier cosa es infinitamente distinta. Se exige
      // que lo contado sea al menos algo, o un producto nuevo con cero
      // histórico saltaría por el simple hecho de existir.
      if (esperado === 0 && contado < DESVIO_ABS) continue;

      out.push({
        item,
        contado: Math.round(contado * 100) / 100,
        esperado: Math.round(esperado * 100) / 100,
        semanal: Math.round(h.semanal * 100) / 100,
        semanas: Math.round(semanas * 10) / 10,
        dif: Math.round(dif * 100) / 100
      });
    }

    return out.sort((a, b) => b.dif - a.dif);
  }

  // Lo que consume la pantalla de cierre. Devuelve `listo: false` cuando
  // no hay historia suficiente en ningún producto: en ese caso no se
  // enseña nada, ni siquiera un aviso vacío diciendo que no hay avisos.
  async function analizar(force) {
    const hist = await historial(force);
    const items = Object.values(hist);
    const conHistoria = items.filter(h => h.semanas >= MIN_SEMANAS).length;
    if (!conHistoria) {
      // Se dice por que, con numeros. "No hay historia" a secas no
      // distingue entre un bar nuevo y una consulta rota, y son dos
      // problemas opuestos: uno se arregla contando y el otro no.
      const masSemanas = items.reduce((a, h) => Math.max(a, h.semanas || 0), 0);
      console.warn('[conteo] sin historia suficiente · ' + items.length +
        ' productos leidos, el que mas tiene llega a ' + masSemanas +
        ' semana(s) cerrada(s), hacen falta ' + MIN_SEMANAS + '.');
      return { listo: false, faltan: [], raros: [] };
    }
    const raros = conteosRaros(hist);
    return {
      listo: true,
      faltan: faltantesQueImportan(hist),
      raros,
      // Todos los productos comparten el mismo ciclo abierto, asi que la
      // ventana es una sola. Se saca de la lista para que la pantalla
      // pueda decir "menos 2.3 semanas" en vez de dejarlo a la
      // imaginacion del que lee el aviso.
      semanasCiclo: raros.length ? raros[0].semanas : null
    };
  }

  function invalidate() { _cache = null; }

  window.BarStockCountInsight = {
    analizar, invalidate,
    MIN_SEMANAS, ALTA_ROTACION, DESVIO_ABS, DESVIO_REL
  };
})();
