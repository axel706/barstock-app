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
 * el domingo sus tres pasos, el conteo un anillo y el transfer de dónde
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
    const B = window.BarStockBottleProfiles;
    const W = 40, H = 72, P = 3;
    return '<div class="m-hc-bots">' + (items || []).slice(0, 4).map((x, i) => {
      const k = B ? B.resolveKey(x.forma || 'generic') : 'generic';
      let svg = '';
      if (B && B.pathFor) {
        const d = B.pathFor(k, W, H, P);
        const f = Math.max(0, Math.min(1, Number(x.lleno) || 0));
        const y = B.yToPx(k, B.heightFor(k, f), W, H, P);
        const id = 'mhcB' + i;
        svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><defs><clipPath id="' + id + '"><path d="' + d +
              '"/></clipPath></defs><path class="m-hc-vid" d="' + d + '"/><g clip-path="url(#' + id + ')">' +
              '<rect class="m-hc-liq" x="0" y="' + num(y, 1) + '" width="' + W + '" height="' + H + '"/></g></svg>';
      }
      return '<div class="m-hc-bot">' + svg + '<b>' + esc(x.dia) + '</b><small>' + esc(x.nombre) + '</small></div>';
    }).join('') + '</div>';
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

  // ── Counting: el anillo ─────────────────────────────────────────────
  // `pct` (0..1, o null si no hay conteo anterior con qué comparar),
  // `centro` (lo que va dentro), `filas`: [[nombre, valor]], `chips`.
  function anillo(o) {
    const r = 30, c = 2 * Math.PI * r;
    const p = o.pct == null ? null : Math.max(0, Math.min(1, o.pct));
    const svg = '<svg class="m-hc-ring" viewBox="0 0 78 78" aria-hidden="true">' +
      '<circle cx="39" cy="39" r="' + r + '" class="fondo"/>' +
      (p == null ? '' : '<circle cx="39" cy="39" r="' + r + '" class="arco" stroke-dasharray="' + num(c * p, 1) + ' ' + num(c, 1) +
        '" transform="rotate(-90 39 39)"/>') +
      '<text x="39" y="44" text-anchor="middle">' + esc(o.centro) + '</text></svg>';
    return '<div class="m-hc-cnt">' + svg + '<div class="m-hc-dat">' +
      (o.filas || []).map(f => '<div><span>' + esc(f[0]) + '</span><b>' + esc(f[1]) + '</b></div>').join('') +
      ((o.chips || []).length ? '<div><span>Not yet</span><b>' + o.chips.map(z => '<i class="m-hc-chip">' + esc(z) + '</i>').join('') + '</b></div>' : '') +
      '</div></div>';
  }

  // ── Transfer: de dónde a dónde ──────────────────────────────────────
  function traslado(o) {
    return '<div class="m-hc-tr"><div class="m-hc-loc"><u>From</u><b>' + esc(o.de) + '</b></div>' +
      '<span class="m-hc-fl" aria-hidden="true">→</span>' +
      '<div class="m-hc-loc"><u>To</u><b>' + esc(o.a) + '</b></div></div>' +
      '<div class="m-hc-trq"><b>' + esc(o.cantidad) + '</b><span>' + esc(o.producto) + '</span></div>';
  }

  window.BarStockHomeCartas = { botellas, proveedores, llegadas, pista, pasos, anillo, traslado, esc };
})();
