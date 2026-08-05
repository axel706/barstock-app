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
    { n: 1, label: 'Period',    icon: 'ti-calendar' },
    { n: 2, label: 'Purchases', icon: 'ti-truck-delivery' },
    { n: 3, label: 'Sales',     icon: 'ti-cash' },
    { n: 4, label: 'Review',    icon: 'ti-file-analytics' },
    { n: 5, label: 'Saved',     icon: 'ti-archive' }
  ];

  let _current = 1;

  function blocks() {
    return Array.from(document.querySelectorAll('[data-cr-step]'));
  }

  function show(step) {
    const n = Math.min(STEPS.length, Math.max(1, Number(step) || 1));
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

    // Al cambiar de paso el contenido cambia de alto; volver arriba evita
    // quedar mirando el vacio a media pagina.
    const sec = document.getElementById('costReportSection');
    if (sec && typeof sec.scrollIntoView === 'function') {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderStepper() {
    const el = document.getElementById('crStepper');
    if (!el) return;

    el.innerHTML = STEPS.map(s => `
      <button class="cr-step-chip${s.n === _current ? ' active' : ''}${s.n < _current ? ' done' : ''}"
              onclick="BarStockCostSteps.go(${s.n})"
              aria-current="${s.n === _current ? 'step' : 'false'}">
        <span class="cr-step-num">${s.n < _current
          ? '<i class="ti ti-check" aria-hidden="true"></i>'
          : s.n}</span>
        <span class="cr-step-label">${s.label}</span>
      </button>`).join('');
  }

  function renderFooter() {
    const back = document.getElementById('crStepBack');
    const next = document.getElementById('crStepNext');
    const dots = document.getElementById('crStepDots');
    if (!back || !next) return;

    back.style.visibility = _current === 1 ? 'hidden' : 'visible';

    // En el ultimo paso no hay "siguiente": el flujo termino
    if (_current >= STEPS.length) {
      next.style.visibility = 'hidden';
    } else {
      next.style.visibility = 'visible';
      const target = STEPS.find(s => s.n === _current + 1);
      next.innerHTML = `${target ? target.label : 'Next'} <i class="ti ti-arrow-right" aria-hidden="true"></i>`;
    }

    if (dots) {
      dots.innerHTML = STEPS.map(s =>
        `<span class="cr-dot${s.n === _current ? ' on' : ''}"></span>`
      ).join('');
    }
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
    show(1);
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', () => setTimeout(boot, 0));
})();
