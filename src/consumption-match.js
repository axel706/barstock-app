(() => {
  if (window.BarStockConsumptionMatch) return;

  // ── Consumption Match ────────────────────────────────────────────────
  //
  // Lo que se vendió contra lo que de verdad se sirvió, por categoría.
  //
  // ── De dónde salen los números ──────────────────────────────────────
  //
  // De NINGÚN cálculo nuevo. Usage ya computa, por artículo y por semana:
  //
  //   used     = on_hand_inicial + recibido − on_hand_final
  //   sold     = del archivo de ventas
  //   variance = used − sold          (botellas de más)
  //   loss     = variance × value     (a coste)
  //
  // Esta pantalla los pide con BarStockTheoreticalUsage.loadCycle() —que
  // los calcula sin pintar nada— y los agrupa.
  // Repetir la fórmula aquí habría permitido que dos pantallas dieran
  // cifras distintas del mismo dinero, que es exactamente el tipo de
  // fallo que más veces ha mordido a este proyecto.
  //
  // ── El dinero es COSTE, no precio de barra ──────────────────────────
  //
  // `value` es lo que cuesta la botella —es lo que actualiza el escáner
  // de facturas y lo que usa "money on the shelf"—, así que la pérdida
  // es coste de mercancía, no ingreso perdido. Se etiqueta "at cost" en
  // pantalla a propósito: dentro de tres meses nadie recordará cuál de
  // los dos era.
  //
  // ── Los que no tienen venta ─────────────────────────────────────────
  //
  // Un artículo con consumo pero sin línea en el fichero de ventas
  // —jarabes, guarniciones, o algo que el POS llama de otra forma— se
  // leería como "se usó todo y no se vendió nada", o sea pérdida del
  // 100%. Unos pocos bastan para que el total deje de ser creíble.
  //
  // Se apartan del cálculo y se cuentan DENTRO DE SU CATEGORÍA, no todos
  // juntos: así se ve de qué categoría desconfiar.

  const CATS = ['Vodka','Gin','Tequila & Mezcal','Whiskey & Bourbon','Rum',
                'Brandy & Cognac','Liqueur','Wine','Beer & Cider','Non-Alcoholic'];

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  const money = (n) => '$' + Math.round(Math.abs(n)).toLocaleString();
  const btl = (n) => {
    const v = Math.abs(n);
    return (v < 10 ? v.toFixed(1) : Math.round(v).toString()).replace(/\.0$/, '');
  };

  // La categoría vive en state.master, y las filas de Usage vienen de
  // inventory_snapshots. Se unen por nombre, igual que en
  // spend-by-category. Efecto secundario conocido: si recategorizas un
  // artículo, las semanas pasadas se recolocan tambien — es preferible a
  // congelar la categoría en cada instantánea.
  function categoryOf(itemName) {
    const master = (window.state && state.master) || [];
    const hit = master.find(m => m.item === itemName);
    return (hit && hit.category) || null;
  }

  // ── Agrupar ──────────────────────────────────────────────────────────
  function group(rows) {
    const out = new Map();
    const ensure = (c) => {
      if (!out.has(c)) out.set(c, {
        cat: c, sold: 0, used: 0, loss: 0, items: [],
        noSales: 0, withSales: 0, uncategorised: false
      });
      return out.get(c);
    };

    for (const r of rows) {
      if (r.isExcluded) continue;                 // Usage ya las descartó
      const cat = categoryOf(r.item_name) || 'Uncategorised';
      const g = ensure(cat);
      if (cat === 'Uncategorised') g.uncategorised = true;

      // Sin venta con la que comparar no entra en ningun total: solo se
      // cuenta, y en su propia categoria.
      if (r.sold === null || r.sold === undefined) {
        if (Number(r.used || 0) > 0) g.noSales++;
        continue;
      }

      g.withSales++;
      g.sold += Number(r.sold) || 0;
      g.used += Number(r.used) || 0;
      if (r.variance !== null && r.variance !== undefined) {
        g.loss += Number(r.loss) || 0;
        if (r.variance > 0) {
          g.items.push({
            item: r.item_name,
            bottles: Number(r.variance),
            money: Number(r.loss) || 0
          });
        }
      }
    }

    // Dentro de cada categoria, por DINERO y no por botellas: una botella
    // de un producto caro pesa mas que tres de uno barato, y ordenar por
    // litros esconde donde esta la perdida.
    for (const g of out.values()) g.items.sort((a, b) => b.money - a.money);

    // Y las categorias, por perdida. Las que no pierden nada caen al
    // final solas, sin necesidad de filtrarlas.
    return Array.from(out.values()).sort((a, b) => b.loss - a.loss);
  }

  // ── Gráfica ──────────────────────────────────────────────────────────
  //
  // SVG a mano. El proyecto no carga ninguna librería de gráficas y no
  // hace falta añadir una para diez barras dobles.
  function chart(groups) {
    // Solo las categorias que tienen con que comparar. Una barra ambar
    // sola, sin su verde al lado, se lee como perdida del 100% cuando en
    // realidad significa que falta el archivo de ventas de esa familia.
    const data = groups.filter(g => g.withSales > 0 && (g.sold > 0 || g.used > 0)).slice(0, 8);
    if (!data.length) return '';

    const W = 320, H = 150, base = 122, top = 10;
    const max = Math.max(...data.map(g => Math.max(g.sold, g.used)), 1);
    const slot = (W - 34) / data.length;
    const bw = Math.min(17, slot / 2.6);

    const bars = data.map((g, i) => {
      const x = 34 + i * slot + (slot - bw * 2 - 2) / 2;
      const hS = Math.max(1, (g.sold / max) * (base - top));
      const hU = Math.max(1, (g.used / max) * (base - top));
      const label = g.cat.split(' ')[0].slice(0, 8);
      return `
        <rect x="${x}" y="${base - hS}" width="${bw}" height="${hS}" rx="2" class="cm-bar-sold"/>
        <rect x="${x + bw + 2}" y="${base - hU}" width="${bw}" height="${hU}" rx="2" class="cm-bar-used"/>
        <text x="${x + bw + 1}" y="${base + 14}" text-anchor="middle" class="cm-axis">${esc(label)}</text>`;
    }).join('');

    const grid = [0, 0.5, 1].map(f => {
      const y = base - f * (base - top);
      return `<line x1="34" y1="${y}" x2="${W - 5}" y2="${y}" class="cm-grid"/>
              <text x="29" y="${y + 3}" text-anchor="end" class="cm-axis">${Math.round(max * f)}</text>`;
    }).join('');

    return `
      <svg viewBox="0 0 ${W} ${H}" class="cm-chart" role="img"
           aria-label="Vendido contra servido por categoría">
        <title>Sold versus poured by category</title>
        ${grid}
        <line x1="34" y1="${base}" x2="${W - 5}" y2="${base}" class="cm-axisline"/>
        ${bars}
      </svg>
      <div class="cm-legend">
        <span><i class="cm-key cm-bar-sold"></i>Sold</span>
        <span><i class="cm-key cm-bar-used"></i>Poured</span>
      </div>`;
  }

  // ── Tarjeta de categoría ─────────────────────────────────────────────
  function card(g) {
    // Una categoria ENTERA sin datos de venta no es una nota al pie: casi
    // siempre significa que falta un archivo. Las ventas llegan en dos
    // ficheros separados, vino y licor, asi que olvidar uno deja mudas
    // todas sus categorias de golpe.
    if (!g.withSales && g.noSales) {
      return `
        <div class="cm-card cm-card-warn">
          <div class="cm-card-head">
            <span class="cm-cat">${esc(g.cat)}</span>
            <span class="cm-cat-money">—</span>
          </div>
          <div class="cm-card-sub">
            <b>No sales data</b> for any of the ${g.noSales}
            item${g.noSales === 1 ? '' : 's'} in this category, so nothing here
            can be compared. Sales arrive in two files, wine and liquor —
            check that both were loaded for this cycle.
          </div>
        </div>`;
    }

    const diff = g.used - g.sold;
    const over = diff > 0.05;
    const under = diff < -0.05;

    const head = over
      ? `Poured <b>${btl(diff)} bottle${btl(diff) === '1' ? '' : 's'}</b> more than sold.
         ${btl(g.sold)} sold, ${btl(g.used)} poured.`
      : under
        // Una varianza negativa casi nunca es una ganancia: el licor no
        // aparece solo. Decirlo evita que la primera vez que salga en
        // verde alguien crea que gano dinero.
        ? `Sold <b>${btl(diff)} bottle${btl(diff) === '1' ? '' : 's'}</b> more than poured.
           Usually a miscount, not a gain.`
        : `Sales and pours match.`;

    const items = g.items.length ? `
      <div class="cm-items">
        ${g.items.map(it => `
          <div class="cm-item">
            <div class="cm-item-name">${esc(it.item)}</div>
            <div class="cm-eq">
              <div class="cm-chip cm-chip-btl">
                <b>${btl(it.bottles)}</b><span>bottle${btl(it.bottles) === '1' ? '' : 's'} lost</span>
              </div>
              <span class="cm-eqsign">=</span>
              <div class="cm-chip cm-chip-money">
                <b>${money(it.money)}</b><span>at cost</span>
              </div>
            </div>
          </div>`).join('')}
      </div>` : '';

    const noSales = g.noSales ? `
      <div class="cm-note">
        <i class="ti ti-info-circle" aria-hidden="true"></i>
        <b>${g.noSales}</b> item${g.noSales === 1 ? '' : 's'} in ${esc(g.cat)}
        had no sales data. Not counted above.
      </div>` : '';

    return `
      <div class="cm-card">
        <div class="cm-card-head">
          <span class="cm-cat">${esc(g.cat)}</span>
          <span class="cm-cat-money ${over ? 'bad' : under ? 'good' : ''}">
            ${over ? '' : under ? '+' : ''}${money(g.loss)}
          </span>
        </div>
        <div class="cm-card-sub">${head}</div>
        ${items}
        ${noSales}
      </div>`;
  }

  const weekLabel = (w) => w
    ? new Date(w + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';

  // Ciclo elegido a mano. null = el ultimo cerrado.
  let _week = null;

  // ── Render ───────────────────────────────────────────────────────────
  async function render() {
    const host = $('cmBody');
    if (!host) return;

    const TU = window.BarStockTheoreticalUsage;
    if (!TU || !TU.loadCycle) {
      host.innerHTML = `<div class="cm-empty">Usage is not loaded.</div>`;
      return;
    }

    host.innerHTML = `<div class="cm-empty">Reading the last closed cycle…</div>`;

    // ── Que semana se lee ──────────────────────────────────────────────
    //
    // El ULTIMO CICLO CERRADO, nunca el que esta corriendo.
    //
    // Al importar un conteo, runCycle() hace dos cosas: cierra la semana
    // anterior —le escribe on_hand_end y used— y abre una nueva con used
    // en null. La semana mas reciente por tanto SIEMPRE esta vacia. Esta
    // pantalla pedia esa, no encontraba nada, y remataba pidiendo cargar
    // un conteo que ya estaba cargado.
    //
    // Tampoco se llama ya a openWeek(): eso ademas de calcular escondia
    // y mostraba paneles de la pantalla de Usage. Una vista no debe mover
    // otra solo para leer un numero.
    let cycle;
    try {
      cycle = await TU.loadCycle(_week);
    } catch (e) {
      console.warn('[consumption] no se pudo leer el ciclo', e);
      host.innerHTML = `<div class="cm-empty">Could not read the cycle. Try again.</div>`;
      return;
    }

    const closed = (cycle.weeks || []).filter(w => w.hasUsage);

    if (!cycle.week || !cycle.rows.length) {
      host.innerHTML = `
        <div class="cm-empty">
          <b>No closed cycle yet.</b><br>
          A cycle closes by itself when you import the next count — that is
          what fills in what was used. Nothing to load here.
        </div>`;
      return;
    }

    const rows = cycle.rows;
    const groups = group(rows);
    const totalLoss = groups.reduce((s, g) => s + Math.max(0, g.loss), 0);
    const noSalesTotal = groups.reduce((s, g) => s + g.noSales, 0);
    const anySales = groups.some(g => g.withSales > 0);

    // Los ciclos cerrados, para poder mirar atras. Solo cerrados: los
    // abiertos no tienen con que comparar.
    const picker = closed.length > 1 ? `
      <div class="cm-weeks">
        ${closed.slice(0, 8).map(w => `
          <button class="oh-filter-chip ${w.week_start === cycle.week ? 'active' : ''}"
                  onclick="window.BarStockConsumptionMatch.setWeek('${w.week_start}')">
            ${esc(weekLabel(w.week_start))}
          </button>`).join('')}
      </div>` : '';

    // Sin NINGUNA venta en todo el ciclo no hay nada que comparar, y la
    // causa casi siempre es la misma: los ficheros se subieron estando
    // abierta otra semana. Se dice donde, no solo que falta.
    const banner = !anySales ? `
      <div class="cm-card cm-card-warn">
        <div class="cm-card-head">
          <span class="cm-cat">No sales data for this cycle</span>
        </div>
        <div class="cm-card-sub">
          Nothing can be compared until the sales files are loaded.
          They go in <b>Usage → week of ${esc(weekLabel(cycle.week))}</b>,
          and there are two of them: liquor and wine. Loading them into a
          different week leaves this screen empty.
        </div>
      </div>` : '';

    host.innerHTML = `
      <div class="cm-top">
        <div class="cm-top-head">
          <span>Consumption match</span>
          <span class="cm-week">Closed cycle · ${esc(weekLabel(cycle.week))}</span>
        </div>
        <div class="cm-total">
          <b>${money(totalLoss)}</b>
          <span>poured beyond sales, at cost</span>
        </div>
        ${chart(groups)}
        ${picker}
      </div>
      ${banner}
      ${anySales ? groups.map(card).join('') : ''}
      ${anySales && noSalesTotal ? `
        <div class="cm-foot">
          ${noSalesTotal} item${noSalesTotal === 1 ? '' : 's'} across all categories
          had no sales data and were left out of every total.
        </div>` : ''}`;
  }

  function setWeek(w) { _week = w || null; render(); }

  window.BarStockConsumptionMatch = { render, setWeek, group, CATS };
})();
