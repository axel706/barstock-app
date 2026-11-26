(() => {
  if (window.BarStockDeskInvoices) return;

  // ── Orders › Invoices en el escritorio (lámina "Invoices · desktop", A:
  //    la misma forma que Sent; Axel 2026-11-26) ──
  //
  // A la izquierda las facturas del ciclo por día (con "N unlinked") y lo
  // que no se enseña ("Not shown here"); a la derecha la elegida: su
  // cabecera, las tres cifras pegadas arriba, a qué orden cuenta (Link to
  // an order, It arrived before the count: una orden de un ciclo
  // anterior), y cada línea con su botella; la que no tiene se arregla en
  // su sitio. Abajo, fijos, Hide this invoice / Hide el proveedor.
  //
  // Es Invoices del TELÉFONO (BarStockMobileInvoices.abrirEscritorio): la
  // misma lectura de MarginEdge, las mismas reglas de qué es bebida y qué
  // se enseña, el mismo enlazar. Aquí sólo va lo que cambia en el
  // escritorio: el header, el pie y el buscador de botellas en una ventana
  // (el del teléfono es a pantalla completa, con su teclado).

  const MI = () => window.BarStockMobileInvoices;
  const DH = () => window.BarStockDeskHeader;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let _caja = null, _abierto = false, _q = '', _tq = 0;

  // Hide this invoice / Hide el proveedor, abajo y fijos, como los
  // botones del pie de Sent: son del teléfono (al final de la factura) y
  // se MUEVEN aquí con su clic ya enganchado, en cada pintado.
  function alPie() {
    const det = _caja && _caja.querySelector('#dkvDet');
    if (!det) return;
    const botones = det.querySelectorAll('#mInvHideI, #mInvHideV');
    if (!botones.length) return;
    let pie = det.querySelector(':scope > .dkv-pie');
    if (!pie) { pie = document.createElement('div'); pie.className = 'dkv-pie'; det.appendChild(pie); }
    botones.forEach(b => { b.classList.add('dki-cr'); pie.appendChild(b); });
    const zona = det.querySelector('.m-idanger');
    if (zona) zona.remove();
  }

  function alCambiar() {
    alPie();
    const D = DH();
    if (D && D.refrescar) D.refrescar('vendor');
  }

  // ── Buscar la botella de una línea: una ventana ──
  // Lo mismo que el buscador del teléfono (los productos, la pista, el pie
  // con "Not mine" o "Unlink"), en una ventana centrada.
  let _bus = null;
  function cerrarBuscar() { if (_bus) { _bus.remove(); _bus = null; } }
  function buscar(o) {
    cerrarBuscar();
    const el = document.createElement('div');
    el.id = 'dkvBus';
    el.innerHTML = `<div class="dkv-bus-bg"></div><div class="dkv-bus" role="dialog" aria-label="Pick the bottle">
      <div class="dkv-bus-h"><b>${esc(o.titulo || 'Pick the bottle')}</b><small>${esc(o.sub || '')}</small>
        <button type="button" class="dkv-bus-x" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>
      <label class="dkv-bus-q"><i class="ti ti-search" aria-hidden="true"></i><input type="search" autocomplete="off" spellcheck="false" placeholder="Search your bottles…"></label>
      <div class="dkv-bus-l"></div>
      ${(o.pie || []).length ? `<div class="dkv-bus-pie">${o.pie.map(p => `<button type="button" class="dki-cr" data-pie="${esc(p.id)}">${esc(p.texto)}</button>`).join('')}</div>` : ''}
    </div>`;
    document.body.appendChild(el);
    _bus = el;
    const inp = el.querySelector('input');
    const lista = el.querySelector('.dkv-bus-l');
    const todos = o.productos || [];
    // Sin escribir, primero lo que se parece al nombre de la línea.
    const palabras = String(o.pista || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
    const pintar = () => {
      const t = inp.value.trim().toLowerCase();
      let ps;
      if (t) ps = todos.filter(p => t.split(/\s+/).every(w => p.toLowerCase().includes(w)));
      else ps = todos.map(p => ({ p, n: palabras.filter(w => p.toLowerCase().includes(w)).length }))
        .filter(x => x.n).sort((a, b) => b.n - a.n).map(x => x.p);
      lista.innerHTML = ps.slice(0, 40).map(p => `<button type="button" class="dkv-bus-p${p === o.actual ? ' on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('') ||
        `<p class="dkv-bus-nada">${t ? 'No bottle matches.' : 'Type to search your bottles.'}</p>`;
    };
    inp.addEventListener('input', pintar);
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') cerrarBuscar();
      if (ev.key === 'Enter') { const b = lista.querySelector('[data-p]'); if (b) b.click(); }
    });
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('.dkv-bus-x') || ev.target.classList.contains('dkv-bus-bg')) return cerrarBuscar();
      const b = ev.target.closest('[data-p]');
      if (b) { const p = b.dataset.p; cerrarBuscar(); if (o.alElegir) o.alElegir(p); return; }
      const pp = ev.target.closest('[data-pie]');
      if (pp) { const id = pp.dataset.pie; cerrarBuscar(); if (o.alPie) o.alPie(id); }
    });
    pintar();
    setTimeout(() => inp.focus(), 0);
  }

  // ── El header (desk-orders.js lo pide con la vista "inv") ──
  const CAB = {
    afinar() {
      const D = DH();
      const e = MI() && MI().estadoEscritorio ? MI().estadoEscritorio() : { sueltas: false, prov: '' };
      return [
        D.campo({ id: 'dkvQ', icon: 'ti-search', placeholder: 'Vendor, number or product', value: _q }),
        D.boton({ acc: 'sueltas', icon: 'ti-adjustments-horizontal', label: 'Show: All', en: !!e.sueltas, valor: 'Show: Unlinked' }),
        D.boton({ acc: 'prov', icon: 'ti-truck', label: 'All vendors', en: !!e.prov, valor: 'Vendor: ' + e.prov })
      ];
    },
    acciones() {
      const D = DH();
      // Sin Export: las facturas no se exportan desde la app. Su hueco
      // queda vacío del mismo tamaño, para que lo de su derecha no se corra.
      return [D.vacio(), D.boton({ acc: 'quick', icon: 'ti-bolt', label: 'Quick order', tono: 'verde' })];
    },
    extras() { return []; },
    alClic(ev, t) {
      const k = t.dataset.dkc;
      const M = MI();
      if (!M) return false;
      if (k === 'sueltas') {
        const e = M.estadoEscritorio();
        DH().menu(t, [{ h: 'Show' },
          { icon: e.sueltas ? 'ti-point' : 'ti-check', label: 'All · ' + e.total, fn: () => M.verEscritorio({ sueltas: false }) },
          { icon: e.sueltas ? 'ti-check' : 'ti-point', label: 'Unlinked · ' + e.conSueltas, fn: () => M.verEscritorio({ sueltas: true }) }]);
        return true;
      }
      if (k === 'prov') {
        const e = M.estadoEscritorio();
        DH().menu(t, [{ h: 'Vendor' }, { icon: e.prov ? 'ti-point' : 'ti-check', label: 'All vendors', fn: () => M.verEscritorio({ prov: '' }) }]
          .concat(e.proveedores.map(v => ({ icon: e.prov === v ? 'ti-check' : 'ti-point', label: v, fn: () => M.verEscritorio({ prov: v }) }))));
        return true;
      }
      return false;
    },
    alEscribir(ev) {
      if (ev.target.id !== 'dkvQ') return false;
      _q = ev.target.value;
      clearTimeout(_tq);
      _tq = setTimeout(() => { _tq = 0; if (MI()) MI().verEscritorio({ busca: _q }); }, 120);
      return true;
    }
  };

  // ── Montar y soltar (desk-orders.js, al entrar y salir de la vista) ──
  function abrir(caja) {
    _caja = caja;
    if (!caja.querySelector('#dkvCol')) {
      caja.insertAdjacentHTML('beforeend', `<aside class="dkv-col" id="dkvCol" aria-label="Invoices"><div class="dkv-lista" id="dkvLista"></div></aside>
        <div class="dkv-det" id="dkvDet"></div>`);
    }
    _abierto = true;
    const M = MI();
    if (!M || !M.abrirEscritorio) return;
    return M.abrirEscritorio({
      lista: caja.querySelector('#dkvLista'),
      detalle: caja.querySelector('#dkvDet'),
      alCambiar, buscar
    }).then(() => { if (_q && M.verEscritorio) M.verEscritorio({ busca: _q }); });
  }
  function cerrar() {
    if (!_abierto) return;
    _abierto = false;
    cerrarBuscar();
    if (MI() && MI().cerrarEscritorio) MI().cerrarEscritorio();
    _q = '';
  }

  window.BarStockDeskInvoices = { abrir, cerrar, abierto: () => _abierto, CAB, _buscar: buscar };
})();
