/*
 * ── Las tarjetas del carrusel, cada una con su dibujo ────────────────
 *
 * Axel, 2026-11-21, sobre lámina ("una tarjeta para cada tarea"): hasta
 * aquí todas las tarjetas del Home eran la misma plantilla con otras
 * palabras —encabezado, título, tres renglones y botón— y "no has
 * creado tarjetas adaptadas al contenido que deben mostrar". Cada una
 * dibuja ahora lo suyo: Running out las botellas con su nivel (R2), las
 * órdenes una columna por proveedor con su logo, las colocadas la
 * semana con cada logo en su día de entrega, el ciclo sus siete días,
 * el domingo sus tres pasos, el conteo sus tres cifras y el transfer de dónde
 * a dónde.
 *
 * Aquí sólo se DIBUJA: cada función recibe datos ya calculados (los
 * calcula mobile-home.js, con los mismos módulos de siempre) y devuelve
 * el HTML del cuerpo. Así cada dibujo se prueba solo, y lo que dice la
 * tarjeta sigue saliendo de un único sitio. El encabezado, el pie y los
 * botones los pone la plantilla de siempre (pintarTarjeta), igual para
 * todas.
 *
 * Todo texto que llega se escapa aquí: nombres de productos, de
 * proveedores y de locaciones vienen de fuera.
 */
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = (n, d) => (Number(n) || 0).toFixed(d == null ? 1 : d);

  // ── Running out: las botellas (lámina R2) ───────────────────────────
  //
  // Cada producto con SU silueta (la del conteo) llena hasta lo que hay
  // contra su par, y debajo el día en que se acaba y el nombre. Lleno
  // contra el par y no contra una botella: con 1.4 botellas una sola
  // silueta saldría llena y no diría que se acaba; contra el par, una
  // que está muy por debajo se ve casi vacía, que es lo que avisa.
  // `items`: [{ forma, lleno (0..1), dia, nombre }], como mucho cuatro.
  function botellas(items) {
    return '<div class="m-hc-bots">' + (items || []).slice(0, 4).map((x, i) =>
      '<div class="m-hc-bot">' + silueta(x.forma, x.lleno, 'mhcB' + i) + '<b>' + esc(x.dia) + '</b><small>' + esc(x.nombre) + '</small></div>'
    ).join('') + '</div>';
  }

  // La silueta sola, llena hasta `lleno` (0..1). La usan las botellas de
  // aquí y la tarjeta de Running out del escritorio (desk-home.js, lámina
  // A del 2026-11-25), que pone su número debajo: una sola forma de
  // dibujarla. `id` es el del recorte y tiene que ser único en la página.
  // El contorno y el nivel se recuerdan por forma: calcularlos son ~10 ms
  // (120 puntos del contorno, y 40 vueltas de integrar el volumen para el
  // nivel), y el Inventory del escritorio dibuja una por fila en cada
  // pintado: con 220 filas, cada clic tardaba 2 s. La llave es el PERFIL
  // (WeakMap): si llega una forma nueva o cambia una, es otro objeto y se
  // calcula de nuevo. El nivel va redondeado a milésimas (menos de una
  // décima de píxel).
  const _memo = new WeakMap();
  function calculo(B, k) {
    const prof = B.get ? B.get(k) : null;
    let m = prof ? _memo.get(prof) : null;
    if (!m) { m = { d: null, ys: new Map() }; if (prof) _memo.set(prof, m); }
    return m;
  }
  function silueta(forma, lleno, id) {
    const B = window.BarStockBottleProfiles;
    if (!B || !B.pathFor) return '';
    const W = 40, H = 72, P = 3;
    const k = B.resolveKey(forma || 'generic');
    const m = calculo(B, k);
    const d = m.d || (m.d = B.pathFor(k, W, H, P));
    const f = Math.round(Math.max(0, Math.min(1, Number(lleno) || 0)) * 1000) / 1000;
    let y = m.ys.get(f);
    if (y === undefined) { y = B.yToPx(k, B.heightFor(k, f), W, H, P); m.ys.set(f, y); }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><defs><clipPath id="' + id + '"><path d="' + d +
           '"/></clipPath></defs><path class="m-hc-vid" d="' + d + '"/><g clip-path="url(#' + id + ')">' +
           '<rect class="m-hc-liq" x="0" y="' + num(y, 1) + '" width="' + W + '" height="' + H + '"/></g></svg>';
  }

  // ── Orders waiting: una columna por proveedor ───────────────────────
  // `total` y `botellas` arriba; `provs`: [{ nombre, dinero, detalle }],
  // como mucho cuatro. El logo lo pone vendor-logo.js (o sus iniciales).
  function proveedores(o) {
    const VL = window.BarStockVendorLogo;
    const ps = (o.provs || []).slice(0, 4);
    return '<div class="m-hc-tot"><b>' + esc(o.total) + '</b><span>' + esc(o.botellas) + '</span></div>' +
      '<div class="m-hc-provs" style="grid-template-columns:repeat(' + Math.max(1, ps.length) + ',1fr)">' +
      ps.map(p => '<div class="m-hc-pv">' + (VL ? VL.html(p.nombre) : '') + '<b>' + esc(p.dinero) + '</b><small>' +
        esc(p.detalle) + '</small></div>').join('') + '</div>';
  }

  // ── Orders placed: la semana con cada llegada ───────────────────────
  // `dias`: siete [{ u: 'Tue', hoy, provs: ['LOOP', …] }]; `siguiente`:
  // la próxima llegada en palabras.
  function llegadas(o) {
    const VL = window.BarStockVendorLogo;
    return '<div class="m-hc-sem">' + (o.dias || []).map(d =>
      '<div class="m-hc-d7' + (d.hoy ? ' hoy' : '') + ((d.provs || []).length ? ' on' : '') + '">' +
        '<span class="lg">' + (d.provs || []).slice(0, 2).map(v => VL ? VL.html(v) : '').join('') + '</span>' +
        '<i></i><u>' + esc(d.u) + '</u></div>').join('') + '</div>' +
      (o.siguiente ? '<div class="m-hc-uno"><b>Next:</b> ' + esc(o.siguiente) + '</div>' : '');
  }

  // ── Cycle open: los siete días del ciclo ────────────────────────────
  // `titulo` (grande) y `sub`; `dias`: [{ u, hecho, hoy }].
  function pista(o) {
    return '<div class="m-hc-big">' + esc(o.titulo) + (o.sub ? ' <small>' + esc(o.sub) + '</small>' : '') + '</div>' +
      '<div class="m-hc-pista">' + (o.dias || []).map(d =>
        '<i class="' + (d.hoy ? 'hoy' : d.hecho ? 'on' : '') + '"></i>').join('') + '</div>' +
      '<div class="m-hc-pistal">' + (o.dias || []).map(d =>
        '<span' + (d.hoy ? ' class="hoy"' : '') + '>' + esc(d.u) + '</span>').join('') + '</div>';
  }

  // ── Load the count: los tres pasos ──────────────────────────────────
  // `pasos`: [{ u, t, estado: 'ok' | 'now' | '' }]; `linea` debajo.
  function pasos(o) {
    return '<div class="m-hc-pasos">' + (o.pasos || []).map(p =>
      '<div class="m-hc-paso' + (p.estado ? ' ' + p.estado : '') + '"><u>' + esc(p.u) + '</u>' + esc(p.t) + '</div>').join('') +
      '</div>' + (o.linea ? '<div class="m-hc-uno">' + esc(o.linea) + '</div>' : '');
  }

  // ── Counting: tres columnas (lámina D, Axel 2026-11-21) ─────────────
  // Botellas, tiempo y lo que falta, del mismo tamaño y separadas por una
  // línea fina, como las tres cifras de arriba del Home. Primero fue un
  // anillo con renglones al lado: todo se amontonaba a la izquierda, el
  // tiempo desapareció y sin conteo anterior quedaba "Left —" sobre un
  // hueco ("ninguno está bien distribuido").
  // `cols`: [{ n, u, l }] (dos o tres); `pct` (0..1) dibuja la barra
  // hacia el último conteo, null sin conteo anterior; `chips`, lo que
  // aún no se ha pisado.
  function columnas(o) {
    const cs = (o.cols || []).slice(0, 3);
    const p = o.pct == null ? null : Math.max(0, Math.min(1, o.pct));
    // Centrado en el cuerpo: sin conteo anterior no hay barra y lo de
    // arriba dejaba un hueco abajo.
    return '<div class="m-hc-centro"><div class="m-hc-tres" style="grid-template-columns:repeat(' + Math.max(1, cs.length) + ',1fr)">' +
      cs.map(c => '<div class="m-hc-col"><b>' + esc(c.n) + (c.u ? '<u>' + esc(c.u) + '</u>' : '') + '</b> <span>' + esc(c.l) + '</span></div>').join('') +
      '</div>' +
      (p == null ? '' : '<div class="m-hc-barra"><i style="width:' + Math.round(p * 100) + '%"></i></div>') +
      ((o.chips || []).length ? '<div class="m-hc-zonas">Not yet ' + o.chips.map(z => '<i class="m-hc-chip">' + esc(z) + '</i>').join('') + '</div>' : '') + '</div>';
  }

  // ── Transfer: de dónde a dónde ──────────────────────────────────────
  function traslado(o) {
    return '<div class="m-hc-tr"><div class="m-hc-loc"><u>From</u><b>' + esc(o.de) + '</b></div>' +
      '<span class="m-hc-fl" aria-hidden="true">→</span>' +
      '<div class="m-hc-loc"><u>To</u><b>' + esc(o.a) + '</b></div></div>' +
      '<div class="m-hc-trq"><b>' + esc(o.cantidad) + '</b><span>' + esc(o.producto) + '</span></div>';
  }

  window.BarStockHomeCartas = { botellas, silueta, proveedores, llegadas, pista, pasos, columnas, traslado, esc };
})();
