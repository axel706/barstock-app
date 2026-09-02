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
  // ── Una tabla, tres niveles ─────────────────────────────────────────
  //
  //   ciclos  →  categorías de ese ciclo  →  artículos de esa categoría
  //
  // Es siempre la MISMA tabla cambiando de contenido, con el panel
  // lateral de Inventory al lado. No hay listas apiladas: con 258
  // artículos, enseñarlos de golpe no es información, es un muro.
  //
  // ── Aquí no se usa <button> ─────────────────────────────────────────
  //
  // app.css:3153 impone `border-radius:999px !important` a todo `button`
  // salvo una lista de excepciones nominal. Una barra de gráfica hecha
  // con <button> salía dentro de una cápsula blanca. Se puede añadir una
  // clase más a esa lista, pero la lista ya tiene veintiún nombres y
  // crece cada vez que alguien tropieza. Los elementos pinchables de
  // este módulo son divs con role="button", que además heredan cero
  // estilo global.

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  const money = (n) => '$' + Math.round(Math.abs(n)).toLocaleString();
  const money2 = (n) => '$' + Math.abs(n).toFixed(2);

  // Un decimal SIEMPRE, no solo por debajo de diez.
  //
  // Antes se redondeaba a entero a partir de 10 y el desglose salia
  // "31 − 26 = +4.8": tres numeros correctos que juntos parecen un error
  // de la app. A un decimal la resta cuadra a la vista, que es el unico
  // sitio donde el usuario la puede comprobar.
  const btl = (n) => Math.abs(n).toFixed(1).replace(/\.0$/, '');
  // ── Pérdida o ganancia, con palabras ─────────────────────────────────
  //
  // Antes esto era "+37.8" y "−9.8", y el signo significaba lo contrario
  // de lo que parece: el MÁS es la pérdida —se sirvió de más respecto a
  // lo vendido— y el MENOS es la ganancia aparente. Nadie lee eso bien a
  // la primera, y menos quien recibe el PDF sin haber usado la app.
  //
  // "Ganancia" va entre comillas a propósito en el texto de ayuda: el
  // licor no aparece solo, así que casi siempre es un error de conteo.
  // Pero es la palabra que usa el negocio y forzar otra sería peor.
  function gap(n) {
    if (Math.abs(n) <= 0.05) return { num: btl(n), word: 'even', cls: '' };
    return n > 0
      ? { num: btl(n), word: 'lost',   cls: 'bad'  }
      : { num: btl(n), word: 'gained', cls: 'good' };
  }
  const gapCell = (n) => {
    const g = gap(n);
    return `<span class="cm-gap ${g.cls}">${g.num}<em>${g.word}</em></span>`;
  };
  const gapText = (n) => { const g = gap(n); return `${g.num} ${g.word}`; };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dayLabel = (w) => w
    ? MONTHS[+w.slice(5, 7) - 1] + ' ' + (+w.slice(8, 10))
    : '';

  // La categoría vive en state.master, y las filas de Usage vienen de
  // inventory_snapshots. Se unen por nombre, igual que en
  // spend-by-category. Efecto secundario conocido: si recategorizas un
  // artículo, las semanas pasadas se recolocan tambien — es preferible a
  // congelar la categoría en cada instantánea.
  function masterOf(itemName) {
    const master = (window.state && state.master) || [];
    return master.find(m => m.item === itemName) || null;
  }
  function categoryOf(itemName) {
    const hit = masterOf(itemName);
    return (hit && hit.category) || null;
  }

  // ── Agrupar ──────────────────────────────────────────────────────────
  function group(rows) {
    const out = new Map();
    const ensure = (c) => {
      if (!out.has(c)) out.set(c, {
        cat: c, sold: 0, used: 0, loss: 0, items: [], unmatched: [],
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
        // Fuera de los totales, pero NO fuera de la vista. Son
        // precisamente los que hay que arreglar: el vino que el POS
        // registra con otro nombre acaba aquí. Esconderlos dejaba el
        // problema sin sitio desde donde tocarlo.
        if (Number(r.used || 0) > 0) {
          g.noSales++;
          g.unmatched.push({
            item: r.item_name,
            code: r.code || '',
            used: Number(r.used) || 0,
            soldSrc: r.soldSrc || 'none'
          });
        }
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
          code: r.code || '',
          vendor: r.vendor || '',
          used: Number(r.used) || 0,
          sold: Number(r.sold) || 0,
          bottles: Number(r.variance),
          money: Number(r.loss) || 0,
          // De dónde salió `sold`. Viaja hasta aquí porque el panel lo
          // enseña y el diálogo de corrección lo necesita.
          soldSrc: r.soldSrc || 'none',
          soldNote: r.soldNote || ''
        });
      }
    }

    // Dentro de cada categoria, por DINERO y no por botellas: una botella
    // de un producto caro pesa mas que tres de uno barato, y ordenar por
    // litros esconde donde esta la perdida.
    for (const g of out.values()) {
      g.items.sort((a, b) => b.money - a.money);
      // Los sin emparejar, por consumo: el que más se sirvió es el que
      // más dinero está escondiendo.
      g.unmatched.sort((a, b) => b.used - a.used);
    }

    // Y las categorias, por perdida. Las que no pierden nada caen al
    // final solas, sin necesidad de filtrarlas.
    return Array.from(out.values()).sort((a, b) => b.loss - a.loss);
  }

  const totalOf = (groups) => groups.reduce((s, g) => s + Math.max(0, g.loss), 0);

  // ── Estado ───────────────────────────────────────────────────────────
  let _view = 'cycles';   // cycles | cats | items
  let _weeks = [];        // todas las semanas, de Usage
  let _week = null;       // ciclo abierto
  let _groups = [];       // categorias del ciclo abierto
  let _cat = -1;
  let _item = -1;
  // Los sin emparejar viven en otra lista, así que llevan su propio
  // índice. Reutilizar _item habría hecho que el número 2 significara
  // dos artículos distintos según de dónde vinieras.
  let _unItem = -1;
  let _year = null;
  let _month = null;      // null = todo el año
  let _busy = false;

  // Lo ya calculado no se vuelve a pedir. Cada ciclo son dos consultas
  // paginadas a la nube; volver atrás en la navegación no debería costar
  // una recarga.
  const _cache = new Map();   // week_start -> { groups, total }

  // ── Calendario ───────────────────────────────────────────────────────
  //
  // Mismo gesto que la lista de semanas de Usage —año arriba, meses
  // debajo— pero sin su comportamiento de arrancar en blanco: aquí, sin
  // mes elegido, se ven todos los ciclos del año. Un calendario que no
  // muestra nada hasta que aciertas el mes correcto parece roto.
  function calendar(closed) {
    const years = [...new Set(closed.map(w => w.week_start.slice(0, 4)))].sort().reverse();
    if (!years.length) return '';
    if (!_year || !years.includes(_year)) _year = years[0];

    const monthsWith = new Set(
      closed.filter(w => w.week_start.startsWith(_year)).map(w => +w.week_start.slice(5, 7) - 1));

    const yrs = years.length > 1 ? `
      <div class="cm-years">
        ${years.map(y => `
          <span class="cm-chip ${y === _year ? 'active' : ''}" role="button" tabindex="0"
                onclick="window.BarStockConsumptionMatch.setYear('${y}')">${y}</span>`).join('')}
      </div>` : '';

    return `
      ${yrs}
      <div class="cm-months">
        ${MONTHS.map((m, i) => {
          const has = monthsWith.has(i);
          const on = _month === i;
          return `<span class="cm-mon ${has ? '' : 'off'} ${on ? 'active' : ''}"
                        ${has ? `role="button" tabindex="0" onclick="window.BarStockConsumptionMatch.setMonth(${i})"` : ''}
                  >${m}</span>`;
        }).join('')}
      </div>`;
  }

  // ── Gráfica ──────────────────────────────────────────────────────────
  //
  // Barras en HTML, no en SVG.
  //
  // El SVG anterior tenia viewBox 320x150 y se estiraba a todo el ancho
  // del contenedor: en un monitor el texto de los ejes salia a 40px de
  // alto porque escala con el dibujo. Un div escala su caja y deja la
  // tipografia donde estaba.
  //
  // La altura util es 100% menos la banda de la etiqueta, y ese mismo
  // descuento se aplica a las lineas de referencia, para que el 50% de
  // la rejilla y el 50% de una barra caigan en el mismo pixel.
  const LBL = 20;

  function chart(groups) {
    // Solo las categorias que tienen con que comparar. Una barra ambar
    // sola, sin su verde al lado, se lee como perdida del 100% cuando en
    // realidad significa que falta el archivo de ventas de esa familia.
    const idx = groups.map((g, i) => i)
      .filter(i => groups[i].withSales > 0 && (groups[i].sold > 0 || groups[i].used > 0));
    if (!idx.length) return '';

    const max = Math.max(...idx.map(i => Math.max(groups[i].sold, groups[i].used)), 1);

    // La rejilla es HERMANA del carril que hace scroll, no hija. Dentro
    // de un contenedor con overflow, un absolute con right:0 se ancla al
    // borde visible y se arrastra con el scroll: las lineas se despegaban
    // de las barras al deslizar en el movil.
    const grid = [0, 0.5, 1].map(f => `
      <div class="cm-gline" style="bottom:calc(${LBL}px + ${f} * (100% - ${LBL}px))"></div>
      <div class="cm-glbl"  style="bottom:calc(${LBL}px + ${f} * (100% - ${LBL}px))">${Math.round(max * f)}</div>
    `).join('');

    const cols = idx.map(i => {
      const g = groups[i];
      const hS = Math.max(1.5, (g.sold / max) * 100);
      const hU = Math.max(1.5, (g.used / max) * 100);
      return `
        <div class="cm-col ${i === _cat ? 'active' : ''}" role="button" tabindex="0"
             onclick="window.BarStockConsumptionMatch.openCat(${i})"
             title="${esc(g.cat)} · ${btl(g.sold)} sold, ${btl(g.used)} poured, ${money(g.loss)}">
          <div class="cm-bars">
            <span class="cm-b cm-b-sold" style="height:${hS}%"></span>
            <span class="cm-b cm-b-used" style="height:${hU}%"></span>
          </div>
          <span class="cm-xlabel">${esc(g.cat.split(/[\s&]/)[0])}</span>
        </div>`;
    }).join('');

    // ── La gráfica va DENTRO de un marco, como las tablas ────────────
    //
    // Mismo borde, mismo radio y una cabecera con el tratamiento de un
    // thead. Suelta sobre el fondo parecía flotar encima de la pantalla
    // en vez de formar parte de ella: en esta app todo lo que muestra
    // datos vive dentro de una caja con cabecera, y la gráfica era lo
    // único que no.
    //
    // La leyenda sube a esa cabecera, que es donde una tabla pone los
    // nombres de sus columnas.
    return `
      <div class="cm-chartwrap">
        <div class="cm-charthead">
          <span class="cm-charttitle">Sold vs poured by category</span>
          <span class="cm-legend">
            <span><i class="cm-key cm-b-sold"></i>Sold</span>
            <span><i class="cm-key cm-b-used"></i>Poured</span>
            <span class="cm-legend-tip">Tap a category</span>
          </span>
        </div>
        <div class="cm-chartbody">
          <div class="cm-chart">
            ${grid}
            <div class="cm-plot">${cols}</div>
          </div>
        </div>
      </div>`;
  }

  // ── Nivel 1 · los ciclos ─────────────────────────────────────────────
  function cycleTable() {
    const closed = _weeks.filter(w => w.hasUsage);
    if (!closed.length) {
      return `<div class="cm-empty">
        <b>No closed cycle yet.</b><br>
        A cycle closes by itself when you import the next count — that is
        what fills in what was used.
      </div>`;
    }

    const shown = closed.filter(w =>
      w.week_start.startsWith(_year) &&
      (_month === null || +w.week_start.slice(5, 7) - 1 === _month));

    const rows = shown.map(w => {
      const c = _cache.get(w.week_start);
      const on = w.week_start === _week;
      return `
        <tr class="cm-row ${on ? 'sel' : ''}"
            onclick="window.BarStockConsumptionMatch.openCycle('${w.week_start}')">
          <td class="cm-c1"><i class="ti ti-calendar-week cm-ri" aria-hidden="true"></i> Week of ${esc(dayLabel(w.week_start))}</td>
          <td class="num">${w.itemCount || '—'}</td>
          <td class="num">${c ? c.groups.filter(g => g.withSales).length : '—'}</td>
          <td class="num money">${c ? `<b>${money(c.total)}</b>` : '<span class="muted">tap to open</span>'}</td>
        </tr>`;
    }).join('') || `<tr><td colspan="4" class="cm-none">No cycles in this month.</td></tr>`;

    return `
      <table class="cm-table">
        <colgroup><col><col style="width:88px"><col style="width:104px"><col style="width:124px"></colgroup>
        <thead><tr>
          <th>Cycle</th><th class="num">Items</th><th class="num">Categories</th><th class="num">At cost</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── Nivel 2 · las categorías ─────────────────────────────────────────
  function catTable() {
    const rows = _groups.map((g, i) => {
      // Una categoria ENTERA sin datos de venta no es una nota al pie:
      // casi siempre significa que falta un archivo. Las ventas llegan en
      // dos ficheros separados, vino y licor, asi que olvidar uno deja
      // mudas todas sus categorias de golpe.
      if (!g.withSales) {
        return `
          <tr class="cm-row cm-row-warn">
            <td class="cm-c1">
              <i class="ti ti-alert-triangle cm-ri warn" aria-hidden="true"></i>
              ${esc(g.cat)} <span class="cm-tag">no sales file</span>
            </td>
            <td class="num muted cm-c-sold">—</td>
            <td class="num muted cm-c-used">—</td>
            <td class="num muted">${g.noSales} item${g.noSales === 1 ? '' : 's'}</td>
            <td class="num muted">—</td>
          </tr>`;
      }
      const diff = g.used - g.sold;
      const cls = diff > 0.05 ? 'bad' : diff < -0.05 ? 'good' : '';
      return `
        <tr class="cm-row ${i === _cat ? 'sel' : ''}"
            onclick="window.BarStockConsumptionMatch.openCat(${i})">
          <td class="cm-c1">
            <i class="ti ti-chevron-right cm-ri" aria-hidden="true"></i>
            ${esc(g.cat)}
            ${g.noSales ? `<span class="cm-tag">${g.noSales} w/o sales</span>` : ''}
          </td>
          <td class="num cm-c-sold">${btl(g.sold)}</td>
          <td class="num cm-c-used">${btl(g.used)}</td>
          <td class="num">${gapCell(diff)}</td>
          <td class="num money ${cls}"><b>${money(g.loss)}</b></td>
        </tr>`;
    }).join('');

    return `
      <table class="cm-table">
        <colgroup><col><col style="width:78px"><col style="width:82px"><col style="width:86px"><col style="width:104px"></colgroup>
        <thead><tr>
          <th>Category</th>
          <th class="num cm-c-sold">Sold</th>
          <th class="num cm-c-used">Poured</th>
          <th class="num">Bottles</th>
          <th class="num">At cost</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── Nivel 3 · los artículos ──────────────────────────────────────────
  function itemTable() {
    const g = _groups[_cat];
    if (!g) return '';
    if (!g.items.length && !g.unmatched.length) {
      return `<div class="cm-empty">No comparable items in ${esc(g.cat)}.</div>`;
    }
    const RP = window.BarStockConsumptionReport;

    // Una casilla por artículo. El click en ella NO abre el panel: son
    // dos gestos distintos sobre la misma fila y mezclarlos haría que
    // marcar veinte artículos abriera y cerrara el panel veinte veces.
    const rows = g.items.map((it, i) => {
      const cls = it.bottles > 0.05 ? 'bad' : it.bottles < -0.05 ? 'good' : '';
      const inRep = RP && RP.isPicked(it.item);
      const pend = RP && RP.isPending(it.item);
      return `
        <tr class="cm-row ${i === _item ? 'sel' : ''} ${inRep ? 'inrep' : ''}"
            onclick="window.BarStockConsumptionMatch.openItem(${i})">
          <td class="cm-pick" data-item="${esc(it.item)}"
              onclick="window.BarStockConsumptionMatch.pick(event, this.dataset.item)">
            <span class="cm-box ${pend ? 'on' : ''} ${inRep ? 'done' : ''}">
              <i class="ti ti-check" aria-hidden="true"></i>
            </span>
          </td>
          <td class="cm-c1">${esc(it.item)}</td>
          <td class="num cm-c-used">${btl(it.used)}</td>
          <td class="num cm-c-sold">${btl(it.sold)}</td>
          <td class="num">${gapCell(it.bottles)}</td>
          <td class="num money ${cls}"><b>${money(it.money)}</b></td>
        </tr>`;
    }).join('');

    const allPending = g.items.length &&
      g.items.every(it => RP && (RP.isPending(it.item) || RP.isPicked(it.item)));

    // ── Los que no encontraron su venta ──
    //
    // Van al final, aparte y en ámbar, porque no cuentan en ningún total:
    // sumarlos daría una pérdida del 100% que no es real. Pero cada uno
    // lleva su botón de corregir, que es lo único que los saca de aquí.
    const unmatched = g.unmatched.length ? `
      <tr class="cm-sechead">
        <td colspan="6">
          <i class="ti ti-alert-triangle" aria-hidden="true"></i>
          ${g.unmatched.length} item${g.unmatched.length === 1 ? '' : 's'} with no sales line
          <span class="cm-sechead-sub">Not counted anywhere. Link the POS line or type the number.</span>
        </td>
      </tr>
      ${g.unmatched.map((u, ui) => `
        <tr class="cm-row cm-row-un ${ui === _unItem ? 'sel' : ''}"
            onclick="window.BarStockConsumptionMatch.openUnmatched(${ui})">
          <td class="cm-pick"></td>
          <td class="cm-c1">${esc(u.item)}</td>
          <td class="num cm-c-used">${btl(u.used)}</td>
          <td class="num cm-c-sold muted">—</td>
          <td class="num muted">—</td>
          <td class="num">
            <span class="cm-fixlink" role="button" tabindex="0" data-item="${esc(u.item)}"
                  onclick="event.stopPropagation();window.BarStockConsumptionMatch.fixUnmatched(this.dataset.item)">
              <i class="ti ti-pencil" aria-hidden="true"></i> Fix
            </span>
          </td>
        </tr>`).join('')}` : '';

    return `
      <table class="cm-table">
        <colgroup><col style="width:38px"><col><col style="width:78px"><col style="width:78px"><col style="width:86px"><col style="width:104px"></colgroup>
        <thead><tr>
          <th class="cm-pick" onclick="window.BarStockConsumptionMatch.pickAll(event, ${allPending})">
            <span class="cm-box ${allPending ? 'on' : ''}"><i class="ti ti-check" aria-hidden="true"></i></span>
          </th>
          <th>Item</th>
          <th class="num cm-c-used">Poured</th>
          <th class="num cm-c-sold">Sold</th>
          <th class="num">Bottles</th>
          <th class="num">At cost</th>
        </tr></thead>
        <tbody>${rows}${unmatched}</tbody>
      </table>`;
  }

  // ── Panel lateral ────────────────────────────────────────────────────
  //
  // Se reutilizan tal cual las clases .inv-item-panel y .inv-panel-* de
  // Inventory. Copiarlas con otro nombre habría dado un panel que se
  // parece al de Inventory hoy y deja de parecerse en cuanto alguien
  // retoque uno de los dos.
  function panel() {
    const stat = (label, value, color) =>
      `<div class="inv-panel-stat">
         <div class="inv-panel-stat-label">${label}</div>
         <div class="inv-panel-stat-value"${color ? ` style="color:${color}"` : ''}>${value}</div>
       </div>`;
    const row = (label, value, color) =>
      `<div class="inv-panel-row">
         <span class="inv-panel-row-label">${label}</span>
         <span class="inv-panel-row-value"${color ? ` style="color:${color}"` : ''}>${value}</span>
       </div>`;

    // Nivel 3 con un artículo SIN VENTA elegido.
    //
    // Tiene panel propio y no el de siempre: aquí no hay variance ni
    // pérdida que enseñar, y rellenar las tarjetas con guiones sería
    // fingir un cálculo que no existe. Lo único accionable es corregir
    // la venta, así que el panel va de eso.
    if (_view === 'items' && _cat >= 0 && _unItem >= 0) {
      const g = _groups[_cat];
      const u = g.unmatched[_unItem];
      if (u) {
        const m = masterOf(u.item);
        const cost = m ? Number(m.value || 0) : 0;
        return `
          <div class="inv-panel-header">
            <div class="inv-panel-name-wrap"><span class="inv-panel-name">${esc(u.item)}</span></div>
            <div class="inv-panel-meta">${esc(g.cat)}${u.code ? ' · ' + esc(u.code) : ''}</div>
          </div>
          <div class="inv-panel-section">
            <div class="inv-panel-grid">
              ${stat('POURED', btl(u.used))}
              ${stat('SOLD', '—', 'var(--sub)')}
              ${stat('BOTTLES', '—', 'var(--sub)')}
              ${stat('AT COST', '—', 'var(--sub)')}
            </div>
          </div>
          <div class="inv-panel-section cm-flex">
            ${cost ? row('Bottle cost', money2(cost)) : ''}
            ${row('If none sold', money(u.used * cost), '#f59e0b')}
            <div class="cm-panel-note">
              No line in the sales file matches this item, so nothing here
              counts. Link the POS line or type the number.
            </div>
          </div>
          <div class="inv-panel-actions-section">
            ${origin(u)}
            <span class="cm-btn ghost cm-fixbtn" role="button" tabindex="0"
                  data-item="${esc(u.item)}"
                  onclick="window.BarStockConsumptionMatch.fixUnmatched(this.dataset.item)">
              <i class="ti ti-pencil" aria-hidden="true"></i> Fix sales
            </span>
          </div>`;
      }
    }

    // Nivel 3 con artículo elegido: el desglose completo
    if (_view === 'items' && _cat >= 0 && _item >= 0) {
      const g = _groups[_cat];
      const it = g.items[_item];
      const m = masterOf(it.item);
      const unit = it.bottles ? it.money / it.bottles : (m ? Number(m.value || 0) : 0);
      const bad = it.bottles > 0.05;
      const col = bad ? '#ef4444' : it.bottles < -0.05 ? '#22c55e' : 'var(--text)';
      const pct = it.sold > 0 ? (it.bottles / it.sold) * 100 : null;

      return `
        <div class="inv-panel-header">
          <div class="inv-panel-name-wrap"><span class="inv-panel-name">${esc(it.item)}</span></div>
          <div class="inv-panel-meta">${esc(g.cat)}${it.code ? ' · ' + esc(it.code) : ''}</div>
        </div>
        <div class="inv-panel-section">
          <div class="inv-panel-grid">
            ${stat('POURED', btl(it.used))}
            ${stat('SOLD', btl(it.sold))}
            ${stat(bad ? 'BOTTLES LOST' : 'BOTTLES GAINED', btl(it.bottles), col)}
            ${stat(bad ? 'COST LOST' : 'COST GAINED', money(it.money), col)}
          </div>
        </div>
        <div class="inv-panel-section cm-flex">
          ${row('Bottle cost', money2(unit))}
          ${pct !== null
            ? row('Vs sales', Math.abs(pct).toFixed(0) + '% ' + (pct > 0 ? 'lost' : 'gained'), col)
            : ''}
          <div class="cm-panel-note">
            ${bad
              ? 'Over-pour, spillage, comps not rung in, or a miscount.'
              : 'Usually a miscount — liquor does not appear on its own.'}
          </div>
        </div>
        <div class="inv-panel-actions-section">
          ${origin(it)}
          <span class="cm-btn ghost cm-fixbtn" role="button" tabindex="0"
                onclick="window.BarStockConsumptionMatch.fixSales()">
            <i class="ti ti-pencil" aria-hidden="true"></i> Fix sales
          </span>
        </div>`;
    }

    // Nivel 3 sin artículo: resumen de la categoría
    if (_view === 'items' && _cat >= 0) {
      const g = _groups[_cat];
      const diff = g.used - g.sold;
      const col = diff > 0.05 ? '#ef4444' : diff < -0.05 ? '#22c55e' : 'var(--text)';
      return `
        <div class="inv-panel-header">
          <div class="inv-panel-name-wrap"><span class="inv-panel-name">${esc(g.cat)}</span></div>
          <div class="inv-panel-meta">Week of ${esc(dayLabel(_week))}</div>
        </div>
        <div class="inv-panel-section">
          <div class="inv-panel-grid">
            ${stat('SOLD', btl(g.sold))}
            ${stat('POURED', btl(g.used))}
            ${stat(diff > 0.05 ? 'BOTTLES LOST' : 'BOTTLES GAINED', btl(diff), col)}
            ${stat(diff > 0.05 ? 'COST LOST' : 'COST GAINED', money(g.loss), col)}
          </div>
        </div>
        <div class="inv-panel-section cm-flex">
          ${row('Items compared', g.withSales)}
          ${row('Losing items', g.items.filter(i => i.bottles > 0.05).length)}
          ${g.noSales ? row('No sales line', g.noSales, '#f59e0b') : ''}
        </div>
        <div class="inv-panel-actions-section">
          <div class="cm-panel-note">Pick an item to see its numbers.</div>
        </div>`;
    }

    // Nivel 2: resumen del ciclo
    if (_view === 'cats') {
      const total = totalOf(_groups);
      const noSales = _groups.reduce((s, g) => s + g.noSales, 0);
      const worst = _groups.find(g => g.withSales && g.loss > 0);
      return `
        <div class="inv-panel-header">
          <div class="inv-panel-name-wrap"><span class="inv-panel-name">Week of ${esc(dayLabel(_week))}</span></div>
          <div class="inv-panel-meta">Closed cycle</div>
        </div>
        <div class="inv-panel-section">
          <div class="inv-panel-grid">
            ${stat('AT COST', money(total), '#ef4444')}
            ${stat('CATEGORIES', _groups.filter(g => g.withSales).length)}
            ${stat('ITEMS', _groups.reduce((s, g) => s + g.withSales, 0))}
            ${stat('NO SALES', noSales || '—')}
          </div>
        </div>
        <div class="inv-panel-section cm-flex">
          <div class="inv-panel-section-label">WORST CATEGORY</div>
          ${worst
            ? row(worst.cat, money(worst.loss), '#ef4444')
            : `<div class="cm-panel-note">Nothing over-poured this cycle.</div>`}
        </div>
        <div class="inv-panel-actions-section">
          <div class="cm-panel-note">Pick a category to see its items.</div>
        </div>`;
    }

    // Nivel 1
    const closed = _weeks.filter(w => w.hasUsage).length;
    return `
      <div class="inv-panel-header">
        <div class="inv-panel-name-wrap"><span class="inv-panel-name">Cycles</span></div>
        <div class="inv-panel-meta">${closed} closed</div>
      </div>
      <div class="inv-panel-section cm-flex">
        <div class="cm-panel-note">
          A cycle closes when the next count is imported — that is what
          fills in what was used. Pick one to compare it against the sales
          files.
        </div>
      </div>`;
  }

  // ── De dónde salió la cifra de ventas ────────────────────────────────
  //
  // Se dice siempre, no solo cuando es rara. Una cifra emparejada por
  // parecido de texto y una escrita a mano se leen idénticas en la tabla,
  // y son cosas muy distintas a la hora de creerse una pérdida.
  function origin(it) {
    const SF = window.BarStockSalesFix;
    if (!SF || !it) return '';
    const o = SF.origin(it);
    return `<div class="cm-origin ${o.cls}">
      <span class="sf-dot ${o.cls}"></span>${esc(o.txt)}
    </div>`;
  }

  // ── Migas ────────────────────────────────────────────────────────────
  function crumbs() {
    const c = [`<span class="cm-crumb ${_view === 'cycles' ? 'now' : ''}"
                      ${_view === 'cycles' ? '' : 'role="button" tabindex="0" onclick="window.BarStockConsumptionMatch.goCycles()"'}
                >Cycles</span>`];
    if (_week) {
      c.push(`<i class="ti ti-chevron-right cm-crumb-sep" aria-hidden="true"></i>`);
      c.push(`<span class="cm-crumb ${_view === 'cats' ? 'now' : ''}"
                    ${_view === 'cats' ? '' : 'role="button" tabindex="0" onclick="window.BarStockConsumptionMatch.goCats()"'}
              >Week of ${esc(dayLabel(_week))}</span>`);
    }
    if (_view === 'items' && _cat >= 0) {
      c.push(`<i class="ti ti-chevron-right cm-crumb-sep" aria-hidden="true"></i>`);
      c.push(`<span class="cm-crumb now">${esc(_groups[_cat].cat)}</span>`);
    }
    if (_view === 'report') {
      c.push(`<i class="ti ti-chevron-right cm-crumb-sep" aria-hidden="true"></i>`);
      c.push(`<span class="cm-crumb now">Report</span>`);
    }
    return `<div class="cm-crumbs">${c.join('')}</div>`;
  }

  // ── Barra de selección ───────────────────────────────────────────────
  //
  // "Send to report" solo existe cuando hay algo marcado, y "View report"
  // solo cuando hay algo dentro. Botones permanentemente apagados
  // enseñan a ignorar la barra entera.
  function actionBar() {
    const RP = window.BarStockConsumptionReport;
    if (!RP) return '';
    const pend = RP.pendingCount();
    const inRep = RP.pickedCount();
    if (!pend && !inRep) return '';

    return `
      <div class="cm-actionbar">
        ${pend ? `
          <span class="cm-btn primary" role="button" tabindex="0"
                onclick="window.BarStockConsumptionMatch.sendToReport()">
            <i class="ti ti-plus" aria-hidden="true"></i>
            Send to report (${pend})
          </span>
          <span class="cm-btn ghost" role="button" tabindex="0"
                onclick="window.BarStockConsumptionMatch.clearPending()">Cancel</span>
        ` : ''}
        ${inRep ? `
          <span class="cm-btn ${pend ? 'ghost' : 'primary'}" role="button" tabindex="0"
                onclick="window.BarStockConsumptionMatch.goReport()">
            <i class="ti ti-file-text" aria-hidden="true"></i>
            View report (${inRep})
          </span>` : ''}
      </div>`;
  }

  // ── Pintado ──────────────────────────────────────────────────────────
  function paint() {
    const host = $('cmBody');
    if (!host) return;

    // El reporte ocupa el ancho entero: no hay panel lateral porque no
    // hay nada que seleccionar, y sus tablas necesitan sitio.
    if (_view === 'report') {
      host.innerHTML = `
        ${crumbs()}
        <div class="cm-report">${window.BarStockConsumptionReport.view(_groups)}</div>`;
      return;
    }

    let head = '', body = '';

    if (_view === 'cycles') {
      head = calendar(_weeks.filter(w => w.hasUsage));
      body = cycleTable();
    } else {
      // Dentro de una categoría el número grande es el de ESA categoría.
      // Dejar el del ciclo entero mientras la tabla enseña solo Vodka
      // invita a sumar dos cosas distintas.
      const inCat = _view === 'items' && _cat >= 0;
      const total = inCat ? Math.max(0, _groups[_cat].loss) : totalOf(_groups);
      const sub = inCat
        ? `poured beyond sales in ${esc(_groups[_cat].cat)}, at cost`
        : 'poured beyond sales, at cost';
      const anySales = _groups.some(g => g.withSales > 0);
      // Sin NINGUNA venta en todo el ciclo no hay nada que comparar, y la
      // causa casi siempre es la misma: los ficheros se subieron estando
      // abierta otra semana. Se dice donde, no solo que falta.
      head = `
        <div class="cm-total">
          <b>${money(total)}</b>
          <span>${sub}</span>
        </div>
        ${anySales ? chart(_groups) : `
          <div class="cm-banner">
            <i class="ti ti-alert-triangle" aria-hidden="true"></i>
            <div><b>No sales data for this cycle.</b>
              The files go in <b>Usage → week of ${esc(dayLabel(_week))}</b>,
              and there are two of them: liquor and wine. Loading them into
              a different week leaves this screen empty.</div>
          </div>`}`;
      body = _view === 'cats' ? catTable() : itemTable();
    }

    host.innerHTML = `
      ${crumbs()}
      ${actionBar()}
      <div class="cm-headzone">${head}</div>
      <div class="cm-layout">
        <div class="tablewrap cm-wrap">${body}</div>
        <div class="inv-item-panel cm-side">
          <div class="cm-side-body">${panel()}</div>
        </div>
      </div>`;
  }

  // ── Carga ────────────────────────────────────────────────────────────
  async function ensureCycle(week) {
    if (_cache.has(week)) {
      const c = _cache.get(week);
      _groups = c.groups;
      return true;
    }
    const TU = window.BarStockTheoreticalUsage;
    _busy = true;
    try {
      const cycle = await TU.loadCycle(week);
      _groups = group(cycle.rows || []);
      _cache.set(week, { groups: _groups, total: totalOf(_groups) });
      return true;
    } catch (e) {
      console.warn('[consumption] no se pudo leer el ciclo', e);
      return false;
    } finally {
      _busy = false;
    }
  }

  async function render() {
    const host = $('cmBody');
    if (!host) return;

    const TU = window.BarStockTheoreticalUsage;
    if (!TU || !TU.loadCycle) {
      host.innerHTML = `<div class="cm-empty">Usage is not loaded.</div>`;
      return;
    }

    host.innerHTML = `<div class="cm-empty">Reading the cycle list…</div>`;
    try {
      const cycle = await TU.loadCycle();      // sin argumento: el último cerrado
      _weeks = cycle.weeks || [];
      if (cycle.week) {
        const g = group(cycle.rows || []);
        _cache.set(cycle.week, { groups: g, total: totalOf(g) });
      }
    } catch (e) {
      console.warn('[consumption] no se pudo leer la lista de ciclos', e);
      host.innerHTML = `<div class="cm-empty">Could not read the cycles. Try again.</div>`;
      return;
    }

    // Se entra por la lista de ciclos, con el último ya calculado detrás
    // —una sola consulta— para que su fila no salga vacía.
    _view = 'cycles'; _week = null; _groups = []; _cat = -1; _item = -1;
    _month = null; _year = null;
    paint();
  }

  // ── Navegación ───────────────────────────────────────────────────────
  async function openCycle(week) {
    if (_busy) return;
    const host = $('cmBody');
    if (!_cache.has(week) && host) {
      const wrap = host.querySelector('.cm-wrap');
      if (wrap) wrap.innerHTML = `<div class="cm-empty">Reading week of ${esc(dayLabel(week))}…</div>`;
    }
    if (!await ensureCycle(week)) return;
    _week = week; _view = 'cats'; _cat = -1; _item = -1; _unItem = -1;

    // La selección y las notas son de ESTE ciclo. Cambiar de semana sin
    // recargarlas mezclaría en un mismo reporte artículos de periodos
    // distintos y daría un total que no corresponde a ninguno.
    const RP = window.BarStockConsumptionReport;
    if (RP) {
      RP.load(week);
      paint();                       // pintar ya, sin esperar a la nube
      RP.loadNotes(week).then(paint);
      return;
    }
    paint();
  }

  function openCat(i) {
    _cat = i; _item = -1; _unItem = -1; _view = 'items';
    paint();
  }

  function openItem(i) {
    _item = (_item === i) ? -1 : i;
    _unItem = -1;
    paint();
  }

  function openUnmatched(i) {
    _unItem = (_unItem === i) ? -1 : i;
    _item = -1;
    paint();
  }

  // ── Corregir las ventas del artículo abierto ────────────────────────
  //
  // Al cerrar el diálogo se tira la copia cacheada de ESTE ciclo y se
  // recalcula. Sin eso, la pantalla seguiría enseñando la pérdida vieja
  // y el usuario pensaría que la corrección no se guardó.
  async function fixSales() {
    if (!window.BarStockSalesFix || _cat < 0 || _item < 0) return;
    const it = _groups[_cat].items[_item];
    const catName = _groups[_cat].cat;
    const itemName = it.item;

    window.BarStockSalesFix.open(itemName, _week, it, async () => {
      _cache.delete(_week);
      if (!await ensureCycle(_week)) return;
      // Los índices se recalculan por NOMBRE: corregir unas ventas cambia
      // la pérdida, y con ella el orden de categorías y artículos. Guardar
      // el número de fila habría dejado abierto otro producto.
      _cat = _groups.findIndex(g => g.cat === catName);
      _item = _cat >= 0 ? _groups[_cat].items.findIndex(x => x.item === itemName) : -1;
      if (_cat < 0) { _view = 'cats'; _item = -1; }
      paint();
    });
  }

  // Los sin emparejar no tienen fila en _groups[].items, así que se abren
  // por nombre. Al arreglarlos suelen salir de la lista ámbar y aparecer
  // arriba con su pérdida, que es exactamente el objetivo.
  function fixUnmatched(itemName) {
    if (!window.BarStockSalesFix) return;
    const catName = _groups[_cat] ? _groups[_cat].cat : null;
    const u = (_groups[_cat]?.unmatched || []).find(x => x.item === itemName);
    window.BarStockSalesFix.open(itemName, _week, u || null, async () => {
      _cache.delete(_week);
      if (!await ensureCycle(_week)) return;
      _cat = _groups.findIndex(g => g.cat === catName);
      _item = -1;
      if (_cat < 0) _view = 'cats';
      paint();
    });
  }

  function goCycles() { _view = 'cycles'; _cat = -1; _item = -1; _unItem = -1; paint(); }
  function goCats()   { _view = 'cats';   _cat = -1; _item = -1; _unItem = -1; paint(); }
  function goReport() { _view = 'report'; _item = -1; paint(); }
  function setYear(y) { _year = y; _month = null; paint(); }
  function setMonth(m){ _month = (_month === m) ? null : m; paint(); }

  // ── Selección ────────────────────────────────────────────────────────
  //
  // La casilla no debe abrir el panel del artículo: son dos gestos sobre
  // la misma fila, y marcar veinte artículos abriría y cerraría el panel
  // veinte veces.
  function pick(ev, name) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    const RP = window.BarStockConsumptionReport;
    if (!RP) return;
    if (RP.isPicked(name)) {
      // Ya está dentro: la casilla lo saca. Sin esto, quitar un artículo
      // del reporte obligaría a vaciarlo entero y volver a empezar.
      RP.removeItem(name);
    } else {
      RP.togglePending(name);
    }
    paint();
  }

  function pickAll(ev, allOn) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    const RP = window.BarStockConsumptionReport;
    const g = _groups[_cat];
    if (!RP || !g) return;
    for (const it of g.items) {
      const on = RP.isPending(it.item) || RP.isPicked(it.item);
      if (allOn && on) { RP.isPicked(it.item) ? RP.removeItem(it.item) : RP.togglePending(it.item); }
      else if (!allOn && !on) { RP.togglePending(it.item); }
    }
    paint();
  }

  function sendToReport() {
    const RP = window.BarStockConsumptionReport;
    if (!RP) return;
    const n = RP.pendingCount();
    RP.commit();
    if (typeof setStatus === 'function') {
      setStatus(`${n} item${n === 1 ? '' : 's'} added to the report.`);
    }
    paint();
  }

  function clearPending() {
    const RP = window.BarStockConsumptionReport;
    if (!RP) return;
    for (const n of [...RP.pending]) RP.togglePending(n);
    paint();
  }

  window.BarStockConsumptionMatch = {
    render, paint, group,
    openCycle, openCat, openItem, openUnmatched,
    goCycles, goCats, goReport, setYear, setMonth,
    pick, pickAll, sendToReport, clearPending, fixSales, fixUnmatched,
    // El reporte necesita los grupos del ciclo abierto para recalcular
    // sus totales con solo los artículos elegidos.
    groups: () => _groups,
    week: () => _week
  };
})();
