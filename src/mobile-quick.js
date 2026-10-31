(() => {
  if (window.BarStockMobileQuick) return;

  // ── Quick order en el teléfono ───────────────────────────────────────
  //
  // El escritorio tiene un diálogo: una rejilla de cinco columnas, un
  // `datalist` para buscar el producto y dos campos de fecha. En un
  // iPhone eso no se usa — el `datalist` sale como un desplegable de
  // tres líneas y la rejilla se parte—. Así que la FORMA es nueva.
  //
  // Lo que NO es nuevo es nada de lo demás:
  //
  //   · la entrada que acaba en la nube la arma
  //     `BarStockQuickOrder.construirEntrada`
  //   · guardarla la guarda `BarStockQuickOrder.save`
  //   · y enviarla la envía la pantalla de revisión de Orders, con sus
  //     destinatarios, su PDF y sus tres pasos
  //
  // Por eso aquí no hay ni un `fetch` ni un `persistOrder`: esta
  // pantalla sólo arma un borrador y lo entrega.
  //
  // ── Lo que cambia según el proveedor ─────────────────────────────────
  //
  // LOOP no se pide por correo: se sube un CSV a su portal. Así que
  // para LOOP esto es un registro —"Save to history"— y para todos los
  // demás es una orden de verdad que sale por email igual que una del
  // ciclo, y entonces pasa por la revisión. La regla vive en
  // `BarStockQuickOrder.porCorreo`, no aquí.

  const M = () => window.BarStockMobile;
  const Q = () => window.BarStockQuickOrder;
  const O = () => window.BarStockMobileOrders;
  const hay = (f) => typeof window[f] === 'function';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  const num = (v) => {
    const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const n2 = (v) => {
    const n = num(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
  };
  const money = (v) => hay('fmtMoney') ? window.fmtMoney(num(v))
    : '$' + num(v).toFixed(2);

  const master = () => (window.state && Array.isArray(window.state.master))
    ? window.state.master : [];

  const proveedores = () => {
    const q = Q();
    if (q && typeof q.vendors === 'function') {
      const l = q.vendors();
      if (Array.isArray(l) && l.length) return l;
    }
    return hay('getVendorsWithUnknown') ? window.getVendorsWithUnknown() : ['LOOP'];
  };

  const porCorreo = (v) => {
    const q = Q();
    if (q && typeof q.porCorreo === 'function') return q.porCorreo(v);
    // Mismo reparto que `construirEntrada`, por si el módulo del
    // escritorio no cargó. Nunca debería hacer falta.
    return String(v || '').toUpperCase() !== 'LOOP';
  };

  // ── Estado ───────────────────────────────────────────────────────────

  let _vendor = '';
  let _items = [];          // las líneas del borrador
  let _cuando = null;       // Date puesto a mano · null = ahora
  let _nota = '';
  let _abierto = false;     // ¿está desplegado el "Change"?
  let _busca = '';
  let _elegido = null;      // la fila del catálogo elegida
  let _guardando = false;
  let _fallo = '';
  let _hecho = null;        // { vendor, botellas, total } tras guardar
  let _host = null;

  const repintar = () => pintar(_host);

  const cuando = () => _cuando || new Date();
  const esHoy = () => {
    const d = cuando(), h = new Date();
    return d.toDateString() === h.toDateString();
  };
  const reloj = () => cuando().toLocaleTimeString('en-US',
    { hour: 'numeric', minute: '2-digit' });
  const dia = () => esHoy() ? 'Today'
    : cuando().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const botellas = () => _items.reduce((s, r) => s + num(r.qty), 0);
  const total = () => _items.reduce((s, r) => s + num(r.qty) * num(r.value), 0);

  function limpiar() {
    _items = [];
    _elegido = null;
    _busca = '';
    _cuando = null;
    _nota = '';
    _abierto = false;
    _fallo = '';
  }

  // ── El catálogo ──────────────────────────────────────────────────────
  //
  // Se busca sobre el catálogo del proveedor elegido. Sin texto no se
  // enseña nada: la lista entera son cientos de botellas y desplazarla
  // con el pulgar es peor que teclear tres letras.
  function resultados() {
    const t = _busca.trim().toLowerCase();
    if (t.length < 2) return [];
    const v = String(_vendor || '').toUpperCase();
    return master()
      .filter(r => String(r.vendor || '').toUpperCase() === v)
      .filter(r => String(r.item || '').toLowerCase().includes(t) ||
                   String(r.code || '').toLowerCase().includes(t))
      .slice(0, 8);
  }

  function agregar() {
    const cant = num((_host && _host.querySelector('#mqQty') || {}).value);
    const precioEscrito = String((_host && _host.querySelector('#mqPrice') || {}).value || '').trim();

    if (!_elegido) return avisar('Pick a bottle first.');
    if (cant <= 0) return avisar('How many did you get?');

    const precio = precioEscrito !== '' ? num(precioEscrito) : num(_elegido.value);

    // La MISMA forma de línea que `addItem` del escritorio. `toOrder` y
    // `orderOverride` llevan los dos la cantidad a propósito:
    // `getEffectiveOrder` sólo mira `orderOverride` en los proveedores
    // que admiten ajuste manual, así que con uno solo de los dos la
    // cantidad se perdería en los demás.
    _items.push({
      code: String(_elegido.code || '').trim(),
      item: String(_elegido.item || ''),
      vendor: _vendor,
      onHand: Math.max(0, num(_elegido.onHand)),
      suggested: Math.max(0, num(_elegido.suggested)),
      value: Math.max(0, precio),
      qty: cant,
      toOrder: cant,
      orderOverride: cant,
      finalOrder: cant,
      quickOrder: true
    });

    _elegido = null;
    _busca = '';
    _fallo = '';
    repintar();
  }

  function avisar(t) {
    if (window.BarStockToast) window.BarStockToast.show(t);
  }

  // ── Entregar el borrador ─────────────────────────────────────────────

  // LOOP: se guarda y se acabó. Se llama al `save` del escritorio con
  // los datos por parámetro — la misma función, con sus avisos de
  // validación y su registro.
  async function guardar() {
    if (_guardando || !_items.length) return;
    const q = Q();
    if (!q || typeof q.save !== 'function') return avisar('Not available right now.');

    _guardando = true; _fallo = '';
    repintar();
    try {
      const r = await q.save({
        vendor: _vendor,
        when: cuando(),
        note: _nota.trim() || 'Quick Order',
        items: _items.slice()
      });
      const e = (r && r.entrada) || null;
      _hecho = {
        vendor: _vendor,
        botellas: e ? num(e.totalUnits) : botellas(),
        total: e ? num(e.subtotal) : total()
      };
      limpiar();
    } catch (err) {
      // Se dice, y el borrador se QUEDA. Vaciarlo tras un fallo de red
      // obliga a teclearlo todo otra vez de pie en una tienda.
      _fallo = (err && err.message) ? err.message : String(err);
      console.error('[quick] no se pudo guardar', err);
    } finally {
      _guardando = false;
      repintar();
    }
  }

  // El resto de proveedores: a la revisión de Orders. Allí viven los
  // destinatarios, el PDF y los tres pasos. No se duplica aquí.
  function revisar() {
    if (!_items.length) return;
    const o = O();
    if (!o || typeof o.revisarBorrador !== 'function') {
      return avisar('Orders are not ready yet. Try again in a moment.');
    }
    o.revisarBorrador({
      nombre: _vendor,
      filas: _items.slice(),
      nota: _nota.trim() || 'Quick Order'
    });
  }

  // ── Pintar ───────────────────────────────────────────────────────────

  function pintarHecho(host) {
    const h = _hecho;
    host.innerHTML =
      '<div class="m-rev-ok">' +
        '<div class="m-rev-ok-i"><i class="ti ti-circle-check" aria-hidden="true"></i></div>' +
        '<div class="m-rev-ok-t">Saved · ' + esc(h.vendor) + '</div>' +
        '<div class="m-rev-ok-s">' + n2(h.botellas) + ' bottles · ' + money(h.total) + '</div>' +
        '<div class="m-rev-ok-n">It is in History with the rest of your orders. ' +
          esc(h.vendor) + ' does not take orders by email, so nothing was sent.</div>' +
        '<button type="button" class="m-rev-go" id="mqDone">Done</button>' +
      '</div>';
    host.querySelector('#mqDone').onclick = () => {
      _hecho = null;
      // A Sent, que es donde acaba de aparecer. Devolver a Open sería
      // dejarte buscando dónde quedó lo que acabas de apuntar.
      if (O() && O().abrirSeccion) O().abrirSeccion('sent');
      else if (M()) M().ir('orders');
    };
  }

  function pintar(host) {
    if (!host) return;
    _host = host;
    if (_hecho) return pintarHecho(host);

    const vs = proveedores();
    if (!_vendor || !vs.includes(_vendor)) _vendor = vs[0] || '';

    const correo = porCorreo(_vendor);
    const res = resultados();
    const cab = (M() && M().cabecera) ? M().cabecera : null;

    host.innerHTML =
      (cab ? cab({
        volverA: 'Orders',
        titulo: 'Quick order',
        sub: correo
          ? 'Off-cycle. Goes out by email like any other order.'
          : 'Off-cycle. ' + esc(_vendor) + ' is a log — nothing gets sent.'
      }) : '') +

      '<div class="m-sheet-t">Vendor</div>' +
      '<div class="m-chips" id="mqVend">' +
        vs.map(v => '<button type="button" class="m-chip' + (v === _vendor ? ' on' : '') + '"' +
          ' data-qv="' + esc(v) + '">' + esc(v) + '</button>').join('') +
      '</div>' +

      // ── Cuándo, plegado ───────────────────────────────────────────
      //
      // Casi siempre es ahora. En el diálogo del escritorio son dos
      // campos grandes siempre a la vista; aquí es un renglón, y la
      // nota entra en el mismo despliegue porque se cambia igual de
      // poco.
      '<button type="button" class="m-qk-cuando" id="mqWhen">' +
        '<span>' + esc(dia()) + ', ' + esc(reloj()) +
          (_nota.trim() ? ' · ' + esc(_nota.trim()) : '') + '</span>' +
        '<i>' + (_abierto ? 'Done' : 'Change') + '</i>' +
      '</button>' +

      (_abierto ?
        '<div class="m-qk-abre">' +
          '<label class="m-qk-lab" for="mqDate">Date</label>' +
          '<input class="m-qk-campo" id="mqDate" type="date" value="' + esc(fecha()) + '">' +
          '<label class="m-qk-lab" for="mqTime">Time</label>' +
          '<input class="m-qk-campo" id="mqTime" type="time" value="' + esc(hora()) + '">' +
          '<label class="m-qk-lab" for="mqNote">Note</label>' +
          '<input class="m-qk-campo" id="mqNote" type="text" placeholder="Quick Order"' +
            ' value="' + esc(_nota) + '">' +
        '</div>' : '') +

      // ── Añadir una botella ────────────────────────────────────────
      '<div class="m-qk-add">' +
        '<div class="m-qk-add-h">Add a bottle</div>' +

        (_elegido
          ? '<div class="m-qk-elegido">' +
              '<div class="m-qk-elegido-n">' + esc(_elegido.item) + '</div>' +
              '<div class="m-qk-elegido-s">' +
                (_elegido.code ? esc(_elegido.code) + ' · ' : '') +
                n2(_elegido.onHand) + ' on hand' +
                (num(_elegido.value) > 0 ? ' · ' + money(_elegido.value) + ' each' : ' · no price on file') +
              '</div>' +
              '<button type="button" id="mqOtro" aria-label="Pick another bottle">' +
                '<i class="ti ti-x" aria-hidden="true"></i></button>' +
            '</div>'
          : '<input class="m-qk-campo m-qk-busca" id="mqFind" type="search"' +
              ' inputmode="search" autocomplete="off" autocapitalize="off" spellcheck="false"' +
              ' placeholder="Search ' + esc(_vendor) + '…" value="' + esc(_busca) + '">') +

        '<div id="mqRes">' + listaRes(res) + '</div>' +

        (_elegido ?
          '<div class="m-qk-dos">' +
            '<div class="m-step">' +
              '<button type="button" id="mqLess" aria-label="One less">−</button>' +
              '<input id="mqQty" type="number" inputmode="numeric" step="1" min="0"' +
                ' value="1" aria-label="How many">' +
              '<button type="button" id="mqMore" aria-label="One more">+</button>' +
            '</div>' +
            '<div class="m-money">' +
              '<span>$</span>' +
              '<input class="m-qk-campo" id="mqPrice" type="number" inputmode="decimal"' +
                ' step="0.01" min="0" placeholder="' +
                (num(_elegido.value) > 0 ? n2(_elegido.value) : 'price') +
                '" aria-label="Price each">' +
            '</div>' +
          '</div>' +
          '<button type="button" class="m-qk-go" id="mqAdd">Add</button>'
          : '') +
      '</div>' +

      // ── Lo que llevas ─────────────────────────────────────────────
      (_items.length
        ? '<div class="m-sheet-t">On this order · ' + _items.length + '</div>' +
          '<div class="m-qk-list">' +
            _items.map((r, i) =>
              '<div class="m-qk-l">' +
                '<span class="q">' + n2(r.qty) + '×</span>' +
                '<span class="n">' + esc(r.item) + '</span>' +
                '<span class="v">' + (num(r.value) > 0
                  ? money(num(r.value) * num(r.qty)) : 'no price') + '</span>' +
                '<button type="button" class="x" data-quitar="' + i + '"' +
                  ' aria-label="Remove ' + esc(r.item) + '">' +
                  '<i class="ti ti-x" aria-hidden="true"></i></button>' +
              '</div>').join('') +
          '</div>'
        : '<div class="m-qk-vacio">Nothing on it yet.<br>' +
          'Pick the vendor and add what you bought.</div>') +

      (_fallo
        ? '<div class="m-rev-fallo"><b>It was not saved.</b> ' + esc(_fallo) +
          ' Your lines are still here — try again.</div>'
        : '') +

      // ── El pie ────────────────────────────────────────────────────
      //
      // El botón dice lo que PASA, y lo que pasa depende del
      // proveedor. Para los de correo no dice "Place & send": aún no
      // coloca nada, lleva a la revisión, igual que en una orden del
      // ciclo. El "Place & send" está allí, donde sí coloca.
      (_items.length
        ? '<div class="m-qk-pie">' +
            '<div class="m-qk-pie-r">' +
              '<span>' + n2(botellas()) + ' bottle' + (botellas() === 1 ? '' : 's') +
                ' from ' + esc(_vendor) + '</span>' +
              '<b>' + money(total()) + '</b>' +
            '</div>' +
            '<button type="button" class="m-rev-go" id="mqMain"' +
              (_guardando ? ' disabled' : '') + '>' +
              (_guardando ? 'Saving…' : correo ? 'Review and send' : 'Save to history') +
            '</button>' +
          '</div>'
        : '');

    enganchar(host);
  }

  function listaRes(res) {
    if (_elegido || !res.length) {
      return (!_elegido && _busca.trim().length >= 2)
        ? '<div class="m-qk-nada">Nothing in ' + esc(_vendor) + ' matches that.</div>'
        : '';
    }
    return '<div class="m-qk-res">' + res.map((r, i) =>
      '<button type="button" data-qr="' + i + '">' +
        '<span class="n">' + esc(r.item) + '</span>' +
        '<span class="s">' + (r.code ? esc(r.code) + ' · ' : '') +
          (num(r.value) > 0 ? money(r.value) : 'no price') + '</span>' +
      '</button>').join('') + '</div>';
  }

  // El valor de los dos campos de fecha y hora, en el formato que
  // piden los `input`. Se calculan de `cuando()` para que abrir el
  // despliegue enseñe lo que ya está puesto.
  function fecha() {
    const d = cuando();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function hora() {
    const d = cuando();
    return String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  function enganchar(host) {
    if (M() && M().alVolver) M().alVolver(host, () => { if (M()) M().ir('orders'); });

    host.querySelectorAll('[data-qv]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.qv === _vendor) return;
        // Cambiar de proveedor VACÍA las líneas. Una orden es a un
        // proveedor; mezclarlas mandaría a SOUTHERN una botella que
        // compraste en BREAKTHRU.
        if (_items.length &&
            !window.confirm('Switch to ' + b.dataset.qv + '? The ' +
              _items.length + ' line' + (_items.length === 1 ? '' : 's') +
              ' you added will be cleared.')) return;
        _vendor = b.dataset.qv;
        _items = [];
        _elegido = null; _busca = ''; _fallo = '';
        repintar();
      };
    });

    const w = host.querySelector('#mqWhen');
    if (w) w.onclick = () => { _abierto = !_abierto; repintar(); };

    const d = host.querySelector('#mqDate');
    const t = host.querySelector('#mqTime');
    const nt = host.querySelector('#mqNote');
    const leerCuando = () => {
      const v = new Date(String((d && d.value) || fecha()) + 'T' +
                         String((t && t.value) || hora()) + ':00');
      if (!Number.isNaN(v.getTime())) _cuando = v;
    };
    if (d) d.onchange = leerCuando;
    if (t) t.onchange = leerCuando;
    // La nota se lee al escribir y NO repinta: repintar en cada letra
    // le quita el foco al campo y el teclado se cierra.
    if (nt) nt.oninput = () => { _nota = nt.value; };

    // El buscador repinta SÓLO la lista de resultados, por lo mismo.
    const f = host.querySelector('#mqFind');
    if (f) f.oninput = () => {
      _busca = f.value;
      const caja = host.querySelector('#mqRes');
      if (caja) { caja.innerHTML = listaRes(resultados()); engancharRes(host); }
    };

    engancharRes(host);

    const otro = host.querySelector('#mqOtro');
    if (otro) otro.onclick = () => { _elegido = null; _busca = ''; repintar(); };

    const q = host.querySelector('#mqQty');
    const mover = (n) => {
      if (!q) return;
      q.value = String(Math.max(0, num(q.value) + n));
    };
    const menos = host.querySelector('#mqLess');
    const mas = host.querySelector('#mqMore');
    if (menos) menos.onclick = () => mover(-1);
    if (mas) mas.onclick = () => mover(1);

    const add = host.querySelector('#mqAdd');
    if (add) add.onclick = agregar;

    host.querySelectorAll('[data-quitar]').forEach(b => {
      b.onclick = () => { _items.splice(Number(b.dataset.quitar), 1); repintar(); };
    });

    const main = host.querySelector('#mqMain');
    if (main) main.onclick = () => porCorreo(_vendor) ? revisar() : guardar();
  }

  function engancharRes(host) {
    const res = resultados();
    host.querySelectorAll('[data-qr]').forEach(b => {
      b.onclick = () => {
        _elegido = res[Number(b.dataset.qr)] || null;
        repintar();
      };
    });
  }

  // ── Registro ─────────────────────────────────────────────────────────

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      id: 'quick', icon: 'ti-bolt', label: 'Quick order',
      tab: false, orden: 95,
      mount: pintar,
      // Al volver NO se vacía el borrador. Se entra aquí desde Orders,
      // se va a la revisión y se puede volver: si `show` reiniciara,
      // volver atrás borraría lo que acabas de teclear. Lo vacía
      // `limpiar()`, y lo llama quien sabe que la orden ya existe.
      show: pintar,
      refrescar: pintar,
      // Atrás siempre lleva a Orders: es de donde se entra, y aquí no
      // hay niveles dentro.
      atras(host, hacerlo) {
        if (hacerlo && M()) M().ir('orders');
        return true;
      }
    });
  }

  window.BarStockMobileQuick = { limpiar, pintar: () => repintar() };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
