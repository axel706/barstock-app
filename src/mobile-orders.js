(() => {
  if (window.BarStockMobileOrders) return;

  // ── Órdenes en el teléfono ───────────────────────────────────────────
  //
  // Dos niveles, cada uno simple:
  //
  //   RESUMEN   cuánto va a costar la semana y en qué proveedores. Es
  //             la continuación literal de la tarjeta del Home —"4
  //             vendors · $590 · Review orders"—, así que al entrar se
  //             ve lo mismo en grande en vez de empezar otra frase.
  //   DETALLE   las líneas de un proveedor, con su cantidad ajustable.
  //
  //   REVISIÓN  la última mirada antes de colocar: qué sale, cuánto, y
  //             a quién. No se edita — para eso está DETALLE.
  //
  // ── Colocar es dos pasos, y el orden no es intercambiable ───────────
  //
  // Primero se guarda la orden en la nube, después sale el correo. Si
  // fuera al revés y el guardado fallara, el proveedor tendría un
  // pedido que la app no conoce: imposible de cuadrar contra la factura
  // cuando llegue de MarginEdge. Al revés es recuperable — queda una
  // orden colocada que se puede reenviar.
  //
  // ── Y no se reimplementa nada ────────────────────────────────────────
  //
  // Las líneas salen de getOrderRowsForVendor, el subtotal de
  // computeOrderSubtotal y el ajuste de updateFinalOrder: las mismas
  // funciones del escritorio. Por eso un cambio hecho aquí aparece
  // allí — updateFinalOrder guarda en local Y manda el valor a la nube.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const num = (x) => Number(x) || 0;
  const n2 = (x) => String(Math.round(num(x) * 100) / 100);
  const money = (n) => '$' + Math.round(num(n)).toLocaleString('en-US');

  let _vendor = null;        // null = resumen
  let _revisar = false;      // true = la pantalla de revisión del _vendor
  // La FOTO de lo que se está confirmando, tomada al entrar.
  //
  // No se puede repintar la revisión consultando `proveedores()` cada
  // vez: en cuanto la orden se guarda, sus líneas dejan de estar
  // pendientes y ese proveedor desaparece de la lista. Y como
  // `loadOrdersFromCloud()` dispara un repintado a mitad del envío, la
  // pantalla se desmontaba sola — los pasos 2 y 3 no se veían y
  // acababas en la lista sin confirmación, con el correo ya enviado.
  //
  // Una pantalla de confirmar tiene que enseñar lo que vas a confirmar,
  // congelado. Que cambie bajo los pies mientras la miras es lo
  // contrario de confirmar.
  let _vista = null;         // { nombre, filas, total, botellas, sinPrecio }
  let _to = [];              // destinatarios de ESTE envío
  let _recordar = true;      // guardarlos en vendor_defaults al enviar
  let _cargandoDest = false;
  // Para qué proveedor ya se preguntó. El guardia NO puede ser "_to
  // está vacío": un proveedor sin correo guardado deja _to vacío para
  // siempre, y entonces cada repintado vuelve a pedirlo — carga, no
  // encuentra nada, repinta, carga. Bucle infinito y la pantalla
  // congelada.
  let _destDe = null;
  // La nota para el proveedor. Sale arriba en el correo y en ningún
  // otro sitio: ni en el PDF ni en la orden guardada (Axel lo pidió
  // así). No es `_extra.note`: ésa es la etiqueta interna de una orden
  // rápida ("Quick Order") y sí se guarda.
  //
  // `_notaAbierta` separa "pulsé Add a note" de "escribí algo": el
  // campo se queda abierto aunque lo vacíes, y no se cierra solo en el
  // siguiente repintado (que llega, por ejemplo, al quitar un correo).
  let _notaProv = '';
  let _notaAbierta = false;
  let _colocando = false;
  const _fallos = new Set(); // claves de líneas que no llegaron a la nube

  const clave = (r) => (r.item || '') + '||' + (r.code || '');
  function master() { return (window.state && window.state.master) || []; }

  const hay = (n) => typeof window[n] === 'function';

  // El encabezado lo arma el armazón: chevron a la izquierda del
  // título, en la misma fila, para no gastar un renglón en volver.
  const cab = (o) => (window.BarStockMobile && window.BarStockMobile.cabecera)
    ? window.BarStockMobile.cabecera(o)
    : '<div class="m-inv-t">' + esc(o.titulo || '') + '</div>';
  // Con el nombre en la banda (el detalle de un proveedor, como una
  // subsección de Settings) la página no tiene chevron: el atrás es el
  // botón de la banda. La misma regla que mobile-history.
  const volverCon = (host, fn) => {
    const M = window.BarStockMobile;
    if (!M) return false;
    if (M.alVolver && M.alVolver(host, fn)) return true;
    if (M.alVolverBanda) { M.alVolverBanda(fn); return true; }
    return false;
  };

  function proveedores() {
    if (!hay('getActiveVendors') || !hay('getOrderRowsForVendor') ||
        !hay('computeOrderSubtotal')) return [];
    const out = [];
    for (const nombre of window.getActiveVendors()) {
      // UNKNOWN no es un proveedor, es lo que todavía no tiene uno. Un
      // pedido a UNKNOWN no se puede colocar en ningún sitio.
      if (String(nombre).toUpperCase() === 'UNKNOWN') continue;
      const filas = window.getOrderRowsForVendor(nombre);
      if (!filas.length) continue;
      const sinPrecio = filas.filter(r => !(num(r.value) > 0)).length;
      out.push({
        nombre, filas,
        total: window.computeOrderSubtotal(filas),
        sinPrecio
      });
    }
    out.sort((a, b) => b.total - a.total);
    return out;
  }

  function cantidad(r) {
    return hay('getEffectiveOrder') ? num(window.getEffectiveOrder(r)) : num(r.toOrder);
  }
  // Lo que el automático pide (en una semana saltada, con el interruptor
  // de arriba: autoOrder de index.html). "Auto was N" y "auto wanted N"
  // tienen que decir lo mismo que la cantidad, no el toOrder de siempre.
  function auto(r) {
    return hay('autoOrder') ? num(window.autoOrder(r)) : num(r.toOrder);
  }
  function aMano(r) {
    return r.orderOverride !== '' && r.orderOverride !== null && r.orderOverride !== undefined;
  }
  function ajustable(r) {
    return hay('supportsManualFinalOrder') ? !!window.supportsManualFinalOrder(r.vendor) : false;
  }

  // ── Resumen ──────────────────────────────────────────────────────────

  // El logo del proveedor (o sus iniciales) y su color: los pone
  // vendor-logo.js, el mismo de Sent e Invoices.
  const VL = () => window.BarStockVendorLogo;
  const logo = (v) => (VL() ? VL().html(v) : '');
  const colorDe = (v) => (VL() ? VL().color(v) : '#94a3b8');

  // Los proveedores del resumen: los que tienen líneas y, aunque no
  // tenga líneas propias, LOOP si hay algo de otro proveedor que no llega
  // a su entrega (lámina C, 2026-11-19). La usan el resumen del teléfono y
  // la columna de proveedores del escritorio (desk-orders.js): una sola
  // lista, o los dos acabarían enseñando proveedores distintos.
  function listaResumen() {
    const vs = proveedores();
    prepararTodos();
    const nLoop = puentes('LOOP').length;
    if (nLoop && !vs.some(v => esLoop(v.nombre))) vs.push({ nombre: 'LOOP', filas: [], total: 0, sinPrecio: 0 });
    // Lo de cada uno que no llega a su entrega (en LOOP, lo de todos).
    vs.forEach(v => { v.puentes = esLoop(v.nombre) ? nLoop : puentes(v.nombre).length; });
    return vs;
  }

  function pintarResumen(host) {
    const vs = listaResumen();
    const nLoop = puentes('LOOP').length;
    const total = vs.reduce((s, v) => s + v.total, 0);

    if (!vs.length) {
      // Dos vacíos distintos, y conviene no confundirlos: "todavía no
      // has contado" es una tarea pendiente, y "no hace falta pedir
      // nada" es una buena noticia. El mensaje de antes servía para
      // los dos y no decía ninguno.
      const W = window.BarStockWeeklyCycle;
      const st = (W && W.estado) ? W.estado() : 'loading';
      const contado = st === 'done';

      host.innerHTML = `
        <div class="m-nada">
          <span class="m-nada-i${contado ? ' bien' : ''}">
            <i class="ti ti-${contado ? 'circle-check' : 'scan'}" aria-hidden="true"></i>
          </span>
          <b>${contado ? 'Nothing to order' : 'No count yet'}</b>
          <small>${contado
            ? 'Every product is at or above its par. Order lines show up here when something drops below.'
            : 'Count the bottles and the order lines appear here, grouped by vendor.'}</small>
        </div>`;
      return;
    }

    // Sin título ni cifra propios: los pone el contenedor. El título
    // estaba aquí de cuando esta sección ERA la pantalla y salía dos
    // veces; la cifra subió al lado del título para dejarle el
    // renglón al botón de apuntar una compra.
    host.innerHTML = `

      <!-- Aquí ya no se avisa de nada. Durante mucho tiempo este hueco
           decía "Place orders from desktop or iPad", y lo decía en las
           dos pantallas para que nadie mirara los totales, se fuera y
           no se enterara. Desde que se coloca desde el teléfono, esa
           frase sería mentira: el camino está dentro de cada
           proveedor, que es donde se repasa antes de mandar. -->
      ${''}
      ${baseHtml()}
      ${vs.map((v, i) => `
        <button type="button" class="m-ordv${v.sinPrecio ? ' aviso' : ''}" data-v="${i}" style="--vc:${colorDe(v.nombre)}">
          ${logo(v.nombre)}
          <span class="m-ordv-l">
            <span class="m-ordv-n">${esc(v.nombre)}</span>
            <small>${esLoop(v.nombre) && nLoop ? nLoop + " won't last until delivery" + (v.filas.length ? ' · ' : '') : ''}${
              v.filas.length || !esLoop(v.nombre) ? v.filas.length + ' line' + (v.filas.length === 1 ? '' : 's') +
              (v.sinPrecio ? ' · ' + v.sinPrecio + ' without price' : ' · all priced') : ''}</small>
          </span>
          <b>${money(v.total)}</b>
          <i class="ti ti-chevron-right m-chev" aria-hidden="true"></i>
        </button>`).join('')}
      <div class="m-tx-hueco"></div>
      <button type="button" id="moRun"><i class="ti ti-plus" aria-hidden="true"></i> Quick order</button>`;

    // Se llamó "Log a store run" mientras creíamos que sólo apuntaba una
    // compra ya hecha; salvo LOOP, de aquí sale un correo al proveedor
    // con su PDF, igual que de una orden normal: es una ORDEN. Vive en
    // Open porque es donde se entra a pensar en comprar, aunque lo que
    // guarde aparezca en Sent.
    const run = host.querySelector('#moRun');
    if (run) run.onclick = () => {
      // La pantalla del teléfono, no el diálogo del escritorio: ése
      // es una rejilla de cinco columnas con un `datalist`, y en un
      // iPhone no se puede usar.
      if (window.BarStockMobile && window.BarStockMobile.ir) {
        return window.BarStockMobile.ir('quick');
      }
      if (window.BarStockToast) window.BarStockToast.show('Not available right now.');
    };

    host.querySelectorAll('[data-v]').forEach(b => {
      b.onclick = () => { _vendor = vs[Number(b.dataset.v)].nombre; repintar(); };
    });
    engancharBase(host);
  }

  // ── Live o Empty shelf, en una semana saltada (Axel, 2026-11-23,
  // lámina A) ────────────────────────────────────────────────────────
  // Arriba de Open y del detalle de cada proveedor, sólo con la semana
  // saltada ("Skip this week"). Cambia TODA la lista de una vez: la
  // cuenta vive en count-skip.js (aPedir) y entra por getEffectiveOrder.
  // Lo puesto a mano no se toca: sigue siendo de quien lo puso.
  const SK = () => window.BarStockCountSkip;
  function baseHtml() {
    const m = SK() && SK().modo ? SK().modo() : null;
    if (!m) return '';
    return `
      <div class="m-ord-salto">
        <div class="m-sx-tabs" id="moBase" role="tablist" aria-label="Order from">
          <button type="button" role="tab" data-base="live" class="${m === 'live' ? 'on' : ''}" aria-selected="${m === 'live'}">Live ≈</button>
          <button type="button" role="tab" data-base="vacio" class="${m === 'vacio' ? 'on' : ''}" aria-selected="${m === 'vacio'}">Empty shelf</button>
        </div>
        <div class="m-ord-salto-t"><b>Count skipped.</b> ${m === 'live'
          ? 'Quantities use Live: the last count, plus deliveries, minus Toast sales.'
          : 'Quantities are the full par, as if everything were at 0.'}</div>
      </div>`;
  }
  let _esperaLive = null;
  function engancharBase(host) {
    host.querySelectorAll('[data-base]').forEach(b => {
      b.onclick = () => {
        SK().fijarModo(b.dataset.base);
        if (typeof window.render === 'function') { try { window.render(); } catch (e) {} }
        repintar();
      };
    });
    // Con Live y el LIVE aún sin leer, las cantidades salen de lo contado:
    // se pide y se repinta UNA vez al tenerlo.
    const L = window.BarStockLiveCache;
    // Una sola vez: si la lectura falla, no se reintenta en cada pintado
    // (cada uno pediría otra y repintaría otra vez).
    if (SK() && SK().modo && SK().modo() === 'live' && L && L.listo && !L.listo() && !_esperaLive && L.cargar) {
      _esperaLive = Promise.resolve(L.cargar()).then(() => refresh(), () => {});
    }
  }

  // ── Detalle ──────────────────────────────────────────────────────────

  // ── Lo que dejaste fuera ─────────────────────────────────────────────
  //
  // No hace falta una columna nueva: excluir YA era poner la cantidad a
  // cero. getOrderRowsForVendor filtra por cantidad efectiva mayor que
  // cero, así que bajar a 0 borraba la línea de la lista — sin decirlo
  // y sin vuelta atrás salvo volver a añadirla a mano.
  //
  // Excluido es, exactamente: este proveedor, cantidad puesta a cero A
  // MANO, y el automático quería pedir algo. Lo último es lo que
  // distingue "dije que no" de "nunca hizo falta": sin ese filtro, la
  // lista se llenaría de los doscientos artículos que no tocaba pedir.
  function excluidas(vendor) {
    if (!hay('isRowPlaced')) return master().filter(() => false);
    return master().filter(r =>
      r.vendor === vendor &&
      Number(r.orderOverride) === 0 && r.orderOverride !== '' && r.orderOverride !== null &&
      auto(r) > 0 &&
      !window.isRowPlaced(r));
  }

  // ── La sugerencia (Axel, 2026-11-18, lámina C) ─────────────────────
  //
  // Cada línea lleva "Suggested N" con su cuenta y "Use N"; al final, lo
  // que está en su par pero no llega a la siguiente entrega, con "Add N".
  // La cuenta vive en sugerencia.js; aquí sólo se pinta. Necesita el LIVE
  // y el horario del proveedor leídos: la primera vez se piden y, al
  // llegar, se repinta UNA vez (si no, cada pintado pediría otro).
  const S = () => window.BarStockSugerencia;
  const _sugListo = new Set();
  function prepararSugerencia(vendor) {
    if (!S() || _sugListo.has(vendor)) return;
    _sugListo.add(vendor);
    S().preparar(vendor).then(() => { if (_vendor === vendor) repintar(); }).catch(() => {});
  }
  const sugerencia = (r) => (S() && _sugListo.has(r.vendor) ? S().para(r) : null);
  function sugHtml(r, q, puede) {
    const sg = sugerencia(r);
    if (!sg) return '';
    return `<div class="m-ord-sg"><span>Suggested <b>${esc(n2(sg.pedir))}</b> &middot; ${esc(sg.texto)}</span>${
      puede && sg.pedir !== q ? `<button type="button" class="m-ord-use" data-use="${master().indexOf(r)}" data-n="${sg.pedir}">Use ${esc(n2(sg.pedir))}</button>` : ''}</div>`;
  }
  // ── Lo que no llega a su entrega (Axel, 2026-11-19, lámina C) ──────
  //
  // Arriba del detalle de un proveedor, lo suyo que se acaba ANTES de
  // que llegue esta orden, con cuánto traer de LOOP para llegar
  // (sugerencia.antes: la cuenta de Running out hasta su entrega). Y en
  // LOOP, lo mismo de TODOS los demás proveedores: "cualquier vendor se
  // resurte en LOOP", y es ahí donde Axel quiere verlo junto. "To buy" lo
  // manda a la lista de compras; ya en la lista, desaparece de los dos
  // sitios. El "short this week" de la sugerencia de la línea se queda:
  // es el porqué de pedir más.
  //
  // Para LOOP hacen falta los horarios de todos los proveedores: se piden
  // juntos una vez y se repinta UNA vez al tenerlos.
  const esLoop = (v) => String(v || '').toUpperCase() === 'LOOP';
  const SL = () => window.BarStockShoppingList;
  const _anadidos = new Set();   // lo mandado a To buy antes de releer la lista
  let _todos = null;             // la promesa de los horarios de todos
  function vendoresConPar() {
    return [...new Set(master().filter(r => r && r.vendor && num(r.suggested) > 0).map(r => r.vendor))]
      .filter(v => String(v).toUpperCase() !== 'UNKNOWN');
  }
  function prepararTodos() {
    if (!S() || _todos) return;
    const vs = vendoresConPar().filter(v => !_sugListo.has(v));
    vs.forEach(v => _sugListo.add(v));
    _todos = Promise.all(vs.map(v => S().preparar(v).catch(() => {}))).then(() => refresh());
  }
  const enLista = (item) => _anadidos.has(item) || !!(TB() && TB().deProducto && TB().deProducto(item));
  function puentes(vendor) {
    if (!S() || !S().antes) return [];
    const loop = esLoop(vendor);
    return master().filter(r => r && r.item && r.vendor && num(r.suggested) > 0 && _sugListo.has(r.vendor) &&
        String(r.vendor).toUpperCase() !== 'UNKNOWN' && (loop ? !esLoop(r.vendor) : r.vendor === vendor) && !enLista(r.item))
      .map(r => ({ r, x: S().antes(r) }))
      .filter(p => p.x)
      .sort((a, b) => a.x.fin.en - b.x.fin.en);
  }
  // Opción B (Axel, 2026-11-20): una tarjeta resumen con el número grande
  // arriba y cada producto separado por una línea fina; el día en ámbar
  // al principio de su renglón. La primera versión (un título y una
  // lista apretada) "necesitaba respirar".
  const titular = (v) => String(v || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  function puentesHtml(vendor) {
    const ps = puentes(vendor);
    if (!ps.length) return '';
    const loop = esLoop(vendor), n = ps.length;
    const que = loop
      ? "won't last until " + (n === 1 ? 'its' : 'their') + ' delivery'
      : (n === 1 ? 'runs' : 'run') + ' out before this order arrives';
    const pie = loop ? 'Get ' + (n === 1 ? 'it' : 'them') + ' from LOOP to bridge'
      : ps[0].x.llegaTxt + ' · get ' + (n === 1 ? 'it' : 'them') + ' from LOOP to bridge';
    return `
      <div class="m-ord-pte">
        <div class="m-ord-pte-sum"><span class="m-ord-pte-n">${n}</span><span class="m-ord-pte-t">${esc(que)}<small>${esc(pie)}</small></span></div>
        ${ps.map(({ r, x }) => `
          <div class="m-ord-pte-sep"></div>
          <div class="m-ord-pte-i">
            <div class="m-ord-pte-top">
              <b>${esc(r.item)}</b>
              <button type="button" class="m-ord-use m-ord-tb" data-tb="${master().indexOf(r)}" data-n="${x.loop}"
                data-nota="${esc(x.outTxt + ' · before ' + r.vendor + ' ' + x.llegaTxt)}">To buy</button>
            </div>
            <small><span class="m-ord-pte-dia">${esc(x.outTxt)}</span>${loop ? ' · ' + esc(titular(r.vendor)) + ' ' + esc(x.llegaTxt) : ''} · ${x.loop} from LOOP</small>
          </div>`).join('')}
      </div>`;
  }
  function engancharPuentes(host) {
    host.querySelectorAll('[data-tb]').forEach(b => {
      b.onclick = () => {
        const r = master()[Number(b.dataset.tb)];
        if (!r || !SL() || !SL().anadir) return;
        b.disabled = true;
        const g = window.BarStockGuest;
        SL().anadir({ item: r.item, qty: Number(b.dataset.n) || 1, motivo: 'app', nota: b.dataset.nota || '',
          por: (g && g.nombre && g.nombre()) || '' }).then(res => {
          if (!res || !res.ok) {
            b.disabled = false;
            const T = window.BarStockToast;
            if (T && T.show) T.show('Not added: ' + ((res && res.error) || 'unknown error'));
            return;
          }
          _anadidos.add(r.item);
          repintar();
        });
      };
    });
  }

  // Lo que no sale en la orden (está en su par) y la app pediría: ni
  // excluido a mano ("dije que no"), ni ya colocado este ciclo.
  function noEnLaOrden(v, fuera) {
    if (!S() || !_sugListo.has(v.nombre) || !ajustable({ vendor: v.nombre })) return [];
    const dentro = new Set(v.filas), no = new Set(fuera);
    return master().filter(r => r && r.vendor === v.nombre && !dentro.has(r) && !no.has(r) &&
      !(r.orderOverride !== '' && r.orderOverride !== null && r.orderOverride !== undefined && Number(r.orderOverride) === 0) &&
      !(hay('isRowPlaced') && window.isRowPlaced(r)))
      .map(r => ({ r, sg: sugerencia(r) }))
      .filter(x => x.sg && x.sg.pedir > 0)
      .sort((a, b) => b.sg.pedir - a.sg.pedir);
  }

  function pintarDetalle(host) {
    let v = proveedores().find(x => x.nombre === _vendor);
    if (esLoop(_vendor)) prepararTodos();
    // LOOP sin líneas propias, sólo con lo que no llega a su entrega.
    if (!v && esLoop(_vendor) && puentes('LOOP').length) v = { nombre: _vendor, filas: [], total: 0, sinPrecio: 0 };
    // En el escritorio, la lista es su columna: el panel se vacía.
    if (!v) { _vendor = null; if (_esc) { host.innerHTML = ''; return; } return pintarResumen(host); }
    const fuera = excluidas(v.nombre);
    prepararSugerencia(v.nombre);
    const extra = noEnLaOrden(v, fuera);

    // El mismo orden que el escritorio: lo más urgente arriba. Repasar
    // un pedido es mirar las primeras líneas, así que el orden ES la
    // información.
    // Como una subsección de Settings (Axel, 2026-11-20): el proveedor en
    // la banda, y el botón de Time Machine pasa a ser atrás. El total y
    // las líneas, en una línea debajo. Sin el armazón, la cabecera de
    // antes.
    // Desde el 2026-11-22 (lámina B ajustada) la línea de los detalles
    // va a la banda bajo el proveedor, con lo que no tiene precio en
    // ámbar, y no encima de la lista.
    const M = window.BarStockMobile;
    const tot = v.filas.length ? money(v.total) + ' · ' + v.filas.length + ' line' + (v.filas.length === 1 ? '' : 's') : '';
    const sinP = v.filas.length && v.sinPrecio ? v.sinPrecio + ' without price' : '';
    const enB = !!(M && M.enBanda && M.enBanda(v.nombre, tot, sinP));
    const conAdd = hay('supportsManualFinalOrder') && window.supportsManualFinalOrder(v.nombre);
    host.innerHTML = `
      ${enB ? '' : cab({
        volverA: 'All orders',
        titulo: v.nombre,
        // LOOP sin líneas propias (sólo lo que no llega a su entrega): sin
        // "$0 · 0 lines", que no dice nada.
        der: !v.filas.length ? '' : `<div class="m-ord-tot">${money(v.total)}
          <small>${v.filas.length} line${v.filas.length === 1 ? '' : 's'}${
            v.sinPrecio ? ' · ' + v.sinPrecio + ' without price' : ''}</small></div>`
      })}

      <!-- Arriba y no al final. Antes aquí vivía el aviso de que esto
           sólo se podía hacer desde el escritorio; ahora vive el botón,
           en el mismo sitio y por la misma razón: con noventa líneas,
           lo que está al final no se encuentra. -->
      ${baseHtml()}
      ${puentesHtml(v.nombre)}

      ${!enB && v.filas.length ? `<button type="button" class="m-ord-enviar" id="moSend">
        Review and send
      </button>` : ''}

      <div id="moList">${v.filas.map(linea).join('')}</div>

      ${extra.length ? `
        <div class="m-ord-k">Not on this order &middot; BarStock would add ${extra.length}</div>
        ${extra.map(({ r, sg }) => {
          const i = master().indexOf(r);
          return `
            <div class="m-ord-l m-ord-extra" data-i="${i}">
              <div class="m-ord-l-top">
                <span class="m-ord-l-n">${esc(r.item)}</span>
                <button type="button" class="m-ord-use m-ord-add-sg" data-use="${i}" data-n="${sg.pedir}">Add ${esc(n2(sg.pedir))}</button>
              </div>
              <div class="m-ord-l-s">${n2(r.onHand)} of ${n2(r.suggested)} on hand &middot; ${num(r.onHand) > num(r.suggested) ? 'above' : 'at'} par</div>
              <div class="m-ord-why">${esc(sg.texto)}</div>
            </div>`;
        }).join('')}` : ''}

      ${fuera.length ? `
        <div class="m-ord-fuera">
          <div class="m-ord-fuera-h">
            Left out of this order · ${fuera.length}
          </div>
          ${fuera.map(r => {
            const i = master().indexOf(r);
            return `
              <div class="m-ord-fl">
                <span class="m-ord-fl-n">${esc(r.item)}</span>
                <small>auto wanted ${n2(auto(r))}</small>
                <button type="button" class="m-ord-volver" data-volver="${i}">Bring back</button>
              </div>`;
          }).join('')}
        </div>` : ''}

      <!-- Sólo si este proveedor admite ajuste manual: añadir una
           línea ES poner una cantidad a mano, así que en los demás el
           botón abriría un diálogo que no puede guardar nada. Fijo
           donde Done, con su cristal (Axel, 2026-11-20); el hueco deja
           ver lo último por encima de él. -->
      ${enB ? ((v.filas.length || conAdd) ? `
        <!-- Un solo botón principal (Axel, 2026-11-22): Review and send
             y Add a product competían, uno arriba en azul sólido y otro
             abajo en cristal. Ahora van juntos donde Done, como Resend y
             Reopen en Sent: enviar a lo ancho, sin el total (ya está en
             la banda), y el + redondo y verde a la derecha. -->
        <div class="m-tx-hueco"></div>
        <div id="moAcc">
          ${v.filas.length ? '<button type="button" id="moSend">Review and send</button>' : ''}
          ${conAdd ? '<button type="button" id="moAdd" aria-label="Add a product"><i class="ti ti-plus" aria-hidden="true"></i></button>' : ''}
        </div>` : '') : conAdd ? `
        <div class="m-tx-hueco"></div>
        <button type="button" id="moAdd">
          <i class="ti ti-plus" aria-hidden="true"></i> Add a product
        </button>` : ''}`;

    volverCon(host, () => { _vendor = null; repintar(); });
    engancharPuentes(host);
    engancharBase(host);
    const env = host.querySelector('#moSend');
    if (env) env.onclick = () => {
      salirRevision();
      _revisar = true;
      _vista = {
        nombre: v.nombre,
        filas: v.filas.slice(),
        total: v.total,
        sinPrecio: v.sinPrecio,
        botellas: v.filas.reduce((s, r) => s + cantidad(r), 0)
      };
      repintar();
    };
    const add = host.querySelector('#moAdd');
    // Se le pasa el proveedor. Sin él, el diálogo mira la pestaña del
    // escritorio —que aquí no significa nada— y se cierra solo.
    const abrirAdd = () => { if (window.BarStockAddToOrder) window.BarStockAddToOrder.open(v.nombre); };
    if (add) add.onclick = () => (add.closest('#moAcc') ? salirDelBoton(add, () => buscarParaAnadir(v)) : abrirAdd());
    host.querySelectorAll('[data-volver]').forEach(b => {
      b.onclick = () => {
        // Vuelve a automático, no a la cantidad que tuviera antes: el
        // automático se recalcula con lo que hay hoy en el estante.
        if (hay('resetFinalOrder')) { window.resetFinalOrder(Number(b.dataset.volver)); repintar(); }
      };
    });
    enganchar(host);
    // A la línea que se acaba de elegir con el +, y se suelta la marca
    // para el siguiente pintado.
    if (_recien) {
      const l = host.querySelector('.m-ord-nuevo');
      if (l && l.scrollIntoView) l.scrollIntoView({ block: 'center', behavior: 'smooth' });
      _recien = null;
    }
  }

  // ── Añadir con el buscador a pantalla completa (Axel, 2026-11-22,
  // lámina A sin el teclado) ────────────────────────────────────────────
  //
  // El + abría el recuadro del escritorio (add-to-order.js): flotaba
  // sobre la página justo después de que el cristal creciera a pantalla
  // completa, y su campo, por debajo de 16 px, hacía zoom en el iPhone,
  // del que no se sale. Ahora abre el buscador de la app (el de Invoices,
  // Transfers y Recipes), con sólo lo de este proveedor que no se ha
  // colocado ya. Lo elegido entra con 1 ("la cantidad se ajusta desde
  // ahí", con el −/+ de su línea) y se marca; lo que ya estaba en la
  // orden no cambia de cantidad: sólo se va a su línea.
  let _recien = null;   // la línea recién añadida o elegida, para marcarla
  function buscarParaAnadir(v) {
    const B = window.BarStockBottleSearch;
    if (!B || !B.abrir) {
      if (window.BarStockAddToOrder) window.BarStockAddToOrder.open(v.nombre);
      return;
    }
    const V = String(v.nombre).toUpperCase();
    const placed = (r) => hay('isRowPlaced') && window.isRowPlaced(r);
    const suyos = master().filter(r => r && r.item && String(r.vendor || '').toUpperCase() === V && !placed(r));
    const dentro = new Set(v.filas.map(r => r.item));
    const porNombre = new Map(suyos.map(r => [r.item, r]));
    B.abrir({
      pantalla: true,
      titulo: v.nombre,
      sub: 'Add to ' + v.nombre,
      que: 'products',
      // La lista entera sin escribir: es lo de UN proveedor (Transfers y
      // Recipes hacen igual). Sin esto LOOP abría en "Type to search."
      // con 82 productos detrás (vídeo de Axel, 2026-11-22).
      verTodo: true,
      productos: suyos.map(r => r.item).sort((a, b) => a.localeCompare(b)),
      detalle: (p) => {
        const r = porNombre.get(p);
        if (!r) return '';
        return dentro.has(p) ? 'in this order · ' + n2(cantidad(r)) + ' to order'
          : [r.category, n2(r.onHand) + ' on hand', 'par ' + n2(r.suggested)].filter(Boolean).join(' · ');
      },
      alElegir: (p) => {
        if (B.cerrar) B.cerrar();
        const r = porNombre.get(p);
        if (!r) return;
        if (!dentro.has(p) && hay('updateFinalOrder')) window.updateFinalOrder(master().indexOf(r), 1);
        const nueva = !dentro.has(p);
        _recien = { item: p, nueva };
        repintar();   // pinta la línea marcada y suelta _recien
        if (nueva && window.BarStockToast) window.BarStockToast.show('Added 1 · ' + p);
      }
    });
  }
  // ── El buscador sale del + (Axel, 2026-11-22) ────────────────────────
  //
  // Primero fue un cristal verde que crecía hasta la pantalla y, al
  // terminar, el buscador aparecía de golpe ("no es como si la búsqueda
  // saliera del botón"). Después el buscador crecía en un círculo, pero
  // dentro del círculo se veía la página desenfocada, y al terminar el
  // fondo de la app: "se alcanza a ver un fondo distinto debajo del blur".
  //
  // Ahora el buscador se abre AL MOMENTO y la PÁGINA se abre en un
  // agujero que crece desde el centro del +: por él se ve el fondo de
  // verdad de la app (el que queda al terminar) con el buscador encima,
  // recortado al mismo círculo. La máscara de cada pieza de la página
  // lleva su centro en coordenadas de esa pieza (--mx/--my), porque la
  // lista rueda y las barras son fijas; el radio (--sale-r) va en el body
  // y lo heredan todas. El radio lo mueve JS, fotograma a fotograma: una
  // variable sin registrar no se transiciona en una máscara. Al llenar la
  // pantalla se suelta todo y la página se esconde como en cualquier
  // búsqueda. Sin movimiento si el teléfono lo pide.
  const SALE_MS = 440;
  const PAGINA = ['mScreens', 'mBand', 'mTabs', 'mFloor', 'mDock', 'mPull'];
  function salirDelBoton(btn, abrir) {
    const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = btn.getBoundingClientRect();
    abrir();
    const h = document.getElementById('mSheet');
    if (quieto || !h || !h.classList.contains('m-bus')) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const W = window.innerWidth || 0, H = window.innerHeight || 0;
    const R0 = Math.max(1, r.width / 2);
    const R = Math.ceil(Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)));
    const piezas = PAGINA.map(id => document.getElementById(id)).filter(Boolean);
    piezas.forEach(el => {
      const b = el.getBoundingClientRect();
      el.style.setProperty('--mx', (cx - b.left) + 'px');
      el.style.setProperty('--my', (cy - b.top) + 'px');
    });
    h.style.setProperty('--sale-x', cx + 'px');
    h.style.setProperty('--sale-y', cy + 'px');
    const body = document.body;
    body.style.setProperty('--sale-r', R0 + 'px');
    body.classList.add('m-sale');
    h.classList.add('m-bus-sale');
    btn.classList.add('gira');
    const raf = window.requestAnimationFrame || ((f) => setTimeout(f, 16));
    const ahora = () => (window.performance && performance.now ? performance.now() : Date.now());
    const t0 = ahora();
    // Sale rápido y frena al llegar (la misma curva que las hojas).
    const curva = (t) => 1 - Math.pow(1 - t, 3);
    let fin = false;
    const paso = () => {
      if (fin) return;
      const t = Math.min(1, (ahora() - t0) / SALE_MS);
      body.style.setProperty('--sale-r', (R0 + (R - R0) * curva(t)) + 'px');
      if (t < 1) raf(paso);
    };
    raf(paso);
    // El final va por reloj y no por el último fotograma: si el teléfono
    // se salta fotogramas (o la pestaña se esconde), igual se suelta.
    setTimeout(() => {
      fin = true;
      h.classList.remove('m-bus-sale');
      body.classList.remove('m-sale');
      body.style.removeProperty('--sale-r');
      ['--sale-x', '--sale-y'].forEach(k => h.style.removeProperty(k));
      piezas.forEach(el => { el.style.removeProperty('--mx'); el.style.removeProperty('--my'); });
      btn.classList.remove('gira');
    }, SALE_MS + 20);
  }

  // ── Revisión ─────────────────────────────────────────────────────────
  //
  // Aquí NO se edita. Una pantalla que muestra y a la vez deja cambiar
  // no es una revisión: es la pantalla anterior otra vez. Si algo está
  // mal, atrás y se corrige donde se corrige.
  //
  // Los destinatarios sí se tocan, porque ésos cambian por envío.

  // Salir de la revisión limpia TODO su estado, y `_colocada` es el
  // que importa: si se quedara puesto, al revisar el siguiente
  // proveedor el paso de guardar se saltaría —cree que ya está— y se
  // mandaría el correo de una orden que nunca se guardó.
  function salirRevision() {
    _revisar = false;
    _to = []; _destDe = null;
    _colocando = false; _paso = 0;
    _falloCorreo = false; _dudaCorreo = false; _colocada = null;
    _enviado = null;
    _vista = null;
    _extra = null; _deBorrador = false;
    // La nota es de ESTA orden. Si sobreviviera, el "antes del jueves"
    // de Southern le llegaría al siguiente proveedor.
    _notaProv = ''; _notaAbierta = false;
  }

  // ── Lo que distingue una orden rápida ──────────────────────────────
  //
  // `_extra` son los campos que se le añaden a la orden al guardarla
  // —`quickOrder`, `note`— y que una orden del ciclo no lleva. Van
  // aquí y no en `colocar()` porque `colocar()` no tiene por qué
  // saber de dónde viene lo que está colocando.
  //
  // `_deBorrador` sólo sirve para una cosa: que el chevron y el gesto
  // del borde devuelvan a Quick order con el borrador intacto, en vez
  // de a las líneas pendientes de ese proveedor —que no son lo que
  // estabas mirando, y perderían lo que acabas de teclear—.
  let _extra = null;
  let _deBorrador = false;

  const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]{2,}$/;
  const partir = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

  async function cargarDestinatarios(vendor, host) {
    if (_cargandoDest || _destDe === vendor) return;
    _cargandoDest = true;
    _destDe = vendor;
    try {
      if (window.BarStockVendorDefaults) {
        const d = await window.BarStockVendorDefaults.getDefaults(vendor);
        _to = partir(d && d.vendor_email);
      }
    } catch (e) {
      // Sin correo guardado no se bloquea nada: se escribe a mano.
      console.warn('[orders] no se pudieron leer los destinatarios', e);
    }
    _cargandoDest = false;
    if (_revisar && _vendor === vendor) repintar();
  }

  function pintarEnviado(host) {
    const e = _enviado;
    host.innerHTML = `
      <div class="m-rev-ok">
        <div class="m-rev-ok-i"><i class="ti ti-circle-check" aria-hidden="true"></i></div>
        <div class="m-rev-ok-t">Sent to ${esc(e.vendor)}</div>
        <div class="m-rev-ok-s">${n2(e.botellas)} bottles · ${money(e.total)}</div>
        <div class="m-rev-ok-m">${e.to.map(x => esc(x)).join('<br>')}</div>
        <div class="m-rev-ok-n">The order is placed and the email is on its way
          with the PDF attached. You can resend it from History.</div>
        <button type="button" class="m-rev-go" id="mrDone">Done</button>
      </div>`;
    // Salir lo decides tú. Que la pantalla se cierre sola es lo que
    // hacía que un envío correcto pareciera un fallo.
    host.querySelector('#mrDone').onclick = () => {
      _enviado = null;
      salirRevision();
      _vendor = null;
      repintar();
    };
  }

  function pintarRevision(host) {
    if (_enviado) return pintarEnviado(host);

    // De la FOTO, no de `proveedores()`. Ver el comentario de `_vista`.
    const v = _vista;
    if (!v) { salirRevision(); _vendor = null; return pintarResumen(host); }

    const botellas = v.botellas;

    host.innerHTML = `
      ${cab({
        volverA: v.nombre,
        titulo: 'Review the order',
        der: `<div class="m-ord-tot">${money(v.total)}
          <small>${v.filas.length} line${v.filas.length === 1 ? '' : 's'} · ${n2(botellas)} bottles${
            v.sinPrecio ? ' · ' + v.sinPrecio + ' without price' : ''}</small></div>`
      })}

      <!-- ── El bloque de enviar va ARRIBA ─────────────────────
           Estaba abajo, en un pie pegajoso, y ese pie pintaba un
           rectángulo oscuro sobre el fondo de la app que se leía como
           una barra negra. Arriba no hace falta nada pegajoso: lo
           primero que ves al entrar es a quién va y el botón, y las
           líneas quedan debajo para repasarlas si quieres. -->
      <div class="m-rev-enviar">
        <!-- Un título, para que el bloque se lea como UNA cosa. Sin
             él, las fichas, el campo y la casilla parecían tres
             controles sueltos que casualmente estaban juntos. -->
        <div class="m-rev-enviar-h">Send this order</div>
        <div class="m-rev-lab">To</div>
        <div class="m-rev-chips" id="mrTo">
          ${_cargandoDest && !_to.length
            ? '<span class="m-rev-cargando">Looking up the saved address…</span>'
            : _to.map((e, i) => `
                <span class="m-rev-chip">${esc(e)}
                  <button type="button" data-quitar="${i}" aria-label="Remove ${esc(e)}">
                    <i class="ti ti-x" aria-hidden="true"></i></button>
                </span>`).join('')}
          <button type="button" class="m-rev-chip m-rev-add" id="mrAdd">
            <i class="ti ti-plus" aria-hidden="true"></i> Add
          </button>
        </div>
        <div class="m-rev-nuevo" id="mrNuevo" hidden>
          <input type="email" id="mrMail" inputmode="email" autocomplete="email"
                 autocapitalize="off" spellcheck="false" placeholder="name@vendor.com">
          <button type="button" id="mrOk">Add</button>
        </div>

        <!-- La nota para el proveedor, cerrada hasta que se pide: casi
             siempre va vacía y la tarjeta queda como antes (opción 2
             que eligió Axel). -->
        ${_notaAbierta || _notaProv ? `
          <div class="m-rev-lab">Note for the vendor <span class="m-rev-op">· optional</span></div>
          <textarea id="mrNota" class="m-rev-nota" rows="3" maxlength="1000"${_colocando ? ' disabled' : ''}
                    placeholder="Delivery window, back door, a substitution…">${esc(_notaProv)}</textarea>
          <div class="m-rev-nota-pie">Shows at the top of the email. Not in the PDF.</div>` : `
          <button type="button" class="m-rev-nota-add" id="mrNotaAdd">
            <i class="ti ti-message-plus" aria-hidden="true"></i> Add a note for the vendor
          </button>`}

        <label class="m-rev-rec">
          <input type="checkbox" id="mrRec"${_recordar ? ' checked' : ''}>
          <span>Remember these for ${esc(v.nombre)}</span>
        </label>

        ${_colocando ? `
          <!-- Tres pasos y no una rueda: si el correo falla hay que
               poder ver que el paso de guardar ya pasó. Cada uno dura
               un mínimo en pantalla, o pasan tan rápido que no se leen
               y parece que no hizo nada. -->
          <div class="m-rev-pasos">
            <div class="${_paso > 1 ? 'ok' : 'go'}">${_paso > 1 ? '✓' : '●'} Saving the order</div>
            <div class="${_paso > 2 ? 'ok' : _paso === 2 ? 'go' : ''}">${
              _paso > 2 ? '✓' : '●'} Building the PDF</div>
            <div class="${_paso === 3 ? 'go' : ''}">● Emailing ${esc(_to[0] || '')}</div>
          </div>` : ''}

        ${_falloCorreo ? (_dudaCorreo ? `
          <!-- DUDA, no fallo. El servidor no contestó claro, y eso
               pasa cuando el PDF sube lento: la petición llega, el
               correo sale, y la respuesta se pierde. Decir "no salió"
               cuando el proveedor ya lo tiene hace que lo mandes dos
               veces. -->
          <div class="m-rev-fallo duda">
            <b>The order is placed.</b> We could not confirm the email.
            It may well have gone out — check your inbox before sending
            it again.
          </div>` : `
          <div class="m-rev-fallo">
            <b>The order is placed.</b> The email did not go out.
            You can send it again from here or from History.
          </div>`) : ''}

        <button type="button" class="m-rev-go" id="mrGo"${
          _to.length && !_colocando ? '' : ' disabled'}>${
          _colocando ? 'Working…'
            : _dudaCorreo ? 'Send it again anyway'
            : _falloCorreo ? 'Try sending again'
            : 'Place & send'}</button>
        ${!_to.length && !_cargandoDest
          ? '<div class="m-rev-falta">Add at least one address first.</div>' : ''}
      </div>

      <div class="m-rev-lab">You are ordering</div>
      <div class="m-rev-list">
        ${v.filas.map(r => `
          <div class="m-rev-l">
            <span class="q">${n2(cantidad(r))}×</span>
            <span class="n">${esc(r.item || '')}</span>
            <span class="v">${num(r.value) > 0
              ? money(num(r.value) * cantidad(r)) : 'no price'}</span>
          </div>`).join('')}
      </div>`;

    volverCon(host, () => {
      // Si esto vino de un borrador, atrás es Quick order. Caer en las
      // líneas pendientes del proveedor sería caer en otra orden.
      const aQuick = _deBorrador;
      salirRevision();
      if (aQuick) { _vendor = null; volverAQuick(); return; }
      repintar();
    });

    host.querySelectorAll('[data-quitar]').forEach(b => {
      b.onclick = () => { _to.splice(Number(b.dataset.quitar), 1); repintar(); };
    });

    const caja = host.querySelector('#mrNuevo');
    const mail = host.querySelector('#mrMail');
    host.querySelector('#mrAdd').onclick = () => {
      caja.hidden = false;
      if (mail) mail.focus();
    };
    const meter = () => {
      const val = String(mail.value || '').trim();
      if (!EMAIL.test(val)) {
        mail.setAttribute('aria-invalid', 'true');
        if (window.BarStockToast) window.BarStockToast.show('That address does not look right.');
        return;
      }
      if (!_to.includes(val)) _to.push(val);
      repintar();
    };
    host.querySelector('#mrOk').onclick = meter;
    // Enter en el teclado del teléfono hace lo mismo que el botón.
    mail.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); meter(); } };

    const notaAdd = host.querySelector('#mrNotaAdd');
    if (notaAdd) notaAdd.onclick = () => {
      _notaAbierta = true;
      repintar();
      const t = host.querySelector('#mrNota');
      if (t) t.focus();
    };
    // Se lee al escribir y NO repinta: repintar en cada letra cerraría
    // el teclado. Es lo mismo que hace la nota de Quick order.
    const notaTxt = host.querySelector('#mrNota');
    if (notaTxt) notaTxt.oninput = () => { _notaProv = notaTxt.value; };

    host.querySelector('#mrRec').onchange = (ev) => { _recordar = !!ev.target.checked; };
    host.querySelector('#mrGo').onclick = () => colocar(v, host);

    cargarDestinatarios(v.nombre, host);   // no hace nada si ya se preguntó
  }

  // ── Colocar y enviar ─────────────────────────────────────────────────
  //
  // Se reusa `persistOrderToSupabase` y `loadOrdersFromCloud`, las
  // mismas del escritorio. Nada de una segunda forma de guardar una
  // orden: con dos, cualquier arreglo hay que hacerlo dos veces y la
  // segunda se olvida. El PDF sale de `BarStockEmailOrder.generarPdf`
  // por lo mismo: es lo único que ve el proveedor.
  //
  // El ORDEN no es intercambiable. Primero se guarda, después sale el
  // correo. Si fuera al revés y el guardado fallara, el proveedor
  // tendría un pedido que la app no conoce — y eso aparece semanas
  // después, al no poder cuadrar su factura contra ninguna orden.
  // Al revés es recuperable: queda una orden colocada que se reenvía
  // desde History.

  // Los pasos que se enseñan mientras trabaja. Un botón quieto cinco
  // segundos se pulsa dos veces, y dos pulsaciones son dos órdenes.
  let _paso = 0;            // 0 nada · 1 guardando · 2 PDF · 3 enviando
  let _falloCorreo = false; // guardada pero el correo no salió
  let _dudaCorreo = false;  // ...o no sabemos si salió, que no es igual
  // La orden YA guardada en la nube. Mientras exista, reintentar manda
  // el correo y nada más: volver a guardarla crearía una segunda orden
  // al mismo proveedor, que es justo el desastre que el aviso de
  // "the order is placed" viene a evitar.
  let _colocada = null;
  // Lo que se enseña al terminar. Hacerlo todo bien y no decirlo se
  // lee igual que fallar: antes la pantalla se cerraba sola y te
  // devolvía a la lista sin una palabra.
  let _enviado = null;      // { vendor, to: [], botellas, total }

  // Cada paso dura un MÍNIMO en pantalla. Guardar y mandar tardan
  // décimas con buena señal, así que los tres pasos pasaban en un
  // parpadeo y no se leía ninguno — peor que no enseñarlos.
  const PASO_MS = 420;
  const alMenos = async (ms, trabajo) => {
    const t0 = Date.now();
    const r = await trabajo;
    const falta = ms - (Date.now() - t0);
    if (falta > 0) await new Promise(res => setTimeout(res, falta));
    return r;
  };

  // `destinatarios` entra por parámetro y no se lee de `_to` para que
  // History pueda reusar esto tal cual: allí no hay pantalla de
  // revisión, pero el correo tiene que salir exactamente igual.
  //
  // `op.vendorNote` sólo lo pasa la revisión. History reenvía sin nota:
  // la nota no se guarda, y no puede colarse la que haya en pantalla.
  async function enviarCorreo(orden, destinatarios, op) {
    const para = (destinatarios && destinatarios.length) ? destinatarios.slice() : _to.slice();
    if (!para.length) throw new Error('No address to send it to.');
    const E = window.BarStockEmailOrder;
    if (!E || typeof E.generarPdf !== 'function') {
      throw new Error('The order mailer is not loaded.');
    }

    const loc = (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || 'BarStock';

    let defs = {}, perfil = {};
    try { if (window.BarStockVendorDefaults)
      defs = (await window.BarStockVendorDefaults.getDefaults(orden.vendor)) || {}; } catch (e) {}
    try { if (window.BarStockSenderProfile)
      perfil = (await window.BarStockSenderProfile.getProfile()) || {}; } catch (e) {}

    const pdf = await E.generarPdf(orden.vendor, orden.items, {
      location: loc,
      vendor: orden.vendor,
      poNumber: orden.poNumber || '',
      date: new Date().toLocaleDateString('en-US',
        { month: 'short', day: 'numeric', year: 'numeric' }),
      deliveryDate: '',
      buyerName: perfil.name || '',
      buyerEmail: perfil.email || '',
      buyerPhone: perfil.phone || '',
      buyerTitle: perfil.title || '',
      items: orden.items.length,
      totalUnits: orden.totalUnits,
      vendorDefaults: defs
    });

    let replyTo = null;
    try { if (window.BarStockLocationSettings)
      replyTo = await window.BarStockLocationSettings.getReplyToEmail(); } catch (e) {}

    const cuerpo = {
      to: para,
      vendor: orden.vendor,
      items: orden.items,
      totalUnits: orden.totalUnits,
      subtotal: orden.subtotal,
      locationName: loc,
      pdfBase64: pdf,
      filename: String(orden.vendor).toLowerCase().replace(/\s+/g, '_') +
                '_order_' + new Date().toISOString().slice(0, 10) + '.pdf'
    };
    if (replyTo) cuerpo.replyTo = replyTo;
    if (perfil.name) cuerpo.senderName = perfil.name;
    if (perfil.email) cuerpo.senderEmail = perfil.email;
    const nota = String((op && op.vendorNote) || '').trim();
    if (nota) cuerpo.vendorNote = nota;

    const res = await fetch('https://barstock-app.vercel.app/api/send-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });

    // ── Rechazado NO es lo mismo que no saber ──────────────────────
    //
    // Antes cualquier respuesta que no fuera `{ok:true}` se daba por
    // fallo. Pero con un PDF grande subiendo por 5G pasa esto: la
    // petición llega, el servidor manda el correo, y la RESPUESTA se
    // pierde o vuelve como una página de error del gateway. El
    // proveedor ya tiene el pedido y la app dice que no salió.
    //
    // Si el servidor contesta y dice que no, es un fallo de verdad.
    // Si no se entiende la respuesta, es una duda — y una duda hay
    // que contarla como duda, porque reenviar a ciegas manda el
    // pedido dos veces.
    let r = null;
    try { r = await res.json(); } catch (e) { r = null; }

    if (r && r.ok) return para;
    if (r && r.error) throw new Error(r.error);

    const dudoso = new Error(
      'The server did not answer clearly (HTTP ' + res.status + ').');
    dudoso.incierto = true;
    throw dudoso;
  }

  async function guardarDestinatarios(vendor) {
    if (!_recordar || !window.BarStockVendorDefaults) return;
    try {
      // LEER y fusionar. `saveDefaults` escribe el registro entero, así
      // que mandar sólo el correo borraría el número de cuenta, el rep
      // y la ventana de entrega.
      const d = (await window.BarStockVendorDefaults.getDefaults(vendor)) || {};
      await window.BarStockVendorDefaults.saveDefaults(vendor,
        Object.assign({}, d, { vendor_email: _to.join(', ') }));
    } catch (e) {
      // Que no se guarde la libreta no puede tumbar una orden que ya
      // está en la nube.
      console.warn('[orders] no se pudieron guardar los destinatarios', e);
    }
  }

  async function colocar(v, host) {
    if (_colocando) return;
    if (!_to.length) return;

    const avisar = (t) => { if (window.BarStockToast) window.BarStockToast.show(t); };

    if (typeof window.persistOrderToSupabase !== 'function' ||
        typeof window.loadOrdersFromCloud !== 'function') {
      avisar('Orders are not connected right now. Try again in a moment.');
      return;
    }

    let orden = _colocada;

    // ── 1 · Guardar ────────────────────────────────────────────────
    //
    // Se SALTA si ya está colocada. Reintentar después de un fallo de
    // correo manda el correo y nada más: volver a guardar crearía una
    // segunda orden al mismo proveedor.
    if (!orden) {
      const filas = v.filas
        .map(r => (hay('cloneOrderRow') ? window.cloneOrderRow(r) : r))
        .filter(r => cantidad(r) > 0);
      if (!filas.length) { avisar('Nothing to order for this vendor.'); return; }

      _colocando = true;
      _falloCorreo = false;
      _paso = 1;
      repintar();

      const ahora = new Date().toISOString();
      orden = {
        id: hay('uniqueOrderId') ? window.uniqueOrderId() : 'ord_' + Date.now(),
        vendor: v.nombre,
        createdAt: ahora,
        date: ahora,
        // El mismo reparto que el escritorio: LOOP sale por CSV y el
        // resto por imagen. Que el tipo lo decida otro sitio sería una
        // segunda regla que se desincroniza.
        exportType: v.nombre === 'LOOP' ? 'loop_csv' : 'vendor_jpg',
        filename: v.nombre === 'LOOP'
          ? 'loop_upload.csv'
          : 'vendor_order_' + String(v.nombre).toLowerCase().replace(/\s+/g, '_') + '.jpg',
        items: filas,
        totalUnits: filas.reduce((s, r) => s + cantidad(r), 0),
        subtotal: hay('computeOrderSubtotal') ? window.computeOrderSubtotal(filas) : v.total
      };

      // Los campos de una orden rápida se añaden encima, no se
      // reescribe la orden: así lo de arriba sigue siendo lo único
      // que decide cómo se guarda una orden en este teléfono.
      if (_extra) Object.assign(orden, _extra);

      try {
        await alMenos(PASO_MS, window.persistOrderToSupabase(orden));

        // Una orden rápida NO toca el histórico de pares. El ciclo
        // predice con lo que se pide cada semana, y una carrera a la
        // tienda es justo lo que no se repite. El escritorio tampoco
        // lo hace: si aquí sí, las dos mitades de la app entrenarían
        // la predicción con datos distintos.
        if (window.BarStockParIntelligence && !(_extra && _extra.quickOrder)) {
          window.BarStockParIntelligence.updateSnapshotOrdered(orden.items)
            .catch(e => console.warn('[ParIntelligence] updateSnapshotOrdered', e));
        }
        if (window.BarStockLogger) {
          window.BarStockLogger.log('place_order_saved', {
            vendor: v.nombre, orderId: orden.id, totalUnits: orden.totalUnits,
            subtotal: orden.subtotal, itemCount: filas.length, from: 'mobile'
          });
        }
        await window.loadOrdersFromCloud();
      } catch (e) {
        _colocando = false; _paso = 0;
        repintar();
        // Si no se guardó, NO está colocada. Decirlo con todas las
        // letras: creer lo contrario acaba en dos órdenes al mismo
        // proveedor.
        avisar('Could not place it: ' + (e && e.message ? e.message : String(e)));
        console.error('[orders] guardar la orden falló', e);
        return;
      }

      // Desde aquí la orden YA EXISTE. Lo que falle a partir de ahora
      // no la deshace, y la pantalla no puede dar a entender que sí.
      _colocada = orden;

      // El borrador de Quick order se tira AQUÍ, en cuanto la orden
      // existe en la nube. Si siguiera guardado, volver atrás desde
      // la revisión enseñaría los mismos renglones listos para
      // mandarse otra vez — y eso son dos órdenes al proveedor.
      if (_extra && _extra.quickOrder && window.BarStockMobileQuick) {
        try { window.BarStockMobileQuick.limpiar(); } catch (e) {}
      }

      await guardarDestinatarios(v.nombre);
    } else {
      _colocando = true;
      _falloCorreo = false;
      repintar();
    }

    // ── 2 · El PDF y el correo ─────────────────────────────────────
    _paso = 2;
    repintar();
    let fueron = [];
    try {
      // El PDF se ve construirse: es el paso que de verdad tarda en un
      // iPhone, y el que explica por que la pantalla no reacciona.
      await alMenos(PASO_MS, Promise.resolve());
      _paso = 3;
      repintar();
      fueron = await alMenos(PASO_MS, enviarCorreo(orden, null, { vendorNote: _notaProv }));
    } catch (e) {
      // La orden está colocada y el correo no salió —o no sabemos si
      // salió—. Es el estado que más confunde, así que se queda en
      // pantalla diciéndolo en vez de desaparecer con un aviso.
      _colocando = false; _paso = 0;
      _falloCorreo = true;
      _dudaCorreo = !!(e && e.incierto);
      repintar();
      console.error('[orders] el correo no salió', e);
      avisar(_dudaCorreo
        ? 'Order placed. Could not confirm the email.'
        : 'Order placed, but the email did not go out.');
      return;
    }

    // ── De aquí para abajo el correo YA SALIÓ ──────────────────────
    //
    // Nada de esto puede marcar el envío como fallido. Antes todo
    // vivía dentro del mismo try, así que un error al registrar o al
    // repintar daba "el correo no salió" con el correo ya entregado.
    try {
      if (window.BarStockLogger) {
        window.BarStockLogger.log('email_order_sent', {
          vendor: v.nombre, orderId: orden.id, to: fueron.join(', '),
          itemCount: orden.items.length, from: 'mobile'
        });
      }
      // Se QUEDA en pantalla diciendo que salio. Antes se cerraba
      // sola y te devolvia a la lista sin una palabra: con el correo
      // ya en la bandeja del proveedor, eso se lee como que fallo.

    } catch (e) {
      console.error('[orders] el correo salió pero algo después falló', e);
    }

    _colocando = false; _paso = 0; _falloCorreo = false; _dudaCorreo = false;
    _colocada = null;
    _enviado = {
      vendor: v.nombre,
      to: fueron.slice(),
      botellas: orden.totalUnits,
      total: orden.subtotal
    };
    repintar();
  }

  function linea(r) {
    const i = master().indexOf(r);
    const q = cantidad(r);
    const precio = num(r.value);
    const conPrecio = precio > 0;
    const editada = aMano(r) && ajustable(r);
    const falló = _fallos.has(clave(r));
    const agotado = num(r.onHand) <= 0;

    // El estado de la derecha: primero lo que puede costar dinero.
    const marca = falló
      ? '<span class="m-ord-mal">not saved</span>'
      : !conPrecio ? '<span class="m-ord-sin">no price</span>'
      : editada ? '<span class="m-ord-ed">edited</span>'
      : agotado ? '<span class="m-ord-out">out</span>' : '';

    // La recién elegida en el buscador del +: marcada, "added" si entró
    // ahora. Se ve una vez: el siguiente pintado ya no la marca.
    const recien = !!(_recien && _recien.item === r.item);
    return `
      <div class="m-ord-l${!conPrecio ? ' sinprecio' : ''}${editada ? ' editada' : ''}${falló ? ' mal' : ''}${recien ? ' m-ord-nuevo' : ''}"
           data-i="${i}">
        <div class="m-ord-l-top">
          <span class="m-ord-l-n">${esc(r.item)}</span>
          ${recien && _recien.nueva ? '<span class="m-ord-added">added</span>' : marca}
          ${ajustable(r) ? `<button type="button" class="m-ord-x" data-fuera="${i}"
                                    aria-label="Leave out of this order">
                              <i class="ti ti-x" aria-hidden="true"></i>
                            </button>` : ''}
        </div>
        <div class="m-ord-l-s">${SK() && SK().modo() ? esc(SK().deDonde(r)) + ' · par ' + n2(r.suggested) : n2(r.onHand) + ' of ' + n2(r.suggested) + ' on hand'}${
          conPrecio ? ' · ' + money(precio) + ' each'
                    : ' · won’t count toward the total'}</div>

        ${ajustable(r) ? `
          <div class="m-ord-q">
            <button type="button" data-q="-1" aria-label="One less">−</button>
            <input type="number" inputmode="numeric" min="0" step="1"
                   value="${q}" aria-label="Quantity to order">
            <button type="button" data-q="1" aria-label="One more">+</button>
            <span class="m-ord-l-t">${conPrecio ? money(q * precio) : '—'}</span>
          </div>
          ${editada ? `<button type="button" class="m-ord-undo">
             Auto was ${n2(auto(r))} · <b>undo</b></button>` : ''}
          ${sugHtml(r, q, true)}
        ` : `
          <div class="m-ord-auto">
            <b>${n2(q)}</b>
            <span>automatic · this vendor has no manual override</span>
            <span class="m-ord-l-t">${conPrecio ? money(q * precio) : '—'}</span>
          </div>
          ${sugHtml(r, q, false)}`}
      </div>`;
  }

  function enganchar(host) {
    // "Use N" y "Add N": la cantidad a mano, como el −/+ (updateFinalOrder).
    host.querySelectorAll('[data-use]').forEach(b => {
      b.onclick = () => {
        if (!hay('updateFinalOrder')) return;
        const i = Number(b.dataset.use);
        _fallos.delete(clave(master()[i] || {}));
        window.updateFinalOrder(i, Number(b.dataset.n) || 0);
        repintar();
      };
    });
    host.querySelectorAll('.m-ord-l').forEach(caja => {
      const i = Number(caja.dataset.i);
      const inp = caja.querySelector('input');
      if (!inp) return;

      const guardar = (valor) => {
        if (!hay('updateFinalOrder')) return;
        _fallos.delete(clave(master()[i] || {}));
        window.updateFinalOrder(i, valor);
        repintar();
      };

      // Excluir es poner la cantidad a cero: lo mismo que ya hacía
      // bajar con el botón, pero dicho y con sitio al que va.
      const fuera = caja.querySelector('[data-fuera]');
      if (fuera) fuera.onclick = () => guardar(0);

      caja.querySelectorAll('[data-q]').forEach(b => {
        b.onclick = () => {
          const d = Number(b.dataset.q);
          guardar(Math.max(0, (Number(inp.value) || 0) + d));
        };
      });
      // change y no input: escribiendo "12" pasa por "1", y guardar ese
      // 1 en la nube a mitad de tecleo es una orden de una botella.
      inp.onchange = () => guardar(Math.max(0, Number(inp.value) || 0));

      const undo = caja.querySelector('.m-ord-undo');
      if (undo) undo.onclick = () => {
        if (hay('resetFinalOrder')) { window.resetFinalOrder(i); repintar(); }
      };
    });
  }

  // ── Las tres secciones ───────────────────────────────────────────
  //
  // Órdenes, historial y facturas contestan la misma pregunta en tres
  // momentos: qué voy a pedir, qué pedí, qué llegó. Vivían en tres
  // sitios y seguir ese hilo obligaba a pasar por More dos veces.
  //
  // Esto NO rediseña ninguna de las tres. Cada una sigue pintando su
  // `innerHTML` igual que antes; lo único que cambia es que recibe un
  // div de aquí dentro en vez de la pantalla entera. No se enteran.

  const SECCIONES = [
    { id: 'open',  n: 'Open' },
    { id: 'sent',  n: 'Sent' },
    { id: 'inv',   n: 'Invoices' }
  ];
  let _sec = 'open';

  const H = () => window.BarStockMobileHistory;
  const I = () => window.BarStockMobileInvoices;
  const TB = () => window.BarStockMobileToBuy;

  // ── To buy, la cuarta, delante (Axel, 2026-11-15) ──────────────────
  //
  // La lista de compras (mobile-to-buy.js) va ANTES de Open y SÓLO
  // cuando tiene algo por comprar: vacía, Orders enseña las tres de
  // siempre. Si se vacía estando en ella, se vuelve a Open.
  // Sale con algo por comprar o con algo pedido que aún no llega
  // (fase 4): si no, al pedirlo todo se iría con lo pedido dentro.
  const hayToBuy = () => { const t = TB(); return !!(t && (t.visible ? t.visible() : t.cuantos && t.cuantos() > 0)); };
  const secciones = () => hayToBuy() ? [{ id: 'buy', n: 'To buy' }].concat(SECCIONES) : SECCIONES;

  // ¿La sección activa está dentro de un detalle? Entonces el
  // segmentado estorba: un detalle es otro nivel, y dejar ahí tres
  // pestañas invita a saltar de sección perdiendo lo que mirabas.
  function enDetalle() {
    if (_sec === 'buy') return false;
    if (_sec === 'open') return !!_vendor || !!_revisar;
    const m = _sec === 'sent' ? H() : I();
    return !!(m && m.enDetalle && m.enDetalle());
  }

  // El marco se arma UNA vez por pantalla. `#moCuerpo` no se vuelve a
  // crear nunca: si se recreara, el repintado asíncrono del historial
  // escribiría sobre un elemento que ya no está en el documento y la
  // sección se quedaría en blanco.
  function marco(host) {
    // ── Dos piezas dentro de una lista con su propio scroll ────────
    //
    // Entra ya acoplada: "Orders" en el header en el sitio del logo y
    // las pestañas pegadas debajo, con el desenfoque progresivo, desde
    // el principio (Axel, 2026-11-12, "la misma historia para orders",
    // sobre su captura; antes esperaba al scroll, como Inventory). Lo
    // hace band-dock.js con `siempre`.
    //
    //   #moPeg     las pestañas: lo que se queda pegado.
    //   #moCuerpo  la sección.
    //
    // Encima de las pestañas iba #moCab, con el título, el subtítulo de
    // la sección y la cifra de Open ("$X · N vendors"). Se fue entero:
    // el título ya está en el header, y la cifra sin el título no tenía
    // dónde quedarse sin volver a dejar algo encima de las pestañas.
    //
    // Las pestañas cuelgan DIRECTAMENTE de la lista: un sticky sólo se
    // pega mientras dura su padre.
    let cuerpo = host.querySelector('#moCuerpo');
    if (!cuerpo) {
      host.innerHTML = '<div id="moScroll"><div id="moPeg"></div>' +
        '<div id="moCuerpo"></div></div>';
      cuerpo = host.querySelector('#moCuerpo');
    }

    const peg = host.querySelector('#moPeg');
    // Se engancha en los dos casos, con las pestañas ya pintadas.
    // Dentro de un detalle va sin nombre y sin `siempre`: no hay
    // pestañas, y el header conserva el logo.
    const acoplar = (nombre) => {
      const D = window.BarStockBandDock;
      // `tambien`: en Sent, la fila del buscador y los filtros, que la
      // pinta la sección arriba de su contenido. Se queda pegada bajo
      // las pestañas (Axel, 2026-11-09). Sólo si es LO PRIMERO del
      // cuerpo: una fila igual más abajo no es la de la sección.
      if (D) D.enganchar({ pantalla: host, scroll: host.querySelector('#moScroll'),
        pegado: peg, nombre, siempre: !!nombre,
        tambien: () => {
          const p = cuerpo.firstElementChild;
          return p && p.classList.contains('m-inv-bar2') ? p : null;
        } });
    };
    // ── Dentro de un detalle de Sent o de Invoices ─────────────────
    //
    // La sección pinta el detalle —su nombre a la banda con enBanda, su
    // bloque pegado con BarStockBandDock.fijar()— y DESPUÉS avisa, y el
    // aviso llega aquí. Así que aquí no se suelta la banda, y tras
    // enganchar la lista sin nada se vuelve a pegar el bloque que la
    // sección marcó con .m-det-fijo. Sin esto, el aviso deshacía las dos
    // cosas en el mismo instante (lo cazó test-detalle-banda con Orders
    // y Sent de verdad; con secciones de mentira no se ve).
    if (enDetalle()) {
      peg.innerHTML = ''; acoplar('');
      const fijo = cuerpo.querySelector(':scope > .m-det-fijo');
      const D = window.BarStockBandDock;
      if (fijo && D && D.fijar) D.fijar(fijo);
      return cuerpo;
    }
    // En la lista, la banda suelta el nombre del detalle: si no, "LOOP"
    // se quedaría sobre las pestañas.
    const M = window.BarStockMobile;
    if (M && M.salirBanda) M.salirBanda();

    const vs = proveedores();
    const nPend = vs.length;
    const nSin = (I() && I().resumen && (I().resumen() || {}).sueltas) || 0;
    const nBuy = hayToBuy() ? (TB().cuantos() || 0) : 0;

    peg.innerHTML =
      '<div class="m-seg" id="moSeg">' +
        secciones().map(x => {
          // El contador solo donde significa algo: proveedores con
          // pedido esperando, líneas de factura sin enlazar y lo que
          // hay por comprar. Un contador en "Sent" seria el total del
          // historial, que no pide nada.
          const n = x.id === 'open' ? nPend : x.id === 'inv' ? nSin : x.id === 'buy' ? nBuy : 0;
          return '<button type="button" class="' + (x.id === _sec ? 'on' : '') + '"' +
            ' data-sec="' + x.id + '">' + esc(x.n) +
            (n ? ' <b>' + n + '</b>' : '') + '</button>';
        }).join('') +
      '</div>';

    // "Quick order" vivía aquí (#moTras), arriba de la lista de Open, y
    // subía con ella. Desde el 2026-11-20 (Axel, opción 2: cristal
    // verde) va fijo donde Done, al final del resumen (pintarResumen):
    // es la acción de la pantalla, no una fila más.

    peg.querySelectorAll('[data-sec]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.sec === _sec) return;
        _sec = b.dataset.sec;
        // Cada sección arranca por su lista. Volver a una y caer
        // dentro de lo que mirabas hace diez minutos desorienta.
        salirRevision(); _vendor = null;
        if (H() && H().reiniciar) H().reiniciar();
        if (I() && I().reiniciar) I().reiniciar();
        pintar(host);
      };
    });
    acoplar('Orders');
    return cuerpo;
  }

  // ── Pintar ───────────────────────────────────────────────────────────

  // Redibuja la cabecera y nada más. Es lo que llaman las secciones
  // al abrir o cerrar un detalle.
  function refrescarMarco() {
    if (_host) marco(_host);
  }

  // La pantalla entera, recordada. Los manejadores de dentro reciben
  // el CUERPO, no la pantalla: si llamaran a `pintar()` con lo que
  // tienen a mano, se armaría un marco dentro de otro marco.
  let _host = null;
  const repintar = () => pintar(_host);

  // ── En el escritorio (desk-orders.js, lámina "Orders · desktop", A) ──
  //
  // El mismo Open en el panel de la derecha, sin el marco del teléfono
  // (ni la banda, ni las pestañas, ni la lista que se pega): las pestañas
  // son las del header del escritorio y la lista de proveedores, su
  // columna. Lo que coloca y manda una orden no se escribe dos veces: es
  // esto. Sin la banda, el detalle pinta su propia cabecera (enBanda
  // contesta que no), como hacía antes del armazón.
  //   `alCambiar({ sec, vendor, revisar })` avisa al escritorio en cada
  //   pintado (para marcar el proveedor elegido o volver a la lista).
  let _esc = null;
  function abrirEscritorio(host, o) {
    _esc = o || {};
    _sec = _esc.sec || 'open';
    _vendor = _esc.vendor || null;
    salirRevision();
    pintar(host);
  }
  function cerrarEscritorio() { _esc = null; _host = null; _vendor = null; salirRevision(); }

  function pintar(host) {
    if (!host) return;
    _host = host;
    // To buy sin nada que comprar ya no tiene pestaña: a Open.
    if (_sec === 'buy' && !hayToBuy() && TB() && TB().cuantos() !== null) _sec = 'open';
    const cuerpo = _esc ? host : marco(host);
    try { pintarSeccion(cuerpo); }
    finally { if (_esc && _esc.alCambiar) _esc.alCambiar({ sec: _sec, vendor: _vendor, revisar: _revisar }); }
  }

  function pintarSeccion(cuerpo) {
    // El cuerpo es el mismo para las cuatro: se marca cuál está puesta
    // para que una lectura tardía de To buy no pinte encima de otra.
    cuerpo.dataset.sec = _sec;

    // El `aviso` es cómo la sección le dice al marco que cambió de
    // nivel. Sin él, el detalle se pintaba dentro y el segmentado
    // seguía encima: dos salidas compitiendo.
    //
    // Redibuja SOLO la cabecera. Volver a montar la sección aquí
    // dispararía otra carga de red por cada vez que abres un detalle.
    if (_sec === 'buy')  { if (TB()) TB().montar(cuerpo); return; }
    if (_sec === 'sent') { if (H()) H().montar(cuerpo, refrescarMarco); return; }
    if (_sec === 'inv')  { if (I()) I().montar(cuerpo, refrescarMarco); return; }

    // La revisión manda mientras esté abierta, aunque el proveedor ya
    // no tenga líneas pendientes — que es justo lo que pasa en cuanto
    // la orden se guarda.
    if (_revisar) pintarRevision(cuerpo);
    else if (_vendor) pintarDetalle(cuerpo);
    // En el escritorio la lista de proveedores es su columna: sin uno
    // elegido, el panel se queda vacío y el escritorio elige.
    else if (_esc) cuerpo.innerHTML = '';
    else pintarResumen(cuerpo);
  }

  function pantalla() {
    return document.querySelector('.m-screen[data-screen="orders"]');
  }

  function refresh() {
    if (_esc) { if (_host && _host.isConnected) pintar(_host); return; }
    const host = pantalla();
    if (host && host.classList.contains('on')) pintar(host);
  }

  // Lo llama persistOrderOverride cuando la nube rechaza el cambio. El
  // aviso del escritorio sale en su barra de estado, que aquí no
  // existe: sin esto, ajustar con mala señal se ve igual que ajustar
  // bien, y la diferencia aparece el día del pedido.
  function falloAlGuardar(row) {
    if (!row) return;
    _fallos.add(clave(row));
    refresh();
  }

  // ── Entrar directo a un proveedor ──────────────────────────────────
  //
  // La tarjeta del Home enseña las órdenes que esperan, una fila por
  // proveedor. Pulsar una tiene que llevarte A ESA, no al índice que
  // acabas de leer para volver a elegir lo mismo.
  //
  // `_pedida` y no abrir aquí la pantalla: `show()` se ejecuta DESPUÉS
  // y pone `_vendor = null` —a propósito, para que entrar por la
  // pestaña arranque siempre en el resumen—. Así que se deja la
  // petición anotada y es `show()` quien la recoge y la borra.
  let _pedida = null;
  let _secPedida = null;   // sección que alguien pidió al entrar

  function abrirVendor(nombre) {
    _pedida = String(nombre || '') || null;
    if (window.BarStockMobile) window.BarStockMobile.ir('orders');
  }

  // `enviarCorreo` se exporta para History: reenviar una orden ya
  // colocada es el MISMO correo, con el mismo PDF. Dos funciones que
  // mandan el mismo pedido acabarían mandándolo distinto.
  // `abrirSeccion` es cómo el resto de la app entra a una de las tres
  // sin saber que viven dentro de Orders. Antes se hacía con
  // `BarStockMobile.ir('invoices')`, que ya no existe como pantalla.
  function abrirSeccion(id) {
    _secPedida = (id === 'sent' || id === 'inv' || id === 'buy') ? id : 'open';
    if (window.BarStockMobile) window.BarStockMobile.ir('orders');
  }

  function volverAQuick() {
    if (window.BarStockMobile && window.BarStockMobile.ir) window.BarStockMobile.ir('quick');
  }

  // ── Revisar un borrador de Quick order ─────────────────────────────
  //
  // Quick order NO tiene su propia pantalla de enviar. Manda su
  // borrador AQUÍ y se usa la revisión que ya existe: los
  // destinatarios con su libreta, los tres pasos, el PDF, el estado
  // de "colocada pero el correo no salió" y la diferencia entre
  // rechazo y duda. Todo eso costó varias vueltas de aprender; una
  // segunda copia en otra pantalla volvería a aprenderlo mal.
  //
  // Se deja ANOTADO y se navega, como `_pedida`: `show()` corre
  // después y llama a `salirRevision()`, así que ponerlo aquí
  // directamente se borraría solo al llegar.
  let _borrador = null;   // { nombre, filas, nota }

  function revisarBorrador(b) {
    if (!b || !b.nombre || !Array.isArray(b.filas) || !b.filas.length) return false;
    // `llegada`: la respuesta a "¿al LIVE ya?" del quick order
    // (mobile-quick.js). Viaja hasta la orden para que se guarde con ella.
    _borrador = { nombre: b.nombre, filas: b.filas.slice(), nota: b.nota || 'Quick Order', llegada: b.llegada };
    if (window.BarStockMobile) window.BarStockMobile.ir('orders');
    return true;
  }

  // Monta la revisión a partir del borrador. Devuelve false si no
  // había ninguno, para que `show()` siga su camino normal.
  function montarBorrador() {
    const b = _borrador;
    _borrador = null;
    if (!b) return false;
    salirRevision();
    _sec = 'open';
    _vendor = b.nombre;
    _revisar = true;
    _deBorrador = true;
    _extra = { quickOrder: true, note: b.nota };
    if (b.llegada !== undefined) _extra.arrivesAt = b.llegada;
    const botellas = b.filas.reduce((s, r) => s + cantidad(r), 0);
    _vista = {
      nombre: b.nombre,
      filas: b.filas.slice(),
      total: hay('computeOrderSubtotal') ? window.computeOrderSubtotal(b.filas) : 0,
      sinPrecio: b.filas.filter(r => num(r.value) <= 0).length,
      botellas
    };
    return true;
  }

  window.BarStockMobileOrders = {
    refresh, falloAlGuardar, abrirVendor, enviarCorreo, abrirSeccion,
    revisarBorrador, abrirEscritorio, cerrarEscritorio, listaResumen,
    // Cuántos hay pendientes en cada pestaña (las cuentas del header).
    cuentas: () => ({
      open: proveedores().length,
      inv: (I() && I().resumen && (I().resumen() || {}).sueltas) || 0,
      buy: hayToBuy() ? (TB().cuantos() || 0) : 0
    }),
    hayToBuy: () => hayToBuy()
  };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      id: 'orders', icon: 'ti-shopping-cart', label: 'Orders',
      tab: true, orden: 40,
      mount: pintar,
      // Repinta donde estés: si estás dentro de LOOP y alguien cambia
      // una cantidad en el ordenador, cambia la cifra, no la pantalla.
      refrescar: pintar,
      // Deslizar desde el borde vuelve al resumen. Sin proveedor
      // abierto no hay a dónde volver, y se contesta que no para que
      // el gesto ni se arme.
      // El gesto del borde lo atiende la SECCIÓN que esté activa. Un
      // escalón cada vez, y nunca salta de sección: deslizar dentro
      // de una factura la cierra, no te manda a Open.
      //
      // En la raíz de cualquiera de las tres devuelve false: Orders es
      // una pestaña, no un sitio del que se vuelva.
      atras(host, hacerlo) {
        if (_sec === 'sent') {
          const m = H();
          if (!m || !m.enDetalle || !m.enDetalle()) return false;
          if (hacerlo) { m.cerrarDetalle(host.querySelector('#moCuerpo')); repintar(); }
          return true;
        }
        if (_sec === 'inv') {
          const m = I();
          if (!m || !m.enDetalle || !m.enDetalle()) return false;
          if (hacerlo) { m.cerrarDetalle(host.querySelector('#moCuerpo')); repintar(); }
          return true;
        }
        if (!_vendor) return false;
        if (hacerlo) {
          // Un borrador vuelve a Quick order. Lo demás: de la revisión
          // se vuelve a las líneas, no al resumen — saltarse el
          // intermedio hace perder el sitio.
          if (_revisar && _deBorrador) {
            salirRevision(); _vendor = null; volverAQuick(); return true;
          }
          if (_revisar) salirRevision(); else _vendor = null;
          pintar(host);
        }
        return true;
      },
      // Al volver se arranca siempre en el resumen: entrar a Órdenes y
      // caer dentro del proveedor que miraste ayer es desorientador.
      //
      // Salvo que alguien haya pedido uno concreto —la tarjeta del
      // Home—. Esa petición se consume aquí y se borra: vale para esta
      // entrada y ninguna más.
      show(host) {
        // Un borrador de Quick order manda sobre todo lo demás: es el
        // único caso en que se entra a Orders DIRECTO a la revisión,
        // porque el camino empezó en otra pantalla.
        if (montarBorrador()) { pintar(host); return; }

        // Entrar por la pestaña arranca siempre en Open. Las otras dos
        // son sitios a los que se va a propósito, no donde caer.
        //
        // Salvo que el Home haya pedido un proveedor concreto: eso es
        // una petición explícita y manda.
        _sec = _secPedida || 'open';
        _secPedida = null;
        // La lista se vuelve a leer al entrar: otro manager pudo añadir
        // algo. Si cambia la cifra, la pestaña aparece (o se va) sola.
        if (TB() && TB().cargar) TB().cargar();
        if (H() && H().reiniciar) H().reiniciar();
        if (I() && I().reiniciar) I().reiniciar();
        _vendor = _pedida || null;
        _pedida = null;
        // Nunca se entra directo a la revisión: es el último paso de un
        // camino, no un sitio al que llegar. Si se quedara puesta, al
        // volver a Órdenes aparecería una pantalla de confirmar un
        // pedido que no acabas de repasar.
        salirRevision();
        pintar(host);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
