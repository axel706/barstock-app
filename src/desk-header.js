(() => {
  if (window.BarStockDeskHeader) return;

  // ── El header de las secciones del escritorio (Axel, 2026-11-26) ─────
  //
  // Lámina "Section header · fixed places": "que sí es dinámico, pero a la
  // vez es fijo […] un layout estándar que se va a replicar en otras
  // secciones […] los controles siempre en las mismas posiciones".
  //
  // El Home no cambia. Dentro de una sección que se registra aquí, el
  // header deja el saludo, la locación y los botones de la app, y pinta
  // cinco sitios, siempre en este orden y del mismo tamaño:
  //
  //   1 la barra lateral (#dkMenu, el de siempre, en su sitio)
  //   2 el título, grande (‹ y clic: al Home)
  //   3 las vistas, CENTRADAS (columna propia de una rejilla 1fr auto 1fr:
  //     ni un título largo ni un botón abierto las mueven)
  //   4 afinar: tres huecos redondos (filtro, proveedor, orden…)
  //   5 acciones: dos huecos (la de la sección en azul, crear en verde),
  //     y después Do we have (la lupa) y ⋯
  //
  // Un sitio que la sección no usa queda VACÍO y del mismo tamaño: la
  // siguiente sección no se corre. Los botones redondos se abren con su
  // nombre al pasar el ratón, hacia la izquierda y POR ENCIMA de los de al
  // lado (cada uno vive en un hueco fijo de 38 px y se dibuja encima):
  // nada se mueve. Lo que está en uso (un proveedor, un filtro) se pone
  // azul con un punto; no se queda abierto, porque abierto no cabía y
  // empujaba las vistas (se dibujó así primero en la lámina).
  //
  // ⋯ junta lo de la sección (arriba) y lo de la app (Import, Export, los
  // datos, el tema, Settings, Logout). Lo de la app NO se copia: cada
  // renglón le hace clic al botón de siempre, que sigue en el DOM aunque
  // escondido; los que abren un archivo, a su <input>.
  //
  // Una sección lo usa con registrar(sec, spec) y llama a refrescar() al
  // pintarse. spec: { titulo, vistas(), afinar() [3], acciones() [2],
  // extras() [{icon,label,fn}], alClic(ev), alEscribir(ev) }. Lo de dentro
  // de los huecos lo dibuja boton() / campo() / vacio(), de aquí.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const _specs = {};
  let _cab = null, _sec = null, _pop = null, _buscaCasa = null;

  // ── Las piezas de los huecos ──
  // `o`: { acc, icon, label, tono: 'azul'|'verde', en (en uso), valor (lo
  // que dice al abrirse si está en uso), apagado }.
  function boton(o) {
    const txt = o.en && o.valor ? o.valor : o.label;
    // La acción va en el HUECO (que es lo que recibe el ratón: el botón
    // abierto no, ver desk-header.css) y en el botón (el teclado).
    const dis = o.apagado ? ' aria-disabled="true"' : '';
    // Sin `title`: el navegador dibujaba su etiqueta gris repitiendo el
    // nombre que el botón ya enseña al abrirse (Axel, en sus capturas).
    return `<span class="dkc-hueco" data-dkc="${esc(o.acc)}"${dis}><button type="button" class="dkc-pl${o.tono ? ' ' + o.tono : ''}${o.en ? ' en' : ''}${o.apagado ? ' apagado' : ''}"
      data-dkc="${esc(o.acc)}" aria-label="${esc(txt)}"${dis}><i class="ti ${esc(o.icon)}" aria-hidden="true"></i><b>${esc(txt)}</b></button></span>`;
  }
  // Un campo que es un botón redondo hasta que se toca (el filtro de la
  // lista). `o`: { id, icon, placeholder, value }.
  function campo(o) {
    const lleno = String(o.value || '').trim() !== '';
    return `<span class="dkc-hueco" data-dkc="campo"><label class="dkc-pl dkc-campo${lleno ? ' en' : ''}">
      <i class="ti ${esc(o.icon || 'ti-filter')}" aria-hidden="true"></i><input id="${esc(o.id)}" type="search" autocomplete="off" spellcheck="false"
      placeholder="${esc(o.placeholder || 'Filter')}" aria-label="${esc(o.placeholder || 'Filter')}" value="${esc(o.value || '')}"></label></span>`;
  }
  const vacio = () => '<span class="dkc-hueco dkc-vacio" aria-hidden="true"></span>';

  // ── El menú que cuelga de un botón (proveedor, orden, ⋯) ──
  // items: [{ h } | { sep } | { icon, label, fn, on, peligro }]
  function menu(ancla, items) {
    cerrarMenu();
    _pop = document.createElement('div');
    _pop.id = 'dkcPop';
    _pop.setAttribute('role', 'menu');
    _pop.innerHTML = items.map((it, k) => it.h ? `<div class="dkc-mh">${esc(it.h)}</div>`
      : it.sep ? '<div class="dkc-msep"></div>'
      : `<button type="button" role="menuitem" class="dkc-mi${it.on ? ' on' : ''}${it.peligro ? ' rd' : ''}" data-k="${k}"><i class="ti ${esc(it.icon || 'ti-point')}" aria-hidden="true"></i><span>${esc(it.label)}</span>${it.on ? '<i class="ti ti-check dkc-ok" aria-hidden="true"></i>' : ''}</button>`).join('');
    document.body.appendChild(_pop);
    const r = ancla.getBoundingClientRect();
    // Hacia abajo, salvo que no quepa y arriba haya más sitio: el ⋯ de una
    // orden de Sent va en el pie, abajo del todo, y el menú se abría fuera
    // de la pantalla (Axel, en el iPad).
    const abajo = window.innerHeight - r.bottom - 20, arriba = r.top - 20;
    const alto = _pop.scrollHeight;
    if (alto > abajo && arriba > abajo) {
      _pop.style.bottom = Math.round(window.innerHeight - r.top + 8) + 'px';
      _pop.style.maxHeight = Math.max(200, Math.round(arriba)) + 'px';
      _pop.classList.add('arriba');
    } else {
      _pop.style.top = Math.round(r.bottom + 8) + 'px';
      // Todo el alto que queda: con un tope fijo, ⋯ cortaba "App" y el
      // tema, Settings y Logout quedaban escondidos bajo un scroll.
      _pop.style.maxHeight = Math.max(200, Math.round(abajo)) + 'px';
    }
    _pop.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
    // Abierto se marca en el botón (lo que se dibuja), y el menú cuelga del
    // hueco (lo que recibe el ratón).
    const dib = ancla.querySelector('.dkc-pl') || ancla;
    dib.classList.add('abierto');
    empujar();
    _pop._ancla = ancla;
    _pop._dib = dib;
    _pop.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-k]');
      if (!b) return;
      const it = items[Number(b.dataset.k)];
      cerrarMenu();
      if (it && it.fn) it.fn();
    });
    setTimeout(() => document.addEventListener('pointerdown', fueraDelMenu, true), 0);
  }
  function fueraDelMenu(ev) {
    if (_pop && !_pop.contains(ev.target) && !(_pop._ancla && _pop._ancla.contains(ev.target))) cerrarMenu();
  }
  function cerrarMenu() {
    document.removeEventListener('pointerdown', fueraDelMenu, true);
    if (!_pop) return false;
    if (_pop._dib) _pop._dib.classList.remove('abierto');
    requestAnimationFrame(empujar);
    _pop.remove();
    _pop = null;
    return true;
  }

  // ── Lo de la app, en ⋯ ──
  // Cada renglón es el botón de siempre: se lee del menú escondido cada vez
  // que se abre (un renglón puede estar escondido, como Restore backup).
  function deLaApp() {
    const grupo = (sel, h) => {
      const els = [...document.querySelectorAll(sel)].filter(e => e.style.display !== 'none');
      if (!els.length) return [];
      return [{ h }].concat(els.map(e => {
        const i = e.querySelector('i.ti');
        const icon = i ? [...i.classList].find(c => /^ti-/.test(c)) : 'ti-point';
        const inp = e.querySelector('input[type="file"]');
        return { icon, label: e.textContent.replace(/\s+/g, ' ').trim(), peligro: e.classList.contains('bs-dd-danger'), fn: () => (inp || e).click() };
      }));
    };
    const claro = document.body.classList.contains('light');
    const tema = document.getElementById('themeToggle');
    const salir = document.getElementById('authLogoutBtn');
    return [].concat(
      grupo('#importMenu .bs-dd-item', 'Import'),
      grupo('#exportMenu .bs-dd-item', 'Export'),
      grupo('#bsMoreMenu .bs-dd-item', 'Data'),
      [{ h: 'App' }],
      tema ? [{ icon: claro ? 'ti-moon' : 'ti-sun', label: claro ? 'Dark mode' : 'Light mode', fn: () => tema.click() }] : [],
      typeof window.openSettingsModal === 'function' ? [{ icon: 'ti-settings', label: 'Settings', fn: () => window.openSettingsModal() }] : [],
      salir && salir.style.display !== 'none' ? [{ icon: 'ti-logout', label: 'Logout', fn: () => salir.click() }] : []
    );
  }

  // ── Do we have: el mismo campo, movido a su hueco ──
  // Es el elemento de desk-search (sus eventos van con él). Dentro de una
  // sección vive en el sitio 5 como lupa; al volver al Home, a su sitio.
  function moverBusca(dentro) {
    const b = document.getElementById('dkBusca');
    if (!b || !_cab) return;
    const hueco = _cab.querySelector('.dkc-busca');
    if (dentro) {
      if (!hueco || b.parentElement === hueco) return;
      if (!_buscaCasa) _buscaCasa = { padre: b.parentElement, antes: b.nextSibling };
      hueco.appendChild(b);
    } else if (_buscaCasa && b.parentElement !== _buscaCasa.padre) {
      _buscaCasa.padre.insertBefore(b, _buscaCasa.antes && _buscaCasa.antes.parentElement === _buscaCasa.padre ? _buscaCasa.antes : null);
      const S = window.BarStockDeskSearch;
      if (S && S.ajustar) S.ajustar();
    }
  }

  // ── Hacer sitio (lámina "no overlapping", A: "los de al lado se
  // apartan") ──
  // Un botón abierto crece de verdad y aparta a los de su izquierda hacia
  // el sitio libre entre las vistas y los botones. Ese sitio era de 59 px
  // a 1440 con la barra lateral, y "Add item" o "Sort: Money on the
  // shelf" no cabían: cuando no alcanza, las VISTAS también se apartan,
  // sólo lo que falta, hacia lo que sobra junto al título, y vuelven al
  // cerrarse (--dkc-empuje). Lo caro (los anchos) se mide al pintar y al
  // cambiar de tamaño, con todo cerrado; al pasar el ratón sólo se resta
  // (como band-dock: medir no es animar).
  // El título como lo da la sección (texto, o piezas con enlaces) y como
  // texto plano: el encabezado del menú ⋯ lo escapaba tal cual y, con un
  // título en función, enseñaba el código de la función.
  const tituloDe = (sp) => (typeof sp.titulo === 'function' ? sp.titulo() : sp.titulo) || '';
  function tituloTexto(sp) {
    const tt = tituloDe(sp);
    return Array.isArray(tt) ? tt.map((p) => (p && typeof p === 'object' ? p.t : p)).join(' › ') : tt;
  }
  let _holgura = { der: 0, izq: 0 }, _margen = 0;
  function medir() {
    if (!_cab || !document.body.classList.contains('dk-cab')) return;
    if (_cab.querySelector('.dkc-pl.abierto, .dkc-pl.toque, .dkc-hueco:hover') || (_cab.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) return;
    const cen = _cab.querySelector('.dkc-centro');
    const seg = cen && cen.firstElementChild;
    const prim = _cab.querySelector('.dkc-der > *');
    const tit = _cab.querySelector('.dkc-titulo');
    if (!cen || !prim) return;
    _cab.style.setProperty('--dkc-empuje', '0px');
    // Con poco ancho las vistas van en una columna que encoge cuando los
    // botones crecen: centradas con justify-content se irían moviendo; se
    // centran con un margen medido aquí.
    if (seg) seg.style.marginLeft = '0px';
    const rc = cen.getBoundingClientRect();
    const ancho = seg ? seg.getBoundingClientRect().width : 0;
    _margen = seg && getComputedStyle(cen).justifyContent === 'flex-start' ? Math.max(0, Math.floor((rc.width - ancho) / 2)) : 0;
    if (seg) seg.style.marginLeft = _margen + 'px';
    const rs = seg ? seg.getBoundingClientRect() : rc;
    _holgura = {
      der: Math.max(0, Math.floor(prim.getBoundingClientRect().left - rs.right - 14)),
      izq: Math.max(0, Math.floor(rs.left - (tit ? tit.getBoundingClientRect().right : rc.left) - 14))
    };
    // El ancho de cada botón abierto: el de su nombre. Se guarda por su
    // acción para dárselo al botón nuevo de cada repintado (el filtro se
    // repinta en cada letra, con el campo enfocado, cuando no se mide: sin
    // su ancho guardado se abría sin apartar nada y pisaba las vistas).
    _cab.querySelectorAll('.dkc-hueco > .dkc-pl').forEach(pl => {
      const b = pl.querySelector('b');
      // Nunca más de lo que hay: su hueco, el sitio libre y lo que las
      // vistas pueden apartarse (a 1180 con la barra, el filtro de 240
      // pisaba las vistas 16 px). Si no cabe, el nombre se corta con "…".
      const tope = 38 + _holgura.der + _holgura.izq;
      const w = Math.min(tope, pl.classList.contains('dkc-campo') ? 240 : b ? Math.ceil(b.scrollWidth + 18 + 8 + 28) : 38);
      _anchos[pl.parentElement.dataset.dkc] = w;
    });
    ponerAnchos();
  }
  const _anchos = {};
  function ponerAnchos() {
    _cab.querySelectorAll('.dkc-hueco > .dkc-pl').forEach(pl => {
      const w = _anchos[pl.parentElement.dataset.dkc];
      if (!w) return;
      pl.style.setProperty('--w', w + 'px');
      pl.dataset.w = w;
    });
  }
  // Después de que se cierre lo que estaba abierto (la animación dura
  // .22 s): medido a medio cerrar, las vistas volvían a otro sitio.
  let _tM = 0;
  const medirLuego = () => { clearTimeout(_tM); _tM = setTimeout(medir, 260); };
  // Lo que se aparta: lo que el botón abierto necesita más allá de su
  // hueco y del sitio libre de la derecha, hasta lo que sobra a la
  // izquierda. Sin nada abierto, vuelve a 0.
  function empujar() {
    if (!_cab) return;
    const abierto = _cab.querySelector('.dkc-hueco:hover > .dkc-pl, .dkc-pl.abierto, .dkc-pl.toque, .dkc-campo:focus-within');
    const w = abierto ? Number(abierto.dataset.w) || 38 : 38;
    const e = abierto ? Math.max(0, Math.min(_holgura.izq, w - 38 - _holgura.der)) : 0;
    _cab.style.setProperty('--dkc-empuje', e + 'px');
  }

  // ── Montar y pintar ──
  function montar() {
    if (_cab) return true;
    const header = document.querySelector('.wrap > .bs-header');
    if (!header || !document.body.classList.contains('dk')) return false;
    _cab = document.createElement('div');
    _cab.id = 'dkCab';
    // La rejilla va en un hijo: #dkCab es el contenedor que se mide (sus
    // reglas de poco ancho, @container dkcab) y un contenedor no puede
    // cambiar su propia rejilla por su ancho.
    _cab.innerHTML = `<div class="dkc-grid">
      <div class="dkc-izq"><button type="button" class="dkc-titulo" data-dkc="home" aria-label="Back to Home (Esc)"><i class="ti ti-chevron-left" aria-hidden="true"></i><span></span></button></div>
      <div class="dkc-centro"></div>
      <div class="dkc-der">
        <span class="dkc-afinar"></span>
        <span class="dkc-acciones"></span>
        <span class="dkc-sep" aria-hidden="true"></span>
        <span class="dkc-hueco dkc-busca" data-dkc="busca"></span>
        <span class="dkc-hueco" data-dkc="mas"><button type="button" class="dkc-pl dkc-mas" data-dkc="mas" aria-label="More"><i class="ti ti-dots" aria-hidden="true"></i></button></span>
      </div></div>`;
    const menuBtn = document.getElementById('dkMenu');
    if (menuBtn && menuBtn.parentElement === header) menuBtn.insertAdjacentElement('afterend', _cab);
    else header.insertBefore(_cab, header.firstChild);

    _cab.addEventListener('click', (ev) => {
      const t0 = ev.target.closest('[data-dkc]');
      // El hueco y su botón dicen lo mismo: el ancla es siempre el hueco.
      const t = t0 && t0.classList.contains('dkc-pl') && t0.parentElement.classList.contains('dkc-hueco') ? t0.parentElement : t0;
      // Un campo: el clic en su hueco le da el foco (se abre al tenerlo).
      if (t && (t.dataset.dkc === 'campo' || t.dataset.dkc === 'busca')) {
        const inp = t.querySelector('input');
        if (inp && document.activeElement !== inp) inp.focus();
        return;
      }
      if (t && t.dataset.dkc === 'home') {
        // SÓLO el ‹ lleva al Home; la palabra lleva a lo que nombra (Axel,
        // 2026-11-26: "EL CHEVRON te saca, la palabra te lleva a esa sección
        // o subsección"). El título entero era el botón del Home, y sólo
        // algunos trozos llevaban enlace: tocar "Orders" o "Inventory" sacaba
        // al Home. Se decide por DÓNDE cayó el dedo (en el iPad, Safari puede
        // darle el toque al botón y no al trozo), con holgura en el ‹: un
        // dedo no es un puntero. Con el teclado (Enter, sin punto) sigue
        // siendo volver, como dice su etiqueta (Esc hace lo mismo).
        const sp = _specs[_sec];
        if (enChevron(t, ev)) { const S = window.BarStockDeskShell; if (S && S.ir) S.ir('home'); return; }
        const m = ev.target.closest && ev.target.closest('.dkc-miga') || migaEn(t, ev);
        if (m) { if (sp && sp.alClic) sp.alClic(ev, m); return; }
        // Lo demás del título: la sección misma (cerrar lo abierto, arriba).
        if (sp && sp.alTitulo) sp.alTitulo();
        return;
      }
      if (t && t.dataset.dkc === 'mas') {
        if (_pop && _pop._ancla === t) { cerrarMenu(); return; }
        const sp = _specs[_sec];
        const ex = sp && sp.extras ? sp.extras() : [];
        menu(t, (ex.length ? [{ h: tituloTexto(sp) }].concat(ex) : []).concat(deLaApp()));
        return;
      }
      if (t && t.getAttribute('aria-disabled') === 'true') return;
      const sp = _specs[_sec];
      if (sp && sp.alClic) sp.alClic(ev, t);
    });
    _cab.addEventListener('input', (ev) => { const sp = _specs[_sec]; if (sp && sp.alEscribir) sp.alEscribir(ev); });
    // Abierto, un campo tapa a sus vecinos: Esc o Enter lo cierran (el
    // texto se queda, y el botón queda azul "en uso").
    _cab.addEventListener('keydown', (ev) => {
      const t = ev.target;
      if (!t || t.tagName !== 'INPUT' || t.id === 'dkBuscaIn') return;
      if (ev.key === 'Escape' || ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); t.blur(); }
    });
    // Con el dedo no hay "pasar por encima": un toque hace la acción y el
    // nombre se ve un momento, para saber qué se tocó.
    _cab.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType !== 'touch') return;
      const h = ev.target.closest('.dkc-hueco');
      const b = h && h.querySelector('button.dkc-pl');
      if (!b) return;
      b.classList.add('toque');
      empujar();
      setTimeout(() => { b.classList.remove('toque'); empujar(); }, 1200);
    });
    // Esc cierra el menú antes que nada (antes que "volver al Home").
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && _pop) { ev.preventDefault(); ev.stopPropagation(); cerrarMenu(); }
    }, true);
    window.addEventListener('resize', cerrarMenu, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(medirLuego).observe(_cab);
    else window.addEventListener('resize', medirLuego, { passive: true });
    // Al soltar el ratón o el foco, otra medida (algo pudo cambiar con
    // un botón abierto, cuando no se mide).
    _cab.addEventListener('mouseleave', medirLuego);
    _cab.addEventListener('focusout', medirLuego);
    ['mouseover', 'mouseout', 'focusin', 'focusout'].forEach(n => _cab.addEventListener(n, () => requestAnimationFrame(empujar)));
    return true;
  }

  // La sección activa cambió (desk-shell.marcar, en cada cambio).
  function marcar(sec) {
    const spec = _specs[sec];
    if (!spec || !montar()) {
      if (document.body.classList.contains('dk-cab')) {
        document.body.classList.remove('dk-cab', 'dkc-sin-busca');
        cerrarMenu();
        moverBusca(false);
      }
      _sec = spec ? sec : null;
      return;
    }
    const cambio = _sec !== sec || !document.body.classList.contains('dk-cab');
    _sec = sec;
    document.body.classList.add('dk-cab');
    // Una sección sin Do we have (spec.busca === false, Inventory: allí se
    // busca en el inventario) deja su hueco VACÍO, del mismo tamaño: ⋯ no
    // se corre. El campo se mueve igual y se esconde (display: none), así
    // que "/" y ⌘K no abren un buscador invisible.
    document.body.classList.toggle('dkc-sin-busca', spec.busca === false);
    if (cambio) { cerrarMenu(); refrescar(sec); }
    moverBusca(true);
  }

  // ¿El clic fue al ‹? Por el elemento, o por el punto (con 10 px de
  // holgura a su derecha y alrededor). Un clic sin punto (el teclado) es el
  // botón entero: volver.
  function enChevron(boton, ev) {
    if (ev && ev.target && ev.target.closest && ev.target.closest('.ti')) return true;
    if (!ev || !(ev.detail > 0) || typeof ev.clientX !== 'number') return true;
    const c = boton.querySelector('.ti');
    if (!c) return false;
    const r = c.getBoundingClientRect();
    if (!r.width) return false;
    return ev.clientX <= r.right + 10 && ev.clientY >= r.top - 14 && ev.clientY <= r.bottom + 14;
  }

  // El trozo enlazado del título bajo el punto del clic, o null.
  function migaEn(boton, ev) {
    if (!ev || typeof ev.clientX !== 'number') return null;
    const H = 8;
    for (const m of boton.querySelectorAll('.dkc-miga')) {
      const r = m.getBoundingClientRect();
      if (!r.width) continue;
      if (ev.clientX >= r.left - H && ev.clientX <= r.right + H && ev.clientY >= r.top - H && ev.clientY <= r.bottom + H) return m;
    }
    return null;
  }

  // La sección repinta lo suyo (vistas, huecos) con su estado de ahora.
  // El campo con el foco lo conserva, con su cursor.
  function refrescar(sec) {
    if (!_cab || sec !== _sec || !document.body.classList.contains('dk-cab')) return;
    const sp = _specs[sec];
    const act = document.activeElement;
    const foco = act && _cab.contains(act) && act.id && act.tagName === 'INPUT' ? { id: act.id, pos: act.selectionStart } : null;
    // El título puede ser una función: Orders con un proveedor abierto es
    // "Orders › SOUTHERN" (Axel, 2026-11-26).
    // Y puede ser una lista de piezas: { t, miga } es un enlace dentro del
    // título ("Orders › LOOP › Review": Orders y LOOP vuelven a las líneas,
    // Axel 2026-11-26); el resto del título sigue llevando al Home.
    const tt = tituloDe(sp);
    const tsp = _cab.querySelector('.dkc-titulo span');
    if (Array.isArray(tt)) {
      const e = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      tsp.innerHTML = tt.map((p) => (p && typeof p === 'object' && p.miga
        ? `<span class="dkc-miga" data-dkc="miga" data-miga="${e(p.miga)}">${e(p.t)}</span>`
        : e(p && typeof p === 'object' ? p.t : p))).join(' › ');
    } else tsp.textContent = tt;
    // Sólo se rehace lo que cambió: con cada letra del filtro se rehacía el
    // header entero, el campo incluido (se destruía y volvía a crearse con
    // su foco), y era lo más lento de escribir. El valor de un campo no
    // cuenta como cambio: lo lleva el navegador.
    const poner = (el, html) => {
      // Ni el valor ni la marca de "en uso" del campo (que cambia con la
      // primera letra): esa se pone abajo, sin rehacerlo.
      const k = html.replace(/ value="[^"]*"/g, '').replace(/dkc-campo en"/g, 'dkc-campo"');
      if (el._dkc === k) return false;
      el._dkc = k; el.innerHTML = html; return true;
    };
    // Las vistas nuevas (sus cuentas cambian al filtrar) en el mismo sitio
    // que las de antes: sin su margen medido, saltaban al escribir.
    const a0 = poner(_cab.querySelector('.dkc-centro'), sp.vistas ? sp.vistas() : '');
    if (a0) {
      const segN = _cab.querySelector('.dkc-centro').firstElementChild;
      if (segN) segN.style.marginLeft = _margen + 'px';
    }
    const tres = sp.afinar ? sp.afinar() : [];
    const a1 = poner(_cab.querySelector('.dkc-afinar'), [0, 1, 2].map(k => tres[k] || vacio()).join(''));
    const dos = sp.acciones ? sp.acciones() : [];
    const a2 = poner(_cab.querySelector('.dkc-acciones'), [0, 1].map(k => dos[k] || vacio()).join(''));
    _cab.querySelectorAll('.dkc-campo').forEach(l => { const i = l.querySelector('input'); l.classList.toggle('en', !!(i && i.value.trim())); });
    if (!a0 && !a1 && !a2) return;
    ponerAnchos();
    if (foco) {
      const e = document.getElementById(foco.id);
      if (e) { e.focus(); try { e.setSelectionRange(foco.pos, foco.pos); } catch (x) {} }
    }
    medirLuego();
  }

  function registrar(sec, spec) {
    _specs[sec] = spec;
    const S = window.BarStockDeskShell;
    if (S && S.activa && S.activa() === sec) marcar(sec);
  }

  window.BarStockDeskHeader = {
    registrar, marcar, refrescar, boton, campo, vacio, menu, cerrarMenu,
    abiertoMenu: () => !!_pop,
    activo: () => (document.body.classList.contains('dk-cab') ? _sec : null)
  };
})();
