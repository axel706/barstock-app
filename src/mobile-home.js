(() => {
  if (window.BarStockMobileHome) return;

  // ── Home del teléfono ────────────────────────────────────────────────
  //
  // No calcula nada nuevo. Todos estos números ya los produce la app:
  // el estado del ciclo, los avisos del cierre, los pares pendientes, el
  // gasto de la semana. Lo que no existía es un sitio donde estuvieran
  // JUNTOS — hoy viven en cinco pantallas distintas.
  //
  // ── El orden está decidido, no es casual ─────────────────────────────
  //
  //   1. buscar        lo más frecuente. Nunca se mueve de sitio: una
  //                    barra de búsqueda que cambia de posición según el
  //                    día no sirve de nada.
  //   2. ahora mismo   UNA tarjeta grande, la que importa hoy.
  //   3. te esperan    sólo lo que de verdad tiene algo. Una lista con
  //                    cuatro renglones en cero se deja de leer en una
  //                    semana.
  //   4. el dinero     contexto, no acción. Nadie abre la app a las once
  //                    de la noche por el gasto semanal.
  //
  // ── Y nada dice cero mientras no se sabe ─────────────────────────────
  //
  // Cada bloque empieza en "…" y se rellena cuando su consulta vuelve.
  // Ya nos costó caro: un historial que no cargaba se leía como "esta es
  // tu primera semana", y así estuvo diecisiete semanas. Un "$0 gastados"
  // porque la consulta no ha vuelto es exactamente el mismo fallo.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

  function cfgNombre() {
    const c = window.BARSTOCK_CONFIG || {};
    return c.LOCATION_NAME || '';
  }

  function hoy() {
    return new Date().toLocaleDateString('en-US', { weekday: 'long' });
  }

  // ── La tarjeta de "ahora mismo" ──────────────────────────────────────
  //
  // Una sola, y gana la que tenga fecha limite. Una tarjeta que va
  // rotando entre varios avisos cada vez que abres la app no se aprende
  // nunca.
  function ahoraMismo() {
    const S = window.BarStockCountSession;

    // Conteo a medias: es lo mas urgente que puede haber, porque hay
    // trabajo empezado que se pierde si nadie lo cierra.
    if (S && S.exists && S.exists()) {
      const p = S.progress ? S.progress() : null;
      const n = p ? p.counted : (S.size ? S.size() : 0);
      const t = p ? p.total : 0;
      const pct = t ? Math.round((n / t) * 100) : 0;
      return {
        tono: 'verde',
        rotulo: 'RIGHT NOW',
        titulo: (S.isPaused && S.isPaused()) ? 'Count paused' : 'Count in progress',
        sub: n + ' of ' + t + ' items',
        barra: pct,
        accion: 'Keep counting',
        onClick: () => {
          if (window.BarStockScanCount && window.BarStockScanCount.open) window.BarStockScanCount.open();
        }
      };
    }

    // Orden sin colocar. El proveedor con mas dinero pendiente.
    if (typeof window.getActiveVendors === 'function' &&
        typeof window.getOrderRowsForVendor === 'function' &&
        typeof window.computeOrderSubtotal === 'function') {
      let mejor = null;
      for (const v of window.getActiveVendors()) {
        if (v === 'UNKNOWN') continue;
        const filas = window.getOrderRowsForVendor(v);
        if (!filas.length) continue;
        const total = window.computeOrderSubtotal(filas);
        const btl = filas.reduce((a, r) => a + (Number(window.getEffectiveOrder(r)) || 0), 0);
        if (!mejor || total > mejor.total) mejor = { v, filas, total, btl };
      }
      if (mejor) {
        return {
          tono: 'azul',
          rotulo: 'RIGHT NOW',
          titulo: mejor.v + ' order not placed',
          sub: mejor.filas.length + ' items · ' + Math.round(mejor.btl) + ' bottles · ' + money(mejor.total),
          accion: 'Review the order',
          onClick: () => window.BarStockMobile.ir('orders')
        };
      }
    }

    return {
      tono: 'calma',
      rotulo: 'RIGHT NOW',
      titulo: 'Nothing pending',
      sub: 'No open count and no orders waiting.',
      accion: 'Start a count',
      onClick: () => {
        if (window.BarStockScanCount && window.BarStockScanCount.open) window.BarStockScanCount.open();
      }
    };
  }

  // ── Lo que te espera ─────────────────────────────────────────────────
  //
  // Solo lo que tiene numero. Un renglon en cero no es informacion, es
  // ruido que enseña a no leer la lista.
  function pendientes() {
    const out = [];

    const par = window.parAdjustments;
    if (par && par.size) {
      let n = 0, ejemplo = '';
      for (const [k, v] of par) {
        if (v && v.status === 'active' && v.adjustment) {
          n++;
          if (!ejemplo) ejemplo = k.split('||')[0] + ' goes ' + v.currentSuggested + ' → ' + v.suggestedOptimal;
        }
      }
      if (n) out.push({ icono: 'ti-brain', color: '#a78bfa', t: n + ' par' + (n === 1 ? '' : 's') + ' to adjust', s: ejemplo, n, ir: 'pourIq' });
    }

    const D = window.BarStockDormant;
    if (D && D.listo && D.listo()) {
      const n = D.cuantos((window.state && window.state.master) || []);
      if (n) out.push({ icono: 'ti-eye-off', color: '#64748b', t: n + ' hidden items', s: 'No stock, no par, no movement', n, ir: 'inventory' });
    }

    return out;
  }

  // ── Dinero ───────────────────────────────────────────────────────────

  // El valor del estante sale de BarStockInventoryValue.compute(), que
  // es quien ya lo calcula para la pantalla de inventario. Sumarlo
  // aparte aqui seria permitir que dos pantallas dieran cifras
  // distintas del mismo dinero — el fallo que mas veces ha mordido a
  // este proyecto.
  //
  // Devuelve null —y la tarjeta pone "…"— mientras no haya nada que
  // sumar. Un "$0 en el estante" con 260 articulos no es un cero, es
  // una pantalla pintada antes de que llegaran los datos, y de esos
  // ceros ya nos comimos uno que duro diecisiete semanas.
  function enElEstante() {
    const V = window.BarStockInventoryValue;
    if (!V || typeof V.compute !== 'function') return null;
    let d;
    try { d = V.compute(); } catch (e) { return null; }
    if (!d || !d.items) return null;
    // Con todos los articulos sin precio el total es cero de verdad,
    // pero no es una cifra util: es "falta cargar los precios".
    if (!d.total && d.noPrice >= d.items) return null;
    return { total: d.total, n: d.items, sinPrecio: d.noPrice };
  }

  // ── Pintar ───────────────────────────────────────────────────────────

  function render(host) {
    if (!host) return;

    const a = ahoraMismo();
    const pend = pendientes();
    const est = enElEstante();

    host.innerHTML = `
      <header class="m-head">
        <div>
          <div class="m-loc">${esc(cfgNombre())}</div>
          <div class="m-day">${esc(hoy())}</div>
        </div>
        <button type="button" class="m-ico" id="mhSet" aria-label="Settings">
          <i class="ti ti-settings" aria-hidden="true"></i>
        </button>
      </header>

      <button type="button" class="m-searchbar" id="mhSearch">
        <i class="ti ti-search" aria-hidden="true"></i>
        <span>Do we have…</span>
      </button>

      <section class="m-now m-now-${a.tono}">
        <div class="m-now-lab">${esc(a.rotulo)}</div>
        <div class="m-now-t">${esc(a.titulo)}</div>
        <div class="m-now-s">${esc(a.sub)}</div>
        ${a.barra !== undefined ? `<div class="m-bar"><i style="width:${a.barra}%"></i></div>` : ''}
        <button type="button" class="m-now-go" id="mhGo">${esc(a.accion)}</button>
      </section>

      ${pend.length ? `
        <div class="m-lab">NEEDS YOU</div>
        <div class="m-list">
          ${pend.map((p, i) => `
            <button type="button" class="m-item" data-go="${i}">
              <i class="ti ${esc(p.icono)}" style="color:${esc(p.color)}" aria-hidden="true"></i>
              <span class="m-item-t">${esc(p.t)}<small>${esc(p.s)}</small></span>
              <b style="color:${esc(p.color)}">${esc(p.n)}</b>
              <i class="ti ti-chevron-right m-chev" aria-hidden="true"></i>
            </button>`).join('')}
        </div>` : ''}

      <div class="m-lab">THIS WEEK</div>
      <div class="m-money">
        <div class="m-money-c">
          <span>Spent this week</span>
          <b id="mhSpent">…</b>
          <small id="mhSpentD">&nbsp;</small>
        </div>
        <div class="m-money-c">
          <span>On the shelf</span>
          <b>${est ? money(est.total) : '…'}</b>
          <small>${est
            ? est.n + ' items' + (est.sinPrecio ? ' · ' + est.sinPrecio + ' with no price' : '')
            : '&nbsp;'}</small>
        </div>
      </div>`;

    const go = host.querySelector('#mhGo');
    if (go) go.onclick = a.onClick;

    const set = host.querySelector('#mhSet');
    if (set) set.onclick = () => { if (typeof window.openSettings === 'function') window.openSettings(); };

    const bus = host.querySelector('#mhSearch');
    if (bus) bus.onclick = () => window.BarStockMobile.ir('search');

    host.querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => {
        const p = pend[Number(b.dataset.go)];
        if (p && p.ir) window.BarStockMobile.ir(p.ir);
      };
    });

    gastoSemana(host);
  }

  // El gasto se saca de BarStockSpend.compute(), que es quien ya lo
  // calcula para la pantalla de historial. Volver a sumarlo aqui seria
  // permitir que dos pantallas dieran cifras distintas del mismo dinero
  // — el fallo que mas veces ha mordido a este proyecto.
  //
  // Si el modulo no esta o falla, se pone un guion. Nunca un cero: una
  // cifra falsa que parece real es peor que un hueco.
  function gastoSemana(host) {
    const el = host.querySelector('#mhSpent');
    const d = host.querySelector('#mhSpentD');
    if (!el) return;
    try {
      if (!window.BarStockSpend || typeof window.BarStockSpend.compute !== 'function') {
        el.textContent = '—'; return;
      }
      const r = window.BarStockSpend.compute();
      if (!r || !r.now) { el.textContent = '—'; return; }
      // Sin historial de ordenes cargado, cero es "todavia no se" y no
      // "no gastaste nada esta semana".
      if (!r.now.total && !r.prev.total) { el.textContent = '…'; return; }
      el.textContent = money(r.now.total);
      if (d && r.totalDelta != null && r.totalPct !== null) {
        const up = r.totalDelta >= 0;
        d.textContent = (up ? '↗ +' : '↘ −') + money(Math.abs(r.totalDelta)).slice(1);
        d.className = up ? 'm-up' : 'm-down';
      }
    } catch (e) {
      console.warn('[movil] gasto de la semana', e);
      el.textContent = '—';
    }
  }

  // Lo llama quien termina de cargar datos: el Home se pinta antes de
  // que lleguen el inventario y las ordenes, y sin esto se queda con
  // los huecos puestos hasta que cambias de pestaña y vuelves.
  function refresh() {
    const host = document.querySelector('.m-screen[data-screen="home"]');
    if (host && host.classList.contains('on')) render(host);
  }

  window.BarStockMobileHome = { render, refresh };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      id: 'home', icon: 'ti-home', label: 'Home', tab: true, orden: 10,
      mount: render,
      show: render   // se repinta al entrar: el estado del ciclo cambia
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
