(() => {
  if (window.BarStockLiveCache) return;

  // ── El LIVE de cada producto, una vez para toda la app ───────────────
  //
  // Axel, 2026-11-11: "el live sólo se está mostrando en la vista de lista
  // de Inventory; si entras al producto o lo buscan en Do we have, te
  // muestra el dato del conteo, y eso no está bien. Si ya cambió a live,
  // el dato que se muestra en todos lados es ése, junto con el tag de que
  // es live; si no, seguimos mostrando sólo el conteo."
  //
  // Vivía dentro de mobile-inventory.js. Ahora lo leen todas las
  // pantallas de aquí, para que la lista, la ficha, Do we have y el Home
  // digan el mismo número: con una copia por pantalla acabarían diciendo
  // cosas distintas, que es lo que Axel vio.
  //
  // El LIVE es contado + lo que llegó − lo vendido en Toast desde el
  // conteo (live-stock.js), y "cuándo se acaba" su día (run-out.js). Sólo
  // lo que se MOVIÓ desde el conteo es LIVE: lo demás —la cerveza, lo que
  // no se vendió ni llegó— es lo contado, sin marca, porque "Live" sin
  // nada detrás sería una afordancia que miente. on_hand no se toca.
  //
  // ── Cuándo se vuelve a leer ──────────────────────────────────────────
  //
  // Son varias lecturas (pedidos, facturas, lo vendido desde el conteo y
  // 90 días de Toast): el resultado se guarda en memoria. Se relee solo
  // cada 30 minutos (Axel: las ventas de Toast se cargan una vez al día),
  // y AL MOMENTO cuando pasa algo que lo cambia:
  //   · 'invoicesUpdated': el sync de MarginEdge trajo facturas (Axel:
  //     "si se trae una factura se lee en ese momento lo que llegó");
  //   · 'ordersUpdated': se colocó un pedido o un quick order;
  //   · 'inventoryUpdated': se cerró un conteo o se tiró para recargar.
  // Lo que no avisa —la hora de llegada de un pedido que pasa sola— entra
  // en la relectura de los 30 minutos.

  const VIVO_MS = 30 * 60 * 1000;
  let _vivo = null, _agota = null, _vivoEn = 0, _pidiendo = null;
  // Un aviso que llega MIENTRAS se lee: la lectura en curso empezó antes
  // de la factura y daría el número de antes, guardado 30 minutos. Se
  // apunta y se vuelve a leer al terminar.
  let _otraVez = false;
  const _oyentes = new Set();
  const num = (v) => Number(v) || 0;

  function avisar() { for (const f of _oyentes) { try { f(); } catch (e) { console.warn('[live]', e); } } }
  function alCambiar(f) { _oyentes.add(f); return () => _oyentes.delete(f); }

  // Lee si hace falta (nada guardado, o caducado). Las pantallas lo
  // llaman al enseñarse; si ya está fresco no hace nada.
  function cargar() {
    const R = window.BarStockRunOut, L = window.BarStockLive;
    // "Cuándo se acaba" trae el LIVE de cada producto y su día; si no
    // está cargado, sólo el LIVE.
    const fuente = (R && R.ahora) ? R : (L && L.ahora) ? L : null;
    if (!fuente || _pidiendo) return _pidiendo;
    if (_vivo && _vivoEn && Date.now() - _vivoEn < VIVO_MS) return null;
    _pidiendo = fuente.ahora().then(r => {
      // Con un conteo activo, o sin conteo conocido, se enseña lo contado.
      const filas = r && r.estado === 'listo' ? r.filas : [];
      _vivo = new Map(filas.filter(f => f.movimiento).map(f => [f.producto, f]));
      _agota = new Map(filas.map(f => [f.producto, f]));
    }).catch(e => {
      console.warn('[live] sin LIVE', e);
      _vivo = new Map();
      _agota = new Map();
    }).finally(() => {
      _vivoEn = _otraVez ? 0 : Date.now();
      _pidiendo = null;
      avisar();
      if (_otraVez) { _otraVez = false; cargar(); }
    });
    return _pidiendo;
  }

  function caducar() {
    if (_pidiendo) _otraVez = true;
    _vivoEn = 0;
    // Sólo se relee ya si alguien lo está enseñando; si no, al volver.
    if (_oyentes.size) cargar();
  }
  if (window.BarStockEvents && window.BarStockEvents.on) {
    for (const ev of ['invoicesUpdated', 'ordersUpdated', 'inventoryUpdated']) window.BarStockEvents.on(ev, caducar);
  }

  // La fila del LIVE de un producto si se MOVIÓ desde el conteo; si no, null.
  const vivo = (r) => (_vivo && r ? _vivo.get(r.item) : null) || null;
  // El número que se enseña: el LIVE si se movió, si no lo contado.
  const cuanto = (r) => { const v = vivo(r); return v ? v.live : num(r && r.onHand); };
  // La misma fila con onHand = lo que se enseña, para las funciones que
  // calculan color, barra o botella desde onHand (product-hero.js tono).
  const conVivo = (r) => { const v = vivo(r); return v ? Object.assign({}, r, { onHand: v.live }) : r; };
  // "≈3.9" o "3": el número como texto.
  const texto = (r, n2) => { const v = vivo(r); return v ? '≈' + v.live.toFixed(1) : (n2 ? n2(num(r.onHand)) : String(num(r.onHand))); };

  // ── Cuándo se acaba (Axel, 2026-11-11, opción C) ─────────────────────
  //
  // "Out Sat" SUSTITUYE a los "N days" de Pour·IQ: dos respuestas
  // distintas a "cuánto me dura" acabarían contradiciéndose. Se quitan en
  // todo producto que Toast vende (aunque no se acabe en dos semanas: si
  // Toast dice que dura más, "6 days" lo contradiría); sólo los conserva
  // lo que Toast no vende, como la cerveza, donde es lo único que hay.
  const agotaDe = (r) => (_agota && r ? _agota.get(r.item) : null) || null;
  const toastLoVende = (r) => { const a = agotaDe(r); return !!(a && a.med && a.med.some(x => x > 0)); };

  // { txt: 'Out Sat', tono: 'r'|'a'|'g', enDias } o null. Rojo a dos días o
  // menos, ámbar dentro de la semana, gris más allá. Más de seis días se
  // dice con la fecha: "Out Sat" sería ambiguo entre este sábado y el
  // siguiente.
  function agota(r) {
    const a = agotaDe(r);
    if (!a || !a.agota) return null;
    const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const f = new Date(a.agota + 'T12:00:00Z');
    const txt = cuanto(r) <= 0 ? 'Out now'
      : a.enDias === 0 ? 'Out today'
        : a.enDias < 7 ? 'Out ' + D[f.getUTCDay()]
          : 'Out ' + M[f.getUTCMonth()] + ' ' + f.getUTCDate();
    return { txt, tono: a.enDias <= 2 ? 'r' : a.enDias < 7 ? 'a' : 'g', enDias: a.enDias, dia: a.agota };
  }

  // ── Lo que llegó desde el conteo (Axel, 2026-11-11, opción A) ────────
  //
  // En la ficha, junto a las zonas, va una pieza aparte "+5 Arrived": lo
  // que llegó por pedido está en el bar, pero nadie dijo en qué zona.
  // { n, txt } o null; `txt` es "arrived Tue, LOOP order" si vino de un
  // solo sitio el mismo día, y "arrived since the count" si no: varias
  // llegadas en una frase serían un párrafo.
  function llegadas(r) {
    const v = vivo(r);
    const l = v && v.llegadas ? v.llegadas.filter(x => x && x.n > 0) : [];
    if (!l.length) return null;
    const n = Math.round(l.reduce((s, x) => s + x.n, 0) * 100) / 100;
    const dia = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    const uno = l.every(x => x.de === l[0].de && dia(x.cuando) === dia(l[0].cuando));
    if (!uno || !l[0].cuando) return { n, txt: 'arrived since the count' };
    // Más de seis días se dice con la fecha: "Tue" sería ambiguo.
    const reciente = Date.now() - l[0].cuando < 6 * 864e5;
    const cuando = new Intl.DateTimeFormat('en-US', reciente
      ? { timeZone: 'America/New_York', weekday: 'short' }
      : { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).format(new Date(l[0].cuando));
    return { n, txt: 'arrived ' + cuando + ', ' + (l[0].de ? l[0].de + ' order' : 'invoice') };
  }

  // Las piezas de HTML, iguales en todas las pantallas del teléfono.
  const etiquetaLive = (r) => vivo(r) ? '<span class="m-live"><i></i>Live</span>' : '';
  const etiquetaAgota = (r) => { const a = agota(r); return a ? `<span class="m-out m-out-${a.tono}">${a.txt}</span>` : ''; };

  window.BarStockLiveCache = {
    cargar, caducar, alCambiar, vivo, cuanto, conVivo, texto, agota, toastLoVende, llegadas,
    etiquetaLive, etiquetaAgota, VIVO_MS,
    _reset: () => { _vivo = null; _agota = null; _vivoEn = 0; _pidiendo = null; _otraVez = false; _oyentes.clear(); }
  };
})();
