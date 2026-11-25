(() => {
  if (window.BarStockDeskRunningOut) return;

  // ── Running out en el escritorio (Axel, 2026-11-25, lámina A) ────────
  //
  // La sección de la barra lateral (antes "Soon"): todo lo que se acaba
  // antes del domingo, una fila ancha por producto, con las acciones del
  // teléfono: "Add N to list", "I have enough" (el teclado, como ventana),
  // Undo / Change y "Edit order" para fijar arriba arrastrando el ≡.
  //
  // No hay una segunda pantalla: es la del teléfono
  // (BarStockRunningOutReview, mobile-running-out.js) abierta con
  // { escritorio: true } dentro de una .section-card, que bsOpenSection
  // enseña como a las demás (por su id, runningOutSection). Sus estilos
  // salen GENERADOS de los del teléfono (tools/compartir-ficha.js →
  // styles/desk-ficha.css, colgados de #dkRo) y el reparto en una fila
  // ancha está en styles/desk-running-out.css.

  let _sec = null;

  const R = () => window.BarStockRunningOutReview;

  function abierta() { return !!(_sec && _sec.classList.contains('bs-active-section')); }

  // Se monta al abrir la sección y se suelta al salir: así no escucha al
  // LIVE ni lee la lista mientras no se ve.
  function alCambiar() {
    const host = _sec && _sec.querySelector('#dkRo');
    if (!host || !R()) return;
    if (abierta()) {
      if (!host.firstElementChild) R().abrir(host, { escritorio: true });
    } else if (host.firstElementChild) {
      R().cerrar();
      host.innerHTML = '';
    }
  }

  // La sección existe ANTES de que arranque desk-shell.js (este archivo
  // se carga justo antes que él): el armazón vigila las .section-card que
  // encuentra al montar para encender su renglón, y una que naciera
  // después se quedaría sin encender. Sin esperar a .dk: en el teléfono
  // es una .section-card más, escondida como todas mientras no se abre.
  function montar() {
    if (_sec) return;
    const wrap = document.querySelector('.wrap');
    if (!wrap) return;
    _sec = document.createElement('section');
    _sec.className = 'card section-card dk-ro-sec';
    _sec.id = 'runningOutSection';
    _sec.innerHTML = '<h2 class="dk-ro-t">Running out</h2><div id="dkRo"></div>';
    wrap.appendChild(_sec);
    new MutationObserver(alCambiar).observe(_sec, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.querySelector('.wrap')) montar();
  else document.addEventListener('DOMContentLoaded', montar);

  window.BarStockDeskRunningOut = { montar, abierta };
})();
