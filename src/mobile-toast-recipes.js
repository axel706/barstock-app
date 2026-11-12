(() => {
  if (window.BarStockMobileToastRecipes) return;

  // ── Recipes · la pantalla del teléfono ───────────────────────────────
  //
  // Opción B de la lámina (Axel, 2026-11-11): una tarjeta por cóctel con
  // sus ingredientes, y la botella se elige en cada línea. Tres pestañas
  // como las separa la carta: Cocktails, Happy Hour y Mods (los
  // modificadores que convierten un licor solo en trago). La lógica es
  // la de toast-recipes.js; aquí sólo se pinta.
  //
  // Tocar una línea abre la hoja de bottle-search.js, la misma de Liquor
  // from Toast. Elegir ES guardar.
  //
  // Lo que no se puede elegir se dice y no se ofrece: el licor que pide
  // el cliente no tiene botella fija, y una receta que no está en la hoja
  // de Axel dice "Recipe missing" en rojo. Una tarjeta sin líneas que no
  // lo dijera parecería un trago que no gasta nada.
  //
  // Desde el 2026-11-12 (Axel, opción A sobre lámina), además:
  //   · Una cuarta pestaña, "From Toast", con cada trago que Toast vendió
  //     en 30 días sin receta: Write recipe, Same as… y Not a drink.
  //   · "+ New recipe" para escribir una de cero, y "Edit" en cada tarjeta.
  //     El editor es una página dentro de Recipes y no una hoja: la de
  //     elegir botella ya es una hoja, y una sobre otra no funciona bien
  //     en el teléfono.
  //   · "Not in Toast · Match": una receta que Toast no vendió con ese
  //     nombre en 30 días se empareja con el artículo que es.

  const T = () => window.BarStockToastRecipes;
  const S = () => window.BarStockBottleSearch;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const oz = (n) => (Math.round(n * 100) / 100) + ' oz';

  const PESTANAS = [['cocktails', 'Cocktails'], ['hh', 'Happy Hour'], ['mods', 'Mods'], ['toast', 'From Toast']];
  // Lo que Toast vende sin receta (toast-recipes.js, sinReceta): null
  // mientras se lee, y lo que falló si falla.
  let _sin = null, _sinError = '';
  // El editor abierto: null, o { id (null si es nueva), nombre, fijo (el
  // nombre es el de Toast y no se cambia), hh, lineas, borrar (armado) }.
  let _ed = null;
  const PASO = 0.25;
  let _tab = 'cocktails';
  let _error = '';
  let _quitar = null;
  let _host = null, _cab = null, _volver = null;

  function aviso(d) {
    if (d.estado === 'cargando') return '<div class="m-tw-aviso">Loading recipes…</div>';
    // Lo que contestó Supabase, tal cual: adivinar la causa ("corre la
    // migración") ya mandó una vez a correr una migración ya corrida.
    if (d.estado === 'error') return `<div class="m-tw-aviso mal">Couldn't load the recipes.<small>${esc(d.error)}</small></div>`;
    return '';
  }

  function linea(R, l) {
    const cond = T().condicion(l);
    const izq = `<span class="m-rc-ing">${esc(l.etiqueta)} · ${oz(l.oz)}${cond ? `<small>${esc(cond)}</small>` : ''}</span>`;
    if (l.eleccion) {
      return `<div class="m-rc-fila">${izq}<span class="m-tl-dest mut">Guest's choice</span></div>`;
    }
    const destino = l.producto ? `<span class="m-tl-dest">${esc(l.producto)}</span>`
      : '<span class="m-tl-dest vacio">Choose a bottle</span>';
    return `<button type="button" class="m-tl-fila m-rc-fila" data-l="${l.id}">${izq}${destino}<i class="ti ti-chevron-right m-tl-v" aria-hidden="true"></i></button>`;
  }

  function tarjeta(R) {
    const precio = R.precio != null ? `<span class="m-rc-precio">$${esc(R.precio)}</span>` : '';
    const cuerpo = R.pendiente
      ? `<div class="m-rc-falta">Recipe missing · ${esc(R.pendiente)}</div>`
      : R.lineas.map(l => linea(R, l)).join('');
    // "Not in Toast": Toast no la vendió con ese nombre (ni "also") en 30
    // días. Sólo cuando se sabe: sin leer las ventas no se dice que no.
    const fuera = R.tipo === 'cocktail' && T().enToast(R) === false
      ? `<div class="m-rc-fuera"><span class="m-rc-chip">Not in Toast</span> No Toast item with this name sold in 30 days ·
          <button type="button" class="m-rc-link" data-match="${R.id}">Match</button></div>` : '';
    return `<div class="m-tl-sec m-rc-card">
      <div class="m-tl-sec-h"><b>${esc(R.titulo || R.nombre)}</b><span></span>${precio}
        <button type="button" class="m-rc-link" data-ed="${R.id}">Edit</button></div>
      ${fuera}
      ${R.nota ? `<div class="m-tw-p m-rc-nota">${esc(R.nota)}</div>` : ''}
      ${cuerpo}</div>`;
  }

  function abrirHoja(id) {
    let R = null, l = null;
    for (const r of T().recetas()) for (const x of r.lineas) if (x.id === id) { R = r; l = x; }
    const d = T().datos();
    if (!R || !l || l.eleccion || !d || !d.productos) return;
    const cond = T().condicion(l);
    S().abrir({
      titulo: l.etiqueta,
      sub: R.nombre + ' · ' + oz(l.oz) + (cond ? ' · ' + cond : ''),
      productos: d.productos,
      pista: l.etiqueta,
      sugerida: l.producto ? null : T().sugerida(id),
      actual: l.producto,
      pie: l.producto ? [{ id: 'quitar', texto: 'Clear bottle' }] : [],
      alElegir: (p) => hacer(async () => { await T().elegir(id, p); aviso2('Saved: ' + l.etiqueta + ' → ' + p); })(),
      alPie: () => hacer(async () => { await T().quitar(id); aviso2(l.etiqueta + ': bottle cleared'); })()
    });
  }

  // Lo que pasó, en el header, donde se ve aunque la lista esté bajada.
  function aviso2(t) {
    if (window.BarStockToast && window.BarStockToast.show) { try { window.BarStockToast.show(t); } catch (e) {} }
  }

  function hacer(fn) {
    return async () => {
      _error = '';
      try { await fn(); }
      catch (e) {
        _error = 'Not saved: ' + String((e && e.message) || e);
        aviso2(_error);
      }
      S().cerrar();
      pintar();
    };
  }

  function pintar(host, cab, volver) {
    if (host) _host = host;
    if (cab) _cab = cab;
    if (volver) _volver = volver;
    host = _host;
    if (!host || !host.isConnected) return;
    const d = T().datos() || { estado: 'cargando' };
    if (_ed && d.estado === 'listo') return pintarEditor(host, d);
    let cuerpo = '';
    if (d.estado !== 'listo') cuerpo = aviso(d);
    else {
      const faltan = T().faltan();
      const cuenta = (k) => k === 'toast' ? (_sin ? _sin.length : '…') : T().grupo(k).length;
      const nueva = (_tab === 'cocktails' || _tab === 'hh')
        ? '<button type="button" class="m-rc-nueva" id="rcNueva"><i class="ti ti-plus" aria-hidden="true"></i> New recipe</button>' : '';
      cuerpo = `
        <div class="m-tw-p">Each drink as Toast sells it, and what it takes from the inventory.
          Tap an ingredient to choose its bottle.${faltan ? ` <b class="m-rc-cuenta">${faltan} to choose.</b>` : ''}</div>
        <div class="m-tw-tabs">${PESTANAS.map(([k, n]) =>
          `<button type="button" data-tab="${k}" class="${_tab === k ? 'on' : ''}">${n} · ${cuenta(k)}</button>`).join('')}</div>
        ${_error ? `<div class="m-tw-aviso mal">${esc(_error)}</div>` : ''}
        ${_tab === 'toast' ? pestanaToast() : nueva + (T().grupo(_tab).length ? T().grupo(_tab).map(tarjeta).join('')
          : '<div class="m-tw-p">No recipes here yet.</div>')}`;
    }
    host.innerHTML = (_cab ? _cab() : '') + '<div class="m-tw m-rc">' + cuerpo + '</div>';
    if (_volver) _volver();

    // La tira rueda (cuatro no caben): la pestaña abierta, a la vista.
    // scrollLeft y no scrollIntoView, que movería también la página.
    const tira = host.querySelector('.m-tw-tabs'), on = tira && tira.querySelector('button.on');
    if (on && on.offsetLeft + on.offsetWidth > tira.clientWidth) tira.scrollLeft = on.offsetLeft + on.offsetWidth - tira.clientWidth;
    host.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { _tab = b.dataset.tab; _error = ''; pintar(); }; });
    host.querySelectorAll('[data-l]').forEach(b => { b.onclick = () => abrirHoja(Number(b.dataset.l)); });
    host.querySelectorAll('[data-ed]').forEach(b => { b.onclick = () => editar(Number(b.dataset.ed)); });
    host.querySelectorAll('[data-match]').forEach(b => { b.onclick = () => emparejar(Number(b.dataset.match)); });
    const nb = host.querySelector('#rcNueva');
    if (nb) nb.onclick = () => { _ed = { id: null, nombre: '', fijo: false, hh: _tab === 'hh', lineas: [] }; _error = ''; pintar(); };
    host.querySelectorAll('[data-escribir]').forEach(b => { b.onclick = () => {
      const x = (_sin || [])[Number(b.dataset.escribir)];
      if (x) { _ed = { id: null, nombre: x.nombre, fijo: true, hh: /^HH\b/i.test(x.nombre), lineas: [] }; _error = ''; pintar(); }
    }; });
    host.querySelectorAll('[data-igual]').forEach(b => { b.onclick = () => igualQue((_sin || [])[Number(b.dataset.igual)]); });
    host.querySelectorAll('[data-ign]').forEach(b => { b.onclick = () => {
      const x = (_sin || [])[Number(b.dataset.ign)];
      if (x) hacer(async () => { await T().ignorar(x); aviso2(x.nombre + ': not a drink'); await leerSin(); })();
    }; });
  }

  // ── From Toast ─────────────────────────────────────────────────────
  function pestanaToast() {
    if (_sinError) return `<div class="m-tw-aviso mal">Couldn't read Toast sales.<small>${esc(_sinError)}</small></div>`;
    if (!_sin) return '<div class="m-tw-aviso">Reading Toast sales…</div>';
    if (!_sin.length) return '<div class="m-tw-p">Every drink Toast sold in the last 30 days has its recipe.</div>';
    return `<div class="m-tw-p">Sold in Toast in the last 30 days, with no recipe. Until they have one, their bottles don't come out of the live count.</div>` +
      _sin.map((x, i) => `<div class="m-tl-sec m-rc-card">
        <div class="m-tl-sec-h"><b>${esc(x.nombre)}</b></div>
        <div class="m-tw-p m-rc-nota">${esc(x.grupo || 'Toast')} · ${Math.round(x.vendidos)} sold</div>
        <div class="m-rc-btns">
          <button type="button" class="m-rc-b pr" data-escribir="${i}">Write recipe</button>
          <button type="button" class="m-rc-b" data-igual="${i}">Same as…</button>
          <button type="button" class="m-rc-b gh" data-ign="${i}">Not a drink</button>
        </div></div>`).join('');
  }

  async function leerSin() {
    try { _sin = await T().sinReceta(); _sinError = ''; }
    catch (e) { _sin = null; _sinError = String((e && e.message) || e); }
    pintar();
  }

  // "Same as…": este artículo de Toast gasta lo mismo que una receta ya
  // escrita. La hoja de elegir, con las recetas de cócteles.
  function igualQue(x) {
    if (!x) return;
    const cocteles = T().recetas().filter(R => R.tipo === 'cocktail');
    S().abrir({ titulo: x.nombre, sub: 'Same recipe as…', que: 'recipes', verTodo: true,
      productos: cocteles.map(R => R.titulo || R.nombre), pista: x.nombre,
      alElegir: (t) => {
        const R = cocteles.find(r => (r.titulo || r.nombre) === t);
        if (R) hacer(async () => { await T().igualQue(R.id, x.nombre); aviso2(x.nombre + ' → ' + t); await leerSin(); })();
      } });
  }

  // "Not in Toast · Match": la receta casa con este artículo de Toast.
  function emparejar(id) {
    const R = T().recetas().find(r => r.id === id);
    if (!R) return;
    const nombres = (_sin || []).map(x => x.nombre);
    if (!nombres.length) { aviso2('Nothing from Toast without a recipe to match.'); return; }
    const L = window.BarStockToastLinks;
    const sug = L && L.sugerir ? (L.sugerir(R.titulo || R.nombre, nombres).producto || null) : null;
    S().abrir({ titulo: R.titulo || R.nombre, sub: 'Which Toast item is this recipe?', que: 'Toast items', verTodo: true,
      productos: nombres, pista: R.titulo || R.nombre, sugerida: sug,
      alElegir: (n) => hacer(async () => { await T().emparejar(id, n); aviso2((R.titulo || R.nombre) + ' → ' + n); await leerSin(); })() });
  }

  // ── El editor ──────────────────────────────────────────────────────
  function editar(id) {
    const R = T().recetas().find(r => r.id === id);
    if (!R) return;
    _ed = { id, nombre: R.titulo || R.nombre, fijo: true, hh: R.hh,
      lineas: R.lineas.map(l => Object.assign({}, l)) };
    _error = '';
    pintar();
  }

  function pintarEditor(host, d) {
    const e = _ed;
    const elige = e.lineas.some(l => l.eleccion);
    const fila = (l, i) => `<div class="m-re-fila">
        ${l.eleccion ? `<span class="m-re-bot mut">${esc(T().ELECCION)}</span>`
          : `<button type="button" class="m-re-bot${l.producto ? '' : ' vacio'}" data-bot="${i}">${esc(l.producto || 'Choose a bottle')}</button>`}
        <span class="m-re-paso"><button type="button" data-menos="${i}" aria-label="Less">−</button><b>${oz(l.oz)}</b><button type="button" data-mas="${i}" aria-label="More">+</button></span>
        <button type="button" class="m-re-x" data-x="${i}" aria-label="Remove">×</button>
        ${T().condicion(l) ? `<small class="m-re-cond">${esc(T().condicion(l))}</small>` : ''}
      </div>`;
    host.innerHTML = (_cab ? _cab() : '') + `<div class="m-tw m-rc m-re">
      <div class="m-re-tit">${e.id ? 'Edit recipe' : 'New recipe'}</div>
      ${e.fijo ? `<div class="m-re-nom"><b>${esc(e.nombre)}</b><small>${e.id ? 'Recipe' : 'As Toast sells it'}</small></div>`
        : `<label class="m-re-lab" for="reNom">Name</label><input id="reNom" class="m-re-in" type="text" autocomplete="off" value="${esc(e.nombre)}" placeholder="As Toast sells it, if you know it">`}
      <div class="m-re-lab">Ingredients</div>
      ${e.lineas.length ? e.lineas.map(fila).join('') : '<div class="m-tw-p">No ingredients yet.</div>'}
      <button type="button" class="m-re-add" id="reAdd">+ Add ingredient</button>
      <label class="m-re-tog"><span>Happy Hour drink</span><input type="checkbox" id="reHH"${e.hh ? ' checked' : ''}></label>
      <label class="m-re-tog"><span>Customer picks the spirit</span><input type="checkbox" id="reElige"${elige ? ' checked' : ''}></label>
      ${_error ? `<div class="m-tw-aviso mal">${esc(_error)}</div>` : ''}
      <button type="button" class="m-set-save" id="reSave">Save recipe</button>
      ${e.id ? `<button type="button" class="m-re-del" id="reDel">${e.borrar ? 'Tap again to delete' : 'Delete recipe'}</button>` : ''}
      <button type="button" class="m-re-cancel" id="reCancel">Cancel</button>
    </div>`;
    // El atrás de la banda cierra el editor, no Recipes.
    if (_volver) _volver();
    const M = window.BarStockMobile;
    if (M && M.alVolverBanda) M.alVolverBanda(salirEditor);

    const nom = host.querySelector('#reNom');
    if (nom) nom.oninput = () => { e.nombre = nom.value; };
    host.querySelector('#reHH').onchange = (ev) => { e.hh = ev.target.checked; };
    host.querySelector('#reElige').onchange = (ev) => {
      if (ev.target.checked) e.lineas.push({ eleccion: true, oz: 1.5 });
      else e.lineas = e.lineas.filter(l => !l.eleccion);
      pintar();
    };
    host.querySelectorAll('[data-menos]').forEach(b => { b.onclick = () => {
      const l = e.lineas[Number(b.dataset.menos)]; l.oz = Math.max(PASO, Math.round((l.oz - PASO) * 100) / 100); pintar(); }; });
    host.querySelectorAll('[data-mas]').forEach(b => { b.onclick = () => {
      const l = e.lineas[Number(b.dataset.mas)]; l.oz = Math.round((l.oz + PASO) * 100) / 100; pintar(); }; });
    host.querySelectorAll('[data-x]').forEach(b => { b.onclick = () => { e.lineas.splice(Number(b.dataset.x), 1); pintar(); }; });
    const elegirBotella = (titulo, actual, fn) => S().abrir({ titulo, sub: e.nombre || 'New recipe', productos: d.productos,
      pista: actual || '', actual, alElegir: (p) => { fn(p); S().cerrar(); pintar(); } });
    host.querySelectorAll('[data-bot]').forEach(b => { b.onclick = () => {
      const l = e.lineas[Number(b.dataset.bot)];
      elegirBotella(l.producto || 'Ingredient', l.producto, (p) => { l.producto = p; });
    }; });
    host.querySelector('#reAdd').onclick = () => elegirBotella('Add ingredient', null, (p) => { e.lineas.splice(e.lineas.filter(l => !l.eleccion).length, 0, { producto: p, oz: 1 }); });
    host.querySelector('#reCancel').onclick = salirEditor;
    host.querySelector('#reSave').onclick = () => guardarEditor();
    const del = host.querySelector('#reDel');
    if (del) del.onclick = () => {
      if (!e.borrar) { e.borrar = true; pintar(); return; }
      hacerEditor(async () => { await T().borrar(e.id); aviso2('Deleted: ' + e.nombre); });
    };
  }

  function salirEditor() { _ed = null; _error = ''; pintar(); }

  function guardarEditor() {
    const e = _ed;
    hacerEditor(async () => {
      if (e.id) await T().guardarReceta(e.id, { hh: e.hh, lineas: e.lineas });
      else await T().crear({ nombre: e.nombre, hh: e.hh, lineas: e.lineas });
      aviso2('Saved: ' + (e.nombre || '').trim());
      await leerSin();
    });
  }

  // Como hacer(), pero el editor sólo se cierra si se guardó: un fallo se
  // dice dentro y lo escrito se queda.
  async function hacerEditor(fn) {
    _error = '';
    try { await fn(); _ed = null; }
    catch (err) { _error = 'Not saved: ' + String((err && err.message) || err); }
    pintar();
  }

  function montar(host, cab, volver) {
    if (!T()) return;
    _host = host;
    _tab = 'cocktails';
    _error = '';
    // Sólo repinta si esta vista sigue puesta: al salir a otro panel de
    // Settings el host es el mismo, y repintar ahí pisaría ese panel.
    if (!_quitar) _quitar = T().alCambiar(() => { if (_host && _host.querySelector('.m-rc')) pintar(); });
    _ed = null;
    _sin = null; _sinError = '';
    pintar(host, cab, volver);
    // Las ventas sin receta, después de las recetas: necesita saber cuáles
    // hay para no ofrecerlas.
    T().cargar().then(leerSin);
  }

  window.BarStockMobileToastRecipes = { montar, pintar };
})();
