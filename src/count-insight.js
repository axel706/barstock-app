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

  // La mediana y no la media: una semana de fiesta con el triple de
  // consumo arrastra un promedio de ocho semanas lo suficiente para que
  // el resto del año parezca anómalo. La mediana la ignora.
  function mediana(nums) {
    if (!nums.length) return 0;
    const a = nums.slice().sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
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

    let locationId;
    try { locationId = await window.BarStockParIntelligence.fetchLocationId(); }
    catch (e) { return {}; }
    if (!locationId) return {};

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
        if (!Array.isArray(rows)) break;
        filas = filas.concat(rows);
        if (rows.length < PAGE) break;
      }
    } catch (e) {
      console.warn('[conteo] no se pudo leer el historial', e);
      return {};
    }

    const porItem = {};
    for (const r of filas) {
      const k = r.item_name;
      if (!k) continue;
      const e = porItem[k] || (porItem[k] = { usos: [], semanas: new Set(), abierto: null });

      // Una semana solo cuenta una vez aunque haya filas repetidas.
      if (r.on_hand_end !== null && r.on_hand_end !== undefined && !e.semanas.has(r.week_start)) {
        e.semanas.add(r.week_start);
        e.usos.push(Math.max(0, usedOf(r)));
      }

      // El ciclo abierto es el que no tiene cierre. De ahí sale lo que
      // deberíamos encontrar al contar.
      if (r.on_hand_end === null || r.on_hand_end === undefined) {
        e.abierto = {
          inicio: Number(r.on_hand_start || 0),
          pedido: Number(r.ordered || 0)
        };
      }
    }

    const out = {};
    for (const [k, e] of Object.entries(porItem)) {
      out[k] = {
        semanal: mediana(e.usos),
        semanas: e.usos.length,
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
  function conteosRaros(hist) {
    const S = window.BarStockCountSession;
    if (!S) return [];
    const out = [];

    for (const item of S.countedItems()) {
      const h = hist[item];
      if (!h || h.semanas < MIN_SEMANAS || !h.abierto) continue;

      const esperado = Math.max(0, h.abierto.inicio + h.abierto.pedido - h.semanal);
      const contado = S.totalFor(item);
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
    const conHistoria = Object.values(hist).filter(h => h.semanas >= MIN_SEMANAS).length;
    if (!conHistoria) return { listo: false, faltan: [], raros: [] };
    return {
      listo: true,
      faltan: faltantesQueImportan(hist),
      raros: conteosRaros(hist)
    };
  }

  function invalidate() { _cache = null; }

  window.BarStockCountInsight = {
    analizar, invalidate,
    MIN_SEMANAS, ALTA_ROTACION, DESVIO_ABS, DESVIO_REL
  };
})();
