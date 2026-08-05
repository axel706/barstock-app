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

  // ── Panel lateral ──────────────────────────────────────────────────
  // Lee de getValues(), la MISMA fuente que usa el preview y el PDF.
  // Aqui no se calcula nada nuevo: si un numero difiere del paso 4, es
  // que algo cambio en getValues, no que haya dos verdades.
  function renderPanel() {
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

    el.innerHTML = `
      <div class="cr-side-head"><i class="ti ti-report-analytics" aria-hidden="true"></i> Summary</div>

      ${line('ti-calendar-event', 'Period',
             v.periodFrom && v.periodTo ? `${v.periodFrom.slice(5)} → ${v.periodTo.slice(5)}` : '—')}

      <div class="cr-side-sep"></div>

      ${line('ti-bottle',   'Wine cost',   money(v.totalWine))}
      ${line('ti-glass-full','Liquor cost', money(v.totalLiquor))}
      ${line('ti-cash-banknote', 'Sales',  money(totalSales))}

      <div class="cr-side-sep"></div>

      ${line('ti-percentage', 'Wine COGS', v.wineSales ? pct(wineCogs) : '—',
             v.wineSales ? (wineCogs > v.wineTarget ? '#f87171' : '#4ade80') : '')}
      ${line('ti-percentage', 'Liquor COGS', v.liquorSales ? pct(liquorCogs) : '—',
             v.liquorSales ? (liquorCogs > v.liquorTarget ? '#f87171' : '#4ade80') : '')}

      <div class="cr-side-sep"></div>

      <div class="cr-side-total">
        <div class="cr-side-total-num" style="color:${cogsColor}">${totalSales ? pct(totalCogs) : '—'}</div>
        <div class="cr-side-total-cap">total COGS${totalTarget ? ` · target ${pct(totalTarget)}` : ''}</div>
      </div>

      <div class="cr-side-progress"><div style="width:${progress}%"></div></div>
      <div class="cr-side-progress-cap">${filled} of ${total} vendors captured</div>

      <div class="cr-side-spacer"></div>

      <button class="cr-act cr-act-primary" onclick="BarStockCostReport.generatePdf()">
        <i class="ti ti-file-type-pdf" aria-hidden="true"></i> Generate PDF
      </button>

      <div class="cr-act-pair">
        <button class="cr-act cr-act-second" onclick="BarStockCostReport.saveReport()">
          <i class="ti ti-device-floppy" aria-hidden="true"></i> Save
        </button>
        <button class="cr-act cr-act-second" onclick="openEmailCostReportModal()">
          <i class="ti ti-mail" aria-hidden="true"></i> Email
        </button>
      </div>

      <button class="cr-act cr-act-ghost" onclick="BarStockCostReport.resetForm()">
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
    next: () => show(_current + 1),
    back: () => show(_current - 1),
    current: () => _current,
    // Para que el toggle Weekly/Monthly pueda repintar sin cambiar de paso
    refresh: () => show(_current)
  };

  // Arranca en el paso 1 cuando la seccion ya existe en el DOM
  function boot() {
    if (!document.querySelector('[data-cr-step]')) return;

    // Cada input del formulario ya llama a updatePreview(). En vez de
    // enganchar 20 listeners, se envuelve esa funcion: cuando el preview
    // se recalcula, el panel tambien. Asi nunca se desincronizan.
    const api = window.BarStockCostReport;
    if (api && typeof api.updatePreview === 'function' && !api.__panelHooked) {
      const original = api.updatePreview;
      api.updatePreview = function () {
        const out = original.apply(this, arguments);
        try { renderPanel(); } catch (e) { console.warn('cost panel', e); }
        return out;
      };
      api.__panelHooked = true;
    }

    show(1);
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', () => setTimeout(boot, 0));
})();
