(() => {
  if (window.BarStockMobileTransfers) return;

  // ── La sección "Transfers" (docs/plan-transfer.md) ────────────────────
  //
  // Axel, 2026-11-18, sobre lámina: una entrada en More (con su número de
  // lo que hay por confirmar) que abre una PANTALLA completa como las
  // subsecciones de Settings (el nombre en la banda, atrás a la
  // izquierda), con el aspecto de la opción A: "⇄ New transfer" arriba,
  // "To confirm" y lo reciente. Y "New transfer" como la Quick order:
  // dirección, la otra locación, VARIOS productos con su cantidad y
  // cuándo. Sustituye al botón de la ficha ("en lugar de agregar botones
  // aquí y allá").
  //
  // Los datos son de transfers.js; confirmar y "Not right", de
  // transfer-confirm.js (los mismos que la tarjeta del Home y la campana:
  // confirmar en cualquiera quita los otros). Aquí sólo se pinta.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = () => window.BarStockTransfers;
  const TC = () => window.BarStockTransferConfirm;
  const M = () => window.BarStockMobile;
  const G = () => window.BarStockGuest;
  const quien = () => { const g = G(); return (g && g.nombre && g.nombre()) || ''; };
  const master = () => (window.state && window.state.master) || [];
  const n = (x) => String(Math.round((Number(x) || 0) * 10) / 10);
  const corta = (s) => String(s || '').replace(/^the\s+/i, '');
  const toast = (x) => { if (window.BarStockToast) window.BarStockToast.show(x); };
  function cuandoNY(iso, conDia) {
    return new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' },
      conDia ? { month: 'short', day: 'numeric' } : {})).format(new Date(iso)).replace(',', '');
  }

  // Cuántos transfers (grupos) esperan que esta locación los confirme:
  // el número de la entrada en More.
  const pendientes = () => { const c = TC(); return c && c.gruposPend ? c.gruposPend().length : 0; };

  let _host = null, _vista = 'lista';
  // El borrador de "New transfer": { entra, otra, antes, lineas: [{ item, qty }] }.
  let _nuevo = null;
  const RECIENTES_DIAS = 7;

  // ── Encabezado: el nombre en la banda y atrás (como Settings) ────────
  function cabecera(titulo, atras) {
    const m = M();
    if (m && m.enBanda && m.enBanda(titulo)) {
      if (m.alVolverBanda) m.alVolverBanda(atras);
      return '';
    }
    return m && m.cabecera ? m.cabecera({ volverA: 'More', titulo }) : '<div class="m-inv-t">' + esc(titulo) + '</div>';
  }
  const aMas = () => { const m = M(); if (m && m.volver) m.volver(); };

  // ── Lo que sale en la lista: una sola regla para el teléfono y el
  // escritorio (desk-transfers.js, 2026-11-27) ─────────────────────────
  // Por confirmar (lo que la otra locación mandó y espera aquí), lo de
  // los últimos días, y el estado de cada grupo. `todos`: cada grupo, para
  // la vista "All" del escritorio.
  function datos() {
    const t = T(), c = TC();
    const st = c && c.estado ? c.estado() : {};
    const loc = st.loc, locs = st.locs || [], filas = st.filas || [];
    const LC = window.BarStockLiveCache;
    const conteo = LC && LC.conteo ? LC.conteo() : null;
    const porConf = c && c.gruposPend ? c.gruposPend() : [];
    const pendIds = new Set([].concat(...porConf).map(x => x.id));
    const desde = Date.now() - RECIENTES_DIAS * 864e5;
    const recientes = t && loc ? t.grupos(filas.filter(x => !pendIds.has(x.id) &&
      (Date.parse(x.created_at) > desde || Date.parse(x.status_at || 0) > desde))) : [];
    const todos = t && loc ? t.grupos(filas) : [];
    // [texto, clase]: lo que el estado dice de este grupo desde AQUÍ.
    const estado = (g) => {
      const s = g[0].status;
      if (s === 'pending') return t.loRegistre(g[0], loc) ? ['waiting', 'w'] : ['to confirm', 'in'];
      return s === 'confirmed' ? ['confirmed', 'ok'] : s === 'rejected' ? ['not right', 'no'] : ['undone', 'off'];
    };
    return { t, c, loc, locs, filas, conteo, porConf, recientes, todos, estado,
      puede: !!(t && t.puede()), nombre: (id) => (t ? t.nombreDe(locs, id) : ''),
      deshacible: (g) => !!(t && t.puede() && t.cuentaAqui(g[0], loc) && t.deshacible(g[0], conteo)) };
  }

  // Undo, con su pregunta (el teléfono y el escritorio). → true si se hizo.
  async function deshacer(g) {
    const t = T();
    const D = window.BarStockDialog;
    const ok = D && D.preguntar ? await D.preguntar({ titulo: 'Undo this transfer?',
      cuerpo: 'It stops counting in both locations, and its order leaves Sent.', ok: 'Undo', cancelar: 'Keep it', peligro: true })
      : window.confirm('Undo this transfer?');
    if (!ok) return false;
    const LC = window.BarStockLiveCache;
    const conteo = LC && LC.conteo ? LC.conteo() : null;
    const r = await t.deshacer(g, quien(), conteo);
    toast(!r.ok ? 'Not undone: ' + (r.error || 'unknown error') : r.aviso ? 'Undone, but not everything: ' + r.aviso : 'Transfer undone');
    if (r.ok && LC && LC.caducar) LC.caducar();
    return !!r.ok;
  }

  // Guardar un "New transfer" (el borrador { entra, otra, antes, lineas }).
  // → { ok, error }. El aviso lo da aquí.
  async function crear(nuevo) {
    const t = T(), c = TC();
    const st = c && c.estado ? c.estado() : {};
    const loc = st.loc, locs = st.locs || [], filas = st.filas || [];
    const LC = window.BarStockLiveCache;
    const conteo = LC && LC.conteo ? LC.conteo() : null;
    const pareja = (item) => (nuevo.otra ? t.pareja(filas, loc, nuevo.otra, item) : null);
    const r = await t.crear({ otra: nuevo.otra, entra: nuevo.entra, antes: nuevo.antes, conteo, por: quien(),
      lineas: nuevo.lineas.map(l => ({ item: l.item, otroItem: pareja(l.item), qty: l.qty })) });
    if (!r.ok) return { ok: false, error: r.error || 'It was not saved.' };
    toast(r.aviso ? 'Transfer saved, but not everything: ' + r.aviso : 'Transfer saved · ' + t.nombreDe(locs, nuevo.otra) + ' will confirm it');
    if (LC && LC.caducar) LC.caducar();
    return { ok: true };
  }

  // ── La lista (opción A) ──────────────────────────────────────────────
  function pintarLista() {
    const h = _host;
    if (!h) return;
    const d = datos();
    const { t, c, loc, porConf, recientes, puede, nombre, estado } = d;
    const LC = window.BarStockLiveCache;

    h.innerHTML = cabecera('Transfers', aMas) +
      (puede ? '<button type="button" class="m-tx-nuevo" id="mTxNew"><i class="ti ti-arrows-exchange" aria-hidden="true"></i> New transfer</button>' : '') +
      (loc == null ? '<div class="m-tx-vacio">Loading…</div>' : '') +
      (porConf.length ? `<div class="m-lab">TO CONFIRM · ${porConf.length}</div>` + porConf.map((g, i) => {
        const x = g[0];
        const todos = g.every(y => c.productoDe(y));
        return `<div class="m-tx m-tx-pend">
          <div class="m-tx-top"><b>${t.entra(x, loc) ? 'From' : 'To'} ${esc(corta(nombre(t.otraLoc(x, loc))))}</b>
            <span class="m-tx-st in">${g.length === 1 ? '1 item' : g.length + ' items'} · ${esc(n(g.reduce((a, y) => a + (Number(y.qty) || 0), 0)))}</span></div>
          <div class="m-tx-sub">${esc(cuandoNY(x.moved_at))}${x.created_by ? ' · ' + esc(x.created_by) : ''}${x.before_count ? ' · before the count' : ''}</div>
          ${g.map(y => `<div class="m-tx-l"><span><b>${esc(n(y.qty))}</b> ${esc(t.suItem(y, loc) || '—')}</span>
            <span class="m-tx-mio">${c.productoDe(y) ? '&harr; ' + esc(c.productoDe(y)) : 'choose yours'}</span></div>`).join('')}
          ${puede ? `<div class="m-tx-b"><button type="button" class="m-tx-ok" data-tx-ok="${i}">${todos ? (g.length === 1 ? 'Confirm ' + esc(n(x.qty)) : 'Confirm all') : 'Choose yours'}</button>
            <button type="button" class="m-tx-no" data-tx-no="${i}">Not right</button></div>` : ''}
        </div>`;
      }).join('') : '') +
      (recientes.length ? `<div class="m-lab">THIS WEEK</div>` + recientes.map((g, i) => {
        const x = g[0];
        const [txt, k] = estado(g);
        const puedeDeshacer = d.deshacible(g);
        return `<div class="m-tx">
          <div class="m-tx-top"><b>${t.entra(x, loc) ? 'From' : 'To'} ${esc(corta(nombre(t.otraLoc(x, loc))))}</b><span class="m-tx-st ${k}">${txt}</span></div>
          <div class="m-tx-sub">${g.map(y => esc(n(y.qty)) + ' ' + esc(t.miItem(y, loc) || t.suItem(y, loc) || '')).join(' · ')}</div>
          <div class="m-tx-sub">${esc(cuandoNY(x.moved_at, true))}${x.created_by ? ' · ' + esc(x.created_by) : ''}${x.before_count ? ' · before the count' : ''}${
            x.vendor_order_id && t.entra(x, loc) ? ' · in Sent' : ''}${
            puedeDeshacer ? ` · <button type="button" class="m-tx-undo" data-tx-undo="${i}">Undo</button>` : ''}</div>
        </div>`;
      }).join('') : '') +
      (loc != null && !porConf.length && !recientes.length
        ? '<div class="m-tx-vacio">No transfers this week.<br>Moving bottles to or from another location? Start with New transfer.</div>' : '');

    const nb = h.querySelector('#mTxNew');
    if (nb) nb.onclick = () => abrirNuevo();
    h.querySelectorAll('[data-tx-ok]').forEach(b => { b.onclick = async () => { b.disabled = true; await c.confirmar(porConf[Number(b.dataset.txOk)]); refrescar(); }; });
    h.querySelectorAll('[data-tx-no]').forEach(b => { b.onclick = async () => { await c.noEsAsi(porConf[Number(b.dataset.txNo)]); refrescar(); }; });
    h.querySelectorAll('[data-tx-undo]').forEach(b => { b.onclick = async () => {
      if (await deshacer(recientes[Number(b.dataset.txUndo)])) refrescar();
    }; });
  }

  // ── New transfer (la tercera lámina) ─────────────────────────────────
  function abrirNuevo(item) {
    // "Out of" primero y de entrada (Axel, 2026-11-18): lo normal es que
    // registre quien da las botellas.
    _nuevo = { entra: false, otra: null, antes: false, lineas: item ? [{ item, qty: 1 }] : [] };
    _vista = 'nuevo';
    pintar();
  }
  function pintarNuevo(error) {
    const h = _host, t = T(), c = TC();
    const st = c && c.estado ? c.estado() : {};
    const loc = st.loc, locs = st.locs || [], filas = st.filas || [];
    const otras = locs.filter(l => l.id !== loc);
    if (!_nuevo.otra && otras.length === 1) _nuevo.otra = otras[0].id;
    const mia = corta(t.nombreDe(locs, loc));
    const LC = window.BarStockLiveCache;
    const conteo = LC && LC.conteo ? LC.conteo() : null;
    const total = _nuevo.lineas.reduce((a, l) => a + l.qty, 0);
    const pareja = (item) => (_nuevo.otra ? t.pareja(filas, loc, _nuevo.otra, item) : null);
    const listo = !!_nuevo.otra && _nuevo.lineas.length > 0;
    const dn = conteo ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(conteo)) : '';

    h.innerHTML = cabecera('New transfer', () => { _vista = 'lista'; pintar(); }) + `
      <div class="m-tr-seg m-tx-seg" role="group">
        <button type="button" data-dir="out" class="${_nuevo.entra ? '' : 'on'}">Out of ${esc(mia)}</button>
        <button type="button" data-dir="in" class="${_nuevo.entra ? 'on' : ''}">Into ${esc(mia)}</button>
      </div>
      <div class="m-lab">${_nuevo.entra ? 'FROM' : 'TO'}</div>
      <div class="m-tr-locs">${otras.map(l => `<button type="button" data-loc="${esc(l.id)}" class="m-tr-loc${_nuevo.otra === l.id ? ' on' : ''}">${esc(l.name)}</button>`).join('')}</div>
      <div class="m-lab">PRODUCTS</div>
      ${_nuevo.lineas.map((l, i) => `<div class="m-tx-p">
        <div class="m-tx-pn"><b>${esc(l.item)}</b>${pareja(l.item) ? `<small>theirs: ${esc(pareja(l.item))}</small>` : ''}</div>
        <div class="m-tx-q"><button type="button" data-q="${i}" data-d="-1" aria-label="One less">&minus;</button><span>${esc(n(l.qty))}</span>
          <button type="button" data-q="${i}" data-d="1" aria-label="One more">+</button>
          <button type="button" class="m-tx-x" data-quita="${i}" aria-label="Remove ${esc(l.item)}"><i class="ti ti-x" aria-hidden="true"></i></button></div>
      </div>`).join('')}
      <button type="button" class="m-tx-add" id="mTxAdd"><i class="ti ti-plus" aria-hidden="true"></i> Add a product</button>
      <div class="m-lab">WHEN</div>
      <div class="m-tr-seg m-tx-seg" role="group">
        <button type="button" data-cuando="ahora" class="${_nuevo.antes ? '' : 'on'}">Now</button>
        ${conteo ? `<button type="button" data-cuando="antes" class="${_nuevo.antes ? 'on' : ''}">Before the count · ${esc(dn)}</button>` : ''}
      </div>
      ${_nuevo.antes ? '<div class="m-tx-nota">They were already on the shelf when you counted: Live won’t add them again.</div>' : ''}
      <div class="m-kp-err" aria-live="polite">${error ? esc(error) : ''}</div>
      ${_nuevo.otra ? `<div class="m-tx-nota">${esc(t.nombreDe(locs, _nuevo.otra))} sees it and confirms it.</div>` : ''}
      <div class="m-tx-hueco" aria-hidden="true"></div>
      <button type="button" id="mTxGo" ${listo ? '' : 'disabled'}>${
        !_nuevo.otra ? 'Choose the other location' : !_nuevo.lineas.length ? 'Add a product' : 'Transfer ' + esc(n(total)) + (total === 1 ? ' bottle' : ' bottles')}</button>`;

    h.querySelectorAll('[data-dir]').forEach(b => { b.onclick = () => { _nuevo.entra = b.dataset.dir === 'in'; pintar(); }; });
    h.querySelectorAll('[data-loc]').forEach(b => { b.onclick = () => { _nuevo.otra = b.dataset.loc; pintar(); }; });
    h.querySelectorAll('[data-q]').forEach(b => { b.onclick = () => {
      const l = _nuevo.lineas[Number(b.dataset.q)];
      l.qty = Math.max(1, l.qty + Number(b.dataset.d));
      pintar();
    }; });
    h.querySelectorAll('[data-quita]').forEach(b => { b.onclick = () => { _nuevo.lineas.splice(Number(b.dataset.quita), 1); pintar(); }; });
    h.querySelectorAll('[data-cuando]').forEach(b => { b.onclick = () => { _nuevo.antes = b.dataset.cuando === 'antes'; pintar(); }; });
    h.querySelector('#mTxAdd').onclick = () => elegirProducto();
    const go = h.querySelector('#mTxGo');
    go.onclick = async () => {
      go.disabled = true;
      const r = await crear(_nuevo);
      if (!r.ok) return pintarNuevo(r.error);
      _nuevo = null; _vista = 'lista';
      refrescar();
    };
  }

  // Añadir un producto: el buscador de toda la app a pantalla completa
  // (bottle-search.js, lámina A; era una hoja propia que en el iPhone se
  // movía al escribir), sin los que ya están. Sin escribir, la lista
  // entera por orden alfabético, como antes.
  function elegirProducto() {
    const B = window.BarStockBottleSearch;
    if (!B || !B.abrir) return;
    const ya = new Set(_nuevo.lineas.map(l => l.item));
    B.abrir({
      pantalla: true,
      titulo: 'Add a product',
      sub: 'Add a product to this transfer',
      productos: master().filter(r => r && r.item && !ya.has(r.item)).map(r => r.item).sort((a, b) => a.localeCompare(b)),
      que: 'products',
      verTodo: true,
      alElegir: (p) => {
        B.cerrar();
        _nuevo.lineas.push({ item: p, qty: 1 });
        pintar();
      }
    });
  }

  // ── Pintar y releer ──────────────────────────────────────────────────
  function pintar() {
    if (!_host) return;
    if (_vista === 'nuevo' && _nuevo) pintarNuevo(); else pintarLista();
  }
  function refrescar() {
    const c = TC();
    pintar();
    if (c && c.cargar) Promise.resolve(c.cargar()).then(pintar);
  }
  if (TC() && TC().alCambiar) TC().alCambiar(() => { if (_host && _host.classList.contains('on')) pintar(); });

  function montar(host) { _host = host; _vista = 'lista'; _nuevo = null; refrescar(); }

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      id: 'transfers', icon: 'ti-arrows-exchange', label: 'Transfers', tab: false,
      mount: montar,
      show(host) { montar(host); },
      atras(host, hacerlo) {
        if (hacerlo) {
          if (_vista === 'nuevo') { _vista = 'lista'; _nuevo = null; pintar(); }
          else aMas();
        }
        return true;
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();

  window.BarStockMobileTransfers = { montar, abrirNuevo, pendientes, datos, deshacer, crear, cuandoNY, corta, n,
    _estado: () => ({ vista: _vista, nuevo: _nuevo }) };
})();
