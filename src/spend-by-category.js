(() => {
  if (window.BarStockSpend) return;

  // ── Gasto por categoría, con tendencia ───────────────────────────────
  //
  // Sale de las órdenes colocadas, no del cost report. Son cosas
  // distintas: el cost report son las facturas que capturas a mano, esto
  // es lo que la app sabe que pediste. Pueden no coincidir, y esa
  // diferencia es informativa por sí sola.
  //
  // Las líneas de orden NO guardan categoría — vendor_order_items tiene
  // código, nombre, cantidad y precio. La categoría se cruza al leer
  // contra state.master por nombre. Efecto secundario: si recategorizas
  // un producto, el gasto pasado se reclasifica solo. Casi siempre es lo
  // que quieres, pero significa que un reporte viejo puede dar otro
  // número hoy.

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

  function money(n) {
    const v = Number(n) || 0;
    if (v >= 10000) return '$' + Math.round(v).toLocaleString();
    return '$' + v.toFixed(v >= 100 ? 0 : 2).replace(/\.00$/, '');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // Lunes de la semana que contiene esa fecha
  function mondayOf(d) {
    const x = new Date(d);
    const day = x.getDay();
    x.setDate(x.getDate() - (day === 0 ? 6 : day - 1));
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function catOf(itemName) {
    const master = (window.state && state.master) || [];
    const hit = master.find(m => m.item === itemName);
    return (hit && hit.category) || null;
  }

  // Suma por categoría de las órdenes cuya semana empieza en `monday`
  function spendForWeek(monday) {
    const orders = (window.state && state.orderHistory) || [];
    const start = monday.getTime();
    const end = start + 7 * 24 * 3600 * 1000;
    const byCat = new Map();
    let total = 0, lines = 0;

    orders.forEach(o => {
      const t = new Date(o.createdAt).getTime();
      if (isNaN(t) || t < start || t >= end) return;
      (o.items || []).forEach(it => {
        const qty = Number(it.finalOrder || 0);
        const price = Number(it.value || 0);
        const amount = qty * price;
        if (amount <= 0) return;
        const cat = catOf(it.item) || '— uncategorized';
        byCat.set(cat, (byCat.get(cat) || 0) + amount);
        total += amount;
        lines++;
      });
    });
    return { byCat, total, lines };
  }

  function compute() {
    const thisMon = mondayOf(new Date());
    const prevMon = new Date(thisMon);
    prevMon.setDate(prevMon.getDate() - 7);

    const now = spendForWeek(thisMon);
    const prev = spendForWeek(prevMon);

    const names = new Set([...now.byCat.keys(), ...prev.byCat.keys()]);
    const cats = Array.from(names).map(name => {
      const a = now.byCat.get(name) || 0;
      const b = prev.byCat.get(name) || 0;
      // Sin gasto previo no hay porcentaje que calcular. Un "+∞%" porque
      // la semana pasada fue cero no es una tendencia, es ruido.
      const pctChange = b > 0 ? ((a - b) / b) * 100 : null;
      return { name, now: a, prev: b, delta: a - b, pctChange };
    }).sort((x, y) => y.now - x.now);

    const totalDelta = now.total - prev.total;
    const totalPct = prev.total > 0 ? (totalDelta / prev.total) * 100 : null;

    return { now, prev, cats, totalDelta, totalPct, weekStart: thisMon };
  }

  function trendHtml(c) {
    if (c.now === 0 && c.prev > 0) {
      return `<span class="sp-trend down">nothing this week</span>`;
    }
    if (c.pctChange === null) {
      return `<span class="sp-trend new">new</span>`;
    }
    if (Math.abs(c.pctChange) < 5) {
      return `<span class="sp-trend flat">about the same</span>`;
    }
    const up = c.pctChange > 0;
    return `<span class="sp-trend ${up ? 'up' : 'down'}">
      <i class="ti ti-${up ? 'trending-up' : 'trending-down'}" aria-hidden="true"></i>
      ${up ? '+' : ''}${Math.round(c.pctChange)}%</span>`;
  }

  function render() {
    const el = document.getElementById('spendByCat');
    if (!el) return;
    const d = compute();

    if (!d.now.lines && !d.prev.lines) {
      el.innerHTML = `<div class="sp-empty"><i class="ti ti-receipt-off" aria-hidden="true"></i>
        No orders placed this week or last.</div>`;
      return;
    }

    const max = Math.max(...d.cats.map(c => Math.max(c.now, c.prev)), 1);

    const rows = d.cats.map(c => {
      const col = c.name.startsWith('—') ? NONE : (COLORS[c.name] || NONE);
      return `
        <div class="sp-row">
          <div class="sp-top">
            <span class="sp-dot" style="background:${col}"></span>
            <span class="sp-name">${esc(c.name)}</span>
            <span class="sp-amt">${money(c.now)}</span>
          </div>
          <div class="sp-bars">
            <span class="sp-bar now" style="width:${(c.now / max * 100).toFixed(1)}%;background:${col}"></span>
            <span class="sp-bar prev" style="width:${(c.prev / max * 100).toFixed(1)}%"></span>
          </div>
          <div class="sp-foot">
            ${trendHtml(c)}
            <span class="sp-prev">last week ${money(c.prev)}</span>
          </div>
        </div>`;
    }).join('');

    const up = d.totalDelta > 0;
    const totalTrend = d.totalPct === null ? ''
      : `<span class="sp-total-trend ${up ? 'up' : 'down'}">
           <i class="ti ti-${up ? 'trending-up' : 'trending-down'}" aria-hidden="true"></i>
           ${up ? '+' : ''}${money(Math.abs(d.totalDelta))} vs last week</span>`;

    el.innerHTML = `
      <div class="sp-head">
        <div>
          <div class="sp-label">Spent this week</div>
          <div class="sp-total">${money(d.now.total)}</div>
          ${totalTrend}
        </div>
      </div>
      <div class="sp-legend">
        <span><span class="sp-key now"></span> this week</span>
        <span><span class="sp-key prev"></span> last week</span>
      </div>
      <div class="sp-list">${rows}</div>`;
  }

  window.BarStockSpend = { render, compute };
})();
