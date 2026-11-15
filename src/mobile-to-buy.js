(() => {
  if (window.BarStockMobileToBuy) return;

  // ── To buy: la lista de compras en Orders ────────────────────────────
  //
  // Axel, 2026-11-15, sobre lámina: una pestaña "To buy" ANTES de Open,
  // y SÓLO si la lista tiene algo; vacía, Orders enseña las tres de
  // siempre. Una sola lista, sin agrupar por proveedor: la orden que
  // salga de ella (fase 4) va entera como LOOP, que es lo que se hace a
  // media semana. Cada línea dice cuánto, quién, cuándo y por qué, con
  // −/+ y el número que se toca (el teclado de num-pad.js: el "Order N"
  // de la app se propone, "pero se debe poder ajustar"), y ✕ para
  // quitarla (pasa a `removed`, no se borra).
  //
  // Lo que ya se pidió ("Ordered") no lleva ✕: sale solo cuando llega.
  //
  // Lo que ve todo el mundo; cambiar y quitar piden "Make and send
  // orders". Sin él, la lista se lee igual, sin botones.

  let _lista = [], _cargada = false, _cargando = null, _host = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const G = () => window.BarStockGuest;
  const puede = (k) => { const g = G(); return !g || !g.puede || g.puede(k); };
  const quien = () => { const g = G(); return (g && g.nombre && g.nombre()) || ''; };
  const aviso = (t) => { const T = window.BarStockToast; if (T && T.show) try { T.show(t); } catch (e) {} };
  const SL = () => window.BarStockShoppingList;
  const num = (x) => { const n = Number(x) || 0; return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10); };

  // "Sat 9:40 PM", en Nueva York.
  const cuandoNY = (iso) => {
    const t = new Date(iso);
    if (isNaN(t.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short',
      hour: 'numeric', minute: '2-digit' }).format(t).replace(',', '');
  };

  const porComprar = () => _lista.filter(x => x.status === 'to_buy');
  const pedidas = () => _lista.filter(x => x.status === 'ordered');

  // Cuántas líneas hay por comprar. Es lo que decide si la pestaña sale
  // y su contador; null mientras no se ha leído nunca.
  const cuantos = () => (_cargada ? porComprar().length : null);
  const pedidos = () => (_cargada ? pedidas().length : null);

  // Lee la lista. Si la cifra cambia, avisa a Orders (la pestaña sale o
  // se va) y al Home (su botón). Dos lecturas a la vez son una.
  function cargar() {
    if (_cargando) return _cargando;
    const L = SL();
    if (!L || !L.leer) return Promise.resolve(_lista);
    const antes = _cargada ? porComprar().length + ':' + pedidas().length : '';
    _cargando = L.leer()
      .then(f => { _lista = Array.isArray(f) ? f : []; _cargada = true; })
      .catch(e => { console.warn('[to buy] no se pudo leer la lista:', e && e.message || e); })
      .then(() => {
        _cargando = null;
        const ahora = _cargada ? porComprar().length + ':' + pedidas().length : '';
        pintar();
        if (ahora !== antes) {
          const O = window.BarStockMobileOrders;
          if (O && O.refresh) O.refresh();
          if (window.BarStockEvents && window.BarStockEvents.emit) window.BarStockEvents.emit('toBuyCounted', {});
        }
        return _lista;
      });
    return _cargando;
  }

  // Por qué está en la lista. Lo que añade la app ("Add N to list" de
  // Running out) va como "Running out"; lo de una persona, su nota.
  function porque(x) {
    const partes = [];
    partes.push(x.reason === 'app' ? 'Running out' : (x.note || 'Running low'));
    if (x.added_by) partes.push(x.added_by);
    const c = cuandoNY(x.added_at);
    if (c) partes.push(c);
    return partes.join(' · ');
  }

  function linea(x, ordenada) {
    const editar = !ordenada && puede('ordenes');
    return `<div class="m-tb-l${ordenada ? ' es-pedida' : ''}" data-tb="${esc(x.id)}">
      <div class="m-tb-top">
        <span class="m-tb-n">${esc(x.item_name)}</span>
        ${editar ? `<button type="button" class="m-tb-x" data-tb-x aria-label="Remove from the list">
            <i class="ti ti-x" aria-hidden="true"></i></button>` : ''}
      </div>
      <div class="m-tb-s${x.reason === 'app' ? '' : ' de-persona'}">${esc(ordenada ? 'Ordered' + (x.order_ref ? ' · ' + x.order_ref : '') : porque(x))}</div>
      ${editar ? `<div class="m-ord-q m-tb-q">
          <button type="button" data-tb-q="-1" aria-label="One less">−</button>
          <button type="button" class="m-tb-num" data-tb-num aria-label="Change the amount">${esc(num(x.qty))}</button>
          <button type="button" data-tb-q="1" aria-label="One more">+</button>
        </div>`
        : `<div class="m-tb-fija"><b>${esc(num(x.qty))}</b> ${ordenada ? 'ordered' : 'to buy'}</div>`}
    </div>`;
  }

  // El cuerpo de Orders es el MISMO elemento para las cuatro secciones:
  // Orders marca en él cuál está puesta, y sólo se pinta si es ésta. Sin
  // eso, una lectura que llega tarde pintaría la lista encima de Open.
  const mia = () => !!(_host && _host.isConnected && _host.dataset.sec === 'buy');

  function pintar() {
    const host = _host;
    if (!mia()) return;
    const a = porComprar(), b = pedidas();
    if (!_cargada) { host.innerHTML = '<div class="m-tb-vacio">Loading…</div>'; return; }
    if (!a.length && !b.length) {
      host.innerHTML = `<div class="m-nada"><span class="m-nada-i bien"><i class="ti ti-circle-check" aria-hidden="true"></i></span>
        <b>Nothing to buy</b><small>Add products from Running out, or with Running low on any product.</small></div>`;
      return;
    }
    host.innerHTML = `
      ${a.length ? `<div class="m-tb-k">To buy · ${a.length}</div>${a.map(x => linea(x, false)).join('')}` : ''}
      ${b.length ? `<div class="m-tb-k">Ordered · ${b.length}</div>${b.map(x => linea(x, true)).join('')}` : ''}`;
  }

  async function guardarQty(x, q) {
    if (!(q > 0)) return { ok: false, error: 'The amount has to be more than zero.' };
    const antes = x.qty;
    x.qty = q;
    pintar();
    const r = await SL().cambiar(x.id, q, quien());
    if (!r.ok) { x.qty = antes; pintar(); }
    return r;
  }

  function alTocar(ev) {
    const b = ev.target.closest && ev.target.closest('button');
    const l = ev.target.closest && ev.target.closest('[data-tb]');
    if (!b || !l || !puede('ordenes')) return;
    const x = _lista.find(y => String(y.id) === l.dataset.tb);
    if (!x || x.status !== 'to_buy') return;
    if (b.hasAttribute('data-tb-q')) {
      const q = (Number(x.qty) || 0) + Number(b.dataset.tbQ);
      // Menos de 1 no: quitar la línea es la ✕, y bajar a 0 sin querer
      // la haría desaparecer de un toque.
      if (q < 1) return;
      guardarQty(x, q).then(r => { if (!r.ok) aviso('Not saved: ' + (r.error || 'unknown error')); });
    } else if (b.hasAttribute('data-tb-num')) {
      window.BarStockNumPad.abrir({
        titulo: x.item_name, sub: 'How many to buy?', inicial: num(x.qty),
        medias: false, cero: false,
        boton: (v) => 'Buy ' + v,
        guardar: (n) => guardarQty(x, n)
      });
    } else if (b.hasAttribute('data-tb-x')) {
      b.disabled = true;
      SL().quitar(x.id, quien()).then(r => {
        if (!r.ok) { aviso('Not removed: ' + (r.error || 'unknown error')); b.disabled = false; return; }
        _lista = _lista.filter(y => y !== x);
        pintar();
        // Sin nada por comprar, la pestaña se va y Orders vuelve a Open.
        const O = window.BarStockMobileOrders;
        if (O && O.refresh) O.refresh();
        if (window.BarStockEvents && window.BarStockEvents.emit) window.BarStockEvents.emit('toBuyCounted', {});
      });
    }
  }

  // Orders la monta en su cuerpo, como Sent e Invoices.
  function montar(cuerpo) {
    _host = cuerpo;
    if (!cuerpo.dataset.tbOyente) {
      cuerpo.dataset.tbOyente = '1';
      cuerpo.addEventListener('click', (ev) => { if (_host === cuerpo && mia()) alTocar(ev); });
    }
    pintar();
    cargar();
  }

  // Cuando alguien la cambia (Running out, Running low, otra pestaña):
  // se vuelve a leer, y Orders y el Home se enteran por cargar().
  function enganchar() {
    if (window.BarStockEvents && window.BarStockEvents.on) window.BarStockEvents.on('shoppingListUpdated', () => cargar());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar);
  else enganchar();

  window.BarStockMobileToBuy = { montar, cargar, cuantos, pedidos };
})();
