(() => {
  if (window.BarStockMobileHome) return;

  // ── Home del teléfono ────────────────────────────────────────────────
  //
  //   banda        logo centrado, modo claro/oscuro y ajustes
  //   fecha        el día y la locación, que juntos dicen dónde y cuándo
  //   buscar       siempre en el mismo sitio, nunca se mueve
  //   carrusel     lo de ahora mismo, una tarjeta por asunto
  //   top movers   qué se mueve más
  //   despegó/se apagó   qué CAMBIÓ respecto a su propia historia
  //   dinero       gastado esta semana y lo que hay en el estante
  //
  // ── No calcula nada nuevo ────────────────────────────────────────────
  //
  // Todos estos números salen de módulos que ya existen: el gasto de
  // BarStockSpend, el valor del estante de BarStockInventoryValue, el
  // consumo de parAdjustments. Volver a sumarlos aquí sería permitir que
  // dos pantallas dieran cifras distintas del mismo dinero, que es el
  // fallo que más veces ha mordido a este proyecto.
  //
  // ── Y nada dice cero mientras no se sabe ─────────────────────────────
  //
  // Cada hueco arranca en "…" y se rellena cuando su dato llega. Ya nos
  // costó caro tres veces: un historial que no cargaba se leía como
  // "esta es tu primera semana", y así estuvo diecisiete semanas.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const n1 = (n) => String(Math.round((Number(n) || 0) * 10) / 10);

  // Cuatro semanas es el mismo listón que usa Pour-IQ para dejar de
  // "observar". Por debajo, el promedio ponderado y el plano son casi el
  // mismo número y decir que algo "cambió" no significaría nada.
  const SEMANAS_MIN = 4;

  function cfgNombre() {
    return (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '';
  }

  function hoy() {
    return new Date().toLocaleDateString('en-US', { weekday: 'long' });
  }

  // ── El saludo ────────────────────────────────────────────────────────
  //
  // El nombre sale del perfil de remitente de Ajustes, que es el único
  // sitio donde esta app sabe cómo se llama quien la usa. Vive en la
  // nube, así que se pide una vez y se guarda: el Home se repinta
  // muchas veces y no va a consultar la base de datos en cada una.
  //
  // Mientras no se sabe —o si no hay nombre puesto— se enseña el día
  // de la semana, que es lo que había. Un "Hello" a secas o un
  // "Hello undefined" es peor que una fecha.
  let _nombre = null;        // null = sin saber; '' = no hay
  let _pidiendoNombre = false;

  function soloNombre(n) {
    return String(n || '').trim().split(/\s+/)[0] || '';
  }

  function cargarNombre() {
    if (_nombre !== null || _pidiendoNombre) return;
    const S = window.BarStockSenderProfile;
    if (!S || !S.getProfile) { _nombre = ''; return; }
    _pidiendoNombre = true;
    Promise.resolve()
      .then(() => S.getProfile())
      .then(p => {
        _nombre = soloNombre(p && p.name);
        if (_nombre) refresh();
      })
      .catch(() => { _nombre = ''; })
      .then(() => { _pidiendoNombre = false; });
  }

  function saludo() {
    cargarNombre();
    return _nombre ? 'Hello, ' + _nombre : hoy();
  }

  function master() { return (window.state && window.state.master) || []; }

  // Lo que SE CONTÓ, que no es lo mismo que lo que hay en el catálogo.
  //
  // La tarjeta del ciclo decía "Counted 265 items" con master().length,
  // y esos 265 son el inventario entero. Un artículo en cero no es un
  // artículo contado en cero: es uno que nadie miró. Contar el catálogo
  // y llamarlo conteo infla el número justo en la cifra que sirve para
  // saber si el conteo quedó completo.
  function contados() {
    let n = 0;
    for (const r of master()) if (Number(r.onHand) > 0) n++;
    return n;
  }

  // ── Las entregas de este ciclo ───────────────────────────────────────
  //
  // Una sola fila para TODAS —"3 deliveries in"— y no una por entrega.
  // La línea de tiempo de la tarjeta tiene tres pasos fijos: se contó,
  // llegó mercancía, esto es lo que queda. Así no crece con la semana:
  // un ciclo con nueve entregas se ve igual de limpio que uno con una.
  //
  // null = todavía no se sabe, y mientras no se sabe la fila NO sale.
  // Un "0 deliveries" falso en una tarjeta que se mira de reojo es peor
  // que una fila de menos; es el mismo fallo de las diecisiete semanas.
  let _entregas = null;        // null = sin saber · false = no hay · {…}
  let _entregasDe = '';        // el resetAt con el que se pidió
  let _pidiendoEntregas = false;

  function cfgSB() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY };
  }

  // 'YYYY-MM-DD' con new Date() se interpreta en UTC, así que en
  // cualquier huso al oeste de Greenwich una factura del 26 se enseña
  // como del 25. Se arma la fecha a mano, en local.
  function fmtDia(ymd) {
    const p = String(ymd || '').slice(0, 10).split('-');
    if (p.length !== 3) return '';
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async function pedirEntregas(desde) {
    const { url, key } = cfgSB();
    if (!url || !key) return false;

    const P = window.BarStockParIntelligence;
    const locId = (P && P.fetchLocationId) ? await P.fetchLocationId() : null;
    if (!locId) return false;

    const dia = String(desde).slice(0, 10);
    const ordenes = new Set();
    let unidades = 0, ultima = '';

    // PostgREST corta en 1000 filas SIN avisar. Una semana de facturas
    // se pasa de ahí en cuanto entra la comida —se guardan todas las
    // líneas, también las de cocina—, y lo que se vería es un número
    // creíble y equivocado. Ya pasó con el catálogo.
    for (let p = 0; p < 20; p++) {
      const r = await fetch(
        `${url}/rest/v1/marginedge_invoice_lines?location_id=eq.${locId}` +
        `&invoice_date=gte.${dia}&select=order_id,quantity,invoice_date` +
        `&order=invoice_date.asc&limit=1000&offset=${p * 1000}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!r.ok) return false;
      const filas = await r.json();
      if (!Array.isArray(filas) || !filas.length) break;
      for (const f of filas) {
        ordenes.add(f.order_id);
        unidades += Number(f.quantity) || 0;
        if (f.invoice_date && f.invoice_date > ultima) ultima = f.invoice_date;
      }
      if (filas.length < 1000) break;
    }

    if (!ordenes.size) return false;
    return { n: ordenes.size, unidades: Math.round(unidades), ultima };
  }

  // Se vuelve a pedir cuando cambia el arranque del ciclo, no cada vez
  // que se pinta el Home: reiniciar la semana es lo único que cambia la
  // respuesta, y el Home se repinta decenas de veces por sesión.
  function cargarEntregas(desde) {
    if (!desde) return;
    if (_entregasDe === desde || _pidiendoEntregas) return;
    _pidiendoEntregas = true;
    _entregasDe = desde;
    Promise.resolve()
      .then(() => pedirEntregas(desde))
      .then(e => { _entregas = e; if (e) refresh(); })
      .catch(() => { _entregas = false; })
      .then(() => { _pidiendoEntregas = false; });
  }

  // Todos los artículos con su ficha de par, que es donde viven el
  // consumo ponderado y el histórico.
  function conPar() {
    const m = window.parAdjustments;
    if (!m || !m.size) return [];
    const out = [];
    for (const r of master()) {
      const p = m.get(r.item + '||' + (r.code || ''));
      if (p && p.status === 'active') out.push({ r, p });
    }
    return out;
  }

  // ── El carrusel ──────────────────────────────────────────────────────
  //
  // Una tarjeta por asunto, no una sola que elige. Antes se quedaba con
  // el proveedor de más dinero y escondía los demás en silencio: un
  // lunes con tres proveedores pendientes sólo veías uno.
  //
  // El orden es por urgencia, y lo que tiene fecha límite va primero.

  // ── El ciclo, siempre la primera ─────────────────────────────────────
  //
  // Antes eran dos tarjetas sueltas —conteo a medias y ciclo demasiado
  // viejo— y sólo aparecían cuando pasaba algo. El resto del tiempo, que
  // es casi siempre, el Home no decía en qué estado estaba la semana.
  //
  // Ahora es UNA tarjeta que está siempre y cambia de color y de texto
  // con el estado. El estado se le pregunta a weekly-cycle, igual que
  // hace la pantalla del ciclo: aquí no se deduce nada.
  function tarjetaCiclo() {
    const W = window.BarStockWeeklyCycle;
    const irAlCiclo = () => { if (window.BarStockMobile) window.BarStockMobile.ir('cycle'); };

    const st = (W && W.estado) ? W.estado() : 'loading';

    // Sin botón mientras no se sabe. Ofrecer una acción antes de saber
    // en qué paso estás es ofrecer la equivocada.
    if (st === 'loading') {
      return { tono: 'calm', k: 'Cycle', tt: '…', sub: 'Checking the cycle',
               amt: '…', vs: '', btn: '' };
    }

    if (st === 'step1') {
      return {
        tono: 'calm', k: 'No cycle yet', tt: 'Start the week',
        sub: 'Sets on hand to zero so the count starts clean',
        amt: '1', vs: 'of 3',
        btn: 'Start new cycle',
        // La misma función del botón del escritorio: en el paso 1 llama
        // a resetOnHand, que pide su propia confirmación.
        go: () => { const w = window.BarStockWeeklyCycle; if (w && w.accion) w.accion(); },
        ico: 'list-details', icot: 'Cycle detail', go3: irAlCiclo
      };
    }

    const fecha = (W && W.resetAt && W.fmtDate && W.resetAt()) ? W.fmtDate(W.resetAt()) : '';

    // Dos salidas de verdad, no un botón que abre un menú que ofrece
    // dos salidas. En el escritorio hay un modal de por medio porque
    // ahí el ciclo es UN botón que no puede ofrecer dos cosas; aquí
    // hay sitio, así que se ofrecen las dos y se ahorra el modal.
    if (st === 'step2') {
      return {
        tono: 'blue', k: 'Cycle open' + (fecha ? ' · ' + fecha : ''),
        tt: 'Load the count', sub: 'Scan the bottles, or import the sheet',
        amt: '2', vs: 'of 3',
        btn: 'Count now',
        go: () => { if (window.BarStockScanCount) window.BarStockScanCount.open(); },
        btn2: 'Import a file',
        // El mismo <input type=file> de siempre, el que usa el modal
        // del escritorio. No hay un segundo camino de importación.
        go2: () => { const f = document.getElementById('countFile'); if (f) f.click(); }
      };
    }

    if (st === 'counting') {
      const S = window.BarStockCountSession;
      const pr = (S && S.progress) ? S.progress() : null;
      const n = pr ? pr.counted : ((S && S.size) ? S.size() : 0);
      const tot = pr ? pr.total : 0;
      const pct = tot ? Math.round((n / tot) * 100) : 0;

      const pau = !!(W && W.pausado && W.pausado());
      const viejo = !!(W && W.abandonado && W.abandonado());
      const zona = (window.BarStockZones && window.BarStockZones.activas())
        ? window.BarStockZones.paraPasada() : '';

      // ── Cuando queda poco, se dice QUÉ queda ──────────────────
      //
      // "259 left" no manda a nadie a ningún estante. Pero al final
      // del conteo, con cinco o seis pendientes, los nombres sí: o
      // vuelves a por ellos, o compruebas que de verdad no hay.
      //
      // Antes no tenía sentido enseñarlos porque la lista incluía los
      // UNKNOWN y nunca bajaba de cien. Ahora que el progreso sólo
      // cuenta lo que se pide, el final del conteo llega de verdad.
      const UMBRAL = 12;
      const MUESTRA = 4;
      let faltan = '';
      if (tot && (tot - n) > 0 && (tot - n) <= UMBRAL && S && S.missingRows) {
        let q = [];
        try { q = S.missingRows().map(r => r.item).filter(Boolean); } catch (e) {}
        if (q.length) {
          const resto = q.length - MUESTRA;
          faltan = 'Still to count: ' + q.slice(0, MUESTRA).join(', ') +
                   (resto > 0 ? ' +' + resto : '');
        }
      }

      return {
        // Con un conteo a medias, ESTA es la tarjeta que tiene que
        // estar delante: o lo retomas, o al menos ves que quedó
        // abierto. La bienvenida puede esperar.
        //
        // La marca es un nombre y no un sí/pelado porque lo que
        // dispara el movimiento es que CAMBIE: pausar y reanudar no
        // vuelven a tirar del carrusel, pero que aparezca un conteo
        // donde no había, sí.
        foco: 'conteo',
        tono: viejo ? 'red' : 'amber',
        k: pau ? 'Count paused' : viejo ? 'Count abandoned' : 'Counting',
        tt: tot ? n + ' of ' + tot : String(n),
        sub: viejo ? 'Untouched for three days'
             : (faltan || (zona ? 'Last scan in ' + zona : '')),
        barra: pct,
        amt: pct + '%',
        vs: tot ? (tot - n) + ' left' : '',
        btn: viejo ? 'Pick it up' : 'Keep counting',
        go: () => { if (window.BarStockScanCount) window.BarStockScanCount.open(); },

        // El bote. Va aquí y no sólo en la pantalla del ciclo porque es
        // la pareja de "seguir contando": cuando miras un conteo a
        // medias las dos únicas salidas son retomarlo o tirarlo, y
        // tener una a un toque y la otra a dos las desequilibra.
        //
        // Pequeño, sin color y al lado: tirar trabajo nunca debe ser
        // más fácil de pulsar que seguirlo.
        ico: 'trash',
        icot: 'Discard this count',
        go3: () => descartar(n)
      };
    }

    // done
    const ms = (W && W.edadCiclo) ? W.edadCiclo() : null;
    const dias = ms ? Math.floor(ms / 86400000) : 0;
    const viejo = !!(W && W.cicloViejo && W.cicloViejo());

    // ── El ciclo contado como lo que es: tres momentos ───────────────
    //
    // Aquí había una sola línea —"Counted 265 items"— y debajo 130px de
    // nada, porque todas las tarjetas del carril miden lo que la más
    // alta. El hueco no se quita: se llena con lo que la tarjeta ya
    // sabe y no estaba diciendo.
    //
    // Tres pasos FIJOS y no un registro de eventos: se contó, llegó
    // mercancía, esto es lo que queda hoy. Un registro crecería con la
    // semana y habría que cortarlo con un "y 4 más", que es la forma
    // de que una línea de tiempo deje de valer para nada.
    const inicio = (W && W.resetAt) ? W.resetAt() : '';
    cargarEntregas(inicio);

    const linea = [];
    linea.push({ d: fecha || 'Start', t: '<em>' + contados() + ' items</em> counted' });

    // Sólo cuando se sabe. Mientras la consulta viaja, la fila no
    // existe; nunca dice "0 deliveries" por no haber mirado todavía.
    if (_entregas) {
      linea.push({
        d: fmtDia(_entregas.ultima),
        t: '<em>' + _entregas.n + (_entregas.n === 1 ? ' delivery' : ' deliveries') +
           '</em> in, ' + _entregas.unidades + ' units'
      });
    }

    if (viejo) {
      // El aviso que antes vivía en el subtítulo. Cabe aquí mejor: es
      // justamente en qué punto está el ciclo hoy.
      linea.push({ hoy: true, alerta: true, d: 'Today',
                   t: 'Open ' + dias + ' days — usage keeps adding up' });
    } else {
      const pend = lineasPendientes();
      if (pend === null) {
        // No se sabe: no se inventa una fila.
      } else if (pend > 0) {
        linea.push({ hoy: true, d: 'Today',
                     t: '<em>' + pend + (pend === 1 ? ' line' : ' lines') +
                        '</em> waiting to order' });
      } else {
        const puestos = colocados().length;
        linea.push({ hoy: true, d: 'Today',
                     t: puestos
                        ? '<em>' + puestos + (puestos === 1 ? ' vendor' : ' vendors') + '</em> ordered'
                        : 'Nothing waiting' });
      }
    }

    return {
      tono: viejo ? 'amber' : 'teal',
      k: 'Cycle open',
      tt: fecha ? 'Since ' + fecha : 'Open',
      linea,
      amt: dias + 'd',
      vs: 'usual is 7',

      // Con el ciclo cerrado la única acción que queda es abrir el
      // siguiente, así que eso es lo que dice el botón. "Open cycle"
      // ahí no significaba nada: el ciclo YA está abierto.
      //
      // Reiniciar vive aquí y en ningún otro sitio. Estaba también en
      // la pantalla del ciclo, y dos caminos para lo único de esta app
      // que pone todo el inventario a cero es uno de más.
      btn: 'Restart cycle',
      btnTono: 'peligro',
      go: reiniciar,

      ico: 'list-details',
      icot: 'Cycle detail',
      go3: irAlCiclo
    };
  }

  // Pregunta antes, y dice lo que de verdad va a pasar. "¿Reiniciar el
  // ciclo?" no significa nada; "los 270 vuelven a cero" sí. Luego
  // resetOnHand vuelve a preguntar por su cuenta, y está bien: es la
  // única acción de la app sin deshacer.
  function reiniciar() {
    const n = master().length;
    const ok = window.confirm(
      'Restart the cycle?\n\n' +
      'On hand goes back to zero for all ' + n + ' items, and a new week starts. ' +
      'This cannot be undone.');
    if (!ok) return;
    const W = window.BarStockWeeklyCycle;
    if (W && W.reiniciar) W.reiniciar();
  }

  // El mismo descarte que la pantalla del ciclo: tira el conteo, deja
  // la semana abierta. Y dice el número — "¿descartar el conteo?" no
  // deja decidir nada, "vas a tirar 112 botellas contadas" sí.
  function descartar(n) {
    const ok = window.confirm(
      'Discard this count?\n\n' +
      n + ' bottle' + (n === 1 ? '' : 's') + ' counted so far will be thrown away. ' +
      'This cannot be undone.\n\nThe cycle stays open.');
    if (!ok) return;
    const W = window.BarStockWeeklyCycle;
    if (W && W.descartarConteo) W.descartarConteo();
  }

  // ── La bienvenida ────────────────────────────────────────────────────
  //
  // Primera y siempre. Dice lo único que alguien nuevo necesita saber
  // antes de tocar nada: que este teléfono es para CONTAR, y que
  // colocar órdenes y lo demás vive en el escritorio. Escrito como un
  // reparto deliberado y no como una disculpa — "esto vive allí" en vez
  // de "esto no se puede aquí" — porque es lo segundo lo que suena a
  // versión recortada.
  //
  // No lleva botón: lo que pide es un gesto, no un toque, y un botón
  // que dice "desliza" es una contradicción. La pista se queda abajo,
  // a la altura de los botones de las otras tarjetas, porque todas las
  // del carril miden lo mismo.
  //
  // Es FIJA. Si algún día estorba, quitarla es devolver false aquí:
  //   if (yaCerroUnCiclo()) return null;
  function tarjetaBienvenida() {
    return {
      // Verde y no el verde azulado del ciclo: eran vecinas y las dos
      // del mismo color, así que deslizar de una a otra no se notaba.
      tono: 'verde',
      // Esta tarjeta no tiene columna de cifras ni botón, así que el
      // texto se queda con el ancho entero y puede ser más grande.
      ancha: true,
      // El rótulo va en mayúsculas como los demás, pero el wordmark
      // conserva su caja: es una etiqueta que contiene un nombre
      // propio, igual que "WELCOME TO eBay" en prensa.
      k: 'Welcome to <span class="m-brand">BarStock<i class="m-logo-dot"></i>Pro</span>',
      kHtml: true,
      tt: 'Good to have you',
      // Los   son espacios duros: atan las parejas que leían mal
      // partidas en dos líneas ("Look / up", "orders / too",
      // "live / on desktop"). El ancho ya da de sobra, esto sólo
      // impide que vuelvan a separarse con otro tamaño de texto.
      sub: 'Scanning bottles is what this app does best. Look up stock, ' +
           'see what is running out and review orders too — placing them, ' +
           'and the deeper reports, live on desktop or iPad.',
      pista: 'Swipe to discover more',
      icoR: 'scan',
      amt: '', vs: '', btn: ''
    };
  }

  // Proveedores con alguna línea ya colocada en este ciclo. Es lo que
  // distingue "ya se pidió todo" de "nunca hizo falta pedir nada".
  function colocados() {
    if (typeof window.isRowPlaced !== 'function') return [];
    const s = new Set();
    for (const r of master()) {
      const v = String(r.vendor || '').toUpperCase();
      if (!v || v === 'UNKNOWN') continue;
      try { if (window.isRowPlaced(r)) s.add(v); } catch (e) {}
    }
    return Array.from(s);
  }

  // Líneas que esperan a que alguien las pida. Es el mismo recuento que
  // alimenta la tarjeta de órdenes; aquí sólo hace falta el número, no
  // los subtotales, así que no se reusa aquella — se reusan las mismas
  // funciones de siempre, que es lo que importa para que las dos
  // tarjetas nunca se contradigan.
  //
  // null cuando no se puede saber todavía: el Home se pinta antes de
  // que el inventario llegue, y un 0 ahí sería mentira.
  function lineasPendientes() {
    if (typeof window.getActiveVendors !== 'function' ||
        typeof window.getOrderRowsForVendor !== 'function') return null;
    let n = 0;
    for (const v of window.getActiveVendors()) {
      if (v === 'UNKNOWN') continue;
      n += (window.getOrderRowsForVendor(v) || []).length;
    }
    return n;
  }

  // ── Cuántas se van a PEDIR ────────────────────────────────────────
  //
  // `getEffectiveOrder` y nada más: respeta el override manual cuando
  // el proveedor lo admite y si no usa `toOrder`. Es exactamente la
  // misma función que alimenta `computeOrderSubtotal`, así que la
  // tarjeta no puede contradecir a la pantalla de órdenes.
  //
  // El primer intento leyó `finalOrder`, que es el campo de una orden
  // YA GUARDADA — otra forma de fila—. Aquí no existe, así que salía
  // "0×" y, multiplicado por el precio, un "$0" en una línea que sí
  // tenía precio. El pie decía $30 al mismo tiempo: dos cifras del
  // mismo dinero sin hablarse.
  function cuantas(r) {
    if (typeof window.getEffectiveOrder === 'function') {
      try { return Math.max(0, Number(window.getEffectiveOrder(r)) || 0); } catch (e) {}
    }
    const v = r.orderOverride;
    if (v !== '' && v !== null && v !== undefined) return Math.max(0, Number(v) || 0);
    return Math.max(0, Number(r.toOrder) || 0);
  }

  // ── Las órdenes que esperan ──────────────────────────────────────────
  //
  // Dos formas de la MISMA tarjeta, según cuántos proveedores haya.
  //
  //   varios → un índice, una fila por proveedor, y cada fila entra
  //            DIRECTO a esa orden. Antes la tarjeta listaba los
  //            nombres sin más y el único botón te dejaba en el índice
  //            de la pantalla de órdenes: leías la lista dos veces.
  //
  //   uno    → se salta el índice. Enseñar una lista de un elemento
  //            para que lo pulses es un paso de más, así que el título
  //            pasa a ser el proveedor y debajo van sus líneas.
  //
  // ── Y el $0 se va ───────────────────────────────────────────────
  //
  // La cifra de la esquina era el importe. Con 47 artículos sin precio
  // salía "$0", que no significa "gratis" sino "no lo sé", y una cifra
  // falsa en la esquina es peor que ninguna. Van botellas, que siempre
  // se saben. El dinero vuelve al pie y sólo cuando existe.
  function tarjetaOrdenes(v, tot) {
    const irA = (nombre) => () => {
      const O = window.BarStockMobileOrders;
      if (O && O.abrirVendor) O.abrirVendor(nombre);
      else if (window.BarStockMobile) window.BarStockMobile.ir('orders');
    };

    const pie = tot.total > 0
      ? tot.lineas + (tot.lineas === 1 ? ' line · ' : ' lines · ') + money(tot.total)
      : tot.lineas + (tot.lineas === 1 ? ' line · ' : ' lines · ') +
        tot.conPrecio + ' priced';

    const base = {
      tono: 'blue',
      k: 'Orders waiting',
      amt: String(tot.botellas),
      amtPie: tot.botellas === 1 ? 'bottle' : 'bottles',
      vs: pie
    };

    if (v.length === 1) {
      const u = v[0];
      return Object.assign(base, {
        tt: u.nombre,
        // Cuatro y el resto contado. Con cinco la tarjeta crece y
        // arrastra el alto de TODO el carril, que es común.
        filas: u.filas.slice(0, 4).map(r => ({
          q: cuantas(r) + '×',
          n: r.item || '',
          v: Number(r.value) > 0 ? money(Number(r.value) * cuantas(r)) : 'no price'
        })),
        mas: u.filas.length > 4 ? 'and ' + (u.filas.length - 4) + ' more' : '',
        btn: 'Review the order',
        go: irA(u.nombre)
      });
    }

    const tope = Math.max.apply(null, v.map(x => x.btl)) || 1;
    return Object.assign(base, {
      tt: v.length + ' vendors',
      // Tres como mucho: la cuarta fila ya empuja el carril entero.
      prov: v.slice(0, 3).map(x => ({
        nombre: x.nombre,
        d: x.filas.length + (x.filas.length === 1 ? ' line · ' : ' lines · ') +
           x.btl + ' btl',
        // Proporción entre ellos, no contra un objetivo: el primero
        // siempre llena la barra.
        pct: Math.round(x.btl / tope * 100),
        go: irA(x.nombre)
      })),
      mas: v.length > 3 ? 'and ' + (v.length - 3) + ' more' : '',
      btn: 'Review all',
      btnTono: 'suave',
      go: () => { if (window.BarStockMobile) window.BarStockMobile.ir('orders'); }
    });
  }

  function tarjetas() {
    const t = [tarjetaBienvenida(), tarjetaCiclo()];

    // 3 · Ordenes sin colocar, TODAS.
    if (typeof window.getActiveVendors === 'function' &&
        typeof window.getOrderRowsForVendor === 'function' &&
        typeof window.computeOrderSubtotal === 'function') {
      const v = [];
      let total = 0, botellas = 0, lineas = 0, conPrecio = 0;
      for (const nombre of window.getActiveVendors()) {
        if (nombre === 'UNKNOWN') continue;
        const filas = window.getOrderRowsForVendor(nombre);
        if (!filas.length) continue;
        const sub = window.computeOrderSubtotal(filas);
        const btl = filas.reduce((s, r) => s + cuantas(r), 0);
        total += sub;
        botellas += btl;
        lineas += filas.length;
        conPrecio += filas.filter(r => Number(r.value) > 0).length;
        v.push({ nombre, sub, filas, btl });
      }

      if (v.length) {
        // Por botellas y no por dinero: con 47 artículos sin precio, el
        // orden por importe pondría arriba al proveedor más barato que
        // encima tiene precios, y abajo el pedido grande sin ellos.
        v.sort((a, b) => b.btl - a.btl);
        t.push(tarjetaOrdenes(v, { total, botellas, lineas, conPrecio }));
      } else {
        // ── Y cuando ya no queda ninguna ─────────────────────────────
        //
        // La tarjeta desaparecía, y desaparecer no dice nada: no se
        // distingue de "nunca hubo órdenes". Colocarlas todas es el
        // final de la semana de trabajo y merece decirse.
        //
        // state.placedOrders se reconstruye desde el historial EN LA
        // NUBE contra la fecha del ciclo, así que el teléfono se
        // entera de una orden colocada en el escritorio.
        const puestos = colocados();
        if (puestos.length) {
          t.push({
            tono: 'teal',
            k: 'Orders placed',
            tt: 'You are up to date',
            sub: 'Nothing waiting. New lines show up when a count drops something below par.',
            icoR: 'circle-check',
            vs: puestos.length + (puestos.length === 1 ? ' vendor' : ' vendors'),
            amt: '',
            btn: 'See orders',
            go: () => { if (window.BarStockMobile) window.BarStockMobile.ir('orders'); }
          });
        }
      }
    }

    // 4 · Se acaba antes que lo demas. Sale de cruzar lo que hay con el
    // consumo ponderado; hasta ahora no estaba en ninguna pantalla.
    const pronto = conPar()
      .map(({ r, p }) => {
        const avg = Number(p.avgUsed) || 0;
        if (avg <= 0 || (p.normalWeeks || 0) < SEMANAS_MIN) return null;
        const onHand = Number(r.onHand) || 0;
        const dias = Math.round(onHand / avg * 7);
        // `fuera` mira el estante, no el redondeo. Media botella de
        // algo que se mueve mucho también da "0 days", y decir que
        // está fuera cuando queda media es mentira.
        return dias <= 7 ? { item: r.item, dias, avg, fuera: onHand <= 0 } : null;
      })
      .filter(Boolean);

    if (pronto.length) {
      // ── Ordenar por CONSUMO, no por días ──────────────────────────
      //
      // Con cuarenta y nueve productos bajo la semana, los primeros
      // diez dicen todos "0 days" y esa lista no prioriza nada: no se
      // distingue un Tito's que se mueve doce a la semana de un
      // amaretto que se mueve uno. Los días contestan "cuándo"; con
      // todo a cero la pregunta que queda es "cuánto duele".
      //
      // Los que están fuera van primero —eso sí es otro estado— y
      // dentro de cada grupo manda el consumo.
      pronto.sort((a, b) =>
        (b.fuera - a.fuera) || (b.avg - a.avg) || (a.dias - b.dias));

      const fuera = pronto.filter(x => x.fuera).length;
      const resto = pronto.length - Math.min(4, pronto.length);

      t.push({
        tono: 'red',
        k: 'Running out first',
        // El titular es el número que exige algo hoy. "49 products"
        // mezcla el aviso con el problema, y mezclados no se mira
        // ninguno.
        tt: fuera
          ? fuera + (fuera === 1 ? ' is out right now' : ' are out right now')
          : pronto.length + (pronto.length === 1 ? ' product' : ' products'),
        // Nombres enteros: el recorte a 18 caracteres partía palabras
        // a lo bruto ("Canyon Road Cabern"). Lo corta el ancho, con
        // puntos suspensivos, que es lo que sabe dónde está el borde.
        filas: pronto.slice(0, 4).map(x => ({
          n: x.item,
          tag: x.fuera ? 'out' : '',
          v: n1(x.avg) + '/wk'
        })),
        mas: resto ? 'and ' + resto + ' more within a week' : '',
        // La esquina deja de repetir el título: es el recuento de lo
        // que está en cero, que es otro dato.
        amt: String(fuera || pronto.length),
        amtPie: fuera ? 'out now' : 'this week',
        vs: pronto.length + ' under a week',
        btn: 'See them',
        go: () => { if (window.BarStockMobile) window.BarStockMobile.ir('inventory'); }
      });
    }

    // ── La que importa va primera ────────────────────────────────
    //
    // Con un conteo a medias, su tarjeta se pone delante de la
    // bienvenida. Antes se dejaba en su sitio y se desplazaba el
    // carril hasta ella, lo cual dependía de medir anchos que al
    // pintar todavía no existen y de distinguir "entrar" de
    // "refrescar". Cambiar el ORDEN no depende de nada: la primera
    // tarjeta es la primera y ya está.
    const iFoco = t.findIndex(c => c && c.foco);
    if (iFoco > 0) t.unshift(t.splice(iFoco, 1)[0]);

    // Ya no hay tarjeta de "All clear": la del ciclo está siempre, y
    // cuando no hay nada pendiente ella misma es el "todo en orden"
    // —dice desde cuándo está abierto y cuántos artículos se contaron—.
    // Una tarjeta que sólo sirve para decir que no hay tarjetas era un
    // hueco ocupado.

    return t;
  }

  function pintarTarjeta(c, i) {
    return `
      <article class="m-hero m-hero-${c.tono}${c.ancha ? ' m-hero-ancha' : ''}" data-hero="${i}">
        <!-- Arriba el texto y la cifra, en dos columnas. Abajo, una
             fila entera para la pie de página y los botones.
             Antes todo colgaba de la columna izquierda, así que los
             botones se alineaban al borde de ESA columna y les
             faltaban los 82px de la de cifras para llegar al borde de
             la tarjeta. -->
        <div class="m-hero-top">
          <!-- El texto crece y empuja la fila de abajo al suelo de la
               tarjeta. Sin esto los botones se pegaban al final del
               texto, y como cada tarjeta tiene un número distinto de
               líneas, quedaban a alturas distintas y se veía al
               deslizar. -->
          <div class="m-hero-txt">
            <div class="m-hero-k">${c.kHtml ? c.k : esc(c.k)}</div>
            <div class="m-hero-t">${esc(c.tt)}</div>
            ${c.barra !== undefined ? `<div class="m-prog"><i style="width:${c.barra}%"></i></div>` : ''}
            ${c.sub ? `<div class="m-hero-s">${esc(c.sub)}</div>` : ''}
            ${c.lista ? `<div class="m-hero-list">${c.lista.map(x => '<span>' + x + '</span>').join('')}</div>` : ''}
            <!-- La línea de tiempo del ciclo. El texto lleva <em> para
                 destacar la cifra y lo arma esta misma página con
                 números, nunca con nombres que vengan de fuera: por eso
                 va sin escapar. Si algún día entra un proveedor ahí,
                 tiene que pasar por esc(). -->
            ${c.linea ? `<ul class="m-hero-tl">${c.linea.map(x =>
              `<li${x.hoy ? ' class="is-hoy' + (x.alerta ? ' is-alerta' : '') + '"' : ''}>
                 <u>${esc(x.d)}</u><p>${x.t}</p>
               </li>`).join('')}</ul>` : ''}

            <!-- Las líneas de una orden y el índice de proveedores
                 salen de la columna de la cifra y acaban en el mismo
                 borde que los botones del pie: esa columna reserva 80px
                 en TODA la altura, y ahí abajo no hay nada. -->
            ${c.filas ? `<div class="m-hero-ln">${c.filas.map(x =>
              `<div class="m-hln">
                 ${x.q ? `<span class="q">${esc(x.q)}</span>` : ''}
                 <span class="n">${esc(x.n)}</span>
                 ${x.tag ? `<span class="tag">${esc(x.tag)}</span>` : ''}
                 <span class="v">${esc(x.v)}</span>
               </div>`).join('')}</div>` : ''}

            ${c.prov ? `<div class="m-hero-pv">${c.prov.map((x, k) =>
              `<button type="button" class="m-hpv" data-pv="${i}-${k}">
                 <span class="co">
                   <span class="h"><span class="nm">${esc(x.nombre)}</span>
                     <span class="d">${esc(x.d)}</span></span>
                   <span class="bar"><i style="width:${x.pct}%"></i></span>
                 </span>
                 <span class="chev"><i class="ti ti-chevron-right" aria-hidden="true"></i></span>
               </button>`).join('')}</div>` : ''}

            ${c.mas ? `<div class="m-hero-mas">${esc(c.mas)}</div>` : ''}
          </div>
          <div class="m-hero-r">
            ${c.icoR
              ? `<i class="ti ti-${esc(c.icoR)} m-hero-ir" aria-hidden="true"></i>`
              : (c.amt
                  ? `<div class="m-hero-amt">${esc(c.amt)}${
                      c.amtPie ? `<small>${esc(c.amtPie)}</small>` : ''}</div>`
                  : '')}
          </div>
        </div>

        <div class="m-hero-acts">
          ${c.vs ? `<span class="m-hero-vs">${esc(c.vs)}</span>` : ''}
          ${c.pista ? `<span class="m-hero-pista">${esc(c.pista)}
            <i class="ti ti-chevron-right" aria-hidden="true"></i></span>` : ''}
          ${c.btn ? `<button type="button" class="m-hero-b${c.btnTono ? ' m-hero-b-' + esc(c.btnTono) : ''}"
                             data-go="${i}">${esc(c.btn)}</button>` : ''}
          ${c.btn2 ? `<button type="button" class="m-hero-b2" data-go2="${i}">${esc(c.btn2)}</button>` : ''}
          ${c.ico ? `<button type="button" class="m-hero-x" data-go3="${i}"
                             aria-label="${esc(c.icot || '')}">
                       <i class="ti ti-${esc(c.ico)}" aria-hidden="true"></i>
                     </button>` : ''}
        </div>
      </article>`;
  }

  // ── Top movers ───────────────────────────────────────────────────────

  // Cinco y no tres. Tres eran los que cabían con el formato viejo, no
  // los que hacen falta: de 270 productos, tres es una anécdota.
  const CUANTOS_MOVERS = 5;

  function movers() {
    return conPar()
      .map(({ r, p }) => ({
        item: r.item,
        vendor: r.vendor,
        avg: Number(p.avgUsed) || 0,
        // La tendencia contra su PROPIA historia, el mismo par de
        // números que alimenta Took off / Went quiet. Aquí dice algo
        // más útil: que un producto se mueva mucho no es noticia si
        // siempre se movió mucho.
        pct: tendencia(p)
      }))
      .filter(x => x.avg > 0)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, CUANTOS_MOVERS);
  }

  // null = no se sabe todavía. Con menos de SEMANAS_MIN de historia el
  // ponderado y el plano son casi el mismo número, y decir "subió un
  // 4%" ahí sería ruido con aspecto de dato.
  function tendencia(p) {
    if (!p || (p.normalWeeks || 0) < SEMANAS_MIN) return null;
    const hoy_ = Number(p.avgUsed) || 0;
    const antes = Number(p.avgHistorical) || 0;
    if (antes <= 0.2) return null;
    const d = Math.round((hoy_ / antes - 1) * 100);
    return Math.abs(d) < 8 ? 0 : d;   // por debajo de 8% es la misma semana
  }

  // Pastilla con icono y no texto suelto: a 10px una flecha dibujada se
  // lee de un vistazo y un "↑" tipografico se confunde con una comilla.
  function flecha(pct) {
    if (pct === null) return '';
    if (pct === 0) {
      return '<span class="m-tr"><i class="ti ti-minus" aria-hidden="true"></i>steady</span>';
    }
    const arriba = pct > 0;
    return '<span class="m-tr ' + (arriba ? 'up' : 'dn') + '">' +
           '<i class="ti ti-' + (arriba ? 'trending-up' : 'trending-down') + '" aria-hidden="true"></i>' +
           Math.abs(pct) + '%</span>';
  }

  // ── Qué cambió ───────────────────────────────────────────────────────
  //
  // El ponderado contra el histórico plano. Los dos los calcula
  // par-intelligence desde que el promedio del par pasó a ser ponderado:
  // esta pantalla sólo los compara.
  function cambios() {
    const arriba = [], abajo = [];
    for (const { r, p } of conPar()) {
      if ((p.normalWeeks || 0) < SEMANAS_MIN) continue;
      const hoy_ = Number(p.avgUsed) || 0;
      const antes = Number(p.avgHistorical) || 0;
      if (antes <= 0.2 && hoy_ <= 0.2) continue;   // ruido, no cambio

      if (antes > 0.2 && hoy_ >= antes * 1.5) {
        const x = hoy_ / antes;
        arriba.push({ item: r.item, dato: x >= 3 ? Math.round(x) + '×' : '+' + Math.round((x - 1) * 100) + '%', orden: x });
      } else if (antes > 0.5 && hoy_ <= antes * 0.4) {
        abajo.push({ item: r.item, dato: hoy_ < 0.05 ? '0' : n1(hoy_), orden: antes - hoy_ });
      }
    }
    arriba.sort((a, b) => b.orden - a.orden);
    abajo.sort((a, b) => b.orden - a.orden);
    return { arriba: arriba.slice(0, 2), abajo: abajo.slice(0, 2) };
  }

  // ── Dinero ───────────────────────────────────────────────────────────

  function gasto() {
    const S = window.BarStockSpend;
    if (!S || typeof S.compute !== 'function') return null;
    try {
      const d = S.compute();
      if (!d || !d.now) return null;
      // Las dos semanas en cero es la firma de "todavia no se", no de
      // "no gastaste nada".
      if (!d.now.total && !d.prev.total) return null;
      return { total: d.now.total, delta: d.totalDelta };
    } catch (e) { return null; }
  }

  function estante() {
    const V = window.BarStockInventoryValue;
    if (!V || typeof V.compute !== 'function') return null;
    try {
      const d = V.compute();
      if (!d || !d.items) return null;
      if (!d.total && d.noPrice >= d.items) return null;
      return { total: d.total, n: d.items, sin: d.noPrice };
    } catch (e) { return null; }
  }

  // ── Pintar ───────────────────────────────────────────────────────────

  function render(host) {
    if (!host) return;

    const cards = tarjetas();
    const mov = movers();
    const ch = cambios();
    const g = gasto();
    const e = estante();

    host.innerHTML = `
      <div class="m-body">
        <div class="m-daterow">
          <span class="m-day">${esc(saludo())}</span>
          ${pildora()}
        </div>

        <button type="button" class="m-searchbar" id="mhSearch">
          <i class="ti ti-search" aria-hidden="true"></i>
          <span>Do we have…</span>
        </button>
      </div>

      <div class="m-railwrap"><div class="m-rail" id="mhRail">
        ${cards.map(pintarTarjeta).join('')}
      </div></div>
      ${cards.length > 1
        ? `<div class="m-dots" id="mhDots">${cards.map((_, i) =>
            `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>`
        : ''}

      <div class="m-body">
        <!-- El dinero primero: es lo único de esta pantalla que se
             mira todos los días sin buscar nada. Top movers y lo demás
             son contexto de la semana. -->
        <div class="m-pair">
          <div class="m-stat">
            <span class="m-stat-k">Spent this cycle</span>
            <b class="m-stat-v">${g ? money(g.total) : '…'}</b>
            <small class="m-stat-d ${g && g.delta >= 0 ? 'm-up' : 'm-down'}">${
              g ? (g.delta >= 0 ? '↗ +' : '↘ −') + money(Math.abs(g.delta)).slice(1) : '&nbsp;'
            }</small>
          </div>
          <div class="m-stat">
            <span class="m-stat-k">On the shelf</span>
            <b class="m-stat-v">${e ? money(e.total) : '…'}</b>
            <small class="m-stat-d">${e
              ? e.n + ' items' + (e.sin ? ' · ' + e.sin + ' no price' : '')
              : '&nbsp;'}</small>
          </div>
        </div>

        ${mov.length ? `
          <div class="m-mvcard">
            <div class="m-mvcard-h">
              <span class="m-hero-k"><i class="ti ti-flame" aria-hidden="true"></i> Top movers</span>
              <button type="button" class="m-seclink" id="mhAllMov">
                See all <i class="ti ti-chevron-right" aria-hidden="true"></i>
              </button>
            </div>

            <button type="button" class="m-mv1" data-item="${esc(mov[0].item)}">
              <span class="m-mv1-n">
                <b>${n1(mov[0].avg)}</b><small>btl/wk</small>
                ${flecha(mov[0].pct)}
              </span>
              <span class="m-mv1-t">${esc(mov[0].item)}</span>
              <span class="m-mv1-s">${esc(mov[0].vendor || '')}</span>
            </button>

            ${mov.length > 1 ? `<div class="m-mvcard-rows">
              ${mov.slice(1).map((x, i) => `
                <button type="button" class="m-mvr" data-item="${esc(x.item)}">
                  <span class="m-mvr-i">${i + 2}</span>
                  <span class="m-mvr-t">${esc(x.item)}</span>
                  ${flecha(x.pct)}
                  <b>${n1(x.avg)}</b>
                  <span class="m-mvr-bar" style="width:${
                    Math.round((x.avg / mov[0].avg) * 100)}%"></span>
                </button>`).join('')}
            </div>` : ''}
          </div>` : ''}

        ${(ch.arriba.length || ch.abajo.length) ? `
          <div class="m-cols">
            <div class="m-col m-col-up">
              <div class="m-col-k"><i class="ti ti-trending-up" aria-hidden="true"></i> Took off</div>
              ${ch.arriba.length
                ? ch.arriba.map(x => `<div class="m-col-r"><span>${esc(x.item)}</span><b>${esc(x.dato)}</b></div>`).join('')
                : '<div class="m-col-r m-col-none"><span>Nothing</span><b>—</b></div>'}
            </div>
            <div class="m-col m-col-dn">
              <div class="m-col-k"><i class="ti ti-trending-down" aria-hidden="true"></i> Went quiet</div>
              ${ch.abajo.length
                ? ch.abajo.map(x => `<div class="m-col-r"><span>${esc(x.item)}</span><b>${esc(x.dato)}</b></div>`).join('')
                : '<div class="m-col-r m-col-none"><span>Nothing</span><b>—</b></div>'}
            </div>
          </div>` : ''}
      </div>`;

    enganchar(host, cards);

  }



  // ── La píldora de locación ───────────────────────────────────────────
  //
  // Con UNA sola locación no es un botón, es una etiqueta: un control
  // que no hace nada es peor que no tener control.
  //
  // Dos cosas que lo tenían muerto:
  //
  // 1. getAllowedLocations() es ASYNC. Se le estaba preguntando
  //    Array.isArray() a una promesa, que nunca es un array, así que
  //    siempre salía la etiqueta y jamás el botón. Una promesa no se
  //    queja de que la trates como un array — por eso no había error en
  //    consola y parecía "que no servía".
  //
  // 2. Aunque hubiera salido el botón, abría el <select> del encabezado
  //    de escritorio, y ese vive dentro de .wrap, que con body.m-on está
  //    en display:none. Un <select> dentro de algo oculto no se puede
  //    enfocar ni abrir. Por eso aquí la lista se pinta propia.
  //
  // El CAMBIO sí reusa lo de siempre: setActiveLocationName + recargar,
  // exactamente lo que hace el escritorio. Lo que no se duplica es la
  // decisión de qué significa cambiar de locación.

  let _locs = null;       // null = todavia no se sabe; [] = no hay
  let _pidiendo = false;

  function cargarLocs() {
    if (_locs !== null || _pidiendo) return;
    const L = window.BarStockLocationAccess;
    if (!L || !L.getAllowedLocations) { _locs = []; return; }
    _pidiendo = true;
    Promise.resolve()
      .then(() => L.getAllowedLocations())
      .then(l => {
        _locs = Array.isArray(l) ? l : [];
        // Sólo se repinta si cambia algo de lo que se ve: con una sola
        // locación la etiqueta ya estaba bien y repintar movería el
        // carrusel de sitio sin motivo.
        if (_locs.length > 1) refresh();
      })
      .catch(() => { _locs = []; })
      .then(() => { _pidiendo = false; });
  }

  function pildora() {
    const nombre = esc(cfgNombre());
    cargarLocs();

    const varias = Array.isArray(_locs) && _locs.length > 1;
    if (!varias) return `<span class="m-pill m-pill-solo"><i class="m-dot"></i>${nombre}</span>`;

    return `<button type="button" class="m-pill" id="mhLoc">
              <i class="m-dot"></i><span class="m-pill-t">${nombre}</span>
              <i class="ti ti-chevron-down" aria-hidden="true"></i>
            </button>`;
  }

  function abrirLocs() {
    if (!Array.isArray(_locs) || _locs.length < 2) return;
    const activa = cfgNombre();

    const hoja = document.createElement('div');
    hoja.className = 'm-sheet';
    // El id no es decoracion: las reglas de esta hoja se apoyan en el
    // para ganarle en especificidad al radio de app.css. Ver la
    // cabecera de mobile-app.css.
    hoja.id = 'mSheet';
    hoja.innerHTML = `
      <div class="m-sheet-bg"></div>
      <div class="m-sheet-box" role="dialog" aria-label="Choose location">
        <div class="m-sheet-grip"></div>
        <div class="m-sheet-t">Location</div>
        ${_locs.map(l => `
          <button type="button" class="m-sheet-op${l.name === activa ? ' on' : ''}"
                  data-loc="${esc(l.name)}">
            <span>${esc(l.name)}</span>
            ${l.name === activa ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}
          </button>`).join('')}
      </div>`;
    document.body.appendChild(hoja);

    const cerrar = () => hoja.remove();
    hoja.querySelector('.m-sheet-bg').onclick = cerrar;

    hoja.querySelectorAll('.m-sheet-op').forEach(b => {
      b.onclick = () => {
        const n = b.dataset.loc;
        if (n === activa) return cerrar();
        const L = window.BarStockLocationAccess;
        if (!L || !L.setActiveLocationName) return cerrar();
        L.setActiveLocationName(n);
        // Recargar y no repintar: media app lleva la locación metida en
        // sus consultas y su caché. Es lo mismo que hace el escritorio.
        window.location.reload();
      };
    });
  }

  function enganchar(host, cards) {
    // El logo y los dos botones ya no viven aquí: son del armazón, para
    // que estén también en Buscar y en las secciones del escritorio.

    const loc = host.querySelector('#mhLoc');
    if (loc) loc.onclick = abrirLocs;

    const bus = host.querySelector('#mhSearch');
    if (bus) bus.onclick = () => window.BarStockMobile.ir('search');

    host.querySelectorAll('[data-go]').forEach(b => {
      const c = cards[Number(b.dataset.go)];
      if (c && c.go) b.onclick = (ev) => { ev.stopPropagation(); c.go(); };
    });

    host.querySelectorAll('[data-go2]').forEach(b => {
      const c = cards[Number(b.dataset.go2)];
      if (c && c.go2) b.onclick = (ev) => { ev.stopPropagation(); c.go2(); };
    });

    host.querySelectorAll('[data-go3]').forEach(b => {
      const c = cards[Number(b.dataset.go3)];
      if (c && c.go3) b.onclick = (ev) => { ev.stopPropagation(); c.go3(); };
    });

    // Cada proveedor del índice entra en SU orden. La clave lleva los
    // dos números —tarjeta y fila— porque el carril pinta todas las
    // tarjetas a la vez y un índice suelto chocaría entre ellas.
    host.querySelectorAll('[data-pv]').forEach(b => {
      const [ci, pi] = String(b.dataset.pv).split('-').map(Number);
      const p = cards[ci] && cards[ci].prov && cards[ci].prov[pi];
      if (p && p.go) b.onclick = (ev) => { ev.stopPropagation(); p.go(); };
    });

    host.querySelectorAll('[data-item]').forEach(b => {
      b.onclick = () => {
        if (window.BarStockMobileSearch && window.BarStockMobileSearch.abrirItem) {
          window.BarStockMobileSearch.abrirItem(b.dataset.item);
        }
      };
    });

    const all = host.querySelector('#mhAllMov');
    if (all) all.onclick = () => window.BarStockMobile.ir('inventory');

    puntos(host);
  }

  // Los puntos siguen al dedo. Es la unica confirmacion de cuantas
  // tarjetas hay y en cual estas; sin ellos, el asomo de la siguiente
  // dice que hay mas pero no cuantas.
  function puntos(host) {
    const rail = host.querySelector('#mhRail');
    const dots = host.querySelector('#mhDots');
    if (!rail || !dots) return;
    rail.addEventListener('scroll', () => {
      const hijos = Array.from(rail.children);
      if (!hijos.length) return;
      const centro = rail.scrollLeft + rail.clientWidth / 2;
      let mejor = 0, dist = Infinity;
      hijos.forEach((c, i) => {
        const d = Math.abs((c.offsetLeft + c.offsetWidth / 2) - centro);
        if (d < dist) { dist = d; mejor = i; }
      });
      Array.from(dots.children).forEach((d, i) => d.classList.toggle('on', i === mejor));
    }, { passive: true });
  }

  // Lo llama quien termina de cargar datos: el Home se pinta antes de
  // que lleguen el inventario y las ordenes, y sin esto se queda con los
  // huecos puestos hasta que cambias de pestaña y vuelves.
  function refresh() {
    const host = document.querySelector('.m-screen[data-screen="home"]');
    if (host && host.classList.contains('on')) render(host);
  }

  // ── Esperar a que lleguen los datos ──────────────────────────────────
  //
  // Esto apareció al arreglar la entrada por Home. Antes el Home no se
  // pintaba hasta que tocabas la casa, y para entonces ya había cargado
  // todo; ahora se pinta al arrancar, con el inventario y Pour·IQ aún en
  // camino, y se quedaba con media pantalla hasta que la tocabas.
  //
  // Se vigila una FIRMA de lo que el Home necesita en vez de engancharse
  // a un evento. No hay ninguno que diga "ya está todo": los que hay son
  // de cambios en vivo, y la carga inicial pasa por varios caminos
  // asíncronos distintos. Engancharse a uno sería arreglar el camino que
  // probé hoy y dejar rotos los otros.
  //
  // Se apaga solo: en cuanto la firma se queda quieta un rato, o a los
  // VIGILA_MAX, deja de mirar. Un intervalo eterno en el móvil es
  // batería que se va sin que nadie lo pida.

  const VIGILA_CADA = 400;
  const VIGILA_MAX = 25000;
  const QUIETO_BASTA = 6;        // 6 vueltas sin cambio = ya cargó

  let _reloj = null, _firma = null, _quieto = 0, _desde = 0;

  function firma() {
    const m = (window.state && window.state.master) || [];
    const p = window.parAdjustments;
    const g = gasto(), v = estante();
    const S = window.BarStockCountSession;
    let c = '-';
    try {
      if (S && S.exists && S.exists()) {
        c = (S.size ? S.size() : 0) + (S.isPaused && S.isPaused() ? 'p' : '');
      }
    } catch (e) {}
    return [
      m.length,
      p && p.size ? p.size : 0,
      g ? g.total : '-',
      v ? v.total : '-',
      c
    ].join('|');
  }

  function vigilar() {
    if (_reloj) return;
    _firma = firma(); _quieto = 0; _desde = Date.now();
    _reloj = setInterval(() => {
      const f = firma();
      if (f !== _firma) { _firma = f; _quieto = 0; refresh(); }
      else _quieto++;
      if (_quieto >= QUIETO_BASTA || Date.now() - _desde > VIGILA_MAX) {
        clearInterval(_reloj); _reloj = null;
      }
    }, VIGILA_CADA);
  }

  window.BarStockMobileHome = { render, refresh };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      id: 'home', icon: 'ti-home', label: 'Home', tab: true, orden: 10,
      mount(host) { render(host); vigilar(); },
      show(host) { render(host); vigilar(); },  // el estado del ciclo cambia
      refrescar(host) { render(host); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
