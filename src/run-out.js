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

  // ── La fecha prudente (Axel, 2026-11-14) ─────────────────────────────
  //
  // Con el Dad's Hat a ≈1.0 un sábado por la noche la app decía "Out
  // Wed". Axel: "no sé si hay más de una, pero puede haber menos de una".
  // El LIVE es un estimado, y la fecha se calculaba como si fuera exacto.
  // Hasta que el esperado mida cuánto falla el LIVE de cada producto
  // (docs/plan-esperado.md), la fecha y lo que hay que pedir se calculan
  // con MARGEN botellas menos: avisar antes es el lado seguro. El número
  // grande no cambia; sólo la fecha y el "Order N", los dos con el mismo
  // margen para que no se contradigan. Cuando haya semanas guardadas,
  // este número fijo lo sustituye el de cada producto: lo que ese
  // producto suele fallar, que se encoge solo si sus recetas se arreglan.
  //
  // Del tamaño de la duda, no fijo (el mismo día): media botella para
  // todos metía en "Running out first" lo que casi no se mueve (Don
  // Julio a ≈0.5: 0.5 − 0.5 = 0, mientras su fila decía "19 days").
  // Axel: "exactamente de qué me sirve? Eso no debería ni aparecer". La
  // duda del LIVE es lo que Toast le restó desde el conteo: el margen es
  // MARGEN_PARTE de eso, nunca más de MARGEN. Lo que no se ha movido no
  // lleva margen; lo que Toast no descuenta (running-out.js, Pour·IQ)
  // tampoco: su número es lo contado.
  const MARGEN = 0.5;
  const MARGEN_PARTE = 0.25;
  // Con una verificación (2026-11-14), la duda empieza en ella: lo
  // vendido DESPUÉS de que alguien miró la estantería.
  const margenDe = (f) => Math.min(MARGEN, MARGEN_PARTE * Math.max(0,
    Number(f && (f.verificado ? f.vendidoVerif : f.vendido)) || 0));

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
  // La cuenta de un día (qué parte se había vendido a esa hora) es
  // toast-usage.fraccionDia, la misma que reparte el día del conteo: dos
  // copias de la misma cuenta acaban diciendo cosas distintas.
  function fraccionDelDia(dias, fecha, instante) {
    const U = window.BarStockToastUsage;
    if (!instante || !fecha || !U || !U.fraccionDia) return null;
    const w = diaSemana(fecha);
    const xs = [];
    for (const d of dias || []) {
      if (!d || !d.complete || !d.closed || !d.hours || !Array.isArray(d.hours.q)) continue;
      if (d.business_date >= fecha || diaSemana(d.business_date) !== w) continue;
      const f = U.fraccionDia(d.hours.q, instante);
      if (f != null) xs.push(f);
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

  // ── De cuándo se acaba a pedido.js (fase 2 de docs/plan-pedido.md) ──
  //
  // La cuenta día por día vive en BarStockPedido.seAcaba, una sola. Lo
  // que cambia contra la de antes (Axel, 2026-11-18, con el Nino a 3.1 un
  // miércoles que vende 4, fuera de Running out):
  //   · lo de cada día es la demanda de pedido.demanda(): lo MAYOR de
  //     Pour·IQ y lo vendido en Toast las 4 últimas semanas, con la forma
  //     de la semana de Toast. La mediana de 13 semanas no seguía al
  //     producto que se dispara.
  //   · más un colchón del 80 % (Axel), que crece con lo que se usa.
  //   · una entrega cuenta a SU hora: la de las 4 PM no salva el mediodía.
  // Lo de hoy (restaDia, con el ritmo) y el margen de la fecha prudente
  // siguen aquí y entran igual.
  //
  // stock: el LIVE de hoy · med: [7, domingo = 0] (sin dem: lo de cada día
  //        sin colchón) · dem: pedido.demanda() · viene: [{ cuando, n }]
  // ahora: el instante (ms); sin él, el principio del día `hoy`
  // hoyVendido, hoyFrac, margen: como en restaDia y margenDe
  function proyectar({ stock, med, dem, viene, hoy, ahora, horizonte, hoyVendido, hoyFrac, margen }) {
    const P = window.BarStockPedido;
    const d = dem || (med ? { porDia: med, semanal: med.reduce((a, b) => a + (Number(b) || 0), 0), sigma: 0 } : null);
    if (!P || !d || !d.porDia || !d.porDia.some(x => x > 0)) return null;
    const r = P.seAcaba({
      dem: d, stock: (Number(stock) || 0) - (Number(margen) || 0),
      viene: (viene || []).map(v => ({ cuando: Date.parse(v.cuando), n: Number(v.n) || 0 })),
      ahora: ahora != null ? ahora : P.inicio(hoy), dias: horizonte || HORIZONTE,
      hoyResta: restaDia(d.porDia, hoy, 0, hoyVendido, hoyFrac)
    });
    return r ? { dia: r.dia, enDias: r.enDias } : null;
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
  // Hoy, como en proyectar(): sólo lo que falta por venderse hoy. Con
  // `dem` (pedido.demanda), lo de cada día es el suyo y lleva el mismo
  // colchón que el aviso: si no, la tarjeta diría "Out Thu" y "Order 0".
  //
  // Con una entrega YA en camino que llega después de que se acabe (Axel,
  // 2026-11-18: el Canyon Oaks pedía 15 con 24 llegando mañana), lo que
  // se pide es lo que FALTA hasta ella: la compra de LOOP para aguantar,
  // no la semana entera. Sale de pedido.recorrido, la cuenta de las
  // barras, así que el número y las barras dicen lo mismo. Sin nada en
  // camino, como siempre: hasta el domingo.
  function cuantoPedir({ stock, med, dem, viene, hoy, hoyVendido, hoyFrac, margen, ahora }) {
    const puente = hastaLaEntrega({ stock, dem, viene, hoy, hoyVendido, hoyFrac, margen, ahora });
    if (puente) return puente;
    if (dem && dem.porDia) med = dem.porDia;
    const faltanDias = (7 - diaSemana(hoy)) % 7;
    const hasta = sumarDias(hoy, faltanDias);
    let vende = 0;
    for (let k = 0; k <= faltanDias; k++) vende += med ? restaDia(med, sumarDias(hoy, k), k, hoyVendido, hoyFrac) : 0;
    let llega = 0;
    for (const v of viene || []) if (diaNY(v.cuando) <= hasta) llega += Number(v.n) || 0;
    const colchon = dem && window.BarStockPedido ? window.BarStockPedido.colchonDe(dem, vende) : 0;
    const falta = vende + colchon - Math.max(0, (Number(stock) || 0) - (Number(margen) || 0)) - llega;
    const pedir = falta > 1e-6 ? Math.ceil(falta - 1e-6) : 0;
    return { hasta, vende, colchon, llega, pedir };
  }

  function hastaLaEntrega({ stock, dem, viene, hoy, hoyVendido, hoyFrac, margen, ahora }) {
    const P = window.BarStockPedido;
    if (!P || !P.recorrido || !dem || !dem.porDia || !(viene || []).length) return null;
    const t = ahora || Date.now();
    const base = {
      dem, stock: (Number(stock) || 0) - (Number(margen) || 0),
      viene: (viene || []).map(v => ({ cuando: Date.parse(v.cuando), n: Number(v.n) || 0 })),
      ahora: t, dias: 14, hoyResta: restaDia(dem.porDia, hoy, 0, hoyVendido, hoyFrac)
    };
    const r = P.recorrido(base);
    if (!r.fin) return null;
    // La primera entrega que llega en el momento en que se acaba o
    // después: la que no se alcanza. Con `>=`: recorrido mira justo ANTES
    // de sumar cada llegada, así que el cruce cae muchas veces EN su hora
    // (el Nino de Crown, 7.1 con 48 llegando a las 4 PM: con `>` no la
    // encontraba, caía a la cuenta del domingo y decía "Covered to Sun"
    // junto a "Out Thu"). Si ninguna, la cuenta de siempre.
    const sig = base.viene.filter(v => v.n > 0 && v.cuando >= r.fin.en).sort((a, b) => a.cuando - b.cuando)[0];
    if (!sig) return null;
    const falta = P.recorrido(Object.assign({}, base, { hasta: sig.cuando })).falta;
    const pedir = falta > 1e-6 ? Math.ceil(falta - 1e-6) : 0;
    return { hasta: diaNY(sig.cuando), vende: null, colchon: null, llega: 0, pedir,
      entrega: { cuando: new Date(sig.cuando).toISOString(), n: sig.n } };
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
    // La hora del Sync de hoy, para decir "12.5 sold today by 3 PM".
    const hoySync = diaHoy && diaHoy.fetched_at ? diaHoy.fetched_at : null;
    // La demanda de cada producto que Toast vende (pedido.demanda): Pour·IQ
    // de window.parAdjustments, que la app calcula al cargar y el correo
    // en el servidor (lib/morning-cron.js); sin él, Toast solo.
    const P = window.BarStockPedido;
    const cargados = (h.dias || []).filter(d => d && d.complete && d.closed).map(d => d.business_date);
    const porProd = new Map((h.productos || []).map(p => [p.producto, p]));
    const master = new Map((((window.state && window.state.master) || [])).filter(r => r && r.item).map(r => [r.item, r]));
    const pa = window.parAdjustments;
    const pouriqDe = (item) => {
      const r = master.get(item);
      const a = r && pa && pa.get ? pa.get(r.item + '||' + (r.code || '')) : null;
      return a && a.status === 'active' ? { avg: a.avgUsed, sd: a.stdDev, semanas: a.normalWeeks } : null;
    };
    const t = Date.now();
    const filas = vivo.filas.map(f => {
      const vende = M.porProducto.get(f.producto) || null;
      const p = porProd.get(f.producto);
      const dem = M.suficiente && vende && vende.some(x => x > 0) && P && p
        ? P.demanda({ pouriq: pouriqDe(f.producto), toast: { porDia: p.porDia || {}, cargados }, hoy }) : null;
      const med = dem ? dem.porDia : vende;
      const hoyVendido = hoyDe.get(f.producto) || 0;
      const margen = margenDe(f);
      const fin = dem ? proyectar({ stock: f.live, dem, viene: f.viene, hoy, ahora: t, hoyVendido, hoyFrac, margen }) : null;
      // Vino si Toast lo vende como vino: el redondeo de 3 en 3 de la
      // sugerencia lo necesita, y casi nada del maestro tiene categoría.
      const vino = !!(p && Object.values(p.catPorDia || {}).some(c => Object.keys(c || {}).some(k => /wine/i.test(k))));
      return Object.assign({}, f, { med, dem, vino, hoyVendido, hoyFrac, hoySync, ahoraMs: t, margen, agota: fin ? fin.dia : null, enDias: fin ? fin.enDias : null });
    });
    return { estado: 'listo', hoy, conteo: vivo.conteo, desde: vivo.desde, muestras: M.muestras, suficiente: M.suficiente, filas };
  }

  // ── El por qué (fase 3 de docs/plan-pedido.md, Axel 2026-11-18, E) ──
  //
  // Bajo cada producto de Running out: lo que quedará al final de cada
  // día (recorridoDe) y una frase (porQue). Las dos salen de la fila de
  // ahora(), con la misma cuenta que su "Out" (pedido.recorrido), y la
  // frase de plantillas que eligen los números: nunca dice lo que los
  // datos no dicen. Sin `dem` (lo que Toast no vende) no hay ni una ni
  // otra: no se sabe nada día por día.
  const DIAS_BARRAS = 5;
  function recorridoDe(f, dias) {
    const P = window.BarStockPedido;
    if (!P || !f || !f.dem || !f.dem.porDia) return null;
    const hoy = P.diaDe(f.ahoraMs || Date.now());
    return P.recorrido({
      dem: f.dem, stock: (Number(f.live) || 0) - (Number(f.margen) || 0),
      viene: (f.viene || []).map(v => ({ cuando: Date.parse(v.cuando), n: Number(v.n) || 0 })),
      ahora: f.ahoraMs || Date.now(), dias: dias || DIAS_BARRAS,
      hoyResta: restaDia(f.dem.porDia, hoy, 0, f.hoyVendido, f.hoyFrac)
    });
  }

  const D3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const uno = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
  const horaNY = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
    .format(new Date(iso)).replace(':00', '').replace(/\s/g, ' ');
  // Por encima de esto, hoy "va muy por encima" o "se vende más".
  const MUCHO = 1.3;

  // → { texto, tipo: 'hoy' | 'sube' | 'normal' } o null.
  // Las razones, por orden (lámina): (1) hoy va muy por encima de un día
  // normal, sola porque ya dice su "usual"; (2) se vende más que de
  // costumbre, con (3) lo que se suele usar hasta que se acaba; si no,
  // (3) con (4) lo que viene o no.
  function porQue(f) {
    if (!f || !f.dem || !f.dem.porDia) return null;
    const P = window.BarStockPedido;
    const hoy = P ? P.diaDe(f.ahoraMs || Date.now()) : null;
    if (!hoy) return null;
    const usualHoy = Number(f.dem.porDia[diaSemana(hoy)]) || 0;
    const v = Number(f.hoyVendido) || 0;
    if (f.hoySync && v >= 1 && v > usualHoy * MUCHO) {
      return { tipo: 'hoy', texto: uno(v) + ' sold today by ' + horaNY(f.hoySync) + '. A ' + DL[diaSemana(hoy)] +
        ' usually sells ' + uno(usualHoy) + '.' };
    }
    // Lo que se suele usar desde hoy hasta el día en que se acaba (o la
    // semana, si no se acaba en ella).
    const hasta = f.agota && f.agota >= hoy ? f.agota : sumarDias(hoy, 6);
    let usa = 0, k = 0;
    for (let d = hoy; d <= hasta && k < 14; d = sumarDias(d, 1), k++) usa += Number(f.dem.porDia[diaSemana(d)]) || 0;
    const tramo = hasta === hoy ? 'A ' + DL[diaSemana(hoy)] + ' uses ' + uno(usa) + '.'
      : D3[diaSemana(hoy)] + '–' + D3[diaSemana(hasta)] + ' usually use ' + uno(usa) + '.';
    const t = Number(f.dem.tendencia) || 1;
    if (t >= MUCHO && f.dem.reciente > 0) {
      return { tipo: 'sube', texto: 'Selling ' + uno(t) + '× its usual. ' + tramo };
    }
    const llega = (f.viene || []).filter(x => x && Date.parse(x.cuando) > (f.ahoraMs || 0)).sort((a, b) => Date.parse(a.cuando) - Date.parse(b.cuando));
    const viene = llega.length
      ? uno(llega.reduce((a, x) => a + (Number(x.n) || 0), 0)) + ' arrive ' + D3[new Date(Date.parse(diaNY(llega[0].cuando) + 'T12:00:00Z')).getUTCDay()] + ' ' + horaNY(llega[0].cuando) + '.'
      : 'Nothing on the way.';
    return { tipo: 'normal', texto: tramo + ' ' + viene };
  }

  window.BarStockRunOut = { recorridoDe, porQue, DIAS_BARRAS, medianas, proyectar, cuantoPedir, mediana, fraccionDelDia, ahora, DIAS_HISTORIA, HORIZONTE, MIN_MUESTRAS, FRAC_MIN, MARGEN, MARGEN_PARTE, margenDe };
})();
