(() => {
  if (window.BarStockToastSales) return;

  // ── Toast Sales: lo vendido cada día, en botellas y en dinero ────────
  //
  // La tarjeta del Home (Axel, 2026-11-12, sobre lámina): la semana en
  // barras, con una raya que marca lo de un día normal; el total y las
  // tres más vendidas del día elegido; y un cambio Bottles / $.
  //
  // Todo sale de la MISMA lectura que el LIVE y "cuándo se acaba"
  // (toast-usage.ventasDesde): las botellas, del mismo cálculo por
  // receta, y el dinero, de toast_sales.net.
  //
  // El dinero es el Net sales de Toast: medido contra su informe del
  // 2026-11-10 al centavo. Los modificadores ya van dentro y no se suman.
  // Se parte en licor (los cócteles los vende Toast dentro de "Liquor") y
  // vino; la cerveza fuera, y el open bar ("Banquet Beverage") también:
  // Axel pidió licor y vino.
  //
  // La semana son los siete días CERRADOS hasta ayer: hoy sigue abierto y
  // su barra crecería a lo largo del día como si fuera un día flojo.
  //
  // "Un día normal" es la mediana de ese día de la semana en lo cargado
  // antes de él (run-out.mediana, la misma que "cuándo se acaba"), con al
  // menos cuatro muestras: con menos, un solo sábado con evento sería "el
  // sábado".
  //
  // Sólo lee.

  const DIAS_HISTORIA = 92;
  const SEMANA = 7;
  const MIN_MUESTRAS = 4;
  const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const sumarDias = (d, k) => new Date(new Date(d + 'T12:00:00Z').getTime() + k * 864e5).toISOString().slice(0, 10);
  const diaSemana = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
  const r2 = (n) => Math.round(n * 100) / 100;
  const esLicor = (c) => /liquor/i.test(String(c || ''));
  const esVino = (c) => /wine/i.test(String(c || ''));

  function mediana(xs) {
    const R = window.BarStockRunOut;
    if (R && R.mediana) return R.mediana(xs);
    if (!xs.length) return 0;
    const o = xs.slice().sort((a, b) => a - b), m = Math.floor(o.length / 2);
    return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
  }

  // ── El cálculo, sin red ──────────────────────────────────────────────
  //
  // o = { productos, ventas, dias, hoy }
  //   productos  [{ producto, porDia: { fecha: botellas } }] (toast-usage)
  //   ventas     filas de toast_sales con net y sales_category
  //   dias       [{ business_date, complete, closed, fetched_at }]
  //   hoy        el día de negocio de hoy, 'AAAA-MM-DD'
  function resumir(o) {
    const cargado = new Set((o.dias || []).filter(d => d && d.complete && d.closed).map(d => d.business_date));
    const botDia = new Map(), dinDia = new Map();
    // Las botellas partidas en licor y vino, con la misma regla que el
    // dinero (esLicor / esVino): el correo de la mañana enseña las dos
    // filas. Sale de la categoría de Toast de cada botella (catPorDia,
    // toast-usage.js); lo que no es ni licor ni vino no entra en ninguna.
    const botCat = new Map();
    for (const p of o.productos || []) {
      for (const [f, b] of Object.entries(p.porDia || {})) botDia.set(f, (botDia.get(f) || 0) + b);
      for (const [f, cs] of Object.entries(p.catPorDia || {})) {
        const x = botCat.get(f) || { licor: 0, vino: 0 };
        for (const [c, b] of Object.entries(cs || {})) {
          if (esLicor(c)) x.licor += b; else if (esVino(c)) x.vino += b;
        }
        botCat.set(f, x);
      }
    }
    const sinPrecio = new Map();
    for (const v of o.ventas || []) {
      const lic = esLicor(v.sales_category), vin = esVino(v.sales_category);
      if (!lic && !vin) continue;
      const f = v.business_date;
      if (!dinDia.has(f)) dinDia.set(f, { licor: 0, vino: 0 });
      if (v.net === null || v.net === undefined) { sinPrecio.set(f, (sinPrecio.get(f) || 0) + 1); continue; }
      dinDia.get(f)[lic ? 'licor' : 'vino'] += Number(v.net) || 0;
    }
    const botDe = (f) => botDia.get(f) || 0;
    const dinDe = (f) => { const x = dinDia.get(f); return x ? x.licor + x.vino : 0; };
    const botLic = (f) => (botCat.get(f) || {}).licor || 0;
    const botVin = (f) => (botCat.get(f) || {}).vino || 0;
    const dinLic = (f) => (dinDia.get(f) || {}).licor || 0;
    const dinVin = (f) => (dinDia.get(f) || {}).vino || 0;

    // Lo normal de un día: la mediana de su día de la semana en lo
    // cargado ANTES de él.
    const normal = (f, de) => {
      const w = diaSemana(f);
      const xs = [...cargado].filter(d => d < f && diaSemana(d) === w).map(de);
      return xs.length >= MIN_MUESTRAS ? mediana(xs) : null;
    };

    const ayer = sumarDias(o.hoy, -1);
    const semana = [];
    const entrada = (f) => {
      const din = dinDia.get(f) || { licor: 0, vino: 0 };
      return {
        fecha: f, dia: D[diaSemana(f)], cargado: cargado.has(f),
        botellas: r2(botDe(f)), licor: r2(din.licor), vino: r2(din.vino), dinero: r2(din.licor + din.vino),
        normalBotellas: normal(f, botDe), normalDinero: normal(f, dinDe),
        botLicor: r2(botLic(f)), botVino: r2(botVin(f)),
        normalBotLicor: normal(f, botLic), normalBotVino: normal(f, botVin),
        normalLicor: normal(f, dinLic), normalVino: normal(f, dinVin),
        sinPrecio: sinPrecio.get(f) || 0
      };
    };
    for (let k = SEMANA - 1; k >= 0; k--) semana.push(entrada(sumarDias(ayer, -k)));

    // ── Hoy, si se cargó a mano (el Sync de la tarjeta "Sold") ──────────
    //
    // Axel, 2026-11-13: con ventas de hoy la tarjeta dice "Sold today" y
    // la hora del sync. `semana` sigue acabando AYER: es la de días
    // cerrados, y el correo de la mañana toma su último día como "ayer".
    // Lo de hoy va aparte, `hoy`, sólo si su día está cargado (aunque sea
    // con cero: "none today yet"), con la hora en que se cargó. Lo normal
    // de hoy es el de un día entero; quien lo enseñe no compara un día a
    // medias contra uno entero como si fueran lo mismo.
    const filaHoy = (o.dias || []).find(d => d && d.business_date === o.hoy);
    const hoy = filaHoy ? Object.assign(entrada(o.hoy), { parcial: !filaHoy.closed, sincronizado: filaHoy.fetched_at || null }) : null;
    // `dia`: la misma entrada para cualquier fecha. La usa semanaCal()
    // para la semana de calendario, así un martes dice lo mismo en la
    // vista de siempre que en la de lunes a domingo.
    return { semana, cargados: cargado.size, hoy, dia: entrada, desde: cargado.size ? [...cargado].sort()[0] : null };
  }

  // ── La semana de calendario (Axel, 2026-11-14, opción B + A) ────────
  //
  // La tarjeta de Toast pasa de "los últimos siete días" a una semana de
  // LUNES A DOMINGO, la de Toast, con flechas para ir a las anteriores
  // (hay ~13 semanas cargadas). Se sigue viendo un día; tocar el total
  // de la semana pone la semana entera en el número grande.
  //
  // semanaCal(V, atras) → { lunes, etiqueta: 'Nov 3 – 9', dias: [7],
  // total, fechas }. `atras` = 0 es la semana de hoy. Cada día es la
  // entrada de resumir (V.dia); los que aún no llegan, `futuro`. Hoy, el
  // de V.hoy si se cargó (a medias, `parcial`); si no, sin datos.
  //
  // El total es la SUMA de esos mismos días (no otro cálculo), y "lo
  // normal" de una semana, la mediana de las semanas enteras ANTERIORES
  // con sus siete días cargados, con al menos MIN_MUESTRAS. La semana en
  // curso es `parcial`: no se compara en % contra una entera.
  const MES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const lunesDe = (f) => sumarDias(f, -((diaSemana(f) + 6) % 7));
  function etiquetaSemana(lunes) {
    const a = new Date(lunes + 'T12:00:00Z'), b = new Date(sumarDias(lunes, 6) + 'T12:00:00Z');
    return MES[a.getUTCMonth()] + ' ' + a.getUTCDate() + ' – ' +
      (a.getUTCMonth() === b.getUTCMonth() ? '' : MES[b.getUTCMonth()] + ' ') + b.getUTCDate();
  }
  const CAMPOS = ['dinero', 'licor', 'vino', 'botellas', 'botLicor', 'botVino', 'sinPrecio'];
  // Ojo con `hoy`: en lo que devuelve ahora(), V.hoy es la ENTRADA de hoy
  // (la del Sync, o null) y la fecha es V.base.hoy. Se tomaba V.hoy por
  // la fecha y las fechas salían inválidas.
  const fechaHoy = (V) => (V.base && V.base.hoy) || (typeof V.hoy === 'string' ? V.hoy : null);
  const entradaHoy = (V) => (V.hoy && typeof V.hoy === 'object') ? V.hoy : null;
  function diasDe(V, lunes) {
    const hoy = fechaHoy(V), eh = entradaHoy(V);
    const out = [];
    for (let k = 0; k < 7; k++) {
      const f = sumarDias(lunes, k);
      if (f > hoy) { out.push(Object.assign(V.dia(f), { futuro: true })); continue; }
      if (f === hoy) { out.push(Object.assign(eh ? Object.assign({}, eh) : V.dia(f), { esHoy: true })); continue; }
      out.push(V.dia(f));
    }
    return out;
  }
  function sumar(dias) {
    const t = {};
    for (const c of CAMPOS) t[c] = r2(dias.reduce((a, x) => a + (Number(x[c]) || 0), 0));
    return t;
  }
  function semanaCal(V, atras) {
    if (!V || !V.dia || !fechaHoy(V)) return null;
    const lunes = sumarDias(lunesDe(fechaHoy(V)), -7 * (Number(atras) || 0));
    const dias = diasDe(V, lunes);
    const parcial = dias.some(x => x.futuro || x.esHoy);
    // Lo normal: las semanas anteriores con sus siete días cargados.
    const prev = { dinero: [], botellas: [] };
    for (let j = 1; j <= 13; j++) {
      const l = sumarDias(lunes, -7 * j);
      if (V.desde && sumarDias(l, 6) < V.desde) break;
      const ds = diasDe(V, l);
      if (!ds.every(x => x.cargado && !x.futuro && !x.esHoy)) continue;
      const t = sumar(ds);
      prev.dinero.push(t.dinero); prev.botellas.push(t.botellas);
    }
    const norm = (xs) => xs.length >= MIN_MUESTRAS ? mediana(xs) : null;
    const total = Object.assign(sumar(dias), {
      semana: true, fecha: lunes, dia: etiquetaSemana(lunes),
      cargado: dias.some(x => x.cargado), parcial,
      normalDinero: parcial ? null : norm(prev.dinero),
      normalBotellas: parcial ? null : norm(prev.botellas)
    });
    return { lunes, etiqueta: etiquetaSemana(lunes), dias, total, fechas: dias.filter(x => !x.futuro).map(x => x.fecha) };
  }
  // ¿Cuántas semanas atrás hay algo cargado? Las flechas no van más allá.
  function semanasAtras(V) {
    if (!V || !V.desde || !fechaHoy(V)) return 0;
    let n = 0;
    while (n < 52 && sumarDias(lunesDe(fechaHoy(V)), -7 * (n + 1)) >= lunesDe(V.desde)) n++;
    return n;
  }

  // Lo más vendido de un día, entero: la tarjeta enseña tres y "All
  // products" enseñará el resto. Botellas por producto del inventario;
  // dinero por artículo de Toast, que es lo que se vende (un cóctel no se
  // reparte entre sus botellas).
  // `fecha` puede ser una lista: lo más vendido de una semana entera.
  const enFechas = (fecha) => { const s = new Set(Array.isArray(fecha) ? fecha : [fecha]); return (f) => s.has(f); };
  function masVendido(o, fecha, vista) {
    const en = enFechas(fecha);
    if (vista === 'dinero') {
      const m = new Map();
      for (const v of o.ventas || []) {
        if (!en(v.business_date)) continue;
        if (!esLicor(v.sales_category) && !esVino(v.sales_category)) continue;
        if (v.net === null || v.net === undefined) continue;
        const k = v.toast_item_name;
        // Licor o vino: el Full report los enseña en dos secciones.
        const x = m.get(k) || { nombre: k, dinero: 0, unidades: 0,
          categoria: esLicor(v.sales_category) ? 'licor' : 'vino' };
        x.dinero += Number(v.net) || 0;
        x.unidades += Number(v.quantity) || 0;
        m.set(k, x);
      }
      return [...m.values()].map(x => Object.assign(x, { dinero: r2(x.dinero) }))
        .filter(x => x.dinero > 0).sort((a, b) => b.dinero - a.dinero);
    }
    return (o.productos || []).map(p => ({ nombre: p.producto,
      botellas: r2(Object.entries(p.porDia || {}).reduce((a, [f, b]) => a + (en(f) ? Number(b) || 0 : 0), 0)) }))
      .filter(x => x.botellas > 0).sort((a, b) => b.botellas - a.botellas);
  }

  // Lo que el dinero deja FUERA ese día (la cerveza, el open bar): el
  // Full report lo dice al pie, para que no desaparezca en silencio.
  // [{ categoria, dinero }] con el nombre de la categoría de Toast.
  function fuera(o, fecha) {
    const en = enFechas(fecha);
    const m = new Map();
    for (const v of o.ventas || []) {
      if (!en(v.business_date)) continue;
      if (esLicor(v.sales_category) || esVino(v.sales_category)) continue;
      const k = v.sales_category || '(no category)';
      m.set(k, (m.get(k) || 0) + (Number(v.net) || 0));
    }
    return [...m.entries()].map(([categoria, d]) => ({ categoria, dinero: r2(d) }))
      .sort((a, b) => b.dinero - a.dinero);
  }

  // La semana de UN producto, en botellas, para su ficha: los mismos
  // siete días cerrados hasta ayer que la tarjeta del Home.
  function semanaDe(o, producto) {
    const p = (o.productos || []).find(x => x.producto === producto);
    const cargado = new Set((o.dias || []).filter(d => d && d.complete && d.closed).map(d => d.business_date));
    const ayer = sumarDias(o.hoy, -1);
    const out = [];
    for (let k = SEMANA - 1; k >= 0; k--) {
      const f = sumarDias(ayer, -k);
      out.push({ fecha: f, dia: D[diaSemana(f)], semana: diaSemana(f), cargado: cargado.has(f),
        botellas: r2(p && p.porDia ? p.porDia[f] || 0 : 0) });
    }
    return out;
  }

  // ── Leer ─────────────────────────────────────────────────────────────
  //
  // Una vez por día de negocio y cada 30 minutos como mucho: lo de Toast
  // se carga de madrugada, y una semana cerrada no cambia durante el día.
  const VIVO_MS = 30 * 60 * 1000;
  let _datos = null, _en = 0, _de = '', _pidiendo = null;

  function ahora() {
    const U = window.BarStockToastUsage;
    if (!U || !U.ventasDesde) return Promise.resolve(null);
    const hoy = U.diaDeNegocio(Date.now());
    if (_datos && _de === hoy && Date.now() - _en < VIVO_MS) return Promise.resolve(_datos);
    if (_pidiendo) return _pidiendo;
    _pidiendo = U.ventasDesde(sumarDias(hoy, -DIAS_HISTORIA)).then(h => {
      const base = { productos: h.productos, ventas: h.ventas, dias: h.dias, hoy };
      _datos = Object.assign({ hoy, base }, resumir(base));
      _en = Date.now(); _de = hoy;
      return _datos;
    }).finally(() => { _pidiendo = null; });
    return _pidiendo;
  }

  // ── Cuándo se cargó lo último ────────────────────────────────────
  //
  // El encabezado de la tarjeta dice "Sales · synced Nov 12 · 5:02 AM"
  // (Axel, 2026-11-12, sobre lámina): contesta si los números ya están
  // al día. Es el fetched_at más nuevo de toast_sales_days, que se
  // escribe en cada carga (lib/toast.js, sync).
  function ultimaCarga(dias) {
    let mejor = null, ms = -Infinity;
    for (const d of dias || []) {
      const t = d && d.fetched_at ? Date.parse(d.fetched_at) : NaN;
      if (t > ms) { ms = t; mejor = d.fetched_at; }
    }
    return mejor;
  }

  // En hora de Nueva York, como el resto de la app: "Nov 12 · 5:02 AM".
  function textoCarga(iso) {
    const f = new Date(iso);
    const o = { timeZone: 'America/New_York' };
    return f.toLocaleDateString('en-US', Object.assign({ month: 'short', day: 'numeric' }, o)) + ' · ' +
      f.toLocaleTimeString('en-US', Object.assign({ hour: 'numeric', minute: '2-digit' }, o));
  }

  // Ámbar cuando lleva "mucho" sin cargarse. La carga de Vercel corre a
  // las 5 y a las 7 AM (lib/toast-cron.js): justo antes de las 7, la
  // última puede tener 24 h y es normal. Pasadas 26, fallaron las dos de
  // un día. Sin ninguna carga tampoco está al día: no se pinta verde.
  const VIEJA_H = 26;
  function cargaVieja(iso, ahoraMs) {
    const t = iso ? Date.parse(iso) : NaN;
    if (!(t > 0)) return true;
    return ((ahoraMs === undefined ? Date.now() : ahoraMs) - t) > VIEJA_H * 3600e3;
  }

  // ── La semana que se ENSEÑA: con hoy, si hoy ya vendió ─────────────
  //
  // La tarjeta grande y el Full report (mobile-sales.js) eligen el día
  // por su posición en esta lista: tiene que ser la misma en los dos, o
  // "el último" sería hoy en uno y ayer en el otro. Con ventas de hoy
  // cargadas, los siete días acaban hoy (el primero sale); si no, es la
  // semana cerrada de siempre.
  function semanaConHoy(v) {
    if (!v || !v.semana) return [];
    const h = v.hoy;
    if (!h || !(h.dinero > 0 || h.botellas > 0)) return v.semana;
    return v.semana.slice(1).concat([h]);
  }

  // ── Cargar lo vendido HOY, a mano ────────────────────────────────────
  //
  // Axel, 2026-11-13: el botón Sync de la tarjeta "Sold" (mobile-home).
  // Es la acción `sync` de siempre (lib/toast.js), con el día de negocio
  // de hoy y la locación abierta: la misma que hace la carga de la
  // madrugada. No se encima: sync BORRA las ventas de ese día y las
  // vuelve a escribir, así que sincronizar a las 6 y a las 10 deja lo de
  // las 10; y la madrugada recarga el día entero porque queda sin cerrar.
  // El LIVE resta lo cargado, y "cuándo se acaba" resta de hoy sólo lo
  // que falta (run-out.js).
  //
  // Si falla, lanza con lo que dijo el servidor, tal cual: quien llama lo
  // enseña. Si sale bien, avisa (toastSalesUpdated) y se relee todo lo
  // que cuelga de las ventas: esto mismo, y el LIVE (live-cache.js).
  async function sincronizarHoy() {
    const U = window.BarStockToastUsage, D = window.BarStockDevPanel;
    if (!U || !D || !D.llamar) throw new Error('The app is not fully loaded yet.');
    const hoy = U.diaDeNegocio(Date.now());
    const loc = await window.BarStockInventoryCloud.fetchLocationId();
    const r = await D.llamar('toast', 'sync', { businessDate: hoy.replace(/-/g, ''), locationId: loc });
    if (!r || !r.ok) {
      const que = r ? (r.error || (r.paso ? 'step "' + r.paso + '" failed' + (r.status ? ' (' + r.status + ')' : '') : '') ||
        (r.crudo ? String(typeof r.crudo === 'string' ? r.crudo : JSON.stringify(r.crudo)).slice(0, 160) : '')) : '';
      throw new Error(que || 'no answer from the server');
    }
    olvidar();
    if (window.BarStockEvents && window.BarStockEvents.emit) window.BarStockEvents.emit('toastSalesUpdated', { fecha: hoy });
    return r;
  }

  // Un Sync de hoy (o cualquier carga) cambia lo vendido: se olvida lo
  // guardado para que la próxima lectura lo traiga.
  function olvidar() { _datos = null; _en = 0; _de = ''; }
  if (window.BarStockEvents && window.BarStockEvents.on) window.BarStockEvents.on('toastSalesUpdated', olvidar);

  window.BarStockToastSales = { resumir, masVendido, fuera, semanaDe, ahora, MIN_MUESTRAS, SEMANA, semanaConHoy, sincronizarHoy,
    semanaCal, semanasAtras, etiquetaSemana,
    ultimaCarga, textoCarga, cargaVieja, VIEJA_H,
    _reset: () => { _datos = null; _en = 0; _de = ''; _pidiendo = null; } };
})();
