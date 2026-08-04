(() => {
  if (window.BarStockToast) return;

  // Los 94 mensajes de la app pasan por setStatus(). En vez de tocar los
  // 94 lugares, este modulo se engancha ahi y los convierte en avisos
  // flotantes. El statusBar se sigue actualizando por si algo lo lee.

  const DURATION_MS = 4000;
  const MAX_VISIBLE = 3;

  let container = null;

  function ensureContainer() {
    if (container && document.body.contains(container)) return container;
    container = document.createElement('div');
    container.id = 'bsToastContainer';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
    return container;
  }

  // El tono se deduce del texto. No es perfecto, pero cubre los mensajes
  // reales de la app sin tener que reescribir los 94 llamados.
  function toneFor(msg) {
    const m = String(msg || '').toLowerCase();

    if (/(fail|failed|error|could not|couldn't|no se pudo|not saved|denied|invalid)/.test(m)) {
      return 'error';
    }
    if (/(warning|warn|skipped|blocked|locally only|with warnings|pending)/.test(m)) {
      return 'warn';
    }
    if (/(placed|saved|imported|updated|synced|loaded|sent|reset|created|deleted|applied|complete|ready|copied)/.test(m) ||
        /(cargado|guardado|actualizado|enviado|listo|aplicado|creado|eliminado)/.test(m)) {
      return 'ok';
    }
    return 'info';
  }

  const ICONS = {
    ok:    'M13 27l9 9 17-18',
    warn:  null,
    error: null,
    info:  null
  };

  function buildIcon(tone) {
    if (tone === 'ok') {
      return '<svg class="bs-toast-ic" viewBox="0 0 52 52" aria-hidden="true">' +
             '<path d="' + ICONS.ok + '" fill="none" stroke="currentColor" stroke-width="5" ' +
             'stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="46" stroke-dashoffset="46"/></svg>';
    }
    if (tone === 'error') {
      return '<svg class="bs-toast-ic" viewBox="0 0 52 52" aria-hidden="true">' +
             '<path d="M17 17l18 18M35 17L17 35" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>';
    }
    if (tone === 'warn') {
      return '<svg class="bs-toast-ic" viewBox="0 0 52 52" aria-hidden="true">' +
             '<path d="M26 14v16M26 38v.5" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>';
    }
    return '<svg class="bs-toast-ic" viewBox="0 0 52 52" aria-hidden="true">' +
           '<circle cx="26" cy="26" r="4" fill="currentColor"/></svg>';
  }

  function dismiss(el) {
    if (!el || el.dataset.leaving === '1') return;
    el.dataset.leaving = '1';
    el.classList.add('bs-toast-out');
    setTimeout(() => el.remove(), 260);
  }

  function show(msg, opts) {
    const text = String(msg == null ? '' : msg).trim();
    if (!text) return;

    const root = ensureContainer();
    const tone = (opts && opts.tone) || toneFor(text);

    // Si el mismo mensaje ya esta en pantalla, reiniciar su tiempo en vez
    // de apilar duplicados. render() puede disparar el mismo status varias
    // veces seguidas y se veria como spam.
    const existing = Array.from(root.children).find(
      c => c.dataset.msg === text && c.dataset.leaving !== '1'
    );
    if (existing) {
      clearTimeout(Number(existing.dataset.timer));
      existing.dataset.timer = String(setTimeout(() => dismiss(existing), DURATION_MS));
      return;
    }

    const el = document.createElement('div');
    el.className = 'bs-toast bs-toast-' + tone;
    el.dataset.msg = text;
    el.innerHTML = buildIcon(tone) + '<span class="bs-toast-msg"></span>';
    el.querySelector('.bs-toast-msg').textContent = text;

    // Click para cerrar: si aparece algo largo y estorba, se quita.
    el.addEventListener('click', () => {
      clearTimeout(Number(el.dataset.timer));
      dismiss(el);
    });

    root.appendChild(el);

    // No dejar que se acumulen: los mas viejos salen.
    const live = Array.from(root.children).filter(c => c.dataset.leaving !== '1');
    if (live.length > MAX_VISIBLE) {
      live.slice(0, live.length - MAX_VISIBLE).forEach(dismiss);
    }

    el.dataset.timer = String(setTimeout(() => dismiss(el), DURATION_MS));
  }

  window.BarStockToast = { show, dismiss };

  // ── Enganche a setStatus ────────────────────────────────────────
  // Se envuelve la funcion original en vez de reemplazarla, para que
  // el statusBar siga actualizandose igual que siempre. Si algo del
  // codigo viejo depende de leer ese texto, no se rompe.
  function hook() {
    if (typeof window.setStatus !== 'function' || window.__bsToastHooked) return;
    const original = window.setStatus;
    window.setStatus = function (msg) {
      try { original.call(this, msg); } catch (e) { console.warn(e); }
      try { show(msg); } catch (e) { console.warn(e); }
    };
    window.__bsToastHooked = true;
  }

  if (document.readyState === 'complete') {
    hook();
  } else {
    window.addEventListener('load', () => setTimeout(hook, 0));
  }
})();
