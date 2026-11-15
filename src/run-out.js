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
  // Hoy: lo que FALTA por venderse hoy, no el día entero. Lo de hoy se
  // carga de madrugada, al día siguiente, pero puede cargarse a mano a
  // media tarde (Axel, 2026-11-13, el "sync" de hoy): entonces el LIVE ya
  // resta lo vendido hasta ese momento, y restar además lo que se suele
  // gastar un día entero lo contaría dos veces. Así que el día 0 resta
  // max(0, lo de siempre de hoy − lo ya vendido hoy). Sin nada cargado de
  // hoy, lo ya vendido es 0 y es lo de siempre: el día entero.
  //
  // ── El ritmo de hoy (Axel, 2026-11-14) ────────────────────────────────
  //
  // Lo de arriba tiene un hueco: si hoy ya se vendió MÁS que un día
  // normal, lo que falta sale cero y el día se da por terminado, aunque
  // sean las 3 PM. Pasó con una fiesta a mediodía: el prosecco iba a
  // 12.5 botellas, quedaban 6, y la app decía "Out Thu". "El problema es
  // que la app no pueda decir SE TE ACABA HOY con el ritmo de ventas que
  // lleva."
  //
  // Con lo vendido por hora de toda la barra (toast_sales_days.hours,
  // migración 041) se sabe qué parte del día suele llevar vendida a esa
  // hora: la mediana de los mismos días de la semana (fraccionDelDia).
  // Lo que falta de hoy es lo MAYOR de:
  //   · lo de siempre − lo ya vendido (lo de antes: un día flojo no
  //     retrasa el aviso), y
  //   · lo ya vendido × lo que le falta al día a esa hora (el ritmo).
  // La hora es la del último Sync de hoy, no la del reloj: el LIVE sólo
  // sabe lo vendido hasta que se cargó.
  //
  // Antes de que el día lleve el 15 % no se extrapola: a las 11:30 un
  // trago vendido sería trescientos. Y la curva es de toda la barra: un
  // producto que se vende distinto (el prosecco de un brunch) adelanta el
  // aviso de más, no de menos, que es el lado seguro.
  //
  // Las medianas no se tocan: sólo usan días cerrados y completos
  // (medianas()), así que un hoy cargado a medias no cuenta como un día
  // flojo.
  //
  // Sólo lee. No escribe nada (lo vigila test-toast-no-toca-conteo.js).

  const DIAS_HISTORIA = 91;      // 13 semanas
  const HORIZONTE = 14;          // días hacia adelante
  // Con menos de 4 de cada día de la semana la mediana no dice nada: un
  // solo sábado con evento sería "el sábado".
  const MIN_MUESTRAS = 4;
  // Antes de esta parte del día no se extrapola el ritmo.
  const FRAC_MIN = 0.15;
  // El día de negocio empieza a las 4 AM (toast-usage.js, CORTE_H): las
  // horas de después de medianoche van al final del día, no al principio.
  const CORTE = 4;

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

  // La hora y los minutos de un instante en Nueva York.
  function horaMinNY(iso) {
    const t = new Date(iso);
    if (isNaN(t.getTime())) return null;
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23',
      hour: '2-digit', minute: '2-digit' }).formatToParts(t)) p[x.type] = x.value;
    return { h: Number(p.hour) % 24, m: Number(p.minute) };
  }

  // Qué parte de un día de la semana suele llevar vendida la barra a la
  // hora de `instante`: la mediana de los días cargados ANTES de `fecha`,
  // del mismo día de la semana, cerrados, completos y con horas. Con
  // menos de MIN_MUESTRAS, null: no se sabe. Un día sin ventas (cerrado)
  // no es muestra.
  function fraccionDelDia(dias, fecha, instante) {
    const hm = instante ? horaMinNY(instante) : null;
    if (!hm || !fecha) return null;
    const w = diaSemana(fecha);
    // La posición en el día de negocio: las horas desde las 4 AM.
    const orden = (h) => (h - CORTE + 24) % 24;
    const pos = orden(hm.h);
    const xs = [];
    for (const d of dias || []) {
      if (!d || !d.complete || !d.closed || !d.hours || !Array.isArray(d.hours.q)) continue;
      if (d.business_date >= fecha || diaSemana(d.business_date) !== w) continue;
      const q = d.hours.q;
      let total = 0, antes = 0;
      for (let h = 0; h < 24; h++) {
        const x = Number(q[h]) || 0;
        total += x;
        if (orden(h) < pos) antes += x;
      }
      if (!(total > 0)) continue;
      antes += (Number(q[hm.h]) || 0) * hm.m / 60;
      xs.push(Math.min(1, antes / total));
    }
    return xs.length >= MIN_MUESTRAS ? mediana(xs) : null;
  }

  // Lo que se resta un día: lo de siempre; el día 0, sólo lo que falta
  // (y, con la curva del día, nunca menos que el ritmo que lleva hoy).
  const restaDia = (med, d, k, hoyVendido, hoyFrac) => {
    const m = med[diaSemana(d)] || 0;
    if (k !== 0) return m;
    const v = Number(hoyVendido) || 0;
    const deSiempre = Math.max(0, m - v);
    const f = Number(hoyFrac);
    if (!(v > 0) || !(f >= FRAC_MIN) || f >= 1) return deSiempre;
    return Math.max(deSiempre, v * (1 - f) / f);
  };

  // stock: el LIVE de hoy · med: [7 medianas, domingo = 0] · viene: [{ cuando, n }]
  // hoyVendido: lo de hoy que el LIVE ya restó (0 si hoy no está cargado)
  // hoyFrac:    qué parte del día suele ir vendida a la hora del Sync
  //             (fraccionDelDia), o null si no se sabe
  function proyectar({ stock, med, viene, hoy, horizonte, hoyVendido, hoyFrac }) {
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
      s -= restaDia(med, d, k, hoyVendido, hoyFrac);
      if (s <= 0) return { dia: d, enDias: k };
    }
    return null;
  }

  // ── Cuánto pedir para llegar al domingo ──────────────────────────────
  //
  // Axel, 2026-11-12, para el correo de la mañana: lo que se suele vender
  // cada día desde HOY hasta el DOMINGO, incluidas todas sus ventas (el
  // conteo es el domingo al cerrar), menos lo que queda y lo que llega
  // antes, redondeado hacia arriba a botellas enteras. Se acaba el
  // miércoles → hacen falta más; el sábado → menos.
  //
  // NO hasta la siguiente entrega del proveedor: a mitad de semana ningún
  // proveedor vuelve a entregar, y lo que falta se busca igual o parecido
  // en LOOP, que se recoge al momento.
  //
  // Un LIVE negativo (se vendió más de lo contado) cuenta como cero: no
  // hay botellas de menos en la estantería, hay un conteo que se quedó
  // corto. El margen al redondear es para la coma flotante: 8.3 − 0.3 no
  // puede pedir 9.
  //
  // Hoy, como en proyectar(): sólo lo que falta por venderse hoy.
  function cuantoPedir({ stock, med, viene, hoy, hoyVendido, hoyFrac }) {
    const faltanDias = (7 - diaSemana(hoy)) % 7;
    const hasta = sumarDias(hoy, faltanDias);
    let vende = 0;
    for (let k = 0; k <= faltanDias; k++) vende += med ? restaDia(med, sumarDias(hoy, k), k, hoyVendido, hoyFrac) : 0;
    let llega = 0;
    for (const v of viene || []) if (diaNY(v.cuando) <= hasta) llega += Number(v.n) || 0;
    const falta = vende - Math.max(0, Number(stock) || 0) - llega;
    const pedir = falta > 1e-6 ? Math.ceil(falta - 1e-6) : 0;
    return { hasta, vende, llega, pedir };
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
    // Lo vendido HOY por producto, de la misma lectura: es lo que el LIVE
    // ya restó si hoy se cargó (los dos leen toast_sales igual).
    const hoyDe = new Map((h.productos || []).map(p => [p.producto, (p.porDia && p.porDia[hoy]) || 0]));
    // El ritmo de hoy, a la hora del último Sync de hoy (fetched_at): lo
    // vendido que el LIVE conoce es lo de esa hora, no lo de ahora.
    const diaHoy = (h.dias || []).find(d => d && d.business_date === hoy);
    const hoyFrac = diaHoy && diaHoy.fetched_at ? fraccionDelDia(h.dias, hoy, diaHoy.fetched_at) : null;
    const filas = vivo.filas.map(f => {
      const med = M.porProducto.get(f.producto) || null;
      const hoyVendido = hoyDe.get(f.producto) || 0;
      const fin = M.suficiente && med ? proyectar({ stock: f.live, med, viene: f.viene, hoy, hoyVendido, hoyFrac }) : null;
      return Object.assign({}, f, { med, hoyVendido, hoyFrac, agota: fin ? fin.dia : null, enDias: fin ? fin.enDias : null });
    });
    return { estado: 'listo', hoy, conteo: vivo.conteo, desde: vivo.desde, muestras: M.muestras, suficiente: M.suficiente, filas };
  }

  window.BarStockRunOut = { medianas, proyectar, cuantoPedir, mediana, fraccionDelDia, ahora, DIAS_HISTORIA, HORIZONTE, MIN_MUESTRAS, FRAC_MIN };
})();
