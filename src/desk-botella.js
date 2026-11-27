(() => {
  if (window.BarStockDeskBotella) return;

  // ── Elegir una botella, en el escritorio: una ventana centrada ──
  //
  // Lo mismo que el buscador a pantalla completa del teléfono
  // (bottle-search.js: los productos, la pista, el pie con "Not mine" o
  // "Unlink"), pero como ventana: en el escritorio no hay teclado que tape
  // nada y una pantalla entera para elegir una botella era demasiado. Nació
  // dentro de desk-invoices.js (la botella de una línea de factura) y se
  // sacó aquí cuando Transfers la necesitó para "Choose yours" y "Add a
  // product" (2026-11-27): dos copias acaban diciendo cosas distintas.
  // Sus estilos, #dkvBus en desk-orders.css.
  //
  //   abrir({ titulo, sub, productos, pista, actual, verTodo, pie, alElegir, alPie })
  //     verTodo: sin escribir, la lista entera (primero lo que casa con la pista).

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let _bus = null;
  function cerrarBuscar() { if (_bus) { _bus.remove(); _bus = null; } }
  function abrir(o) {
    cerrarBuscar();
    const el = document.createElement('div');
    el.id = 'dkvBus';
    el.innerHTML = `<div class="dkv-bus-bg"></div><div class="dkv-bus" role="dialog" aria-label="Pick the bottle">
      <div class="dkv-bus-h"><b>${esc(o.titulo || 'Pick the bottle')}</b><small>${esc(o.sub || '')}</small>
        <button type="button" class="dkv-bus-x" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>
      <label class="dkv-bus-q"><i class="ti ti-search" aria-hidden="true"></i><input type="search" autocomplete="off" spellcheck="false" placeholder="Search your bottles…"></label>
      <div class="dkv-bus-l"></div>
      ${(o.pie || []).length ? `<div class="dkv-bus-pie">${o.pie.map(p => `<button type="button" class="dki-cr" data-pie="${esc(p.id)}">${esc(p.texto)}</button>`).join('')}</div>` : ''}
    </div>`;
    document.body.appendChild(el);
    _bus = el;
    const inp = el.querySelector('input');
    const lista = el.querySelector('.dkv-bus-l');
    const todos = o.productos || [];
    // Sin escribir, primero lo que se parece al nombre de la línea.
    const palabras = String(o.pista || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
    const pintar = () => {
      const t = inp.value.trim().toLowerCase();
      let ps;
      if (t) ps = todos.filter(p => t.split(/\s+/).every(w => p.toLowerCase().includes(w)));
      else {
        // Sin escribir: primero lo que se parece a la pista y, con
        // verTodo, después todo lo demás (una pista que no casa con nada
        // dejaba la ventana vacía en "Which is yours?").
        const casan = todos.map(p => ({ p, n: palabras.filter(w => p.toLowerCase().includes(w)).length }))
          .filter(x => x.n).sort((a, b) => b.n - a.n).map(x => x.p);
        ps = o.verTodo ? casan.concat(todos.filter(p => !casan.includes(p))) : casan;
      }
      lista.innerHTML = ps.slice(0, o.verTodo ? 400 : 40).map(p => `<button type="button" class="dkv-bus-p${p === o.actual ? ' on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('') ||
        `<p class="dkv-bus-nada">${t ? 'No bottle matches.' : 'Type to search your bottles.'}</p>`;
    };
    inp.addEventListener('input', pintar);
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') cerrarBuscar();
      if (ev.key === 'Enter') { const b = lista.querySelector('[data-p]'); if (b) b.click(); }
    });
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('.dkv-bus-x') || ev.target.classList.contains('dkv-bus-bg')) return cerrarBuscar();
      const b = ev.target.closest('[data-p]');
      if (b) { const p = b.dataset.p; cerrarBuscar(); if (o.alElegir) o.alElegir(p); return; }
      const pp = ev.target.closest('[data-pie]');
      if (pp) { const id = pp.dataset.pie; cerrarBuscar(); if (o.alPie) o.alPie(id); }
    });
    pintar();
    setTimeout(() => inp.focus(), 0);
  }

  window.BarStockDeskBotella = { abrir, cerrar: cerrarBuscar, abierta: () => !!_bus };
})();
