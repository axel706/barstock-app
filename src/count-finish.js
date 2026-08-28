(() => {
  if (window.BarStockCountFinish) return;

  // ── Cerrar el conteo ─────────────────────────────────────────────────
  //
  // Es el ÚNICO sitio de todo el conteo por escaneo que escribe en
  // inventory_items. Todo lo demás vive en la sesión del dispositivo.
  //
  // Hace lo mismo que importar un archivo de conteo, solo que los datos
  // los generaste escaneando: respaldo, reemplazo del inventario y ciclo
  // de Par Intelligence. Se apoya a propósito en la cadena que ya existe
  // y ya funciona, en vez de inventar otra.
  //
  // ── Los artículos que nadie escaneó ─────────────────────────────────
  //
  // Es la decisión delicada. Si contaste todo, lo que no apareció no
  // está y va a cero. Si te interrumpieron a mitad, poner a cero borra el
  // inventario de golpe.
  //
  // No hay forma de que el programa lo adivine, así que se pregunta. Y la
  // opción segura viene marcada: quien pulsa sin leer se lleva la que no
  // destruye nada.

  let _onCancel = null;   // volver a escanear
  let _onDone = null;     // cerrar el escáner entero
  let _mode = 'keep';     // keep | zero

  const S = () => window.BarStockCountSession;
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  function build() {
    if ($('cfPanel')) return;
    const el = document.createElement('div');
    el.id = 'cfPanel';
    el.className = 'cf-panel';
    el.innerHTML = `
      <div class="cf-head">
        <button class="sc-x" id="cfBack" type="button" aria-label="Back">
          <i class="ti ti-arrow-left" aria-hidden="true"></i>
        </button>
        <span class="cf-title">Finish count</span>
      </div>
      <div class="cf-body" id="cfBody"></div>`;
    document.body.appendChild(el);
    $('cfBack').onclick = () => close(true);
  }

  function open(onCancel, onDone) {
    build();
    _onCancel = onCancel || null;
    _onDone = onDone || null;
    _mode = 'keep';
    $('cfPanel').classList.add('on');
    render();
  }

  function render() {
    const s = S().summary();

    if (!s.counted) {
      $('cfBody').innerHTML = `
        <div class="cf-empty">Nothing counted yet.</div>
        <button class="cf-ghost" id="cfBack2" type="button">Keep scanning</button>`;
      $('cfBack2').onclick = () => close(true);
      return;
    }

    $('cfBody').innerHTML = `
      <div class="cf-count"><b>${s.counted}</b> of ${s.total} items counted</div>

      ${s.missing ? `
        <div class="cf-warn">
          ${s.missing} item${s.missing === 1 ? '' : 's'} never scanned.
          Closing replaces the on hand for this whole location.
        </div>

        <div class="cf-label">What about those ${s.missing}?</div>
        <button class="cf-opt on" type="button" data-mode="keep">
          <b>Leave them as they were</b>
          <small>Keeps their previous count</small>
        </button>
        <button class="cf-opt" type="button" data-mode="zero">
          <b>Set them to zero</b>
          <small>Only if you counted absolutely everything</small>
        </button>
      ` : `
        <div class="cf-ok">Every item was counted.</div>
      `}

      <button class="cf-ghost" id="cfMore" type="button">Keep scanning</button>
      <button class="cf-go" id="cfGo" type="button">Close the count</button>
      <div class="cf-note">A backup is taken first. It can be restored from Admin.</div>`;

    $('cfBody').querySelectorAll('.cf-opt').forEach(b => {
      b.onclick = () => {
        _mode = b.dataset.mode;
        $('cfBody').querySelectorAll('.cf-opt').forEach(x => x.classList.toggle('on', x === b));
      };
    });
    $('cfMore').onclick = () => close(true);
    $('cfGo').onclick = commit;
  }

  // ── Escribir ─────────────────────────────────────────────────────────
  async function commit() {
    const s = S().summary();
    const master = (window.state && state.master) || [];
    $('cfBody').innerHTML = `<div class="cf-status">Backing up…</div>`;

    try {
      // Respaldo ANTES de tocar nada. replaceInventoryMaster borra la
      // tabla entera y la reinserta: si algo falla a mitad, esto es lo
      // unico que devuelve el inventario a donde estaba.
      if (window.BarStockBackup) await window.BarStockBackup.snapshot('scan-count');

      $('cfBody').innerHTML = `<div class="cf-status">Applying ${s.counted} counts…</div>`;

      const counted = new Set(S().countedItems());
      master.forEach(r => {
        if (counted.has(r.item)) {
          r.onHand = S().totalFor(r.item);
        } else if (_mode === 'zero') {
          r.onHand = 0;
        }
        // Con 'keep' no se toca: conserva el valor que ya tenia.
      });

      // Recalcular lo que depende del on hand, o la pantalla quedaria
      // diciendo cosas viejas hasta la siguiente importacion.
      if (typeof recomputeAll === 'function') recomputeAll();
      else if (typeof recalc === 'function') recalc();

      $('cfBody').innerHTML = `<div class="cf-status">Saving to the cloud…</div>`;
      await window.BarStockInventoryCloud.replaceInventoryMaster(master);

      // El ciclo semanal, igual que al importar un archivo. Si falla, el
      // conteo ya esta guardado y eso es lo que no se puede perder: se
      // avisa y se sigue.
      try {
        if (window.BarStockParIntelligence) {
          await window.BarStockParIntelligence.runCycle(master);
        }
      } catch (e) {
        console.warn('conteo: el ciclo de Par Intelligence fallo', e);
      }

      // La sesion se vacia SOLO despues de que todo lo anterior salio
      // bien. Vaciarla antes y fallar al guardar seria perder el conteo
      // entero sin forma de recuperarlo.
      S().clear((window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '');

      if (typeof saveState === 'function') saveState();
      if (typeof render === 'function') render();

      $('cfBody').innerHTML = `
        <div class="cf-done"><i class="ti ti-circle-check" aria-hidden="true"></i></div>
        <div class="cf-count">Count closed</div>
        <div class="cf-note">${s.counted} items updated${
          s.missing ? (_mode === 'zero' ? `, ${s.missing} set to zero` : `, ${s.missing} left as they were`) : ''
        }.</div>
        <button class="cf-go" id="cfEnd" type="button">Done</button>`;
      $('cfEnd').onclick = () => close(false);

      if (typeof setStatus === 'function') setStatus(`Count closed · ${s.counted} items updated.`);

    } catch (e) {
      // No se vacia la sesion y no se cierra el panel: el conteo sigue
      // intacto en el dispositivo y se puede reintentar. Y se enseña el
      // error de verdad, porque en un telefono no hay consola.
      console.warn('conteo: fallo al cerrar', e);
      $('cfBody').innerHTML = `
        <div class="cf-warn">Could not close the count. Nothing was lost — your count is still saved on this phone.</div>
        <div class="cf-err">${esc(e.message || String(e))}</div>
        <button class="cf-ghost" id="cfBack3" type="button">Back</button>
        <button class="cf-go" id="cfRetry" type="button">Try again</button>`;
      $('cfBack3').onclick = () => close(true);
      $('cfRetry').onclick = commit;
    }
  }

  function close(backToScan) {
    const el = $('cfPanel');
    if (el) el.classList.remove('on');
    if (backToScan) { if (_onCancel) _onCancel(); }
    else { if (_onDone) _onDone(); }
  }

  window.BarStockCountFinish = { open, close };
})();
