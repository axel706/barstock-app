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
  // La FOTO de lo que se está confirmando, tomada al entrar.
  //
  // No se puede repintar la revisión consultando `proveedores()` cada
  // vez: en cuanto la orden se guarda, sus líneas dejan de estar
  // pendientes y ese proveedor desaparece de la lista. Y como
  // `loadOrdersFromCloud()` dispara un repintado a mitad del envío, la
  // pantalla se desmontaba sola — los pasos 2 y 3 no se veían y
  // acababas en la lista sin confirmación, con el correo ya enviado.
  //
  // Una pantalla de confirmar tiene que enseñar lo que vas a confirmar,
  // congelado. Que cambie bajo los pies mientras la miras es lo
  // contrario de confirmar.
  let _vista = null;         // { nombre, filas, total, botellas, sinPrecio }
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

  // El encabezado lo arma el armazón: chevron a la izquierda del
  // título, en la misma fila, para no gastar un renglón en volver.
  const cab = (o) => (window.BarStockMobile && window.BarStockMobile.cabecera)
    ? window.BarStockMobile.cabecera(o)
    : '<div class="m-inv-t">' + esc(o.titulo || '') + '</div>';
  const volverCon = (host, fn) => {
    if (window.BarStockMobile && window.BarStockMobile.alVolver) {
      window.BarStockMobile.alVolver(host, fn);
    }
  };

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

    // Sin título propio: "Orders" lo pone el contenedor, arriba del
    // segmentado. Estaba aquí de cuando esta sección ERA la pantalla,
    // y al mudarse salía dos veces seguidas.
    host.innerHTML = `
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
      b.onclick = () => { _vendor = vs[Number(b.dataset.v)].nombre; repintar(); };
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
      ${cab({
        volverA: 'All orders',
        titulo: v.nombre,
        der: `<div class="m-ord-tot">${money(v.total)}
          <small>${v.filas.length} line${v.filas.length === 1 ? '' : 's'}${
            v.sinPrecio ? ' · ' + v.sinPrecio + ' without price' : ''}</small></div>`
      })}

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

    volverCon(host, () => { _vendor = null; repintar(); });
    const env = host.querySelector('#moSend');
    if (env) env.onclick = () => {
      salirRevision();
      _revisar = true;
      _vista = {
        nombre: v.nombre,
        filas: v.filas.slice(),
        total: v.total,
        sinPrecio: v.sinPrecio,
        botellas: v.filas.reduce((s, r) => s + cantidad(r), 0)
      };
      repintar();
    };
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
        if (hay('resetFinalOrder')) { window.resetFinalOrder(Number(b.dataset.volver)); repintar(); }
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

  // Salir de la revisión limpia TODO su estado, y `_colocada` es el
  // que importa: si se quedara puesto, al revisar el siguiente
  // proveedor el paso de guardar se saltaría —cree que ya está— y se
  // mandaría el correo de una orden que nunca se guardó.
  function salirRevision() {
    _revisar = false;
    _to = []; _destDe = null;
    _colocando = false; _paso = 0;
    _falloCorreo = false; _dudaCorreo = false; _colocada = null;
    _enviado = null;
    _vista = null;
  }

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
    if (_revisar && _vendor === vendor) repintar();
  }

  function pintarEnviado(host) {
    const e = _enviado;
    host.innerHTML = `
      <div class="m-rev-ok">
        <div class="m-rev-ok-i"><i class="ti ti-circle-check" aria-hidden="true"></i></div>
        <div class="m-rev-ok-t">Sent to ${esc(e.vendor)}</div>
        <div class="m-rev-ok-s">${n2(e.botellas)} bottles · ${money(e.total)}</div>
        <div class="m-rev-ok-m">${e.to.map(x => esc(x)).join('<br>')}</div>
        <div class="m-rev-ok-n">The order is placed and the email is on its way
          with the PDF attached. You can resend it from History.</div>
        <button type="button" class="m-rev-go" id="mrDone">Done</button>
      </div>`;
    // Salir lo decides tú. Que la pantalla se cierre sola es lo que
    // hacía que un envío correcto pareciera un fallo.
    host.querySelector('#mrDone').onclick = () => {
      _enviado = null;
      salirRevision();
      _vendor = null;
      repintar();
    };
  }

  function pintarRevision(host) {
    if (_enviado) return pintarEnviado(host);

    // De la FOTO, no de `proveedores()`. Ver el comentario de `_vista`.
    const v = _vista;
    if (!v) { salirRevision(); _vendor = null; return pintarResumen(host); }

    const botellas = v.botellas;

    host.innerHTML = `
      ${cab({
        volverA: v.nombre,
        titulo: 'Review the order',
        der: `<div class="m-ord-tot">${money(v.total)}
          <small>${v.filas.length} line${v.filas.length === 1 ? '' : 's'} · ${n2(botellas)} bottles${
            v.sinPrecio ? ' · ' + v.sinPrecio + ' without price' : ''}</small></div>`
      })}

      <!-- ── El bloque de enviar va ARRIBA ─────────────────────
           Estaba abajo, en un pie pegajoso, y ese pie pintaba un
           rectángulo oscuro sobre el fondo de la app que se leía como
           una barra negra. Arriba no hace falta nada pegajoso: lo
           primero que ves al entrar es a quién va y el botón, y las
           líneas quedan debajo para repasarlas si quieres. -->
      <div class="m-rev-enviar">
        <!-- Un título, para que el bloque se lea como UNA cosa. Sin
             él, las fichas, el campo y la casilla parecían tres
             controles sueltos que casualmente estaban juntos. -->
        <div class="m-rev-enviar-h">Send this order</div>
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

        ${_colocando ? `
          <!-- Tres pasos y no una rueda: si el correo falla hay que
               poder ver que el paso de guardar ya pasó. Cada uno dura
               un mínimo en pantalla, o pasan tan rápido que no se leen
               y parece que no hizo nada. -->
          <div class="m-rev-pasos">
            <div class="${_paso > 1 ? 'ok' : 'go'}">${_paso > 1 ? '✓' : '●'} Saving the order</div>
            <div class="${_paso > 2 ? 'ok' : _paso === 2 ? 'go' : ''}">${
              _paso > 2 ? '✓' : '●'} Building the PDF</div>
            <div class="${_paso === 3 ? 'go' : ''}">● Emailing ${esc(_to[0] || '')}</div>
          </div>` : ''}

        ${_falloCorreo ? (_dudaCorreo ? `
          <!-- DUDA, no fallo. El servidor no contestó claro, y eso
               pasa cuando el PDF sube lento: la petición llega, el
               correo sale, y la respuesta se pierde. Decir "no salió"
               cuando el proveedor ya lo tiene hace que lo mandes dos
               veces. -->
          <div class="m-rev-fallo duda">
            <b>The order is placed.</b> We could not confirm the email.
            It may well have gone out — check your inbox before sending
            it again.
          </div>` : `
          <div class="m-rev-fallo">
            <b>The order is placed.</b> The email did not go out.
            You can send it again from here or from History.
          </div>`) : ''}

        <button type="button" class="m-rev-go" id="mrGo"${
          _to.length && !_colocando ? '' : ' disabled'}>${
          _colocando ? 'Working…'
            : _dudaCorreo ? 'Send it again anyway'
            : _falloCorreo ? 'Try sending again'
            : 'Place & send'}</button>
        ${!_to.length && !_cargandoDest
          ? '<div class="m-rev-falta">Add at least one address first.</div>' : ''}
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
      </div>`;

    volverCon(host, () => { salirRevision(); repintar(); });

    host.querySelectorAll('[data-quitar]').forEach(b => {
      b.onclick = () => { _to.splice(Number(b.dataset.quitar), 1); repintar(); };
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
      repintar();
    };
    host.querySelector('#mrOk').onclick = meter;
    // Enter en el teclado del teléfono hace lo mismo que el botón.
    mail.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); meter(); } };

    host.querySelector('#mrRec').onchange = (ev) => { _recordar = !!ev.target.checked; };
    host.querySelector('#mrGo').onclick = () => colocar(v, host);

    cargarDestinatarios(v.nombre, host);   // no hace nada si ya se preguntó
  }

  // ── Colocar y enviar ─────────────────────────────────────────────────
  //
  // Se reusa `persistOrderToSupabase` y `loadOrdersFromCloud`, las
  // mismas del escritorio. Nada de una segunda forma de guardar una
  // orden: con dos, cualquier arreglo hay que hacerlo dos veces y la
  // segunda se olvida. El PDF sale de `BarStockEmailOrder.generarPdf`
  // por lo mismo: es lo único que ve el proveedor.
  //
  // El ORDEN no es intercambiable. Primero se guarda, después sale el
  // correo. Si fuera al revés y el guardado fallara, el proveedor
  // tendría un pedido que la app no conoce — y eso aparece semanas
  // después, al no poder cuadrar su factura contra ninguna orden.
  // Al revés es recuperable: queda una orden colocada que se reenvía
  // desde History.

  // Los pasos que se enseñan mientras trabaja. Un botón quieto cinco
  // segundos se pulsa dos veces, y dos pulsaciones son dos órdenes.
  let _paso = 0;            // 0 nada · 1 guardando · 2 PDF · 3 enviando
  let _falloCorreo = false; // guardada pero el correo no salió
  let _dudaCorreo = false;  // ...o no sabemos si salió, que no es igual
  // La orden YA guardada en la nube. Mientras exista, reintentar manda
  // el correo y nada más: volver a guardarla crearía una segunda orden
  // al mismo proveedor, que es justo el desastre que el aviso de
  // "the order is placed" viene a evitar.
  let _colocada = null;
  // Lo que se enseña al terminar. Hacerlo todo bien y no decirlo se
  // lee igual que fallar: antes la pantalla se cerraba sola y te
  // devolvía a la lista sin una palabra.
  let _enviado = null;      // { vendor, to: [], botellas, total }

  // Cada paso dura un MÍNIMO en pantalla. Guardar y mandar tardan
  // décimas con buena señal, así que los tres pasos pasaban en un
  // parpadeo y no se leía ninguno — peor que no enseñarlos.
  const PASO_MS = 420;
  const alMenos = async (ms, trabajo) => {
    const t0 = Date.now();
    const r = await trabajo;
    const falta = ms - (Date.now() - t0);
    if (falta > 0) await new Promise(res => setTimeout(res, falta));
    return r;
  };

  // `destinatarios` entra por parámetro y no se lee de `_to` para que
  // History pueda reusar esto tal cual: allí no hay pantalla de
  // revisión, pero el correo tiene que salir exactamente igual.
  async function enviarCorreo(orden, destinatarios) {
    const para = (destinatarios && destinatarios.length) ? destinatarios.slice() : _to.slice();
    if (!para.length) throw new Error('No address to send it to.');
    const E = window.BarStockEmailOrder;
    if (!E || typeof E.generarPdf !== 'function') {
      throw new Error('The order mailer is not loaded.');
    }

    const loc = (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || 'BarStock';

    let defs = {}, perfil = {};
    try { if (window.BarStockVendorDefaults)
      defs = (await window.BarStockVendorDefaults.getDefaults(orden.vendor)) || {}; } catch (e) {}
    try { if (window.BarStockSenderProfile)
      perfil = (await window.BarStockSenderProfile.getProfile()) || {}; } catch (e) {}

    const pdf = await E.generarPdf(orden.vendor, orden.items, {
      location: loc,
      vendor: orden.vendor,
      poNumber: orden.poNumber || '',
      date: new Date().toLocaleDateString('en-US',
        { month: 'short', day: 'numeric', year: 'numeric' }),
      deliveryDate: '',
      buyerName: perfil.name || '',
      buyerEmail: perfil.email || '',
      buyerPhone: perfil.phone || '',
      buyerTitle: perfil.title || '',
      items: orden.items.length,
      totalUnits: orden.totalUnits,
      vendorDefaults: defs
    });

    let replyTo = null;
    try { if (window.BarStockLocationSettings)
      replyTo = await window.BarStockLocationSettings.getReplyToEmail(); } catch (e) {}

    const cuerpo = {
      to: para,
      vendor: orden.vendor,
      items: orden.items,
      totalUnits: orden.totalUnits,
      subtotal: orden.subtotal,
      locationName: loc,
      pdfBase64: pdf,
      filename: String(orden.vendor).toLowerCase().replace(/\s+/g, '_') +
                '_order_' + new Date().toISOString().slice(0, 10) + '.pdf'
    };
    if (replyTo) cuerpo.replyTo = replyTo;
    if (perfil.name) cuerpo.senderName = perfil.name;
    if (perfil.email) cuerpo.senderEmail = perfil.email;

    const res = await fetch('https://barstock-app.vercel.app/api/send-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });

    // ── Rechazado NO es lo mismo que no saber ──────────────────────
    //
    // Antes cualquier respuesta que no fuera `{ok:true}` se daba por
    // fallo. Pero con un PDF grande subiendo por 5G pasa esto: la
    // petición llega, el servidor manda el correo, y la RESPUESTA se
    // pierde o vuelve como una página de error del gateway. El
    // proveedor ya tiene el pedido y la app dice que no salió.
    //
    // Si el servidor contesta y dice que no, es un fallo de verdad.
    // Si no se entiende la respuesta, es una duda — y una duda hay
    // que contarla como duda, porque reenviar a ciegas manda el
    // pedido dos veces.
    let r = null;
    try { r = await res.json(); } catch (e) { r = null; }

    if (r && r.ok) return para;
    if (r && r.error) throw new Error(r.error);

    const dudoso = new Error(
      'The server did not answer clearly (HTTP ' + res.status + ').');
    dudoso.incierto = true;
    throw dudoso;
  }

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

    let orden = _colocada;

    // ── 1 · Guardar ────────────────────────────────────────────────
    //
    // Se SALTA si ya está colocada. Reintentar después de un fallo de
    // correo manda el correo y nada más: volver a guardar crearía una
    // segunda orden al mismo proveedor.
    if (!orden) {
      const filas = v.filas
        .map(r => (hay('cloneOrderRow') ? window.cloneOrderRow(r) : r))
        .filter(r => cantidad(r) > 0);
      if (!filas.length) { avisar('Nothing to order for this vendor.'); return; }

      _colocando = true;
      _falloCorreo = false;
      _paso = 1;
      repintar();

      const ahora = new Date().toISOString();
      orden = {
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
        await alMenos(PASO_MS, window.persistOrderToSupabase(orden));

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
      } catch (e) {
        _colocando = false; _paso = 0;
        repintar();
        // Si no se guardó, NO está colocada. Decirlo con todas las
        // letras: creer lo contrario acaba en dos órdenes al mismo
        // proveedor.
        avisar('Could not place it: ' + (e && e.message ? e.message : String(e)));
        console.error('[orders] guardar la orden falló', e);
        return;
      }

      // Desde aquí la orden YA EXISTE. Lo que falle a partir de ahora
      // no la deshace, y la pantalla no puede dar a entender que sí.
      _colocada = orden;
      await guardarDestinatarios(v.nombre);
    } else {
      _colocando = true;
      _falloCorreo = false;
      repintar();
    }

    // ── 2 · El PDF y el correo ─────────────────────────────────────
    _paso = 2;
    repintar();
    let fueron = [];
    try {
      // El PDF se ve construirse: es el paso que de verdad tarda en un
      // iPhone, y el que explica por que la pantalla no reacciona.
      await alMenos(PASO_MS, Promise.resolve());
      _paso = 3;
      repintar();
      fueron = await alMenos(PASO_MS, enviarCorreo(orden));
    } catch (e) {
      // La orden está colocada y el correo no salió —o no sabemos si
      // salió—. Es el estado que más confunde, así que se queda en
      // pantalla diciéndolo en vez de desaparecer con un aviso.
      _colocando = false; _paso = 0;
      _falloCorreo = true;
      _dudaCorreo = !!(e && e.incierto);
      repintar();
      console.error('[orders] el correo no salió', e);
      avisar(_dudaCorreo
        ? 'Order placed. Could not confirm the email.'
        : 'Order placed, but the email did not go out.');
      return;
    }

    // ── De aquí para abajo el correo YA SALIÓ ──────────────────────
    //
    // Nada de esto puede marcar el envío como fallido. Antes todo
    // vivía dentro del mismo try, así que un error al registrar o al
    // repintar daba "el correo no salió" con el correo ya entregado.
    try {
      if (window.BarStockLogger) {
        window.BarStockLogger.log('email_order_sent', {
          vendor: v.nombre, orderId: orden.id, to: fueron.join(', '),
          itemCount: orden.items.length, from: 'mobile'
        });
      }
      // Se QUEDA en pantalla diciendo que salio. Antes se cerraba
      // sola y te devolvia a la lista sin una palabra: con el correo
      // ya en la bandeja del proveedor, eso se lee como que fallo.

    } catch (e) {
      console.error('[orders] el correo salió pero algo después falló', e);
    }

    _colocando = false; _paso = 0; _falloCorreo = false; _dudaCorreo = false;
    _colocada = null;
    _enviado = {
      vendor: v.nombre,
      to: fueron.slice(),
      botellas: orden.totalUnits,
      total: orden.subtotal
    };
    repintar();
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
        repintar();
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
        if (hay('resetFinalOrder')) { window.resetFinalOrder(i); repintar(); }
      };
    });
  }

  // ── Las tres secciones ───────────────────────────────────────────
  //
  // Órdenes, historial y facturas contestan la misma pregunta en tres
  // momentos: qué voy a pedir, qué pedí, qué llegó. Vivían en tres
  // sitios y seguir ese hilo obligaba a pasar por More dos veces.
  //
  // Esto NO rediseña ninguna de las tres. Cada una sigue pintando su
  // `innerHTML` igual que antes; lo único que cambia es que recibe un
  // div de aquí dentro en vez de la pantalla entera. No se enteran.

  const SECCIONES = [
    { id: 'open',  n: 'Open',     sub: 'What the count says to buy.' },
    { id: 'sent',  n: 'Sent',     sub: 'What you sent, and what arrived.' },
    { id: 'inv',   n: 'Invoices', sub: 'What MarginEdge has received.' }
  ];
  let _sec = 'open';

  const H = () => window.BarStockMobileHistory;
  const I = () => window.BarStockMobileInvoices;

  // ¿La sección activa está dentro de un detalle? Entonces el
  // segmentado estorba: un detalle es otro nivel, y dejar ahí tres
  // pestañas invita a saltar de sección perdiendo lo que mirabas.
  function enDetalle() {
    if (_sec === 'open') return !!_vendor || !!_revisar;
    const m = _sec === 'sent' ? H() : I();
    return !!(m && m.enDetalle && m.enDetalle());
  }

  // El marco se arma UNA vez por pantalla. `#moCuerpo` no se vuelve a
  // crear nunca: si se recreara, el repintado asíncrono del historial
  // escribiría sobre un elemento que ya no está en el documento y la
  // sección se quedaría en blanco.
  function marco(host) {
    let cuerpo = host.querySelector('#moCuerpo');
    if (!cuerpo) {
      host.innerHTML = '<div id="moCab"></div><div id="moCuerpo"></div>';
      cuerpo = host.querySelector('#moCuerpo');
    }

    const cab = host.querySelector('#moCab');
    if (enDetalle()) { cab.innerHTML = ''; return cuerpo; }

    const s = SECCIONES.find(x => x.id === _sec) || SECCIONES[0];
    const nPend = proveedores().length;
    const nSin = (I() && I().resumen && (I().resumen() || {}).sueltas) || 0;

    cab.innerHTML =
      '<div class="m-inv-t">Orders</div>' +
      '<div class="m-isub">' + esc(s.sub) + '</div>' +
      '<div class="m-seg" id="moSeg">' +
        SECCIONES.map(x => {
          // El contador solo donde significa algo: proveedores con
          // pedido esperando, y líneas de factura sin enlazar. Un
          // contador en "Sent" seria el total del historial, que no
          // pide nada.
          const n = x.id === 'open' ? nPend : x.id === 'inv' ? nSin : 0;
          return '<button type="button" class="' + (x.id === _sec ? 'on' : '') + '"' +
            ' data-sec="' + x.id + '">' + esc(x.n) +
            (n ? ' <b>' + n + '</b>' : '') + '</button>';
        }).join('') +
      '</div>';

    cab.querySelectorAll('[data-sec]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.sec === _sec) return;
        _sec = b.dataset.sec;
        // Cada sección arranca por su lista. Volver a una y caer
        // dentro de lo que mirabas hace diez minutos desorienta.
        salirRevision(); _vendor = null;
        if (H() && H().reiniciar) H().reiniciar();
        if (I() && I().reiniciar) I().reiniciar();
        pintar(host);
      };
    });
    return cuerpo;
  }

  // ── Pintar ───────────────────────────────────────────────────────────

  // Redibuja la cabecera y nada más. Es lo que llaman las secciones
  // al abrir o cerrar un detalle.
  function refrescarMarco() {
    if (_host) marco(_host);
  }

  // La pantalla entera, recordada. Los manejadores de dentro reciben
  // el CUERPO, no la pantalla: si llamaran a `pintar()` con lo que
  // tienen a mano, se armaría un marco dentro de otro marco.
  let _host = null;
  const repintar = () => pintar(_host);

  function pintar(host) {
    if (!host) return;
    _host = host;
    const cuerpo = marco(host);

    // El `aviso` es cómo la sección le dice al marco que cambió de
    // nivel. Sin él, el detalle se pintaba dentro y el segmentado
    // seguía encima: dos salidas compitiendo.
    //
    // Redibuja SOLO la cabecera. Volver a montar la sección aquí
    // dispararía otra carga de red por cada vez que abres un detalle.
    if (_sec === 'sent') { if (H()) H().montar(cuerpo, refrescarMarco); return; }
    if (_sec === 'inv')  { if (I()) I().montar(cuerpo, refrescarMarco); return; }

    // La revisión manda mientras esté abierta, aunque el proveedor ya
    // no tenga líneas pendientes — que es justo lo que pasa en cuanto
    // la orden se guarda.
    if (_revisar) pintarRevision(cuerpo);
    else if (_vendor) pintarDetalle(cuerpo);
    else pintarResumen(cuerpo);
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
  let _secPedida = null;   // sección que alguien pidió al entrar

  function abrirVendor(nombre) {
    _pedida = String(nombre || '') || null;
    if (window.BarStockMobile) window.BarStockMobile.ir('orders');
  }

  // `enviarCorreo` se exporta para History: reenviar una orden ya
  // colocada es el MISMO correo, con el mismo PDF. Dos funciones que
  // mandan el mismo pedido acabarían mandándolo distinto.
  // `abrirSeccion` es cómo el resto de la app entra a una de las tres
  // sin saber que viven dentro de Orders. Antes se hacía con
  // `BarStockMobile.ir('invoices')`, que ya no existe como pantalla.
  function abrirSeccion(id) {
    _secPedida = (id === 'sent' || id === 'inv') ? id : 'open';
    if (window.BarStockMobile) window.BarStockMobile.ir('orders');
  }

  window.BarStockMobileOrders = {
    refresh, falloAlGuardar, abrirVendor, enviarCorreo, abrirSeccion
  };

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
      // El gesto del borde lo atiende la SECCIÓN que esté activa. Un
      // escalón cada vez, y nunca salta de sección: deslizar dentro
      // de una factura la cierra, no te manda a Open.
      //
      // En la raíz de cualquiera de las tres devuelve false: Orders es
      // una pestaña, no un sitio del que se vuelva.
      atras(host, hacerlo) {
        if (_sec === 'sent') {
          const m = H();
          if (!m || !m.enDetalle || !m.enDetalle()) return false;
          if (hacerlo) { m.cerrarDetalle(host.querySelector('#moCuerpo')); repintar(); }
          return true;
        }
        if (_sec === 'inv') {
          const m = I();
          if (!m || !m.enDetalle || !m.enDetalle()) return false;
          if (hacerlo) { m.cerrarDetalle(host.querySelector('#moCuerpo')); repintar(); }
          return true;
        }
        if (!_vendor) return false;
        if (hacerlo) {
          // De la revisión se vuelve a las líneas, no al resumen.
          // Saltarse el intermedio hace perder el sitio.
          if (_revisar) salirRevision(); else _vendor = null;
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
        // Entrar por la pestaña arranca siempre en Open. Las otras dos
        // son sitios a los que se va a propósito, no donde caer.
        //
        // Salvo que el Home haya pedido un proveedor concreto: eso es
        // una petición explícita y manda.
        _sec = _secPedida || 'open';
        _secPedida = null;
        if (H() && H().reiniciar) H().reiniciar();
        if (I() && I().reiniciar) I().reiniciar();
        _vendor = _pedida || null;
        _pedida = null;
        // Nunca se entra directo a la revisión: es el último paso de un
        // camino, no un sitio al que llegar. Si se quedara puesta, al
        // volver a Órdenes aparecería una pantalla de confirmar un
        // pedido que no acabas de repasar.
        salirRevision();
        pintar(host);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
