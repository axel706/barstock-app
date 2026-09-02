(() => {
  if (window.BarStockCountFix) return;

  // ── Corregir el conteo de cierre ─────────────────────────────────────
  //
  // "Se me pasó contar estos artículos, pero sé que están ahí."
  //
  // ── Por qué esto no es como corregir las ventas ─────────────────────
  //
  // Corregir una venta cambia una comparación y ahí acaba. Corregir el
  // conteo cambia el INVENTARIO: las botellas existen, así que sube el
  // stock de hoy, baja el "to order", sube el valor de la estantería y el
  // par óptimo se recalcula con otro consumo.
  //
  // Por eso este diálogo es distinto: enseña las consecuencias ANTES de
  // guardar. Tocar el stock a ciegas es lo que hace que dentro de un mes
  // nadie se fíe de la cifra.
  //
  // ── Se escribe el stock, no el poured ───────────────────────────────
  //
  //   poured = stock inicial + recibido − stock final
  //
  // `poured` no es un dato, es una resta. Se pide el número que sí se
  // puede saber mirando la estantería —cuántas botellas había de verdad—
  // y el poured sale solo. Pedir el poured obligaría a hacer la resta
  // mentalmente y a acertar, y el resultado sería el mismo.

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const n1 = (v) => Number(v || 0).toFixed(1).replace(/\.0$/, '');

  const TU = () => window.BarStockTheoreticalUsage;

  let _item = null, _code = '', _week = null, _onDone = null, _prev = null;

  async function open(itemName, code, weekStart, onDone) {
    _item = itemName; _code = code || ''; _week = weekStart; _onDone = onDone;
    const bg = $('cfModalBg');
    if (!bg) return;

    $('cfItem').textContent = itemName;
    $('cfWeek').textContent = 'Cycle of ' + weekStart;
    $('cfActual').value = '';
    $('cfReason').value = '';
    $('cfPreview').innerHTML = `<div class="cf-hint">Enter what was really on the shelf.</div>`;
    $('cfSaveBtn').disabled = true;
    bg.classList.remove('hidden');

    try {
      _prev = await TU().previewPourFix(weekStart, itemName, 0);
      if (_prev) {
        $('cfCounted').textContent = n1(_prev.curEnd);
        $('cfActual').placeholder = n1(_prev.curEnd);
      }
    } catch (e) {
      _prev = null;
      console.warn('[countfix] no se pudo leer el ciclo', e);
    }
  }

  // La vista previa se calcula en el navegador con los números que ya
  // trajo open(): pedirle a la nube en cada tecla sería una consulta por
  // pulsación para una resta de tres términos.
  function preview() {
    const host = $('cfPreview');
    const raw = $('cfActual').value;
    const btn = $('cfSaveBtn');
    if (!host || !_prev) return;

    if (raw === '' || isNaN(Number(raw)) || Number(raw) < 0) {
      host.innerHTML = `<div class="cf-hint">Enter what was really on the shelf.</div>`;
      if (btn) btn.disabled = true;
      return;
    }

    const val = Number(raw);
    const newUsed = _prev.start + _prev.ordered - val;
    const dUsed = newUsed - _prev.curUsed;
    const dStock = val - _prev.curEnd;

    if (newUsed < 0) {
      host.innerHTML = `
        <div class="cf-bad">
          <i class="ti ti-alert-triangle" aria-hidden="true"></i>
          More than there could have been. Starting stock plus deliveries
          was ${n1(_prev.start + _prev.ordered)}, so the closing count
          cannot be higher than that.
        </div>`;
      if (btn) btn.disabled = true;
      return;
    }

    const row = (label, from, to, cls) => `
      <div class="cf-row">
        <span class="cf-lbl">${label}</span>
        <span class="cf-from">${from}</span>
        <i class="ti ti-arrow-right cf-arr" aria-hidden="true"></i>
        <span class="cf-to ${cls || ''}">${to}</span>
      </div>`;

    host.innerHTML = `
      <div class="cf-sum">
        ${_prev.start} on hand + ${_prev.ordered} received − <b>${n1(val)}</b> left
        = <b>${n1(newUsed)}</b> poured
      </div>
      ${row('Poured this cycle', n1(_prev.curUsed), n1(newUsed), dUsed < 0 ? 'good' : dUsed > 0 ? 'bad' : '')}
      ${_prev.touchesLive
        ? row('On hand today', n1(_prev.curEnd), n1(val), dStock > 0 ? 'good' : dStock < 0 ? 'bad' : '')
        : ''}
      <div class="cf-also">
        ${_prev.touchesLive
          ? `Also recalculates <b>to order</b>, <b>shelf value</b>, the
             <b>optimal par</b> and <b>Pour-IQ</b>.`
          : `This is not the latest closed cycle, so today's stock is not
             touched. Only the figures of this cycle change.`}
      </div>
      ${_prev.closedAfter
        ? `<div class="cf-warn">
             <i class="ti ti-alert-triangle" aria-hidden="true"></i>
             ${_prev.closedAfter} later cycle${_prev.closedAfter === 1 ? '' : 's'}
             already closed. Their own subtraction depends on this number and
             will <b>not</b> be rewritten — fix those separately if they matter.
           </div>`
        : ''}`;

    if (btn) btn.disabled = false;
  }

  async function save() {
    const val = Number($('cfActual').value);
    const reason = $('cfReason').value.trim();
    if (isNaN(val) || val < 0) return;
    if (!reason) {
      alert('Say why. A stock figure nobody can justify is worse than a wrong one.');
      $('cfReason').focus();
      return;
    }

    const btn = $('cfSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const r = await TU().savePourFix(_week, _item, _code, val, reason);
      close();
      if (typeof setStatus === 'function') {
        setStatus(r.live
          ? `${_item}: poured ${n1(r.used)}, on hand today ${n1(r.stock)}.`
          : `${_item}: poured ${n1(r.used)} for that cycle.`);
      }
      if (_onDone) _onDone();
    } catch (e) {
      alert('Could not save: ' + (e.message || String(e)));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
    }
  }

  function close() { $('cfModalBg')?.classList.add('hidden'); }

  window.BarStockCountFix = { open, close, preview, save };
})();
