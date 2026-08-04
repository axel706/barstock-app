(() => {
  if (window.BarStockSkeleton) return;

  // Deliberadamente SIN estado interno ni banderas de "cargando".
  // Los esqueletos se escriben directo en el innerHTML del contenedor
  // y el render() normal los sobreescribe cuando llegan los datos.
  // Asi no existe forma de que se queden pegados por un flag que
  // nunca se limpio, que es como suelen fallar estas cosas.

  const WIDTHS = ['bs-skel-w1', 'bs-skel-w2', 'bs-skel-w3', 'bs-skel-w4'];

  function w(i) {
    return WIDTHS[i % WIDTHS.length];
  }

  // Filas de tabla. Se le pasa el id del tbody, cuantas columnas
  // tiene la tabla y cuantas filas falsas pintar.
  function tableRows(tbodyId, columns, rows) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const count = rows || 6;
    let html = '';

    for (let r = 0; r < count; r++) {
      html += '<tr class="bs-skel-row">';
      for (let c = 0; c < columns; c++) {
        // La ultima columna suele ser una accion o un numero corto
        const isLast = c === columns - 1;
        html += isLast
          ? '<td><span class="bs-skel bs-skel-pill"></span></td>'
          : `<td><span class="bs-skel bs-skel-line ${w(r + c)}"></span></td>`;
      }
      html += '</tr>';
    }

    tbody.innerHTML = html;
  }

  // Bloque generico para paneles y modales
  function block(containerId, lines) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const count = lines || 4;
    let html = '<div class="bs-skel-block">';
    for (let i = 0; i < count; i++) {
      html += `<span class="bs-skel bs-skel-line ${w(i)}"></span>`;
    }
    html += '</div>';

    el.innerHTML = html;
  }

  // Mensaje de error para cuando la carga falla: si algo revienta,
  // el usuario debe ver por que, no un esqueleto latiendo para siempre.
  function error(containerId, columns, message) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const text = message || 'No se pudieron cargar los datos. Recarga la pagina.';
    el.innerHTML = columns
      ? `<tr><td colspan="${columns}" style="text-align:center;padding:32px 0;color:var(--sub)">${text}</td></tr>`
      : `<div style="text-align:center;padding:24px 0;color:var(--sub)">${text}</div>`;
  }

  window.BarStockSkeleton = { tableRows, block, error };
})();
