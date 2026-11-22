// ── Los fondos animados del teléfono ─────────────────────────────────
//
// Axel, 2026-11-22: "¿podemos generar uno animado? Colores que se muevan
// detrás del blur". Sobre lámina eligió los tres (Aurora, Liquid, Bokeh):
// "al final del día, si hay mucho lag, pongo uno estático y listo".
//
// El fondo de siempre es una foto en #bgLayer que el velo del teléfono
// (body.m-shell::after, mobile-app.css) desenfoca con backdrop-filter. Si
// lo de detrás se mueve, ese desenfoque se rehace sobre la pantalla
// entera en CADA fotograma: el mismo tipo de costo que daba lag al rodar
// las listas. Por eso estos fondos ya son suaves de por sí (degradados
// radiales y cónicos, sin blur que calcular), se mueven sólo con
// transform (lo hace la tarjeta gráfica) y, con uno puesto, el body lleva
// `fondo-vivo` y el velo va SIN backdrop-filter. Se ve igual de borroso
// y no cuesta.
//
// Se guardan como un nombre ("anim:aurora") en la misma columna que las
// fotos (locations.mobile_background_src): src/fondo.js decide si
// pintar una imagen o llamar aquí. El catálogo, con su miniatura, vive en
// src/backgrounds.js.
//
// Con la app escondida, `fondo-pausa` detiene la animación (no gasta
// batería en segundo plano); con "reducir movimiento", el CSS la deja
// quieta.
(function () {
  if (window.BarStockFondoVivo) return;

  // Las luces de Bokeh, siempre las mismas (el dibujo no cambia de una
  // carga a otra): [izquierda %, tamaño en vmin, color, opacidad, segundos].
  // Arrancan bajo la pantalla y suben de punta a punta; el retraso
  // negativo las reparte para que siempre haya varias a la vista.
  const LUCES = [[8, 30, '56,189,248', .7, 30], [62, 38, '52,211,153', .6, 38], [30, 26, '168,85,247', .65, 28],
    [78, 28, '56,189,248', .55, 34], [45, 36, '52,211,153', .55, 42], [15, 24, '14,165,233', .7, 26],
    [85, 34, '168,85,247', .55, 46], [52, 22, '56,189,248', .65, 24], [25, 30, '52,211,153', .6, 36],
    [70, 26, '14,165,233', .65, 31]];

  const DIBUJOS = {
    aurora: () => '<div class="fv fv-aurora">' +
      '<span class="fv-mancha fv-a1"></span><span class="fv-mancha fv-a2"></span>' +
      '<span class="fv-mancha fv-a3"></span><span class="fv-mancha fv-a4"></span></div>',
    liquid: () => '<div class="fv fv-liquid"><span class="fv-giro"><span class="fv-remolino"></span></span></div>',
    bokeh: () => '<div class="fv fv-bokeh">' + LUCES.map(([x, d, c, o, t], i) =>
      '<span class="fv-luz" style="left:' + x + '%;width:' + d + 'vmin;height:' + d + 'vmin;margin-left:-' + (d / 2) + 'vmin;' +
      'background:radial-gradient(closest-side,rgba(' + c + ',' + o + '),rgba(' + c + ',0));' +
      'animation-duration:' + t + 's;animation-delay:-' + (t * i / LUCES.length).toFixed(1) + 's"></span>').join('') + '</div>'
  };

  // ¿Es un fondo animado (que existe)? "anim:aurora" → 'aurora'.
  function nombre(src) {
    const m = /^anim:([a-z]+)$/.exec(String(src || ''));
    return m && DIBUJOS[m[1]] ? m[1] : null;
  }

  function pintar(capa, src) {
    const n = nombre(src);
    if (!capa || !n) return false;
    capa.innerHTML = DIBUJOS[n]();
    document.body.classList.add('fondo-vivo');
    return true;
  }

  function quitar(capa) {
    if (capa) capa.innerHTML = '';
    document.body.classList.remove('fondo-vivo');
  }

  // Escondida, en pausa: un fondo que nadie ve no tiene por qué moverse.
  function pausa() { document.body.classList.toggle('fondo-pausa', !!document.hidden); }
  document.addEventListener('visibilitychange', pausa);

  window.BarStockFondoVivo = { nombre, pintar, quitar };
})();
