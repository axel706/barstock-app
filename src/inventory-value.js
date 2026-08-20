(() => {
  if (window.BarStockInventoryValue) return;

  // ── Dinero en el anaquel ─────────────────────────────────────────────
  //
  // Vive en el panel de Inventory como estado por defecto: el panel
  // estaba oculto salvo cuando seleccionabas un articulo, o sea que la
  // mitad del tiempo ese espacio no decia nada. Mismo patron que
  // Ordering — resumen cuando no hay seleccion, detalle cuando la hay.
  //
  // Todo sale de state.master, que ya esta cargado. Ni una consulta.

  function money(n) {
    const v = Number(n) || 0;
    if (v >= 10000) return '$' + Math.round(v).toLocaleString();
    return '$' + v.toFixed(v >= 100 ? 0 : 2).replace(/\.00$/, '');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // Un color por categoria, estable. No se reparte por posicion en la
  // lista: si el orden cambia porque compraste mas vino, los colores no
  // deben bailar. Nada de rojo, ambar ni verde — esos significan estado.
  const COLORS = {
    'Wine':               '#a78bfa',
    'Whiskey & Bourbon':  '#c084fc',
    'Vodka':              '#38bdf8',
    'Gin':                '#22d3ee',
    'Tequila & Mezcal':   '#818cf8',
    'Rum':                '#f472b6',
    'Liqueur':            '#e879f9',
    'Brandy & Cognac':    '#a5b4fc',
    'Beer & Cider':       '#7dd3fc',
    'Non-Alcoholic':      '#94a3b8'
  };
  const NONE = '#475569';

  function compute() {
    const master = (window.state && state.master) || [];
    const byCat = new Map();
    let total = 0, items = 0, uncategorized = 0, noPrice = 0;

    master.forEach(r => {
      const onHand = typeof parseNum === 'function' ? parseNum(r.onHand) : Number(r.onHand) || 0;
      const price  = typeof parseNum === 'function' ? parseNum(r.value)  : Number(r.value)  || 0;
      const worth  = onHand * price;

      items++;
      if (!r.category) uncategorized++;
      // Un articulo con existencia y sin precio es dinero invisible: no
      // suma al total y nadie se entera. Se cuenta aparte para poder
      // decirlo en vez de esconderlo.
      if (onHand > 0 && price <= 0) noPrice++;
      if (worth <= 0) return;

      const cat = r.category || '— uncategorized';
      byCat.set(cat, (byCat.get(cat) || 0) + worth);
      total += worth;
    });

    const cats = Array.from(byCat.entries())
      .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);

    return { total, items, uncategorized, noPrice, cats };
  }

  function render() {
    const panel = document.getElementById('invItemPanel');
    const body  = document.getElementById('invPanelBody');
    if (!panel || !body) return;

    const d = compute();
    if (!d.items) { panel.style.display = 'none'; return; }
    panel.style.display = '';

    const rows = d.cats.map(c => {
      const col = c.name.startsWith('—') ? NONE : (COLORS[c.name] || NONE);
      return `
        <div class="iv-row">
          <div class="iv-row-top">
            <span class="iv-dot" style="background:${col}"></span>
            <span class="iv-name">${esc(c.name)}</span>
            <span class="iv-val">${money(c.value)}</span>
          </div>
          <div class="iv-bar"><span style="width:${c.pct.toFixed(1)}%;background:${col}"></span></div>
        </div>`;
    }).join('');

    const notes = [];
    if (d.uncategorized) notes.push(`${d.uncategorized} without a category`);
    if (d.noPrice) notes.push(`${d.noPrice} in stock with no price`);

    body.innerHTML = `
      <div class="iv-head">Money on the shelf</div>
      <div class="iv-total">${money(d.total)}</div>
      <div class="iv-sub">${d.items} items${notes.length ? ' · ' + notes.join(' · ') : ''}</div>
      <div class="iv-list">${rows}</div>`;
  }

  window.BarStockInventoryValue = { render, compute };
})();
