(() => {
  if (window.BarStockWeeklyCycle) return;

  // ── Botón del ciclo semanal ──────────────────────────────────────────
  //
  // Un solo botón que recorre la rutina de cada lunes:
  //
  //   1 · Start new cycle    resetea el on hand (pide confirmación)
  //   2 · Import weekly count carga el archivo del conteo
  //   ✓ · Cycle open          hecho, hasta el lunes siguiente
  //
  // El paso NO se recuerda, se DEDUCE del estado real. Esa fue la
  // decisión de diseño que importa: si se guardara en la sesión, al
  // cerrarla el botón volvería al paso 1 con el conteo ya cargado, y el
  // primer click borraría el trabajo del día. Deduciéndolo, el botón dice
  // lo mismo en cualquier dispositivo y después de cualquier recarga.
  //
  // Las dos señales, ambas en la nube:
  //   locations.weekly_reset_at  → cuándo se abrió el ciclo
  //   algún artículo con on_hand > 0 → ya se importó el conteo
  //
  // La frontera es el LUNES: Axel cuenta los lunes. Con la frontera en
  // domingo, un conteo hecho en sábado hacía brincar el botón al paso 1
  // a la medianoche siguiente.

  const GRACE_MS = 4000;   // ventana para confirmar el reinicio

  let _state = 'loading';  // loading | step1 | step2 | done | confirm
  let _resetAt = null;
  let _graceTimer = null;
  let _rafId = null;

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY, account: c.ACCOUNT_ID, name: c.LOCATION_NAME };
  }

  // Lunes 00:00 más reciente, en hora local
  function lastMonday() {
    const d = new Date();
    const day = d.getDay();               // 0 domingo … 6 sábado
    const back = (day === 0) ? 6 : day - 1;
    d.setDate(d.getDate() - back);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async function readResetAt() {
    const { url, key, account, name } = cfg();
    if (!url || !key || !name) return null;
    const res = await fetch(
      `${url}/rest/v1/locations?account_id=eq.${encodeURIComponent(account)}` +
      `&name=eq.${encodeURIComponent(name)}&select=weekly_reset_at`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0].weekly_reset_at : null;
  }

  function countLoaded() {
    const master = (window.state && state.master) || [];
    if (!master.length) return false;
    // Tras el reset todo queda en cero; al importar el conteo, la mayoría
    // deja de estarlo. Se lee del inventario y no de una bandera local,
    // así el estado es el mismo desde cualquier navegador.
    return master.some(r => Number(r.onHand || 0) > 0);
  }

  function derive() {
    if (_resetAt === null) return 'step1';
    const opened = new Date(_resetAt);
    if (isNaN(opened.getTime()) || opened < lastMonday()) return 'step1';
    return countLoaded() ? 'done' : 'step2';
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) { return ''; }
  }

  // ── Dibujado ───────────────────────────────────────────────────────
  function paint() {
    const btn = document.getElementById('cycleBtn');
    if (!btn) return;

    btn.className = 'cyc-btn cyc-' + _state;
    btn.disabled = (_state === 'loading');

    if (_state === 'loading') {
      btn.innerHTML = '<span class="cyc-num">·</span><span>Checking cycle…</span>';
      return;
    }
    if (_state === 'step1') {
      btn.innerHTML = '<span class="cyc-num">1</span><span>Start new cycle</span>';
      btn.title = 'Resets on hand to zero for this location';
      return;
    }
    if (_state === 'step2') {
      btn.innerHTML = '<span class="cyc-num">2</span><span>Import weekly count</span>';
      btn.title = 'Load this week’s count file';
      return;
    }
    if (_state === 'done') {
      btn.innerHTML =
        '<i class="ti ti-circle-check" aria-hidden="true"></i>' +
        '<span>Cycle open' + (_resetAt ? ' · ' + fmtDate(_resetAt) : '') + '</span>' +
        '<i class="ti ti-refresh cyc-again" aria-hidden="true"></i>';
      btn.title = 'Click to restart the cycle';
      return;
    }
    // confirm
    btn.innerHTML =
      '<i class="ti ti-alert-triangle" aria-hidden="true"></i>' +
      '<span>Restart cycle?</span>' +
      '<span class="cyc-bar"><span class="cyc-bar-fill"></span></span>';
    btn.title = 'Click again to restart';
    runGrace();
  }

  // La ventana de gracia es el seguro contra el roce accidental: si nadie
  // confirma, el botón vuelve solo a completado y no pasó nada.
  function runGrace() {
    const start = Date.now();
    cancelGrace();
    const tick = () => {
      const left = 1 - (Date.now() - start) / GRACE_MS;
      const fill = document.querySelector('#cycleBtn .cyc-bar-fill');
      if (left <= 0) { _state = 'done'; paint(); return; }
      if (fill) fill.style.width = (left * 100) + '%';
      _rafId = requestAnimationFrame(tick);
    };
    _rafId = requestAnimationFrame(tick);
  }

  function cancelGrace() {
    if (_rafId) cancelAnimationFrame(_rafId);
    clearTimeout(_graceTimer);
    _rafId = null;
  }

  // ── Acciones ───────────────────────────────────────────────────────
  async function onClick() {
    if (_state === 'loading') return;

    if (_state === 'step1') {
      // resetOnHand ya pide confirmación y actualiza weekly_reset_at
      if (typeof resetOnHand === 'function') await resetOnHand();
      await refresh();
      return;
    }

    if (_state === 'step2') {
      const input = document.getElementById('countFile');
      if (input) input.click();
      return;
    }

    if (_state === 'done') {
      _state = 'confirm';
      paint();
      return;
    }

    if (_state === 'confirm') {
      cancelGrace();
      _state = 'step1';
      paint();
    }
  }

  async function refresh() {
    cancelGrace();
    try {
      _resetAt = await readResetAt();
    } catch (e) {
      console.warn('weekly cycle: no se pudo leer weekly_reset_at', e);
      _resetAt = null;
    }
    _state = derive();
    paint();
  }

  // Tras importar el conteo, el inventario cambia y el paso con él
  function onDataChanged() {
    if (_state === 'confirm' || _state === 'loading') return;
    const next = derive();
    if (next !== _state) { _state = next; paint(); }
  }

  function boot() {
    const btn = document.getElementById('cycleBtn');
    if (!btn) return;
    btn.addEventListener('click', onClick);
    paint();
    refresh();
    if (window.BarStockEvents && typeof window.BarStockEvents.on === 'function') {
      window.BarStockEvents.on('inventoryUpdated', onDataChanged);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.BarStockWeeklyCycle = { refresh, onDataChanged };
})();
