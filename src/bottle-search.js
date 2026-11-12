(() => {
  if (window.BarStockBottleSearch) return;

  // ── Elegir una botella del inventario, escribiendo ───────────────────
  //
  // La hoja de abajo con buscador: la sugerida arriba, y escribiendo se
  // encuentra cualquier botella. Elegir ES confirmar: no hay un segundo
  // botón que olvidar.
  //
  // Nació en Liquor from Toast (mobile-toast-liquor.js), donde sustituyó
  // a una rueda nativa que en Crown no servía: con todo el inventario en
  // la lista, llegar a Pedro Morales era bajar la rueda entera hasta la P
  // (Axel, 2026-11-11). Las recetas necesitan la misma hoja, y está aquí
  // para no tenerla dos veces: el gesto de las hojas ya estuvo copiado
  // seis veces y cada copia acabó haciendo otra cosa.
  //
  // Sólo elige. Guardar, cerrar y repintar lo hace quien la abre: es él
  // quien sabe qué se guarda y dónde.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const MAX_RES = 40;   // lo que cabe leer de un vistazo; escribir acota

  // Con texto: las botellas que tienen TODAS las palabras escritas. Sin
  // texto: las que comparten alguna palabra con la pista (la marca, el
  // ingrediente), que es casi siempre donde está la buena.
  function buscar(q, pista, productos) {
    const p = norm(q).split(/[^a-z0-9]+/).filter(Boolean);
    if (p.length) return productos.filter(x => { const n = norm(x); return p.every(w => n.includes(w)); });
    const m = norm(pista).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
    return productos.filter(x => { const n = norm(x); return m.some(w => n.includes(w)); });
  }

  // La sugerida ya va arriba con su etiqueta: en la lista sería la misma
  // botella dos veces.
  // `que`: lo que se elige. Las recetas usan esta misma hoja para elegir
  // un artículo de Toast o una receta (Match, Same as…), y la hoja no
  // puede decir "bottles" de algo que no lo es.
  // `verTodo`: sin escribir, la lista entera. Para listas cortas (los
  // artículos de Toast sin receta, las recetas): ahí no hay que buscar,
  // hay que ver. Con el inventario entero no: serían cientos.
  function resultados(q, o) {
    const todos = (!q && o.verTodo ? o.productos.slice() : buscar(q, o.pista, o.productos)).filter(p => p !== o.sugerida);
    if (!todos.length) return `<div class="m-tw-p">${q ? 'Nothing matches “' + esc(q) + '”.' : (o.que ? 'Type to search.' : 'Type to search the inventory.')}</div>`;
    return todos.slice(0, MAX_RES).map(p =>
      `<button type="button" class="m-tl-res${p === o.actual ? ' on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('') +
      (todos.length > MAX_RES ? `<div class="m-tw-p">${todos.length - MAX_RES} more · keep typing</div>` : '');
  }

  function cerrar() {
    const h = document.getElementById('mSheet');
    if (h) h.remove();
  }

  // o: { titulo, sub, productos, pista, sugerida, actual,
  //      pie: [{ id, texto }], alElegir(producto), alPie(id), que, verTodo }
  function abrir(o) {
    cerrar();
    const productos = o.productos || [];
    const h = document.createElement('div');
    h.className = 'm-sheet';
    // El id es el de todas las hojas del teléfono: las reglas que les
    // ganan el radio a app.css se apoyan en él.
    h.id = 'mSheet';
    const sugerida = o.sugerida
      ? `<button type="button" class="m-tl-res m-tl-sug" data-sug="1" data-p="${esc(o.sugerida)}"><small>Suggested</small>${esc(o.sugerida)}</button>` : '';
    const pie = (o.pie || []).map(b => `<button type="button" class="m-tw-b2" data-pie="${esc(b.id)}">${esc(b.texto)}</button>`).join('');
    h.innerHTML = `
      <div class="m-sheet-bg"></div>
      <div class="m-sheet-box m-tl-hoja" role="dialog" aria-label="${o.que ? 'Choose for' : 'Bottle for'} ${esc(o.titulo)}">
        <div class="m-sheet-grip"></div>
        <div class="m-tl-hoja-t"><b>${esc(o.titulo)}</b><span>${esc(o.sub || '')}</span></div>
        <input class="m-tl-busca" type="search" inputmode="search" autocomplete="off" autocapitalize="off" spellcheck="false"
          placeholder="Search ${productos.length} ${esc(o.que || 'bottles')}" aria-label="Search ${esc(o.que || 'bottles')}">
        ${sugerida}
        <div class="m-tl-lista"></div>
        ${pie ? `<div class="m-tl-hoja-pie">${pie}</div>` : ''}
      </div>`;
    document.body.appendChild(h);
    if (window.BarStockSheet) window.BarStockSheet.enganchar(h, cerrar);
    h.querySelector('.m-sheet-bg').onclick = cerrar;

    const lista = h.querySelector('.m-tl-lista');
    const busca = h.querySelector('.m-tl-busca');
    const pintarLista = () => { lista.innerHTML = resultados(busca.value.trim(), Object.assign({}, o, { productos })); };
    busca.addEventListener('input', pintarLista);
    pintarLista();

    // Un escuchador para toda la hoja: la lista se repinta al escribir.
    h.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (!b) return;
      if (b.dataset.p && o.alElegir) return o.alElegir(b.dataset.p);
      if (b.dataset.pie && o.alPie) return o.alPie(b.dataset.pie);
    });
    return h;
  }

  window.BarStockBottleSearch = { abrir, cerrar, buscar, MAX_RES };
})();
