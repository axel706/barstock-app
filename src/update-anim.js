(() => {
  if (window.BarStockUpdateAnim) return;

  // ── La animación de actualizar ───────────────────────────────────────
  //
  // Antes, al tocar "Update", la app hacía location.reload() en seco: la
  // pantalla se iba a negro mientras bajaba la versión nueva y luego
  // aparecía el Home de golpe. Axel: "no me gusta que haya un apagón".
  //
  // El diseño que eligió (opción C, sobre lámina): toda la interfaz se
  // contrae en el punto azul de BarStock; aparece el logo entero con
  // "Updating to BUILD-…" y una barra; cuando la barra se completa, el
  // punto vuelve al centro, pulsa y se abre otra vez en la interfaz, y
  // con el Home de vuelta sube la hoja What's new.
  //
  // Son dos páginas distintas y por eso son dos mitades:
  //
  //   salir()   en la página vieja: contrae, enseña el logo, deja la
  //             marca `barstock.updatingTo` y recarga.
  //   llegar()  en la página nueva: el <head> de index.html ya pintó el
  //             fotograma del logo desde el primer píxel (si no, se vería
  //             el negro que esto vino a quitar). Aquí sólo se termina:
  //             barra llena, punto al centro, pulso, se abre.
  //
  // La barra no se llena antes de tiempo: en la página nueva avanza
  // sola hacia el 90 % y sólo llega al 100 % cuando auth.js dice que la
  // app está debajo (__bsUpdListo). Con red lenta se queda casi al final.
  //
  // El círculo que se cierra y se abre es un "iris": un elemento redondo
  // en el centro, transparente por dentro, con una sombra del color del
  // fondo que tapa todo lo demás. No se toca ni se escala el <body>: un
  // transform en él rompe todo lo `position: fixed` de la app.

  const T = {
    cierra: 380,   // la interfaz se contrae en el punto
    punto: 160,    // queda el punto solo
    logo: 300,     // aparece el logo y el punto viaja a su sitio
    // La pantalla del logo y la barra. Con 700 ms y 240 ms, en el
    // teléfono de Axel pasaba demasiado rápido ("esa pantalla en
    // particular debe durar un poco más"); lo de antes y lo de después
    // le parecieron bien y no se tocaron. Luego, con 1.8 s: "que dure
    // unos 2 o 3 segundos más, que se entienda como un update de
    // verdad" (2026-11-09). La barra de auth.css avanza durante toda
    // esta espera, no sólo al principio.
    minimo: 4300,  // lo mínimo que el logo se ve en la página nueva
    llena: 600,    // la barra termina
    vuelve: 280,   // el logo se va y el punto vuelve al centro
    pulso: 280,
    abre: 480
  };
  const SELLO = /^\d{8}-\d{6}$/;
  const MARCA = 'barstock.updatingTo';

  const quieto = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const espera = (ms) => new Promise(r => setTimeout(r, quieto() ? 0 : ms));
  const cuadro = () => new Promise(r => {
    const raf = window.requestAnimationFrame || (f => setTimeout(f, 16));
    raf(() => raf(r));
  });

  // El fotograma del logo lo define el <head> de index.html
  // (__bsUpdMarcado), el mismo que pinta la llegada: la salida y la
  // llegada tienen que coincidir o se nota el corte.
  const marcado = (build) => window.__bsUpdMarcado ? window.__bsUpdMarcado(build) : null;

  // El hueco del iris, abierto del todo, es la diagonal de la pantalla:
  // ni un píxel más, o el cierre pasa fuera de la pantalla y se ve de golpe.
  //
  // El círculo sale de --cy, que puede no ser el centro exacto de la
  // ventana: se le suma el doble del desfase para que ninguna esquina
  // quede sin cubrir.
  function aLaDiagonal(o) {
    const cy = parseFloat(o.style.getPropertyValue('--cy'));
    const desfase = isNaN(cy) ? 0 : Math.abs(cy - window.innerHeight / 2);
    o.style.setProperty('--grande', Math.ceil(Math.hypot(window.innerWidth, window.innerHeight) + desfase * 2) + 2 + 'px');
  }

  // Dónde cae el punto del logo, medido desde el centro de la pantalla.
  // El punto suelto viaja entre el centro y ese sitio.
  // El centro vertical es --cy (lo fija el <head>), no la mitad de la
  // ventana: la ventana cambia de alto al arrancar y el punto se iría a
  // otro sitio que el logo.
  function alPuntoDelLogo(o) {
    const d = o.querySelector('.bu-logo-dot');
    if (!d) return;
    const r = d.getBoundingClientRect();
    const cy = parseFloat(o.style.getPropertyValue('--cy')) || window.innerHeight / 2;
    o.style.setProperty('--dx', (r.left + r.width / 2 - window.innerWidth / 2) + 'px');
    o.style.setProperty('--dy', (r.top + r.height / 2 - cy) + 'px');
  }

  // ── La salida, en la página vieja ──────────────────────────────────
  async function salir(build, recargar) {
    const seguir = typeof recargar === 'function' ? recargar : () => window.location.reload();
    // Sin un sello que enseñar no hay nada que animar: se recarga como
    // antes. Mejor eso que un "Updating to BUILD-undefined".
    if (!SELLO.test(String(build || '')) || document.getElementById('bsUpd')) return seguir();
    const html = marcado(build);
    if (!html) return seguir();

    const h = document.documentElement;
    const o = document.createElement('div');
    o.id = 'bsUpd';
    o.className = 'bu-sale';
    o.setAttribute('aria-hidden', 'true');
    // La misma altura de centro que usará la página nueva al llegar: si
    // no coincidieran, el logo daría un salto en la recarga.
    if (window.__bsUpdCentro) o.style.setProperty('--cy', window.__bsUpdCentro());
    o.innerHTML = html;
    aLaDiagonal(o);
    h.appendChild(o);
    h.classList.add('bs-upd');

    await cuadro();
    o.classList.add('cierra');
    await espera(T.cierra);
    o.classList.add('punto');
    await espera(T.punto);
    alPuntoDelLogo(o);
    o.classList.add('logo');
    await espera(T.logo);
    o.classList.add('en-logo');

    // La marca justo antes de recargar: si se dejara antes y algo
    // fallara a mitad, la próxima vez que se abriera la app saldría la
    // animación de una actualización que no pasó.
    try { sessionStorage.setItem(MARCA, build); } catch (e) {}
    seguir();
  }

  // ── La llegada, en la página nueva ─────────────────────────────────
  async function llegar() {
    const u = window.__bsUpd;
    const o = document.getElementById('bsUpd');
    if (!u || !o || u.saliendo) return;
    u.saliendo = true;

    const falta = T.minimo - (Date.now() - (u.t0 || 0));
    if (falta > 0) await espera(falta);

    // La barra avanza con una animación CSS hacia el 90 %. Quitarle la
    // animación sin más la devolvería al 35 % de golpe antes de llenarse:
    // se congela donde va y desde ahí se llena.
    const i = o.querySelector('.bu-barra i');
    if (i) {
      i.style.width = getComputedStyle(i).width;
      i.style.animation = 'none';
      void i.offsetWidth;
      i.style.transition = quieto() ? 'none' : 'width ' + T.llena + 'ms ease-out';
      i.style.width = '100%';
    }
    await espera(T.llena);

    // El punto suelto aparece justo encima del del logo, sin transición,
    // y desde ahí vuelve al centro mientras el logo se apaga.
    alPuntoDelLogo(o);
    o.classList.add('flota');
    await cuadro();
    o.classList.add('vuelve');
    await espera(T.vuelve);
    o.classList.add('pulso');
    await espera(T.pulso);
    aLaDiagonal(o);
    o.classList.add('abre');
    await espera(T.abre);

    o.remove();
    document.documentElement.classList.remove('bs-upd');
    if (u.soltarFoco) u.soltarFoco();

    // TEMPORAL: el rastro que anotó el <head> (ver index.html), al log
    // de la app. Se quita cuando se sepa por qué brinca el logo.
    if (u.rastro && window.BarStockLogger && window.BarStockLogger.log) {
      try { window.BarStockLogger.log('update_anim_rastro', { build: u.build, rastro: u.rastro }); } catch (e) {}
    }

    // Con el Home de vuelta, la hoja de lo que trae. Una sola vez: la
    // marca ya se borró en el <head>, y esto solo corre si había marca.
    const C = window.BarStockVersionCenter;
    if (C && C.novedades) { try { C.novedades(u.build); } catch (e) {} }
  }

  window.BarStockUpdateAnim = { salir, llegar, T };

  // auth.js pudo contestar antes de que este archivo cargara: la llamada
  // ya pasó y llegar() no corrió. Se hace ahora.
  if (window.__bsUpd && window.__bsUpd.listo) llegar();
})();
