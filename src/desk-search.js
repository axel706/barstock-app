(() => {
  if (window.BarStockDeskSearch) return;

  // ── "Do we have" en el escritorio (Axel, 2026-11-25, lámina A) ───────
  //
  // Un campo en la barra de arriba, justo después del saludo, en TODAS las
  // pantallas. Al escribir se abre un panel grande debajo: a la izquierda
  // las tarjetas de resultado, a la derecha la ficha del producto elegido.
  // Esc o tocar fuera lo cierra y sigues donde estabas. "/" o ⌘K / Ctrl+K
  // llevan al campo.
  //
  // Todo lo que se ve es del teléfono (mobile-search): la búsqueda
  // (`buscar`: nombre o código, primero lo que empieza por lo escrito), la
  // tarjeta (`tarjetaResultado`: el LIVE contra el par, su color, la línea
  // de la semana, ✎ Check the shelf y 📣 Tell the team it's low, con
  // `engancharResultados`) y la ficha (`llenarFicha`: zonas, precio y su
  // factura, transfers, lo vendido en Toast, las 8 semanas, Pour·IQ, Add
  // to order y Received). Aquí sólo se pone en su sitio. Los estilos de la
  // tarjeta y de la ficha salen GENERADOS de los del teléfono
  // (tools/compartir-ficha.js → styles/desk-ficha.css), colgados de
  // #dkBuscar.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MS = () => window.BarStockMobileSearch;

  let _campo = null, _panel = null, _q = '', _elegido = -1;

  function abierto() { return !!(_panel && !_panel.hidden); }

  // El panel cuelga del body, debajo de la barra de arriba y a la derecha
  // de la barra lateral (si se ve). Se mide al abrir: la barra lateral se
  // puede esconder y el header crece con la zona segura del iPad.
  function colocar() {
    if (!_panel) return;
    const h = document.querySelector('.wrap > .bs-header');
    const top = h ? Math.round(h.getBoundingClientRect().bottom) : 64;
    const lado = document.body.classList.contains('dk-sin-lado') ? 0
      : (document.getElementById('dkLado') || { getBoundingClientRect: () => ({ right: 0 }) }).getBoundingClientRect().right;
    _panel.style.setProperty('--dkb-top', top + 'px');
    _panel.style.setProperty('--dkb-izq', Math.max(0, Math.round(lado)) + 'px');
  }

  // El campo no puede pasar por debajo de la locación, que va centrada en
  // la barra con position: absolute (no ocupa sitio en la fila y el flex
  // no la esquiva): a 1440 px el campo de 340 se le metía debajo. Se mide
  // el hueco entre el saludo y la locación al montar y al cambiar el
  // tamaño, nunca al escribir.
  function ajustarAncho() {
    const cont = document.getElementById('dkBusca');
    if (!cont) return;
    // En una sección con el header estándar (desk-header.js) el campo es la
    // lupa de su hueco y se abre por encima: no hay ancho que medir.
    if (document.body.classList.contains('dk-cab')) return;
    const loc = document.querySelector('.bs-header .bs-loc-wrap');
    const medir = () => {
      const izq = cont.getBoundingClientRect().left;
      const tope = loc && loc.offsetParent ? loc.getBoundingClientRect().left - 14 : izq + 340;
      return Math.round(tope - izq);
    };
    // Sin sitio cede lo de la izquierda, con "…", hasta que el campo mide
    // 130: en el Home, el saludo (Axel,
    // 2026-11-26: más grande y sin la fecha, que era lo que cedía antes; a
    // 1180 con la barra el campo se metía bajo la locación; "Hello, Axl" a
    // 28 px cabe entero y deja 155 al campo); dentro de una
    // sección, el nombre de la ruta ("Home › Running out": "Home ›" se queda
    // entero, es el botón de volver). 130: el campo más corto que aún se lee
    // ("Do we have…"); así los nombres cortos (Pour·IQ, Costs) salen enteros
    // a 1180 con la barra.
    const nombre = document.querySelector('#dkMiga b');
    const saludo = document.querySelector('#dkSaludo b');
    [nombre, saludo].forEach(el => { if (el) el.style.maxWidth = ''; });
    let ancho = medir();
    const cede = nombre && nombre.offsetParent ? nombre : (saludo && saludo.offsetParent ? saludo : null);
    const minimo = 130;
    if (ancho < minimo && cede) {
      const w = cede.getBoundingClientRect().width;
      cede.style.maxWidth = Math.max(60, Math.floor(w - (minimo - ancho))) + 'px';
      ancho = medir();
    }
    ancho = Math.max(120, Math.min(340, ancho));
    cont.style.setProperty('--dkb-ancho', ancho + 'px');
  }

  function abrir() {
    if (!_panel) return;
    colocar();
    _panel.hidden = false;
    document.body.classList.add('dk-buscando');
  }
  function cerrar() {
    if (!_panel) return;
    _panel.hidden = true;
    document.body.classList.remove('dk-buscando');
  }

  function pintarLista() {
    const caja = _panel && _panel.querySelector('#dkbLista');
    const cnt = _panel && _panel.querySelector('#dkbCnt');
    const M = MS();
    if (!caja || !M || !M.buscar) return;
    const res = M.buscar(_q);
    if (cnt) cnt.textContent = res.length ? res.length + ' match' + (res.length === 1 ? '' : 'es') : '';
    if (!res.length) {
      caja.innerHTML = `
        <div class="m-nada">
          <span class="m-nada-i"><i class="ti ti-search-off" aria-hidden="true"></i></span>
          <b>Nothing called “${esc(_q)}”</b>
          <small>If it is on the shelf, it is not in the inventory yet.</small>
        </div>`;
      return;
    }
    caja.innerHTML = res.map(r => M.tarjetaResultado(r)).join('');
    caja.querySelectorAll('.m-res').forEach(t => {
      t.classList.toggle('dkb-elegida', Number(t.dataset.i) === _elegido);
    });
    M.engancharResultados(caja, (i) => elegir(i), () => pintarLista());
  }

  // La ficha del producto elegido, en la columna derecha.
  function elegir(i) {
    _elegido = i;
    const caja = _panel.querySelector('#dkbFicha');
    const M = MS();
    if (!caja || !M || !M.llenarFicha) return;
    caja.classList.add('m-ficha');
    M.llenarFicha(caja, i, () => elegir(i), false);
    caja.scrollTop = 0;
    _panel.querySelectorAll('#dkbLista .m-res').forEach(t => {
      t.classList.toggle('dkb-elegida', Number(t.dataset.i) === i);
    });
  }

  function vaciarFicha() {
    _elegido = -1;
    const caja = _panel && _panel.querySelector('#dkbFicha');
    if (caja) {
      caja.classList.remove('m-ficha');
      caja.innerHTML = '<p class="dkb-vacia"><i class="ti ti-hand-click" aria-hidden="true"></i>Choose a product to see its full card</p>';
    }
  }

  function alEscribir() {
    _q = _campo.value;
    const quita = document.getElementById('dkBuscaX');
    if (quita) quita.hidden = !_q;
    if (String(_q).trim().length < 2) { cerrar(); return; }
    vaciarFicha();
    // La lista de compras, para que cada tarjeta diga si ya está en ella.
    const TB = window.BarStockMobileToBuy;
    if (TB && TB.cargar && !alEscribir._tb) { alEscribir._tb = true; TB.cargar().then(() => { if (abierto()) pintarLista(); }); }
    if (window.BarStockLiveCache) window.BarStockLiveCache.cargar();
    abrir();
    pintarLista();
  }

  // "/" y ⌘K / Ctrl+K llevan al campo, salvo escribiendo en otro campo.
  function alTeclado(ev) {
    const t = ev.target;
    const escribiendo = t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
    if ((ev.key === 'k' || ev.key === 'K') && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      if (_campo) { _campo.focus(); _campo.select(); }
      return;
    }
    if (ev.key === '/' && !escribiendo && !document.querySelector('.modalbg:not(.hidden), #mSheet')) {
      ev.preventDefault();
      if (_campo) _campo.focus();
      return;
    }
    if (ev.key === 'Escape' && abierto() && !document.getElementById('mSheet')) {
      cerrar();
      if (_campo) _campo.blur();
    }
  }

  // Con el panel abierto, la página de detrás no rueda (Axel, en el iPad:
  // deslizar el dedo sobre el velo movía la pantalla de atrás; con la
  // rueda del ratón pasaba igual). Sólo la lista y la ficha ruedan, y sólo
  // si les queda recorrido en ese sentido: un gesto que no puede mover a
  // nadie de dentro se para aquí, en vez de encadenarse al documento.
  // overscroll-behavior no basta: una lista corta no rueda y el gesto
  // pasa directo a la página. Y no se fija el <html>: ese camino rompió
  // la barra de pestañas del teléfono tres veces.
  function puedeRodar(t, dy) {
    const caja = t && t.closest && t.closest('#dkbLista, #dkbFicha');
    if (!caja || !dy) return false;
    if (dy > 0) return caja.scrollTop + caja.clientHeight < caja.scrollHeight - 1;
    return caja.scrollTop > 0;
  }
  function noRodarDetras(panel) {
    panel.addEventListener('wheel', (ev) => {
      if (!puedeRodar(ev.target, ev.deltaY)) ev.preventDefault();
    }, { passive: false });
    let y0 = null;
    panel.addEventListener('touchstart', (ev) => { y0 = ev.touches[0] ? ev.touches[0].clientY : null; }, { passive: true });
    panel.addEventListener('touchmove', (ev) => {
      const y = ev.touches[0] ? ev.touches[0].clientY : null;
      if (y0 == null || y == null) { ev.preventDefault(); return; }
      // El dedo baja → el contenido sube (se rueda hacia arriba).
      if (!puedeRodar(ev.target, y0 - y)) ev.preventDefault();
      y0 = y;
    }, { passive: false });
  }

  function montar() {
    if (_campo || !document.body.classList.contains('dk')) return;
    const header = document.querySelector('.wrap > .bs-header');
    const saludo = document.getElementById('dkSaludo');
    if (!header || !saludo) return;

    const cont = document.createElement('label');
    cont.id = 'dkBusca';
    cont.className = 'dk-busca';
    cont.innerHTML = `
      <i class="ti ti-search" aria-hidden="true"></i>
      <input id="dkBuscaIn" type="search" autocomplete="off" spellcheck="false"
             placeholder="Do we have…" aria-label="Search products">
      <button type="button" id="dkBuscaX" aria-label="Clear" hidden><i class="ti ti-x" aria-hidden="true"></i></button>
`;
    saludo.insertAdjacentElement('afterend', cont);
    _campo = cont.querySelector('input');
    _campo.addEventListener('input', alEscribir);
    _campo.addEventListener('focus', () => { if (String(_q).trim().length >= 2) { abrir(); pintarLista(); } });
    _campo.addEventListener('keydown', (ev) => {
      // Enter abre la ficha del primero, como tocarlo.
      if (ev.key === 'Enter') {
        const prim = _panel && _panel.querySelector('#dkbLista .m-res');
        if (prim) elegir(Number(prim.dataset.i));
      }
    });
    cont.querySelector('#dkBuscaX').onclick = (ev) => {
      ev.preventDefault();
      _campo.value = '';
      alEscribir();
      _campo.focus();
    };

    _panel = document.createElement('div');
    _panel.id = 'dkBuscar';
    _panel.hidden = true;
    _panel.innerHTML = `
      <div class="dkb-velo"></div>
      <section class="dkb-caja" role="dialog" aria-label="Do we have">
        <div class="dkb-col">
          <div class="m-cnt" id="dkbCnt"></div>
          <div class="dkb-lista" id="dkbLista"></div>
        </div>
        <div class="dkb-ficha" id="dkbFicha" aria-live="polite"></div>
      </section>`;
    document.body.appendChild(_panel);
    _panel.querySelector('.dkb-velo').onclick = cerrar;
    noRodarDetras(_panel);
    vaciarFicha();

    document.addEventListener('keydown', alTeclado);
    window.addEventListener('resize', () => { ajustarAncho(); if (abierto()) colocar(); }, { passive: true });
    // El saludo y la locación cambian de ancho al llegar su texto, y
    // esconder la barra lateral mueve los dos: se vuelve a medir entonces.
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => requestAnimationFrame(ajustarAncho));
      // La ruta de una sección (#dkMiga, desk-shell) ocupa el sitio del
      // saludo dentro de las secciones, y cambia de ancho de una a otra.
      [saludo, header, document.querySelector('.bs-header .bs-loc-wrap'), document.getElementById('dkMiga')].forEach(e => { if (e) ro.observe(e); });
    }
    // Recortada, la ruta mide lo mismo en cada sección y el ResizeObserver
    // no se entera de que cambió el nombre: se mide también al cambiar.
    const miga = document.getElementById('dkMiga');
    if (miga) new MutationObserver(() => requestAnimationFrame(ajustarAncho)).observe(miga, { childList: true });
    ajustarAncho();
    // Ir a otra sección con el panel abierto lo cierra: lo que se busca ya
    // no está delante.
    const wrap = document.querySelector('.wrap');
    if (wrap) new MutationObserver(() => { if (abierto()) cerrar(); }).observe(wrap, { attributes: true, attributeFilter: ['class'] });
    // Llega el LIVE (o se relee por una factura o una verificación): se
    // repintan las tarjetas y, con una ficha abierta, la ficha.
    const LC = window.BarStockLiveCache;
    if (LC && LC.alCambiar) LC.alCambiar(() => {
      if (!abierto()) return;
      pintarLista();
      if (_elegido >= 0) elegir(_elegido);
    });
  }

  function arrancar(n) {
    // Va detrás del armazón (que pone .dk y el saludo).
    if (!document.getElementById('dkSaludo')) { if (n < 40) setTimeout(() => arrancar(n + 1), 50); return; }
    montar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(() => arrancar(0), 0));
  else setTimeout(() => arrancar(0), 0);

  window.BarStockDeskSearch = {
    montar, cerrar, elegir, ajustar: ajustarAncho,
    buscar: (q) => { if (_campo) { _campo.value = q; alEscribir(); } }
  };
})();
