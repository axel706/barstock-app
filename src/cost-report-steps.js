(() => {
  if (window.BarStockCostSteps) return;

  // Convierte la lista larga de Cost Report en pasos, mostrando uno a la vez.
  //
  // IMPORTANTE: esto es puramente visual. No toca ningun input, ningun id,
  // ni ningun calculo. Los bloques se ocultan con display:none, asi que
  // todos los campos siguen existiendo en el DOM con sus valores intactos
  // y updatePreview() sigue leyendo exactamente lo mismo que antes.
  //
  // Por eso los pasos NO se validan ni bloquean: puedes saltar al que
  // quieras. Es una lista larga plegada, no un formulario nuevo.

  const STEPS = [
    { n: 1, label: 'Period',    icon: 'ti-calendar-event' },
    { n: 2, label: 'Purchases', icon: 'ti-truck-delivery' },
    { n: 3, label: 'Sales',     icon: 'ti-cash-banknote' },
    { n: 4, label: 'Review',    icon: 'ti-file-analytics' }
  ];
  // Saved no es un paso del flujo: es otro lugar al que ir.
  const SAVED = { n: 5, label: 'Saved', icon: 'ti-archive' };

  let _current = 1;

  function money(n) {
    const v = Number(n) || 0;
    return '$' + Math.round(v).toLocaleString();
  }

  function pct(n) {
    return (Number(n) || 0).toFixed(1) + '%';
  }

  // ── Paso 1: elegir el periodo ──────────────────────────────────────
  // El ciclo es semanal y casi siempre reportas la semana pasada. Pedir
  // dos fechas escritas es la peor forma de decir eso. Aqui se ofrecen
  // los tres periodos candidatos ya calculados; las fechas manuales
  // quedan detras de "Custom range" para el caso raro.
  //
  // Los inputs crPeriodFrom / crPeriodTo NO desaparecen: las tarjetas
  // solo los rellenan. Todo lo que lee el periodo sigue leyendo de ahi.

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function short(d) {
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  function mondayOf(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();           // 0 = domingo
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  // Los tres candidatos, segun el modo activo
  function candidates() {
    const monthly = window.BarStockCostReport?.getPeriodMode?.() === 'monthly';
    const now = new Date();

    if (monthly) {
      return [0, 1, 2].map(back => {
        const from = new Date(now.getFullYear(), now.getMonth() - back, 1);
        const to   = new Date(now.getFullYear(), now.getMonth() - back + 1, 0);
        return {
          label: back === 0 ? 'This month' : back === 1 ? 'Last month' : 'Two months ago',
          from, to, current: back === 0
        };
      });
    }

    const thisMon = mondayOf(now);
    return [0, 1, 2].map(back => {
      const from = addDays(thisMon, -7 * back);
      return {
        label: back === 0 ? 'This week' : back === 1 ? 'Last week' : 'Two weeks ago',
        from, to: addDays(from, 6), current: back === 0
      };
    });
  }

  let _savedPeriods = [];   // [{from,to,wineCogs,liquorCogs}]

  async function loadSavedPeriods() {
    try {
      if (!window.BarStockCostReportCloud?.listReports) return;
      const rows = await window.BarStockCostReportCloud.listReports();
      _savedPeriods = (rows || []).map(r => ({
        from: r.period_from || r.periodFrom || '',
        to:   r.period_to   || r.periodTo   || '',
        wineCogs:   Number(r.wine_cogs   ?? r.wineCogs   ?? 0),
        liquorCogs: Number(r.liquor_cogs ?? r.liquorCogs ?? 0)
      })).filter(r => r.from);
    } catch (e) {
      _savedPeriods = [];
    }
  }

  function alreadyReported(fromIso) {
    return _savedPeriods.some(r => r.from === fromIso);
  }

  function renderPeriodStep() {
    const wrap = document.getElementById('crPeriodCards');
    if (!wrap) return;

    const monthly = window.BarStockCostReport?.getPeriodMode?.() === 'monthly';
    const q = document.getElementById('crPeriodQuestion');
    if (q) q.textContent = monthly ? 'Which month are you reporting?' : 'Which week are you reporting?';

    const fromEl = document.getElementById('crPeriodFrom');
    const selected = fromEl ? fromEl.value : '';

    wrap.innerHTML = candidates().map(c => {
      const f = iso(c.from), t = iso(c.to);
      const on = selected === f;
      const done = alreadyReported(f);

      // La semana en curso todavia no termina: reportarla da datos parciales
      const badge = c.current
        ? '<span class="cr-pbadge cr-pbadge-mute">In progress</span>'
        : done
          ? '<span class="cr-pbadge cr-pbadge-ok"><i class="ti ti-check" aria-hidden="true"></i> Reported</span>'
          : '<span class="cr-pbadge cr-pbadge-mute">Not reported</span>';

      return `
        <button type="button" class="cr-pcard${on ? ' on' : ''}"
                onclick="BarStockCostSteps.pickPeriod('${f}','${t}')">
          <span class="cr-pcard-label">${c.label}</span>
          <span class="cr-pcard-dates">${short(c.from)}&ndash;${short(c.to)}</span>
          ${badge}
        </button>`;
    }).join('');

    renderRecent();
  }

  function renderRecent() {
    const el = document.getElementById('crRecentPeriods');
    if (!el) return;

    if (!_savedPeriods.length) {
      el.innerHTML = '<div class="cr-recent-empty">No saved reports yet.</div>';
      return;
    }

    el.innerHTML = _savedPeriods.slice(0, 5).map(r => {
      const total = (r.wineCogs + r.liquorCogs) / 2;
      return `
        <div class="cr-recent-row">
          <span>${r.from.slice(5)} &rarr; ${r.to ? r.to.slice(5) : '—'}</span>
          <span class="cr-recent-val">Wine ${r.wineCogs.toFixed(1)}%</span>
          <span class="cr-recent-val">Liquor ${r.liquorCogs.toFixed(1)}%</span>
        </div>`;
    }).join('');
  }

  function pickPeriod(from, to) {
    const f = document.getElementById('crPeriodFrom');
    const t = document.getElementById('crPeriodTo');
    if (f) f.value = from;
    if (t) t.value = to;
    if (window.BarStockCostReport?.updatePreview) window.BarStockCostReport.updatePreview();
    renderPeriodStep();
  }

  function toggleCustomRange() {
    const el = document.getElementById('crCustomRange');
    const btn = document.getElementById('crCustomToggle');
    if (!el) return;
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : '';
    if (btn) btn.classList.toggle('open', !open);
  }

  // Si escribe fechas a mano, ninguna tarjeta deberia seguir marcada
  function onDateEdited() {
    if (window.BarStockCostReport?.updatePreview) window.BarStockCostReport.updatePreview();
    renderPeriodStep();
  }

  // ── Paso 3: tarjetas por categoria ─────────────────────────────────
  // Para cuando llegas aqui el costo ya se capturo en el paso 2, asi que
  // el COGS se puede mostrar en cuanto escribes las ventas. Antes ese
  // resultado no aparecia hasta el paso 4.

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function renderSalesStep() {
    const api = window.BarStockCostReport;
    if (!api?.getValues) return;
    if (!document.getElementById('crWineCogsBig')) return;

    let v;
    try { v = api.getValues(); } catch (e) { return; }

    [
      { key: 'Wine',   cost: v.totalWine,   sales: v.wineSales,   ly: v.wineSalesLY,   target: v.wineTarget },
      { key: 'Liquor', cost: v.totalLiquor, sales: v.liquorSales, ly: v.liquorSalesLY, target: v.liquorTarget }
    ].forEach(c => {
      setText(`cr${c.key}CostEcho`, money(c.cost) === '$0' ? '$0.00' : money(c.cost));
      setText(`cr${c.key}TargetEcho`, String(c.target || 0));

      const cogs = c.sales > 0 ? (c.cost / c.sales) * 100 : null;
      setText(`cr${c.key}CogsBig`, cogs === null ? '—' : pct(cogs));

      const big = document.getElementById(`cr${c.key}CogsBig`);
      const flag = document.getElementById(`cr${c.key}Flag`);
      const gap  = document.getElementById(`cr${c.key}Gap`);

      if (cogs === null) {
        if (big)  big.className = 'cr-cat-cogs';
        if (flag) flag.innerHTML = '';
        if (gap)  gap.textContent = '';
      } else {
        const diff = cogs - (c.target || 0);
        // Rebasar el target por menos de 2 puntos no es lo mismo que
        // rebasarlo por trece. Si todo lo que se pasa sale rojo, el color
        // deja de significar algo.
        const state = diff <= 0 ? 'ok' : diff <= 2 ? 'near' : 'over';

        if (big) big.className = 'cr-cat-cogs cr-cogs-' + state;
        if (flag) {
          const label = state === 'ok' ? 'on target' : state === 'near' ? 'near target' : 'over target';
          const icon  = state === 'over' ? 'ti-arrow-up-right' : 'ti-check';
          flag.innerHTML = `<span class="cr-flag cr-flag-${state}"><i class="ti ${icon}" aria-hidden="true"></i>${label}</span>`;
        }
        if (gap) {
          gap.textContent = `${Math.abs(diff).toFixed(1)} points ${diff > 0 ? 'over' : 'under'}`;
          gap.className = 'cr-cat-gap cr-gap-' + state;
        }
      }

      // Comparacion contra el año pasado
      const d = document.getElementById(`cr${c.key}Delta`);
      if (d) {
        if (!c.ly || c.ly <= 0) {
          d.innerHTML = '<span class="cr-delta cr-delta-none">no data</span>';
        } else if (!c.sales) {
          d.innerHTML = '';
        } else {
          const change = ((c.sales - c.ly) / c.ly) * 100;
          const up = change >= 0;
          d.innerHTML = `<span class="cr-delta cr-delta-${up ? 'up' : 'down'}">
            <i class="ti ti-trending-${up ? 'up' : 'down'}" aria-hidden="true"></i>${up ? '+' : ''}${change.toFixed(1)}%</span>`;
        }
      }
    });
  }

  function toggleTarget(cat) {
    const id = cat === 'wine' ? 'crWineTargetRow' : 'crLiquorTargetRow';
    const el = document.getElementById(id);
    if (!el) return;
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'flex';
    if (!open) el.querySelector('input')?.focus();
  }

  // ── Paso 4: hallazgos ──────────────────────────────────────────────
  // Cada tabla, resumida en la frase que ibas a buscar dentro de ella.
  // Todo sale de getValues(); no hay una segunda fuente de verdad.

  function findingCard(tone, icon, title, sub) {
    return `
      <div class="cr-find">
        <span class="cr-find-ic cr-find-${tone}"><i class="ti ${icon}" aria-hidden="true"></i></span>
        <div>
          <div class="cr-find-t">${title}</div>
          ${sub ? `<div class="cr-find-s">${sub}</div>` : ''}
        </div>
      </div>`;
  }

  function renderFindings() {
    const el = document.getElementById('crFindings');
    if (!el) return;

    const api = window.BarStockCostReport;
    if (!api?.getValues) return;

    let v;
    try { v = api.getValues(); } catch (e) { return; }

    const out = [];

    // 1. Cada categoria contra su target
    [
      { name: 'Wine',   cost: v.totalWine,   sales: v.wineSales,   target: v.wineTarget },
      { name: 'Liquor', cost: v.totalLiquor, sales: v.liquorSales, target: v.liquorTarget }
    ].forEach(c => {
      if (!c.sales) return;
      const cogs = (c.cost / c.sales) * 100;
      const diff = cogs - (c.target || 0);
      const expected = c.sales * ((c.target || 0) / 100);
      const money$ = Math.abs(expected - c.cost);

      if (diff > 2) {
        out.push(findingCard('bad', 'ti-trending-up',
          `${c.name} came in ${diff.toFixed(1)} points over target`,
          `${pct(cogs)} against a ${pct(c.target)} target — ${money(money$)} more than expected`));
      } else if (diff > 0) {
        out.push(findingCard('warn', 'ti-minus',
          `${c.name} landed just above target`,
          `${pct(cogs)} against ${pct(c.target)} — ${money(money$)} over, within a couple of points`));
      } else {
        out.push(findingCard('good', 'ti-trending-down',
          `${c.name} came in ${Math.abs(diff).toFixed(1)} points under target`,
          `${pct(cogs)} against a ${pct(c.target)} target — ${money(money$)} less than expected`));
      }
    });

    // 2. Contra el año pasado
    const salesNow = v.wineSales + v.liquorSales;
    const salesLY  = v.wineSalesLY + v.liquorSalesLY;
    if (salesLY > 0 && salesNow > 0) {
      const change = ((salesNow - salesLY) / salesLY) * 100;
      const up = change >= 0;
      out.push(findingCard(up ? 'info' : 'warn',
        up ? 'ti-arrow-up-right' : 'ti-arrow-down-right',
        `Sales ${up ? 'up' : 'down'} ${Math.abs(change).toFixed(1)}% versus last year`,
        `${money(salesNow)} this period against ${money(salesLY)} — ${money(Math.abs(salesNow - salesLY))} ${up ? 'more' : 'less'}`));
    }

    // 3. Concentracion por vendor. Este dato no existe en ninguna tabla
    //    actual, pero sale de lo que ya capturaste y es accionable.
    const byV = (v.byVendor || []).map(x => ({ name: x.name, total: (x.wine || 0) + (x.liquor || 0) }));
    const grand = byV.reduce((s, x) => s + x.total, 0);
    if (grand > 0) {
      const top = byV.slice().sort((a, b) => b.total - a.total)[0];
      const share = (top.total / grand) * 100;
      if (share >= 60 && byV.filter(x => x.total > 0).length > 1) {
        out.push(findingCard('warn', 'ti-alert-triangle',
          `One vendor carried ${share.toFixed(0)}% of spend`,
          `${escHtml(top.name)} at ${money(top.total)} of ${money(grand)} — worth a second quote`));
      }
    }

    // 4. Vendors sin capturar. Hoy son filas de ceros que se ignoran;
    //    como hallazgo te hacen confirmar que no falto una factura.
    const empty = byV.filter(x => x.total === 0).map(x => x.name);
    if (empty.length && grand > 0) {
      out.push(findingCard('mute', 'ti-receipt-off',
        `${empty.length} vendor${empty.length === 1 ? '' : 's'} with no invoices`,
        `${empty.map(escHtml).join(', ')} — confirm nothing is missing`));
    }

    el.innerHTML = out.length
      ? out.join('')
      : '<div class="cr-find-empty">Capture purchases and sales to see findings here.</div>';

    renderVendorShare(byV, grand);
  }

  // Barras de reparto: quien se llevo el dinero, sin leer filas de ceros
  function renderVendorShare(byV, grand) {
    const el = document.getElementById('crVendorShare');
    if (!el) return;

    if (!grand) { el.innerHTML = ''; return; }

    const rows = byV.slice().sort((a, b) => b.total - a.total);
    el.innerHTML = '<div class="cr-share-head">Share of spend</div>' + rows.map(r => {
      const p = (r.total / grand) * 100;
      return `
        <div class="cr-share-row${r.total === 0 ? ' zero' : ''}">
          <span class="cr-share-name">${escHtml(r.name)}</span>
          <span class="cr-share-bar"><i style="width:${p}%"></i></span>
          <span class="cr-share-val">${p.toFixed(0)}%</span>
        </div>`;
    }).join('');
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function reviewTab(name) {
    document.querySelectorAll('[data-rev-pane]').forEach(p => {
      p.style.display = p.dataset.revPane === name ? '' : 'none';
    });
    document.querySelectorAll('.cr-rev-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.rev === name);
    });
  }

  // ── Panel lateral ──────────────────────────────────────────────────
  // Lee de getValues(), la MISMA fuente que usa el preview y el PDF.
  // Aqui no se calcula nada nuevo: si un numero difiere del paso 4, es
  // que algo cambio en getValues, no que haya dos verdades.
  function renderPanel() {
    // updatePreview() llama aqui en cada tecla, asi que este es el punto
    // natural para refrescar tambien las tarjetas del paso 3.
    try { renderSalesStep(); } catch (e) { console.warn('cost sales step', e); }
    try { renderFindings(); }  catch (e) { console.warn('cost findings', e); }

    const el = document.getElementById('crSidePanel');
    if (!el) return;

    const api = window.BarStockCostReport;
    if (!api || typeof api.getValues !== 'function') return;

    let v;
    try { v = api.getValues(); } catch (e) { return; }

    const wineCogs   = v.wineSales   > 0 ? (v.totalWine / v.wineSales) * 100 : 0;
    const liquorCogs = v.liquorSales > 0 ? (v.totalLiquor / v.liquorSales) * 100 : 0;

    const totalCost  = v.totalWine + v.totalLiquor;
    const totalSales = v.wineSales + v.liquorSales;
    const totalCogs  = totalSales > 0 ? (totalCost / totalSales) * 100 : 0;

    // Target combinado, ponderado por ventas de cada categoria
    const totalTarget = totalSales > 0
      ? ((v.wineTarget * v.wineSales) + (v.liquorTarget * v.liquorSales)) / totalSales
      : 0;

    const over = totalTarget > 0 && totalCogs > totalTarget;
    const cogsColor = totalSales === 0 ? 'var(--sub)' : (over ? '#f87171' : '#4ade80');

    // Progreso: cuantos vendors llevan algo capturado
    const filled = (v.byVendor || []).filter(x => (x.wine || 0) > 0 || (x.liquor || 0) > 0).length;
    const total  = (v.byVendor || []).length || 1;
    const progress = Math.round((filled / total) * 100);

    const line = (icon, label, value, color) => `
      <div class="cr-side-row">
        <span class="cr-side-label"><i class="ti ${icon}" aria-hidden="true"></i>${label}</span>
        <span class="cr-side-value"${color ? ` style="color:${color}"` : ''}>${value}</span>
      </div>`;

    // Mini-card de COGS, con el mismo formato que las de Ordering e
    // Inventory: etiqueta chica arriba, numero grande abajo.
    const mini = (label, sales, cogs, target) => {
      const has = sales > 0;
      const color = !has ? 'var(--sub)' : (cogs > target ? '#f87171' : '#4ade80');
      return `
        <div class="cr-mini">
          <div class="cr-mini-label">${label}</div>
          <div class="cr-mini-value" style="color:${color}">${has ? pct(cogs) : '—'}</div>
          <div class="cr-mini-sub">target ${pct(target)}</div>
        </div>`;
    };

    el.innerHTML = `
      <div class="cr-side-title">Summary</div>

      ${line('ti-calendar-event', 'Period',
             v.periodFrom && v.periodTo ? `${v.periodFrom.slice(5)} → ${v.periodTo.slice(5)}` : '—')}

      <div class="cr-side-sep"></div>

      <div class="cr-side-progress"><div style="width:${progress}%"></div></div>
      <div class="cr-side-progress-cap">${filled} of ${total} vendors captured</div>

      <div class="cr-side-gap"></div>

      ${line('ti-bottle',   'Wine cost',   money(v.totalWine))}
      ${line('ti-glass-full','Liquor cost', money(v.totalLiquor))}
      ${line('ti-cash-banknote', 'Sales',  money(totalSales))}

      <div class="cr-mini-grid">
        ${mini('Wine COGS',   v.wineSales,   wineCogs,   v.wineTarget)}
        ${mini('Liquor COGS', v.liquorSales, liquorCogs, v.liquorTarget)}
      </div>

      <div class="cr-side-spacer"></div>

      <button class="cr-act cr-act-pdf" onclick="BarStockCostReport.generatePdf()">
        <i class="ti ti-file-type-pdf" aria-hidden="true"></i> Generate PDF
      </button>

      <div class="cr-act-pair">
        <button class="cr-act cr-act-save" onclick="BarStockCostReport.saveReport()">
          <i class="ti ti-device-floppy" aria-hidden="true"></i> Save
        </button>
        <button class="cr-act cr-act-email" onclick="openEmailCostReportModal()">
          <i class="ti ti-mail" aria-hidden="true"></i> Email
        </button>
      </div>

      <button class="cr-act cr-act-reset" onclick="BarStockCostReport.resetForm()">
        <i class="ti ti-rotate-2" aria-hidden="true"></i> Reset
      </button>`;
  }

  function blocks() {
    return Array.from(document.querySelectorAll('[data-cr-step]'));
  }

  function show(step) {
    const n = Math.min(SAVED.n, Math.max(1, Number(step) || 1));
    _current = n;

    blocks().forEach(el => {
      const belongs = Number(el.dataset.crStep) === n;

      // crMonthlyBuildSection tiene su propia logica de visibilidad
      // (solo existe en modo mensual). No se le pisa: si el modo lo
      // oculto, se queda oculto aunque su paso este activo.
      if (el.id === 'crMonthlyBuildSection') {
        const monthly = typeof window.BarStockCostReport?.getPeriodMode === 'function'
          && window.BarStockCostReport.getPeriodMode() === 'monthly';
        el.style.display = (belongs && monthly) ? '' : 'none';
        return;
      }

      el.style.display = belongs ? '' : 'none';
    });

    renderStepper();
    renderFooter();
    renderPanel();
    if (n === 1) renderPeriodStep();

    // Al cambiar de paso el contenido cambia de alto; volver arriba evita
    // quedar mirando el vacio a media pagina.
    const sec = document.getElementById('costReportSection');
    if (sec && typeof sec.scrollIntoView === 'function') {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function chip(s, isSaved) {
    const active = s.n === _current;
    const done = !isSaved && s.n < _current;
    return `
      <button class="cr-step-chip${active ? ' active' : ''}${done ? ' done' : ''}${isSaved ? ' saved' : ''}"
              onclick="BarStockCostSteps.go(${s.n})"
              aria-current="${active ? 'step' : 'false'}">
        <span class="cr-step-num">${
          isSaved ? `<i class="ti ${s.icon}" aria-hidden="true"></i>`
                  : (done ? '<i class="ti ti-check" aria-hidden="true"></i>' : s.n)
        }</span>
        <span class="cr-step-label">${s.label}</span>
      </button>`;
  }

  function renderStepper() {
    const el = document.getElementById('crStepper');
    if (!el) return;
    el.innerHTML = STEPS.map(s => chip(s, false)).join('') + chip(SAVED, true);
  }

  function renderFooter() {
    const back = document.getElementById('crStepBack');
    const next = document.getElementById('crStepNext');
    const pos  = document.getElementById('crStepPos');
    const bl   = document.getElementById('crStepBackLabel');
    const nl   = document.getElementById('crStepNextLabel');
    if (!back || !next) return;

    // En Saved no hay flujo que navegar
    if (_current === SAVED.n) {
      back.style.visibility = 'hidden';
      next.style.visibility = 'hidden';
      if (pos) pos.textContent = 'Saved reports';
      return;
    }

    const prev = STEPS.find(s => s.n === _current - 1);
    const nxt  = STEPS.find(s => s.n === _current + 1);

    back.style.visibility = prev ? 'visible' : 'hidden';
    if (bl && prev) bl.textContent = prev.label;

    next.style.visibility = nxt ? 'visible' : 'hidden';
    if (nl && nxt) nl.textContent = nxt.label;

    if (pos) pos.textContent = `Step ${_current} of ${STEPS.length}`;
  }

  window.BarStockCostSteps = {
    go: show,
    renderPanel,
    renderPeriodStep,
    renderSalesStep,
    pickPeriod,
    toggleCustomRange,
    onDateEdited,
    toggleTarget,
    reviewTab,
    renderFindings,
    next: () => show(_current + 1),
    back: () => show(_current - 1),
    current: () => _current,
    // Para que el toggle Weekly/Monthly pueda repintar sin cambiar de paso
    refresh: () => show(_current)
  };

  // Arranca en el paso 1 cuando la seccion ya existe en el DOM
  function boot() {
    if (!document.querySelector('[data-cr-step]')) return;

    // El refresco del panel lo dispara updatePreview() desde dentro de
    // cost-report.js. No se envuelve aqui: las llamadas internas del modulo
    // no pasan por window.BarStockCostReport y se saltarian el wrapper.
    show(1);

    // Las etiquetas "Reported" necesitan la lista de reportes guardados.
    // Se pide despues de pintar para no retrasar la primera vista.
    loadSavedPeriods().then(() => {
      if (_current === 1) renderPeriodStep();
    });
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', () => setTimeout(boot, 0));
})();
