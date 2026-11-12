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
  // hasta un poco por debajo de la búsqueda. Lleva el desenfoque
  // progresivo (ESCALERA, más abajo): nítido en el borde, creciendo en
  // RAMPA px desde un poco por debajo de la búsqueda hacia arriba, y del
  // todo borroso en lo alto de ella y en el header. No se estira la banda: su altura es la del logo y los
  // botones, y cambiarla los movería.

  const HUECO = 8;        // entre la banda y la búsqueda acoplada
  const RAMPA = 50;       // el tramo en que el desenfoque va de nada a todo
  const BAJO = 10;        // cuánto de ese tramo queda por debajo de la barra

  // ── El desenfoque es PROGRESIVO ──────────────────────────────────
  //
  // Seis capas, cada una con más radio que la anterior (1, 2, 4, 8, 14 y
  // 22 px) y recortada a su franja: la misma escalera de la banda. Las
  // cinco primeras se reparten la RAMPA, de abajo arriba, y la sexta
  // cubre todo lo de encima. El contenido se va deshaciendo según sube.
  //
  // Dónde: empieza nítido BAJO px por debajo de la barra —la línea roja
  // que dibujó Axel va pegada a ella— y crece por DETRÁS de la barra,
  // hasta el máximo en su parte alta. La primera escalera cabía entera
  // debajo de la barra, en 40 px: pasaba de nítido a muy borroso casi de
  // golpe y empezaba más abajo de la línea.
  //
  // Antes era UN desenfoque de 22 px con una máscara que lo hacía
  // transparente hacia abajo, en las tres pantallas. Eso no es
  // progresivo: mezcla lo nítido con lo muy borroso. Axel lo pidió
  // progresivo desde el principio y lo vio (2026-11-09: "estás poniendo
  // blur en su lugar"). Una sola constante para las dos capas que la
  // llevan (#mDock y la del bloque de Inventory): que no haya dos.
  const ESCALERA = '<i></i><i></i><i></i><i></i><i></i><i></i>';

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
  // Inventory (`pegado`, con `scroll`, `titulo` y `nombre`): tiene las
  //   dos cosas, un título encima (como el Home) y un campo de verdad
  //   (como Buscar), y un giro que pidió Axel: al bajar, el título de la
  //   pantalla sustituye al logo en el header. La lista lleva su propio
  //   scroll, como en Buscar. El título grande se va con ella. El bloque
  //   (pestañas y filtro) se pega bajo el header con `position: sticky`
  //   DENTRO de la lista: lo mueve el navegador, no JavaScript, que es
  //   lo que lo hace suave. El desenfoque va dentro del bloque, detrás
  //   de él (ver .m-dock-velo). Y el fundido logo → título va ligado al
  //   scroll (--m-dock-q, de 0 a 1): avanza y retrocede con el dedo, no
  //   se dispara de golpe.
  //
  // Cada pantalla deja su enganche y se queda guardado: manda el de la
  // pantalla que esté a la vista. Si sólo se recordara el último, al
  // volver de Buscar al Home sin repintarlo el Home ya no se acoplaría.

  const _regs = new Map();  // pantalla → { pantalla, barra, desvanecer, fija, scroll, copia, pegado, titulo, nombre }
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
      _dock.innerHTML = '<span class="m-dock-blur m-dock-esc" aria-hidden="true">' + ESCALERA + '</span>';
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

  // ── Medir pocas veces, animar sin medir ──────────────────────────
  //
  // Axel, 2026-11-10: "pule todas las animaciones de los headers, haz
  // todo más fluido". Lo que restaba fluidez no eran los fundidos. En
  // CADA fotograma de scroll el módulo medía la banda, el bloque y los
  // márgenes —y cada medida obliga al navegador a recalcular el diseño a
  // mitad del scroll, con 264 renglones delante— y reescribía las
  // variables del documento entero aunque no hubieran cambiado.
  //
  // Ahora hay dos funciones y no se mezclan:
  //
  //   medir()    lo caro. Lee posiciones y tamaños y los guarda en el
  //              enganche. Corre al pintar, al cambiar de pantalla o de
  //              tamaño, cuando cambia el contenido y al poner el dedo
  //              (una vez por gesto, por si algo se movió sin avisar).
  //   animar()   lo de cada fotograma. Sólo lee cuánto se ha bajado y
  //              escribe los dos o tres valores que dependen de eso, y
  //              sólo si cambiaron (ver `est`).
  //
  // Lo que animar() necesita saber de la pantalla es su geometría EN
  // REPOSO: dónde está cada cosa con el scroll a cero. La posición de
  // ahora es ésa menos lo bajado; no hace falta volver a preguntarla.

  // Escribe un estilo sólo si cambia. Un mismo valor reescrito sesenta
  // veces por segundo no pinta nada nuevo, pero el navegador lo
  // comprueba cada vez; en el <html>, contra el documento entero.
  const _puesto = new WeakMap();
  function est(el, prop, valor) {
    if (!el) return;
    let m = _puesto.get(el);
    if (!m) { m = {}; _puesto.set(el, m); }
    if (m[prop] === valor) return;
    m[prop] = valor;
    if (prop.charAt(0) === '-') {
      if (valor === null) el.style.removeProperty(prop); else el.style.setProperty(prop, valor);
    } else el.style[prop] = valor === null ? '' : valor;
  }
  const raiz = (prop, valor) => est(document.documentElement, prop, valor);

  // Suaviza un avance de 0 a 1: arranca y frena despacio en vez de en
  // seco. Los fundidos iban en línea recta y se notaba el tirón al
  // empezar y al acabar.
  const suave = (x) => x * x * (3 - 2 * x);
  const entre = (x) => Math.max(0, Math.min(1, x));
  const dos = (x) => String(Math.round(x * 100) / 100);

  // Deja de acoplar lo de `a`: sin desenfoque, sin copia a la vista y
  // con la barra de verdad otra vez visible.
  function soltar(a) {
    if (_dock) {
      _dock.classList.remove('on', 'viva');
      est(_dock, '--m-dock-o', '0');
    }
    if (a && a.copia) est(a.copia, 'display', 'none');
    if (a && a.barra && !a.fija) est(a.barra, 'visibility', null);
  }

  // El desenfoque de #mDock (Home y Buscar). `o` es cuánto se ve, de 0 a
  // 1, y va a cada capa por variable: entraba de golpe, con un
  // display, y ahora entra con el scroll como el de Inventory. `viva`
  // es "hay algo que pintar"; `on`, "está acoplado" (lo que miran las
  // pruebas y la copia del Home).
  function velar(o, acoplado) {
    const d = dock();
    est(d, '--m-dock-o', dos(o));
    d.classList.toggle('viva', o > 0);
    d.classList.toggle('on', !!acoplado);
  }

  // La copia del Home se crea al MEDIR, escondida, y no en el fotograma
  // en que la búsqueda llega a su sitio: clonar y meter un nodo justo
  // entonces era un tropiezo en el peor momento.
  function prepararCopia(a) {
    const d = dock();
    if (a.copia && a.copia.isConnected) return;
    quitarCopia();
    const c = a.barra.cloneNode(true);
    c.removeAttribute('id');
    c.classList.add('m-dock-barra');
    c.style.display = 'none';
    // Hace lo mismo que la de verdad, sin copiar su manejador: si la
    // pantalla cambia lo que hace la barra, la copia lo sigue.
    c.onclick = (ev) => { ev.preventDefault(); if (_actual && _actual.barra) _actual.barra.click(); };
    d.appendChild(c);
    a.copia = c;
    _puesto.set(c, { display: 'none' });
  }

  function aLaVista() {
    for (const r of _regs.values()) {
      const pieza = r.pegado || r.barra;
      if (r.pantalla.isConnected && r.pantalla.classList.contains('on') && pieza && pieza.isConnected) return r;
    }
    return null;
  }

  // Las medidas que la CSS necesita para una lista con scroll propio.
  // Van en el <html> y por eso pasan por `raiz`: sólo se escriben si
  // cambian (al girar la pantalla, al abrir el teclado).
  function medidas(banda) {
    raiz('--m-dock-top', (banda + HUECO) + 'px');
    raiz('--m-banda', banda + 'px');
    raiz('--m-dock-rampa', RAMPA + 'px');
    raiz('--m-dock-bajo', BAJO + 'px');
    // Lo visible, no la pantalla: con el teclado abierto la lista
    // acaba encima de él y el último renglón se puede alcanzar.
    const vv = window.visualViewport;
    raiz('--m-vvh', Math.round(vv ? vv.height : window.innerHeight) + 'px');
  }

  // ── El título de la pantalla en el header ────────────────────────
  //
  // Un solo elemento en la banda, que cambia de texto según la pantalla.
  // Cuánto se ve lo dice --m-dock-q; la CSS hace el fundido con el logo.
  let _tituloEl = null;
  function tituloBanda(nombre, q) {
    const band = document.getElementById('mBand');
    if (!band) return;
    if (nombre == null) {
      band.classList.remove('m-con-titulo');
      est(band, '--m-dock-q', null);
      return;
    }
    if (!_tituloEl || !_tituloEl.isConnected) {
      _tituloEl = band.querySelector('.m-band-titulo');
      if (!_tituloEl) {
        _tituloEl = document.createElement('span');
        _tituloEl.className = 'm-band-titulo';
        _tituloEl.setAttribute('aria-hidden', 'true');
        band.appendChild(_tituloEl);
      }
    }
    if (_tituloEl.textContent !== nombre) _tituloEl.textContent = nombre;
    band.classList.add('m-con-titulo');
    est(band, '--m-dock-q', dos(q));
  }

  // ── Una segunda pieza pegada debajo de la primera ────────────────
  //
  // Orders → Sent: bajo las pestañas hay una fila con el buscador y el
  // botón de filtros, y Axel la quiere pegada también ("como en
  // inventory", 2026-11-09). Pero esa fila no es de la cabecera: la
  // pinta la SECCIÓN dentro de su contenido, más tarde y por su cuenta,
  // y cada sección tiene la suya o ninguna. Por eso se pide con una
  // función (`tambien`) y se mira cada vez que se mide, no al enganchar:
  // cuando la sección se pinta, cambia el contenido y eso hace medir.
  //
  // Se pega igual, con sticky, a la altura donde acaba la primera más
  // la separación que ya tenían. Aquí sí puede ir dentro de otro
  // elemento (el cuerpo de la sección): su padre dura toda la lista. Y
  // el desenfoque, que vive en la primera pieza, se alarga hasta debajo
  // de la segunda con --m-dock-mas.
  function segundaPieza(a) {
    const el = typeof a.tambien === 'function' ? a.tambien() : null;
    if (!el || !el.isConnected) { est(a.pegado, '--m-dock-mas', '0px'); return; }
    el.classList.add('m-dock-pegado');
    const ult = a.pegado.lastElementChild;
    const sep = (ult && parseFloat(getComputedStyle(ult).marginBottom)) || 0;
    const alto1 = a.pegado.getBoundingClientRect().height;
    est(el, 'top', (a.top + alto1 + sep) + 'px');
    est(a.pegado, '--m-dock-mas', (sep + el.getBoundingClientRect().height) + 'px');
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
  // Frenaba también en los extremos de la lista, y se quitó: cancelar el
  // primer movimiento de un toque bloquea en iOS el gesto ENTERO. (Lo
  // que de verdad impedía volver desde el final era otra cosa: el tirón
  // de recargar del armazón. Ver más abajo.)
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

  // ── Que el gesto sea siempre de la lista ─────────────────────────
  //
  // Al poner el dedo, si la lista está en un tope se la separa 1 px:
  // así un gesto nunca empieza en el borde, que es cuando iOS se lo
  // puede dar a la página de detrás. Ese píxel no cuenta como "bajado"
  // para el desenfoque (ver animar) ni para el tirón de recargar
  // (mobile-shell.js, dentroDeAlgoBajado).
  //
  // OJO, esto es una precaución y no un arreglo medido. Se puso creyendo
  // que la lista "bloqueada al final" era esa trampa de iOS, y no lo
  // era: era el tirón de recargar del armazón, que miraba sólo la
  // página (lo enseñó el video de Axel, 2026-11-09). Se deja porque es
  // inofensivo y la página puede moverse por detrás; si estorba, se
  // puede quitar sin miedo.
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

  // ── medir(): lo caro, pocas veces ────────────────────────────────
  function medir() {
    const a = aLaVista();
    if (a !== _actual) {
      soltar(_actual); quitarCopia(); _actual = a;
      // Al entrar en una pantalla con lista propia se empieza arriba,
      // como hace el armazón con la página (ir() → scrollTo 0).
      if (a && a.scroll) a.scroll.scrollTop = 0;
    }
    quieta(!!(a && a.scroll));
    if (!a || !a.pegado || !a.nombre) tituloBanda(null);
    if (!a) { soltar(null); return; }

    const banda = bordeBanda();
    a.banda = banda;
    a.top = banda + HUECO;
    if (a.scroll) medidas(banda);

    // Inventory y Orders: el bloque pegado y el título al header.
    if (a.pegado) {
      soltar(null);
      if (!a.nombre && !a.siempre) {
        // Sin nombre: la pantalla está en un nivel sin título ni bloque
        // que pegar (Orders dentro de un detalle, mientras la sección no
        // pide pegar nada con fijar()). Conserva la lista con su scroll,
        // y el header se queda con el logo, sin desenfoque.
        if (a.titulo) est(a.titulo, 'opacity', null);
        if (a.velo) est(a.velo, '--m-dock-o', '0');
        est(a.pegado, '--m-dock-mas', '0px');
        return;
      }
      segundaPieza(a);
      // Se mide la MARCA, no el bloque: el offsetTop de un elemento
      // sticky ya pegado incluye lo que se ha desplazado, y el recorrido
      // crecería con el scroll (lo enseñó el navegador: el fundido no
      // llegaba nunca).
      a.recorrido = Math.max(1, a.marca.offsetTop - a.top);
      return;
    }

    // Buscar: la barra fija; aquí sólo cuánto mide, para la CSS y para
    // el alto del desenfoque.
    if (a.fija) {
      const alto = a.barra.getBoundingClientRect().height;
      if (alto) raiz('--m-dock-barra-h', alto + 'px');
      est(dock(), 'height', (a.top + alto + BAJO) + 'px');
      return;
    }

    // Home: dónde están, EN REPOSO, la búsqueda y lo que se desvanece.
    const y = Math.max(0, window.scrollY || 0);
    const r = a.barra.getBoundingClientRect();
    a.reposo = r.top + y;
    a.fondos = a.desvanecer.map(el => (el && el.isConnected ? el.getBoundingClientRect().bottom + y : null));
    prepararCopia(a);
    est(a.copia, 'top', a.top + 'px');
    est(a.copia, 'left', r.left + 'px');
    est(a.copia, 'width', r.width + 'px');
    est(dock(), 'height', (a.top + r.height + BAJO) + 'px');
  }

  // ── animar(): lo de cada fotograma, sin medir ────────────────────
  //
  // El desenfoque del Home empieza a entrar ANTES pasos antes de que la
  // búsqueda llegue a su sitio, y el de Buscar en los primeros ENTRA px
  // de lista: ligados al scroll, no a un interruptor.
  const ANTES = 28;
  const ENTRA = 24;
  function animar() {
    const a = _actual;
    if (!a) return;

    if (a.pegado) {
      if (!a.nombre && !a.siempre) return;
      // p: cuánto falta para que el bloque se pegue (0 en reposo, 1
      // pegado). Los tres fundidos salen de p, escalonados para que no
      // se pisen: el título grande se va primero, el del header entra
      // después, y el desenfoque al final, cuando ya no queda título
      // grande que emborronar. Cada tramo va suavizado.
      // `siempre` (Inventory, Axel 2026-11-12): la pantalla entra ya
      // acoplada —el nombre en el header, el bloque pegado, el
      // desenfoque puesto— y así se queda. No hay título grande que
      // desvanecer ni recorrido que medir.
      const p = a.siempre ? 1 : entre(a.scroll.scrollTop / a.recorrido);
      // El grande ya no se ve cuando llega a la altura del logo: en el
      // navegador pasaba por detrás de él, los dos legibles a la vez.
      if (a.titulo) est(a.titulo, 'opacity', p <= 0 ? null : dos(1 - suave(entre(p / 0.6))));
      // Por variable y no con opacity en el contenedor: un contenedor
      // con opacidad se vuelve el fondo de sus capas, y dejarían de
      // desenfocar la lista para desenfocar el contenedor vacío. La CSS
      // se la pone a cada capa.
      if (a.velo) est(a.velo, '--m-dock-o', dos(suave(entre((p - 0.6) / 0.4))));
      // Un bloque pegado desde fijar() no trae nombre: el del header lo
      // pone el armazón (enBanda), y éste no tiene que ponerle otro.
      tituloBanda(a.nombre || null, suave(entre((p - 0.25) / 0.75)));
      return;
    }

    if (a.fija) {
      // Desde 1 px y no desde 0: el píxel de alTocar no es haber bajado.
      const bajado = a.scroll ? a.scroll.scrollTop : (window.scrollY || 0);
      velar(suave(entre((bajado - 1) / ENTRA)), bajado > 1);
      return;
    }

    // Home.
    const y = Math.max(0, window.scrollY || 0);
    const arriba = a.reposo - y;              // dónde va ahora la búsqueda
    const acoplado = arriba <= a.top;
    velar(suave(entre((a.top + ANTES - arriba) / ANTES)), acoplado);
    est(a.copia, 'display', acoplado ? '' : 'none');
    est(a.barra, 'visibility', acoplado ? 'hidden' : null);

    // Lo que se desvanece. Se mide por lo que se ha bajado, no por la
    // distancia al header: entero arriba del todo, e invisible cuando
    // su borde de abajo llega al header. Antes se medía por la distancia
    // (empezaba a irse 16 px antes del borde) y en el iPhone de Axel el
    // saludo queda a pocos px de él YA EN REPOSO: salía a 0.65 sin haber
    // bajado nada, "debajo de un velo". Cómo de cerca quede del header
    // depende del teléfono; lo que se ha bajado, no.
    for (let i = 0; i < a.desvanecer.length; i++) {
      const el = a.desvanecer[i], fondo = a.fondos[i];
      if (!el || fondo == null) continue;
      const recorrido = fondo - a.banda;      // lo que hay que bajar
      if (y <= 0 || recorrido <= 0) { est(el, 'opacity', null); continue; }
      const o = 1 - suave(entre(y / recorrido));
      est(el, 'opacity', o >= 1 ? null : dos(o));
    }
  }

  // Las dos cosas, ya. Lo llama enganchar, y lo puede llamar una
  // pantalla (`medir`) si cambia su geometría sin repintarse.
  function actualizar() { medir(); animar(); }

  // Un cálculo por fotograma, aunque lleguen varios avisos en el mismo.
  // `medirTambien` lo piden los avisos de que la geometría pudo cambiar;
  // el scroll no.
  let _programado = false, _hayQueMedir = false;
  function tic() {
    const m = _hayQueMedir;
    _programado = false; _hayQueMedir = false;
    // Una comprobación barata por si se cambió de pantalla y el aviso
    // aún no ha llegado: animar la pantalla que ya no está sería peor
    // que medir una vez de más.
    const a = _actual;
    if (m || !a || !a.pantalla.classList.contains('on')) medir();
    animar();
  }
  function pedir(medirTambien) {
    if (medirTambien === true) _hayQueMedir = true;
    if (_programado) return;
    _programado = true;
    (window.requestAnimationFrame || ((f) => setTimeout(f, 16)))(tic);
  }
  const pedirMedir = () => pedir(true);
  const alScroll = () => pedir(false);

  // La pantalla lo llama cada vez que se pinta: un repintado (refresh)
  // cambia los elementos, y la copia tiene que apuntar a los nuevos.
  function enganchar(o) {
    if (!o || !o.pantalla || !(o.barra || (o.pegado && o.scroll))) return;
    const viejo = _regs.get(o.pantalla);
    if (viejo && viejo.barra && viejo.barra !== o.barra) est(viejo.barra, 'visibility', null);
    const eraElActual = viejo === _actual;
    if (eraElActual) quitarCopia();
    const r = { pantalla: o.pantalla, barra: o.barra || null, desvanecer: o.desvanecer || [], fija: !!o.fija,
      scroll: (o.fija || o.pegado) && o.scroll ? o.scroll : null, copia: null,
      pegado: o.pegado || null, titulo: o.titulo || null, nombre: o.nombre || '', velo: null, marca: null,
      siempre: !!o.siempre,
      tambien: o.tambien || null };
    if (r.fija) o.barra.classList.add('m-dock-fija');
    if (r.scroll && !r.scroll.classList.contains('m-dock-scroll')) {
      r.scroll.classList.add('m-dock-scroll');
      r.scroll.addEventListener('scroll', alScroll, { passive: true });
    }
    if (r.pegado) {
      r.scroll.classList.add('m-dock-con-titulo');
      // Acoplada desde el principio, el hueco de arriba mide justo hasta
      // donde se pega el bloque (ver .m-dock-siempre en mobile-app.css).
      // Con el hueco normal, 6 px más alto, las pestañas entraban más
      // abajo y subían al primer scroll; Axel: "el header debe estar
      // fijo". Se pone y se quita en cada enganche: Orders engancha la
      // misma lista sin `siempre` dentro de un detalle.
      r.scroll.classList.toggle('m-dock-siempre', r.siempre);
      r.pegado.classList.add('m-dock-pegado');
      // El desenfoque, dentro del bloque y lo primero: detrás de las
      // pestañas y del filtro. Una vez; un repintado no lo duplica.
      r.velo = r.pegado.querySelector(':scope > .m-dock-velo');
      if (!r.velo) {
        r.velo = document.createElement('span');
        r.velo.className = 'm-dock-velo m-dock-esc';
        r.velo.setAttribute('aria-hidden', 'true');
        r.velo.innerHTML = ESCALERA;
        r.pegado.insertBefore(r.velo, r.pegado.firstChild);
      }
      // Una marca sin alto justo antes del bloque: dice dónde está el
      // bloque EN REPOSO, que el bloque mismo deja de saberlo al pegarse.
      r.marca = r.pegado.previousElementSibling;
      if (!r.marca || !r.marca.classList.contains('m-dock-marca')) {
        r.marca = document.createElement('span');
        r.marca.className = 'm-dock-marca';
        r.marca.setAttribute('aria-hidden', 'true');
        r.pegado.parentNode.insertBefore(r.marca, r.pegado);
      }
    }
    // Si era la pantalla a la vista, sigue siéndolo: que el cambio de
    // enganche no se tome por "acabo de entrar" y devuelva la lista arriba.
    if (eraElActual) _actual = r;
    _regs.set(o.pantalla, r);
    vigilarPantallas(o.pantalla.parentNode);
    actualizar();
  }

  // ── Un bloque de un detalle, pegado bajo el header ───────────────
  //
  // Orders › Sent e Invoices, dentro de una orden o de una factura (Axel,
  // 2026-11-12): el nombre va a la banda con el armazón (enBanda) y lo
  // que tiene que quedarse —Resend / Reopen, o los tres totales— se pega
  // bajo el header desde que entras, con el mismo desenfoque que las
  // pestañas. Lo pide la sección cada vez que pinta, porque su bloque es
  // nuevo en cada pintado.
  //
  // La pantalla y la lista salen del propio bloque: la sección sólo
  // conoce su cuerpo, y la lista con scroll es de Orders (la enganchó
  // Orders antes, y por eso ya lleva .m-dock-scroll). Sin ella no hay
  // nada que pegar: fuera de Orders, el bloque se queda donde está.
  function fijar(el) {
    const pantalla = el && el.closest && el.closest('.m-screen');
    const scroll = el && el.closest && el.closest('.m-dock-scroll');
    if (!pantalla || !scroll) return;
    enganchar({ pantalla, scroll, pegado: el, siempre: true });
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
    new MutationObserver(pedirMedir).observe(caja, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }

  window.addEventListener('scroll', alScroll, { passive: true });
  window.addEventListener('resize', pedirMedir);
  // El teclado no cambia la ventana en iOS, cambia lo visible.
  if (window.visualViewport) window.visualViewport.addEventListener('resize', pedirMedir);
  // Al poner el dedo, una medida por gesto: si algo movió la geometría
  // sin avisar (una letra que acaba de cargar, un tamaño de texto), el
  // scroll que viene ya la tiene bien.
  document.addEventListener('touchstart', pedirMedir, { passive: true });

  window.BarStockBandDock = { enganchar, fijar, actualizar, medir: actualizar, HUECO, RAMPA, BAJO };
})();
