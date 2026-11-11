(() => {
  if (window.BarStockRunOut) return;

  // ── Cuándo se acaba cada producto ────────────────────────────────────
  //
  // Axel, 2026-11-08: "desde lo que queda HOY, día por día hacia adelante
  // con lo que se suele gastar CADA día de la semana, aprendido de Toast
  // (mediana, para que un evento no lo infle). No dividir entre un
  // promedio: una semana movida tiene que adelantar el aviso."
  //
  //   1. Lo que se suele gastar cada día de la semana, por producto: la
  //      MEDIANA de los últimos 90 días de Toast. Los días cargados sin
  //      ventas de ese producto cuentan como 0 (un lunes cerrado, 0); los
  //      días que no se cargaron NO cuentan: no se sabe qué pasó.
  //   2. Desde el LIVE de hoy, día por día: se suman los pedidos que
  //      vienen el día que llegan (live-stock.js los apunta en `viene`) y
  //      se resta lo que se suele gastar ese día de la semana.
  //   3. El primer día en que llega a cero es el día que se acaba. Se
  //      mira hasta dos semanas: más allá no se dice nada.
  //
  // Hoy cuenta entero: el LIVE todavía no resta lo vendido hoy (Toast se
  // carga al día siguiente), así que se resta lo que se suele gastar hoy.
  //
  // Sólo lee. No escribe nada (lo vigila test-toast-no-toca-conteo.js).

  const DIAS_HISTORIA = 91;      // 13 semanas
  const HORIZONTE = 14;          // días hacia adelante
  // Con menos de 4 de cada día de la semana la mediana no dice nada: un
  // solo sábado con evento sería "el sábado".
  const MIN_MUESTRAS = 4;

  const diaSemana = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
  const sumarDias = (d, k) => new Date(new Date(d + 'T12:00:00Z').getTime() + k * 864e5).toISOString().slice(0, 10);
  const diaNY = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

  function mediana(xs) {
    if (!xs.length) return 0;
    const o = xs.slice().sort((a, b) => a - b);
    const m = Math.floor(o.length / 2);
    return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
  }

  // productos: [{ producto, porDia: { 'AAAA-MM-DD': botellas } }] (toast-usage)
  // dias:      [{ business_date, complete, closed }]
  function medianas(productos, dias) {
    const cargados = (dias || []).filter(d => d && d.complete && d.closed).map(d => d.business_date);
    const porSemana = [0, 1, 2, 3, 4, 5, 6].map(w => cargados.filter(d => diaSemana(d) === w));
    const muestras = porSemana.map(l => l.length);
    const suficiente = Math.min(...muestras) >= MIN_MUESTRAS;
    const porProducto = new Map();
    for (const p of productos || []) {
      const m = porSemana.map(l => mediana(l.map(d => (p.porDia && p.porDia[d]) || 0)));
      porProducto.set(p.producto, m);
    }
    return { porProducto, muestras, suficiente };
  }

  // stock: el LIVE de hoy · med: [7 medianas, domingo = 0] · viene: [{ cuando, n }]
  function proyectar({ stock, med, viene, hoy, horizonte }) {
    if (!med || !med.some(x => x > 0)) return null;
    let s = Number(stock) || 0;
    const llegan = new Map();
    for (const v of viene || []) {
      const d = diaNY(v.cuando);
      llegan.set(d, (llegan.get(d) || 0) + (Number(v.n) || 0));
    }
    for (let k = 0; k < (horizonte || HORIZONTE); k++) {
      const d = sumarDias(hoy, k);
      s += llegan.get(d) || 0;
      s -= med[diaSemana(d)];
      if (s <= 0) return { dia: d, enDias: k };
    }
    return null;
  }

  // ── Leer y calcular ──────────────────────────────────────────────────
  async function ahora() {
    const L = window.BarStockLive, U = window.BarStockToastUsage;
    if (!L || !U) return { estado: 'error', error: 'Live or Toast usage is not loaded.' };
    const vivo = await L.ahora();
    if (vivo.estado !== 'listo') return { estado: vivo.estado, error: vivo.error };
    const hoy = U.diaDeNegocio(Date.now());
    const h = await U.ventasDesde(sumarDias(hoy, -DIAS_HISTORIA));
    const M = medianas(h.productos, h.dias);
    const filas = vivo.filas.map(f => {
      const med = M.porProducto.get(f.producto) || null;
      const fin = M.suficiente && med ? proyectar({ stock: f.live, med, viene: f.viene, hoy }) : null;
      return Object.assign({}, f, { med, agota: fin ? fin.dia : null, enDias: fin ? fin.enDias : null });
    });
    return { estado: 'listo', hoy, muestras: M.muestras, suficiente: M.suficiente, filas };
  }

  window.BarStockRunOut = { medianas, proyectar, mediana, ahora, DIAS_HISTORIA, HORIZONTE, MIN_MUESTRAS };
})();
