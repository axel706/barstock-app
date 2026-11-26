(() => {
  if (window.BarStockDeskToBuy) return;

  // ── Orders › To buy en el escritorio (lámina "To buy · desktop", B: lista
  //    y orden en una pantalla; Axel 2026-11-26) ──
  //
  // A la izquierda la lista de compras con una casilla en cada línea; a la
  // derecha la orden de LOOP con lo marcado (fecha, hora, nota, −/+,
  // precio) y abajo "Count in Live now?" y Review and send. Lo desmarcado
  // se QUEDA en la lista para después: la casilla no quita nada (eso es la
  // ✕). Hasta hoy el escritorio no veía la lista: "Add to list" de Running
  // out y "Tell the team it's low" la llenaban y sólo se leía en el teléfono.
  //
  // Nada es nuevo por dentro:
  //   · la lista es To buy del TELÉFONO (BarStockMobileToBuy.escritorio:
  //     qué está por comprar, qué pedido sigue sin llegar, el porqué de
  //     cada línea, cambiar y quitar);
  //   · la orden es Q-O del escritorio (desk-quick.js, con esta columna en
  //     lugar de los productos del proveedor) sobre el borrador de Quick
  //     order del teléfono (escritorio.desdeLista, siempre LOOP, como la
  //     orden que sale de To buy en el teléfono);
  //   · enviarla es la revisión de Open, y al colocarla las líneas pasan a
  //     "Ordered" (mobile-quick.trasColocar).
  //
  // Lo que se ve de más en el escritorio: lo que queda ahora y el día en
  // que se acaba (live-cache: el número de Inventory y el "Out" de Running
  // out).

  const TB = () => window.BarStockMobileToBuy && window.BarStockMobileToBuy.escritorio;
  const QE = () => window.BarStockMobileQuick && window.BarStockMobileQuick.escritorio;
  const DQ = () => window.BarStockDeskQuick;
  const LC = () => window.BarStockLiveCache;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const n2 = (v) => { const n = num(v); return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10); };
  const master = () => (window.state && Array.isArray(window.state.master)) ? window.state.master : [];
  const avisar = (t) => { if (window.BarStockToast) window.BarStockToast.show(t); };

  let _caja = null, _abierto = false, _o = null;
  // Lo DESmarcado, por id de línea: en memoria. Al volver a entrar todo va
  // marcado, como la orden del teléfono, que lleva la lista entera.
  const _fuera = new Set();

  // La orden de la derecha: lo marcado. Lo que ya estaba en ella conserva
  // su cantidad y su precio (desdeLista).
  function armar() {
    const T = TB(), Q = QE();
    if (!T || !Q) return;
    const filas = T.porComprar().filter(x => !_fuera.has(String(x.id)))
      .map(x => ({ id: x.id, item: x.item_name, qty: x.qty }));
    Q.desdeLista(filas);
  }

  function ahora(nombre) {
    const r = master().find(m => m.item === nombre);
    const L = LC();
    if (!r || !L) return '';
    const a = L.agota ? L.agota(r) : null;
    return `<span class="dkt-now"><b>${esc(L.texto ? L.texto(r, n2) : n2(r.onHand))}</b>${a ? `<small class="${a.tono === 'r' ? 'r' : a.tono === 'a' ? 'a' : ''}">${esc(a.txt)}</small>` : ''}</span>`;
  }

  function pintarCol(el) {
    const T = TB();
    if (!el || !T) return;
    const a = T.porComprar(), b = T.pedidas();
    const puede = T.puede();
    const marcadas = a.filter(x => !_fuera.has(String(x.id))).length;
    el.innerHTML = `<div class="dkt-k">To buy · ${a.length}${a.length ? ' · ' + marcadas + ' in this order' : ''}</div>
      ${a.length ? a.map(x => {
        const on = !_fuera.has(String(x.id));
        return `<div class="dkt-l${on ? '' : ' off'}" data-id="${esc(x.id)}">
          <button type="button" class="dkt-chk${on ? ' on' : ''}" data-dkt="chk" role="checkbox" aria-checked="${on}" aria-label="${on ? 'Leave out of this order' : 'Put in this order'}">${on ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}</button>
          <span class="dkt-n"><b>${esc(x.item_name)}</b><small class="${x.reason === 'app' ? 'app' : ''}">${esc(T.porque(x))} · ${esc(n2(x.qty))} to buy</small></span>
          ${ahora(x.item_name)}
          ${puede ? `<button type="button" class="dkq-x" data-dkt="quitar" aria-label="Remove ${esc(x.item_name)} from the list"><i class="ti ti-x" aria-hidden="true"></i></button>` : '<span></span>'}
        </div>`;
      }).join('') : '<p class="dkq-nada">Nothing to buy.</p>'}
      ${b.length ? `<div class="dkt-k">Ordered · ${b.length}</div>${b.map(x => `<div class="dkt-l ped">
          <span></span><span class="dkt-n"><b>${esc(x.item_name)}</b><small>${esc(T.pedidaTxt(x))}</small></span>
          <span class="dkt-now"><b>${esc(n2(x.qty))}</b><small>ordered</small></span><span></span></div>`).join('')}` : ''}
      <p class="dkt-nota">Unticked lines stay on the list for later. ✕ takes a line off the list.</p>`;
  }

  function alClic(ev) {
    const b = ev.target.closest('[data-dkt]');
    const l = ev.target.closest('[data-id]');
    const T = TB();
    if (!b || !l || !T) return;
    const id = l.dataset.id;
    const x = T.porComprar().find(y => String(y.id) === id);
    if (!x) return;
    if (b.dataset.dkt === 'chk') {
      if (_fuera.has(id)) _fuera.delete(id); else _fuera.add(id);
      armar();
      if (DQ()) DQ().repintar();
      return;
    }
    if (b.dataset.dkt === 'quitar') {
      if (!T.puede()) return;
      b.disabled = true;
      T.quitar(x).then(r => {
        if (!r || !r.ok) { avisar('Not removed: ' + ((r && r.error) || 'unknown error')); b.disabled = false; return; }
        _fuera.delete(id);
        recargar();
      });
    }
  }

  // La lista cambió (aquí, en el teléfono, o al colocar la orden): se
  // rehace la orden con lo marcado y se repinta. Sin nada que comprar ni
  // pedido en camino, To buy no tiene pestaña: a Open.
  function recargar() {
    if (!_abierto) return;
    const T = TB();
    if (!T) return;
    if (!T.porComprar().length && !T.pedidas().length) { if (_o && _o.alVaciar) _o.alVaciar(); return; }
    armar();
    if (DQ()) DQ().repintar();
  }

  async function abrir(caja, o) {
    _caja = caja; _o = o || {};
    const T = TB(), Q = QE();
    if (!T || !Q || !DQ()) return;
    // Un Quick order a medias de otra cosa (otro proveedor, a mano) no se
    // pisa sin preguntar: la orden de To buy usa el mismo borrador.
    const bo = Q.borrador();
    if (bo.items.length && !Q.deLista()) {
      const D = window.BarStockDialog;
      const n = bo.items.length + ' line' + (bo.items.length === 1 ? '' : 's');
      const ok = D && D.confirmar
        ? await D.confirmar({ titulo: 'Order from the To buy list?', cuerpo: 'The list goes as one LOOP order, in the same quick order.', aviso: 'The ' + n + ' of your quick order for ' + bo.vendor + ' will be cleared.', ok: 'Use the list', cancelar: 'Keep ' + bo.vendor, peligro: true })
        : window.confirm('Clear the ' + n + ' for ' + bo.vendor + '?');
      if (!ok) { if (_o.alCancelar) _o.alCancelar(); return; }
    }
    _abierto = true;
    armar();
    DQ().abrir(caja, {
      alCambiar: _o.alCambiar,
      columna: { pintar: pintarCol, clic: alClic, revision: _o.revision }
    });
  }
  function cerrar() { if (!_abierto) return; _abierto = false; if (DQ()) DQ().cerrar(); }

  function enganchar() {
    const E = window.BarStockEvents;
    // shoppingListUpdated: mobile-to-buy vuelve a leer (dos lecturas a la
    // vez son una) y, con lo leído, se rehace esto. toBuyCounted sólo sale
    // si cambian las cuentas, y una cantidad cambiada no las cambia.
    if (E && E.on) E.on('shoppingListUpdated', () => {
      const M = window.BarStockMobileToBuy;
      if (_abierto && M && M.cargar) M.cargar().then(recargar);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar);
  else enganchar();

  window.BarStockDeskToBuy = { abrir, cerrar, abierto: () => _abierto, recargar, _pintarCol: pintarCol };
})();
