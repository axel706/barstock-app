(() => {
  if (window.BarStockNumPad) return;

  // ── El teclado de botellas ───────────────────────────────────────────
  //
  // Una hoja con un teclado de botones, no un campo de texto: el de iOS
  // hace zoom por debajo de 16 px y tapa media pantalla. El punto, para la
  // botella abierta con UN decimal: 6.5, 0.7, .2 (Axel, 2026-11-15: "no
  // necesito el .5, sólo el punto, para poner .5 .7 .2 a necesidad"; antes
  // era una tecla ".5" fija).
  //
  // Nació dentro de la revisión de "Running out" ("I have enough") y lo
  // necesitaban también la cantidad de la lista de compras y "Running
  // low". Tres copias del mismo teclado acaban tecleando distinto (el
  // fallo nº 1 de CLAUDE.md), así que vive aquí y los tres lo llaman.
  //
  //   abrir({
  //     titulo, sub,                 el producto y la pregunta
  //     inicial,                     lo que sale escrito al abrir ('' = nada)
  //     medias,                      false: sin el punto (una cantidad a pedir)
  //     cero,                        false: 0 no se guarda
  //     unidad,                      'bottles' por defecto
  //     boton: (v) => 'Save · 6 on the shelf',   el texto del botón con v
  //     nota,                        la línea de abajo (opcional)
  //     guardar: async (n) => ({ ok, error })    cierra si ok
  //   })

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function abrir(o) {
    o = o || {};
    const vieja = document.getElementById('mSheet');
    if (vieja) vieja.remove();
    const medias = o.medias !== false;
    let v = o.inicial != null && o.inicial !== '' ? String(o.inicial) : '';
    // Lo de abrir con un número puesto: el primer toque lo sustituye en
    // vez de añadirle cifras (abrir con 4 y tocar 6 es 6, no 46).
    let virgen = !!v;
    const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', medias ? '.' : '', '0', 'del'];
    const h = document.createElement('div');
    h.className = 'm-sheet';
    h.id = 'mSheet';
    h.innerHTML = `<div class="m-sheet-bg"></div>
      <div class="m-sheet-box m-kp-hoja" role="dialog" aria-label="${esc(o.sub || o.titulo || 'Number')}">
        <div class="m-sheet-grip"></div>
        <div class="m-kp-t">${esc(o.titulo || '')}</div>
        ${o.sub ? `<div class="m-kp-s">${o.sub}</div>` : ''}
        <div class="m-kp-d"><span class="m-kp-n"></span><small>${esc(o.unidad || 'bottles')}</small></div>
        <div class="m-kp">
          ${teclas.map(k => k
            ? `<button type="button" class="m-kp-k" data-k="${k}" aria-label="${k === 'del' ? 'Delete' : k}">${k === 'del' ? '&#9003;' : k}</button>`
            : '<span aria-hidden="true"></span>').join('')}
        </div>
        <div class="m-kp-err" aria-live="polite"></div>
        <button type="button" class="m-ro-b m-ro-go m-kp-save" id="mKpSave" disabled>Save</button>
        ${o.nota ? `<div class="m-kp-nota">${esc(o.nota)}</div>` : ''}
      </div>`;
    document.body.appendChild(h);
    const cerrar = () => h.remove();
    if (window.BarStockSheet && window.BarStockSheet.enganchar) window.BarStockSheet.enganchar(h, cerrar);
    h.querySelector('.m-sheet-bg').onclick = cerrar;
    const num = h.querySelector('.m-kp-n'), save = h.querySelector('#mKpSave'), err = h.querySelector('.m-kp-err');
    const etiqueta = typeof o.boton === 'function' ? o.boton : () => 'Save';
    // `cero: false` para una cantidad a pedir: pedir 0 es quitar la
    // línea, y eso tiene su botón. Lo que hay en la estantería sí puede
    // ser 0 ("Running low" con la última vacía).
    const valido = () => !!v && (o.cero !== false || Number(v) > 0);
    const pinta = () => {
      num.textContent = v || '–';
      save.disabled = !valido();
      // El botón dice el número limpio: "6." a medio escribir es 6.
      save.textContent = valido() ? etiqueta(String(Number(v))) : 'Save';
    };
    h.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => {
      const k = b.dataset.k;
      if (virgen && k !== 'del') v = '';
      virgen = false;
      const punto = v.indexOf('.');
      if (k === 'del') v = v.slice(0, -1);
      // Un solo punto; sin nada delante, "0." (".2" es 0.2).
      else if (k === '.') { if (punto < 0) v = (v || '0') + '.'; }
      // Tras el punto, un decimal y nada más; antes, tres cifras.
      else if (punto >= 0) { if (v.length - punto - 1 < 1) v = v + k; }
      else if (v.length < 3) v = v === '0' ? k : v + k;
      pinta();
    }; });
    save.onclick = async () => {
      if (!valido() || save.dataset.ocupado) return;
      save.dataset.ocupado = '1';
      err.textContent = '';
      let r;
      try { r = await o.guardar(Number(v)); }
      catch (e) { r = { ok: false, error: String(e && e.message || e) }; }
      delete save.dataset.ocupado;
      if (!r || !r.ok) { err.textContent = 'Not saved: ' + ((r && r.error) || 'unknown error'); return; }
      cerrar();
    };
    pinta();
    return { cerrar };
  }

  window.BarStockNumPad = { abrir };
})();
