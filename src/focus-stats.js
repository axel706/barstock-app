(() => {
  if (window.BarStockFocusStats) return;

  // Mini-cards de la pantalla principal.
  //
  // Regla: lo que MUESTRA cada mini-card es fijo; lo que cambia es el
  // numero. Una tarjeta que rota entre datos distintos se ve bien una vez
  // y confunde siempre, porque nunca sabes que estas viendo ni puedes
  // comparar contra ayer.
  //
  // Casi todo sale de datos ya cargados en memoria. Lo unico que pide la
  // nube es Costs, y ese muestra esqueleto mientras llega.

  function fmtMoney(n) {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 10000) return '$' + Math.round(v / 1000) + 'k';
    return '$' + Math.round(v).toLocaleString();
  }

  // Antes habia aqui una copia de la regla de calendario de Order
  // History, y ni siquiera coincidian: en domingo una saltaba al lunes
  // siguiente y esta retrocedia al anterior. Las dos se van; el ciclo lo
  // define weekly_reset_at en un solo sitio.
  function inCurrentCycle(createdAt) {
    if (window.BarStockCycle) return window.BarStockCycle.contains(createdAt);
    return true;
  }

  function card(label, value, sub, color) {
    return `
      <div class="bs-fs-card">
        <div class="bs-fs-label">${label}</div>
        <div class="bs-fs-value"${color ? ` style="color:${color}"` : ''}>${value}</div>
        ${sub ? `<div class="bs-fs-sub">${sub}</div>` : ''}
      </div>`;
  }

  function skeleton() {
    return `
      <div class="bs-fs-card">
        <span class="bs-skel bs-skel-line" style="width:70%;margin:2px auto 6px"></span>
        <span class="bs-skel bs-skel-line" style="width:50%;height:16px;margin:0 auto"></span>
      </div>`;
  }

  function put(name, html) {
    const el = document.getElementById('fgStats-' + name);
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }

  // ── Inventory ──────────────────────────────────────────────────────
  function inventory() {
    const master = (window.state && state.master) || [];
    if (!master.length) return put('inventory', '');

    // "To order" es lo que FALTA por pedir, no lo que la app sugirió al
    // empezar. Antes contaba todo artículo con toOrder > 0 y se quedaba
    // clavado en la misma cifra toda la semana: colocabas la orden de
    // LOOP con 35 artículos y el número no se movía.
    //
    // Un artículo con override 0 SÍ sigue contando. Ponerlo en cero es
    // saltárselo esta semana, no resolverlo — y en la tarjeta hay que
    // seguir viéndolo como pendiente.
    const placed = (r) => (typeof isRowPlaced === 'function') && isRowPlaced(r);
    const toOrder = master.filter(r => (parseNum(r.toOrder) || 0) > 0 && !placed(r)).length;

    // Critico: menos del 25% de su par en existencia. Es el mismo umbral
    // que ya usa el semaforo de Ordering.
    const critical = master.filter(r => {
      const sug = parseNum(r.suggested) || 0;
      if (sug <= 0) return false;
      return (parseNum(r.onHand) || 0) / sug <= 0.25;
    }).length;

    // El subtitulo pasa de "of 260" a "of 67 flagged". Con la cifra
    // bajando conforme se colocan ordenes, saber contra que baja es lo
    // que la vuelve legible: 32 de 67 dice que vas a mitad de camino,
    // 32 de 260 no dice nada.
    const flagged = master.filter(r => (parseNum(r.toOrder) || 0) > 0).length;
    const toOrderSub = flagged === toOrder ? 'of ' + master.length : 'of ' + flagged + ' flagged';

    put('inventory',
      card('To order', toOrder, toOrderSub, toOrder > 0 ? '#38bdf8' : '') +
      card('Critical', critical, 'under 25%', critical > 0 ? '#f87171' : ''));

    // La descripcion la llenaba bsUpdateFocusGrid leyendo el contador del
    // header, que ya no existe. Ahora sale directo del estado.
    const sub = document.getElementById('fgSub-inventory');
    if (sub) sub.textContent = master.length + ' items loaded';
  }

  // ── Ordering ───────────────────────────────────────────────────────
  function ordering() {
    if (typeof getActiveVendors !== 'function' || typeof getOrderRowsForVendor !== 'function') return;
    const master = (window.state && state.master) || [];
    if (!master.length) return put('vendor', '');

    const vendorsList = getActiveVendors().filter(v => v !== 'ALL' && v !== 'UNKNOWN');
    let pending = 0, withRows = 0;
    vendorsList.forEach(v => {
      const rows = getOrderRowsForVendor(v);
      if (!rows.length) return;
      withRows++;
      if (typeof computeOrderSubtotal === 'function') pending += computeOrderSubtotal(rows);
    });

    // Ordenes colocadas en el ciclo actual
    const placed = (state.orderHistory || []).filter(o => inCurrentCycle(o.createdAt)).length;

    put('vendor',
      card('Pending', fmtMoney(pending), withRows + (withRows === 1 ? ' vendor' : ' vendors')) +
      card('Placed', placed, 'this cycle', placed > 0 ? '#4ade80' : ''));
  }

  // ── Order History ──────────────────────────────────────────────────
  function history() {
    const orders = (window.state && state.orderHistory) || [];
    if (!orders.length) return put('history', '');

    const cycle = orders.filter(o => inCurrentCycle(o.createdAt));
    const spent = cycle.reduce((s, o) => s + (Number(o.subtotal) || 0), 0);

    put('history',
      card('Orders', cycle.length, 'this cycle') +
      card('Spent', fmtMoney(spent), 'this cycle'));
  }

  // ── No Match ───────────────────────────────────────────────────────
  function noMatch() {
    const n = ((window.state && state.noMatches) || []).length;
    // Una sola mini-card: no hay un segundo dato que valga la pena aqui.
    put('noMatch', n > 0
      ? card('Pending', n, 'need review', '#fbbf24')
      : card('Pending', 0, 'all matched', '#4ade80'));
  }

  // ── Pour-IQ ────────────────────────────────────────────────────────
  function pourIq() {
    const map = window.parAdjustments;
    if (!map || !map.size) return put('pourIq', '');

    const master = (window.state && state.master) || [];
    let pending = 0, frees = 0;

    master.forEach(row => {
      const par = map.get(`${row.item}||${row.code || ''}`);
      if (!par || par.status !== 'active' || !par.adjustment) return;
      pending++;
      if (par.adjustment < 0) frees += (parseFloat(row.value) || 0);
    });

    put('pourIq',
      card('Pending', pending, 'adjustments', pending > 0 ? '#fbbf24' : '') +
      card('Frees up', fmtMoney(frees), 'this week', frees > 0 ? '#4ade80' : ''));
  }

  // ── Usage ──────────────────────────────────────────────────────────
  //
  // Retirada con su tarjeta. Enseñaba el porcentaje de merma medio y las
  // semanas de historia en la portada de Theoretical Usage; esa pantalla
  // ya no existe y `fgStats-theoretical` tampoco.
  //
  // No se sustituye por nada: Consumption Match tiene su propia tarjeta,
  // con la gráfica del ciclo, y las dos decían lo mismo con cifras
  // distintas. Dos números que miden lo mismo y no coinciden es peor que
  // uno solo.

  // ── Costs ──────────────────────────────────────────────────────────
  // Muestra el COGS de wine y liquor de la SEMANA PASADA en concreto, no
  // del ultimo reporte que exista. Si esa semana no se reporto, en vez de
  // dos ceros — que no dicen nada — sale un boton que invita a hacerlo.
  let _costsCache = null;
  let _costsAsked = false;

  // Este SÍ es calendario, y a proposito. Los cost reports se guardan por
  // periodo de lunes a domingo — periodFrom es literalmente un lunes — asi
  // que buscar "el reporte de la semana pasada" exige la fecha del lunes
  // anterior, no el ciclo de ordenes.
  //
  // Antes reusaba currentCycleStart(), que desaparecio al mover el ciclo a
  // BarStockCycle. La llamada quedo apuntando a una funcion inexistente,
  // loadCosts reventaba, y la tarjeta se quedaba en esqueleto para
  // siempre sin decir por que.
  function lastCalendarMonday() {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function lastWeekStart() {
    const d = lastCalendarMonday();
    d.setDate(d.getDate() - 7);
    return d;
  }

  function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function costs() {
    if (!_costsCache) {
      if (!_costsAsked) {
        _costsAsked = true;
        put('costReport', skeleton() + skeleton());
        loadCosts();
      }
      return;
    }

    const r = _costsCache.report;

    if (!r) {
      const from = isoDate(lastWeekStart());
      const to = isoDate(new Date(lastWeekStart().getTime() + 6 * 864e5));
      put('costReport', `
        <button type="button" class="bs-fs-cta"
                onclick="event.stopPropagation();BarStockFocusStats.startLastWeek('${from}','${to}')">
          <i class="ti ti-file-plus" aria-hidden="true"></i>
          <span>Report last week</span>
        </button>`);
      const sub = document.getElementById('fgSub-costReport');
      if (sub) sub.textContent = 'No report for last week';
      return;
    }

    const wc = r.wineSales   > 0 ? (r.totalWine   / r.wineSales)   * 100 : null;
    const lc = r.liquorSales > 0 ? (r.totalLiquor / r.liquorSales) * 100 : null;

    put('costReport',
      card('Wine COGS',
           wc === null ? '—' : wc.toFixed(1) + '%',
           'target ' + (r.wineTarget || 0).toFixed(0) + '%',
           wc === null ? '' : (wc > r.wineTarget ? '#f87171' : '#4ade80')) +
      card('Liquor COGS',
           lc === null ? '—' : lc.toFixed(1) + '%',
           'target ' + (r.liquorTarget || 0).toFixed(0) + '%',
           lc === null ? '' : (lc > r.liquorTarget ? '#f87171' : '#4ade80')));

    const sub = document.getElementById('fgSub-costReport');
    if (sub) sub.textContent = 'Last week · ' + String(r.periodFrom || '').slice(5);
  }

  async function loadCosts() {
    try {
      if (!window.BarStockCostReportCloud?.listReports) { _costsCache = { report: null }; return; }

      const rows = await window.BarStockCostReportCloud.listReports();
      const norm = window.BarStockCostReport?.normalizeCloudReport;
      const list = (rows || []).map(r => (norm ? norm(r) : null)).filter(Boolean);

      // Solo el reporte que empieza el lunes pasado. Un reporte de hace
      // tres semanas no responde "como me fue la semana pasada".
      const target = isoDate(lastWeekStart());
      _costsCache = { report: list.find(r => r.periodFrom === target) || null };
    } catch (e) {
      console.warn('[FocusStats] costs', e);
      _costsCache = { report: null };
    } finally {
      costs();
    }
  }

  // ── Consumption Match ──────────────────────────────────────────────
  //
  // Una sola mini-card, y dentro las barras en vez de un número.
  //
  // Las demás tarjetas resumen con dos cifras porque tienen dos cifras
  // que resumir. Aquí lo que importa es la FORMA: si el ámbar asoma por
  // encima del verde en una categoría, ahí se sirvió de más. Dos números
  // —"$1,801" y "8 categorías"— no dicen en cuál.
  //
  // Pide a la nube, como Costs, con esqueleto mientras llega. Es el
  // último ciclo cerrado, el mismo que abre la sección.
  let _cmCache = null;
  let _cmAsked = false;

  function consumption() {
    if (!_cmCache) {
      if (!_cmAsked) { _cmAsked = true; put('consumption', skeleton()); loadConsumption(); }
      return;
    }
    const { groups, week, total } = _cmCache;
    const sub = document.getElementById('fgSub-consumption');

    if (!groups || !groups.length) {
      put('consumption', '');
      if (sub) sub.textContent = 'No closed cycle yet';
      return;
    }

    // Hasta ocho: con más, cada par de barras baja de tres píxeles y deja
    // de leerse como comparación.
    const data = groups.slice(0, 8);
    const max = Math.max(...data.map(g => Math.max(g.sold, g.used)), 1);

    const bars = data.map(g => {
      const hS = Math.max(6, (g.sold / max) * 100);
      const hU = Math.max(6, (g.used / max) * 100);
      // El título nativo es lo que convierte la forma en dato concreto
      // sin gastar sitio en etiquetas que no cabrían.
      return `<span class="bs-cmspark-cat" title="${g.cat}: ${g.sold.toFixed(1)} sold, ${g.used.toFixed(1)} poured">
                <i class="bs-cmspark-b sold" style="height:${hS}%"></i>
                <i class="bs-cmspark-b used" style="height:${hU}%"></i>
              </span>`;
    }).join('');

    put('consumption', `
      <div class="bs-fs-card bs-fs-wide">
        <div class="bs-fs-label">Sold vs poured</div>
        <div class="bs-cmspark">${bars}</div>
        <div class="bs-fs-sub">${fmtMoney(total)} poured beyond sales</div>
      </div>`);

    if (sub && week) {
      sub.textContent = 'Cycle · ' + String(week).slice(5).replace('-', '‑');
    }
  }

  async function loadConsumption() {
    try {
      const TU = window.BarStockTheoreticalUsage;
      const CM = window.BarStockConsumptionMatch;
      if (!TU?.loadCycle || !CM?.group) { _cmCache = { groups: [] }; return; }

      const cycle = await TU.loadCycle();
      // Se agrupa con la MISMA función que la sección. Repetir el
      // agrupado aquí habría dejado la portada y el detalle discrepando
      // sin que nadie lo notara hasta que las cifras no cuadraran.
      const groups = CM.group(cycle.rows || [])
        .filter(g => g.withSales > 0 && (g.sold > 0 || g.used > 0));
      _cmCache = {
        groups,
        week: cycle.week,
        total: groups.reduce((s, g) => s + Math.max(0, g.loss), 0)
      };
    } catch (e) {
      console.warn('[FocusStats] consumption', e);
      _cmCache = { groups: [] };
    } finally {
      consumption();
    }
  }

  function refresh() {
    try { inventory(); } catch (e) {}
    try { ordering();  } catch (e) {}
    try { history();   } catch (e) {}
    try { noMatch();   } catch (e) {}
    try { pourIq();    } catch (e) {}

    try { costs();     } catch (e) {}
    try { consumption(); } catch (e) {}
  }

  window.BarStockFocusStats = {
    refresh,
    reloadCosts: () => { _costsCache = null; _costsAsked = false; costs(); },
    // La portada se queda con la cifra vieja tras corregir unas ventas
    // si nadie la invalida.
    reloadConsumption: () => { _cmCache = null; _cmAsked = false; consumption(); },
    // Abre Costs con la semana pasada ya seleccionada
    startLastWeek: (from, to) => {
      if (typeof bsOpenSection === 'function') bsOpenSection('costReport');
      setTimeout(() => {
        if (window.BarStockCostSteps?.pickPeriod) window.BarStockCostSteps.pickPeriod(from, to);
        if (window.BarStockCostSteps?.go) window.BarStockCostSteps.go(2);
      }, 120);
    }
  };

  // Mismo ritmo que el actualizador de la rejilla que ya existia
  window.addEventListener('load', () => {
    refresh();
    setInterval(refresh, 2000);
  });
})();
