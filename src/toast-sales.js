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
    for (const p of o.productos || []) {
      for (const [f, b] of Object.entries(p.porDia || {})) botDia.set(f, (botDia.get(f) || 0) + b);
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

    // Lo normal de un día: la mediana de su día de la semana en lo
    // cargado ANTES de él.
    const normal = (f, de) => {
      const w = diaSemana(f);
      const xs = [...cargado].filter(d => d < f && diaSemana(d) === w).map(de);
      return xs.length >= MIN_MUESTRAS ? mediana(xs) : null;
    };

    const ayer = sumarDias(o.hoy, -1);
    const semana = [];
    for (let k = SEMANA - 1; k >= 0; k--) {
      const f = sumarDias(ayer, -k);
      const din = dinDia.get(f) || { licor: 0, vino: 0 };
      semana.push({
        fecha: f, dia: D[diaSemana(f)], cargado: cargado.has(f),
        botellas: r2(botDe(f)), licor: r2(din.licor), vino: r2(din.vino), dinero: r2(din.licor + din.vino),
        normalBotellas: normal(f, botDe), normalDinero: normal(f, dinDe),
        sinPrecio: sinPrecio.get(f) || 0
      });
    }
    return { semana, cargados: cargado.size };
  }

  // Lo más vendido de un día, entero: la tarjeta enseña tres y "All
  // products" enseñará el resto. Botellas por producto del inventario;
  // dinero por artículo de Toast, que es lo que se vende (un cóctel no se
  // reparte entre sus botellas).
  function masVendido(o, fecha, vista) {
    if (vista === 'dinero') {
      const m = new Map();
      for (const v of o.ventas || []) {
        if (v.business_date !== fecha) continue;
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
    return (o.productos || []).map(p => ({ nombre: p.producto, botellas: r2((p.porDia || {})[fecha] || 0) }))
      .filter(x => x.botellas > 0).sort((a, b) => b.botellas - a.botellas);
  }

  // Lo que el dinero deja FUERA ese día (la cerveza, el open bar): el
  // Full report lo dice al pie, para que no desaparezca en silencio.
  // [{ categoria, dinero }] con el nombre de la categoría de Toast.
  function fuera(o, fecha) {
    const m = new Map();
    for (const v of o.ventas || []) {
      if (v.business_date !== fecha) continue;
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

  window.BarStockToastSales = { resumir, masVendido, fuera, semanaDe, ahora, MIN_MUESTRAS, SEMANA,
    ultimaCarga, textoCarga, cargaVieja, VIEJA_H,
    _reset: () => { _datos = null; _en = 0; _de = ''; _pidiendo = null; } };
})();
