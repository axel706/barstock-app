(() => {
  if (window.BarStockDeskTransfers) return;

  // ── Transfers en el escritorio (Axel, 2026-11-27, lámina "Transfers ·
  //    desktop", A: "como Sent, la lista y el elegido") ──
  //
  // La sección de la barra lateral (antes "Soon"). A la izquierda los
  // transfers (lo que espera que confirmes primero); a la derecha el
  // elegido, producto por producto "lo suyo → lo tuyo", y en la barra de
  // cristal de abajo Confirm all / Choose yours / Not right, o Undo. "New
  // transfer" (el + verde del header) se abre en el mismo panel derecho.
  //
  // Nada es nuevo por dentro:
  //   · qué sale (por confirmar, la semana, el estado de cada uno), el Undo
  //     con su pregunta y el guardar de New transfer son del TELÉFONO
  //     (BarStockMobileTransfers.datos / deshacer / crear);
  //   · confirmar, "Choose yours" y "Not right" son los de la tarjeta del
  //     Home y la campana (BarStockTransferConfirm); "Choose yours" y "Add a
  //     product" abren la ventana del escritorio (desk-botella.js);
  //   · las cuentas (Live, Pour·IQ, la orden TRANSFER en Sent) son las de
  //     transfers.js.
  // La sección existe ANTES de que arranque desk-shell (este archivo se
  // carga antes que él), como Running out: el armazón vigila las
  // .section-card que encuentra al montar.

  const MT = () => window.BarStockMobileTransfers;
  const TC = () => window.BarStockTransferConfirm;
  const DH = () => window.BarStockDeskHeader;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const master = () => (window.state && window.state.master) || [];
  const n = (x) => String(Math.round((Number(x) || 0) * 10) / 10);
  const corta = (s) => String(s || '').replace(/^the\s+/i, '');
  const botellas = (g) => g.reduce((a, y) => a + (Number(y.qty) || 0), 0);
  const cuando = (iso, dia) => (MT() && MT().cuandoNY ? MT().cuandoNY(iso, dia) : String(iso || ''));

  let _sec = null, _vista = null, _sel = null, _q = '', _tq = 0, _otra = '';
  // El borrador de New transfer: { entra, otra, antes, lineas: [{ item, qty }] }.
  let _nuevo = null, _error = '';

  function abierta() { return !!(_sec && _sec.classList.contains('bs-active-section')); }
  const clave = (g) => String(g[0].id);

  // ── Qué grupos salen, según la vista, la búsqueda y la locación ──
  function lista(d) {
    const v = vista(d);
    let gs = v === 'pend' ? d.porConf
      : v === 'semana' ? d.porConf.concat(d.recientes)
      : d.todos.slice().sort((a, b) => Date.parse(b[0].moved_at || b[0].created_at) - Date.parse(a[0].moved_at || a[0].created_at));
    if (_otra) gs = gs.filter(g => String(d.t.otraLoc(g[0], d.loc)) === String(_otra));
    const q = _q.trim().toLowerCase();
    if (q) gs = gs.filter(g => [d.nombre(d.t.otraLoc(g[0], d.loc))].concat(g.map(y => d.t.suItem(y, d.loc)), g.map(y => d.t.miItem(y, d.loc)))
      .some(x => String(x || '').toLowerCase().includes(q)));
    return gs;
  }
  // Sin elegir: To confirm si hay algo que confirmar, si no la semana.
  const vista = (d) => _vista || (d.porConf.length ? 'pend' : 'semana');

  // ── La columna ──
  function pintarLista(d) {
    const el = _sec.querySelector('#dktxLista');
    if (!el) return;
    if (d.loc == null) { el.innerHTML = '<p class="dktx-nada">Loading…</p>'; return; }
    const gs = lista(d);
    if (!_nuevo && (!_sel || !gs.some(g => clave(g) === _sel))) _sel = gs.length ? clave(gs[0]) : null;
    const v = vista(d);
    el.innerHTML = `<div class="dktx-k">${v === 'pend' ? 'To confirm' : v === 'semana' ? 'This week' : 'All transfers'} · ${gs.length}</div>` +
      (gs.length ? gs.map(g => {
        const x = g[0];
        const entra = d.t.entra(x, d.loc);
        const [txt, k] = d.estado(g);
        return `<button type="button" class="dktx-c${!_nuevo && clave(g) === _sel ? ' sel' : ''}" data-g="${esc(clave(g))}">
          <span class="dktx-dir ${entra ? 'in' : 'out'}"><i class="ti ti-arrow-${entra ? 'down-left' : 'up-right'}" aria-hidden="true"></i></span>
          <span class="dktx-cn"><b>${entra ? 'From' : 'To'} ${esc(corta(d.nombre(d.t.otraLoc(x, d.loc))))}</b>
            <small>${esc(cuando(x.moved_at, true))} · ${g.length === 1 ? esc(n(x.qty)) + ' ' + esc(d.t.miItem(x, d.loc) || d.t.suItem(x, d.loc) || '') : g.length + ' products · ' + esc(n(botellas(g)))}</small></span>
          <span class="dktx-st ${k}">${esc(txt)}</span></button>`;
      }).join('')
      : `<p class="dktx-nada">${_q || _otra ? 'Nothing matches.' : v === 'pend' ? 'Nothing to confirm.' : 'No transfers this week.'}</p>`);
  }

  // ── El elegido ──
  function pintarDetalle(d) {
    const el = _sec.querySelector('#dktxDet');
    if (!el) return;
    if (_nuevo) return pintarNuevo(d, el);
    const g = d.loc != null && _sel ? lista(d).find(x => clave(x) === _sel) : null;
    if (!g) {
      el.innerHTML = `<div class="dktx-vacio"><span class="dktx-vacio-i"><i class="ti ti-arrows-exchange" aria-hidden="true"></i></span>
        <b>${d.loc == null ? 'Loading…' : 'No transfer chosen'}</b>
        <small>Moving bottles to or from another location? Start with New transfer.</small></div>`;
      return;
    }
    const x = g[0], t = d.t, c = d.c;
    const entra = t.entra(x, d.loc);
    const [txt, k] = d.estado(g);
    const porConf = x.status === 'pending' && !t.loRegistre(x, d.loc);
    const otra = corta(d.nombre(t.otraLoc(x, d.loc)));
    // Lo suyo → lo tuyo: por confirmar, el que elegiste (o "choose yours");
    // ya confirmado, el que quedó guardado.
    const mio = (y) => porConf ? c.productoDe(y) : t.miItem(y, d.loc);
    const todos = g.every(y => c.productoDe(y));
    el.innerHTML = `<div class="dktx-cab"><span class="dktx-dir ${entra ? 'in' : 'out'}"><i class="ti ti-arrow-${entra ? 'down-left' : 'up-right'}" aria-hidden="true"></i></span>
        <div><h3>${entra ? 'From' : 'To'} ${esc(otra)}</h3>
        <div class="dktx-s">${esc(cuando(x.moved_at, true))}${x.created_by ? ' · ' + esc(x.created_by) : ''} · ${g.length === 1 ? '1 product' : g.length + ' products'} · ${esc(n(botellas(g)))} bottles${x.before_count ? ' · before the count' : ''}${x.vendor_order_id && entra ? ' · in Sent' : ''}</div></div>
        <span class="dktx-st ${k}">${esc(txt)}</span></div>
      <div class="dktx-k">${entra ? 'Theirs → yours' : 'Yours → theirs'}</div>
      ${g.map(y => {
        const suyo = t.suItem(y, d.loc), m = mio(y);
        const izq = entra ? suyo : m, der = entra ? m : suyo;
        return `<div class="dktx-l"><span class="q">${esc(n(y.qty))}×</span><span>${esc(izq || '—')}</span><i class="ti ti-arrow-right" aria-hidden="true"></i>
          <span class="${der ? 'mio' : 'falta'}">${der ? esc(der) : entra && porConf ? 'choose yours' : '—'}</span>
          ${porConf && d.puede ? `<button type="button" class="dki-cr dktx-ch" data-tx="elegir" data-id="${esc(y.id)}">${m ? 'Change' : 'Choose'}</button>` : '<span></span>'}</div>`;
      }).join('')}
      <p class="dktx-nota">${porConf ? 'Confirming adds them to your Live and to Pour·IQ' + (entra ? ', and an order TRANSFER appears in Sent.' : '.')
        : x.status === 'pending' ? esc(otra) + ' sees it and confirms it.' : x.status === 'rejected' ? (x.reason ? esc(x.reason) + '. ' : '') + 'It does not count in either location.' : ''}</p>
      <div class="dktx-pie">${porConf && d.puede
        ? `<button type="button" class="dki-cr azul dktx-go" data-tx="ok">${todos ? (g.length === 1 ? 'Confirm ' + esc(n(x.qty)) : 'Confirm all') : 'Choose yours'}</button>
           <button type="button" class="dki-cr rojo" data-tx="no">Not right</button>`
        : d.deshacible(g) ? '<button type="button" class="dki-cr" data-tx="undo"><i class="ti ti-arrow-back-up" aria-hidden="true"></i>Undo</button>'
        : `<span class="dktx-pie-t">${x.status === 'pending' ? 'Waiting for ' + esc(otra) : esc(txt[0].toUpperCase() + txt.slice(1))}</span>`}</div>`;
  }

  // ── New transfer, en el panel derecho ──
  function pintarNuevo(d, el) {
    const t = d.t;
    const otras = (d.locs || []).filter(l => l.id !== d.loc);
    if (!_nuevo.otra && otras.length === 1) _nuevo.otra = otras[0].id;
    const mia = corta(d.nombre(d.loc));
    const total = _nuevo.lineas.reduce((a, l) => a + l.qty, 0);
    const pareja = (item) => (_nuevo.otra ? t.pareja(d.filas, d.loc, _nuevo.otra, item) : null);
    const listo = !!_nuevo.otra && _nuevo.lineas.length > 0;
    const dn = d.conteo ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(d.conteo)) : '';
    el.innerHTML = `<div class="dktx-cab"><span class="dktx-dir nuevo"><i class="ti ti-arrows-exchange" aria-hidden="true"></i></span><div><h3>New transfer</h3>
        <div class="dktx-s">The other location sees it and confirms it.</div></div></div>
      <div class="dktx-k">Direction</div>
      <div class="dkq-seg dktx-seg" role="group"><button type="button" data-tx="dir" data-v="out" class="${_nuevo.entra ? '' : 'on'}">Out of ${esc(mia)}</button>
        <button type="button" data-tx="dir" data-v="in" class="${_nuevo.entra ? 'on' : ''}">Into ${esc(mia)}</button></div>
      <div class="dktx-k">${_nuevo.entra ? 'From' : 'To'}</div>
      <div class="dktx-locs">${otras.map(l => `<button type="button" data-tx="loc" data-v="${esc(l.id)}" class="dktx-loc${String(_nuevo.otra) === String(l.id) ? ' on' : ''}">${esc(l.name)}</button>`).join('')}</div>
      <div class="dktx-k">When</div>
      <div class="dkq-seg dktx-seg" role="group"><button type="button" data-tx="cuando" data-v="ahora" class="${_nuevo.antes ? '' : 'on'}">Now</button>
        ${d.conteo ? `<button type="button" data-tx="cuando" data-v="antes" class="${_nuevo.antes ? 'on' : ''}">Before the count · ${esc(dn)}</button>` : ''}</div>
      ${_nuevo.antes ? '<p class="dktx-nota">They were already on the shelf when you counted: Live won’t add them again.</p>' : ''}
      <div class="dktx-k">This transfer · ${_nuevo.lineas.length} product${_nuevo.lineas.length === 1 ? '' : 's'}</div>
      ${_nuevo.lineas.map((l, i) => `<div class="dktx-nl"><span class="dktx-nn"><b>${esc(l.item)}</b>${pareja(l.item) ? `<small>theirs: ${esc(pareja(l.item))}</small>` : ''}</span>
        <span class="dkq-q"><button type="button" class="dki-cr" data-tx="menos" data-i="${i}" aria-label="One less">−</button><b class="dktx-qn">${esc(n(l.qty))}</b><button type="button" class="dki-cr" data-tx="mas" data-i="${i}" aria-label="One more">+</button></span>
        <button type="button" class="dkq-x" data-tx="quitar" data-i="${i}" aria-label="Remove ${esc(l.item)}"><i class="ti ti-x" aria-hidden="true"></i></button></div>`).join('')}
      <button type="button" class="dki-cr dktx-add" data-tx="anadir"><i class="ti ti-plus" aria-hidden="true"></i>Add a product</button>
      ${_error ? `<p class="dktx-err" aria-live="polite">${esc(_error)}</p>` : ''}
      <div class="dktx-pie"><span class="dktx-pie-t"><b>${esc(n(total))} bottle${total === 1 ? '' : 's'}</b>${_nuevo.otra ? '<small>' + esc(d.nombre(_nuevo.otra)) + ' sees it and confirms it</small>' : ''}</span>
        <button type="button" class="dki-cr verde dktx-go" data-tx="crear"${listo ? '' : ' disabled'}><i class="ti ti-arrows-exchange" aria-hidden="true"></i>${
          !_nuevo.otra ? 'Choose the other location' : !_nuevo.lineas.length ? 'Add a product' : 'Transfer ' + esc(n(total)) + (total === 1 ? ' bottle' : ' bottles')}</button></div>`;
  }

  function pintar() {
    if (!_sec || !abierta() || !MT() || !MT().datos) return;
    const d = MT().datos();
    pintarLista(d);
    pintarDetalle(d);
    const D = DH();
    if (D && D.refrescar) D.refrescar('transfers');
    // El número de la barra lateral (lo que espera que lo confirmes).
    const S = window.BarStockDeskShell;
    if (S && S.marcarLado) S.marcarLado();
  }

  function nuevo() {
    // "Out of" primero, como el teléfono: lo normal es que lo registre
    // quien da las botellas.
    _nuevo = { entra: false, otra: null, antes: false, lineas: [] };
    _error = '';
    pintar();
  }
  function salirNuevo() { _nuevo = null; _error = ''; pintar(); }

  function anadir() {
    const DB = window.BarStockDeskBotella;
    if (!DB || !_nuevo) return;
    const ya = new Set(_nuevo.lineas.map(l => l.item));
    DB.abrir({ titulo: 'Add a product', sub: 'Add a product to this transfer', verTodo: true,
      productos: master().filter(r => r && r.item && !ya.has(r.item)).map(r => r.item).sort((a, b) => a.localeCompare(b)),
      alElegir: (p) => { if (!_nuevo) return; _nuevo.lineas.push({ item: p, qty: 1 }); _error = ''; pintar(); } });
  }

  async function alClic(ev) {
    const c = ev.target.closest('[data-g]');
    if (c) { _nuevo = null; _sel = c.dataset.g; pintar(); return; }
    const b = ev.target.closest('[data-tx]');
    if (!b || !MT()) return;
    const k = b.dataset.tx;
    const d = MT().datos();
    const g = _sel ? lista(d).find(x => clave(x) === _sel) : null;
    if (k === 'ok' && g) { b.disabled = true; await d.c.confirmar(g); return pintar(); }
    if (k === 'no' && g) { await d.c.noEsAsi(g); return pintar(); }
    if (k === 'undo' && g) { await MT().deshacer(g); return pintar(); }
    if (k === 'elegir' && g) { const y = g.find(z => String(z.id) === b.dataset.id); if (y) d.c.elegir(y, pintar); return; }
    if (!_nuevo) return;
    const i = Number(b.dataset.i);
    if (k === 'dir') _nuevo.entra = b.dataset.v === 'in';
    else if (k === 'loc') _nuevo.otra = b.dataset.v;
    else if (k === 'cuando') _nuevo.antes = b.dataset.v === 'antes';
    else if (k === 'menos' || k === 'mas') { const l = _nuevo.lineas[i]; if (l) l.qty = Math.max(1, l.qty + (k === 'mas' ? 1 : -1)); }
    else if (k === 'quitar') _nuevo.lineas.splice(i, 1);
    else if (k === 'anadir') return anadir();
    else if (k === 'crear') {
      b.disabled = true;
      const r = await MT().crear(_nuevo);
      if (!r.ok) { _error = r.error; return pintar(); }
      _nuevo = null; _error = ''; _vista = 'semana'; _sel = null;
      if (TC() && TC().cargar) await TC().cargar();
    }
    pintar();
  }

  // ── El header de sitios fijos ──
  const CAB = {
    titulo: () => (_nuevo ? [{ t: 'Transfers', miga: 'tx' }, 'New'] : 'Transfers'),
    // La palabra es Transfers, a su principio: sale de New transfer.
    alTitulo() { if (_nuevo) salirNuevo(); if (window.scrollTo) window.scrollTo(0, 0); },
    vistas() {
      const d = MT() && MT().datos ? MT().datos() : null;
      const v = d ? vista(d) : 'semana';
      const b = (k, t, c) => `<button type="button" data-dkc="vista" data-vista="${k}" class="${v === k && !_nuevo ? 'on' : ''}"><span class="l">${t}</span><span class="c">${t}</span>${c ? `<em class="a">${c}</em>` : ''}</button>`;
      return `<div class="dkc-seg" role="group" aria-label="View">${b('pend', 'To confirm', d ? d.porConf.length : 0)}${b('semana', 'This week', 0)}${b('todo', 'All', 0)}</div>`;
    },
    afinar() {
      const D = DH();
      const d = MT() && MT().datos ? MT().datos() : null;
      return [D.campo({ id: 'dktxQ', icon: 'ti-search', placeholder: 'Location or product', value: _q }),
        D.boton({ acc: 'otra', icon: 'ti-building-store', label: 'All locations', en: !!_otra, valor: d && _otra ? corta(d.nombre(_otra)) : '' }),
        D.vacio()];
    },
    acciones() {
      const D = DH();
      const d = MT() && MT().datos ? MT().datos() : null;
      return [D.vacio(), d && d.puede ? D.boton({ acc: 'nuevo', icon: 'ti-plus', label: 'New transfer', tono: 'verde' }) : D.vacio()];
    },
    extras() { return []; },
    alClic(ev, t) {
      const k = t.dataset.dkc;
      if (k === 'vista') { _vista = t.dataset.vista; _nuevo = null; _sel = null; return pintar(); }
      if (k === 'miga') return salirNuevo();
      if (k === 'nuevo') return nuevo();
      if (k === 'otra') {
        const d = MT().datos();
        const otras = (d.locs || []).filter(l => l.id !== d.loc);
        DH().menu(t, [{ h: 'Location' }, { icon: _otra ? 'ti-point' : 'ti-check', label: 'All locations', fn: () => { _otra = ''; pintar(); } }]
          .concat(otras.map(l => ({ icon: String(_otra) === String(l.id) ? 'ti-check' : 'ti-point', label: corta(l.name), fn: () => { _otra = l.id; pintar(); } }))));
      }
    },
    alEscribir(ev) {
      if (ev.target.id !== 'dktxQ') return;
      _q = ev.target.value;
      clearTimeout(_tq);
      _tq = setTimeout(() => { _tq = 0; pintar(); }, 120);
    }
  };

  // Al abrir, se lee (la misma lectura de la tarjeta del Home y la
  // campana); lo que cambie en otro sitio llega por su alCambiar.
  function alAbrirCerrar() {
    if (!abierta()) return;
    pintar();
    if (TC() && TC().cargar) Promise.resolve(TC().cargar()).then(pintar);
  }

  function montar() {
    if (_sec) return;
    const wrap = document.querySelector('.wrap');
    if (!wrap) return;
    _sec = document.createElement('section');
    // dk-pantalla: la forma de las secciones (desk-shell.css, el estándar).
    _sec.className = 'card section-card dk-pantalla dk-tx-sec';
    _sec.id = 'transfersSection';
    _sec.innerHTML = `<div id="dkTx"><aside class="dktx-col" id="dktxLista" aria-label="Transfers"></aside><div class="dktx-det" id="dktxDet"></div></div>`;
    wrap.appendChild(_sec);
    _sec.querySelector('#dkTx').addEventListener('click', alClic);
    new MutationObserver(alAbrirCerrar).observe(_sec, { attributes: true, attributeFilter: ['class'] });
    const D = DH();
    if (D && D.registrar) D.registrar('transfers', CAB);
    if (TC() && TC().alCambiar) TC().alCambiar(() => {
      pintar();
      // El número de la barra lateral, también con la sección cerrada.
      const S = window.BarStockDeskShell;
      if (S && S.marcarLado) S.marcarLado();
    });
  }

  if (document.querySelector('.wrap')) montar();
  else document.addEventListener('DOMContentLoaded', montar);

  window.BarStockDeskTransfers = { montar, abierta, nuevo, _estado: () => ({ vista: _vista, sel: _sel, nuevo: _nuevo }) };
})();
