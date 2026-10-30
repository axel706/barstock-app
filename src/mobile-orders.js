(() => {
  if (window.BarStockMobileOrders) return;

  // ── Órdenes en el teléfono ───────────────────────────────────────────
  //
  // Dos niveles, cada uno simple:
  //
  //   RESUMEN   cuánto va a costar la semana y en qué proveedores. Es
  //             la continuación literal de la tarjeta del Home —"4
  //             vendors · $590 · Review orders"—, así que al entrar se
  //             ve lo mismo en grande en vez de empezar otra frase.
  //   DETALLE   las líneas de un proveedor, con su cantidad ajustable.
  //
  //   REVISIÓN  la última mirada antes de colocar: qué sale, cuánto, y
  //             a quién. No se edita — para eso está DETALLE.
  //
  // ── Colocar es dos pasos, y el orden no es intercambiable ───────────
  //
  // Primero se guarda la orden en la nube, después sale el correo. Si
  // fuera al revés y el guardado fallara, el proveedor tendría un
  // pedido que la app no conoce: imposible de cuadrar contra la factura
  // cuando llegue de MarginEdge. Al revés es recuperable — queda una
  // orden colocada que se puede reenviar.
  //
  // ── Y no se reimplementa nada ────────────────────────────────────────
  //
  // Las líneas salen de getOrderRowsForVendor, el subtotal de
  // computeOrderSubtotal y el ajuste de updateFinalOrder: las mismas
  // funciones del escritorio. Por eso un cambio hecho aquí aparece
  // allí — updateFinalOrder guarda en local Y manda el valor a la nube.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const num = (x) => Number(x) || 0;
  const n2 = (x) => String(Math.round(num(x) * 100) / 100);
  const money = (n) => '$' + Math.round(num(n)).toLocaleString('en-US');

  let _vendor = null;        // null = resumen
  let _revisar = false;      // true = la pantalla de revisión del _vendor
  let _to = [];              // destinatarios de ESTE envío
  let _recordar = true;      // guardarlos en vendor_defaults al enviar
  let _cargandoDest = false;
  // Para qué proveedor ya se preguntó. El guardia NO puede ser "_to
  // está vacío": un proveedor sin correo guardado deja _to vacío para
  // siempre, y entonces cada repintado vuelve a pedirlo — carga, no
  // encuentra nada, repinta, carga. Bucle infinito y la pantalla
  // congelada.
  let _destDe = null;
  let _colocando = false;
  const _fallos = new Set(); // claves de líneas que no llegaron a la nube

  const clave = (r) => (r.item || '') + '||' + (r.code || '');
  function master() { return (window.state && window.state.master) || []; }

  const hay = (n) => typeof window[n] === 'function';

  function proveedores() {
    if (!hay('getActiveVendors') || !hay('getOrderRowsForVendor') ||
        !hay('computeOrderSubtotal')) return [];
    const out = [];
    for (const nombre of window.getActiveVendors()) {
      // UNKNOWN no es un proveedor, es lo que todavía no tiene uno. Un
      // pedido a UNKNOWN no se puede colocar en ningún sitio.
      if (String(nombre).toUpperCase() === 'UNKNOWN') continue;
      const filas = window.getOrderRowsForVendor(nombre);
      if (!filas.length) continue;
      const sinPrecio = filas.filter(r => !(num(r.value) > 0)).length;
      out.push({
        nombre, filas,
        total: window.computeOrderSubtotal(filas),
        sinPrecio
      });
    }
    out.sort((a, b) => b.total - a.total);
    return out;
  }

  function cantidad(r) {
    return hay('getEffectiveOrder') ? num(window.getEffectiveOrder(r)) : num(r.toOrder);
  }
  function aMano(r) {
    return r.orderOverride !== '' && r.orderOverride !== null && r.orderOverride !== undefined;
  }
  function ajustable(r) {
    return hay('supportsManualFinalOrder') ? !!window.supportsManualFinalOrder(r.vendor) : false;
  }

  // ── Resumen ──────────────────────────────────────────────────────────

  function pintarResumen(host) {
    const vs = proveedores();
    const total = vs.reduce((s, v) => s + v.total, 0);

    if (!vs.length) {
      // Dos vacíos distintos, y conviene no confundirlos: "todavía no
      // has contado" es una tarea pendiente, y "no hace falta pedir
      // nada" es una buena noticia. El mensaje de antes servía para
      // los dos y no decía ninguno.
      const W = window.BarStockWeeklyCycle;
      const st = (W && W.estado) ? W.estado() : 'loading';
      const contado = st === 'done';

      host.innerHTML = `
        <div class="m-inv-t">Orders</div>
        <div class="m-nada">
          <span class="m-nada-i${contado ? ' bien' : ''}">
            <i class="ti ti-${contado ? 'circle-check' : 'scan'}" aria-hidden="true"></i>
          </span>
          <b>${contado ? 'Nothing to order' : 'No count yet'}</b>
          <small>${contado
            ? 'Every product is at or above its par. Order lines show up here when something drops below.'
            : 'Count the bottles and the order lines appear here, grouped by vendor.'}</small>
        </div>`;
      return;
    }

    // Apilado y no en dos columnas: "Orders" y "$590" uno al lado del
    // otro se peleaban por el ancho y la línea de abajo se metía
    // debajo del título.
    host.innerHTML = `
      <div class="m-inv-t">Orders</div>
      <div class="m-ord-gran">${money(total)}
        <span>across ${vs.length} vendor${vs.length === 1 ? '' : 's'}</span></div>

      <!-- Aquí ya no se avisa de nada. Durante mucho tiempo este hueco
           decía "Place orders from desktop or iPad", y lo decía en las
           dos pantallas para que nadie mirara los totales, se fuera y
           no se enterara. Desde que se coloca desde el teléfono, esa
           frase sería mentira: el camino está dentro de cada
           proveedor, que es donde se repasa antes de mandar. -->
      ${''}
      ${vs.map((v, i) => `
        <button type="button" class="m-ordv${v.sinPrecio ? ' aviso' : ''}" data-v="${i}">
          <span class="m-ordv-l">
            <span class="m-ordv-n">${esc(v.nombre)}</span>
            <small>${v.filas.length} line${v.filas.length === 1 ? '' : 's'}${
              v.sinPrecio ? ' · ' + v.sinPrecio + ' without price' : ' · all priced'}</small>
          </span>
          <b>${money(v.total)}</b>
          <i class="ti ti-chevron-right m-chev" aria-hidden="true"></i>
        </button>`).join('')}`;

    host.querySelectorAll('[data-v]').forEach(b => {
      b.onclick = () => { _vendor = vs[Number(b.dataset.v)].nombre; pintar(host); };
    });
  }

  // ── Detalle ──────────────────────────────────────────────────────────

  // ── Lo que dejaste fuera ─────────────────────────────────────────────
  //
  // No hace falta una columna nueva: excluir YA era poner la cantidad a
  // cero. getOrderRowsForVendor filtra por cantidad efectiva mayor que
  // cero, así que bajar a 0 borraba la línea de la lista — sin decirlo
  // y sin vuelta atrás salvo volver a añadirla a mano.
  //
  // Excluido es, exactamente: este proveedor, cantidad puesta a cero A
  // MANO, y el automático quería pedir algo. Lo último es lo que
  // distingue "dije que no" de "nunca hizo falta": sin ese filtro, la
  // lista se llenaría de los doscientos artículos que no tocaba pedir.
  function excluidas(vendor) {
    if (!hay('isRowPlaced')) return master().filter(() => false);
    return master().filter(r =>
      r.vendor === vendor &&
      Number(r.orderOverride) === 0 && r.orderOverride !== '' && r.orderOverride !== null &&
      num(r.toOrder) > 0 &&
      !window.isRowPlaced(r));
  }

  function pintarDetalle(host) {
    const v = proveedores().find(x => x.nombre === _vendor);
    if (!v) { _vendor = null; return pintarResumen(host); }
    const fuera = excluidas(v.nombre);

    // El mismo orden que el escritorio: lo más urgente arriba. Repasar
    // un pedido es mirar las primeras líneas, así que el orden ES la
    // información.
    host.innerHTML = `
      <button type="button" class="m-back m-back-gde" id="moBack">
        <i class="ti ti-chevron-left" aria-hidden="true"></i> All orders
      </button>

      <div class="m-ord-h">
        <span class="m-inv-t">${esc(v.nombre)}</span>
        <div class="m-ord-tot">${money(v.total)}
          <small>${v.filas.length} line${v.filas.length === 1 ? '' : 's'}${
            v.sinPrecio ? ' · ' + v.sinPrecio + ' without price' : ''}</small></div>
      </div>

      <!-- Arriba y no al final. Antes aquí vivía el aviso de que esto
           sólo se podía hacer desde el escritorio; ahora vive el botón,
           en el mismo sitio y por la misma razón: con noventa líneas,
           lo que está al final no se encuentra. -->
      <button type="button" class="m-ord-enviar" id="moSend">
        Review and send
      </button>

      <!-- Sólo si este proveedor admite ajuste manual: añadir una
           línea ES poner una cantidad a mano, así que en los demás el
           botón abriría un diálogo que no puede guardar nada. -->
      ${hay('supportsManualFinalOrder') && window.supportsManualFinalOrder(v.nombre) ? `
        <button type="button" class="m-ord-add" id="moAdd">
          <i class="ti ti-plus" aria-hidden="true"></i> Add a product
        </button>` : ''}

      <div id="moList">${v.filas.map(linea).join('')}</div>

      ${fuera.length ? `
        <div class="m-ord-fuera">
          <div class="m-ord-fuera-h">
            Left out of this order · ${fuera.length}
          </div>
          ${fuera.map(r => {
            const i = master().indexOf(r);
            return `
              <div class="m-ord-fl">
                <span class="m-ord-fl-n">${esc(r.item)}</span>
                <small>auto wanted ${n2(r.toOrder)}</small>
                <button type="button" class="m-ord-volver" data-volver="${i}">Bring back</button>
              </div>`;
          }).join('')}
        </div>` : ''}`;

    host.querySelector('#moBack').onclick = () => { _vendor = null; pintar(host); };
    const env = host.querySelector('#moSend');
    if (env) env.onclick = () => { _revisar = true; _to = []; _destDe = null; pintar(host); };
    const add = host.querySelector('#moAdd');
    if (add) add.onclick = () => {
      // Se le pasa el proveedor. Sin él, el diálogo mira la pestaña
      // del escritorio —que aquí no significa nada— y se cierra solo.
      if (window.BarStockAddToOrder) window.BarStockAddToOrder.open(v.nombre);
    };
    host.querySelectorAll('[data-volver]').forEach(b => {
      b.onclick = () => {
        // Vuelve a automático, no a la cantidad que tuviera antes: el
        // automático se recalcula con lo que hay hoy en el estante.
        if (hay('resetFinalOrder')) { window.resetFinalOrder(Number(b.dataset.volver)); pintar(host); }
      };
    });
    enganchar(host);
  }

  // ── Revisión ─────────────────────────────────────────────────────────
  //
  // Aquí NO se edita. Una pantalla que muestra y a la vez deja cambiar
  // no es una revisión: es la pantalla anterior otra vez. Si algo está
  // mal, atrás y se corrige donde se corrige.
  //
  // Los destinatarios sí se tocan, porque ésos cambian por envío.

  const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]{2,}$/;
  const partir = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

  async function cargarDestinatarios(vendor, host) {
    if (_cargandoDest || _destDe === vendor) return;
    _cargandoDest = true;
    _destDe = vendor;
    try {
      if (window.BarStockVendorDefaults) {
        const d = await window.BarStockVendorDefaults.getDefaults(vendor);
        _to = partir(d && d.vendor_email);
      }
    } catch (e) {
      // Sin correo guardado no se bloquea nada: se escribe a mano.
      console.warn('[orders] no se pudieron leer los destinatarios', e);
    }
    _cargandoDest = false;
    if (_revisar && _vendor === vendor) pintar(host);
  }

  function pintarRevision(host) {
    const v = proveedores().find(x => x.nombre === _vendor);
    if (!v) { _revisar = false; _vendor = null; return pintarResumen(host); }

    const botellas = v.filas.reduce((s, r) => s + cantidad(r), 0);

    host.innerHTML = `
      <button type="button" class="m-back m-back-gde" id="mrBack">
        <i class="ti ti-chevron-left" aria-hidden="true"></i> ${esc(v.nombre)}
      </button>

      <div class="m-ord-h">
        <span class="m-inv-t">Review the order</span>
        <div class="m-ord-tot">${money(v.total)}
          <small>${v.filas.length} line${v.filas.length === 1 ? '' : 's'} · ${n2(botellas)} bottles${
            v.sinPrecio ? ' · ' + v.sinPrecio + ' without price' : ''}</small></div>
      </div>

      <div class="m-rev-lab">You are ordering</div>
      <div class="m-rev-list">
        ${v.filas.map(r => `
          <div class="m-rev-l">
            <span class="q">${n2(cantidad(r))}×</span>
            <span class="n">${esc(r.item || '')}</span>
            <span class="v">${num(r.value) > 0
              ? money(num(r.value) * cantidad(r)) : 'no price'}</span>
          </div>`).join('')}
      </div>

      <div class="m-rev-lab">To</div>
      <div class="m-rev-chips" id="mrTo">
        ${_cargandoDest && !_to.length
          ? '<span class="m-rev-cargando">Looking up the saved address…</span>'
          : _to.map((e, i) => `
              <span class="m-rev-chip">${esc(e)}
                <button type="button" data-quitar="${i}" aria-label="Remove ${esc(e)}">
                  <i class="ti ti-x" aria-hidden="true"></i></button>
              </span>`).join('')}
        <button type="button" class="m-rev-chip m-rev-add" id="mrAdd">
          <i class="ti ti-plus" aria-hidden="true"></i> Add
        </button>
      </div>
      <div class="m-rev-nuevo" id="mrNuevo" hidden>
        <input type="email" id="mrMail" inputmode="email" autocomplete="email"
               autocapitalize="off" spellcheck="false" placeholder="name@vendor.com">
        <button type="button" id="mrOk">Add</button>
      </div>

      <label class="m-rev-rec">
        <input type="checkbox" id="mrRec"${_recordar ? ' checked' : ''}>
        <span>Remember these for ${esc(v.nombre)}</span>
      </label>

      <div class="m-rev-pie">
        <div class="m-rev-pie-r">
          <span>${n2(botellas)} bottles to ${esc(v.nombre)}</span>
          <b>${money(v.total)}</b>
        </div>
        <button type="button" class="m-rev-go" id="mrGo"${
          _to.length && !_colocando ? '' : ' disabled'}>${
          _colocando ? 'Placing…' : 'Place order'}</button>
        ${!_to.length && !_cargandoDest
          ? '<div class="m-rev-falta">Add at least one address first.</div>' : ''}
      </div>`;

    host.querySelector('#mrBack').onclick = () => { _revisar = false; pintar(host); };

    host.querySelectorAll('[data-quitar]').forEach(b => {
      b.onclick = () => { _to.splice(Number(b.dataset.quitar), 1); pintar(host); };
    });

    const caja = host.querySelector('#mrNuevo');
    const mail = host.querySelector('#mrMail');
    host.querySelector('#mrAdd').onclick = () => {
      caja.hidden = false;
      if (mail) mail.focus();
    };
    const meter = () => {
      const val = String(mail.value || '').trim();
      if (!EMAIL.test(val)) {
        mail.setAttribute('aria-invalid', 'true');
        if (window.BarStockToast) window.BarStockToast.show('That address does not look right.');
        return;
      }
      if (!_to.includes(val)) _to.push(val);
      pintar(host);
    };
    host.querySelector('#mrOk').onclick = meter;
    // Enter en el teclado del teléfono hace lo mismo que el botón.
    mail.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); meter(); } };

    host.querySelector('#mrRec').onchange = (ev) => { _recordar = !!ev.target.checked; };
    host.querySelector('#mrGo').onclick = () => colocar(v, host);

    cargarDestinatarios(v.nombre, host);   // no hace nada si ya se preguntó
  }

  // ── Colocar ──────────────────────────────────────────────────────────
  //
  // Esto guarda. El correo es el paso siguiente y todavía no existe
  // aquí: hasta que exista, se coloca desde el teléfono y se manda
  // desde el escritorio, que es exactamente lo que se hacía antes con
  // el paso de colocar incluido.
  //
  // Se reusa `persistOrderToSupabase` y `loadOrdersFromCloud`, las
  // mismas del escritorio. Nada de una segunda forma de guardar una
  // orden: con dos, cualquier arreglo hay que hacerlo dos veces y la
  // segunda se olvida.

  async function guardarDestinatarios(vendor) {
    if (!_recordar || !window.BarStockVendorDefaults) return;
    try {
      // LEER y fusionar. `saveDefaults` escribe el registro entero, así
      // que mandar sólo el correo borraría el número de cuenta, el rep
      // y la ventana de entrega.
      const d = (await window.BarStockVendorDefaults.getDefaults(vendor)) || {};
      await window.BarStockVendorDefaults.saveDefaults(vendor,
        Object.assign({}, d, { vendor_email: _to.join(', ') }));
    } catch (e) {
      // Que no se guarde la libreta no puede tumbar una orden que ya
      // está en la nube.
      console.warn('[orders] no se pudieron guardar los destinatarios', e);
    }
  }

  async function colocar(v, host) {
    if (_colocando) return;
    if (!_to.length) return;

    const avisar = (t) => { if (window.BarStockToast) window.BarStockToast.show(t); };

    if (typeof window.persistOrderToSupabase !== 'function' ||
        typeof window.loadOrdersFromCloud !== 'function') {
      avisar('Orders are not connected right now. Try again in a moment.');
      return;
    }

    const filas = v.filas
      .map(r => (hay('cloneOrderRow') ? window.cloneOrderRow(r) : r))
      .filter(r => cantidad(r) > 0);
    if (!filas.length) { avisar('Nothing to order for this vendor.'); return; }

    _colocando = true;
    pintar(host);

    const ahora = new Date().toISOString();
    const orden = {
      id: hay('uniqueOrderId') ? window.uniqueOrderId() : 'ord_' + Date.now(),
      vendor: v.nombre,
      createdAt: ahora,
      date: ahora,
      // El mismo reparto que el escritorio: LOOP sale por CSV y el
      // resto por imagen. Que el tipo lo decida otro sitio sería una
      // segunda regla que se desincroniza.
      exportType: v.nombre === 'LOOP' ? 'loop_csv' : 'vendor_jpg',
      filename: v.nombre === 'LOOP'
        ? 'loop_upload.csv'
        : 'vendor_order_' + String(v.nombre).toLowerCase().replace(/\s+/g, '_') + '.jpg',
      items: filas,
      totalUnits: filas.reduce((s, r) => s + cantidad(r), 0),
      subtotal: hay('computeOrderSubtotal') ? window.computeOrderSubtotal(filas) : v.total
    };

    try {
      await window.persistOrderToSupabase(orden);

      if (window.BarStockParIntelligence) {
        window.BarStockParIntelligence.updateSnapshotOrdered(orden.items)
          .catch(e => console.warn('[ParIntelligence] updateSnapshotOrdered', e));
      }
      if (window.BarStockLogger) {
        window.BarStockLogger.log('place_order_saved', {
          vendor: v.nombre, orderId: orden.id, totalUnits: orden.totalUnits,
          subtotal: orden.subtotal, itemCount: filas.length, from: 'mobile'
        });
      }

      await window.loadOrdersFromCloud();
      await guardarDestinatarios(v.nombre);

      avisar(v.nombre + ' order placed · email it from desktop');
      _colocando = false;
      _revisar = false;
      _vendor = null;
      pintar(host);
    } catch (e) {
      _colocando = false;
      pintar(host);
      // Con todas las letras: si no se guardó, NO está colocada. Lo
      // contrario —creer que sí— acaba en dos órdenes al mismo
      // proveedor.
      avisar('Could not place it: ' + (e && e.message ? e.message : String(e)));
      console.error('[orders] colocar falló', e);
    }
  }

  function linea(r) {
    const i = master().indexOf(r);
    const q = cantidad(r);
    const precio = num(r.value);
    const conPrecio = precio > 0;
    const editada = aMano(r) && ajustable(r);
    const falló = _fallos.has(clave(r));
    const agotado = num(r.onHand) <= 0;

    // El estado de la derecha: primero lo que puede costar dinero.
    const marca = falló
      ? '<span class="m-ord-mal">not saved</span>'
      : !conPrecio ? '<span class="m-ord-sin">no price</span>'
      : editada ? '<span class="m-ord-ed">edited</span>'
      : agotado ? '<span class="m-ord-out">out</span>' : '';

    return `
      <div class="m-ord-l${!conPrecio ? ' sinprecio' : ''}${editada ? ' editada' : ''}${falló ? ' mal' : ''}"
           data-i="${i}">
        <div class="m-ord-l-top">
          <span class="m-ord-l-n">${esc(r.item)}</span>
          ${marca}
          ${ajustable(r) ? `<button type="button" class="m-ord-x" data-fuera="${i}"
                                    aria-label="Leave out of this order">
                              <i class="ti ti-x" aria-hidden="true"></i>
                            </button>` : ''}
        </div>
        <div class="m-ord-l-s">${n2(r.onHand)} of ${n2(r.suggested)} on hand${
          conPrecio ? ' · ' + money(precio) + ' each'
                    : ' · won’t count toward the total'}</div>

        ${ajustable(r) ? `
          <div class="m-ord-q">
            <button type="button" data-q="-1" aria-label="One less">−</button>
            <input type="number" inputmode="numeric" min="0" step="1"
                   value="${q}" aria-label="Quantity to order">
            <button type="button" data-q="1" aria-label="One more">+</button>
            <span class="m-ord-l-t">${conPrecio ? money(q * precio) : '—'}</span>
          </div>
          ${editada ? `<button type="button" class="m-ord-undo">
             Auto was ${n2(r.toOrder)} · <b>undo</b></button>` : ''}
        ` : `
          <div class="m-ord-auto">
            <b>${n2(q)}</b>
            <span>automatic · this vendor has no manual override</span>
            <span class="m-ord-l-t">${conPrecio ? money(q * precio) : '—'}</span>
          </div>`}
      </div>`;
  }

  function enganchar(host) {
    host.querySelectorAll('.m-ord-l').forEach(caja => {
      const i = Number(caja.dataset.i);
      const inp = caja.querySelector('input');
      if (!inp) return;

      const guardar = (valor) => {
        if (!hay('updateFinalOrder')) return;
        _fallos.delete(clave(master()[i] || {}));
        window.updateFinalOrder(i, valor);
        pintar(host);
      };

      // Excluir es poner la cantidad a cero: lo mismo que ya hacía
      // bajar con el botón, pero dicho y con sitio al que va.
      const fuera = caja.querySelector('[data-fuera]');
      if (fuera) fuera.onclick = () => guardar(0);

      caja.querySelectorAll('[data-q]').forEach(b => {
        b.onclick = () => {
          const d = Number(b.dataset.q);
          guardar(Math.max(0, (Number(inp.value) || 0) + d));
        };
      });
      // change y no input: escribiendo "12" pasa por "1", y guardar ese
      // 1 en la nube a mitad de tecleo es una orden de una botella.
      inp.onchange = () => guardar(Math.max(0, Number(inp.value) || 0));

      const undo = caja.querySelector('.m-ord-undo');
      if (undo) undo.onclick = () => {
        if (hay('resetFinalOrder')) { window.resetFinalOrder(i); pintar(host); }
      };
    });
  }

  // ── Pintar ───────────────────────────────────────────────────────────

  function pintar(host) {
    if (!host) return;
    if (_vendor && _revisar) pintarRevision(host);
    else if (_vendor) pintarDetalle(host);
    else pintarResumen(host);
  }

  function pantalla() {
    return document.querySelector('.m-screen[data-screen="orders"]');
  }

  function refresh() {
    const host = pantalla();
    if (host && host.classList.contains('on')) pintar(host);
  }

  // Lo llama persistOrderOverride cuando la nube rechaza el cambio. El
  // aviso del escritorio sale en su barra de estado, que aquí no
  // existe: sin esto, ajustar con mala señal se ve igual que ajustar
  // bien, y la diferencia aparece el día del pedido.
  function falloAlGuardar(row) {
    if (!row) return;
    _fallos.add(clave(row));
    refresh();
  }

  // ── Entrar directo a un proveedor ──────────────────────────────────
  //
  // La tarjeta del Home enseña las órdenes que esperan, una fila por
  // proveedor. Pulsar una tiene que llevarte A ESA, no al índice que
  // acabas de leer para volver a elegir lo mismo.
  //
  // `_pedida` y no abrir aquí la pantalla: `show()` se ejecuta DESPUÉS
  // y pone `_vendor = null` —a propósito, para que entrar por la
  // pestaña arranque siempre en el resumen—. Así que se deja la
  // petición anotada y es `show()` quien la recoge y la borra.
  let _pedida = null;

  function abrirVendor(nombre) {
    _pedida = String(nombre || '') || null;
    if (window.BarStockMobile) window.BarStockMobile.ir('orders');
  }

  window.BarStockMobileOrders = { refresh, falloAlGuardar, abrirVendor };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      id: 'orders', icon: 'ti-shopping-cart', label: 'Orders',
      tab: true, orden: 40,
      mount: pintar,
      // Repinta donde estés: si estás dentro de LOOP y alguien cambia
      // una cantidad en el ordenador, cambia la cifra, no la pantalla.
      refrescar: pintar,
      // Deslizar desde el borde vuelve al resumen. Sin proveedor
      // abierto no hay a dónde volver, y se contesta que no para que
      // el gesto ni se arme.
      atras(host, hacerlo) {
        if (!_vendor) return false;
        if (hacerlo) {
          // Un escalón cada vez: de la revisión se vuelve a las líneas,
          // no al resumen. Saltarse el intermedio al deslizar hace
          // perder el sitio.
          if (_revisar) _revisar = false; else _vendor = null;
          pintar(host);
        }
        return true;
      },
      // Al volver se arranca siempre en el resumen: entrar a Órdenes y
      // caer dentro del proveedor que miraste ayer es desorientador.
      //
      // Salvo que alguien haya pedido uno concreto —la tarjeta del
      // Home—. Esa petición se consume aquí y se borra: vale para esta
      // entrada y ninguna más.
      show(host) {
        _vendor = _pedida || null;
        _pedida = null;
        // Nunca se entra directo a la revisión: es el último paso de un
        // camino, no un sitio al que llegar. Si se quedara puesta, al
        // volver a Órdenes aparecería una pantalla de confirmar un
        // pedido que no acabas de repasar.
        _revisar = false;
        _to = []; _destDe = null;
        _colocando = false;
        pintar(host);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
