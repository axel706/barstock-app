/* ── ¿De dónde sale la demanda de cada producto? ─────────────────────
 *
 * SÓLO LECTURA. No hace ni un GET propio: lee la fila de run-out que la
 * app ya calculó (BarStockLiveCache.fila), con su demanda
 * (pedido.demanda: las semanas, la mediana de las 13 y de las 4
 * últimas, y Pour·IQ). No escribe nada.
 *
 *   1. Abre app.barstockpro.com en la locación, en el Home (que la
 *      tarjeta de Running out ya haya salido).
 *   2. Consola. Pega este archivo entero y Enter.
 *   3. (async () => { await bsDemanda(); })();
 *      (async () => { await bsDemanda('Laboure'); })();   ← uno, con sus 13 semanas
 *
 * Por qué existe (Axel, 2026-11-19): la demanda semanal es lo MAYOR de
 * Pour·IQ y la mediana de las 4 últimas semanas de Toast. Lo reciente
 * entró por el Nino (de 1.3 a 3.3 un miércoles, de verdad), pero en un
 * producto lento cuatro semanas son pocas, y quedarse con lo mayor de
 * dos cifras que bailan infla la demanda: el Laboure Roi decía "Selling
 * 2× its usual". Antes de cambiar la regla, ver en cuántos productos
 * pasa y si es casualidad o de verdad.
 *
 * "Salto" = cuánto se aleja lo reciente de lo de siempre, medido en lo
 * que ese producto baila por casualidad: la desviación de sus semanas
 * de ANTES de las 4 últimas, entre √4 (lo que bailaría una mediana de
 * cuatro semanas sin que nada cambie). Un salto de 1 es ruido; de 3,
 * difícil que lo sea.
 *
 * "Propuesta": lo que daría la regla que se está pensando, SIN aplicar:
 * lo reciente cuenta con peso Z = 1 − 1/salto² (0 si el salto es 1 o
 * menos), y la demanda es lo mayor de Pour·IQ y eso.
 */
(() => {
  const n1 = (x) => x == null || !isFinite(x) ? '—' : (Math.round(x * 10) / 10).toFixed(1);
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const desv = (xs) => {
    if (xs.length < 2) return 0;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
  };

  function analizar(r, f) {
    const d = f.dem;
    const tot = d.totales || [];
    const antes = tot.length > 4 ? tot.slice(0, -4) : tot;
    const se = desv(antes) / 2;
    const m13 = d.m13, m4 = d.reciente;
    // Sin variación antes (semanas idénticas), cualquier salto es de verdad.
    const gap = (m4 || 0) - m13;
    const salto = !(m4 > 0) ? null : se > 0 ? gap / se : (gap > 0 ? Infinity : 0);
    const z = salto != null && salto > 1 ? 1 - 1 / (salto * salto) : 0;
    const pq = f.pouriq ? Number(f.pouriq.avg) : null;
    const recCreido = m13 + z * Math.max(0, (m4 || 0) - m13);
    const base = pq != null ? pq : m13;
    const propuesta = pq != null ? Math.max(pq, recCreido) : (m4 > 0 ? (m4 > m13 ? recCreido : m4) : m13);
    return {
      producto: r.item, 'Pour·IQ': n1(pq), m13: n1(m13), 'm4 (reciente)': n1(m4),
      'ahora/sem': n1(d.semanal), manda: d.fuente, 'subió +': n1(d.semanal - base),
      salto: salto == null ? '—' : salto === Infinity ? '∞' : n1(salto), 'propuesta/sem': n1(propuesta),
      _sube: d.semanal - base, _semanas: tot
    };
  }

  window.bsDemanda = async function (texto) {
    const LC = window.BarStockLiveCache;
    if (!LC || !LC.fila) { console.log('Falta BarStockLiveCache (¿app sin recargar?).'); return; }
    if (LC.cargar) { try { await LC.cargar(); } catch (e) { } }
    const master = ((window.state && window.state.master) || []).filter(r => r && r.item);
    const q = texto ? norm(texto) : null;
    const filas = [];
    let sinTotales = false;
    for (const r of master) {
      if (q && !norm(r.item).includes(q)) continue;
      const f = LC.fila(r);
      if (!f || !f.dem) continue;
      if (!f.dem.totales) { sinTotales = true; continue; }
      filas.push(analizar(r, f));
    }
    if (sinTotales && !filas.length) { console.log('La demanda no trae sus semanas: la app es de antes de esta herramienta. Recarga.'); return; }
    if (!filas.length) { console.log(q ? 'Ningún producto con demanda de Toast contiene "' + texto + '".' : 'Ningún producto con demanda de Toast (¿el LIVE no ha cargado?).'); return; }
    filas.sort((a, b) => b._sube - a._sube);
    if (q) {
      for (const x of filas) {
        console.log('━━ ' + x.producto + ' ━━');
        console.log('13 semanas, de la más vieja a la última: ' + x._semanas.map(n1).join(' · '));
      }
    } else {
      const subieron = filas.filter(x => x.manda === 'toast-recent');
      console.log(filas.length + ' productos con demanda de Toast. En ' + subieron.length +
        ' manda lo reciente de Toast sobre Pour·IQ. Ordenados por cuánto subió su demanda por eso:');
    }
    console.table(filas.map(x => { const o = Object.assign({}, x); delete o._sube; delete o._semanas; return o; }));
  };
  console.log('Listo');
})();
