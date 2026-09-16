(() => {
  if (window.BarStockWeeklyCycle) return;

  // ── Botón del ciclo semanal ──────────────────────────────────────────
  //
  // Un solo botón que recorre la rutina de cada lunes:
  //
  //   1 · Start new cycle    resetea el on hand (pide confirmación)
  //   2 · Load the count      bifurca: archivo o contar con el teléfono
  //   ⏺ · Counting            solo en la rama del teléfono, hasta cerrar
  //   ✓ · Cycle open          hecho, hasta el lunes siguiente
  //
  // ── Por qué el reset va antes de la bifurcación ─────────────────────
  //
  // Contar solo se alcanza desde el paso 2, o sea después de haber puesto
  // el on hand a cero. Eso cierra por construcción un agujero que existía
  // antes: escanear no tocaba `weekly_reset_at`, así que después de un
  // conteo completo el botón seguía ofreciendo "Start new cycle" y
  // pulsarlo borraba el trabajo recién hecho.
  //
  // ── Por qué el estado "contando" viene de la nube ───────────────────
  //
  // El conteo vive en el teléfono que cuenta, pero la señal de que existe
  // está en `locations.counting_since`. Con la señal en un solo
  // dispositivo, el iPad decía "Start new cycle" y ponía todo a cero en
  // mitad del conteo de otra persona.
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
  const ABANDONO_MS = 3 * 24 * 60 * 60 * 1000;   // a los 3 días deja de ser "en curso"

  let _state = 'loading';  // loading | step1 | step2 | counting | done | confirm
  let _resetAt = null;
  let _countingSince = null;
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

  // La señal compartida. Va en su propia consulta y no junto a
  // weekly_reset_at porque ese dato lo sirve BarStockCycle desde su
  // caché, y mezclarlos obligaría a invalidar ese caché cada vez que
  // alguien escanea una botella.
  async function readCountingSince() {
    const { url, key, account, name } = cfg();
    if (!url || !key || !name) return null;
    try {
      const res = await fetch(
        `${url}/rest/v1/locations?account_id=eq.${encodeURIComponent(account)}` +
        `&name=eq.${encodeURIComponent(name)}&select=counting_since`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const rows = await res.json();
      return Array.isArray(rows) && rows[0] ? rows[0].counting_since : null;
    } catch (e) {
      // Sin red no se sabe si hay conteo ajeno. Se devuelve null y el
      // botón se comporta como antes: es el lado por el que conviene
      // fallar, porque el otro bloquearía el ciclo sin poder comprobarlo.
      return null;
    }
  }

  function contandoDesdeHace() {
    if (!_countingSince) return null;
    const t = new Date(_countingSince).getTime();
    if (!isFinite(t)) return null;
    return Date.now() - t;
  }

  function abandonado() {
    const ms = contandoDesdeHace();
    return ms !== null && ms > ABANDONO_MS;
  }

  function hace(ms) {
    const min = Math.round(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + ' min';
    const h = Math.round(min / 60);
    if (h < 24) return h + ' h';
    const d = Math.round(h / 24);
    return d + (d === 1 ? ' day' : ' days');
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
    // Contando gana sobre todo lo demás. Mientras haya un conteo abierto,
    // ningún dispositivo debe ofrecer resetear ni importar: las dos cosas
    // pisarían el trabajo en marcha.
    if (_countingSince) return 'counting';
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
      btn.innerHTML = '<span class="cyc-num">2</span><span>Load the count</span>';
      btn.title = 'From a file, or count with your phone';
      return;
    }
    if (_state === 'counting') {
      const ms = contandoDesdeHace();
      const n = (window.BarStockCountSession && window.BarStockCountSession.size()) || 0;
      const total = ((window.state && window.state.master) || []).length;
      const viejo = abandonado();
      // El progreso solo se sabe en el telefono que cuenta. En los demas
      // se dice que hay un conteo y desde cuando, que es justo lo que
      // necesitan para no pisarlo.
      const cuanto = n ? (n + (total ? ' of ' + total : '')) : (ms !== null ? hace(ms) + ' ago' : '');
      btn.innerHTML =
        '<i class="ti ti-' + (viejo ? 'alert-triangle' : 'player-record') + '" aria-hidden="true"></i>' +
        '<span>' + (viejo ? 'Count abandoned' : 'Counting') + (cuanto ? ' · ' + cuanto : '') + '</span>';
      btn.title = viejo
        ? 'Started over three days ago. Pick it up or discard it.'
        : 'A count is open. Tap to pick it up.';
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
      elegirComoCargar();
      return;
    }

    if (_state === 'counting') {
      // Retomar no destruye nada, asi que no pide confirmacion. Descartar
      // si: tira el trabajo y no hay deshacer.
      if (abandonado()) {
        const ok = confirm(
          'This count was started over three days ago.\n\n' +
          'Pick it up, or press Cancel to discard it.');
        if (!ok) {
          try {
            window.BarStockCountSession?.clear(cfg().name || '');
          } catch (e) {
            // El conteo esta en OTRO telefono: aqui no hay sesion que
            // vaciar, solo hay que apagar la señal compartida.
            await apagarSenal();
          }
          await refresh();
          window.BarStockCountResume?.refresh?.();
          return;
        }
      }
      if (window.BarStockScanCount) window.BarStockScanCount.open();
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

  // ── La bifurcación ───────────────────────────────────────────────────
  //
  // Antes el paso 2 abría el selector de archivo directamente, y contar
  // con el teléfono vivía en otro botón, en otra sección, escondido. Eran
  // dos formas de hacer lo mismo y solo una estaba en la rutina.
  //
  // Es un diálogo y no dos botones en la cabecera a propósito: la
  // pregunta solo tiene sentido una vez por semana, y dos botones
  // permanentes dejarían siempre uno de los dos sin usar ocupando sitio.
  function elegirComoCargar() {
    let bg = document.getElementById('cycPickBg');
    if (!bg) {
      bg = document.createElement('div');
      bg.id = 'cycPickBg';
      bg.className = 'modalbg hidden';
      bg.innerHTML = `
        <div class="modal cyc-pick">
          <h3>How are you loading the count?</h3>
          <button type="button" class="cyc-pick-opt" id="cycPickScan">
            <i class="ti ti-scan" aria-hidden="true"></i>
            <span><b>Count with your phone</b>
              <small>Scan each bottle. Level by level for the open ones.</small></span>
          </button>
          <button type="button" class="cyc-pick-opt" id="cycPickFile">
            <i class="ti ti-file-spreadsheet" aria-hidden="true"></i>
            <span><b>Import a file</b>
              <small>The count sheet, as always.</small></span>
          </button>
          <button type="button" class="cyc-pick-x" id="cycPickX">Cancel</button>
        </div>`;
      document.body.appendChild(bg);
      bg.addEventListener('click', e => { if (e.target === bg) bg.classList.add('hidden'); });
      document.getElementById('cycPickX').onclick = () => bg.classList.add('hidden');
      document.getElementById('cycPickFile').onclick = () => {
        bg.classList.add('hidden');
        const input = document.getElementById('countFile');
        if (input) input.click();
      };
      document.getElementById('cycPickScan').onclick = () => {
        bg.classList.add('hidden');
        if (window.BarStockScanCount) window.BarStockScanCount.open();
      };
    }
    bg.classList.remove('hidden');
  }

  // Apagar la señal sin tener la sesión delante. Hace falta para
  // descartar desde un dispositivo que no es el que está contando.
  async function apagarSenal() {
    const { url, key, account, name } = cfg();
    if (!url || !key || !name) return;
    try {
      await fetch(
        `${url}/rest/v1/locations?account_id=eq.${encodeURIComponent(account || '')}` +
        `&name=eq.${encodeURIComponent(name)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal'
          },
          body: JSON.stringify({ counting_since: null })
        });
    } catch (e) { console.warn('weekly cycle: no se pudo apagar counting_since', e); }
  }

  async function refresh() {
    cancelGrace();
    _countingSince = await readCountingSince();
    try {
      // Se apoya en BarStockCycle para no hacer dos consultas de lo
      // mismo y, sobre todo, para que el boton y el resto de la app
      // nunca discrepen sobre cuando empezo el ciclo.
      if (window.BarStockCycle) {
        await window.BarStockCycle.load();
        const d = window.BarStockCycle.startedAt();
        _resetAt = d ? d.toISOString() : null;
      } else {
        _resetAt = await readResetAt();
      }
    } catch (e) {
      console.warn('weekly cycle: no se pudo leer weekly_reset_at', e);
      _resetAt = null;
    }
    _state = derive();
    paint();
  }

  // Tras importar o cerrar un conteo, el inventario cambia y el paso con
  // él. Se hace un refresh completo y no un derive() a secas porque tanto
  // `weekly_reset_at` como `counting_since` viven en la nube: sin releer,
  // el botón se quedaría en "contando" después de cerrar.
  function onDataChanged() {
    if (_state === 'confirm' || _state === 'loading') return;
    refresh();
  }

  // Mientras hay un conteo abierto, el botón se repinta solo: el tiempo
  // que lleva sube, y a los tres días tiene que cambiar a "abandonado"
  // sin que nadie recargue la página.
  setInterval(() => {
    if (_state === 'counting') paint();
  }, 60000);

  // Volver a la pestaña es el momento en que el conteo pudo cerrarse
  // desde otro dispositivo.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && _state !== 'confirm') refresh();
  });

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
