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

      <!-- Los avisos van AQUÍ, antes de la pregunta de qué hacer con los
           no contados, porque cambian esa respuesta: si faltan nueve de
           alta rotación, "poner a cero" deja de ser razonable. Se llenan
           solos cuando el historial termina de leerse. -->
      <div id="cfInsight"></div>

      ${s.missing ? `
        <div class="cf-warn">
          ${s.missing} item${s.missing === 1 ? '' : 's'} never scanned.
          Closing replaces the on hand for this whole location.
        </div>

        <!-- Cuantas faltan ya se decia. Cuales no, y era el dato que
             convierte el aviso en algo accionable: "faltan 177" solo
             asusta, pero "faltan doce de Vodka" manda a alguien a un
             estante concreto. -->
        <button class="cf-toggle" id="cfToggle" type="button">
          <i class="ti ti-chevron-down" aria-hidden="true"></i>
          <span>See which ones</span>
        </button>
        <div class="cf-missing" id="cfMissing" hidden>
          <input type="text" id="cfSearch" placeholder="Search the missing" autocomplete="off">
          <div id="cfMissingList"></div>
        </div>

        <div class="cf-label">What about those ${s.missing}?</div>
        <!-- La marca sale de _mode y no esta fija en 'keep'. render() se
             vuelve a llamar despues de recontar desde un aviso, y con la
             clase escrita a mano la pantalla decia 'dejarlos como estaban'
             mientras la variable seguia en 'zero'. -->
        <button class="cf-opt${_mode === 'keep' ? ' on' : ''}" type="button" data-mode="keep">
          <b>Leave them as they were</b>
          <small>Keeps their previous count</small>
        </button>
        <button class="cf-opt${_mode === 'zero' ? ' on' : ''}" type="button" data-mode="zero">
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

    if ($('cfToggle')) {
      $('cfToggle').onclick = () => {
        const box = $('cfMissing');
        const abierto = !box.hidden;
        box.hidden = abierto;
        $('cfToggle').classList.toggle('on', !abierto);
        $('cfToggle').querySelector('span').textContent =
          abierto ? 'See which ones' : 'Hide the list';
        if (!abierto) { paintMissing(''); $('cfSearch').focus(); }
      };
      $('cfSearch').oninput = (e) => paintMissing(e.target.value);
    }

    paintInsight();
  }

  // ── Los avisos ───────────────────────────────────────────────────────
  //
  // Van en segundo plano a propósito. Leer el historial es una consulta a
  // la nube, y la pantalla de cierre tiene que abrirse al instante: nadie
  // debe esperar a la red para poder pulsar "Keep scanning". Si la
  // consulta tarda o falla, esto simplemente no aparece y todo lo demás
  // funciona igual.
  async function paintInsight() {
    const host = $('cfInsight');
    if (!host || !window.BarStockCountInsight) return;

    host.innerHTML = `<div class="cf-ins-load">
      <i class="ti ti-loader" aria-hidden="true"></i> Checking against your history…</div>`;

    let r;
    try { r = await window.BarStockCountInsight.analizar(); }
    catch (e) { console.warn('[conteo] avisos no disponibles', e); host.innerHTML = ''; return; }

    // El panel pudo cerrarse mientras se leía el historial.
    if (!$('cfInsight')) return;
    if (!r.listo || (!r.faltan.length && !r.raros.length)) {
      $('cfInsight').innerHTML = '';
      return;
    }

    const n1 = r.faltan.length, n2 = r.raros.length;
    const TOPE = 4;   // en pantalla; el resto se abre

    $('cfInsight').innerHTML = `
      ${n1 ? `
        <div class="cf-ins cf-ins-a">
          <div class="cf-ins-t">
            <i class="ti ti-alert-triangle" aria-hidden="true"></i>
            ${n1} of the missing move every week
          </div>
          <div id="cfMoveList">
            ${r.faltan.slice(0, TOPE).map(x => `
              <div class="cf-ins-row">
                <span>${esc(x.item)}</span>
                <small>${x.semanal.toFixed(1)} / week</small>
              </div>`).join('')}
          </div>
          ${n1 > TOPE ? `<button class="cf-ins-act" id="cfMoveMore" type="button">See all ${n1}</button>` : ''}
          <button class="cf-ins-act" id="cfMoveGo" type="button">
            <i class="ti ti-scan" aria-hidden="true"></i> Go count them
          </button>
        </div>` : ''}

      ${n2 ? `
        <div class="cf-ins cf-ins-b">
          <div class="cf-ins-t">
            <i class="ti ti-help-circle" aria-hidden="true"></i>
            ${n2} count${n2 === 1 ? '' : 's'} don't look right
          </div>
          ${r.raros.map((x, i) => `
            <button class="cf-ins-row cf-ins-btn" type="button" data-raro="${i}">
              <span>${esc(x.item)}</span>
              <small><b>counted ${x.contado}</b> · expected ${x.esperado}</small>
              <i class="ti ti-chevron-right" aria-hidden="true"></i>
            </button>`).join('')}
          <div class="cf-ins-note">
            Tap one to count it again. It may also be stock that arrived
            without the order being recorded — the number would be right
            and this warning wrong.
          </div>
        </div>` : ''}`;

    if ($('cfMoveMore')) {
      $('cfMoveMore').onclick = () => {
        $('cfMoveList').innerHTML = r.faltan.map(x => `
          <div class="cf-ins-row">
            <span>${esc(x.item)}</span>
            <small>${x.semanal.toFixed(1)} / week</small>
          </div>`).join('');
        $('cfMoveMore').remove();
      };
    }
    if ($('cfMoveGo')) $('cfMoveGo').onclick = () => close(true);

    // Tocar uno abre SU panel de conteo, con lo que ya se había puesto.
    // Al volver se recalcula: si el número dejó de ser raro, el aviso
    // desaparece solo y no hay que acordarse de nada.
    $('cfInsight').querySelectorAll('[data-raro]').forEach(b => {
      b.onclick = () => {
        const x = r.raros[Number(b.dataset.raro)];
        const row = ((window.state && window.state.master) || []).find(m => m.item === x.item);
        if (!row || !window.BarStockCountPanel) return;
        window.BarStockCountPanel.open(row, () => {
          // render() y no solo paintInsight(): recontar cambia el total
          // de arriba y la lista de faltantes, no solo los avisos. El
          // historial no se relee — sigue en cache.
          render();
        });
      };
    });
  }

  // ── Los que faltan ───────────────────────────────────────────────────
  //
  // Agrupados por categoría porque así está la barra: el vodka en un
  // sitio, el vino en otro. Una lista alfabética de 177 nombres obliga a
  // recorrer el local entero; agrupada, dice a qué estantes volver.
  //
  // Con buscador, porque el otro uso de esta lista es comprobar UNO: "¿le
  // di al Tito's?". Y ese caso es tan frecuente como el de repasarla
  // entera.
  function paintMissing(q) {
    const host = $('cfMissingList');
    if (!host) return;

    const filtro = String(q || '').trim().toLowerCase();
    let filas = S().missingRows();
    if (filtro) filas = filas.filter(r => String(r.item || '').toLowerCase().includes(filtro));

    if (!filas.length) {
      host.innerHTML = `<div class="cf-empty">${filtro ? 'Nothing matches' : 'Nothing missing'}</div>`;
      return;
    }

    const porCat = {};
    for (const r of filas) {
      const c = r.category || 'Uncategorised';
      (porCat[c] = porCat[c] || []).push(r);
    }

    host.innerHTML = Object.keys(porCat).sort().map(cat => `
      <div class="cf-cat">${esc(cat)} · ${porCat[cat].length}</div>
      ${porCat[cat].map(r => `
        <div class="cf-miss-row">
          <span>${esc(r.item)}</span>
          <small>was ${r.onHand ?? 0}</small>
        </div>`).join('')}
    `).join('');
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
        // runCycle acaba de CERRAR la semana anterior y abrir una nueva,
        // asi que la lista de semanas que tenga cargada Consumption Match
        // ya no dice la verdad. Sin esto, el ciclo que se acaba de cerrar
        // no aparece hasta recargar la pagina entera.
        window.BarStockTheoreticalUsage?.invalidateWeeks?.();
        window.BarStockConsumptionMatch?.reset?.();
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
