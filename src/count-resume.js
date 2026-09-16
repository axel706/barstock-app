(() => {
  if (window.BarStockCountResume) return;

  // ── Conteo en curso ──────────────────────────────────────────────────
  //
  // La sesión de conteo siempre sobrevivió a cerrar el escáner: vive en
  // el dispositivo, por locación, y ni bloquear el teléfono ni quedarse
  // sin cobertura la tocan. Lo que nunca existió fue una forma de
  // ENTERARSE.
  //
  // Un conteo a medias invisible es peor que uno perdido. Quien lo dejó a
  // medias se acuerda hoy; el sábado ya no, y al no saber si queda algo
  // guardado lo prudente es empezar de cero. Así que el trabajo estaba
  // ahí, guardado, y se recontaba igualmente.
  //
  // Esta barra es todo el arreglo. No guarda nada nuevo: solo enseña lo
  // que ya había.
  //
  // ── Por qué Descartar pide confirmación y Retomar no ────────────────
  //
  // Retomar no destruye nada: si te equivocaste de botón, cierras el
  // escáner y estás donde estabas. Descartar tira una tarde de trabajo y
  // no hay deshacer, porque la sesión vive en el dispositivo y no tiene
  // respaldo en la nube. Solo uno de los dos merece un freno.

  const S = () => window.BarStockCountSession;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // "hace 40 minutos" y no una hora exacta. Lo que se quiere saber es si
  // esto es de hace un rato o de la semana pasada, y para eso una fecha
  // con hora obliga a hacer la resta mentalmente.
  function hace(iso) {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms) || ms < 0) return '';
    const min = Math.round(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} h ago`;
    const d = Math.round(h / 24);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }

  function refresh() {
    const host = document.getElementById('countResumeHost');
    if (!host) return;

    const s = S();
    if (!s || !s.exists()) { host.innerHTML = ''; return; }

    const p = s.progress();
    const cuando = p.pausedAt ? hace(p.pausedAt) : hace(p.startedAt);
    const estado = p.pausedAt ? 'Paused' : 'In progress';
    const loc = (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '';

    host.innerHTML = `
      <div class="cr-bar">
        <div class="cr-dot"></div>
        <div class="cr-txt">
          <b>${esc(estado)}${loc ? ' · ' + esc(loc) : ''}</b>
          <span>${p.counted} of ${p.total} counted · ${p.missing} left${cuando ? ' · ' + esc(cuando) : ''}</span>
        </div>
        <div class="cr-prog" aria-hidden="true"><i style="width:${p.pct}%"></i></div>
        <button type="button" class="cr-go" id="crGo">Resume</button>
        <button type="button" class="cr-drop" id="crDrop" aria-label="Discard this count">
          <i class="ti ti-trash" aria-hidden="true"></i>
        </button>
      </div>`;

    document.getElementById('crGo').onclick = () => {
      if (window.BarStockScanCount) window.BarStockScanCount.open();
    };

    document.getElementById('crDrop').onclick = () => {
      const msg = `Discard this count?\n\n${p.counted} item${p.counted === 1 ? '' : 's'} ` +
                  `already counted in ${loc || 'this location'} will be lost. ` +
                  `There is no undo: the count lives on this device and has no cloud backup.`;
      if (!confirm(msg)) return;
      try {
        // clear() exige el nombre de la locación como argumento, a
        // propósito: es una función que tira el trabajo de una tarde y no
        // debe poder dispararse desde un botón mal cableado.
        s.clear((window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '');
        refresh();
        if (typeof window.setStatus === 'function') window.setStatus('Count discarded.');
      } catch (e) {
        console.warn('[conteo] no se pudo descartar', e);
        alert('Could not discard the count.');
      }
    };
  }

  // Se refresca al arrancar y cada vez que se vuelve a la pestaña: el
  // conteo pudo pausarse desde otra pantalla del mismo teléfono.
  function boot() {
    refresh();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.BarStockCountResume = { refresh };
})();
