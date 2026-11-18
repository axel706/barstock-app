(() => {
  if (window.BarStockCheckShelf) return;

  // ── Decir lo que hay en la estantería (Axel, 2026-11-18, lámina C) ───
  //
  // Un transfer que se contó el domingo y cuya factura llegó el lunes
  // dejó el LIVE de Triage Vodka con 12 de más, y el único sitio para
  // corregirlo era "I have enough" de Running out, que sólo sale en lo
  // que se acaba. Ahora el lápiz junto al número grande (la tarjeta de
  // "Do we have" y la ficha) abre el mismo teclado en cualquier
  // producto.
  //
  // Es la MISMA verificación que "I have enough" (stock-checks.js): el
  // LIVE parte de ese número hasta el siguiente conteo, on_hand no se
  // toca, sale en Finish count y no añade nada a la lista de compras.
  // Running out llama aquí también: un solo teclado para las dos.
  //
  // Permiso "Count" (`contar`), como "I have enough".

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n1 = (x) => (Math.round((Number(x) || 0) * 10) / 10).toFixed(1);
  const G = () => window.BarStockGuest;
  const puede = () => { const g = G(); return !g || !g.puede || g.puede('contar'); };
  const quien = () => { const g = G(); return (g && g.nombre && g.nombre()) || ''; };

  // alGuardar(n, queda): después de guardar, para quien quiera apuntarlo
  // ya (Running out lo deja en su tarjeta sin esperar a releer).
  function abrir(r, op) {
    op = op || {};
    const LC = window.BarStockLiveCache;
    const queda = LC && LC.cuanto ? LC.cuanto(r) : Number(r.onHand) || 0;
    const vivo = !!(LC && LC.vivo && LC.vivo(r));
    window.BarStockNumPad.abrir({
      titulo: r.item,
      sub: 'How many are on the shelf right now? ' + (vivo ? 'Live says &asymp;' : 'The count says ') + esc(n1(queda)),
      boton: (v) => 'Save · ' + v + ' on the shelf',
      nota: 'Live starts from this until the next count. The count itself does not change.',
      guardar: async (n) => {
        const SC = window.BarStockStockChecks;
        const x = SC ? await SC.guardar({ item: r.item, n, decia: queda, por: quien() }) : { ok: false, error: 'Not loaded.' };
        if (!x.ok) return x;
        if (op.alGuardar) { try { op.alGuardar(n, queda); } catch (e) { console.warn('[check-shelf]', e); } }
        if (LC && LC.caducar) LC.caducar();
        return { ok: true };
      }
    });
  }

  // "Wed 10:30 AM", en hora de Nueva York.
  function cuando(ms) {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })
      .format(new Date(ms)).replace(',', '');
  }

  // Lo que pinta la tarjeta: el lápiz (si puede contar) y, si ya se
  // verificó desde el conteo, la línea "✓ Checked 19.8 · Wed 10:30 AM ·
  // Axel · Change". `i` es el índice del maestro: el toque lo lee de ahí.
  function lapiz(r, i) {
    if (!puede()) return '';
    return `<button type="button" class="m-fic-lapiz" data-check="${i}" aria-label="Check the shelf: how many are there">` +
      '<i class="ti ti-pencil" aria-hidden="true"></i></button>';
  }
  function linea(r, i) {
    const LC = window.BarStockLiveCache;
    const v = LC && LC.vivo ? LC.vivo(r) : null;
    const V = v && v.verificado;
    if (!V) return '';
    return `<div class="m-fic-chk"><span>&#10003; Checked ${esc(n1(V.n).replace(/\.0$/, ''))} &middot; ${esc(cuando(V.cuando))}${V.por ? ' &middot; ' + esc(V.por) : ''}</span>${
      puede() ? `<button type="button" class="m-fic-chk-x" data-check="${i}">Change</button>` : ''}</div>`;
  }

  window.BarStockCheckShelf = { abrir, lapiz, linea, puede };
})();
