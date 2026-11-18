(() => {
  if (window.BarStockMobileTransfer) return;

  // ── La hoja "⇄ Transfer" de la ficha (docs/plan-transfer.md) ─────────
  //
  // Axel, 2026-11-18, sobre lámina: desde la ficha de un producto, de
  // dónde a dónde, cuántas y cuándo ("Now" o "Before the count"). Quien
  // lo registra pone SU producto; el de la otra locación lo elige ella al
  // confirmar (se llaman distinto: Triage Vodka en Crown, Triage House
  // Vodka en W+B). Si ya hubo un transfer entre las dos con este
  // producto, se enseña la pareja que se recuerda.
  //
  // La cantidad va con − / +, de botella en botella (un transfer es de
  // botellas cerradas), y con atajos de caja (6, 12, 24). Nada de campo
  // de texto (el zoom de iOS).

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = () => window.BarStockTransfers;
  const G = () => window.BarStockGuest;
  const quien = () => { const g = G(); return (g && g.nombre && g.nombre()) || ''; };
  function diaNY(iso) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).formatToParts(new Date(iso));
    const v = (t) => (p.find(x => x.type === t) || {}).value || '';
    return v('weekday') + ' ' + v('month') + ' ' + v('day');
  }

  // r: la fila del maestro. alTerminar(): al guardar (quien abrió repinta).
  async function abrir(r, alTerminar) {
    const t = T();
    if (!t || !r) return;
    const vieja = document.getElementById('mSheet');
    if (vieja) vieja.remove();
    const h = document.createElement('div');
    h.className = 'm-sheet';
    h.id = 'mSheet';
    h.innerHTML = `<div class="m-sheet-bg"></div>
      <div class="m-sheet-box m-kp-hoja m-tr" role="dialog" aria-label="Transfer ${esc(r.item)}">
        <div class="m-sheet-grip"></div>
        <div class="m-kp-t">Transfer ${esc(r.item)}</div>
        <div class="m-tr-cuerpo"><div class="m-kp-s">Loading…</div></div>
      </div>`;
    document.body.appendChild(h);
    const cerrar = () => h.remove();
    if (window.BarStockSheet && window.BarStockSheet.enganchar) window.BarStockSheet.enganchar(h, cerrar);
    h.querySelector('.m-sheet-bg').onclick = cerrar;
    const cuerpo = h.querySelector('.m-tr-cuerpo');

    let loc, locs, filas;
    try {
      [loc, locs, filas] = await Promise.all([window.BarStockInventoryCloud.fetchLocationId(), t.locaciones(), t.leer()]);
    } catch (e) {
      cuerpo.innerHTML = `<div class="m-kp-err">Could not load the locations: ${esc(String(e && e.message || e))}</div>`;
      return;
    }
    const otras = (locs || []).filter(l => l.id !== loc);
    if (!otras.length) { cuerpo.innerHTML = '<div class="m-kp-s">There is no other location in this account to transfer with.</div>'; return; }
    const mia = t.nombreDe(locs, loc);
    const corta = (n) => String(n || '').replace(/^the\s+/i, '');
    const LC = window.BarStockLiveCache;
    const conteo = LC && LC.conteo ? LC.conteo() : null;

    const e = { entra: true, otra: otras.length === 1 ? otras[0].id : null, qty: 1, antes: false };
    function pintar(error) {
      const pareja = e.otra ? t.pareja(filas, loc, e.otra, r.item) : null;
      const nOtra = e.otra ? t.nombreDe(locs, e.otra) : '';
      cuerpo.innerHTML = `
        <div class="m-tr-k">Direction</div>
        <div class="m-tr-seg" role="group">
          <button type="button" data-dir="in" class="${e.entra ? 'on' : ''}">Into ${esc(corta(mia))}</button>
          <button type="button" data-dir="out" class="${e.entra ? '' : 'on'}">Out of ${esc(corta(mia))}</button>
        </div>
        <div class="m-tr-k">${e.entra ? 'From' : 'To'}</div>
        <div class="m-tr-locs">${otras.map(l => `<button type="button" data-loc="${esc(l.id)}" class="m-tr-loc${e.otra === l.id ? ' on' : ''}">${esc(l.name)}</button>`).join('')}</div>
        ${e.otra ? `<div class="m-tr-par">${pareja
          ? 'Their product: <b>' + esc(pareja) + '</b> (from the last transfer)'
          : esc(nOtra) + ' picks their product when they confirm.'}</div>` : ''}
        <div class="m-tr-k">How many</div>
        <div class="m-tr-q">
          <button type="button" data-q="-1" aria-label="One less">&minus;</button>
          <span class="m-tr-n">${e.qty}</span>
          <button type="button" data-q="1" aria-label="One more">+</button>
        </div>
        <div class="m-tr-cajas">${[6, 12, 24].map(n => `<button type="button" data-n="${n}" class="${e.qty === n ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="m-tr-k">When did they ${e.entra ? 'arrive' : 'leave'}</div>
        <div class="m-tr-seg" role="group">
          <button type="button" data-cuando="ahora" class="${e.antes ? '' : 'on'}">Now</button>
          ${conteo ? `<button type="button" data-cuando="antes" class="${e.antes ? 'on' : ''}">Before the count · ${esc(diaNY(conteo))}</button>` : ''}
        </div>
        ${e.antes ? `<div class="m-kp-nota m-tr-nota">They were already on the shelf when you counted: Live won't add them again.</div>` : ''}
        <div class="m-kp-err" aria-live="polite">${error ? esc(error) : ''}</div>
        <button type="button" class="m-ro-b m-ro-go m-kp-save" id="mTrGo" ${e.otra ? '' : 'disabled'}>${
          e.otra ? 'Transfer ' + e.qty : 'Choose the other location'}</button>
        <div class="m-kp-nota">${e.otra ? esc(t.nombreDe(locs, e.otra)) + ' sees it and confirms it.' : ''}</div>`;
      cuerpo.querySelectorAll('[data-dir]').forEach(b => { b.onclick = () => { e.entra = b.dataset.dir === 'in'; pintar(); }; });
      cuerpo.querySelectorAll('[data-loc]').forEach(b => { b.onclick = () => { e.otra = b.dataset.loc; pintar(); }; });
      // Los atajos de caja: 12 botellas no son once toques de "+".
      cuerpo.querySelectorAll('[data-n]').forEach(b => { b.onclick = () => { e.qty = Number(b.dataset.n); pintar(); }; });
      cuerpo.querySelectorAll('[data-q]').forEach(b => { b.onclick = () => { e.qty = Math.max(1, e.qty + Number(b.dataset.q)); pintar(); }; });
      cuerpo.querySelectorAll('[data-cuando]').forEach(b => { b.onclick = () => { e.antes = b.dataset.cuando === 'antes'; pintar(); }; });
      const go = cuerpo.querySelector('#mTrGo');
      go.onclick = async () => {
        go.disabled = true;
        const x = await t.crear({ otra: e.otra, entra: e.entra, item: r.item, otroItem: pareja, qty: e.qty, antes: e.antes, conteo, por: quien() });
        if (!x.ok) { pintar(x.error || 'It was not saved.'); return; }
        cerrar();
        // Si una de las cuentas no se pudo (Pour·IQ, la orden), se dice: el
        // transfer está guardado, pero no todo lo que cuelga de él.
        if (window.BarStockToast) window.BarStockToast.show(x.aviso
          ? 'Transfer saved, but not everything: ' + x.aviso
          : 'Transfer saved · ' + t.nombreDe(locs, e.otra) + ' will confirm it');
        if (LC && LC.caducar) LC.caducar();
        if (alTerminar) alTerminar(x.transfer);
      };
    }
    pintar();
  }

  window.BarStockMobileTransfer = { abrir };
})();
