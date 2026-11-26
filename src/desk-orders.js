(() => {
  if (window.BarStockDeskOrders) return;

  // ── Orders en el escritorio (Axel, 2026-11-26, lámina "Orders ·
  // desktop", A) ─────────────────────────────────────────────────────────
  //
  // Los proveedores en una columna a la izquierda (su llegada, sus líneas,
  // su total y lo suyo que no llega a su entrega) y la orden del elegido a
  // la derecha. Con el header de sitios fijos (desk-header.js): las vistas
  // To buy · Open · Sent · Invoices; la lupa para buscar líneas; Export
  // (azul) y Quick order (verde); en ⋯, Order analysis.
  //
  // La orden de la derecha NO es una segunda pantalla: es Open del
  // teléfono (BarStockMobileOrders.abrirEscritorio), con sus líneas, sus
  // sugerencias, "won't last", "Not on this order", "Add a product", la
  // revisión y el envío. Lo que coloca y manda una orden vive en un solo
  // sitio. Sus estilos salen GENERADOS de los del teléfono (compartir-
  // ficha.js → desk-ficha.css, bajo #dkoDet) y la fila ancha, en
  // desk-orders.css. Lo de antes (#vendorSection) se ESCONDE, no se quita:
  // Export, Quick order y Order analysis le hacen clic a sus botones, y el
  // tiempo real y render() siguen escribiendo ahí.

  const MO = () => window.BarStockMobileOrders;
  // Sent (desk-sent.js): su columna, su orden y su parte del header.
  const DS = () => window.BarStockDeskSent;
  const enSent = () => _vista === 'sent' && !!DS();
  // Invoices (desk-invoices.js).
  const DV = () => window.BarStockDeskInvoices;
  const enInv = () => _vista === 'inv' && !!DV();
  // Q-O, Quick order (desk-quick.js).
  const DQ = () => window.BarStockDeskQuick;
  const enQuick = () => _vista === 'quick' && !!DQ();
  // To buy (desk-tobuy.js): la lista y su orden de LOOP en una pantalla.
  const DT = () => window.BarStockDeskToBuy;
  const enBuy = () => _vista === 'buy' && !!DT();
  // ¿Sale la pestaña? La regla del teléfono: con algo por comprar o algo
  // pedido que aún no llega (mobile-orders.hayToBuy).
  const hayBuy = () => !!(DT() && MO() && MO().hayToBuy && MO().hayToBuy());
  const DH = () => window.BarStockDeskHeader;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (x) => Number(x) || 0;
  const money = (n) => '$' + Math.round(num(n)).toLocaleString('en-US');
  const norm = (s) => String(s || '').toLowerCase();

  let _sec = null, _caja = null;
  // La vista (open, buy, sent, inv), el proveedor elegido y la búsqueda.
  let _vista = 'open', _vendor = null, _q = '', _tq = 0;
  let _abierto = false;   // si el módulo del teléfono está montado aquí
  let _auto = null;       // el último proveedor elegido solo
  let _revisando = false; // en Review and send
  let _otra = null;        // la revisión de Open para Resend o Q-O: { titulo, alSalir }

  function abierta() { return !!(_sec && _sec.classList.contains('bs-active-section')); }
  const lista = () => (MO() && MO().listaResumen ? MO().listaResumen() : []);

  // ── La columna de proveedores ──
  function llegadaDe(v) {
    const S = window.BarStockSugerencia;
    const t = S && S.llegada ? S.llegada(v) : null;
    return t ? 'Arrives ' + t : '';
  }
  function pintarLista() {
    const col = _caja && _caja.querySelector('#dkoLista');
    if (!col) return;
    const vs = lista();
    const VL = window.BarStockVendorLogo;
    const lineas = vs.reduce((s, v) => s + v.filas.length, 0);
    const total = vs.reduce((s, v) => s + v.total, 0);
    col.innerHTML = !vs.length
      ? '<p class="dko-nada">Nothing to order right now: every product is at or above its par.</p>'
      : `<div class="dko-k">${vs.length} vendor${vs.length === 1 ? '' : 's'} · ${lineas} line${lineas === 1 ? '' : 's'} · ${money(total)}</div>` +
        vs.map(v => {
          const sub = [llegadaDe(v.nombre), v.filas.length ? v.filas.length + ' line' + (v.filas.length === 1 ? '' : 's') : ''].filter(Boolean).join(' · ');
          return `<button type="button" class="dko-v${v.nombre === _vendor ? ' sel' : ''}" data-v="${esc(v.nombre)}">
            <span class="dko-lg">${VL ? VL.html(v.nombre) : ''}</span>
            <span class="dko-n"><b>${esc(v.nombre)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${
              v.puentes ? `<em>${v.puentes} won't last${MO() && /^loop$/i.test(v.nombre) ? ' until delivery' : ''}</em>` : ''}${
              v.sinPrecio ? `<em class="g">${v.sinPrecio} without price</em>` : ''}</span>
            <span class="dko-t">${v.filas.length ? money(v.total) : ''}</span>
          </button>`;
        }).join('');
  }

  // ── El panel de la derecha: Open del teléfono ──
  function pie() {
    const p = _caja && _caja.querySelector('#dkoPie');
    if (!p) return;
    const v = lista().find(x => x.nombre === _vendor);
    const det = _caja.querySelector('#dkoDet');
    const enviar = det && det.querySelector('#moSend');
    // Sin líneas (LOOP sólo con lo que no llega a su entrega), en la
    // revisión o fuera de Open, sin pie: no hay nada que mandar desde aquí.
    if (_vista !== 'open' || !v || !v.filas.length || !enviar) { p.hidden = true; return; }
    p.hidden = false;
    p.innerHTML = `<div class="dko-pt"><b>${money(v.total)}</b><small>${v.filas.length} line${v.filas.length === 1 ? '' : 's'}${
      v.sinPrecio ? ' · ' + v.sinPrecio + ' without price' : ''}</small></div>
      <button type="button" class="dki-cr azul dko-send" data-acc="enviar"><i class="ti ti-send" aria-hidden="true"></i>Review and send</button>`;
  }
  // La lupa: esconde las líneas que no casan, sin repintar (escribir no
  // toca el módulo del teléfono).
  function filtrar() {
    const det = _caja && _caja.querySelector('#dkoDet');
    if (!det) return;
    const t = norm(_q).trim();
    det.querySelectorAll('.m-ord-l').forEach(l => {
      const n = l.querySelector('.m-ord-l-n');
      l.hidden = t.length >= 2 && !norm(n && n.textContent).includes(t);
    });
  }

  // Lo avisa el módulo del teléfono en cada pintado.
  function alCambiar(e) {
    if (!e) return;
    if (e.sec === 'open' && !e.vendor && !e.revisar) {
      // Sin proveedor elegido (al entrar, o el suyo ya se mandó): el
      // primero de la lista, el que más pesa.
      // Una sola vez por proveedor: si el elegido no se pudo abrir (ya no
      // tiene nada), no se vuelve a pedir en bucle.
      const vs = lista();
      if (vs.length && _abierto && _auto !== vs[0].nombre) { _auto = vs[0].nombre; setTimeout(() => elegir(vs[0].nombre), 0); return; }
    }
    if (e.sec === 'open' && e.vendor) { _vendor = e.vendor; _auto = null; }
    _revisando = !!e.revisar;
    _caja.classList.toggle('dko-revisando', _revisando);
    if (_revisando) columnaRevision();
    pintarLista();
    pie();
    filtrar();
    if (DH() && DH().refrescar) DH().refrescar('vendor');
  }

  // ── La revisión de Open para lo que no es la orden de Open ──
  // Resend de Sent y Q-O entran a la MISMA revisión (mobile-orders), en el
  // mismo sitio y con la misma forma (dko-revisando, su columna). `_otra`
  // dice qué título lleva y adónde se vuelve al salir (Done tras enviar, o
  // un enlace del título). Una sola entrada y una sola salida: con dos
  // copias, una se queda sin el arreglo de la otra.
  function otraRevision(montarla, o) {
    const det = _caja && _caja.querySelector('#dkoDet');
    if (!det || !MO()) return;
    if (_abierto && MO().cerrarEscritorio) MO().cerrarEscritorio();
    _abierto = false;
    if (DS() && DS().abierto()) DS().cerrar();
    if (DQ() && DQ().abierto()) DQ().cerrar();
    if (DV() && DV().abierto()) DV().cerrar();
    if (DT() && DT().abierto()) DT().cerrar();
    _otra = o;
    _caja.dataset.vista = 'revision';
    _caja.classList.add('dko-revisando');
    pie();
    montarla(det, { alCambiar: alOtra });
    if (window.scrollTo) window.scrollTo(0, 0);
  }
  function alOtra(e) {
    if (!_otra) return;
    if (e && e.revisar) {
      columnaRevision();
      if (DH() && DH().refrescar) DH().refrescar('vendor');
      return;
    }
    salirOtra();
  }
  function salirOtra() {
    if (!_otra) return;
    const o = _otra;
    _otra = null;
    _revisando = false;
    _caja.classList.remove('dko-revisando');
    if (MO() && MO().cerrarEscritorio) MO().cerrarEscritorio();
    const det = _caja.querySelector('#dkoDet');
    if (det) det.innerHTML = '';
    o.alSalir();
    if (DH() && DH().refrescar) DH().refrescar('vendor');
  }

  // Resend desde Sent (Axel, 2026-11-26: "debería abrir un panel similar a
  // review and send, o el mismo, para poder enviar a cualquier
  // destinatario"): la orden ya guardada (mobile-orders.reenviarEscritorio:
  // no guarda nada, sólo el PDF y el correo). Al salir, a Sent, a esa
  // orden.
  function reenviar(orden, deSent) {
    otraRevision((det, op) => MO().reenviarEscritorio(det, orden, op), {
      titulo: [{ t: 'Sent', miga: 'sent' }, orden.vendor, 'Resend'],
      alSalir: () => { _vista = 'sent'; _caja.dataset.vista = 'sent'; if (DS()) DS().abrir(_caja, deSent && deSent.id); }
    });
  }
  // Q-O: el borrador de Quick order (desk-quick.revisar) a la revisión.
  // Colocada, el borrador queda vacío (colocar() lo limpia) y se va a
  // Sent, donde acaba de aparecer, como en el teléfono; si no, de vuelta
  // a su orden.
  // Desde To buy (desk-tobuy), `de` trae su título y su vuelta: con algo
  // aún en la orden, a To buy; colocada, a Sent.
  function revisarQuick(b, de) {
    if (!MO() || !MO().revisarBorradorEscritorio) return;
    const vuelta = (de && de.vista) || 'quick';
    otraRevision((det, op) => MO().revisarBorradorEscritorio(det, b, op), {
      // Sin "Orders": con él no cabía y "Review" salía como "…".
      titulo: (de && de.titulo) || [{ t: 'Q-O', miga: 'qo' }, { t: b.nombre, miga: 'qov' }, 'Review'],
      alSalir: () => {
        const Q = window.BarStockMobileQuick && window.BarStockMobileQuick.escritorio;
        _vista = Q && Q.borrador().items.length ? vuelta : 'sent';
        if (_vista === 'buy' && !hayBuy()) _vista = 'sent';
        montarModulo();
        const S = window.BarStockDeskShell;
        if (S && S.marcarLado) S.marcarLado();
      }
    });
  }
  function abrirQuick() {
    // Sin desk-quick.js (no cargó), el diálogo de antes: mejor que una
    // vista vacía.
    if (!DQ()) return clicEn('quickOrderBtn');
    if (_otra) salirOtra();
    if (_vista === 'quick') { if (DQ()) DQ().paso1(); return; }
    verVista('quick');
  }

  function montarModulo() {
    const det = _caja.querySelector('#dkoDet');
    if (_otra) { _otra = null; _caja.classList.remove('dko-revisando'); if (MO() && MO().cerrarEscritorio) MO().cerrarEscritorio(); }
    if (_vista === 'buy' && !hayBuy()) _vista = 'open';
    _caja.dataset.vista = _vista;
    if (!enBuy() && DT() && DT().abierto()) DT().cerrar();
    // To buy (desk-tobuy.js): como Q-O, con la lista a la izquierda.
    if (enBuy()) {
      if (_abierto && MO() && MO().cerrarEscritorio) MO().cerrarEscritorio();
      _abierto = false;
      if (det) det.innerHTML = '';
      if (DS() && DS().abierto()) DS().cerrar();
      if (DV() && DV().abierto()) DV().cerrar();
      pie();
      const refrescar = () => { if (DH() && DH().refrescar) DH().refrescar('vendor'); };
      DT().abrir(_caja, {
        alCambiar: refrescar,
        alVaciar: () => verVista('open'),
        alCancelar: () => verVista('open'),
        revision: { vista: 'buy', titulo: [{ t: 'To buy', miga: 'qov' }, 'LOOP', 'Review'] }
      });
      refrescar();
      return;
    }
    // Invoices (desk-invoices.js): como Sent, Open se suelta.
    if (enInv()) {
      if (_abierto && MO() && MO().cerrarEscritorio) MO().cerrarEscritorio();
      _abierto = false;
      if (det) det.innerHTML = '';
      if (DS() && DS().abierto()) DS().cerrar();
      if (DQ() && DQ().abierto()) DQ().cerrar();
      pie();
      DV().abrir(_caja);
      if (DH() && DH().refrescar) DH().refrescar('vendor');
      return;
    }
    if (DV() && DV().abierto()) DV().cerrar();
    // Q-O (desk-quick.js): Open y Sent se sueltan.
    if (enQuick()) {
      if (_abierto && MO() && MO().cerrarEscritorio) MO().cerrarEscritorio();
      _abierto = false;
      if (det) det.innerHTML = '';
      if (DS() && DS().abierto()) DS().cerrar();
      pie();
      DQ().abrir(_caja, { alCambiar: () => { if (DH() && DH().refrescar) DH().refrescar('vendor'); } });
      if (DH() && DH().refrescar) DH().refrescar('vendor');
      return;
    }
    if (DQ() && DQ().abierto()) DQ().cerrar();
    // Sent es otro módulo (desk-sent.js): Open se suelta y su panel se
    // vacía; al volver a Open, al revés.
    if (enSent()) {
      if (_abierto && MO() && MO().cerrarEscritorio) MO().cerrarEscritorio();
      _abierto = false;
      if (det) det.innerHTML = '';
      pie();
      DS().abrir(_caja);
      if (DH() && DH().refrescar) DH().refrescar('vendor');
      return;
    }
    if (DS() && DS().abierto()) DS().cerrar();
    if (!MO() || !MO().abrirEscritorio || !det) return;
    _abierto = true;
    MO().abrirEscritorio(det, { sec: _vista, vendor: _vista === 'open' ? _vendor : null, alCambiar });
  }
  // Review and send: el total y el envío, juntos en UNA columna a la
  // derecha que se queda quieta mientras rueda la lista (Axel, en la Mac).
  // Puestos en filas separadas de la rejilla, la lista larga estiraba esas
  // filas y entre el total y el envío quedaba un hueco. Son piezas del
  // teléfono (pintarRevision): se MUEVEN con sus botones ya enganchados, y
  // en cada pintado, porque el teléfono rehace la revisión entera.
  function columnaRevision() {
    const det = _caja.querySelector('#dkoDet');
    if (!det || det.querySelector(':scope > .dko-rev-der')) return;
    const tot = det.querySelector('.m-cab .m-cab-d');
    const env = det.querySelector(':scope > .m-rev-enviar');
    if (!tot && !env) return;
    const der = document.createElement('div');
    der.className = 'dko-rev-der';
    if (tot) der.appendChild(tot);
    if (env) der.appendChild(env);
    det.appendChild(der);
  }

  function elegir(nombre) {
    _vendor = nombre;
    _vista = 'open';
    montarModulo();
    const det = _caja.querySelector('#dkoDet');
    if (det && det.getBoundingClientRect && det.getBoundingClientRect().top < 0 && window.scrollTo) window.scrollTo(0, 0);
  }
  function verVista(v) {
    if (v === _vista) return;
    _vista = v;
    montarModulo();
    // La barra lateral marca History en Sent y Orders en Open.
    const S = window.BarStockDeskShell;
    if (S && S.marcarLado) S.marcarLado();
  }
  // History de la barra lateral abre esta vista (desk-shell.ir): se pone
  // antes de abrir la sección, para que entre ya en Sent.
  function verSent() {
    _vista = 'sent';
    if (_caja && abierta()) montarModulo();
  }
  function verOpen() {
    if (_vista === 'open') return;
    _vista = 'open';
    if (_caja && abierta()) montarModulo();
  }

  // ── El header de sitios fijos ──
  // Open y Sent (desk-sent.js, lámina "Sent · desktop": la sección History
  // de antes queda escondida, y History de la barra lateral abre Sent),
  // Invoices (desk-invoices.js) y To buy (desk-tobuy.js), cada una con su
  // lámina.
  // To buy, primera y sólo con algo en la lista (la regla del teléfono;
  // lámina "To buy · desktop", B).
  const VISTAS_TODAS = [['buy', 'To buy'], ['open', 'Open'], ['sent', 'Sent'], ['inv', 'Invoices']];
  const vistasHoy = () => VISTAS_TODAS.filter(([k]) => k !== 'buy' || hayBuy() || _vista === 'buy');
  const CABECERA = {
    // Con un proveedor abierto, su nombre en el título (Axel, en la Mac:
    // "< Orders - SOUTHERN"); la cabecera de dentro se va (desk-orders.css).
    // En la revisión, "Orders" y el proveedor son enlaces de vuelta a las
    // líneas (Axel, 2026-11-26: "Back to the lines" dejaba mucho aire encima
    // de la lista; como el ‹ lleva al Home, el proveedor lleva a su orden).
    // Q-O: Quick order, corto para que quepa (Axel, 2026-11-26).
    titulo: () => (_otra ? _otra.titulo
      : enQuick() ? (DQ().paso() === 2 && DQ().vendor()
        ? [{ t: 'Orders', miga: 'orders' }, { t: 'Q-O', miga: 'qo' }, DQ().vendor()]
        : [{ t: 'Orders', miga: 'orders' }, 'Q-O'])
      : _vista === 'open' && _vendor
      ? (_revisando ? [{ t: 'Orders', miga: 'orders' }, { t: _vendor, miga: 'vendor' }, 'Review'] : [{ t: 'Orders', miga: 'orders' }, _vendor])
      : 'Orders'),
    // "Orders" solo (Open, Sent, Invoices, To buy): la palabra es Orders, a
    // su principio. Sólo el ‹ lleva al Home.
    alTitulo() { if (_otra) salirOtra(); if (_vista !== 'open') verVista('open'); if (window.scrollTo) window.scrollTo(0, 0); },
    vistas() {
      const n = Object.assign({}, MO() && MO().cuentas ? MO().cuentas() : {});
      // Invoices: cuántas facturas tienen líneas sin botella, una vez
      // leídas (Invoices las lee al abrirse; la cuenta del teléfono es
      // asíncrona y aquí no sirve).
      const MI = window.BarStockMobileInvoices;
      const ei = MI && MI.estadoEscritorio ? MI.estadoEscritorio() : null;
      n.inv = ei ? ei.conSueltas : 0;
      return '<div class="dkc-seg" role="tablist">' + vistasHoy().map(([k, t]) =>
        `<button type="button" data-dkc="vista" data-vista="${k}" class="${_vista === k ? 'on' : ''}" aria-selected="${_vista === k}"><span class="l">${t}</span><span class="c">${t}</span>${
          n[k] ? `<em class="${k === 'buy' || k === 'inv' ? 'a' : ''}">${n[k]}</em>` : ''}</button>`).join('') + '</div>';
    },
    afinar() {
      if (enSent()) return DS().CAB.afinar();
      if (enInv()) return DV().CAB.afinar();
      if (enQuick() || enBuy() || _otra) { const D = DH(); return [D.vacio(), D.vacio(), D.vacio()]; }
      const D = DH();
      return [D.campo({ id: 'dkoQ', icon: 'ti-search', placeholder: 'Search lines', value: _q }), D.vacio(), D.vacio()];
    },
    acciones() {
      if (enSent()) return DS().CAB.acciones();
      if (enInv()) return DV().CAB.acciones();
      const D = DH();
      if (enBuy()) return [D.vacio(), D.boton({ acc: 'quick', icon: 'ti-bolt', label: 'Quick order', tono: 'verde' })];
      return [
        D.boton({ acc: 'exportar', icon: 'ti-file-export', label: 'Export', tono: 'azul' }),
        D.boton({ acc: 'quick', icon: 'ti-bolt', label: 'Quick order', tono: 'verde' })
      ];
    },
    extras() {
      if (enSent()) return DS().CAB.extras();
      if (enInv()) return DV().CAB.extras();
      return [{ icon: 'ti-chart-dots', label: 'Order analysis', fn: () => conProveedor(() => clicEn('orderAnalysisBtn')) }];
    },
    alClic(ev, t) {
      const k = t.dataset.dkc;
      if (k === 'vista') return verVista(t.dataset.vista);
      if (k === 'miga') {
        const m = t.dataset.miga;
        if (m === 'sent' || m === 'qov') return salirOtra();
        if (m === 'qo') { if (_otra) salirOtra(); if (DQ()) DQ().paso1(); return; }
        if (m === 'orders' && (enQuick() || enBuy() || _otra)) { if (_otra) salirOtra(); return verVista('open'); }
        if (_vendor) elegir(_vendor);
        return;
      }
      // Quick order: la pantalla Q-O (desk-quick.js), no el diálogo de antes.
      if (k === 'quick') return abrirQuick();
      if (enSent()) return DS().CAB.alClic(ev, t);
      if (enInv()) return DV().CAB.alClic(ev, t);
      if (k === 'exportar') {
        const it = (label, id, icon) => ({ icon, label, fn: () => conProveedor(() => clicEn(id)) });
        DH().menu(t, [{ h: _vendor ? 'Export ' + _vendor : 'Export' },
          it('CSV', 'exportVendorCsvBtn', 'ti-file-spreadsheet'), it('XLSX', 'exportVendorXlsxBtn', 'ti-file-spreadsheet'),
          it('JPG', 'exportVendorJpgBtn', 'ti-photo'), it('LOOP (upload ready)', 'exportVendorLoopBtn', 'ti-file-upload')]);
      }
    },
    alEscribir(ev) {
      if (enSent()) return DS().CAB.alEscribir(ev);
      if (enInv()) return DV().CAB.alEscribir(ev);
      if (ev.target.id !== 'dkoQ') return;
      _q = ev.target.value;
      clearTimeout(_tq);
      _tq = setTimeout(() => { _tq = 0; filtrar(); }, 120);
    }
  };
  // Export y Order analysis de antes trabajan sobre la pestaña de
  // proveedor de la tabla vieja (activeVendorTab): se pone la del elegido.
  function conProveedor(fn) {
    if (_vendor && typeof window.setVendorTab === 'function') window.setVendorTab(_vendor);
    fn();
  }
  function clicEn(id) { const b = document.getElementById(id); if (b) b.click(); }

  // ── Los toques ──
  function alClic(ev) {
    const v = ev.target.closest('.dko-v');
    if (v) { elegir(v.dataset.v); return; }
    const a = ev.target.closest('[data-acc="enviar"]');
    if (a) { const s = _caja.querySelector('#dkoDet #moSend'); if (s) s.click(); }
  }

  function alAbrirCerrar() {
    const sentAbierto = !!(DS() && DS().abierto());
    // Con Sent, Q-O o una revisión prestada (Resend, Q-O) en pantalla, nada
    // que montar: cualquier cambio de clase de la sección los deshacía.
    const otraVista = sentAbierto || (DQ() && DQ().abierto()) || (DV() && DV().abierto()) || (DT() && DT().abierto()) || !!_otra;
    if (abierta()) {
      // La lista de To buy se lee al abrir Orders (en el teléfono la lee su
      // pestaña): de ella depende que salga la pestaña. Si cambia la cuenta,
      // toBuyCounted repinta el header.
      const TBm = window.BarStockMobileToBuy;
      if (TBm && TBm.cargar) TBm.cargar();
      if (!_abierto && !otraVista) montarModulo();
    }
    else {
      if (sentAbierto) DS().cerrar();
      if (DQ() && DQ().abierto()) DQ().cerrar();
      if (DV() && DV().abierto()) DV().cerrar();
      if (DT() && DT().abierto()) DT().cerrar();
      if (_otra) { _otra = null; _caja.classList.remove('dko-revisando'); _caja.dataset.vista = _vista; if (MO() && MO().cerrarEscritorio) MO().cerrarEscritorio(); const d = _caja.querySelector('#dkoDet'); if (d) d.innerHTML = ''; return; }
      if (!_abierto) return;
      _abierto = false;
      if (MO() && MO().cerrarEscritorio) MO().cerrarEscritorio();
      const det = _caja.querySelector('#dkoDet');
      if (det) det.innerHTML = '';
    }
  }

  function montar() {
    if (_caja) return;
    _sec = document.getElementById('vendorSection');
    if (!_sec) return;
    // dk-pantalla: la forma de las secciones (desk-shell.css). En el
    // teléfono no hace nada: sus reglas son de body.dk.
    _sec.classList.add('dk-pantalla', 'dk-ord-sec');
    _caja = document.createElement('div');
    _caja.id = 'dkOrd';
    _caja.innerHTML = `<aside class="dko-lista" id="dkoLista" aria-label="Vendors"></aside>
      <div class="dko-der"><div class="dko-det" id="dkoDet"></div><div class="dko-pie" id="dkoPie" hidden></div></div>`;
    _sec.insertBefore(_caja, _sec.firstChild);
    _caja.addEventListener('click', alClic);
    new MutationObserver(alAbrirCerrar).observe(_sec, { attributes: true, attributeFilter: ['class'] });
    // El tiempo real (Axel: "los cambios que hago en el móvil no los ve la
    // pc"): inventory-realtime recarga el maestro y avisa inventoryUpdated,
    // y aquí no se escuchaba; lo cambiado en el propio escritorio sí se
    // veía porque updateFinalOrder llama a refresh(). Los mismos avisos
    // que escucha el teléfono (mobile-shell), y sólo con la sección
    // abierta. refresh() repinta la orden y su alCambiar, la columna.
    const E = window.BarStockEvents;
    let raf = 0;
    const repintar = () => {
      if (raf || !_abierto || !abierta()) return;
      raf = (window.requestAnimationFrame || setTimeout)(() => { raf = 0; if (_abierto && MO() && MO().refresh) MO().refresh(); });
    };
    if (E && E.on) ['inventoryUpdated', 'ordersUpdated', 'parAdjustmentsUpdated'].forEach(n => E.on(n, repintar));
    // To buy: la pestaña sale o se va con la lista.
    if (E && E.on) E.on('toBuyCounted', () => { if (abierta() && DH() && DH().refrescar) DH().refrescar('vendor'); });
    const D = DH();
    if (D && D.registrar) D.registrar('vendor', CABECERA);
  }

  if (document.getElementById('vendorSection')) montar();
  else document.addEventListener('DOMContentLoaded', montar);

  window.BarStockDeskOrders = { montar, abierta, elegir: (n) => elegir(n), verSent, verOpen, reenviar, revisarQuick, abrirQuick, vista: () => _vista, _estado: () => ({ vista: _vista, vendor: _vendor, q: _q }) };
})();
