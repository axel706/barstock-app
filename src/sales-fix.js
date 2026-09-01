(() => {
  if (window.BarStockSalesFix) return;

  // ── Corregir las ventas de un artículo ───────────────────────────────
  //
  // Un solo diálogo, compartido por Theoretical Usage y por Consumption
  // Match. Las dos pantallas leen las cifras del mismo sitio, así que
  // tener dos formas de corregirlas habría sido la manera más rápida de
  // que dejaran de coincidir.
  //
  // ── Dos arreglos para dos problemas ─────────────────────────────────
  //
  // ENLAZAR resuelve "el POS le llama de otra forma". Se declara una vez
  // y vale para todas las semanas: el POS no le cambia el nombre a un
  // producto de un ciclo a otro. El número lo sigue poniendo el fichero.
  //
  // ESCRIBIR EL NÚMERO resuelve "la cifra está mal y no hay línea que
  // enlazar": la venta no se registró, o se vendió fuera del sistema.
  // Corrige un ciclo concreto y solo ese.
  //
  // El diálogo enseña primero el enlace porque es el que arregla la causa;
  // escribir el número está debajo y pide un motivo, para que dentro de
  // dos meses se sepa de dónde salió esa cifra.

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const num = (n) => Number(n || 0).toFixed(1).replace(/\.0$/, '');

  let _item = null;
  let _week = null;
  let _onDone = null;
  let _lines = [];
  let _filter = '';

  const TU = () => window.BarStockTheoreticalUsage;

  // De dónde viene la cifra actual, en una frase.
  function origin(row) {
    switch (row && row.soldSrc) {
      case 'manual':      return { txt: 'Typed in by hand', cls: 'warn' };
      case 'alias':       return { txt: 'From linked POS lines', cls: 'good' };
      case 'alias-empty': return { txt: 'Linked, but the line is not in this file', cls: 'warn' };
      case 'exact':       return { txt: 'Matched by exact name', cls: 'good' };
      case 'fuzzy':       return { txt: 'Matched by approximate name — check it', cls: 'warn' };
      default:            return { txt: 'No sales data', cls: 'bad' };
    }
  }

  async function open(itemName, weekStart, row, onDone) {
    _item = itemName; _week = weekStart; _onDone = onDone; _filter = '';
    const bg = $('sfModalBg');
    if (!bg) return;

    $('sfItem').textContent = itemName;
    const o = origin(row);
    $('sfOrigin').innerHTML = `
      <span class="sf-dot ${o.cls}"></span>
      ${esc(o.txt)}${row && row.sold !== null && row.sold !== undefined
        ? ` · <b>${num(row.sold)}</b> sold` : ''}`;

    const ov = TU().overrideFor(itemName);
    $('sfNumber').value = ov ? ov.sold : '';
    $('sfReason').value = ov ? ov.reason : '';
    $('sfClearBtn').style.display = ov ? '' : 'none';

    $('sfLines').innerHTML = `<div class="sf-loading">Reading the sales file…</div>`;
    bg.classList.remove('hidden');

    try {
      _lines = await TU().salesLines(weekStart);
    } catch (e) {
      _lines = [];
      console.warn('[salesfix] no se pudieron leer las lineas', e);
    }
    renderLines();
  }

  function renderLines() {
    const host = $('sfLines');
    if (!host) return;

    const mine = new Set(TU().aliasesFor(_item));
    const f = _filter.trim().toUpperCase();
    const shown = _lines.filter(l => !f || l.pos.includes(f));

    if (!_lines.length) {
      host.innerHTML = `<div class="sf-loading">
        No sales file loaded for this cycle. Load the liquor and wine files
        in Usage first, or type the number below.
      </div>`;
      return;
    }
    if (!shown.length) {
      host.innerHTML = `<div class="sf-loading">No line matches “${esc(_filter)}”.</div>`;
      return;
    }

    host.innerHTML = shown.slice(0, 200).map(l => {
      const linked = mine.has(l.pos);
      // Una línea que ya se lleva OTRO artículo se puede robar, pero se
      // avisa: enlazarla aquí deja al otro sin sus ventas, y descubrirlo
      // tres semanas después costaría mucho más que leer esta línea.
      const other = !linked && l.takenBy.length ? l.takenBy[0] : null;
      return `
        <div class="sf-line ${linked ? 'on' : ''} ${l.free ? 'free' : ''}"
             role="button" tabindex="0"
             onclick="window.BarStockSalesFix.toggleLine('${esc(l.pos).replace(/'/g, '&#39;')}')">
          <span class="sf-check"><i class="ti ti-check" aria-hidden="true"></i></span>
          <span class="sf-pos">${esc(l.pos)}</span>
          ${other ? `<span class="sf-taken">now: ${esc(other)}</span>` : ''}
          <span class="sf-qty">${num(l.sold)}</span>
        </div>`;
    }).join('');
  }

  async function toggleLine(pos) {
    const mine = new Set(TU().aliasesFor(_item));
    try {
      if (mine.has(pos)) await TU().removeAlias(pos);
      else await TU().saveAlias(_item, pos);
      // Se recarga la lista de la nube para que "now: X" refleje el robo
      // que se acaba de hacer, no el estado de hace un segundo.
      _lines = await TU().salesLines(_week);
      renderLines();
      if (typeof setStatus === 'function') setStatus('Sales link updated.');
    } catch (e) {
      alert('Could not save the link: ' + (e.message || String(e)));
    }
  }

  async function saveNumber() {
    const v = $('sfNumber').value;
    if (v === '' || isNaN(Number(v)) || Number(v) < 0) {
      alert('Enter the units sold, for example 6.4');
      return;
    }
    const btn = $('sfSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await TU().saveOverride(_week, _item, Number(v), $('sfReason').value.trim());
      close();
      if (typeof setStatus === 'function') setStatus(`Sales for ${_item} set to ${num(v)}.`);
      if (_onDone) _onDone();
    } catch (e) {
      alert('Could not save: ' + (e.message || String(e)));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save number'; }
    }
  }

  async function clearNumber() {
    try {
      await TU().removeOverride(_week, _item);
      close();
      if (typeof setStatus === 'function') setStatus('Manual figure removed.');
      if (_onDone) _onDone();
    } catch (e) {
      alert('Could not remove it: ' + (e.message || String(e)));
    }
  }

  function close() {
    $('sfModalBg')?.classList.add('hidden');
    // El repintado se hace al cerrar y no en cada clic: enlazar tres
    // líneas seguidas dispararía tres recálculos completos del ciclo.
    if (_onDone) _onDone();
  }

  function setFilter(v) { _filter = v; renderLines(); }

  window.BarStockSalesFix = { open, close, toggleLine, saveNumber, clearNumber, setFilter, origin };
})();
