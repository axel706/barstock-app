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
    return `<span class="dkc-hueco" data-dkc="${esc(o.acc)}"${dis} title="${esc(txt)}"><button type="button" class="dkc-pl${o.tono ? ' ' + o.tono : ''}${o.en ? ' en' : ''}${o.apagado ? ' apagado' : ''}"
      data-dkc="${esc(o.acc)}" aria-label="${esc(txt)}"${dis}><i class="ti ${esc(o.icon)}" aria-hidden="true"></i><b>${esc(txt)}</b></button></span>`;
  }
  // Un campo que es un botón redondo hasta que se toca (el filtro de la
  // lista). `o`: { id, icon, placeholder, value }.
  function campo(o) {
    const lleno = String(o.value || '').trim() !== '';
    return `<span class="dkc-hueco" data-dkc="campo" title="${esc(lleno ? o.value : o.placeholder)}"><label class="dkc-pl dkc-campo${lleno ? ' en' : ''}">
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
    _pop.style.top = Math.round(r.bottom + 8) + 'px';
    // Todo el alto que queda: con un tope fijo, ⋯ cortaba "App" y el tema,
    // Settings y Logout quedaban escondidos bajo un scroll que no se ve.
    _pop.style.maxHeight = Math.max(200, Math.round(window.innerHeight - r.bottom - 20)) + 'px';
    _pop.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
    // Abierto se marca en el botón (lo que se dibuja), y el menú cuelga del
    // hueco (lo que recibe el ratón).
    const dib = ancla.querySelector('.dkc-pl') || ancla;
    dib.classList.add('abierto');
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
      <div class="dkc-izq"><button type="button" class="dkc-titulo" data-dkc="home" title="Back to Home (Esc)"><i class="ti ti-chevron-left" aria-hidden="true"></i><span></span></button></div>
      <div class="dkc-centro"></div>
      <div class="dkc-der">
        <span class="dkc-afinar"></span>
        <span class="dkc-acciones"></span>
        <span class="dkc-sep" aria-hidden="true"></span>
        <span class="dkc-hueco dkc-busca" data-dkc="busca" title="Do we have… (/ or ⌘K)"></span>
        <span class="dkc-hueco" data-dkc="mas" title="More"><button type="button" class="dkc-pl dkc-mas" data-dkc="mas" aria-label="More"><i class="ti ti-dots" aria-hidden="true"></i></button></span>
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
      if (t && t.dataset.dkc === 'home') { const S = window.BarStockDeskShell; if (S && S.ir) S.ir('home'); return; }
      if (t && t.dataset.dkc === 'mas') {
        if (_pop && _pop._ancla === t) { cerrarMenu(); return; }
        const sp = _specs[_sec];
        const ex = sp && sp.extras ? sp.extras() : [];
        menu(t, (ex.length ? [{ h: sp.titulo }].concat(ex) : []).concat(deLaApp()));
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
      setTimeout(() => b.classList.remove('toque'), 1200);
    });
    // Esc cierra el menú antes que nada (antes que "volver al Home").
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && _pop) { ev.preventDefault(); ev.stopPropagation(); cerrarMenu(); }
    }, true);
    window.addEventListener('resize', cerrarMenu, { passive: true });
    return true;
  }

  // La sección activa cambió (desk-shell.marcar, en cada cambio).
  function marcar(sec) {
    const spec = _specs[sec];
    if (!spec || !montar()) {
      if (document.body.classList.contains('dk-cab')) {
        document.body.classList.remove('dk-cab');
        cerrarMenu();
        moverBusca(false);
      }
      _sec = spec ? sec : null;
      return;
    }
    const cambio = _sec !== sec || !document.body.classList.contains('dk-cab');
    _sec = sec;
    document.body.classList.add('dk-cab');
    if (cambio) { cerrarMenu(); refrescar(sec); }
    moverBusca(true);
  }

  // La sección repinta lo suyo (vistas, huecos) con su estado de ahora.
  // El campo con el foco lo conserva, con su cursor.
  function refrescar(sec) {
    if (!_cab || sec !== _sec || !document.body.classList.contains('dk-cab')) return;
    const sp = _specs[sec];
    const act = document.activeElement;
    const foco = act && _cab.contains(act) && act.id && act.tagName === 'INPUT' ? { id: act.id, pos: act.selectionStart } : null;
    _cab.querySelector('.dkc-titulo span').textContent = sp.titulo || '';
    _cab.querySelector('.dkc-centro').innerHTML = sp.vistas ? sp.vistas() : '';
    const tres = sp.afinar ? sp.afinar() : [];
    _cab.querySelector('.dkc-afinar').innerHTML = [0, 1, 2].map(k => tres[k] || vacio()).join('');
    const dos = sp.acciones ? sp.acciones() : [];
    _cab.querySelector('.dkc-acciones').innerHTML = [0, 1].map(k => dos[k] || vacio()).join('');
    if (foco) {
      const e = document.getElementById(foco.id);
      if (e) { e.focus(); try { e.setSelectionRange(foco.pos, foco.pos); } catch (x) {} }
    }
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
