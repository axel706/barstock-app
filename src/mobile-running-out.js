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

  let _el = null, _quitarOyente = null, _quitarIrse = null;
  let _lista = [], _checks = new Map(), _cargando = false;
  let _editando = false;   // "Edit order" (lámina B)
  // En el escritorio (desk-running-out.js, Axel, 2026-11-25, lámina A) la
  // misma pantalla vive dentro de su sección: sin la banda ni las
  // pestañas del teléfono, con la silueta de cada producto delante (allí
  // hay sitio) y rodando con la página, no con su propio scroll.
  let _escritorio = false;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n1 = (x) => (Math.round((Number(x) || 0) * 10) / 10).toFixed(1);
  const G = () => window.BarStockGuest;
  const puede = (k) => { const g = G(); return !g || !g.puede || g.puede(k); };
  const quien = () => { const g = G(); return (g && g.nombre && g.nombre()) || ''; };
  const aviso = (t) => { const T = window.BarStockToast; if (T && T.show) try { T.show(t); } catch (e) {} };
  const LC = () => window.BarStockLiveCache;
  const master = () => (window.state && window.state.master) || [];
  const RO = () => window.BarStockRunningOut;

  // "Wed 3:12 PM", en Nueva York.
  const cuandoNY = (iso) => {
    const t = new Date(iso);
    if (isNaN(t.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short',
      hour: 'numeric', minute: '2-digit' }).format(t).replace(',', '');
  };

  async function cargarDatos() {
    const SL = window.BarStockShoppingList, SC = window.BarStockStockChecks;
    // Sólo lo pendiente: lo pedido que ya llegó no puede seguir "On the
    // list" (shopping-list.vigentes, la regla de To buy).
    try { _lista = SL ? SL.vigentes(await SL.leer()) : []; }
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

  // El "Order N" vive en shopping-list.js: "Running low" pide el mismo.
  const cuantoPedir = (r) => window.BarStockShoppingList.sugerido(r);

  // ── El por qué (Axel, 2026-11-18, lámina E) ──────────────────────────
  //
  // Bajo el nombre, lo que quedará al final de cada día (hoy en ámbar, el
  // día que llega a 0 en rojo, una entrega ya pedida en azul con su
  // "+N", un día cerrado apagado), y debajo la frase en una franja
  // ámbar. Las dos salen de run-out (recorridoDe, porQue) sobre la fila
  // de live-cache: la misma cuenta que el "Out" de la tarjeta. Sin fila
  // con demanda (lo que Toast no vende), no sale nada: no se sabe nada
  // día por día, y unas barras inventadas serían una afordancia que
  // miente.
  const D3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const ICONO = { hoy: '&#9889;', sube: '&#8599;', normal: '&#9679;' };
  function porQueHtml(r) {
    const R = window.BarStockRunOut;
    const f = LC() && LC().fila ? LC().fila(r) : null;
    if (!R || !R.porQue || !R.recorridoDe || !f) return '';
    const pq = R.porQue(f), rec = R.recorridoDe(f);
    if (!pq || !rec || !rec.dias.length) return '';
    const max = Math.max(1, ...rec.dias.map(d => d.seguro));
    let cero = false;
    const dias = rec.dias.map((d, i) => {
      const nombre = i === 0 ? 'Today' : D3[new Date(d.dia + 'T12:00:00Z').getUTCDay()];
      const vacio = d.seguro <= 0;
      // Después de un 0, lo que sigue en 0 va apagado y sin número:
      // repetir "0" no dice nada nuevo. Si una entrega lo levanta y se
      // vuelve a acabar (el Nino: hoy, y otra vez el sábado tras la del
      // jueves), ese nuevo 0 sí va en rojo.
      if (vacio && cero) return `<div class="m-ro-dia nada"><div class="m-ro-barra"></div><b>${nombre}</b></div>`;
      cero = vacio;
      const cls = [i === 0 ? 'hoy' : '', vacio ? 'cero' : '', d.llega > 0 ? 'llega' : '', d.cerrado && i > 0 ? 'cerrado' : ''].filter(Boolean).join(' ');
      const alto = vacio ? 6 : Math.round(10 + 45 * d.seguro / max);
      return `<div class="m-ro-dia ${cls}"><div class="m-ro-barra"><em>${vacio ? '0' : esc(n1(d.seguro))}</em>${
        d.llega > 0 ? `<small>+${esc(n1(d.llega).replace(/\.0$/, ''))}</small>` : ''}<span style="height:${alto}%"></span></div><b>${nombre}</b></div>`;
    }).join('');
    return `<div class="m-ro-dias">${dias}</div>
      <div class="m-ro-why"><i>${ICONO[pq.tipo] || ICONO.normal}</i><span>${esc(pq.texto)}</span></div>`;
  }

  // La silueta del conteo, llena contra su par: sólo en el escritorio.
  // Es la de home-cartas (la misma del Home y del carrusel del teléfono).
  let _nSil = 0;
  function silueta(r, queda) {
    if (!_escritorio) return '';
    const HC = window.BarStockHomeCartas, BP = window.BarStockBottleProfiles;
    if (!HC || !HC.silueta || !BP || !BP.formaDe) return '';
    const par = Number(r.suggested) || 0;
    const lleno = par > 0 ? Math.max(0, Math.min(1, queda / par)) : 0;
    const tono = queda <= 0 ? 'cero' : lleno < 1 / 3 ? 'bajo' : 'medio';
    return `<div class="m-ro-sil m-ro-sil-${tono}">${HC.silueta(BP.formaDe(r), lleno, 'mRoS' + (_nSil++))}</div>`;
  }

  // Junto al número, su par ("≈1.6/2"): sólo en el escritorio, que tiene
  // sitio (la lámina A); en el teléfono el número va solo, como siempre.
  const par = (r) => _escritorio && Number(r.suggested) > 0
    ? `<small class="m-ro-par">/${esc(String(Math.round(Number(r.suggested) * 10) / 10))}</small>` : '';

  function tarjeta(x) {
    const r = x.r;
    const queda = LC() && LC().cuanto ? LC().cuanto(r) : Number(r.onHand) || 0;
    const vivo = !!(LC() && LC().vivo && LC().vivo(r));
    const pedir = cuantoPedir(r);
    const enLista = _lista.find(l => l.item_name === r.item);
    const visto = _checks.get(r.item);
    const out = x.out && x.out.txt ? `<span class="m-ro-out ${x.out.tono === 'r' ? 'r' : 'a'}">${esc(x.out.txt)}</span>` : '';
    const estados = [];
    // Pedido y aún sin llegar: "Ordered", sin Undo. Quitar de la lista
    // algo que ya salió en una orden no deshace la orden: un Undo ahí
    // sería un botón que miente.
    const pedido = !!enLista && enLista.status === 'ordered';
    if (enLista) estados.push(`<div class="m-ro-hecho m-ro-lista">
        <span>&#10003; ${pedido ? 'Ordered' : 'On the list'} &middot; ${esc(n1(enLista.qty).replace(/\.0$/, ''))}${enLista.added_by ? ' by ' + esc(enLista.added_by) : ''}</span>
        ${!pedido && puede('ordenes') ? `<button type="button" class="m-ro-x" data-ro-undo="${esc(enLista.id)}">Undo</button>` : ''}</div>`);
    if (visto) estados.push(`<div class="m-ro-hecho m-ro-visto">
        <span>&#10003; Checked: ${esc(n1(visto.counted).replace(/\.0$/, ''))} on the shelf &middot; ${esc(cuandoNY(visto.checked_at))}${visto.checked_by ? ' &middot; ' + esc(visto.checked_by) : ''}</span>
        ${puede('contar') ? '<button type="button" class="m-ro-x" data-ro-cambiar>Change</button>' : ''}</div>`);
    const botones = [];
    // 0 es una respuesta (2026-11-18): lo que ya viene en camino le alcanza
    // hasta el domingo. Ni "Order 0" ni "Add 0 to list".
    if (!enLista && puede('ordenes') && pedir > 0) botones.push(`<button type="button" class="m-ro-b m-ro-go" data-ro-add>Add ${esc(pedir)} to list</button>`);
    if (!visto && puede('contar')) botones.push('<button type="button" class="m-ro-b m-ro-gh" data-ro-ok>I have enough</button>');
    return `<div class="m-ro-c" data-item="${esc(r.item)}">
      ${silueta(r, queda)}
      <div class="m-ro-top">
        <div class="m-ro-n"><b>${esc(r.item)}</b>
          <small>${vivo ? '<span class="m-ro-live"><i></i>Live</span>' : ''}${out}<span>${esc(r.vendor || '')}</span></small></div>
        <div class="m-ro-v"><b>${vivo ? '&asymp;' : ''}${esc(n1(queda))}${par(r)}</b><small>${pedir > 0 ? 'Order ' + esc(pedir) : 'Covered to Sun'}</small></div>
      </div>
      ${porQueHtml(r)}
      ${botones.length ? `<div class="m-ro-btns">${botones.join('')}</div>` : ''}
      ${estados.join('')}
    </div>`;
  }

  function pintar() {
    if (!_el) return;
    _nSil = 0;
    if (_editando) return pintarOrden();
    const { base, todos } = productos();
    const nLista = todos.filter(x => _lista.some(l => l.item_name === x.item)).length;
    const nVisto = todos.filter(x => _checks.has(x.item)).length;
    const partes = [base.length + (base.length === 1 ? ' runs' : ' run') + ' out this week'];
    if (nLista) partes.push(nLista + ' on the list');
    if (nVisto) partes.push(nVisto + ' checked');
    // Con algo fijado, los dos títulos dicen por qué ese orden: lo tuyo
    // arriba y lo demás por la fecha en que se acaba.
    const nFij = base.filter(x => x.fijado).length;
    const cuerpo = todos.map((x, i) =>
      (nFij && i === 0 ? `<div class="m-ro-k">Pinned &middot; ${nFij}</div>` : '') +
      (nFij && i === nFij && i < base.length ? '<div class="m-ro-k">By date</div>' : '') +
      tarjeta(x)).join('');
    const sumf = `<div class="m-ro-sumf"><div class="m-ro-sum">${partes.map(esc).join(' &middot; ')}</div>${
        base.length > 1 ? '<button type="button" class="m-ro-ord" data-ro-edit>Edit order</button>' : ''}</div>`;
    // En el escritorio, el resumen y "Edit order" van con los títulos de
    // las columnas en un bloque que se queda pegado bajo la barra de arriba
    // al bajar (la forma de las secciones, el estándar de CLAUDE.md).
    _el.innerHTML = `
      ${_escritorio ? `<div class="m-ro-pega">${sumf}${todos.length ? `<div class="m-ro-cols" aria-hidden="true">
        <span>Product</span><span>Left</span><span>Next 5 days</span><span>Why · what to do</span></div>` : ''}</div>` : sumf}
      ${_cargando && !todos.length ? '<div class="m-ro-vacio">Loading…</div>' : ''}
      ${!_cargando && !todos.length ? '<div class="m-ro-vacio">Nothing runs out this week.</div>' : ''}
      ${cuerpo}`;
  }

  // ── "Edit order" (Axel, 2026-11-15, lámina B) ───────────────────────
  //
  // Las tarjetas sin botones, con su asa (≡). Arrastrar una por encima de
  // "By date" la fija, en ese sitio; por debajo, la suelta. Lo de debajo
  // va siempre en el orden de la app. "Reset" suelta todo; "Done" sale.
  // Lo guarda running-out.js en este teléfono (fijar).
  function compacta(x) {
    const r = x.r;
    const queda = LC() && LC().cuanto ? LC().cuanto(r) : Number(r.onHand) || 0;
    const vivo = !!(LC() && LC().vivo && LC().vivo(r));
    const out = x.out && x.out.txt ? `<span class="m-ro-out ${x.out.tono === 'r' ? 'r' : 'a'}">${esc(x.out.txt)}</span>` : '';
    return `<div class="m-ro-c m-ro-ed" data-item="${esc(r.item)}">
      <div class="m-ro-top">
        <span class="m-ro-grip" data-ro-grip role="button" aria-label="Drag ${esc(r.item)}">&#8801;</span>
        ${silueta(r, queda)}
        <div class="m-ro-n"><b>${esc(r.item)}</b>
          <small>${vivo ? '<span class="m-ro-live"><i></i>Live</span>' : ''}${out}<span>${esc(r.vendor || '')}</span></small></div>
        <div class="m-ro-v"><b>${vivo ? '&asymp;' : ''}${esc(n1(queda))}</b></div>
      </div>
    </div>`;
  }

  function pintarOrden() {
    const R = RO();
    const base = R && R.lista ? R.lista() : [];
    const arriba = base.filter(x => x.fijado);
    const fij = new Set(arriba.map(x => x.item));
    const abajo = (R && R.lista ? R.lista({ porFecha: true }) : base).filter(x => !fij.has(x.item));
    const sumf = `<div class="m-ro-sumf"><div class="m-ro-sum">Drag to put yours first</div>${
        arriba.length ? '<button type="button" class="m-ro-ord" data-ro-reset>Reset</button>' : ''}</div>`;
    _el.innerHTML = `
      ${_escritorio ? `<div class="m-ro-pega">${sumf}</div>` : sumf}
      <div class="m-ro-orden">
        <div class="m-ro-k" data-ro-k="pin">Pinned &middot; ${arriba.length ? arriba.length : 'drag here'}</div>
        ${arriba.map(compacta).join('')}
        <div class="m-ro-k" data-ro-k="fecha">By date</div>
        ${abajo.map(compacta).join('')}
      </div>
      <button type="button" class="m-ro-b m-ro-go m-ro-done" id="mRoDone" data-ro-done>Done</button>`;
  }

  // Lo fijado sale del orden en pantalla: todo lo que quede entre los dos
  // títulos. Lo fijado que ahora no se acaba (no está en pantalla) se
  // conserva detrás, para cuando vuelva.
  function guardarOrden(cont) {
    const R = RO();
    if (!R || !R.fijar) return;
    const nuevos = [];
    for (const el of Array.from(cont.children)) {
      if (el.getAttribute('data-ro-k') === 'fecha') break;
      if (el.dataset && el.dataset.item) nuevos.push(el.dataset.item);
    }
    const enPantalla = new Set(Array.from(cont.querySelectorAll('[data-item]')).map(e => e.dataset.item));
    const fuera = (R.fijados ? R.fijados() : []).filter(n => !enPantalla.has(n));
    R.fijar(nuevos.concat(fuera));
  }

  // ── Arrastrar, con el dedo ───────────────────────────────────────────
  //
  // Pointer events sobre el asa (touch-action: none en el CSS, para que
  // el navegador no lo tome por un scroll). La tarjeta se mueve EN el
  // DOM al pasar la mitad de su vecina, y un translate la deja bajo el
  // dedo. Cerca de los bordes, la pantalla rueda sola.
  let _arr = null;
  function empezar(ev, card) {
    if (ev.cancelable) ev.preventDefault();
    const r0 = card.getBoundingClientRect();
    _arr = { card, cont: card.parentElement, agarre: ev.clientY - r0.top };
    card.classList.add('m-ro-arrastra');
    window.addEventListener('pointermove', mover, { passive: false });
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }
  function mover(ev) {
    if (!_arr) return;
    if (ev.cancelable) ev.preventDefault();
    const { card, cont } = _arr;
    const y = ev.clientY;
    const prev = card.previousElementSibling;
    // Nunca por encima del primer título ("Pinned").
    if (prev && prev !== cont.firstElementChild) {
      const b = prev.getBoundingClientRect();
      if (y < b.top + b.height / 2) cont.insertBefore(card, prev);
    }
    const next = card.nextElementSibling;
    if (next) {
      const b = next.getBoundingClientRect();
      if (y > b.top + b.height / 2) cont.insertBefore(card, next.nextSibling);
    }
    card.style.transform = '';
    const nat = card.getBoundingClientRect().top;
    card.style.transform = 'translateY(' + Math.round(y - _arr.agarre - nat) + 'px)';
    // En el teléfono rueda la pantalla; en el escritorio, la página.
    const caja = _escritorio ? (document.scrollingElement || document.documentElement) : _el;
    if (caja) {
      if (y < 150) caja.scrollTop -= 10;
      else if (y > (window.innerHeight || 800) - 170) caja.scrollTop += 10;
    }
  }
  function soltar() {
    if (!_arr) return;
    const { card, cont } = _arr;
    _arr = null;
    window.removeEventListener('pointermove', mover);
    window.removeEventListener('pointerup', soltar);
    window.removeEventListener('pointercancel', soltar);
    card.style.transform = '';
    card.classList.remove('m-ro-arrastra');
    guardarOrden(cont);
    pintar();
  }

  async function recargar() {
    await cargarDatos();
    pintar();
  }

  // ── El número: "I have enough" ──────────────────────────────────────
  //
  // El teclado vive en num-pad.js: lo usan también la lista de compras y
  // "Running low"; el de "cuántas hay", en check-shelf.js.
  function teclado(r) {
    // El teclado y el guardado son los de check-shelf.js: el mismo que
    // abre el lápiz de cualquier producto. Aquí sólo se apunta en la
    // tarjeta sin esperar a releer.
    window.BarStockCheckShelf.abrir(r, {
      alGuardar: (n, queda) => {
        _checks.set(r.item, { item_name: r.item, counted: n, live_said: queda, checked_by: quien(), checked_at: new Date().toISOString() });
        pintar();
      }
    });
  }

  function alTocar(ev) {
    const bo = ev.target.closest && ev.target.closest('button');
    if (bo && bo.hasAttribute('data-ro-edit')) { _editando = true; pintar(); if (_el && !_escritorio) _el.scrollTop = 0; return; }
    if (bo && bo.hasAttribute('data-ro-done')) { _editando = false; pintar(); return; }
    if (bo && bo.hasAttribute('data-ro-reset')) { const R = RO(); if (R && R.fijar) R.fijar([]); pintar(); return; }
    if (_editando) return;
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
    _editando = false;
    if (_arr) soltar();
    if (_el) _el.remove();
    _el = null;
    if (_quitarOyente) { _quitarOyente(); _quitarOyente = null; }
    if (_quitarIrse) { _quitarIrse(); _quitarIrse = null; }
    if (_escritorio) { _escritorio = false; return; }
    const M = window.BarStockMobile;
    if (M && M.salirBanda) M.salirBanda();
    // La barra vuelve a marcar la pantalla de debajo.
    if (M && M.sinPestana) M.sinPestana(false);
  }

  async function abrir(host, opts) {
    cerrar();
    _escritorio = !!(opts && opts.escritorio);
    const donde = host || document.getElementById('mScreens') || document.body;
    _el = document.createElement('div');
    _el.className = _escritorio ? 'm-ro-dk' : 'm-ro';
    _el.addEventListener('click', alTocar);
    _el.addEventListener('pointerdown', (ev) => {
      const g = _editando && ev.target.closest && ev.target.closest('[data-ro-grip]');
      if (g) empezar(ev, g.closest('.m-ro-c'));
    });
    donde.appendChild(_el);
    if (_escritorio) {
      if (LC() && LC().alCambiar) _quitarOyente = LC().alCambiar(pintar);
      _cargando = true;
      pintar();
      await cargarDatos();
      _cargando = false;
      pintar();
      return;
    }
    // Sin fondo propio: mientras esté en #mScreens, lo de debajo se
    // esconde (la regla de :has en mobile-app.css) y se ve el fondo de la
    // app (Axel, 2026-11-15: "tiene fondo opaco, no usa el fondo").
    const M = window.BarStockMobile;
    if (M && M.enBanda) M.enBanda('Running out');
    if (M && M.alVolverBanda) M.alVolverBanda(cerrar);
    // Cualquier pestaña la cierra y lleva a la suya (Axel, 2026-11-15):
    // va fija encima de todo y ir() no la ve.
    if (M && M.alIrse) _quitarIrse = M.alIrse(cerrar);
    // No es de ninguna pestaña: ninguna encendida mientras esté abierta
    // (Axel, 2026-11-15: "Home resaltado, dando a entender que estamos
    // en Home cuando no es así").
    if (M && M.sinPestana) M.sinPestana(true);
    // Si el LIVE se rehace (una venta, una factura, una verificación),
    // las tarjetas también.
    if (LC() && LC().alCambiar) _quitarOyente = LC().alCambiar(pintar);
    _cargando = true;
    pintar();
    await cargarDatos();
    _cargando = false;
    pintar();
  }

  window.BarStockRunningOutReview = { abrir, cerrar, abierta: () => !!_el };
})();
