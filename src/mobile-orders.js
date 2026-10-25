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
  // ── Desde aquí NO se coloca ──────────────────────────────────────────
  //
  // Colocar manda correos, escribe el historial y cierra la semana. Eso
  // vive en el escritorio y aquí se dice, abajo, en vez de dejar que
  // alguien busque el botón.
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
      host.innerHTML = `
        <div class="m-inv-h"><span class="m-inv-t">Orders</span></div>
        <div class="m-empty">Nothing to order right now.<br>
          <small>Lines appear here once a count is in.</small></div>`;
      return;
    }

    // Apilado y no en dos columnas: "Orders" y "$590" uno al lado del
    // otro se peleaban por el ancho y la línea de abajo se metía
    // debajo del título.
    host.innerHTML = `
      <div class="m-inv-t">Orders</div>
      <div class="m-ord-gran">${money(total)}
        <span>across ${vs.length} vendor${vs.length === 1 ? '' : 's'}</span></div>

      <!-- También aquí, no sólo dentro de un proveedor: si sólo
           estuviera en el detalle, alguien que entra, mira los totales
           y se va nunca se entera de que esto no coloca nada. -->
      <div class="m-ord-nota">
        <i class="ti ti-device-desktop" aria-hidden="true"></i>
        Review and adjust here. Place orders from desktop or iPad.
      </div>
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

      <!-- Arriba y no al final: que no se pueda colocar desde aquí es
           lo primero que hay que saber, no la conclusión a la que se
           llega después de repasar doce líneas. -->
      <div class="m-ord-nota">
        <i class="ti ti-device-desktop" aria-hidden="true"></i>
        Review and adjust here. Place the order from desktop or iPad.
      </div>

      <button type="button" class="m-ord-add" id="moAdd">
        <i class="ti ti-plus" aria-hidden="true"></i> Add a product
      </button>

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
    const add = host.querySelector('#moAdd');
    if (add) add.onclick = () => {
      if (window.BarStockAddToOrder) window.BarStockAddToOrder.open();
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
    if (_vendor) pintarDetalle(host); else pintarResumen(host);
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

  window.BarStockMobileOrders = { refresh, falloAlGuardar };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      id: 'orders', icon: 'ti-shopping-cart', label: 'Orders',
      tab: true, orden: 40,
      mount: pintar,
      // Al volver se arranca siempre en el resumen: entrar a Órdenes y
      // caer dentro del proveedor que miraste ayer es desorientador.
      show(host) { _vendor = null; pintar(host); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
