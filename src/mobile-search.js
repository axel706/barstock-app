(() => {
  if (window.BarStockMobileSearch) return;

  // ── Buscar un producto desde el teléfono ─────────────────────────────
  //
  // El caso real: Axel no está en el restaurante, le escriben "no hay St
  // Germain", y necesita contestar en diez segundos. Hoy eso son cuatro
  // toques y una tabla de ocho columnas pensada para una pantalla de 27
  // pulgadas.
  //
  // Dos niveles a propósito:
  //
  //   LISTA   la respuesta corta — cuánto hay, dónde, y ya. La mayoría
  //           de las veces no hace falta abrir nada.
  //   FICHA   al tocar uno: para cuántos días alcanza, el par, cuándo
  //           se pidió. Lo que hace falta para DECIDIR, no sólo para
  //           contestar.
  //
  // ── Los que están en cero también salen ──────────────────────────────
  //
  // "No aparece en la búsqueda" y "no hay existencias" son dos
  // respuestas distintas, y si el producto en cero se escondiera se
  // verían igual. El que no tiene sale, en rojo, diciéndolo.
  //
  // ── Y los escondidos también ─────────────────────────────────────────
  //
  // La regla de esconder lo que no se mueve vale para la lista de
  // inventario, no para una búsqueda: buscar algo por su nombre es la
  // prueba de que lo quieres ver.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const n2 = (x) => String(Math.round((Number(x) || 0) * 100) / 100);

  // Cuatro semanas es el listón que ya usa Pour-IQ para dejar de
  // "observar". Por debajo de eso el promedio es una corazonada, y
  // "te alcanza para 6 días" calculado sobre una corazonada es
  // justamente el tipo de dato que se cree y no se debería.
  const SEMANAS_PARA_FIAR = 4;

  let _q = '';
  // Qué ficha está abierta, para poder repintarla sin cerrarla.
  let _ficha = -1;

  function master() { return (window.state && window.state.master) || []; }

  // La cabecera del producto y el color de su estado viven en
  // `src/product-hero.js`, porque los comparte con la hoja de
  // Inventory. Aqui solo se piden.
  //
  // Con respaldo, y no por elegancia: `tono()` lo llama CADA fila de
  // la lista. Sin el, un fallo al cargar ese archivo no dejaria la
  // ficha sin adorno — tiraria la pantalla de busqueda entera, que es
  // de las mas usadas. El respaldo era el mismo criterio copiado, y se
  // separo del de la lista de Inventory: ahora es gris y sin aviso. Sin
  // el modulo, mejor sin color que con una tercera regla.
  const HERO = () => window.BarStockProductHero;

  // La hoja abierta, si hay. Vive en <body> como las demas hojas de la
  // app, no dentro de la pantalla: asi el teclado y el scroll de los
  // resultados no la arrastran.
  function cerrarHoja() {
    const h = document.getElementById('mSheet');
    if (h) h.remove();
    _ficha = -1;
  }
  const hojaAbierta = () => !!document.getElementById('mSheet');

  function tono(r) {
    const H = HERO();
    if (H && H.tono) return H.tono(r);
    return { c: '#94a3b8', t: Number(r.onHand) > 0 ? '' : 'out of stock' };
  }

  // La cabecera entera. Sin el modulo, los datos en texto: feo, pero
  // la ficha sigue diciendo que producto es y cuanto hay.
  function cabecera(r, par, aviso) {
    const H = HERO();
    // `hueco` abre la ranura de la derecha, donde va la grafica de las
    // semanas. La llena `pintarSemanas` cuando llegue la consulta.
    // Sin `aviso`: lo decide product-hero, que sabe si hay LIVE y si
    // Toast lo vende ("Out Fri" en vez de los días de Pour·IQ).
    if (H && H.html) return H.html(r, { par, hueco: true });
    const k = tono(r);
    return `<div class="m-fic m-fic-bien"><div class="m-fic-d">
      <div class="m-fic-n">${esc(r.item)}</div>
      <div class="m-fic-big"><b style="color:${k.c}">${n2(r.onHand)}</b>
      <span>${Number(r.suggested) > 0 ? 'of ' + n2(r.suggested) : 'on hand'}</span></div>
      ${aviso ? `<div class="m-fic-av" style="color:${k.c}">${esc(aviso)}</div>` : ''}
      </div></div>`;
  }

  function parDe(r) {
    const m = window.parAdjustments;
    if (!m || !m.size) return null;
    return m.get(r.item + '||' + (r.code || '')) || null;
  }

  function norm(s) {
    return typeof window.normalizeName === 'function'
      ? window.normalizeName(s || '')
      : String(s || '').trim().toLowerCase();
  }

  function buscar(q) {
    const t = norm(q);
    if (t.length < 2) return [];
    return master()
      .filter(r => norm(r.item).includes(t) || norm(r.code).includes(t))
      .sort((a, b) => {
        // Primero los que empiezan por lo que escribiste: con "cas",
        // Casamigos antes que "Delicias del Cascabel".
        const ea = norm(a.item).startsWith(t) ? 0 : 1;
        const eb = norm(b.item).startsWith(t) ? 0 : 1;
        if (ea !== eb) return ea - eb;
        return String(a.item).localeCompare(String(b.item));
      })
      .slice(0, 40);
  }

  // ── El color del numero es la respuesta rapida ───────────────────────

  // ── Lista ────────────────────────────────────────────────────────────

  function pintarLista(host) {
    const caja = host.querySelector('#msList');
    const cnt = host.querySelector('#msCount');
    if (!caja) return;

    if (norm(_q).length < 2) {
      caja.innerHTML = '<div class="m-empty">Type at least two letters.</div>';
      if (cnt) cnt.textContent = '';
      return;
    }

    const res = buscar(_q);
    if (cnt) cnt.textContent = res.length ? res.length + ' match' + (res.length === 1 ? '' : 'es') : '';

    if (!res.length) {
      caja.innerHTML = `
        <div class="m-nada">
          <span class="m-nada-i"><i class="ti ti-search-off" aria-hidden="true"></i></span>
          <b>Nothing called “${esc(_q)}”</b>
          <small>If it is on the shelf, it is not in the inventory yet.</small>
        </div>`;
      return;
    }

    // ── Cada resultado es la tarjeta de la ficha ─────────────────────
    //
    // Eran filas de texto. Axel pidió la MISMA tarjeta que abre la ficha
    // —botella, cifra con su color, "Runs out in…"—. Llevaba las ZONAS en
    // el hueco de la derecha hasta el LIVE (Axel, 2026-11-11): con
    // "≈1.4" en grande, "1 Bar · 1 Closet" suma 2, lo contado, y la
    // tarjeta se contradecía. Las zonas salen sólo en la ficha, con la
    // fecha del conteo debajo. La gráfica de semanas también se queda en
    // la ficha: es una consulta por producto, y en una lista serían
    // decenas.
    //
    // `m-res` sigue en el envoltorio porque es lo que se toca para abrir
    // la ficha, igual que con la fila.
    const H = HERO();
    caja.innerHTML = res.map((r, i) => {
      const mi = master().indexOf(r);
      if (H && H.html) {
        return `<div class="m-res m-res-fic" data-i="${mi}" role="button" tabindex="0">
          ${H.html(r, { par: parDe(r) })}</div>`;
      }
      // Sin el módulo, la fila de antes: fea, pero dice qué hay.
      const k = tono(r);
      return `
        <button type="button" class="m-card m-res" data-i="${mi}">
          <span class="m-res-l">
            <span class="m-res-n">${esc(r.item)}</span>
            <span class="m-res-s">${esc(r.vendor || '')}</span>
          </span>
          <span class="m-res-r">
            <b style="color:${k.c}">${n2(r.onHand)}</b>
            <small>${esc(k.t)}</small>
          </span>
          <i class="ti ti-chevron-right m-chev" aria-hidden="true"></i>
        </button>`;
    }).join('');

    caja.querySelectorAll('.m-res').forEach(b => {
      b.onclick = () => ficha(host, Number(b.dataset.i));
    });
  }

  // ── Dónde están ──────────────────────────────────────────────────────
  //
  // Sólo si las zonas están encendidas. Con la función apagada no se
  // dice nada: "Zones are off, turn them on in Settings" es un ajuste
  // metido en una ficha de producto, y en el teléfono estorba más de
  // lo que informa.

  // ── De qué factura vino este precio ──────────────────────────────────
  //
  // Después de que una factura actualice un precio, la ficha pone
  // $28.50 y no hay forma de saber si eso se tecleó en marzo o llegó
  // el martes. Esta línea lo dice, y de paso cuánto se movió.

  async function pintarOrigenPrecio(caja, item) {
    const el = caja.querySelector('#msPrecio');
    const P = window.BarStockMarginEdgePurchases;
    if (!el || !P || !P.leerHistorial) return;

    let h = null;
    try {
      const todo = await P.leerHistorial(200);
      h = todo.find(x => x.item_name === item) || null;
    } catch (e) { return; }
    if (!h) return;

    const p = P._pct ? P._pct(h.price_before, h.price_after) : null;
    // Subir un coste es malo y bajarlo es bueno: el color va con lo
    // que significa, no con el signo.
    const col = p === null ? '' : p > 0 ? '#fca5a5' : '#6ee7b7';
    const sig = p === null ? '' : (p > 0 ? '+' : '') + p + '%';

    el.innerHTML = '<div class="m-fuente">' +
      'from invoice ' + esc(h.invoice_number || '—') +
      (h.invoice_date ? ' · ' + esc(h.invoice_date) : '') +
      (sig ? ' · <b style="color:' + col + '">' + esc(sig) + '</b> vs ' +
             '$' + Number(h.price_before).toFixed(2) : '') +
      '</div>';
  }

  async function pintarZonas(caja, item) {
    const el = caja.querySelector('#msZonas');
    const Z = window.BarStockZones;
    if (!el || !Z) return;

    try { if (!Z.lista().length) await Z.cargar(); } catch (e) {}
    if (!Z.activas || !Z.activas()) return;

    el.innerHTML = '<div class="m-zon"><span class="m-zon-k">Where it is</span>' +
                   '<span class="m-zon-wait">Looking…</span></div>';
    let d = null;
    try { d = await Z.donde(item); } catch (e) {}

    // ── Y CUANDO se contó ────────────────────────────────────────────
    //
    // El panel de escritorio siempre lo ha dicho. El teléfono pinta su
    // propio bloque —la hoja no es el panel lateral— y al escribirlo se
    // dejó fuera la fecha. No es adorno: "1 en el closet" de un conteo
    // de hace cinco días manda a alguien a buscar algo que ya se acabó.
    //
    // El cálculo se pide a Zones en vez de repetirlo aquí, así que de
    // paso el móvil hereda el ámbar a los siete días.
    const c = (Z.cuando && d && d.at) ? Z.cuando(d.at) : null;

    // ── Lo que llegó desde el conteo (Axel, 2026-11-11, opción A) ────
    //
    // Las zonas son lo que se CONTÓ; lo que llegó después por pedido
    // está en el bar, pero nadie dijo en qué zona. Va como una pieza más,
    // punteada y en verde para que no se lea como una zona, y de dónde
    // vino junto a la fecha del conteo. Sale de live-cache, el mismo
    // número que suma el LIVE de la cabecera.
    const LC = window.BarStockLiveCache;
    const r = master().find(x => x && x.item === item);
    const ll = LC && r ? LC.llegadas(r) : null;
    const pieza = ll ? `<span class="m-zon-t lleg"><b>+${n2(ll.n)}</b>Arrived</span>` : '';

    if (!d || !d.zonas || !d.zonas.length) {
      // Hay zonas puestas pero este producto no se ha repartido. No es
      // lo mismo que no tener zonas, y se dice.
      el.innerHTML = '<div class="m-zon"><span class="m-zon-k">Where it is</span>' +
                     '<span class="m-zon-wait">Not counted by zone yet</span>' +
                     (ll ? '<div class="m-zon-s">' + pieza + '</div>' +
                       '<span class="m-zon-when">' + esc(ll.txt.charAt(0).toUpperCase() + ll.txt.slice(1)) + '</span>' : '') +
                     '</div>';
      return;
    }

    const cuando = c && c.txt
      ? '<span class="m-zon-when' + (c.viejo ? ' viejo' : '') + '">' + esc(c.txt) + (ll ? ' · ' + esc(ll.txt) : '') + '</span>'
      : ll ? '<span class="m-zon-when">' + esc(ll.txt.charAt(0).toUpperCase() + ll.txt.slice(1)) + '</span>' : '';

    el.innerHTML =
      '<div class="m-zon"><span class="m-zon-k">Where it is</span>' +
      '<div class="m-zon-s">' +
        d.zonas.map(z => `
          <span class="m-zon-t${Number(z.botellas) > 0 ? '' : ' cero'}">
            <b>${n2(z.botellas)}</b>${esc(z.zona)}
          </span>`).join('') + pieza +
      '</div>' + cuando + '</div>';
  }

  // ── Lo vendido en Toast (Axel, 2026-11-12, opción A) ────────────────
  //
  // Los siete días cerrados hasta ayer, en botellas, con una raya en lo
  // de un día normal; y debajo, lo vendido desde el conteo y ayer contra
  // lo normal de ese día. SÓLO BOTELLAS: Axel quitó el dinero de la
  // ficha, porque un cóctel no se puede repartir entre sus botellas (ni
  // entre los mixers, la menta o el lime juice que no se cuentan), y un
  // "$10" de Tito's escondería todo lo que se fue en martinis.
  //
  // Cada número sale de donde ya existe, para no tener dos:
  //   · las botellas por día, de toast-sales (la lectura de la tarjeta
  //     del Home y del LIVE);
  //   · "un día normal", de las medianas con que run-out calcula cuándo
  //     se acaba (live-cache.medianas);
  //   · "since the count", de lo vendido que resta el LIVE.
  // Las barras usan el estilo de la tarjeta del Home (.m-ts-g).
  //
  // Lo que Toast no vende (la cerveza) y no tiene ventas esa semana no
  // lleva el bloque: siete barras a cero dirían "no se vendió" de algo
  // que Toast no sabe vender.
  function pintarVentasFicha(caja, r) {
    const el = caja && caja.querySelector('#msVentas');
    const TS = window.BarStockToastSales, LC = window.BarStockLiveCache;
    if (!el || !TS || !r) return;
    TS.ahora().then(V => {
      // La ficha pudo cambiar mientras se leía: no pintar la de otro.
      if (!el.isConnected || !V || !V.cargados) { if (el.isConnected) el.innerHTML = ''; return; }
      const sem = TS.semanaDe(V.base, r.item);
      const med = LC && LC.medianas ? LC.medianas(r) : null;
      const vende = !!(LC && LC.toastLoVende(r));
      if (!vende && !sem.some(x => x.botellas > 0)) { el.innerHTML = ''; return; }
      const normal = (x) => med && x.cargado ? med[x.semana] : null;
      const tope = Math.max(1e-9, ...sem.map(x => Math.max(x.botellas, normal(x) || 0)));
      const pct = (n) => Math.max(0, Math.min(100, n / tope * 100)).toFixed(1) + '%';
      const b1 = (n) => String(Math.round((Number(n) || 0) * 10) / 10);
      const ayer = sem[sem.length - 1];
      const v = LC ? LC.vivo(r) : null;
      // Desde el conteo: lo vendido del LIVE. Sin LIVE (conteo activo,
      // o nada vendido desde el conteo) se dice sólo lo de ayer.
      const desde = v ? 'Since the count <b>' + b1(v.vendido) + ' btl</b> · ' : '';
      const n = normal(ayer);
      el.innerHTML = `
        <div class="m-vt">
          <div class="m-vt-k">Sold in Toast <span>last 7 days</span></div>
          <div class="m-ts-g">
            ${sem.map((x, k) => `
              <div class="m-ts-b${k === sem.length - 1 ? ' on' : ''}" aria-label="${x.dia}: ${b1(x.botellas)} bottles">
                <i style="height:${pct(x.botellas)}"></i>
                ${normal(x) !== null ? `<u style="bottom:${pct(normal(x))}"></u>` : ''}
              </div>`).join('')}
          </div>
          <div class="m-ts-d">${sem.map((x, k) => `<span class="${k === sem.length - 1 ? 'on' : ''}">${x.dia}</span>`).join('')}</div>
          <div class="m-vt-s">${desde}yesterday <b>${b1(ayer.botellas)}</b>${n !== null
            ? ' <span>(usual ' + ayer.dia + ' ' + b1(n) + ')</span>' : ''}</div>
        </div>`;
    }).catch(e => { console.warn('[ficha] Toast Sales', e); });
  }

  // ── Las últimas semanas ──────────────────────────────────────────────
  //
  // Lo más rico que tenía el escritorio y no tenía el teléfono, y es
  // justo lo que una pantalla pequeña hace bien: de un vistazo dice si
  // este producto se mueve más o menos que de costumbre.
  //
  // Se pinta DESPUÉS, como las zonas: la hoja ya está arriba con todo
  // lo demás y no se queda esperando a una consulta.
  //
  // Va en el hueco de la cabecera, a la derecha del nombre. Empezó
  // siendo una tarjeta propia debajo de las zonas, y ahí se comía 110px
  // de una hoja que ya llegaba demasiado arriba mientras media cabecera
  // estaba en blanco. Los seis números bajo las barras se quedaron en
  // el camino: a este tamaño nadie lee "13.2" parado frente al estante,
  // lo que se lee es la forma.
  //
  // Sin historia no se pinta nada. En el escritorio el hueco se queda
  // con un "No weekly history yet" porque ahí el panel tiene una
  // rejilla fija y un vacío movería todo lo de abajo; aquí el hueco es
  // aire al lado de un nombre, y aire no se nota.

  const SEMANAS_GRAFICA = 6;

  async function pintarSemanas(caja, item) {
    const el = caja.querySelector('.m-fic-g');
    const W = window.BarStockProductWeeks;
    if (!el || !W) return;

    let s = [];
    try { s = await W.semanas(item, SEMANAS_GRAFICA); } catch (e) { return; }
    if (!s.length) return;

    const tope = Math.max(...s.map(x => Number(x.usado) || 0), 1);
    const r = W.rumbo(s);

    // El pie es la leyenda de lo que ya se está mirando: cuántas
    // semanas son y hacia dónde van. Sin él las barras son un dibujo
    // bonito del que no se sabe la escala ni el periodo.
    const pie = s.length + ' wks' + (r && r.d !== 0
      ? ' · <b style="color:' + (r.d > 0 ? '#86efac' : '#fca5a5') + '">' +
        (r.d > 0 ? '↑' : '↓') + Math.abs(r.d) + '</b>'
      : '');

    el.innerHTML =
      '<div class="m-fic-gb">' +
        s.map((x, i) => '<i style="height:' +
          Math.max(8, Math.round((Number(x.usado) || 0) / tope * 100)) + '%"' +
          (i === s.length - 1 ? ' class="hoy"' : '') + '></i>').join('') +
      '</div>' +
      '<div class="m-fic-gp">' + pie + '</div>';
  }

  // ── Pour·IQ, con su botón ────────────────────────────────────────────
  //
  // El teléfono ya decía "Pour·IQ says 3" y ahí se quedaba: te daba la
  // respuesta y te mandaba a la computadora a ejecutarla. Una
  // afordancia al revés.
  //
  // Tres estados, los mismos que el escritorio, porque los tres son
  // distintos y callarse uno confunde:
  //   · todavía mirando  → lo dice, y cuántas semanas le faltan
  //   · ya coincide      → no aparece nada; no hay nada que decir
  //   · hay salto        → el botón, topado a ±2 por paso
  function bloqueIQ(r, par) {
    const W = window.BarStockProductWeeks;
    if (!W) return '';
    const opt = par && par.suggestedOptimal != null ? Number(par.suggestedOptimal) : null;
    const sem = par && par.normalWeeks ? par.normalWeeks : 0;

    if (opt === null) {
      return sem
        ? '<div class="m-iqb mirando">Pour·IQ is still watching · ' +
          sem + ' of ' + SEMANAS_PARA_FIAR + ' weeks</div>'
        : '';
    }
    const destino = W.paso(Number(r.suggested), opt);
    if (destino === null) return '';

    // Si el tope recorta el salto, se dice: un botón que pone 3 cuando
    // arriba se lee "says 6" parece que se equivocó.
    const recortado = destino !== opt;
    return '<div class="m-iqb">' +
      '<div class="m-iqb-t">Pour·IQ says the par should be ' + opt +
        (recortado ? ' · max ' + W.TOPE + ' per step' : '') + '</div>' +
      '<button type="button" class="m-iqb-b" id="msIQ" data-to="' + destino + '">' +
        'Apply → ' + destino + '</button>' +
    '</div>';
  }

  // ── Ficha ────────────────────────────────────────────────────────────

  function ficha(host, idx) {
    const r = master()[idx];
    if (!r) return;
    const par = parDe(r);
    const k = tono(r);

    const avg = par && par.avgUsed != null ? Number(par.avgUsed) : null;
    const semanas = par && par.normalWeeks ? par.normalWeeks : 0;

    // "Te alcanza para X dias" solo cuando el promedio se sostiene.
    // Con dos semanas de historia ese numero es una corazonada con
    // aspecto de dato, y es de los que se creen.
    const fiable = avg !== null && avg > 0 && semanas >= SEMANAS_PARA_FIAR;
    const H = HERO();
    const dias = !fiable ? null
      : H && H.diasQueAguanta ? H.diasQueAguanta(r, par)
      : Math.round((Number(r.onHand) || 0) / avg * 7);
    // Toast lo vende: "cuánto dura" lo dice "Out Fri" en la cabecera, y
    // "Lasts about · needs 4 weeks" de Pour·IQ sería la otra respuesta.
    const LC = window.BarStockLiveCache;
    const vende = !!(LC && LC.toastLoVende(r));

    // "1 days" era un fallo que llevaba ahi desde el principio.
    const cuantos = (n, u) => n + ' ' + u + (n === 1 ? '' : 's');

    // La tarjeta se tiñe segun como este el producto: lo primero que
    // se ve desde lejos es el color, no el numero.
    const par18 = n2(r.suggested);
    // El aviso lo escribe product-hero, con el mismo corte que el color.
    // Éste es sólo para la cabecera de respaldo, sin el módulo.
    const aviso = H && H.aviso ? H.aviso(r, dias)
      : Number(r.onHand) <= 0 ? 'Out of stock'
      : dias !== null ? 'Runs out in ' + cuantos(dias, 'day') : '';

    // ── Una HOJA, no una pantalla ───────────────────────────────────
    //
    // Esto reemplazaba la lista de resultados y se salia con un
    // chevron propio. Dos problemas: la app ya tiene una vuelta atras
    // —la del armazon— y poner otra al lado confunde cual es cual; y
    // al volver perdias de vista los resultados, que es justo lo que
    // estabas mirando.
    //
    // Ahora sube desde abajo, igual que la hoja de producto de
    // Inventory, y los resultados se quedan detras. Mirar una botella
    // y volver a la lista deja de ser navegar.
    cerrarHoja();
    // DESPUÉS de cerrarHoja(), que lo pone a -1. Se apuntaba antes y la
    // hoja abierta quedaba siempre en -1: refrescar() repintaba la lista
    // en vez de la ficha, y el LIVE que llegaba no la encontraba.
    _ficha = idx;
    const h = document.createElement('div');
    h.className = 'm-sheet';
    // El id no es decoracion: las reglas de esta hoja se apoyan en el
    // para ganarle en especificidad al radio de app.css.
    h.id = 'mSheet';
    const caja = document.createElement('div');
    caja.className = 'm-sheet-box m-ficha';
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-label', 'Product');
    const fondo = document.createElement('div');
    fondo.className = 'm-sheet-bg';
    h.appendChild(fondo); h.appendChild(caja);
    document.body.appendChild(h);
    // El asa de arriba dice "arrastrame para cerrar". Que lo diga
    // de verdad, y que el fondo no se mueva mientras tanto.
    if (window.BarStockSheet) window.BarStockSheet.enganchar(h, () => cerrarHoja());
    fondo.onclick = () => cerrarHoja();

    caja.innerHTML = `
      <div class="m-sheet-grip"></div>

      <!-- La MISMA cabecera que usa la hoja de Inventory. Es un solo
           sitio a proposito: dos copias acaban diciendo cosas
           distintas el dia que una se toque. -->
      ${cabecera(r, par, aviso)}

      <div id="msZonas"></div>
      <div id="msVentas"></div>

      <div class="m-card m-rows">
        <div class="m-row">
          <span><i class="ti ti-trending-up" aria-hidden="true"></i> Uses per week</span>
          <b>${avg !== null ? avg : '—'}</b></div>
        <!-- El par, a secas. Lo que Pour·IQ opina ya no cabe de refilon
             en este renglon: tiene su propio bloque y su boton, debajo.
             Decirlo en los dos sitios era decirlo dos veces. -->
        <div class="m-row">
          <span><i class="ti ti-brain" aria-hidden="true"></i> Par</span>
          <b>${par18}</b></div>
        <div class="m-row m-row-end">
          <span><i class="ti ti-tag" aria-hidden="true"></i> Unit price</span>
          <b>${Number(r.value) > 0 ? '$' + Number(r.value).toFixed(2) : '—'}</b></div>
        <!-- De dónde salió ese precio. Se rellena después, leyendo el
             registro: un precio que cambia solo tiene que poder decir
             de qué factura vino. Si nunca vino de una, no pone nada,
             que también es información. -->
        <div id="msPrecio"></div>
        ${dias === null && !vende ? `<div class="m-row m-row-end">
          <span><i class="ti ti-hourglass" aria-hidden="true"></i> Lasts about</span>
          <b><span class="m-soft">needs ${SEMANAS_PARA_FIAR} weeks · has ${semanas}</span></b></div>` : ''}
      </div>

      ${bloqueIQ(r, par)}

      <div class="m-acts">
        <button type="button" class="m-act" id="msAdd"><i class="ti ti-plus" aria-hidden="true"></i> Add to order</button>
        <button type="button" class="m-act" id="msRecv"><i class="ti ti-truck-delivery" aria-hidden="true"></i> Received</button>
      </div>`;


    // ── Aplicar el par ───────────────────────────────────────────────
    //
    // Se desactiva mientras escribe y sólo se repinta si el PATCH
    // devolvio bien. Un par que no se guardo y dice que si es peor que
    // un error en pantalla: la siguiente orden sale con el numero
    // viejo y nadie se entera.
    const iq = caja.querySelector('#msIQ');
    if (iq) iq.onclick = async () => {
      const destino = Number(iq.dataset.to);
      iq.disabled = true;
      iq.textContent = 'Saving…';
      try {
        await window.BarStockProductWeeks.aplicarPar(r, destino);
        if (window.BarStockToast) window.BarStockToast.show('Par set to ' + destino);
        if (typeof window.render === 'function') window.render();
        ficha(host, idx);
      } catch (e) {
        console.warn('[ficha] no se pudo aplicar el par', e);
        iq.disabled = false;
        iq.textContent = 'Could not save · retry';
      }
    };

    const add = caja.querySelector('#msAdd');
    if (add) add.onclick = () => {
      // Con el proveedor del propio producto: sin el, el dialogo mira
      // la pestaña del escritorio y se cierra sin abrir nada.
      if (!window.BarStockAddToOrder) return;
      if (!window.BarStockAddToOrder.open(r.vendor)) {
        const D = window.BarStockDialog;
        const t = 'This vendor does not take manual order lines.';
        if (D && D.avisar) {
          D.avisar({ titulo: t,
            cuerpo: (r.vendor || 'This vendor') + ' orders are built from the ' +
                    'cycle. Change the quantity from Orders instead.' });
        } else window.alert(t);
      }
    };
    const recv = caja.querySelector('#msRecv');
    if (recv) recv.onclick = () => {
      if (window.BarStockStockIn) window.BarStockStockIn.open(r, () => ficha(host, idx));
    };

    pintarZonas(caja, r.item);
    pintarVentasFicha(caja, r);
    pintarOrigenPrecio(caja, r.item);
    pintarSemanas(caja, r.item);
  }



  // ── La pantalla ──────────────────────────────────────────────────────

  function mount(host) {
    host.innerHTML = `
      <!-- Sin encabezado propio: el logo lo pinta el armazón, fijo y en
           todas las pantallas. Dos logos era uno de más. -->
      <div class="m-searchbar on">
        <i class="ti ti-search" aria-hidden="true"></i>
        <input id="msInput" type="search" inputmode="search" autocomplete="off"
               placeholder="Do we have…" aria-label="Search products">
        <button type="button" id="msClear" aria-label="Clear"><i class="ti ti-x" aria-hidden="true"></i></button>
      </div>
      <!-- La lista con su propio scroll, por debajo de la barra: así
           ni el teclado ni el elástico de iOS mueven la barra. Ver
           band-dock.js. -->
      <div id="msScroll">
        <div class="m-cnt" id="msCount"></div>
        <div id="msList"></div>
      </div>
`;

    const inp = host.querySelector('#msInput');
    inp.oninput = () => { _q = inp.value; cerrarHoja(); pintarLista(host); };
    host.querySelector('#msClear').onclick = () => {
      _q = ''; inp.value = ''; cerrarHoja(); pintarLista(host); inp.focus();
    };

    pintarLista(host);
  }

  // Cuando se entra a Buscar sólo para abrir una ficha (abrirItem, desde
  // Top movers), nadie va a escribir. Sin esto, show() ponía el foco en
  // el buscador, la ficha se abría encima y el teclado del buscador de
  // detrás se quedaba abierto tapando media ficha. Es de una sola vez: la
  // siguiente entrada normal vuelve a dar el teclado.
  let _sinTeclado = false;

  // La barra se queda arriba y los resultados pasan por debajo, con el
  // desenfoque empezando bajo ella: el mismo header del Home (Axel,
  // 2026-11-09, "es el mismo concepto"). Aquí la barra es el <input> de
  // verdad, así que va `fija` con la lista en su propio scroll, y no con
  // copia; ver band-dock.js.
  function fijarBarra(host) {
    const D = window.BarStockBandDock;
    const b = host.querySelector('.m-searchbar');
    const sc = host.querySelector('#msScroll');
    if (D && b) D.enganchar({ pantalla: host, barra: b, fija: true, scroll: sc });
  }

  function show(host) {
    cerrarHoja();
    // El LIVE lo lee live-cache una vez para toda la app; si nadie lo
    // pidió aún (se entró directo aquí, sin pasar por Inventory), se pide
    // ahora y alLive() repinta al llegar.
    if (window.BarStockLiveCache) window.BarStockLiveCache.cargar();
    pintarLista(host);
    fijarBarra(host);
    if (_sinTeclado) { _sinTeclado = false; return; }

    // ── El foco va SIN setTimeout ──────────────────────────────────
    //
    // iOS sólo abre el teclado si el focus() ocurre dentro del gesto
    // que lo pidió. Con un setTimeout de 60ms el gesto ya terminó, así
    // que el teclado no salía: el primer toque entraba en Buscar sin
    // teclado y hacía falta un segundo toque sobre el campo.
    //
    // Esto funciona porque `ir()` es síncrono de principio a fin —monta
    // la pantalla y llama a show() dentro del mismo click—, así que
    // aquí seguimos dentro del gesto.
    const inp = host.querySelector('#msInput');
    if (inp) { try { inp.focus(); } catch (e) {} }
  }

  // Lo llama el Home al tocar un producto de Top movers: se entra a
  // Buscar y se abre su ficha directamente, sin teclear.
  function abrirItem(nombre) {
    if (!window.BarStockMobile) return;
    _sinTeclado = true;
    window.BarStockMobile.ir('search');
    // Por si ir() no llegó a llamar a show() (la pantalla no se pudo
    // mostrar): que el aviso no se quede para la próxima vez.
    _sinTeclado = false;
    const host = document.querySelector('.m-screen[data-screen="search"]');
    if (!host) return;
    const i = master().findIndex(r => r.item === nombre);
    if (i >= 0) ficha(host, i);
  }

  // ── Cuando llega el LIVE (o se relee por una factura) ──────────────
  //
  // Se repintan los resultados y, con una ficha abierta, sólo su
  // cabecera y "Where it is": rehacer la hoja entera la cerraría y
  // abriría delante de quien la está leyendo. La gráfica de semanas del
  // hueco se conserva tal cual; volver a pedirla sería otra consulta.
  function alLive() {
    const host = document.querySelector('.m-screen[data-screen="search"]');
    if (!host || !host.classList.contains('on')) return;
    pintarLista(host);
    const caja = document.querySelector('#mSheet .m-ficha');
    const r = hojaAbierta() && _ficha >= 0 ? master()[_ficha] : null;
    const viejo = caja && caja.querySelector('.m-fic');
    if (!r || !viejo) return;
    const t = document.createElement('div');
    t.innerHTML = cabecera(r, parDe(r));
    const nuevo = t.querySelector('.m-fic');
    if (!nuevo) return;
    const g = viejo.querySelector('.m-fic-g'), ng = nuevo.querySelector('.m-fic-g');
    if (g && ng) ng.replaceWith(g);
    viejo.replaceWith(nuevo);
    pintarZonas(caja, r.item);
    // "Since the count" sale de lo vendido del LIVE, que acaba de llegar.
    pintarVentasFicha(caja, r);
  }
  if (window.BarStockLiveCache) window.BarStockLiveCache.alCambiar(alLive);

  window.BarStockMobileSearch = { mount, show, abrirItem };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      // Sin pestaña propia: su sitio lo ocupa el ciclo. Buscar no se
      // pierde — es lo primero del Home, grande y fijo, que es desde
      // donde se entra de verdad. Una pestaña para algo que ya tiene un
      // campo enorme dos dedos más arriba era un hueco desperdiciado en
      // la única barra que no se puede hacer más larga.
      id: 'search', icon: 'ti-search', label: 'Search', tab: false, orden: 20,
      mount, show,
      // Sin tocar dónde estás: en la lista repinta la lista, y con una
      // ficha abierta repinta ESA ficha. show() te sacaría de ella.
      refrescar(host) {
        if (hojaAbierta() && _ficha >= 0) ficha(host, _ficha);
        else pintarLista(host);
      },
      // Con la hoja abierta, atras la cierra. En la lista no hay vuelta
      // atras: los resultados son el sitio, no un paso.
      atras(host, hacerlo) {
        if (!hojaAbierta()) return false;
        if (hacerlo) cerrarHoja();
        return true;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
