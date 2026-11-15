(() => {
  if (window.BarStockRunningOutReview) return;

  // ── Revisar lo que se acaba (Axel, 2026-11-14, lámina B) ─────────────
  //
  // "See them" de la tarjeta "Running out first" abre esta pantalla. Cada
  // producto, con su LIVE, su "Out" y cuánto pedir, y dos botones:
  //   · "Add N to list": a la lista compartida (shopping-list.js). Pide
  //     el permiso "Make and send orders".
  //   · "I have enough": pide CUÁNTOS hay, con un teclado (un sí sin
  //     número callaría el aviso y dejaría el LIVE mal). Guarda una
  //     verificación (stock-checks.js) y desde ahí el LIVE parte de ese
  //     número. Pide "Count inventory".
  // Lo ya decidido se queda en su tarjeta con quién y cuándo: es lo que
  // hace que todos los managers vean lo mismo. Lo de la lista tiene
  // "Undo" (la fila pasa a `removed`); lo verificado, "Change": las
  // verificaciones son historia y no se deshacen, se corrigen con otra
  // (gana la última). Un "Undo" que no deshace sería una afordancia que
  // miente.
  //
  // Es una PANTALLA, como la de editar un producto: fija encima de lo
  // que había, con su título en la banda y su atrás.

  let _el = null, _quitarOyente = null;
  let _lista = [], _checks = new Map(), _cargando = false;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n1 = (x) => (Math.round((Number(x) || 0) * 10) / 10).toFixed(1);
  const G = () => window.BarStockGuest;
  const puede = (k) => { const g = G(); return !g || !g.puede || g.puede(k); };
  const quien = () => { const g = G(); return (g && g.nombre && g.nombre()) || ''; };
  const aviso = (t) => { const T = window.BarStockToast; if (T && T.show) try { T.show(t); } catch (e) {} };
  const LC = () => window.BarStockLiveCache;
  const master = () => (window.state && window.state.master) || [];

  // "Wed 3:12 PM", en Nueva York.
  const cuandoNY = (iso) => {
    const t = new Date(iso);
    if (isNaN(t.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short',
      hour: 'numeric', minute: '2-digit' }).format(t).replace(',', '');
  };

  async function cargarDatos() {
    const SL = window.BarStockShoppingList, SC = window.BarStockStockChecks;
    try { _lista = SL ? await SL.leer() : []; }
    catch (e) { console.warn('[running out] sin la lista:', e && e.message || e); _lista = []; }
    _checks = new Map();
    const desde = LC() && LC().conteo ? LC().conteo() : null;
    if (SC && desde) {
      try { for (const c of await SC.leer(desde)) _checks.set(c.item_name, c); }   // por orden: gana la última
      catch (e) { console.warn('[running out] sin las verificaciones:', e && e.message || e); }
    }
  }

  // Los productos: los que se acaban (running-out.js, en su orden) y,
  // después, los que alguien ya revisó aunque hayan dejado de acabarse
  // (verificar 6 saca un producto de la lista; su tarjeta se queda para
  // que se vea quién lo revisó).
  function productos() {
    const RO = window.BarStockRunningOut;
    const base = RO && RO.lista ? RO.lista() : [];
    const vistos = new Set(base.map(x => x.item));
    const extra = [];
    for (const nombre of [..._lista.map(x => x.item_name), ..._checks.keys()]) {
      if (vistos.has(nombre)) continue;
      const r = master().find(m => m.item === nombre);
      if (!r) continue;
      vistos.add(nombre);
      extra.push({ r, item: nombre, out: LC() && LC().agota ? LC().agota(r) : null, extra: true });
    }
    return { base, todos: base.concat(extra) };
  }

  function cuantoPedir(r) {
    const p = LC() && LC().pedir ? LC().pedir(r) : null;
    if (p != null && p > 0) return p;
    // Sin lo que se suele gastar (lo que Toast no vende): hasta el par.
    const queda = LC() && LC().cuanto ? LC().cuanto(r) : Number(r.onHand) || 0;
    return Math.max(1, Math.ceil((Number(r.suggested) || 0) - queda));
  }

  function tarjeta(x) {
    const r = x.r;
    const queda = LC() && LC().cuanto ? LC().cuanto(r) : Number(r.onHand) || 0;
    const vivo = !!(LC() && LC().vivo && LC().vivo(r));
    const pedir = cuantoPedir(r);
    const enLista = _lista.find(l => l.item_name === r.item);
    const visto = _checks.get(r.item);
    const out = x.out && x.out.txt ? `<span class="m-ro-out ${x.out.tono === 'r' ? 'r' : 'a'}">${esc(x.out.txt)}</span>` : '';
    const estados = [];
    if (enLista) estados.push(`<div class="m-ro-hecho m-ro-lista">
        <span>&#10003; On the list &middot; ${esc(n1(enLista.qty).replace(/\.0$/, ''))}${enLista.added_by ? ' by ' + esc(enLista.added_by) : ''}</span>
        ${puede('ordenes') ? `<button type="button" class="m-ro-x" data-ro-undo="${esc(enLista.id)}">Undo</button>` : ''}</div>`);
    if (visto) estados.push(`<div class="m-ro-hecho m-ro-visto">
        <span>&#10003; Checked: ${esc(n1(visto.counted).replace(/\.0$/, ''))} on the shelf &middot; ${esc(cuandoNY(visto.checked_at))}${visto.checked_by ? ' &middot; ' + esc(visto.checked_by) : ''}</span>
        ${puede('contar') ? '<button type="button" class="m-ro-x" data-ro-cambiar>Change</button>' : ''}</div>`);
    const botones = [];
    if (!enLista && puede('ordenes')) botones.push(`<button type="button" class="m-ro-b m-ro-go" data-ro-add>Add ${esc(pedir)} to list</button>`);
    if (!visto && puede('contar')) botones.push('<button type="button" class="m-ro-b m-ro-gh" data-ro-ok>I have enough</button>');
    return `<div class="m-ro-c" data-item="${esc(r.item)}">
      <div class="m-ro-top">
        <div class="m-ro-n"><b>${esc(r.item)}</b>
          <small>${vivo ? '<span class="m-ro-live"><i></i>Live</span>' : ''}${out}<span>${esc(r.vendor || '')}</span></small></div>
        <div class="m-ro-v"><b>${vivo ? '&asymp;' : ''}${esc(n1(queda))}</b><small>Order ${esc(pedir)}</small></div>
      </div>
      ${botones.length ? `<div class="m-ro-btns">${botones.join('')}</div>` : ''}
      ${estados.join('')}
    </div>`;
  }

  function pintar() {
    if (!_el) return;
    const { base, todos } = productos();
    const nLista = todos.filter(x => _lista.some(l => l.item_name === x.item)).length;
    const nVisto = todos.filter(x => _checks.has(x.item)).length;
    const partes = [base.length + (base.length === 1 ? ' runs' : ' run') + ' out this week'];
    if (nLista) partes.push(nLista + ' on the list');
    if (nVisto) partes.push(nVisto + ' checked');
    _el.innerHTML = `
      <div class="m-ro-sum">${partes.map(esc).join(' &middot; ')}</div>
      ${_cargando && !todos.length ? '<div class="m-ro-vacio">Loading…</div>' : ''}
      ${!_cargando && !todos.length ? '<div class="m-ro-vacio">Nothing runs out this week.</div>' : ''}
      ${todos.map(tarjeta).join('')}`;
  }

  async function recargar() {
    await cargarDatos();
    pintar();
  }

  // ── El número: "I have enough" ──────────────────────────────────────
  //
  // Un teclado de botones, no un campo de texto: el de iOS haría zoom por
  // debajo de 16 px y taparía media pantalla. ".5" es la botella abierta.
  function teclado(r) {
    const vieja = document.getElementById('mSheet');
    if (vieja) vieja.remove();
    const queda = LC() && LC().cuanto ? LC().cuanto(r) : Number(r.onHand) || 0;
    let v = '';
    const h = document.createElement('div');
    h.className = 'm-sheet';
    h.id = 'mSheet';
    h.innerHTML = `<div class="m-sheet-bg"></div>
      <div class="m-sheet-box m-kp-hoja" role="dialog" aria-label="How many are on the shelf">
        <div class="m-sheet-grip"></div>
        <div class="m-kp-t">${esc(r.item)}</div>
        <div class="m-kp-s">How many are on the shelf right now? Live says &asymp;${esc(n1(queda))}</div>
        <div class="m-kp-d"><span class="m-kp-n"></span><small>bottles</small></div>
        <div class="m-kp">
          ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.5', '0', 'del'].map(k =>
            `<button type="button" class="m-kp-k" data-k="${k}" aria-label="${k === 'del' ? 'Delete' : k}">${k === 'del' ? '&#9003;' : k}</button>`).join('')}
        </div>
        <div class="m-kp-err" aria-live="polite"></div>
        <button type="button" class="m-ro-b m-ro-go m-kp-save" id="mKpSave" disabled>Save</button>
        <div class="m-kp-nota">Live starts from this until the next count. The count itself does not change.</div>
      </div>`;
    document.body.appendChild(h);
    const cerrar = () => h.remove();
    if (window.BarStockSheet && window.BarStockSheet.enganchar) window.BarStockSheet.enganchar(h, cerrar);
    h.querySelector('.m-sheet-bg').onclick = cerrar;
    const num = h.querySelector('.m-kp-n'), save = h.querySelector('#mKpSave'), err = h.querySelector('.m-kp-err');
    const pinta = () => {
      num.textContent = v || '–';
      save.disabled = !v;
      save.textContent = v ? 'Save · ' + v + ' on the shelf' : 'Save';
    };
    h.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => {
      const k = b.dataset.k;
      if (k === 'del') v = v.endsWith('.5') ? v.slice(0, -2) : v.slice(0, -1);
      else if (k === '.5') { if (v.indexOf('.') < 0) v = (v || '0') + '.5'; }
      else if (v.indexOf('.') < 0 && v.length < 3) v = v === '0' ? k : v + k;
      pinta();
    }; });
    save.onclick = async () => {
      if (!v || save.dataset.ocupado) return;
      save.dataset.ocupado = '1';
      err.textContent = '';
      const n = Number(v);
      const SC = window.BarStockStockChecks;
      const r2 = SC ? await SC.guardar({ item: r.item, n, decia: queda, por: quien() }) : { ok: false, error: 'Not loaded.' };
      delete save.dataset.ocupado;
      if (!r2.ok) { err.textContent = 'Not saved: ' + (r2.error || 'unknown error'); return; }
      _checks.set(r.item, { item_name: r.item, counted: n, live_said: queda, checked_by: quien(), checked_at: new Date().toISOString() });
      cerrar();
      if (LC() && LC().caducar) LC().caducar();
      pintar();
    };
    pinta();
  }

  function alTocar(ev) {
    const c = ev.target.closest && ev.target.closest('.m-ro-c');
    if (!c) return;
    const r = master().find(m => m.item === c.dataset.item);
    if (!r) return;
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-ro-add')) {
      b.disabled = true;
      const SL = window.BarStockShoppingList;
      (SL ? SL.anadir({ item: r.item, qty: cuantoPedir(r), motivo: 'app', por: quien() }) : Promise.resolve({ ok: false, error: 'Not loaded.' }))
        .then(x => { if (!x.ok) { aviso('Not added: ' + (x.error || 'unknown error')); b.disabled = false; return; } return recargar(); });
    } else if (b.hasAttribute('data-ro-undo')) {
      b.disabled = true;
      const SL = window.BarStockShoppingList;
      SL.quitar(b.getAttribute('data-ro-undo'), quien())
        .then(x => { if (!x.ok) { aviso('Not removed: ' + (x.error || 'unknown error')); b.disabled = false; return; } return recargar(); });
    } else if (b.hasAttribute('data-ro-ok') || b.hasAttribute('data-ro-cambiar')) {
      teclado(r);
    }
  }

  function cerrar() {
    if (_el) _el.remove();
    _el = null;
    if (_quitarOyente) { _quitarOyente(); _quitarOyente = null; }
    const M = window.BarStockMobile;
    if (M && M.salirBanda) M.salirBanda();
  }

  async function abrir(host) {
    cerrar();
    const donde = host || document.getElementById('mScreens') || document.body;
    _el = document.createElement('div');
    _el.className = 'm-ro';
    _el.addEventListener('click', alTocar);
    donde.appendChild(_el);
    const M = window.BarStockMobile;
    if (M && M.enBanda) M.enBanda('Running out');
    if (M && M.alVolverBanda) M.alVolverBanda(cerrar);
    // Si el LIVE se rehace (una venta, una factura, una verificación),
    // las tarjetas también.
    if (LC() && LC().alCambiar) _quitarOyente = LC().alCambiar(pintar);
    _cargando = true;
    pintar();
    await cargarDatos();
    _cargando = false;
    pintar();
  }

  window.BarStockRunningOutReview = { abrir, cerrar };
})();
