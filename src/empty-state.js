(() => {
  if (window.BarStockEmpty) return;

  // Constructores de strings, sin estado. Devuelven HTML para meter
  // en un innerHTML, igual que el resto de la app.
  //
  // Un estado vacio bien hecho responde tres cosas:
  //   1. que es esto (icono + titulo)
  //   2. por que esta vacio (una linea, sin culpar al usuario)
  //   3. que hacer al respecto (accion, si aplica)
  //
  // El tono importa: "No inventory loaded" suena a error. "Nothing here
  // yet" suena a que el usuario apenas empieza, que es la verdad.

  const TONE_COLOR = {
    neutral: 'var(--sub)',
    good:    '#22c55e',
    warn:    '#f59e0b'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function inner(opts) {
    const o = opts || {};
    const icon = o.icon || 'ti-inbox';
    const color = TONE_COLOR[o.tone] || TONE_COLOR.neutral;
    const title = o.title ? esc(o.title) : '';
    const text = o.text ? esc(o.text) : '';

    // onAction es codigo JS que ya viene armado por quien llama.
    // No se escapa a proposito; nunca debe construirse con datos del
    // usuario, solo con nombres de funcion fijos.
    const action = (o.action && o.onAction)
      ? `<button class="bs-empty-action" onclick="${o.onAction}">${esc(o.action)}</button>`
      : '';

    return `<div class="bs-empty">
      <i class="ti ${icon}" style="color:${color}" aria-hidden="true"></i>
      ${title ? `<strong class="bs-empty-title">${title}</strong>` : ''}
      ${text ? `<span class="bs-empty-text">${text}</span>` : ''}
      ${action}
    </div>`;
  }

  // Para dentro de una tabla
  function row(colspan, opts) {
    return `<tr class="bs-empty-row"><td colspan="${Number(colspan) || 1}">${inner(opts)}</td></tr>`;
  }

  // Para paneles, listas y contenedores sueltos
  function block(opts) {
    return inner(opts);
  }

  window.BarStockEmpty = { row, block };
})();
