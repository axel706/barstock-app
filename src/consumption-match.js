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
  // los calcula sin pintar nada— y los agrupa. Repetir la fórmula aquí
  // habría permitido que dos pantallas dieran cifras distintas del mismo
  // dinero, que es exactamente el tipo de fallo que más veces ha mordido
  // a este proyecto.
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
  //
  // ── Tres niveles, no una lista ──────────────────────────────────────
  //
  // Gráfica → tabla de categorías → artículos de una categoría → el
  // desglose de un artículo. Todo colapsado salvo lo que abres. Con 258
  // artículos, enseñarlos de golpe no es información: es un muro.

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  const money = (n) => '$' + Math.round(Math.abs(n)).toLocaleString();
  // Un decimal SIEMPRE, no solo por debajo de diez.
  //
  // Antes se redondeaba a entero a partir de 10 y el desglose salia
  // "31 − 26 = +4.8": tres numeros correctos que juntos parecen un error
  // de la app. A un decimal la resta cuadra a la vista, que es el unico
  // sitio donde el usuario la puede comprobar.
  const btl = (n) => Math.abs(n).toFixed(1).replace(/\.0$/, '');
  const btlSigned = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + btl(n);
  const weekLabel = (w) => w
    ? new Date(w + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';

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
        noSales: 0, withSales: 0
      });
      return out.get(c);
    };

    for (const r of rows) {
      if (r.isExcluded) continue;                 // Usage ya las descartó
      const cat = categoryOf(r.item_name) || 'Uncategorised';
      const g = ensure(cat);

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
        // Se guardan TODOS los comparables, no solo los que pierden. Una
        // tabla que esconde las varianzas negativas no cuadra con su
        // propio total, y el primero que sume a mano deja de fiarse.
        g.items.push({
          item: r.item_name,
          used: Number(r.used) || 0,
          sold: Number(r.sold) || 0,
          bottles: Number(r.variance),
          money: Number(r.loss) || 0
        });
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

  // ── Estado de la vista ───────────────────────────────────────────────
  let _week = null;      // ciclo elegido a mano; null = el ultimo cerrado
  let _cycle = null;     // { week, rows, weeks }
  let _groups = [];
  let _openCat = -1;     // una categoria abierta a la vez
  let _openItem = -1;

  // ── Gráfica ──────────────────────────────────────────────────────────
  //
  // Barras en HTML, no en SVG.
  //
  // El SVG anterior tenia viewBox 320x150 y se estiraba a todo el ancho
  // del contenedor: en un monitor el texto de los ejes salia a 40px de
  // alto porque escala con el dibujo. Un div escala su caja y deja la
  // tipografia donde estaba, que es justo lo que se quiere aqui.
  //
  // La altura util es 100% menos la banda de la etiqueta, y ese mismo
  // descuento se aplica a las lineas de referencia, para que el 50% de
  // la rejilla y el 50% de una barra caigan en el mismo pixel.
  const LBL = 22;

  function chart(groups) {
    // Solo las categorias que tienen con que comparar. Una barra ambar
    // sola, sin su verde al lado, se lee como perdida del 100% cuando en
    // realidad significa que falta el archivo de ventas de esa familia.
    const idx = groups.map((g, i) => i)
      .filter(i => groups[i].withSales > 0 && (groups[i].sold > 0 || groups[i].used > 0));
    if (!idx.length) return '';

    const max = Math.max(...idx.map(i => Math.max(groups[i].sold, groups[i].used)), 1);

    // La rejilla es HERMANA del carril que hace scroll, no hija.
    // Dentro de un contenedor con overflow, un absolute con right:0 se
    // ancla al borde visible y se arrastra con el scroll: las lineas se
    // despegaban de las barras al deslizar en el movil.
    const grid = [0, 0.5, 1].map(f => `
      <div class="cm-gline" style="bottom:calc(${LBL}px + ${f} * (100% - ${LBL}px))"></div>
      <div class="cm-glbl"  style="bottom:calc(${LBL}px + ${f} * (100% - ${LBL}px))">${Math.round(max * f)}</div>
    `).join('');

    const cols = idx.map(i => {
      const g = groups[i];
      const hS = Math.max(1.5, (g.sold / max) * 100);
      const hU = Math.max(1.5, (g.used / max) * 100);
      const short = g.cat.split(/[\s&]/)[0];
      return `
        <button class="cm-col ${i === _openCat ? 'active' : ''}" type="button"
                onclick="window.BarStockConsumptionMatch.toggleCat(${i})"
                title="${esc(g.cat)} · ${btl(g.sold)} sold, ${btl(g.used)} poured">
          <div class="cm-bars">
            <span class="cm-b cm-b-sold" style="height:${hS}%"></span>
            <span class="cm-b cm-b-used" style="height:${hU}%"></span>
          </div>
          <span class="cm-xlabel">${esc(short)}</span>
        </button>`;
    }).join('');

    return `
      <div class="cm-chart">
        ${grid}
        <div class="cm-plot">${cols}</div>
      </div>
      <div class="cm-legend">
        <span><i class="cm-key cm-b-sold"></i>Sold</span>
        <span><i class="cm-key cm-b-used"></i>Poured</span>
        <span class="cm-legend-tip">Tap a category</span>
      </div>`;
  }

  // ── Fila de detalle de un artículo ───────────────────────────────────
  //
  // La resta escrita entera. "Perdiste 1.2 botellas" no convence a nadie
  // sin los dos numeros de los que sale.
  function itemDetail(it) {
    const bad = it.bottles > 0.05;
    return `
      <div class="cm-eq">
        <div class="cm-eq-part">
          <b>${btl(it.used)}</b><span>poured</span>
        </div>
        <span class="cm-eq-op">−</span>
        <div class="cm-eq-part">
          <b>${btl(it.sold)}</b><span>sold</span>
        </div>
        <span class="cm-eq-op">=</span>
        <div class="cm-eq-part cm-eq-res ${bad ? 'bad' : 'good'}">
          <b>${btlSigned(it.bottles)}</b><span>bottle${btl(it.bottles) === '1' ? '' : 's'}</span>
        </div>
        <span class="cm-eq-op">=</span>
        <div class="cm-eq-part cm-eq-res ${bad ? 'bad' : 'good'}">
          <b>${it.money < 0 ? '+' : ''}${money(it.money)}</b><span>at cost</span>
        </div>
      </div>`;
  }

  // ── Sub-tabla de artículos de una categoría ──────────────────────────
  function itemRows(g, ci) {
    if (!g.items.length) {
      return `<div class="cm-sub-empty">No comparable items in this category.</div>`;
    }
    return `
      <table class="cm-subtable">
        <thead>
          <tr>
            <th>Item</th>
            <th class="num cm-c-used">Poured</th>
            <th class="num cm-c-sold">Sold</th>
            <th class="num">Bottles</th>
            <th class="num">At cost</th>
          </tr>
        </thead>
        <tbody>
          ${g.items.map((it, ii) => {
            const open = ci === _openCat && ii === _openItem;
            const bad = it.bottles > 0.05;
            const cls = bad ? 'bad' : it.bottles < -0.05 ? 'good' : '';
            return `
              <tr class="cm-irow ${open ? 'open' : ''}"
                  onclick="window.BarStockConsumptionMatch.toggleItem(event, ${ci}, ${ii})">
                <td class="cm-iname">
                  <i class="ti ti-chevron-right cm-chev" aria-hidden="true"></i>
                  ${esc(it.item)}
                </td>
                <td class="num cm-c-used">${btl(it.used)}</td>
                <td class="num cm-c-sold">${btl(it.sold)}</td>
                <td class="num ${cls}">${btlSigned(it.bottles)}</td>
                <td class="num ${cls}"><b>${it.money < 0 ? '+' : ''}${money(it.money)}</b></td>
              </tr>
              ${open ? `<tr class="cm-idetail"><td colspan="5">${itemDetail(it)}</td></tr>` : ''}`;
          }).join('')}
        </tbody>
      </table>`;
  }

  // ── Tabla de categorías ──────────────────────────────────────────────
  function table(groups) {
    if (!groups.length) return '';

    const rows = groups.map((g, i) => {
      const open = i === _openCat;

      // Una categoria ENTERA sin datos de venta no es una nota al pie:
      // casi siempre significa que falta un archivo. Las ventas llegan en
      // dos ficheros separados, vino y licor, asi que olvidar uno deja
      // mudas todas sus categorias de golpe.
      if (!g.withSales) {
        return `
          <tr class="cm-crow cm-crow-warn">
            <td class="cm-cname">
              <i class="ti ti-alert-triangle cm-warn-i" aria-hidden="true"></i>
              ${esc(g.cat)}
              <span class="cm-tag">no sales file</span>
            </td>
            <td class="num muted" colspan="3">${g.noSales} item${g.noSales === 1 ? '' : 's'} uncomparable</td>
            <td class="num muted">—</td>
          </tr>`;
      }

      const diff = g.used - g.sold;
      const cls = diff > 0.05 ? 'bad' : diff < -0.05 ? 'good' : '';
      return `
        <tr id="cmRow${i}" class="cm-crow ${open ? 'open' : ''}"
            onclick="window.BarStockConsumptionMatch.toggleCat(${i})">
          <td class="cm-cname">
            <i class="ti ti-chevron-right cm-chev" aria-hidden="true"></i>
            ${esc(g.cat)}
            ${g.noSales ? `<span class="cm-tag">${g.noSales} w/o sales</span>` : ''}
          </td>
          <td class="num cm-c-sold">${btl(g.sold)}</td>
          <td class="num cm-c-used">${btl(g.used)}</td>
          <td class="num ${cls}">${btlSigned(diff)}</td>
          <td class="num ${cls}"><b>${g.loss < 0 ? '+' : ''}${money(g.loss)}</b></td>
        </tr>
        ${open ? `<tr class="cm-cdetail"><td colspan="5">${itemRows(g, i)}</td></tr>` : ''}`;
    }).join('');

    return `
      <div class="tablewrap cm-wrap">
        <table class="cm-table">
          <thead>
            <tr>
              <th>Category</th>
              <th class="num cm-c-sold">Sold</th>
              <th class="num cm-c-used">Poured</th>
              <th class="num">Bottles</th>
              <th class="num">At cost</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // ── Pintado ──────────────────────────────────────────────────────────
  function paint() {
    const host = $('cmBody');
    if (!host || !_cycle) return;

    const totalLoss = _groups.reduce((s, g) => s + Math.max(0, g.loss), 0);
    const noSalesTotal = _groups.reduce((s, g) => s + g.noSales, 0);
    const anySales = _groups.some(g => g.withSales > 0);
    const closed = (_cycle.weeks || []).filter(w => w.hasUsage);

    // Los ciclos cerrados, para poder mirar atras. Solo cerrados: el que
    // esta corriendo no tiene con que comparar.
    const picker = closed.length > 1 ? `
      <div class="cm-weeks">
        ${closed.slice(0, 8).map(w => `
          <button type="button" class="oh-filter-chip ${w.week_start === _cycle.week ? 'active' : ''}"
                  onclick="window.BarStockConsumptionMatch.setWeek('${w.week_start}')">
            ${esc(weekLabel(w.week_start))}
          </button>`).join('')}
      </div>` : '';

    // Sin NINGUNA venta en todo el ciclo no hay nada que comparar, y la
    // causa casi siempre es la misma: los ficheros se subieron estando
    // abierta otra semana. Se dice donde, no solo que falta.
    const banner = !anySales ? `
      <div class="cm-banner">
        <i class="ti ti-alert-triangle" aria-hidden="true"></i>
        <div>
          <b>No sales data for this cycle.</b>
          The files go in <b>Usage → week of ${esc(weekLabel(_cycle.week))}</b>,
          and there are two of them: liquor and wine. Loading them into a
          different week leaves this screen empty.
        </div>
      </div>` : '';

    host.innerHTML = `
      <div class="cm-panel">
        <div class="cm-head">
          <div class="cm-total">
            <b>${money(totalLoss)}</b>
            <span>poured beyond sales, at cost</span>
          </div>
          <span class="cm-week">Closed cycle · ${esc(weekLabel(_cycle.week))}</span>
        </div>
        ${picker}
        ${chart(_groups)}
      </div>
      ${banner}
      ${anySales ? table(_groups) : ''}
      ${anySales && noSalesTotal ? `
        <div class="cm-foot">
          ${noSalesTotal} item${noSalesTotal === 1 ? '' : 's'} had no line in the sales
          files and were left out of every total.
        </div>` : ''}`;
  }

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
    try {
      _cycle = await TU.loadCycle(_week);
    } catch (e) {
      console.warn('[consumption] no se pudo leer el ciclo', e);
      host.innerHTML = `<div class="cm-empty">Could not read the cycle. Try again.</div>`;
      return;
    }

    if (!_cycle.week || !_cycle.rows.length) {
      host.innerHTML = `
        <div class="cm-empty">
          <b>No closed cycle yet.</b><br>
          A cycle closes by itself when you import the next count — that is
          what fills in what was used. Nothing to load here.
        </div>`;
      return;
    }

    _groups = group(_cycle.rows);
    _openCat = -1;
    _openItem = -1;
    paint();
  }

  function toggleCat(i) {
    // Acordeon exclusivo. Con diez categorias abiertas a la vez esto
    // vuelve a ser la lista infinita que se queria evitar.
    _openCat = (_openCat === i) ? -1 : i;
    _openItem = -1;
    paint();
    if (_openCat === i) {
      const el = $('cmRow' + i);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function toggleItem(ev, ci, ii) {
    // Sin esto el click en la fila del articulo burbujea hasta la fila de
    // la categoria y la cierra en el mismo gesto.
    if (ev && ev.stopPropagation) ev.stopPropagation();
    _openCat = ci;
    _openItem = (_openItem === ii) ? -1 : ii;
    paint();
  }

  function setWeek(w) {
    _week = w || null;
    render();
  }

  window.BarStockConsumptionMatch = {
    render, paint, setWeek, toggleCat, toggleItem, group
  };
})();
