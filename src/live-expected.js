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
        in_toast: !!(enToast && enToast(item, f)),
        // La última verificación de media semana (migración 044), o null.
        // `expected` es el LIVE al cerrar partiendo de ella: lo que Finish
        // count enseñó. Los expected/difference de la fila siguen siendo
        // los de la semana entera (los calcula Postgres), que es lo que
        // sirve para recetas y merma.
        checked: f.verificado ? {
          n: r2(f.verificado.n),
          at: f.verificado.cuando != null ? new Date(f.verificado.cuando).toISOString() : null,
          live_said: f.verificado.decia != null ? r2(f.verificado.decia) : null,
          by: f.verificado.por || null,
          expected: r2(f.live)
        } : null
      });
    }
    return out;
  }

  // ¿La base aún no tiene `checked` (la 044 sin correr)? PostgREST lo dice
  // nombrando la columna. Se mira el nombre, no cualquier error: con otro
  // fallo se repetiría a ciegas.
  const faltaChecked = (m) => /checked/.test(String(m || '')) && /column|schema cache|PGRST204|42703/i.test(String(m || ''));

  // Dice lo que contestó el servidor, tal cual: un mensaje que adivina
  // ("corre la migración 040") manda a buscar donde no es.
  async function escribir(ruta, cuerpo, prefer, metodo) {
    const c = cfg();
    const r = await fetch(c.SUPABASE_URL + '/rest/v1/' + ruta, {
      method: metodo || 'POST',
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
      let aviso = null;
      if (filas.length) {
        try { await escribir('live_expected', filas, 'return=minimal'); }
        catch (e) {
          if (!faltaChecked(e && e.message)) throw e;
          // Sin la 044: se guarda sin la verificación (mejor el esperado sin
          // ella que sin esperado) y se dice.
          await escribir('live_expected', filas.map(f => { const c = Object.assign({}, f); delete c.checked; return c; }), 'return=minimal');
          aviso = 'Saved without the mid-week checks: the checked column is missing (migration 044).';
          console.warn('[esperado] ' + aviso);
        }
      }
      return { ok: true, ciclo: cicloId, filas: filas.length, aviso };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  // ── Antes de cerrar: lo que se aleja del LIVE ────────────────────────
  //
  // Axel, 2026-11-14, sobre lámina (1, 2 y C): en "Finish count", ANTES
  // de cerrar, una tarjeta con los conteos que se alejan de lo que
  // esperaba el LIVE, que se tocan para recontar (cuando todavía no
  // cuesta nada); y después de cerrar, los tres que más pesan.
  //
  // previo() calcula lo esperado con lo MISMO que se guarda al cerrar
  // (live-stock.entre, el maestro de antes, desde el conteo anterior).
  // Primero hace el Sync de hoy: sin él, todo lo vendido hoy parecería
  // faltar. Si el Sync falla (una locación sin Toast, sin red), se
  // calcula con lo que haya y se dice (`sincronizado: false`).
  async function previo(master) {
    let sincronizado = false;
    const TS = window.BarStockToastSales;
    if (TS && TS.sincronizarHoy) {
      try { await TS.sincronizarHoy(); sincronizado = true; }
      catch (e) { console.warn('[esperado] sin el Sync de hoy:', e && e.message || e); }
    }
    const A = await antes(master);
    if (!A.desde) return { sincronizado, filas: [], precio: A.precio, enToast: () => false };
    const masterAntes = (master || []).filter(r => r && r.item)
      .map(r => Object.assign({}, r, { onHand: A.onHand[r.item] != null ? A.onHand[r.item] : 0 }));
    const v = await window.BarStockLive.entre({ master: masterAntes, conteo: A.desde, inicioCiclo: Date.parse(A.desde), ahora: Date.now() });
    const LC = window.BarStockLiveCache;
    const porNombre = new Map((master || []).map(x => [x.item, x]));
    const vendido = new Map((v.filas || []).map(f => [f.producto, Number(f.vendido) || 0]));
    return {
      sincronizado, filas: v.filas || [], precio: A.precio, desde: A.desde,
      enToast: (item) => (vendido.get(item) || 0) > 0 || !!(LC && LC.toastLoVende && LC.toastLoVende(porNombre.get(item)))
    };
  }

  // Qué sale en la lista: la regla vive en live-diagnostico.js (más de
  // UMBRAL botellas Y más de PARTE de lo vendido), la misma que el correo
  // del lunes; aquí se usa, no se copia. Lo que Toast no vende no sale:
  // sin ventas que restar, todo lo usado parecería faltar.
  const DG = window.BarStockLiveDiag;
  const UMBRAL = DG.UMBRAL, PARTE = DG.PARTE;
  // contado(item) → lo contado, o null si no se contó.
  // La verificación de media semana de una fila del LIVE, para enseñarla
  // (Axel, 2026-11-15, fase 5): cuántas, cuándo, qué decía la app y
  // quién. El esperado de la fila YA parte de ella.
  const verifDe = (f) => f && f.verificado ? {
    n: Number(f.verificado.n) || 0, cuando: f.verificado.cuando, decia: f.verificado.decia, por: f.verificado.por || ''
  } : null;

  // "Checked this week" (opción B): TODO lo verificado y contado, cuadre o
  // no, con lo contado contra lo que esperaba el LIVE desde la
  // verificación. Lo que más se separó primero.
  function verificados({ previo: P, contado }) {
    const r2 = (n) => Math.round(n * 100) / 100;
    const out = [];
    for (const f of (P && P.filas) || []) {
      const v = verifDe(f);
      if (!v) continue;
      const c = contado(f.producto);
      if (c == null) continue;
      const esperado = r2(Number(f.live) || 0);
      out.push(Object.assign({ item: f.producto, contado: r2(Number(c)), esperado, dif: r2(Number(c) - esperado) }, v));
    }
    out.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif) || a.item.localeCompare(b.item));
    return out;
  }

  function comparar({ previo: P, contado }) {
    const r2 = (n) => Math.round(n * 100) / 100;
    const lista = [];
    let hayToast = false;
    for (const f of (P && P.filas) || []) {
      if (!P.enToast(f.producto)) continue;
      hayToast = true;
      const c = contado(f.producto);
      if (c == null) continue;
      const esperado = Number(f.live) || 0;
      const dif = r2(Number(c) - esperado);
      const vendido = Number(f.vendido) || 0;
      if (!DG.seAleja(dif, vendido)) continue;
      const precio = P.precio[f.producto] > 0 ? P.precio[f.producto] : 0;
      lista.push({ item: f.producto, contado: r2(Number(c)), esperado: r2(esperado), dif, vendido,
        dinero: precio ? r2(dif * precio) : null, verificado: verifDe(f) });
    }
    // Lo que más dinero pesa primero; sin precio, por botellas.
    lista.sort((a, b) => Math.abs(b.dinero || 0) - Math.abs(a.dinero || 0) || Math.abs(b.dif) - Math.abs(a.dif));
    return {
      lista, hayToast,
      cortos: lista.filter(x => x.dif < 0).length,
      sobran: lista.filter(x => x.dif > 0).length,
      dinero: r2(lista.reduce((t, x) => t + (x.dinero || 0), 0))
    };
  }

  // ── Cerrar lo provisional ────────────────────────────────────────────
  //
  // Al cerrar el conteo, el día del cierre casi nunca está cargado entero
  // en Toast: la carga de la madrugada lo trae al día siguiente. Por eso
  // el ciclo se guarda `provisional`. Cuando TODOS sus días (los de
  // después de start_day, hasta end_day) están cargados, completos y
  // cerrados, lo vendido de cada fila se rehace con esos días, y sólo
  // esos: lo del ciclo nuevo no cuenta. Después el ciclo pasa a `final`
  // y desde ahí no se mueve (el trigger de la migración 040).
  //
  // Un día que falta (la carga falló) deja el ciclo esperando: no se sabe
  // qué pasó ese día, y cerrarlo así daría por merma lo que no se cargó.
  // Lo de antes (lo contado al abrir, lo que llegó, lo contado) no se
  // toca: es lo que la app sabía al cerrar.
  const masDia = (d, k) => new Date(Date.parse(d + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10);
  async function cerrarPendientes() {
    const U = window.BarStockToastUsage, R = window.BarStockRest;
    if (!U || !U.ventasDesde || !R) return { ok: false, error: 'The Toast usage modules are not loaded.' };
    try {
      const loc = await window.BarStockInventoryCloud.fetchLocationId();
      if (!loc) return { ok: false, error: 'No location open.' };
      const ciclos = await R.leerTodo('live_expected_cycles?location_id=eq.' + loc +
        '&status=eq.provisional&select=id,start_day,end_day,cycle_start,cycle_end&order=cycle_end.asc');
      let cerrados = 0;
      for (const c of ciclos) {
        // Del conteo anterior a éste, con los días de las puntas partidos
        // por la hora (ventasEntre): lo mismo que se guardó al cerrar.
        const v = U.ventasEntre && c.cycle_start && c.cycle_end
          ? await U.ventasEntre(c.cycle_start, c.cycle_end) : await U.ventasDesde(c.start_day);
        const dias = [];
        for (let d = masDia(c.start_day, 1); d <= c.end_day && dias.length < 60; d = masDia(d, 1)) dias.push(d);
        const cargado = new Map((v.dias || []).map(d => [d.business_date, d]));
        if (!dias.length || !dias.every(d => { const x = cargado.get(d); return x && x.complete && x.closed; })) continue;
        const filas = await R.leerTodo('live_expected?cycle_id=eq.' + c.id +
          '&select=id,cycle_id,location_id,item_name,start_count,counted&order=id.asc');
        // El primer día entra con su parte (lo de después del conteo
        // anterior); ventasEntre ya la pesó.
        const dentro = new Set([c.start_day].concat(dias));
        const porProd = new Map((v.productos || []).map(p => [p.producto, p]));
        const r3 = (n) => Math.round(n * 1000) / 1000;
        const nuevas = filas.map(f => {
          const p = porProd.get(f.item_name);
          const porDia = {};
          let sold = 0;
          for (const [d, b] of Object.entries((p && p.porDia) || {})) {
            if (!dentro.has(d)) continue;
            porDia[d] = r3(Number(b) || 0);
            sold += Number(b) || 0;
          }
          // Las columnas que una inserción exige van también: el upsert
          // por id sólo cambia lo vendido, pero PostgREST arma un INSERT.
          return { id: f.id, cycle_id: f.cycle_id, location_id: f.location_id, item_name: f.item_name,
            start_count: f.start_count, counted: f.counted, sold: r3(sold), sold_by_day: porDia };
        });
        if (nuevas.length) await escribir('live_expected?on_conflict=id', nuevas, 'resolution=merge-duplicates,return=minimal');
        await escribir('live_expected_cycles?id=eq.' + c.id, {
          status: 'final', finalized_at: new Date().toISOString(),
          sales_days: dias.map(d => ({ d, complete: true, closed: true }))
        }, 'return=minimal', 'PATCH');
        cerrados++;
      }
      return { ok: true, cerrados };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  // Solo, sin que nadie lo pida: unos segundos después de abrir la app
  // (que la sesión y la locación estén listas) y cada media hora mientras
  // siga abierta. Casi siempre es una lectura que no encuentra nada. Si
  // falla (sin sesión, un invitado que no puede escribir), se dice en la
  // consola y se vuelve a intentar a la siguiente.
  async function cerrarSolo() {
    const r = await cerrarPendientes();
    if (r && !r.ok) console.warn('[esperado] lo provisional no se cerró:', r.error);
  }
  if (typeof setTimeout === 'function') {
    setTimeout(cerrarSolo, 20000);
    if (typeof setInterval === 'function') setInterval(cerrarSolo, 30 * 60 * 1000);
  }

  window.BarStockLiveExpected = { antes, armar, guardar, cerrarPendientes, previo, comparar, verificados, UMBRAL, PARTE };
})();
