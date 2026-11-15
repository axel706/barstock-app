(() => {
  if (window.BarStockLiveExpected) return;

  // ── El esperado: el LIVE al cerrar el ciclo, contra lo contado ───────
  //
  // Axel, 2026-11-14 (el plan entero en docs/plan-esperado.md): el LIVE
  // justo antes de reiniciar el ciclo es lo que DEBERÍA haber en la
  // estantería. Puesto al lado de lo que se acaba de contar, la
  // diferencia, semana tras semana, señala recetas o pours mal puestos,
  // merma o robo, y errores al contar; y dirá cuánto falla el LIVE de
  // cada producto (lo que sustituirá la media botella fija de run-out).
  //
  // Se guarda en las tablas de la migración 040, NUNCA en on_hand ni en
  // inventory_snapshots: aquí no se escribe nada del conteo (lo vigila
  // test-toast-no-toca-conteo.js).
  //
  // ── Dos momentos ─────────────────────────────────────────────────────
  //
  // count-finish.js llama a antes() ANTES del bucle que escribe el on
  // hand nuevo: lo contado al abrir es lo que había, y el conteo anterior
  // es el instante desde el que corre el LIVE. Después de cerrar, si el
  // conteo abrió ciclo, llama a guardar() SIN esperarla: el conteo ya
  // está guardado y no puede depender de esto.
  //
  // ── El LIVE es el de la app ──────────────────────────────────────────
  //
  // live-stock.entre() arma las filas con la MISMA función que el LIVE
  // que enseña la app (armarFilas), con el maestro de antes, desde el
  // conteo anterior y hasta el cierre. Si esto lo calculara por su lado,
  // el esperado y el "≈" de Inventory acabarían diciendo cosas distintas.
  //
  // ── Las ventas del día del conteo ────────────────────────────────────
  //
  // Toast guarda por día. El LIVE no descuenta el día de su conteo (lee
  // desde el día siguiente), así que ese día es del ciclo que se cierra:
  // cada día cuenta en un solo ciclo. Supone que se cuenta con el bar ya
  // cerrado (no se le ha preguntado a Axel todavía). Y como el día del
  // cierre puede no estar entero cargado, el ciclo se guarda
  // `provisional`; cerrarlo con las ventas completas es la siguiente
  // pieza.

  const cfg = () => window.BARSTOCK_CONFIG || {};
  const num = (v) => (typeof window.parseNum === 'function' ? window.parseNum(v) : Number(v) || 0);

  // Lo de antes del conteo: el conteo anterior y, por producto, lo que
  // había y su precio. Copiado: el conteo escribe encima del maestro.
  async function antes(master) {
    const U = window.BarStockToastUsage;
    const desde = U && U.ultimoConteo ? await U.ultimoConteo() : null;
    const onHand = {}, precio = {};
    for (const r of master || []) {
      if (!r || !r.item) continue;
      onHand[r.item] = Number(r.onHand) || 0;
      precio[r.item] = num(r.value);
    }
    return { desde: desde ? new Date(desde).toISOString() : null, onHand, precio };
  }

  // Las filas, sin red. vivo: las de live-stock (con contado = lo de antes).
  function armar({ antes: A, vivo, contados, master, cicloId, loc, enToast }) {
    const nuevo = new Map((master || []).filter(r => r && r.item).map(r => [r.item, Number(r.onHand) || 0]));
    const deVivo = new Map((vivo || []).map(f => [f.producto, f]));
    const r2 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
    const out = [];
    for (const item of contados || []) {
      if (!nuevo.has(item)) continue;
      const f = deVivo.get(item) || {};
      out.push({
        cycle_id: cicloId, location_id: loc, item_name: item,
        start_count: r2(A.onHand[item]),
        arrived: r2(f.llego),
        arrivals: (f.llegadas || []).map(l => ({ n: l.n, cuando: l.cuando != null ? new Date(l.cuando).toISOString() : null, de: l.de || null })),
        sold: r2(f.vendido),
        sold_by_day: f.porDia || {},
        counted: r2(nuevo.get(item)),
        unit_price: A.precio[item] > 0 ? A.precio[item] : null,
        in_toast: !!(enToast && enToast(item, f))
      });
    }
    return out;
  }

  // Dice lo que contestó el servidor, tal cual: un mensaje que adivina
  // ("corre la migración 040") manda a buscar donde no es.
  async function escribir(ruta, cuerpo, prefer) {
    const c = cfg();
    const r = await fetch(c.SUPABASE_URL + '/rest/v1/' + ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: c.SUPABASE_KEY, Authorization: 'Bearer ' + c.SUPABASE_KEY, Prefer: prefer },
      body: JSON.stringify(cuerpo)
    });
    const texto = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + texto.slice(0, 300));
    try { return texto ? JSON.parse(texto) : null; } catch (e) { return null; }
  }

  // { antes, master (ya con lo contado), contados: [nombres], hasta (ms) }
  // → { ok, ciclo, filas } o { ok: false, error }
  async function guardar(o) {
    const A = o && o.antes;
    if (!A || !A.desde) return { ok: false, error: 'No previous count is known: there is nothing to measure the cycle from.' };
    const contados = (o.contados || []).filter(Boolean);
    if (!contados.length) return { ok: false, error: 'Nothing was counted.' };
    const U = window.BarStockToastUsage, L = window.BarStockLive;
    if (!U || !L || !L.entre) return { ok: false, error: 'The LIVE modules are not loaded.' };
    try {
      const hasta = o.hasta == null ? Date.now() : o.hasta;
      const loc = await window.BarStockInventoryCloud.fetchLocationId();
      // El maestro de ANTES: los mismos productos, con lo que había.
      const masterAntes = (o.master || []).filter(r => r && r.item)
        .map(r => Object.assign({}, r, { onHand: A.onHand[r.item] != null ? A.onHand[r.item] : 0 }));
      const v = await L.entre({ master: masterAntes, conteo: A.desde, inicioCiclo: Date.parse(A.desde), ahora: hasta });
      const ciclo = {
        location_id: loc,
        cycle_start: A.desde,
        cycle_end: new Date(hasta).toISOString(),
        start_day: U.diaDeNegocio(A.desde),
        end_day: U.diaDeNegocio(hasta),
        status: 'provisional',
        sales_days: (v.dias || []).map(d => ({ d: d.business_date, complete: !!d.complete, closed: !!d.closed })),
        unconverted: v.sinConvertir || []
      };
      const r = await escribir('live_expected_cycles', ciclo, 'return=representation');
      const cicloId = Array.isArray(r) && r[0] && r[0].id;
      if (!cicloId) return { ok: false, error: 'The cycle was saved without an id coming back.' };
      const LC = window.BarStockLiveCache;
      const porNombre = new Map((o.master || []).map(x => [x.item, x]));
      const filas = armar({ antes: A, vivo: v.filas, contados, master: o.master, cicloId, loc,
        enToast: (item, f) => (Number(f && f.vendido) > 0) || !!(LC && LC.toastLoVende && LC.toastLoVende(porNombre.get(item))) });
      if (filas.length) await escribir('live_expected', filas, 'return=minimal');
      return { ok: true, ciclo: cicloId, filas: filas.length };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  window.BarStockLiveExpected = { antes, armar, guardar };
})();
