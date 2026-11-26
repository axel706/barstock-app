(() => {
  if (window.BarStockDeskOrders) return;

  // ── Orders en el escritorio (Axel, 2026-11-26, lámina "Orders ·
  // desktop", A) ─────────────────────────────────────────────────────────
  //
  // Los proveedores en una columna a la izquierda (su llegada, sus líneas,
  // su total y lo suyo que no llega a su entrega) y la orden del elegido a
  // la derecha. Con el header de sitios fijos (desk-header.js): las vistas
  // Open · Sent (To buy e Invoices, con su lámina); la lupa para buscar líneas; Export
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
    _caja.classList.toggle('dko-revisando', !!e.revisar);
    pintarLista();
    pie();
    filtrar();
    if (DH() && DH().refrescar) DH().refrescar('vendor');
  }

  function montarModulo() {
    const det = _caja.querySelector('#dkoDet');
    if (!MO() || !MO().abrirEscritorio || !det) return;
    _abierto = true;
    _caja.dataset.vista = _vista;
    MO().abrirEscritorio(det, { sec: _vista, vendor: _vista === 'open' ? _vendor : null, alCambiar });
  }
  function elegir(nombre) {
    _vendor = nombre;
    _vista = 'open';
    montarModulo();
    const det = _caja.querySelector('#dkoDet');
    if (det && det.getBoundingClientRect && det.getBoundingClientRect().top < 0 && window.scrollTo) window.scrollTo(0, 0);
  }
  function verVista(v) {
    if (v === 'sent') { const S = window.BarStockDeskShell; if (S && S.ir) S.ir('history'); return; }
    if (v === _vista) return;
    _vista = v;
    montarModulo();
  }

  // ── El header de sitios fijos ──
  // Open y Sent por ahora. Sent es hoy la sección History del escritorio y
  // lleva a ella. To buy e Invoices (el escritorio nunca las tuvo) entran
  // con la lámina de Sent e Invoices: sus pantallas del teléfono leen de la
  // nube y sus estilos no están generados aquí, y una vista no se ofrece
  // sin haberla visto funcionar.
  const VISTAS = [['open', 'Open'], ['sent', 'Sent']];
  const CABECERA = {
    // Con un proveedor abierto, su nombre en el título (Axel, en la Mac:
    // "< Orders - SOUTHERN"); la cabecera de dentro se va (desk-orders.css).
    titulo: () => (_vista === 'open' && _vendor ? 'Orders › ' + _vendor : 'Orders'),
    vistas() {
      const n = MO() && MO().cuentas ? MO().cuentas() : {};
      return '<div class="dkc-seg" role="tablist">' + VISTAS.map(([k, t]) =>
        `<button type="button" data-dkc="vista" data-vista="${k}" class="${_vista === k ? 'on' : ''}" aria-selected="${_vista === k}"><span class="l">${t}</span><span class="c">${t}</span>${
          n[k] ? `<em class="${k === 'buy' || k === 'inv' ? 'a' : ''}">${n[k]}</em>` : ''}</button>`).join('') + '</div>';
    },
    afinar() {
      const D = DH();
      return [D.campo({ id: 'dkoQ', icon: 'ti-search', placeholder: 'Search lines', value: _q }), D.vacio(), D.vacio()];
    },
    acciones() {
      const D = DH();
      return [
        D.boton({ acc: 'exportar', icon: 'ti-file-export', label: 'Export', tono: 'azul' }),
        D.boton({ acc: 'quick', icon: 'ti-bolt', label: 'Quick order', tono: 'verde' })
      ];
    },
    extras() {
      return [{ icon: 'ti-chart-dots', label: 'Order analysis', fn: () => conProveedor(() => clicEn('orderAnalysisBtn')) }];
    },
    alClic(ev, t) {
      const k = t.dataset.dkc;
      if (k === 'vista') return verVista(t.dataset.vista);
      if (k === 'quick') return clicEn('quickOrderBtn');
      if (k === 'exportar') {
        const it = (label, id, icon) => ({ icon, label, fn: () => conProveedor(() => clicEn(id)) });
        DH().menu(t, [{ h: _vendor ? 'Export ' + _vendor : 'Export' },
          it('CSV', 'exportVendorCsvBtn', 'ti-file-spreadsheet'), it('XLSX', 'exportVendorXlsxBtn', 'ti-file-spreadsheet'),
          it('JPG', 'exportVendorJpgBtn', 'ti-photo'), it('LOOP (upload ready)', 'exportVendorLoopBtn', 'ti-file-upload')]);
      }
    },
    alEscribir(ev) {
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
    if (abierta()) { if (!_abierto) montarModulo(); }
    else if (_abierto) {
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
    const D = DH();
    if (D && D.registrar) D.registrar('vendor', CABECERA);
  }

  if (document.getElementById('vendorSection')) montar();
  else document.addEventListener('DOMContentLoaded', montar);

  window.BarStockDeskOrders = { montar, abierta, elegir: (n) => elegir(n), _estado: () => ({ vista: _vista, vendor: _vendor, q: _q }) };
})();
