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

  // Qué archivos de ventas tiene el ciclo abierto: { liquor, wine,
  // legacy, total }. Se rellena al abrirlo y se vacía al cargar uno.
  let _sales = null;
  let _uploading = '';        // 'liquor' | 'wine' mientras sube
  let _excl = new Set();      // artículos excluidos del ciclo abierto

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

  function chart(groups, head) {
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
    // El TOTAL vive en la cabecera del marco, no suelto encima.
    //
    // Antes eran tres bandas apiladas —migas, una caja con un botón, y el
    // número— y el dato principal quedaba flotando entre dos elementos de
    // interfaz. Aquí el número está donde está su gráfica: la cabecera lo
    // presenta y las barras lo desglosan. Una banda menos y una relación
    // más.
    return `
      <div class="cm-chartwrap">
        <div class="cm-charthead">
          <span class="cm-total">
            <b>${money(head.big)}</b><span>${head.sub}</span>
          </span>
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
      // La marca se pone dentro del ciclo, pero se VE desde fuera. El
      // sentido de marcar Nochevieja es poder mirar el año y entender por
      // qué esa semana se sale de la gráfica; escondida dentro no
      // explicaría nada.
      const evt = !!w.is_event_week;
      return `
        <tr class="cm-row ${on ? 'sel' : ''} ${evt ? 'cm-row-evt' : ''}"
            onclick="window.BarStockConsumptionMatch.openCycle('${w.week_start}')">
          <td class="cm-c1"><i class="ti ti-calendar-week cm-ri${evt ? ' evt' : ''}" aria-hidden="true"></i> Week of ${esc(dayLabel(w.week_start))}${evt ? ' <span class="cm-evt-tag">EVENT</span>' : ''}</td>
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
        // Se abre igual que las demás. Antes no: la fila no llevaba
        // onclick y los artículos que estaban esperando un dato quedaban
        // fuera de alcance justo cuando eran los únicos accionables.
        return `
          <tr class="cm-row cm-row-warn"
              onclick="window.BarStockConsumptionMatch.openCat(${i})">
            <td class="cm-c1">
              <i class="ti ti-alert-triangle cm-ri warn" aria-hidden="true"></i>
              ${esc(g.cat)} <span class="cm-tag">waiting for sales</span>
            </td>
            <td class="num muted cm-c-sold">—</td>
            <td class="num cm-c-used">${btl(g.unmatched.reduce((s, u) => s + u.used, 0))}</td>
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
            <div class="cm-fixrow">
              <span class="cm-btn ghost cm-fixbtn" role="button" tabindex="0"
                    data-item="${esc(u.item)}"
                    onclick="window.BarStockConsumptionMatch.fixUnmatched(this.dataset.item)">
                <i class="ti ti-pencil" aria-hidden="true"></i> Sales
              </span>
              <span class="cm-btn ghost cm-fixbtn" role="button" tabindex="0"
                    onclick="window.BarStockConsumptionMatch.fixCount()">
                <i class="ti ti-package" aria-hidden="true"></i> Count
              </span>
              ${exclBtn(u.item)}
            </div>
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
          <div class="cm-fixrow">
            <span class="cm-btn ghost cm-fixbtn" role="button" tabindex="0"
                  onclick="window.BarStockConsumptionMatch.fixSales()">
              <i class="ti ti-pencil" aria-hidden="true"></i> Sales
            </span>
            <span class="cm-btn ghost cm-fixbtn" role="button" tabindex="0"
                  onclick="window.BarStockConsumptionMatch.fixCount()">
              <i class="ti ti-package" aria-hidden="true"></i> Count
            </span>
            ${exclBtn(it.item)}
          </div>
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
      const isEvt = !!window.BarStockTheoreticalUsage?.isEventWeek?.(_week);
      return `
        <div class="inv-panel-header">
          <div class="inv-panel-name-wrap"><span class="inv-panel-name">Week of ${esc(dayLabel(_week))}</span></div>
          <div class="inv-panel-meta">Closed cycle${isEvt ? ' · <span class="cm-evt-tag">Event week</span>' : ''}</div>
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
          ${eventToggle()}
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
  // ── Migas ────────────────────────────────────────────────────────────
  //
  // Mismo lenguaje que los chips de arriba —.bs-nav-tab: 13px, peso 600,
  // radio 20px, fondo var(--muted) al pasar por encima— porque hacen el
  // mismo trabajo. Antes eran texto gris con una pastilla azul suelta y
  // no se leían como navegación sino como contenido flotando.
  //
  // La primera lleva la flecha de .bs-back-btn: en esta app "←" ya
  // significa subir un nivel.
  function crumbs() {
    const at = (v) => _view === v;
    const c = [];

    c.push(`<span class="cm-crumb ${at('cycles') ? 'now' : ''}"
                  ${at('cycles') ? '' : 'role="button" tabindex="0" onclick="window.BarStockConsumptionMatch.goCycles()"'}
            >${at('cycles') ? '' : '← '}Cycles</span>`);

    if (_week) {
      c.push(`<i class="ti ti-chevron-right cm-crumb-sep" aria-hidden="true"></i>`);
      c.push(`<span class="cm-crumb ${at('cats') ? 'now' : ''}"
                    ${at('cats') ? '' : 'role="button" tabindex="0" onclick="window.BarStockConsumptionMatch.goCats()"'}
              >Week of ${esc(dayLabel(_week))}</span>`);
    }
    if (at('items') && _cat >= 0) {
      c.push(`<i class="ti ti-chevron-right cm-crumb-sep" aria-hidden="true"></i>`);
      c.push(`<span class="cm-crumb now">${esc(_groups[_cat].cat)}</span>`);
    }
    if (at('report')) {
      c.push(`<i class="ti ti-chevron-right cm-crumb-sep" aria-hidden="true"></i>`);
      c.push(`<span class="cm-crumb now">Report</span>`);
    }

    // Navegar a la izquierda, actuar a la derecha, en la MISMA fila. La
    // caja de acciones que había antes era un marco de ancho completo
    // alrededor de un botón: noventa por ciento de aire con borde.
    return `<div class="cm-navbar">
      <div class="cm-crumbs">${c.join('')}</div>
      ${actionBar()}
    </div>`;
  }

  // ── Excluir un artículo del ciclo ────────────────────────────────────
  //
  // Vivía en la pantalla de Usage y era el único sitio desde donde se
  // podía tocar. Sin traerlo, todo lo ya excluido habría desaparecido de
  // esta pantalla para siempre y sin aviso: `group()` los salta en
  // silencio, así que ni siquiera se notaría que faltan.
  //
  // Sirve para lo que el bar no vende — la botella de detrás de la barra
  // que solo se usa para cocinar, el regalo del proveedor— y que si no
  // aparece cada semana como una pérdida que nadie va a explicar.
  function exclBtn(item) {
    const on = _excl.has(item);
    return `<span class="cm-btn ghost cm-fixbtn ${on ? 'cm-excl-on' : ''}" role="button" tabindex="0"
                  data-item="${esc(item)}"
                  title="${on ? 'Excluded from this cycle — click to bring it back' : 'Exclude from this cycle'}"
                  onclick="window.BarStockConsumptionMatch.toggleExcl(this.dataset.item)">
      <i class="ti ti-eye-off" aria-hidden="true"></i> ${on ? 'Excluded' : 'Exclude'}
    </span>`;
  }

  async function toggleExcl(item) {
    const TU = window.BarStockTheoreticalUsage;
    if (!TU?.toggleItemExclusion || !_week || !item) return;
    const week = _week;
    const now = await TU.toggleItemExclusion(week, item);
    if (_week !== week) return;
    if (now) _excl.add(item); else _excl.delete(item);

    // Excluir cambia QUÉ entra en el cálculo, no solo cómo se ve: el
    // ciclo entero se recalcula. Al volver, el artículo excluido ya no
    // está en ninguna lista, así que el panel sube a la categoría.
    _cache.delete(week);
    if (!await ensureCycle(week)) return;
    const cat = _cat >= 0 ? _groups[_cat]?.cat : null;
    _cat = cat ? _groups.findIndex(g => g.cat === cat) : -1;
    _item = -1; _unItem = -1;
    if (_cat < 0) _view = 'cats';
    if (typeof setStatus === 'function') {
      setStatus(now ? `${item} excluded from this cycle.` : `${item} is back in this cycle.`);
    }
    paint();
  }

  // ── Semana de evento ─────────────────────────────────────────────────
  //
  // No es una etiqueta: `par-intelligence` excluye estas semanas al
  // calcular los pares. Una Nochevieja contada como una semana normal
  // sube el par de medio bar durante meses, y el error no se ve en
  // ninguna pantalla — solo en pedidos demasiado grandes.
  //
  // El interruptor vive en el panel del ciclo porque describe el ciclo
  // entero. En la fila de migas chocaría con "Send to report", y un
  // interruptor por fila en una lista de cincuenta semanas es ruido
  // dentro de otra cosa clickeable.
  function eventToggle() {
    const TU = window.BarStockTheoreticalUsage;
    const on = !!TU?.isEventWeek?.(_week);
    return `
      <div class="cm-evt ${on ? 'on' : ''}" role="button" tabindex="0"
           onclick="window.BarStockConsumptionMatch.toggleEvent()">
        <i class="ti ti-calendar-event" aria-hidden="true"></i>
        <span class="cm-evt-l">Event week</span>
        <span class="cm-evt-sw"><i></i></span>
      </div>
      <p class="cm-panel-note">${on
        ? 'Excluded from par calculations.'
        : 'Holidays and private parties skew the pars. Mark the week and it stops counting toward them.'}</p>`;
  }

  async function toggleEvent() {
    const TU = window.BarStockTheoreticalUsage;
    if (!TU?.setEventWeek || !_week) return;
    const week = _week;
    const next = !TU.isEventWeek(week);
    const ok = await TU.setEventWeek(week, next);
    if (!ok) { alert('Could not save that. Try again.'); return; }
    // La lista de ciclos enseña la marca, así que se repinta también.
    const w = _weeks.find(x => x.week_start === week);
    if (w) w.is_event_week = next;
    if (typeof setStatus === 'function') {
      setStatus(next ? 'Marked as an event week.' : 'No longer an event week.');
    }
    paint();
  }

  // ── El aviso de ventas ───────────────────────────────────────────────
  //
  // Las ventas de un ciclo llegan en DOS archivos —licor y vino— y salen
  // de informes distintos del POS. Antes se cargaban desde una pantalla
  // aparte, contra "la semana que tuvieras abierta allí", y el fallo caro
  // era subirlos con otra semana abierta: las ventas acababan en el ciclo
  // equivocado y aquí no aparecía nada, sin explicación.
  //
  // Ahora la carga vive DENTRO del ciclo. No hay semana que elegir: es
  // esta, la que estás mirando.
  //
  // ── Por qué es un aviso y no una barra de herramientas ───────────────
  //
  // Porque no es una herramienta que se usa cuando apetece: es el estado
  // del ciclo. Sin el archivo, cada artículo se lee como pérdida total
  // —no como dato que falta— y eso parece un problema de inventario. El
  // aviso existe para que nadie mire esas cifras creyéndolas.
  //
  // Los ciclos anteriores a la migración 009 tienen ventas sin tipo
  // (`legacy`). A esos no se les monta el aviso: dirían que falta un
  // archivo que en realidad está, y son datos que ya nadie va a tocar.
  function salesAlert() {
    if (!_sales) return '';
    const { liquor, wine, legacy, total } = _sales;

    // Cargado antes de que existiera el tipo: se dice lo que se sabe y
    // no se inventa lo que no.
    if (legacy > 0 && !liquor && !wine) {
      return `<div class="cm-sales ok">
        <i class="ti ti-check cm-sales-ico" aria-hidden="true"></i>
        <span class="cm-sales-line">Sales loaded · ${legacy} item${legacy === 1 ? '' : 's'}</span>
        ${replaceBtns()}
      </div>`;
    }

    const done = (k) => !!_sales[k];
    const both = done('liquor') && done('wine');

    if (both) {
      const f = [liquor.file, wine.file].filter(Boolean).map(esc).join(', ');
      return `<div class="cm-sales ok">
        <i class="ti ti-check cm-sales-ico" aria-hidden="true"></i>
        <span class="cm-sales-line">Liquor and wine loaded${f ? ' · ' + f : ''}</span>
        ${replaceBtns()}
      </div>`;
    }

    const none = !done('liquor') && !done('wine') && !total;
    const title = none
      ? 'Sold is missing for this cycle'
      : `${done('liquor') ? 'Wine' : 'Liquor'} sales are still missing`;
    const text = none
      ? `<b>Poured</b> is calculated from your counts and is correct.
         <b>Sold</b> comes from the POS files — until you load them, every
         item reads as a total loss.`
      : `${done('liquor') ? 'Liquor' : 'Wine'} is complete.
         ${done('liquor') ? 'Wine' : 'Liquor'} items will read as a total
         loss until you load their file.`;

    return `<div class="cm-sales warn">
      <div class="cm-sales-head">
        <i class="ti ti-alert-triangle" aria-hidden="true"></i>
        <span>${esc(title)}</span>
      </div>
      <p class="cm-sales-sub">${text}</p>
      ${step('liquor', 'Liquor sales', 1)}
      ${step('wine', 'Wine sales', 2)}
    </div>`;
  }

  function step(kind, label, n) {
    const s = _sales && _sales[kind];
    const busy = _uploading === kind;
    if (s) {
      return `<div class="cm-step">
        <span class="cm-step-n done"><i class="ti ti-check" aria-hidden="true"></i></span>
        <span class="cm-step-l">${esc(label)}
          <span class="cm-step-f">${esc(s.file || 'loaded')} · ${s.lines} line${s.lines === 1 ? '' : 's'}</span>
        </span>
        <span class="cm-step-rp" role="button" tabindex="0"
              onclick="window.BarStockConsumptionMatch.pickFile('${kind}')">Replace</span>
      </div>`;
    }
    return `<div class="cm-step">
      <span class="cm-step-n todo">${n}</span>
      <span class="cm-step-l">${esc(label)}</span>
      <span class="cm-btn primary cm-step-btn ${busy ? 'busy' : ''}" role="button" tabindex="0"
            onclick="window.BarStockConsumptionMatch.pickFile('${kind}')">
        ${busy ? 'Loading…' : 'Load CSV'}
      </span>
    </div>`;
  }

  function replaceBtns() {
    return `<span class="cm-sales-rp">
      <span role="button" tabindex="0" onclick="window.BarStockConsumptionMatch.pickFile('liquor')">Liquor</span>
      <span role="button" tabindex="0" onclick="window.BarStockConsumptionMatch.pickFile('wine')">Wine</span>
    </span>`;
  }

  // ── Elegir el archivo ────────────────────────────────────────────────
  //
  // Un <input type="file"> creado al vuelo y no uno fijo en el HTML: el
  // fijo hay que vaciarlo a mano después de cada uso, porque si eliges el
  // mismo archivo dos veces seguidas el navegador no dispara `change` —
  // el valor no ha cambiado— y el segundo intento no hace nada sin decir
  // por qué. Uno nuevo cada vez no tiene ese problema.
  function pickFile(kind) {
    if (!_week || _uploading) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      input.remove();
      if (f) await loadSalesFile(kind, f);
    });
    document.body.appendChild(input);
    input.click();
  }

  async function loadSalesFile(kind, file) {
    const TU = window.BarStockTheoreticalUsage;
    if (!TU?.uploadSales || !_week) return;

    const week = _week;          // se fija AQUÍ: la carga tarda, y si
    _uploading = kind;           // alguien navega mientras tanto, el
    paint();                     // archivo debe ir al ciclo que eligió.

    try {
      const r = await TU.uploadSales(week, file, kind);
      // El ciclo se recalcula entero: las ventas nuevas cambian el sold,
      // y con él la varianza, la pérdida y el orden de la tabla.
      _cache.delete(week);
      _sales = await TU.salesStatus(week);
      if (_week === week) await ensureCycle(week);
      if (typeof setStatus === 'function') {
        setStatus(`${kind === 'wine' ? 'Wine' : 'Liquor'} sales loaded: ${r.items} items.`);
      }
    } catch (err) {
      console.error('[consumption] carga de ventas', err);
      alert(err.message || String(err));
    } finally {
      _uploading = '';
      paint();
    }
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
      <div class="cm-actions">
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
      // Sin NINGUNA venta no hay gráfica que pintar: dos barras a cero no
      // son una comparación. En su lugar manda el aviso, que es lo único
      // accionable, y el total sale suelto encima — vale cero de todas
      // formas.
      //
      // El aviso solo en el nivel del ciclo. Dentro de una categoría ya
      // se ha visto arriba, y repetirlo en cada nivel lo convierte en
      // ruido que se aprende a saltar.
      const aviso = _view === 'cats' ? salesAlert() : '';
      head = anySales
        ? aviso + chart(_groups, { big: total, sub })
        : `
          <div class="cm-total cm-total-loose">
            <b>${money(total)}</b><span>${sub}</span>
          </div>
          ${aviso}`;
      body = _view === 'cats' ? catTable() : itemTable();
    }

    host.innerHTML = `
      ${crumbs()}
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

    // Qué archivos de ventas tiene, y qué artículos están excluidos. Las
    // dos cosas son de ESTE ciclo y las dos se piden en paralelo: son dos
    // viajes a la nube que no dependen el uno del otro, y encadenarlos
    // solo sumaría esperas.
    //
    // Si alguna falla no se aborta la apertura del ciclo: se abre sin
    // aviso y sin marcas de exclusión, que es mucho mejor que no abrirse.
    _sales = null; _excl = new Set();
    const TU = window.BarStockTheoreticalUsage;
    Promise.all([
      TU?.salesStatus ? TU.salesStatus(week).catch(() => null) : null,
      TU?.exclusionsFor ? TU.exclusionsFor(week).catch(() => new Set()) : new Set()
    ]).then(([s, e]) => {
      if (_week !== week) return;    // ya se cambió de ciclo mientras tanto
      _sales = s; _excl = e || new Set();
      paint();
    });

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

  // ── Corregir el conteo del artículo abierto ─────────────────────────
  //
  // Al cerrar, se tira el ciclo cacheado y se recalcula: la corrección
  // cambia el poured, y con él la pérdida, el orden de la tabla y la
  // gráfica. Dejar la pantalla con las cifras viejas haría pensar que no
  // se guardó.
  async function fixCount() {
    if (!window.BarStockCountFix || _cat < 0) return;
    const g = _groups[_cat];
    const it = _item >= 0 ? g.items[_item] : (_unItem >= 0 ? g.unmatched[_unItem] : null);
    if (!it) return;
    const catName = g.cat, itemName = it.item;

    window.BarStockCountFix.open(itemName, it.code || '', _week, async () => {
      _cache.delete(_week);
      if (!await ensureCycle(_week)) return;
      _cat = _groups.findIndex(x => x.cat === catName);
      _item = _cat >= 0 ? _groups[_cat].items.findIndex(x => x.item === itemName) : -1;
      _unItem = _cat >= 0 && _item < 0
        ? _groups[_cat].unmatched.findIndex(x => x.item === itemName) : -1;
      if (_cat < 0) { _view = 'cats'; _item = -1; _unItem = -1; }
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
    pick, pickAll, sendToReport, clearPending, fixSales, fixUnmatched, fixCount,
    pickFile, toggleExcl, toggleEvent,
    // El reporte necesita los grupos del ciclo abierto para recalcular
    // sus totales con solo los artículos elegidos.
    groups: () => _groups,
    week: () => _week
  };
})();
