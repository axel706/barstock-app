(() => {
  if (window.BarStockWeeklyCycle) return;

  // ── Botón del ciclo semanal ──────────────────────────────────────────
  //
  // Un solo botón que recorre la rutina de cada lunes:
  //
  //   1 · Start new cycle    resetea el on hand (pide confirmación)
  //   2 · Load the count      bifurca: archivo o contar con el teléfono
  //   ⏺ · Counting            solo en la rama del teléfono, hasta cerrar
  //   ✓ · Cycle open          hecho, hasta que SE PIDA otro
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
  // ── El ciclo NO caduca solo ─────────────────────────────────────────
  //
  // Este botón trató el ciclo como semanal durante mucho tiempo: si el
  // reset era anterior al lunes en curso, volvía al paso 1. Estaba mal, y
  // costó dos intentos entenderlo.
  //
  // El primero fue mover la frontera de domingo a lunes. El segundo fue
  // comparar con cycleWeekFor en vez de weekOf, para que un conteo del
  // domingo por la noche sobreviviera a la medianoche. Los dos parchearon
  // un día concreto y dejaron intacta la premisa equivocada: que el
  // calendario cierra el ciclo. Con el segundo parche, un ciclo abierto
  // un viernes seguía muriendo solo el lunes.
  //
  // Un ciclo abierto está abierto hasta que se pida otro. Lo cierra el
  // siguiente conteo, no la medianoche del domingo. `src/cycle.js` ya lo
  // decía en su propio comentario —"el ciclo no tiene final: va desde el
  // último reset hasta ahora"— y este botón lo contradecía.
  //
  // El LUNES sigue mandando donde de verdad importa: `week_start` de los
  // snapshots es de lunes a lunes, porque el consumo y los pares se miden
  // por semana. Son dos preguntas distintas y aquí se confundían:
  //
  //   ¿a qué semana pertenece este dato?  → weekOf / cycleWeekFor, lunes
  //   ¿hay un ciclo abierto?              → weekly_reset_at, sin calendario
  //
  // Lo único que queda del calendario aquí es el AVISO: pasada una
  // semana el botón se pone ámbar y lo dice. Avisar, no reiniciar.

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

  // ── Antigüedad del ciclo ─────────────────────────────────────────────
  //
  // Lo único que aquí sigue mirando el calendario, y solo para AVISAR.
  // Pasados siete días el botón se pone ámbar y lo dice; no reinicia nada
  // ni cambia de estado. Reiniciar sigue siendo un click con su
  // confirmación, igual que siempre.
  const VIEJO_MS = 7 * 24 * 60 * 60 * 1000;

  function edadCiclo() {
    if (!_resetAt) return null;
    const t = new Date(_resetAt).getTime();
    if (!isFinite(t)) return null;
    return Date.now() - t;
  }

  function cicloViejo() {
    const ms = edadCiclo();
    return ms !== null && ms > VIEJO_MS;
  }

  // "3 weeks", "9 days". En semanas a partir de catorce días: a las tres
  // semanas "21 days" se lee como un número y "3 weeks" como un descuido,
  // que es justo lo que hay que transmitir.
  function cuantoLleva(ms) {
    const d = Math.floor(ms / 86400000);
    if (d < 14) return d + (d === 1 ? ' day' : ' days');
    const w = Math.round(d / 7);
    return w + (w === 1 ? ' week' : ' weeks');
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
      // Si la columna no existe, PostgREST responde 400 con un objeto de
      // error, no con un array. Antes eso se trataba como "no hay conteo"
      // sin decir nada, que es el peor resultado posible: el boton se
      // comporta bien a medias y no hay pista de por que.
      if (!Array.isArray(rows)) {
        if (rows && /counting_since/.test(JSON.stringify(rows))) {
          console.warn(
            'weekly cycle: falta la columna counting_since. Corre la migracion 011:\n' +
            '  alter table public.locations add column if not exists counting_since timestamptz;');
        }
        return null;
      }
      return rows[0] ? rows[0].counting_since : null;
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
    // Un sello ilegible es lo mismo que no tener ninguno. Lo que YA NO se
    // pregunta es de qué semana es: mientras exista, hay ciclo abierto.
    if (isNaN(opened.getTime())) return 'step1';
    return countLoaded() ? 'done' : 'step2';
  }

  // Todo lo que entra aquí lo genera la propia app —una fecha formateada,
  // un número de días—, pero se arma HTML con concatenación y eso no
  // conviene dejarlo suelto: el día que alguien meta el nombre de la
  // locación en uno de estos mensajes, ya está cubierto.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
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
      const abierto = 'Cycle open' + (_resetAt ? ' · ' + fmtDate(_resetAt) : '');
      const ms = edadCiclo();

      // Ciclo normal: verde y quieto. Es un estado, no una alarma.
      if (!cicloViejo()) {
        btn.innerHTML =
          '<i class="ti ti-circle-check" aria-hidden="true"></i>' +
          '<span>' + esc(abierto) + '</span>' +
          '<i class="ti ti-refresh cyc-again" aria-hidden="true"></i>';
        btn.title = 'Click to restart the cycle';
        return;
      }

      // Pasada una semana, los tres mensajes en rotación. Van APILADOS en
      // una ventana de una línea que se desplaza: los tres existen en el
      // DOM todo el tiempo, así que el lector de pantalla los lee juntos
      // y no depende del instante en que mire.
      //
      // El ancho se fija al mensaje más largo. Si no, el botón cambiaría
      // de tamaño cada tres segundos y arrastraría consigo la barra
      // superior entera, que es el tipo de movimiento que molesta sin
      // aportar. Se mide con el texto más largo de los tres, no a ojo.
      const msgs = [abierto, 'Open for ' + cuantoLleva(ms), 'Tap to restart'];
      const ancho = msgs.reduce((a, b) => (b.length > a.length ? b : a), '');

      btn.classList.add('cyc-stale');
      btn.innerHTML =
        '<i class="ti ti-alert-triangle cyc-stale-ico" aria-hidden="true"></i>' +
        '<span class="cyc-roll">' +
          // El espaciador no se ve: solo reserva el ancho para que nada salte.
          '<span class="cyc-roll-w" aria-hidden="true">' + esc(ancho) + '</span>' +
          '<span class="cyc-roll-t">' +
            msgs.map(m => '<span>' + esc(m) + '</span>').join('') +
            // El primero repetido al final para que el salto de vuelta
            // caiga en un fotograma idéntico y no se vea.
            '<span>' + esc(msgs[0]) + '</span>' +
          '</span>' +
        '</span>' +
        '<i class="ti ti-refresh cyc-again" aria-hidden="true"></i>';
      btn.title = 'Open for ' + cuantoLleva(ms) + '. Click to restart the cycle.';
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
