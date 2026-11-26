(() => {
  if (window.BarStockDeskSent) return;

  // ── Orders › Sent en el escritorio (lámina "Sent · desktop", A con el
  //    gasto en la columna, opción 1; Axel 2026-11-26) ──
  //
  // La misma forma que Open: a la izquierda la columna (Spent this cycle
  // y las órdenes: este ciclo y los meses plegados), a la derecha la orden
  // elegida. Es Sent del TELÉFONO (BarStockMobileHistory.abrirEscritorio):
  // lo que llegó contra cada orden, el reparto de facturas, las tres
  // cifras, lo corto y los precios distintos salen de un solo sitio.
  //
  // De History de antes se queda lo que hacía con una orden, sobre la
  // orden del escritorio (state.orderHistory, el `appId`): el JPG (o el
  // CSV de LOOP: reExportHistoryOrder) a la vista junto a Resend, y en ⋯
  // Compare to previous, Select to compare y Delete. "Edit date" NO: sólo
  // cambiaba la copia del navegador (saveHistoryDateEdit no escribe en la
  // nube), la siguiente carga de la nube la deshacía, y Sent lee de la
  // nube: un botón que parecía funcionar y no. Export /
  // Import / Reset de todas las órdenes van en el ⋯ del header, y Spent
  // this cycle es el de History (BarStockSpend.compute), en una tarjeta.
  //
  // desk-orders.js monta esto en su #dkOrd cuando la vista es "sent" y
  // le pregunta su parte del header (afinar, acciones, extras, título).

  const MH = () => window.BarStockMobileHistory;
  const DH = () => window.BarStockDeskHeader;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

  let _caja = null, _abierto = false;
  let _q = '', _tq = 0;
  const NOMBRE = { all: 'All', short: 'Short', waiting: 'Waiting' };

  // compareSelection vive en index.html (un `let` de nivel de script: se
  // ve desde aquí por su nombre, no como window.compareSelection).
  function seleccion() {
    try { return Array.isArray(compareSelection) ? compareSelection : []; } catch (e) { return []; }
  }
  const llamar = (n, ...a) => (typeof window[n] === 'function' ? window[n](...a) : undefined);

  // ── Spent this cycle: la tarjeta de arriba de la columna ──
  // Una barra repartida por categoría y sus cifras debajo; lo de antes de
  // cada una, al pasar el ratón por su color.
  function pintarGasto() {
    const el = _caja && _caja.querySelector('#dksGasto');
    const S = window.BarStockSpend;
    if (!el) return;
    let d = null;
    try { d = S && S.compute ? S.compute() : null; } catch (e) { d = null; }
    if (!d || (!d.now.lines && !d.prev.lines)) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    const cats = d.cats.filter(c => c.now > 0);
    const tot = cats.reduce((a, c) => a + c.now, 0) || 1;
    const col = (n) => (S.color ? S.color(n) : '#475569');
    const sube = d.totalDelta > 0;
    el.innerHTML = `<div class="dks-gl">Spent this cycle</div>
      <div class="dks-gt">${money(d.now.total)}</div>
      ${d.totalPct === null ? '' : `<div class="dks-gd ${sube ? 'up' : 'dn'}"><i class="ti ti-trending-${sube ? 'up' : 'down'}" aria-hidden="true"></i> ${sube ? '+' : '−'}${money(Math.abs(d.totalDelta))} vs before this cycle</div>`}
      ${cats.length ? `<div class="dks-gb">${cats.map(c => `<span style="width:${(c.now / tot * 100).toFixed(2)}%;background:${col(c.name)}"></span>`).join('')}</div>
      <div class="dks-gk">${cats.map(c => `<span data-antes="before ${money(c.prev)}"><i style="background:${col(c.name)}"></i>${esc(c.name)} ${money(c.now)}</span>`).join('')}</div>` : ''}`;
  }

  // ── Comparar: lo elegido con "Select to compare" ──
  function pintarComparar() {
    const el = _caja && _caja.querySelector('#dksComp');
    if (!el) return;
    const n = seleccion().length;
    el.hidden = !n;
    el.innerHTML = n ? `<span>${n} selected to compare</span>
      <button type="button" class="dki-cr azul" data-dks="comparar"${n === 2 ? '' : ' disabled'}>Compare</button>
      <button type="button" class="dki-cr" data-dks="limpiar">Clear</button>` : '';
  }

  // Los botones de la orden que no son del teléfono: JPG (o CSV) y ⋯.
  // Sólo con la orden cargada en el escritorio (sin ella no hay qué
  // exportar: el teléfono ya lo dice con su nota).
  function extras(o, cargada) {
    if (!cargada) return '';
    const h = MH() && MH().laDelEscritorio ? MH().laDelEscritorio(o.appId) : null;
    const csv = h && h.exportType === 'loop_csv';
    return `<div class="dks-ext">
      <button type="button" class="dki-cr" data-dks="jpg"><i class="ti ti-${csv ? 'file-spreadsheet' : 'photo-down'}" aria-hidden="true"></i>${csv ? 'CSV' : 'JPG'}</button>
      <button type="button" class="dki-cr dks-mas" data-dks="mas" aria-label="More for this order"><i class="ti ti-dots" aria-hidden="true"></i></button></div>`;
  }

  function ordenAbierta() {
    const e = MH() && MH().estadoEscritorio ? MH().estadoEscritorio() : null;
    return e && e.orden ? e.orden : null;
  }

  // Los botones de la orden, abajo y fijos, como el total y "Review and
  // send" de Open (Axel, 2026-11-26). Son piezas del teléfono (Resend,
  // Reopen, su confirmación, "ocupado") y las de aquí (JPG, ⋯): se MUEVEN
  // a un pie al final de la orden con sus botones ya enganchados, en cada
  // pintado, porque el teléfono rehace la orden entera.
  function alPie() {
    const det = _caja && _caja.querySelector('#dksDet');
    const cab = det && det.querySelector('.m-hdk-cab');
    if (!cab) return;
    const piezas = cab.querySelectorAll(':scope > :is(.m-hacc, .dks-ext, .m-hacc-conf, .m-hacc-no)');
    if (!piezas.length) return;
    let pie = det.querySelector(':scope > .dks-pie');
    if (!pie) { pie = document.createElement('div'); pie.className = 'dks-pie'; det.appendChild(pie); }
    piezas.forEach(p => pie.appendChild(p));
  }

  function alCambiar() {
    alPie();
    pintarComparar();
    const D = DH();
    if (D && D.refrescar) D.refrescar('vendor');
  }

  function alClic(ev) {
    const b = ev.target.closest('[data-dks]');
    if (!b) return;
    const o = ordenAbierta();
    const id = o && o.appId;
    const k = b.dataset.dks;
    if (k === 'comparar') return llamar('openCompareModal');
    if (k === 'limpiar') { llamar('clearCompareSelection'); return pintarComparar(); }
    if (!id) return;
    if (k === 'jpg') return llamar('reExportHistoryOrder', id);
    if (k === 'mas') {
      const sel = seleccion().includes(id);
      DH().menu(b, [{ h: [o.vendor, o.po].filter(Boolean).join(' · ') },
        { icon: 'ti-arrows-diff', label: 'Compare to previous', fn: () => llamar('compareWithPrevious', id) },
        { icon: sel ? 'ti-square-check' : 'ti-square', label: sel ? 'Selected to compare' : 'Select to compare', fn: () => { llamar('toggleCompareSelection', id); pintarComparar(); } },
        { sep: true },
        { icon: 'ti-trash', label: 'Delete order', fn: () => borrar(o) }]);
    }
  }

  // Borrar no deshace nada (el History de antes borraba sin preguntar):
  // se pregunta, con su nombre. Reopen, en cambio, es el del teléfono.
  async function borrar(o) {
    const Dg = window.BarStockDialog;
    const ok = Dg && Dg.confirmar
      ? await Dg.confirmar({ titulo: 'Delete the ' + o.vendor + ' order' + (o.po ? ' ' + o.po : '') + '?', texto: 'It goes away from Sent for good. Use Reopen instead to send its lines back to Open.', ok: 'Delete order', peligro: true })
      : window.confirm('Delete this order?');
    if (!ok) return;
    // deleteHistoryOrder relee las órdenes de la nube, y eso avisa
    // ordersUpdated: Sent se vuelve a leer ahí (abajo), una sola vez.
    await llamar('deleteHistoryOrder', o.appId);
  }

  // ── El header (desk-orders.js lo pide con la vista "sent") ──
  const CAB = {
    afinar() {
      const D = DH();
      const e = MH() && MH().estadoEscritorio ? MH().estadoEscritorio() : { cuenta: {}, filtro: 'all', prov: '' };
      return [
        D.campo({ id: 'dksQ', icon: 'ti-search', placeholder: 'Vendor or product', value: _q }),
        D.boton({ acc: 'estado', icon: 'ti-adjustments-horizontal', label: 'Show: All', en: e.filtro !== 'all', valor: 'Show: ' + NOMBRE[e.filtro] }),
        D.boton({ acc: 'prov', icon: 'ti-truck', label: 'All vendors', en: !!e.prov, valor: 'Vendor: ' + e.prov })
      ];
    },
    acciones() {
      const D = DH();
      return [
        D.boton({ acc: 'exportar', icon: 'ti-file-export', label: 'Export', tono: 'azul' }),
        D.boton({ acc: 'quick', icon: 'ti-bolt', label: 'Quick order', tono: 'verde' })
      ];
    },
    extras() {
      const clic = (id) => () => { const b = document.getElementById(id); if (b) b.click(); };
      return [
        { icon: 'ti-download', label: 'Import orders', fn: clic('ohImportBtn') },
        { icon: 'ti-trash', label: 'Reset orders', fn: clic('ohResetBtn') }
      ];
    },
    alClic(ev, t) {
      const k = t.dataset.dkc;
      const M = MH();
      if (!M) return false;
      if (k === 'estado') {
        const e = M.estadoEscritorio();
        DH().menu(t, [{ h: 'Show' }].concat(['all', 'short', 'waiting'].map(f => ({
          icon: e.filtro === f ? 'ti-check' : 'ti-point', label: NOMBRE[f] + ' · ' + (e.cuenta[f] || 0),
          fn: () => M.verEscritorio({ filtro: f })
        }))));
        return true;
      }
      if (k === 'prov') {
        const e = M.estadoEscritorio();
        DH().menu(t, [{ h: 'Vendor' }, { icon: e.prov ? 'ti-point' : 'ti-check', label: 'All vendors', fn: () => M.verEscritorio({ prov: '' }) }]
          .concat(e.proveedores.map(v => ({ icon: e.prov === v ? 'ti-check' : 'ti-point', label: v, fn: () => M.verEscritorio({ prov: v }) }))));
        return true;
      }
      if (k === 'exportar') {
        const o = ordenAbierta();
        const h = o && M.laDelEscritorio ? M.laDelEscritorio(o.appId) : null;
        const it = [{ h: 'Export' }];
        if (h) it.push({ icon: 'ti-photo-down', label: o.vendor + ' order · ' + (h.exportType === 'loop_csv' ? 'CSV' : 'JPG'), fn: () => llamar('reExportHistoryOrder', h.id) });
        it.push({ icon: 'ti-file-export', label: 'All orders (JSON)', fn: () => { const b = document.getElementById('ohExportBtn'); if (b) b.click(); } });
        DH().menu(t, it);
        return true;
      }
      return false;
    },
    alEscribir(ev) {
      if (ev.target.id !== 'dksQ') return false;
      _q = ev.target.value;
      clearTimeout(_tq);
      _tq = setTimeout(() => { _tq = 0; if (MH()) MH().verEscritorio({ busca: _q }); }, 120);
      return true;
    }
  };

  // ── Montar y soltar (desk-orders.js, al entrar y salir de la vista) ──
  function abrir(caja, elegir) {
    _caja = caja;
    let col = caja.querySelector('#dksCol');
    if (!col) {
      caja.insertAdjacentHTML('beforeend', `<aside class="dks-col" id="dksCol" aria-label="Sent orders">
          <div class="dks-gasto" id="dksGasto"></div><div class="dks-comp" id="dksComp" hidden></div><div class="dks-lista" id="dksLista"></div></aside>
        <div class="dks-det" id="dksDet"></div>`);
      caja.querySelector('#dksCol').addEventListener('click', alClic);
      caja.querySelector('#dksDet').addEventListener('click', alClic);
    }
    _abierto = true;
    pintarGasto();
    pintarComparar();
    const M = MH();
    if (!M || !M.abrirEscritorio) return;
    return M.abrirEscritorio({
      lista: caja.querySelector('#dksLista'),
      detalle: caja.querySelector('#dksDet'),
      extras, alCambiar, elegir,
      // Resend: la revisión de Open con esta orden (desk-orders.reenviar).
      reenviar: (h, o) => { const DO = window.BarStockDeskOrders; if (h && DO && DO.reenviar) DO.reenviar(h, o); }
    }).then(() => { if (_q && M.verEscritorio) M.verEscritorio({ busca: _q }); });
  }
  function cerrar() {
    if (!_abierto) return;
    _abierto = false;
    if (MH() && MH().cerrarEscritorio) MH().cerrarEscritorio();
    _q = '';
  }
  // Lo de las órdenes cambió (un borrado, una orden nueva): se vuelve a
  // leer, en la misma orden si sigue (mobile-history la busca por su id).
  function recargar() {
    if (!_abierto || !_caja) return;
    const o = ordenAbierta();
    abrir(_caja, o && o.id);
  }
  const E = window.BarStockEvents;
  if (E && E.on) E.on('ordersUpdated', () => { if (_abierto) recargar(); });

  window.BarStockDeskSent = { abrir, cerrar, recargar, abierto: () => _abierto, CAB };
})();
