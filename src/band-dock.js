(() => {
  if (window.BarStockBandDock) return;

  // ── La búsqueda que se acopla al header al hacer scroll ──────────────
  //
  // Axel (2026-11-09, opción A sobre lámina, empezando por el Home): al
  // bajar, lo de arriba de la pantalla (el saludo y la locación) se
  // desvanece antes de llegar al logo, la búsqueda se queda pegada bajo
  // él como parte del header, y el desenfoque empieza justo debajo de
  // ella. Al volver arriba, todo regresa. Antes el saludo pasaba por
  // debajo del logo y se leía a través de él.
  //
  // Va a repetirse en otras secciones: por eso es un módulo y no un
  // bloque dentro del Home. Cada pantalla le da su barra y lo que se
  // desvanece; el resto es igual para todas.
  //
  // ── Por qué una copia fija y no `position: sticky` ────────────────
  //
  // Sticky sólo pega dentro de su padre, y la búsqueda del Home vive en
  // un bloque que termina justo debajo de ella: se soltaría enseguida.
  // Sacarla de ahí cambiaría el maquetado de toda la pantalla. En vez de
  // eso, cuando la de verdad llega a su sitio bajo el header se esconde
  // (visibility, para que no deje hueco) y aparece una copia fija en el
  // MISMO punto. Como están en el mismo píxel, el cambio no se ve.
  //
  // ── El desenfoque ─────────────────────────────────────────────────
  //
  // #mDock va detrás de la banda (z-index menor) y cubre desde arriba
  // hasta un poco por debajo de la búsqueda. Lleva un solo desenfoque
  // fuerte, recortado con una máscara que se deshace en los últimos
  // RAMPA px: borroso detrás del header y de la búsqueda, nítido justo
  // debajo. No se estira la banda: su altura es la del logo y los
  // botones, y cambiarla los movería.

  const HUECO = 8;        // entre la banda y la búsqueda acoplada
  const RAMPA = 30;       // lo que tarda el desenfoque en deshacerse

  // ── Dos formas, según la pantalla ─────────────────────────────────
  //
  // Home: la búsqueda es un botón que lleva a Buscar y tiene encima el
  //   saludo; se acopla con una COPIA fija al llegar a su sitio (ver
  //   arriba).
  // Buscar (`fija: true`, con `scroll`): la barra es un <input> de
  //   verdad y está arriba del todo. Una copia no sirve —el teclado
  //   escribiría en la escondida—, así que la barra MISMA va fija y la
  //   lista lleva su propio scroll, de arriba abajo de la pantalla y con
  //   hueco arriba para pasar por debajo de la barra. La página de
  //   detrás no se mueve mientras tanto. El desenfoque sale en cuanto
  //   la lista baja; en reposo no, que la rampa taparía el primer
  //   resultado.
  //
  //   Primero fue `position: sticky` en la página, y en el iPhone falló
  //   de dos formas (Axel, 2026-11-09): con el teclado abierto iOS
  //   desplaza la ventana visible y se llevaba el header; y sin teclado
  //   el elástico arrastraba la página, barra incluida ("un rebote al
  //   subir o bajar todo"). overscroll-behavior en el <html> no lo
  //   para en el iPhone. Con la página quieta y el scroll en la lista,
  //   nada de eso puede mover la barra.
  //
  // Cada pantalla deja su enganche y se queda guardado: manda el de la
  // pantalla que esté a la vista. Si sólo se recordara el último, al
  // volver de Buscar al Home sin repintarlo el Home ya no se acoplaría.

  const _regs = new Map();  // pantalla → { pantalla, barra, desvanecer, fija, scroll, copia }
  let _actual = null;       // el de la pantalla a la vista
  let _dock = null;
  let _pedido = false;

  function dock() {
    if (_dock && _dock.isConnected) return _dock;
    _dock = document.getElementById('mDock');
    if (!_dock) {
      _dock = document.createElement('div');
      _dock.id = 'mDock';
      _dock.className = 'm-dock';
      _dock.innerHTML = '<span class="m-dock-blur" aria-hidden="true"></span>';
      // Junto a la banda, al principio del body: el bloqueo de la
      // pantalla de entrada (body.auth-locked > *) también lo tapa.
      const band = document.getElementById('mBand');
      if (band && band.parentNode) band.parentNode.insertBefore(_dock, band.nextSibling);
      else document.body.insertBefore(_dock, document.body.firstChild);
    }
    return _dock;
  }

  const bordeBanda = () => {
    const b = document.getElementById('mBand');
    return b ? b.getBoundingClientRect().bottom : 0;
  };

  function quitarCopia() {
    if (!_dock) return;
    _dock.querySelectorAll('.m-dock-barra').forEach(x => x.remove());
    for (const r of _regs.values()) r.copia = null;
  }

  function soltar() {
    if (_dock) _dock.classList.remove('on');
    const a = _actual;
    if (a && a.barra && !a.fija) a.barra.style.visibility = '';
  }

  function cubrir(top, alto) {
    const d = dock();
    d.style.height = (top + alto + RAMPA) + 'px';
    d.style.setProperty('--m-dock-rampa', RAMPA + 'px');
    d.classList.add('on');
  }

  function acoplar(r, banda) {
    const a = _actual;
    const d = dock();
    if (!a.copia || !a.copia.isConnected) {
      quitarCopia();
      const c = a.barra.cloneNode(true);
      c.removeAttribute('id');
      c.classList.add('m-dock-barra');
      // Hace lo mismo que la de verdad, sin copiar su manejador: si la
      // pantalla cambia lo que hace la barra, la copia lo sigue.
      c.onclick = (ev) => { ev.preventDefault(); if (_actual && _actual.barra) _actual.barra.click(); };
      d.appendChild(c);
      a.copia = c;
    }
    const top = banda + HUECO;
    a.copia.style.top = top + 'px';
    a.copia.style.left = r.left + 'px';
    a.copia.style.width = r.width + 'px';
    cubrir(top, r.height);
    a.barra.style.visibility = 'hidden';
  }

  // ── Lo que se desvanece ──────────────────────────────────────────
  //
  // Se mide por lo que se ha bajado, no por la distancia al header:
  // entero arriba del todo, e invisible cuando su borde de abajo llega
  // al header. Antes se medía por la distancia (empezaba a irse 16 px
  // antes del borde) y en el iPhone de Axel el saludo queda a pocos px
  // de él YA EN REPOSO: salía a 0.65 sin haber bajado nada, "debajo de
  // un velo". Cómo de cerca quede del header depende del teléfono; lo
  // que se ha bajado, no.
  function desvanecer(banda) {
    const y = Math.max(0, window.scrollY || 0);
    for (const el of _actual.desvanecer) {
      if (!el || !el.isConnected) continue;
      const abajo = el.getBoundingClientRect().bottom;
      const recorrido = abajo + y - banda;        // lo que hay que bajar
      if (y <= 0 || recorrido <= 0) { el.style.opacity = ''; continue; }
      const o = (abajo - banda) / recorrido;
      el.style.opacity = o >= 1 ? '' : String(Math.max(0, Math.round(o * 100) / 100));
    }
  }

  function aLaVista() {
    for (const r of _regs.values()) {
      if (r.pantalla.isConnected && r.pantalla.classList.contains('on') && r.barra && r.barra.isConnected) return r;
    }
    return null;
  }

  // ── La página quieta mientras la lista lleva su propio scroll ─────
  //
  // Primero se fijó el body (position: fixed y overflow: hidden, como el
  // panel de avisos). En la app instalada, iOS volvía a medir la
  // pantalla SIN la franja de abajo: la barra de pestañas subía ~60 px y
  // quedaba negro debajo (Axel, 2026-11-09). Son los mismos 894 contra
  // 956 px que salieron en la animación de actualizar.
  //
  // Ahora no se toca el body. Se frena el ARRASTRE que empieza en la
  // pantalla o en el header FUERA de la lista (sobre la barra, sobre la
  // banda): ése movería la página, y con el teclado abierto se llevaría
  // el header. Dentro de la lista no se frena nada; su rebote lo
  // contiene su overscroll-behavior. Lo que vive fuera de la pantalla
  // (la ficha de un producto, en <body>) no se toca.
  //
  // Frenaba también en los extremos de la lista, y al final de ella no
  // se podía volver (Axel, 2026-11-09): en iOS, cancelar el primer
  // movimiento bloquea el gesto ENTERO, y ese primer movimiento puede
  // leerse como "seguir empujando".
  //
  // Tampoco se le quita el alto a la pantalla: con una página corta la
  // barra de pestañas sube y deja negro debajo (ver .m-screen.on). La
  // clase m-scroll-propio queda como marca de que la página está quieta.
  function quieta(si) {
    document.documentElement.classList.toggle('m-scroll-propio', si);
    document.body.classList.toggle('m-scroll-propio', si);
  }

  function alArrastrar(e) {
    const a = _actual;
    if (!a || !a.scroll) return;
    const t = e.target;
    const band = document.getElementById('mBand');
    const nuestro = (a.pantalla.contains(t)) || (band && band.contains(t)) || (_dock && _dock.contains(t));
    if (!nuestro) return;
    // Fuera de la lista, o con una lista que cabe entera (no tiene
    // dónde separarse del tope): el arrastre no es de nadie.
    if (!a.scroll.contains(t) || !cabeMover(a.scroll)) e.preventDefault();
  }

  // ── La trampa de iOS con una lista dentro de una página ──────────
  //
  // Con la lista JUSTO en su tope, iOS le da el gesto a la página de
  // detrás, y la página se lo queda un rato: como en Buscar todo es
  // fijo, no se ve moverse nada y la lista parece bloqueada. Axel lo
  // vio dos veces al llegar al final (2026-11-09); la primera era
  // además mi freno de los extremos, la segunda era esto solo.
  // overscroll-behavior no lo evita en el iPhone.
  //
  // El remedio de siempre: al poner el dedo, si la lista está en un
  // tope se la separa 1 px. Nunca empieza un gesto en el borde, así
  // que el gesto es siempre suyo. Ese píxel no cuenta como "bajado"
  // para el desenfoque (ver actualizar).
  const cabeMover = (sc) => sc.scrollHeight - sc.clientHeight > 2;
  function alTocar(e) {
    const a = _actual;
    if (!a || !a.scroll || !a.scroll.contains(e.target)) return;
    const sc = a.scroll;
    if (!cabeMover(sc)) return;
    const max = sc.scrollHeight - sc.clientHeight;
    if (sc.scrollTop <= 0) sc.scrollTop = 1;
    else if (sc.scrollTop >= max) sc.scrollTop = max - 1;
  }
  document.addEventListener('touchstart', alTocar, { passive: true });
  document.addEventListener('touchmove', alArrastrar, { passive: false });

  function actualizar() {
    _pedido = false;
    const a = aLaVista();
    if (a !== _actual) { soltar(); quitarCopia(); _actual = a; }
    quieta(!!(a && a.scroll));
    if (!a) { soltar(); return; }
    const banda = bordeBanda();
    const top = banda + HUECO;
    if (a.fija) {
      const h = document.documentElement.style;
      h.setProperty('--m-dock-top', top + 'px');
      const alto = a.barra.getBoundingClientRect().height;
      if (alto) h.setProperty('--m-dock-barra-h', alto + 'px');
      // Lo visible, no la pantalla: con el teclado abierto la lista
      // acaba encima de él y el último resultado se puede alcanzar.
      const vv = window.visualViewport;
      h.setProperty('--m-vvh', Math.round(vv ? vv.height : window.innerHeight) + 'px');
      // > 1 y no > 0: el píxel de alTocar no es haber bajado.
      const bajado = a.scroll ? a.scroll.scrollTop : (window.scrollY || 0);
      if (bajado > 1) cubrir(top, alto);
      else soltar();
      return;
    }
    const r = a.barra.getBoundingClientRect();
    if (r.top <= top) acoplar(r, banda);
    else soltar();
    desvanecer(banda);
  }

  // Un cálculo por fotograma, aunque lleguen varios scroll en el mismo.
  function pedir() {
    if (_pedido) return;
    _pedido = true;
    (window.requestAnimationFrame || ((f) => setTimeout(f, 16)))(actualizar);
  }

  // La pantalla lo llama cada vez que se pinta: un repintado (refresh)
  // cambia los elementos, y la copia tiene que apuntar a los nuevos.
  function enganchar(o) {
    if (!o || !o.pantalla || !o.barra) return;
    const viejo = _regs.get(o.pantalla);
    if (viejo && viejo.barra && viejo.barra !== o.barra) viejo.barra.style.visibility = '';
    if (viejo === _actual) { quitarCopia(); _actual = null; }
    const r = { pantalla: o.pantalla, barra: o.barra, desvanecer: o.desvanecer || [], fija: !!o.fija,
      scroll: o.fija && o.scroll ? o.scroll : null, copia: null };
    if (r.fija) o.barra.classList.add('m-dock-fija');
    if (r.scroll && !r.scroll.classList.contains('m-dock-scroll')) {
      r.scroll.classList.add('m-dock-scroll');
      r.scroll.addEventListener('scroll', pedir, { passive: true });
    }
    _regs.set(o.pantalla, r);
    vigilarPantallas(o.pantalla.parentNode);
    actualizar();
  }

  // ── Al cambiar de pantalla ───────────────────────────────────────
  //
  // Las pantallas se cambian con la clase `on` (mobile-shell.js), y no
  // todas enganchan algo al mostrarse: Inventory no. Si sólo se
  // recalculara al hacer scroll, al salir de Buscar a Inventory la
  // página se quedaría quieta (sin scroll) hasta que algo la moviera,
  // y no la mueve nada. Se mira el cambio de clase directamente.
  let _vigilado = null;
  function vigilarPantallas(caja) {
    if (!caja || caja === _vigilado || typeof MutationObserver === 'undefined') return;
    _vigilado = caja;
    new MutationObserver(pedir).observe(caja, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }

  window.addEventListener('scroll', pedir, { passive: true });
  window.addEventListener('resize', pedir);
  // El teclado no cambia la ventana en iOS, cambia lo visible.
  if (window.visualViewport) window.visualViewport.addEventListener('resize', pedir);

  window.BarStockBandDock = { enganchar, actualizar, HUECO, RAMPA };
})();
